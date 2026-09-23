/**
 * ============================================================================
 * Supabase Edge Function: verify-rit-id
 * ============================================================================
 * Handles server-side official RIT ID verification:
 * 1. Verifies caller is authenticated via Supabase session
 * 2. Strictly validates that QR URL belongs to ims.ritchennai.edu.in (HTTPS, no SSRF)
 * 3. Safely fetches the official webpage server-side with strict redirect checking,
 *    timeout (6s), and size limits (512KB)
 * 4. Extracts official student fields (Name, Register Number, Course, Batch)
 * 5. Normalizes Course -> canonical department and validates Batch
 * 6. Invokes PostgreSQL RPC verify_and_link_college_identity to enforce
 *    deterministic server-side identity hashing and 1-to-1 uniqueness
 * 7. Returns minimal verified fields (never raw HTML, photos, or unrelated data)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const APPROVED_RIT_DOMAIN = "ims.ritchennai.edu.in";
const MAX_REDIRECTS = 2;
const MAX_PAGE_BYTES = 524288; // 512 KB
const FETCH_TIMEOUT_MS = 6000; // 6 seconds

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Validates the candidate URL strictly against SSRF and host spoofing attacks.
 */
function validateRitUrl(candidateUrl: string): { isValid: boolean; url?: URL; error?: string; errorCode?: string } {
  if (!candidateUrl || typeof candidateUrl !== "string") {
    return { isValid: false, errorCode: "INVALID_QR", error: "This QR is not a recognized RIT student ID." };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidateUrl.trim());
  } catch {
    return { isValid: false, errorCode: "INVALID_QR", error: "This QR is not a recognized RIT student ID." };
  }

  if (parsed.protocol !== "https:") {
    return { isValid: false, errorCode: "INSECURE_PROTOCOL", error: "Official RIT verification requires a secure HTTPS link." };
  }

  if (parsed.username || parsed.password) {
    return { isValid: false, errorCode: "INVALID_QR", error: "This QR contains invalid credentials in URL." };
  }

  if (parsed.port && parsed.port !== "443" && parsed.port !== "") {
    return { isValid: false, errorCode: "INVALID_QR", error: "Custom ports are not allowed for official RIT verification." };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.startsWith("[") || hostname.includes(":");
  const isLocal = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");

  if (isIpv4 || isIpv6 || isLocal || hostname !== APPROVED_RIT_DOMAIN) {
    return { isValid: false, errorCode: "UNSUPPORTED_DOMAIN", error: "This QR does not point to the official RIT verification service." };
  }

  return { isValid: true, url: parsed };
}

/**
 * Decodes standard HTML entities.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Strips HTML tags and normalizes whitespace.
 */
