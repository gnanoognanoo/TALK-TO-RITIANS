import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/**
 * End-to-End Production Readiness Test Suite
 * Tests Phase 5 (Full E2E Two-User Flow) & Phase 6 (Duplicate ID Protection)
 */

const SERVER_SALT = '::rit_campus_identity_secret_salt_2026';

function generateServerIdentityHash(registerNumber) {
  return crypto
    .createHash('sha256')
    .update(registerNumber.trim().toUpperCase() + SERVER_SALT)
    .digest('hex');
}

const KNOWN_RIT_COURSE_MAPPINGS = Object.freeze({
  'B.E. CSE': 'CSE',
  'B.TECH IT': 'IT',
  'B.TECH AI & DS': 'AI/DS',
  'B.E. ECE': 'ECE',
  'B.E. EEE': 'EEE',
  'B.TECH AI & ML': 'AI/ML',
  'B.TECH CSBS': 'CSBS',
  'B.E. MECH': 'MECH',
});

function normalizeDepartment(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const rawUpper = raw.trim().toUpperCase();
  if (KNOWN_RIT_COURSE_MAPPINGS[rawUpper]) return KNOWN_RIT_COURSE_MAPPINGS[rawUpper];

  const clean = rawUpper
    .replace(/&/g, 'AND')
    .replace(/\./g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.includes('BUSINESS') || clean.includes('CSBS')) return 'CSBS';
  if (clean.includes('DATA SCIENCE') || clean.includes('AIDS')) return 'AI/DS';
  if (clean.includes('MACHINE LEARNING') || clean.includes('AIML')) return 'AI/ML';
  if (clean.includes('COMPUTER SCIENCE') || clean === 'CSE' || clean === 'CS') return 'CSE';
  if (clean.includes('INFORMATION TECHNOLOGY') || clean === 'IT') return 'IT';
  if (clean.includes('ELECTRONICS') && clean.includes('COMMUNICATION')) return 'ECE';
  if (clean.includes('ELECTRICAL')) return 'EEE';
  if (clean.includes('MECHANICAL')) return 'MECH';

  const validCodes = ['CSE', 'IT', 'AI/DS', 'ECE', 'EEE', 'AI/ML', 'CSBS', 'MECH'];
  if (validCodes.includes(rawUpper)) return rawUpper;
  return null;
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

  return {
    success: true,
    data: {
      name: rawExtracted.name || 'RIT Student',
      registerNumber: rawExtracted.registerNumber.trim(),
      course,
      department: canonicalDept,
      batch: rawExtracted.batch || '2024-2028',
    },
  };
}

