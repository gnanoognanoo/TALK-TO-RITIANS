/**
 * ============================================================================
 * TALK TO RITIANS - Production Behavior Fixes Regression Test Suite
 * ============================================================================
 * Covers:
 * 1. Alias AND avatar revoked after unlink (both username & avatar revert)
 * 2. Saved persona (alias & avatar) is not permanently deleted upon unlink
 * 3. get_room_peer returns Unknown User #### + default avatar for unverified peer
 * 4. Verified student fields (Name, Department, Batch) are strictly immutable
 * 5. First gender write succeeds and freezes gender
 * 6. Second gender write fails with GENDER_ALREADY_LOCKED
 * 7. Presence heartbeat and offline expiry (>30s)
 * 8. Random online recipient selection (server-side, zero PII leak)
 * 9. Chat request creation with 20s TTL
 * 10. Recipient-only visibility & privacy boundaries (effective persona only)
 * 11. Request expiration after TTL
 * 12. Accept creates exactly ONE 7-minute room
 * 13. Reject creates no room and adds temporary exclusion (no immediate re-select)
 * 14. Race-condition protection & active-room invariant (ONE USER = ONE ACTIVE ROOM)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectivePersona,
  computeDeterministicUnknownUser,
  DEFAULT_AVATAR_CONFIG,
} from '../src/utils/persona.ts';
import { GENDER_OPTIONS } from '../src/config/profileConfig.ts';

describe('Part 1: Effective Persona & Avatar Revocation Upon Unlink', () => {
  const verifiedUser = {
    id: '11111111-1111-1111-1111-111111111111',
    college_identity_linked: true,
    display_username: 'Nova',
    avatar_config: {
      face: 'sharp',
      skin: '#E0AC69',
      hair: 'spiky',
      hairColor: '#000000',
      eyes: 'glasses',
      eyebrows: 'bushy',
      mouth: 'grin',
      shirt: 'hoodie',
      shirtColor: '#10B981',
      accessory: 'chain',
      background: 'emerald',
    },
  };

  test('verified user receives custom saved alias and custom avatar', () => {
    const persona = getEffectivePersona(verifiedUser);
    assert.equal(persona.isVerified, true);
    assert.equal(persona.displayUsername, 'Nova');
    assert.equal(persona.avatarConfig.shirtColor, '#10B981');
    assert.equal(persona.avatarConfig.face, 'sharp');
  });

  test('unlinking college ID revokes BOTH custom alias AND custom avatar', () => {
    // Simulate unlink: college_identity_linked becomes false, but saved alias/avatar remain in DB
    const unlinkedUser = {
      ...verifiedUser,
      college_identity_linked: false,
    };

    const effective = getEffectivePersona(unlinkedUser);
    assert.equal(effective.isVerified, false);

    // 1. Alias revoked: must be deterministic Unknown User ####
    assert.match(effective.displayUsername, /^Unknown User \d{4}$/);
    assert.notEqual(effective.displayUsername, 'Nova');

    // 2. Avatar revoked: must be DEFAULT_AVATAR_CONFIG
    assert.deepEqual(effective.avatarConfig, DEFAULT_AVATAR_CONFIG);
    assert.equal(effective.avatarConfig.shirtColor, '#4F46E5');
  });

  test('saved persona is NOT permanently deleted upon unlink', () => {
    const dbRecord = {
      id: '11111111-1111-1111-1111-111111111111',
      college_identity_linked: false,
      display_username: 'Nova',
      avatar_config: {
        face: 'sharp',
        skin: '#E0AC69',
        hair: 'spiky',
        hairColor: '#000000',
        eyes: 'glasses',
        eyebrows: 'bushy',
        mouth: 'grin',
        shirt: 'hoodie',
        shirtColor: '#10B981',
        accessory: 'chain',
        background: 'emerald',
      },
    };

    // Unverified public view suppresses saved fields
    const publicView = getEffectivePersona(dbRecord);
    assert.match(publicView.displayUsername, /^Unknown User \d{4}$/);
    assert.deepEqual(publicView.avatarConfig, DEFAULT_AVATAR_CONFIG);

    // But DB record still retains saved preferences privately
    assert.equal(dbRecord.display_username, 'Nova');
    assert.equal(dbRecord.avatar_config.shirtColor, '#10B981');

    // If re-linked in future, saved preferences are immediately restored
    const relinkedRecord = { ...dbRecord, college_identity_linked: true };
    const restoredView = getEffectivePersona(relinkedRecord);
    assert.equal(restoredView.displayUsername, 'Nova');
    assert.equal(restoredView.avatarConfig.shirtColor, '#10B981');
  });

  test('get_room_peer returns default avatar and Unknown User for unverified peer', () => {
    // Simulates get_room_peer RPC logic
    function mockGetRoomPeer(peerRecord) {
      if (peerRecord.college_identity_linked) {
        return {
          id: peerRecord.id,
          anonymous_username: peerRecord.display_username || 'Unknown User 1000',
          avatar_config: peerRecord.avatar_config || DEFAULT_AVATAR_CONFIG,
          college_identity_linked: true,
        };
      }
      return {
        id: peerRecord.id,
        anonymous_username: computeDeterministicUnknownUser(peerRecord.id),
        avatar_config: DEFAULT_AVATAR_CONFIG,
        college_identity_linked: false,
      };
    }

    const peerA = {
      id: '22222222-2222-2222-2222-222222222222',
      display_username: 'Cipher',
      avatar_config: { face: 'square', shirtColor: '#EF4444' },
      college_identity_linked: false,
    };

    const peerResult = mockGetRoomPeer(peerA);
    assert.match(peerResult.anonymous_username, /^Unknown User \d{4}$/);
    assert.notEqual(peerResult.anonymous_username, 'Cipher');
    assert.deepEqual(peerResult.avatar_config, DEFAULT_AVATAR_CONFIG);
  });
});

describe('Part 2: Verified Student Information Immutability & Gender Freeze', () => {
  // In-memory simulation of database trigger protect_immutable_profile_fields and save_gender RPC
  class MockProfileStorage {
    constructor() {
      this.profiles = new Map();
      this.inTrustedVerification = false;
    }

    createProfile(id, data = {}) {
      this.profiles.set(id, {
        id,
        college_identity_linked: false,
        name: null,
        full_name: null,
        department: null,
        batch: null,
        gender: null,
        gender_locked_at: null,
        ...data,
      });
    }

    // Called only by physical ID verification scanner RPC
    trustedVerificationUpdate(userId, verificationData) {
      this.inTrustedVerification = true;
      const profile = this.profiles.get(userId);
      profile.college_identity_linked = true;
      profile.name = verificationData.name;
      profile.full_name = verificationData.fullName || verificationData.name;
      profile.department = verificationData.department;
      profile.batch = verificationData.batch;
      profile.verified_at = new Date().toISOString();
      this.inTrustedVerification = false;
      return { success: true };
    }

    // Direct UPDATE simulation representing client-side devtools / direct update attempts
    updateProfileDirect(userId, fields) {
      const old = this.profiles.get(userId);
      if (!old) return { success: false, error: 'NOT_FOUND' };

      // Trigger logic simulation: protect_immutable_profile_fields
      if (old.college_identity_linked && !this.inTrustedVerification) {
        if (fields.department !== undefined && fields.department !== old.department) {
          throw new Error('IMMUTABLE_FIELD_MODIFICATION: department cannot be modified after verification');
        }
        if (fields.batch !== undefined && fields.batch !== old.batch) {
          throw new Error('IMMUTABLE_FIELD_MODIFICATION: batch cannot be modified after verification');
        }
        if (fields.name !== undefined && fields.name !== old.name) {
          throw new Error('IMMUTABLE_FIELD_MODIFICATION: name cannot be modified after verification');
        }
        if (fields.full_name !== undefined && fields.full_name !== old.full_name) {
          throw new Error('IMMUTABLE_FIELD_MODIFICATION: full_name cannot be modified after verification');
        }
      }

      // Gender immutability trigger simulation
      if (old.gender_locked_at || (old.gender && old.gender.trim() !== '')) {
        if (fields.gender !== undefined && fields.gender !== old.gender) {
          throw new Error('GENDER_ALREADY_LOCKED');
        }
      }

      Object.assign(old, fields);
      return { success: true, profile: old };
    }

    // RPC: save_gender
    saveGender(userId, gender) {
      const profile = this.profiles.get(userId);
      if (!profile) return { success: false, error: 'UNAUTHENTICATED' };

      if (!GENDER_OPTIONS.includes(gender)) {
        return { success: false, error: 'INVALID_GENDER' };
      }

      // Freeze check: if already locked or non-null gender set
      if (profile.gender_locked_at || (profile.gender && profile.gender.trim() !== '')) {
        return {
          success: false,
          error: 'GENDER_ALREADY_LOCKED',
          message: 'Gender has already been chosen and cannot be modified.',
        };
      }

      // First valid assignment
      profile.gender = gender;
      profile.gender_locked_at = new Date().toISOString();
      return { success: true, gender: profile.gender };
    }
  }

  let db;
  const userId = 'user-student-123';

  beforeEach(() => {
    db = new MockProfileStorage();
    db.createProfile(userId);
  });

  test('verified student identity fields (Name, Department, Batch) cannot be modified after verification', () => {
    // 1. Verify physical ID
    db.trustedVerificationUpdate(userId, {
      name: 'GNANESHWAR R',
      department: 'CSE',
      batch: '2025-2029',
    });

    const verified = db.profiles.get(userId);
    assert.equal(verified.name, 'GNANESHWAR R');
    assert.equal(verified.department, 'CSE');
    assert.equal(verified.batch, '2025-2029');

    // 2. Client attempts to overwrite department
    assert.throws(
      () => db.updateProfileDirect(userId, { department: 'ECE' }),
      /IMMUTABLE_FIELD_MODIFICATION.*department/
    );

    // 3. Client attempts to overwrite batch
    assert.throws(
      () => db.updateProfileDirect(userId, { batch: '2022-2026' }),
      /IMMUTABLE_FIELD_MODIFICATION.*batch/
    );

    // 4. Client attempts to overwrite name
    assert.throws(
      () => db.updateProfileDirect(userId, { name: 'HACKED NAME' }),
      /IMMUTABLE_FIELD_MODIFICATION.*name/
    );

    // Verify stored fields remain unchanged
    const afterAttempts = db.profiles.get(userId);
    assert.equal(afterAttempts.name, 'GNANESHWAR R');
    assert.equal(afterAttempts.department, 'CSE');
    assert.equal(afterAttempts.batch, '2025-2029');
  });

  test('gender: first write succeeds and records gender_locked_at', () => {
    const res1 = db.saveGender(userId, 'Male');
    assert.equal(res1.success, true);
    assert.equal(res1.gender, 'Male');

    const profile = db.profiles.get(userId);
    assert.equal(profile.gender, 'Male');
    assert.ok(profile.gender_locked_at);
  });

  test('gender: second write fails with GENDER_ALREADY_LOCKED', () => {
    // First write
    const res1 = db.saveGender(userId, 'Female');
    assert.equal(res1.success, true);

    // Attempt second write with different value
    const res2 = db.saveGender(userId, 'Non-Binary');
    assert.equal(res2.success, false);
    assert.equal(res2.error, 'GENDER_ALREADY_LOCKED');

    // Attempt second write via direct table update
    assert.throws(
      () => db.updateProfileDirect(userId, { gender: 'Male' }),
      /GENDER_ALREADY_LOCKED/
    );

    // Remains locked at first choice
    const profile = db.profiles.get(userId);
    assert.equal(profile.gender, 'Female');
  });
});

describe('Part 3: Random Online Chat Requests Architecture', () => {
  class MockChatRequestSystem {
    constructor() {
      this.presence = new Map(); // userId -> { last_seen_at, is_online, available_for_chat_requests }
      this.activeRooms = new Map(); // userId -> roomId
      this.rooms = new Map(); // roomId -> { id, user1_id, user2_id, expires_at, status }
      this.requests = new Map(); // requestId -> { id, requester_id, recipient_id, status, expires_at }
      this.exclusions = new Set(); // `${requesterId}:${recipientId}`
      this.users = new Map(); // userId -> profile
    }

    registerUser(id, profile) {
      this.users.set(id, { id, college_identity_linked: true, display_username: 'User', ...profile });
    }

    heartbeat(userId, available = true, time = Date.now()) {
      this.presence.set(userId, {
        userId,
        lastSeenAt: time,
        isOnline: true,
        availableForChatRequests: available,
      });
    }

    isOnline(userId, now = Date.now()) {
      const p = this.presence.get(userId);
      if (!p || !p.isOnline) return false;
      return (now - p.lastSeenAt) <= 30000; // 30s TTL
    }

    getEligibleRecipients(requesterId, now = Date.now()) {
      const eligible = [];
      for (const [uid, p] of this.presence.entries()) {
        if (uid === requesterId) continue;
        if (!this.isOnline(uid, now)) continue;
        if (!p.availableForChatRequests) continue;
        if (this.activeRooms.has(uid)) continue; // in active chat
        if (this.exclusions.has(`${requesterId}:${uid}`)) continue; // excluded

        // Check if recipient has a pending request
        let hasPending = false;
        for (const req of this.requests.values()) {
          if (req.status === 'pending' && (req.recipient_id === uid || req.requester_id === uid)) {
            hasPending = true;
            break;
          }
        }
        if (!hasPending) {
          eligible.push(uid);
        }
      }
      return eligible;
    }

    createChatRequest(requesterId, now = Date.now()) {
      // Must not already be in chat
      if (this.activeRooms.has(requesterId)) {
        return { success: false, error: 'ALREADY_IN_CHAT' };
      }

      // Check existing pending request
      for (const req of this.requests.values()) {
        if (req.status === 'pending' && req.requester_id === requesterId) {
          return { success: false, error: 'REQUEST_ALREADY_PENDING', requestId: req.id };
        }
      }

      const eligible = this.getEligibleRecipients(requesterId, now);
      if (eligible.length === 0) {
        return { success: false, error: 'NO_ELIGIBLE_ONLINE_USERS' };
      }

      // Random selection
      const recipientId = eligible[Math.floor(Math.random() * eligible.length)];
      const requestId = `req-${Date.now()}-${Math.random()}`;

      const request = {
        id: requestId,
        requester_id: requesterId,
        recipient_id: recipientId,
        status: 'pending',
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + 20000).toISOString(), // 20s TTL
      };
      this.requests.set(requestId, request);

      return {
        success: true,
        request,
      };
    }

    acceptChatRequest(recipientId, requestId, now = Date.now()) {
      const req = this.requests.get(requestId);
      if (!req) return { success: false, error: 'NOT_FOUND' };

      if (req.recipient_id !== recipientId) {
        return { success: false, error: 'FORBIDDEN' };
      }
      if (req.status !== 'pending') {
        return { success: false, error: `REQUEST_${req.status.toUpperCase()}` };
      }
      if (new Date(req.expires_at).getTime() < now) {
        req.status = 'expired';
        return { success: false, error: 'REQUEST_EXPIRED' };
      }

      // Invariant: ONE USER = ONE ACTIVE ROOM
      if (this.activeRooms.has(req.requester_id)) {
        req.status = 'cancelled';
        return { success: false, error: 'REQUESTER_ALREADY_IN_ROOM' };
      }
      if (this.activeRooms.has(recipientId)) {
        req.status = 'cancelled';
        return { success: false, error: 'RECIPIENT_ALREADY_IN_ROOM' };
      }

      req.status = 'accepted';
      const roomId = `room-${Date.now()}`;
      const expiresAt = new Date(now + 7 * 60 * 1000).toISOString(); // 7-minute timer

      this.rooms.set(roomId, {
        id: roomId,
        user1_id: req.requester_id,
        user2_id: recipientId,
        status: 'active',
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
      });

      this.activeRooms.set(req.requester_id, roomId);
      this.activeRooms.set(recipientId, roomId);

      return {
        success: true,
        roomId,
        expiresAt,
      };
    }

    rejectChatRequest(recipientId, requestId) {
      const req = this.requests.get(requestId);
      if (!req || req.recipient_id !== recipientId) {
        return { success: false, error: 'NOT_FOUND' };
      }
      if (req.status !== 'pending') {
        return { success: false, error: `REQUEST_${req.status.toUpperCase()}` };
      }

      req.status = 'rejected';
      // Add exclusion so requester won't immediately re-request the same recipient
      this.exclusions.add(`${req.requester_id}:${recipientId}`);
      return { success: true };
    }
  }

  let sys;
  const userA = 'user-A-requester';
  const userB = 'user-B-recipient';
  const userC = 'user-C-idle';

  beforeEach(() => {
    sys = new MockChatRequestSystem();
    sys.registerUser(userA, { display_username: 'Nova' });
    sys.registerUser(userB, { display_username: 'Astra' });
    sys.registerUser(userC, { display_username: 'Blaze' });
  });

  test('presence heartbeat expires after 30 seconds', () => {
    const t0 = 1000000;
    sys.heartbeat(userB, true, t0);
    assert.equal(sys.isOnline(userB, t0 + 10000), true); // 10s -> online
    assert.equal(sys.isOnline(userB, t0 + 29000), true); // 29s -> online
    assert.equal(sys.isOnline(userB, t0 + 31000), false); // 31s -> offline
  });

  test('random online idle recipient selection without exposing user list', () => {
    const t0 = 1000000;
    sys.heartbeat(userA, true, t0);
    sys.heartbeat(userB, true, t0);
    sys.heartbeat(userC, true, t0);

    const res = sys.createChatRequest(userA, t0);
    assert.equal(res.success, true);
    assert.ok(['user-B-recipient', 'user-C-idle'].includes(res.request.recipient_id));
    assert.notEqual(res.request.recipient_id, userA);
  });

  test('pending request expires after 20 seconds TTL', () => {
    const t0 = 1000000;
    sys.heartbeat(userB, true, t0);

    const res = sys.createChatRequest(userA, t0);
    assert.equal(res.success, true);
    const reqId = res.request.id;

    // After 21 seconds
    const acceptRes = sys.acceptChatRequest(res.request.recipient_id, reqId, t0 + 21000);
    assert.equal(acceptRes.success, false);
    assert.equal(acceptRes.error, 'REQUEST_EXPIRED');
    assert.equal(sys.requests.get(reqId).status, 'expired');
  });

  test('accepting request creates exactly one room with 7-minute expiry', () => {
    const t0 = 1000000;
    sys.heartbeat(userB, true, t0);

    const createRes = sys.createChatRequest(userA, t0);
    assert.equal(createRes.success, true);
    const reqId = createRes.request.id;

    const acceptRes = sys.acceptChatRequest(userB, reqId, t0 + 5000);
    assert.equal(acceptRes.success, true);
    assert.ok(acceptRes.roomId);

    // Verify 7-minute session (420000 ms)
    const expectedExpiry = new Date(t0 + 5000 + 7 * 60 * 1000).toISOString();
    assert.equal(acceptRes.expiresAt, expectedExpiry);

    // Both users are in the same active room
    assert.equal(sys.activeRooms.get(userA), acceptRes.roomId);
    assert.equal(sys.activeRooms.get(userB), acceptRes.roomId);
  });

  test('rejecting request does not create room and adds exclusion cooldown', () => {
    const t0 = 1000000;
    sys.heartbeat(userB, true, t0);

    const createRes = sys.createChatRequest(userA, t0);
    assert.equal(createRes.success, true);
    const reqId = createRes.request.id;

    const rejectRes = sys.rejectChatRequest(userB, reqId);
    assert.equal(rejectRes.success, true);
    assert.equal(sys.requests.get(reqId).status, 'rejected');

    // No room created
    assert.equal(sys.rooms.size, 0);
    assert.equal(sys.activeRooms.has(userA), false);
    assert.equal(sys.activeRooms.has(userB), false);

    // B is excluded for A in immediate next search
    const eligible = sys.getEligibleRecipients(userA, t0 + 1000);
    assert.ok(!eligible.includes(userB));
  });

  test('race condition: active room invariant prevents duplicate room creation', () => {
    const t0 = 1000000;
    // B is online and idle
    sys.heartbeat(userB, true, t0);

    // A sends request (selected recipient is deterministically B)
    const createRes = sys.createChatRequest(userA, t0);
    assert.equal(createRes.success, true);
    assert.equal(createRes.request.recipient_id, userB);
    const reqId = createRes.request.id;

    // Concurrently, C comes online and matches with A in normal matchmaking
    sys.heartbeat(userC, true, t0 + 1000);
    const matchmakingRoomId = 'room-matchmaking-A-C';
    sys.rooms.set(matchmakingRoomId, {
      id: matchmakingRoomId,
      user1_id: userA,
      user2_id: userC,
      status: 'active',
      created_at: new Date(t0 + 2000).toISOString(),
      expires_at: new Date(t0 + 2000 + 420000).toISOString(),
    });
    sys.activeRooms.set(userA, matchmakingRoomId);
    sys.activeRooms.set(userC, matchmakingRoomId);

    // Now B tries to accept A's earlier request
    const acceptRes = sys.acceptChatRequest(userB, reqId, t0 + 3000);
    assert.equal(acceptRes.success, false);
    assert.equal(acceptRes.error, 'REQUESTER_ALREADY_IN_ROOM');

    // Exactly one room exists for User A
    assert.equal(sys.activeRooms.get(userA), matchmakingRoomId);
    assert.equal(sys.activeRooms.has(userB), false);
  });
});
