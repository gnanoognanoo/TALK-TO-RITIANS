-- ============================================================================
-- TALK TO RITIANS - Matchmaking Atomic Accept/Cancel & Global Navigation Fix
-- Migration: 20261011000003_matchmaking_atomic_accept_cancel_and_auto_navigation.sql
-- ============================================================================
-- Fixes critical matchmaking race condition:
-- 1. Atomic Cancel: leave_matchmaking() cancels active queue entry AND all pending
--    chat requests for requester, preventing orphan invitations. If a match already
--    committed, returns the committed room so user auto-enters instead of ghosting.
-- 2. Atomic Accept: accept_chat_request() locks request row FOR UPDATE and locks
--    requester queue row FOR UPDATE. Strictly verifies requester is still actively
--    searching. If cancelled, rejects with REQUESTER_CANCELLED_SEARCH.
-- 3. Invariant: Deterministic lock order (chat_requests -> matchmaking_queue -> chat_rooms)
--    eliminating deadlocks during concurrent accept vs cancel.
-- 4. Publication & Replica Identity: Ensures chat_requests has FULL replica identity
--    for real-time cancellation delivery to recipient modals.
-- 5. Global Room Detection: RPC get_current_active_room() allows instant recovery
--    and auto-navigation across all application routes.
-- ============================================================================

-- 1. Ensure chat_requests has FULL replica identity for Realtime updates
ALTER TABLE public.chat_requests REPLICA IDENTITY FULL;

-- ============================================================================
-- 2. RPC: leave_matchmaking()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.leave_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_now TIMESTAMPTZ;
  v_existing_room RECORD;
  v_matched_queue RECORD;
  v_peer_id UUID;
  v_peer_persona JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  -- 1. Check if user already has an active, unexpired chat room committed
  SELECT id, user_1, user_2, status, created_at, expires_at
  INTO v_existing_room
  FROM public.chat_rooms
  WHERE status = 'active'
    AND (user_1 = v_user_id OR user_2 = v_user_id)
    AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_room.id IS NOT NULL THEN
    v_peer_id := CASE WHEN v_existing_room.user_1 = v_user_id THEN v_existing_room.user_2 ELSE v_existing_room.user_1 END;
    v_peer_persona := public._get_effective_persona(v_peer_id);

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_existing_room.id,
      'created_at', v_existing_room.created_at,
      'expires_at', v_existing_room.expires_at,
      'peer', v_peer_persona
    );
  END IF;

  -- 2. Deterministic lock order:
  -- Lock pending chat requests involving this user first, then lock matchmaking_queue
  PERFORM 1
  FROM public.chat_requests
  WHERE (requester_id = v_user_id OR recipient_id = v_user_id)
    AND status = 'pending'
  ORDER BY id
  FOR UPDATE;

  -- Check if queue entry was already transitioned to matched in a concurrent commit
  SELECT id, status, matched_room_id, matched_user_id
  INTO v_matched_queue
  FROM public.matchmaking_queue
  WHERE user_id = v_user_id
    AND status = 'matched'
    AND matched_room_id IS NOT NULL
  ORDER BY joined_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_matched_queue.id IS NOT NULL AND v_matched_queue.matched_room_id IS NOT NULL THEN
    SELECT id, user_1, user_2, status, created_at, expires_at
    INTO v_existing_room
    FROM public.chat_rooms
    WHERE id = v_matched_queue.matched_room_id
      AND status = 'active'
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'));

    IF v_existing_room.id IS NOT NULL THEN
      v_peer_id := CASE WHEN v_existing_room.user_1 = v_user_id THEN v_existing_room.user_2 ELSE v_existing_room.user_1 END;
      v_peer_persona := public._get_effective_persona(v_peer_id);

      RETURN jsonb_build_object(
        'success', true,
        'status', 'matched',
        'room_id', v_existing_room.id,
        'created_at', v_existing_room.created_at,
        'expires_at', v_existing_room.expires_at,
        'peer', v_peer_persona
      );
    END IF;
  END IF;

  -- 3. Cancel active searching entries in matchmaking_queue
  UPDATE public.matchmaking_queue
  SET status = 'cancelled',
      heartbeat_at = v_now,
      chat_request_id = NULL
  WHERE user_id = v_user_id
    AND status = 'searching';

  -- 4. Cancel all pending outgoing chat requests initiated by this user
  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE requester_id = v_user_id
    AND status = 'pending';

  -- Also cancel any pending incoming requests to this user
  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE recipient_id = v_user_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'status', 'cancelled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_matchmaking() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_matchmaking() TO authenticated;

