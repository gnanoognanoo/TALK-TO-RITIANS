-- ============================================================================
-- Migration: 20261011000004_developer_invite_flow_and_presence_validation.sql
-- ============================================================================
-- FIX: DEVELOPER CONSOLE INVITATION FLOW + RECIPIENT ACCEPTANCE + PRESENCE VALIDATION
--
-- 1. Updates send_admin_chat_invite():
--    - Authoritative developer authentication check.
--    - Rejects offline users (last_seen_at older than 45s or is_online false) with TARGET_OFFLINE.
--    - Rejects users not available for requests (available_for_chat_requests = false, current_page in ('chat', 'verify')) with USER_UNAVAILABLE.
--    - Rejects if caller or target are in active rooms with ALREADY_IN_ROOM.
--    - Rejects if target already has an unexpired pending invitation with REQUEST_ALREADY_PENDING.
--    - Creates valid chat_requests row with server-authoritative 30s TTL.
--
-- 2. Updates accept_chat_request():
--    - Detects if requester is a Platform Developer (platform_staff role = 'developer').
--    - If requester IS a Developer: bypasses matchmaking_queue search requirement,
--      allowing developer invitations to be accepted from Developer Console.
--    - If requester is NOT a Developer: strictly enforces matchmaking_queue 'searching'
--      status and fresh heartbeat (preserving random matchmaking race-condition protections).
--    - Atomically creates 7-minute chat room, updates request status to 'accepted',
--      cancels conflicting pending requests, and returns requester effective persona (Heisenberg).
--
-- 3. Updates get_online_users_admin():
--    - Adds available_for_chat_requests boolean to user_data payload so Developer UI
--      can accurately disable Invite button when student has opted out.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC: send_admin_chat_invite(p_user_id UUID)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_admin_chat_invite(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_now TIMESTAMPTZ := now();
  v_new_req_id UUID;
  v_target_presence RECORD;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Confirms authenticated Developer
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVELOPER_REQUIRED',
      'message', 'Developer authorization required.'
    );
  END IF;

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVELOPER_REQUIRED',
      'message', 'Developer authorization required.'
    );
  END IF;

  -- 2. Validates recipient
  IF p_user_id IS NULL OR p_user_id = v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CANNOT_INVITE_SELF',
      'message', 'Cannot send a chat invitation to yourself.'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_NOT_FOUND',
      'message', 'Target user does not exist.'
    );
  END IF;

  -- 3. Confirms recipient is online and available
  SELECT is_online, available_for_chat_requests, last_seen_at, current_page
  INTO v_target_presence
  FROM public.user_presence
  WHERE user_id = p_user_id;

  IF v_target_presence.last_seen_at IS NULL
     OR v_target_presence.is_online IS NOT TRUE
     OR v_target_presence.last_seen_at < (v_now - interval '45 seconds') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TARGET_OFFLINE',
      'message', 'This user is currently offline.'
    );
  END IF;

  IF v_target_presence.available_for_chat_requests IS NOT TRUE
     OR v_target_presence.current_page IN ('chat', 'verify') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_UNAVAILABLE',
      'message', 'This user is currently unavailable.'
    );
  END IF;

  -- 4. Confirms neither account is in an active room
  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = v_caller_id OR user_2 = v_caller_id)
      AND status = 'active'
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_IN_ROOM',
      'message', 'You are already in an active chat room.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = p_user_id OR user_2 = p_user_id)
      AND status = 'active'
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_IN_ROOM',
      'message', 'Target user is currently in an active chat room.'
    );
  END IF;

  -- 5. Prevents conflicting pending requests
  IF EXISTS (
    SELECT 1 FROM public.chat_requests
    WHERE recipient_id = p_user_id
      AND requester_id <> v_caller_id
      AND status = 'pending'
      AND expires_at > v_now
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUEST_ALREADY_PENDING',
      'message', 'Target user already has a pending chat invitation.'
    );
  END IF;

  -- Cancel any previous pending requests between caller and target
  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE requester_id = v_caller_id
    AND status = 'pending';

  -- 6. Creates a valid pending invitation with 30s expiry
  v_expires_at := v_now + interval '30 seconds';

  INSERT INTO public.chat_requests (
    requester_id,
    recipient_id,
    status,
    expires_at
  )
  VALUES (
    v_caller_id,
    p_user_id,
    'pending',
    v_expires_at
  )
  RETURNING id INTO v_new_req_id;

  -- Audit log
  PERFORM public.log_admin_action(
    'SEND_ADMIN_CHAT_INVITE',
    p_user_id,
    NULL,
    'Sent developer chat invite to online user',
    jsonb_build_object('request_id', v_new_req_id, 'expires_at', v_expires_at)
  );

  -- 9. Returns request ID and expiry
  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_new_req_id,
    'recipient_id', p_user_id,
    'expires_at', v_expires_at,
    'remaining_seconds', 30
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_admin_chat_invite(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.send_admin_chat_invite(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC: accept_chat_request(p_request_id UUID)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_chat_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_now TIMESTAMPTZ;
  v_req RECORD;
  v_is_developer_requester BOOLEAN := false;
  v_requester_queue RECORD;
  v_has_conflict BOOLEAN;
  v_room_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_requester_persona JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'Authentication required.'
    );
  END IF;

  v_now := now();

  -- 1. Deterministic lock order: lock chat_requests row FIRST
  SELECT id, requester_id, recipient_id, status, expires_at
  INTO v_req
  FROM public.chat_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUESTER_CANCELLED_SEARCH',
      'message', 'This chat invitation is no longer available.'
    );
  END IF;

  IF v_req.recipient_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'You can only respond to requests sent to you.'
    );
  END IF;

  IF v_req.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUESTER_CANCELLED_SEARCH',
      'message', 'This chat invitation is no longer available.'
    );
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_PENDING',
      'message', 'This chat invitation is no longer available.'
    );
  END IF;

  IF v_req.expires_at <= v_now THEN
    UPDATE public.chat_requests SET status = 'expired' WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUEST_EXPIRED',
      'message', 'This chat invitation has expired.'
    );
  END IF;

  -- 2. Check if requester is a Platform Developer
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = v_req.requester_id AND role = 'developer' AND is_active = true
  ) INTO v_is_developer_requester;

  IF v_is_developer_requester IS TRUE THEN
    -- Developer invitation: Developer is browsing Developer Console and NOT searching in queue.
    -- Optional lock if requester has a queue entry, but do NOT abort if null.
    SELECT id, user_id, status, joined_at, heartbeat_at, chat_request_id
    INTO v_requester_queue
    FROM public.matchmaking_queue
    WHERE user_id = v_req.requester_id
      AND status = 'searching'
    ORDER BY joined_at DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    -- Normal student random match: Requester MUST be actively searching in queue.
    SELECT id, user_id, status, joined_at, heartbeat_at, chat_request_id
    INTO v_requester_queue
    FROM public.matchmaking_queue
    WHERE user_id = v_req.requester_id
      AND status = 'searching'
    ORDER BY joined_at DESC
    LIMIT 1
    FOR UPDATE;

    -- If requester cancelled search or queue row is no longer searching:
    IF v_requester_queue.id IS NULL OR v_requester_queue.status <> 'searching' THEN
      UPDATE public.chat_requests SET status = 'cancelled' WHERE id = p_request_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'REQUESTER_CANCELLED_SEARCH',
        'message', 'This chat invitation is no longer available.'
      );
    END IF;

    -- Heartbeat freshness: if requester abandoned queue (> 30s heartbeat timeout)
    IF v_requester_queue.heartbeat_at < (v_now - interval '30 seconds') THEN
      UPDATE public.matchmaking_queue SET status = 'expired' WHERE id = v_requester_queue.id;
      UPDATE public.chat_requests SET status = 'expired' WHERE id = p_request_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'REQUESTER_CANCELLED_SEARCH',
        'message', 'This chat invitation is no longer available.'
      );
    END IF;
  END IF;

  -- 3. Conflict check for requester: already in active room?
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active'
      AND (user_1 = v_req.requester_id OR user_2 = v_req.requester_id)
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ) INTO v_has_conflict;

  IF v_has_conflict THEN
    UPDATE public.chat_requests SET status = 'cancelled' WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUESTER_UNAVAILABLE',
      'message', 'The user who sent this request has already joined another chat session.'
    );
  END IF;

  -- 4. Conflict check for recipient: already in active room?
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active'
      AND (user_1 = v_user_id OR user_2 = v_user_id)
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ) INTO v_has_conflict;

  IF v_has_conflict THEN
    UPDATE public.chat_requests SET status = 'cancelled' WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RECIPIENT_ALREADY_IN_ROOM',
      'message', 'You already have an active chat session.'
    );
  END IF;

  -- 5. Create active chat room with server-authoritative 7-minute expiration
  v_expires_at := v_now + interval '7 minutes';
  INSERT INTO public.chat_rooms (
    user_1,
    user_2,
    status,
    created_at,
    expires_at,
    persona_updated_at
  )
  VALUES (
    v_req.requester_id,
    v_user_id,
    'active',
    v_now,
    v_expires_at,
    v_now
  )
  RETURNING id INTO v_room_id;

  -- 6. Update accepted request
  UPDATE public.chat_requests
  SET status = 'accepted', room_id = v_room_id, responded_at = v_now
  WHERE id = p_request_id;

  -- 7. Update matchmaking queue entries for participants (if searching)
  IF v_requester_queue.id IS NOT NULL THEN
    UPDATE public.matchmaking_queue
    SET
      status = 'matched',
      matched_room_id = v_room_id,
      matched_user_id = v_user_id,
      heartbeat_at = v_now
    WHERE id = v_requester_queue.id;
  END IF;

  UPDATE public.matchmaking_queue
  SET
    status = 'matched',
    matched_room_id = v_room_id,
    matched_user_id = v_req.requester_id,
    heartbeat_at = v_now
  WHERE user_id = v_user_id AND status = 'searching';

  -- 8. Cancel other conflicting pending requests involving either participant
  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE id <> p_request_id
    AND status = 'pending'
    AND (
      requester_id IN (v_req.requester_id, v_user_id)
      OR recipient_id IN (v_req.requester_id, v_user_id)
    );

  -- 9. Resolve server-authoritative effective persona of requester
  v_requester_persona := public._get_effective_persona(v_req.requester_id);

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'created_at', v_now,
    'expires_at', v_expires_at,
    'peer', v_requester_persona
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_chat_request(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_chat_request(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC: get_online_users_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_users_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_users JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT jsonb_agg(user_data) INTO v_users
  FROM (
    SELECT
      up.user_id,
      (public._get_effective_persona(up.user_id)->>'anonymous_username') AS anonymous_username,
      (public._get_effective_persona(up.user_id)->'avatar_config') AS avatar_config,
      COALESCE(p.college_identity_linked, false) AS is_verified_student,
      (ps.role IS NOT NULL) AS is_staff,
      ps.role AS staff_role,
      (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) AS is_online,
      COALESCE(up.available_for_chat_requests, true) AS available_for_chat_requests,
      up.last_seen_at,
      up.current_page,
      CASE
        WHEN r.id IS NOT NULL THEN 'in_chat'
        WHEN mq.id IS NOT NULL AND mq.heartbeat_at >= (v_now - interval '25 seconds') THEN 'searching'
        WHEN cr.id IS NOT NULL AND cr.expires_at > v_now THEN 'pending_request'
        WHEN (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) THEN 'idle'
        ELSE 'offline'
      END AS state,
      r.id AS current_room_id,
      (
        ps.role IS NOT NULL
        OR ta.user_id IS NOT NULL
      ) AS is_test_account
    FROM public.user_presence up
    JOIN auth.users u ON u.id = up.user_id
    LEFT JOIN public.profiles p ON p.id = up.user_id
    LEFT JOIN public.platform_staff ps ON ps.user_id = up.user_id AND ps.is_active = true
    LEFT JOIN public.test_accounts ta ON ta.user_id = up.user_id AND ta.is_active = true
    LEFT JOIN public.chat_rooms r ON (r.user_1 = up.user_id OR r.user_2 = up.user_id) AND r.status = 'active' AND (r.expires_at IS NULL OR r.expires_at > v_now)
    LEFT JOIN public.matchmaking_queue mq ON mq.user_id = up.user_id AND mq.status = 'searching'
    LEFT JOIN public.chat_requests cr ON (cr.recipient_id = up.user_id OR cr.requester_id = up.user_id) AND cr.status = 'pending' AND cr.expires_at > v_now
    WHERE up.last_seen_at >= (v_now - interval '300 seconds') OR up.is_online = true
    ORDER BY (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) DESC, up.last_seen_at DESC
    LIMIT 100
  ) user_data;

  RETURN jsonb_build_object(
    'success', true,
    'users', COALESCE(v_users, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_online_users_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_online_users_admin() TO authenticated;
