-- ============================================================================
-- Migration: 20261002000005_developer_console_security_hardening.sql
-- Description: Final security hardening for Developer & Admin Console:
--   1. Remove long-term email-based auto-enrollment trigger & function
--   2. Explicitly enroll designated staff UUIDs into public.platform_staff
--   3. Block staff self-enrollment/promotion via RLS (no client INSERT/UPDATE/DELETE)
--   4. Make public.admin_audit_log strictly server-write-only (drop client INSERT policy)
--   5. Internalize audit logging inside SECURITY DEFINER RPCs (actor = auth.uid())
--   6. Strict Role Separation:
--      - DEVELOPER: stats, online users, active rooms, invites, dev persona, test sessions
--      - ADMIN: private student profile inspection & moderation transcripts
--   7. Admin-only restriction on get_user_admin_details() -> returns ADMIN_REQUIRED for dev
--   8. Admin-only restriction on get_room_moderation_transcript() -> returns ADMIN_REQUIRED for dev
--   9. Server-controlled test_accounts table (prevents client self-flagging)
--  10. Zero-argument is_platform_staff() and get_staff_role() evaluating auth.uid() directly
--  11. Hardened SECURITY DEFINER search_path and execution privileges
--  12. Zero Raw Register Number Guarantee strictly preserved
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remove Long-Term Email-Based Staff Auto-Enrollment Trigger
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_enroll_staff_on_auth_user ON auth.users;
DROP FUNCTION IF EXISTS public.handle_staff_user_enrollment();

-- ----------------------------------------------------------------------------
-- 2. Explicit Staff Enrollment (UUID-based membership)
-- ----------------------------------------------------------------------------
-- Explicitly insert authorized accounts by real authenticated user UUID.
-- gnanoognanoo@gmail.com -> DEVELOPER
-- gnanoognano@gmail.com  -> ADMIN (Project Owner)
INSERT INTO public.platform_staff (user_id, role, email, is_active)
VALUES
  ('532274f3-7fd9-4206-b353-dcd36bababd5', 'developer', 'gnanoognanoo@gmail.com', true),
  ('6600327f-382b-4f13-9eac-3f8f69240595', 'admin', 'gnanoognano@gmail.com', true)
ON CONFLICT (user_id) DO UPDATE SET
  is_active = true,
  role = EXCLUDED.role;

-- ----------------------------------------------------------------------------
-- 3. Protect Against Staff Self-Enrollment / Privilege Escalation
-- ----------------------------------------------------------------------------
-- RLS on public.platform_staff: Only SELECT is permitted to clients.
-- Normal users and developers have NO client INSERT, UPDATE, or DELETE access.
DROP POLICY IF EXISTS platform_staff_select_self ON public.platform_staff;
DROP POLICY IF EXISTS platform_staff_select ON public.platform_staff;
DROP POLICY IF EXISTS platform_staff_insert ON public.platform_staff;
DROP POLICY IF EXISTS platform_staff_update ON public.platform_staff;
DROP POLICY IF EXISTS platform_staff_delete ON public.platform_staff;

CREATE POLICY platform_staff_select ON public.platform_staff
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.platform_staff ps
      WHERE ps.user_id = auth.uid() AND ps.is_active = true
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.platform_staff FROM authenticated, anon, public;
GRANT SELECT ON public.platform_staff TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Server-Controlled Test Accounts Table
-- ----------------------------------------------------------------------------
-- Test accounts cannot be self-assigned by users via client flags or profile fields.
CREATE TABLE IF NOT EXISTS public.test_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id)
);

ALTER TABLE public.test_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_accounts_select ON public.test_accounts;
CREATE POLICY test_accounts_select ON public.test_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.platform_staff ps
      WHERE ps.user_id = auth.uid() AND ps.is_active = true
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.test_accounts FROM authenticated, anon, public;
GRANT SELECT ON public.test_accounts TO authenticated;

-- Seed server-controlled test accounts from known mock accounts if present
INSERT INTO public.test_accounts (user_id, notes, is_active)
SELECT id, 'Designated Test Account', true
FROM auth.users
WHERE lower(email) LIKE '%test%' OR lower(email) LIKE '%pilot%' OR lower(email) LIKE 'student.%'
ON CONFLICT (user_id) DO NOTHING;

