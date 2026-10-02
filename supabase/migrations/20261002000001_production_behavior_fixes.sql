-- ============================================================================
-- Migration: 20261002000001_production_behavior_fixes.sql
-- Description: TALK TO RITIANS - Three Production Behavior Fixes
--              1. Effective Anonymous Persona: Unlinking college ID revokes
--                 BOTH custom alias AND custom avatar everywhere. Saved persona
--                 remains stored privately but is NEVER served while unverified.
--              2. Verified Identity Immutability & Gender Freeze:
--                 - Name, Department, Batch are permanently immutable after verification.
--                 - Gender is manually chosen once and permanently locked.
--                 - Server-side immutability triggers and RPC protection.
--              3. Random Incoming Chat Requests:
--                 - User presence tracking with heartbeat & page awareness.
--                 - Random online idle recipient selection without exposing user lists.
--                 - Chat requests table with 20-second TTL, RLS, Realtime publication.
--                 - Atomic Accept/Reject RPCs preserving the ONE USER = ONE ACTIVE ROOM
--                   and 7-minute expiration invariants.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PART 1 & 2: PROFILES TABLE UPDATES (Name, Full Name, Gender Lock)
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gender_locked_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill name & full_name from existing active college identities
UPDATE public.profiles p
SET
  name = COALESCE(p.name, ci.name_from_qr),
  full_name = COALESCE(p.full_name, ci.name_from_qr)
FROM public.college_identities ci
WHERE p.id = ci.user_id AND ci.active = true;

-- Backfill gender_locked_at for existing users who already selected a valid gender
UPDATE public.profiles
SET gender_locked_at = updated_at
WHERE gender IS NOT NULL AND trim(gender) != '' AND gender_locked_at IS NULL;

-- ============================================================================
-- SERVER-SIDE IMMUTABILITY TRIGGER ON PROFILES
-- ============================================================================
-- Prevents devtools / client updates from modifying verified identity fields
-- (name, full_name, department, batch) or changing a locked gender.
-- Only trusted verification procedures setting app.in_trusted_verification can
-- write verified identity attributes.
CREATE OR REPLACE FUNCTION public.protect_immutable_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- If executed from a trusted internal verification procedure, allow writing verified fields
  IF current_setting('app.in_trusted_verification', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- 1. Enforce immutability of verified student identity fields
  IF (OLD.college_identity_linked IS TRUE OR OLD.verified_at IS NOT NULL) THEN
    IF OLD.department IS NOT NULL AND NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION 'STUDENT_IDENTITY_IMMUTABLE: Department cannot be manually modified after verification.';
    END IF;
    IF OLD.batch IS NOT NULL AND NEW.batch IS DISTINCT FROM OLD.batch THEN
      RAISE EXCEPTION 'STUDENT_IDENTITY_IMMUTABLE: Batch cannot be manually modified after verification.';
    END IF;
    IF OLD.name IS NOT NULL AND NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'STUDENT_IDENTITY_IMMUTABLE: Name cannot be manually modified after verification.';
    END IF;
    IF OLD.full_name IS NOT NULL AND NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'STUDENT_IDENTITY_IMMUTABLE: Name cannot be manually modified after verification.';
    END IF;
  END IF;

  -- 2. Enforce Gender Freeze: Gender cannot be modified once set or confirmed
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

DROP TRIGGER IF EXISTS trigger_protect_immutable_profile_fields ON public.profiles;
CREATE TRIGGER trigger_protect_immutable_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_profile_fields();

-- ============================================================================
-- RPC: save_gender
-- ============================================================================
-- Allows choosing gender exactly ONCE, freezing it permanently thereafter.
CREATE OR REPLACE FUNCTION public.save_gender(
  p_gender TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_current_gender TEXT;
  v_gender_locked_at TIMESTAMPTZ;
  v_clean_gender TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED', 'message', 'You must be signed in.');
  END IF;

  v_clean_gender := trim(p_gender);
  IF v_clean_gender IS NULL OR v_clean_gender NOT IN ('Male', 'Female', 'Non-Binary', 'Prefer not to say') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_GENDER', 'message', 'Please select a valid gender option.');
  END IF;

  SELECT gender, gender_locked_at
  INTO v_current_gender, v_gender_locked_at
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_gender_locked_at IS NOT NULL OR (v_current_gender IS NOT NULL AND trim(v_current_gender) != '') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'GENDER_ALREADY_LOCKED',
      'message', 'Gender has already been chosen and cannot be modified.'
    );
  END IF;

  UPDATE public.profiles
  SET
    gender = v_clean_gender,
    gender_locked_at = now(),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_clean_gender,
    'gender_locked_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_gender(TEXT) TO authenticated;

-- ============================================================================
-- UPDATE: save_profile_data
-- ============================================================================
-- Ordinary client profile setup cannot overwrite verified identity fields or
-- change a frozen gender.
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
  v_is_linked BOOLEAN;
  v_current_dept TEXT;
  v_current_batch TEXT;
  v_current_gender TEXT;
  v_gender_locked_at TIMESTAMPTZ;
  v_target_dept TEXT;
  v_target_batch TEXT;
  v_target_gender TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Rate Limit Check: Max 10 profile updates per 60 seconds
  IF NOT public.check_rate_limit('profile_update', 60, 10) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Too many profile updates. Please wait a moment before saving again.'
    );
  END IF;

  SELECT college_identity_linked, department, batch, gender, gender_locked_at
  INTO v_is_linked, v_current_dept, v_current_batch, v_current_gender, v_gender_locked_at
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_linked IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before saving profile metadata.'
    );
  END IF;

  -- Institutional fields are immutable: retain verified department and batch
  v_target_dept := COALESCE(v_current_dept, trim(p_department));
  v_target_batch := COALESCE(v_current_batch, trim(p_batch));

  -- Gender handling: if locked, reject modification or retain locked value
  IF (v_gender_locked_at IS NOT NULL OR (v_current_gender IS NOT NULL AND trim(v_current_gender) != '')) THEN
    IF p_gender IS NOT NULL AND trim(p_gender) != '' AND trim(p_gender) IS DISTINCT FROM v_current_gender THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'GENDER_ALREADY_LOCKED',
        'message', 'Gender has already been chosen and cannot be modified.'
      );
    END IF;
    v_target_gender := v_current_gender;
  ELSE
    v_target_gender := trim(p_gender);
  END IF;

  UPDATE public.profiles
  SET
    department = v_target_dept,
    section = trim(p_section),
    class_name = trim(p_class_name),
    batch = v_target_batch,
    graduation_year = p_graduation_year,
    gender = v_target_gender,
    gender_locked_at = CASE WHEN (v_gender_locked_at IS NULL AND v_target_gender IS NOT NULL AND v_target_gender != '') THEN now() ELSE v_gender_locked_at END,
    profile_completed = true,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_completed', true,
    'updated_at', now()
  );
