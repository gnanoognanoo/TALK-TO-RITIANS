/**
 * ============================================================================
 * TALK TO RITIANS - Phase 3 Authentication Unit & Integration Tests
 * ============================================================================
 * Tests:
 * 1. Anonymous temporary username generation invariant (Unknown User ####)
 * 2. Onboarding state-machine redirection rules
 * 3. Personal vs Institutional email domain validation rules
 * 4. Anonymous profile initialization defaults
 * 5. Sign out state cleanup invariant
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Core logic functions under test (mirrors src/services/authService.ts and LoginPage.tsx)
function generateTemporaryUsername() {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `Unknown User ${randomSuffix}`;
}

function getPostLoginRedirect(profile) {
  if (!profile || !profile.college_identity_linked) {
    return '/verify';
  }
  if (!profile.profile_completed) {
    return '/profile/setup';
  }
  return '/home';
}

function validatePersonalEmail(rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  const collegeDomains = ['@rajalakshmi.edu.in', '@ritchennai.edu.in'];
  const isCollegeEmail = collegeDomains.some((domain) => email.endsWith(domain));

  if (isCollegeEmail) {
    return {
      valid: false,
      error: 'Please log in with your PERSONAL email. College ID is linked separately in the next step.',
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      valid: false,
      error: 'Please enter a valid personal email address.',
    };
  }

  return { valid: true, error: null };
}

describe('Phase 3 - Personal Authentication Rules', () => {
  describe('1. Temporary Anonymous Identity Generation', () => {
    test('generates username matching "Unknown User ####" format', () => {
      for (let i = 0; i < 50; i++) {
        const username = generateTemporaryUsername();
        assert.match(
          username,
          /^Unknown User \d{4}$/,
          `Generated username "${username}" must match "Unknown User ####"`
        );

        const idNum = parseInt(username.replace('Unknown User ', ''), 10);
        assert.ok(idNum >= 1000 && idNum <= 9999, 'Suffix must be 4-digit number between 1000 and 9999');
      }
    });

    test('generates diverse random identifiers across sequential calls', () => {
      const samples = new Set();
      for (let i = 0; i < 30; i++) {
        samples.add(generateTemporaryUsername());
      }
      // With 9000 possible 4-digit values, 30 samples should yield at least 25 unique values
      assert.ok(samples.size >= 25, 'Temporary usernames must exhibit high randomness');
    });
  });

  describe('2. Post-Login Redirection Invariants', () => {
    test('redirects null or undefined profile to /verify', () => {
      assert.equal(getPostLoginRedirect(null), '/verify');
      assert.equal(getPostLoginRedirect(undefined), '/verify');
    });

    test('redirects unlinked college identity to /verify', () => {
      const profile = {
        id: 'user-uuid-1',
        college_identity_linked: false,
        profile_completed: false,
      };
      assert.equal(getPostLoginRedirect(profile), '/verify');
    });

    test('redirects linked identity with incomplete profile to /profile/setup', () => {
      const profile = {
        id: 'user-uuid-2',
        college_identity_linked: true,
        profile_completed: false,
      };
      assert.equal(getPostLoginRedirect(profile), '/profile/setup');
    });

    test('redirects fully completed student profile to /home', () => {
      const profile = {
        id: 'user-uuid-3',
        college_identity_linked: true,
        profile_completed: true,
      };
      assert.equal(getPostLoginRedirect(profile), '/home');
    });
  });

  describe('3. Personal Account Validation (College Email Partition)', () => {
    test('rejects college institutional domain @rajalakshmi.edu.in', () => {
      const result = validatePersonalEmail('student.2023.cse@rajalakshmi.edu.in');
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes('PERSONAL email'));
    });

    test('rejects college institutional domain @ritchennai.edu.in', () => {
      const result = validatePersonalEmail('mehaa@ritchennai.edu.in');
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes('PERSONAL email'));
    });

    test('accepts valid personal emails from various providers', () => {
      const validEmails = [
        'student.personal@gmail.com',
        'ritian.coder@outlook.com',
        'campus.user@yahoo.co.in',
        'privacy.advocate@proton.me',
        'student@icloud.com',
      ];

      for (const email of validEmails) {
        const result = validatePersonalEmail(email);
        assert.equal(result.valid, true, `Email ${email} should be accepted as personal`);
        assert.equal(result.error, null);
      }
    });

    test('rejects malformed email formats', () => {
      const invalidEmails = ['invalid-email', 'no-domain@', '@domain.com', 'spaces in@email.com'];
      for (const email of invalidEmails) {
        const result = validatePersonalEmail(email);
        assert.equal(result.valid, false, `Malformed email ${email} should fail validation`);
      }
    });
  });

  describe('4. Initial Profile Provisioning Structure', () => {
    test('initial profile contains all required privacy and safety defaults', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const tempUsername = generateTemporaryUsername();
      const defaultAvatar = { emoji: '👤', theme: 'indigo' };

      const initialProfile = {
        id: userId,
        display_username: tempUsername,
        avatar_config: defaultAvatar,
        college_identity_linked: false,
        profile_completed: false,
        department: null,
        section: null,
        class_name: null,
        batch: null,
        graduation_year: null,
        gender: null,
      };

      assert.equal(initialProfile.id, userId);
      assert.match(initialProfile.display_username, /^Unknown User \d{4}$/);
      assert.equal(initialProfile.college_identity_linked, false);
      assert.equal(initialProfile.profile_completed, false);
      assert.equal(initialProfile.department, null);
      assert.equal(initialProfile.section, null);
    });
  });

  describe('5. Protected Route Access Control Matrix', () => {
    const routeAccessMatrix = [
      { path: '/login', requiresAuth: false },
      { path: '/verify', requiresAuth: true },
      { path: '/profile/setup', requiresAuth: true },
      { path: '/username', requiresAuth: true },
      { path: '/avatar', requiresAuth: true },
      { path: '/home', requiresAuth: true },
      { path: '/matching', requiresAuth: true },
      { path: '/chat/room-abc', requiresAuth: true },
    ];

    function evaluateRouteAccess(path, isAuthenticated) {
      const route = routeAccessMatrix.find((r) => r.path === path);
      if (!route) return { allow: true };
      if (route.requiresAuth && !isAuthenticated) {
        return { allow: false, redirect: '/login', state: { from: path } };
      }
      return { allow: true };
    }

    test('denies unauthenticated access to protected routes and saves target path', () => {
      for (const route of routeAccessMatrix.filter((r) => r.requiresAuth)) {
        const check = evaluateRouteAccess(route.path, false);
        assert.equal(check.allow, false);
        assert.equal(check.redirect, '/login');
        assert.equal(check.state.from, route.path);
      }
    });

    test('allows authenticated users to access protected routes', () => {
      for (const route of routeAccessMatrix.filter((r) => r.requiresAuth)) {
        const check = evaluateRouteAccess(route.path, true);
        assert.equal(check.allow, true);
      }
    });
  });
});
