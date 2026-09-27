-- ============================================================================
-- Migration: 20260927000005_fix_lpad_integer_text_cast.sql
-- Description: Fix SQL type error "operator does not exist: integer + text"
--              in join_matchmaking(). The expression:
--                abs(hashtext(v_user_id::text)) % 9000 + 1000::text
--              casts 1000 to text BEFORE the addition. Must instead be:
--                (abs(hashtext(v_user_id::text)) % 9000 + 1000)::text
--              to perform integer arithmetic first, then cast the result.
-- Occurrences fixed: 3 (v_user_id identity insert + 2x v_partner_user_id fallback)
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
  v_room_is_abandoned BOOLEAN;
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
    'Unknown User ' || lpad((abs(hashtext(v_user_id::text)) % 9000 + 1000)::text, 4, '0'),
    '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb,
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  v_now := now();

  -- 3. Active Room Gate with NULL-safe abandonment check
  SELECT id, user_1, user_2, status, created_at, expires_at,
         user_1_heartbeat_at, user_2_heartbeat_at
  INTO v_existing_room
  FROM public.chat_rooms
  WHERE status = 'active'
    AND (user_1 = v_user_id OR user_2 = v_user_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_room.id IS NOT NULL THEN
    -- NULL-safe abandonment: COALESCE NULL heartbeats to epoch
    v_room_is_abandoned := (
      COALESCE(v_existing_room.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
      AND COALESCE(v_existing_room.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
    );

    -- Check if expired, over 7 minutes, or abandoned
    IF (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
       OR (v_existing_room.created_at < v_now - interval '7 minutes')
       OR v_room_is_abandoned THEN

      UPDATE public.chat_rooms
      SET status = 'ended',
          ended_at = v_now,
          end_reason = CASE
            WHEN (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
                 OR (v_existing_room.created_at < v_now - interval '7 minutes')
            THEN 'time_limit'
            ELSE 'timeout'
          END
      WHERE id = v_existing_room.id;

    ELSE
      -- Room is genuinely active - return for resume
      v_partner_user_id := CASE
        WHEN v_existing_room.user_1 = v_user_id THEN v_existing_room.user_2
        ELSE v_existing_room.user_1
      END;

      SELECT college_identity_linked INTO v_partner_is_verified
      FROM public.profiles
      WHERE id = v_partner_user_id;

      IF v_partner_is_verified IS TRUE THEN
        SELECT anonymous_username, avatar_config
        INTO v_partner_username, v_partner_avatar
        FROM public.anonymous_identities
        WHERE user_id = v_partner_user_id;
      ELSE
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
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

  -- 4. Stale Queue Cleanup
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching'
    AND heartbeat_at < v_now - interval '25 seconds';

  -- 5. Multiple-Tab Safety
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
        AND NOT (
          COALESCE(r.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
          AND COALESCE(r.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
        )
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 7. If partner found, create room
  IF v_partner_queue_id IS NOT NULL THEN
    -- Clean up any expired rooms for partner
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE status = 'active'
      AND (user_1 = v_partner_user_id OR user_2 = v_partner_user_id)
      AND (expires_at <= v_now OR (expires_at IS NULL AND created_at < v_now - interval '7 minutes'));

    v_expires_at := v_now + interval '7 minutes';

    INSERT INTO public.chat_rooms (user_1, user_2, status, created_at, expires_at)
    VALUES (v_partner_user_id, v_user_id, 'active', v_now, v_expires_at)
    RETURNING id INTO v_new_room_id;

    UPDATE public.matchmaking_queue
    SET status = 'matched', matched_room_id = v_new_room_id,
        matched_user_id = v_user_id, heartbeat_at = v_now
    WHERE id = v_partner_queue_id;

    UPDATE public.matchmaking_queue
    SET status = 'matched', matched_room_id = v_new_room_id,
        matched_user_id = v_partner_user_id, heartbeat_at = v_now
    WHERE id = v_my_queue_id;

    -- Privacy: resolve partner persona
    SELECT college_identity_linked INTO v_partner_is_verified
    FROM public.profiles
    WHERE id = v_partner_user_id;

    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config
      INTO v_partner_username, v_partner_avatar
      FROM public.anonymous_identities
      WHERE user_id = v_partner_user_id;
    ELSE
      v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
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

  -- 8. No partner available yet
  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_my_queue_id
  );
END;
$$;