function stripHtml(str: string): string {
  return decodeHtmlEntities(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes label to field type.
 */
function matchFieldType(rawLabel: string): "name" | "registerNumber" | "course" | "batch" | null {
  const clean = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (
    clean.includes("registerno") ||
    clean.includes("registernumber") ||
    clean.includes("regno") ||
    clean.includes("registrationno") ||
    clean.includes("registrationnumber") ||
    clean.includes("rollno") ||
    clean.includes("rollnumber") ||
    clean === "regno"
  ) {
    return "registerNumber";
  }

  if (
    clean.includes("studentname") ||
    clean.includes("candidatename") ||
    clean.includes("fullname") ||
    clean === "name" ||
    clean.startsWith("nameof")
  ) {
    return "name";
  }

  if (
    clean.includes("course") ||
    clean.includes("degree") ||
    clean.includes("branch") ||
    clean.includes("programme") ||
    clean.includes("program")
  ) {
    return "course";
  }

  if (
    clean.includes("batch") ||
    clean.includes("academicyear") ||
    clean.includes("yearofadmission") ||
    clean === "batch"
  ) {
    return "batch";
  }

  return null;
}

/**
 * Normalizes course string to canonical department code.
 */
function normalizeDepartment(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "RIT";

  const clean = raw
    .trim()
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/\./g, "")
    .replace(/[-_/]/g, " ");

  if (clean.includes("BUSINESS") || clean.includes("CSBS") || /\bCSBS\b/.test(clean)) return "CSBS";
  if (clean.includes("DATA SCIENCE") || /\b(AI\s*DS|AIDS|AI\s*AND\s*DS)\b/.test(clean)) return "AI/DS";
  if (clean.includes("MACHINE LEARNING") || /\b(AI\s*ML|AIML|AI\s*AND\s*ML)\b/.test(clean)) return "AI/ML";
  if (clean.includes("COMPUTER SCIENCE") || /\bCSE\b/.test(clean) || clean === "CS") return "CSE";
  if (clean.includes("INFORMATION TECHNOLOGY") || clean.includes("INFORMATION") || /\bIT\b/.test(clean)) return "IT";
  if ((clean.includes("ELECTRONICS") && clean.includes("COMMUNICATION")) || /\bECE\b/.test(clean)) return "ECE";
  if (clean.includes("ELECTRICAL") || /\bEEE\b/.test(clean)) return "EEE";
  if (clean.includes("MECHANICAL") || /\bMECH\b/.test(clean)) return "MECH";

  return "RIT";
}

/**
 * Normalizes batch string into YYYY-YYYY format.
 */
function normalizeBatch(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "2024-2028";
  const clean = raw
    .trim()
    .replace(/[\u2013\u2014–—]/g, "-")
    .replace(/\s*-\s*/g, "-");
  if (/^\d{4}-\d{4}$/.test(clean)) return clean;
  const shortMatch = clean.match(/^(\d{4})-(\d{2})$/);
  if (shortMatch) {
    const century = shortMatch[1].slice(0, 2);
    return `${shortMatch[1]}-${century}${shortMatch[2]}`;
  }
  return clean;
}

/**
 * Extracts student fields from official RIT page HTML.
 */
function parseRitHtml(html: string): { success: boolean; data?: { name: string; registerNumber: string; course: string; batch: string }; error?: string } {
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  const rawExtracted: Partial<Record<"name" | "registerNumber" | "course" | "batch", string>> = {};

  // Strategy A: Table row extraction
  const trMatches = cleanHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cells = tr.match(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
    if (cells && cells.length >= 2) {
      const labelText = stripHtml(cells[0]);
      const valueText = stripHtml(cells[1]);
      const fieldType = matchFieldType(labelText);
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
  }

  // Strategy B: Definition lists (<dt>/<dd>)
  const dtMatches = Array.from(cleanHtml.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi));
  for (const match of dtMatches) {
    const labelText = stripHtml(match[1]);
    const valueText = stripHtml(match[2]);
    const fieldType = matchFieldType(labelText);
    if (fieldType && valueText && !rawExtracted[fieldType]) {
      rawExtracted[fieldType] = valueText;
    }
  }

  // Strategy C: Div / Span label pairs
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const inlinePairRegex = /<(?:label|span|strong|b|p|div)\b[^>]*>([^<:]{2,40})[:\-]?<\/(?:label|span|strong|b|p|div)>\s*<(?:span|div|p|dd)\b[^>]*>([^<]{2,100})<\/(?:span|div|p|dd)>/gi;
    let match: RegExpExecArray | null;
    while ((match = inlinePairRegex.exec(cleanHtml)) !== null) {
      const labelText = stripHtml(match[1]);
      const valueText = stripHtml(match[2]);
      const fieldType = matchFieldType(labelText);
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
  }

  // Strategy D: Text regex fallback
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const strippedText = stripHtml(cleanHtml);

    if (!rawExtracted.name) {
      const nameMatch = strippedText.match(/(?:Student\s*Name|Candidate\s*Name|Full\s*Name|Name)\s*[:\-]\s*([A-Za-z\s.]{2,80}?)(?=(?:Register|Reg\b|Roll|Course|Branch|Batch|Degree|\n|$))/i);
      if (nameMatch && nameMatch[1].trim()) rawExtracted.name = nameMatch[1].trim();
    }
    if (!rawExtracted.registerNumber) {
      const regMatch = strippedText.match(/(?:Register\s*(?:No|Number)|Registration\s*(?:No|Number)|Reg\s*No\.?|Roll\s*(?:No|Number))\s*[:\-]?\s*([A-Za-z0-9]{4,30})/i);
      if (regMatch && regMatch[1].trim()) rawExtracted.registerNumber = regMatch[1].trim();
    }
    if (!rawExtracted.course) {
      const courseMatch = strippedText.match(/(?:Course|Degree\s*(?:&|and|\/)?\s*Branch|Branch|Degree)\s*[:\-]\s*([A-Za-z0-9&.\/\s\-]{2,80}?)(?=(?:Batch|Year|Academic|Register|Reg\b|Roll|Name|\n|$))/i);
      if (courseMatch && courseMatch[1].trim()) rawExtracted.course = courseMatch[1].trim();
    }
    if (!rawExtracted.batch) {
      const batchMatch = strippedText.match(/(?:Batch|Academic\s*Batch|Academic\s*Year)\s*[:\-]\s*(\d{4}\s*[-–]\s*\d{2,4})/i);
      if (batchMatch && batchMatch[1].trim()) rawExtracted.batch = batchMatch[1].trim().replace("–", "-");
    }
  }

  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    return { success: false, error: "The RIT verification page did not contain the expected student information." };
  }

  return {
    success: true,
    data: {
      name: rawExtracted.name.trim().replace(/\s+/g, " "),
      registerNumber: rawExtracted.registerNumber.trim().toUpperCase().replace(/\s+/g, ""),
      course: rawExtracted.course.trim().replace(/\s+/g, " "),
      batch: normalizeBatch(rawExtracted.batch),
    },
  };
}

