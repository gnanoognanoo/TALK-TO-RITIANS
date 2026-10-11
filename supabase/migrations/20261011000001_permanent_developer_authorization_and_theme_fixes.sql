-- ============================================================================
-- Migration: 20261011000001_permanent_developer_authorization_and_theme_fixes.sql
-- Description:
--   1. Fix PostgreSQL function ambiguity: Drop legacy get_staff_role(UUID)
--      overload that caused error 42725 on zero-arg RPC calls.
--   2. Ensure canonical zero-argument staff verification RPCs:
--      - public.get_staff_role()
--      - public.is_platform_staff()
--      - public.check_staff_status()
--   3. Authoritatively verify and ensure active 'developer' membership for
--      designated developer account: gnanoognanoo@gmail.com
--      (UUID: 532274f3-7fd9-4206-b353-dcd36bababd5).
--   4. Ensure developer display username is maintained as 'Heisenberg'.
--   5. Re-assert strict single-role privilege model ('developer' only; no 'admin').
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: ELIMINATE FUNCTION OVERLOAD AMBIGUITY
-- ----------------------------------------------------------------------------

-- Drop legacy overloaded version with default/explicit UUID parameter if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'get_staff_role'
      AND pronargs > 0
  ) THEN
    EXECUTE 'DROP FUNCTION IF EXISTS public.get_staff_role(UUID);';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PART 2: CANONICAL ZERO-ARGUMENT STAFF STATUS FUNCTIONS
-- ----------------------------------------------------------------------------

-- 1. is_platform_staff()
CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = auth.uid() AND role = 'developer' AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;

-- 2. get_staff_role()
CREATE OR REPLACE FUNCTION public.get_staff_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT role FROM public.platform_staff
    WHERE user_id = auth.uid() AND role = 'developer' AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_role() TO authenticated;

-- 3. check_staff_status()
CREATE OR REPLACE FUNCTION public.check_staff_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_staff', false, 'role', NULL, 'email', NULL);
  END IF;

  SELECT role, email INTO v_role, v_email
  FROM public.platform_staff
  WHERE user_id = v_user_id AND role = 'developer' AND is_active = true;

  IF v_role IS NOT NULL THEN
    RETURN jsonb_build_object('is_staff', true, 'role', 'developer', 'email', v_email);
  ELSE
    RETURN jsonb_build_object('is_staff', false, 'role', NULL, 'email', NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_staff_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_staff_status() TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 3: PERMANENT DEVELOPER ROLE CONFIRMATION FOR gnanoognanoo@gmail.com
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_dev_uuid CONSTANT UUID := '532274f3-7fd9-4206-b353-dcd36bababd5'::uuid;
  v_dev_email CONSTANT TEXT := 'gnanoognanoo@gmail.com';
  v_auth_exists BOOLEAN := false;
BEGIN
  -- Verify the exact auth account exists in production auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_dev_uuid AND email = v_dev_email
  ) INTO v_auth_exists;

  IF v_auth_exists THEN
    -- Ensure platform_staff membership is active developer
    INSERT INTO public.platform_staff (
      user_id,
      email,
      role,
      is_active,
      created_at
    )
    VALUES (
      v_dev_uuid,
      v_dev_email,
      'developer',
      true,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      email = EXCLUDED.email,
      role = 'developer',
      is_active = true;

    -- Ensure profile display username is 'Heisenberg' if it was reset to anonymous handle
    UPDATE public.profiles
    SET display_username = 'Heisenberg',
        updated_at = now()
    WHERE id = v_dev_uuid
      AND (display_username IS NULL OR display_username ~ '^Unknown User \d+$');

    RAISE NOTICE 'Permanent developer privileges confirmed for % (%)', v_dev_email, v_dev_uuid;
  ELSE
    RAISE WARNING 'Designated developer auth.users record not found during migration check';
  END IF;
END $$;
