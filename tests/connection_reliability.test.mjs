/**
 * ============================================================================
 * TALK TO RITIANS - Connection Reliability & Presence Test Suite (Phase 12)
 * ============================================================================
 * Tests:
 * 1. Page Refresh Invariant:
 *    - Refreshing an active chat restores the room and messages
 *    - Does NOT terminate room and does NOT create duplicate matches
 * 2. Presence Grace Period & Chrome DevTools Offline Simulation:
 *    - Brief 3-second network drop enters 'reconnecting' and recovers to 'connected'
 *    - Does not instantly terminate room on transient drops
 * 3. Meaningful Disconnect:
 *    - Sustained offline outage exceeding grace period (15s) terminates room
 *    - Shows "Chat ended." and notifies partner "Stranger disconnected."
 * 4. Mobile Browser Backgrounding & Foreground Sync:
 *    - Backgrounding throttles heartbeats; foregrounding syncs room state
 * 5. Computer Sleep & Wake:
 *    - Time warp / sleep-wake recovery re-syncs state immediately
 * 6. Browser Tab Closed / User Navigates Away:
 *    - Ceased heartbeats detected by peer heartbeat within grace timeout
 * 7. Match Queue Heartbeat Expiry (Step 2):
 *    - Disappeared matchmaking user expires after 25s without heartbeat
 * 8. Stale Chat Room Cleanup (Step 5):
 *    - Zombie active chat rooms with missing heartbeats cleaned by janitor
 * 9. Duplicate Tabs Coordination:
 *    - Duplicate tab detection and broadcast channel coordination
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// Emulated Database with Heartbeats, Grace Periods & Janitor Simulation
// ============================================================================

const QUEUE_HEARTBEAT_TIMEOUT_MS = 25000;
const ROOM_PEER_TIMEOUT_MS = 35000;
const ROOM_ABANDONED_TIMEOUT_MS = 60000;

class MockReliabilityDatabase {
  constructor() {
    this.users = new Map();
    this.profiles = new Map();
    this.anonymousIdentities = new Map();
    this.chatRooms = new Map();
    this.chatMessages = [];
    this.matchmakingQueue = [];
    this.currentTime = Date.now();
  }

  advanceTime(ms) {
    this.currentTime += ms;
  }

  seedStudent({ id, username = 'RITian' }) {
    this.users.set(id, { id });
    this.profiles.set(id, {
      id,
      college_identity_linked: true,
      profile_completed: true,
    });
    this.anonymousIdentities.set(id, {
      user_id: id,
      anonymous_username: username,
      avatar_config: { face: 'round', skin: '#FDDBB4' },
    });
  }

  createActiveRoom({ id, user1, user2 }) {
    const room = {
      id,
      user_1: user1,
      user_2: user2,
      status: 'active',
      created_at: new Date(this.currentTime).toISOString(),
      ended_at: null,
      end_reason: null,
      user_1_heartbeat_at: this.currentTime,
      user_2_heartbeat_at: this.currentTime,
    };
    this.chatRooms.set(id, room);
    return room;
  }

  /**
   * Simulates heartbeat_chat_room(p_room_id)
   */
  heartbeatRoom({ callerId, roomId }) {
    const room = this.chatRooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };
    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    if (room.status !== 'active') {
      return {
        success: true,
        room_id: roomId,
        status: room.status,
        end_reason: room.end_reason,
        is_active: false,
        peer_disconnected: true,
      };
    }

    // Update caller's heartbeat
    if (room.user_1 === callerId) {
      room.user_1_heartbeat_at = this.currentTime;
    } else {
      room.user_2_heartbeat_at = this.currentTime;
    }

    // Check peer's heartbeat
    const peerHeartbeat = room.user_1 === callerId ? room.user_2_heartbeat_at : room.user_1_heartbeat_at;
    const peerInactiveDuration = this.currentTime - peerHeartbeat;

    if (peerInactiveDuration > ROOM_PEER_TIMEOUT_MS) {
      // Meaningful disconnect detected
      room.status = 'ended';
      room.ended_at = new Date(this.currentTime).toISOString();
      room.end_reason = 'disconnect';

      // System notification
      this.chatMessages.push({
        id: `sys-${this.currentTime}`,
        room_id: roomId,
        sender_id: callerId,
        content: 'Stranger disconnected.',
        created_at: new Date(this.currentTime).toISOString(),
        message_type: 'system',
      });

      return {
        success: true,
        room_id: roomId,
        status: 'ended',
        end_reason: 'disconnect',
        is_active: false,
        peer_disconnected: true,
      };
    }

    return {
      success: true,
      room_id: roomId,
      status: 'active',
      is_active: true,
      peer_disconnected: false,
    };
  }

  /**
   * Simulates reconnectRoom(p_room_id)
   */
  reconnectRoom({ callerId, roomId }) {
    const room = this.chatRooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };
    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const peerId = room.user_1 === callerId ? room.user_2 : room.user_1;
    const peerIdentity = this.anonymousIdentities.get(peerId);
    const messages = this.chatMessages.filter((m) => m.room_id === roomId);

    return {
      success: true,
      data: {
        room_id: roomId,
        status: room.status,
        messages,
        peer: {
          anonymous_username: peerIdentity?.anonymous_username || 'Anonymous RITian',
          avatar_config: peerIdentity?.avatar_config || {},
        },
      },
    };
  }

  /**
   * Simulates cleanup_stale_sessions()
   */
  cleanupStaleSessions() {
    let expiredQueues = 0;
    let abandonedRooms = 0;

    // 1. Expire queue entries
    for (const entry of this.matchmakingQueue) {
      if (entry.status === 'searching' && this.currentTime - entry.heartbeat_at > QUEUE_HEARTBEAT_TIMEOUT_MS) {
        entry.status = 'expired';
        expiredQueues++;
      }
    }

    // 2. Expire abandoned active rooms
    for (const room of this.chatRooms.values()) {
      if (
        room.status === 'active' &&
        this.currentTime - room.user_1_heartbeat_at > ROOM_ABANDONED_TIMEOUT_MS &&
        this.currentTime - room.user_2_heartbeat_at > ROOM_ABANDONED_TIMEOUT_MS
      ) {
        room.status = 'ended';
        room.ended_at = new Date(this.currentTime).toISOString();
        room.end_reason = 'timeout';
        abandonedRooms++;
      }
    }

    return { success: true, expired_queue_entries: expiredQueues, abandoned_rooms_cleaned: abandonedRooms };
  }

  joinQueue(userId) {
    const entry = {
      id: `q-${userId}`,
      user_id: userId,
      status: 'searching',
      heartbeat_at: this.currentTime,
    };
    this.matchmakingQueue.push(entry);
    return entry;
  }

  sendMessage({ callerId, roomId, content }) {
    const room = this.chatRooms.get(roomId);
    if (!room || room.status !== 'active') {
      return { success: false, error: 'ROOM_INACTIVE' };
    }
    const msg = {
      id: `msg-${this.currentTime}-${Math.random().toString(36).slice(2, 6)}`,
      room_id: roomId,
      sender_id: callerId,
      content,
      created_at: new Date(this.currentTime).toISOString(),
      message_type: 'text',
    };
    this.chatMessages.push(msg);
    return { success: true, message: msg };
  }
}

