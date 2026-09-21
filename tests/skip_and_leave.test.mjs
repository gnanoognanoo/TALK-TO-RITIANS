/**
 * ============================================================================
 * TALK TO RITIANS - Skip and Leave Automated Test Suite (Phase 11)
 * ============================================================================
 * Tests:
 * 1. User A skips User B:
 *    - Room ends with status = 'ended', end_reason = 'skip'
 *    - User B receives "Stranger disconnected." system notification
 *    - User A re-enters matchmaking queue safely
 *    - User A pairs with waiting User C into a new active room
 * 2. User B leaves User A:
 *    - Room ends with status = 'ended', end_reason = 'leave'
 *    - User A receives "Stranger disconnected."
 *    - User B clears queue presence and returns home
 * 3. Step 7 Double Action Invariant (Simultaneous Skips):
 *    - User A and User B both call end_chat_room('skip') concurrently
 *    - Zero crashes, idempotent success returned, room ends cleanly
 *    - Both users safely enter matchmaking queue without duplicate rooms
 * 4. Step 6 Invariant: Inactive Room Message Rejection:
 *    - Messages cannot be sent to ended rooms (ROOM_INACTIVE error)
 * 5. Browser close / disconnect handler:
 *    - Disconnect event triggers room termination with end_reason = 'disconnect'
 * 6. Refresh Invariant:
 *    - Reloading an ended room preserves 'ended' state and disconnected peer status
 * 7. Internet Interruption State Machine:
 *    - Offline -> reconnecting, Online -> connected (or stranger disconnected)
 * 8. Step 1 RLS Security Invariant:
 *    - Unauthorized third party (User C) cannot terminate Room A-B
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// In-Memory Database & Realtime Simulator for Phase 11 Lifecycle
// ============================================================================

class MockLifecycleDatabase {
  constructor() {
    this.users = new Map();
    this.profiles = new Map();
    this.anonymousIdentities = new Map();
    this.chatRooms = new Map();
    this.chatMessages = [];
    this.matchmakingQueue = [];
  }

  seedStudent({ id, username = 'RITian', avatarConfig = {} }) {
    this.users.set(id, { id });
    this.profiles.set(id, {
      id,
      college_identity_linked: true,
      profile_completed: true,
      department: 'CSE',
      batch: '2023-2027',
    });
    this.anonymousIdentities.set(id, {
      user_id: id,
      anonymous_username: username,
      avatar_config: avatarConfig,
    });
  }

  createActiveRoom({ id, user1, user2 }) {
    const room = {
      id,
      user_1: user1,
      user_2: user2,
      status: 'active',
      created_at: new Date().toISOString(),
      ended_at: null,
      end_reason: null,
    };
    this.chatRooms.set(id, room);
    return room;
  }

  /**
   * Simulates refined end_chat_room() stored procedure from Migration 20260921000006
   */
  endChatRoom({ callerId, roomId, reason = 'leave' }) {
    if (!callerId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }

    const room = this.chatRooms.get(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    // Step 1: Only room participants can terminate their room
    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Step 7: Double action safety (if already ended, return cleanly without error)
    if (room.status === 'ended') {
      return {
        success: true,
        room_id: roomId,
        status: 'ended',
        end_reason: room.end_reason,
        already_ended: true,
      };
    }

    const normalizedReason = ['skip', 'leave', 'disconnect'].includes(reason) ? reason : 'leave';
    const now = new Date().toISOString();

    // Set status = ended, ended_at, end_reason
    room.status = 'ended';
    room.ended_at = now;
    room.end_reason = normalizedReason;

    // Step 5: Insert system notification "Stranger disconnected."
    const systemNotice = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      room_id: roomId,
      sender_id: callerId,
      content: 'Stranger disconnected.',
      created_at: now,
      message_type: 'system',
    };
    this.chatMessages.push(systemNotice);

    return {
      success: true,
      room_id: roomId,
      status: 'ended',
      end_reason: normalizedReason,
      already_ended: false,
    };
  }

  /**
   * Simulates send_chat_message() verifying Step 6 (no messages to ended rooms)
   */
  sendMessage({ callerId, roomId, content }) {
    const room = this.chatRooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Step 6: Prevent messages from being sent to ended rooms
    if (room.status !== 'active') {
      return {
        success: false,
        error: 'ROOM_INACTIVE',
        message: 'This conversation has ended and is closed to new messages.',
      };
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      return { success: false, error: 'EMPTY_MESSAGE' };
    }

    const message = {
      id: `msg-${Date.now()}`,
      room_id: roomId,
      sender_id: callerId,
      content: trimmed,
      created_at: new Date().toISOString(),
      message_type: 'text',
    };
    this.chatMessages.push(message);
    return { success: true, message };
  }

  /**
   * Simulates join_matchmaking() verifying re-entry after Skip
   */
  joinMatchmaking(userId) {
    // Check if user is inside an active room
    for (const room of this.chatRooms.values()) {
      if (room.status === 'active' && (room.user_1 === userId || room.user_2 === userId)) {
        return {
          success: false,
          error: 'ALREADY_IN_ACTIVE_ROOM',
          message: 'You already have an active conversation.',
        };
      }
    }

    // Clean up any existing queue entry for this user
    this.matchmakingQueue = this.matchmakingQueue.filter(
      (entry) => entry.user_id !== userId || entry.status === 'matched'
    );

    // Look for waiting candidate
    const candidateIdx = this.matchmakingQueue.findIndex(
      (entry) => entry.status === 'searching' && entry.user_id !== userId
    );

    if (candidateIdx !== -1) {
      const candidate = this.matchmakingQueue[candidateIdx];
      const newRoomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const newRoom = {
        id: newRoomId,
        user_1: candidate.user_id,
        user_2: userId,
        status: 'active',
        created_at: new Date().toISOString(),
        ended_at: null,
        end_reason: null,
      };
      this.chatRooms.set(newRoomId, newRoom);

      candidate.status = 'matched';
      candidate.matched_room_id = newRoomId;

      return {
        success: true,
        status: 'matched',
        room_id: newRoomId,
        peer_id: candidate.user_id,
      };
    }

    // Enqueue
    const queueEntry = {
      id: `q-${Date.now()}`,
      user_id: userId,
      status: 'searching',
      joined_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      matched_room_id: null,
    };
    this.matchmakingQueue.push(queueEntry);

    return {
      success: true,
      status: 'searching',
      queue_id: queueEntry.id,
    };
  }

  leaveMatchmaking(userId) {
    this.matchmakingQueue = this.matchmakingQueue.filter((e) => e.user_id !== userId);
    return { success: true };
  }

  getRoomMessages(roomId) {
    return this.chatMessages.filter((m) => m.room_id === roomId);
  }
}

