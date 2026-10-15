-- ============================================================================
-- Migration: 20261014000001_enroll_additional_developers.sql
-- Description:
--   1. Authoritatively enroll designated developer accounts:
--      - gnanoognanoo@gmail.com (Primary / Lead)
--      - gmehaa8@gmail.com
--      - kowshikgandhi07@gmail.com
--      - sgnhesika@gmail.com
--   2. Ensure immediate developer enrollment in public.platform_staff for
--      already registered users.
--   3. Enable automatic developer enrollment on user signup via
--      public.handle_new_user() trigger on auth.users.
--   4. Update canonical staff verification RPCs with self-healing fallback:
--      - public.check_staff_status()
--      - public.is_platform_staff()
--      - public.get_staff_role()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: IMMEDIATE ENROLLMENT FOR EXISTING ACCOUNTS
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_staff (user_id, role, email, is_active, created_at)
SELECT
  u.id,
  'developer',
  lower(trim(u.email)),
  true,
  now()
FROM auth.users u
WHERE lower(trim(u.email)) IN (
  'gnanoognanoo@gmail.com',
  'gmehaa8@gmail.com',
  'kowshikgandhi07@gmail.com',
  'sgnhesika@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE SET
  role = 'developer',
  is_active = true,
  email = EXCLUDED.email;

-- Ensure profiles for developers are marked completed with Heisenberg persona fallback
UPDATE public.profiles p
SET
  profile_completed = true,
  display_username = CASE
    WHEN p.display_username IS NULL OR p.display_username ~ '^Unknown User \d+$'
    THEN 'Heisenberg'
    ELSE p.display_username
  END,
  updated_at = now()
WHERE p.id IN (
  SELECT u.id
  FROM auth.users u
  WHERE lower(trim(u.email)) IN (
    'gnanoognanoo@gmail.com',
    'gmehaa8@gmail.com',
    'kowshikgandhi07@gmail.com',
    'sgnhesika@gmail.com'
  )
);

-- ----------------------------------------------------------------------------
-- PART 2: AUTO-ENROLLMENT ON NEW USER SIGNUP (auth.users trigger function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Standard profile provisioning
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  -- Automatic Developer Account Enrollment
  IF lower(trim(NEW.email)) IN (
    'gnanoognanoo@gmail.com',
    'gmehaa8@gmail.com',
    'kowshikgandhi07@gmail.com',
    'sgnhesika@gmail.com'
  ) THEN
    INSERT INTO public.platform_staff (user_id, role, email, is_active)
    VALUES (NEW.id, 'developer', lower(trim(NEW.email)), true)
    ON CONFLICT (user_id) DO UPDATE SET
      is_active = true,
      role = 'developer',
      email = EXCLUDED.email;

    UPDATE public.profiles
    SET
      profile_completed = true,
      display_username = 'Heisenberg',
      updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- PART 3: CANONICAL STAFF VERIFICATION RPCS WITH SELF-HEALING FALLBACK
-- ----------------------------------------------------------------------------

-- 1. check_staff_status()
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
  END IF;

  -- Self-healing auto-enrollment for designated developer email list
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IN ('gnanoognanoo@gmail.com', 'gmehaa8@gmail.com', 'kowshikgandhi07@gmail.com', 'sgnhesika@gmail.com') THEN
    INSERT INTO public.platform_staff (user_id, role, email, is_active)
    VALUES (v_user_id, 'developer', v_email, true)
    ON CONFLICT (user_id) DO UPDATE SET
      is_active = true,
      role = 'developer',
      email = EXCLUDED.email;
    RETURN jsonb_build_object('is_staff', true, 'role', 'developer', 'email', v_email);
  END IF;

  RETURN jsonb_build_object('is_staff', false, 'role', NULL, 'email', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.check_staff_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_staff_status() TO authenticated;

-- 2. is_platform_staff()
CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = v_user_id AND role = 'developer' AND is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- Self-healing auto-enrollment for designated developer email list
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IN ('gnanoognanoo@gmail.com', 'gmehaa8@gmail.com', 'kowshikgandhi07@gmail.com', 'sgnhesika@gmail.com') THEN
    INSERT INTO public.platform_staff (user_id, role, email, is_active)
    VALUES (v_user_id, 'developer', v_email, true)
    ON CONFLICT (user_id) DO UPDATE SET
      is_active = true,
      role = 'developer',
      email = EXCLUDED.email;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;

-- 3. get_staff_role()
CREATE OR REPLACE FUNCTION public.get_staff_role()
RETURNS TEXT
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
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = v_user_id AND role = 'developer' AND is_active = true;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- Self-healing auto-enrollment for designated developer email list
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IN ('gnanoognanoo@gmail.com', 'gmehaa8@gmail.com', 'kowshikgandhi07@gmail.com', 'sgnhesika@gmail.com') THEN
    INSERT INTO public.platform_staff (user_id, role, email, is_active)
    VALUES (v_user_id, 'developer', v_email, true)
    ON CONFLICT (user_id) DO UPDATE SET
      is_active = true,
      role = 'developer',
      email = EXCLUDED.email;
    RETURN 'developer';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_role() TO authenticated;
