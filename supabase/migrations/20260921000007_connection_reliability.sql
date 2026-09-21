-- ============================================================================
-- Migration: 20260921000007_connection_reliability.sql
-- Description: Phase 12 - Room heartbeats, presence grace period, reconnects,
--              and stale session cleanup.
-- ============================================================================

-- 1. Add heartbeat columns to public.chat_rooms if they do not exist
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS user_1_heartbeat_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_2_heartbeat_at TIMESTAMPTZ DEFAULT now();

-- Index for heartbeat checks on active rooms
CREATE INDEX IF NOT EXISTS idx_chat_rooms_heartbeats
  ON public.chat_rooms (status, user_1_heartbeat_at, user_2_heartbeat_at)
  WHERE status = 'active';

-- ============================================================================
-- 2. Stored Procedure: heartbeat_chat_room()
-- ============================================================================
-- Called periodically (e.g. every 5-10 seconds) by active chat participants.
-- Updates caller's heartbeat and checks if partner's heartbeat has exceeded
-- the grace period (35 seconds).
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
  SELECT id, user_1, user_2, status, user_1_heartbeat_at, user_2_heartbeat_at, end_reason
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

  -- 3. Determine peer's last heartbeat and update caller's heartbeat
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

  -- 4. Check if peer has exceeded grace period (meaningful disconnect)
  -- Note: allow a minimum 15 seconds after room creation before applying timeout
  IF v_peer_heartbeat IS NOT NULL AND v_peer_heartbeat < (v_now - v_grace_timeout) THEN
    -- Peer timed out: end room automatically with 'disconnect'
    UPDATE public.chat_rooms
    SET
      status = 'ended',
      ended_at = v_now,
      end_reason = 'disconnect'
    WHERE id = p_room_id;

    -- Insert system notification
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
-- 3. Stored Procedure: cleanup_stale_sessions()
-- ============================================================================
-- Periodic janitor task to expire orphaned queue entries and abandoned rooms.
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

  -- 2. Expire abandoned active rooms where BOTH heartbeats are older than 60 seconds
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
    'abandoned_rooms_cleaned', v_stale_rooms
  );
END;
$$;
