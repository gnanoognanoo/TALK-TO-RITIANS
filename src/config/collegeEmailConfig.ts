/**
 * ============================================================================
 * TALK TO RITIANS - Approved Institutional College Email Domains
 * ============================================================================
 * Centralized configuration of approved RIT institutional email domains.
 * Supports canonical institutional domain, departmental subdomains, and campus domains.
 *
 * CRITICAL SECURITY INVARIANT:
 * Exact domain comparison ONLY. Substring, prefix, or loose contains checks
 * are strictly forbidden to prevent attacker spoofing like:
 * - college.edu.attacker.com
 * - fakecollege.edu
 * - college.edu.example.com
 */

export const ALLOWED_RIT_EMAIL_DOMAINS: readonly string[] = Object.freeze([
  'ritchennai.edu.in',
  'cse.ritchennai.edu.in',
  'ece.ritchennai.edu.in',
  'eee.ritchennai.edu.in',
  'it.ritchennai.edu.in',
  'mech.ritchennai.edu.in',
  'aids.ritchennai.edu.in',
  'csbs.ritchennai.edu.in',
  'cce.ritchennai.edu.in',
  'aiml.ritchennai.edu.in',
  'rajalakshmi.edu.in',
]);

export interface CollegeEmailValidationResult {
  isValid: boolean;
  normalizedEmail?: string;
  domain?: string;
  error?: string;
}

/**
 * Validates whether an email has an approved RIT institutional domain.
 * Uses exact match against ALLOWED_RIT_EMAIL_DOMAINS.
 */
export function validateCollegeEmailDomain(rawEmail: string): CollegeEmailValidationResult {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return {
      isValid: false,
      error: 'Enter a valid RIT institutional email address.',
    };
  }

  const trimmed = rawEmail.trim().toLowerCase();

  // Basic RFC 5322 compliant email format validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
  const match = trimmed.match(emailRegex);

  if (!match) {
    return {
      isValid: false,
      error: 'Enter a valid RIT institutional email address.',
    };
  }

  const domain = match[1].toLowerCase();

  // STRICT EXACT MATCH: Domain must equal one of the approved domains exactly
  const isApproved = ALLOWED_RIT_EMAIL_DOMAINS.includes(domain);

  if (!isApproved) {
    return {
      isValid: false,
      domain,
      error: 'Enter a valid RIT institutional email address.',
    };
  }

  return {
    isValid: true,
    normalizedEmail: trimmed,
    domain,
  };
}

export default ALLOWED_RIT_EMAIL_DOMAINS;
