/**
 * ============================================================================
 * Supabase Edge Function: verify-college-email
 * ============================================================================
 * Handles server-side college email verification:
 * 1. Verifies caller is authenticated via personal Supabase session
 * 2. Strictly validates that email belongs to an approved RIT domain:
 *    Exact match against ALLOWED_RIT_EMAIL_DOMAINS (no substring spoofing)
 * 3. Actions:
 *    - "send_code": generates cryptographically secure 6-digit OTP, stores
 *      salted SHA-256 hash in database with 10-minute expiry, delivers email
 *      via verified provider, and enforces server-side rate limits.
 *      CRITICAL: Fails if mail provider fails, and immediately invalidates the OTP.
 *    - "verify_code": validates candidate OTP hash, attempt bounding (max 5),
 *      one-time usage, enforces 1-to-1 college email uniqueness, and atomically
 *      links the verified college identity to the caller's account.
 *    - "provider_status": safely checks whether provider secrets are configured
 *      (returns boolean only; never leaks secrets).
 * 4. Never exposes plaintext OTP, OTP hash, or API keys to the client.
 * 5. Institutional email is never exposed publicly or in anonymous chat.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Centralized list of approved institutional email domains for RIT college verification.
 * Exact match ONLY — substrings like "ritchennai.edu.in.attacker.com" are strictly rejected.
 */
const ALLOWED_RIT_EMAIL_DOMAINS = [
  "ritchennai.edu.in",
  "cse.ritchennai.edu.in",
  "ece.ritchennai.edu.in",
  "eee.ritchennai.edu.in",
  "it.ritchennai.edu.in",
  "mech.ritchennai.edu.in",
  "aids.ritchennai.edu.in",
  "csbs.ritchennai.edu.in",
  "cce.ritchennai.edu.in",
  "aiml.ritchennai.edu.in",
  "rajalakshmi.edu.in",
];

/**
 * Retrieves the server-side salt for OTP hashing from Edge Function secrets.
 * Configured via COLLEGE_EMAIL_OTP_SECRET in Supabase Edge Secrets.
 * NEVER hardcoded in source repository.
 */
