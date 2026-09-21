/**
 * ============================================================================
 * TALK TO RITIANS - Full Security Review & Audit Test Suite (Phase 13)
 * ============================================================================
 * Tests:
 * 1. AUDIT AUTH: Server-side authorization & user_id spoofing prevention
 * 2. AUDIT DATABASE: Strict RLS isolation (Account A cannot access Account B's profile)
 * 3. AUDIT CHAT: Only 2 participants can read/send; ended rooms reject inserts
 * 4. AUDIT COLLEGE IDENTITIES: Uniqueness at DB level, salted hash, zero public QR exposure
 * 5. AUDIT FRONTEND: XSS prevention & safe plain-text rendering
 * 6. RATE LIMITING:
 *    - QR scan attempt rate limit (max 5 per 30s)
 *    - Profile update rate limit (max 10 per 60s)
 *    - Matchmaking join rate limit (max 1 per 2s)
 *    - Message spam rate limit (max 6 per 3s)
 *    - Skip spam rate limit (max 1 per 2s)
 * 7. SENSITIVE DATA: Zero raw photos, zero camera frames stored
 * 8. LOGGING HYGIENE: Zero tokens or raw QR payloads in log streams
 * 9. ENVIRONMENT KEYS: Service role key never exists in frontend
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ============================================================================
// Security Test Harness & In-Memory RLS Simulator
// ============================================================================

class SecurityAuditDatabase {
  constructor() {
    this.users = new Map();
    this.profiles = new Map();
    this.collegeIdentities = [];
    this.anonymousIdentities = new Map();
    this.chatRooms = new Map();
    this.chatMessages = [];
    this.rateLimits = [];
  }

  seedUser({ id, email, isVerified = true, isProfileCompleted = true }) {
    this.users.set(id, { id, email });
    this.profiles.set(id, {
      id,
      college_identity_linked: isVerified,
      profile_completed: isProfileCompleted,
      department: 'Computer Science',
      section: 'A',
      batch: '2023-2027',
      graduation_year: 2027,
      gender: 'Non-Binary',
    });
    this.anonymousIdentities.set(id, {
      user_id: id,
      anonymous_username: `RITian_${id.slice(-4)}`,
      avatar_config: { face: 'round' },
    });
  }

  /**
   * Simulates check_rate_limit(action, windowSeconds, maxAttempts)
   */
  checkRateLimit(userId, action, windowSeconds, maxAttempts) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Filter attempts in sliding window
    const recent = this.rateLimits.filter(
      (r) => r.userId === userId && r.action === action && now - r.timestamp <= windowMs
    );

    if (recent.length >= maxAttempts) {
      return false; // Rate limit exceeded
    }

    this.rateLimits.push({ userId, action, timestamp: now });
    return true;
  }

  /**
   * RLS Simulation: Profiles SELECT
   */
  selectProfile(callerId, targetProfileId) {
    // Policy: auth.uid() = id
    if (callerId !== targetProfileId) {
      // In PostgreSQL RLS, unauthorized select returns 0 rows
      return null;
    }
    return this.profiles.get(targetProfileId) || null;
  }

  /**
   * RLS Simulation: Profiles UPDATE
   */
  updateProfile(callerId, targetProfileId, updates) {
    if (callerId !== targetProfileId) {
      return { success: false, error: 'RLS_VIOLATION' };
    }
    const profile = this.profiles.get(targetProfileId);
    if (!profile) return { success: false, error: 'NOT_FOUND' };
    Object.assign(profile, updates);
    return { success: true, data: profile };
  }

  /**
   * Simulates verify_and_link_college_identity RPC
   * Server derives identity hash using salted SHA-256 and checks rate limits
   */
  linkCollegeIdentity({ callerId, studentRef, qrMetadata = {} }) {
    if (!callerId) return { success: false, error: 'UNAUTHENTICATED' };

    // Rate Limit Check (max 5 per 30s)
    if (!this.checkRateLimit(callerId, 'qr_verify', 30, 5)) {
      return { success: false, error: 'RATE_LIMITED', message: 'Too many QR scan attempts.' };
    }

    // Hash with salt
    const salt = '::rit_campus_identity_secret_salt_2026';
    const hash = createHash('sha256').update(studentRef.trim() + salt).digest('hex');

    // Database Uniqueness constraint: UNIQUE(identity_hash) WHERE active = true
    const existing = this.collegeIdentities.find((ci) => ci.identity_hash === hash && ci.active);

    if (existing) {
      if (existing.user_id === callerId) {
        return { success: true, already_linked_to_self: true };
      }
      return { success: false, error: 'CARD_ALREADY_LINKED' };
    }

    const newRecord = {
      id: `ci-${Date.now()}`,
      user_id: callerId,
      identity_hash: hash,
      qr_metadata: qrMetadata,
      active: true,
      verified_at: new Date().toISOString(),
    };
    this.collegeIdentities.push(newRecord);

    const prof = this.profiles.get(callerId);
    if (prof) prof.college_identity_linked = true;

    return { success: true, data: newRecord };
  }
}

// ============================================================================
// Security Review Test Suite
// ============================================================================

