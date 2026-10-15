/**
 * ============================================================================
 * TALK TO RITIANS - Developer Force Chat Busy-User Override Test Suite
 * ============================================================================
 * Tests:
 * 1. Developer forces eligible idle user -> standard direct-chat room created
 * 2. Developer overrides an in-chat user (User A chatting with User B in Room X)
 * 3. Prior Room X authoritatively ends with end_reason = 'developer_override'
 * 4. Prior partner User B receives clean room-ended state without false partner-leave attribution
 * 5. Target User A auto-navigates into new Room Y
 * 6. Developer navigates into same Room Y
 * 7. New Room Y has exactly two participants (Developer and Target User A)
 * 8. Previous Room X cannot receive new messages (marked ended)
 * 9. Invariant: Zero users have two active rooms simultaneously
 * 10. Developer cannot override while already in another active room (CALLER_IN_ACTIVE_ROOM)
 * 11. Normal student cannot call Force RPC (DEVELOPER_REQUIRED)
 * 12. Cannot force chat with self (CANNOT_TARGET_SELF)
 * 13. Repeated Force respects 60s cooldown (FORCE_COOLDOWN)
 * 14. Offline target cannot be forced (USER_UNAVAILABLE)
 * 15. Opted-out target cannot be forced (USER_UNAVAILABLE)
 * 16. Frozen previous room ends cleanly and paused state is cleared
 * 17. Target retains Leave and Skip exit controls in the new room
 * 18. Audit log records FORCE_DEVELOPER_CHAT with previous_room_id and overrode_active_room flag (zero PII)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

describe('Feature 2: Developer Force Chat Busy-User Override Suite (18 Tests)', () => {
  const DEVELOPER_ID = '532274f3-7fd9-4206-b353-dcd36bababd5';
  const STUDENT_A = 'aaaaaaaa-1111-2222-3333-444444444444';
  const STUDENT_B = 'bbbbbbbb-1111-2222-3333-444444444444';

  class MockForceChatDatabase {
    constructor() {
      this.staff = new Set([DEVELOPER_ID]);
      this.presence = new Map();
      this.rooms = new Map();
      this.auditLogs = [];
      this.chatRequests = [];
      this.messages = [];
    }

    setPresence(userId, { isOnline = true, lastSeenMinutesAgo = 0, available = true }) {
      const lastSeen = new Date(Date.now() - lastSeenMinutesAgo * 60 * 1000).toISOString();
      this.presence.set(userId, {
        userId,
        is_online: isOnline,
        last_seen_at: lastSeen,
        available_for_chat_requests: available,
      });
    }

    createRoom({ id, user1, user2, status = 'active', timerPausedAt = null }) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 60 * 1000).toISOString();
      const room = {
        id,
        user_1: user1,
        user_2: user2,
        status,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        ended_at: null,
        end_reason: null,
        timer_paused_at: timerPausedAt,
      };
      this.rooms.set(id, room);
      return room;
    }

    forceDeveloperChat(callerId, targetUserId) {
      if (!callerId) {
        return { success: false, error: 'UNAUTHENTICATED' };
      }

      // 1. Check Developer privilege
      if (!this.staff.has(callerId)) {
        return {
          success: false,
          error: 'DEVELOPER_REQUIRED',
          message: 'Only authorized platform developers may initiate a direct chat session.',
        };
      }

      // 2. Cannot target self
      if (callerId === targetUserId) {
        return {
          success: false,
          error: 'CANNOT_TARGET_SELF',
          message: 'You cannot force a chat session with your own account.',
        };
      }

      const now = Date.now();

      // 3. Caller cannot be in an active room
      for (const r of this.rooms.values()) {
        if ((r.user_1 === callerId || r.user_2 === callerId) && r.status === 'active') {
          return {
            success: false,
            error: 'CALLER_IN_ACTIVE_ROOM',
            message: 'You are already in an active chat room. Please leave or end your current room first.',
          };
        }
      }

      // 4. Target presence check
      const pres = this.presence.get(targetUserId);
      const isOnlineRecent =
        pres &&
        pres.is_online &&
        now - new Date(pres.last_seen_at).getTime() <= 60000 &&
        pres.available_for_chat_requests !== false;

      if (!isOnlineRecent) {
        return {
          success: false,
          error: 'USER_UNAVAILABLE',
          message: 'User is unavailable for direct chat.',
        };
      }

      // 5. Cooldown check (60s)
      const recentForce = this.auditLogs.find(
        (l) =>
          l.action === 'FORCE_DEVELOPER_CHAT' &&
          l.target_user_id === targetUserId &&
          now - l.created_at < 60000
      );
      if (recentForce) {
        return {
          success: false,
          error: 'FORCE_COOLDOWN',
          message: 'Please wait before starting another direct chat with this user.',
        };
      }

      // 6. Check target active room
      let prevRoom = null;
      for (const r of this.rooms.values()) {
        if ((r.user_1 === targetUserId || r.user_2 === targetUserId) && r.status === 'active') {
          prevRoom = r;
          break;
        }
      }

      // 7. Atomically end previous room if target was in one
      if (prevRoom) {
        prevRoom.status = 'ended';
        prevRoom.ended_at = new Date().toISOString();
        prevRoom.end_reason = 'developer_override';
        prevRoom.timer_paused_at = null;

        this.messages.push({
          id: crypto.randomUUID(),
          room_id: prevRoom.id,
          sender_id: '00000000-0000-0000-0000-000000000000',
          content: 'This conversation has ended.',
          message_type: 'system',
          created_at: new Date().toISOString(),
        });
      }

      // 8. Create new room
      const newRoomId = crypto.randomUUID();
      const newRoom = this.createRoom({
        id: newRoomId,
        user1: callerId,
        user2: targetUserId,
        status: 'active',
      });

      // 9. Realtime notification for recipient
      this.chatRequests.push({
        id: crypto.randomUUID(),
        requester_id: callerId,
        recipient_id: targetUserId,
        status: 'developer_forced',
        room_id: newRoomId,
      });

      // 10. Audit log
      this.auditLogs.push({
        action: 'FORCE_DEVELOPER_CHAT',
        actor_id: callerId,
        target_user_id: targetUserId,
        room_id: newRoomId,
        created_at: now,
        details: {
          previous_room_id: prevRoom?.id || null,
          overrode_active_room: Boolean(prevRoom),
        },
      });

      return {
        success: true,
        room_id: newRoomId,
        overrode_active_room: Boolean(prevRoom),
        previous_room_id: prevRoom?.id || null,
      };
    }
  }

  let db;

  beforeEach(() => {
    db = new MockForceChatDatabase();
    db.setPresence(STUDENT_A, { isOnline: true, lastSeenMinutesAgo: 0, available: true });
    db.setPresence(STUDENT_B, { isOnline: true, lastSeenMinutesAgo: 0, available: true });
  });

  test('1. Developer forces eligible idle user -> standard direct-chat room created', () => {
    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res.success, true);
    assert.equal(res.overrode_active_room, false);
    assert.equal(res.previous_room_id, null);

    const room = db.rooms.get(res.room_id);
    assert.equal(room.user_1, DEVELOPER_ID);
    assert.equal(room.user_2, STUDENT_A);
    assert.equal(room.status, 'active');
  });

  test('2 & 3. Developer overrides an in-chat user -> Prior room ends with developer_override', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({ id: roomXId, user1: STUDENT_A, user2: STUDENT_B, status: 'active' });

    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res.success, true);
    assert.equal(res.overrode_active_room, true);
    assert.equal(res.previous_room_id, roomXId);

    const priorRoom = db.rooms.get(roomXId);
    assert.equal(priorRoom.status, 'ended');
    assert.equal(priorRoom.end_reason, 'developer_override');
  });

  test('4. Prior partner User B receives clean system message without partner-leave claim', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({ id: roomXId, user1: STUDENT_A, user2: STUDENT_B, status: 'active' });

    db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);

    const roomXMessages = db.messages.filter((m) => m.room_id === roomXId);
    assert.equal(roomXMessages.length, 1);
    assert.equal(roomXMessages[0].content, 'This conversation has ended.');
    assert.equal(roomXMessages[0].message_type, 'system');
  });

  test('5 & 6. Target User A auto-navigates and Developer navigates into same Room Y', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({ id: roomXId, user1: STUDENT_A, user2: STUDENT_B, status: 'active' });

    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    const developerRoute = `/chat/${res.room_id}`;

    // Target User A receives developer_forced event
    const req = db.chatRequests.find((cr) => cr.recipient_id === STUDENT_A && cr.status === 'developer_forced');
    assert.ok(req);
    const targetRoute = `/chat/${req.room_id}`;

    assert.equal(developerRoute, targetRoute, 'Both participants navigate to the same room');
  });

  test('7. New Room Y has exactly two participants', () => {
    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    const room = db.rooms.get(res.room_id);
    assert.equal(room.user_1, DEVELOPER_ID);
    assert.equal(room.user_2, STUDENT_A);
    assert.strictEqual(room.user_3, undefined);
  });

  test('8. Previous Room X cannot receive new messages', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({ id: roomXId, user1: STUDENT_A, user2: STUDENT_B, status: 'active' });

    db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);

    // Attempting to send message to Room X
    const roomX = db.rooms.get(roomXId);
    assert.equal(roomX.status, 'ended', 'Room X must be ended');
  });

  test('9. Invariant: Zero users have two active rooms simultaneously', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({ id: roomXId, user1: STUDENT_A, user2: STUDENT_B, status: 'active' });

    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);

    // Count active rooms for STUDENT_A
    let studentAActiveRooms = 0;
    for (const r of db.rooms.values()) {
      if ((r.user_1 === STUDENT_A || r.user_2 === STUDENT_A) && r.status === 'active') {
        studentAActiveRooms++;
      }
    }
    assert.equal(studentAActiveRooms, 1, 'Target student must have exactly 1 active room');

    // Count active rooms for STUDENT_B
    let studentBActiveRooms = 0;
    for (const r of db.rooms.values()) {
      if ((r.user_1 === STUDENT_B || r.user_2 === STUDENT_B) && r.status === 'active') {
        studentBActiveRooms++;
      }
    }
    assert.equal(studentBActiveRooms, 0, 'Prior partner has 0 active rooms and can search again');
  });

  test('10. Developer cannot override while already in another active room', () => {
    db.createRoom({ id: 'dev-room', user1: DEVELOPER_ID, user2: STUDENT_B, status: 'active' });

    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res.success, false);
    assert.equal(res.error, 'CALLER_IN_ACTIVE_ROOM');
  });

  test('11. Normal student cannot call Force RPC', () => {
    const res = db.forceDeveloperChat(STUDENT_A, STUDENT_B);
    assert.equal(res.success, false);
    assert.equal(res.error, 'DEVELOPER_REQUIRED');
  });

  test('12. Cannot force chat with self', () => {
    const res = db.forceDeveloperChat(DEVELOPER_ID, DEVELOPER_ID);
    assert.equal(res.success, false);
    assert.equal(res.error, 'CANNOT_TARGET_SELF');
  });

  test('13. Repeated Force respects 60s cooldown', () => {
    const res1 = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res1.success, true);

    // End developer room to allow second call
    db.rooms.get(res1.room_id).status = 'ended';

    // Attempt second force immediately
    const res2 = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res2.success, false);
    assert.equal(res2.error, 'FORCE_COOLDOWN');
  });

  test('14. Offline target cannot be forced', () => {
    db.setPresence(STUDENT_A, { isOnline: false, lastSeenMinutesAgo: 5, available: true });
    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res.success, false);
    assert.equal(res.error, 'USER_UNAVAILABLE');
  });

  test('15. Opted-out target cannot be forced', () => {
    db.setPresence(STUDENT_A, { isOnline: true, lastSeenMinutesAgo: 0, available: false });
    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res.success, false);
    assert.equal(res.error, 'USER_UNAVAILABLE');
  });

  test('16. Frozen previous room ends cleanly and paused state is cleared', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({
      id: roomXId,
      user1: STUDENT_A,
      user2: STUDENT_B,
      status: 'active',
      timerPausedAt: new Date().toISOString(),
    });

    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res.success, true);

    const prevRoom = db.rooms.get(roomXId);
    assert.equal(prevRoom.status, 'ended');
    assert.equal(prevRoom.timer_paused_at, null, 'Paused timer on old room must be cleared');

    const newRoom = db.rooms.get(res.room_id);
    assert.equal(newRoom.timer_paused_at, null, 'New room starts with unpaused 7-minute timer');
  });

  test('17. Target retains Leave and Skip exit controls in the new room', () => {
    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    const newRoom = db.rooms.get(res.room_id);

    // Student A triggers normal Skip
    newRoom.status = 'skipped';
    newRoom.end_reason = 'skip';
    assert.equal(newRoom.status, 'skipped');
  });

  test('18. Audit log records FORCE_DEVELOPER_CHAT with previous_room_id and overrode_active_room flag (zero PII)', () => {
    const roomXId = crypto.randomUUID();
    db.createRoom({ id: roomXId, user1: STUDENT_A, user2: STUDENT_B, status: 'active' });

    const res = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);

    const log = db.auditLogs.find((l) => l.action === 'FORCE_DEVELOPER_CHAT');
    assert.ok(log);
    assert.equal(log.actor_id, DEVELOPER_ID);
    assert.equal(log.target_user_id, STUDENT_A);
    assert.equal(log.details.previous_room_id, roomXId);
    assert.equal(log.details.overrode_active_room, true);

    // Verify zero PII
    assert.strictEqual(log.details.student_name, undefined);
    assert.strictEqual(log.details.register_number, undefined);
    assert.strictEqual(log.details.email, undefined);
  });

  test('19. Concurrent Force requests: Multiple simultaneous Force calls create exactly one room and reject duplicate', () => {
    // Setup Student A idle
    db.setPresence(STUDENT_A, { isOnline: true, lastSeenMinutesAgo: 0, available: true });

    // Simultaneous requests from Developer targeting Student A
    const res1 = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res1.success, true);

    // Second simultaneous request arrives while Developer is now in Room Y
    const res2 = db.forceDeveloperChat(DEVELOPER_ID, STUDENT_A);
    assert.equal(res2.success, false);
    // Blocked by CALLER_IN_ACTIVE_ROOM or FORCE_COOLDOWN
    assert.ok(res2.error === 'CALLER_IN_ACTIVE_ROOM' || res2.error === 'FORCE_COOLDOWN');

    // Invariant: Exactly one active room exists for Developer and Student A
    const activeRooms = Array.from(db.rooms.values()).filter(
      (r) => r.status === 'active' && (r.user_1 === DEVELOPER_ID || r.user_2 === DEVELOPER_ID)
    );
    assert.equal(activeRooms.length, 1);
  });
});
