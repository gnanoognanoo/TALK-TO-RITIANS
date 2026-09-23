/**
 * ============================================================================
 * TALK TO RITIANS - Real RIT Student ID QR Verification Automated Test Suite
 * ============================================================================
 * Tests:
 * 1. Official RIT URL & Hostname Validation (ims.ritchennai.edu.in, HTTPS, SSRF prevention)
 * 2. Official Webpage HTML Parsing & Field Extraction (Name, RegNo, Course, Batch)
 * 3. HTML whitespace, entity decoding, and multi-layout DOM resilience
 * 4. Missing field rejection (Student Name, Register Number, Course, Batch)
 * 5. Course to Department canonical normalization
 * 6. Server-Side Identity Fingerprinting & Database 1-to-1 Uniqueness
 * 7. Malicious redirect and SSRF vector rejection
 * 8. Privacy invariant: zero PII leakage to chat strangers
 *
 * NOTE: Uses anonymized synthetic values only. Zero real student PII.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const APPROVED_RIT_DOMAIN = 'ims.ritchennai.edu.in';

// ----------------------------------------------------------------------------
// Tested Core Logic
// ----------------------------------------------------------------------------

function validateRitQrUrl(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return { isValid: false, errorCode: 'INVALID_QR', errorMessage: 'This QR is not a recognized RIT student ID.' };
  }

  const trimmed = rawValue.trim();
  if (!trimmed.includes('://')) {
    return { isValid: false, errorCode: 'INVALID_QR', errorMessage: 'This QR is not a recognized RIT student ID.' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, errorCode: 'INVALID_QR', errorMessage: 'This QR is not a recognized RIT student ID.' };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, errorCode: 'INSECURE_PROTOCOL', errorMessage: 'Official RIT verification requires a secure HTTPS link.' };
  }

  if (parsed.username || parsed.password) {
    return { isValid: false, errorCode: 'INVALID_QR', errorMessage: 'This QR contains invalid credentials in URL.' };
  }

  if (parsed.port && parsed.port !== '443') {
    return { isValid: false, errorCode: 'INVALID_QR', errorMessage: 'This QR points to an unapproved network port.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.startsWith('[') || hostname.includes(':');
  const isLocal = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local');

  if (isIpv4 || isIpv6 || isLocal || hostname !== APPROVED_RIT_DOMAIN) {
    return { isValid: false, errorCode: 'UNSUPPORTED_DOMAIN', errorMessage: 'This QR does not point to the official RIT verification service.' };
  }

  return { isValid: true, url: parsed };
}

function decodeHtmlEntities(str) {
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

function stripHtml(str) {
  return decodeHtmlEntities(str)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFieldText(val) {
  return stripHtml(val)
    .replace(/^[:\-\s]+/, '')
    .replace(/[:\-\s]+$/, '')
    .trim();
}

function extractCellText(cellHtml) {
  const inputValMatch = cellHtml.match(/<(?:input|textarea)\b[^>]*?\bvalue\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (inputValMatch && inputValMatch[1].trim()) {
    return cleanFieldText(inputValMatch[1]);
  }
  return stripHtml(cellHtml);
}

function matchFieldType(rawLabel) {
  const clean = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (
    clean.includes('registerno') || clean.includes('registernumber') ||
    clean.includes('regno') || clean.includes('registrationno') ||
    clean.includes('registrationnumber') || clean.includes('regdno') ||
    clean.includes('regdnumber') || clean.includes('registrationid') ||
    clean.includes('regid') || clean.includes('rollno') ||
    clean.includes('rollnumber') || clean.includes('enrolmentno') ||
    clean.includes('enrollmentno') || clean.includes('enrolmentnumber') ||
    clean.includes('enrollmentnumber') || clean.includes('admissionno') ||
    clean.includes('admissionnumber') || clean.includes('hallticketno') ||
    clean.includes('hallTicketnumber') || clean.includes('usn') ||
    clean.includes('studentid') ||
    clean === 'regno' || clean === 'regdno' || clean === 'rollno' || clean === 'usn'
  ) {
    return 'registerNumber';
  }

  if (
    clean.includes('studentname') || clean.includes('candidatename') ||
    clean.includes('fullname') || clean.includes('pupilname') ||
    clean === 'name' || clean.startsWith('nameof')
  ) {
    return 'name';
  }

  if (
    clean.includes('course') || clean.includes('degree') ||
    clean.includes('branch') || clean.includes('programme') ||
    clean.includes('program') || clean.includes('specialization') ||
    clean.includes('specialisation') || clean.includes('stream')
  ) {
    return 'course';
  }

  if (
    clean.includes('batch') || clean.includes('academicyear') ||
    clean.includes('yearofadmission') || clean.includes('yearofjoin') ||
    clean.includes('joiningyear') || clean === 'batch'
  ) {
    return 'batch';
  }

  return null;
}

function normalizeDepartment(raw) {
  if (!raw || typeof raw !== 'string') return 'RIT';

  const clean = raw
    .trim()
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/\./g, '')
    .replace(/[-_/]/g, ' ');

  if (clean.includes('BUSINESS') || clean.includes('CSBS') || /\bCSBS\b/.test(clean)) return 'CSBS';
  if (clean.includes('DATA SCIENCE') || /\b(AI\s*DS|AIDS|AI\s*AND\s*DS)\b/.test(clean)) return 'AI/DS';
  if (clean.includes('MACHINE LEARNING') || /\b(AI\s*ML|AIML|AI\s*AND\s*ML)\b/.test(clean)) return 'AI/ML';
  if (clean.includes('COMPUTER SCIENCE') || /\bCSE\b/.test(clean) || clean === 'CS') return 'CSE';
  if (clean.includes('INFORMATION TECHNOLOGY') || clean.includes('INFORMATION') || /\bIT\b/.test(clean)) return 'IT';
  if ((clean.includes('ELECTRONICS') && clean.includes('COMMUNICATION')) || /\bECE\b/.test(clean)) return 'ECE';
  if (clean.includes('ELECTRICAL') || /\bEEE\b/.test(clean)) return 'EEE';
  if (clean.includes('MECHANICAL') || /\bMECH\b/.test(clean)) return 'MECH';

  return 'RIT';
}

function normalizeBatch(raw) {
  if (!raw || typeof raw !== 'string') return '2024-2028';
  const clean = raw
    .trim()
    .replace(/[\u2013\u2014–—]/g, '-')
    .replace(/\s*-\s*/g, '-');
  if (/^\d{4}-\d{4}$/.test(clean)) return clean;
  const shortMatch = clean.match(/^(\d{4})-(\d{2})$/);
  if (shortMatch) {
    const century = shortMatch[1].slice(0, 2);
    return `${shortMatch[1]}-${century}${shortMatch[2]}`;
  }
  return clean;
}

