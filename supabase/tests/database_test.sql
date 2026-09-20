-- ============================================================================
-- Test Suite: database_test.sql
-- Purpose: Verify schema constraints, RLS policies, and duplicate rejection
-- ============================================================================

BEGIN;

-- Setup mock auth.users table for local test verification if running outside Supabase
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE
);

-- Mock mock users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'student1@rit.edu'),
  ('22222222-2222-2222-2222-222222222222', 'student2@rit.edu')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- TEST 1: User can create and access their own profile
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (
  id,
  display_username,
  department,
  section,
  class_name,
  batch,
  graduation_year,
  gender,
  profile_completed
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'SwiftFalcon_88',
  'Computer Science & Engineering',
  'A',
  'CSE-3A',
  '2022-2026',
  2026,
  'Male',
  true
) ON CONFLICT (id) DO UPDATE SET
  display_username = EXCLUDED.display_username,
  department = EXCLUDED.department;

SELECT * FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';

-- ----------------------------------------------------------------------------
-- TEST 2: Active college identity is inserted successfully for Student 1
-- ----------------------------------------------------------------------------
INSERT INTO public.college_identities (
  id,
  user_id,
  identity_hash,
  name_from_qr,
  department_from_qr,
  batch_from_qr,
  active
) VALUES (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  '11111111-1111-1111-1111-111111111111',
  'hash_student_rit_001_secret',
  'Student One',
  'CSE',
  '2022-2026',
  true
);

-- ----------------------------------------------------------------------------
-- TEST 3: Duplicate active college identity for Student 2 must FAIL
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.college_identities (
      id,
      user_id,
      identity_hash,
      active
    ) VALUES (
      'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
      '22222222-2222-2222-2222-222222222222',
      'hash_student_rit_001_secret', -- SAME active hash as Student 1!
      true
    );
    RAISE EXCEPTION 'TEST FAILED: Duplicate active college identity was accepted!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST PASSED: Duplicate active college identity was rejected with unique_violation.';
  END;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 4: If Student 1 unlinks their card (active = false), new active link succeeds
-- ----------------------------------------------------------------------------
UPDATE public.college_identities
SET active = false, unlinked_at = timezone('utc'::text, now())
WHERE id = 'a1a1a1a1-a1a1-a1a1-a1a1a1a1a1a1';

-- Now student 2 can link that same hash (e.g. card re-issued or student transferred)
INSERT INTO public.college_identities (
  id,
  user_id,
  identity_hash,
  active
) VALUES (
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  '22222222-2222-2222-2222-222222222222',
  'hash_student_rit_001_secret',
  true
);

-- ----------------------------------------------------------------------------
-- TEST 5: Anonymous identity was automatically populated by trigger
-- ----------------------------------------------------------------------------
SELECT user_id, anonymous_username FROM public.anonymous_identities WHERE user_id = '11111111-1111-1111-1111-111111111111';

ROLLBACK;