-- ============================================================================
-- 3. RPC: accept_chat_request(p_request_id UUID)
-- ============================================================================
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
  v_requester_queue RECORD;
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

  -- 2. Deterministic lock order: lock requester matchmaking_queue row SECOND
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
      'message', 'The student who sent this request has already joined another chat session.'
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
  SET status = 'accepted', room_id = v_room_id
  WHERE id = p_request_id;

  -- 7. Update matchmaking queue entries for both participants
  UPDATE public.matchmaking_queue
  SET
    status = 'matched',
    matched_room_id = v_room_id,
    matched_user_id = v_user_id,
    heartbeat_at = v_now
  WHERE id = v_requester_queue.id;

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

-- ============================================================================
-- 4. UPDATE: join_matchmaking()
-- Ensure Priority 1 match cancels ALL pending requests for BOTH participants
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_matchmaking()
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
  SELECT id, user_1, user_2, status, created_at, expires_at, user_1_heartbeat_at, user_2_heartbeat_at
  INTO v_existing_room
  FROM public.chat_rooms
  WHERE status = 'active' AND (user_1 = v_user_id OR user_2 = v_user_id)
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_existing_room.id IS NOT NULL THEN
    v_room_is_abandoned := (
      COALESCE(v_existing_room.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
      AND COALESCE(v_existing_room.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
    );

    IF (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
       OR (v_existing_room.created_at < v_now - interval '7 minutes')
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
        AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
        AND NOT (COALESCE(r.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
                 AND COALESCE(r.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds'))
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner_queue_id IS NOT NULL THEN
    -- Cancel ALL conflicting pending requests involving either participant
    UPDATE public.chat_requests
    SET status = 'cancelled'
    WHERE status = 'pending'
      AND (
        requester_id IN (v_partner_user_id, v_user_id)
        OR recipient_id IN (v_partner_user_id, v_user_id)
      );

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
    AND p.last_seen_at >= v_now - interval '30 seconds'
    AND p.current_page NOT IN ('chat', 'verify')
    -- No active room
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active'
        AND (r.user_1 = p.user_id OR r.user_2 = p.user_id)
        AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
    )
    -- Not currently in searching queue
    AND NOT EXISTS (
      SELECT 1 FROM public.matchmaking_queue mq
      WHERE mq.user_id = p.user_id AND mq.status = 'searching'
    )
    -- Not already in another pending chat request
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_requests cr
      WHERE cr.status = 'pending'
        AND cr.expires_at > v_now
        AND (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
    )
    -- Not temporarily excluded for caller
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_request_exclusions cre
      WHERE cre.requester_id = v_user_id AND cre.recipient_id = p.user_id AND cre.expires_at > v_now
    )
  ORDER BY RANDOM()
  LIMIT 1;

  IF v_online_recipient_id IS NOT NULL THEN
    -- Cancel any previous pending request of caller
    UPDATE public.chat_requests
    SET status = 'cancelled'
    WHERE requester_id = v_user_id AND status = 'pending';

    -- Create new chat request with 20s TTL
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
      v_now + interval '20 seconds'
    )
    RETURNING id INTO v_new_request_id;

    UPDATE public.matchmaking_queue
    SET chat_request_id = v_new_request_id
    WHERE id = v_my_queue_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'searching',
      'queue_id', v_my_queue_id,
      'has_pending_request', true,
      'message', 'Waiting for a RITian to respond...'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_my_queue_id,
    'has_pending_request', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_matchmaking() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_matchmaking() TO authenticated;

-- ============================================================================
-- 5. UPDATE: heartbeat_matchmaking(p_queue_id UUID)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.heartbeat_matchmaking(
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
  v_partner_persona JSONB;
  v_now TIMESTAMPTZ;
  v_req_status TEXT;
  v_req_expires_at TIMESTAMPTZ;
  v_req_recipient_id UUID;
  v_req_room_id UUID;
  v_online_recipient_id UUID;
  v_new_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  -- Verify queue entry belongs to caller
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

  -- 1. If already matched by another user or request acceptance
  IF v_status = 'matched' AND v_matched_room_id IS NOT NULL THEN
    SELECT created_at, expires_at
    INTO v_created_at, v_expires_at
    FROM public.chat_rooms
    WHERE id = v_matched_room_id;

    v_partner_persona := public._get_effective_persona(v_matched_user_id);

    -- Cancel lingering pending requests involving caller
    UPDATE public.chat_requests
    SET status = 'cancelled'
    WHERE status = 'pending'
      AND (requester_id = v_user_id OR recipient_id = v_user_id);

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'peer', v_partner_persona
    );
  END IF;

  -- 2. Check pending chat request status if one is attached to this queue entry
  IF v_chat_request_id IS NOT NULL THEN
    SELECT status, expires_at, recipient_id, room_id
    INTO v_req_status, v_req_expires_at, v_req_recipient_id, v_req_room_id
    FROM public.chat_requests
    WHERE id = v_chat_request_id;

    IF v_req_status = 'accepted' AND v_req_room_id IS NOT NULL THEN
      -- Accepted! Transition queue entry
      UPDATE public.matchmaking_queue
      SET status = 'matched', matched_room_id = v_req_room_id, matched_user_id = v_req_recipient_id
      WHERE id = p_queue_id;

      SELECT created_at, expires_at INTO v_created_at, v_expires_at
      FROM public.chat_rooms WHERE id = v_req_room_id;

      v_partner_persona := public._get_effective_persona(v_req_recipient_id);

      -- Cancel lingering pending requests
      UPDATE public.chat_requests
      SET status = 'cancelled'
      WHERE status = 'pending'
        AND (requester_id = v_user_id OR recipient_id = v_user_id);

      RETURN jsonb_build_object(
        'success', true,
        'status', 'matched',
        'room_id', v_req_room_id,
        'created_at', v_created_at,
        'expires_at', v_expires_at,
        'peer', v_partner_persona
      );
    ELSIF v_req_status IN ('rejected', 'cancelled') OR (v_req_status = 'pending' AND v_req_expires_at <= v_now) THEN
      IF v_req_status = 'pending' THEN
        UPDATE public.chat_requests SET status = 'expired' WHERE id = v_chat_request_id;
        IF v_req_recipient_id IS NOT NULL THEN
          INSERT INTO public.chat_request_exclusions (requester_id, recipient_id, expires_at)
          VALUES (v_user_id, v_req_recipient_id, v_now + interval '5 minutes')
          ON CONFLICT (requester_id, recipient_id) DO UPDATE SET expires_at = v_now + interval '5 minutes';
        END IF;
      END IF;

      UPDATE public.matchmaking_queue SET chat_request_id = NULL WHERE id = p_queue_id;

      -- Attempt to find another eligible online idle user
      SELECT p.user_id INTO v_online_recipient_id
      FROM public.user_presence p
      WHERE p.user_id <> v_user_id
        AND p.is_online IS TRUE
        AND p.available_for_chat_requests IS TRUE
        AND p.last_seen_at >= v_now - interval '30 seconds'
        AND p.current_page NOT IN ('chat', 'verify')
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_rooms r
          WHERE r.status = 'active'
            AND (r.user_1 = p.user_id OR r.user_2 = p.user_id)
            AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.matchmaking_queue mq
          WHERE mq.user_id = p.user_id AND mq.status = 'searching'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_requests cr
          WHERE cr.status = 'pending'
            AND cr.expires_at > v_now
            AND (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_request_exclusions cre
          WHERE cre.requester_id = v_user_id AND cre.recipient_id = p.user_id AND cre.expires_at > v_now
        )
      ORDER BY RANDOM()
      LIMIT 1;

      IF v_online_recipient_id IS NOT NULL THEN
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
          v_now + interval '20 seconds'
        )
        RETURNING id INTO v_new_request_id;

        UPDATE public.matchmaking_queue
        SET chat_request_id = v_new_request_id
        WHERE id = p_queue_id;

        RETURN jsonb_build_object(
          'success', true,
          'status', 'searching',
          'has_pending_request', true,
          'message', 'Waiting for a RITian to respond...'
        );
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'searching',
        'has_pending_request', false
      );
    ELSE
      -- Still pending and valid
      RETURN jsonb_build_object(
        'success', true,
        'status', 'searching',
        'has_pending_request', true,
        'message', 'Waiting for a RITian to respond...'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'has_pending_request', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_matchmaking(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_matchmaking(UUID) TO authenticated;

-- ============================================================================
-- 6. RPC: get_current_active_room()
-- Server-authoritative global active-room lookup for auto-navigation recovery.
-- Zero student PII exposure.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_current_active_room()
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

  -- Look up currently active unexpired room
  SELECT id, user_1, user_2, status, created_at, expires_at, end_reason,
         timer_paused_at, timer_remaining_seconds, timer_paused_by
  INTO v_room
  FROM public.chat_rooms
  WHERE status = 'active'
    AND (user_1 = v_user_id OR user_2 = v_user_id)
    AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_active_room', false
    );
  END IF;

  -- Identify peer and resolve effective anonymous persona
  v_peer_id := CASE WHEN v_room.user_1 = v_user_id THEN v_room.user_2 ELSE v_room.user_1 END;
  v_peer_persona := public._get_effective_persona(v_peer_id);

  RETURN jsonb_build_object(
    'success', true,
    'has_active_room', true,
    'room_id', v_room.id,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'timer_paused_at', v_room.timer_paused_at,
    'timer_remaining_seconds', v_room.timer_remaining_seconds,
    'peer', v_peer_persona
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_active_room() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_current_active_room() TO authenticated;
