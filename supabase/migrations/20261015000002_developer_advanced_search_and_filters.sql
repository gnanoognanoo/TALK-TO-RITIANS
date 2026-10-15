-- ============================================================================
-- TALK TO RITIANS - Production Migration: Advanced Developer Console User Search & Filters
-- Migration: 20261015000002_developer_advanced_search_and_filters.sql
-- ============================================================================
-- Implements privileged Developer search, filtering, and sorting capabilities:
-- 1. Updates get_online_users_admin() to include authorized student metadata:
--    - real_name (verified student name)
--    - department
--    - batch
--    - graduation_year
--    - fingerprint_suffix
--    - has_encrypted_register_number
--    - account_created_at
-- 2. Creates search_developer_users():
--    - Multi-mode search: anonymous_username, student_name, department, graduation_year, register_number
--    - Secure exact-match lookup for register numbers via server-computed identity hash
--    - Zero bulk plaintext register number exposure
--    - Audits sensitive searches (student_name, register_number) without logging raw queries or PII
--    - Multi-field sorting (anonymous_username, student_name, department, graduation_year, account_created, last_seen)
--    - Combinable state and verification filters
--    - Server-side pagination
--    - Strictly restricted to public.is_platform_staff()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UPDATE: get_online_users_admin()
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
      (public._get_effective_persona(up.user_id)->>'anonymous_username') AS anonymous_username,
      (public._get_effective_persona(up.user_id)->'avatar_config') AS avatar_config,
      COALESCE(p.college_identity_linked, false) AS is_verified_student,
      COALESCE(p.full_name, p.name) AS real_name,
      p.department,
      p.batch,
      COALESCE(
        p.graduation_year::text,
        (regexp_match(p.batch, '\d{4}\s*[-–]\s*(\d{4})'))[1]
      ) AS graduation_year,
      (
        SELECT '...' || substring(ci.identity_hash from 57 for 8)
        FROM public.college_identities ci
        WHERE ci.user_id = up.user_id AND ci.active = true
        ORDER BY ci.created_at DESC
        LIMIT 1
      ) AS fingerprint_suffix,
      (
        EXISTS (
          SELECT 1 FROM public.encrypted_student_identities esi
          WHERE esi.user_id = up.user_id
        )
      ) AS has_encrypted_register_number,
      (ps.role IS NOT NULL) AS is_staff,
      ps.role AS staff_role,
      (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) AS is_online,
      COALESCE(up.available_for_chat_requests, true) AS available_for_chat_requests,
      up.last_seen_at,
      p.created_at AS created_at,
      up.current_page,
      CASE
        WHEN r.id IS NOT NULL THEN 'in_chat'
        WHEN mq.id IS NOT NULL AND mq.heartbeat_at >= (v_now - interval '25 seconds') THEN 'searching'
        WHEN cr.id IS NOT NULL AND cr.expires_at > v_now THEN 'pending_request'
        WHEN (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) THEN 'idle'
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
    LEFT JOIN public.platform_staff ps ON ps.user_id = up.user_id AND ps.is_active = true
    LEFT JOIN public.test_accounts ta ON ta.user_id = up.user_id AND ta.is_active = true
    LEFT JOIN public.chat_rooms r ON (r.user_1 = up.user_id OR r.user_2 = up.user_id) AND r.status = 'active' AND (r.expires_at IS NULL OR r.expires_at > v_now)
    LEFT JOIN public.matchmaking_queue mq ON mq.user_id = up.user_id AND mq.status = 'searching'
    LEFT JOIN public.chat_requests cr ON (cr.recipient_id = up.user_id OR cr.requester_id = up.user_id) AND cr.status = 'pending' AND cr.expires_at > v_now
    WHERE up.last_seen_at >= (v_now - interval '300 seconds') OR up.is_online = true
    ORDER BY (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) DESC, up.last_seen_at DESC
    LIMIT 100
  ) user_data;

  RETURN jsonb_build_object(
    'success', true,
    'users', COALESCE(v_users, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_online_users_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_online_users_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC: search_developer_users()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_developer_users(
  p_search_mode TEXT DEFAULT 'anonymous_username',
  p_search_query TEXT DEFAULT '',
  p_sort_field TEXT DEFAULT 'last_seen',
  p_sort_direction TEXT DEFAULT 'desc',
  p_state_filter TEXT DEFAULT 'all',
  p_verification_filter TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_now TIMESTAMPTZ := now();
  v_query TEXT := trim(COALESCE(p_search_query, ''));
  v_mode TEXT := lower(trim(COALESCE(p_search_mode, 'anonymous_username')));
  v_sort_col TEXT := lower(trim(COALESCE(p_sort_field, 'last_seen')));
  v_sort_dir TEXT := lower(trim(COALESCE(p_sort_direction, 'desc')));
  v_state_filter TEXT := lower(trim(COALESCE(p_state_filter, 'all')));
  v_verif_filter TEXT := lower(trim(COALESCE(p_verification_filter, 'all')));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_reg_search_hash TEXT := NULL;
  v_reg_search_hash_upper TEXT := NULL;
  v_server_salt TEXT := COALESCE(nullif(current_setting('app.identity_salt', true), ''), '::rit_campus_identity_secret_salt_2026');
  v_users JSONB;
  v_total_count INTEGER := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Strictly Developer Only
  IF NOT public.is_platform_staff() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STAFF_UNAUTHORIZED',
      'message', 'Developer role required for advanced student user search.'
    );
  END IF;

  -- Validate search mode
  IF v_mode NOT IN ('anonymous_username', 'student_name', 'department', 'graduation_year', 'register_number') THEN
    v_mode := 'anonymous_username';
  END IF;

  -- Validate sort fields
  IF v_sort_col NOT IN ('anonymous_username', 'student_name', 'department', 'graduation_year', 'account_created', 'last_seen') THEN
    v_sort_col := 'last_seen';
  END IF;

  IF v_sort_dir NOT IN ('asc', 'desc') THEN
    v_sort_dir := 'desc';
  END IF;

  -- If register number search: compute SHA-256 hash using identity salt (supports raw and uppercase normalization)
  IF v_mode = 'register_number' AND length(v_query) >= 3 THEN
    v_reg_search_hash := encode(digest(v_query || v_server_salt, 'sha256'), 'hex');
    v_reg_search_hash_upper := encode(digest(upper(v_query) || v_server_salt, 'sha256'), 'hex');
  END IF;

  -- Privileged Audit Logging for Sensitive Identity Queries (No raw query or PII logged)
  IF (v_mode IN ('student_name', 'register_number')) AND length(v_query) > 0 THEN
    PERFORM public.log_admin_action(
      'SEARCH_PRIVATE_STUDENTS',
      NULL,
      NULL,
      'Developer searched student registry under mode: ' || v_mode,
      jsonb_build_object(
        'search_mode', v_mode,
        'has_query', true
      )
    );
  END IF;

  -- Query and construct filtered user result
  WITH base_users AS (
    SELECT
      u.id AS user_id,
      COALESCE(
        public._get_effective_persona(u.id)->>'anonymous_username',
        p.display_username,
        'Unknown User'
      ) AS anonymous_username,
      COALESCE(
        public._get_effective_persona(u.id)->'avatar_config',
        p.avatar_config,
        '{}'::jsonb
      ) AS avatar_config,
      COALESCE(p.college_identity_linked, false) AS is_verified_student,
      COALESCE(p.full_name, p.name) AS real_name,
      p.department,
      p.batch,
      COALESCE(
        p.graduation_year::text,
        (regexp_match(p.batch, '\d{4}\s*[-–]\s*(\d{4})'))[1]
      ) AS graduation_year,
      (
        SELECT '...' || substring(ci.identity_hash from 57 for 8)
        FROM public.college_identities ci
        WHERE ci.user_id = u.id AND ci.active = true
        ORDER BY ci.created_at DESC
        LIMIT 1
      ) AS fingerprint_suffix,
      (
        EXISTS (
          SELECT 1 FROM public.encrypted_student_identities esi
          WHERE esi.user_id = u.id
        )
      ) AS has_encrypted_register_number,
      (
        EXISTS (
          SELECT 1 FROM public.college_identities ci
          WHERE ci.user_id = u.id AND ci.active = true
            AND (
              (v_reg_search_hash IS NOT NULL AND ci.identity_hash = v_reg_search_hash)
              OR (v_reg_search_hash_upper IS NOT NULL AND ci.identity_hash = v_reg_search_hash_upper)
            )
        )
      ) AS is_reg_match,
      (ps.role IS NOT NULL) AS is_staff,
      ps.role AS staff_role,
      (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) AS is_online,
      COALESCE(up.available_for_chat_requests, true) AS available_for_chat_requests,
      COALESCE(up.last_seen_at, p.created_at, v_now) AS last_seen_at,
      p.created_at AS created_at,
      COALESCE(up.current_page, 'unknown') AS current_page,
      CASE
        WHEN r.id IS NOT NULL THEN 'in_chat'
        WHEN mq.id IS NOT NULL AND mq.heartbeat_at >= (v_now - interval '25 seconds') THEN 'searching'
        WHEN cr.id IS NOT NULL AND cr.expires_at > v_now THEN 'pending_request'
        WHEN (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) THEN 'idle'
        ELSE 'offline'
      END AS state,
      r.id AS current_room_id,
      (
        ps.role IS NOT NULL
        OR ta.user_id IS NOT NULL
      ) AS is_test_account
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.user_presence up ON up.user_id = u.id
    LEFT JOIN public.platform_staff ps ON ps.user_id = u.id AND ps.is_active = true
    LEFT JOIN public.test_accounts ta ON ta.user_id = u.id AND ta.is_active = true
    LEFT JOIN public.chat_rooms r ON (r.user_1 = u.id OR r.user_2 = u.id) AND r.status = 'active' AND (r.expires_at IS NULL OR r.expires_at > v_now)
    LEFT JOIN public.matchmaking_queue mq ON mq.user_id = u.id AND mq.status = 'searching'
    LEFT JOIN public.chat_requests cr ON (cr.recipient_id = u.id OR cr.requester_id = u.id) AND cr.status = 'pending' AND cr.expires_at > v_now
  ),
  filtered_users AS (
    SELECT * FROM base_users b
    WHERE
      -- Search Mode Filters
      (
        length(v_query) = 0
        OR (v_mode = 'anonymous_username' AND (b.anonymous_username ILIKE ('%' || v_query || '%') OR b.user_id::text ILIKE ('%' || v_query || '%')))
        OR (v_mode = 'student_name' AND b.real_name ILIKE ('%' || v_query || '%'))
        OR (v_mode = 'department' AND b.department ILIKE ('%' || v_query || '%'))
        OR (v_mode = 'graduation_year' AND (b.graduation_year ILIKE ('%' || v_query || '%') OR b.batch ILIKE ('%' || v_query || '%')))
        OR (v_mode = 'register_number' AND b.is_reg_match IS TRUE)
      )
      -- State Filters
      AND (
        v_state_filter = 'all'
        OR (v_state_filter = 'online' AND b.is_online IS TRUE)
        OR b.state = v_state_filter
      )
      -- Verification Filters
      AND (
        v_verif_filter = 'all'
        OR (v_verif_filter = 'verified' AND b.is_verified_student IS TRUE)
        OR (v_verif_filter = 'unverified' AND b.is_verified_student IS NOT TRUE)
        OR (v_verif_filter = 'developer' AND b.is_staff IS TRUE)
      )
  )
  SELECT
    COUNT(*)::integer INTO v_total_count
  FROM filtered_users;

  WITH base_users AS (
    SELECT
      u.id AS user_id,
      COALESCE(
        public._get_effective_persona(u.id)->>'anonymous_username',
        p.display_username,
        'Unknown User'
      ) AS anonymous_username,
      COALESCE(
        public._get_effective_persona(u.id)->'avatar_config',
        p.avatar_config,
        '{}'::jsonb
      ) AS avatar_config,
      COALESCE(p.college_identity_linked, false) AS is_verified_student,
      COALESCE(p.full_name, p.name) AS real_name,
      p.department,
      p.batch,
      COALESCE(
        p.graduation_year::text,
        (regexp_match(p.batch, '\d{4}\s*[-–]\s*(\d{4})'))[1]
      ) AS graduation_year,
      (
        SELECT '...' || substring(ci.identity_hash from 57 for 8)
        FROM public.college_identities ci
        WHERE ci.user_id = u.id AND ci.active = true
        ORDER BY ci.created_at DESC
        LIMIT 1
      ) AS fingerprint_suffix,
      (
        EXISTS (
          SELECT 1 FROM public.encrypted_student_identities esi
          WHERE esi.user_id = u.id
        )
      ) AS has_encrypted_register_number,
      (
        EXISTS (
          SELECT 1 FROM public.college_identities ci
          WHERE ci.user_id = u.id AND ci.active = true
            AND (
              (v_reg_search_hash IS NOT NULL AND ci.identity_hash = v_reg_search_hash)
              OR (v_reg_search_hash_upper IS NOT NULL AND ci.identity_hash = v_reg_search_hash_upper)
            )
        )
      ) AS is_reg_match,
      (ps.role IS NOT NULL) AS is_staff,
      ps.role AS staff_role,
      (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) AS is_online,
      COALESCE(up.available_for_chat_requests, true) AS available_for_chat_requests,
      COALESCE(up.last_seen_at, p.created_at, v_now) AS last_seen_at,
      p.created_at AS created_at,
      COALESCE(up.current_page, 'unknown') AS current_page,
      CASE
        WHEN r.id IS NOT NULL THEN 'in_chat'
        WHEN mq.id IS NOT NULL AND mq.heartbeat_at >= (v_now - interval '25 seconds') THEN 'searching'
        WHEN cr.id IS NOT NULL AND cr.expires_at > v_now THEN 'pending_request'
        WHEN (up.is_online IS TRUE AND up.last_seen_at >= (v_now - interval '30 seconds')) THEN 'idle'
        ELSE 'offline'
      END AS state,
      r.id AS current_room_id,
      (
        ps.role IS NOT NULL
        OR ta.user_id IS NOT NULL
      ) AS is_test_account
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.user_presence up ON up.user_id = u.id
    LEFT JOIN public.platform_staff ps ON ps.user_id = u.id AND ps.is_active = true
    LEFT JOIN public.test_accounts ta ON ta.user_id = u.id AND ta.is_active = true
    LEFT JOIN public.chat_rooms r ON (r.user_1 = u.id OR r.user_2 = u.id) AND r.status = 'active' AND (r.expires_at IS NULL OR r.expires_at > v_now)
    LEFT JOIN public.matchmaking_queue mq ON mq.user_id = u.id AND mq.status = 'searching'
    LEFT JOIN public.chat_requests cr ON (cr.recipient_id = u.id OR cr.requester_id = u.id) AND cr.status = 'pending' AND cr.expires_at > v_now
  ),
  filtered_users AS (
    SELECT * FROM base_users b
    WHERE
      (
        length(v_query) = 0
        OR (v_mode = 'anonymous_username' AND (b.anonymous_username ILIKE ('%' || v_query || '%') OR b.user_id::text ILIKE ('%' || v_query || '%')))
        OR (v_mode = 'student_name' AND b.real_name ILIKE ('%' || v_query || '%'))
        OR (v_mode = 'department' AND b.department ILIKE ('%' || v_query || '%'))
        OR (v_mode = 'graduation_year' AND (b.graduation_year ILIKE ('%' || v_query || '%') OR b.batch ILIKE ('%' || v_query || '%')))
        OR (v_mode = 'register_number' AND b.is_reg_match IS TRUE)
      )
      AND (
        v_state_filter = 'all'
        OR (v_state_filter = 'online' AND b.is_online IS TRUE)
        OR b.state = v_state_filter
      )
      AND (
        v_verif_filter = 'all'
        OR (v_verif_filter = 'verified' AND b.is_verified_student IS TRUE)
        OR (v_verif_filter = 'unverified' AND b.is_verified_student IS NOT TRUE)
        OR (v_verif_filter = 'developer' AND b.is_staff IS TRUE)
      )
  )
  SELECT jsonb_agg(f_data) INTO v_users
  FROM (
    SELECT
      f.user_id,
      f.anonymous_username,
      f.avatar_config,
      f.is_verified_student,
      f.real_name,
      f.department,
      f.batch,
      f.graduation_year,
      f.fingerprint_suffix,
      f.has_encrypted_register_number,
      f.is_staff,
      f.staff_role,
      f.is_online,
      f.available_for_chat_requests,
      f.last_seen_at,
      f.created_at,
      f.current_page,
      f.state,
      f.current_room_id,
      f.is_test_account
    FROM filtered_users f
    ORDER BY
      CASE WHEN v_sort_col = 'anonymous_username' AND v_sort_dir = 'asc' THEN f.anonymous_username END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'anonymous_username' AND v_sort_dir = 'desc' THEN f.anonymous_username END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'student_name' AND v_sort_dir = 'asc' THEN f.real_name END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'student_name' AND v_sort_dir = 'desc' THEN f.real_name END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'department' AND v_sort_dir = 'asc' THEN f.department END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'department' AND v_sort_dir = 'desc' THEN f.department END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'graduation_year' AND v_sort_dir = 'asc' THEN f.graduation_year END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'graduation_year' AND v_sort_dir = 'desc' THEN f.graduation_year END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'account_created' AND v_sort_dir = 'asc' THEN f.created_at END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'account_created' AND v_sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'last_seen' AND v_sort_dir = 'asc' THEN f.last_seen_at END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'last_seen' AND v_sort_dir = 'desc' THEN f.last_seen_at END DESC NULLS LAST,
      f.is_online DESC,
      f.last_seen_at DESC
    LIMIT v_limit OFFSET v_offset
  ) f_data;

  RETURN jsonb_build_object(
    'success', true,
    'users', COALESCE(v_users, '[]'::jsonb),
    'total_count', v_total_count,
    'page_size', v_limit,
    'offset', v_offset,
    'search_mode', v_mode,
    'sort_field', v_sort_col,
    'sort_direction', v_sort_dir
  );
END;
$$;

REVOKE ALL ON FUNCTION public.search_developer_users(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_developer_users(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
