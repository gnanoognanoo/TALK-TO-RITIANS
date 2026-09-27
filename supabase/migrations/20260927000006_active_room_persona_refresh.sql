-- ============================================================================
-- Migration: 20260927000006_active_room_persona_refresh.sql
-- Description:
-- 1. Add persona_updated_at column to chat_rooms for safe active-room Realtime signalling
-- 2. Update get_room_peer() to derive current effective anonymous persona:
--    - If peer.college_identity_linked = true -> saved anonymous username & avatar
--    - If peer.college_identity_linked = false -> deterministic Unknown User #### & default avatar
--    - Strictly zero PII exposed (no name, department, batch, gender, email, identity hash, or verification status)
--    - Fixes integer addition cast in fallback Unknown User calculation
-- 3. Update heartbeat_matchmaking() to fix integer cast in fallback Unknown User
-- 4. Update unlink_college_identity() to signal active rooms via persona_updated_at
--    without deleting saved custom persona
-- 5. Update verify_and_link_college_identity() to signal active rooms on re-link
-- 6. Update save_anonymous_alias() and save_avatar_config() to signal active rooms
-- ============================================================================

-- 1. Add persona_updated_at to chat_rooms
ALTER TABLE public.chat_rooms
ADD COLUMN IF NOT EXISTS persona_updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Update get_room_peer()
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

-- 3. Update heartbeat_matchmaking()
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
  v_created_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_partner_is_verified BOOLEAN;
  v_partner_username TEXT;
  v_partner_avatar JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Verify queue entry belongs to caller
  SELECT status, matched_room_id, matched_user_id
  INTO v_status, v_matched_room_id, v_matched_user_id
  FROM public.matchmaking_queue
  WHERE id = p_queue_id AND user_id = v_user_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'QUEUE_ENTRY_NOT_FOUND');
  END IF;

  -- Update heartbeat timestamp
  UPDATE public.matchmaking_queue
  SET heartbeat_at = now()
  WHERE id = p_queue_id;

  -- If matched by another user's transaction, return match result with expiration
  IF v_status = 'matched' AND v_matched_room_id IS NOT NULL THEN
    SELECT created_at, expires_at
    INTO v_created_at, v_expires_at
    FROM public.chat_rooms
    WHERE id = v_matched_room_id;

    -- Check if partner has verified college identity
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
        v_partner_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
      END IF;
    ELSE
      v_partner_username := 'Unknown User ' || lpad((abs(hashtext(v_matched_user_id::text)) % 9000 + 1000)::text, 4, '0');
      v_partner_avatar := '{"face":"round","skin":"#FDDBB4","hair":"short","hairColor":"#1A1A1A","eyes":"normal","eyebrows":"natural","mouth":"smile","shirt":"crew","shirtColor":"#4F46E5","accessory":"none","background":"indigo"}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'matched',
      'room_id', v_matched_room_id,
      'created_at', v_created_at,
      'expires_at', v_expires_at,
      'peer', jsonb_build_object(
        'anonymous_username', COALESCE(v_partner_username, 'Unknown User'),
        'avatar_config', COALESCE(v_partner_avatar, '{}'::jsonb)
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'status', v_status);
END;
$$;

-- 4. Update unlink_college_identity()
CREATE OR REPLACE FUNCTION public.unlink_college_identity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_unlinked_count INTEGER;
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to unlink a college identity.'
    );
  END IF;

  -- 2. Deactivate active college identity record & record unlinked_at timestamp
  -- Preserves verified_at, created_at, unlinked_at for audit integrity
  -- IMPORTANT: Does NOT delete anonymous_identities record (preserves saved customization)
  UPDATE public.college_identities
  SET active = false, unlinked_at = now()
  WHERE user_id = v_user_id AND active = true;

  GET DIAGNOSTICS v_unlinked_count = ROW_COUNT;

  -- 3. Update profile to reflect unlinked status
  UPDATE public.profiles
  SET college_identity_linked = false, updated_at = now()
  WHERE id = v_user_id;

  -- 4. CRITICAL: Signal any active chat rooms that a participant persona changed.
  -- The peer's ChatPage Realtime subscription on chat_rooms will observe this UPDATE
  -- and immediately call get_room_peer() to refresh the peer's effective persona.
  UPDATE public.chat_rooms
  SET persona_updated_at = now()
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_records', v_unlinked_count,
    'unlinked_at', now()
  );
END;
$$;

-- 5. Update verify_and_link_college_identity()
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
  v_server_salt CONSTANT TEXT := '::rit_campus_identity_secret_salt_2026';
