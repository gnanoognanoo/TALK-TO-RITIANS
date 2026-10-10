-- ============================================================================
-- Migration: 20261010000001_persona_unlink_and_live_moderation_fixes.sql
-- Description:
--   1. Server-authoritative Effective Persona: Developer custom username &
--      gallery avatar are visible to chat partners without requiring college ID.
--   2. Complete Unlink Reset: Unlinking deletes college identity rows, clears
--      all verified profile fields, resets gender lock, resets normal anonymous
--      personas, so subsequent verification is completely fresh. Developer
--      custom persona is preserved.
--   3. Authoritative Presence & Online Status: Online users display as ONLINE
--      based on is_online and fresh 30-second heartbeat.
--   4. Real-Time Room Moderation Chat View: Room moderation session table and
--      scoped RLS policies allowing real-time read-only chat inspection for
--      audited developer sessions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: SERVER-AUTHORITATIVE EFFECTIVE PERSONA HELPER
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._get_effective_persona(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_dev BOOLEAN := false;
  v_is_verified BOOLEAN := false;
  v_username TEXT;
  v_avatar JSONB;
  v_default_avatar JSONB := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'anonymous_username', 'Unknown User 0000',
      'avatar_config', v_default_avatar
    );
  END IF;

  -- 1. Check if user is an active Platform Developer
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = p_user_id AND role = 'developer' AND is_active = true
  ) INTO v_is_dev;

  IF v_is_dev IS TRUE THEN
    -- Active developer: return custom developer username and gallery avatar
    SELECT COALESCE(NULLIF(trim(p.display_username), ''), NULLIF(trim(ai.anonymous_username), ''), 'Heisenberg'),
           COALESCE(p.avatar_config, ai.avatar_config)
    INTO v_username, v_avatar
    FROM public.profiles p
    LEFT JOIN public.anonymous_identities ai ON ai.user_id = p.id
    WHERE p.id = p_user_id;

    IF v_username IS NULL OR v_username ~ '^Unknown User \d+$' THEN
      v_username := 'Heisenberg';
    END IF;

    IF v_avatar IS NULL OR v_avatar = '{}'::jsonb THEN
      v_avatar := v_default_avatar;
    END IF;

    RETURN jsonb_build_object(
      'anonymous_username', v_username,
      'avatar_config', v_avatar
    );
  END IF;

  -- 2. Normal user: check if physical college identity is linked
  SELECT college_identity_linked INTO v_is_verified
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_verified IS TRUE THEN
    SELECT anonymous_username, avatar_config
    INTO v_username, v_avatar
    FROM public.anonymous_identities
    WHERE user_id = p_user_id;

    IF v_username IS NULL OR trim(v_username) = '' THEN
      v_username := 'Unknown User ' || lpad((abs(hashtext(p_user_id::text)) % 9000 + 1000)::text, 4, '0');
    END IF;
    IF v_avatar IS NULL OR v_avatar = '{}'::jsonb THEN
      v_avatar := v_default_avatar;
    END IF;

    RETURN jsonb_build_object(
      'anonymous_username', v_username,
      'avatar_config', v_avatar
    );
  END IF;

  -- 3. Unverified normal user: deterministic Unknown User #### and default avatar
  RETURN jsonb_build_object(
    'anonymous_username', 'Unknown User ' || lpad((abs(hashtext(p_user_id::text)) % 9000 + 1000)::text, 4, '0'),
    'avatar_config', v_default_avatar
  );
END;
$$;