END;
$$;

-- ============================================================================
-- UPDATE: verify_and_link_college_identity
-- ============================================================================
-- Sets app.in_trusted_verification so trusted verification procedure can write
-- institutional fields. Saves name, full_name, department, batch.
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
    'already_linked_to_self', false,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verification_method', v_method,
    'verified_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;

-- ============================================================================
-- AUDIT & UPDATE: get_room_peer
-- ============================================================================
-- EFFECTIVE PERSONA RULE:
-- A custom anonymous persona is allowed ONLY when peer.college_identity_linked = true.
-- If false: deterministic 'Unknown User ####' + DEFAULT AVATAR.
-- Saved custom avatar must NEVER bypass the verification check.
CREATE OR REPLACE FUNCTION public.get_room_peer(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_peer_id UUID;
  v_peer_username TEXT;
  v_peer_avatar JSONB;
  v_peer_is_verified BOOLEAN;
  v_now TIMESTAMPTZ;
  v_default_avatar JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

  -- Look up room and verify caller is a participant
  SELECT id, user_1, user_2, status, created_at, expires_at, end_reason
  INTO v_room
  FROM public.chat_rooms
  WHERE id = p_room_id
    AND (user_1 = v_user_id OR user_2 = v_user_id);

  IF v_room IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_A_PARTICIPANT',
      'message', 'You do not have permission to inspect this room.'
    );
  END IF;

  -- If room is active but expires_at has passed, transition to ended with time_limit
  IF v_room.status = 'active' AND v_room.expires_at IS NOT NULL AND v_now >= v_room.expires_at THEN
    UPDATE public.chat_rooms
    SET status = 'ended', ended_at = v_now, end_reason = 'time_limit'
    WHERE id = p_room_id AND status = 'active';
    v_room.status := 'ended';
    v_room.end_reason := 'time_limit';
  END IF;

  -- Identify peer
  IF v_room.user_1 = v_user_id THEN
    v_peer_id := v_room.user_2;
  ELSE
    v_peer_id := v_room.user_1;
  END IF;

  -- Check peer verification state
  SELECT college_identity_linked INTO v_peer_is_verified
  FROM public.profiles
  WHERE id = v_peer_id;

  -- Authoritative persona derivation:
  -- ONLY verified students (college_identity_linked = true) are permitted to serve custom persona.
  -- Unverified students MUST ALWAYS receive deterministic Unknown User #### and default avatar.
  IF v_peer_is_verified IS TRUE THEN
    SELECT anonymous_username, avatar_config
    INTO v_peer_username, v_peer_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_peer_id;

    -- If no saved alias yet, use deterministic fallback
    IF v_peer_username IS NULL OR trim(v_peer_username) = '' THEN
      v_peer_username := 'Unknown User ' || lpad((abs(hashtext(v_peer_id::text)) % 9000 + 1000)::text, 4, '0');
    END IF;
    IF v_peer_avatar IS NULL OR v_peer_avatar = '{}'::jsonb THEN
      v_peer_avatar := v_default_avatar;
    END IF;
  ELSE
    v_peer_username := 'Unknown User ' || lpad((abs(hashtext(v_peer_id::text)) % 9000 + 1000)::text, 4, '0');
    v_peer_avatar := v_default_avatar;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'room_status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'end_reason', v_room.end_reason,
    'peer', jsonb_build_object(
      'anonymous_username', v_peer_username,
      'avatar_config', v_peer_avatar
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_room_peer(UUID) TO authenticated;

-- ============================================================================
-- PART 3: ONLINE PRESENCE INFRASTRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_online BOOLEAN NOT NULL DEFAULT true,
  available_for_chat_requests BOOLEAN NOT NULL DEFAULT true,
  current_page TEXT NOT NULL DEFAULT 'home',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_eligibility
ON public.user_presence (last_seen_at, is_online, available_for_chat_requests);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Privacy RLS: Users can only see and update their own presence record.
-- Direct queries listing all online users are strictly blocked.
DROP POLICY IF EXISTS user_presence_select_own ON public.user_presence;
CREATE POLICY user_presence_select_own ON public.user_presence
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_presence_insert_own ON public.user_presence;
CREATE POLICY user_presence_insert_own ON public.user_presence
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_presence_update_own ON public.user_presence;
CREATE POLICY user_presence_update_own ON public.user_presence
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_presence_delete_own ON public.user_presence;
CREATE POLICY user_presence_delete_own ON public.user_presence
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RPC: update_user_presence
CREATE OR REPLACE FUNCTION public.update_user_presence(
  p_is_online BOOLEAN DEFAULT true,
  p_available BOOLEAN DEFAULT true,
  p_current_page TEXT DEFAULT 'home'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();

  INSERT INTO public.user_presence (user_id, last_seen_at, is_online, available_for_chat_requests, current_page, updated_at)
  VALUES (v_user_id, v_now, p_is_online, p_available, COALESCE(p_current_page, 'home'), v_now)
  ON CONFLICT (user_id) DO UPDATE
  SET
    last_seen_at = v_now,
    is_online = EXCLUDED.is_online,
    available_for_chat_requests = EXCLUDED.available_for_chat_requests,
    current_page = EXCLUDED.current_page,
    updated_at = v_now;

  RETURN jsonb_build_object('success', true, 'updated_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_presence(BOOLEAN, BOOLEAN, TEXT) TO authenticated;

-- ============================================================================
-- PART 3: CHAT REQUESTS & EXCLUSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')) DEFAULT 'pending',
  room_id UUID REFERENCES public.chat_rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '20 seconds'),
  responded_at TIMESTAMPTZ DEFAULT NULL
);

-- Ensure a user can only have ONE active pending request as requester
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_requests_requester_pending
ON public.chat_requests (requester_id)
WHERE status = 'pending';

-- Ensure a user can only have ONE active pending request as recipient
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_requests_recipient_pending
ON public.chat_requests (recipient_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_chat_requests_recipient_status
ON public.chat_requests (recipient_id, status);

CREATE INDEX IF NOT EXISTS idx_chat_requests_requester_status
ON public.chat_requests (requester_id, status);

ALTER TABLE public.chat_requests ENABLE ROW LEVEL SECURITY;

-- Privacy RLS: Users can only see chat requests where they are requester or recipient
DROP POLICY IF EXISTS chat_requests_select_party ON public.chat_requests;
CREATE POLICY chat_requests_select_party ON public.chat_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Publication for Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_requests;
  END IF;
END $$;

-- Temporary exclusions to avoid repeatedly requesting the same recipient
CREATE TABLE IF NOT EXISTS public.chat_request_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  UNIQUE (requester_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_request_exclusions_check
ON public.chat_request_exclusions (requester_id, recipient_id, expires_at);

ALTER TABLE public.chat_request_exclusions ENABLE ROW LEVEL SECURITY;

-- Add chat_request_id column to matchmaking_queue
ALTER TABLE public.matchmaking_queue
ADD COLUMN IF NOT EXISTS chat_request_id UUID REFERENCES public.chat_requests(id) ON DELETE SET NULL;

-- ============================================================================
-- RPC: get_pending_chat_request
-- ============================================================================
-- Recipient queries their incoming pending chat request.
-- Returns exclusively the requester's EFFECTIVE ANONYMOUS PERSONA.
-- Zero PII leakage (no real name, department, batch, gender, roll number, email).
CREATE OR REPLACE FUNCTION public.get_pending_chat_request()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
  v_requester_is_verified BOOLEAN;
  v_requester_alias TEXT;
  v_requester_avatar JSONB;
  v_default_avatar JSONB;
  v_now TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

  -- Expire past-due pending requests for this recipient
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE recipient_id = v_user_id AND status = 'pending' AND expires_at <= v_now;

  SELECT id, requester_id, recipient_id, status, created_at, expires_at
  INTO v_request
  FROM public.chat_requests
  WHERE recipient_id = v_user_id AND status = 'pending' AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'has_request', false);
  END IF;

  -- Resolve requester's EFFECTIVE anonymous persona
  SELECT college_identity_linked INTO v_requester_is_verified
  FROM public.profiles
  WHERE id = v_request.requester_id;

  IF v_requester_is_verified IS TRUE THEN
    SELECT anonymous_username, avatar_config
    INTO v_requester_alias, v_requester_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_request.requester_id;

    IF v_requester_alias IS NULL OR trim(v_requester_alias) = '' THEN
      v_requester_alias := 'Unknown User ' || lpad((abs(hashtext(v_request.requester_id::text)) % 9000 + 1000)::text, 4, '0');
    END IF;
    IF v_requester_avatar IS NULL OR v_requester_avatar = '{}'::jsonb THEN
      v_requester_avatar := v_default_avatar;
    END IF;
  ELSE
    v_requester_alias := 'Unknown User ' || lpad((abs(hashtext(v_request.requester_id::text)) % 9000 + 1000)::text, 4, '0');
    v_requester_avatar := v_default_avatar;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'has_request', true,
    'request_id', v_request.id,
    'created_at', v_request.created_at,
    'expires_at', v_request.expires_at,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_request.expires_at - v_now))::integer),
    'requester', jsonb_build_object(
      'anonymous_username', v_requester_alias,
      'avatar_config', v_requester_avatar
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_chat_request() TO authenticated;

-- ============================================================================
-- RPC: accept_chat_request
-- ============================================================================
-- Atomic transaction creating ONE 7-minute active chat room.
-- Strictly validates:
-- 1. Caller is recipient
-- 2. Request is pending & unexpired
-- 3. Invariant: NEITHER participant currently has an active chat room
-- 4. Returns room_id and peer persona
CREATE OR REPLACE FUNCTION public.accept_chat_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_req RECORD;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_room_id UUID;
  v_requester_is_verified BOOLEAN;
  v_requester_alias TEXT;
  v_requester_avatar JSONB;
  v_default_avatar JSONB;
  v_has_conflict BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

  -- Lock request row
  SELECT id, requester_id, recipient_id, status, expires_at
  INTO v_req
  FROM public.chat_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND', 'message', 'Chat request not found.');
  END IF;

  IF v_req.recipient_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'You cannot accept requests addressed to another user.');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_PENDING', 'message', 'This chat request is no longer pending.');
  END IF;

  IF v_req.expires_at <= v_now THEN
    UPDATE public.chat_requests SET status = 'expired' WHERE id = p_request_id;
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_EXPIRED', 'message', 'This chat request has expired.');
  END IF;

  -- ONE USER = ONE ACTIVE ROOM INVARIANT: Check requester
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active'
      AND (user_1 = v_req.requester_id OR user_2 = v_req.requester_id)
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ) INTO v_has_conflict;

  IF v_has_conflict THEN
    UPDATE public.chat_requests SET status = 'cancelled' WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUESTER_UNAVAILABLE',
      'message', 'The user who sent this request has already joined another chat session.'
    );
  END IF;

  -- ONE USER = ONE ACTIVE ROOM INVARIANT: Check recipient (caller)
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active'
      AND (user_1 = v_user_id OR user_2 = v_user_id)
      AND (expires_at > v_now OR (expires_at IS NULL AND created_at >= v_now - interval '7 minutes'))
  ) INTO v_has_conflict;

  IF v_has_conflict THEN
    UPDATE public.chat_requests SET status = 'cancelled' WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RECIPIENT_ALREADY_IN_ROOM',
      'message', 'You already have an active chat session.'
    );
  END IF;

  -- Atomically create the 7-minute active chat room
  v_expires_at := v_now + interval '7 minutes';

  INSERT INTO public.chat_rooms (user_1, user_2, status, created_at, expires_at, persona_updated_at)
  VALUES (v_req.requester_id, v_user_id, 'active', v_now, v_expires_at, v_now)
  RETURNING id INTO v_room_id;

  -- Update request to accepted
  UPDATE public.chat_requests
  SET status = 'accepted', room_id = v_room_id, responded_at = v_now
  WHERE id = p_request_id;

  -- Match requester's matchmaking queue entry
  UPDATE public.matchmaking_queue
  SET
    status = 'matched',
    matched_room_id = v_room_id,
    matched_user_id = v_user_id,
    heartbeat_at = v_now
  WHERE user_id = v_req.requester_id AND status = 'searching';

  -- Cancel any conflicting pending requests for both users
  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE id <> p_request_id
    AND status = 'pending'
    AND (
      requester_id IN (v_req.requester_id, v_user_id)
      OR recipient_id IN (v_req.requester_id, v_user_id)
    );

  -- Derive requester effective anonymous persona to return to recipient
  SELECT college_identity_linked INTO v_requester_is_verified
  FROM public.profiles
  WHERE id = v_req.requester_id;

  IF v_requester_is_verified IS TRUE THEN
    SELECT anonymous_username, avatar_config
    INTO v_requester_alias, v_requester_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_req.requester_id;

    IF v_requester_alias IS NULL OR trim(v_requester_alias) = '' THEN
      v_requester_alias := 'Unknown User ' || lpad((abs(hashtext(v_req.requester_id::text)) % 9000 + 1000)::text, 4, '0');
    END IF;
    IF v_requester_avatar IS NULL OR v_requester_avatar = '{}'::jsonb THEN
      v_requester_avatar := v_default_avatar;
    END IF;
  ELSE
    v_requester_alias := 'Unknown User ' || lpad((abs(hashtext(v_req.requester_id::text)) % 9000 + 1000)::text, 4, '0');
    v_requester_avatar := v_default_avatar;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'created_at', v_now,
    'expires_at', v_expires_at,
    'peer', jsonb_build_object(
      'anonymous_username', v_requester_alias,
      'avatar_config', v_requester_avatar
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_chat_request(UUID) TO authenticated;

-- ============================================================================
-- RPC: reject_chat_request
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_chat_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_requester_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  UPDATE public.chat_requests
  SET status = 'rejected', responded_at = now()
  WHERE id = p_request_id AND recipient_id = v_user_id AND status = 'pending'
  RETURNING requester_id INTO v_requester_id;

  IF v_requester_id IS NOT NULL THEN
    -- Exclude this recipient from being requested by requester for 5 minutes
    INSERT INTO public.chat_request_exclusions (requester_id, recipient_id, expires_at)
    VALUES (v_requester_id, v_user_id, now() + interval '5 minutes')
    ON CONFLICT (requester_id, recipient_id)
    DO UPDATE SET expires_at = now() + interval '5 minutes';

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_PENDING');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_chat_request(UUID) TO authenticated;

-- ============================================================================
-- RPC: cancel_chat_request
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_chat_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  UPDATE public.chat_requests
  SET status = 'cancelled'
  WHERE id = p_request_id AND requester_id = v_user_id AND status = 'pending';

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_chat_request(UUID) TO authenticated;

-- ============================================================================
-- UPDATE: join_matchmaking
-- ============================================================================
-- 1. Checks existing active room / recovers stale room.
-- 2. Priority 1: Match another user in queue searching.
-- 3. Priority 2: Look for an eligible online idle user in user_presence.
--    Randomly select ONE and send a pending chat request.
-- 4. If none found: continues in searching state.
CREATE OR REPLACE FUNCTION public.join_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_existing_room RECORD;
  v_partner_queue_id UUID;
  v_partner_user_id UUID;
  v_my_queue_id UUID;
  v_new_room_id UUID;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_partner_is_verified BOOLEAN;
  v_now TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_room_is_abandoned BOOLEAN;
  v_default_avatar JSONB;
  v_online_recipient_id UUID;
  v_new_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED', 'message', 'You must be signed in to join matchmaking.');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

  -- Ensure anonymous identity row exists
  INSERT INTO public.anonymous_identities (user_id, anonymous_username, avatar_config, updated_at)
  VALUES (
    v_user_id,
    'Unknown User ' || lpad((abs(hashtext(v_user_id::text)) % 9000 + 1000)::text, 4, '0'),
    v_default_avatar,
    v_now
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- 1. Check existing active room
  SELECT id, user_1, user_2, status, created_at, expires_at, user_1_heartbeat_at, user_2_heartbeat_at
  INTO v_existing_room
  FROM public.chat_rooms
  WHERE status = 'active' AND (user_1 = v_user_id OR user_2 = v_user_id)
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_existing_room.id IS NOT NULL THEN
    v_room_is_abandoned := (
      COALESCE(v_existing_room.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
      AND COALESCE(v_existing_room.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
    );

    IF (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
       OR (v_existing_room.created_at < v_now - interval '7 minutes')
       OR v_room_is_abandoned THEN
      UPDATE public.chat_rooms
      SET status = 'ended', ended_at = v_now,
          end_reason = CASE
            WHEN (v_existing_room.expires_at IS NOT NULL AND v_now >= v_existing_room.expires_at)
                 OR (v_existing_room.created_at < v_now - interval '7 minutes') THEN 'time_limit'
            ELSE 'timeout'
          END
      WHERE id = v_existing_room.id;
    ELSE
      v_partner_user_id := CASE WHEN v_existing_room.user_1 = v_user_id THEN v_existing_room.user_2 ELSE v_existing_room.user_1 END;
      SELECT college_identity_linked INTO v_partner_is_verified FROM public.profiles WHERE id = v_partner_user_id;

      IF v_partner_is_verified IS TRUE THEN
        SELECT anonymous_username, avatar_config INTO v_partner_username, v_partner_avatar FROM public.anonymous_identities WHERE user_id = v_partner_user_id;
        IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
          v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
        END IF;
        IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
          v_partner_avatar := v_default_avatar;
        END IF;
      ELSE
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
        v_partner_avatar := v_default_avatar;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'existing_room',
        'room_id', v_existing_room.id,
        'created_at', v_existing_room.created_at,
        'expires_at', v_existing_room.expires_at,
        'peer', jsonb_build_object(
          'anonymous_username', v_partner_username,
          'avatar_config', v_partner_avatar
        )
      );
    END IF;
  END IF;

  -- 2. Expire stale queue entries
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching' AND heartbeat_at < v_now - interval '25 seconds';

  -- Upsert caller into queue
  SELECT id INTO v_my_queue_id FROM public.matchmaking_queue WHERE user_id = v_user_id AND status = 'searching';
  IF v_my_queue_id IS NOT NULL THEN
    UPDATE public.matchmaking_queue SET heartbeat_at = v_now WHERE id = v_my_queue_id;
  ELSE
    INSERT INTO public.matchmaking_queue (user_id, joined_at, status, heartbeat_at)
    VALUES (v_user_id, v_now, 'searching', v_now)
    RETURNING id INTO v_my_queue_id;
  END IF;

  -- 3. PRIORITY 1: Match another user in queue currently searching
  SELECT q.id, q.user_id INTO v_partner_queue_id, v_partner_user_id
  FROM public.matchmaking_queue q
  WHERE q.status = 'searching'
    AND q.user_id != v_user_id
    AND q.heartbeat_at >= v_now - interval '25 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active' AND (r.user_1 = q.user_id OR r.user_2 = q.user_id)
        AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
        AND NOT (COALESCE(r.user_1_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds')
                 AND COALESCE(r.user_2_heartbeat_at, '1970-01-01'::timestamptz) < (v_now - interval '60 seconds'))
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner_queue_id IS NOT NULL THEN
    -- Cancel any pending request for caller
    UPDATE public.chat_requests SET status = 'cancelled' WHERE requester_id = v_user_id AND status = 'pending';

    v_expires_at := v_now + interval '7 minutes';
    INSERT INTO public.chat_rooms (user_1, user_2, status, created_at, expires_at, persona_updated_at)
    VALUES (v_partner_user_id, v_user_id, 'active', v_now, v_expires_at, v_now)
    RETURNING id INTO v_new_room_id;

    UPDATE public.matchmaking_queue SET status = 'matched', matched_room_id = v_new_room_id, matched_user_id = v_user_id, heartbeat_at = v_now WHERE id = v_partner_queue_id;
    UPDATE public.matchmaking_queue SET status = 'matched', matched_room_id = v_new_room_id, matched_user_id = v_partner_user_id, heartbeat_at = v_now WHERE id = v_my_queue_id;

    SELECT college_identity_linked INTO v_partner_is_verified FROM public.profiles WHERE id = v_partner_user_id;
    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config INTO v_partner_username, v_partner_avatar FROM public.anonymous_identities WHERE user_id = v_partner_user_id;
      IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
      END IF;
      IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
        v_partner_avatar := v_default_avatar;
      END IF;
    ELSE
      v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_partner_user_id::text)) % 9000 + 1000)::text, 4, '0');
      v_partner_avatar := v_default_avatar;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'created_at', v_now,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', v_partner_username,
        'avatar_config', v_partner_avatar
      )
    );
  END IF;

  -- 4. PRIORITY 2: Look for an eligible ONLINE IDLE user via random chat request
  -- Expire past pending requests for caller
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE requester_id = v_user_id AND status = 'pending' AND expires_at <= v_now;

  SELECT p.user_id INTO v_online_recipient_id
  FROM public.user_presence p
  WHERE p.user_id <> v_user_id
    AND p.is_online IS TRUE
    AND p.available_for_chat_requests IS TRUE
    AND p.last_seen_at >= v_now - interval '30 seconds'
    AND p.current_page NOT IN ('chat', 'verify')
    -- No active room
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active'
        AND (r.user_1 = p.user_id OR r.user_2 = p.user_id)
        AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
    )
    -- Not currently in searching queue
    AND NOT EXISTS (
      SELECT 1 FROM public.matchmaking_queue mq
      WHERE mq.user_id = p.user_id AND mq.status = 'searching'
    )
    -- Not already in another pending chat request
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_requests cr
      WHERE cr.status = 'pending'
        AND cr.expires_at > v_now
        AND (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
    )
    -- Not temporarily excluded for caller
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_request_exclusions cre
      WHERE cre.requester_id = v_user_id AND cre.recipient_id = p.user_id AND cre.expires_at > v_now
    )
  ORDER BY RANDOM()
  LIMIT 1;

  IF v_online_recipient_id IS NOT NULL THEN
    -- Cancel any previous pending request of caller
    UPDATE public.chat_requests
    SET status = 'cancelled'
    WHERE requester_id = v_user_id AND status = 'pending';

    -- Create new chat request with 20s TTL
    INSERT INTO public.chat_requests (
      requester_id,
      recipient_id,
      status,
      expires_at
    )
    VALUES (
      v_user_id,
      v_online_recipient_id,
      'pending',
      v_now + interval '20 seconds'
    )
    RETURNING id INTO v_new_request_id;

    UPDATE public.matchmaking_queue
    SET chat_request_id = v_new_request_id
    WHERE id = v_my_queue_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'searching',
      'queue_id', v_my_queue_id,
      'has_pending_request', true,
      'message', 'Waiting for a RITian to respond...'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_my_queue_id,
    'has_pending_request', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_matchmaking() TO authenticated;

