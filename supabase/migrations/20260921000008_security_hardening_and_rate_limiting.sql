-- ============================================================================
-- Migration: 20260921000008_security_hardening_and_rate_limiting.sql
-- Description: Phase 13 - Security review, server-side rate limiting engine,
--              and defensive procedural hardening.
-- ============================================================================

-- ============================================================================
-- 1. Rate Limiting Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action_time
  ON public.rate_limits (user_id, action, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only inspect their own rate limiting records
DROP POLICY IF EXISTS rate_limits_select_own ON public.rate_limits;
CREATE POLICY rate_limits_select_own ON public.rate_limits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 2. Stored Procedure: check_rate_limit()
-- ============================================================================
-- Returns TRUE if request is allowed; FALSE if rate limit is exceeded.
-- Also cleans up expired rate limiting entries to maintain a small table footprint.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action TEXT,
  p_window_seconds INT,
  p_max_attempts INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_recent_count INT;
  v_window INTERVAL;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_window := (p_window_seconds || ' seconds')::interval;

  -- 1. Count attempts in the sliding window
  SELECT count(*) INTO v_recent_count
  FROM public.rate_limits
  WHERE user_id = v_user_id
    AND action = p_action
    AND created_at >= (now() - v_window);

  -- 2. Check threshold
  IF v_recent_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  -- 3. Log attempt
  INSERT INTO public.rate_limits (user_id, action, created_at)
  VALUES (v_user_id, p_action, now());

  -- 4. Opportunistic cleanup of stale logs older than 2 minutes
  DELETE FROM public.rate_limits
  WHERE user_id = v_user_id
    AND created_at < (now() - interval '2 minutes');

  RETURN true;
END;
$$;

-- ============================================================================
-- 3. Rate-Limit Hardening: verify_and_link_college_identity()
-- Max 5 QR verification attempts per 30 seconds
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_and_link_college_identity(
  p_student_ref TEXT,
  p_name TEXT,
  p_department TEXT,
  p_batch TEXT,
  p_qr_metadata JSONB DEFAULT '{}'::jsonb,
  p_cooldown_hours INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_identity_hash TEXT;
  v_existing_id UUID;
  v_existing_user UUID;
  v_new_identity_id UUID;
  v_last_unlinked TIMESTAMPTZ;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
BEGIN
  -- Security: authenticated session required
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Rate Limit Check: Max 5 QR attempts per 30 seconds
  IF NOT public.check_rate_limit('qr_verify', 30, 5) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many QR scan attempts. Please wait a moment before trying again.'
    );
  END IF;

  -- Validation
  IF p_student_ref IS NULL
     OR length(trim(p_student_ref)) < 3
     OR lower(trim(p_student_ref)) IN ('student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_IDENTITY_DATA',
      'message', 'The scanned QR code does not contain sufficient unique identifier data.'
    );
  END IF;

  -- Server-side salted SHA-256 fingerprint
  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');

  -- Active identity check
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  -- Re-scan by same user
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET college_identity_linked = true, updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_linked_to_self', true,
      'message', 'This college identity is already linked to your account.',
      'college_identity_id', v_existing_id,
      'verified_at', now()
    );
  END IF;

  -- Duplicate active on another account
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- Cooldown check
  IF p_cooldown_hours > 0 THEN
    SELECT max(unlinked_at) INTO v_last_unlinked
    FROM public.college_identities
    WHERE identity_hash = v_identity_hash AND active = false AND user_id <> v_user_id;

    IF v_last_unlinked IS NOT NULL AND (now() - v_last_unlinked) < (p_cooldown_hours || ' hours')::interval THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', 'This college identity was recently unlinked and cannot be re-linked yet.'
      );
    END IF;
  END IF;

  -- Deactivate prior identities for this user
  UPDATE public.college_identities
  SET active = false, unlinked_at = now()
  WHERE user_id = v_user_id AND active = true;

  -- Insert with race condition handling
  BEGIN
    INSERT INTO public.college_identities (
      user_id,
      identity_hash,
      name_from_qr,
      department_from_qr,
      batch_from_qr,
      qr_metadata,
      active
    )
    VALUES (
      v_user_id,
      v_identity_hash,
      p_name,
      p_department,
      p_batch,
      p_qr_metadata,
      true
    )
    RETURNING id INTO v_new_identity_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CARD_ALREADY_LINKED',
        'message', 'This college identity is already linked to another account.'
      );
  END;

  UPDATE public.profiles
  SET college_identity_linked = true, updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'college_identity_id', v_new_identity_id,
    'verified_at', now()
  );
