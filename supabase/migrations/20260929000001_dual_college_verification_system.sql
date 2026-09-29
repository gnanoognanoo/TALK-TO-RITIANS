-- ============================================================================
-- Migration: 20260929000001_dual_college_verification_system.sql
-- Description: Dual College Verification System
--              1. Support verification via Physical RIT ID (Newer IMS URL + Legacy Numeric QR)
--              2. Support verification via College Email (OTP flow + strict institutional domain)
--              3. Unified verification state: college_identity_linked = true, verification_method, verified_at
--              4. Rate-limiting and hashed OTP storage for college email verification
--              5. One-active-identity enforcement across both methods
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Add verification_method column to college_identities
ALTER TABLE public.college_identities
ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT 'physical_id';

-- 2. Add verification_method and verified_at to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create college_email_otps table for abuse-resistant email verification
CREATE TABLE IF NOT EXISTS public.college_email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_identity_hash TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_college_email_otps_user ON public.college_email_otps (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_college_email_otps_hash ON public.college_email_otps (email_identity_hash, created_at DESC);

ALTER TABLE public.college_email_otps ENABLE ROW LEVEL SECURITY;

-- 4. RPC: request_college_email_otp
-- Records a server-hashed OTP and validates rate limits
CREATE OR REPLACE FUNCTION public.request_college_email_otp(
  p_email TEXT,
  p_otp_hash TEXT,
  p_expires_in_seconds INTEGER DEFAULT 600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email_clean TEXT;
  v_email_hash TEXT;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
  v_existing_user UUID;
  v_user_sends INTEGER;
  v_email_sends INTEGER;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to request college email verification.'
    );
  END IF;

  -- 2. Normalize email
  v_email_clean := lower(trim(p_email));
  IF v_email_clean IS NULL OR length(v_email_clean) < 5 OR position('@' in v_email_clean) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_EMAIL',
      'message', 'Please enter a valid institutional email address.'
    );
  END IF;

  -- 3. Derive deterministic cryptographic fingerprint strictly on server
  v_email_hash := encode(digest(v_email_clean || v_server_salt, 'sha256'), 'hex');

  -- 4. Check if this college email is already linked to another active account
  SELECT user_id INTO v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_email_hash AND active = true
  LIMIT 1;

  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'COLLEGE_EMAIL_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- 5. Server-side Rate Limiting:
  -- Max 3 sends per 15 minutes per account
  SELECT count(*) INTO v_user_sends
  FROM public.college_email_otps
  WHERE user_id = v_user_id AND created_at > (now() - interval '15 minutes');

  IF v_user_sends >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many verification code requests. Please wait a few minutes before trying again.'
    );
  END IF;

  -- Max 5 sends per 1 hour per institutional email fingerprint
  SELECT count(*) INTO v_email_sends
  FROM public.college_email_otps
  WHERE email_identity_hash = v_email_hash AND created_at > (now() - interval '1 hour');

  IF v_email_sends >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many verification code requests for this email address. Please try again later.'
    );
  END IF;

  -- 6. Invalidate previous unconsumed OTPs for this user
  UPDATE public.college_email_otps
  SET consumed = true
  WHERE user_id = v_user_id AND consumed = false;

  -- 7. Insert new OTP record with hashed OTP and 10-minute expiry
  v_expires_at := now() + (p_expires_in_seconds || ' seconds')::interval;

  INSERT INTO public.college_email_otps (
    user_id,
    email_identity_hash,
    otp_hash,
    expires_at,
    attempts,
    max_attempts,
    consumed
  )
  VALUES (
    v_user_id,
    v_email_hash,
    p_otp_hash,
    v_expires_at,
    0,
    5,
    false
  );

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_expires_at
  );
END;
$$;

