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
 * Decodes standard HTML entities.
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
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Strips HTML tags and collapses whitespace.
 */
function stripHtml(str: string): string {
  return decodeHtmlEntities(str)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes field label to canonical keyword.
 */
function matchFieldType(rawLabel: string): 'name' | 'registerNumber' | 'course' | 'batch' | null {
  const clean = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Register Number
  if (
    clean.includes('registerno') ||
    clean.includes('registernumber') ||
    clean.includes('regno') ||
    clean.includes('registrationno') ||
    clean.includes('registrationnumber') ||
    clean.includes('rollno') ||
    clean.includes('rollnumber') ||
    clean === 'registerno'
  ) {
    return 'registerNumber';
  }

  // Student Name
  if (
    clean.includes('studentname') ||
    clean.includes('candidatename') ||
    clean.includes('fullname') ||
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
    clean.includes('program')
  ) {
    return 'course';
  }

  // Batch / Academic Year
  if (
    clean.includes('batch') ||
    clean.includes('academicyear') ||
    clean.includes('yearofadmission') ||
    clean === 'batch'
  ) {
    return 'batch';
  }

  return null;
}

/**
 * Parses raw HTML string from ims.ritchennai.edu.in.
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
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

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

  // Strategy C: Generic Key-Value Label Container Elements (e.g. <div>Label: Value</div> or <span>Label</span><span>Value</span>)
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

  // Strategy D: Plain Text / Regex Key-Value matching across stripped text
  if (!rawExtracted.name || !rawExtracted.registerNumber || !rawExtracted.course || !rawExtracted.batch) {
    const strippedText = stripHtml(cleanHtml);

    // Regex for Name
    if (!rawExtracted.name) {
      const nameMatch = strippedText.match(/(?:Student\s*Name|Candidate\s*Name|Full\s*Name|Name)\s*[:\-]\s*([A-Za-z\s.]{2,80}?)(?=(?:Register|Reg\b|Roll|Course|Branch|Batch|Degree|\n|$))/i);
      if (nameMatch && nameMatch[1].trim()) {
        rawExtracted.name = nameMatch[1].trim();
      }
    }

    // Regex for Register Number
    if (!rawExtracted.registerNumber) {
      const regMatch = strippedText.match(/(?:Register\s*(?:No|Number)|Registration\s*(?:No|Number)|Reg\s*No\.?|Roll\s*(?:No|Number))\s*[:\-]?\s*([A-Za-z0-9]{4,30})/i);
      if (regMatch && regMatch[1].trim()) {
        rawExtracted.registerNumber = regMatch[1].trim();
      }
    }

    // Regex for Course
    if (!rawExtracted.course) {
      const courseMatch = strippedText.match(/(?:Course|Degree\s*(?:&|and|\/)?\s*Branch|Branch|Degree)\s*[:\-]\s*([A-Za-z0-9&.\/\s\-]{2,80}?)(?=(?:Batch|Year|Academic|Register|Reg\b|Roll|Name|\n|$))/i);
      if (courseMatch && courseMatch[1].trim()) {
        rawExtracted.course = courseMatch[1].trim();
      }
    }

    // Regex for Batch
    if (!rawExtracted.batch) {
      const batchMatch = strippedText.match(/(?:Batch|Academic\s*Batch|Academic\s*Year)\s*[:\-]\s*(\d{4}\s*[-–]\s*\d{2,4})/i);
      if (batchMatch && batchMatch[1].trim()) {
        rawExtracted.batch = batchMatch[1].trim().replace('–', '-');
      }
    }
  }

  // Check missing fields
  const missingFields: string[] = [];
  if (!rawExtracted.name || rawExtracted.name.trim().length === 0) missingFields.push('Student Name');
  if (!rawExtracted.registerNumber || rawExtracted.registerNumber.trim().length === 0) missingFields.push('Register Number');
  if (!rawExtracted.course || rawExtracted.course.trim().length === 0) missingFields.push('Course');
  if (!rawExtracted.batch || rawExtracted.batch.trim().length === 0) missingFields.push('Batch');

  if (missingFields.length > 0) {
    return {
      success: false,
      errorCode: 'INVALID_RIT_PAGE',
      errorMessage: 'The RIT verification page did not contain the expected student information.',
      missingFields,
    };
  }

  // Field Sanitization & Normalization
  const cleanName = rawExtracted.name!.trim().replace(/\s+/g, ' ');
  const cleanRegNo = rawExtracted.registerNumber!.trim().toUpperCase().replace(/\s+/g, '');
  const cleanCourse = rawExtracted.course!.trim().replace(/\s+/g, ' ');
  const normBatch = normalizeBatch(rawExtracted.batch!) || rawExtracted.batch!.trim();
  const canonicalDept = normalizeDepartment(cleanCourse) || 'RIT';

  // Basic sanity validation
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
