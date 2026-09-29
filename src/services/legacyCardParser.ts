/**
 * ============================================================================
 * TALK TO RITIANS - Legacy / Senior RIT ID Card Parser & Cross-Checker
 * ============================================================================
 * Handles older/senior RIT ID cards that encode a raw numeric register number
 * in the QR code (e.g. 2117XXXXXXXXX).
 *
 * Core Security Invariants:
 * 1. The numeric QR by itself NEVER marks the user verified.
 * 2. The front of the card must be scanned and cross-checked via local OCR.
 * 3. normalizedQRNumber === normalizedPrintedRegisterNumber MUST be TRUE.
 * 4. Extracts ONLY Student Name, Register Number, Department, Batch.
 * 5. Strictly discards extraneous PII: phone, address, DOB, emergency contact, blood group.
 * 6. Zero image persistence: camera frames and OCR buffers are discarded immediately.
 */

import { normalizeDepartment, normalizeBatch } from '../config/profileConfig';

export interface ExtractedLegacyCardFields {
  registerNumber?: string;
  name?: string;
  department?: string;
  batch?: string;
}

export interface LegacyCardOcrResult {
  success: boolean;
  fields?: ExtractedLegacyCardFields;
  error?: string;
  errorCode?: 'ID_NUMBER_MISMATCH' | 'OCR_PARSE_FAILED' | 'MISSING_REGISTER_NUMBER';
}

/**
 * Normalizes a register number for strict equality comparison.
 * Strips whitespace, hyphens, slashes, and leading labels.
 */
export function normalizeRegisterNumber(rawNumber?: string | null): string {
  if (!rawNumber || typeof rawNumber !== 'string') return '';
  return rawNumber
    .trim()
    .toUpperCase()
    .replace(/^[^0-9]*/, '') // Remove leading non-digits (e.g. "REG NO:")
    .replace(/[^A-Z0-9]/g, ''); // Keep only alphanumeric, no spaces/dashes
}

/**
 * Checks whether a candidate string conforms to a conservative numeric RIT ID format.
 * RIT / Anna University register numbers are typically 10 to 14 digits (often starting with 2117).
 */
export function isLegacyNumericRitQr(candidate: string): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  // Strictly digits only, reasonable length (8 to 16 digits)
  return /^\d{8,16}$/.test(trimmed);
}

/**
 * Strips sensitive PII lines from OCR text before processing.
 * Discards: phone numbers, addresses, DOB, blood group, emergency contacts.
 */
export function sanitizeOcrText(rawOcrText: string): string {
  if (!rawOcrText) return '';

  return rawOcrText
    .split('\n')
    .filter((line) => {
      const clean = line.trim().toLowerCase();
      // Discard phone numbers
      if (/(?:phone|mobile|cell|contact|tel|ph|emergency)\s*[:\-]?\s*\+?\d{8,}/i.test(clean)) return false;
      if (/\b\d{10}\b/.test(clean) && !clean.includes('reg') && !clean.includes('2117')) return false;

      // Discard Blood Group (e.g. O+, A+, B+, AB-, etc.)
      if (/(?:blood\s*group|b\.g\b|bg\b)\s*[:\-]?\s*(?:a|b|ab|o)[+-]/i.test(clean)) return false;
      if (/\b(?:a|b|ab|o)[+-]\s*(?:ve)?\b/i.test(clean)) return false;

      // Discard Date of Birth
      if (/(?:dob|d\.o\.b|date\s*of\s*birth)\s*[:\-]?\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/i.test(clean)) return false;

      // Discard Address / Location lines
      if (/(?:address|residence|street|road|nagar|chennai|tamil\s*nadu|pincode|pin\s*code|pin)\b/i.test(clean)) {
        if (!clean.includes('rajalakshmi') && !clean.includes('institute')) return false;
      }

      return true;
    })
    .join('\n');
}

/**
 * Parses raw OCR text extracted from the front of an RIT ID card.
 * Extracts: Student Name, Register Number, Department / Course, Batch.
 */
