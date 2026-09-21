/**
 * ============================================================================
 * TALK TO RITIANS - Random 1-to-1 Matchmaking Automated Test Suite (Phase 9)
 * ============================================================================
 * Tests:
 * 1. Eligibility Gate: Unverified / profile-incomplete users rejected
 * 2. Active Room Gate: User inside an active room cannot join queue
 * 3. Multiple-Tab Safety: Partial unique index prevents duplicate searching entries
 * 4. Step 8 Invariant: Two accounts (A & B) match into exactly ONE active room
 * 5. Step 9 Invariant: 3+ accounts (A, B, C, D) match in order without collisions
 * 6. Step 5 Invariant: Cancel search reliably clears queue presence
 * 7. Step 6 Invariant: Stale queue cleanup via heartbeat & expiry
 * 8. Step 4 Invariant: Strict privacy isolation on match result
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// In-Memory Database Emulation for Concurrency & Matchmaking Invariants
// ============================================================================
class MockDatabase {
  constructor() {
    this.profiles = new Map();
    this.anonymousIdentities = new Map();
    this.chatRooms = [];
    this.matchmakingQueue = [];
  }

  seedUser({ id, isVerified = true, isProfileCompleted = true, username = 'RITian', avatarConfig = {} }) {
    this.profiles.set(id, {
      id,
      college_identity_linked: isVerified,
      profile_completed: isProfileCompleted,
      department: 'CSE',
      section: 'A',
      batch: '2023-2027',
      graduation_year: 2027,
      gender: 'Non-Binary',
    });

    this.anonymousIdentities.set(id, {
      user_id: id,
      anonymous_username: username,
      avatar_config: avatarConfig,
    });
  }

  joinMatchmaking(userId) {
    // 1. Eligibility Check
    const profile = this.profiles.get(userId);
    if (!profile) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }
    if (!profile.college_identity_linked) {
      return { success: false, error: 'VERIFICATION_REQUIRED' };
    }
    if (!profile.profile_completed) {
      return { success: false, error: 'PROFILE_INCOMPLETE' };
    }

    // 2. Active Room Gate
    const activeRoom = this.chatRooms.find(
      (r) => r.status === 'active' && (r.user_1 === userId || r.user_2 === userId)
    );
    if (activeRoom) {
      return { success: false, error: 'ALREADY_IN_ACTIVE_ROOM' };
    }

    // 3. Stale Queue Cleanup (> 25 seconds without heartbeat)
    const now = Date.now();
    for (const q of this.matchmakingQueue) {
      if (q.status === 'searching' && now - q.heartbeat_at > 25000) {
        q.status = 'expired';
      }
    }

    // 4. Multiple-Tab Safety: If user already in queue with searching status, update heartbeat
    let myQueue = this.matchmakingQueue.find((q) => q.user_id === userId && q.status === 'searching');
    if (!myQueue) {
      myQueue = {
        id: `q-${Math.random().toString(36).slice(2, 9)}`,
        user_id: userId,
        joined_at: now,
        heartbeat_at: now,
        status: 'searching',
        matched_room_id: null,
        matched_user_id: null,
      };
      this.matchmakingQueue.push(myQueue);
    } else {
      myQueue.heartbeat_at = now;
    }

    // 5. Atomic Pairing via FOR UPDATE SKIP LOCKED emulation
    // Find candidate partner: searching, not self, active heartbeat, not in active room
    const candidate = this.matchmakingQueue.find(
      (q) =>
        q.status === 'searching' &&
        q.user_id !== userId &&
        now - q.heartbeat_at <= 25000 &&
        !this.chatRooms.some(
          (r) => r.status === 'active' && (r.user_1 === q.user_id || r.user_2 === q.user_id)
        )
    );

    if (candidate) {
      // Create chat room
      const roomId = `room-${Math.random().toString(36).slice(2, 9)}`;
      const room = {
        id: roomId,
        user_1: candidate.user_id,
        user_2: userId,
        status: 'active',
        created_at: new Date().toISOString(),
        ended_at: null,
        end_reason: null,
      };
      this.chatRooms.push(room);

      // Mark both queue entries as matched
      candidate.status = 'matched';
      candidate.matched_room_id = roomId;
      candidate.matched_user_id = userId;

      myQueue.status = 'matched';
      myQueue.matched_room_id = roomId;
      myQueue.matched_user_id = candidate.user_id;

      // Privacy: Resolve partner anonymous persona ONLY
      const partnerPersona = this.anonymousIdentities.get(candidate.user_id);

      return {
        success: true,
        status: 'matched',
        room_id: roomId,
        queue_id: myQueue.id,
        peer: {
          anonymous_username: partnerPersona?.anonymous_username || 'Anonymous RITian',
          avatar_config: partnerPersona?.avatar_config || {},
        },
      };
    }

    return {
      success: true,
      status: 'searching',
      queue_id: myQueue.id,
    };
  }

  heartbeatMatchmaking(userId) {
    const q = this.matchmakingQueue.find(
      (item) => item.user_id === userId && (item.status === 'searching' || item.status === 'matched')
    );
    if (!q) return { success: true, status: 'idle' };

    q.heartbeat_at = Date.now();

    if (q.status === 'matched' && q.matched_room_id) {
      const partnerPersona = this.anonymousIdentities.get(q.matched_user_id);
      return {
        success: true,
        status: 'matched',
        room_id: q.matched_room_id,
        peer: {
          anonymous_username: partnerPersona?.anonymous_username || 'Anonymous RITian',
          avatar_config: partnerPersona?.avatar_config || {},
        },
      };
    }

    return {
      success: true,
      status: 'searching',
      queue_id: q.id,
    };
  }

  leaveMatchmaking(userId) {
    const q = this.matchmakingQueue.find(
      (item) => item.user_id === userId && item.status === 'searching'
    );
    if (q) {
      q.status = 'cancelled';
    }
    return { success: true, status: 'cancelled' };
  }
}

describe('Phase 9 - Random 1-to-1 Matchmaking Architecture', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
  });

  // =========================================================================
  // 1. Eligibility Gate: Unverified & Incomplete Profiles
  // =========================================================================
  describe('1. Eligibility Gate', () => {
    test('rejects unverified user from joining queue', () => {
      db.seedUser({ id: 'user-unverified', isVerified: false, isProfileCompleted: false });
      const res = db.joinMatchmaking('user-unverified');

      assert.equal(res.success, false);
      assert.equal(res.error, 'VERIFICATION_REQUIRED');
    });

    test('rejects verified user who has not completed campus profile setup', () => {
      db.seedUser({ id: 'user-incomplete', isVerified: true, isProfileCompleted: false });
      const res = db.joinMatchmaking('user-incomplete');

      assert.equal(res.success, false);
      assert.equal(res.error, 'PROFILE_INCOMPLETE');
    });

    test('allows fully onboarded verified student to join matchmaking', () => {
      db.seedUser({ id: 'user-valid', isVerified: true, isProfileCompleted: true });
      const res = db.joinMatchmaking('user-valid');

      assert.equal(res.success, true);
      assert.equal(res.status, 'searching');
    });
  });

  // =========================================================================
  // 2. Active Room Gate
  // =========================================================================
  describe('2. Active Room Gate', () => {
    test('blocks user who is already inside an active chat room from joining queue', () => {
      db.seedUser({ id: 'user-active-1', isVerified: true, isProfileCompleted: true });
      db.seedUser({ id: 'user-active-2', isVerified: true, isProfileCompleted: true });

      // Match user 1 and 2
      db.joinMatchmaking('user-active-1');
      db.joinMatchmaking('user-active-2');

      // Check room exists and is active
      assert.equal(db.chatRooms.length, 1);
      assert.equal(db.chatRooms[0].status, 'active');

      // Attempt by user-active-1 to join queue again while room is active
      const retryRes = db.joinMatchmaking('user-active-1');
      assert.equal(retryRes.success, false);
      assert.equal(retryRes.error, 'ALREADY_IN_ACTIVE_ROOM');
    });
  });

  // =========================================================================
  // 3. Multiple-Tab Safety
  // =========================================================================
  describe('3. Multiple-Tab Safety', () => {
    test('prevents creating multiple concurrent searching queue records for the same account', () => {
      db.seedUser({ id: 'user-multi-tab', isVerified: true, isProfileCompleted: true });

      // Tab 1 joins
      const tab1Res = db.joinMatchmaking('user-multi-tab');
      assert.equal(tab1Res.status, 'searching');

      // Tab 2 joins simultaneously
      const tab2Res = db.joinMatchmaking('user-multi-tab');
      assert.equal(tab2Res.status, 'searching');

      // Count active searching rows for user
      const activeEntries = db.matchmakingQueue.filter(
        (q) => q.user_id === 'user-multi-tab' && q.status === 'searching'
      );
      assert.equal(activeEntries.length, 1, 'There must be at most 1 active searching queue entry');
    });
  });

  // =========================================================================
  // 4. Step 8 Invariant: Test with Two Accounts (A & B)
  // =========================================================================
  describe('4. Step 8 Invariant: Two Accounts (A <-> B) Matchmaking', () => {
    test('Account A joins, Account B joins -> Exactly ONE active room linking A and B', () => {
      db.seedUser({
        id: 'account-A',
        username: 'SilentFox',
        avatarConfig: { face: 'round', skin: '#FDDBB4' },
      });
      db.seedUser({
        id: 'account-B',
        username: 'NeonWolf',
        avatarConfig: { face: 'oval', skin: '#F3B183' },
      });

      // Account A joins queue
      const resA = db.joinMatchmaking('account-A');
      assert.equal(resA.success, true);
      assert.equal(resA.status, 'searching');
      assert.equal(db.chatRooms.length, 0);

      // Account B joins queue
      const resB = db.joinMatchmaking('account-B');
      assert.equal(resB.success, true);
      assert.equal(resB.status, 'matched');
      assert.ok(resB.room_id);

      // Verify Account B received Account A's anonymous profile
      assert.equal(resB.peer.anonymous_username, 'SilentFox');
      assert.equal(resB.peer.avatar_config.face, 'round');

      // Verify Exactly 1 active room created
      assert.equal(db.chatRooms.length, 1);
      const room = db.chatRooms[0];
      assert.equal(room.id, resB.room_id);
      assert.equal(room.status, 'active');
      assert.ok(
        (room.user_1 === 'account-A' && room.user_2 === 'account-B') ||
        (room.user_1 === 'account-B' && room.user_2 === 'account-A')
      );

      // Account A polls heartbeat and receives the match with Account B's profile
      const hbA = db.heartbeatMatchmaking('account-A');
      assert.equal(hbA.status, 'matched');
      assert.equal(hbA.room_id, room.id);
      assert.equal(hbA.peer.anonymous_username, 'NeonWolf');
      assert.equal(hbA.peer.avatar_config.face, 'oval');
    });
  });

  // =========================================================================
  // 5. Step 9 Invariant: 3+ Users (A, B, C, D)
  // =========================================================================
  describe('5. Step 9 Invariant: 3+ Accounts Order & Non-Colliding Rooms', () => {
    test('A, B, C join -> A & B match into Room 1, C waits -> D joins -> C & D match into Room 2', () => {
      db.seedUser({ id: 'user-A', username: 'Alpha' });
      db.seedUser({ id: 'user-B', username: 'Bravo' });
      db.seedUser({ id: 'user-C', username: 'Charlie' });
      db.seedUser({ id: 'user-D', username: 'Delta' });

      // User A joins
      const resA = db.joinMatchmaking('user-A');
      assert.equal(resA.status, 'searching');

      // User B joins -> pairs with A
      const resB = db.joinMatchmaking('user-B');
      assert.equal(resB.status, 'matched');
      const room1Id = resB.room_id;

      // User C joins -> no available peers (A and B are in active room 1), C waits
      const resC = db.joinMatchmaking('user-C');
      assert.equal(resC.status, 'searching');
      assert.equal(db.chatRooms.length, 1);

      // User D joins -> pairs with waiting User C
      const resD = db.joinMatchmaking('user-D');
      assert.equal(resD.status, 'matched');
      const room2Id = resD.room_id;

      // Total 2 distinct chat rooms created
      assert.equal(db.chatRooms.length, 2);
      assert.notEqual(room1Id, room2Id, 'Room IDs must be unique');

      // Verify Room 1 participants
      const r1 = db.chatRooms.find((r) => r.id === room1Id);
      assert.ok([r1.user_1, r1.user_2].includes('user-A'));
      assert.ok([r1.user_1, r1.user_2].includes('user-B'));

      // Verify Room 2 participants
      const r2 = db.chatRooms.find((r) => r.id === room2Id);
      assert.ok([r2.user_1, r2.user_2].includes('user-C'));
      assert.ok([r2.user_1, r2.user_2].includes('user-D'));

      // User C's heartbeat resolves into Room 2 with User D
      const hbC = db.heartbeatMatchmaking('user-C');
      assert.equal(hbC.status, 'matched');
      assert.equal(hbC.room_id, room2Id);
      assert.equal(hbC.peer.anonymous_username, 'Delta');
    });
  });

  // =========================================================================
  // 6. Step 5 Invariant: Cancellation Reliability
  // =========================================================================
  describe('6. Step 5 Invariant: Cancellation Reliability', () => {
    test('cancelling search removes active queue presence', () => {
      db.seedUser({ id: 'user-cancel' });
      db.joinMatchmaking('user-cancel');

      // Cancel
      const cancelRes = db.leaveMatchmaking('user-cancel');
      assert.equal(cancelRes.status, 'cancelled');

      // Confirm queue record is cancelled
      const qEntry = db.matchmakingQueue.find((q) => q.user_id === 'user-cancel');
      assert.equal(qEntry.status, 'cancelled');

      // When another user joins, cancelled user is NOT matched
      db.seedUser({ id: 'user-late' });
      const lateRes = db.joinMatchmaking('user-late');
      assert.equal(lateRes.status, 'searching', 'Late user must not match with cancelled entry');
      assert.equal(db.chatRooms.length, 0);
    });
  });

  // =========================================================================
  // 7. Step 6 Invariant: Stale Queue Cleanup via Heartbeat & Expiry
  // =========================================================================
  describe('7. Step 6 Invariant: Stale Queue Cleanup', () => {
    test('stale queue entries without heartbeat for > 25 seconds are expired and skipped', () => {
      db.seedUser({ id: 'user-abandoned' });
      db.joinMatchmaking('user-abandoned');

      // Simulate abandoned tab by setting heartbeat back 30 seconds
      const abandonedQueue = db.matchmakingQueue.find((q) => q.user_id === 'user-abandoned');
      abandonedQueue.heartbeat_at = Date.now() - 30000;

      // New user joins
      db.seedUser({ id: 'user-new' });
      const newRes = db.joinMatchmaking('user-new');

      // Must not match with the abandoned entry; abandoned entry must be marked expired
      assert.equal(newRes.status, 'searching');
      assert.equal(abandonedQueue.status, 'expired');
      assert.equal(db.chatRooms.length, 0);
    });
  });

  // =========================================================================
  // 8. Step 4 Invariant: Strict Privacy Isolation on Match Result
  // =========================================================================
  describe('8. Step 4 Invariant: Privacy Isolation on Match Result', () => {
    test('match result contains strictly anonymous handle & avatar, zero private fields', () => {
      db.seedUser({
        id: 'peer-private',
        username: 'StealthFalcon',
        avatarConfig: { face: 'square', background: 'midnight' },
      });
      db.seedUser({ id: 'caller-user' });

      db.joinMatchmaking('peer-private');
      const matchResult = db.joinMatchmaking('caller-user');

      assert.equal(matchResult.status, 'matched');
      assert.ok(matchResult.peer);

      // Verify permitted fields
      assert.equal(matchResult.peer.anonymous_username, 'StealthFalcon');
      assert.deepEqual(matchResult.peer.avatar_config, { face: 'square', background: 'midnight' });

      // Verify strictly prohibited private fields
      const prohibitedKeys = [
        'email',
        'personal_email',
        'college_email',
        'roll_number',
        'register_number',
        'department',
        'section',
        'class_name',
        'batch',
        'graduation_year',
        'gender',
        'identity_hash',
      ];

      for (const key of prohibitedKeys) {
        assert.equal(
          key in matchResult.peer,
          false,
          `CRITICAL PRIVACY VIOLATION: '${key}' must NEVER be sent to chat stranger!`
        );
      }
    });
  });
});
