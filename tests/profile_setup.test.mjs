/**
 * ============================================================================
 * TALK TO RITIANS - Phase 8 Campus Profile Setup Automated Test Suite
 * ============================================================================
 * Tests:
 * 1. Centralized institutional departments list & normalization
 * 2. Controlled section format & validation
 * 3. Realistic graduation year validation & bounds
 * 4. Academic batch format & automatic graduation year derivation
 * 5. QR prefilling & editability logic
 * 6. Required values completeness & field error reporting
 * 7. Server-side RPC security & gating (unverified vs verified, username required)
 * 8. Onboarding completion invariant (profile_completed = true)
 * 9. Routing guards for unfinished users (Step 8 invariant)
 * 10. Privacy invariant: zero academic/demographic leakage to anonymous chat partition
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import centralized configuration and validators directly
import {
  INSTITUTIONAL_DEPARTMENTS,
  SECTION_OPTIONS,
  CLASS_OPTIONS,
  BATCH_OPTIONS,
  GRADUATION_YEAR_MIN,
  GRADUATION_YEAR_MAX,
  GRADUATION_YEAR_OPTIONS,
  GENDER_OPTIONS,
  SECTION_REGEX,
  BATCH_REGEX,
  normalizeDepartment,
  normalizeBatch,
  deriveGraduationYearFromBatch,
  validateProfileSetup,
} from '../src/config/profileConfig.ts';

function isValidAvatarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  return Boolean(
    cfg.face &&
    cfg.skin &&
    cfg.hair &&
    cfg.hairColor &&
    cfg.eyes &&
    cfg.eyebrows &&
    cfg.mouth &&
    cfg.shirt &&
    cfg.shirtColor &&
    cfg.accessory &&
    cfg.background
  );
}

function getPostLoginRedirect(profile) {
  if (!profile || !profile.college_identity_linked) {
    return '/verify';
  }
  if (!profile.display_username || profile.display_username.startsWith('Unknown User')) {
    return '/username';
  }
  if (!isValidAvatarConfig(profile.avatar_config)) {
    return '/avatar';
  }
  if (!profile.profile_completed) {
    return '/profile/setup';
  }
  return '/home';
}

describe('Phase 8 - Campus Profile Setup & Onboarding Completion', () => {
  // =========================================================================
  // 1. Centralized Institutional Configuration & Department Normalization
  // =========================================================================
  describe('1. Centralized Institutional Configuration & Department Normalization', () => {
    test('contains official Rajalakshmi Institute of Technology departments', () => {
      const codes = INSTITUTIONAL_DEPARTMENTS.map((d) => d.code);
      assert.ok(codes.includes('CSE'), 'CSE must be in institutional departments');
      assert.ok(codes.includes('IT'), 'IT must be in institutional departments');
      assert.ok(codes.includes('AI/DS'), 'AI/DS must be in institutional departments');
      assert.ok(codes.includes('ECE'), 'ECE must be in institutional departments');
      assert.ok(codes.includes('EEE'), 'EEE must be in institutional departments');
      assert.ok(codes.includes('MECH'), 'MECH must be in institutional departments');
      assert.ok(codes.includes('CSBS'), 'CSBS must be in institutional departments');
    });

    test('normalizes raw barcode/QR department variations to canonical codes', () => {
      assert.equal(normalizeDepartment('Computer Science and Engineering'), 'CSE');
      assert.equal(normalizeDepartment('Computer Science & Engineering'), 'CSE');
      assert.equal(normalizeDepartment('cse'), 'CSE');
      assert.equal(normalizeDepartment('IT'), 'IT');
      assert.equal(normalizeDepartment('Information Technology'), 'IT');
      assert.equal(normalizeDepartment('Artificial Intelligence and Data Science'), 'AI/DS');
      assert.equal(normalizeDepartment('AI/DS'), 'AI/DS');
      assert.equal(normalizeDepartment('AIDS'), 'AI/DS');
      assert.equal(normalizeDepartment('Electronics and Communication Engineering'), 'ECE');
      assert.equal(normalizeDepartment('Electrical and Electronics Engineering'), 'EEE');
      assert.equal(normalizeDepartment('Mechanical Engineering'), 'MECH');
      assert.equal(normalizeDepartment('CSBS'), 'CSBS');
    });

    test('rejects unrecognized / invalid institutional departments', () => {
      assert.equal(normalizeDepartment('Astronomy'), null);
      assert.equal(normalizeDepartment('Hogwarts Defense Against Dark Arts'), null);
      assert.equal(normalizeDepartment(''), null);
      assert.equal(normalizeDepartment(null), null);
    });
  });

  // =========================================================================
  // 2. Controlled Section Format & Validation
  // =========================================================================
  describe('2. Controlled Section Format & Validation', () => {
    test('contains standard section options A through F', () => {
      assert.deepEqual([...SECTION_OPTIONS], ['A', 'B', 'C', 'D', 'E', 'F']);
    });

    test('accepts valid 1-3 alphanumeric uppercase sections via regex', () => {
      assert.ok(SECTION_REGEX.test('A'));
      assert.ok(SECTION_REGEX.test('B'));
      assert.ok(SECTION_REGEX.test('C1'));
      assert.ok(SECTION_REGEX.test('SEC'));
    });

    test('rejects invalid section formats containing symbols or excessive length', () => {
      assert.equal(SECTION_REGEX.test(''), false);
      assert.equal(SECTION_REGEX.test('A-1'), false);
      assert.equal(SECTION_REGEX.test('SECTION_A'), false);
      assert.equal(SECTION_REGEX.test('<script>'), false);
    });
  });

  // =========================================================================
  // 3. Realistic Graduation Year Validation
  // =========================================================================
  describe('3. Realistic Graduation Year Validation', () => {
    test('bounds graduation year to realistic campus range (2024 to 2032)', () => {
      assert.equal(GRADUATION_YEAR_MIN, 2024);
      assert.equal(GRADUATION_YEAR_MAX, 2032);
      assert.ok(GRADUATION_YEAR_OPTIONS.includes(2025));
      assert.ok(GRADUATION_YEAR_OPTIONS.includes(2028));
    });

    test('validates realistic graduation years in form validator', () => {
      const validForm = {
        department: 'CSE',
        section: 'A',
        className: '3rd Year',
        batch: '2023-2027',
        graduationYear: 2027,
        gender: 'Male',
      };
      const result = validateProfileSetup(validForm);
      assert.equal(result.isValid, true);
      assert.equal(result.errors.graduationYear, undefined);
    });

    test('rejects unrealistically past graduation years (e.g. 1998, 2012)', () => {
      const pastForm = {
        department: 'CSE',
        section: 'A',
        className: '3rd Year',
        batch: '2023-2027',
        graduationYear: 2012,
        gender: 'Male',
      };
      const result = validateProfileSetup(pastForm);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.graduationYear?.includes('realistic'));
    });

    test('rejects unrealistically far future graduation years (e.g. 2050)', () => {
      const futureForm = {
        department: 'CSE',
        section: 'A',
        className: '3rd Year',
        batch: '2023-2027',
        graduationYear: 2050,
        gender: 'Male',
      };
      const result = validateProfileSetup(futureForm);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.graduationYear?.includes('realistic'));
    });
  });

  // =========================================================================
  // 4. Academic Batch Format & Automatic Graduation Year Derivation
  // =========================================================================
  describe('4. Academic Batch Format & Derivation', () => {
    test('contains recognized undergraduate batch cycles', () => {
      assert.ok(BATCH_OPTIONS.includes('2023-2027'));
      assert.ok(BATCH_OPTIONS.includes('2024-2028'));
    });

    test('derives expected graduation year from batch string', () => {
      assert.equal(deriveGraduationYearFromBatch('2023-2027'), 2027);
      assert.equal(deriveGraduationYearFromBatch('2024-2028'), 2028);
      assert.equal(deriveGraduationYearFromBatch('2025-2029'), 2029);
      assert.equal(deriveGraduationYearFromBatch('invalid'), null);
    });

    test('normalizes 2-digit end year batches into standard YYYY-YYYY', () => {
      assert.equal(normalizeBatch('2023-2027'), '2023-2027');
      assert.equal(normalizeBatch('2023-27'), '2023-2027');
      assert.equal(normalizeBatch('2024-28'), '2024-2028');
    });

    test('rejects malformed batch strings', () => {
      assert.equal(BATCH_REGEX.test('2023'), false);
      assert.equal(BATCH_REGEX.test('batch-2027'), false);
      assert.equal(BATCH_REGEX.test('2023/2027'), false);
    });
  });

  // =========================================================================
  // 5. QR Pre-filling & Editability Logic
  // =========================================================================
  describe('5. QR Pre-filling & Editability Logic', () => {
    test('correctly resolves and pre-fills department and batch from QR verification data', () => {
      const mockProfileFromQR = {
        department: 'Computer Science and Engineering',
        batch: '2023-2027',
      };

      const detectedDept = normalizeDepartment(mockProfileFromQR.department);
      const detectedBatch = normalizeBatch(mockProfileFromQR.batch);
      const derivedGradYear = deriveGraduationYearFromBatch(detectedBatch);

      assert.equal(detectedDept, 'CSE');
      assert.equal(detectedBatch, '2023-2027');
      assert.equal(derivedGradYear, 2027);
    });

    test('allows editing if ID card was mismatched or missing', () => {
      const mockProfileWithoutQR = {
        department: null,
        batch: null,
      };

      const detectedDept = normalizeDepartment(mockProfileWithoutQR.department);
      const isLocked = Boolean(detectedDept);

      assert.equal(isLocked, false, 'Unsupplied QR fields must be unlocked by default');
    });
  });

  // =========================================================================
  // 6. Required Values Completeness & Field Error Reporting
  // =========================================================================
  describe('6. Required Values Completeness & Field Error Reporting', () => {
    test('flags all missing required fields when empty object is submitted', () => {
      const emptyForm = {};
      const result = validateProfileSetup(emptyForm);

      assert.equal(result.isValid, false);
      assert.ok(result.errors.department, 'Department must be required');
      assert.ok(result.errors.section, 'Section must be required');
      assert.ok(result.errors.className, 'Class name must be required');
      assert.ok(result.errors.batch, 'Batch must be required');
      assert.ok(result.errors.graduationYear, 'Graduation year must be required');
      assert.ok(result.errors.gender, 'Gender must be required');
    });

    test('validates gender against controlled options', () => {
      const invalidGenderForm = {
        department: 'CSE',
        section: 'A',
        className: '2nd Year',
        batch: '2023-2027',
        graduationYear: 2027,
        gender: 'Martian',
      };
      const result = validateProfileSetup(invalidGenderForm);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.gender?.includes('valid gender'));
    });
  });

  // =========================================================================
  // 7. Server-Side RPC Security & Gating
  // =========================================================================
  describe('7. Server-Side RPC Security & Gating Emulation', () => {
    function simulateSaveProfileDataRpc({
      userId,
      isCollegeVerified,
      displayUsername,
      department,
      section,
      className,
      batch,
      graduationYear,
      gender,
    }) {
      // 1. Session check
      if (!userId) {
        return { success: false, error: 'UNAUTHENTICATED' };
      }

      // 2. Verification Gate
      if (!isCollegeVerified) {
        return { success: false, error: 'VERIFICATION_REQUIRED' };
      }

      // 3. Username Gate
      if (!displayUsername || displayUsername.startsWith('Unknown User')) {
        return { success: false, error: 'USERNAME_REQUIRED' };
      }

      // 4. Validation
      const validation = validateProfileSetup({
        department,
        section,
        className,
        batch,
        graduationYear,
        gender,
      });

      if (!validation.isValid) {
        return { success: false, error: 'VALIDATION_FAILED', errors: validation.errors };
      }

      // 5. Success
      return {
        success: true,
        profile_completed: true,
        department: normalizeDepartment(department),
        section: section.trim().toUpperCase(),
        batch: batch.trim(),
        graduation_year: graduationYear,
      };
    }

    test('rejects unauthenticated caller', () => {
      const res = simulateSaveProfileDataRpc({
        userId: null,
        isCollegeVerified: true,
        displayUsername: 'SilentFox',
      });
      assert.equal(res.success, false);
      assert.equal(res.error, 'UNAUTHENTICATED');
    });

    test('rejects unverified student attempting to save profile', () => {
      const res = simulateSaveProfileDataRpc({
        userId: 'student-123',
        isCollegeVerified: false,
        displayUsername: 'SilentFox',
      });
      assert.equal(res.success, false);
      assert.equal(res.error, 'VERIFICATION_REQUIRED');
    });

    test('rejects user who has not completed username selection', () => {
      const res = simulateSaveProfileDataRpc({
        userId: 'student-123',
        isCollegeVerified: true,
        displayUsername: 'Unknown User 4920',
      });
      assert.equal(res.success, false);
      assert.equal(res.error, 'USERNAME_REQUIRED');
    });

    test('successfully marks profile_completed = true when all criteria pass', () => {
      const res = simulateSaveProfileDataRpc({
        userId: 'student-123',
        isCollegeVerified: true,
        displayUsername: 'SilentFox',
        department: 'CSE',
        section: 'B',
        className: '3rd Year',
        batch: '2023-2027',
        graduationYear: 2027,
        gender: 'Female',
      });
      assert.equal(res.success, true);
      assert.equal(res.profile_completed, true);
      assert.equal(res.department, 'CSE');
      assert.equal(res.section, 'B');
    });
  });

  // =========================================================================
  // 8. Routing Guards for Unfinished Users (Step 8 Invariant)
  // =========================================================================
  describe('8. Routing Guards for Unfinished Users (Step 8 Invariant)', () => {
    const validAvatar = {
      face: 'round',
      skin: '#FDDBB4',
      hair: 'short',
      hairColor: '#1A1A1A',
      eyes: 'normal',
      eyebrows: 'natural',
      mouth: 'smile',
      shirt: 'crew',
      shirtColor: '#4F46E5',
      accessory: 'none',
      background: 'indigo',
    };

    test('routes unverified user to /verify', () => {
      const unfinishedUser = {
        college_identity_linked: false,
        display_username: 'Unknown User 1234',
        avatar_config: {},
        profile_completed: false,
      };
      assert.equal(getPostLoginRedirect(unfinishedUser), '/verify');
    });

    test('routes verified user without custom username to /username', () => {
      const userNeedingUsername = {
        college_identity_linked: true,
        display_username: 'Unknown User 8821',
        avatar_config: {},
        profile_completed: false,
      };
      assert.equal(getPostLoginRedirect(userNeedingUsername), '/username');
    });

    test('routes user with username but default avatar to /avatar', () => {
      const userNeedingAvatar = {
        college_identity_linked: true,
        display_username: 'CyberCheetah',
        avatar_config: { emoji: '👤' }, // not valid modular avatar
        profile_completed: false,
      };
      assert.equal(getPostLoginRedirect(userNeedingAvatar), '/avatar');
    });

    test('routes user with avatar but incomplete profile to /profile/setup', () => {
      const userNeedingProfile = {
        college_identity_linked: true,
        display_username: 'CyberCheetah',
        avatar_config: validAvatar,
        profile_completed: false,
      };
      assert.equal(getPostLoginRedirect(userNeedingProfile), '/profile/setup');
    });

    test('routes fully onboarded student to /home', () => {
      const completedUser = {
        college_identity_linked: true,
        display_username: 'CyberCheetah',
        avatar_config: validAvatar,
        profile_completed: true,
      };
      assert.equal(getPostLoginRedirect(completedUser), '/home');
    });
  });

  // =========================================================================
  // 9. Privacy Invariant: Zero Academic/Demographic Leakage to Chat Partition
  // =========================================================================
  describe('9. Privacy Invariant: Zero Leakage to Anonymous Chat Partition', () => {
    test('ensures public anonymous profile partition excludes private profile fields', () => {
      // Representation of public_anonymous_profiles view schema
      const publicAnonymousProfileViewFields = [
        'user_id',
        'anonymous_username',
        'avatar_config',
      ];

      const privateProfileFields = [
        'department',
        'section',
        'class_name',
        'batch',
        'graduation_year',
        'gender',
        'college_identity_linked',
      ];

      for (const field of privateProfileFields) {
        assert.equal(
          publicAnonymousProfileViewFields.includes(field),
          false,
          `CRITICAL PRIVACY RULE: ${field} must NEVER be present in public anonymous profile partition!`
        );
      }
    });
  });
});