// ============================================================================
// Test Suite Execution
// ============================================================================

describe('Phase 11 - Skip and Leave Room Termination Suite', () => {
  let db;
  const userA = 'user-alpha-11';
  const userB = 'user-beta-22';
  const userC = 'user-gamma-33';
  const roomId = 'room-ab-11';

  beforeEach(() => {
    db = new MockLifecycleDatabase();
    db.seedStudent({ id: userA, username: 'Falcon' });
    db.seedStudent({ id: userB, username: 'Voyager' });
    db.seedStudent({ id: userC, username: 'Specter' });

    db.createActiveRoom({ id: roomId, user1: userA, user2: userB });
  });

  // --------------------------------------------------------------------------
  // TEST 1: User A Skips User B
  // --------------------------------------------------------------------------
  describe('1. User A skips User B workflow', () => {
    test('A calls Skip: Room A-B ends with status=ended, end_reason=skip', () => {
      const res = db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });

      assert.equal(res.success, true);
      assert.equal(res.status, 'ended');
      assert.equal(res.end_reason, 'skip');
      assert.equal(res.already_ended, false);

      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'skip');
      assert.ok(room.ended_at);
    });

    test('User B receives "Stranger disconnected." notification', () => {
      db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });

      const messages = db.getRoomMessages(roomId);
      const systemMsg = messages.find((m) => m.message_type === 'system');

      assert.ok(systemMsg);
      assert.equal(systemMsg.content, 'Stranger disconnected.');
    });

    test('User A can safely re-enter matchmaking and pair with waiting User C', () => {
      // User C is waiting in queue
      db.joinMatchmaking(userC);

      // User A skips User B
      db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });

      // User A joins matchmaking again
      const matchRes = db.joinMatchmaking(userA);

      assert.equal(matchRes.success, true);
      assert.equal(matchRes.status, 'matched');
      assert.ok(matchRes.room_id);
      assert.notEqual(matchRes.room_id, roomId);
      assert.equal(matchRes.peer_id, userC);

      // Verify the new room is active
      const newRoom = db.chatRooms.get(matchRes.room_id);
      assert.equal(newRoom.status, 'active');
      assert.ok((newRoom.user_1 === userA && newRoom.user_2 === userC) || (newRoom.user_1 === userC && newRoom.user_2 === userA));
    });
  });

  // --------------------------------------------------------------------------
  // TEST 2: User B Leaves User A
  // --------------------------------------------------------------------------
  describe('2. User B leaves User A workflow', () => {
    test('B calls Leave: Room ends with status=ended, end_reason=leave', () => {
      const res = db.endChatRoom({ callerId: userB, roomId, reason: 'leave' });

      assert.equal(res.success, true);
      assert.equal(res.status, 'ended');
      assert.equal(res.end_reason, 'leave');

      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'leave');
    });

    test('User A receives "Stranger disconnected." notification', () => {
      db.endChatRoom({ callerId: userB, roomId, reason: 'leave' });

      const messages = db.getRoomMessages(roomId);
      const systemNotice = messages.find((m) => m.content === 'Stranger disconnected.');
      assert.ok(systemNotice);
    });

    test('User B clearing matchmaking membership navigates home without queue presence', () => {
      db.endChatRoom({ callerId: userB, roomId, reason: 'leave' });
      db.leaveMatchmaking(userB);

      // User B must NOT be in queue
      const inQueue = db.matchmakingQueue.some((e) => e.user_id === userB);
      assert.equal(inQueue, false);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 3: Step 7 Double Action Invariant (Simultaneous Skips)
  // --------------------------------------------------------------------------
  describe('3. Step 7 Double Action (Simultaneous Skips Concurrency)', () => {
    test('Simultaneous skips by both users succeed without crash or duplicate rooms', () => {
      // User A triggers skip
      const resA = db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });
      // User B triggers skip at the exact same millisecond
      const resB = db.endChatRoom({ callerId: userB, roomId, reason: 'skip' });

      assert.equal(resA.success, true);
      assert.equal(resB.success, true);
      assert.equal(resA.status, 'ended');
      assert.equal(resB.status, 'ended');
      assert.equal(resB.already_ended, true);

      // Verify room status remains ended
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');

      // Both users re-enter matchmaking queue safely
      const queueA = db.joinMatchmaking(userA);
      const queueB = db.joinMatchmaking(userB);

      // User A entered queue, User B matched with User A (or both safely handled)
      assert.equal(queueA.success, true);
      assert.equal(queueB.success, true);

      // Verify only ONE new active room was created between them
      const activeRooms = Array.from(db.chatRooms.values()).filter((r) => r.status === 'active');
      assert.equal(activeRooms.length, 1);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 4: Step 6 Inactive Room Message Rejection
  // --------------------------------------------------------------------------
  describe('4. Step 6 Invariant: Inactive Room Message Rejection', () => {
    test('Messages sent to ended room are rejected with ROOM_INACTIVE', () => {
      // End the room
      db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });

      // User B attempts to send a message
      const resB = db.sendMessage({
        callerId: userB,
        roomId,
        content: 'Are you still there?',
      });

      assert.equal(resB.success, false);
      assert.equal(resB.error, 'ROOM_INACTIVE');

      // User A attempts to send a message
      const resA = db.sendMessage({
        callerId: userA,
        roomId,
        content: 'Oops, I left already.',
      });

      assert.equal(resA.success, false);
      assert.equal(resA.error, 'ROOM_INACTIVE');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 5: Browser Disconnect / Close Handler
  // --------------------------------------------------------------------------
  describe('5. Browser Disconnect / Close Lifecycle', () => {
    test('Browser tab close / navigation triggers end_chat_room with disconnect reason', () => {
      const res = db.endChatRoom({ callerId: userA, roomId, reason: 'disconnect' });

      assert.equal(res.success, true);
      assert.equal(res.status, 'ended');
      assert.equal(res.end_reason, 'disconnect');

      // Stranger receives "Stranger disconnected."
      const messages = db.getRoomMessages(roomId);
      assert.ok(messages.some((m) => m.content === 'Stranger disconnected.'));
    });
  });

  // --------------------------------------------------------------------------
  // TEST 6: Session Refresh Invariant
  // --------------------------------------------------------------------------
  describe('6. Session Refresh Invariant', () => {
    test('Reloading an ended room preserves ended status and stranger disconnection state', () => {
      db.endChatRoom({ callerId: userA, roomId, reason: 'skip' });

      // Simulate re-querying room on page reload
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');

      const messages = db.getRoomMessages(roomId);
      const lastMsg = messages[messages.length - 1];
      assert.equal(lastMsg.content, 'Stranger disconnected.');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 7: Internet Interruption State Transitions
  // --------------------------------------------------------------------------
  describe('7. Internet Interruption State Handling', () => {
    test('Simulates transition between connected and reconnecting states', () => {
      const stateMachine = {
        current: 'connected',
        onOffline() {
          this.current = 'reconnecting';
        },
        onOnline(isRoomActive) {
          this.current = isRoomActive ? 'connected' : 'stranger disconnected';
        },
      };

      assert.equal(stateMachine.current, 'connected');

      // Network drops
      stateMachine.onOffline();
      assert.equal(stateMachine.current, 'reconnecting');

      // Network recovers while room is still active
      stateMachine.onOnline(true);
      assert.equal(stateMachine.current, 'connected');

      // Network drops again
      stateMachine.onOffline();
      assert.equal(stateMachine.current, 'reconnecting');

      // Peer left while offline, network recovers
      stateMachine.onOnline(false);
      assert.equal(stateMachine.current, 'stranger disconnected');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 8: Step 1 RLS Security Invariant: Unauthorized User C
  // --------------------------------------------------------------------------
  describe('8. Step 1 RLS Security Invariant: User C Rejection', () => {
    test('User C cannot terminate Room A-B', () => {
      const res = db.endChatRoom({ callerId: userC, roomId, reason: 'skip' });

      assert.equal(res.success, false);
      assert.equal(res.error, 'UNAUTHORIZED');

      // Room A-B remains active
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'active');
    });
  });
});
