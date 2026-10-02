-- ============================================================================
-- Migration: 20261002000004_developer_admin_console.sql
-- Description: Server-side Developer/Admin console architecture:
--              1. Privileged role model: public.platform_staff (developer, admin)
--              2. Append-only audit logging: public.admin_audit_log
--              3. Developer persona customization (custom username + gallery avatar bypass)
--              4. Supabase Storage bucket developer-avatars & staff RLS policies
--              5. Staff RPCs: stats, online users, rooms, moderation transcript,
--                 admin invite, and restricted test sessions
--              6. Initial enrollment for designated developer Google accounts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Privileged Role Model (public.platform_staff)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('developer', 'admin')),
  email TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_platform_staff_active ON public.platform_staff (user_id) WHERE is_active = true;

ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_staff_select_self ON public.platform_staff;
CREATE POLICY platform_staff_select_self ON public.platform_staff
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.platform_staff ps
      WHERE ps.user_id = auth.uid() AND ps.is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Audit Logging (public.admin_audit_log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID NULL,
  room_id UUID NULL,
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log (actor_user_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_log_select ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_staff ps
      WHERE ps.user_id = auth.uid() AND ps.is_active = true
    )
  );

DROP POLICY IF EXISTS admin_audit_log_insert ON public.admin_audit_log;
CREATE POLICY admin_audit_log_insert ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.platform_staff ps
      WHERE ps.user_id = auth.uid() AND ps.is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Core Staff Helper Functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id UUID DEFAULT auth.uid())
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

CREATE OR REPLACE FUNCTION public.get_staff_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = p_user_id AND is_active = true;
  RETURN v_role;
END;
$$;

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
-- 4. Initial Developer Account Enrollment & Trigger
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_staff (user_id, role, email, is_active)
SELECT id, 'developer', email, true
FROM auth.users
WHERE lower(email) IN ('gnanoognanoo@gmail.com', 'gnanoognano@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET is_active = true, role = 'developer';

CREATE OR REPLACE FUNCTION public.handle_staff_user_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF lower(NEW.email) IN ('gnanoognanoo@gmail.com', 'gnanoognano@gmail.com') THEN
    INSERT INTO public.platform_staff (user_id, role, email, is_active)
    VALUES (NEW.id, 'developer', NEW.email, true)
    ON CONFLICT (user_id) DO UPDATE SET is_active = true, role = 'developer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enroll_staff_on_auth_user ON auth.users;
CREATE TRIGGER trigger_enroll_staff_on_auth_user
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_staff_user_enrollment();

-- ----------------------------------------------------------------------------
-- 5. Supabase Storage Bucket: developer-avatars & Policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'developer-avatars',
  'developer-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS dev_avatars_read ON storage.objects;
CREATE POLICY dev_avatars_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'developer-avatars');

DROP POLICY IF EXISTS dev_avatars_insert ON storage.objects;
CREATE POLICY dev_avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'developer-avatars'
    AND public.is_platform_staff(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS dev_avatars_update ON storage.objects;
CREATE POLICY dev_avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'developer-avatars'
    AND public.is_platform_staff(auth.uid())
    AND owner = auth.uid()
  );

DROP POLICY IF EXISTS dev_avatars_delete ON storage.objects;
CREATE POLICY dev_avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'developer-avatars'
    AND public.is_platform_staff(auth.uid())
    AND owner = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 6. RPC: check_staff_status()
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