REVOKE ALL ON FUNCTION public._get_effective_persona(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._get_effective_persona(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 2: UPDATE get_room_peer() USING EFFECTIVE PERSONA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_room_peer(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_peer_id UUID;
  v_peer_persona JSONB;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  -- Look up room and verify caller is a participant
  SELECT id, user_1, user_2, status, created_at, expires_at, end_reason,
         timer_paused_at, timer_remaining_seconds, timer_paused_by
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
    AND (user_1 = v_user_id OR user_2 = v_user_id);

  IF v_room IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_A_PARTICIPANT',
      'message', 'You do not have permission to inspect this room.'
    );
  END IF;

  -- If room is active but expires_at has passed and room is NOT paused, transition to ended with time_limit
  IF v_room.status = 'active' AND v_room.timer_paused_at IS NULL AND v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE id = p_room_id AND status = 'active';
    v_room.status := 'ended';
    v_room.end_reason := 'time_limit';
  END IF;

  -- Identify peer
  IF v_room.user_1 = v_user_id THEN
    v_peer_id := v_room.user_2;
  ELSE
    v_peer_id := v_room.user_1;
  END IF;

  -- Server-authoritative effective persona resolution
  v_peer_persona := public._get_effective_persona(v_peer_id);

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'end_reason', v_room.end_reason,
    'timer_paused_at', v_room.timer_paused_at,
    'timer_remaining_seconds', v_room.timer_remaining_seconds,
    'peer', v_peer_persona
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_room_peer(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_peer(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 3: UPDATE MATCHMAKING & CHAT REQUEST RPCS FOR EFFECTIVE PERSONA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_matchmaking_pool(
  p_intent TEXT DEFAULT 'match'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_existing_room RECORD;
  v_partner_queue_id UUID;
  v_partner_user_id UUID;
  v_my_queue_id UUID;
  v_new_room_id UUID;
  v_partner_persona JSONB;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_room_is_abandoned BOOLEAN;
  v_default_avatar JSONB;
  v_online_recipient_id UUID;
  v_new_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED', 'message', 'You must be signed in to join matchmaking.');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

  -- Ensure anonymous identity row exists
  INSERT INTO public.anonymous_identities (user_id, anonymous_username, avatar_config, updated_at)
  VALUES (
    v_user_id,
    'Unknown User ' || lpad((abs(hashtext(v_user_id::text)) % 9000 + 1000)::text, 4, '0'),
    v_default_avatar,
    v_now
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- 1. Check existing active room
  SELECT id, user_1, user_2, status, created_at, expires_at, user_1_heartbeat_at, user_2_heartbeat_at,
         timer_paused_at, timer_remaining_seconds
  INTO v_existing_room
  FROM public.chat_rooms
  WHERE status = 'active' AND (user_1 = v_user_id OR user_2 = v_user_id)
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_existing_room.id IS NOT NULL THEN
    v_room_is_abandoned := (
      COALESCE(v_existing_room.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
      AND COALESCE(v_existing_room.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
    );

    IF (v_existing_room.timer_paused_at IS NULL AND (
          (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
          OR (v_existing_room.created_at < v_now - interval '7 minutes')
        ))
       OR v_room_is_abandoned THEN
      UPDATE public.chat_rooms
      SET status = 'ended', ended_at = v_now,
          end_reason = CASE
            WHEN (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
                 OR (v_existing_room.created_at < v_now - interval '7 minutes') THEN 'time_limit'
            ELSE 'timeout'
          END
      WHERE id = v_existing_room.id;
    ELSE
      v_partner_user_id := CASE WHEN v_existing_room.user_1 = v_user_id THEN v_existing_room.user_2 ELSE v_existing_room.user_1 END;
      v_partner_persona := public._get_effective_persona(v_partner_user_id);

      RETURN jsonb_build_object(
        'success', true,
        'status', 'existing_room',
        'room_id', v_existing_room.id,
        'created_at', v_existing_room.created_at,
        'expires_at', v_existing_room.expires_at,
        'timer_paused', v_existing_room.timer_paused_at IS NOT NULL,
        'timer_paused_at', v_existing_room.timer_paused_at,
        'timer_remaining_seconds', v_existing_room.timer_remaining_seconds,
        'peer', v_partner_persona
      );
    END IF;
  END IF;

  -- 2. Expire stale queue entries
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching' AND heartbeat_at < v_now - interval '25 seconds';

  -- Upsert caller into queue
  SELECT id INTO v_my_queue_id FROM public.matchmaking_queue WHERE user_id = v_user_id AND status = 'searching';
  IF v_my_queue_id IS NOT NULL THEN
    UPDATE public.matchmaking_queue SET heartbeat_at = v_now WHERE id = v_my_queue_id;
  ELSE
    INSERT INTO public.matchmaking_queue (user_id, joined_at, status, heartbeat_at)
    VALUES (v_user_id, v_now, 'searching', v_now)
    RETURNING id INTO v_my_queue_id;
  END IF;

  -- 3. PRIORITY 1: Match another user in queue currently searching
  SELECT q.id, q.user_id INTO v_partner_queue_id, v_partner_user_id
  FROM public.matchmaking_queue q
  WHERE q.status = 'searching'
    AND q.user_id != v_user_id
    AND q.heartbeat_at >= v_now - interval '25 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active' AND (r.user_1 = q.user_id OR r.user_2 = q.user_id)
        AND (r.timer_paused_at IS NOT NULL OR r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
        AND NOT (COALESCE(r.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
                 AND COALESCE(r.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds'))
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner_queue_id IS NOT NULL THEN
    -- Cancel any pending request for caller
    UPDATE public.chat_requests SET status = 'cancelled' WHERE requester_id = v_user_id AND status = 'pending';

    v_expires_at := v_now + interval '7 minutes';
    INSERT INTO public.chat_rooms (user_1, user_2, status, created_at, expires_at, persona_updated_at)
    VALUES (v_partner_user_id, v_user_id, 'active', v_now, v_expires_at, v_now)
    RETURNING id INTO v_new_room_id;

    UPDATE public.matchmaking_queue SET status = 'matched', matched_room_id = v_new_room_id, matched_user_id = v_user_id, heartbeat_at = v_now WHERE id = v_partner_queue_id;
    UPDATE public.matchmaking_queue SET status = 'matched', matched_room_id = v_new_room_id, matched_user_id = v_partner_user_id, heartbeat_at = v_now WHERE id = v_my_queue_id;

    v_partner_persona := public._get_effective_persona(v_partner_user_id);

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'created_at', v_now,
      'expires_at', v_expires_at,
      'peer', v_partner_persona
    );
  END IF;

  -- 4. PRIORITY 2: Look for an eligible ONLINE IDLE user via random chat request
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE requester_id = v_user_id AND status = 'pending' AND expires_at <= v_now;

  SELECT p.user_id INTO v_online_recipient_id
  FROM public.user_presence p
  WHERE p.user_id <> v_user_id
    AND p.is_online IS TRUE
    AND p.available_for_chat_requests IS TRUE
    AND p.last_seen_at >= (v_now - interval '30 seconds')
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active'
        AND (r.user_1 = p.user_id OR r.user_2 = p.user_id)
        AND (r.timer_paused_at IS NOT NULL OR r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_requests cr
      WHERE (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
        AND cr.status = 'pending'
        AND cr.expires_at > v_now
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.matchmaking_queue mq
      WHERE mq.user_id = p.user_id
        AND mq.status = 'searching'
        AND mq.heartbeat_at >= (v_now - interval '25 seconds')
    )
  ORDER BY random()
  LIMIT 1;

  IF v_online_recipient_id IS NOT NULL THEN
    UPDATE public.chat_requests
    SET status = 'cancelled'
    WHERE requester_id = v_user_id AND status = 'pending';

    INSERT INTO public.chat_requests (
      requester_id,
      recipient_id,
      status,
      expires_at
    )
    VALUES (
      v_user_id,
      v_online_recipient_id,
      'pending',
      v_now + interval '30 seconds'
    )
    RETURNING id INTO v_new_request_id;

    UPDATE public.matchmaking_queue
    SET chat_request_id = v_new_request_id
    WHERE id = v_my_queue_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'waiting',
      'queue_id', v_my_queue_id,
      'has_pending_request', true,
      'request_id', v_new_request_id,
      'message', 'Chat request sent to an online student. Waiting for response...'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'waiting',
    'queue_id', v_my_queue_id,
    'has_pending_request', false,
    'message', 'Looking for an available student on campus...'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_matchmaking_pool(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_matchmaking_pool(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 4: UPDATE check_matchmaking_status() FOR EFFECTIVE PERSONA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_matchmaking_status(
  p_queue_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_matched_room_id UUID;
  v_matched_user_id UUID;
  v_chat_request_id UUID;
  v_created_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_timer_paused_at TIMESTAMPTZ;
  v_timer_remaining_seconds INTEGER;
  v_partner_persona JSONB;
  v_req_status TEXT;
  v_req_expires_at TIMESTAMPTZ;
  v_req_recipient_id UUID;
  v_req_room_id UUID;
  v_now TIMESTAMPTZ;
  v_online_recipient_id UUID;
  v_new_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  SELECT status, matched_room_id, matched_user_id, chat_request_id
  INTO v_status, v_matched_room_id, v_matched_user_id, v_chat_request_id
  FROM public.matchmaking_queue
  WHERE id = p_queue_id AND user_id = v_user_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'QUEUE_ENTRY_NOT_FOUND');
  END IF;

  -- Update heartbeat timestamp
  UPDATE public.matchmaking_queue
  SET heartbeat_at = v_now
  WHERE id = p_queue_id;

  -- 1. If already matched
  IF v_status = 'matched' AND v_matched_room_id IS NOT NULL THEN
    SELECT created_at, expires_at, timer_paused_at, timer_remaining_seconds
    INTO v_created_at, v_expires_at, v_timer_paused_at, v_timer_remaining_seconds
    FROM public.chat_rooms
    WHERE id = v_matched_room_id;

    v_partner_persona := public._get_effective_persona(v_matched_user_id);

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'timer_paused', v_timer_paused_at IS NOT NULL,
      'timer_paused_at', v_timer_paused_at,
      'timer_remaining_seconds', v_timer_remaining_seconds,
      'peer', v_partner_persona
    );
  END IF;

  -- 2. Check pending chat request status if attached
  IF v_chat_request_id IS NOT NULL THEN
    SELECT status, expires_at, recipient_id, room_id
    INTO v_req_status, v_req_expires_at, v_req_recipient_id, v_req_room_id
    FROM public.chat_requests
    WHERE id = v_chat_request_id;

    IF v_req_status = 'accepted' AND v_req_room_id IS NOT NULL THEN
      UPDATE public.matchmaking_queue
      SET status = 'matched', matched_room_id = v_req_room_id, matched_user_id = v_req_recipient_id
      WHERE id = p_queue_id;

      SELECT created_at, expires_at, timer_paused_at, timer_remaining_seconds
      INTO v_created_at, v_expires_at, v_timer_paused_at, v_timer_remaining_seconds
      FROM public.chat_rooms WHERE id = v_req_room_id;

      v_partner_persona := public._get_effective_persona(v_req_recipient_id);

      RETURN jsonb_build_object(
        'success', true,
        'status', 'matched',
        'room_id', v_req_room_id,
        'created_at', v_created_at,
        'expires_at', v_expires_at,
        'timer_paused', v_timer_paused_at IS NOT NULL,
        'timer_paused_at', v_timer_paused_at,
        'timer_remaining_seconds', v_timer_remaining_seconds,
        'peer', v_partner_persona
      );
    ELSIF v_req_status IN ('rejected', 'cancelled') OR (v_req_status = 'pending' AND v_req_expires_at <= v_now) THEN
      IF v_req_status = 'pending' THEN
        UPDATE public.chat_requests SET status = 'expired' WHERE id = v_chat_request_id;
      END IF;

      UPDATE public.matchmaking_queue
      SET chat_request_id = NULL
      WHERE id = p_queue_id;
      v_chat_request_id := NULL;
    END IF;
  END IF;

  -- 3. If still searching and no request attached, try opportunistic request dispatch
  IF v_status = 'searching' AND v_chat_request_id IS NULL THEN
    SELECT p.user_id INTO v_online_recipient_id
    FROM public.user_presence p
    WHERE p.user_id <> v_user_id
      AND p.is_online IS TRUE
      AND p.available_for_chat_requests IS TRUE
      AND p.last_seen_at >= (v_now - interval '30 seconds')
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_rooms r
        WHERE r.status = 'active'
          AND (r.user_1 = p.user_id OR r.user_2 = p.user_id)
          AND (r.timer_paused_at IS NOT NULL OR r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_requests cr
        WHERE (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
          AND cr.status = 'pending'
          AND cr.expires_at > v_now
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.matchmaking_queue mq
        WHERE mq.user_id = p.user_id
          AND mq.status = 'searching'
          AND mq.heartbeat_at >= (v_now - interval '25 seconds')
      )
    ORDER BY random()
    LIMIT 1;

    IF v_online_recipient_id IS NOT NULL THEN
      INSERT INTO public.chat_requests (requester_id, recipient_id, status, expires_at)
      VALUES (v_user_id, v_online_recipient_id, 'pending', v_now + interval '30 seconds')
      RETURNING id INTO v_new_request_id;

      UPDATE public.matchmaking_queue
      SET chat_request_id = v_new_request_id
      WHERE id = p_queue_id;

      v_chat_request_id := v_new_request_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'has_pending_request', (v_chat_request_id IS NOT NULL),
    'message', CASE
      WHEN v_chat_request_id IS NOT NULL THEN 'Waiting for response from online student...'
      ELSE 'Searching for a match...'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_matchmaking_status(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_matchmaking_status(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 5: UPDATE get_pending_chat_request() & accept_chat_request()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pending_chat_request()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
  v_requester_persona JSONB;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  -- Expire past-due pending requests for this recipient
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE recipient_id = v_user_id AND status = 'pending' AND expires_at <= v_now;

  SELECT id, requester_id, recipient_id, status, created_at, expires_at
  INTO v_request
  FROM public.chat_requests
  WHERE recipient_id = v_user_id AND status = 'pending' AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'has_request', false);
  END IF;

  -- Server-authoritative requester persona
  v_requester_persona := public._get_effective_persona(v_request.requester_id);

  RETURN jsonb_build_object(
    'success', true,
    'has_request', true,
    'request_id', v_request.id,
    'created_at', v_request.created_at,
    'expires_at', v_request.expires_at,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_request.expires_at - v_now))::integer),
    'requester', v_requester_persona
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_chat_request() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_chat_request() TO authenticated;

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
  v_req RECORD;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_room_id UUID;
  v_requester_persona JSONB;
  v_has_conflict BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  -- Lock request row
  SELECT id, requester_id, recipient_id, status, expires_at
  INTO v_req
  FROM public.chat_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Chat request not found.');
  END IF;

  IF v_req.recipient_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'You can only respond to requests sent to you.');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_PENDING', 'message', 'This chat request is no longer pending.');
  END IF;

  IF v_req.expires_at <= v_now THEN
    UPDATE public.chat_requests SET status = 'expired' WHERE id = p_request_id;
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_EXPIRED', 'message', 'This chat request has expired.');
  END IF;

  -- Conflict check for requester
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

  -- Conflict check for recipient
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

  -- Create active chat room
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

  -- Update accepted request
  UPDATE public.chat_requests
  SET status = 'accepted', room_id = v_room_id
  WHERE id = p_request_id;

  -- Update matchmaking queue entries if applicable
  UPDATE public.matchmaking_queue
  SET
    status = 'matched',
    matched_room_id = v_room_id,
    matched_user_id = v_user_id,
    heartbeat_at = v_now
  WHERE user_id = v_req.requester_id AND status = 'searching';

  -- Cancel other conflicting requests
  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE id <> p_request_id
    AND status = 'pending'
    AND (
      requester_id IN (v_req.requester_id, v_user_id)
      OR recipient_id IN (v_req.requester_id, v_user_id)
    );

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
-- PART 6: UPDATE set_developer_persona() TO SIGNAL ACTIVE ROOMS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_developer_persona(
  p_username TEXT,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_trimmed TEXT;
  v_avatar_config JSONB;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Only developer/admin accounts can set a custom developer persona.'
    );
  END IF;

  v_user_id := auth.uid();

  v_trimmed := trim(p_username);
  IF v_trimmed IS NULL OR length(v_trimmed) < 3 OR length(v_trimmed) > 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_LENGTH',
      'message', 'Developer username must be between 3 and 20 characters.'
    );
  END IF;

  -- Safe text handling: reject HTML (<, >), control characters
  IF v_trimmed ~ '[\x00-\x1F\x7F<>]' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CHARACTERS',
      'message', 'Username contains invalid or forbidden characters.'
    );
  END IF;

  -- Determine avatar config
  IF p_avatar_url IS NOT NULL AND length(trim(p_avatar_url)) > 0 THEN
    v_avatar_config := jsonb_build_object('type', 'gallery', 'url', trim(p_avatar_url));
  ELSE
    SELECT avatar_config INTO v_avatar_config FROM public.profiles WHERE id = v_user_id;
    IF v_avatar_config IS NULL THEN
      v_avatar_config := '{"type":"default","theme":"indigo"}'::jsonb;
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    display_username = v_trimmed,
    avatar_config = v_avatar_config,
    updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.anonymous_identities (user_id, anonymous_username, avatar_config, updated_at)
  VALUES (v_user_id, v_trimmed, v_avatar_config, now())
  ON CONFLICT (user_id) DO UPDATE
  SET anonymous_username = EXCLUDED.anonymous_username,
      avatar_config = EXCLUDED.avatar_config,
      updated_at = now();

  -- Realtime signal: Notify any active room partner immediately
  UPDATE public.chat_rooms
  SET persona_updated_at = now()
  WHERE status = 'active'
    AND (user_1 = v_user_id OR user_2 = v_user_id);

  PERFORM public.log_admin_action(
    'SET_DEVELOPER_PERSONA',
    v_user_id,
    NULL,
    'Updated developer anonymous persona',
    jsonb_build_object('username', v_trimmed, 'has_avatar', (p_avatar_url IS NOT NULL))
  );

  RETURN jsonb_build_object(
    'success', true,
    'username', v_trimmed,
    'avatar_config', v_avatar_config
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_developer_persona(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_developer_persona(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 7: FIX 2 — UNLINK RIT ID COMPLETE VERIFICATION RESET
-- ----------------------------------------------------------------------------

-- Update trigger function protect_immutable_profile_fields to allow trusted unlink
CREATE OR REPLACE FUNCTION public.protect_immutable_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- If executed from a trusted internal verification procedure, allow writing verified fields
  IF current_setting('app.in_trusted_verification', true) = 'true' THEN
    NEW.ever_verified_identity := true;
    IF NEW.first_verified_at IS NULL THEN
      NEW.first_verified_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- If executed from trusted unlink procedure, allow resetting verified fields
  IF current_setting('app.in_trusted_unlink', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- 1. Enforce immutability of verified student identity fields
  IF (OLD.college_identity_linked IS TRUE OR OLD.verified_at IS NOT NULL) THEN
    IF NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Department cannot be manually modified after verification.';
    END IF;
    IF NEW.batch IS DISTINCT FROM OLD.batch THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Batch cannot be manually modified after verification.';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Name cannot be manually modified after verification.';
    END IF;
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Name cannot be manually modified after verification.';
    END IF;
  END IF;

  -- 2. Enforce Gender Freeze: Gender cannot be modified once set or confirmed
  IF (OLD.gender_locked_at IS NOT NULL OR (OLD.gender IS NOT NULL AND trim(OLD.gender) != '')) THEN
    IF NEW.gender IS DISTINCT FROM OLD.gender THEN
      RAISE EXCEPTION 'GENDER_ALREADY_LOCKED: Gender cannot be modified once confirmed.';
    END IF;
  END IF;

  -- 3. If gender is being assigned for the first time, record timestamp
  IF (OLD.gender IS NULL OR trim(OLD.gender) = '') AND (NEW.gender IS NOT NULL AND trim(NEW.gender) != '') THEN
    NEW.gender_locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Trusted atomic Unlink RPC: deletes identity link row and resets verified data
CREATE OR REPLACE FUNCTION public.unlink_college_identity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_dev BOOLEAN := false;
  v_now TIMESTAMPTZ := now();
  v_default_avatar JSONB := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
  v_unknown_handle TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to unlink a college identity.'
    );
  END IF;

  -- Allow trusted internal unlink bypass of profile immutability triggers
  PERFORM set_config('app.in_trusted_unlink', 'true', true);

  -- Lock profile row for atomic update
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  -- Check if account is platform developer
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = v_user_id AND role = 'developer' AND is_active = true
  ) INTO v_is_dev;

  -- 1. DELETE student's college identity link record completely
  -- This frees the physical card so it can be verified again later without stale claim
  DELETE FROM public.college_identities
  WHERE user_id = v_user_id;

  -- 2. Clear verified profile fields
  IF v_is_dev IS TRUE THEN
    -- Developer exception: preserve developer custom username, developer gallery avatar, and staff role
    UPDATE public.profiles
    SET
      college_identity_linked = false,
      verified_at = NULL,
      verification_method = NULL,
      name = NULL,
      full_name = NULL,
      department = NULL,
      batch = NULL,
      section = NULL,
      class_name = NULL,
      graduation_year = NULL,
      gender = NULL,
      gender_locked_at = NULL,
      ever_verified_identity = false,
      first_verified_at = NULL,
      updated_at = v_now
    WHERE id = v_user_id;
  ELSE
    -- Normal student: Complete fresh reset including gender lock and anonymous persona
    v_unknown_handle := 'Unknown User ' || lpad((abs(hashtext(v_user_id::text)) % 9000 + 1000)::text, 4, '0');

    UPDATE public.profiles
    SET
      college_identity_linked = false,
      verified_at = NULL,
      verification_method = NULL,
      name = NULL,
      full_name = NULL,
      department = NULL,
      batch = NULL,
      section = NULL,
      class_name = NULL,
      graduation_year = NULL,
      gender = NULL,
      gender_locked_at = NULL,
      ever_verified_identity = false,
      first_verified_at = NULL,
      display_username = v_unknown_handle,
      avatar_config = v_default_avatar,
      profile_completed = false,
      updated_at = v_now
    WHERE id = v_user_id;

    -- Delete normal student anonymous persona record so reverification starts completely fresh
    DELETE FROM public.anonymous_identities
    WHERE user_id = v_user_id;
  END IF;

  -- 3. Signal active chat rooms that persona changed
  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_college_identity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unlink_college_identity() TO authenticated;

-- Update verify_and_link_college_identity to support fresh relinking after unlink
CREATE OR REPLACE FUNCTION public.verify_and_link_college_identity(
  p_student_ref TEXT,
  p_name TEXT,
  p_department TEXT,
  p_batch TEXT,
  p_qr_metadata JSONB DEFAULT '{}'::jsonb,
  p_cooldown_hours INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_identity_hash TEXT;
  v_existing_id UUID;
  v_existing_user UUID;
  v_new_identity_id UUID;
  v_now TIMESTAMPTZ;
  v_method TEXT;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
BEGIN
  PERFORM set_config('app.in_trusted_verification', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to link a college identity.'
    );
  END IF;

  IF NOT public.check_rate_limit('college_verification_attempt', 60, 10) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many verification attempts. Please wait a moment before trying again.'
    );
  END IF;

  IF p_student_ref IS NULL
     OR length(trim(p_student_ref)) < 3
     OR lower(trim(p_student_ref)) IN ('student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_IDENTITY_DATA',
      'message', 'The scanned QR code does not contain sufficient unique identifier data to verify account uniqueness.'
    );
  END IF;

  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');
  v_now := now();
  v_method := 'physical_id';

  -- Check active identity ownership
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  -- Re-scan already linked to caller
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET
      college_identity_linked = true,
      ever_verified_identity = true,
      first_verified_at = COALESCE(first_verified_at, v_now),
      verification_method = v_method,
      verified_at = v_now,
      name = p_name,
      full_name = p_name,
      department = p_department,
      batch = p_batch,
      updated_at = v_now
    WHERE id = v_user_id;

    UPDATE public.chat_rooms
    SET persona_updated_at = v_now
    WHERE (user_1 = v_user_id OR user_2 = v_user_id)
      AND status = 'active';

    RETURN jsonb_build_object(
      'success', true,
      'already_linked_to_self', true,
      'message', 'This college identity is already linked to your account.',
      'college_identity_id', v_existing_id,
      'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
      'verification_method', v_method,
      'verified_at', v_now
    );
  END IF;

  -- Duplicate claimed by another user
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- Clean up any prior active college identity for this user
  DELETE FROM public.college_identities
  WHERE user_id = v_user_id;

  BEGIN
    INSERT INTO public.college_identities (
      user_id,
      identity_hash,
      verification_method,
      name_from_qr,
      department_from_qr,
      batch_from_qr,
      qr_metadata,
      active
    )
    VALUES (
      v_user_id,
      v_identity_hash,
      v_method,
      p_name,
      p_department,
      p_batch,
      p_qr_metadata,
      true
    )
    RETURNING id INTO v_new_identity_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CARD_ALREADY_LINKED',
        'message', 'This college identity is already linked to another account.'
      );
  END;

  UPDATE public.profiles
  SET
    college_identity_linked = true,
    ever_verified_identity = true,
    first_verified_at = COALESCE(first_verified_at, v_now),
    verification_method = v_method,
    verified_at = v_now,
    name = p_name,
    full_name = p_name,
    department = p_department,
    batch = p_batch,
    updated_at = v_now
  WHERE id = v_user_id;

  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verification_method', v_method,
    'verified_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 8: FIX 3 — AUTHORITATIVE ONLINE STATUS IN DEVELOPER CONSOLE
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

-- ----------------------------------------------------------------------------
-- PART 9: FIX 4 — REAL-TIME ROOM MODERATION CHAT VIEW & SESSION SECURITY
-- ----------------------------------------------------------------------------

-- Table for temporary server-authorized moderation sessions
CREATE TABLE IF NOT EXISTS public.room_moderation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '20 minutes'),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_mod_sessions_active
ON public.room_moderation_sessions (developer_user_id, room_id, expires_at);

ALTER TABLE public.room_moderation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_mod_sessions_select_staff ON public.room_moderation_sessions;
CREATE POLICY room_mod_sessions_select_staff ON public.room_moderation_sessions
  FOR SELECT TO authenticated
  USING (developer_user_id = auth.uid() AND public.is_platform_staff());

REVOKE INSERT, UPDATE, DELETE ON public.room_moderation_sessions FROM public, anon, authenticated;
GRANT SELECT ON public.room_moderation_sessions TO authenticated;

-- Audited RPC to open/authorize a moderation session and fetch initial transcript
CREATE OR REPLACE FUNCTION public.get_room_moderation_transcript(
  p_room_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_room RECORD;
  v_messages JSONB;
  v_p1_persona JSONB;
  v_p2_persona JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Developer role required to access moderation transcripts.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'A mandatory operational/moderation reason (at least 5 characters) must be supplied.'
    );
  END IF;

  SELECT id, user_1, user_2, status, created_at, expires_at
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- 1. Create or renew temporary authorized moderation session (TTL 20 mins)
  DELETE FROM public.room_moderation_sessions
  WHERE developer_user_id = v_caller_id AND room_id = p_room_id;

  INSERT INTO public.room_moderation_sessions (
    developer_user_id,
    room_id,
    opened_at,
    expires_at,
    reason
  )
  VALUES (
    v_caller_id,
    p_room_id,
    now(),
    now() + interval '20 minutes',
    trim(p_reason)
  );

  -- 2. Audit log entry
  PERFORM public.log_admin_action(
    'OPEN_MODERATION_TRANSCRIPT',
    NULL,
    p_room_id,
    trim(p_reason),
    jsonb_build_object('room_id', p_room_id)
  );

  -- 3. Resolve participant personas
  v_p1_persona := public._get_effective_persona(v_room.user_1);
  v_p2_persona := public._get_effective_persona(v_room.user_2);

  -- 4. Fetch existing messages chronologically
  SELECT jsonb_agg(msg_data) INTO v_messages
  FROM (
    SELECT
      m.id,
      m.room_id,
      m.sender_id,
      CASE
        WHEN m.sender_id = v_room.user_1 THEN (v_p1_persona->>'anonymous_username')
        WHEN m.sender_id = v_room.user_2 THEN (v_p2_persona->>'anonymous_username')
        ELSE (public._get_effective_persona(m.sender_id)->>'anonymous_username')
      END AS sender_username,
      m.content,
      m.message_type,
      m.created_at
    FROM public.chat_messages m
    WHERE m.room_id = p_room_id
    ORDER BY m.created_at ASC
  ) msg_data;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'participant_a', jsonb_build_object(
      'id', v_room.user_1,
      'username', (v_p1_persona->>'anonymous_username')
    ),
    'participant_b', jsonb_build_object(
      'id', v_room.user_2,
      'username', (v_p2_persona->>'anonymous_username')
    ),
    'messages', COALESCE(v_messages, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_room_moderation_transcript(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_moderation_transcript(UUID, TEXT) TO authenticated;

-- RPC to explicitly close an active moderation session
CREATE OR REPLACE FUNCTION public.close_room_moderation_session(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  DELETE FROM public.room_moderation_sessions
  WHERE developer_user_id = v_caller_id AND room_id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.close_room_moderation_session(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_room_moderation_session(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 10: RLS ON chat_messages FOR AUTHORIZED LIVE MODERATION
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS chat_messages_select_participants ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_select_authorized ON public.chat_messages;

CREATE POLICY chat_messages_select_authorized ON public.chat_messages
FOR SELECT TO authenticated
USING (
  -- 1. Standard chat participants in Room
  EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE r.id = chat_messages.room_id
      AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
  )
  OR
  -- 2. Platform Developer with active authorized moderation session for this room
  (
    public.is_platform_staff()
    AND EXISTS (
      SELECT 1 FROM public.room_moderation_sessions rms
      WHERE rms.developer_user_id = auth.uid()
        AND rms.room_id = chat_messages.room_id
        AND rms.expires_at > now()
    )
  )
);
