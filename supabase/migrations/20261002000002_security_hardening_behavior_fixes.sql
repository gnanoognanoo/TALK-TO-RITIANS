-- ============================================================================
-- Migration: 20261002000002_security_hardening_behavior_fixes.sql
-- Description: Security hardening for behavior fixes (revoke anon execution on
--              chat request & presence RPCs, add RLS policies on exclusions table)
-- ============================================================================

-- 1. Hardening RPC permissions: explicitly revoke execution from public & anon
REVOKE EXECUTE ON FUNCTION public.accept_chat_request(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_chat_request(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_chat_request() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.reject_chat_request(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.save_gender(TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_user_presence(BOOLEAN, BOOLEAN, TEXT) FROM public, anon;

-- Trigger functions should never be executable by users via RPC
REVOKE EXECUTE ON FUNCTION public.protect_immutable_profile_fields() FROM public, anon, authenticated;

-- Ensure execution is explicitly granted only to authenticated users for client RPCs
GRANT EXECUTE ON FUNCTION public.accept_chat_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_chat_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_chat_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_chat_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_gender(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_presence(BOOLEAN, BOOLEAN, TEXT) TO authenticated;

-- 2. Add RLS policies for chat_request_exclusions table
ALTER TABLE public.chat_request_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only read own exclusions" ON public.chat_request_exclusions;
CREATE POLICY "Users can only read own exclusions"
  ON public.chat_request_exclusions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Deny anon access on exclusions" ON public.chat_request_exclusions;
CREATE POLICY "Deny anon access on exclusions"
  ON public.chat_request_exclusions
  FOR ALL
  TO anon
  USING (false);
