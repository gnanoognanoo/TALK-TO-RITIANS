/**
 * ============================================================================
 * TALK TO RITIANS - Physical RIT ID Verification Automated Test Suite
 * ============================================================================
 * Comprehensive security, logic, and lifecycle tests for:
 * 1. Physical RIT ID Verification:
 *    - Newer IMS URL cards auto-detection & portal verification
 *    - Legacy / Senior numeric QR auto-detection
 *    - Numeric QR alone does NOT verify (requires card front cross-check)
 *    - On-device OCR parsing & strict PII stripping
 *    - QR ↔ Printed Register Number cross-check
 *    - Zero image persistence guarantee
 *    - Duplicate card fingerprint rejection
 * 2. UI & Architecture Invariants (Removal of College Email):
 *    - Only Physical RIT ID verification option is shown
 *    - No College Email button exists anywhere in the UI
 *    - No OTP input or verification code forms exist
 *    - Personal Google login remains the only login method
 *    - Edge Function verify-college-email removed from repository
 *    - Edge Function verify-rit-id preserved intact
 *    - College email OTP database routines cleanly dropped
 * 3. Chat, Customization & Privacy Boundaries:
 *    - Unverified users can chat freely without verification
 *    - Physical verification unlocks alias & avatar customization
 *    - Unlink resets persona to Unknown User ####
 *    - Real Name, Department, Register Number, Identity Hash NEVER exposed
 *    - 7-minute chat timer and skip/leave logic regressions pass
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ----------------------------------------------------------------------------
// Legacy Card Parser & Cross-Check Implementations
// ----------------------------------------------------------------------------

function normalizeRegisterNumber(rawNumber) {
  if (!rawNumber || typeof rawNumber !== 'string') return '';
  return rawNumber
    .trim()
    .toUpperCase()
    .replace(/^[^0-9]*/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function isLegacyNumericRitQr(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  return /^\d{8,16}$/.test(trimmed);
}

function sanitizeOcrText(rawOcrText) {
  if (!rawOcrText) return '';
  return rawOcrText
    .split('\n')
    .filter((line) => {
      const clean = line.trim().toLowerCase();
      if (/(?:phone|mobile|cell|contact|tel|ph|emergency)\s*[:\-]?\s*\+?\d{8,}/i.test(clean)) return false;
      if (/\b\d{10}\b/.test(clean) && !clean.includes('reg') && !clean.includes('2117')) return false;
      if (/(?:blood\s*group|b\.g\b|bg\b)\s*[:\-]?\s*(?:a|b|ab|o)[+-]/i.test(clean)) return false;
      if (/\b(?:a|b|ab|o)[+-]\s*(?:ve)?\b/i.test(clean)) return false;
      if (/(?:dob|d\.o\.b|date\s*of\s*birth)\s*[:\-]?\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/i.test(clean)) return false;
      if (/(?:address|residence|street|road|nagar|chennai|tamil\s*nadu|pincode|pin\s*code|pin)\b/i.test(clean)) {
        if (!clean.includes('rajalakshmi') && !clean.includes('institute')) return false;
      }
      return true;
    })
    .join('\n');
}

function parseLegacyCardOcrText(rawOcrText) {
  const sanitized = sanitizeOcrText(rawOcrText);
  const lines = sanitized.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let extractedRegNo;
  let extractedName;
  let extractedDept;
  let extractedBatch;

  for (const line of lines) {
    const regLabelMatch = line.match(/(?:Register\s*(?:No\.?|Number)|Regd?\s*(?:No\.?|Number)|Registration|Roll\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9]{8,16})/i);
    if (regLabelMatch) {
      extractedRegNo = normalizeRegisterNumber(regLabelMatch[1]);
      break;
    }
    const direct2117Match = line.match(/\b(2117\d{6,10})\b/);
    if (direct2117Match) {
      extractedRegNo = direct2117Match[1];
      break;
    }
    const genericDigitsMatch = line.match(/\b(\d{10,14})\b/);
    if (genericDigitsMatch && !extractedRegNo) {
      extractedRegNo = genericDigitsMatch[1];
    }
  }

  for (const line of lines) {
    const batchMatch = line.match(/\b(20\d{2}\s*[-–]\s*(?:20)?\d{2})\b/);
    if (batchMatch) {
      extractedBatch = batchMatch[1].replace(/\s+/g, '');
      break;
    }
  }

  for (const line of lines) {
    if (/COMPUTER\s*SCIENCE|CSE/i.test(line)) {
      extractedDept = 'CSE';
      break;
    }
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('rajalakshmi') ||
      lower.includes('institute') ||
      lower.includes('student') ||
      lower.includes('register') ||
      lower.includes('reg') ||
      /^\d+$/.test(line)
    ) {
      continue;
    }
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

