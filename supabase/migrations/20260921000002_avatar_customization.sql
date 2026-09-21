-- ============================================================================
-- Migration: 20260921000002_avatar_customization.sql
-- Description: Server-side procedure to validate and save student avatar_config.
--              Enforces:
--              1. Authenticated session via auth.uid()
--              2. College verification prerequisite (college_identity_linked = true)
--              3. JSON schema integrity (checks presence of mandatory vector keys)
--              4. Automatic synchronization to anonymous_identities partition
-- ============================================================================

/**
 * save_avatar_config
 *
 * Validates and saves an anonymous student's avatar configuration.
 * Automatically triggers synchronization to public.anonymous_identities.
 */
CREATE OR REPLACE FUNCTION public.save_avatar_config(
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_verified BOOLEAN;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to configure your avatar.'
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
      'message', 'You must verify your college ID before customizing your avatar.'
    );
  END IF;

  -- 3. Validation: Verify non-empty JSONB and essential vector keys
  IF p_config IS NULL OR jsonb_typeof(p_config) != 'object' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CONFIG',
      'message', 'Avatar configuration must be a valid JSON object.'
    );
  END IF;

  -- Ensure mandatory vector properties are present
  IF NOT (
    p_config ? 'face' AND
    p_config ? 'skin' AND
    p_config ? 'hair' AND
    p_config ? 'hairColor' AND
    p_config ? 'eyes' AND
    p_config ? 'eyebrows' AND
    p_config ? 'mouth' AND
    p_config ? 'shirt' AND
    p_config ? 'accessory' AND
    p_config ? 'background'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INCOMPLETE_CONFIG',
      'message', 'Avatar configuration is missing mandatory vector layers.'
    );
  END IF;

  -- 4. Persist to profiles
  -- The trigger `trigger_sync_anonymous_identity` will automatically synchronize `anonymous_identities`
  UPDATE public.profiles
  SET
    avatar_config = p_config,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'avatar_config', p_config,
    'updated_at', now()
  );
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.save_avatar_config(JSONB) TO authenticated;
