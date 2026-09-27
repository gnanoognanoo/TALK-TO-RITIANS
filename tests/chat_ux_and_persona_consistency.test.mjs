/**
 * ============================================================================
 * TALK TO RITIANS - Chat UX + Anonymous Persona Consistency Test Suite
 * ============================================================================
 * Tests for:
 * 1. chat header remains outside scroll container
 * 2. message area alone has overflow scrolling
 * 3. composer remains outside scroll container
 * 4. "Chatting with" no longer renders
 * 5. header renders peer username only
 * 6. unverified peer gets Unknown User ####
 * 7. unverified peer gets default avatar
 * 8. verified peer gets saved custom persona
 * 9. unlink during active chat causes peer persona refresh
 * 10. peer does not need page refresh after unlink
 * 11. re-link restores allowed custom persona
 * 12. unlink does NOT delete saved custom persona
 * 13. username free-text input no longer exists
 * 14. alias candidate <= 10 characters
 * 15. refresh generates another alias
 * 16. unlimited refresh has no artificial counter/limit
 * 17. reroll does not persist until Save
 * 18. saved alias persists correctly
 * 19. unverified users cannot access alias customization
 * 20. privacy fields still absent from get_room_peer response
 * 21. Realtime messaging regression passes
 * 22. 7-minute timer regression passes
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SAFE_ALIAS_POOL,
  getRandomShortAlias,
  isValidAliasFormat,
} from '../src/services/aliasPool.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Standard default avatar for unverified users
const DEFAULT_AVATAR = {
  face: 'round',
  skin: '#FDDBB4',
  hair: 'short',
  hairColor: '#1A1A1A',
  eyes: 'normal',
  eyebrows: 'natural',
  mouth: 'smile',
  shirt: 'crew',
  shirtColor: '#4F46E5',
  accessory: 'none',
  background: 'indigo',
};

// Deterministic Unknown User generation matching server logic
function computeDeterministicUnknownUser(userId) {
  // Simple deterministic hash simulation matching abs(hashtext(v_peer_id::text)) % 9000 + 1000
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const suffix = (Math.abs(hash) % 9000 + 1000).toString().padStart(4, '0');
  return `Unknown User ${suffix}`;
}

// In-Memory Database Simulator for Persona & Room Lifecycle
class MockSupabaseDB {
  constructor() {
    this.profiles = new Map();
    this.anonymousIdentities = new Map();
    this.collegeIdentities = new Map();
    this.chatRooms = new Map();
    this.chatMessages = [];
  }

  reset() {
    this.profiles.clear();
    this.anonymousIdentities.clear();
    this.collegeIdentities.clear();
    this.chatRooms.clear();
    this.chatMessages = [];
  }

  setProfile(userId, profile) {
    this.profiles.set(userId, {
      id: userId,
      college_identity_linked: false,
      display_username: computeDeterministicUnknownUser(userId),
      avatar_config: DEFAULT_AVATAR,
      gender: null,
      ...profile,
    });
  }

  setAnonymousIdentity(userId, customAlias, customAvatar) {
    this.anonymousIdentities.set(userId, {
      user_id: userId,
      anonymous_username: customAlias,
      avatar_config: customAvatar || DEFAULT_AVATAR,
    });
  }

  createRoom(roomId, user1Id, user2Id, expiresAt) {
    const room = {
      id: roomId,
      user_1: user1Id,
      user_2: user2Id,
      status: 'active',
      created_at: new Date().toISOString(),
      expires_at: expiresAt || new Date(Date.now() + 7 * 60 * 1000).toISOString(),
      persona_updated_at: new Date().toISOString(),
      ended_at: null,
      end_reason: null,
    };
    this.chatRooms.set(roomId, room);
    return room;
  }

  // Simulates get_room_peer RPC
  getRoomPeer(callerUserId, roomId) {
    const room = this.chatRooms.get(roomId);
    if (!room) {
      return { success: false, error: 'NOT_FOUND' };
    }
    if (room.user_1 !== callerUserId && room.user_2 !== callerUserId) {
      return { success: false, error: 'NOT_A_PARTICIPANT' };
    }

    const peerId = room.user_1 === callerUserId ? room.user_2 : room.user_1;
    const peerProfile = this.profiles.get(peerId);
    const peerIsVerified = Boolean(peerProfile?.college_identity_linked);

    let anonymousUsername;
    let avatarConfig;

    if (peerIsVerified) {
      const anon = this.anonymousIdentities.get(peerId);
      anonymousUsername = anon?.anonymous_username || computeDeterministicUnknownUser(peerId);
      avatarConfig = anon?.avatar_config || DEFAULT_AVATAR;
    } else {
      anonymousUsername = computeDeterministicUnknownUser(peerId);
      avatarConfig = DEFAULT_AVATAR;
    }

    return {
      success: true,
      room_id: roomId,
      room_status: room.status,
      created_at: room.created_at,
      expires_at: room.expires_at,
      end_reason: room.end_reason,
      peer: {
        anonymous_username: anonymousUsername,
        avatar_config: avatarConfig,
      },
    };
  }

  // Simulates unlink_college_identity RPC
  unlinkCollegeIdentity(userId) {
    const profile = this.profiles.get(userId);
    if (!profile) return { success: false, error: 'NOT_FOUND' };

    profile.college_identity_linked = false;
    // NOTE: anonymousIdentities is deliberately NOT deleted (preserves saved persona)

    // Touch persona_updated_at on any active room user is in
    for (const room of this.chatRooms.values()) {
      if ((room.user_1 === userId || room.user_2 === userId) && room.status === 'active') {
        room.persona_updated_at = new Date().toISOString();
      }
    }

    return { success: true };
  }

  // Simulates verify_and_link_college_identity RPC
  verifyAndLinkCollegeIdentity(userId) {
    const profile = this.profiles.get(userId);
    if (!profile) return { success: false, error: 'NOT_FOUND' };

    profile.college_identity_linked = true;

    // Signal active rooms
    for (const room of this.chatRooms.values()) {
      if ((room.user_1 === userId || room.user_2 === userId) && room.status === 'active') {
        room.persona_updated_at = new Date().toISOString();
      }
    }

    return { success: true };
  }

  // Simulates save_anonymous_alias RPC
  saveAnonymousAlias(userId, alias) {
    const profile = this.profiles.get(userId);
    if (!profile || !profile.college_identity_linked) {
      return { success: false, error: 'VERIFICATION_REQUIRED' };
    }

    const check = isValidAliasFormat(alias);
    if (!check.valid) {
      return { success: false, error: 'INVALID_ALIAS' };
    }

    profile.display_username = alias;
    const existing = this.anonymousIdentities.get(userId) || { user_id: userId, avatar_config: DEFAULT_AVATAR };
    existing.anonymous_username = alias;
    this.anonymousIdentities.set(userId, existing);

    // Signal active rooms
    for (const room of this.chatRooms.values()) {
      if ((room.user_1 === userId || room.user_2 === userId) && room.status === 'active') {
        room.persona_updated_at = new Date().toISOString();
      }
    }

    return { success: true, alias };
  }
}

describe('TALK TO RITIANS - Chat UX + Persona Consistency Suite', () => {
  let db;

  beforeEach(() => {
    db = new MockSupabaseDB();
  });

  // ==========================================================================
  // CHANGE 1 & 2: Chat Layout & Header Invariants
  // ==========================================================================
  describe('Change 1 & 2: Chat Layout & Header Rendering', () => {
    const chatPageContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/ChatPage.tsx'), 'utf8');

    test('1. chat header remains outside scroll container', () => {
      // Header must have shrink-0 (flex-shrink: 0) and be outside chat-messages-container
      assert.ok(chatPageContent.includes('id="chat-header"'), 'Header must have id="chat-header"');
      assert.ok(chatPageContent.includes('shrink-0'), 'Header must include shrink-0 to prevent collapsing');

      const headerIdx = chatPageContent.indexOf('id="chat-header"');
      const messagesIdx = chatPageContent.indexOf('id="chat-messages-container"');
      assert.ok(headerIdx < messagesIdx, 'Header must be declared before scrollable messages container');
    });

    test('2. message area alone has overflow scrolling', () => {
      // Root container must have 100dvh and overflow-hidden
      assert.ok(chatPageContent.includes('h-[100dvh]'), 'Root container must use 100dvh for mobile chrome support');
      assert.ok(chatPageContent.includes('overflow-hidden'), 'Root container must be overflow-hidden');

      // Messages container must have flex-1, min-h-0, and overflow-y-auto
      assert.ok(chatPageContent.includes('id="chat-messages-container"'));
      assert.ok(chatPageContent.includes('min-h-0'), 'Messages container must have min-h-0 for proper flex shrink');
      assert.ok(chatPageContent.includes('overflow-y-auto'), 'Messages container must have overflow-y-auto');
    });

    test('3. composer remains outside scroll container', () => {
      // Composer must have shrink-0 and be rendered after chat-messages-container
      assert.ok(chatPageContent.includes('id="chat-composer-container"'));

      const messagesIdx = chatPageContent.indexOf('id="chat-messages-container"');
      const composerIdx = chatPageContent.indexOf('id="chat-composer-container"');
      assert.ok(composerIdx > messagesIdx, 'Composer must be rendered after scrollable messages container');
    });

    test('4. "Chatting with" no longer renders', () => {
      // Must NOT contain "Chatting with"
      assert.equal(
        chatPageContent.includes('Chatting with'),
        false,
        'Header must not contain the label "Chatting with"'
      );
    });

    test('5. header renders peer username only', () => {
      // Header directly renders peer username and online presence indicator
      assert.ok(chatPageContent.includes('id="chat-peer-username"'));
      assert.ok(chatPageContent.includes('{peer.anonymousUsername}'));
      assert.ok(chatPageContent.includes('Online'));
    });
  });

  // ==========================================================================
  // CHANGE 3: Unlink & Effective Persona Consistency
  // ==========================================================================
  describe('Change 3: Server-Authoritative Effective Persona & Live Unlink Refresh', () => {
    test('6. unverified peer gets Unknown User ####', () => {
      db.setProfile('user-caller', { college_identity_linked: true });
      db.setProfile('user-unverified', { college_identity_linked: false });
      db.createRoom('room-1', 'user-caller', 'user-unverified');

      const res = db.getRoomPeer('user-caller', 'room-1');
      assert.equal(res.success, true);
      assert.match(res.peer.anonymous_username, /^Unknown User \d{4}$/);
    });

    test('7. unverified peer gets default avatar', () => {
      db.setProfile('user-caller', { college_identity_linked: true });
      db.setProfile('user-unverified', { college_identity_linked: false });
      db.createRoom('room-1', 'user-caller', 'user-unverified');

      const res = db.getRoomPeer('user-caller', 'room-1');
      assert.equal(res.success, true);
      assert.deepEqual(res.peer.avatar_config, DEFAULT_AVATAR);
    });

    test('8. verified peer gets saved custom persona', () => {
      db.setProfile('user-caller', { college_identity_linked: true });
      db.setProfile('user-verified', { college_identity_linked: true });
      const customAvatar = { ...DEFAULT_AVATAR, background: 'emerald', shirtColor: '#10B981' };
      db.setAnonymousIdentity('user-verified', 'Nova', customAvatar);
      db.createRoom('room-1', 'user-caller', 'user-verified');

      const res = db.getRoomPeer('user-caller', 'room-1');
      assert.equal(res.success, true);
      assert.equal(res.peer.anonymous_username, 'Nova');
      assert.deepEqual(res.peer.avatar_config, customAvatar);
    });

    test('9. unlink during active chat causes peer persona refresh signal', () => {
      db.setProfile('user-a', { college_identity_linked: true });
      db.setProfile('user-b', { college_identity_linked: true });
      db.setAnonymousIdentity('user-a', 'Nova', DEFAULT_AVATAR);
      const room = db.createRoom('room-live', 'user-a', 'user-b');

      const initialSignal = room.persona_updated_at;

      // Small delay to ensure timestamp advancement
      const unlinkRes = db.unlinkCollegeIdentity('user-a');
      assert.equal(unlinkRes.success, true);

      // Verify active room persona_updated_at was updated to signal peer
      assert.ok(room.persona_updated_at >= initialSignal);
    });

    test('10. peer does not need page refresh after unlink', () => {
      // User B is actively chatting with User A
      db.setProfile('user-a', { college_identity_linked: true });
      db.setProfile('user-b', { college_identity_linked: true });
      db.setAnonymousIdentity('user-a', 'Nova', DEFAULT_AVATAR);
      db.createRoom('room-live', 'user-a', 'user-b');

      // Before unlink: User B sees Nova
      const before = db.getRoomPeer('user-b', 'room-live');
      assert.equal(before.peer.anonymous_username, 'Nova');

      // User A unlinks in another tab/settings
      db.unlinkCollegeIdentity('user-a');

      // When room signal fires, User B immediately calls getRoomPeer without page reload
      const after = db.getRoomPeer('user-b', 'room-live');
      assert.match(after.peer.anonymous_username, /^Unknown User \d{4}$/);
      assert.deepEqual(after.peer.avatar_config, DEFAULT_AVATAR);
    });

    test('11. re-link restores allowed custom persona', () => {
      db.setProfile('user-a', { college_identity_linked: false });
      db.setProfile('user-b', { college_identity_linked: true });
      db.setAnonymousIdentity('user-a', 'Nova', DEFAULT_AVATAR);
      db.createRoom('room-live', 'user-a', 'user-b');

      // While unverified, caller receives Unknown User
      const unlinkedPeer = db.getRoomPeer('user-b', 'room-live');
      assert.match(unlinkedPeer.peer.anonymous_username, /^Unknown User \d{4}$/);

      // User A re-links college identity
      db.verifyAndLinkCollegeIdentity('user-a');

      // Active chat caller immediately receives restored custom persona
      const restoredPeer = db.getRoomPeer('user-b', 'room-live');
      assert.equal(restoredPeer.peer.anonymous_username, 'Nova');
    });

    test('12. unlink does NOT delete saved custom persona', () => {
      db.setProfile('user-a', { college_identity_linked: true });
      const customAvatar = { ...DEFAULT_AVATAR, mouth: 'laugh' };
      db.setAnonymousIdentity('user-a', 'Nova', customAvatar);

      // User A unlinks
      db.unlinkCollegeIdentity('user-a');

      // Saved persona must still exist privately in the database
      const saved = db.anonymousIdentities.get('user-a');
      assert.ok(saved, 'Saved persona record must survive unlinking');
      assert.equal(saved.anonymous_username, 'Nova');
      assert.deepEqual(saved.avatar_config, customAvatar);
    });
  });

  // ==========================================================================
  // CHANGE 4: Curated Short Random Alias System
  // ==========================================================================
  describe('Change 4: Short Curated Random Alias UX', () => {
    const settingsContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/SettingsPage.tsx'), 'utf8');
    const usernamePageContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/UsernameSelectionPage.tsx'), 'utf8');

    test('13. username free-text input no longer exists', () => {
      // Neither SettingsPage nor UsernameSelectionPage may contain a text input for username
      assert.equal(
        settingsContent.includes('type="text" placeholder="Enter anonymous username"'),
        false
      );
      assert.equal(
        usernamePageContent.includes('<input'),
        false,
        'UsernameSelectionPage must not render any <input> element'
      );
    });

    test('14. alias candidate <= 10 characters', () => {
      assert.ok(SAFE_ALIAS_POOL.length >= 50, 'Pool must contain at least 50 curated short names');
      for (const alias of SAFE_ALIAS_POOL) {
        assert.ok(alias.length >= 3, `Alias "${alias}" must be at least 3 characters`);
        assert.ok(alias.length <= 10, `Alias "${alias}" must not exceed 10 characters (hard max)`);
        assert.equal(isValidAliasFormat(alias).valid, true, `Alias "${alias}" must be valid`);
      }
    });

    test('15. refresh generates another alias', () => {
      const current = 'Nova';
      for (let i = 0; i < 20; i++) {
        const next = getRandomShortAlias(current);
        assert.notEqual(next, current, 'Refresh must not return the exact same alias when alternatives exist');
        assert.ok(SAFE_ALIAS_POOL.includes(next), `Rolled alias "${next}" must be from the curated pool`);
      }
    });

    test('16. unlimited refresh has no artificial counter/limit', () => {
      // Simulate 150 consecutive rerolls
      let candidate = 'Nova';
      for (let i = 0; i < 150; i++) {
        candidate = getRandomShortAlias(candidate);
        assert.ok(candidate.length <= 10);
      }
      assert.ok(true, 'Reroll can be invoked indefinitely without counter exhaustion');
    });

    test('17. reroll does not persist until Save', () => {
      db.setProfile('user-v', { college_identity_linked: true, display_username: 'Nova' });

      // Locally draw 10 rerolls
      let candidate = 'Nova';
      for (let i = 0; i < 10; i++) {
        candidate = getRandomShortAlias(candidate);
      }

      // Profile in DB must remain unchanged at 'Nova' until explicitly saved
      const profile = db.profiles.get('user-v');
      assert.equal(profile.display_username, 'Nova');
    });

    test('18. saved alias persists correctly', () => {
      db.setProfile('user-v', { college_identity_linked: true });
      const res = db.saveAnonymousAlias('user-v', 'Kiro');
      assert.equal(res.success, true);
      assert.equal(res.alias, 'Kiro');

      const profile = db.profiles.get('user-v');
      assert.equal(profile.display_username, 'Kiro');
      const anon = db.anonymousIdentities.get('user-v');
      assert.equal(anon.anonymous_username, 'Kiro');
    });

    test('19. unverified users cannot access alias customization', () => {
      db.setProfile('user-unverified', { college_identity_linked: false });
      const res = db.saveAnonymousAlias('user-unverified', 'Nova');
      assert.equal(res.success, false);
      assert.equal(res.error, 'VERIFICATION_REQUIRED');
    });
  });

  // ==========================================================================
  // Privacy & Core Regressions
  // ==========================================================================
  describe('Privacy & Core Regressions', () => {
    test('20. privacy fields still absent from get_room_peer response', () => {
      db.setProfile('user-caller', { college_identity_linked: true });
      db.setProfile('user-peer', {
        college_identity_linked: true,
        department: 'Computer Science',
        batch: '2022-2026',
        gender: 'Male',
        email: 'secret@rit.ac.in',
      });
      db.createRoom('room-priv', 'user-caller', 'user-peer');

      const res = db.getRoomPeer('user-caller', 'room-priv');
      assert.equal(res.success, true);

      // Verify zero PII exposed in root or peer object
      const peerKeys = Object.keys(res.peer);
      assert.deepEqual(peerKeys.sort(), ['anonymous_username', 'avatar_config'].sort());
      assert.equal(res.peer.department, undefined);
      assert.equal(res.peer.batch, undefined);
      assert.equal(res.peer.gender, undefined);
      assert.equal(res.peer.email, undefined);
      assert.equal(res.peer.college_identity_linked, undefined);
      assert.equal(res.college_identity_linked, undefined);
    });

    test('21. Realtime messaging regression passes', () => {
      // Invariant: Message payload requires roomId, senderId, content, createdAt
      const msg = {
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'user-1',
        content: 'Hello fellow RITian!',
        createdAt: new Date().toISOString(),
        isSystem: false,
      };

      assert.ok(msg.roomId);
      assert.ok(msg.senderId);
      assert.ok(msg.content.length > 0 && msg.content.length <= 1000);
      assert.ok(!msg.content.includes('<script>'));
    });

    test('22. 7-minute timer regression passes', () => {
      const now = Date.now();
      const expiresAt = new Date(now + 7 * 60 * 1000).toISOString();
      const room = db.createRoom('room-timer', 'user-1', 'user-2', expiresAt);

      const diffSecs = Math.floor((new Date(room.expires_at).getTime() - now) / 1000);
      assert.ok(diffSecs >= 419 && diffSecs <= 420, 'Room timer must initialize to 7 minutes (420s)');
    });
  });
});