BEGIN
  -- 1. Security Check: Authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to link a college identity.'
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

  -- 4. Check active identity ownership
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.college_identities
  WHERE identity_hash = v_identity_hash AND active = true
  LIMIT 1;

  -- Case A: Same user re-scans already-linked identity
  IF v_existing_user IS NOT NULL AND v_existing_user = v_user_id THEN
    UPDATE public.profiles
    SET college_identity_linked = true, updated_at = now()
    WHERE id = v_user_id;

    UPDATE public.chat_rooms
    SET persona_updated_at = now()
    WHERE (user_1 = v_user_id OR user_2 = v_user_id)
      AND status = 'active';

    RETURN jsonb_build_object(
      'success', true,
      'already_linked_to_self', true,
      'message', 'This college identity is already linked to your account.',
      'college_identity_id', v_existing_id,
      'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
      'verified_at', now()
    );
  END IF;

  -- Case B: Duplicate on another personal account
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CARD_ALREADY_LINKED',
      'message', 'This college identity is already linked to another account.'
    );
  END IF;

  -- 5. Optional Cooldown
  IF p_cooldown_hours > 0 THEN
    SELECT max(unlinked_at) INTO v_last_unlinked
    FROM public.college_identities
    WHERE identity_hash = v_identity_hash AND active = false AND user_id <> v_user_id;

    IF v_last_unlinked IS NOT NULL AND (now() - v_last_unlinked) < (p_cooldown_hours || ' hours')::interval THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', 'This college identity was recently unlinked and cannot be re-linked yet. Please try again after the cooldown period expires.'
      );
    END IF;
  END IF;

  -- 6. Deactivate any prior active college identity for this user
  UPDATE public.college_identities
  SET active = false, unlinked_at = now()
  WHERE user_id = v_user_id AND active = true;

  -- 7. Insert new identity
  BEGIN
    INSERT INTO public.college_identities (
      user_id,
      identity_hash,
      name_from_qr,
      department_from_qr,
      batch_from_qr,
      qr_metadata,
      active
    )
    VALUES (
      v_user_id,
      v_identity_hash,
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
    department = COALESCE(p_department, department),
    batch = COALESCE(p_batch, batch),
    updated_at = now()
  WHERE id = v_user_id;

  -- Signal active chat rooms that persona changed (re-linked -> saved custom persona restores)
  UPDATE public.chat_rooms
  SET persona_updated_at = now()
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'already_linked_to_self', false,
    'college_identity_id', v_new_identity_id,
    'identity_hash_preview', substring(v_identity_hash FROM 1 FOR 8) || '...' || substring(v_identity_hash FROM 57 FOR 8),
    'verified_at', now()
  );
END;
$$;

-- 6. Update save_anonymous_alias()
CREATE OR REPLACE FUNCTION public.save_anonymous_alias(
  p_alias TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_verified BOOLEAN;
  v_trimmed TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to select an anonymous username.'
    );
  END IF;

  SELECT college_identity_linked INTO v_is_verified
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before selecting an anonymous username.'
    );
  END IF;

  v_trimmed := trim(p_alias);

  IF v_trimmed IS NULL OR length(v_trimmed) < 3 OR length(v_trimmed) > 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_LENGTH',
      'message', 'Anonymous handle must be between 3 and 30 characters.'
    );
  END IF;

  IF v_trimmed !~ '^[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CHARACTERS',
      'message', 'Anonymous handle may only contain letters, numbers, and underscores.'
    );
  END IF;

  UPDATE public.profiles
  SET
    display_username = v_trimmed,
    updated_at = now()
  WHERE id = v_user_id;

  -- Signal active chat rooms that persona changed
  UPDATE public.chat_rooms
  SET persona_updated_at = now()
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'alias', v_trimmed,
    'updated_at', now()
  );
END;
$$;

-- 7. Update save_avatar_config()
CREATE OR REPLACE FUNCTION public.save_avatar_config(
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_is_verified BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to customize your avatar.'
    );
  END IF;

  SELECT college_identity_linked INTO v_is_verified
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERIFICATION_REQUIRED',
      'message', 'You must verify your college ID before customizing your avatar.'
    );
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) != 'object' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CONFIG',
      'message', 'Avatar configuration must be a valid JSON object.'
    );
  END IF;

  UPDATE public.profiles
  SET
    avatar_config = p_config,
    updated_at = now()
  WHERE id = v_user_id;

  -- Signal active chat rooms that persona changed
  UPDATE public.chat_rooms
  SET persona_updated_at = now()
  WHERE (user_1 = v_user_id OR user_2 = v_user_id)
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'avatar_config', p_config,
    'updated_at', now()
  );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_room_peer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_matchmaking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_college_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_link_college_identity(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_anonymous_alias(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_avatar_config(JSONB) TO authenticated;