-- ----------------------------------------------------------------------------
-- 7. RPC: set_developer_persona(p_username, p_avatar_url)
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT role INTO v_role
  FROM public.platform_staff
  WHERE user_id = v_user_id AND is_active = true;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Only developer/admin accounts can set a custom developer persona.'
    );
  END IF;

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
-- 8. RPC: get_admin_dashboard_stats()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_online_users INT;
  v_users_chatting INT;
  v_users_idle INT;
  v_active_rooms INT;
  v_pending_requests INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_user_id := auth.uid();
  IF NOT public.is_platform_staff(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  -- Online users within 60 seconds
  SELECT count(DISTINCT user_id) INTO v_online_users
  FROM public.user_presence
  WHERE is_online = true AND last_seen_at >= (v_now - interval '60 seconds');

  -- Active rooms
  SELECT count(*) INTO v_active_rooms
  FROM public.chat_rooms
  WHERE status = 'active' AND (expires_at IS NULL OR expires_at > v_now);

  -- Users chatting in active rooms
  SELECT count(DISTINCT u) INTO v_users_chatting
  FROM (
    SELECT user_1 AS u FROM public.chat_rooms WHERE status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
    UNION
    SELECT user_2 AS u FROM public.chat_rooms WHERE status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
  ) q;

  -- Users idle
  v_users_idle := GREATEST(0, v_online_users - v_users_chatting);

  -- Pending chat requests
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
-- 9. RPC: get_online_users_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_users_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_users JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_caller_id := auth.uid();
  IF NOT public.is_platform_staff(v_caller_id) THEN
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
        OR lower(COALESCE(u.email, '')) LIKE '%test%'
        OR lower(COALESCE(u.email, '')) LIKE '%audit%'
      ) AS is_test_account
    FROM public.user_presence up
    JOIN auth.users u ON u.id = up.user_id
    LEFT JOIN public.profiles p ON p.id = up.user_id
    LEFT JOIN public.anonymous_identities ai ON ai.user_id = up.user_id
    LEFT JOIN public.platform_staff ps ON ps.user_id = up.user_id AND ps.is_active = true
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
-- 10. RPC: get_user_admin_details(p_user_id, p_reason)
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
  IF NOT public.is_platform_staff(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REASON', 'message', 'A valid reason is required to inspect user profile details.');
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

  -- Append audit log entry
  PERFORM public.log_admin_action(
    'VIEW_PRIVATE_PROFILE',
    p_user_id,
    NULL,
    p_reason,
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
-- 11. RPC: get_active_rooms_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_rooms_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_rooms JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_caller_id := auth.uid();
  IF NOT public.is_platform_staff(v_caller_id) THEN
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
-- 12. RPC: get_room_admin_details(p_room_id)
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
  v_caller_id UUID;
  v_room RECORD;
  v_now TIMESTAMPTZ := now();
  v_msg_count INT;
BEGIN
  v_caller_id := auth.uid();
  IF NOT public.is_platform_staff(v_caller_id) THEN
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
-- 13. RPC: get_room_moderation_transcript(p_room_id, p_reason)
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
  IF NOT public.is_platform_staff(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
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
-- 14. RPC: send_admin_chat_invite(p_user_id)
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
  v_caller_id := auth.uid();
  IF NOT public.is_platform_staff(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

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
-- 15. RPC: create_test_session(p_target_user_id)
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
  v_caller_email TEXT;
  v_target_email TEXT;
  v_caller_is_test BOOLEAN;
  v_target_is_test BOOLEAN;
  v_caller_is_staff BOOLEAN;
  v_target_is_staff BOOLEAN;
  v_new_room_id UUID;
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + interval '7 minutes';
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;

  v_caller_is_staff := public.is_platform_staff(v_caller_id);
  v_target_is_staff := public.is_platform_staff(p_target_user_id);

  v_caller_is_test := (
    v_caller_is_staff
    OR lower(COALESCE(v_caller_email, '')) LIKE '%test%'
    OR lower(COALESCE(v_caller_email, '')) LIKE '%audit%'
  );

  v_target_is_test := (
    v_target_is_staff
    OR lower(COALESCE(v_target_email, '')) LIKE '%test%'
    OR lower(COALESCE(v_target_email, '')) LIKE '%audit%'
  );

  -- Strictly prohibit forced sessions against normal students!
  IF NOT (v_caller_is_test AND v_target_is_test) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TEST_SESSION_RESTRICTED',
      'message', 'Forced test sessions are strictly prohibited against ordinary students. Both accounts must be developer/admin or test accounts.'
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
-- 16. RPC: get_admin_audit_logs(p_limit)
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
  v_caller_id := auth.uid();
  IF NOT public.is_platform_staff(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_UNAUTHORIZED');
  END IF;

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
-- 17. Permissions Hardening
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_platform_staff(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_staff_role(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_role(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, UUID, UUID, TEXT, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, UUID, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.check_staff_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_staff_status() TO authenticated;

REVOKE ALL ON FUNCTION public.set_developer_persona(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_developer_persona(TEXT, TEXT) TO authenticated;

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

REVOKE ALL ON FUNCTION public.get_admin_audit_logs(INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_logs(INT) TO authenticated;
