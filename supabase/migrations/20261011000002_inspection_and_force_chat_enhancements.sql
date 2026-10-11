-- ============================================================================
-- Migration: 20261011000002_inspection_and_force_chat_enhancements.sql
-- Description:
--   1. Secure Encrypted Identity Storage for Student Register Numbers
--      - Dedicated public.encrypted_student_identities table
--      - AES-256 authenticated encryption via pgcrypto
--      - Decoupled from public profiles and anonymous personas
--   2. Developer-Authorized Register Number Reveal RPC:
--      - reveal_student_register_number(p_target_user_id, p_reason)
--      - Audited via VIEW_STUDENT_REGISTER_NUMBER (no plaintext in audit logs)
--   3. Enhanced Developer Profile Inspection:
--      - get_user_admin_details() now returns Google account name and
--        has_encrypted_register_number flag
--   4. Identity Unlink & Verification Synchronization:
--      - unlink_college_identity() deletes encrypted register numbers
--      - verify_and_link_college_identity() encrypts and retains register numbers
--   5. Privileged Force Chat Capability:
--      - force_developer_chat(p_target_user_id)
--      - Atomic room creation and Realtime notification for recipient
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: ENCRYPTED STUDENT IDENTITY CREDENTIALS TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.encrypted_student_identities (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_register_number BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (Strict: zero access to anon or authenticated directly)
ALTER TABLE public.encrypted_student_identities ENABLE ROW LEVEL SECURITY;

-- Server-Internal Encryption Key Getter (Revoked from public, anon, authenticated)
CREATE OR REPLACE FUNCTION public._get_internal_identity_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN 'rit_secure_identity_aes256_enc_key_2026_x89a';
END;
$$;

REVOKE ALL ON FUNCTION public._get_internal_identity_encryption_key() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- PART 2: UPDATE CHAT REQUESTS STATUS CHECK CONSTRAINT
-- ----------------------------------------------------------------------------

ALTER TABLE public.chat_requests DROP CONSTRAINT IF EXISTS chat_requests_status_check;
ALTER TABLE public.chat_requests ADD CONSTRAINT chat_requests_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text, 'developer_forced'::text]));

