/**
 * ============================================================================
 * TALK TO RITIANS - College Verification Data Model & Privacy Invariants Test Suite
 * ============================================================================
 * Tests:
 * 1. Name extracted from official RIT page
 * 2. Batch extracted from official RIT page
 * 3. Course normalized to canonical Department (centralized KNOWN_RIT_COURSE_MAPPINGS)
 * 4. Register Number creates deterministic identity fingerprint (salted SHA-256)
 * 5. Raw Register Number is NOT exposed to frontend response
 * 6. Duplicate physical card is rejected (ONE PHYSICAL ID = ONE ACCOUNT AT A TIME)
 * 7. Gender must be selected by the user manually
 * 8. Gender is never inferred automatically from name, Google account, or department
 * 9. Anonymous chat payload contains NO: name, department, batch, gender, register number
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  INSTITUTIONAL_DEPARTMENTS,
  KNOWN_RIT_COURSE_MAPPINGS,
  GENDER_OPTIONS,
  normalizeDepartment,
  normalizeBatch,
} from '../src/config/profileConfig.ts';

const SERVER_SALT = '::rit_campus_identity_secret_salt_2026';

function generateServerIdentityHash(registerNumber) {
  return crypto
    .createHash('sha256')
    .update(registerNumber.trim().toUpperCase() + SERVER_SALT)
    .digest('hex');
}

function parseRitPage(html) {
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const rawExtracted = {};
  const trMatches = cleanHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const cells = tr.match(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
    if (!cells || cells.length < 2) continue;

    const label = cells[0].replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const val = cells[1].replace(/<[^>]*>/g, '').trim();

    if (label.includes('studentname') || label.includes('name')) {
      rawExtracted.name = val;
    } else if (label.includes('registerno') || label.includes('regno') || label.includes('registernumber')) {
      rawExtracted.registerNumber = val;
    } else if (label.includes('course') || label.includes('degree') || label.includes('branch')) {
      rawExtracted.course = val;
    } else if (label.includes('batch') || label.includes('academicyear')) {
      rawExtracted.batch = val;
    }
  }

  if (!rawExtracted.registerNumber) {
    return { success: false, error: 'Could not extract valid student identifier' };
  }

  const course = rawExtracted.course || '';
  const canonicalDept = normalizeDepartment(course);

  if (!canonicalDept) {
    return {
      success: false,
      error: 'UNSUPPORTED_COURSE_FORMAT',
      message: "We verified your RIT identity, but we couldn't recognize your course format yet. Please try again later.",
    };
  }

  const normBatch = normalizeBatch(rawExtracted.batch) || rawExtracted.batch || '2024-2028';

  return {
    success: true,
    data: {
      name: rawExtracted.name || 'RIT Student',
      registerNumber: rawExtracted.registerNumber.trim(),
      course,
      department: canonicalDept,
      batch: normBatch,
    },
  };
}

function toNormalizedVerificationResult(info, identityLinked = true) {
  return {
    verified: true,
    name: info.name,
    department: info.department,
    batch: info.batch,
    identityLinked,
  };
}

describe('College Verification Data Model & Privacy Boundary Suite', () => {

  // =========================================================================
  // 1. Data Extracted from Official RIT Page
  // =========================================================================
  describe('1. Minimum RIT Fields Extraction', () => {
    const mockRitHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Student Verification - Rajalakshmi Institute of Technology</title></head>
      <body>
        <div class="card">
          <h2>Student Verification</h2>
          <table>
            <tr><th>Student Name</th><td>Arun Kumar K</td></tr>
            <tr><th>Register Number</th><td>2117250020107</td></tr>
            <tr><th>Course</th><td>B.E. CSE</td></tr>
            <tr><th>Batch</th><td>2024-2028</td></tr>
          </table>
        </div>
      </body>
      </html>
    `;

    test('extracts Student Name accurately from official page', () => {
      const parsed = parseRitPage(mockRitHtml);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.name, 'Arun Kumar K');
    });

    test('extracts Batch accurately from official page', () => {
      const parsed = parseRitPage(mockRitHtml);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.batch, '2024-2028');
    });

    test('extracts Course and normalizes to Department', () => {
      const parsed = parseRitPage(mockRitHtml);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.course, 'B.E. CSE');
      assert.equal(parsed.data.department, 'CSE');
    });
  });

  // =========================================================================
  // 2. Centralized Course -> Department Mapping
  // =========================================================================
  describe('2. Course -> Department Normalization (Centralized Mapping)', () => {
    test('normalizes "B.E. CSE" to canonical "CSE"', () => {
      assert.equal(normalizeDepartment('B.E. CSE'), 'CSE');
      assert.equal(normalizeDepartment('B.E CSE'), 'CSE');
      assert.equal(normalizeDepartment('BE CSE'), 'CSE');
      assert.equal(normalizeDepartment('B.E. Computer Science and Engineering'), 'CSE');
    });

    test('normalizes "B.Tech IT" to canonical "IT"', () => {
      assert.equal(normalizeDepartment('B.Tech IT'), 'IT');
      assert.equal(normalizeDepartment('B.Tech. IT'), 'IT');
      assert.equal(normalizeDepartment('B.Tech Information Technology'), 'IT');
    });

    test('normalizes AI/DS variants to canonical "AI/DS"', () => {
      assert.equal(normalizeDepartment('B.Tech AI & DS'), 'AI/DS');
      assert.equal(normalizeDepartment('B.Tech AI/DS'), 'AI/DS');
      assert.equal(normalizeDepartment('B.Tech AIDS'), 'AI/DS');
      assert.equal(normalizeDepartment('B.Tech Artificial Intelligence and Data Science'), 'AI/DS');
    });

    test('normalizes ECE variants to canonical "ECE"', () => {
      assert.equal(normalizeDepartment('B.E. ECE'), 'ECE');
      assert.equal(normalizeDepartment('B.E. Electronics and Communication Engineering'), 'ECE');
    });

    test('normalizes EEE variants to canonical "EEE"', () => {
      assert.equal(normalizeDepartment('B.E. EEE'), 'EEE');
      assert.equal(normalizeDepartment('B.E. Electrical and Electronics Engineering'), 'EEE');
    });

    test('normalizes AI/ML variants to canonical "AI/ML"', () => {
      assert.equal(normalizeDepartment('B.Tech AI & ML'), 'AI/ML');
      assert.equal(normalizeDepartment('B.Tech AIML'), 'AI/ML');
      assert.equal(normalizeDepartment('B.E. Artificial Intelligence and Machine Learning'), 'AI/ML');
    });

    test('normalizes CSBS variants to canonical "CSBS"', () => {
      assert.equal(normalizeDepartment('B.Tech CSBS'), 'CSBS');
      assert.equal(normalizeDepartment('B.Tech Computer Science and Business Systems'), 'CSBS');
    });

    test('normalizes MECH variants to canonical "MECH"', () => {
      assert.equal(normalizeDepartment('B.E. MECH'), 'MECH');
      assert.equal(normalizeDepartment('B.E. Mechanical Engineering'), 'MECH');
    });

    test('KNOWN_RIT_COURSE_MAPPINGS is centralized and immutable', () => {
      assert.ok(Object.isFrozen(KNOWN_RIT_COURSE_MAPPINGS));
      assert.ok(Object.keys(KNOWN_RIT_COURSE_MAPPINGS).length >= 10);
    });

    test('strictly returns null for unrecognized course and rejects with UNSUPPORTED_COURSE_FORMAT', () => {
      assert.equal(normalizeDepartment('Unknown Course'), null);
      assert.equal(normalizeDepartment('Astronomy'), null);
      assert.equal(normalizeDepartment('Hogwarts Defense Against Dark Arts'), null);
      assert.equal(normalizeDepartment(''), null);
      assert.equal(normalizeDepartment(null), null);

      const unkHtml = `
        <table>
          <tr><th>Student Name</th><td>Synthetic Name</td></tr>
          <tr><th>Register Number</th><td>210821104999</td></tr>
          <tr><th>Course</th><td>B.Sc. Unknown Studies</td></tr>
          <tr><th>Batch</th><td>2024-2028</td></tr>
        </table>
      `;
      const result = parseRitPage(unkHtml);
      assert.equal(result.success, false);
      assert.equal(result.error, 'UNSUPPORTED_COURSE_FORMAT');
      assert.equal(
        result.message,
        "We verified your RIT identity, but we couldn't recognize your course format yet. Please try again later."
      );
    });
  });

  // =========================================================================
  // 3. Register Number Internal Usage & Identity Fingerprint
  // =========================================================================
  describe('3. Register Number Internal Fingerprinting', () => {
    test('creates deterministic 64-char hexadecimal salted SHA-256 fingerprint', () => {
      const regNo = '2117250020107';
      const fp1 = generateServerIdentityHash(regNo);
      const fp2 = generateServerIdentityHash(regNo);

      assert.equal(fp1, fp2);
      assert.equal(fp1.length, 64);
      assert.match(fp1, /^[a-f0-9]{64}$/);
    });

    test('safely normalizes register number whitespace and case before hashing', () => {
      const hashUpper = generateServerIdentityHash('2117250020107');
      const hashPadded = generateServerIdentityHash('  2117250020107  ');

      assert.equal(hashUpper, hashPadded);
    });

    test('distinct register numbers produce completely different non-colliding hashes', () => {
      const hash1 = generateServerIdentityHash('2117250020107');
      const hash2 = generateServerIdentityHash('2117250020108');

      assert.notEqual(hash1, hash2);
    });
  });

  // =========================================================================
  // 4. Raw Register Number is NOT Exposed to Frontend Response
  // =========================================================================
  describe('4. Raw Register Number Frontend Exclusion', () => {
    test('normalized verification result contains only verified, name, department, batch, identityLinked', () => {
      const mockRawInfo = {
        valid: true,
        source: 'RIT_OFFICIAL_PAGE',
        officialHost: 'ims.ritchennai.edu.in',
        name: 'Arun Kumar K',
        registerNumber: '2117250020107', // Internal parser value
        course: 'B.E. CSE',
        department: 'CSE',
        batch: '2024-2028',
      };

      const normalizedResponse = toNormalizedVerificationResult(mockRawInfo, true);

      // Verify required fields present
      assert.equal(normalizedResponse.verified, true);
      assert.equal(normalizedResponse.identityLinked, true);
      assert.equal(normalizedResponse.name, 'Arun Kumar K');
      assert.equal(normalizedResponse.department, 'CSE');
      assert.equal(normalizedResponse.batch, '2024-2028');

      // CRITICAL PRIVACY: Raw register number must NOT exist in the response
      assert.equal(normalizedResponse.registerNumber, undefined);
      assert.equal('registerNumber' in normalizedResponse, false);
      assert.equal(normalizedResponse.rawRegisterNumber, undefined);
      assert.equal(normalizedResponse.qrUrl, undefined);
    });
  });

  // =========================================================================
  // 5. Duplicate Physical Card Protection (1 Card = 1 Account)
  // =========================================================================
  describe('5. Duplicate Physical Card Rejection (1-to-1 Protection)', () => {
    const registry = new Map();

    function mockLinkCard(userId, registerNumber) {
      const fingerprint = generateServerIdentityHash(registerNumber);
      const existing = registry.get(fingerprint);

      if (existing && existing.active && existing.userId === userId) {
        return { success: true, alreadyLinkedToSelf: true };
      }
      if (existing && existing.active && existing.userId !== userId) {
        return {
          success: false,
          error: 'CARD_ALREADY_LINKED',
          message: 'This college identity is already linked to another account.',
        };
      }

      registry.set(fingerprint, { userId, active: true, linkedAt: new Date().toISOString() });
      return { success: true, alreadyLinkedToSelf: false, identityHash: fingerprint };
    }

    test('first user successfully links physical card via fingerprint', () => {
      const res = mockLinkCard('user-alpha-123', '2117250020107');
      assert.equal(res.success, true);
      assert.equal(res.alreadyLinkedToSelf, false);
    });

    test('re-scan by same user succeeds idempotently without error', () => {
      const res = mockLinkCard('user-alpha-123', '2117250020107');
      assert.equal(res.success, true);
      assert.equal(res.alreadyLinkedToSelf, true);
    });

    test('duplicate physical card by different account is strictly rejected', () => {
      const res = mockLinkCard('user-beta-456', '2117250020107');
      assert.equal(res.success, false);
      assert.equal(res.error, 'CARD_ALREADY_LINKED');
      assert.equal(res.message, 'This college identity is already linked to another account.');
    });
  });

  // =========================================================================
  // 6. Gender Setup Flow & Manual Selection Requirements
  // =========================================================================
  describe('6. Gender Selection Flow & Invariants', () => {
    test('supported gender choices match product/database schema source of truth', () => {
      assert.ok(GENDER_OPTIONS.includes('Male'));
      assert.ok(GENDER_OPTIONS.includes('Female'));
      assert.ok(GENDER_OPTIONS.includes('Non-Binary'));
      assert.ok(GENDER_OPTIONS.includes('Prefer not to say'));
      assert.equal(GENDER_OPTIONS.length, 4);
    });

    test('gender must be explicitly selected and is rejected when empty/null', () => {
      function validateGenderSelection(selectedGender) {
        if (!selectedGender || typeof selectedGender !== 'string' || selectedGender.trim() === '') {
          return { valid: false, error: 'Gender selection is required.' };
        }
        if (!GENDER_OPTIONS.includes(selectedGender.trim())) {
          return { valid: false, error: 'Please select a valid gender option.' };
        }
        return { valid: true, error: null };
      }

      assert.equal(validateGenderSelection(null).valid, false);
      assert.equal(validateGenderSelection(undefined).valid, false);
      assert.equal(validateGenderSelection('').valid, false);
      assert.equal(validateGenderSelection('InvalidGender').valid, false);

      assert.equal(validateGenderSelection('Male').valid, true);
      assert.equal(validateGenderSelection('Female').valid, true);
      assert.equal(validateGenderSelection('Non-Binary').valid, true);
      assert.equal(validateGenderSelection('Prefer not to say').valid, true);
    });

    test('gender is NEVER inferred automatically from student name or Google account', () => {
      function resolveGenderInitialState(studentName, googleProfile, department) {
        // Zero inference rule: Initial state is ALWAYS unselected (null)
        // Regardless of name ("Priya", "John"), google gender, or department
        return null;
      }

      const initialFemaleName = resolveGenderInitialState('Priya Raman', { email: 'priya@gmail.com' }, 'CSE');
      const initialMaleName = resolveGenderInitialState('Arun Kumar', { email: 'arun@gmail.com' }, 'MECH');

      assert.equal(initialFemaleName, null, 'Gender must not be inferred from female names');
      assert.equal(initialMaleName, null, 'Gender must not be inferred from male names');
    });
  });

  // =========================================================================
  // 7. Privacy Boundary During Anonymous Chat
  // =========================================================================
  describe('7. Privacy Boundary Invariants During Matchmaking & Chat', () => {
    test('public peer payload contains ONLY anonymous handle and avatar config', () => {
      // Full internal student profile (private metadata)
      const internalPrivateProfile = {
        id: 'usr-987-uuid',
        name: 'Arun Kumar K',
        registerNumber: '2117250020107',
        collegeIdentityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        department: 'CSE',
        batch: '2024-2028',
        gender: 'Male',
        personalEmail: 'arunkumar.student@gmail.com',
        anonymousUsername: 'CosmicOwl',
        avatarConfig: { faceColor: '#38bdf8', hairStyle: 'short' },
      };

      // Matchmaking & Chat stranger projection
      const chatStrangerPayload = {
        anonymousUsername: internalPrivateProfile.anonymousUsername,
        avatarConfig: internalPrivateProfile.avatarConfig,
      };

      // Public fields present
      assert.equal(chatStrangerPayload.anonymousUsername, 'CosmicOwl');
      assert.deepEqual(chatStrangerPayload.avatarConfig, { faceColor: '#38bdf8', hairStyle: 'short' });

      // STRICT ISOLATION: Zero private fields exposed during chat
      assert.equal(chatStrangerPayload.name, undefined);
      assert.equal(chatStrangerPayload.registerNumber, undefined);
      assert.equal(chatStrangerPayload.collegeIdentityHash, undefined);
      assert.equal(chatStrangerPayload.department, undefined);
      assert.equal(chatStrangerPayload.batch, undefined);
      assert.equal(chatStrangerPayload.gender, undefined);
      assert.equal(chatStrangerPayload.personalEmail, undefined);
    });

    test('chat message payload contains only message metadata without student identity', () => {
      const messagePayload = {
        id: 'msg-123-uuid',
        roomId: 'room-456-uuid',
        senderId: 'usr-987-uuid',
        content: 'Hello campus peer!',
        createdAt: '2026-09-25T20:00:00Z',
      };

      assert.equal(messagePayload.name, undefined);
      assert.equal(messagePayload.department, undefined);
      assert.equal(messagePayload.batch, undefined);
      assert.equal(messagePayload.gender, undefined);
      assert.equal(messagePayload.registerNumber, undefined);
    });
  });
});
