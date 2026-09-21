-- ============================================================================
-- Migration: 20260921000003_profile_setup.sql
-- Description: Server-side procedure to validate and save private student profile
--              metadata, and mark onboarding as complete (profile_completed = true).
--
-- Enforces:
-- 1. Authenticated caller session via auth.uid()
-- 2. College verification prerequisite (college_identity_linked = true)
-- 3. Anonymous handle prerequisite (display_username chosen, not default placeholder)
-- 4. Strict field validation (realistic graduation year 2024-2035, section format, batch format)
-- 5. Atomic setting of profile_completed = true upon validation
-- ============================================================================

/**
 * save_profile_data
 *
 * Saves verified student academic and demographic cohort metadata to public.profiles.
 * These attributes are strictly private and protected by RLS (auth.uid() = id).
 * Strangers can never query this data.
 */
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
  v_is_verified BOOLEAN;
  v_username TEXT;
  v_trimmed_dept TEXT;
  v_trimmed_sec TEXT;
  v_trimmed_class TEXT;
  v_trimmed_batch TEXT;
  v_trimmed_gender TEXT;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to complete your campus profile.'
    );
  END IF;

  -- 2. Verification Gate: User must have verified college ID linked
  SELECT college_identity_linked, display_username
  INTO v_is_verified, v_username
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before completing your profile.'
    );
  END IF;

  -- 3. Username Prerequisite Gate: Must have chosen an anonymous alias
  IF v_username IS NULL OR v_username = '' OR v_username LIKE 'Unknown User%' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USERNAME_REQUIRED',
      'message', 'You must select an anonymous username before completing your profile.'
    );
  END IF;

  -- 4. Trim and Sanitize Inputs
  v_trimmed_dept := trim(p_department);
  v_trimmed_sec := upper(trim(p_section));
  v_trimmed_class := trim(p_class_name);
  v_trimmed_batch := trim(p_batch);
  v_trimmed_gender := trim(p_gender);

  -- 5. Field Validations
  -- 5a. Department
  IF v_trimmed_dept IS NULL OR length(v_trimmed_dept) < 2 OR length(v_trimmed_dept) > 80 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_DEPARTMENT',
      'message', 'A valid academic department is required.'
    );
  END IF;

  -- 5b. Section format (1-3 alphanumeric characters)
  IF v_trimmed_sec IS NULL OR NOT (v_trimmed_sec ~ '^[A-Z0-9]{1,3}$') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_SECTION',
      'message', 'Section must be 1 to 3 alphanumeric characters (e.g. A, B, C).'
    );
  END IF;

  -- 5c. Class / Academic Year
  IF v_trimmed_class IS NULL OR length(v_trimmed_class) < 2 OR length(v_trimmed_class) > 40 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CLASS',
      'message', 'Academic class level is required.'
    );
  END IF;

  -- 5d. Batch format (YYYY-YYYY)
  IF v_trimmed_batch IS NULL OR NOT (v_trimmed_batch ~ '^\d{4}-\d{4}$') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_BATCH',
      'message', 'Academic batch must follow YYYY-YYYY format (e.g. 2023-2027).'
    );
  END IF;

  -- 5e. Realistic Graduation Year (between 2024 and 2035)
  IF p_graduation_year IS NULL OR p_graduation_year < 2024 OR p_graduation_year > 2035 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_GRADUATION_YEAR',
      'message', 'Expected graduation year must be realistic (between 2024 and 2035).'
    );
  END IF;

  -- 5f. Gender
  IF v_trimmed_gender IS NULL OR length(v_trimmed_gender) < 2 OR length(v_trimmed_gender) > 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_GENDER',
      'message', 'Gender selection is required.'
    );
  END IF;

  -- 6. Persistence & Profile Onboarding Finalization
  UPDATE public.profiles
  SET
    department = v_trimmed_dept,
    section = v_trimmed_sec,
    class_name = v_trimmed_class,
    batch = v_trimmed_batch,
    graduation_year = p_graduation_year,
    gender = v_trimmed_gender,
    profile_completed = true,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_completed', true,
    'department', v_trimmed_dept,
    'section', v_trimmed_sec,
    'batch', v_trimmed_batch,
    'graduation_year', p_graduation_year
  );
END;
$$;
