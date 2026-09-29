-- ============================================================================
-- Migration: 20260929000002_invalidate_pending_college_email_otp.sql
-- Description: Adds RPC to safely invalidate pending OTP on email delivery failure
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invalidate_pending_college_email_otp(
  p_otp_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_updated INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'You must be signed in to manage OTP state.'
    );
  END IF;

  UPDATE public.college_email_otps
  SET consumed = true
  WHERE user_id = v_user_id
    AND otp_hash = p_otp_hash
    AND consumed = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'invalidated', v_updated > 0
  );
END;
$$;
