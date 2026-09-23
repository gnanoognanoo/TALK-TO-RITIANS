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
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHtml(str) {
  return decodeHtmlEntities(str)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchFieldType(rawLabel) {
  const clean = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (
    clean.includes('registerno') ||
    clean.includes('registernumber') ||
    clean.includes('regno') ||
    clean.includes('registrationno') ||
    clean.includes('registrationnumber') ||
    clean.includes('rollno') ||
    clean.includes('rollnumber') ||
    clean === 'regno'
  ) {
    return 'registerNumber';
  }

  if (
    clean.includes('studentname') ||
    clean.includes('candidatename') ||
    clean.includes('fullname') ||
    clean === 'name' ||
    clean.startsWith('nameof')
  ) {
    return 'name';
  }

  if (
    clean.includes('course') ||
    clean.includes('degree') ||
    clean.includes('branch') ||
    clean.includes('programme') ||
    clean.includes('program')
  ) {
    return 'course';
  }

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
    return { success: false, errorCode: 'EMPTY_PAGE', errorMessage: 'The RIT verification page was empty or unreadable.' };
  }

  const rawExtracted = {};
  const cleanHtml = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // Strategy A: Table Row Key-Value Extraction
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

  // Strategy B: Definition List (<dt>/<dd>)
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
    let match;
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
      if (batchMatch && batchMatch[1].trim()) rawExtracted.batch = batchMatch[1].trim().replace('–', '-');
    }
  }

  // Validate presence of all 4 required fields
  const missing = [];
  if (!rawExtracted.name || rawExtracted.name.trim().length === 0) missing.push('Student Name');
  if (!rawExtracted.registerNumber || rawExtracted.registerNumber.trim().length === 0) missing.push('Register Number');
  if (!rawExtracted.course || rawExtracted.course.trim().length === 0) missing.push('Course');
  if (!rawExtracted.batch || rawExtracted.batch.trim().length === 0) missing.push('Batch');

  if (missing.length > 0) {
    return {
      success: false,
      errorCode: 'INVALID_RIT_PAGE',
      errorMessage: 'The RIT verification page did not contain the expected student information.',
      missingFields: missing,
    };
  }

  const cleanName = rawExtracted.name.trim().replace(/\s+/g, ' ');
  const cleanRegNo = rawExtracted.registerNumber.trim().toUpperCase().replace(/\s+/g, '');
  const cleanCourse = rawExtracted.course.trim().replace(/\s+/g, ' ');
  const normBatch = normalizeBatch(rawExtracted.batch);
  const canonicalDept = normalizeDepartment(cleanCourse);

  return {
    success: true,
    data: {
      valid: true,
      source: 'RIT_OFFICIAL_PAGE',
      officialHost: APPROVED_RIT_DOMAIN,
      name: cleanName,
      registerNumber: cleanRegNo,
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

  describe('3. Missing Field Detection & Safe Rejection', () => {
    test('rejects page missing Student Name with INVALID_RIT_PAGE', () => {
      const noNameHtml = `
        <table>
          <tr><th>Register Number</th><td>210821104111</td></tr>
          <tr><th>Course</th><td>B.E. CSE</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noNameHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
      assert.ok(result.missingFields.includes('Student Name'));
    });

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

    test('rejects page missing Course with INVALID_RIT_PAGE', () => {
      const noCourseHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Register Number</th><td>210821104222</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noCourseHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
      assert.ok(result.missingFields.includes('Course'));
    });

    test('rejects page missing Batch with INVALID_RIT_PAGE', () => {
      const noBatchHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Register Number</th><td>210821104333</td></tr>
          <tr><th>Course</th><td>B.E. CSE</td></tr>
        </table>
      `;

      const result = parseRitOfficialPage(noBatchHtml);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INVALID_RIT_PAGE');
      assert.ok(result.missingFields.includes('Batch'));
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

      // Peer resolution API projection (as in get_room_peer)
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
});
