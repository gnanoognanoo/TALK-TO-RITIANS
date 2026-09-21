-- ============================================================================
-- Migration: 20260921000004_matchmaking_and_chat_rooms.sql
-- Description: Database tables and atomic server-side procedures for random 1-to-1
--              campus matchmaking and anonymous chat rooms.
--
-- Tables:
-- 1. public.chat_rooms
-- 2. public.matchmaking_queue
--
-- RPC Functions:
-- 1. join_matchmaking()
-- 2. heartbeat_matchmaking()
-- 3. leave_matchmaking()
-- ============================================================================

-- ============================================================================
-- 1. Chat Rooms Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_1 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_2 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IN ('leave', 'skip', 'timeout', 'disconnect')),
  CONSTRAINT chk_different_users CHECK (user_1 <> user_2)
);

-- Index for participant room lookups
CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_1 ON public.chat_rooms (user_1);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_2 ON public.chat_rooms (user_2);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_active ON public.chat_rooms (status) WHERE status = 'active';

-- Enable Row Level Security
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- RLS: Room participants only can view their active or past rooms
DROP POLICY IF EXISTS chat_rooms_select_participants ON public.chat_rooms;
CREATE POLICY chat_rooms_select_participants ON public.chat_rooms
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_1 OR auth.uid() = user_2);

-- RLS: Room participants only can update room status (e.g. skip or leave)
DROP POLICY IF EXISTS chat_rooms_update_participants ON public.chat_rooms;
CREATE POLICY chat_rooms_update_participants ON public.chat_rooms
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_1 OR auth.uid() = user_2);

-- ============================================================================
-- 2. Matchmaking Queue Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'matched', 'cancelled', 'expired')),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_room_id UUID REFERENCES public.chat_rooms(id) ON DELETE SET NULL,
  matched_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Partial Unique Index: A user can have at most ONE active searching queue entry at a time
-- Enforces Multiple-Tab Safety at the PostgreSQL engine level
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchmaking_queue_active_user
  ON public.matchmaking_queue (user_id)
  WHERE status = 'searching';

-- Index for ordering queue by arrival
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_searching
  ON public.matchmaking_queue (status, joined_at ASC)
  WHERE status = 'searching';

