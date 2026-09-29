-- ============================================================================
-- Migration: 20260929000003_remove_college_email_verification.sql
-- Description: Completely removes college email OTP verification features.
--              Retains physical RIT ID verification (newer IMS cards and older legacy cards).
-- ============================================================================

-- 1. Drop exclusively college-email RPC functions
DROP FUNCTION IF EXISTS public.invalidate_pending_college_email_otp(TEXT);
DROP FUNCTION IF EXISTS public.verify_college_email_otp(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.request_college_email_otp(TEXT, TEXT, INTEGER);

-- 2. Drop exclusively college-email OTP storage table and associated indexes/policies
DROP TABLE IF EXISTS public.college_email_otps CASCADE;
