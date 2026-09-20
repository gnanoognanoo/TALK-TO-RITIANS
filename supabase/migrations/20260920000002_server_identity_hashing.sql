-- ============================================================================
-- Migration: 20260920000002_server_identity_hashing.sql
-- Description: Server-side cryptographic identity fingerprinting and verification
--              linking procedure. Keeps hashing keys and salt strictly on the
--              server; no client-side secret exposure.
-- ============================================================================

-- Ensure pgcrypto is available for server-side cryptographic hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

/**
 * verify_and_link_college_identity
 *
 * Secure server-side RPC procedure called when a student scans their college ID.
 * Computes a salted SHA-256 fingerprint on the server, verifies 1-to-1 uniqueness,
 * records the college identity entry, and updates the profile status.
 */
CREATE OR REPLACE FUNCTION public.verify_and_link_college_identity(
  p_student_ref TEXT,
  p_name TEXT,
  p_department TEXT,
  p_batch TEXT,
  p_qr_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_identity_hash TEXT;
  v_existing_user UUID;
  v_new_identity_id UUID;
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
BEGIN
  -- 1. Verify caller authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to verify college identity.'
    );
  END IF;

  -- 2. Validate student reference
  IF p_student_ref IS NULL OR trim(p_student_ref) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STUDENT_REFERENCE',
      'message', 'Missing unique student reference in QR payload.'
    );
  END IF;

  -- 3. Derive deterministic cryptographic fingerprint strictly on the server
  -- Prevents client-side secret exposure or tampering
  v_identity_hash := encode(digest(trim(p_student_ref) || v_server_salt, 'sha256'), 'hex');

  -- 4. Enforce 1-to-1 Uniqueness: Verify card is not already claimed by another active user
  SELECT user_id INTO v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college ID card is already registered to another student account. An ID card can only be linked to one account at a time.'
    );
  END IF;

  -- 5. Deactivate any prior active college identity for this user
  UPDATE public.college_identities
  SET active = false, unlinked_at = now()
  WHERE user_id = v_user_id AND active = true;

  -- 6. Insert new verified college identity record
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

  -- 7. Update user profile to reflect verified college status
  UPDATE public.profiles
  SET
    college_identity_linked = true,
    department = COALESCE(p_department, department),
    batch = COALESCE(p_batch, batch),
    updated_at = now()
  WHERE id = v_user_id;

  -- 8. Return success payload with truncated fingerprint preview
  RETURN jsonb_build_object(
    'success', true,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verified_at', now()
  );
END;
$$;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
