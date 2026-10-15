-- ============================================================================
-- TALK TO RITIANS - Production Migration: Developer Force Chat Busy-User Override
-- Migration: 20261015000001_developer_force_chat_override.sql
-- ============================================================================
-- Implements privileged Developer Force Chat override for active chat sessions:
-- 1. Preserves existing idle-user force chat behavior.
-- 2. Privileged override when target student is already in an active room:
--    - Authoritatively locks and ends target's previous active room.
--    - Sets end_reason = 'developer_override' and clears any frozen timer.
--    - Inserts a clean system message into the previous room ("This conversation has ended.").
--    - Previous partner cleanly exits to ended state without false partner-leave attribution.
-- 3. Atomically creates exactly one new Developer <-> Target room with 7-minute timer.
-- 4. Dispatches realtime notification (chat_requests status = 'developer_forced').
-- 5. Developer already chatting is strictly prevented (one-active-room invariant).
-- 6. Rate limit / 60s cooldown per target is enforced.
-- 7. Fully audited in admin_audit_log (zero PII, zero message contents).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.force_developer_chat(
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + interval '7 minutes';
  v_new_room_id UUID;
  v_target_presence RECORD;
  v_target_room RECORD;
  v_prev_room_id UUID := NULL;
  v_prev_partner_id UUID := NULL;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 1. Strictly Developer Only
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVELOPER_REQUIRED',
      'message', 'Only authorized platform developers may initiate a direct chat session.'
    );
  END IF;

  -- 2. Cannot force chat with self
  IF p_target_user_id = v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CANNOT_TARGET_SELF',
      'message', 'You cannot force a chat session with your own account.'
    );
  END IF;

  -- 3. Check caller active room: Developer cannot override if they are already chatting
  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = v_caller_id OR user_2 = v_caller_id)
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CALLER_IN_ACTIVE_ROOM',
      'message', 'You are already in an active chat room. Please leave or end your current room first.'
    );
  END IF;

  -- 4. Check target user presence & availability
  SELECT user_id, is_online, last_seen_at, available_for_chat_requests
  INTO v_target_presence
  FROM public.user_presence
  WHERE user_id = p_target_user_id;

  IF v_target_presence.user_id IS NULL
     OR v_target_presence.is_online IS NOT TRUE
     OR v_target_presence.last_seen_at < (v_now - interval '60 seconds')
     OR v_target_presence.available_for_chat_requests IS FALSE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_UNAVAILABLE',
      'message', 'User is unavailable for direct chat.'
    );
  END IF;

  -- 5. Rate Limit / Cooldown: Prevent repeated spamming of the same recipient (60s)
  IF EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE action = 'FORCE_DEVELOPER_CHAT'
      AND target_user_id = p_target_user_id
      AND created_at > (v_now - interval '60 seconds')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FORCE_COOLDOWN',
      'message', 'Please wait before starting another direct chat with this user.'
    );
  END IF;

  -- 6. Lock and check if target is currently in an active room
  SELECT id, user_1, user_2, status, timer_paused_at
  INTO v_target_room
  FROM public.chat_rooms
  WHERE (user_1 = p_target_user_id OR user_2 = p_target_user_id)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > v_now)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 7. If target is in an active room, end that previous room atomically for both participants
  IF v_target_room.id IS NOT NULL THEN
    v_prev_room_id := v_target_room.id;
    IF v_target_room.user_1 = p_target_user_id THEN
      v_prev_partner_id := v_target_room.user_2;
    ELSE
      v_prev_partner_id := v_target_room.user_1;
    END IF;

    UPDATE public.chat_rooms
    SET
      status = 'ended',
      ended_at = v_now,
      end_reason = 'developer_override',
      timer_paused_at = NULL
    WHERE id = v_prev_room_id;

    -- Insert system message in previous room notifying that conversation has ended
    INSERT INTO public.chat_messages (
      room_id,
      sender_id,
      content,
      message_type,
      created_at
    )
    VALUES (
      v_prev_room_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'This conversation has ended.',
      'system',
      v_now
    );
  END IF;

  -- 8. Cancel pending requests for both users
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE ((requester_id = v_caller_id OR recipient_id = v_caller_id)
      OR (requester_id = p_target_user_id OR recipient_id = p_target_user_id))
    AND status = 'pending';

  -- 9. Atomically create active chat room between Developer and Target
  INSERT INTO public.chat_rooms (
    user_1,
    user_2,
    status,
    created_at,
    expires_at,
    user_1_heartbeat_at,
    user_2_heartbeat_at
  )
  VALUES (
    v_caller_id,
    p_target_user_id,
    'active',
    v_now,
    v_expires_at,
    v_now,
    v_now
  )
  RETURNING id INTO v_new_room_id;

  -- 10. Insert realtime chat request notification for recipient
  INSERT INTO public.chat_requests (
    requester_id,
    recipient_id,
    status,
    room_id,
    created_at,
    expires_at
  )
  VALUES (
    v_caller_id,
    p_target_user_id,
    'developer_forced',
    v_new_room_id,
    v_now,
    v_expires_at
  );

  -- 11. Audit log: Record privileged action (Zero PII, register numbers, or messages)
  PERFORM public.log_admin_action(
    'FORCE_DEVELOPER_CHAT',
    p_target_user_id,
    v_new_room_id,
    CASE
      WHEN v_prev_room_id IS NOT NULL THEN 'Developer initiated direct chat session (interrupted active conversation)'
      ELSE 'Developer initiated direct chat session'
    END,
    jsonb_build_object(
      'room_id', v_new_room_id,
      'previous_room_id', v_prev_room_id,
      'overrode_active_room', (v_prev_room_id IS NOT NULL)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_new_room_id,
    'created_at', v_now,
    'expires_at', v_expires_at,
    'overrode_active_room', (v_prev_room_id IS NOT NULL),
    'previous_room_id', v_prev_room_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_developer_chat(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.force_developer_chat(UUID) TO authenticated;