-- ============================================================================
-- UPDATE: heartbeat_matchmaking
-- ============================================================================
-- Maintains presence, checks for matches, and handles chat request resolution.
CREATE OR REPLACE FUNCTION public.heartbeat_matchmaking(
  p_queue_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_matched_room_id UUID;
  v_matched_user_id UUID;
  v_chat_request_id UUID;
  v_created_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_partner_is_verified BOOLEAN;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
  v_default_avatar JSONB;
  v_now TIMESTAMPTZ;
  v_req_status TEXT;
  v_req_expires_at TIMESTAMPTZ;
  v_req_recipient_id UUID;
  v_req_room_id UUID;
  v_online_recipient_id UUID;
  v_new_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_now := now();
  v_default_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;

  -- Verify queue entry belongs to caller
  SELECT status, matched_room_id, matched_user_id, chat_request_id
  INTO v_status, v_matched_room_id, v_matched_user_id, v_chat_request_id
  FROM public.matchmaking_queue
  WHERE id = p_queue_id AND user_id = v_user_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'QUEUE_ENTRY_NOT_FOUND');
  END IF;

  -- Update heartbeat timestamp
  UPDATE public.matchmaking_queue
  SET heartbeat_at = v_now
  WHERE id = p_queue_id;

  -- 1. If already matched by another user or request acceptance
  IF v_status = 'matched' AND v_matched_room_id IS NOT NULL THEN
    SELECT created_at, expires_at
    INTO v_created_at, v_expires_at
    FROM public.chat_rooms
    WHERE id = v_matched_room_id;

    SELECT college_identity_linked INTO v_partner_is_verified
    FROM public.profiles
    WHERE id = v_matched_user_id;

    IF v_partner_is_verified IS TRUE THEN
      SELECT anonymous_username, avatar_config
      INTO v_partner_username, v_partner_avatar
      FROM public.anonymous_identities
      WHERE user_id = v_matched_user_id;

      IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_matched_user_id::text)) % 9000 + 1000)::text, 4, '0');
      END IF;
      IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
        v_partner_avatar := v_default_avatar;
      END IF;
    ELSE
      v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_matched_user_id::text)) % 9000 + 1000)::text, 4, '0');
      v_partner_avatar := v_default_avatar;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', v_partner_username,
        'avatar_config', v_partner_avatar
      )
    );
  END IF;

  -- 2. Check pending chat request status if one is attached to this queue entry
  IF v_chat_request_id IS NOT NULL THEN
    SELECT status, expires_at, recipient_id, room_id
    INTO v_req_status, v_req_expires_at, v_req_recipient_id, v_req_room_id
    FROM public.chat_requests
    WHERE id = v_chat_request_id;

    IF v_req_status = 'accepted' AND v_req_room_id IS NOT NULL THEN
      -- Accepted! Transition queue entry
      UPDATE public.matchmaking_queue
      SET status = 'matched', matched_room_id = v_req_room_id, matched_user_id = v_req_recipient_id
      WHERE id = p_queue_id;

      SELECT created_at, expires_at INTO v_created_at, v_expires_at
      FROM public.chat_rooms WHERE id = v_req_room_id;

      SELECT college_identity_linked INTO v_partner_is_verified
      FROM public.profiles WHERE id = v_req_recipient_id;

      IF v_partner_is_verified IS TRUE THEN
        SELECT anonymous_username, avatar_config INTO v_partner_username, v_partner_avatar
        FROM public.anonymous_identities WHERE user_id = v_req_recipient_id;

        IF v_partner_username IS NULL OR trim(v_partner_username) = '' THEN
          v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_req_recipient_id::text)) % 9000 + 1000)::text, 4, '0');
        END IF;
        IF v_partner_avatar IS NULL OR v_partner_avatar = '{}'::jsonb THEN
          v_partner_avatar := v_default_avatar;
        END IF;
      ELSE
        v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_req_recipient_id::text)) % 9000 + 1000)::text, 4, '0');
        v_partner_avatar := v_default_avatar;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'matched',
        'room_id', v_req_room_id,
        'created_at', v_created_at,
        'expires_at', v_expires_at,
        'peer', jsonb_build_object(
          'anonymous_username', v_partner_username,
          'avatar_config', v_partner_avatar
        )
      );
    ELSIF v_req_status IN ('rejected', 'cancelled') OR (v_req_status = 'pending' AND v_req_expires_at <= v_now) THEN
      -- Rejected or timed out: mark expired if still pending and detach from queue entry
      IF v_req_status = 'pending' THEN
        UPDATE public.chat_requests SET status = 'expired' WHERE id = v_chat_request_id;
        IF v_req_recipient_id IS NOT NULL THEN
          INSERT INTO public.chat_request_exclusions (requester_id, recipient_id, expires_at)
          VALUES (v_user_id, v_req_recipient_id, v_now + interval '5 minutes')
          ON CONFLICT (requester_id, recipient_id) DO UPDATE SET expires_at = v_now + interval '5 minutes';
        END IF;
      END IF;

      UPDATE public.matchmaking_queue SET chat_request_id = NULL WHERE id = p_queue_id;

      -- Attempt to find another eligible online idle user
      SELECT p.user_id INTO v_online_recipient_id
      FROM public.user_presence p
      WHERE p.user_id <> v_user_id
        AND p.is_online IS TRUE
        AND p.available_for_chat_requests IS TRUE
        AND p.last_seen_at >= v_now - interval '30 seconds'
        AND p.current_page NOT IN ('chat', 'verify')
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_rooms r
          WHERE r.status = 'active'
            AND (r.user_1 = p.user_id OR r.user_2 = p.user_id)
            AND (r.expires_at > v_now OR (r.expires_at IS NULL AND r.created_at >= v_now - interval '7 minutes'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.matchmaking_queue mq
          WHERE mq.user_id = p.user_id AND mq.status = 'searching'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_requests cr
          WHERE cr.status = 'pending' AND cr.expires_at > v_now
            AND (cr.recipient_id = p.user_id OR cr.requester_id = p.user_id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_request_exclusions cre
          WHERE cre.requester_id = v_user_id AND cre.recipient_id = p.user_id AND cre.expires_at > v_now
        )
      ORDER BY RANDOM()
      LIMIT 1;

      IF v_online_recipient_id IS NOT NULL THEN
        INSERT INTO public.chat_requests (requester_id, recipient_id, status, expires_at)
        VALUES (v_user_id, v_online_recipient_id, 'pending', v_now + interval '20 seconds')
        RETURNING id INTO v_new_request_id;

        UPDATE public.matchmaking_queue SET chat_request_id = v_new_request_id WHERE id = p_queue_id;

        RETURN jsonb_build_object(
          'success', true,
          'status', 'searching',
          'has_pending_request', true,
          'message', 'Looking for another RITian...'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'has_pending_request', (v_chat_request_id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_matchmaking(UUID) TO authenticated;