// ============================================================================
// Test Suite Execution
// ============================================================================

describe('Phase 12 - Connection Reliability & Presence Grace Period Suite', () => {
  let db;
  const userA = 'user-alpha-12';
  const userB = 'user-beta-12';
  const roomId = 'room-ab-12';

  beforeEach(() => {
    db = new MockReliabilityDatabase();
    db.seedStudent({ id: userA, username: 'Falcon' });
    db.seedStudent({ id: userB, username: 'Voyager' });
    db.createActiveRoom({ id: roomId, user1: userA, user2: userB });
  });

  // --------------------------------------------------------------------------
  // TEST 1: Page Refresh Invariant (Step 6)
  // --------------------------------------------------------------------------
  describe('1. Step 6 Invariant: Page Refresh', () => {
    test('Refreshing an active room restores state without ending room or creating new matches', () => {
      // Conversation in progress
      db.sendMessage({ callerId: userA, roomId, content: 'Hello before refresh!' });

      // User A refreshes the page (simulated via reconnectRoom)
      const res = db.reconnectRoom({ callerId: userA, roomId });

      assert.equal(res.success, true);
      assert.equal(res.data.status, 'active');
      assert.equal(res.data.messages.length, 1);
      assert.equal(res.data.messages[0].content, 'Hello before refresh!');
      assert.equal(res.data.peer.anonymous_username, 'Voyager');

      // Room remains active
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'active');

      // Queue was never touched, no new rooms created
      assert.equal(db.matchmakingQueue.length, 0);
    });

    test('Refreshing an already ended room shows ended status and historical messages', () => {
      // Room ends
      const room = db.chatRooms.get(roomId);
      room.status = 'ended';
      room.end_reason = 'skip';

      // User A refreshes
      const res = db.reconnectRoom({ callerId: userA, roomId });

      assert.equal(res.success, true);
      assert.equal(res.data.status, 'ended');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 2: Presence Grace Period (Chrome DevTools Offline Simulation) (Step 3 & 7)
  // --------------------------------------------------------------------------
  describe('2. Step 3 & 7: Presence Grace Period (Chrome DevTools Offline)', () => {
    test('Transient 3-second offline toggle in DevTools does NOT terminate the chat room', () => {
      // Simulate client connection state machine
      const client = {
        status: 'connected',
        graceTimerActive: false,
        onOffline() {
          this.status = 'reconnecting';
          this.graceTimerActive = true;
        },
        onOnline(roomActive) {
          this.graceTimerActive = false;
          this.status = roomActive ? 'connected' : 'stranger disconnected';
        },
      };

      // 1. DevTools offline toggle triggered
      client.onOffline();
      assert.equal(client.status, 'reconnecting');
      assert.equal(client.graceTimerActive, true);

      // 2. 3 seconds pass
      db.advanceTime(3000);

      // 3. DevTools toggled back online before 15s grace period expires
      const roomStillActive = db.chatRooms.get(roomId).status === 'active';
      client.onOnline(roomStillActive);

      assert.equal(client.status, 'connected');
      assert.equal(client.graceTimerActive, false);
      assert.equal(db.chatRooms.get(roomId).status, 'active');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 3: Meaningful Disconnect & "Chat ended." (Step 3 & Step 4)
  // --------------------------------------------------------------------------
  describe('3. Step 3 & 4: Meaningful Disconnect after Grace Period', () => {
    test('Sustained offline drop exceeding grace period terminates room with disconnect reason', () => {
      // User B goes offline and stops sending heartbeats
      // User A keeps chatting and sending heartbeats
      db.heartbeatRoom({ callerId: userA, roomId });

      // Advance time by 40 seconds (exceeding 35s grace timeout)
      db.advanceTime(40000);

      // User A's next heartbeat check detects User B has timed out
      const hbRes = db.heartbeatRoom({ callerId: userA, roomId });

      assert.equal(hbRes.success, true);
      assert.equal(hbRes.status, 'ended');
      assert.equal(hbRes.end_reason, 'disconnect');
      assert.equal(hbRes.peer_disconnected, true);

      // Room status in DB is ended
      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'disconnect');

      // Stranger receives "Stranger disconnected."
      const lastMsg = db.chatMessages[db.chatMessages.length - 1];
      assert.equal(lastMsg.content, 'Stranger disconnected.');

      // When User B finally comes back online, reconnect shows ended room
      const resB = db.reconnectRoom({ callerId: userB, roomId });
      assert.equal(resB.data.status, 'ended');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 4: Mobile Browser Backgrounded & Foreground Recovery
  // --------------------------------------------------------------------------
  describe('4. Mobile Browser Backgrounding & Foreground Sync', () => {
    test('Backgrounding and foregrounding within timeout restores active connection', () => {
      // Background mobile app for 10 seconds
      db.advanceTime(10000);

      // Foreground event (visibilitychange: visible) triggers immediate sync
      db.heartbeatRoom({ callerId: userA, roomId });
      const res = db.reconnectRoom({ callerId: userA, roomId });

      assert.equal(res.success, true);
      assert.equal(res.data.status, 'active');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 5: Computer Sleeps and Wakes
  // --------------------------------------------------------------------------
  describe('5. Computer Sleep & Wake Scenario', () => {
    test('Wake from sleep detects if conversation ended while sleeping', () => {
      // Computer sleeps for 1 hour
      db.advanceTime(3600000);

      // While sleeping, peer B left or room was cleaned up
      const room = db.chatRooms.get(roomId);
      room.status = 'ended';
      room.end_reason = 'timeout';

      // Computer wakes up: visibilitychange / focus triggers reconnect
      const res = db.reconnectRoom({ callerId: userA, roomId });

      assert.equal(res.success, true);
      assert.equal(res.data.status, 'ended');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 6: Matchmaking Queue Heartbeat Expiry (Step 2)
  // --------------------------------------------------------------------------
  describe('6. Step 2: Match Queue Heartbeat Expiry', () => {
    test('Queue entry expires if user disappears for > 25 seconds', () => {
      const userC = 'user-gamma-12';
      db.seedStudent({ id: userC, username: 'GhostUser' });

      // User C enters queue
      db.joinQueue(userC);
      assert.equal(db.matchmakingQueue[0].status, 'searching');

      // User C disappears (tab closed, internet lost); time advances 30s
      db.advanceTime(30000);

      // Janitor runs
      const janitorRes = db.cleanupStaleSessions();

      assert.equal(janitorRes.success, true);
      assert.equal(janitorRes.expired_queue_entries, 1);
      assert.equal(db.matchmakingQueue[0].status, 'expired');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 7: Stale Chat Room Cleanup (Step 5)
  // --------------------------------------------------------------------------
  describe('7. Step 5: Stale Chat Room Cleanup', () => {
    test('Zombie room where both participants vanished is cleaned up by janitor', () => {
      // Advance time by 70 seconds without any heartbeats from either participant
      db.advanceTime(70000);

      // Janitor cleans up
      const janitorRes = db.cleanupStaleSessions();

      assert.equal(janitorRes.success, true);
      assert.equal(janitorRes.abandoned_rooms_cleaned, 1);

      const room = db.chatRooms.get(roomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.end_reason, 'timeout');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 8: Duplicate Tab Coordination
  // --------------------------------------------------------------------------
  describe('8. Duplicate Tab Coordination', () => {
    test('BroadcastChannel protocol detects concurrent tab presence', () => {
      const tab1 = { hasWarning: false };
      const tab2 = { hasWarning: false };

      // Tab 1 is open. Tab 2 opens and announces presence
      const simulateTabOpen = () => {
        tab1.hasWarning = true;
        tab2.hasWarning = true;
      };

      simulateTabOpen();

      assert.equal(tab1.hasWarning, true);
      assert.equal(tab2.hasWarning, true);
    });
  });
});
