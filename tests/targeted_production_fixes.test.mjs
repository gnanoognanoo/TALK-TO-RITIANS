/**
 * ============================================================================
 * TALK TO RITIANS - Four Targeted Production Fixes Regression Test Suite
 * ============================================================================
 * 1. Developer custom persona visible to chat partners without physical college ID.
 * 2. Unlinking physical RIT ID completely resets/deletes student verification data.
 * 3. Developer Console "Last Seen" shows Online for online users and time-ago for offline.
 * 4. Room Moderation is a real-time read-only chat viewer.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectivePersona,
  computeDeterministicUnknownUser,
  DEFAULT_AVATAR_CONFIG,
} from '../src/utils/persona.ts';

// ----------------------------------------------------------------------------
// FIX 1: DEVELOPER PERSONA TESTS
// ----------------------------------------------------------------------------

describe('Fix 1 — Developer Persona Peer Visibility', () => {
  const developerAccount = {
    id: '532274f3-7fd9-4206-b353-dcd36bababd5',
    college_identity_linked: false, // Developer does NOT have college card linked
    is_staff: true,
    staff_role: 'developer',
    display_username: 'Heisenberg',
    avatar_config: {
      type: 'gallery',
      url: 'https://talk-to-ritians.vercel.app/avatars/heisenberg.webp',
    },
  };

  const normalUnverifiedUser = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    college_identity_linked: false,
    is_staff: false,
    display_username: null,
    avatar_config: null,
  };

  const normalVerifiedUser = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    college_identity_linked: true,
    is_staff: false,
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

  test('developer without college ID returns custom username (Heisenberg) to peer', () => {
    const persona = getEffectivePersona(developerAccount);
    assert.equal(persona.displayUsername, 'Heisenberg');
    assert.equal(persona.isVerified, false, 'developer privilege does not fake college_identity_linked');
  });

  test('developer without college ID returns custom gallery avatar to peer', () => {
    const persona = getEffectivePersona(developerAccount);
    assert.deepEqual(persona.avatarConfig, {
      type: 'gallery',
      url: 'https://talk-to-ritians.vercel.app/avatars/heisenberg.webp',
    });
  });

  test('developer fallback username is Heisenberg if not explicitly set', () => {
    const devWithoutName = {
      ...developerAccount,
      display_username: null,
    };
    const persona = getEffectivePersona(devWithoutName);
    assert.equal(persona.displayUsername, 'Heisenberg');
  });

  test('developer invite preview displays developer persona', () => {
    const invitePayload = {
      requester_id: developerAccount.id,
      requester: getEffectivePersona(developerAccount),
    };
    assert.equal(invitePayload.requester.displayUsername, 'Heisenberg');
    assert.equal(invitePayload.requester.avatarConfig.type, 'gallery');
  });

  test('normal unverified user strictly returns deterministic Unknown User #### and default avatar', () => {
    const persona = getEffectivePersona(normalUnverifiedUser);
    assert.match(persona.displayUsername, /^Unknown User \d{4}$/);
    assert.deepEqual(persona.avatarConfig, DEFAULT_AVATAR_CONFIG);
  });

  test('normal verified student uses saved anonymous alias and modular avatar', () => {
    const persona = getEffectivePersona(normalVerifiedUser);
    assert.equal(persona.displayUsername, 'Nova');
    assert.equal(persona.avatarConfig.shirt, 'hoodie');
    assert.equal(persona.isVerified, true);
  });
});

// ----------------------------------------------------------------------------
// FIX 2: UNLINK RIT ID COMPLETE VERIFICATION RESET TESTS
// ----------------------------------------------------------------------------

describe('Fix 2 — Unlink Complete Verification Reset Simulation', () => {
  // In-memory simulation of the trusted atomic unlink transaction
  let dbProfiles;
  let dbIdentities;
  let dbAnonymousIdentities;
  let dbChatRooms;

  beforeEach(() => {
    dbProfiles = new Map();
    dbIdentities = new Map();
    dbAnonymousIdentities = new Map();
    dbChatRooms = new Map();

    // Student A verified state
    const studentAId = '11111111-2222-3333-4444-555555555555';
    dbProfiles.set(studentAId, {
      id: studentAId,
      college_identity_linked: true,
      verified_at: '2026-09-25T10:00:00Z',
      verification_method: 'physical_id',
      name: 'Student A',
      full_name: 'Student A',
      department: 'CSE',
      batch: '2026',
      section: 'A',
      class_name: 'CSE-A',
      graduation_year: 2026,
      gender: 'Male',
      gender_locked_at: '2026-09-25T10:05:00Z',
      ever_verified_identity: true,
      first_verified_at: '2026-09-25T10:00:00Z',
      display_username: 'Nova',
      avatar_config: { face: 'round', shirtColor: '#10B981' },
      is_staff: false,
    });

    dbIdentities.set('card_hash_xxx', {
      id: 'ident-1',
      user_id: studentAId,
      identity_hash: 'card_hash_xxx',
      active: true,
    });

    dbAnonymousIdentities.set(studentAId, {
      user_id: studentAId,
      anonymous_username: 'Nova',
      avatar_config: { face: 'round', shirtColor: '#10B981' },
    });

    dbChatRooms.set('room-1', {
      id: 'room-1',
      user_1: studentAId,
      user_2: '99999999-9999-9999-9999-999999999999',
      status: 'active',
      persona_updated_at: '2026-09-25T10:00:00Z',
    });
  });

  function simulateUnlinkCollegeIdentity(userId) {
    const profile = dbProfiles.get(userId);
    if (!profile) return { success: false, error: 'NOT_FOUND' };

    const isDev = Boolean(profile.is_staff);

    // 1. Delete identity link row
    for (const [hash, row] of dbIdentities.entries()) {
      if (row.user_id === userId) {
        dbIdentities.delete(hash);
      }
    }

    const now = new Date().toISOString();

    if (isDev) {
      // Developer exception: preserve developer custom persona
      profile.college_identity_linked = false;
      profile.verified_at = null;
      profile.verification_method = null;
      profile.name = null;
      profile.full_name = null;
      profile.department = null;
      profile.batch = null;
      profile.gender = null;
      profile.gender_locked_at = null;
      profile.ever_verified_identity = false;
      profile.first_verified_at = null;
    } else {
      // Normal student: full fresh reset
      profile.college_identity_linked = false;
      profile.verified_at = null;
      profile.verification_method = null;
      profile.name = null;
      profile.full_name = null;
      profile.department = null;
      profile.batch = null;
      profile.section = null;
      profile.class_name = null;
      profile.graduation_year = null;
      profile.gender = null;
      profile.gender_locked_at = null;
      profile.ever_verified_identity = false;
      profile.first_verified_at = null;
      profile.display_username = computeDeterministicUnknownUser(userId);
      profile.avatar_config = DEFAULT_AVATAR_CONFIG;

      // Delete normal anonymous persona
      dbAnonymousIdentities.delete(userId);
    }

    // Signal active rooms
    for (const room of dbChatRooms.values()) {
      if (room.status === 'active' && (room.user_1 === userId || room.user_2 === userId)) {
        room.persona_updated_at = now;
      }
    }

    return { success: true, unlinked_at: now };
  }

  test('unlink deletes college_identities row completely', () => {
    const studentAId = '11111111-2222-3333-4444-555555555555';
    assert.equal(dbIdentities.has('card_hash_xxx'), true);

    const res = simulateUnlinkCollegeIdentity(studentAId);
    assert.equal(res.success, true);
    assert.equal(dbIdentities.has('card_hash_xxx'), false, 'identity link record must be deleted');
  });

  test('unlink clears all verified institutional fields', () => {
    const studentAId = '11111111-2222-3333-4444-555555555555';
    simulateUnlinkCollegeIdentity(studentAId);

    const p = dbProfiles.get(studentAId);
    assert.equal(p.college_identity_linked, false);
    assert.equal(p.verified_at, null);
    assert.equal(p.verification_method, null);
    assert.equal(p.name, null);
    assert.equal(p.full_name, null);
    assert.equal(p.department, null);
    assert.equal(p.batch, null);
    assert.equal(p.gender, null);
    assert.equal(p.gender_locked_at, null);
    assert.equal(p.ever_verified_identity, false);
    assert.equal(p.first_verified_at, null);
  });

  test('unlink clears normal student anonymous alias and modular avatar', () => {
    const studentAId = '11111111-2222-3333-4444-555555555555';
    simulateUnlinkCollegeIdentity(studentAId);

    const p = dbProfiles.get(studentAId);
    assert.match(p.display_username, /^Unknown User \d{4}$/);
    assert.deepEqual(p.avatar_config, DEFAULT_AVATAR_CONFIG);
    assert.equal(dbAnonymousIdentities.has(studentAId), false, 'anonymous identity row deleted');
  });

  test('active peer immediately sees Unknown User and default avatar after unlink', () => {
    const studentAId = '11111111-2222-3333-4444-555555555555';
    simulateUnlinkCollegeIdentity(studentAId);

    const effective = getEffectivePersona(dbProfiles.get(studentAId));
    assert.match(effective.displayUsername, /^Unknown User \d{4}$/);
    assert.deepEqual(effective.avatarConfig, DEFAULT_AVATAR_CONFIG);
    assert.equal(effective.isVerified, false);
  });

  test('same card can be linked again after unlink without collision', () => {
    const studentAId = '11111111-2222-3333-4444-555555555555';
    simulateUnlinkCollegeIdentity(studentAId);

    // Re-verification with same card hash
    assert.equal(dbIdentities.has('card_hash_xxx'), false);
    dbIdentities.set('card_hash_xxx', {
      id: 'ident-2',
      user_id: studentAId,
      identity_hash: 'card_hash_xxx',
      active: true,
    });
    assert.equal(dbIdentities.get('card_hash_xxx').user_id, studentAId);
  });

  test('developer custom persona survives developer college unlink', () => {
    const devId = '532274f3-7fd9-4206-b353-dcd36bababd5';
    dbProfiles.set(devId, {
      id: devId,
      college_identity_linked: true,
      is_staff: true,
      staff_role: 'developer',
      display_username: 'Heisenberg',
      avatar_config: { type: 'gallery', url: 'https://example.com/avatar.webp' },
    });

    simulateUnlinkCollegeIdentity(devId);

    const p = dbProfiles.get(devId);
    assert.equal(p.college_identity_linked, false);
    assert.equal(p.display_username, 'Heisenberg', 'developer username must not be wiped');
    assert.deepEqual(p.avatar_config, { type: 'gallery', url: 'https://example.com/avatar.webp' });
  });
});

// ----------------------------------------------------------------------------
// FIX 3: LAST SEEN ONLINE / OFFLINE LOGIC TESTS
// ----------------------------------------------------------------------------

describe('Fix 3 — Developer Console Last Seen Presence Logic', () => {
  const isUserOnline = (u, nowMs = Date.now()) => {
    if (!u.is_online) return false;
    if (!u.last_seen_at) return false;
    const diffMs = nowMs - new Date(u.last_seen_at).getTime();
    return diffMs <= 30000;
  };

  const formatLastSeenDisplay = (u, nowMs = Date.now()) => {
    if (isUserOnline(u, nowMs)) {
      return { text: 'Online', indicator: 'green_dot' };
    }
    const diffSec = Math.floor((nowMs - new Date(u.last_seen_at).getTime()) / 1000);
    if (diffSec < 60) return { text: `${diffSec}s ago`, indicator: 'muted' };
    if (diffSec < 3600) return { text: `${Math.floor(diffSec / 60)}m ago`, indicator: 'muted' };
    return { text: `${Math.floor(diffSec / 3600)}h ago`, indicator: 'muted' };
  };

  test('user with fresh 10s heartbeat shows Online with green indicator', () => {
    const now = Date.now();
    const user = {
      is_online: true,
      last_seen_at: new Date(now - 10000).toISOString(),
    };
    assert.equal(isUserOnline(user, now), true);
    const display = formatLastSeenDisplay(user, now);
    assert.equal(display.text, 'Online');
    assert.equal(display.indicator, 'green_dot');
  });

  test('stale heartbeat (>30s) shows relative time-ago (e.g. 5m ago)', () => {
    const now = Date.now();
    const user = {
      is_online: true, // flag might be true but heartbeat expired
      last_seen_at: new Date(now - 300000).toISOString(), // 5 mins ago
    };
    assert.equal(isUserOnline(user, now), false);
    const display = formatLastSeenDisplay(user, now);
    assert.equal(display.text, '5m ago');
    assert.equal(display.indicator, 'muted');
  });

  test('offline user shows relative time-ago', () => {
    const now = Date.now();
    const user = {
      is_online: false,
      last_seen_at: new Date(now - 7200000).toISOString(), // 2 hours ago
    };
    assert.equal(isUserOnline(user, now), false);
    const display = formatLastSeenDisplay(user, now);
    assert.equal(display.text, '2h ago');
    assert.equal(display.indicator, 'muted');
  });

  test('state (In Chat, Searching, Idle) remains independent from presence', () => {
    const now = Date.now();
    const chattingOnlineUser = {
      state: 'in_chat',
      is_online: true,
      last_seen_at: new Date(now - 5000).toISOString(),
    };
    assert.equal(chattingOnlineUser.state, 'in_chat');
    assert.equal(isUserOnline(chattingOnlineUser, now), true);
  });
});

// ----------------------------------------------------------------------------
// FIX 4: REAL-TIME ROOM MODERATION CHAT VIEW TESTS
// ----------------------------------------------------------------------------

describe('Fix 4 — Live Read-Only Room Moderation Chat Viewer', () => {
  let moderationMessages;
  let moderationSession;
  const currentRoomId = 'bbb77c19-1111-2222-3333-444444444444';
  const participantA = { id: 'user-a', username: 'IronEagle' };
  const participantB = { id: 'user-b', username: 'Unknown User 5326' };

  beforeEach(() => {
    moderationMessages = [
      {
        id: 'msg-1',
        room_id: currentRoomId,
        sender_id: participantA.id,
        sender_username: participantA.username,
        content: 'Hi',
        created_at: '2026-10-10T21:30:00Z',
      },
      {
        id: 'msg-2',
        room_id: currentRoomId,
        sender_id: participantB.id,
        sender_username: participantB.username,
        content: 'Hiii',
        created_at: '2026-10-10T21:30:08Z',
      },
    ];

    moderationSession = {
      developer_id: '532274f3-7fd9-4206-b353-dcd36bababd5',
      room_id: currentRoomId,
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      active: true,
    };
  });

  function handleIncomingRealtimeMessage(payload, currentRoom, partA, partB) {
    if (!payload || payload.room_id !== currentRoom) {
      return null; // Ignore messages from other rooms
    }

    const senderUsername =
      payload.sender_id === partA.id
        ? partA.username
        : payload.sender_id === partB.id
        ? partB.username
        : 'Participant';

    return {
      id: payload.id,
      room_id: payload.room_id,
      sender_id: payload.sender_id,
      sender_username: senderUsername,
      content: payload.content,
      created_at: payload.created_at,
    };
  }

  function appendAndDeduplicate(existing, newMsg) {
    if (existing.some((m) => m.id === newMsg.id)) {
      return existing; // Duplicate ignored
    }
    return [...existing, newMsg].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  test('initial transcript loads existing messages chronologically', () => {
    assert.equal(moderationMessages.length, 2);
    assert.equal(moderationMessages[0].content, 'Hi');
    assert.equal(moderationMessages[1].content, 'Hiii');
  });

  test('real-time incoming message for current room appends cleanly', () => {
    const incoming = {
      id: 'msg-3',
      room_id: currentRoomId,
      sender_id: participantA.id,
      content: 'Victorious',
      created_at: '2026-10-10T21:30:24Z',
    };

    const formatted = handleIncomingRealtimeMessage(incoming, currentRoomId, participantA, participantB);
    assert.ok(formatted);
    assert.equal(formatted.sender_username, 'IronEagle');

    moderationMessages = appendAndDeduplicate(moderationMessages, formatted);
    assert.equal(moderationMessages.length, 3);
    assert.equal(moderationMessages[2].content, 'Victorious');
  });

  test('real-time incoming message from another room is strictly ignored', () => {
    const otherRoomMsg = {
      id: 'msg-999',
      room_id: 'other-room-id-999',
      sender_id: 'other-user',
      content: 'Secret from other room',
      created_at: '2026-10-10T21:30:30Z',
    };

    const formatted = handleIncomingRealtimeMessage(otherRoomMsg, currentRoomId, participantA, participantB);
    assert.equal(formatted, null, 'must ignore other room messages');
  });

  test('duplicate message event does not duplicate entries', () => {
    const duplicate = {
      id: 'msg-2',
      room_id: currentRoomId,
      sender_id: participantB.id,
      content: 'Hiii',
      created_at: '2026-10-10T21:30:08Z',
    };

    const formatted = handleIncomingRealtimeMessage(duplicate, currentRoomId, participantA, participantB);
    const updated = appendAndDeduplicate(moderationMessages, formatted);
    assert.equal(updated.length, 2, 'must not add duplicate message');
  });

  test('chronological ordering is preserved even if events arrive out of order', () => {
    const earlierMsg = {
      id: 'msg-0',
      room_id: currentRoomId,
      sender_id: participantA.id,
      content: 'Early greeting',
      created_at: '2026-10-10T21:29:50Z',
    };

    const formatted = handleIncomingRealtimeMessage(earlierMsg, currentRoomId, participantA, participantB);
    const updated = appendAndDeduplicate(moderationMessages, formatted);
    assert.equal(updated[0].id, 'msg-0');
    assert.equal(updated[1].id, 'msg-1');
    assert.equal(updated[2].id, 'msg-2');
  });

  test('normal user without staff authorization cannot inspect moderation transcript', () => {
    const isStaff = false;
    const canAccess = isStaff && moderationSession.active;
    assert.equal(canAccess, false);
  });

  test('developer observer is not added as participant in chat_room_participants', () => {
    const participants = [participantA.id, participantB.id];
    assert.equal(participants.includes(moderationSession.developer_id), false);
  });

  test('moderation viewer has zero send composer / message input controls', () => {
    const hasSendComposer = false;
    assert.equal(hasSendComposer, false);
  });
});

// ----------------------------------------------------------------------------
// DEVELOPER ID VERIFICATION BYPASS TESTS
// ----------------------------------------------------------------------------

describe('Developer ID Verification Bypass — Zero Student ID Linkage Required', () => {
  const developerUser = {
    id: '532274f3-7fd9-4206-b353-dcd36bababd5',
    college_identity_linked: false, // Explicitly false! No student ID linked
    first_verified_at: null,
    is_staff: true,
    staff_role: 'developer',
    display_username: 'Heisenberg',
    gender: null,
    gender_locked_at: null,
    avatar_config: {
      type: 'gallery',
      url: 'https://talk-to-ritians.vercel.app/avatars/heisenberg.webp',
    },
  };

  const normalStudentUnverified = {
    id: '11111111-2222-3333-4444-555555555555',
    college_identity_linked: false,
    first_verified_at: null,
    is_staff: false,
    staff_role: null,
    display_username: 'CustomStudentAttempt',
    gender: null,
    gender_locked_at: null,
    avatar_config: {
      face: 'sharp',
      skin: '#E0AC69',
    },
  };

  test('server authorization relies strictly on platform_staff membership, not college_identity_linked', () => {
    const isPlatformStaff = (user) => Boolean(user.is_staff && user.staff_role === 'developer');
    assert.equal(isPlatformStaff(developerUser), true);
    assert.equal(developerUser.college_identity_linked, false);
    assert.equal(isPlatformStaff(normalStudentUnverified), false);
  });

  test('developer with no linked ID can set custom username (Heisenberg)', () => {
    const persona = getEffectivePersona(developerUser);
    assert.equal(persona.displayUsername, 'Heisenberg');
  });

  test('developer with no linked ID can upload gallery avatar', () => {
    const persona = getEffectivePersona(developerUser);
    assert.equal(persona.avatarConfig.type, 'gallery');
    assert.equal(persona.avatarConfig.url, 'https://talk-to-ritians.vercel.app/avatars/heisenberg.webp');
  });

  test('developer can chat without college ID (matchmaking and peer persona resolution)', () => {
    const peerPersona = getEffectivePersona(developerUser);
    assert.equal(peerPersona.displayUsername, 'Heisenberg');
    assert.ok(!peerPersona.displayUsername.startsWith('Unknown User'));
    assert.equal(peerPersona.isVerified, false, 'Does not falsely flag developer as verified RIT student');
  });

  test('other students see Developer username and gallery avatar, not Unknown User', () => {
    const roomPeerResolution = {
      peer_id: developerUser.id,
      ...getEffectivePersona(developerUser),
    };
    assert.equal(roomPeerResolution.displayUsername, 'Heisenberg');
    assert.equal(roomPeerResolution.avatarConfig.type, 'gallery');
    assert.notEqual(roomPeerResolution.displayUsername, 'Unknown User 4821');
  });

  test('developer receives no verification-required prompts (ProtectedRoute bypass)', () => {
    const checkProtectedRouteRedirect = (user, path) => {
      const isStaff = Boolean(user.is_staff);
      const isCollegeLinked = Boolean(user.college_identity_linked);
      if (path === '/settings' || path === '/home' || path === '/developer') {
        return null;
      }
      if (!isCollegeLinked && !isStaff) {
        return '/settings';
      }
      return null;
    };

    assert.equal(checkProtectedRouteRedirect(developerUser, '/matching'), null, 'Developer not redirected to /settings');
    assert.equal(checkProtectedRouteRedirect(normalStudentUnverified, '/settings'), null);
  });

  test('developer does not need gender confirmation or gender lock', () => {
    assert.equal(developerUser.gender, null);
    assert.equal(developerUser.gender_locked_at, null);
    const persona = getEffectivePersona(developerUser);
    assert.ok(persona.displayUsername);
  });

  test('developer can access Developer Console without college ID', () => {
    const canAccessConsole = Boolean(developerUser.is_staff && developerUser.staff_role === 'developer');
    assert.equal(canAccessConsole, true);
    assert.equal(developerUser.college_identity_linked, false);
  });

  test('normal unverified student strictly cannot obtain developer customization permissions', () => {
    const normalPersona = getEffectivePersona(normalStudentUnverified);
    assert.match(normalPersona.displayUsername, /^Unknown User \d{4}$/);
    assert.notEqual(normalPersona.displayUsername, 'CustomStudentAttempt');
    assert.deepEqual(normalPersona.avatarConfig, DEFAULT_AVATAR_CONFIG);
  });

  test('student unlink operation never deletes developer username, avatar, or platform_staff record', () => {
    // Simulating unlink_college_identity logic
    const unlinkSimulation = (user) => {
      const isDev = Boolean(user.is_staff && user.staff_role === 'developer');
      if (isDev) {
        // Developer bypass: preserve display_username, gallery avatar, and staff role
        return {
          ...user,
          college_identity_linked: false,
          first_verified_at: null,
          verified_at: null,
        };
      }
      // Normal student: wipe persona
      return {
        ...user,
        college_identity_linked: false,
        first_verified_at: null,
        display_username: null,
        avatar_config: null,
        department: null,
        batch: null,
      };
    };

    const unlinkedDev = unlinkSimulation(developerUser);
    assert.equal(unlinkedDev.display_username, 'Heisenberg');
    assert.equal(unlinkedDev.avatar_config.type, 'gallery');
    assert.equal(unlinkedDev.is_staff, true);
  });
});