-- 5. RPC: verify_college_email_otp
-- Validates OTP hash, expiration, attempt count, and atomically links account
CREATE OR REPLACE FUNCTION public.verify_college_email_otp(
  p_email TEXT,
  p_otp_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email_clean TEXT;
  v_email_hash TEXT;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
  v_otp_rec RECORD;
  v_existing_id UUID;
  v_existing_user UUID;
  v_new_identity_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to verify college email.'
    );
  END IF;

  -- 2. Normalize email
  v_email_clean := lower(trim(p_email));
  v_email_hash := encode(digest(v_email_clean || v_server_salt, 'sha256'), 'hex');

  -- 3. Fetch latest unconsumed OTP record for caller
  SELECT *
  INTO v_otp_rec
  FROM public.college_email_otps
  WHERE user_id = v_user_id AND consumed = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_rec IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OTP_NOT_FOUND',
      'message', 'No active verification code found. Please request a new one.'
    );
  END IF;

  -- 4. Check email identity hash match
  IF v_otp_rec.email_identity_hash <> v_email_hash THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EMAIL_MISMATCH',
      'message', 'The email address does not match the requested verification code.'
    );
  END IF;

  -- 5. Check lockout / attempt bounding
  IF v_otp_rec.attempts >= v_otp_rec.max_attempts THEN
    UPDATE public.college_email_otps
    SET consumed = true
    WHERE id = v_otp_rec.id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'TOO_MANY_ATTEMPTS',
      'message', 'Too many incorrect attempts. Please request a new verification code.'
    );
  END IF;

  -- 6. Check expiration
  IF v_now > v_otp_rec.expires_at THEN
    UPDATE public.college_email_otps
    SET consumed = true
    WHERE id = v_otp_rec.id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'OTP_EXPIRED',
      'message', 'That code has expired. Request a new one.'
    );
  END IF;

  -- 7. Validate OTP Hash
  IF v_otp_rec.otp_hash <> p_otp_hash THEN
    UPDATE public.college_email_otps
    SET attempts = attempts + 1
    WHERE id = v_otp_rec.id;

    IF (v_otp_rec.attempts + 1) >= v_otp_rec.max_attempts THEN
      UPDATE public.college_email_otps
      SET consumed = true
      WHERE id = v_otp_rec.id;

      RETURN jsonb_build_object(
        'success', false,
        'error', 'TOO_MANY_ATTEMPTS',
        'message', 'Too many incorrect attempts. Please request a new verification code.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'WRONG_OTP',
      'message', 'That code is incorrect.'
    );
  END IF;

  -- OTP IS VALID! Mark consumed immediately
  UPDATE public.college_email_otps
  SET consumed = true
  WHERE id = v_otp_rec.id;

  -- 8. Check 1-to-1 uniqueness across accounts
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_email_hash AND active = true
  LIMIT 1;

  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'COLLEGE_EMAIL_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- Handle same-user re-verification gracefully
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET
      college_identity_linked = true,
      verification_method = 'college_email',
      verified_at = v_now,
      updated_at = v_now
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_linked_to_self', true,
      'college_identity_id', v_existing_id,
      'verification_method', 'college_email',
      'verified_at', v_now
    );
  END IF;

  -- 9. Deactivate any prior active college identity for this user
  UPDATE public.college_identities
  SET active = false, unlinked_at = v_now
  WHERE user_id = v_user_id AND active = true;

  -- 10. Insert new verified college identity record
  -- Note: Raw email is NOT persisted; only deterministic salted hash
  BEGIN
    INSERT INTO public.college_identities (
      user_id,
      identity_hash,
      verification_method,
      qr_metadata,
      active
    )
    VALUES (
      v_user_id,
      v_email_hash,
      'college_email',
      jsonb_build_object(
        'method', 'college_email',
        'verified_at', v_now
      ),
      true
    )
    RETURNING id INTO v_new_identity_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COLLEGE_EMAIL_ALREADY_LINKED',
        'message', 'This college identity is already linked to another account.'
      );
  END;

  -- 11. Update caller's profile
  -- IMPORTANT: Name, department, and batch remain null/unset (never inferred from email)
  UPDATE public.profiles
  SET
    college_identity_linked = true,
    verification_method = 'college_email',
    verified_at = v_now,
    updated_at = v_now
  WHERE id = v_user_id;

  -- Signal active chat rooms that persona changed
  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'college_identity_id', v_new_identity_id,
    'verification_method', 'college_email',
    'verified_at', v_now
  );
