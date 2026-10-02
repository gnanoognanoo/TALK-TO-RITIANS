-- ============================================================================
-- Migration: 20261002000003_persistent_verified_identity_immutability.sql
-- Description: Enforces permanent immutability of verified student identity fields
--              (name, full_name, department, batch) and frozen gender even after
--              unlinking college ID. Trusted physical ID re-verification remains
--              permitted to update authoritative fields.
-- ============================================================================

-- 1. Add persistent verified identity state columns to public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ever_verified_identity BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS first_verified_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Backfill ever_verified_identity & first_verified_at from historical verification records
UPDATE public.profiles p
SET
  ever_verified_identity = true,
  first_verified_at = COALESCE(p.first_verified_at, p.verified_at, ci.created_at, now())
FROM public.college_identities ci
WHERE p.id = ci.user_id;

UPDATE public.profiles
SET
  ever_verified_identity = true,
  first_verified_at = COALESCE(first_verified_at, verified_at, updated_at, now())
WHERE college_identity_linked = true OR verified_at IS NOT NULL;

-- 3. Replace trigger function protect_immutable_profile_fields
CREATE OR REPLACE FUNCTION public.protect_immutable_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- If executed from a trusted internal verification procedure, allow writing verified fields
  IF current_setting('app.in_trusted_verification', true) = 'true' THEN
    NEW.ever_verified_identity := true;
    IF NEW.first_verified_at IS NULL THEN
      NEW.first_verified_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- 1. Enforce immutability of verified student identity fields
  -- Even if unlinked (college_identity_linked = false), once verified, fields can never be client-modified
  IF (OLD.ever_verified_identity IS TRUE 
      OR OLD.first_verified_at IS NOT NULL 
      OR OLD.college_identity_linked IS TRUE 
      OR OLD.verified_at IS NOT NULL 
      OR EXISTS (SELECT 1 FROM public.college_identities ci WHERE ci.user_id = OLD.id)) THEN
    
    IF NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Department cannot be manually modified after verification.';
    END IF;
    IF NEW.batch IS DISTINCT FROM OLD.batch THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Batch cannot be manually modified after verification.';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Name cannot be manually modified after verification.';
    END IF;
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Name cannot be manually modified after verification.';
    END IF;
  END IF;

  -- 2. Enforce Gender Freeze: Gender cannot be modified once set or confirmed
  -- Unlinking must NOT unlock gender
  IF (OLD.gender_locked_at IS NOT NULL OR (OLD.gender IS NOT NULL AND trim(OLD.gender) != '')) THEN
    IF NEW.gender IS DISTINCT FROM OLD.gender THEN
      RAISE EXCEPTION 'GENDER_ALREADY_LOCKED: Gender cannot be modified once confirmed.';
    END IF;
  END IF;

  -- 3. If gender is being assigned for the first time, record timestamp
  IF (OLD.gender IS NULL OR trim(OLD.gender) = '') AND (NEW.gender IS NOT NULL AND trim(NEW.gender) != '') THEN
    NEW.gender_locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger is active
DROP TRIGGER IF EXISTS trigger_protect_immutable_profile_fields ON public.profiles;
CREATE TRIGGER trigger_protect_immutable_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_profile_fields();

-- Explicitly revoke execute on trigger function from client roles
REVOKE EXECUTE ON FUNCTION public.protect_immutable_profile_fields() FROM public, anon, authenticated;

-- 4. Update verify_and_link_college_identity to mark ever_verified_identity
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
  v_now TIMESTAMPTZ;
  v_method TEXT;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
BEGIN
  -- Mark execution context as trusted verification
  PERFORM set_config('app.in_trusted_verification', 'true', true);

  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to link a college identity.'
    );
  END IF;

  -- Rate-Limit Hardening: Max 10 verification attempts per 60 seconds
  IF NOT public.check_rate_limit('college_verification_attempt', 60, 10) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many verification attempts. Please wait a moment before trying again.'
    );
  END IF;

  -- 2. Validation Check
  IF p_student_ref IS NULL
     OR length(trim(p_student_ref)) < 3
     OR lower(trim(p_student_ref)) IN ('student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_IDENTITY_DATA',
      'message', 'The scanned QR code does not contain sufficient unique identifier data to verify account uniqueness.'
    );
  END IF;

  -- 3. Cryptographic Fingerprinting
  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');
  v_now := now();
  v_method := 'physical_id';

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
      ever_verified_identity = true,
      first_verified_at = COALESCE(first_verified_at, v_now),
      verification_method = v_method,
      verified_at = v_now,
      name = COALESCE(p_name, name),
      full_name = COALESCE(p_name, full_name),
      department = COALESCE(p_department, department),
      batch = COALESCE(p_batch, batch),
      updated_at = v_now
    WHERE id = v_user_id;

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

  -- Case B: DUPLICATE (claimed by another user)
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
    ever_verified_identity = true,
    first_verified_at = COALESCE(first_verified_at, v_now),
    verification_method = v_method,
    verified_at = v_now,
    name = COALESCE(p_name, name),
    full_name = COALESCE(p_name, full_name),
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
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verification_method', v_method,
    'verified_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;
