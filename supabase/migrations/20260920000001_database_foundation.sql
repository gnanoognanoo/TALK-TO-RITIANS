-- ============================================================================
-- Migration: 20260920000001_database_foundation.sql
-- Description: Core database foundation for Talk to RITians
-- Author: Person B (Database / Supabase Architecture)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Reusable Timestamp Function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Profiles Table (Private User Metadata)
-- ============================================================================
-- Stores individual student profile details.
-- CRITICAL PRIVACY: Under Row Level Security, only the owning user can access
-- or mutate these private attributes. Strangers can NEVER query this table.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_username TEXT,
  avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_completed BOOLEAN NOT NULL DEFAULT false,
  college_identity_linked BOOLEAN NOT NULL DEFAULT false,
  department TEXT,
  section TEXT,
  class_name TEXT,
  batch TEXT,
  graduation_year INTEGER,
  gender TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 3. Anonymous Identities Table (Public Persona Partition)
-- ============================================================================
-- Separate table containing ONLY the public pseudonym and visual avatar.
-- The public chat and matchmaking systems query exclusively from this table.
CREATE TABLE IF NOT EXISTS public.anonymous_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_username TEXT NOT NULL,
  avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_anonymous_identities_user_id UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_anonymous_identities_username ON public.anonymous_identities (anonymous_username);

-- Trigger to maintain updated_at on anonymous_identities
DROP TRIGGER IF EXISTS trigger_anonymous_identities_updated_at ON public.anonymous_identities;
CREATE TRIGGER trigger_anonymous_identities_updated_at
  BEFORE UPDATE ON public.anonymous_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 4. College Identities Table (Physical Card Verification Partition)
-- ============================================================================
-- Contains verified physical student card attributes.
-- INVARIANT: identity_hash is unique while active. A physical college ID cannot
-- simultaneously belong to more than one personal student account.
CREATE TABLE IF NOT EXISTS public.college_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  name_from_qr TEXT,
  department_from_qr TEXT,
  batch_from_qr TEXT,
  qr_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlinked_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Enforce 1-to-1 uniqueness of active identity hash across all accounts
CREATE UNIQUE INDEX IF NOT EXISTS idx_college_identities_active_hash
  ON public.college_identities (identity_hash)
  WHERE active = true;

-- Enforce that a user cannot have multiple active college identities
CREATE UNIQUE INDEX IF NOT EXISTS idx_college_identities_active_user
  ON public.college_identities (user_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_college_identities_user_id
  ON public.college_identities (user_id);

-- ============================================================================
-- 5. Synchronization Triggers
-- ============================================================================

-- Automatically provision an empty profiles row when a new user registers in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Automatically synchronize anonymous_identities when profile display_username is saved
CREATE OR REPLACE FUNCTION public.sync_anonymous_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_username IS NOT NULL AND TRIM(NEW.display_username) != '' THEN
    INSERT INTO public.anonymous_identities (user_id, anonymous_username, avatar_config, updated_at)
    VALUES (NEW.id, NEW.display_username, NEW.avatar_config, now())
    ON CONFLICT (user_id) DO UPDATE
    SET anonymous_username = EXCLUDED.anonymous_username,
        avatar_config = EXCLUDED.avatar_config,
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_anonymous_identity ON public.profiles;
CREATE TRIGGER trigger_sync_anonymous_identity
  AFTER INSERT OR UPDATE OF display_username, avatar_config ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_anonymous_identity();

-- ============================================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_identities ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Policies for: profiles
-- Users can only view, create, update, or delete their OWN profile.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Policies for: college_identities
-- Users can only view, insert, or update their OWN college verification record.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "college_identities_select_own" ON public.college_identities;
CREATE POLICY "college_identities_select_own"
  ON public.college_identities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "college_identities_insert_own" ON public.college_identities;
CREATE POLICY "college_identities_insert_own"
  ON public.college_identities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "college_identities_update_own" ON public.college_identities;
CREATE POLICY "college_identities_update_own"
  ON public.college_identities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Policies for: anonymous_identities
-- Authenticated users can view all anonymous identities (needed for chat peer rendering).
-- Users can manage only their OWN anonymous identity.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "anonymous_identities_select_all" ON public.anonymous_identities;
CREATE POLICY "anonymous_identities_select_all"
  ON public.anonymous_identities
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anonymous_identities_manage_own" ON public.anonymous_identities;
CREATE POLICY "anonymous_identities_manage_own"
  ON public.anonymous_identities
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 7. Public Sanitized View
-- ============================================================================
CREATE OR REPLACE VIEW public.public_anonymous_profiles AS
SELECT
  user_id,
  anonymous_username,
  avatar_config
FROM public.anonymous_identities;
