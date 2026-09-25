-- ============================================================================
-- Migration: 20260921000009_seven_minute_chat_limit.sql
-- Description: Server-authoritative 7-minute chat session limit, automatic room
--              expiration (time_limit), boundary message rejection (ROOM_EXPIRED),
--              and expiration synchronization across refreshes/reconnects.
-- ============================================================================

-- ============================================================================
-- 1. Schema Updates on public.chat_rooms
-- ============================================================================

-- 1.1 Add expires_at column if not exists
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 1.2 Backfill any existing active rooms
UPDATE public.chat_rooms
SET expires_at = created_at + interval '7 minutes'
WHERE expires_at IS NULL;

-- 1.3 Set default for future chat rooms
ALTER TABLE public.chat_rooms
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 minutes');

-- 1.4 Update check constraint on end_reason to permit 'time_limit'
DO $$
DECLARE
  v_con TEXT;
BEGIN
  FOR v_con IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.chat_rooms'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%end_reason%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS ' || quote_ident(v_con);
  END LOOP;
END $$;

ALTER TABLE public.chat_rooms
  ADD CONSTRAINT chat_rooms_end_reason_check
  CHECK (end_reason IN ('leave', 'skip', 'timeout', 'disconnect', 'time_limit'));

-- 1.5 Index on active rooms and expiration for fast time checks
CREATE INDEX IF NOT EXISTS idx_chat_rooms_active_expires_at
  ON public.chat_rooms (status, expires_at)
  WHERE status = 'active';

-- ============================================================================
-- 2. Update join_matchmaking() to establish authoritative 7-minute limit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_verified BOOLEAN;
  v_is_profile_completed BOOLEAN;
  v_has_active_room BOOLEAN;
  v_partner_queue_id UUID;
  v_partner_user_id UUID;
  v_my_queue_id UUID;
  v_new_room_id UUID;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to join matchmaking.'
    );
  END IF;

  -- 2. Eligibility Gate: Verified College ID & Completed Profile
  SELECT college_identity_linked, profile_completed
  INTO v_is_verified, v_is_profile_completed
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before entering campus matchmaking.'
    );
  END IF;

  IF v_is_profile_completed IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROFILE_INCOMPLETE',
      'message', 'You must complete your campus profile setup before joining matchmaking.'
    );
  END IF;

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
    AND q.user_id <> v_user_id
    AND q.heartbeat_at >= now() - interval '25 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active' AND (r.user_1 = q.user_id OR r.user_2 = q.user_id)
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE OF q SKIP LOCKED;

  -- 7. Match Resolution: Establish server-authoritative 7-minute expiration
  IF v_partner_queue_id IS NOT NULL THEN
    v_now := now();
    v_expires_at := v_now + interval '7 minutes';

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

    -- CRITICAL PRIVACY INVARIANT: Query ONLY anonymous_identities partition
    SELECT anonymous_username, avatar_config
    INTO v_partner_username, v_partner_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_partner_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'created_at', v_now,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Anonymous Student'),
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

-- ============================================================================
-- 3. Update heartbeat_matchmaking() to return authoritative room expiration
-- ============================================================================
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

    -- CRITICAL PRIVACY INVARIANT: Query ONLY anonymous_identities partition
    SELECT anonymous_username, avatar_config
    INTO v_partner_username, v_partner_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_matched_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Anonymous Student'),
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

-- ============================================================================
-- 4. Update send_chat_message() with Server-Side Expiration Enforcement
-- ============================================================================
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
  SELECT id, user_1, user_2, status, created_at, expires_at, end_reason
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

  -- 3. Server-Authoritative 7-Minute Limit Check
  IF v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
    -- Transition room to ended if still active (idempotent, preserves skip/leave/disconnect)
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
      'message', 'Message exceeds maximum allowed length of 1000 characters.'
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

-- ============================================================================
-- 5. Update RLS policy for chat_messages INSERT to block post-expiry writes
-- ============================================================================
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
        AND (r.expires_at IS NULL OR now() < r.expires_at)
        AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
    )
  );

-- ============================================================================
-- 6. Update get_room_peer() to return authoritative room expiration
-- ============================================================================
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

  -- CRITICAL PRIVACY INVARIANT: Query ONLY anonymous_identities partition
  SELECT anonymous_username, avatar_config
  INTO v_peer_username, v_peer_avatar
  FROM public.anonymous_identities
  WHERE user_id = v_peer_id;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'end_reason', v_room.end_reason,
    'peer', jsonb_build_object(
      'anonymous_username', COALESCE(v_peer_username, 'Anonymous RITian'),
      'avatar_config', COALESCE(v_peer_avatar, '{}'::jsonb)
    )
  );
END;
$$;

-- ============================================================================
-- 7. Update heartbeat_chat_room() to check 7-minute expiration
-- ============================================================================
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
  SELECT id, user_1, user_2, status, created_at, expires_at, user_1_heartbeat_at, user_2_heartbeat_at, end_reason
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room IS NULL THEN
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

  -- 3. Check 7-minute expiration first
  IF v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
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

  -- 5. Check if peer has exceeded presence grace period
  IF v_peer_heartbeat IS NOT NULL AND v_peer_heartbeat < (v_now - v_grace_timeout) THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'disconnect'
    WHERE id = p_room_id AND status = 'active';

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
      'Stranger disconnected.',
      v_now,
      'system'
    );

    RETURN jsonb_build_object(
      'success', true,
      'room_id', p_room_id,
      'status', 'ended',
      'end_reason', 'disconnect',
      'is_active', false,
      'peer_disconnected', true
    );
  END IF;

  -- Room remains healthy and active
  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'status', 'active',
    'is_active', true,
    'peer_disconnected', false
  );
END;
$$;

-- ============================================================================
-- 8. Update cleanup_stale_sessions() to clean overdue 7-minute rooms
-- ============================================================================
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

  -- 2. Expire active rooms where 7-minute time limit has elapsed
  WITH time_limit_rooms AS (
    UPDATE public.chat_rooms
    SET
      status = 'ended',
      ended_at = v_now,
      end_reason = 'time_limit'
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= v_now
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
      AND user_1_heartbeat_at < (v_now - interval '60 seconds')
      AND user_2_heartbeat_at < (v_now - interval '60 seconds')
    RETURNING id
  )
  SELECT count(*) INTO v_stale_rooms FROM abandoned_rooms;

  RETURN jsonb_build_object(
    'success', true,
    'expired_queue_entries', v_expired_queues,
    'time_limit_rooms_cleaned', v_timed_out_rooms,
    'abandoned_rooms_cleaned', v_stale_rooms
  );
END;
$$;
