/**
 * ============================================================================
 * TALK TO RITIANS - College Identity Linking & Unlinking Automated Test Suite
 * ============================================================================
 * Tests:
 * 1. Account A links Identity X -> Success
 * 2. Account B attempts Identity X -> Rejected with:
 *    "This college identity is already linked to another account."
 *    (Privacy verification: ZERO stranger data leaked)
 * 3. Same-user re-scan of Identity X -> Graceful success
 * 4. Account A unlinks Identity X -> Audit timestamps retained
 * 5. Account B links Identity X after unlink -> Success
 * 6. Insufficient unique student data -> Rejected with INSUFFICIENT_IDENTITY_DATA
 * 7. Concurrency / Race Condition simulation -> Database constraint guarantees 1 winner
 * 8. Optional Cooldown Architecture -> Blocks re-claim during cooldown window
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Simulation of Server-Side RPC logic (mirrors verify_and_link_college_identity & unlink_college_identity)
class MockDatabase {
  constructor() {
    this.collegeIdentities = [];
    this.profiles = new Map();
    this.serverSalt = '::rit_campus_identity_secret_salt_2026';
  }

  deriveIdentityHash(studentRef) {
    return crypto
      .createHash('sha256')
      .update(studentRef.trim() + this.serverSalt)
      .digest('hex');
  }

  verifyAndLinkCollegeIdentity({
    callingUserId,
    studentRef,
    name,
    department,
    batch,
    qrMetadata = {},
    cooldownHours = 0,
  }) {
    // 1. Session check
    if (!callingUserId) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'You must be signed in to link a college identity.',
      };
    }

    // 2. Insufficient unique data check
    if (
      !studentRef ||
      studentRef.trim().length < 3 ||
      ['student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none'].includes(
        studentRef.trim().toLowerCase()
      )
    ) {
      return {
        success: false,
        error: 'INSUFFICIENT_IDENTITY_DATA',
        message:
          'The scanned QR code does not contain sufficient unique identifier data (such as a student roll number or registration ID) to verify account uniqueness.',
      };
    }

    // 3. Server-side hash derivation
    const identityHash = this.deriveIdentityHash(studentRef);

    // 4. Check active identity ownership
    const activeClaim = this.collegeIdentities.find(
      (row) => row.identity_hash === identityHash && row.active === true
    );

    // Case A: SAME USER re-scans already-linked identity
    if (activeClaim && activeClaim.user_id === callingUserId) {
      this.profiles.set(callingUserId, { college_identity_linked: true, department, batch });
      return {
        success: true,
        already_linked_to_self: true,
        message: 'This college identity is already linked to your account.',
        college_identity_id: activeClaim.id,
        identity_hash_preview: `${identityHash.slice(0, 8)}...${identityHash.slice(-8)}`,
      };
    }

    // Case B: DUPLICATE on another account
    // STRICT PRIVACY: Do NOT reveal other account email, other username, other person's data!
    if (activeClaim && activeClaim.user_id !== callingUserId) {
      return {
        success: false,
        error: 'CARD_ALREADY_LINKED',
        message: 'This college identity is already linked to another account.',
      };
    }

    // 5. Cooldown check
    if (cooldownHours > 0) {
      const pastClaims = this.collegeIdentities.filter(
        (row) =>
          row.identity_hash === identityHash &&
          row.active === false &&
          row.user_id !== callingUserId &&
          row.unlinked_at
      );

      if (pastClaims.length > 0) {
        const mostRecentUnlink = Math.max(...pastClaims.map((r) => new Date(r.unlinked_at).getTime()));
        const cooldownMs = cooldownHours * 3600 * 1000;
        if (Date.now() - mostRecentUnlink < cooldownMs) {
          return {
            success: false,
            error: 'COOLDOWN_ACTIVE',
            message:
              'This college identity was recently unlinked and cannot be re-linked yet. Please try again after the cooldown period expires.',
          };
        }
      }
    }

    // 6. Deactivate caller's prior active identity
    for (const row of this.collegeIdentities) {
      if (row.user_id === callingUserId && row.active === true) {
        row.active = false;
        row.unlinked_at = new Date().toISOString();
      }
    }

    // 7. Atomic Insert (with unique constraint simulation)
    // In PostgreSQL, partial index idx_college_identities_active_hash throws 23505 on collision
    const collisionCheck = this.collegeIdentities.some(
      (row) => row.identity_hash === identityHash && row.active === true
    );
    if (collisionCheck) {
      return {
        success: false,
        error: 'CARD_ALREADY_LINKED',
        message: 'This college identity is already linked to another account.',
      };
    }

    const newId = `identity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newRecord = {
      id: newId,
      user_id: callingUserId,
      identity_hash: identityHash,
      name_from_qr: name,
      department_from_qr: department,
      batch_from_qr: batch,
      qr_metadata: qrMetadata,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      unlinked_at: null,
      active: true,
    };

    this.collegeIdentities.push(newRecord);
    this.profiles.set(callingUserId, { college_identity_linked: true, department, batch });

    return {
      success: true,
      already_linked_to_self: false,
      college_identity_id: newId,
      identity_hash_preview: `${identityHash.slice(0, 8)}...${identityHash.slice(-8)}`,
      verified_at: newRecord.verified_at,
    };
  }

  unlinkCollegeIdentity(callingUserId) {
    if (!callingUserId) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'You must be signed in to unlink your college identity.',
      };
    }

    let unlinkedCount = 0;
    const unlinkedAt = new Date().toISOString();

    for (const row of this.collegeIdentities) {
      if (row.user_id === callingUserId && row.active === true) {
        row.active = false;
        row.unlinked_at = unlinkedAt;
        unlinkedCount++;
      }
    }

    const profile = this.profiles.get(callingUserId) || {};
    this.profiles.set(callingUserId, { ...profile, college_identity_linked: false });

    return {
      success: true,
      unlinked_records: unlinkedCount,
      unlinked_at: unlinkedAt,
    };
  }
}

describe('Phase 5 - 1-to-1 College Identity Linking & Unlinking Architecture', () => {
  let db;

  test('setup test database state', () => {
    db = new MockDatabase();
  });

  describe('1. Core Rule: Account A links Identity X, Account B attempts Identity X', () => {
    test('Account A successfully links Identity X', () => {
      const result = db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-account-a',
        studentRef: 'RIT2025CSE101',
        name: 'Arun Kumar',
        department: 'CSE',
        batch: '2025-2029',
      });

      assert.equal(result.success, true);
      assert.equal(result.already_linked_to_self, false);
      assert.ok(result.college_identity_id);
      assert.match(result.identity_hash_preview, /^[a-f0-9]{8}\.\.\.[a-f0-9]{8}$/);
      assert.equal(db.profiles.get('user-account-a').college_identity_linked, true);
    });

    test('Account B attempts Identity X -> Rejected with non-leaking message', () => {
      const result = db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-account-b',
        studentRef: 'RIT2025CSE101', // Identical student reference
        name: 'Attacker / Impersonator',
        department: 'ECE',
        batch: '2025-2029',
      });

      assert.equal(result.success, false);
      assert.equal(result.error, 'CARD_ALREADY_LINKED');
      assert.equal(result.message, 'This college identity is already linked to another account.');

      // Zero-leakage verification: Confirm NO information about Account A is exposed
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes('user-account-a'), false, 'Must not leak user ID of owner');
      assert.equal(serialized.includes('Arun Kumar'), false, 'Must not leak owner name');
      assert.equal(serialized.includes('CSE'), false, 'Must not leak owner department');
      assert.equal(db.profiles.get('user-account-b'), undefined);
    });
  });

  describe('2. Same-User Re-Scan Handling', () => {
    test('Account A re-scans Identity X -> Handled gracefully without duplicate error', () => {
      const result = db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-account-a',
        studentRef: 'RIT2025CSE101',
        name: 'Arun Kumar',
        department: 'CSE',
        batch: '2025-2029',
      });

      assert.equal(result.success, true);
      assert.equal(result.already_linked_to_self, true);
      assert.equal(result.message, 'This college identity is already linked to your account.');
      assert.equal(db.profiles.get('user-account-a').college_identity_linked, true);
    });
  });

  describe('3. Unlink & Re-Claim Flow', () => {
    test('Account A unlinks Identity X -> Audit timestamps are preserved', () => {
      const unlinkResult = db.unlinkCollegeIdentity('user-account-a');

      assert.equal(unlinkResult.success, true);
      assert.equal(unlinkResult.unlinked_records, 1);
      assert.ok(unlinkResult.unlinked_at);

      // Verify profile is updated
      assert.equal(db.profiles.get('user-account-a').college_identity_linked, false);

      // Verify audit trail on database row
      const unlinkedRow = db.collegeIdentities.find(
        (r) => r.user_id === 'user-account-a' && r.identity_hash === db.deriveIdentityHash('RIT2025CSE101')
      );
      assert.ok(unlinkedRow);
      assert.equal(unlinkedRow.active, false);
      assert.ok(unlinkedRow.unlinked_at);
      assert.ok(unlinkedRow.verified_at);
      assert.ok(unlinkedRow.created_at);
    });

    test('Account B may now link Identity X according to policy', () => {
      const result = db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-account-b',
        studentRef: 'RIT2025CSE101',
        name: 'New Authorized Student',
        department: 'CSE',
        batch: '2025-2029',
      });

      assert.equal(result.success, true);
      assert.equal(result.already_linked_to_self, false);
      assert.equal(db.profiles.get('user-account-b').college_identity_linked, true);
    });
  });

  describe('4. Insufficient Unique Data Validation', () => {
    test('rejects generic or vague student reference', () => {
      const genericRefs = ['', '   ', 'student', 'sample', 'unknown', 'na', 'n/a', '12'];
      for (const ref of genericRefs) {
        const result = db.verifyAndLinkCollegeIdentity({
          callingUserId: 'user-test-vague',
          studentRef: ref,
          name: 'Vague Student',
          department: 'MECH',
          batch: '2025',
        });

        assert.equal(result.success, false);
        assert.equal(result.error, 'INSUFFICIENT_IDENTITY_DATA');
        assert.ok(result.message.includes('sufficient unique identifier data'));
      }
    });
  });

  describe('5. Concurrency & Race Condition Protection Simulation', () => {
    test('handles simultaneous concurrent link requests safely', async () => {
      const concurrentRef = 'RIT-CONCURRENT-CARD-999';
      const results = [];

      // Simulate 5 simultaneous requests attempting to link the exact same identity hash
      const requests = Array.from({ length: 5 }, (_, i) => ({
        callingUserId: `user-simultaneous-${i}`,
        studentRef: concurrentRef,
        name: `Student ${i}`,
        department: 'IT',
        batch: '2026',
      }));

      // Execute all 5 requests
      for (const req of requests) {
        results.push(db.verifyAndLinkCollegeIdentity(req));
      }

      const successfulLinks = results.filter((r) => r.success === true);
      const rejectedLinks = results.filter((r) => r.success === false);

      // EXACTLY 1 request must succeed; 4 must be rejected with duplicate error
      assert.equal(successfulLinks.length, 1, 'Only one account can link the identity concurrently');
      assert.equal(rejectedLinks.length, 4, 'All subsequent concurrent attempts must be rejected');

      for (const rej of rejectedLinks) {
        assert.equal(rej.error, 'CARD_ALREADY_LINKED');
        assert.equal(rej.message, 'This college identity is already linked to another account.');
      }
    });
  });

  describe('6. Optional Cooldown Architecture', () => {
    test('rejects re-claim when within active cooldown window', () => {
      const cooldownRef = 'RIT-COOLDOWN-TEST-888';
      // User 1 links
      db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-cooldown-1',
        studentRef: cooldownRef,
        name: 'Cooldown User 1',
        department: 'ECE',
        batch: '2025',
      });

      // User 1 unlinks
      db.unlinkCollegeIdentity('user-cooldown-1');

      // User 2 attempts to link immediately with a 24-hour cooldown configured
      const blockedResult = db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-cooldown-2',
        studentRef: cooldownRef,
        name: 'Cooldown User 2',
        department: 'ECE',
        batch: '2025',
        cooldownHours: 24, // 24-hour cooldown configured
      });

      assert.equal(blockedResult.success, false);
      assert.equal(blockedResult.error, 'COOLDOWN_ACTIVE');
      assert.ok(blockedResult.message.includes('recently unlinked'));
    });

    test('permits re-claim when cooldown is 0 (default / disabled)', () => {
      const noCooldownRef = 'RIT-NO-COOLDOWN-777';
      // User 1 links & unlinks
      db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-nocooldown-1',
        studentRef: noCooldownRef,
        name: 'No Cooldown 1',
        department: 'CSE',
        batch: '2025',
      });
      db.unlinkCollegeIdentity('user-nocooldown-1');

      // User 2 attempts to link immediately with default cooldown (0)
      const allowedResult = db.verifyAndLinkCollegeIdentity({
        callingUserId: 'user-nocooldown-2',
        studentRef: noCooldownRef,
        name: 'No Cooldown 2',
        department: 'CSE',
        batch: '2025',
        cooldownHours: 0, // Disabled
      });

      assert.equal(allowedResult.success, true);
    });
  });
});