-- ----------------------------------------------------------------------------
-- PART 3: DEVELOPER PROFILE INSPECTION WITH GOOGLE NAME & REGISTER NUMBER FLAG
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_admin_details(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_profile RECORD;
  v_presence RECORD;
  v_identity RECORD;
  v_masked_fingerprint TEXT;
  v_google_name TEXT;
  v_has_encrypted_reg BOOLEAN := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Developer role required to inspect private student credentials.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'A valid reason (minimum 3 characters) is required to inspect user profile details.'
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  SELECT * INTO v_presence FROM public.user_presence WHERE user_id = p_user_id;

  -- Google display name from auth.users metadata
  SELECT COALESCE(
    NULLIF(trim(raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(raw_user_meta_data->>'name'), '')
  ) INTO v_google_name
  FROM auth.users
  WHERE id = p_user_id;

  SELECT id, identity_hash, verification_method, created_at, active
  INTO v_identity
  FROM public.college_identities
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_identity.identity_hash IS NOT NULL THEN
    v_masked_fingerprint := '...' || substring(v_identity.identity_hash from 57 for 8);
  ELSE
    v_masked_fingerprint := NULL;
  END IF;

  -- Check if encrypted register number exists
  SELECT EXISTS (
    SELECT 1 FROM public.encrypted_student_identities WHERE user_id = p_user_id
  ) INTO v_has_encrypted_reg;

  -- Append audit log entry internally (actor_role = 'developer')
  PERFORM public.log_admin_action(
    'VIEW_PRIVATE_PROFILE',
    p_user_id,
    NULL,
    trim(p_reason),
    jsonb_build_object('target_user_id', p_user_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'anonymous_username', COALESCE(v_profile.display_username, 'Unknown User'),
    'avatar_config', v_profile.avatar_config,
    'google_name', v_google_name,
    'real_name', COALESCE(v_profile.full_name, v_profile.name),
    'department', v_profile.department,
    'batch', v_profile.batch,
    'gender', v_profile.gender,
    'is_verified', COALESCE(v_profile.college_identity_linked, false),
    'ever_verified', COALESCE(v_profile.ever_verified_identity, false),
    'verification_method', v_profile.verification_method,
    'verified_at', v_profile.verified_at,
    'identity_id', v_identity.id,
    'fingerprint_suffix', v_masked_fingerprint,
    'has_encrypted_register_number', v_has_encrypted_reg,
    'account_created_at', v_profile.created_at,
    'last_seen_at', v_presence.last_seen_at,
    'is_online', COALESCE(v_presence.is_online, false),
    'presence_state', CASE
      WHEN v_presence.is_online IS NOT TRUE OR v_presence.last_seen_at < (now() - interval '60 seconds') THEN 'offline'
      WHEN EXISTS (
        SELECT 1 FROM public.chat_rooms
        WHERE (user_1 = p_user_id OR user_2 = p_user_id) AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
      ) THEN 'in_chat'
      ELSE 'idle'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_admin_details(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_admin_details(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 4: AUTHORIZED REVEAL OF STUDENT REGISTER NUMBER
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_student_register_number(
  p_target_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_enc_bytes BYTEA;
  v_key TEXT;
  v_decrypted TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Developer role required to decrypt and view student register numbers.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'A valid reason (minimum 3 characters) is required to reveal student register numbers.'
    );
  END IF;

  SELECT encrypted_register_number INTO v_enc_bytes
  FROM public.encrypted_student_identities
  WHERE user_id = p_target_user_id;

  IF v_enc_bytes IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_RETAINED_REGISTER_NUMBER',
      'message', 'Unavailable — re-verification required'
    );
  END IF;

  v_key := public._get_internal_identity_encryption_key();

  BEGIN
    v_decrypted := pgp_sym_decrypt(v_enc_bytes, v_key);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DECRYPTION_FAILED',
      'message', 'Failed to decrypt stored register number.'
    );
  END;

  -- Append audit log entry internally (DO NOT put the actual register number in audit metadata!)
  PERFORM public.log_admin_action(
    'VIEW_STUDENT_REGISTER_NUMBER',
    p_target_user_id,
    NULL,
    trim(p_reason),
    jsonb_build_object('target_user_id', p_target_user_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'register_number', v_decrypted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_student_register_number(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reveal_student_register_number(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 5: UPDATE VERIFICATION AND UNLINK FOR ENCRYPTED STORAGE
-- ----------------------------------------------------------------------------

-- 1. verify_and_link_college_identity()
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
  v_now TIMESTAMPTZ;
  v_method TEXT;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
BEGIN
  PERFORM set_config('app.in_trusted_verification', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to link a college identity.'
    );
  END IF;

  IF NOT public.check_rate_limit('college_verification_attempt', 60, 10) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many verification attempts. Please wait a moment before trying again.'
    );
  END IF;

  IF p_student_ref IS NULL
     OR length(trim(p_student_ref)) < 3
     OR lower(trim(p_student_ref)) IN ('student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_IDENTITY_DATA',
      'message', 'The scanned QR code does not contain sufficient unique identifier data to verify account uniqueness.'
    );
  END IF;

  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');
  v_now := now();
  v_method := 'physical_id';

  -- Check active identity ownership
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  -- Re-scan already linked to caller
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET
      college_identity_linked = true,
      ever_verified_identity = true,
      first_verified_at = COALESCE(first_verified_at, v_now),
      verification_method = v_method,
      verified_at = v_now,
      name = p_name,
      full_name = p_name,
      department = p_department,
      batch = p_batch,
      updated_at = v_now
    WHERE id = v_user_id;

    -- Update encrypted register number
    INSERT INTO public.encrypted_student_identities (
      user_id,
      encrypted_register_number,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      pgp_sym_encrypt(trim(p_student_ref), public._get_internal_identity_encryption_key(), 'cipher-algo=aes256'),
      v_now,
      v_now
    )
    ON CONFLICT (user_id) DO UPDATE
    SET encrypted_register_number = EXCLUDED.encrypted_register_number,
        updated_at = v_now;

    UPDATE public.chat_rooms
    SET persona_updated_at = v_now
    WHERE (user_1 = v_user_id OR user_2 = v_user_id)
      AND status = 'active';

    RETURN jsonb_build_object(
      'success', true,
      'already_linked_to_self', true,
      'message', 'This college identity is already linked to your account.',
      'college_identity_id', v_existing_id,
      'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
      'verification_method', v_method,
      'verified_at', v_now
    );
  END IF;

  -- Duplicate claimed by another user
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- Clean up any prior active college identity for this user
  DELETE FROM public.college_identities
  WHERE user_id = v_user_id;

  BEGIN
    INSERT INTO public.college_identities (
      user_id,
      identity_hash,
      verification_method,
      name_from_qr,
      department_from_qr,
      batch_from_qr,
      qr_metadata,
      active
    )
    VALUES (
      v_user_id,
      v_identity_hash,
      v_method,
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

  -- Encrypt and persist register number for authorized safety inspection
  INSERT INTO public.encrypted_student_identities (
    user_id,
    encrypted_register_number,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    pgp_sym_encrypt(trim(p_student_ref), public._get_internal_identity_encryption_key(), 'cipher-algo=aes256'),
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET encrypted_register_number = EXCLUDED.encrypted_register_number,
      updated_at = v_now;

  UPDATE public.profiles
  SET
    college_identity_linked = true,
    ever_verified_identity = true,
    first_verified_at = COALESCE(first_verified_at, v_now),
    verification_method = v_method,
    verified_at = v_now,
    name = p_name,
    full_name = p_name,
    department = p_department,
    batch = p_batch,
    updated_at = v_now
  WHERE id = v_user_id;

  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verification_method', v_method,
    'verified_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;

-- 2. unlink_college_identity()
CREATE OR REPLACE FUNCTION public.unlink_college_identity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_dev BOOLEAN := false;
  v_now TIMESTAMPTZ := now();
  v_default_avatar JSONB := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
  v_unknown_handle TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to unlink a college identity.'
    );
  END IF;

  PERFORM set_config('app.in_trusted_unlink', 'true', true);
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = v_user_id AND role = 'developer' AND is_active = true
  ) INTO v_is_dev;

  -- 1. DELETE student's college identity link record
  DELETE FROM public.college_identities
  WHERE user_id = v_user_id;

  -- 2. DELETE any retained encrypted register number immediately
  DELETE FROM public.encrypted_student_identities
  WHERE user_id = v_user_id;

  -- 3. Clear profile fields
  IF v_is_dev IS TRUE THEN
    UPDATE public.profiles
    SET
      college_identity_linked = false,
      verified_at = NULL,
      verification_method = NULL,
      name = NULL,
      full_name = NULL,
      department = NULL,
      batch = NULL,
      section = NULL,
      class_name = NULL,
      graduation_year = NULL,
      gender = NULL,
      gender_locked_at = NULL,
      ever_verified_identity = false,
      first_verified_at = NULL,
      updated_at = v_now
    WHERE id = v_user_id;
  ELSE
    v_unknown_handle := 'Unknown User ' || lpad((abs(hashtext(v_user_id::text)) % 9000 + 1000)::text, 4, '0');

    UPDATE public.profiles
    SET
      college_identity_linked = false,
      verified_at = NULL,
      verification_method = NULL,
      name = NULL,
      full_name = NULL,
      department = NULL,
      batch = NULL,
      section = NULL,
      class_name = NULL,
      graduation_year = NULL,
      gender = NULL,
      gender_locked_at = NULL,
      ever_verified_identity = false,
      first_verified_at = NULL,
      display_username = v_unknown_handle,
      avatar_config = v_default_avatar,
      profile_completed = false,
      updated_at = v_now
    WHERE id = v_user_id;

    UPDATE public.anonymous_identities
    SET
      anonymous_username = v_unknown_handle,
      avatar_config = v_default_avatar,
      updated_at = v_now
    WHERE user_id = v_user_id;
  END IF;

  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'College identity successfully unlinked.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_college_identity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unlink_college_identity() TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 6: DEVELOPER FORCE CHAT RPC
-- ----------------------------------------------------------------------------

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

  -- 3. Check caller active room
  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = v_caller_id OR user_2 = v_caller_id)
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CALLER_IN_ACTIVE_ROOM',
      'message', 'You are already in an active chat room.'
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

  -- 5. Check target active room
  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = p_target_user_id OR user_2 = p_target_user_id)
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_UNAVAILABLE',
      'message', 'User is unavailable for direct chat.'
    );
  END IF;

  -- 6. Rate Limit / Cooldown: Prevent spamming the same recipient
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

  -- 7. Cancel pending requests for both users
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE ((requester_id = v_caller_id OR recipient_id = v_caller_id)
      OR (requester_id = p_target_user_id OR recipient_id = p_target_user_id))
    AND status = 'pending';

  -- 8. Atomically create active chat room
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

  -- 9. Insert realtime chat request notification for recipient
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

  -- 10. Audit log (No PII or messages logged)
  PERFORM public.log_admin_action(
    'FORCE_DEVELOPER_CHAT',
    p_target_user_id,
    v_new_room_id,
    'Developer initiated direct chat session',
    jsonb_build_object('room_id', v_new_room_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_new_room_id,
    'created_at', v_now,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_developer_chat(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.force_developer_chat(UUID) TO authenticated;