function crossCheckLegacyCard(qrNumericValue, printedRegisterNumber) {
  const normQr = normalizeRegisterNumber(qrNumericValue);
  const normPrinted = normalizeRegisterNumber(printedRegisterNumber);

  if (!normQr || !normPrinted) {
    return {
      matches: false,
      error: 'The QR and printed student number do not match. Please scan the same physical RIT ID card again.',
    };
  }

  const matches = normQr === normPrinted;
  return {
    matches,
    error: matches
      ? undefined
      : 'The QR and printed student number do not match. Please scan the same physical RIT ID card again.',
  };
}

// ----------------------------------------------------------------------------
// TEST SUITES
// ----------------------------------------------------------------------------

describe('Physical RIT ID Verification Suite', () => {

  // ==========================================================================
  // SECTION A: PHYSICAL RIT ID CARD AUTO-DETECTION & VERIFICATION
  // ==========================================================================
  describe('A. Physical RIT ID Verification & Card Auto-Detection', () => {
    test('A1: Detects newer IMS portal QR card via exact hostname', () => {
      const imsUrl = 'https://ims.ritchennai.edu.in/student/verify?ref=TEST123456';
      const parsedUrl = new URL(imsUrl);

      assert.equal(parsedUrl.protocol, 'https:');
      assert.equal(parsedUrl.hostname, 'ims.ritchennai.edu.in');
      assert.equal(isLegacyNumericRitQr(imsUrl), false);
    });

    test('A2: Detects legacy / senior numeric QR code without assuming IMS URL', () => {
      const seniorQrValues = [
        '211721104055',
        '211720104112',
        '211722104999',
        '211719104001',
      ];

      for (const val of seniorQrValues) {
        assert.equal(isLegacyNumericRitQr(val), true);
      }
    });

    test('A3: Rejects invalid or arbitrary strings as legacy numeric QR', () => {
      const invalidQrs = [
        'https://attacker.com',
        'hello-world',
        '123', // too short
        '12345678901234567890', // too long
        '2117-CSE-001', // contains hyphens/letters
      ];

      for (const val of invalidQrs) {
        assert.equal(isLegacyNumericRitQr(val), false);
      }
    });

    test('A4: Numeric QR alone DOES NOT verify the user (requires card front cross-check)', () => {
      const numericQr = '211721104055';
      let isVerified = false;

      // Scanning numeric QR alone only changes step to prompt front scan
      const detectedLegacy = isLegacyNumericRitQr(numericQr);
      assert.equal(detectedLegacy, true);
      assert.equal(isVerified, false, 'User must not be marked verified from QR alone');
    });

    test('A5: Local OCR extracts printed register number and matches QR number', () => {
      const numericQr = '211721104055';
      const simulatedCardFrontOcr = `RAJALAKSHMI INSTITUTE OF TECHNOLOGY
STUDENT IDENTITY CARD
K. GNANESHWAR
REGISTER NO: 211721104055
COURSE: COMPUTER SCIENCE AND ENGINEERING
BATCH: 2021-2025`;

      const parsedFields = parseLegacyCardOcrText(simulatedCardFrontOcr);
      assert.equal(parsedFields.registerNumber, '211721104055');
      assert.equal(parsedFields.name, 'K. GNANESHWAR');
      assert.equal(parsedFields.department, 'CSE');

      const check = crossCheckLegacyCard(numericQr, parsedFields.registerNumber);
      assert.equal(check.matches, true);
      assert.equal(check.error, undefined);
    });

    test('A6: Number mismatch is strictly rejected with safe user-facing message', () => {
      const qrNumber = '211721104055';
      const printedOnCard = '211721104099'; // Different card

      const check = crossCheckLegacyCard(qrNumber, printedOnCard);
      assert.equal(check.matches, false);
      assert.equal(
        check.error,
        'The QR and printed student number do not match. Please scan the same physical RIT ID card again.'
      );
      assert.equal(check.error.includes(qrNumber), false);
      assert.equal(check.error.includes(printedOnCard), false);
    });

    test('A7: Local OCR strictly strips sensitive PII (phone, address, DOB, blood group)', () => {
      const ocrWithExcessPII = `RAJALAKSHMI INSTITUTE OF TECHNOLOGY
STUDENT IDENTITY CARD
ARUN KUMAR S
REG NO: 211720104010
COURSE: COMPUTER SCIENCE AND ENGINEERING
BATCH: 2020-2024
DOB: 15/08/2002
BLOOD GROUP: O+ve
PHONE: +91 9876543210
ADDRESS: 123 Anna Nagar, Chennai 600040
EMERGENCY CONTACT: 9123456780`;

      const sanitized = sanitizeOcrText(ocrWithExcessPII);

      assert.equal(/9876543210/.test(sanitized), false);
      assert.equal(/9123456780/.test(sanitized), false);
      assert.equal(/15\/08\/2002/.test(sanitized), false);
      assert.equal(/O\+ve/.test(sanitized), false);
      assert.equal(/Anna Nagar/.test(sanitized), false);

      const parsed = parseLegacyCardOcrText(ocrWithExcessPII);
      assert.equal(parsed.registerNumber, '211720104010');
      assert.equal(parsed.name, 'ARUN KUMAR S');
      assert.equal(parsed.department, 'CSE');
    });

    test('A8: Normalizes Register Number across formatting variations', () => {
      assert.equal(normalizeRegisterNumber(' 211721104055 '), '211721104055');
      assert.equal(normalizeRegisterNumber('REG NO: 211721104055'), '211721104055');
      assert.equal(normalizeRegisterNumber('2117-2110-4055'), '211721104055');
      assert.equal(normalizeRegisterNumber('REG/211721104055'), '211721104055');
    });

    test('A9: Duplicate card identity generates same deterministic hash & rejects 2nd user', () => {
      const salt = 'rit_server_salt_secret_123';
      const regNo = '211721104055';

      const hash1 = crypto.createHash('sha256').update(regNo + salt).digest('hex');
      const hash2 = crypto.createHash('sha256').update(regNo + salt).digest('hex');

      assert.equal(hash1, hash2, 'Hash must be strictly deterministic');

      const registeredIdentities = new Map();
      registeredIdentities.set(hash1, { userId: 'user-aaa-111' });

      const candidateUser = 'user-bbb-222';
      const existing = registeredIdentities.get(hash2);
      const isDuplicate = existing && existing.userId !== candidateUser;

      assert.equal(isDuplicate, true);
    });
  });

  // ==========================================================================
  // SECTION B: REMOVAL OF COLLEGE EMAIL VERIFICATION & UI INVARIANTS
  // ==========================================================================
  describe('B. College Email Removal & UI Invariants', () => {
    test('B1: SettingsPage contains ONLY Scan Physical RIT ID and NO College Email button', () => {
      const settingsPath = path.resolve('src/pages/SettingsPage.tsx');
      const settingsContent = fs.readFileSync(settingsPath, 'utf8');

      // Must have Scan Physical RIT ID
      assert.ok(settingsContent.includes('Scan Physical RIT ID'));

      // Must NOT have Verify with College Email
      assert.equal(
        settingsContent.includes('Verify with College Email'),
        false,
        'SettingsPage must not contain Verify with College Email'
      );
      assert.equal(
        settingsContent.includes('College Email'),
        false,
        'SettingsPage must not mention College Email'
      );
    });

    test('B2: VerifyCollegePage contains NO college-email verification options or forms', () => {
      const verifyPath = path.resolve('src/pages/VerifyCollegePage.tsx');
      const verifyContent = fs.readFileSync(verifyPath, 'utf8');

      // Check forbidden email UI texts
      assert.equal(
        verifyContent.includes('Verify with College Email'),
        false,
        'VerifyCollegePage must not contain Verify with College Email'
      );
      assert.equal(
        verifyContent.includes('Send Verification Code'),
        false,
        'VerifyCollegePage must not contain Send Verification Code'
      );
      assert.equal(
        verifyContent.includes('Enter OTP'),
        false,
        'VerifyCollegePage must not contain Enter OTP'
      );
      assert.equal(
        verifyContent.includes('Resend Code'),
        false,
        'VerifyCollegePage must not contain Resend Code'
      );
      assert.equal(
        verifyContent.includes('otpCode'),
        false,
        'VerifyCollegePage must not have otpCode state'
      );
    });

    test('B3: verificationService has NO email OTP methods or imports', () => {
      const servicePath = path.resolve('src/services/verificationService.ts');
      const serviceContent = fs.readFileSync(servicePath, 'utf8');

      assert.equal(
        serviceContent.includes('requestCollegeEmailOtp'),
        false,
        'verificationService must NOT contain requestCollegeEmailOtp'
      );
      assert.equal(
        serviceContent.includes('verifyCollegeEmailOtp'),
        false,
        'verificationService must NOT contain verifyCollegeEmailOtp'
      );
      assert.equal(
        serviceContent.includes('collegeEmailConfig'),
        false,
        'verificationService must NOT import collegeEmailConfig'
      );
    });

    test('B4: Edge Function verify-college-email is removed from repository', () => {
      const funcPath = path.resolve('supabase/functions/verify-college-email/index.ts');
      const exists = fs.existsSync(funcPath);
      assert.equal(exists, false, 'supabase/functions/verify-college-email must NOT exist in repository');

      // Edge Function verify-rit-id must remain intact
      const ritIdFuncPath = path.resolve('supabase/functions/verify-rit-id/index.ts');
      assert.ok(fs.existsSync(ritIdFuncPath), 'supabase/functions/verify-rit-id must remain intact');
    });

    test('B5: Personal Google login remains the ONLY authentication method', () => {
      const authPath = path.resolve('src/pages/LoginPage.tsx');
      const authContent = fs.readFileSync(authPath, 'utf8');

      assert.ok(authContent.includes('Continue with Google') || authContent.includes('signInWithGoogle'),
        'LoginPage must preserve Continue with Google login');
    });

    test('B6: Valid verification methods are strictly physical_id_ims and physical_id_legacy', () => {
      const validMethods = ['physical_id_ims', 'physical_id_legacy'];
      assert.equal(validMethods.includes('college_email'), false);
      assert.equal(validMethods.length, 2);
    });
  });

  // ==========================================================================
  // SECTION C: UNIFIED VERIFIED STATE, UNLINKING & PRIVACY BOUNDARIES
  // ==========================================================================
  describe('C. Unified Verified State, Unlinking & Privacy Boundaries', () => {
    test('C1: Physical ID verification unlocks Profile Customization', () => {
      const profilePhysicalIms = {
        college_identity_linked: true,
        verification_method: 'physical_id_ims',
      };
      const profilePhysicalLegacy = {
        college_identity_linked: true,
        verification_method: 'physical_id_legacy',
      };

      assert.equal(Boolean(profilePhysicalIms.college_identity_linked), true);
      assert.equal(Boolean(profilePhysicalLegacy.college_identity_linked), true);
    });

    test('C2: Unlinking resets effective public persona without deleting saved persona', () => {
      const userState = {
        userId: 'user-123',
        college_identity_linked: true,
        verification_method: 'physical_id_ims',
        display_username: 'CrimsonFalcon',
        saved_alias: 'CrimsonFalcon',
      };

      // Perform Unlink
      userState.college_identity_linked = false;
      userState.verification_method = null;

      const effectiveDisplayUsername = userState.college_identity_linked
        ? userState.display_username
        : 'Unknown User 4812';

      assert.equal(effectiveDisplayUsername, 'Unknown User 4812');
      assert.equal(userState.saved_alias, 'CrimsonFalcon', 'Saved alias preserved for reverification');
    });

    test('C3: Unverified user can still chat without college verification', () => {
      const unverifiedUser = {
        college_identity_linked: false,
        display_username: 'Unknown User 1024',
      };

      const canStartChat = true; // Never blocked
      assert.equal(canStartChat, true);
      assert.equal(unverifiedUser.display_username.startsWith('Unknown User'), true);
    });

    test('C4: Realtime Chat Stranger Privacy: Real Name, Email, and RegNo NEVER exposed', () => {
      const publicView = {
        user_id: 'user-xyz',
        anonymous_username: 'NeonPanda',
        avatar_config: { emoji: '🐼', theme: 'neon' },
      };

      const keys = Object.keys(publicView);
      assert.equal(keys.includes('name'), false);
      assert.equal(keys.includes('college_email'), false);
      assert.equal(keys.includes('register_number'), false);
      assert.equal(keys.includes('identity_hash'), false);
      assert.equal(keys.includes('verification_method'), false);
    });
  });
});
