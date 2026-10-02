-- ============================================================================
-- Migration: 20261002000007_developer_timer_freeze.sql
-- Description: Server-Authoritative Chat Timer Freeze & Resume for Developer:
--   1. Extend public.chat_rooms with timer freeze tracking columns:
--      - timer_paused_at TIMESTAMPTZ NULL
--      - timer_remaining_seconds INTEGER NULL
--      - timer_paused_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
--      - total_paused_seconds INTEGER NOT NULL DEFAULT 0
--   2. Implement freeze_chat_timer(p_room_id UUID) RPC
--   3. Implement resume_chat_timer(p_room_id UUID) RPC
--   4. Update send_chat_message() to allow messages while room is frozen
--   5. Update chat_messages_insert_sender RLS policy for frozen rooms
--   6. Update get_room_peer(), heartbeat_chat_room(), cleanup_stale_sessions(),
--      join_matchmaking(), and heartbeat_matchmaking() to respect timer_paused_at
--   7. Update get_active_rooms_admin() and get_room_admin_details()
--   8. Update end_chat_room() to clear paused state on termination (Leave/Skip)
--   9. Hardened Permissions Matrix (RPC execute grants + chat_rooms table privileges)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend public.chat_rooms Table
-- ----------------------------------------------------------------------------
ALTER TABLE public.chat_rooms
ADD COLUMN IF NOT EXISTS timer_paused_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS timer_remaining_seconds INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS timer_paused_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_paused_seconds INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 2. freeze_chat_timer(p_room_id UUID)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_chat_timer(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_room RECORD;
  v_now TIMESTAMPTZ := now();
  v_remaining_seconds INT;
BEGIN
  -- 1. Require authenticated session
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 2. Require active Developer role
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVELOPER_REQUIRED',
      'message', 'Only active platform developers can freeze chat timers.'
    );
  END IF;

  -- 3 & 4. Lock room FOR UPDATE and verify existence
  SELECT * INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- 5. Developer must be one of the two active room participants
  IF v_room.user_1 <> v_caller_id AND v_room.user_2 <> v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_ROOM_PARTICIPANT',
      'message', 'Developer must be an active participant in this room to freeze its timer.'
    );
  END IF;

  -- 6. Verify room status = active
  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_NOT_ACTIVE',
      'message', 'Cannot freeze timer on an inactive conversation.'
    );
  END IF;

  -- 7. Verify room has not already expired before freeze
  IF v_room.timer_paused_at IS NULL AND v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_EXPIRED',
      'message', 'Room timer has already expired.'
    );
  END IF;

  -- 8. Verify timer isn't already paused (double freeze protection)
  IF v_room.timer_paused_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TIMER_ALREADY_PAUSED',
      'message', 'Timer is already paused.',
      'remaining_seconds', v_room.timer_remaining_seconds,
      'paused_at', v_room.timer_paused_at
    );
  END IF;

  -- 9. Calculate server-authoritative remaining time
  v_remaining_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_room.expires_at - v_now))))::INT;

  -- 10. Update room fields with frozen state
  UPDATE public.chat_rooms
  SET
    timer_paused_at = v_now,
    timer_remaining_seconds = v_remaining_seconds,
    timer_paused_by = v_caller_id
  WHERE id = p_room_id;

  -- 11. Record server audit action: FREEZE_CHAT_TIMER
  PERFORM public.log_admin_action(
    'FREEZE_CHAT_TIMER',
    CASE WHEN v_room.user_1 = v_caller_id THEN v_room.user_2 ELSE v_room.user_1 END,
    p_room_id,
    'Developer froze chat timer',
    jsonb_build_object(
      'room_id', p_room_id,
      'remaining_seconds', v_remaining_seconds,
      'paused_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'status', 'active',
    'timer_paused', true,
    'remaining_seconds', v_remaining_seconds,
    'paused_at', v_now,
    'paused_by', v_caller_id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. resume_chat_timer(p_room_id UUID)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resume_chat_timer(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_room RECORD;
  v_now TIMESTAMPTZ := now();
  v_remaining_seconds INT;
  v_new_expires_at TIMESTAMPTZ;
  v_paused_duration INT := 0;
BEGIN
  -- 1. Require authenticated session
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 2. Require active Developer role
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVELOPER_REQUIRED',
      'message', 'Only active platform developers can resume chat timers.'
    );
  END IF;

  -- 3 & 4. Lock room FOR UPDATE and verify existence
  SELECT * INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- 5. Developer must be one of the two active room participants
  IF v_room.user_1 <> v_caller_id AND v_room.user_2 <> v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_ROOM_PARTICIPANT',
      'message', 'Developer must be an active participant in this room to resume its timer.'
    );
  END IF;

  -- 6. Verify room status = active
  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_NOT_ACTIVE',
      'message', 'Cannot resume timer on an inactive conversation.'
    );
  END IF;

  -- 7. Verify timer is currently paused (double resume protection)
  IF v_room.timer_paused_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TIMER_NOT_PAUSED',
      'message', 'Timer is not currently paused.'
    );
  END IF;

  -- 8. Retrieve stored remaining seconds and calculate new expires_at
  v_remaining_seconds := COALESCE(v_room.timer_remaining_seconds, 0);
  v_new_expires_at := v_now + (v_remaining_seconds || ' seconds')::interval;

  -- 9. Calculate duration room spent in paused state
  v_paused_duration := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_room.timer_paused_at))))::INT;

  -- 10. Update room fields: new expires_at, clear paused markers, accumulate total_paused_seconds
  UPDATE public.chat_rooms
  SET
    expires_at = v_new_expires_at,
    timer_paused_at = NULL,
    timer_remaining_seconds = NULL,
    timer_paused_by = NULL,
    total_paused_seconds = COALESCE(v_room.total_paused_seconds, 0) + v_paused_duration
  WHERE id = p_room_id;

  -- 11. Record server audit action: RESUME_CHAT_TIMER
  PERFORM public.log_admin_action(
    'RESUME_CHAT_TIMER',
    CASE WHEN v_room.user_1 = v_caller_id THEN v_room.user_2 ELSE v_room.user_1 END,
    p_room_id,
    'Developer resumed chat timer',
    jsonb_build_object(
      'room_id', p_room_id,
      'remaining_seconds', v_remaining_seconds,
      'paused_duration_seconds', v_paused_duration,
      'new_expires_at', v_new_expires_at
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'status', 'active',
    'timer_paused', false,
    'remaining_seconds', v_remaining_seconds,
    'expires_at', v_new_expires_at,
    'paused_duration_seconds', v_paused_duration
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Update send_chat_message() to Allow Messaging During Timer Freeze
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_room_id UUID,
  p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_trimmed TEXT;
  v_msg_id UUID;
  v_now TIMESTAMPTZ;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to send messages.'
    );
  END IF;

  -- 2. Validate Room Membership & Active Status
  SELECT id, user_1, user_2, status, created_at, expires_at, end_reason, timer_paused_at
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
    AND (user_1 = v_user_id OR user_2 = v_user_id);

  IF v_room IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_ROOM_ACCESS',
      'message', 'You are not a participant in this conversation.'
    );
  END IF;

  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_INACTIVE',
      'message', 'This conversation has ended and is closed to new messages.'
    );
  END IF;

  v_now := now();

  -- 3. Server-Authoritative Expiration Check
  -- CRITICAL: Paused rooms (timer_paused_at IS NOT NULL) MUST NOT expire and must permit messages!
  IF v_room.timer_paused_at IS NULL AND v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE id = p_room_id AND status = 'active';

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_EXPIRED',
      'message', 'This 7-minute conversation has expired.'
    );
  END IF;

  -- 4. Content Validation & Sanitization
  v_trimmed := trim(p_content);
  IF v_trimmed IS NULL OR length(v_trimmed) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EMPTY_MESSAGE',
      'message', 'Message cannot be empty.'
    );
  END IF;

  IF length(v_trimmed) > 1000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MESSAGE_TOO_LONG',
      'message', 'Message exceeds 1000 characters limit.'
    );
  END IF;

  -- 5. Insert Message
  INSERT INTO public.chat_messages (
    room_id,
    sender_id,
    content,
    created_at,
    message_type
  )
  VALUES (
    p_room_id,
    v_user_id,
    v_trimmed,
    v_now,
    'text'
  )
  RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', jsonb_build_object(
      'id', v_msg_id,
      'room_id', p_room_id,
      'sender_id', v_user_id,
      'content', v_trimmed,
      'created_at', v_now,
      'message_type', 'text'
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Update RLS Policy: chat_messages_insert_sender
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS chat_messages_insert_sender ON public.chat_messages;
CREATE POLICY chat_messages_insert_sender ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND length(trim(content)) > 0
    AND length(content) <= 1000
    AND EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.id = chat_messages.room_id
        AND r.status = 'active'
        AND (r.timer_paused_at IS NOT NULL OR r.expires_at IS NULL OR now() < r.expires_at)
        AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Update get_room_peer() to Respect Frozen Rooms and Return Freeze Fields
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
  v_peer_is_verified BOOLEAN;
  v_peer_username TEXT;
  v_peer_avatar JSONB;
  v_default_avatar JSONB;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

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

  -- Check peer verification state
  SELECT college_identity_linked INTO v_peer_is_verified
  FROM public.profiles
  WHERE id = v_peer_id;

  IF v_peer_is_verified IS TRUE THEN
    SELECT anonymous_username, avatar_config
    INTO v_peer_username, v_peer_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_peer_id;

    IF v_peer_username IS NULL OR trim(v_peer_username) = '' THEN
      v_peer_username := 'Unknown User ' || lpad((abs(hashtext(v_peer_id::text)) % 9000 + 1000)::text, 4, '0');
    END IF;
    IF v_peer_avatar IS NULL OR v_peer_avatar = '{}'::jsonb THEN
      v_peer_avatar := v_default_avatar;
    END IF;
  ELSE
    v_peer_username := 'Unknown User ' || lpad((abs(hashtext(v_peer_id::text)) % 9000 + 1000)::text, 4, '0');
    v_peer_avatar := v_default_avatar;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'end_reason', v_room.end_reason,
    'timer_paused_at', v_room.timer_paused_at,
    'timer_remaining_seconds', v_room.timer_remaining_seconds,
    'peer', jsonb_build_object(
      'anonymous_username', v_peer_username,
      'avatar_config', v_peer_avatar
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Update heartbeat_chat_room() to Respect Frozen Rooms
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.heartbeat_chat_room(
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
  v_peer_heartbeat TIMESTAMPTZ;
  v_grace_timeout INTERVAL := interval '35 seconds';
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 2. Lock and retrieve room
  SELECT id, user_1, user_2, status, created_at, expires_at, user_1_heartbeat_at, user_2_heartbeat_at, end_reason,
         timer_paused_at, timer_remaining_seconds
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- Participant validation
  IF v_room.user_1 <> v_user_id AND v_room.user_2 <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- If room already ended, return ended state
  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', true,
      'room_id', p_room_id,
      'status', v_room.status,
      'end_reason', v_room.end_reason,
      'is_active', false,
      'peer_disconnected', true
    );
  END IF;

  -- 3. Check expiration ONLY if room is NOT paused
  IF v_room.timer_paused_at IS NULL AND v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE id = p_room_id AND status = 'active';

    RETURN jsonb_build_object(
      'success', true,
      'room_id', p_room_id,
      'status', 'ended',
      'end_reason', 'time_limit',
      'is_active', false,
      'peer_disconnected', false,
      'time_expired', true
    );
  END IF;

  -- 4. Determine peer's last heartbeat and update caller's heartbeat
  IF v_room.user_1 = v_user_id THEN
    v_peer_heartbeat := v_room.user_2_heartbeat_at;
    UPDATE public.chat_rooms
    SET user_1_heartbeat_at = v_now
    WHERE id = p_room_id;
  ELSE
    v_peer_heartbeat := v_room.user_1_heartbeat_at;
    UPDATE public.chat_rooms
    SET user_2_heartbeat_at = v_now
    WHERE id = p_room_id;
  END IF;

  -- 5. Check peer timeout
  IF v_peer_heartbeat IS NOT NULL AND (v_now - v_peer_heartbeat) > v_grace_timeout THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'disconnect'
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'success', true,
      'room_id', p_room_id,
      'status', 'ended',
      'end_reason', 'disconnect',
      'is_active', false,
      'peer_disconnected', true
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'status', 'active',
    'is_active', true,
    'peer_disconnected', false,
    'timer_paused', v_room.timer_paused_at IS NOT NULL,
    'timer_paused_at', v_room.timer_paused_at,
    'timer_remaining_seconds', v_room.timer_remaining_seconds
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Update cleanup_stale_sessions() to Respect Frozen Rooms
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_expired_queues INT;
  v_stale_rooms INT;
  v_timed_out_rooms INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Expire searching matchmaking queue entries where heartbeat is older than 25 seconds
  WITH expired_rows AS (
    UPDATE public.matchmaking_queue
    SET status = 'expired'
    WHERE status = 'searching'
      AND heartbeat_at < (v_now - interval '25 seconds')
    RETURNING id
  )
  SELECT count(*) INTO v_expired_queues FROM expired_rows;

  -- 2. Expire active rooms where 7-minute time limit has elapsed (ONLY IF NOT PAUSED!)
  WITH time_limit_rooms AS (
    UPDATE public.chat_rooms
    SET
      status = 'ended',
      ended_at = v_now,
      end_reason = 'time_limit'
    WHERE status = 'active'
      AND timer_paused_at IS NULL
      AND (
        (expires_at IS NOT NULL AND expires_at <= v_now)
        OR (expires_at IS NULL AND created_at < v_now - interval '7 minutes')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_timed_out_rooms FROM time_limit_rooms;

  -- 3. Expire abandoned active rooms where BOTH heartbeats are older than 60 seconds
  WITH abandoned_rooms AS (
    UPDATE public.chat_rooms
    SET
      status = 'ended',
      ended_at = v_now,
      end_reason = 'timeout'
    WHERE status = 'active'
      AND COALESCE(user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
      AND COALESCE(user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
    RETURNING id
  )
  SELECT count(*) INTO v_stale_rooms FROM abandoned_rooms;

  RETURN jsonb_build_object(
    'success', true,
    'expired_queue_entries', v_expired_queues,
    'stale_rooms_cleaned', v_stale_rooms,
    'time_limit_rooms_cleaned', v_timed_out_rooms,
    'timestamp', v_now
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Update join_matchmaking() to Respect Frozen Rooms
-- ----------------------------------------------------------------------------
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
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_partner_is_verified BOOLEAN;
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
      SELECT college_identity_linked INTO v_partner_is_verified FROM public.profiles WHERE id = v_partner_user_id;

      IF v_partner_is_verified IS TRUE THEN
        SELECT anonymous_username, avatar_config INTO v_partner_username, v_partner_avatar FROM public.anonymous_identities WHERE user_id = v_partner_user_id;
        IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
          v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
        END IF;
        IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
          v_partner_avatar := v_default_avatar;
        END IF;
      ELSE
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
        v_partner_avatar := v_default_avatar;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'existing_room',
        'room_id', v_existing_room.id,
        'created_at', v_existing_room.created_at,
        'expires_at', v_existing_room.expires_at,
        'timer_paused', v_existing_room.timer_paused_at IS NOT NULL,
        'timer_paused_at', v_existing_room.timer_paused_at,
        'timer_remaining_seconds', v_existing_room.timer_remaining_seconds,
        'peer', jsonb_build_object(
          'anonymous_username', v_partner_username,
          'avatar_config', v_partner_avatar
        )
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

    SELECT college_identity_linked INTO v_partner_is_verified FROM public.profiles WHERE id = v_partner_user_id;
    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config INTO v_partner_username, v_partner_avatar FROM public.anonymous_identities WHERE user_id = v_partner_user_id;
      IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
      END IF;
      IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
        v_partner_avatar := v_default_avatar;
      END IF;
    ELSE
      v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
      v_partner_avatar := v_default_avatar;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'created_at', v_now,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', v_partner_username,
        'avatar_config', v_partner_avatar
      )
    );
  END IF;

  -- 4. PRIORITY 2: Look for an eligible ONLINE IDLE user via random chat request
  -- Expire past pending requests for caller
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
        AND (r.timer_paused_at IS NOT NULL OR r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
    )
    -- Not currently in searching queue
    AND NOT EXISTS (
      SELECT 1 FROM public.matchmaking_queue mq
      WHERE mq.user_id = p.user_id AND mq.status = 'searching'
    )
    -- Not already in another pending chat request
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_requests cr
      WHERE cr.status = 'pending' AND cr.expires_at > v_now
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

-- ----------------------------------------------------------------------------
-- 10. Update heartbeat_matchmaking() to Respect Frozen Rooms
-- ----------------------------------------------------------------------------
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
  v_timer_paused_at TIMESTAMPTZ;
  v_timer_remaining_seconds INT;
  v_partner_is_verified BOOLEAN;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_default_avatar JSONB;
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
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

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
    SELECT created_at, expires_at, timer_paused_at, timer_remaining_seconds
    INTO v_created_at, v_expires_at, v_timer_paused_at, v_timer_remaining_seconds
    FROM public.chat_rooms
    WHERE id = v_matched_room_id;

    SELECT college_identity_linked INTO v_partner_is_verified
    FROM public.profiles
    WHERE id = v_matched_user_id;

    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config
      INTO v_partner_username, v_partner_avatar
      FROM public.anonymous_identities
      WHERE user_id = v_matched_user_id;

      IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_matched_user_id::text)) % 9000 + 1000)::text, 4, '0');
      END IF;
      IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
        v_partner_avatar := v_default_avatar;
      END IF;
    ELSE
      v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_matched_user_id::text)) % 9000 + 1000)::text, 4, '0');
      v_partner_avatar := v_default_avatar;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'timer_paused', v_timer_paused_at IS NOT NULL,
      'timer_paused_at', v_timer_paused_at,
      'timer_remaining_seconds', v_timer_remaining_seconds,
      'peer', jsonb_build_object(
        'anonymous_username', v_partner_username,
        'avatar_config', v_partner_avatar
      )
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

      SELECT created_at, expires_at, timer_paused_at, timer_remaining_seconds
      INTO v_created_at, v_expires_at, v_timer_paused_at, v_timer_remaining_seconds
      FROM public.chat_rooms WHERE id = v_req_room_id;

      SELECT college_identity_linked INTO v_partner_is_verified
      FROM public.profiles WHERE id = v_req_recipient_id;

      IF v_partner_is_verified IS TRUE THEN
        SELECT anonymous_username, avatar_config INTO v_partner_username, v_partner_avatar
        FROM public.anonymous_identities WHERE user_id = v_req_recipient_id;

        IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
          v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_req_recipient_id::text)) % 9000 + 1000)::text, 4, '0');
        END IF;
        IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
          v_partner_avatar := v_default_avatar;
        END IF;
      ELSE
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_req_recipient_id::text)) % 9000 + 1000)::text, 4, '0');
        v_partner_avatar := v_default_avatar;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'matched',
        'room_id', v_req_room_id,
        'created_at', v_created_at,
        'expires_at', v_expires_at,
        'timer_paused', v_timer_paused_at IS NOT NULL,
        'timer_paused_at', v_timer_paused_at,
        'timer_remaining_seconds', v_timer_remaining_seconds,
        'peer', jsonb_build_object(
          'anonymous_username', v_partner_username,
          'avatar_config', v_partner_avatar
        )
      );
    ELSIF v_req_status IN ('rejected', 'cancelled') OR (v_req_status = 'pending' AND v_req_expires_at <= v_now) THEN
      -- Rejected or timed out: mark expired if still pending and detach from queue entry
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
            AND (r.timer_paused_at IS NOT NULL OR r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.matchmaking_queue mq
          WHERE mq.user_id = p.user_id AND mq.status = 'searching'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_requests cr
          WHERE cr.status = 'pending' AND cr.expires_at > v_now
            AND (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_request_exclusions cre
          WHERE cre.requester_id = v_user_id AND cre.recipient_id = p.user_id AND cre.expires_at > v_now
        )
      ORDER BY RANDOM()
      LIMIT 1;

      IF v_online_recipient_id IS NOT NULL THEN
        INSERT INTO public.chat_requests (requester_id, recipient_id, status, expires_at)
        VALUES (v_user_id, v_online_recipient_id, 'pending', v_now + interval '20 seconds')
        RETURNING id INTO v_new_request_id;

        UPDATE public.matchmaking_queue SET chat_request_id = v_new_request_id WHERE id = p_queue_id;

        RETURN jsonb_build_object(
          'success', true,
          'status', 'searching',
          'has_pending_request', true,
          'message', 'Looking for another RITian...'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'has_pending_request', (v_chat_request_id IS NOT NULL)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Update get_active_rooms_admin() & get_room_admin_details()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_rooms_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rooms JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT jsonb_agg(room_data) INTO v_rooms
  FROM (
    SELECT
      r.id AS room_id,
      r.status,
      r.created_at,
      r.expires_at,
      r.timer_paused_at,
      r.timer_remaining_seconds,
      r.timer_paused_by,
      CASE
        WHEN r.timer_paused_at IS NOT NULL THEN COALESCE(r.timer_remaining_seconds, 0)
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (r.expires_at - v_now))::int)
      END AS remaining_seconds,
      r.user_1 AS participant_a_id,
      COALESCE(ai1.anonymous_username, p1.display_username, 'Unknown User A') AS participant_a_username,
      COALESCE(ai1.avatar_config, p1.avatar_config, '{"theme":"indigo"}'::jsonb) AS participant_a_avatar,
      r.user_2 AS participant_b_id,
      COALESCE(ai2.anonymous_username, p2.display_username, 'Unknown User B') AS participant_b_username,
      COALESCE(ai2.avatar_config, p2.avatar_config, '{"theme":"indigo"}'::jsonb) AS participant_b_avatar,
      (SELECT count(*) FROM public.chat_messages m WHERE m.room_id = r.id) AS message_count
    FROM public.chat_rooms r
    LEFT JOIN public.profiles p1 ON p1.id = r.user_1
    LEFT JOIN public.anonymous_identities ai1 ON ai1.user_id = r.user_1
    LEFT JOIN public.profiles p2 ON p2.id = r.user_2
    LEFT JOIN public.anonymous_identities ai2 ON ai2.user_id = r.user_2
    WHERE r.status = 'active'
      AND (r.timer_paused_at IS NOT NULL OR r.expires_at IS NULL OR r.expires_at > v_now)
    ORDER BY r.created_at DESC
  ) room_data;

  RETURN jsonb_build_object(
    'success', true,
    'rooms', COALESCE(v_rooms, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_room_admin_details(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_room RECORD;
  v_now TIMESTAMPTZ := now();
  v_msg_count INT;
  v_remaining INT;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT * INTO v_room FROM public.chat_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  SELECT count(*) INTO v_msg_count FROM public.chat_messages WHERE room_id = p_room_id;

  IF v_room.timer_paused_at IS NOT NULL THEN
    v_remaining := COALESCE(v_room.timer_remaining_seconds, 0);
  ELSIF v_room.expires_at IS NOT NULL THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_room.expires_at - v_now))::int);
  ELSE
    v_remaining := 0;
  END IF;

  PERFORM public.log_admin_action(
    'OPEN_ROOM_METADATA',
    NULL,
    p_room_id,
    'Inspected room metadata',
    jsonb_build_object('room_id', p_room_id, 'status', v_room.status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room.id,
    'status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'ended_at', v_room.ended_at,
    'end_reason', v_room.end_reason,
    'timer_paused_at', v_room.timer_paused_at,
    'timer_remaining_seconds', v_room.timer_remaining_seconds,
    'timer_paused_by', v_room.timer_paused_by,
    'remaining_seconds', v_remaining,
    'user_1', v_room.user_1,
    'user_2', v_room.user_2,
    'user_1_heartbeat_at', v_room.user_1_heartbeat_at,
    'user_2_heartbeat_at', v_room.user_2_heartbeat_at,
    'message_count', v_msg_count
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. Update end_chat_room() to Clear Paused State on Termination (Leave / Skip)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_chat_room(
  p_room_id UUID,
  p_reason TEXT DEFAULT 'leave'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_reason TEXT;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_reason := lower(trim(coalesce(p_reason, 'leave')));
  IF v_reason NOT IN ('skip', 'leave', 'disconnect', 'time_limit') THEN
    v_reason := 'leave';
  END IF;

  -- Rate Limit Check on Skip Spam: Max 1 skip per 2 seconds
  IF v_reason = 'skip' THEN
    IF NOT public.check_rate_limit('skip_room', 2, 1) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RATE_LIMITED',
        'message', 'Please wait a moment before skipping again.'
      );
    END IF;
  END IF;

  SELECT id, user_1, user_2, status, end_reason
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  IF v_room.user_1 <> v_user_id AND v_room.user_2 <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  IF v_room.status = 'ended' THEN
    RETURN jsonb_build_object(
      'success', true,
      'room_id', p_room_id,
      'status', 'ended',
      'end_reason', v_room.end_reason,
      'already_ended', true
    );
  END IF;

  v_now := now();

  UPDATE public.chat_rooms
  SET
    status = 'ended',
    ended_at = v_now,
    end_reason = v_reason,
    timer_paused_at = NULL,
    timer_remaining_seconds = NULL,
    timer_paused_by = NULL
  WHERE id = p_room_id;

  INSERT INTO public.chat_messages (
    room_id,
    sender_id,
    content,
    created_at,
    message_type
  )
  VALUES (
    p_room_id,
    v_user_id,
    CASE WHEN v_reason = 'time_limit' THEN '7-minute chat session ended.' ELSE 'Stranger disconnected.' END,
    v_now,
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'status', 'ended',
    'end_reason', v_reason,
    'already_ended', false
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 13. Hardened Permissions Matrix
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.freeze_chat_timer(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.freeze_chat_timer(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.resume_chat_timer(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resume_chat_timer(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.send_chat_message(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_room_peer(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_peer(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.heartbeat_chat_room(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_chat_room(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.cleanup_stale_sessions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_sessions() TO authenticated;

REVOKE ALL ON FUNCTION public.join_matchmaking() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_matchmaking() TO authenticated;

REVOKE ALL ON FUNCTION public.heartbeat_matchmaking(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_matchmaking(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_active_rooms_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_active_rooms_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.get_room_admin_details(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_admin_details(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.end_chat_room(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.end_chat_room(UUID, TEXT) TO authenticated;

-- Protect chat_rooms table from direct client writes
REVOKE INSERT, UPDATE, DELETE ON public.chat_rooms FROM anon, authenticated;
GRANT SELECT ON public.chat_rooms TO authenticated;