export function parseLegacyCardOcrText(rawOcrText: string): ExtractedLegacyCardFields {
  const sanitized = sanitizeOcrText(rawOcrText);
  const lines = sanitized.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let extractedRegNo: string | undefined;
  let extractedName: string | undefined;
  let extractedDept: string | undefined;
  let extractedBatch: string | undefined;

  // 1. Find Register Number:
  // Look for line containing "Register", "Reg No", "Roll No", or Anna University RIT prefix "2117"
  for (const line of lines) {
    const regLabelMatch = line.match(/(?:Register\s*(?:No\.?|Number)|Regd?\s*(?:No\.?|Number)|Registration|Roll\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9]{8,16})/i);
    if (regLabelMatch) {
      extractedRegNo = normalizeRegisterNumber(regLabelMatch[1]);
      break;
    }

    // Direct standalone numeric match for 2117XXXXXXXX pattern (RIT college code 2117)
    const direct2117Match = line.match(/\b(2117\d{6,10})\b/);
    if (direct2117Match) {
      extractedRegNo = direct2117Match[1];
      break;
    }

    // Any generic 10-14 digit sequence
    const genericDigitsMatch = line.match(/\b(\d{10,14})\b/);
    if (genericDigitsMatch && !extractedRegNo) {
      extractedRegNo = genericDigitsMatch[1];
    }
  }

  // 2. Find Batch / Academic Year:
  for (const line of lines) {
    const batchMatch = line.match(/\b(20\d{2}\s*[-–]\s*(?:20)?\d{2})\b/);
    if (batchMatch) {
      const normB = normalizeBatch(batchMatch[1]);
      if (normB) extractedBatch = normB;
      break;
    }
  }

  // 3. Find Department / Course:
  for (const line of lines) {
    const deptMatch = line.match(/(?:Department\s*of|Dept|Course|Branch)?\s*[:\-]?\s*(COMPUTER\s*SCIENCE|INFORMATION\s*TECHNOLOGY|ELECTRONICS|ELECTRICAL|MECHANICAL|ARTIFICIAL\s*INTELLIGENCE|AI\s*&?\s*DS|AIDS|AIML|CSE|IT|ECE|EEE|MECH|CSBS|CCE)\b/i);
    if (deptMatch) {
      const canonical = normalizeDepartment(deptMatch[1]);
      if (canonical && canonical !== 'RIT') {
        extractedDept = canonical;
        break;
      }
    }
  }

  // 4. Find Student Name:
  // Usually appears after institutional header ("RAJALAKSHMI INSTITUTE...") and before/near Register Number
  for (const line of lines) {
    const lower = line.toLowerCase();
    // Skip institutional title, headers, or field labels
    if (
      lower.includes('rajalakshmi') ||
      lower.includes('institute') ||
      lower.includes('technology') ||
      lower.includes('identity') ||
      lower.includes('card') ||
      lower.includes('chennai') ||
      lower.includes('student') ||
      lower.includes('department') ||
      lower.includes('register') ||
      lower.includes('reg') ||
      lower.includes('roll') ||
      lower.includes('batch') ||
      lower.includes('valid') ||
      /^\d+$/.test(line)
    ) {
      continue;
    }

    // Name line: usually 2 to 4 words of uppercase letters (e.g. "K. GNANESHWAR" or "ARUN KUMAR S")
    if (/^[A-Za-z.\s]{3,40}$/.test(line) && line.replace(/[^A-Za-z]/g, '').length >= 3) {
      extractedName = line.trim();
      break;
    }
  }

  return {
    registerNumber: extractedRegNo,
    name: extractedName,
    department: extractedDept,
    batch: extractedBatch,
  };
}

/**
 * Cross-checks the QR numeric value against the printed Register Number extracted via OCR.
 *
 * CRITICAL RULE:
 * normalizedQRNumber === normalizedPrintedRegisterNumber MUST be TRUE.
 */
export function crossCheckLegacyCard(
  qrNumericValue: string,
  printedRegisterNumber: string
): { matches: boolean; normalizedQr: string; normalizedPrinted: string; error?: string } {
  const normQr = normalizeRegisterNumber(qrNumericValue);
  const normPrinted = normalizeRegisterNumber(printedRegisterNumber);

  if (!normQr) {
    return {
      matches: false,
      normalizedQr: '',
      normalizedPrinted: normPrinted,
      error: 'Invalid QR numeric identifier.',
    };
  }

  if (!normPrinted) {
    return {
      matches: false,
      normalizedQr: normQr,
      normalizedPrinted: '',
      error: "We couldn't read the register number from the front of the card. Please ensure the card is clear and well-lit.",
    };
  }

  const matches = normQr === normPrinted;

  return {
    matches,
    normalizedQr: normQr,
    normalizedPrinted: normPrinted,
    error: matches
      ? undefined
      : 'The QR and printed student number do not match. Please scan the same physical RIT ID card again.',
  };
}
