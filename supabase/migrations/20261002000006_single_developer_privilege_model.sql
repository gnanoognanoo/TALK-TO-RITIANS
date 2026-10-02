-- ============================================================================
-- Migration: 20261002000006_single_developer_privilege_model.sql
-- Description: Consolidate Privileged Access into Single DEVELOPER Role &
--              Harden Test Account Security:
--   1. Remove obsolete 'admin' role entirely; constrain role to 'developer' only
--   2. Revoke staff privileges from previous admin account (6600327f-382b-4f13-9eac-3f8f69240595)
--   3. Retain designated developer (532274f3-7fd9-4206-b353-dcd36bababd5 / gnanoognanoo@gmail.com)
--   4. Purge email-pattern test accounts from public.test_accounts (explicit UUIDs only)
--   5. Keep public.is_test_account(UUID) server-internal (revoked from client roles)
--   6. Grant DEVELOPER role full access to:
--      - Private student profile inspection (with mandatory audited reason >= 3 chars)
--      - Chat moderation transcripts (with mandatory audited reason >= 5 chars)
--      - Complete privileged audit trail
--   7. Maintain zero raw register number guarantee & zero secret observer presence
--   8. Preserve historical audit logs with actor_role = 'admin' without rewriting
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remove Previous Admin Account from platform_staff
-- ----------------------------------------------------------------------------
DELETE FROM public.platform_staff
WHERE user_id = '6600327f-382b-4f13-9eac-3f8f69240595';

-- ----------------------------------------------------------------------------
-- 2. Ensure Designated Developer Remains Active
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_staff (user_id, role, email, is_active)
VALUES ('532274f3-7fd9-4206-b353-dcd36bababd5', 'developer', 'gnanoognanoo@gmail.com', true)
ON CONFLICT (user_id) DO UPDATE SET
  role = 'developer',
  is_active = true;

-- ----------------------------------------------------------------------------
-- 3. Constrain platform_staff Role to 'developer' Only
-- ----------------------------------------------------------------------------
ALTER TABLE public.platform_staff DROP CONSTRAINT IF EXISTS platform_staff_role_check;
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_role_check CHECK (role = 'developer');

-- ----------------------------------------------------------------------------
-- 4. Purge Email-Pattern Test Accounts (Explicit UUID Allowlist Only)
-- ----------------------------------------------------------------------------
-- Remove all rows from public.test_accounts that were populated by LIKE pattern matching
DELETE FROM public.test_accounts;

-- Seed ONLY explicitly approved automated test fixture UUID (if exists in auth.users)
INSERT INTO public.test_accounts (user_id, notes, is_active)
SELECT id, 'Explicitly Approved Automated Test Fixture', true
FROM auth.users
WHERE id = 'f1da80c4-4b35-4ce2-beb8-dee20a8bdfb9'
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Server-Internal is_test_account(UUID) (Revoked from Client Roles)
-- ----------------------------------------------------------------------------
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
    WHERE user_id = p_user_id AND role = 'developer' AND is_active = true
  );
END;
$$;

-- Revoke direct execution from client roles to prevent UUID probing discovery
REVOKE ALL ON FUNCTION public.is_test_account(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Safe Client-Facing is_platform_staff() & get_staff_role()
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 7. check_staff_status() (Single DEVELOPER Role Only)
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
-- 8. Server-Internal log_admin_action()
-- ----------------------------------------------------------------------------
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
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be signed in to log action.';
  END IF;

  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = v_actor_id AND role = 'developer' AND is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'STAFF_UNAUTHORIZED: Caller is not active developer.';
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
    'developer',
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

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, UUID, UUID, TEXT, JSONB) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Private Student Profile Access Authorized for DEVELOPER
-- ----------------------------------------------------------------------------
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
  v_profile RECORD;
  v_presence RECORD;
  v_identity RECORD;
  v_masked_fingerprint TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Developer role required to inspect private student credentials.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'A valid reason (minimum 3 characters) is required to inspect user profile details.'
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

  -- Append audit log entry internally (actor_role = 'developer')
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
-- 10. Moderation Transcript Access Authorized for DEVELOPER
-- ----------------------------------------------------------------------------
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
  v_room_exists BOOLEAN;
  v_messages JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Developer role required to access moderation transcripts.'
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

  -- Append audit log entry BEFORE reading messages (actor_role = 'developer')
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
-- 11. Full Audit Log Access Authorized for DEVELOPER
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
  v_logs JSONB;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  -- Complete audit trail available to active DEVELOPER
  -- Preserves historical records where actor_role was 'admin'
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
-- 12. Forced Test Session Creation (Explicit Test / Staff Accounts Only)
-- ----------------------------------------------------------------------------
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
      'message', 'Forced test sessions are strictly prohibited against ordinary students. Both accounts must be explicitly registered test accounts or active platform staff.'
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
-- 13. Hardened Permissions Matrix
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_test_account(UUID) FROM public, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.is_platform_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;

REVOKE ALL ON FUNCTION public.get_staff_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_role() TO authenticated;
