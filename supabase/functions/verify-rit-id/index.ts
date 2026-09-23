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
 * Decodes standard HTML entities and normalizes invisible Unicode characters.
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
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Normalize invisible Unicode: NBSP, zero-width space/joiner, soft hyphen
    .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, " ");
}

/**
 * Strips HTML tags, replaces <br> with spaces, and normalizes whitespace.
 */
function stripHtml(str: string): string {
  return decodeHtmlEntities(str)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes label to field type.
 * Covers all known label variants across Indian educational institution portals.
 */
function matchFieldType(rawLabel: string): "name" | "registerNumber" | "course" | "batch" | null {
  const clean = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Register Number — broadened to cover regd, enrolment, admission, hall ticket, USN
  if (
    clean.includes("registerno") ||
    clean.includes("registernumber") ||
    clean.includes("regno") ||
    clean.includes("registrationno") ||
    clean.includes("registrationnumber") ||
    clean.includes("regdno") ||
    clean.includes("regdnumber") ||
    clean.includes("registrationid") ||
    clean.includes("regid") ||
    clean.includes("rollno") ||
    clean.includes("rollnumber") ||
    clean.includes("enrolmentno") ||
    clean.includes("enrollmentno") ||
    clean.includes("enrolmentnumber") ||
    clean.includes("enrollmentnumber") ||
    clean.includes("admissionno") ||
    clean.includes("admissionnumber") ||
    clean.includes("hallticketno") ||
    clean.includes("hallTicketnumber") ||
    clean.includes("usn") ||
    clean.includes("studentid") ||
    clean === "regno" ||
    clean === "regdno" ||
    clean === "rollno" ||
    clean === "usn"
  ) {
    return "registerNumber";
  }

  // Student Name
  if (
    clean.includes("studentname") ||
    clean.includes("candidatename") ||
    clean.includes("fullname") ||
    clean.includes("pupilname") ||
    clean === "name" ||
    clean.startsWith("nameof")
  ) {
    return "name";
  }

  // Course / Degree / Branch
  if (
    clean.includes("course") ||
    clean.includes("degree") ||
    clean.includes("branch") ||
    clean.includes("programme") ||
    clean.includes("program") ||
    clean.includes("specialization") ||
    clean.includes("specialisation") ||
    clean.includes("stream")
  ) {
    return "course";
  }

  // Batch / Academic Year
  if (
    clean.includes("batch") ||
    clean.includes("academicyear") ||
    clean.includes("yearofadmission") ||
    clean.includes("yearofjoin") ||
    clean.includes("joiningyear") ||
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
 * Uses 6 progressive strategies from structured DOM to text regex.
 * Only registerNumber is mandatory; other fields use safe defaults.
 */
function parseRitHtml(html: string): { success: boolean; data?: { name: string; registerNumber: string; course: string; batch: string }; error?: string; diagnostics?: Record<string, boolean> } {
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const rawExtracted: Partial<Record<"name" | "registerNumber" | "course" | "batch", string>> = {};

  // Strategy A: Table row extraction (<tr><td>Label</td><td>Value</td></tr>)
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

  // Strategy C: Div / Span label pairs (<span>Label</span><span>Value</span>)
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const inlinePairRegex = /<(?:label|span|strong|b|p|div)\b[^>]*>([^<:]{2,40})[:\-]?<\/(?:label|span|strong|b|p|div)>\s*<(?:span|div|p|dd|input|a)\b[^>]*>([^<]{2,100})<\/(?:span|div|p|dd|input|a)>/gi;
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

  // Strategy E: Input/form value extraction (ASP.NET, PHP-rendered pages)
  // Handles: <label>Register No.</label><input value="210821104055" />
  //          <td>Register Number</td><td><input value="210821104055" readonly/></td>
  //          <span>Name</span> <input type="text" value="JOHN DOE" disabled />
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    // Match label element followed by input/textarea with value attribute
    const labelInputRegex = /<(?:label|span|strong|b|p|div|td|th)\b[^>]*>([\s\S]{2,60}?)<\/(?:label|span|strong|b|p|div|td|th)>[\s\S]{0,100}?<(?:input|textarea)\b[^>]*?\bvalue\s*=\s*["']([^"']{2,100})["'][^>]*\/?>/gi;
    let match: RegExpExecArray | null;
    while ((match = labelInputRegex.exec(cleanHtml)) !== null) {
      const labelText = stripHtml(match[1]);
      const valueText = match[2].trim();
      const fieldType = matchFieldType(labelText);
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
  }

  // Strategy E2: Standalone input with name/id attribute matching known field names
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const namedInputRegex = /<input\b[^>]*?\b(?:name|id)\s*=\s*["']([^"']{2,60})["'][^>]*?\bvalue\s*=\s*["']([^"']{2,100})["'][^>]*\/?>/gi;
    let match: RegExpExecArray | null;
    while ((match = namedInputRegex.exec(cleanHtml)) !== null) {
      const fieldType = matchFieldType(match[1]);
      const valueText = match[2].trim();
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
    // Also try reversed order: value before name
    const namedInputRegex2 = /<input\b[^>]*?\bvalue\s*=\s*["']([^"']{2,100})["'][^>]*?\b(?:name|id)\s*=\s*["']([^"']{2,60})["'][^>]*\/?>/gi;
    while ((match = namedInputRegex2.exec(cleanHtml)) !== null) {
      const fieldType = matchFieldType(match[2]);
      const valueText = match[1].trim();
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
  }

  // Strategy F: Colon-separated label:value within a single element
  // Handles: <td>Register No. : 210821104055</td>
  //          <p>Student Name : JOHN DOE</p>
  //          <div>Course : B.E. Computer Science</div>
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const singleElementRegex = /<(?:td|th|p|div|span|li)\b[^>]*>([\s\S]{4,200}?)<\/(?:td|th|p|div|span|li)>/gi;
    let match: RegExpExecArray | null;
    while ((match = singleElementRegex.exec(cleanHtml)) !== null) {
      const innerText = stripHtml(match[1]);
      // Look for "Label : Value" or "Label - Value" pattern
      const kvMatch = innerText.match(/^([^:]{2,40})\s*[:\-]\s*(.{2,100})$/i);
      if (kvMatch) {
        const fieldType = matchFieldType(kvMatch[1].trim());
        const valueText = kvMatch[2].trim();
        if (fieldType && valueText && !rawExtracted[fieldType]) {
          rawExtracted[fieldType] = valueText;
        }
      }
    }
  }

  // Strategy D: Text regex fallback (broadened patterns)
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const strippedText = stripHtml(cleanHtml);

    if (!rawExtracted.name) {
      const nameMatch = strippedText.match(/(?:Student\s*Name|Candidate\s*Name|Full\s*Name|Name\s*of\s*Student|Name)\s*[:\-]\s*([A-Za-z\s.]{2,80}?)(?=(?:Register|Regd|Reg\b|Roll|Enrol|Course|Branch|Batch|Degree|\n|$))/i);
      if (nameMatch && nameMatch[1].trim()) rawExtracted.name = nameMatch[1].trim();
    }
    if (!rawExtracted.registerNumber) {
      const regMatch = strippedText.match(/(?:Register\s*(?:No\.?|Number)|Regd?\.?\s*(?:No\.?|Number)|Registration\s*(?:No\.?|Number|Id)|Roll\s*(?:No\.?|Number)|Enro(?:l|ll)ment\s*(?:No\.?|Number)|Admission\s*(?:No\.?|Number)|Hall\s*Ticket\s*No\.?|Student\s*(?:Id|ID))\s*[:\-]?\s*([A-Za-z0-9\-\/]{4,30})/i);
      if (regMatch && regMatch[1].trim()) rawExtracted.registerNumber = regMatch[1].trim();
    }
    if (!rawExtracted.course) {
      const courseMatch = strippedText.match(/(?:Course|Degree\s*(?:&|and|\/)?\s*Branch|Branch|Degree|Programme|Program|Specialization|Stream)\s*[:\-]\s*([A-Za-z0-9&.\/\s\-]{2,80}?)(?=(?:Batch|Year|Academic|Register|Regd|Reg\b|Roll|Enrol|Name|\n|$))/i);
      if (courseMatch && courseMatch[1].trim()) rawExtracted.course = courseMatch[1].trim();
    }
    if (!rawExtracted.batch) {
      const batchMatch = strippedText.match(/(?:Batch|Academic\s*Batch|Academic\s*Year|Year\s*of\s*(?:Admission|Join))\s*[:\-]\s*(\d{4}\s*[-–]\s*\d{2,4})/i);
      if (batchMatch && batchMatch[1].trim()) rawExtracted.batch = batchMatch[1].trim().replace("–", "-");
    }
  }

  // Build diagnostics for safe server-side logging (no PII)
  const diagnostics = {
    hasStudentNameLabel: /student\s*name/i.test(html),
    hasRegisterNumberLabel: /register\s*(no|number)/i.test(html) || /reg[d.]?\s*(no|number)/i.test(html),
    hasCourseLabel: /course/i.test(html),
    hasBatchLabel: /batch/i.test(html),
    parsedName: Boolean(rawExtracted.name),
    parsedRegisterNumber: Boolean(rawExtracted.registerNumber),
    parsedCourse: Boolean(rawExtracted.course),
    parsedBatch: Boolean(rawExtracted.batch),
    htmlLength: html.length,
    hasTable: /<table/i.test(html),
    hasForm: /<form/i.test(html),
    hasInput: /<input/i.test(html),
  };

  // CRITICAL: Only registerNumber is mandatory for identity uniqueness.
  // Other fields use safe fallback defaults if extraction failed.
  if (!rawExtracted.registerNumber) {
    console.warn("[verify-rit-id] Parser diagnostics (no registerNumber):", JSON.stringify(diagnostics));
    return {
      success: false,
      error: "The RIT verification page did not contain the expected student information.",
      diagnostics,
    };
  }

  // Use extracted values or safe defaults
  const name = rawExtracted.name?.trim().replace(/\s+/g, " ") || "RIT Student";
  const registerNumber = rawExtracted.registerNumber.trim().toUpperCase().replace(/[\s\-]/g, "");
  const course = rawExtracted.course?.trim().replace(/\s+/g, " ") || "Unknown";
  const batch = normalizeBatch(rawExtracted.batch) || "2024-2028";

  console.log("[verify-rit-id] Parse success. Diagnostics:", JSON.stringify(diagnostics));

  return {
    success: true,
    data: { name, registerNumber, course, batch },
    diagnostics,
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
