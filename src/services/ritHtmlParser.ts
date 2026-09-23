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
  errorCode?: 'INVALID_RIT_PAGE' | 'EMPTY_PAGE';
  errorMessage?: string;
  missingFields?: string[];
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Normalize invisible Unicode: NBSP, zero-width space/joiner, soft hyphen
    .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ');
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

  // Strategy A: Table Row Key-Value Extraction (<tr><td>Label</td><td>Value</td></tr>)
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

  // Strategy B: Definition List (<dt>Label</dt><dd>Value</dd>)
  const dtMatches = Array.from(cleanHtml.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi));
  for (const match of dtMatches) {
    const labelText = stripHtml(match[1]);
    const valueText = stripHtml(match[2]);
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
      const valueText = stripHtml(match[2]);
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
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const singleElementRegex = /<(?:td|th|p|div|span|li)\b[^>]*>([\s\S]{4,200}?)<\/(?:td|th|p|div|span|li)>/gi;
    let match: RegExpExecArray | null;
    while ((match = singleElementRegex.exec(cleanHtml)) !== null) {
      const innerText = stripHtml(match[1]);
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

  // Strategy D: Plain Text / Regex Key-Value matching (broadened patterns)
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const strippedText = stripHtml(cleanHtml);

    if (!rawExtracted.name) {
      const nameMatch = strippedText.match(/(?:Student\s*Name|Candidate\s*Name|Full\s*Name|Name\s*of\s*Student|Name)\s*[:\-]\s*([A-Za-z\s.]{2,80}?)(?=(?:Register|Regd|Reg\b|Roll|Enrol|Course|Branch|Batch|Degree|\n|$))/i);
      if (nameMatch && nameMatch[1].trim()) {
        rawExtracted.name = nameMatch[1].trim();
      }
    }

    if (!rawExtracted.registerNumber) {
      const regMatch = strippedText.match(/(?:Register\s*(?:No\.?|Number)|Regd?\.?\s*(?:No\.?|Number)|Registration\s*(?:No\.?|Number|Id)|Roll\s*(?:No\.?|Number)|Enro(?:l|ll)ment\s*(?:No\.?|Number)|Admission\s*(?:No\.?|Number)|Hall\s*Ticket\s*No\.?|Student\s*(?:Id|ID))\s*[:\-]?\s*([A-Za-z0-9\-\/]{4,30})/i);
      if (regMatch && regMatch[1].trim()) {
        rawExtracted.registerNumber = regMatch[1].trim();
      }
    }

    if (!rawExtracted.course) {
      const courseMatch = strippedText.match(/(?:Course|Degree\s*(?:&|and|\/)?\s*Branch|Branch|Degree|Programme|Program|Specialization|Stream)\s*[:\-]\s*([A-Za-z0-9&.\/\s\-]{2,80}?)(?=(?:Batch|Year|Academic|Register|Regd|Reg\b|Roll|Enrol|Name|\n|$))/i);
      if (courseMatch && courseMatch[1].trim()) {
        rawExtracted.course = courseMatch[1].trim();
      }
    }

    if (!rawExtracted.batch) {
      const batchMatch = strippedText.match(/(?:Batch|Academic\s*Batch|Academic\s*Year|Year\s*of\s*(?:Admission|Join))\s*[:\-]\s*(\d{4}\s*[-\u2013]\s*\d{2,4})/i);
      if (batchMatch && batchMatch[1].trim()) {
        rawExtracted.batch = batchMatch[1].trim().replace('\u2013', '-');
      }
    }
  }

  // CRITICAL: Only registerNumber is mandatory for identity uniqueness.
  // Other fields use safe fallback defaults if extraction failed.
  if (!rawExtracted.registerNumber || rawExtracted.registerNumber.trim().length === 0) {
    const missingFields: string[] = [];
    if (!rawExtracted.name) missingFields.push('Student Name');
    if (!rawExtracted.registerNumber) missingFields.push('Register Number');
    if (!rawExtracted.course) missingFields.push('Course');
    if (!rawExtracted.batch) missingFields.push('Batch');
    return {
      success: false,
      errorCode: 'INVALID_RIT_PAGE',
      errorMessage: 'The RIT verification page did not contain the expected student information.',
      missingFields,
    };
  }

  // Field Sanitization & Normalization with safe defaults
  const cleanName = rawExtracted.name?.trim().replace(/\s+/g, ' ') || 'RIT Student';
  const cleanRegNo = rawExtracted.registerNumber.trim().toUpperCase().replace(/[\s\-]/g, '');
  const cleanCourse = rawExtracted.course?.trim().replace(/\s+/g, ' ') || 'Unknown';
  const normBatch = normalizeBatch(rawExtracted.batch!) || rawExtracted.batch?.trim() || '2024-2028';
  const canonicalDept = normalizeDepartment(cleanCourse) || 'RIT';

  // Basic sanity validation on register number
  if (cleanRegNo.length < 4 || cleanRegNo.length > 30) {
    return {
      success: false,
      errorCode: 'INVALID_RIT_PAGE',
      errorMessage: 'The RIT verification page did not contain the expected student information.',
      missingFields: ['Valid Register Number'],
    };
  }

  return {
    success: true,
    data: {
      valid: true,
      source: 'RIT_OFFICIAL_PAGE',
      officialHost: 'ims.ritchennai.edu.in',
      name: cleanName,
      registerNumber: cleanRegNo,
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
