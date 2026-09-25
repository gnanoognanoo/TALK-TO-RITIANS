/**
 * ============================================================================
 * TALK TO RITIANS - Official RIT Student ID Page HTML Parser
 * ============================================================================
 * Parses the official RIT verification webpage hosted on ims.ritchennai.edu.in.
 * Extracts the 4 mandatory student fields:
 * 1. Student Name
 * 2. Register Number
 * 3. Course
 * 4. Batch
 *
 * Employs multi-layer structural extraction (DOM table rows, DL/DT/DD, key-value
 * divs/spans, and structured regex fallback) with whitespace normalization and
 * entity decoding.
 */

import { normalizeDepartment, normalizeBatch } from '../config/profileConfig';

export interface ExtractedRitStudentInfo {
  valid: boolean;
  source: 'RIT_OFFICIAL_PAGE';
  officialHost: 'ims.ritchennai.edu.in';
  name: string;
  registerNumber: string;
  course: string;
  department: string;
  batch: string;
  rawAttributes?: Record<string, string>;
  validationErrors?: string[];
}

export interface ParseRitPageResult {
  success: boolean;
  data?: ExtractedRitStudentInfo;
  errorCode?: 'INVALID_RIT_PAGE' | 'EMPTY_PAGE' | 'UNSUPPORTED_COURSE_FORMAT';
  errorMessage?: string;
  missingFields?: string[];
}

/**
 * Clean normalized verification result returned to the frontend.
 * Strictly guarantees that the raw register number is NOT exposed to browser consumers.
 */
export interface NormalizedRitVerificationResult {
  verified: boolean;
  name: string;
  department: string;
  batch: string;
  identityLinked: boolean;
  alreadyLinkedToSelf?: boolean;
}

export function toNormalizedVerificationResult(
  info: ExtractedRitStudentInfo,
  identityLinked: boolean = true,
  alreadyLinkedToSelf: boolean = false
): NormalizedRitVerificationResult {
  return {
    verified: true,
    name: info.name,
    department: info.department,
    batch: info.batch,
    identityLinked,
    alreadyLinkedToSelf,
  };
}

/**
 * Decodes standard HTML entities and normalizes invisible Unicode characters.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Normalize invisible Unicode: NBSP, zero-width space/joiner, soft hyphen, spaces
    .replace(/[\u00a0\u1680\u2000-\u200b\u200c\u200d\u202f\u205f\u3000\u00ad\ufeff]/g, ' ');
}

/**
 * Strips HTML tags, replaces <br> with spaces, and collapses whitespace.
 */
