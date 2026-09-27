-- ============================================================================
-- Migration: 20260927000003_stale_active_room_recovery.sql
-- Description: Automatic recovery of expired active rooms in join_matchmaking()
--              and seamless resumption of genuinely active non-expired rooms.
--              Maintains one-active-room-per-user invariant without blocking.
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

  v_now := now();

  -- 3. Active Room Gate with Auto-Recovery & Seamless Resumption
  -- Inspect any currently active room for this user
  SELECT id, user_1, user_2, status, created_at, expires_at
  INTO v_existing_room
  FROM public.chat_rooms
  WHERE status = 'active'
    AND (user_1 = v_user_id OR user_2 = v_user_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_room.id IS NOT NULL THEN
    -- Check if this active room is expired (7-minute limit exceeded)
    IF (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
       OR (v_existing_room.created_at < v_now - interval '7 minutes') THEN
      -- Atomically mark expired room as ended with end_reason = 'time_limit'
      UPDATE public.chat_rooms
      SET status = 'ended',
          ended_at = v_now,
          end_reason = 'time_limit'
      WHERE id = v_existing_room.id;

      -- Insert system message for room completion
      INSERT INTO public.chat_messages (
        room_id,
        sender_id,
        content,
        created_at,
        message_type
      ) VALUES (
        v_existing_room.id,
        v_user_id,
        '7-minute chat session ended.',
        v_now,
        'system'
      );
      -- Stale expired room is now cleanly ended! Proceed seamlessly to matchmaking.
    ELSE
      -- Room is GENUINELY active and not expired!
      -- Return existing_room so frontend can automatically resume the live session.
      v_partner_user_id := CASE WHEN v_existing_room.user_1 = v_user_id THEN v_existing_room.user_2 ELSE v_existing_room.user_1 END;

      SELECT college_identity_linked INTO v_partner_is_verified
      FROM public.profiles
      WHERE id = v_partner_user_id;

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
        'status', 'existing_room',
        'room_id', v_existing_room.id,
        'created_at', v_existing_room.created_at,
        'expires_at', v_existing_room.expires_at,
        'peer', jsonb_build_object(
          'anonymous_username', COALESCE(v_partner_username, 'Unknown User'),
          'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
        )
      );
    END IF;
  END IF;

  -- 4. Stale Queue Cleanup: Expire entries where heartbeat is older than 25 seconds
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching'
    AND heartbeat_at < v_now - interval '25 seconds';

  -- 5. Multiple-Tab Safety: If user has an existing searching queue entry, reuse or reset it
  SELECT id INTO v_my_queue_id
  FROM public.matchmaking_queue
  WHERE user_id = v_user_id AND status = 'searching';

  IF v_my_queue_id IS NOT NULL THEN
    UPDATE public.matchmaking_queue
    SET heartbeat_at = v_now
    WHERE id = v_my_queue_id;
  ELSE
    INSERT INTO public.matchmaking_queue (user_id, joined_at, status, heartbeat_at)
    VALUES (v_user_id, v_now, 'searching', v_now)
    RETURNING id INTO v_my_queue_id;
  END IF;

  -- 6. Atomic Server-Side Pairing via FOR UPDATE SKIP LOCKED
  -- Exclude partners who are in an active non-expired room
  SELECT q.id, q.user_id
  INTO v_partner_queue_id, v_partner_user_id
  FROM public.matchmaking_queue q
  WHERE q.status = 'searching'
    AND q.user_id != v_user_id
    AND q.heartbeat_at >= v_now - interval '25 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active'
        AND (r.user_1 = q.user_id OR r.user_2 = q.user_id)
        AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 7. If partner found, atomically transition both to active room with 7-minute limit
  IF v_partner_queue_id IS NOT NULL THEN
    -- Clean up any expired rooms for partner first
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE status = 'active'
      AND (user_1 = v_partner_user_id OR user_2 = v_partner_user_id)
      AND (expires_at <= v_now OR (expires_at IS NULL AND created_at < v_now - interval '7 minutes'));

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

-- Also update cleanup_stale_sessions() to guarantee coverage of any rooms without expires_at
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
      AND (
        (expires_at IS NOT NULL AND expires_at <= v_now)
        OR (created_at < v_now - interval '7 minutes')
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
