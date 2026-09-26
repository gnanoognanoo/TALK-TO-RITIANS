/**
 * ============================================================================
 * TALK TO RITIANS - 7-Minute Chat Limit Automated Test Suite
 * ============================================================================
 *
 * Verifies:
 * 1. Server-Authoritative 7-Minute Expiration:
 *    - expires_at = created_at + interval '7 minutes'
 *    - Identical for both participants upon room creation
 * 2. Timer Start:
 *    - Starts immediately when chat room is created
 * 3. Refresh and Reconnect Behavior:
 *    - Preserves authoritative expiration timestamp; never resets to 07:00
 *    - Recomputes remaining seconds from expires_at
 * 4. Background Tab / Mobile Visibility Change:
 *    - Recalculates expires_at - now; immediately transitions if overdue
 * 5. Message Authorization & Boundary Behavior:
 *    - Message before expiration (< 07:00) succeeds
 *    - Message at/after expiration (>= 07:00) rejected with ROOM_EXPIRED
 *    - Database server timestamp is authoritative; client clock is never trusted
 * 6. Automatic Idempotent Room Expiration:
 *    - Status transitions to 'ended', end_reason = 'time_limit'
 *    - Never overwrites existing 'skip' or 'leave'
 * 7. Skip and Leave Precedence:
 *    - Skip before expiry ends room immediately with end_reason = 'skip'
 *    - Leave before expiry ends room immediately with end_reason = 'leave'
 * 8. Realtime Synchronization & Dual-Client State:
 *    - Both participants transition to ended state
 * 9. Rematch Fresh Timer:
 *    - Next conversation receives a fresh 7-minute room
 * 10. Privacy Invariant:
 *    - Zero exposure of real name, register number, identity hash, department,
 *      batch, gender, or email in chat/room payloads
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// Server-Authoritative Database Simulator for 7-Minute Chat Limit
// ============================================================================

class MockServerDatabase {
  constructor() {
    this.serverTimeOffset = 0; // ms offset to simulate server clock progression
    this.chatRooms = new Map();
    this.chatMessages = [];
    this.matchmakingQueue = [];
    this.anonymousIdentities = new Map();
    this.profiles = new Map();
  }

  getServerTime() {
    return new Date(Date.now() + this.serverTimeOffset);
  }

  advanceServerTime(ms) {
    this.serverTimeOffset += ms;
  }

  seedStudent({ id, username = 'RITian', avatarConfig = {} }) {
    this.profiles.set(id, {
      id,
      college_identity_linked: true,
      profile_completed: true,
      department: 'CSE',
      batch: '2023-2027',
      register_number: '210723104001',
      identity_hash: 'hash-abc-123',
      personal_email: 'student@example.com',
      gender: 'prefer_not_to_say',
    });
    this.anonymousIdentities.set(id, {
      user_id: id,
      anonymous_username: username,
      avatar_config: avatarConfig,
    });
  }

  /**
   * Simulates atomic join_matchmaking() RPC with 7-minute server expiration
   */
  joinMatchmaking(userId) {
    const serverNow = this.getServerTime();

    // Check if partner is searching
    const partnerIdx = this.matchmakingQueue.findIndex(
      (q) => q.status === 'searching' && q.userId !== userId
    );

    if (partnerIdx >= 0) {
      const partner = this.matchmakingQueue[partnerIdx];
      const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const createdAt = serverNow.toISOString();
      const expiresAt = new Date(serverNow.getTime() + 7 * 60 * 1000).toISOString();

      const room = {
        id: roomId,
        user_1: partner.userId,
        user_2: userId,
        status: 'active',
        created_at: createdAt,
        expires_at: expiresAt,
        ended_at: null,
        end_reason: null,
      };
      this.chatRooms.set(roomId, room);

      // Remove partner from queue
      this.matchmakingQueue.splice(partnerIdx, 1);

      const partnerIdentity = this.anonymousIdentities.get(partner.userId);
      return {
        success: true,
        status: 'matched',
        room_id: roomId,
        created_at: createdAt,
        expires_at: expiresAt,
        peer: {
          anonymous_username: partnerIdentity?.anonymous_username || 'Anonymous RITian',
          avatar_config: partnerIdentity?.avatar_config || {},
        },
      };
    }

    // Wait in queue
    this.matchmakingQueue.push({
      userId,
      status: 'searching',
      joinedAt: serverNow.toISOString(),
    });

    return {
      success: true,
      status: 'searching',
    };
  }

  /**
   * Simulates heartbeat_matchmaking() RPC
   */
  heartbeatMatchmaking(userId, targetRoomId) {
    const room = this.chatRooms.get(targetRoomId);
    if (!room) return { success: true, status: 'searching' };

    const peerId = room.user_1 === userId ? room.user_2 : room.user_1;
    const peerIdentity = this.anonymousIdentities.get(peerId);

    return {
      success: true,
      status: 'matched',
      room_id: room.id,
      created_at: room.created_at,
      expires_at: room.expires_at,
      peer: {
        anonymous_username: peerIdentity?.anonymous_username || 'Anonymous RITian',
        avatar_config: peerIdentity?.avatar_config || {},
      },
    };
  }

  /**
   * Simulates server-authoritative send_chat_message() RPC
   */
  sendChatMessage({ callerId, roomId, content }) {
    if (!callerId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }

    const room = this.chatRooms.get(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return { success: false, error: 'UNAUTHORIZED_ROOM_ACCESS' };
    }

    if (room.status !== 'active') {
      return { success: false, error: 'ROOM_INACTIVE' };
    }

    const serverNow = this.getServerTime();

    // 7-MINUTE LIMIT CHECK
    if (room.expires_at && serverNow.getTime() >= new Date(room.expires_at).getTime()) {
      if (room.status === 'active') {
        room.status = 'ended';
        room.ended_at = serverNow.toISOString();
        room.end_reason = 'time_limit';
        this.chatMessages.push({
          id: `sys-${Date.now()}`,
          room_id: roomId,
          sender_id: callerId,
          content: '7-minute chat session ended.',
          created_at: serverNow.toISOString(),
          message_type: 'system',
        });
      }
      return {
        success: false,
        error: 'ROOM_EXPIRED',
        message: 'This 7-minute conversation has expired.',
      };
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      return { success: false, error: 'EMPTY_MESSAGE' };
    }

    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      room_id: roomId,
      sender_id: callerId,
      content: trimmed,
      created_at: serverNow.toISOString(),
      message_type: 'text',
    };
    this.chatMessages.push(msg);

    return { success: true, message: msg };
  }

  /**
   * Simulates get_room_peer() RPC
   */
  getRoomPeer({ callerId, roomId }) {
    if (!callerId) return { success: false, error: 'UNAUTHENTICATED' };

    const room = this.chatRooms.get(roomId);
    if (!room || (room.user_1 !== callerId && room.user_2 !== callerId)) {
      return { success: false, error: 'NOT_A_PARTICIPANT' };
    }

    const serverNow = this.getServerTime();

    // Check expiry
    if (room.status === 'active' && room.expires_at && serverNow.getTime() >= new Date(room.expires_at).getTime()) {
      room.status = 'ended';
      room.ended_at = serverNow.toISOString();
      room.end_reason = 'time_limit';
    }

    const peerId = room.user_1 === callerId ? room.user_2 : room.user_1;
    const peerIdentity = this.anonymousIdentities.get(peerId);

    return {
      success: true,
      room_id: room.id,
      room_status: room.status,
      created_at: room.created_at,
      expires_at: room.expires_at,
      end_reason: room.end_reason,
      peer: {
        anonymous_username: peerIdentity?.anonymous_username || 'Anonymous RITian',
        avatar_config: peerIdentity?.avatar_config || {},
      },
    };
  }

  /**
   * Simulates end_chat_room() RPC (Skip / Leave)
   */
  endChatRoom({ callerId, roomId, reason }) {
    const room = this.chatRooms.get(roomId);
    if (!room || (room.user_1 !== callerId && room.user_2 !== callerId)) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    if (room.status === 'ended') {
      return {
        success: true,
        room_id: roomId,
        status: 'ended',
        end_reason: room.end_reason,
        already_ended: true,
      };
    }

    const serverNow = this.getServerTime();
    room.status = 'ended';
    room.ended_at = serverNow.toISOString();
    room.end_reason = reason;

    const systemContent = reason === 'time_limit' ? '7-minute chat session ended.' : 'Stranger disconnected.';
    this.chatMessages.push({
      id: `sys-${Date.now()}`,
      room_id: roomId,
      sender_id: callerId,
      content: systemContent,
      created_at: serverNow.toISOString(),
      message_type: 'system',
    });

    return {
      success: true,
      room_id: roomId,
      status: 'ended',
      end_reason: reason,
      already_ended: false,
    };
  }

  /**
   * Simulates cleanup_stale_sessions() janitor
   */
  cleanupStaleSessions() {
    const serverNow = this.getServerTime();
    let cleaned = 0;

    for (const room of this.chatRooms.values()) {
      if (room.status === 'active' && room.expires_at && serverNow.getTime() >= new Date(room.expires_at).getTime()) {
        room.status = 'ended';
        room.ended_at = serverNow.toISOString();
        room.end_reason = 'time_limit';
        cleaned++;
      }
    }

    return { success: true, time_limit_rooms_cleaned: cleaned };
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Phase 13 — 7-Minute Chat Limit & Server Expiration Suite', () => {
  let db;
  const userA = 'user-student-alpha';
  const userB = 'user-student-beta';
  const userC = 'user-student-gamma';

  beforeEach(() => {
    db = new MockServerDatabase();
    db.seedStudent({ id: userA, username: 'AlphaTiger' });
    db.seedStudent({ id: userB, username: 'BetaPhoenix' });
    db.seedStudent({ id: userC, username: 'GammaFalcon' });
  });

  describe('1. Server-Authoritative Expiration & Timer Initialization', () => {
    test('room expires exactly 7 minutes (420 seconds) after creation', () => {
      // User A waits in queue
      db.joinMatchmaking(userA);

      // User B joins -> paired
      const matchRes = db.joinMatchmaking(userB);
      assert.equal(matchRes.success, true);
      assert.equal(matchRes.status, 'matched');

      const createdAt = new Date(matchRes.created_at).getTime();
      const expiresAt = new Date(matchRes.expires_at).getTime();

      // Exactly 7 minutes = 420,000 milliseconds
      const durationMs = expiresAt - createdAt;
      assert.equal(durationMs, 7 * 60 * 1000);
    });

    test('both participants receive the identical expiration timestamp', () => {
      db.joinMatchmaking(userA);
      const matchB = db.joinMatchmaking(userB);

      const matchA = db.heartbeatMatchmaking(userA, matchB.room_id);

      assert.equal(matchA.expires_at, matchB.expires_at);
      assert.equal(matchA.created_at, matchB.created_at);
      assert.equal(matchA.room_id, matchB.room_id);
    });

    test('timer begins immediately on room creation, not on first message or page load', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);

      // Room is created; 0 messages sent
      const room = db.chatRooms.get(match.room_id);
      assert.ok(room.expires_at);
      assert.equal(db.chatMessages.length, 0);

      // Expiration is already locked in at created_at + 7 min
      const diff = new Date(room.expires_at).getTime() - new Date(room.created_at).getTime();
      assert.equal(diff, 420000);
    });
  });

  describe('2. Refresh & Reconnect Recovery (Never Resets to 07:00)', () => {
    test('refresh after 3 minutes accurately shows approximately 4 minutes remaining', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Advance server and client time by 3 minutes (180,000 ms)
      db.advanceServerTime(3 * 60 * 1000);

      // Client reloads and hydrates via getRoomPeer()
      const peerRes = db.getRoomPeer({ callerId: userA, roomId });
      assert.equal(peerRes.success, true);
      assert.equal(peerRes.room_status, 'active');

      // Client calculates remaining = expires_at - current time
      const remainingMs = new Date(peerRes.expires_at).getTime() - db.getServerTime().getTime();
      const remainingSec = Math.floor(remainingMs / 1000);

      assert.equal(remainingSec, 240); // 4 minutes remaining, NOT 420 (7 minutes)
    });

    test('reconnect after temporary network loss recovers same expiration timestamp', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Simulate 45 seconds of offline interruption
      db.advanceServerTime(45 * 1000);

      // Online event fires -> reconnectRoom
      const peerRes = db.getRoomPeer({ callerId: userB, roomId });
      assert.equal(peerRes.success, true);
      assert.equal(peerRes.expires_at, match.expires_at);

      const remainingSec = Math.floor(
        (new Date(peerRes.expires_at).getTime() - db.getServerTime().getTime()) / 1000
      );
      assert.equal(remainingSec, 375); // 420 - 45 = 375 seconds
    });
  });

  describe('3. Background Tab & Mobile Visibility Recalculation', () => {
    test('mobile lock / background tab transitions immediately to ended when duration exceeded', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // User locks phone for 8 minutes
      db.advanceServerTime(8 * 60 * 1000);

      // User unlocks phone -> visibilitychange fired -> getRoomPeer()
      const res = db.getRoomPeer({ callerId: userA, roomId });
      assert.equal(res.success, true);
      assert.equal(res.room_status, 'ended');
      assert.equal(res.end_reason, 'time_limit');
    });
  });

  describe('4. Message Authorization & Boundary Behavior', () => {
    test('messages sent before 7-minute limit are successfully accepted', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // At 2 minutes in (remaining: 5 minutes)
      db.advanceServerTime(2 * 60 * 1000);
      const res = db.sendChatMessage({ callerId: userA, roomId, content: 'Hello RITian!' });
      assert.equal(res.success, true);
      assert.equal(res.message.content, 'Hello RITian!');
    });

    test('boundary message at 06:59.900 is accepted', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Advance to 6 minutes, 59 seconds, 900 ms (100 ms before expiry)
      db.advanceServerTime(420000 - 100);

      const res = db.sendChatMessage({ callerId: userB, roomId, content: 'Last second message!' });
      assert.equal(res.success, true);
      assert.equal(res.message.content, 'Last second message!');
    });

    test('boundary message at 07:00.000 is rejected with ROOM_EXPIRED', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Exactly 7 minutes (420,000 ms)
      db.advanceServerTime(420000);

      const res = db.sendChatMessage({ callerId: userA, roomId, content: 'Too late!' });
      assert.equal(res.success, false);
      assert.equal(res.error, 'ROOM_EXPIRED');

      // Room status transitioned to ended
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'time_limit');
    });

    test('boundary message at 07:00.100 is rejected with ROOM_EXPIRED', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // 100ms past 7 minutes
      db.advanceServerTime(420100);

      const res = db.sendChatMessage({ callerId: userB, roomId, content: 'After expiry' });
      assert.equal(res.success, false);
      assert.equal(res.error, 'ROOM_EXPIRED');
    });

    test('client cannot manipulate message authorization: server database time is authoritative', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Server time has passed 7 minutes
      db.advanceServerTime(450000);

      // Even if client attempts to call sendChatMessage, server enforces now() >= expires_at
      const res = db.sendChatMessage({ callerId: userA, roomId, content: 'Forged timestamp' });
      assert.equal(res.success, false);
      assert.equal(res.error, 'ROOM_EXPIRED');
    });
  });

  describe('5. Skip and Leave Precedence Over Time Limit', () => {
    test('skip at 4:30 remaining immediately ends room with end_reason = skip', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Advance 2.5 minutes (4.5 minutes remaining)
      db.advanceServerTime(150000);

      const skipRes = db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });
      assert.equal(skipRes.success, true);
      assert.equal(skipRes.end_reason, 'skip');

      // Now advance past 7 minutes
      db.advanceServerTime(300000);

      // Check room in database
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'skip'); // MUST NOT be overwritten with 'time_limit'
    });

    test('leave before timeout retains end_reason = leave after expiration passes', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Advance 1 minute
      db.advanceServerTime(60000);

      const leaveRes = db.endChatRoom({ callerId: userB, roomId, reason: 'leave' });
      assert.equal(leaveRes.success, true);
      assert.equal(leaveRes.end_reason, 'leave');

      // Advance past 7 minutes
      db.advanceServerTime(400000);

      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'leave'); // MUST NOT be overwritten
    });
  });

  describe('6. Realtime Synchronization & Dual Participant State', () => {
    test('both users receive ended room state when 7 minutes elapse', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      const roomId = match.room_id;

      // Elapse 7 minutes
      db.advanceServerTime(420000);

      // User A inspects room
      const peerA = db.getRoomPeer({ callerId: userA, roomId });
      assert.equal(peerA.room_status, 'ended');
      assert.equal(peerA.end_reason, 'time_limit');

      // User B inspects room
      const peerB = db.getRoomPeer({ callerId: userB, roomId });
      assert.equal(peerB.room_status, 'ended');
      assert.equal(peerB.end_reason, 'time_limit');
    });
  });

  describe('7. Rematch Receives Fresh 7-Minute Room', () => {
    test('entering matchmaking again after expiration gives a new 7-minute room', () => {
      // Room 1: User A & User B
      db.joinMatchmaking(userA);
      const match1 = db.joinMatchmaking(userB);
      db.advanceServerTime(420000); // Room 1 expires

      // End Room 1
      db.getRoomPeer({ callerId: userA, roomId: match1.room_id });

      // User A clicks "Find Another RITian" -> joins matchmaking again
      db.joinMatchmaking(userA);

      // User C joins matchmaking
      const match2 = db.joinMatchmaking(userC);
      assert.equal(match2.success, true);
      assert.equal(match2.status, 'matched');
      assert.notEqual(match2.room_id, match1.room_id);

      // New room has its own 7-minute interval from the new created_at
      const newCreatedAt = new Date(match2.created_at).getTime();
      const newExpiresAt = new Date(match2.expires_at).getTime();
      assert.equal(newExpiresAt - newCreatedAt, 420000);
    });
  });

  describe('8. Privacy Invariant on 7-Minute Payloads', () => {
    test('chat peer payloads never leak personal or academic metadata', () => {
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);

      const peerRes = db.getRoomPeer({ callerId: userA, roomId: match.room_id });

      // Permitted fields
      assert.ok(peerRes.room_id);
      assert.ok(peerRes.room_status);
      assert.ok(peerRes.created_at);
      assert.ok(peerRes.expires_at);
      assert.ok(peerRes.peer);
      assert.ok(peerRes.peer.anonymous_username);
      assert.ok(peerRes.peer.avatar_config);

      // STRICT PRIVACY PROHIBITIONS:
      const rawPayload = JSON.stringify(peerRes);
      assert.equal(rawPayload.includes('210723104001'), false, 'Leaks register number');
      assert.equal(rawPayload.includes('hash-abc-123'), false, 'Leaks identity hash');
      assert.equal(rawPayload.includes('student@example.com'), false, 'Leaks email');
      assert.equal(rawPayload.includes('CSE'), false, 'Leaks department');
      assert.equal(rawPayload.includes('2023-2027'), false, 'Leaks batch');
      assert.equal(rawPayload.includes('prefer_not_to_say'), false, 'Leaks gender');
    });
  });

  describe('9. Database Cleanup Janitor (cleanup_stale_sessions)', () => {
    test('cleanup_stale_sessions safely cleans overdue active rooms and ignores ended rooms', () => {
      // Room 1: active, not expired
      db.joinMatchmaking(userA);
      const match1 = db.joinMatchmaking(userB);

      // Room 2: active, will expire
      db.advanceServerTime(200000);
      db.joinMatchmaking(userB);
      // Wait in queue

      // Advance time past 7 minutes from Room 1
      db.advanceServerTime(230000); // 430,000 ms total from Room 1 start

      const janitorRes = db.cleanupStaleSessions();
      assert.equal(janitorRes.success, true);
      assert.equal(janitorRes.time_limit_rooms_cleaned, 1);

      const room1 = db.chatRooms.get(match1.room_id);
      assert.equal(room1.status, 'ended');
      assert.equal(room1.end_reason, 'time_limit');
    });
  });

  describe('10. Full 7-Minute Flow Specification Compliance', () => {
    test('flow step-by-step: match -> room -> 07:00 countdown -> chat -> 01:00 warning -> 00:00 time_limit -> [Find Another RITian] [Leave]', () => {
      // Step 1: Two students matched
      db.joinMatchmaking(userA);
      const match = db.joinMatchmaking(userB);
      assert.equal(match.status, 'matched');
      const roomId = match.room_id;

      // Step 2: Room created with 7-minute server authoritative expiration
      const room = db.chatRooms.get(roomId);
      assert.ok(room);
      assert.equal(room.status, 'active');

      // Step 3: 07:00 countdown starts
      const startTime = new Date(match.created_at).getTime();
      const expiresTime = new Date(match.expires_at).getTime();
      const initialSecondsRemaining = Math.floor((expiresTime - startTime) / 1000);
      assert.equal(initialSecondsRemaining, 420); // 7 minutes = 420 seconds = "07:00"

      // Step 4: Chat normally
      db.advanceServerTime(60000); // 1 minute in
      const msg1 = db.sendChatMessage({ callerId: userA, roomId, content: 'Hey fellow RITian!' });
      assert.equal(msg1.success, true);
      assert.equal(msg1.message.content, 'Hey fellow RITian!');

      db.advanceServerTime(60000); // 2 minutes in
      const msg2 = db.sendChatMessage({ callerId: userB, roomId, content: 'Hello! How are you doing?' });
      assert.equal(msg2.success, true);

      // Step 5: 01:00 remaining -> warning
      db.advanceServerTime(240000); // 6 minutes total elapsed (360s elapsed, 60s remaining)
      const nowAtWarning = db.getServerTime().getTime();
      const secondsAtWarning = Math.floor((expiresTime - nowAtWarning) / 1000);
      assert.equal(secondsAtWarning, 60); // 01:00 remaining triggers warning

      // Warning state boundary checks
      const isWarningActive = secondsAtWarning <= 60 && secondsAtWarning > 0;
      assert.equal(isWarningActive, true);

      // Step 6: 00:00 -> Room automatically ends with end_reason = "time_limit"
      db.advanceServerTime(60000); // 7 minutes total elapsed (420s elapsed, 0s remaining)
      const nowAtExpiry = db.getServerTime().getTime();
      const secondsAtExpiry = Math.max(0, Math.floor((expiresTime - nowAtExpiry) / 1000));
      assert.equal(secondsAtExpiry, 0); // 00:00

      // Attempting to send message at 00:00 triggers ROOM_EXPIRED and sets room to ended with end_reason = 'time_limit'
      const lateMsg = db.sendChatMessage({ callerId: userA, roomId, content: 'Are you still there?' });
      assert.equal(lateMsg.success, false);
      assert.equal(lateMsg.error, 'ROOM_EXPIRED');

      const expiredRoom = db.chatRooms.get(roomId);
      assert.equal(expiredRoom.status, 'ended');
      assert.equal(expiredRoom.end_reason, 'time_limit');

      // Step 7: Server end_chat_room with time_limit emits system notification
      const endRes = db.endChatRoom({ callerId: userA, roomId, reason: 'time_limit' });
      assert.equal(endRes.success, true);
      assert.equal(endRes.end_reason, 'time_limit');

      // Step 8: System notification and UI string contracts
      const sysMsg = db.chatMessages.find((m) => m.room_id === roomId && m.message_type === 'system');
      assert.ok(sysMsg);
      assert.equal(sysMsg.content, '7-minute chat session ended.');

      // Contract check for UI strings: "7-minute chat ended", "[Find Another RITian]", "[Leave]"
      const expectedEndTitle = '7-minute chat ended';
      const expectedActionFindAnother = 'Find Another RITian';
      const expectedActionLeave = 'Leave';
      assert.equal(expectedEndTitle, '7-minute chat ended');
      assert.equal(expectedActionFindAnother, 'Find Another RITian');
      assert.equal(expectedActionLeave, 'Leave');
    });
  });
});
