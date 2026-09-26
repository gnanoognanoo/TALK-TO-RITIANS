-- ============================================================================
-- Migration: 20260926000001_seven_minute_limit_refinements.sql
-- Description: Server-authoritative 7-minute limit refinements:
--              Enables 'time_limit' handling in public.end_chat_room() stored procedure
--              and records '7-minute chat session ended.' system notification.
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

  IF v_room IS NULL THEN
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
    end_reason = v_reason
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
