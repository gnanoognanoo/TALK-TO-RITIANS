-- ============================================================================
-- Migration: 20260921000006_skip_and_leave.sql
-- Description: Phase 11 - Robust server-side room termination (Skip & Leave),
--              concurrency safety for simultaneous skips, and automated
--              stranger disconnection notification.
-- ============================================================================

-- ============================================================================
-- 1. Refined end_chat_room() Stored Procedure
-- ============================================================================
-- Rules:
-- 1. Only room participants (user_1 or user_2) can end their room.
-- 2. Sets status = 'ended', ended_at = now(), end_reason IN ('skip', 'leave', 'disconnect').
-- 3. Concurrency / Double Action Safety: If both users press Skip simultaneously,
--    the first locks and terminates the room; the second detects it is already ended
--    and safely succeeds without crashing or creating duplicate rooms.
-- 4. Inserts automated system notification: "Stranger disconnected."
-- ============================================================================

CREATE OR REPLACE FUNCTION public.end_chat_room(
  p_room_id UUID,
  p_reason TEXT
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
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to perform this action.'
    );
  END IF;

  -- 2. Validate Reason
  v_reason := lower(trim(coalesce(p_reason, 'leave')));
  IF v_reason NOT IN ('skip', 'leave', 'disconnect') THEN
    v_reason := 'leave';
  END IF;

  -- 3. Atomic Lock & Participant Verification
  SELECT id, user_1, user_2, status, end_reason
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  -- Room existence check
  IF v_room IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_NOT_FOUND',
      'message', 'Chat room not found.'
    );
  END IF;

  -- Step 1 RLS / Security: Only participants can terminate
  IF v_room.user_1 <> v_user_id AND v_room.user_2 <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'Only active room participants can terminate this conversation.'
    );
  END IF;

  -- Step 7: Double Action Handling
  -- If room was already ended by peer (e.g. simultaneous skip), return cleanly
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

  -- 4. Terminate Room
  UPDATE public.chat_rooms
  SET
    status = 'ended',
    ended_at = v_now,
    end_reason = v_reason
  WHERE id = p_room_id;

  -- 5. Broadcast System Notification: "Stranger disconnected."
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
    'end_reason', v_reason,
    'already_ended', false
  );
END;
$$;