function stripHtml(str: string): string {
  return decodeHtmlEntities(str)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips leading/trailing punctuation and colon separators from extracted field values.
 */
function cleanFieldText(val: string): string {
  return stripHtml(val)
    .replace(/^[:\-\s]+/, '')
    .replace(/[:\-\s]+$/, '')
    .trim();
}

/**
 * Extracts inner text or input/textarea value attribute from an HTML fragment.
 */
function extractCellText(cellHtml: string): string {
  const inputValMatch = cellHtml.match(/<(?:input|textarea)\b[^>]*?\bvalue\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (inputValMatch && inputValMatch[1].trim()) {
    return cleanFieldText(inputValMatch[1]);
  }
  return stripHtml(cellHtml);
}

/**
 * Normalizes field label to canonical keyword.
 * Covers all known label variants across Indian educational institution portals.
 */
function matchFieldType(rawLabel: string): 'name' | 'registerNumber' | 'course' | 'batch' | null {
  const clean = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Register Number — broadened to cover regd, enrolment, admission, hall ticket, USN
  if (
    clean.includes('registerno') ||
    clean.includes('registernumber') ||
    clean.includes('regno') ||
    clean.includes('registrationno') ||
    clean.includes('registrationnumber') ||
    clean.includes('regdno') ||
    clean.includes('regdnumber') ||
    clean.includes('registrationid') ||
    clean.includes('regid') ||
    clean.includes('rollno') ||
    clean.includes('rollnumber') ||
    clean.includes('enrolmentno') ||
    clean.includes('enrollmentno') ||
    clean.includes('enrolmentnumber') ||
    clean.includes('enrollmentnumber') ||
    clean.includes('admissionno') ||
    clean.includes('admissionnumber') ||
    clean.includes('hallticketno') ||
    clean.includes('hallTicketnumber') ||
    clean.includes('usn') ||
    clean.includes('studentid') ||
    clean === 'registerno' ||
    clean === 'regdno' ||
    clean === 'rollno' ||
    clean === 'usn'
  ) {
    return 'registerNumber';
  }

  // Student Name
  if (
    clean.includes('studentname') ||
    clean.includes('candidatename') ||
    clean.includes('fullname') ||
    clean.includes('pupilname') ||
    clean === 'name' ||
    clean.startsWith('nameof')
  ) {
    return 'name';
  }

  // Course / Degree / Branch
  if (
    clean.includes('course') ||
    clean.includes('degree') ||
    clean.includes('branch') ||
    clean.includes('programme') ||
    clean.includes('program') ||
    clean.includes('specialization') ||
    clean.includes('specialisation') ||
    clean.includes('stream')
  ) {
    return 'course';
  }

  // Batch / Academic Year
  if (
    clean.includes('batch') ||
    clean.includes('academicyear') ||
    clean.includes('yearofadmission') ||
    clean.includes('yearofjoin') ||
    clean.includes('joiningyear') ||
    clean === 'batch'
  ) {
    return 'batch';
  }

  return null;
}

/**
 * Parses raw HTML string from ims.ritchennai.edu.in.
 * Uses 6 progressive strategies from structured DOM to text regex.
 * Only registerNumber is mandatory; other fields use safe defaults.
 */
export function parseRitOfficialPage(htmlContent: string): ParseRitPageResult {
  if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
    return {
      success: false,
      errorCode: 'EMPTY_PAGE',
      errorMessage: 'The RIT verification page was empty or unreadable.',
    };
  }

  const rawExtracted: Partial<Record<'name' | 'registerNumber' | 'course' | 'batch', string>> = {};
  const cleanHtml = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Strategy A: Table Row Key-Value Extraction
  // Handles 3-column (label, separator, value), 2-column, and inline rows
  const trMatches = cleanHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cells = tr.match(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
    if (!cells || cells.length === 0) continue;

    for (let j = 0; j < cells.length; j++) {
      const cellText = extractCellText(cells[j]);
      const fieldType = matchFieldType(cellText);
      if (fieldType && !rawExtracted[fieldType]) {
        // 1. Check if the cell itself has "Label : Value"
        const inlineKv = cellText.match(/^([^:]{2,40})[:\-]\s*(.{2,100})$/);
        if (inlineKv && matchFieldType(inlineKv[1]) === fieldType) {
          const val = cleanFieldText(inlineKv[2]);
          if (val.length > 0) {
            rawExtracted[fieldType] = val;
            continue;
          }
        }
        // 2. Search subsequent cells for the value, skipping separator cells (like ":", "-", or empty)
        for (let k = j + 1; k < cells.length; k++) {
          const rawVal = extractCellText(cells[k]);
          const val = cleanFieldText(rawVal);
          if (val.length === 0) continue;
          if (matchFieldType(rawVal)) break;

          rawExtracted[fieldType] = val;
          break;
        }
      }
    }
  }

  // Strategy B: Definition List (<dt>Label</dt><dd>Value</dd>)
  const dtMatches = Array.from(cleanHtml.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi));
  for (const match of dtMatches) {
    const labelText = stripHtml(match[1]);
    const valueText = cleanFieldText(match[2]);
    const fieldType = matchFieldType(labelText);
    if (fieldType && valueText && !rawExtracted[fieldType]) {
      rawExtracted[fieldType] = valueText;
    }
  }

  // Strategy C: Generic Key-Value Label Container Elements
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const inlinePairRegex = /<(?:label|span|strong|b|p|div)\b[^>]*>([^<:]{2,40})[:\-]?<\/(?:label|span|strong|b|p|div)>\s*<(?:span|div|p|dd|input|a)\b[^>]*>([^<]{2,100})<\/(?:span|div|p|dd|input|a)>/gi;
    let match: RegExpExecArray | null;
    while ((match = inlinePairRegex.exec(cleanHtml)) !== null) {
      const labelText = stripHtml(match[1]);
      const valueText = cleanFieldText(match[2]);
      const fieldType = matchFieldType(labelText);
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
  }

  // Strategy E: Input/form value extraction (ASP.NET, PHP-rendered pages)
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const labelInputRegex = /<(?:label|span|strong|b|p|div|td|th)\b[^>]*>([\s\S]{2,60}?)<\/(?:label|span|strong|b|p|div|td|th)>[\s\S]{0,100}?<(?:input|textarea)\b[^>]*?\bvalue\s*=\s*["']([^"']{2,100})["'][^>]*\/?>/gi;
    let match: RegExpExecArray | null;
    while ((match = labelInputRegex.exec(cleanHtml)) !== null) {
      const labelText = stripHtml(match[1]);
      const valueText = cleanFieldText(match[2]);
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
      const valueText = cleanFieldText(match[2]);
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
    const namedInputRegex2 = /<input\b[^>]*?\bvalue\s*=\s*["']([^"']{2,100})["'][^>]*?\b(?:name|id)\s*=\s*["']([^"']{2,60})["'][^>]*\/?>/gi;
    while ((match = namedInputRegex2.exec(cleanHtml)) !== null) {
      const fieldType = matchFieldType(match[2]);
      const valueText = cleanFieldText(match[1]);
      if (fieldType && valueText && !rawExtracted[fieldType]) {
        rawExtracted[fieldType] = valueText;
      }
    }
  }

  // Strategy F: Colon-separated label:value within a single element
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const singleElementRegex = /<(?:td|th|p|div|span|li)\b[^>]*>([\s\S]{4,200}?)<\/(?:td|th|p|div|span|li)>/gi;
    let match: RegExpExecArray | null;
    while ((match = singleElementRegex.exec(cleanHtml)) !== null) {
      const innerText = stripHtml(match[1]);
      const kvMatch = innerText.match(/^([^:]{2,40})\s*[:\-]\s*(.{2,100})$/i);
      if (kvMatch) {
        const fieldType = matchFieldType(kvMatch[1].trim());
        const valueText = cleanFieldText(kvMatch[2]);
        if (fieldType && valueText && !rawExtracted[fieldType]) {
          rawExtracted[fieldType] = valueText;
        }
      }
    }
  }

  // Strategy D: Plain Text / Regex Key-Value matching (broadened patterns)
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const strippedText = stripHtml(cleanHtml);

    if (!rawExtracted.name) {
      const nameMatch = strippedText.match(/(?:Student\s*Name|Candidate\s*Name|Full\s*Name|Name\s*of\s*Student|Name)\s*[:\-]*\s*([A-Za-z\s.]{2,80}?)(?=(?:Register|Regd|Reg\b|Roll|Enrol|Course|Branch|Batch|Degree|\n|$))/i);
      if (nameMatch && nameMatch[1].trim()) {
        const cleaned = cleanFieldText(nameMatch[1]);
        if (cleaned) rawExtracted.name = cleaned;
      }
    }

    if (!rawExtracted.registerNumber) {
      const regMatch = strippedText.match(/(?:Register\s*(?:No\.?|Number)|Regd?\.?\s*(?:No\.?|Number)|Registration\s*(?:No\.?|Number|Id)|Roll\s*(?:No\.?|Number)|Enro(?:l|ll)ment\s*(?:No\.?|Number)|Admission\s*(?:No\.?|Number)|Hall\s*Ticket\s*No\.?|Student\s*(?:Id|ID))\s*[:\-\s]*([A-Za-z0-9\-\/]{4,30})/i);
      if (regMatch && regMatch[1].trim()) {
        const cleaned = cleanFieldText(regMatch[1]);
        if (cleaned) rawExtracted.registerNumber = cleaned;
      }
    }

    if (!rawExtracted.course) {
      const courseMatch = strippedText.match(/(?:Course|Degree\s*(?:&|and|\/)?\s*Branch|Branch|Degree|Programme|Program|Specialization|Stream)\s*[:\-]*\s*([A-Za-z0-9&.\/\s\-]{2,80}?)(?=(?:Batch|Year|Academic|Register|Regd|Reg\b|Roll|Enrol|Name|\n|$))/i);
      if (courseMatch && courseMatch[1].trim()) {
        const cleaned = cleanFieldText(courseMatch[1]);
        if (cleaned) rawExtracted.course = cleaned;
      }
    }

    if (!rawExtracted.batch) {
      const batchMatch = strippedText.match(/(?:Batch|Academic\s*Batch|Academic\s*Year|Year\s*of\s*(?:Admission|Join))\s*[:\-]*\s*(\d{4}\s*[-\u2013]\s*\d{2,4})/i);
      if (batchMatch && batchMatch[1].trim()) {
        const cleaned = cleanFieldText(batchMatch[1]).replace('\u2013', '-');
        if (cleaned) rawExtracted.batch = cleaned;
      }
    }
  }

  // Conservative Register Number Validation:
  // - trim whitespace
  // - non-empty
  // - allow digits and alphanumeric identifiers
  // - allow actual observed RIT length/range (4 to 30 chars, real RIT is ~13 digits)
  // - reject obviously malformed values (colons, pure punctuation, generic placeholders)
  // - MUST REMAIN STRING (never converted to Number / parseInt)
  const rawReg = rawExtracted.registerNumber;
  const cleanRegNo = rawReg
    ? rawReg.trim().toUpperCase().replace(/^[:\-\s]+/, '').replace(/[:\-\s]+$/, '').replace(/\s+/g, '')
    : '';

  const placeholderValues = new Set(['student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none', 'value', 'registerno', 'registernumber']);
  const isValidRegNo = Boolean(
    cleanRegNo &&
    cleanRegNo.length >= 4 &&
    cleanRegNo.length <= 30 &&
    /^[A-Za-z0-9\-\/]+$/.test(cleanRegNo) &&
    !/^[:\-\s]+$/.test(cleanRegNo) &&
    !placeholderValues.has(cleanRegNo.toLowerCase())
  );

  // CRITICAL: Only registerNumber is mandatory for identity uniqueness.
  // Other fields use safe fallback defaults if extraction failed.
  if (!isValidRegNo) {
    const missingFields: string[] = [];
    if (!rawExtracted.name) missingFields.push('Student Name');
    missingFields.push('Register Number');
    if (!rawExtracted.course) missingFields.push('Course');
    if (!rawExtracted.batch) missingFields.push('Batch');
    return {
      success: false,
      errorCode: 'INVALID_RIT_PAGE',
      errorMessage: 'Could not extract a valid student identifier from the official RIT page. Please try scanning again.',
      missingFields,
    };
  }

  // Field Sanitization & Normalization with safe defaults - registerNumber remains STRICTLY string
  const cleanName = rawExtracted.name ? cleanFieldText(rawExtracted.name).replace(/\s+/g, ' ') : 'RIT Student';
  const cleanCourse = rawExtracted.course ? cleanFieldText(rawExtracted.course).replace(/\s+/g, ' ') : '';
  const canonicalDept = normalizeDepartment(cleanCourse);

  if (!canonicalDept) {
    return {
      success: false,
      errorCode: 'UNSUPPORTED_COURSE_FORMAT',
      errorMessage: "We verified your RIT identity, but we couldn't recognize your course format yet. Please try again later.",
      missingFields: ['Course'],
    };
  }

  const normBatch = normalizeBatch(rawExtracted.batch!) || rawExtracted.batch?.trim() || '2024-2028';

  return {
    success: true,
    data: {
      valid: true,
      source: 'RIT_OFFICIAL_PAGE',
      officialHost: 'ims.ritchennai.edu.in',
      name: cleanName,
      registerNumber: cleanRegNo, // String preserved end-to-end
      course: cleanCourse,
      department: canonicalDept,
      batch: normBatch,
      rawAttributes: {
        extractedName: cleanName,
        extractedRegisterNumber: cleanRegNo,
        extractedCourse: cleanCourse,
        extractedBatch: normBatch,
      },
    },
  };
}

export default parseRitOfficialPage;