END;
$$;

-- ============================================================================
-- 4. Rate-Limit Hardening: save_profile_data()
-- Max 10 profile updates per 60 seconds
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_profile_data(
  p_department TEXT,
  p_section TEXT,
  p_class_name TEXT,
  p_batch TEXT,
  p_graduation_year INTEGER,
  p_gender TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_linked BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Rate Limit Check: Max 10 profile updates per 60 seconds
  IF NOT public.check_rate_limit('profile_update', 60, 10) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many profile updates. Please wait a moment before saving again.'
    );
  END IF;

  SELECT college_identity_linked INTO v_is_linked
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_linked IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before saving profile metadata.'
    );
  END IF;

  UPDATE public.profiles
  SET
    department = trim(p_department),
    section = trim(p_section),
    class_name = trim(p_class_name),
    batch = trim(p_batch),
    graduation_year = p_graduation_year,
    gender = trim(p_gender),
    profile_completed = true,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_completed', true,
    'updated_at', now()
  );
END;
$$;

-- ============================================================================
-- 5. Rate-Limit Hardening: join_matchmaking()
-- Max 1 join request per 2 seconds
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Rate Limit Check: Max 1 join attempt per 2 seconds
  IF NOT public.check_rate_limit('matchmaking_join', 2, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Please wait a moment before joining matchmaking again.'
    );
  END IF;

  SELECT college_identity_linked, profile_completed
  INTO v_is_verified, v_is_profile_completed
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'VERIFICATION_REQUIRED');
  END IF;

  IF v_is_profile_completed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_INCOMPLETE');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active' AND (user_1 = v_user_id OR user_2 = v_user_id)
  ) INTO v_has_active_room;

  IF v_has_active_room THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_IN_ACTIVE_ROOM');
  END IF;

  -- Prune stale queue entries
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching' AND heartbeat_at < now() - interval '25 seconds';

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

  -- Atomic Server-Side Pairing via SKIP LOCKED
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

  IF v_partner_queue_id IS NOT NULL THEN
    INSERT INTO public.chat_rooms (user_1, user_2, status, created_at)
    VALUES (v_partner_user_id, v_user_id, 'active', now())
    RETURNING id INTO v_new_room_id;

    UPDATE public.matchmaking_queue
    SET status = 'matched', matched_room_id = v_new_room_id, matched_user_id = v_user_id, heartbeat_at = now()
    WHERE id = v_partner_queue_id;

    UPDATE public.matchmaking_queue
    SET status = 'matched', matched_room_id = v_new_room_id, matched_user_id = v_partner_user_id, heartbeat_at = now()
    WHERE id = v_my_queue_id;

    SELECT anonymous_username, avatar_config
    INTO v_partner_username, v_partner_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_partner_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Anonymous Student'),
        'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_my_queue_id
  );
END;
$$;

-- ============================================================================
-- 6. Rate-Limit Hardening: send_chat_message()
-- Max 6 messages per 3 seconds
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Rate Limit Check: Max 6 messages per 3 seconds
  IF NOT public.check_rate_limit('chat_message', 3, 6) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'You are sending messages too quickly. Please wait a moment.'
    );
  END IF;

  SELECT status INTO v_room_status
  FROM public.chat_rooms
  WHERE id = p_room_id
    AND (user_1 = v_user_id OR user_2 = v_user_id);

  IF v_room_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ROOM_ACCESS');
  END IF;

  IF v_room_status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_INACTIVE');
  END IF;

  v_trimmed := trim(p_content);
  IF v_trimmed IS NULL OR length(v_trimmed) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'EMPTY_MESSAGE');
  END IF;

  IF length(v_trimmed) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESSAGE_TOO_LONG');
  END IF;

  v_now := now();

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
-- 7. Rate-Limit Hardening: end_chat_room() on Skip
-- Max 1 skip per 2 seconds
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
  IF v_reason NOT IN ('skip', 'leave', 'disconnect') THEN
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
