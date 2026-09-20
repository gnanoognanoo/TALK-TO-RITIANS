-- ============================================================================
-- Migration: 20260920000003_college_identity_linking_and_unlinking.sql
-- Description: Core 1-to-1 College Identity Linking & Unlinking Architecture
--              Enforces: ONE COLLEGE IDENTITY = ONE PERSONAL ACCOUNT AT A TIME.
--              Guarantees concurrency safety against race conditions via
--              PostgreSQL partial unique index + exception handling.
--              Includes graceful same-user re-scan, non-leaking duplicate errors,
--              audit timestamp preservation, and configurable cooldown architecture.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

/**
 * verify_and_link_college_identity
 *
 * Atomically verifies and links a college identity to the caller's personal account.
 * Enforces 1-to-1 uniqueness, race condition protection, same-user re-scan tolerance,
 * and optional relink cooldowns.
 */
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
  -- 1. Security Check: Caller must be authenticated via Supabase session
  -- Never trust a user_id parameter supplied by the frontend
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to link a college identity.'
    );
  END IF;

  -- 2. Validation Check: Ensure sufficient unique identity data exists
  -- If unique data is lacking, DO NOT pretend uniqueness is guaranteed.
  IF p_student_ref IS NULL
     OR length(trim(p_student_ref)) < 3
     OR lower(trim(p_student_ref)) IN ('student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_IDENTITY_DATA',
      'message', 'The scanned QR code does not contain sufficient unique identifier data (such as a student roll number or registration ID) to verify account uniqueness.'
    );
  END IF;

  -- 3. Server-side Cryptographic Fingerprinting
  -- Generated strictly on the server with salted SHA-256
  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');

  -- 4. Check active identity ownership
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  -- Case A: SAME USER re-scans their already-linked identity
  -- Handle gracefully without error
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET college_identity_linked = true, updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_linked_to_self', true,
      'message', 'This college identity is already linked to your account.',
      'college_identity_id', v_existing_id,
      'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
      'verified_at', now()
    );
  END IF;

  -- Case B: DUPLICATE — Identity is currently active on another personal account
  -- STRICT PRIVACY RULE: Do NOT reveal other account email, other username, or person's data!
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- 5. Optional Cooldown Architecture
  -- If configured (p_cooldown_hours > 0), verify cooldown has elapsed since last unlink
  IF p_cooldown_hours > 0 THEN
    SELECT max(unlinked_at) INTO v_last_unlinked
    FROM public.college_identities
    WHERE identity_hash = v_identity_hash AND active = false AND user_id <> v_user_id;

    IF v_last_unlinked IS NOT NULL AND (now() - v_last_unlinked) < (p_cooldown_hours || ' hours')::interval THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', 'This college identity was recently unlinked and cannot be re-linked yet. Please try again after the cooldown period expires.'
      );
    END IF;
  END IF;

  -- 6. Deactivate any prior active college identity for this user
  UPDATE public.college_identities
  SET active = false, unlinked_at = now()
  WHERE user_id = v_user_id AND active = true;

  -- 7. Database Uniqueness & Race Condition Protection
  -- Wraps insert in exception block to catch SQLSTATE '23505' (unique_violation)
  -- if two concurrent transactions attempt simultaneous insertion.
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

  -- 8. Success: Update caller's profile
  UPDATE public.profiles
  SET
    college_identity_linked = true,
    department = COALESCE(p_department, department),
    batch = COALESCE(p_batch, batch),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_linked_to_self', false,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verified_at', now()
  );
END;
$$;

/**
 * unlink_college_identity
 *
 * Secure server-side unlink operation.
 * Deactivates caller's active college identity, preserves audit timestamps,
 * and sets profiles.college_identity_linked = false.
 */
CREATE OR REPLACE FUNCTION public.unlink_college_identity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_unlinked_count INTEGER;
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
  -- Preserves verified_at, created_at, unlinked_at for audit integrity
  UPDATE public.college_identities
  SET active = false, unlinked_at = now()
  WHERE user_id = v_user_id AND active = true;

  GET DIAGNOSTICS v_unlinked_count = ROW_COUNT;

  -- 3. Update profile to reflect unlinked status
  UPDATE public.profiles
  SET college_identity_linked = false, updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_records', v_unlinked_count,
    'unlinked_at', now()
  );
END;
$$;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_college_identity() TO authenticated;
