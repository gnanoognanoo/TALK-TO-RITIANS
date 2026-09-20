/**
 * ============================================================================
 * TALK TO RITIANS - College ID QR Parser Abstraction
 * ============================================================================
 * IMPORTANT:
 * We do NOT yet know the exact real-world QR format on Rajalakshmi Institute of
 * Technology student ID cards. This parser abstraction decouples the scanning
 * interface from the payload format, supporting multiple format strategies.
 *
 * It provides a development-only mock format for local testing, explicitly
 * marked with `isMockData: true`.
 */

import { ParsedCollegeQrResult, DetectedQrFormat, ExtractedStudentFields } from '../types';

/**
 * Normalizes keys into canonical student field names.
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
 * Strategy 1: JSON Parser (handles both development mock JSON and standard JSON payloads).
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
  // Check if it contains common delimiters: pipe, newline, or semicolon
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
 * Strategy 3: URL Reference / Token Parser.
 */
function tryParseUrl(rawValue: string): ParsedCollegeQrResult | null {
  try {
    const trimmed = rawValue.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return null;
    }

    const url = new URL(trimmed);
    const fields: ExtractedStudentFields = {
      rawAttributes: {},
    };

    url.searchParams.forEach((val, key) => {
      const normalizedKey = normalizeFieldKey(key);
      fields[normalizedKey] = val;
      if (fields.rawAttributes) {
        fields.rawAttributes[key] = val;
      }
    });

    const validationErrors: string[] = [];
    if (!fields.name) validationErrors.push('Missing student name in URL parameters.');
    if (!fields.department) validationErrors.push('Missing department in URL parameters.');
    if (!fields.batch) validationErrors.push('Missing batch in URL parameters.');

    return {
      rawValue,
      formatDetected: 'url_reference',
      fields,
      validStructure: validationErrors.length === 0,
      isMockData: url.hostname.includes('test') || url.hostname.includes('mock'),
      validationErrors,
    };
  } catch {
    return null;
  }
}

/**
 * Master parser: Evaluates candidate formats in sequence without assuming
 * an official RIT QR specification.
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

  // Try Strategy 1: JSON
  const jsonResult = tryParseJson(trimmed);
  if (jsonResult) return jsonResult;

  // Try Strategy 2: Delimited Key-Value
  const delimitedResult = tryParseDelimited(trimmed);
  if (delimitedResult) return delimitedResult;

  // Try Strategy 3: URL
  const urlResult = tryParseUrl(trimmed);
  if (urlResult) return urlResult;

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
      'Unrecognized QR format. The scanned code does not contain recognizable student attributes (name, department, batch).',
    ],
  };
}

/**
 * Pre-configured development mock samples for offline / local UI testing.
 * NEVER present mock validation as actual RIT institutional verification.
 */
export const MOCK_COLLEGE_QR_SAMPLES = {
  /**
   * Standard valid mock student from Computer Science & Engineering.
   */
  validMockCSE: JSON.stringify({
    name: 'Sample Student',
    department: 'CSE',
    batch: '2025-2029',
    studentReference: 'TEST123',
    mock: true,
  }),

  /**
   * Second valid mock student from Electronics & Communication Engineering.
   */
  validMockECE: JSON.stringify({
    name: 'Priya Raman',
    department: 'ECE',
    batch: '2024-2028',
    studentReference: 'TEST456',
    mock: true,
  }),

  /**
   * Pipe-delimited sample format.
   */
  delimitedSample: 'NAME: Alex Chen | DEPT: AI & DS | BATCH: 2023-2027 | ID: TEST789',

  /**
   * Malformed mock student (missing department).
   */
  malformedMock: JSON.stringify({
    name: 'Incomplete Student',
    studentReference: 'TEST000',
  }),

  /**
   * Arbitrary non-card string.
   */
  invalidQr: 'https://example.com/arbitrary-external-qr-code',

  /**
   * Blank QR string.
   */
  emptyQr: '',
};

export default parseCollegeQr;
