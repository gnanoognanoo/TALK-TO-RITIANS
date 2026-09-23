/**
 * ============================================================================
 * TALK TO RITIANS - College ID QR Parser & URL Validation
 * ============================================================================
 * Supports the REAL Rajalakshmi Institute of Technology student ID QR flow:
 * Physical QR -> Official RIT URL (ims.ritchennai.edu.in) -> Secure Backend Verification.
 *
 * Strictly prevents SSRF, domain spoofing, and insecure protocols.
 * Retains development mock format support strictly for local testing.
 */

import { ParsedCollegeQrResult, DetectedQrFormat, ExtractedStudentFields } from '../types';

export const APPROVED_RIT_DOMAIN = 'ims.ritchennai.edu.in';

export interface RitQrUrlValidationResult {
  isValid: boolean;
  url?: URL;
  errorCode?: 'INVALID_URL' | 'INSECURE_PROTOCOL' | 'UNSUPPORTED_DOMAIN' | 'INVALID_QR';
  errorMessage?: string;
}

/**
 * Validates whether a raw string is a secure, official RIT student ID verification URL.
 * Strictly prevents SSRF, domain spoofing, and malicious redirections.
 */
export function validateRitQrUrl(rawValue: string): RitQrUrlValidationResult {
  if (!rawValue || typeof rawValue !== 'string') {
    return {
      isValid: false,
      errorCode: 'INVALID_QR',
      errorMessage: 'This QR is not a recognized RIT student ID.',
    };
  }

  const trimmed = rawValue.trim();

  // Quick reject non-URL formats
  if (!trimmed.includes('://')) {
    return {
      isValid: false,
      errorCode: 'INVALID_QR',
      errorMessage: 'This QR is not a recognized RIT student ID.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      errorCode: 'INVALID_QR',
      errorMessage: 'This QR is not a recognized RIT student ID.',
    };
  }

  // 1. Enforce HTTPS only (reject http, file, ftp, javascript, data, etc.)
  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      errorCode: 'INSECURE_PROTOCOL',
      errorMessage: 'Official RIT verification requires a secure HTTPS link.',
    };
  }

  // 2. Reject embedded user credentials (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      errorCode: 'INVALID_QR',
      errorMessage: 'This QR contains invalid credentials in URL.',
    };
  }

  // 3. Reject non-standard ports (must be default/443)
  if (parsed.port && parsed.port !== '443') {
    return {
      isValid: false,
      errorCode: 'INVALID_QR',
      errorMessage: 'This QR points to an unapproved network port.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Reject localhost, IP literals, loopback, private IP ranges
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.startsWith('[') || hostname.includes(':');
  const isLocal = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local');
  if (isIpv4 || isIpv6 || isLocal) {
    return {
      isValid: false,
      errorCode: 'UNSUPPORTED_DOMAIN',
      errorMessage: 'This QR does not point to the official RIT verification service.',
    };
  }

  // 5. Strict approved domain check: MUST be exactly 'ims.ritchennai.edu.in'
  // Reject: 'ritchennai.edu.in.attacker.com', 'ims.ritchennai.edu.in.attacker.com', 'google.com'
  if (hostname !== APPROVED_RIT_DOMAIN) {
    return {
      isValid: false,
      errorCode: 'UNSUPPORTED_DOMAIN',
      errorMessage: 'This QR does not point to the official RIT verification service.',
    };
  }

  return {
    isValid: true,
    url: parsed,
  };
}

/**
 * Normalizes keys into canonical student field names for dev mock parsing.
 */
function normalizeFieldKey(key: string): keyof ExtractedStudentFields | string {
  const clean = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['name', 'studentname', 'fullname', 'fname'].includes(clean)) return 'name';
  if (['dept', 'department', 'branch'].includes(clean)) return 'department';
  if (['batch', 'academicbatch', 'year', 'gradyear'].includes(clean)) return 'batch';
  if (['studentref', 'studentreference', 'rollno', 'registerno', 'regno', 'id', 'studentid'].includes(clean)) {
    return 'studentReference';
  }
  if (['email', 'collegeemail', 'studentemail'].includes(clean)) return 'collegeEmail';
  return key.trim();
}

/**
 * Strategy 1: JSON Parser (handles development mock JSON payloads).
 */
function tryParseJson(rawValue: string): ParsedCollegeQrResult | null {
  try {
    const trimmed = rawValue.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }

    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const fields: ExtractedStudentFields = {};
    const validationErrors: string[] = [];

    // Extract fields with normalization
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number') {
        const normalizedKey = normalizeFieldKey(key);
        fields[normalizedKey] = String(value).trim();
      }
    }

    // Detect if this is the designated development mock format
    const isMock =
      Boolean(fields.studentReference && String(fields.studentReference).startsWith('TEST')) ||
      Boolean(parsed.mock === true) ||
      Boolean(fields.name && fields.name.toLowerCase().includes('sample'));

    // Validate minimum structural requirements
    if (!fields.name || fields.name.trim().length === 0) {
      validationErrors.push('Missing or empty student name in QR payload.');
    }
    if (!fields.department || fields.department.trim().length === 0) {
      validationErrors.push('Missing or empty department in QR payload.');
    }
    if (!fields.batch || fields.batch.trim().length === 0) {
      validationErrors.push('Missing or empty academic batch in QR payload.');
    }

    const validStructure = validationErrors.length === 0;
    const formatDetected: DetectedQrFormat = isMock ? 'mock_json' : 'json';

    return {
      rawValue,
      formatDetected,
      fields,
      validStructure,
      isMockData: isMock,
      validationErrors,
    };
  } catch {
    return null;
  }
}

