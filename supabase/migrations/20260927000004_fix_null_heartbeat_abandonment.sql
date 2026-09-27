-- ============================================================================
-- Migration: 20260927000004_fix_null_heartbeat_abandonment.sql
-- Description: Fix stale active room blocker caused by NULL heartbeats.
--
-- ROOT CAUSE:
--   cleanup_stale_sessions() step 3 checked:
--     user_1_heartbeat_at < (now - 60s) AND user_2_heartbeat_at < (now - 60s)
--   In Postgres, NULL < timestamp evaluates to NULL (falsy), so rooms where
--   both users crashed/disconnected with NULL heartbeats were NEVER cleaned up.
--   These rooms stayed 'active' forever and blocked new matchmaking.
--
-- FIXES:
--   1. cleanup_stale_sessions() - treat NULL heartbeat as "never heartbeated" (oldest)
--   2. join_matchmaking() - add NULL-heartbeat abandonment check in step 3 gate
--   3. Add force_leave_active_room() RPC for explicit user escape hatch
-- ============================================================================

-- ============================================================================
-- Fix 1: cleanup_stale_sessions() - NULL-safe heartbeat abandonment check
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
  v_null_heartbeat_rooms INT;
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

  -- 3. Expire abandoned active rooms where BOTH heartbeats are older than 60 seconds.
  --    CRITICAL FIX: COALESCE NULL heartbeats to epoch (treat as permanently stale)
  --    so rooms where users crashed without ever sending a heartbeat are caught.
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

  -- 4. NEW: Expire rooms where created_at is older than 3 minutes and BOTH heartbeats are NULL
  --    (users joined and immediately crashed before ever sending a heartbeat)
  WITH null_hb_rooms AS (
    UPDATE public.chat_rooms
    SET
      status = 'ended',
      ended_at = v_now,
      end_reason = 'timeout'
    WHERE status = 'active'
      AND user_1_heartbeat_at IS NULL
      AND user_2_heartbeat_at IS NULL
      AND created_at < (v_now - interval '3 minutes')
    RETURNING id
  )
  SELECT count(*) INTO v_null_heartbeat_rooms FROM null_hb_rooms;

  RETURN jsonb_build_object(
    'success', true,
    'expired_queue_entries', v_expired_queues,
    'time_limit_rooms_cleaned', v_timed_out_rooms,
    'abandoned_rooms_cleaned', v_stale_rooms,
    'null_heartbeat_rooms_cleaned', v_null_heartbeat_rooms
  );
END;
$$;


-- ============================================================================
-- Fix 2: join_matchmaking() - NULL-safe active room gate in step 3
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
    'Unknown User ' || lpad(abs(hashtext(v_user_id::text)) % 9000 + 1000::text, 4, '0'),
    '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb,
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  v_now := now();

  -- 3. Active Room Gate with Auto-Recovery & Seamless Resumption
  --    Inspect any currently active room for this user
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
    -- CRITICAL FIX: NULL-safe abandonment check.
    -- A room is "abandoned" if BOTH users' heartbeats are stale or NULL.
    -- COALESCE NULL to epoch to make the < comparison work correctly.
    v_room_is_abandoned := (
      COALESCE(v_existing_room.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
      AND COALESCE(v_existing_room.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
    );

    -- Check if this active room is expired (7-minute limit exceeded) OR abandoned
    IF (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
       OR (v_existing_room.created_at < v_now - interval '7 minutes')
       OR v_room_is_abandoned THEN

      -- Atomically mark as ended
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

      -- Stale/expired room is now cleanly ended! Proceed seamlessly to matchmaking.

    ELSE
      -- Room is GENUINELY active, not expired, and not abandoned.
      -- Return existing_room so frontend can automatically resume the live session.
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
  --    Exclude partners who are in an active non-expired room
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
        -- CRITICAL FIX: Only block pairing if room is NOT abandoned (NULL-safe)
        AND NOT (
          COALESCE(r.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
          AND COALESCE(r.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
        )
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


-- ============================================================================
-- Fix 3: force_leave_active_room() - Explicit user escape hatch
-- Allows a user to forcibly end their current active room so they can
-- join a new matchmaking session. Called when user is stuck on matchmaking page.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.force_leave_active_room()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_room_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Find the most recent active room for this user
  SELECT id INTO v_room_id
  FROM public.chat_rooms
  WHERE status = 'active'
    AND (user_1 = v_user_id OR user_2 = v_user_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_room_id IS NULL THEN
    -- No active room found - that's fine, user is unblocked
    RETURN jsonb_build_object(
      'success', true,
      'room_id', NULL,
      'message', 'No active room found. You are free to matchmake.'
    );
  END IF;

  -- Force end the room with reason 'leave'
  UPDATE public.chat_rooms
  SET status = 'ended',
      ended_at = v_now,
      end_reason = 'leave'
  WHERE id = v_room_id AND status = 'active';

  -- Insert system message
  INSERT INTO public.chat_messages (
    room_id,
    sender_id,
    content,
    created_at,
    message_type
  ) VALUES (
    v_room_id,
    v_user_id,
    'Stranger disconnected.',
    v_now,
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'message', 'Active room ended. You can now join matchmaking.'
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.force_leave_active_room() TO authenticated;

-- ============================================================================
-- One-time cleanup: end any currently active rooms with NULL/stale heartbeats
-- that were created more than 3 minutes ago (emergency immediate fix)
-- ============================================================================
UPDATE public.chat_rooms
SET status = 'ended',
    ended_at = now(),
    end_reason = 'timeout'
WHERE status = 'active'
  AND COALESCE(user_1_heartbeat_at, '1970-01-01'::timestamptz) < (now() - interval '60 seconds')
  AND COALESCE(user_2_heartbeat_at, '1970-01-01'::timestamptz) < (now() - interval '60 seconds');