-- Enable Row Level Security
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- RLS: Only the owning student can select their own queue record
DROP POLICY IF EXISTS matchmaking_queue_select_own ON public.matchmaking_queue;
CREATE POLICY matchmaking_queue_select_own ON public.matchmaking_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: Only the owning student can update their queue record
DROP POLICY IF EXISTS matchmaking_queue_update_own ON public.matchmaking_queue;
CREATE POLICY matchmaking_queue_update_own ON public.matchmaking_queue
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: Only the owning student can delete their queue record
DROP POLICY IF EXISTS matchmaking_queue_delete_own ON public.matchmaking_queue;
CREATE POLICY matchmaking_queue_delete_own ON public.matchmaking_queue
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. Stored Procedure: join_matchmaking()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_verified BOOLEAN;
  v_is_profile_completed BOOLEAN;
  v_has_active_room BOOLEAN;
  v_partner_queue_id UUID;
  v_partner_user_id UUID;
  v_my_queue_id UUID;
  v_new_room_id UUID;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to join matchmaking.'
    );
  END IF;

  -- 2. Eligibility Gate: Verified College ID & Completed Profile
  SELECT college_identity_linked, profile_completed
  INTO v_is_verified, v_is_profile_completed
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before entering campus matchmaking.'
    );
  END IF;

  IF v_is_profile_completed IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROFILE_INCOMPLETE',
      'message', 'You must complete your campus profile setup before joining matchmaking.'
    );
  END IF;

  -- 3. Active Room Gate: User must not already be in an active chat room
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE status = 'active'
      AND (user_1 = v_user_id OR user_2 = v_user_id)
  ) INTO v_has_active_room;

  IF v_has_active_room THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_IN_ACTIVE_ROOM',
      'message', 'You are already connected to an active chat room. Please leave that room before searching for a new match.'
    );
  END IF;

  -- 4. Stale Queue Cleanup: Expire entries where heartbeat is older than 25 seconds
  UPDATE public.matchmaking_queue
  SET status = 'expired'
  WHERE status = 'searching'
    AND heartbeat_at < now() - interval '25 seconds';

  -- 5. Multiple-Tab Safety: If user has an existing searching queue entry, reuse or reset it
  SELECT id INTO v_my_queue_id
  FROM public.matchmaking_queue
  WHERE user_id = v_user_id AND status = 'searching';

  IF v_my_queue_id IS NOT NULL THEN
    -- Update heartbeat
    UPDATE public.matchmaking_queue
    SET heartbeat_at = now()
    WHERE id = v_my_queue_id;
  ELSE
    -- Insert new searching queue entry
    INSERT INTO public.matchmaking_queue (user_id, joined_at, status, heartbeat_at)
    VALUES (v_user_id, now(), 'searching', now())
    RETURNING id INTO v_my_queue_id;
  END IF;

  -- 6. Atomic Server-Side Pairing via FOR UPDATE SKIP LOCKED
  -- Find the longest-waiting eligible partner who is not self and not in an active room
  SELECT q.id, q.user_id
  INTO v_partner_queue_id, v_partner_user_id
  FROM public.matchmaking_queue q
  WHERE q.status = 'searching'
    AND q.user_id <> v_user_id
    AND q.heartbeat_at >= now() - interval '25 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_rooms r
      WHERE r.status = 'active' AND (r.user_1 = q.user_id OR r.user_2 = q.user_id)
    )
  ORDER BY q.joined_at ASC
  LIMIT 1
  FOR UPDATE OF q SKIP LOCKED;

  -- 7. Match Resolution
  IF v_partner_queue_id IS NOT NULL THEN
    -- Candidate partner found: Create one chat room atomically
    INSERT INTO public.chat_rooms (user_1, user_2, status, created_at)
    VALUES (v_partner_user_id, v_user_id, 'active', now())
    RETURNING id INTO v_new_room_id;

    -- Update partner queue entry to matched
    UPDATE public.matchmaking_queue
    SET status = 'matched',
        matched_room_id = v_new_room_id,
        matched_user_id = v_user_id,
        heartbeat_at = now()
    WHERE id = v_partner_queue_id;

    -- Update current user queue entry to matched
    UPDATE public.matchmaking_queue
    SET status = 'matched',
        matched_room_id = v_new_room_id,
        matched_user_id = v_partner_user_id,
        heartbeat_at = now()
    WHERE id = v_my_queue_id;

    -- CRITICAL PRIVACY INVARIANT: Query ONLY anonymous_identities partition
    -- Zero personal email, roll number, department, section, batch, or gender returned!
    SELECT anonymous_username, avatar_config
    INTO v_partner_username, v_partner_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_partner_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_new_room_id,
      'queue_id', v_my_queue_id,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Anonymous Student'),
        'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
      )
    );
  END IF;

  -- 8. No partner available yet: User waits in queue
  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_my_queue_id
  );
END;
$$;

-- ============================================================================
-- 4. Stored Procedure: heartbeat_matchmaking()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.heartbeat_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_queue_id UUID;
  v_status TEXT;
  v_matched_room_id UUID;
  v_matched_user_id UUID;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Look for active queue entry
  SELECT id, status, matched_room_id, matched_user_id
  INTO v_queue_id, v_status, v_matched_room_id, v_matched_user_id
  FROM public.matchmaking_queue
  WHERE user_id = v_user_id
    AND status IN ('searching', 'matched')
  ORDER BY joined_at DESC
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'idle'
    );
  END IF;

  -- Update heartbeat timestamp
  UPDATE public.matchmaking_queue
  SET heartbeat_at = now()
  WHERE id = v_queue_id;

  -- If matched by another user's transaction, return match result
  IF v_status = 'matched' AND v_matched_room_id IS NOT NULL THEN
    -- CRITICAL PRIVACY INVARIANT: Query ONLY anonymous_identities partition
    SELECT anonymous_username, avatar_config
    INTO v_partner_username, v_partner_avatar
    FROM public.anonymous_identities
    WHERE user_id = v_matched_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Anonymous Student'),
        'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'queue_id', v_queue_id
  );
END;
$$;

-- ============================================================================
-- 5. Stored Procedure: leave_matchmaking()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.leave_matchmaking()
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

  -- Cancel all active searching entries for this user
  UPDATE public.matchmaking_queue
  SET status = 'cancelled', heartbeat_at = now()
  WHERE user_id = v_user_id AND status = 'searching';

  RETURN jsonb_build_object(
    'success', true,
    'status', 'cancelled'
  );
END;
$$;