/**
 * Strategy 2: Delimited Key-Value Parser (e.g. "NAME: John | DEPT: CSE | BATCH: 2025-2029 | ID: TEST123").
 */
function tryParseDelimited(rawValue: string): ParsedCollegeQrResult | null {
  const trimmed = rawValue.trim();
  const hasDelimiter = ['|', '\n', ';'].some((delim) => trimmed.includes(delim));
  if (!hasDelimiter && !trimmed.includes(':') && !trimmed.includes('=')) {
    return null;
  }

  const delimiter = trimmed.includes('|') ? '|' : trimmed.includes('\n') ? '\n' : ';';
  const parts = trimmed.split(delimiter);

  const fields: ExtractedStudentFields = {};
  let pairCount = 0;

  for (const part of parts) {
    const separator = part.includes(':') ? ':' : part.includes('=') ? '=' : null;
    if (!separator) continue;

    const [rawKey, ...rest] = part.split(separator);
    const key = rawKey.trim();
    const val = rest.join(separator).trim();

    if (key && val) {
      const normalizedKey = normalizeFieldKey(key);
      fields[normalizedKey] = val;
      pairCount++;
    }
  }

  if (pairCount < 2) {
    return null;
  }

  const validationErrors: string[] = [];
  if (!fields.name) validationErrors.push('Missing student name in delimited payload.');
  if (!fields.department) validationErrors.push('Missing department in delimited payload.');
  if (!fields.batch) validationErrors.push('Missing batch in delimited payload.');

  const isMock = Boolean(
    (fields.studentReference && fields.studentReference.startsWith('TEST')) ||
    (fields.name && fields.name.toLowerCase().includes('sample'))
  );

  return {
    rawValue,
    formatDetected: 'delimited_kv',
    fields,
    validStructure: validationErrors.length === 0,
    isMockData: isMock,
    validationErrors,
  };
}

/**
 * Master parser: Evaluates candidate formats with primary support for the
 * REAL official RIT student ID QR (https://ims.ritchennai.edu.in).
 */
export function parseCollegeQr(rawValue: string): ParsedCollegeQrResult {
  if (!rawValue || rawValue.trim().length === 0) {
    return {
      rawValue: '',
      formatDetected: 'unknown',
      fields: {},
      validStructure: false,
      isMockData: false,
      validationErrors: ['Scanned QR code is completely empty.'],
    };
  }

  const trimmed = rawValue.trim();

  // Strategy 1: Real Official RIT URL
  if (trimmed.includes('://')) {
    const urlValidation = validateRitQrUrl(trimmed);
    if (urlValidation.isValid) {
      return {
        rawValue: trimmed,
        formatDetected: 'rit_official_url',
        fields: {
          rawAttributes: {
            qrUrl: trimmed,
            officialHost: APPROVED_RIT_DOMAIN,
          },
        },
        validStructure: true,
        isMockData: false,
        validationErrors: [],
      };
    }

    return {
      rawValue: trimmed,
      formatDetected: 'url_reference',
      fields: {
        rawAttributes: { unparsedText: trimmed },
      },
      validStructure: false,
      isMockData: false,
      validationErrors: [urlValidation.errorMessage || 'This QR is not a recognized RIT student ID.'],
    };
  }

  // Strategy 2: JSON (e.g. dev mock JSON)
  const jsonResult = tryParseJson(trimmed);
  if (jsonResult) return jsonResult;

  // Strategy 3: Delimited Key-Value (dev mock)
  const delimitedResult = tryParseDelimited(trimmed);
  if (delimitedResult) return delimitedResult;

  // Strategy 4: Fallback / Unknown format
  return {
    rawValue: trimmed,
    formatDetected: 'unknown',
    fields: {
      rawAttributes: { unparsedText: trimmed },
    },
    validStructure: false,
    isMockData: false,
    validationErrors: [
      'Unrecognized QR format. Please scan the official QR code on your RIT student ID card.',
    ],
  };
}

/**
 * Pre-configured development mock samples for offline / local UI testing.
 * NEVER present mock validation as actual RIT institutional verification.
 */
export const MOCK_COLLEGE_QR_SAMPLES = {
  validMockCSE: JSON.stringify({
    name: 'Sample Student',
    department: 'CSE',
    batch: '2025-2029',
    studentReference: 'TEST123',
    mock: true,
  }),
  validMockECE: JSON.stringify({
    name: 'Priya Raman',
    department: 'ECE',
    batch: '2024-2028',
    studentReference: 'TEST456',
    mock: true,
  }),
  delimitedSample: 'NAME: Alex Chen | DEPT: AI & DS | BATCH: 2023-2027 | ID: TEST789',
  malformedMock: JSON.stringify({
    name: 'Incomplete Student',
    studentReference: 'TEST000',
  }),
  invalidQr: 'https://example.com/arbitrary-external-qr-code',
  emptyQr: '',
};

export default parseCollegeQr;