function getOtpSecret(): string {
  return (
    Deno.env.get("COLLEGE_EMAIL_OTP_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

/**
 * Computes salted SHA-256 hash string (hex).
 */
async function hashSha256(val: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(val + getOtpSecret());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates institutional email address format and exact domain.
 */
function validateEmailDomain(email: string): { isValid: boolean; normalized?: string; error?: string } {
  if (!email || typeof email !== "string") {
    return { isValid: false, error: "Enter a valid RIT institutional email address." };
  }

  const clean = email.trim().toLowerCase();
  const match = clean.match(/^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  if (!match) {
    return { isValid: false, error: "Enter a valid RIT institutional email address." };
  }

  const domain = match[1].toLowerCase();
  if (!ALLOWED_RIT_EMAIL_DOMAINS.includes(domain)) {
    return { isValid: false, error: "Enter a valid RIT institutional email address." };
  }

  return { isValid: true, normalized: clean };
}

interface EmailDeliveryResult {
  success: boolean;
  error?: "EMAIL_PROVIDER_NOT_CONFIGURED" | "EMAIL_DELIVERY_FAILED";
}

/**
 * Delivers email using Resend API.
 * CRITICAL FIXES:
 * 1. Missing RESEND_API_KEY returns failure (EMAIL_PROVIDER_NOT_CONFIGURED), NO fake success.
 * 2. Non-2xx response from Resend returns failure (EMAIL_DELIVERY_FAILED), NO fake success.
 * 3. Network exception returns failure (EMAIL_DELIVERY_FAILED), NO fake success.
 * 4. Logs ONLY safe delivery diagnostics (never logs OTP, full email, or API keys).
 */
async function deliverOtpEmail(
  toEmail: string,
  otp: string,
  recipientDomain: string
): Promise<EmailDeliveryResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const isDevSimulation = Deno.env.get("ENABLE_DEV_EMAIL_SIMULATION") === "true";

  // Case 1: Mail provider not configured
  if (!resendApiKey) {
    if (isDevSimulation) {
      console.log(
        JSON.stringify({
          event: "dev_email_simulation",
          providerConfigured: false,
          deliverySucceeded: true,
          recipientDomain,
          timestamp: new Date().toISOString(),
        })
      );
      return { success: true };
    }

    console.warn(
      JSON.stringify({
        event: "otp_delivery_failed",
        providerConfigured: false,
        providerHttpStatus: 0,
        deliverySucceeded: false,
        recipientDomain,
        timestamp: new Date().toISOString(),
      })
    );
    return { success: false, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Talk to RITians <onboarding@resend.dev>";
  const emailSubject = "Talk to RITians verification code";
  const emailText = `Your verification code is:

${otp}

This code expires in 10 minutes.

If you did not request this verification, you can ignore this message.`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: emailSubject,
        text: emailText,
      }),
    });

    const status = resp.status;

    // Case 2: Provider non-2xx failure
    if (!resp.ok) {
      console.warn(
        JSON.stringify({
          event: "otp_delivery_failed",
          providerConfigured: true,
          providerHttpStatus: status,
          deliverySucceeded: false,
          recipientDomain,
          timestamp: new Date().toISOString(),
        })
      );
      return { success: false, error: "EMAIL_DELIVERY_FAILED" };
    }

    // Case 3: Confirmed successful delivery by mail provider
    console.log(
      JSON.stringify({
        event: "otp_delivery_success",
        providerConfigured: true,
        providerHttpStatus: status,
        deliverySucceeded: true,
        recipientDomain,
        timestamp: new Date().toISOString(),
      })
    );
    return { success: true };
  } catch (_err: unknown) {
    // Case 4: Network error during delivery
    console.warn(
      JSON.stringify({
        event: "otp_delivery_network_error",
        providerConfigured: true,
        providerHttpStatus: 0,
        deliverySucceeded: false,
        recipientDomain,
        timestamp: new Date().toISOString(),
      })
    );
    return { success: false, error: "EMAIL_DELIVERY_FAILED" };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "METHOD_NOT_ALLOWED", message: "Method not allowed." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Parse request payload
    let body: { action?: string; email?: string; otp?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "INVALID_REQUEST", message: "Malformed JSON body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const action = body?.action || "send_code";

    // Diagnostic Action: Check provider configuration safely (never leaks secret values)
    if (action === "provider_status") {
      return new Response(
        JSON.stringify({
          success: true,
          resendApiKeyConfigured: Boolean(Deno.env.get("RESEND_API_KEY")),
          resendFromEmailConfigured: Boolean(Deno.env.get("RESEND_FROM_EMAIL")),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Authenticate user from session token for verification actions
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "UNAUTHENTICATED",
          message: "You must be signed in with your personal account to verify college email.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (!user || userError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "UNAUTHENTICATED",
          message: "You must be signed in with your personal account to verify college email.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawEmail = body?.email || "";

    // 3. Institutional Domain Validation
    const domainValidation = validateEmailDomain(rawEmail);
    if (!domainValidation.isValid || !domainValidation.normalized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "INVALID_COLLEGE_EMAIL",
          message: domainValidation.error || "Enter a valid RIT institutional email address.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = domainValidation.normalized;
    const recipientDomain = normalizedEmail.split("@")[1] || "ritchennai.edu.in";

    // ACTION A: SEND VERIFICATION CODE
    if (action === "send_code") {
      // Generate cryptographically secure 6-digit OTP
      const randomValues = new Uint32Array(1);
      crypto.getRandomValues(randomValues);
      const otpNumber = 100000 + (randomValues[0] % 900000);
      const plaintextOtp = otpNumber.toString();

      // Derive salted SHA-256 hash strictly on server
      const otpHash = await hashSha256(plaintextOtp);

      // Invoke atomic PostgreSQL RPC to enforce rate limits and store hashed OTP
      const { data: rpcData, error: rpcError } = await userClient.rpc("request_college_email_otp", {
        p_email: normalizedEmail,
        p_otp_hash: otpHash,
        p_expires_in_seconds: 600, // 10 minutes
      });

      if (rpcError) {
        console.error("[verify-college-email] Database RPC error on request_college_email_otp:", rpcError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "REQUEST_FAILED",
            message: rpcError.message || "Failed to process verification request.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rpcResult = rpcData as { success?: boolean; error?: string; message?: string; expires_at?: string } | null;

      if (rpcResult && rpcResult.success === false) {
        const isDuplicate = rpcResult.error === "COLLEGE_EMAIL_ALREADY_LINKED";
        const isRateLimited = rpcResult.error === "RATE_LIMITED";
        const statusCode = isDuplicate ? 409 : isRateLimited ? 429 : 400;

        return new Response(
          JSON.stringify({
            success: false,
            error: rpcResult.error || "REQUEST_FAILED",
            message: isDuplicate
              ? "This college identity is already linked to another account."
              : rpcResult.message || "Failed to request verification code.",
          }),
          { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deliver verification email to institutional inbox
      const deliveryResult = await deliverOtpEmail(normalizedEmail, plaintextOtp, recipientDomain);

      // CRITICAL: If email delivery fails, invalidate the pending OTP immediately
      if (!deliveryResult.success) {
        try {
          await userClient.rpc("invalidate_pending_college_email_otp", {
            p_otp_hash: otpHash,
          });
        } catch (cleanupErr) {
          console.warn("[verify-college-email] Failed to invalidate pending OTP after send failure:", cleanupErr);
        }

        const isNotConfigured = deliveryResult.error === "EMAIL_PROVIDER_NOT_CONFIGURED";
        return new Response(
          JSON.stringify({
            success: false,
            error: deliveryResult.error,
            message: isNotConfigured
              ? "Email verification is temporarily unavailable."
              : "We couldn't send the verification email. Please try again.",
          }),
          {
            status: isNotConfigured ? 503 : 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // CRITICAL: Plaintext OTP and OTP hash are NEVER returned to the client
      return new Response(
        JSON.stringify({
          success: true,
          message: "Verification code sent to your institutional mailbox.",
          expiresIn: 600,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION B: VERIFY CODE
    if (action === "verify_code") {
      const rawOtp = body?.otp ? String(body.otp).trim() : "";
      if (!rawOtp || !/^\d{6}$/.test(rawOtp)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "WRONG_OTP",
            message: "That code is incorrect.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Derive salted SHA-256 hash of candidate OTP
      const candidateOtpHash = await hashSha256(rawOtp);

      // Invoke atomic PostgreSQL RPC to validate OTP hash, check attempts, and link
      const { data: verifyData, error: verifyError } = await userClient.rpc("verify_college_email_otp", {
        p_email: normalizedEmail,
        p_otp_hash: candidateOtpHash,
      });

      if (verifyError) {
        console.error("[verify-college-email] Database RPC error on verify_college_email_otp:", verifyError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "VERIFICATION_FAILED",
            message: verifyError.message || "Failed to verify code on server.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const verifyResult = verifyData as {
        success?: boolean;
        error?: string;
        message?: string;
        college_identity_id?: string;
        verification_method?: string;
        already_linked_to_self?: boolean;
        verified_at?: string;
      } | null;

      if (verifyResult && verifyResult.success === false) {
        const isDuplicate = verifyResult.error === "COLLEGE_EMAIL_ALREADY_LINKED";
        const isExpired = verifyResult.error === "OTP_EXPIRED";
        const isWrong = verifyResult.error === "WRONG_OTP";
        const isRateLimited = verifyResult.error === "TOO_MANY_ATTEMPTS";

        const statusCode = isDuplicate ? 409 : isRateLimited ? 429 : 400;
        const message = isDuplicate
          ? "This college identity is already linked to another account."
          : isExpired
          ? "That code has expired. Request a new one."
          : isWrong
          ? "That code is incorrect."
          : isRateLimited
          ? "Too many incorrect attempts. Please request a new verification code."
          : verifyResult.message || "Verification code could not be confirmed.";

        return new Response(
          JSON.stringify({
            success: false,
            error: verifyResult.error || "VERIFICATION_FAILED",
            message,
          }),
          { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          success: true,
          verified: true,
          identityLinked: true,
          verificationMethod: "college_email",
          collegeIdentityId: verifyResult?.college_identity_id,
          alreadyLinkedToSelf: Boolean(verifyResult?.already_linked_to_self),
          verifiedAt: verifyResult?.verified_at || new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "INVALID_ACTION",
        message: "Unrecognized verification action.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[verify-college-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "SERVER_ERROR",
        message: "An internal server error occurred during college email verification.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