-- Helper to check test account or staff authorization
CREATE OR REPLACE FUNCTION public.is_test_account(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.test_accounts
    WHERE user_id = p_user_id AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = p_user_id AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_test_account(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_test_account(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Safe Client-Facing is_platform_staff() (Always evaluates auth.uid())
-- ----------------------------------------------------------------------------
-- Replaces parameterized client function to eliminate user-supplied UUID spoofing
DROP FUNCTION IF EXISTS public.is_platform_staff(UUID);

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = v_uid AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;

-- Safe Client-Facing get_staff_role() (Always evaluates auth.uid())
DROP FUNCTION IF EXISTS public.get_staff_role(UUID);

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
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_role() TO authenticated;

-- Private internal helper for procedures that need explicit target verification
CREATE OR REPLACE FUNCTION public._internal_is_platform_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = p_user_id AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public._internal_is_platform_staff(UUID) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Safe check_staff_status() (Evaluates auth.uid() server-side)
-- ----------------------------------------------------------------------------
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
  WHERE user_id = v_user_id AND is_active = true;

  IF v_role IS NOT NULL THEN
    RETURN jsonb_build_object('is_staff', true, 'role', v_role, 'email', v_email);
  ELSE
    RETURN jsonb_build_object('is_staff', false, 'role', NULL, 'email', NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_staff_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_staff_status() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Make public.admin_audit_log Strictly Server-Write-Only
-- ----------------------------------------------------------------------------
-- Drop direct client INSERT policy. Clients can NEVER directly insert audit records.
DROP POLICY IF EXISTS admin_audit_log_insert ON public.admin_audit_log;

REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated, anon, public;
GRANT SELECT ON public.admin_audit_log TO authenticated;

-- Internal audit logger: revokes client execution from authenticated/anon/public
REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, UUID, UUID, TEXT, JSONB) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id UUID;
  v_role TEXT;
  v_log_id UUID;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be signed in to log admin action.';
  END IF;

  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = v_actor_id AND is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'STAFF_UNAUTHORIZED: Caller is not active platform staff.';
  END IF;

  INSERT INTO public.admin_audit_log (
    actor_user_id,
    actor_role,
    action,
    target_user_id,
    room_id,
    reason,
    metadata,
    created_at
  )
  VALUES (
    v_actor_id,
    v_role,
    p_action,
    p_target_user_id,
    p_room_id,
    p_reason,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Update Storage Policies to use zero-arg is_platform_staff()
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS dev_avatars_insert ON storage.objects;
CREATE POLICY dev_avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'developer-avatars'
    AND public.is_platform_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS dev_avatars_update ON storage.objects;
CREATE POLICY dev_avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'developer-avatars'
    AND public.is_platform_staff()
    AND owner = auth.uid()
  );

DROP POLICY IF EXISTS dev_avatars_delete ON storage.objects;
CREATE POLICY dev_avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'developer-avatars'
    AND public.is_platform_staff()
    AND owner = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 9. Hardened Staff RPC: get_admin_dashboard_stats()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_online_users INT;
  v_users_chatting INT;
  v_users_idle INT;
  v_active_rooms INT;
  v_pending_requests INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT count(DISTINCT user_id) INTO v_online_users
  FROM public.user_presence
  WHERE is_online = true AND last_seen_at >= (v_now - interval '60 seconds');

  SELECT count(*) INTO v_active_rooms
  FROM public.chat_rooms
  WHERE status = 'active' AND (expires_at IS NULL OR expires_at > v_now);

  SELECT count(DISTINCT u) INTO v_users_chatting
  FROM (
    SELECT user_1 AS u FROM public.chat_rooms WHERE status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
    UNION
    SELECT user_2 AS u FROM public.chat_rooms WHERE status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
  ) q;

  v_users_idle := GREATEST(0, v_online_users - v_users_chatting);

  SELECT count(*) INTO v_pending_requests
  FROM public.chat_requests
  WHERE status = 'pending' AND expires_at > v_now;

  RETURN jsonb_build_object(
    'success', true,
    'online_users', v_online_users,
    'users_chatting', v_users_chatting,
    'users_idle', v_users_idle,
    'active_rooms', v_active_rooms,
    'pending_requests', v_pending_requests,
    'updated_at', v_now
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Hardened Staff RPC: get_online_users_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_users_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_users JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT jsonb_agg(user_data) INTO v_users
  FROM (
    SELECT
      up.user_id,
      COALESCE(ai.anonymous_username, p.display_username, 'Unknown User ' || lpad((abs(hashtext(up.user_id::text)) % 9000 + 1000)::text, 4, '0')) AS anonymous_username,
      COALESCE(ai.avatar_config, p.avatar_config, '{"theme":"indigo"}'::jsonb) AS avatar_config,
      COALESCE(p.college_identity_linked, false) AS is_verified_student,
      (ps.role IS NOT NULL) AS is_staff,
      ps.role AS staff_role,
      up.is_online,
      up.last_seen_at,
      up.current_page,
      CASE
        WHEN r.id IS NOT NULL THEN 'in_chat'
        WHEN mq.id IS NOT NULL THEN 'searching'
        WHEN cr.id IS NOT NULL THEN 'pending_request'
        WHEN up.is_online THEN 'idle'
        ELSE 'offline'
      END AS state,
      r.id AS current_room_id,
      (
        ps.role IS NOT NULL
        OR ta.user_id IS NOT NULL
      ) AS is_test_account
    FROM public.user_presence up
    JOIN auth.users u ON u.id = up.user_id
    LEFT JOIN public.profiles p ON p.id = up.user_id
    LEFT JOIN public.anonymous_identities ai ON ai.user_id = up.user_id
    LEFT JOIN public.platform_staff ps ON ps.user_id = up.user_id AND ps.is_active = true
    LEFT JOIN public.test_accounts ta ON ta.user_id = up.user_id AND ta.is_active = true
    LEFT JOIN public.chat_rooms r ON (r.user_1 = up.user_id OR r.user_2 = up.user_id) AND r.status = 'active' AND (r.expires_at IS NULL OR r.expires_at > v_now)
    LEFT JOIN public.matchmaking_queue mq ON mq.user_id = up.user_id AND mq.status = 'searching'
    LEFT JOIN public.chat_requests cr ON (cr.recipient_id = up.user_id OR cr.requester_id = up.user_id) AND cr.status = 'pending' AND cr.expires_at > v_now
    WHERE up.last_seen_at >= (v_now - interval '300 seconds') OR up.is_online = true
    ORDER BY up.is_online DESC, up.last_seen_at DESC
    LIMIT 100
  ) user_data;

  RETURN jsonb_build_object(
    'success', true,
    'users', COALESCE(v_users, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. ADMIN-ONLY RPC: get_user_admin_details()
-- ----------------------------------------------------------------------------
-- Strictly restricted to role = 'admin'.
-- DEVELOPER accounts receive ADMIN_REQUIRED error.
-- RAW REGISTER NUMBERS REMAIN STRICTLY UNSTORED AND UNRETURNED.
CREATE OR REPLACE FUNCTION public.get_user_admin_details(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_profile RECORD;
  v_presence RECORD;
  v_identity RECORD;
  v_masked_fingerprint TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = v_caller_id AND is_active = true;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  -- Strict Role Separation: ADMIN only!
  IF v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ADMIN_REQUIRED',
      'message', 'Admin role required to inspect private student credentials.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'A valid reason is required to inspect user profile details.'
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  SELECT * INTO v_presence FROM public.user_presence WHERE user_id = p_user_id;

  SELECT id, identity_hash, verification_method, created_at, active
  INTO v_identity
  FROM public.college_identities
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_identity.identity_hash IS NOT NULL THEN
    -- Expose ONLY safe masked fingerprint suffix (last 8 hex chars), NEVER raw register number!
    v_masked_fingerprint := '...' || substring(v_identity.identity_hash from 57 for 8);
  ELSE
    v_masked_fingerprint := NULL;
  END IF;

  -- Append audit log entry internally
  PERFORM public.log_admin_action(
    'VIEW_PRIVATE_PROFILE',
    p_user_id,
    NULL,
    trim(p_reason),
    jsonb_build_object('target_user_id', p_user_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'anonymous_username', COALESCE(v_profile.display_username, 'Unknown User'),
    'avatar_config', v_profile.avatar_config,
    'real_name', COALESCE(v_profile.full_name, v_profile.name),
    'department', v_profile.department,
    'batch', v_profile.batch,
    'gender', v_profile.gender,
    'is_verified', COALESCE(v_profile.college_identity_linked, false),
    'ever_verified', COALESCE(v_profile.ever_verified_identity, false),
    'verification_method', v_profile.verification_method,
    'verified_at', v_profile.verified_at,
    'identity_id', v_identity.id,
    'fingerprint_suffix', v_masked_fingerprint,
    'account_created_at', v_profile.created_at,
    'last_seen_at', v_presence.last_seen_at,
    'is_online', COALESCE(v_presence.is_online, false)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. ADMIN-ONLY RPC: get_room_moderation_transcript()
-- ----------------------------------------------------------------------------
-- Strictly restricted to role = 'admin'.
-- DEVELOPER accounts receive ADMIN_REQUIRED error.
-- Mandatory audited reason (>= 5 chars) enforced before message fetch.
CREATE OR REPLACE FUNCTION public.get_room_moderation_transcript(
  p_room_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_room_exists BOOLEAN;
  v_messages JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = v_caller_id AND is_active = true;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  -- Strict Role Separation: ADMIN only!
  IF v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ADMIN_REQUIRED',
      'message', 'Admin role required to access moderation transcripts.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'A mandatory operational/moderation reason (at least 5 characters) must be supplied.'
    );
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.chat_rooms WHERE id = p_room_id) INTO v_room_exists;
  IF NOT v_room_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- Append audit log entry BEFORE reading messages
  PERFORM public.log_admin_action(
    'OPEN_MODERATION_TRANSCRIPT',
    NULL,
    p_room_id,
    trim(p_reason),
    jsonb_build_object('room_id', p_room_id)
  );

  SELECT jsonb_agg(msg_data) INTO v_messages
  FROM (
    SELECT
      m.id,
      m.room_id,
      m.sender_id,
      COALESCE(ai.anonymous_username, p.display_username, 'Unknown User') AS sender_username,
      m.content,
      m.message_type,
      m.created_at
    FROM public.chat_messages m
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    LEFT JOIN public.anonymous_identities ai ON ai.user_id = m.sender_id
    WHERE m.room_id = p_room_id
    ORDER BY m.created_at ASC
  ) msg_data;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'messages', COALESCE(v_messages, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 13. Privacy-Minimized Active Rooms Dashboard for Staff
-- ----------------------------------------------------------------------------
-- Returns ONLY technical metadata and anonymous handles.
-- Real student credentials (name, dept, batch) are NEVER included.
CREATE OR REPLACE FUNCTION public.get_active_rooms_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rooms JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT jsonb_agg(room_data) INTO v_rooms
  FROM (
    SELECT
      r.id AS room_id,
      r.status,
      r.created_at,
      r.expires_at,
      GREATEST(0, EXTRACT(EPOCH FROM (r.expires_at - v_now))::int) AS remaining_seconds,
      r.user_1 AS participant_a_id,
      COALESCE(ai1.anonymous_username, p1.display_username, 'Unknown User A') AS participant_a_username,
      COALESCE(ai1.avatar_config, p1.avatar_config, '{"theme":"indigo"}'::jsonb) AS participant_a_avatar,
      r.user_2 AS participant_b_id,
      COALESCE(ai2.anonymous_username, p2.display_username, 'Unknown User B') AS participant_b_username,
      COALESCE(ai2.avatar_config, p2.avatar_config, '{"theme":"indigo"}'::jsonb) AS participant_b_avatar,
      (SELECT count(*) FROM public.chat_messages m WHERE m.room_id = r.id) AS message_count
    FROM public.chat_rooms r
    LEFT JOIN public.profiles p1 ON p1.id = r.user_1
    LEFT JOIN public.anonymous_identities ai1 ON ai1.user_id = r.user_1
    LEFT JOIN public.profiles p2 ON p2.id = r.user_2
    LEFT JOIN public.anonymous_identities ai2 ON ai2.user_id = r.user_2
    WHERE r.status = 'active' AND (r.expires_at IS NULL OR r.expires_at > v_now)
    ORDER BY r.created_at DESC
  ) room_data;

  RETURN jsonb_build_object(
    'success', true,
    'rooms', COALESCE(v_rooms, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 14. Hardened Room Details RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_admin_details(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_room RECORD;
  v_now TIMESTAMPTZ := now();
  v_msg_count INT;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  SELECT * INTO v_room FROM public.chat_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  SELECT count(*) INTO v_msg_count FROM public.chat_messages WHERE room_id = p_room_id;

  PERFORM public.log_admin_action(
    'OPEN_ROOM_METADATA',
    NULL,
    p_room_id,
    'Inspected room metadata',
    jsonb_build_object('room_id', p_room_id, 'status', v_room.status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room.id,
    'status', v_room.status,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'ended_at', v_room.ended_at,
    'end_reason', v_room.end_reason,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_room.expires_at - v_now))::int),
    'user_1', v_room.user_1,
    'user_2', v_room.user_2,
    'user_1_heartbeat_at', v_room.user_1_heartbeat_at,
    'user_2_heartbeat_at', v_room.user_2_heartbeat_at,
    'message_count', v_msg_count
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 15. Server-Authoritative create_test_session()
-- ----------------------------------------------------------------------------
-- Verifies caller and target using server-controlled test_accounts or platform_staff tables.
CREATE OR REPLACE FUNCTION public.create_test_session(
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_is_test BOOLEAN;
  v_target_is_test BOOLEAN;
  v_new_room_id UUID;
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + interval '7 minutes';
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  v_caller_is_test := public.is_test_account(v_caller_id);
  v_target_is_test := public.is_test_account(p_target_user_id);

  -- Strictly prohibit forced sessions against ordinary students!
  IF NOT (v_caller_is_test AND v_target_is_test) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TEST_SESSION_RESTRICTED',
      'message', 'Forced test sessions are strictly prohibited against ordinary students. Both accounts must be registered in test_accounts or platform_staff.'
    );
  END IF;

  -- Terminate any existing active rooms for both test users
  UPDATE public.chat_rooms
  SET status = 'ended', ended_at = v_now, end_reason = 'test_session_started'
  WHERE (user_1 IN (v_caller_id, p_target_user_id) OR user_2 IN (v_caller_id, p_target_user_id))
    AND status = 'active';

  -- Create fresh active room
  INSERT INTO public.chat_rooms (
    user_1,
    user_2,
    status,
    created_at,
    expires_at,
    user_1_heartbeat_at,
    user_2_heartbeat_at
  )
  VALUES (
    v_caller_id,
    p_target_user_id,
    'active',
    v_now,
    v_expires_at,
    v_now,
    v_now
  )
  RETURNING id INTO v_new_room_id;

  PERFORM public.log_admin_action(
    'CREATE_TEST_SESSION',
    p_target_user_id,
    v_new_room_id,
    'Initiated forced test session between test/dev accounts',
    jsonb_build_object('room_id', v_new_room_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_new_room_id,
    'created_at', v_now,
    'expires_at', v_expires_at
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 16. Hardened send_admin_chat_invite()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_admin_chat_invite(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_now TIMESTAMPTZ := now();
  v_new_req_id UUID;
  v_caller_username TEXT;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  v_caller_id := auth.uid();
  IF p_user_id = v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANNOT_INVITE_SELF');
  END IF;

  -- Check if caller or target are currently in an active room
  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = v_caller_id OR user_2 = v_caller_id)
      AND status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'CALLER_IN_ACTIVE_ROOM', 'message', 'You are already in an active room.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE (user_1 = p_user_id OR user_2 = p_user_id)
      AND status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'TARGET_IN_ACTIVE_ROOM', 'message', 'Target user is currently in a chat.');
  END IF;

  -- Cancel any old pending requests
  UPDATE public.chat_requests
  SET status = 'expired'
  WHERE (requester_id = v_caller_id AND recipient_id = p_user_id)
     OR (recipient_id = p_user_id AND status = 'pending' AND expires_at < v_now);

  -- Insert chat request with 30s expiration
  INSERT INTO public.chat_requests (
    requester_id,
    recipient_id,
    status,
    expires_at
  )
  VALUES (
    v_caller_id,
    p_user_id,
    'pending',
    v_now + interval '30 seconds'
  )
  RETURNING id INTO v_new_req_id;

  SELECT COALESCE(anonymous_username, 'Staff Member') INTO v_caller_username
  FROM public.anonymous_identities WHERE user_id = v_caller_id;

  PERFORM public.log_admin_action(
    'SEND_ADMIN_CHAT_INVITE',
    p_user_id,
    NULL,
    'Sent chat invite to user',
    jsonb_build_object('request_id', v_new_req_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_new_req_id,
    'recipient_id', p_user_id,
    'expires_at', v_now + interval '30 seconds'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 17. Hardened set_developer_persona()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_developer_persona(
  p_username TEXT,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_trimmed TEXT;
  v_avatar_config JSONB;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Only developer/admin accounts can set a custom developer persona.'
    );
  END IF;

  v_user_id := auth.uid();

  v_trimmed := trim(p_username);
  IF v_trimmed IS NULL OR length(v_trimmed) < 3 OR length(v_trimmed) > 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_LENGTH',
      'message', 'Developer username must be between 3 and 20 characters.'
    );
  END IF;

  -- Safe text handling: reject HTML (<, >), control characters
  IF v_trimmed ~ '[\x00-\x1F\x7F<>]' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CHARACTERS',
      'message', 'Username contains invalid or forbidden characters.'
    );
  END IF;

  -- Determine avatar config
  IF p_avatar_url IS NOT NULL AND length(trim(p_avatar_url)) > 0 THEN
    v_avatar_config := jsonb_build_object('type', 'gallery', 'url', trim(p_avatar_url));
  ELSE
    SELECT avatar_config INTO v_avatar_config FROM public.profiles WHERE id = v_user_id;
    IF v_avatar_config IS NULL THEN
      v_avatar_config := '{"type":"default","theme":"indigo"}'::jsonb;
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    display_username = v_trimmed,
    avatar_config = v_avatar_config,
    updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.anonymous_identities (user_id, anonymous_username, avatar_config, updated_at)
  VALUES (v_user_id, v_trimmed, v_avatar_config, now())
  ON CONFLICT (user_id) DO UPDATE
  SET anonymous_username = EXCLUDED.anonymous_username,
      avatar_config = EXCLUDED.avatar_config,
      updated_at = now();

  PERFORM public.log_admin_action(
    'SET_DEVELOPER_PERSONA',
    v_user_id,
    NULL,
    'Updated developer anonymous persona',
    jsonb_build_object('username', v_trimmed, 'has_avatar', (p_avatar_url IS NOT NULL))
  );

  RETURN jsonb_build_object(
    'success', true,
    'username', v_trimmed,
    'avatar_config', v_avatar_config
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 18. Hardened get_admin_audit_logs()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_audit_logs(
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_logs JSONB;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  v_caller_id := auth.uid();

  SELECT jsonb_agg(log_item) INTO v_logs
  FROM (
    SELECT
      l.id,
      l.actor_user_id,
      l.actor_role,
      l.action,
      l.target_user_id,
      l.room_id,
      l.reason,
      l.metadata,
      l.created_at,
      u.email AS actor_email
    FROM public.admin_audit_log l
    LEFT JOIN auth.users u ON u.id = l.actor_user_id
    ORDER BY l.created_at DESC
    LIMIT LEAST(p_limit, 200)
  ) log_item;

  RETURN jsonb_build_object(
    'success', true,
    'logs', COALESCE(v_logs, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 19. Hardened Permissions Matrix
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_admin_dashboard_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.get_online_users_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_online_users_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_admin_details(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_admin_details(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_active_rooms_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_active_rooms_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.get_room_admin_details(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_admin_details(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_room_moderation_transcript(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_moderation_transcript(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.send_admin_chat_invite(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.send_admin_chat_invite(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_test_session(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_test_session(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_developer_persona(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_developer_persona(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_audit_logs(INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_logs(INT) TO authenticated;

REVOKE ALL ON FUNCTION public.check_staff_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_staff_status() TO authenticated;