/**
 * Safely fetches an official RIT webpage server-side with strict redirect checking.
 */
async function fetchOfficialRitPage(targetUrl: string): Promise<{ success: boolean; html?: string; error?: string; errorCode?: string }> {
  let currentUrl = targetUrl;
  let redirects = 0;

  while (redirects <= MAX_REDIRECTS) {
    const val = validateRitUrl(currentUrl);
    if (!val.isValid) {
      return { success: false, errorCode: val.errorCode || "UNSUPPORTED_DOMAIN", error: val.error };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": "TalkToRITians-Verifier/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle Redirects
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("Location");
        if (!location) {
          return { success: false, errorCode: "RIT_PAGE_UNAVAILABLE", error: "Received redirect with missing Location header." };
        }

        const nextUrl = new URL(location, currentUrl).toString();
        const nextValidation = validateRitUrl(nextUrl);
        if (!nextValidation.isValid) {
          return { success: false, errorCode: "UNSUPPORTED_DOMAIN", error: "Official verification redirected to an untrusted domain." };
        }

        currentUrl = nextUrl;
        redirects++;
        continue;
      }

      if (!response.ok) {
        return { success: false, errorCode: "RIT_PAGE_UNAVAILABLE", error: `Official RIT page returned HTTP status ${response.status}.` };
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        return { success: false, errorCode: "INVALID_RIT_PAGE", error: "Official RIT verification did not return an HTML webpage." };
      }

      // Read text with size limit
      const text = await response.text();
      if (text.length > MAX_PAGE_BYTES) {
        return { success: false, errorCode: "INVALID_RIT_PAGE", error: "RIT verification page exceeded maximum allowed size." };
      }

      return { success: true, html: text };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("abort") || errMsg.includes("timeout")) {
        return { success: false, errorCode: "RIT_PAGE_UNAVAILABLE", error: "Official RIT verification timed out. Please try again." };
      }
      return { success: false, errorCode: "RIT_PAGE_UNAVAILABLE", error: "Unable to connect to the official RIT verification portal." };
    }
  }

  return { success: false, errorCode: "RIT_PAGE_UNAVAILABLE", error: "Too many redirects during official RIT verification." };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "METHOD_NOT_ALLOWED", message: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Authenticate user from session token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "UNAUTHENTICATED",
          message: "You must be signed in with your personal account to link a college identity.",
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
          message: "You must be signed in with your personal account to link a college identity.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request payload
    let body: { qrUrl?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "INVALID_REQUEST", message: "Malformed JSON body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qrUrl = body?.qrUrl;
    if (!qrUrl || typeof qrUrl !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "INVALID_QR", message: "Missing QR URL in verification request." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Strict URL validation
    const urlValidation = validateRitUrl(qrUrl);
    if (!urlValidation.isValid) {
      return new Response(
        JSON.stringify({ success: false, error: urlValidation.errorCode, message: urlValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Secure server-side fetch of official RIT webpage
    const fetchResult = await fetchOfficialRitPage(qrUrl);
    if (!fetchResult.success || !fetchResult.html) {
      return new Response(
        JSON.stringify({ success: false, error: fetchResult.errorCode || "RIT_PAGE_UNAVAILABLE", message: fetchResult.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Parse student fields from HTML
    const parseResult = parseRitHtml(fetchResult.html);
    if (!parseResult.success || !parseResult.data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "INVALID_RIT_PAGE",
          message: parseResult.error || "The RIT verification page did not contain the expected student information.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { name, registerNumber, course, batch } = parseResult.data;
    const departmentCode = normalizeDepartment(course);

    // 6. Invoke atomic PostgreSQL RPC to link identity & enforce 1-to-1 uniqueness
    const { data: linkData, error: linkError } = await userClient.rpc("verify_and_link_college_identity", {
      p_student_ref: registerNumber,
      p_name: name,
      p_department: departmentCode,
      p_batch: batch,
      p_qr_metadata: {
        source: "RIT_OFFICIAL_PAGE",
        officialHost: APPROVED_RIT_DOMAIN,
        verifiedAt: new Date().toISOString(),
        courseRaw: course,
      },
      p_cooldown_hours: 0,
    });

    if (linkError) {
      console.error("[verify-rit-id] Database RPC error:", linkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "VERIFICATION_FAILED",
          message: linkError.message || "Failed to link identity on server.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rpcResponse = linkData as {
      success?: boolean;
      error?: string;
      message?: string;
      already_linked_to_self?: boolean;
      college_identity_id?: string;
      identity_hash_preview?: string;
      verified_at?: string;
    } | null;

    if (rpcResponse && rpcResponse.success === false) {
      const isDuplicate = rpcResponse.error === "CARD_ALREADY_LINKED";
      return new Response(
        JSON.stringify({
          success: false,
          error: rpcResponse.error || "VERIFICATION_REJECTED",
          message: isDuplicate
            ? "This college identity is already linked to another account."
            : rpcResponse.message || "Verification rejected.",
        }),
        { status: isDuplicate ? 409 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Success: Return minimal verified result to caller
    return new Response(
      JSON.stringify({
        valid: true,
        success: true,
        source: "RIT_OFFICIAL_PAGE",
        name,
        registerNumber,
        course,
        department: departmentCode,
        batch,
        officialHost: APPROVED_RIT_DOMAIN,
        collegeIdentityId: rpcResponse?.college_identity_id,
        identityHashPreview: rpcResponse?.identity_hash_preview,
        alreadyLinkedToSelf: Boolean(rpcResponse?.already_linked_to_self),
        verifiedAt: rpcResponse?.verified_at || new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[verify-rit-id] Unexpected error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "SERVER_ERROR",
        message: "An internal server error occurred during verification.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