END;
$$;

-- 6. Update verify_and_link_college_identity to track verification_method and verified_at
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
  v_method TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to link a college identity.'
    );
  END IF;

  -- 2. Validation Check: Ensure sufficient unique identity data exists
  IF p_student_ref IS NULL
     OR length(trim(p_student_ref)) < 3
     OR lower(trim(p_student_ref)) IN ('student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_IDENTITY_DATA',
      'message', 'The scanned ID does not contain sufficient unique identifier data to verify account uniqueness.'
    );
  END IF;

  -- 3. Server-side Cryptographic Fingerprinting
  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');

  -- Determine verification method from metadata
  v_method := COALESCE(p_qr_metadata->>'method', 'physical_id');

  -- 4. Check active identity ownership
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  -- Case A: SAME USER re-scans their already-linked identity
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET
      college_identity_linked = true,
      verification_method = v_method,
      verified_at = v_now,
      department = COALESCE(p_department, department),
      batch = COALESCE(p_batch, batch),
      updated_at = v_now
    WHERE id = v_user_id;

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

  -- Case B: DUPLICATE
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- 5. Optional Cooldown Architecture
  IF p_cooldown_hours > 0 THEN
    SELECT max(unlinked_at) INTO v_last_unlinked
    FROM public.college_identities
    WHERE identity_hash = v_identity_hash AND active = false AND user_id <> v_user_id;

    IF v_last_unlinked IS NOT NULL AND (v_now - v_last_unlinked) < (p_cooldown_hours || ' hours')::interval THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', 'This college identity was recently unlinked and cannot be re-linked yet. Please try again after the cooldown period expires.'
      );
    END IF;
  END IF;

  -- 6. Deactivate any prior active college identity for this user
  UPDATE public.college_identities
  SET active = false, unlinked_at = v_now
  WHERE user_id = v_user_id AND active = true;

  -- 7. Database Uniqueness & Race Condition Protection
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

  -- 8. Success: Update caller's profile
  UPDATE public.profiles
  SET
    college_identity_linked = true,
    verification_method = v_method,
    verified_at = v_now,
    department = COALESCE(p_department, department),
    batch = COALESCE(p_batch, batch),
    updated_at = v_now
  WHERE id = v_user_id;

  -- Signal active chat rooms that persona changed
  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'already_linked_to_self', false,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verification_method', v_method,
    'verified_at', v_now
  );
END;
$$;

-- 7. Update unlink_college_identity to clear verification_method and verified_at
CREATE OR REPLACE FUNCTION public.unlink_college_identity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_unlinked_count INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to unlink a college identity.'
    );
  END IF;

  -- 2. Deactivate active college identity record & record unlinked_at timestamp
  UPDATE public.college_identities
  SET active = false, unlinked_at = v_now
  WHERE user_id = v_user_id AND active = true;

  GET DIAGNOSTICS v_unlinked_count = ROW_COUNT;

  -- 3. Update profile to reflect unlinked status
  UPDATE public.profiles
  SET
    college_identity_linked = false,
    verification_method = NULL,
    verified_at = NULL,
    updated_at = v_now
  WHERE id = v_user_id;

  -- 4. Signal active chat rooms that persona changed to unverified Unknown User
  UPDATE public.chat_rooms
  SET persona_updated_at = v_now
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_records', v_unlinked_count,
    'unlinked_at', v_now
  );
END;
$$;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.request_college_email_otp(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_college_email_otp(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_college_identity() TO authenticated;
