-- ============================================================================
-- Migration: 20260921000001_anonymous_username_selection.sql
-- Description: Server-side procedure to validate and save chosen anonymous alias.
--              Enforces:
--              1. Authentication via auth.uid()
--              2. College identity verification prerequisite (college_identity_linked = true)
--              3. Safe alias formatting (blocks HTML, script tags, control chars)
--              4. Automatic synchronization to anonymous_identities partition
-- ============================================================================

/**
 * save_anonymous_alias
 *
 * Saves a student's chosen anonymous handle once college identity is verified.
 * Guarantees that unverified users cannot finalize a custom alias.
 */
CREATE OR REPLACE FUNCTION public.save_anonymous_alias(
  p_alias TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_verified BOOLEAN;
  v_trimmed TEXT;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to select an anonymous username.'
    );
  END IF;

  -- 2. Verification Gate: User must have a verified college identity linked
  SELECT college_identity_linked INTO v_is_verified
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before selecting an anonymous username.'
    );
  END IF;

  -- 3. Validation & Sanitization: Ensure clean, injection-safe alias
  v_trimmed := trim(p_alias);

  IF v_trimmed IS NULL OR length(v_trimmed) < 3 OR length(v_trimmed) > 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_LENGTH',
      'message', 'Anonymous handle must be between 3 and 30 characters.'
    );
  END IF;

  -- Strict character set: Letters, numbers, and underscores only.
  -- Blocks HTML (<script>, <img>, <div>), SQL chars, and unicode control chars.
  IF v_trimmed !~ '^[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CHARACTERS',
      'message', 'Anonymous handle may only contain letters, numbers, and underscores. HTML, scripts, and special characters are forbidden.'
    );
  END IF;

  -- 4. Update display_username on profiles
  -- The trigger `trigger_sync_anonymous_identity` will automatically update `anonymous_identities`
  UPDATE public.profiles
  SET
    display_username = v_trimmed,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'alias', v_trimmed,
    'updated_at', now()
  );
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.save_anonymous_alias(TEXT) TO authenticated;