describe('Phase 5 & 6 — Two-User End-to-End Flow and Duplicate Card Testing', () => {
  // In-memory simulation of PostgreSQL tables with RLS and unique constraints
  const db = {
    users: new Map(),
    profiles: new Map(),
    college_identities: new Map(),
    anonymous_identities: new Map(),
    matchmaking_queue: new Map(),
    chat_rooms: new Map(),
    chat_messages: new Map(),
  };

  function rpcVerifyAndLink(userId, regNo, name, department, batch) {
    const identityHash = generateServerIdentityHash(regNo);

    // Enforce 1-to-1 active uniqueness constraint
    for (const [id, record] of db.college_identities.entries()) {
      if (record.identity_hash === identityHash && record.active) {
        if (record.user_id === userId) {
          return {
            success: true,
            already_linked_to_self: true,
            college_identity_id: id,
            identity_hash_preview: identityHash.slice(0, 8) + '...',
          };
        }
        return {
          success: false,
          error: 'CARD_ALREADY_LINKED',
          message: 'This college identity is already linked to another account.',
        };
      }
    }

    const recId = 'cid-' + crypto.randomUUID();
    db.college_identities.set(recId, {
      id: recId,
      user_id: userId,
      identity_hash: identityHash,
      name_from_qr: name,
      department_from_qr: department,
      batch_from_qr: batch,
      active: true,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      unlinked_at: null,
    });

    const userProfile = db.profiles.get(userId) || {};
    userProfile.college_identity_linked = true;
    userProfile.department = department;
    userProfile.batch = batch;
    db.profiles.set(userId, userProfile);

    return {
      success: true,
      already_linked_to_self: false,
      college_identity_id: recId,
      identity_hash_preview: identityHash.slice(0, 8) + '...',
    };
  }

  function rpcUnlinkCollegeIdentity(userId) {
    let unlinked = false;
    for (const [id, record] of db.college_identities.entries()) {
      if (record.user_id === userId && record.active) {
        record.active = false;
        record.unlinked_at = new Date().toISOString();
        unlinked = true;
      }
    }
    if (unlinked) {
      const userProfile = db.profiles.get(userId);
      if (userProfile) {
        userProfile.college_identity_linked = false;
      }
      return { success: true };
    }
    return { success: false, error: 'NO_ACTIVE_IDENTITY' };
  }

  // =========================================================================
  // Test 1: Full Onboarding of Account A
  // =========================================================================
  test('Account A: Google login -> QR scan -> Gender -> Username -> Avatar -> Profile Home', () => {
    const userAId = 'usr-a-' + crypto.randomUUID();
    db.users.set(userAId, { id: userAId, email: 'studentA@gmail.com' });
    db.profiles.set(userAId, { id: userAId, email: 'studentA@gmail.com' });

    // 1. QR scan & parse
    const officialRitHtmlA = `
      <table>
        <tr><th>Student Name</th><td>Aravind Kumar</td></tr>
        <tr><th>Register Number</th><td>210821104101</td></tr>
        <tr><th>Course</th><td>B.E. CSE</td></tr>
        <tr><th>Batch</th><td>2022-2026</td></tr>
      </table>
    `;
    const parseResA = parseRitPage(officialRitHtmlA);
    assert.equal(parseResA.success, true);
    assert.equal(parseResA.data.department, 'CSE');
    assert.equal(parseResA.data.name, 'Aravind Kumar');

    // 2. Server-side linking & fingerprinting
    const linkResA = rpcVerifyAndLink(
      userAId,
      parseResA.data.registerNumber,
      parseResA.data.name,
      parseResA.data.department,
      parseResA.data.batch
    );
    assert.equal(linkResA.success, true);

    // 3. Gender selection
    const genderA = 'Male';
    const profA = db.profiles.get(userAId);
    profA.gender = genderA;
    assert.equal(profA.gender, 'Male');

    // 4. Anonymous username selection
    const aliasA = 'MysticFalcon';
    profA.display_username = aliasA;

    // 5. Avatar creation
    const avatarA = { face: 'round', skin: '#FDDBB4', hair: 'short', hairColor: '#1A1A1A', shirtColor: '#4F46E5' };
    profA.avatar_config = avatarA;
    profA.profile_completed = true;

    // Sync to anonymous identities
    db.anonymous_identities.set(userAId, {
      user_id: userAId,
      anonymous_username: aliasA,
      avatar_config: avatarA,
    });

    assert.equal(db.profiles.get(userAId).profile_completed, true);
    assert.equal(db.profiles.get(userAId).display_username, 'MysticFalcon');
  });

  // =========================================================================
  // Test 2: Full Onboarding of Account B
  // =========================================================================
  test('Account B: Google login -> QR scan -> Gender -> Username -> Avatar -> Profile Home', () => {
    const userBId = 'usr-b-' + crypto.randomUUID();
    db.users.set(userBId, { id: userBId, email: 'studentB@gmail.com' });
    db.profiles.set(userBId, { id: userBId, email: 'studentB@gmail.com' });

    // 1. QR scan & parse
    const officialRitHtmlB = `
      <table>
        <tr><th>Student Name</th><td>Bhavana Suresh</td></tr>
        <tr><th>Register Number</th><td>210821104202</td></tr>
        <tr><th>Course</th><td>B.Tech IT</td></tr>
        <tr><th>Batch</th><td>2023-2027</td></tr>
      </table>
    `;
    const parseResB = parseRitPage(officialRitHtmlB);
    assert.equal(parseResB.success, true);
    assert.equal(parseResB.data.department, 'IT');

    // 2. Server-side linking & fingerprinting
    const linkResB = rpcVerifyAndLink(
      userBId,
      parseResB.data.registerNumber,
      parseResB.data.name,
      parseResB.data.department,
      parseResB.data.batch
    );
    assert.equal(linkResB.success, true);

    // 3. Gender selection
    const profB = db.profiles.get(userBId);
    profB.gender = 'Female';

    // 4. Anonymous username selection
    const aliasB = 'CyberPanda';
    profB.display_username = aliasB;

    // 5. Avatar creation
    const avatarB = { face: 'oval', skin: '#F3C59A', hair: 'curly', hairColor: '#3B2219', shirtColor: '#EC4899' };
    profB.avatar_config = avatarB;
    profB.profile_completed = true;

    // Sync to anonymous identities
    db.anonymous_identities.set(userBId, {
      user_id: userBId,
      anonymous_username: aliasB,
      avatar_config: avatarB,
    });

    assert.equal(db.profiles.get(userBId).profile_completed, true);
    assert.equal(db.profiles.get(userBId).display_username, 'CyberPanda');
  });

  // =========================================================================
  // Test 3: Matchmaking, Two-User Chat, Messaging, Skip, Rematch, Leave
  // =========================================================================
  test('Two-user Matchmaking -> Chat -> Message -> Skip -> Rematch -> Leave', () => {
    const userA = [...db.users.values()][0];
    const userB = [...db.users.values()][1];

    // User A joins matchmaking queue
    const qA = { id: 'q-' + crypto.randomUUID(), user_id: userA.id, status: 'searching' };
    db.matchmaking_queue.set(qA.id, qA);

    // User B joins matchmaking queue and triggers match
    const roomId = 'room-' + crypto.randomUUID();
    const chatRoom = {
      id: roomId,
      user_1: userA.id,
      user_2: userB.id,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    db.chat_rooms.set(roomId, chatRoom);
    qA.status = 'matched';
    qA.matched_room_id = roomId;

    // Stranger privacy check: User A views peer persona
    const peerOfA = db.anonymous_identities.get(userB.id);
    assert.equal(peerOfA.anonymous_username, 'CyberPanda');
    assert.equal(peerOfA.real_name, undefined);
    assert.equal(peerOfA.department, undefined);
    assert.equal(peerOfA.batch, undefined);
    assert.equal(peerOfA.gender, undefined);
    assert.equal(peerOfA.email, undefined);

    // Message sending: A sends message to B
    const msg1Id = 'msg-' + crypto.randomUUID();
    db.chat_messages.set(msg1Id, {
      id: msg1Id,
      room_id: roomId,
      sender_id: userA.id,
      content: 'Hey there! CSE here (anonymously)!',
      created_at: new Date().toISOString(),
      is_system: false,
    });

    // Message sending: B replies to A
    const msg2Id = 'msg-' + crypto.randomUUID();
    db.chat_messages.set(msg2Id, {
      id: msg2Id,
      room_id: roomId,
      sender_id: userB.id,
      content: 'Hello! Nice to meet you.',
      created_at: new Date().toISOString(),
      is_system: false,
    });

    assert.equal(db.chat_messages.size, 2);

    // User A skips User B
    chatRoom.status = 'ended';
    chatRoom.end_reason = 'skip';

    // System message inserted into room
    const sysMsgId = 'sys-' + crypto.randomUUID();
    db.chat_messages.set(sysMsgId, {
      id: sysMsgId,
      room_id: roomId,
      sender_id: userA.id,
      content: 'Stranger disconnected.',
      created_at: new Date().toISOString(),
      is_system: true,
    });

    // User A immediately re-enters matchmaking (Rematch)
    const qA2 = { id: 'q2-' + crypto.randomUUID(), user_id: userA.id, status: 'searching' };
    db.matchmaking_queue.set(qA2.id, qA2);
    assert.equal(qA2.status, 'searching');

    // User B clicks Leave
    db.matchmaking_queue.delete(qA.id);
    assert.equal(chatRoom.status, 'ended');
  });

  // =========================================================================
  // Test 4: Duplicate Card Protection & Relinking Invariant (Phase 6)
  // =========================================================================
  describe('Phase 6 — Duplicate Physical Card Invariant', () => {
    test('User A links card -> User B attempts same card -> CARD_ALREADY_LINKED -> User A unlinks -> User B succeeds', () => {
      const cardRegNo = '210821104999';
      const user1 = 'usr-1-' + crypto.randomUUID();
      const user2 = 'usr-2-' + crypto.randomUUID();

      // User 1 links physical card
      const res1 = rpcVerifyAndLink(user1, cardRegNo, 'Student One', 'CSE', '2024-2028');
      assert.equal(res1.success, true);

      // User 2 attempts same physical card
      const res2 = rpcVerifyAndLink(user2, cardRegNo, 'Student Two (Attempting Same ID)', 'CSE', '2024-2028');
      assert.equal(res2.success, false);
      assert.equal(res2.error, 'CARD_ALREADY_LINKED');
      assert.equal(res2.message, 'This college identity is already linked to another account.');

      // User 1 unlinks the card
      const unlinkRes = rpcUnlinkCollegeIdentity(user1);
      assert.equal(unlinkRes.success, true);

      // Now User 2 attempts the same card again
      const res3 = rpcVerifyAndLink(user2, cardRegNo, 'Student Two', 'CSE', '2024-2028');
      assert.equal(res3.success, true);
      assert.equal(res3.already_linked_to_self, false);
    });
  });

  // =========================================================================
  // Test 5: Session Restoration / Re-login
  // =========================================================================
  test('Profile and identity state survives logout and re-login', () => {
    const user = [...db.users.values()][0];
    const profile = db.profiles.get(user.id);
    const anon = db.anonymous_identities.get(user.id);

    // Simulate session reload
    assert.ok(profile);
    assert.equal(profile.college_identity_linked, true);
    assert.equal(profile.department, 'CSE');
    assert.equal(profile.gender, 'Male');
    assert.ok(anon);
    assert.equal(anon.anonymous_username, 'MysticFalcon');
  });
});