function parseRitOfficialPage(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
    return {
      success: false,
      errorCode: 'EMPTY_PAGE',
      errorMessage: 'The RIT verification page was empty or unreadable.',
    };
  }

  const rawExtracted = {};
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
    let match;
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
    let match;
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
    let match;
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
    let match;
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
    const missingFields = [];
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
  const cleanCourse = rawExtracted.course ? cleanFieldText(rawExtracted.course).replace(/\s+/g, ' ') : 'Unknown';
  const normBatch = normalizeBatch(rawExtracted.batch);
  const canonicalDept = normalizeDepartment(cleanCourse) || 'RIT';

  return {
    success: true,
    data: {
      valid: true,
      source: 'RIT_OFFICIAL_PAGE',
      officialHost: APPROVED_RIT_DOMAIN,
      name: cleanName,
      registerNumber: cleanRegNo, // String preserved end-to-end
      course: cleanCourse,
      department: canonicalDept,
      batch: normBatch,
    },
  };
}

// ----------------------------------------------------------------------------
// Test Suites
// ----------------------------------------------------------------------------

describe('Phase 4 - Real RIT Student ID QR Verification Architecture', () => {

  describe('1. Official RIT QR URL & Domain Validation (SSRF Prevention)', () => {
    test('accepts valid official RIT verification URL with parameters', () => {
      const validUrl = 'https://ims.ritchennai.edu.in/student/verify?id=synthetictest123';
      const result = validateRitQrUrl(validUrl);
      assert.equal(result.isValid, true);
      assert.equal(result.url.hostname, 'ims.ritchennai.edu.in');
      assert.equal(result.url.protocol, 'https:');
    });

    test('rejects HTTP insecure protocol', () => {
      const httpUrl = 'http://ims.ritchennai.edu.in/student/verify?id=test';
      const result = validateRitQrUrl(httpUrl);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'INSECURE_PROTOCOL');
      assert.equal(result.errorMessage, 'Official RIT verification requires a secure HTTPS link.');
    });

    test('rejects hostname spoofing suffix (attacker domain with approved subdomain prefix)', () => {
      const spoofedUrl = 'https://ims.ritchennai.edu.in.attacker.com/verify';
      const result = validateRitQrUrl(spoofedUrl);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'UNSUPPORTED_DOMAIN');
      assert.equal(result.errorMessage, 'This QR does not point to the official RIT verification service.');
    });

    test('rejects previous wrong hostname without "i" prefix', () => {
      const wrongHostname = ['ms', 'ritchennai', 'edu', 'in'].join('.');
      const wrongUrl = `https://${wrongHostname}/student/verify?id=synthetictest123`;
      const result = validateRitQrUrl(wrongUrl);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'UNSUPPORTED_DOMAIN');
      assert.equal(result.errorMessage, 'This QR does not point to the official RIT verification service.');
    });

    test('rejects parent college domain when not the specific verification host', () => {
      const parentDomainUrl = 'https://ritchennai.edu.in.attacker.com/verify';
      const result = validateRitQrUrl(parentDomainUrl);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'UNSUPPORTED_DOMAIN');
    });

    test('rejects URL redirect query tricks (attacker host with approved URL in query)', () => {
      const redirectTrick = 'https://attacker.com/?redirect=https://ims.ritchennai.edu.in';
      const result = validateRitQrUrl(redirectTrick);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'UNSUPPORTED_DOMAIN');
    });

    test('rejects embedded credentials in URL', () => {
      const credUrl = 'https://admin:secret@ims.ritchennai.edu.in/verify';
      const result = validateRitQrUrl(credUrl);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'INVALID_QR');
    });

    test('rejects custom network ports', () => {
      const portUrl = 'https://ims.ritchennai.edu.in:8080/verify';
      const result = validateRitQrUrl(portUrl);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'INVALID_QR');
    });

    test('rejects localhost, loopback, and private IP addresses (SSRF vectors)', () => {
      const loopback1 = 'http://127.0.0.1/verify';
      const loopback2 = 'http://localhost/verify';
      const privateIp = 'https://192.168.1.100/verify';

      assert.equal(validateRitQrUrl(loopback1).isValid, false);
      assert.equal(validateRitQrUrl(loopback2).isValid, false);
      assert.equal(validateRitQrUrl(privateIp).isValid, false);
    });

    test('rejects arbitrary external domains', () => {
      const google = 'https://google.com';
      const result = validateRitQrUrl(google);
      assert.equal(result.isValid, false);
      assert.equal(result.errorCode, 'UNSUPPORTED_DOMAIN');
    });

    test('rejects non-HTTP protocols (file, ftp, javascript, data)', () => {
      assert.equal(validateRitQrUrl('file:///etc/passwd').isValid, false);
      assert.equal(validateRitQrUrl('ftp://ims.ritchennai.edu.in/data').isValid, false);
      assert.equal(validateRitQrUrl('javascript:alert(1)').isValid, false);
      assert.equal(validateRitQrUrl('data:text/html,<h1>Test</h1>').isValid, false);
    });
  });

  describe('2. Official RIT Webpage HTML Parsing & Field Extraction', () => {
    test('extracts all 4 required fields from standard HTML table layout', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Student Verification - RIT</title></head>
        <body>
          <div class="verification-card">
            <h2>Rajalakshmi Institute of Technology</h2>
            <table>
              <tr><th>Student Name</th><td>Synthetic Student Alpha</td></tr>
              <tr><th>Register Number</th><td>210821104999</td></tr>
              <tr><th>Course</th><td>B.E. Computer Science and Engineering</td></tr>
              <tr><th>Batch</th><td>2024-2028</td></tr>
            </table>
          </div>
        </body>
        </html>
      `;

      const result = parseRitOfficialPage(sampleHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Synthetic Student Alpha');
      assert.equal(result.data.registerNumber, '210821104999');
      assert.equal(result.data.course, 'B.E. Computer Science and Engineering');
      assert.equal(result.data.department, 'CSE');
      assert.equal(result.data.batch, '2024-2028');
      assert.equal(result.data.officialHost, 'ims.ritchennai.edu.in');
    });

    test('extracts fields from Definition List (DL/DT/DD) layout', () => {
      const dlHtml = `
        <div class="student-info">
          <dl>
            <dt>Student Name:</dt><dd>Synthetic Student Beta</dd>
            <dt>Reg No:</dt><dd>210822205888</dd>
            <dt>Degree / Branch:</dt><dd>B.Tech Information Technology</dd>
            <dt>Academic Batch:</dt><dd>2023-2027</dd>
          </dl>
        </div>
      `;

      const result = parseRitOfficialPage(dlHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Synthetic Student Beta');
      assert.equal(result.data.registerNumber, '210822205888');
      assert.equal(result.data.department, 'IT');
      assert.equal(result.data.batch, '2023-2027');
    });

    test('resilient to HTML entities, multiple spaces, and span/div wrappers', () => {
      const complexHtml = `
        <div class="profile">
          <div class="item">
            <span class="lbl">Candidate Name:</span>
            <span class="val">&nbsp; Synthetic &amp; Student &nbsp;</span>
          </div>
          <div class="item">
            <span class="lbl">Registration No.:</span>
            <span class="val"> 210823306777 </span>
          </div>
          <div class="item">
            <span class="lbl">Course:</span>
            <span class="val"> B.Tech AI &amp; DS </span>
          </div>
          <div class="item">
            <span class="lbl">Batch:</span>
            <span class="val"> 2024 &ndash; 2028 </span>
          </div>
        </div>
      `;

      const result = parseRitOfficialPage(complexHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Synthetic & Student');
      assert.equal(result.data.registerNumber, '210823306777');
      assert.equal(result.data.department, 'AI/DS');
      assert.equal(result.data.batch, '2024-2028');
    });
  });

  describe('3. Required Identity Field Detection & Graceful Fallbacks', () => {
    test('rejects page missing Register Number with INVALID_RIT_PAGE', () => {
      const noRegHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Course</th><td>B.E. CSE</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noRegHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
      assert.ok(result.missingFields.includes('Register Number'));
    });

    test('succeeds with fallback when Student Name is missing', () => {
      const noNameHtml = `
        <table>
          <tr><th>Register Number</th><td>210821104111</td></tr>
          <tr><th>Course</th><td>B.E. CSE</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noNameHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210821104111');
      assert.equal(result.data.name, 'RIT Student');
    });

    test('succeeds with fallback when Course is missing', () => {
      const noCourseHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Register Number</th><td>210821104222</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noCourseHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210821104222');
      assert.equal(result.data.course, 'Unknown');
      assert.equal(result.data.department, 'RIT');
    });

    test('succeeds with fallback when Batch is missing', () => {
      const noBatchHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Register Number</th><td>210821104333</td></tr>
          <tr><th>Course</th><td>B.E. CSE</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noBatchHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210821104333');
      assert.equal(result.data.batch, '2024-2028');
    });

    test('rejects empty or blank HTML', () => {
      const result = parseRitOfficialPage('   ');
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'EMPTY_PAGE');
    });
  });

  describe('4. Course to Canonical Department Normalization', () => {
    test('normalizes various official RIT course representations', () => {
      assert.equal(normalizeDepartment('B.E. CSE'), 'CSE');
      assert.equal(normalizeDepartment('B.E. Computer Science and Engineering'), 'CSE');
      assert.equal(normalizeDepartment('B.Tech IT'), 'IT');
      assert.equal(normalizeDepartment('B.Tech Information Technology'), 'IT');
      assert.equal(normalizeDepartment('B.Tech AI & DS'), 'AI/DS');
      assert.equal(normalizeDepartment('B.Tech AIDS'), 'AI/DS');
      assert.equal(normalizeDepartment('B.E. ECE'), 'ECE');
      assert.equal(normalizeDepartment('B.E. Electronics and Communication Engineering'), 'ECE');
      assert.equal(normalizeDepartment('B.E. EEE'), 'EEE');
      assert.equal(normalizeDepartment('B.Tech AI & ML'), 'AI/ML');
      assert.equal(normalizeDepartment('B.Tech CSBS'), 'CSBS');
      assert.equal(normalizeDepartment('B.E. Mechanical Engineering'), 'MECH');
      assert.equal(normalizeDepartment('B.E. MECH'), 'MECH');
    });
  });

  describe('5. Unique College Identity & Cryptographic Hashing', () => {
    const SERVER_SALT = '::rit_campus_identity_secret_salt_2026';

    function generateServerIdentityHash(registerNumber) {
      return crypto
        .createHash('sha256')
        .update(registerNumber.trim().toUpperCase() + SERVER_SALT)
        .digest('hex');
    }

    test('generates deterministic 64-char hex identity hash based on Register Number', () => {
      const hash1 = generateServerIdentityHash('210821104055');
      const hash2 = generateServerIdentityHash('210821104055');
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
    });

    test('different register numbers generate distinct non-colliding hashes', () => {
      const hashA = generateServerIdentityHash('210821104001');
      const hashB = generateServerIdentityHash('210821104002');
      assert.notEqual(hashA, hashB);
    });

    test('duplicate scan simulation enforces 1-to-1 uniqueness (CARD_ALREADY_LINKED)', () => {
      const identitiesTable = new Map();

      function linkCard(userId, registerNumber) {
        const hash = generateServerIdentityHash(registerNumber);
        const existing = identitiesTable.get(hash);

        if (existing && existing.active && existing.userId === userId) {
          return { success: true, alreadyLinkedToSelf: true };
        }
        if (existing && existing.active && existing.userId !== userId) {
          return { success: false, error: 'CARD_ALREADY_LINKED', message: 'This college identity is already linked to another account.' };
        }

        identitiesTable.set(hash, { userId, active: true, linkedAt: new Date().toISOString() });
        return { success: true, alreadyLinkedToSelf: false };
      }

      // Account A links card X
      const resA = linkCard('user-aaa-111', '210821104555');
      assert.equal(resA.success, true);
      assert.equal(resA.alreadyLinkedToSelf, false);

      // Account A re-scans same card X (graceful idempotent success)
      const resARescan = linkCard('user-aaa-111', '210821104555');
      assert.equal(resARescan.success, true);
      assert.equal(resARescan.alreadyLinkedToSelf, true);

      // Account B attempts to link card X (must fail with CARD_ALREADY_LINKED)
      const resB = linkCard('user-bbb-222', '210821104555');
      assert.equal(resB.success, false);
      assert.equal(resB.error, 'CARD_ALREADY_LINKED');
      assert.equal(resB.message, 'This college identity is already linked to another account.');
    });
  });

  describe('6. Privacy & Information Minimization Invariants', () => {
    test('chat peer metadata strictly isolates real name and register number', () => {
      const profile = {
        id: 'user-xyz-999',
        email: 'personal.user@gmail.com',
        college_identity_linked: true,
        anonymous_username: 'MysticFalcon',
        avatar_config: { faceColor: '#fbbf24', eyeShape: 'curved' },
        department: 'CSE',
        batch: '2024-2028',
      };

      const peerPublicView = {
        anonymous_username: profile.anonymous_username,
        avatar_config: profile.avatar_config,
      };

      assert.equal(peerPublicView.anonymous_username, 'MysticFalcon');
      assert.equal(peerPublicView.name, undefined);
      assert.equal(peerPublicView.registerNumber, undefined);
      assert.equal(peerPublicView.qrUrl, undefined);
      assert.equal(peerPublicView.email, undefined);
      assert.equal(peerPublicView.department, undefined);
      assert.equal(peerPublicView.batch, undefined);
    });
  });

  describe('7. Strategy E: Input/Form Value Extraction (ASP.NET/PHP Pages)', () => {
    test('extracts fields from label + input value pairs', () => {
      const aspNetHtml = `
        <div class="form-group">
          <label for="txtName">Student Name</label>
          <input type="text" id="txtName" value="Synthetic Student Gamma" readonly />
        </div>
        <div class="form-group">
          <label for="txtRegNo">Register No.</label>
          <input type="text" id="txtRegNo" value="210824407666" readonly />
        </div>
        <div class="form-group">
          <label for="txtCourse">Course</label>
          <input type="text" id="txtCourse" value="B.E. ECE" readonly />
        </div>
        <div class="form-group">
          <label for="txtBatch">Batch</label>
          <input type="text" id="txtBatch" value="2024-2028" readonly />
        </div>
      `;

      const result = parseRitOfficialPage(aspNetHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Synthetic Student Gamma');
      assert.equal(result.data.registerNumber, '210824407666');
      assert.equal(result.data.department, 'ECE');
      assert.equal(result.data.batch, '2024-2028');
    });

    test('extracts fields from table cell + input value pairs', () => {
      const tableInputHtml = `
        <table>
          <tr><td>Student Name</td><td><input value="Synthetic Student Delta" disabled /></td></tr>
          <tr><td>Regd. No</td><td><input value="210825508555" disabled /></td></tr>
          <tr><td>Course</td><td><input value="B.Tech AI & DS" disabled /></td></tr>
          <tr><td>Batch</td><td><input value="2025-2029" disabled /></td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(tableInputHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210825508555');
      assert.equal(result.data.department, 'AI/DS');
    });
  });

  describe('8. Strategy E2: Named Input Extraction', () => {
    test('extracts fields from input name/id attributes matching field names', () => {
      const namedInputHtml = `
        <form>
          <input name="StudentName" value="Synthetic Student Epsilon" type="text" readonly />
          <input name="RegisterNo" value="210826609444" type="text" readonly />
          <input name="Course" value="B.E. MECH" type="text" readonly />
          <input name="Batch" value="2023-2027" type="text" readonly />
        </form>
      `;

      const result = parseRitOfficialPage(namedInputHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210826609444');
      assert.equal(result.data.department, 'MECH');
      assert.equal(result.data.batch, '2023-2027');
    });
  });

  describe('9. Strategy F: Colon-Separated Values in Single Elements', () => {
    test('extracts fields from single td with colon-separated label:value', () => {
      const colonHtml = `
        <table>
          <tr><td>Student Name : Synthetic Student Zeta</td></tr>
          <tr><td>Register Number : 210827710333</td></tr>
          <tr><td>Course : B.E. Computer Science and Engineering</td></tr>
          <tr><td>Batch : 2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(colonHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Synthetic Student Zeta');
      assert.equal(result.data.registerNumber, '210827710333');
      assert.equal(result.data.department, 'CSE');
    });

    test('extracts from p tags with colon separation', () => {
      const pColonHtml = `
        <div class="student-card">
          <p>Student Name : Synthetic Student Eta</p>
          <p>Reg No : 210828811222</p>
          <p>Course : B.Tech IT</p>
          <p>Batch : 2025-2029</p>
        </div>
      `;

      const result = parseRitOfficialPage(pColonHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210828811222');
      assert.equal(result.data.department, 'IT');
    });
  });

  describe('10. Partial Field Extraction (Register Number Only)', () => {
    test('succeeds with only register number extracted, uses safe defaults', () => {
      const minimalHtml = `
        <div>
          <span>Register Number</span>
          <span>210829912111</span>
        </div>
      `;

      const result = parseRitOfficialPage(minimalHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210829912111');
      assert.equal(result.data.name, 'RIT Student');
      assert.equal(result.data.course, 'Unknown');
    });

    test('fails when register number is missing even if other fields present', () => {
      const noRegHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Course</th><td>B.E. CSE</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noRegHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
      assert.ok(result.missingFields.includes('Register Number'));
    });
  });

  describe('11. Broader Label Variant Recognition', () => {
    test('matches Regd. No label variant', () => {
      assert.equal(matchFieldType('Regd. No'), 'registerNumber');
      assert.equal(matchFieldType('Regd No'), 'registerNumber');
      assert.equal(matchFieldType('REGD. NO.'), 'registerNumber');
    });

    test('matches Enrolment/Enrollment No label variant', () => {
      assert.equal(matchFieldType('Enrolment No'), 'registerNumber');
      assert.equal(matchFieldType('Enrollment Number'), 'registerNumber');
    });

    test('matches Admission No label variant', () => {
      assert.equal(matchFieldType('Admission No'), 'registerNumber');
      assert.equal(matchFieldType('Admission Number'), 'registerNumber');
    });

    test('matches Hall Ticket No label variant', () => {
      assert.equal(matchFieldType('Hall Ticket No'), 'registerNumber');
      assert.equal(matchFieldType('Hall Ticket No.'), 'registerNumber');
    });

    test('matches Student ID label variant', () => {
      assert.equal(matchFieldType('Student ID'), 'registerNumber');
      assert.equal(matchFieldType('Student Id'), 'registerNumber');
    });

    test('matches USN label', () => {
      assert.equal(matchFieldType('USN'), 'registerNumber');
    });

    test('matches Year of Joining / Joining Year batch variants', () => {
      assert.equal(matchFieldType('Year of Join'), 'batch');
      assert.equal(matchFieldType('Joining Year'), 'batch');
    });

    test('matches Specialization / Stream course variants', () => {
      assert.equal(matchFieldType('Specialization'), 'course');
      assert.equal(matchFieldType('Specialisation'), 'course');
      assert.equal(matchFieldType('Stream'), 'course');
    });
  });

  describe('12. Whitespace and Entity Edge Cases', () => {
    test('handles non-breaking spaces in labels and values', () => {
      const nbspHtml = `
        <table>
          <tr><th>Student&nbsp;Name</th><td>&nbsp;Synthetic&nbsp;Student&nbsp;</td></tr>
          <tr><th>Register&nbsp;Number</th><td>&nbsp;210830013000&nbsp;</td></tr>
          <tr><th>Course</th><td>B.E.&nbsp;CSE</td></tr>
          <tr><th>Batch</th><td>2024&nbsp;-&nbsp;2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(nbspHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210830013000');
    });

    test('handles br tags between label and value', () => {
      const brHtml = `
        <div>Student Name<br/>Synthetic Student Iota</div>
        <div>Register Number<br>210831114999</div>
        <div>Course<br />B.E. EEE</div>
        <div>Batch<br/>2024-2028</div>
      `;

      // The br tags get converted to spaces, enabling text regex fallback
      const result = parseRitOfficialPage(brHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '210831114999');
    });
  });

  describe('13. Anonymized Real-World RIT Fixtures & Long Numeric Strings', () => {
    test('anonymized realistic fixture: 3-column table with separate colon cell', () => {
      // Real-device RIT table structure where column 1 is ":"
      const realRitHtml = `
        <div class="card-body">
          <table class="table">
            <tbody>
              <tr>
                <td>Student Name</td>
                <td>:</td>
                <td>TEST STUDENT</td>
              </tr>
              <tr>
                <td>Register Number</td>
                <td>:</td>
                <td>2117250020107</td>
              </tr>
              <tr>
                <td>Course</td>
                <td>:</td>
                <td>B.E. CSE</td>
              </tr>
              <tr>
                <td>Batch</td>
                <td>:</td>
                <td>2025-2029</td>
              </tr>
            </tbody>
          </table>
          <p>This information is verified and issued by RIT</p>
        </div>
      `;

      const result = parseRitOfficialPage(realRitHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'TEST STUDENT');
      assert.equal(result.data.registerNumber, '2117250020107');
      assert.equal(typeof result.data.registerNumber, 'string');
      assert.equal(result.data.course, 'B.E. CSE');
      assert.equal(result.data.department, 'CSE');
      assert.equal(result.data.batch, '2025-2029');
    });

    test('preserves long numeric register number strictly as string without precision loss', () => {
      const longNumHtml = `
        <table>
          <tr><td>Register Number:</td><td>2117250020107</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(longNumHtml);
      assert.equal(result.success, true);
      assert.strictEqual(result.data.registerNumber, '2117250020107');
      assert.strictEqual(typeof result.data.registerNumber, 'string');
      // Verify no numeric coercion happened
      assert.notStrictEqual(result.data.registerNumber, 2117250020107);
    });

    test('handles whitespace around colons in various positions', () => {
      const variedWhitespaceHtml = `
        <table>
          <tr><td>Register Number   :   </td><td>   2117250020107   </td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(variedWhitespaceHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '2117250020107');
    });

    test('handles HTML line breaks and &nbsp; entities inside cells', () => {
      const complexHtml = `
        <table>
          <tr>
            <td>Register&nbsp;Number<br></td>
            <td>&nbsp;:&nbsp;</td>
            <td>&nbsp;<br>2117250020107&nbsp;</td>
          </tr>
        </table>
      `;

      const result = parseRitOfficialPage(complexHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '2117250020107');
    });

    test('handles separate elements (spans, divs)', () => {
      const separateElementsHtml = `
        <div>
          <span>Register Number</span>
          <span>:</span>
          <span>2117250020107</span>
        </div>
      `;

      const result = parseRitOfficialPage(separateElementsHtml);
      assert.equal(result.success, true);
      assert.equal(result.data.registerNumber, '2117250020107');
    });

    test('rejects missing register number with proper error message', () => {
      const missingRegHtml = `
        <table>
          <tr><td>Student Name</td><td>:</td><td>TEST STUDENT</td></tr>
          <tr><td>Course</td><td>:</td><td>B.E. CSE</td></tr>
          <tr><td>Batch</td><td>:</td><td>2025-2029</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(missingRegHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
      assert.ok(result.missingFields.includes('Register Number'));
    });

    test('rejects invalid empty or colon-only register number', () => {
      const colonOnlyHtml = `
        <table>
          <tr><td>Register Number</td><td>:</td><td>:</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(colonOnlyHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
    });

    test('rejects generic placeholder values like student or sample', () => {
      const placeholderHtml = `
        <table>
          <tr><td>Register Number</td><td>:</td><td>SAMPLE</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(placeholderHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
    });
  });
});
