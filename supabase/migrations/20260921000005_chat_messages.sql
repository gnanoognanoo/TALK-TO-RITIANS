-- ============================================================================
-- Migration: 20260921000005_chat_messages.sql
-- Description: Realtime 1-to-1 anonymous chat messages and participant isolation.
--
-- Tables:
-- 1. public.chat_messages
--
-- RPC Functions:
-- 1. send_chat_message()
-- 2. get_room_peer()
-- 3. end_chat_room()
-- ============================================================================

-- ============================================================================
-- 1. Chat Messages Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system'))
);

-- Index for ordering messages chronologically within a room
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_order
  ON public.chat_messages (room_id, created_at ASC);

-- Enable Row Level Security
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- STEP 1 — RLS: Only the two room participants may read messages
DROP POLICY IF EXISTS chat_messages_select_participants ON public.chat_messages;
CREATE POLICY chat_messages_select_participants ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.id = chat_messages.room_id
        AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
    )
  );

-- STEP 1 — RLS: Only active room participants may insert messages as sender
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
        AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
    )
  );

-- ============================================================================
-- 2. Stored Procedure: send_chat_message()
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
  v_room_status TEXT;
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
  SELECT status INTO v_room_status
  FROM public.chat_rooms
  WHERE id = p_room_id
    AND (user_1 = v_user_id OR user_2 = v_user_id);

  IF v_room_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_ROOM_ACCESS',
      'message', 'You are not a participant in this conversation.'
    );
  END IF;

  IF v_room_status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ROOM_INACTIVE',
      'message', 'This conversation has ended and is closed to new messages.'
    );
  END IF;

  -- 3. Content Validation & Sanitization
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

  v_now := now();

  -- 4. Insert Message
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
-- 3. Stored Procedure: get_room_peer()
-- ============================================================================
-- Resolves the caller's peer in the room.
-- CRITICAL PRIVACY: Returns strictly anonymous_username and avatar_config.
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Look up room and verify caller is a participant
  SELECT id, user_1, user_2, status
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

  -- Identify peer
  IF v_room.user_1 = v_user_id THEN
    v_peer_id := v_room.user_2;
  ELSE
    v_peer_id := v_room.user_1;
  END IF;

  -- Query ONLY anonymous_identities partition
  SELECT anonymous_username, avatar_config
  INTO v_peer_username, v_peer_avatar
  FROM public.anonymous_identities
  WHERE user_id = v_peer_id;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'peer', jsonb_build_object(
      'anonymous_username', COALESCE(v_peer_username, 'Anonymous RITian'),
      'avatar_config', COALESCE(v_peer_avatar, '{}'::jsonb)
    )
  );
END;
$$;

-- ============================================================================
-- 4. Stored Procedure: end_chat_room()
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
  v_new_status TEXT;
  v_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Check membership
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE id = p_room_id
      AND (user_1 = v_user_id OR user_2 = v_user_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  v_reason := lower(trim(p_reason));
  IF v_reason = 'skip' THEN
    v_new_status := 'skipped';
  ELSE
    v_new_status := 'ended';
  END IF;

  -- Update room status
  UPDATE public.chat_rooms
  SET
    status = v_new_status,
    ended_at = now(),
    end_reason = v_reason
  WHERE id = p_room_id
    AND status = 'active';

  -- Insert automated system notice
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
    CASE
      WHEN v_reason = 'skip' THEN 'A participant skipped this conversation.'
      ELSE 'A participant left the chat room.'
    END,
    now(),
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'status', v_new_status,
    'end_reason', v_reason
  );
END;
$$;
