-- ============================================================================
-- Migration: 20260927000002_allow_unverified_matchmaking.sql
-- Description: Allow unverified authenticated students to enter matchmaking
--              and chat anonymously. Removes verification requirement as a
--              matchmaking prerequisite while preserving the 7-minute limit,
--              realtime delivery, atomic pairing, and strict privacy boundaries.
-- ============================================================================

-- 1. Update join_matchmaking() to allow unverified authenticated users
CREATE OR REPLACE FUNCTION public.join_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_has_active_room BOOLEAN;
  v_partner_queue_id UUID;
  v_partner_user_id UUID;
  v_my_queue_id UUID;
  v_new_room_id UUID;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_partner_is_verified BOOLEAN;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Security Check: Authenticated session required
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to join matchmaking.'
    );
  END IF;

  -- 2. Ensure user has an anonymous identity row provisioned
  INSERT INTO public.anonymous_identities (user_id, anonymous_username, avatar_config, updated_at)
  VALUES (
    v_user_id,
    'Unknown User ' || lpad(abs(hashtext(v_user_id::text)) % 9000 + 1000::text, 4, '0'),
    '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb,
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- 3. Active Room Gate: User must not already be in an active chat room
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active'
      AND (user_1 = v_user_id OR user_2 = v_user_id)
  ) INTO v_has_active_room;

  IF v_has_active_room THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_IN_ACTIVE_ROOM',
      'message', 'You are already connected to an active chat room. Please leave that room before searching for a new match.'
    );
  END IF;

  -- 4. Stale Queue Cleanup: Expire entries where heartbeat is older than 25 seconds
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching'
    AND heartbeat_at < now() - interval '25 seconds';

  -- 5. Multiple-Tab Safety: If user has an existing searching queue entry, reuse or reset it
  SELECT id INTO v_my_queue_id
  FROM public.matchmaking_queue
  WHERE user_id = v_user_id AND status = 'searching';

  IF v_my_queue_id IS NOT NULL THEN
    UPDATE public.matchmaking_queue
    SET heartbeat_at = now()
    WHERE id = v_my_queue_id;
  ELSE
    INSERT INTO public.matchmaking_queue (user_id, joined_at, status, heartbeat_at)
    VALUES (v_user_id, now(), 'searching', now())
    RETURNING id INTO v_my_queue_id;
  END IF;

  -- 6. Atomic Server-Side Pairing via FOR UPDATE SKIP LOCKED
  SELECT q.id, q.user_id
  INTO v_partner_queue_id, v_partner_user_id
  FROM public.matchmaking_queue q
  WHERE q.status = 'searching'
    AND q.user_id != v_user_id
    AND q.heartbeat_at >= now() - interval '25 seconds'
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 7. If partner found, atomically transition both to active room with 7-minute limit
  IF v_partner_queue_id IS NOT NULL THEN
    v_now := now();
    v_expires_at := v_now + interval '7 minutes';

    -- Create new chat room with server-authoritative 7-minute expiration
    INSERT INTO public.chat_rooms (user_1, user_2, status, created_at, expires_at)
    VALUES (v_partner_user_id, v_user_id, 'active', v_now, v_expires_at)
    RETURNING id INTO v_new_room_id;

    -- Update partner queue entry to matched
    UPDATE public.matchmaking_queue
    SET status = 'matched',
        matched_room_id = v_new_room_id,
        matched_user_id = v_user_id,
        heartbeat_at = v_now
    WHERE id = v_partner_queue_id;

    -- Update current user queue entry to matched
    UPDATE public.matchmaking_queue
    SET status = 'matched',
        matched_room_id = v_new_room_id,
        matched_user_id = v_partner_user_id,
        heartbeat_at = v_now
    WHERE id = v_my_queue_id;

    -- CRITICAL PRIVACY INVARIANT: Check if partner has verified college identity
    SELECT college_identity_linked INTO v_partner_is_verified
    FROM public.profiles
    WHERE id = v_partner_user_id;

    -- If verified, use custom anonymous persona; otherwise, safe fallback
    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config
      INTO v_partner_username, v_partner_avatar
      FROM public.anonymous_identities
      WHERE user_id = v_partner_user_id;
    ELSE
      v_partner_username := 'Unknown User ' || lpad(abs(hashtext(v_partner_user_id::text)) % 9000 + 1000::text, 4, '0');
      v_partner_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'created_at', v_now,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Unknown User'),
        'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
      )
    );
  END IF;

  -- 8. No partner available yet: User waits in queue
  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_my_queue_id
  );
END;
$$;

-- 2. Update heartbeat_matchmaking() with unverified fallback persona
CREATE OR REPLACE FUNCTION public.heartbeat_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_queue_id UUID;
  v_status TEXT;
  v_matched_room_id UUID;
  v_matched_user_id UUID;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_partner_is_verified BOOLEAN;
  v_created_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Look for active queue entry
  SELECT id, status, matched_room_id, matched_user_id
  INTO v_queue_id, v_status, v_matched_room_id, v_matched_user_id
  FROM public.matchmaking_queue
  WHERE user_id = v_user_id
    AND status IN ('searching', 'matched')
  ORDER BY joined_at DESC
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'idle'
    );
  END IF;

  -- Update heartbeat timestamp
  UPDATE public.matchmaking_queue
  SET heartbeat_at = now()
  WHERE id = v_queue_id;

  -- If matched by another user's transaction, return match result with expiration
  IF v_status = 'matched' AND v_matched_room_id IS NOT NULL THEN
    -- Look up room timestamps
    SELECT created_at, expires_at
    INTO v_created_at, v_expires_at
    FROM public.chat_rooms
    WHERE id = v_matched_room_id;

    -- Check if partner has verified college identity
    SELECT college_identity_linked INTO v_partner_is_verified
    FROM public.profiles
    WHERE id = v_matched_user_id;

    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config
      INTO v_partner_username, v_partner_avatar
      FROM public.anonymous_identities
      WHERE user_id = v_matched_user_id;
    ELSE
      v_partner_username := 'Unknown User ' || lpad(abs(hashtext(v_matched_user_id::text)) % 9000 + 1000::text, 4, '0');
      v_partner_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Unknown User'),
        'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_queue_id
  );
END;
$$;

-- 3. Update get_room_peer() to support unverified fallback persona
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
  v_peer_username TEXT;
  v_peer_avatar JSONB;
  v_peer_is_verified BOOLEAN;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  -- Look up room and verify caller is a participant
  SELECT id, user_1, user_2, status, created_at, expires_at, end_reason
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

  -- If room is active but expires_at has passed, transition to ended with time_limit
  IF v_room.status = 'active' AND v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
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

  -- Check peer verification state
  SELECT college_identity_linked INTO v_peer_is_verified
  FROM public.profiles
  WHERE id = v_peer_id;

  IF v_peer_is_verified IS TRUE THEN
    SELECT anonymous_username, avatar_config
    INTO v_peer_username, v_peer_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_peer_id;
  ELSE
    v_peer_username := 'Unknown User ' || lpad(abs(hashtext(v_peer_id::text)) % 9000 + 1000::text, 4, '0');
    v_peer_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'end_reason', v_room.end_reason,
    'peer', jsonb_build_object(
      'anonymous_username', COALESCE(v_peer_username, 'Unknown User'),
      'avatar_config', COALESCE(v_peer_avatar, '{}'::jsonb)
    )
  );
END;
$$;