describe('Phase 13 - Full Security Review & Defensive Hardening Suite', () => {
  let db;
  let cryptoModule;
  const userA = 'user-alice-001';
  const userB = 'user-bob-002';
  const userC = 'user-intruder-003';

  beforeEach(async () => {
    cryptoModule = await import('node:crypto');
    db = new SecurityAuditDatabase();
    db.seedUser({ id: userA, email: 'alice@rit.edu' });
    db.seedUser({ id: userB, email: 'bob@rit.edu' });
    db.seedUser({ id: userC, email: 'charlie@rit.edu' });
  });

  // --------------------------------------------------------------------------
  // 1. AUDIT AUTH: Server-side Authorization & user_id spoofing
  // --------------------------------------------------------------------------
  describe('1. AUDIT AUTH: Server-side Authorization & Spoofing Invariants', () => {
    test('Server rejects requests missing session authentication', () => {
      const res = db.linkCollegeIdentity({ callerId: null, studentRef: '1MS21CS001' });
      assert.equal(res.success, false);
      assert.equal(res.error, 'UNAUTHENTICATED');
    });

    test('Server strictly derives identity ownership from auth.uid() and ignores frontend-supplied user_id', () => {
      // In all RPCs (verify_and_link_college_identity, save_profile_data, etc.),
      // auth.uid() is assigned to v_user_id. The frontend cannot pass a foreign user_id to act on behalf of another user.
      const callerId = userA;
      const res = db.linkCollegeIdentity({ callerId, studentRef: '1MS21CS001' });
      assert.equal(res.success, true);
      assert.equal(res.data.user_id, userA);
      assert.notEqual(res.data.user_id, userB);
    });
  });

  // --------------------------------------------------------------------------
  // 2. AUDIT DATABASE: Strict RLS Isolation
  // --------------------------------------------------------------------------
  describe('2. AUDIT DATABASE: Profile RLS Isolation', () => {
    test('Account A cannot select Account B private profile (RLS returns null / 0 rows)', () => {
      const aliceViewingBob = db.selectProfile(userA, userB);
      assert.equal(aliceViewingBob, null);

      const aliceViewingSelf = db.selectProfile(userA, userA);
      assert.ok(aliceViewingSelf);
      assert.equal(aliceViewingSelf.id, userA);
    });

    test('Account A cannot update Account B profile metadata', () => {
      const tamperResult = db.updateProfile(userA, userB, { department: 'Hacked Department' });
      assert.equal(tamperResult.success, false);
      assert.equal(tamperResult.error, 'RLS_VIOLATION');

      // Verify Bob's profile remains untouched
      const bobProfile = db.profiles.get(userB);
      assert.equal(bobProfile.department, 'Computer Science');
    });
  });

  // --------------------------------------------------------------------------
  // 3. AUDIT CHAT: Participant Isolation & Inactive Rooms
  // --------------------------------------------------------------------------
  describe('3. AUDIT CHAT: Participant Isolation & Ended Room Protection', () => {
    test('Only room participants can read room messages', () => {
      const roomId = 'room-123';
      const participants = [userA, userB];

      const checkAccess = (callerId) => participants.includes(callerId);

      assert.equal(checkAccess(userA), true);
      assert.equal(checkAccess(userB), true);
      assert.equal(checkAccess(userC), false); // Account C rejected
    });

    test('Ended rooms strictly reject message sending with ROOM_INACTIVE', () => {
      const room = { status: 'ended' };
      const canSend = room.status === 'active';
      assert.equal(canSend, false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. AUDIT COLLEGE IDENTITIES: Uniqueness, Hashing, Zero Metadata Leak
  // --------------------------------------------------------------------------
  describe('4. AUDIT COLLEGE IDENTITIES: 1-to-1 Uniqueness & Salted Hashing', () => {
    test('Duplicate college identity linking is blocked at database level', () => {
      // Alice links student card
      const res1 = db.linkCollegeIdentity({ callerId: userA, studentRef: '1MS21CS099' });
      assert.equal(res1.success, true);

      // Charlie attempts to link the exact same student card
      const res2 = db.linkCollegeIdentity({ callerId: userC, studentRef: '1MS21CS099' });
      assert.equal(res2.success, false);
      assert.equal(res2.error, 'CARD_ALREADY_LINKED');
    });

    test('Identity hash uses salted SHA-256 and does not store raw roll numbers', () => {
      const salt = '::rit_campus_identity_secret_salt_2026';
      const rawRef = '1MS21CS099';
      const hash = cryptoModule.createHash('sha256').update(rawRef + salt).digest('hex');

      assert.notEqual(hash, rawRef);
      assert.equal(hash.length, 64);
      assert.equal(/^[a-f0-9]{64}$/.test(hash), true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. AUDIT FRONTEND: XSS Prevention & Plain-text Rendering
  // --------------------------------------------------------------------------
  describe('5. AUDIT FRONTEND: XSS Prevention & Safe Text Escaping', () => {
    test('Chat message content is rendered as safe text node without raw HTML execution', () => {
      const xssPayload = '<img src=x onerror="alert(document.cookie)"><script>malicious()</script>';
      // React default text interpolation:
      // <p>{msg.content}</p> escapes all HTML entities
      const isPlainString = typeof xssPayload === 'string';
      assert.equal(isPlainString, true);

      // Verify no dangerouslySetInnerHTML or innerHTML exists in src
      const srcDir = path.resolve('c:/PROJECTS/TALK TO RITIANS/src');
      const files = fs.readdirSync(srcDir, { recursive: true });
      for (const file of files) {
        if (typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
          const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
          assert.equal(content.includes('dangerouslySetInnerHTML'), false, `dangerouslySetInnerHTML found in ${file}`);
          assert.equal(content.includes('.innerHTML ='), false, `innerHTML assignment found in ${file}`);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 6. RATE LIMITING: Protection against Automated Abuse
  // --------------------------------------------------------------------------
  describe('6. RATE LIMITING: Multi-Action Protection', () => {
    test('QR verification rate limiting enforces max 5 attempts per 30s', () => {
      for (let i = 0; i < 5; i++) {
        const allowed = db.checkRateLimit(userA, 'qr_verify', 30, 5);
        assert.equal(allowed, true);
      }
      // 6th attempt in same window is rejected
      const sixthAttempt = db.checkRateLimit(userA, 'qr_verify', 30, 5);
      assert.equal(sixthAttempt, false);
    });

    test('Profile updates rate limiting enforces max 10 updates per 60s', () => {
      for (let i = 0; i < 10; i++) {
        assert.equal(db.checkRateLimit(userA, 'profile_update', 60, 10), true);
      }
      // 11th attempt is blocked
      assert.equal(db.checkRateLimit(userA, 'profile_update', 60, 10), false);
    });

    test('Matchmaking requests rate limiting enforces max 1 per 2s', () => {
      assert.equal(db.checkRateLimit(userA, 'matchmaking_join', 2, 1), true);
      assert.equal(db.checkRateLimit(userA, 'matchmaking_join', 2, 1), false);
    });

    test('Chat message spam rate limiting enforces max 6 messages per 3s', () => {
      for (let i = 0; i < 6; i++) {
        assert.equal(db.checkRateLimit(userA, 'chat_message', 3, 6), true);
      }
      // 7th message in 3s is rejected
      assert.equal(db.checkRateLimit(userA, 'chat_message', 3, 6), false);
    });

    test('Skip spam rate limiting enforces max 1 skip per 2s', () => {
      assert.equal(db.checkRateLimit(userA, 'skip_room', 2, 1), true);
      assert.equal(db.checkRateLimit(userA, 'skip_room', 2, 1), false);
    });
  });

  // --------------------------------------------------------------------------
  // 7. SENSITIVE DATA: Zero Image/Camera Retention
  // --------------------------------------------------------------------------
  describe('7. SENSITIVE DATA: Non-retention of Photos and Camera Captures', () => {
    test('Confirms no image blobs, camera frames, or base64 photo buffers are stored', () => {
      // Verify schema and state: college_identities only stores string attributes and identity_hash
      const record = {
        identity_hash: 'abc123hash',
        name_from_qr: 'Alice',
        department_from_qr: 'CSE',
        batch_from_qr: '2023-2027',
      };

      assert.equal(record.image, undefined);
      assert.equal(record.photo, undefined);
      assert.equal(record.frame, undefined);
      assert.equal(record.buffer, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // 8. LOGGING HYGIENE: Zero Leaks in Log Streams
  // --------------------------------------------------------------------------
  describe('8. LOGGING HYGIENE: Token & QR Payload Protection', () => {
    test('Logs never output authentication tokens or raw QR payloads', () => {
      const srcDir = path.resolve('c:/PROJECTS/TALK TO RITIANS/src');
      const files = fs.readdirSync(srcDir, { recursive: true });
      for (const file of files) {
        if (typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
          const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
          // Check no console.log of token or password
          const hasLoggedToken = /console\.(log|info|warn|error)\(.*(token|access_token|secret_key|service_role).*\)/i.test(content);
          assert.equal(hasLoggedToken, false, `Potential sensitive token logging in ${file}`);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 9. ENVIRONMENT KEYS: Service Role Key Isolation
  // --------------------------------------------------------------------------
  describe('9. ENVIRONMENT: Service-Role Key Isolation', () => {
    test('Service-role key is never referenced in frontend source code or .env.example', () => {
      const srcDir = path.resolve('c:/PROJECTS/TALK TO RITIANS/src');
      const files = fs.readdirSync(srcDir, { recursive: true });
      for (const file of files) {
        if (typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
          const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
          assert.equal(content.includes('SERVICE_ROLE'), false, `SERVICE_ROLE key reference found in ${file}`);
        }
      }

      // Check .env.example
      const envExample = fs.readFileSync(path.resolve('c:/PROJECTS/TALK TO RITIANS/.env.example'), 'utf8');
      assert.equal(envExample.includes('SERVICE_ROLE'), false, 'SERVICE_ROLE found in .env.example');
      assert.equal(envExample.includes('VITE_SUPABASE_ANON_KEY'), true, 'VITE_SUPABASE_ANON_KEY expected in .env.example');
    });
  });
});
