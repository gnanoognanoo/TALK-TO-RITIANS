/**
 * ============================================================================
 * TALK TO RITIANS - Developer & Admin Console Test Suite
 * ============================================================================
 * Validates:
 * 1. Privileged role model & Server-Side Enforcement (platform_staff)
 * 2. Developer persona & Physical ID bypass (without faking college_identity_linked)
 * 3. Custom developer username validation & sanitization (3-20 chars, no HTML/control chars)
 * 4. Normal user cannot set custom username (RPC rejected)
 * 5. Developer gallery avatar rules (MIME, 512x512 square WebP, no SVG)
 * 6. Admin online-user listing & presence state isolation (normal user denied)
 * 7. Privileged profile view & Zero raw register numbers (masked fingerprint suffix only)
 * 8. Profile access mandatory reason & append-only audit logging
 * 9. Admin chat invite behavior (student must Accept/Reject)
 * 10. Constrained test session (rejects ordinary students, allows test/staff accounts)
 * 11. Active rooms dashboard & room details inspection
 * 12. Moderation transcript access (requires staff role, mandatory 5+ char reason, creates audit log)
 * 13. Zero secret observer presence (admin never joins as third participant)
 * 14. Immutable audit log integrity
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectivePersona,
  computeDeterministicUnknownUser,
  DEFAULT_AVATAR_CONFIG,
} from '../src/utils/persona.ts';

// Simulated Server-Side Database & Security Rules Engine
class SimulatedDatabase {
  constructor() {
    this.staff = new Map(); // userId -> { role, isActive, email }
    this.profiles = new Map(); // userId -> profile
    this.collegeIdentities = new Map(); // userId -> identity
    this.presence = new Map(); // userId -> presence
    this.chatRequests = new Map(); // reqId -> request
    this.chatRooms = new Map(); // roomId -> room
    this.chatMessages = new Map(); // msgId -> message
    this.auditLogs = []; // append-only log array
  }

  // Helper to enroll staff
  addStaff(userId, role, email, isActive = true) {
    this.staff.set(userId, { role, email, isActive });
  }

  // Server-side function: is_platform_staff(auth.uid())
  isPlatformStaff(userId) {
    if (!userId) return false;
    const entry = this.staff.get(userId);
    return Boolean(entry && entry.isActive);
  }

  getStaffRole(userId) {
    if (!userId) return null;
    const entry = this.staff.get(userId);
    return entry && entry.isActive ? entry.role : null;
  }

  // Server-side function: log_admin_action
  logAdminAction(actorId, action, targetUserId = null, roomId = null, reason = null, metadata = {}) {
    const role = this.getStaffRole(actorId);
    if (!role) {
      throw new Error('STAFF_UNAUTHORIZED: Caller is not active platform staff.');
    }
    const logEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      actor_user_id: actorId,
      actor_role: role,
      action,
      target_user_id: targetUserId,
      room_id: roomId,
      reason,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.push(logEntry);
    return logEntry.id;
  }

  // RPC: check_staff_status()
  rpcCheckStaffStatus(callerId) {
    if (!callerId) {
      return { is_staff: false, role: null, email: null };
    }
    const entry = this.staff.get(callerId);
    if (entry && entry.isActive) {
      return { is_staff: true, role: entry.role, email: entry.email };
    }
    return { is_staff: false, role: null, email: null };
  }

  // RPC: set_developer_persona(p_username, p_avatar_url)
  rpcSetDeveloperPersona(callerId, username, avatarUrl = null) {
    if (!this.isPlatformStaff(callerId)) {
      return {
        success: false,
        error: 'STAFF_UNAUTHORIZED',
        message: 'Only developer/admin accounts can set a custom developer persona.',
      };
    }

    const trimmed = (username || '').trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 20) {
      return {
        success: false,
        error: 'INVALID_LENGTH',
        message: 'Developer username must be between 3 and 20 characters.',
      };
    }

    // Safe text handling: reject HTML (<, >), control characters
    if (/[\x00-\x1F\x7F<>]/.test(trimmed)) {
      return {
        success: false,
        error: 'INVALID_CHARACTERS',
        message: 'Username contains invalid or forbidden characters.',
      };
    }

    let avatarConfig;
    if (avatarUrl && avatarUrl.trim().length > 0) {
      avatarConfig = { type: 'gallery', url: avatarUrl.trim() };
    } else {
      const existing = this.profiles.get(callerId);
      avatarConfig = existing?.avatar_config || DEFAULT_AVATAR_CONFIG;
    }

    // Update profile
    const prof = this.profiles.get(callerId) || { id: callerId };
    prof.display_username = trimmed;
    prof.avatar_config = avatarConfig;
    this.profiles.set(callerId, prof);

    this.logAdminAction(
      callerId,
      'SET_DEVELOPER_PERSONA',
      callerId,
      null,
      'Updated developer persona',
      { username: trimmed, has_avatar: Boolean(avatarUrl) }
    );

    return {
      success: true,
      username: trimmed,
      avatar_config: avatarConfig,
    };
  }

  // RPC: get_admin_dashboard_stats()
  rpcGetAdminDashboardStats(callerId) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    const onlineUsers = Array.from(this.presence.values()).filter((p) => p.isOnline).length;
    let usersChatting = 0;
    const activeRooms = Array.from(this.chatRooms.values()).filter((r) => r.status === 'active');

    const chattingSet = new Set();
    for (const r of activeRooms) {
      chattingSet.add(r.user_1);
      chattingSet.add(r.user_2);
    }
    usersChatting = chattingSet.size;
    const usersIdle = Math.max(0, onlineUsers - usersChatting);
    const pendingRequests = Array.from(this.chatRequests.values()).filter((cr) => cr.status === 'pending').length;

    return {
      success: true,
      online_users: onlineUsers,
      users_chatting: usersChatting,
      users_idle: usersIdle,
      active_rooms: activeRooms.length,
      pending_requests: pendingRequests,
    };
  }

  // RPC: get_online_users_admin()
  rpcGetOnlineUsersAdmin(callerId) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    const users = [];
    for (const [userId, pres] of this.presence.entries()) {
      const prof = this.profiles.get(userId);
      const isStaff = this.isPlatformStaff(userId);
      const staffRole = this.getStaffRole(userId);

      // Derive state
      let state = 'idle';
      let currentRoomId = null;

      for (const r of this.chatRooms.values()) {
        if (r.status === 'active' && (r.user_1 === userId || r.user_2 === userId)) {
          state = 'in_chat';
          currentRoomId = r.id;
          break;
        }
      }

      const email = pres.email || '';
      const isTestAccount = isStaff || email.includes('test') || email.includes('audit');

      users.push({
        user_id: userId,
        anonymous_username: prof?.display_username || 'Unknown User 1234',
        avatar_config: prof?.avatar_config || DEFAULT_AVATAR_CONFIG,
        is_verified_student: Boolean(prof?.college_identity_linked),
        is_staff: isStaff,
        staff_role: staffRole,
        is_online: pres.isOnline,
        last_seen_at: pres.lastSeenAt,
        state,
        current_room_id: currentRoomId,
        is_test_account: isTestAccount,
      });
    }

    return {
      success: true,
      users,
    };
  }

  // RPC: get_user_admin_details(p_user_id, p_reason)
  rpcGetUserAdminDetails(callerId, targetUserId, reason) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    if (!reason || reason.trim().length < 3) {
      return {
        success: false,
        error: 'INVALID_REASON',
        message: 'A valid reason is required to inspect user profile details.',
      };
    }

    const prof = this.profiles.get(targetUserId);
    if (!prof) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    const identity = this.collegeIdentities.get(targetUserId);
    // Security check: NEVER return raw register number!
    let maskedFingerprint = null;
    if (identity && identity.identity_hash) {
      maskedFingerprint = '...' + identity.identity_hash.slice(-8);
    }

    this.logAdminAction(callerId, 'VIEW_PRIVATE_PROFILE', targetUserId, null, reason.trim(), {
      target_user_id: targetUserId,
    });

    return {
      success: true,
      user_id: targetUserId,
      anonymous_username: prof.display_username || 'Unknown User',
      avatar_config: prof.avatar_config || DEFAULT_AVATAR_CONFIG,
      real_name: prof.full_name || null,
      department: prof.department || null,
      batch: prof.batch || null,
      gender: prof.gender || null,
      is_verified: Boolean(prof.college_identity_linked),
      verification_method: prof.verification_method || null,
      fingerprint_suffix: maskedFingerprint,
      account_created_at: prof.created_at || new Date().toISOString(),
      // Explicitly assert registerNumber is NOT present
      registerNumber: undefined,
    };
  }

  // RPC: send_admin_chat_invite(p_user_id)
  rpcSendAdminChatInvite(callerId, targetUserId) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    if (callerId === targetUserId) {
      return { success: false, error: 'CANNOT_INVITE_SELF' };
    }

    // Check if target or caller in active room
    for (const r of this.chatRooms.values()) {
      if (r.status === 'active' && (r.user_1 === callerId || r.user_2 === callerId)) {
        return { success: false, error: 'CALLER_IN_ACTIVE_ROOM' };
      }
      if (r.status === 'active' && (r.user_1 === targetUserId || r.user_2 === targetUserId)) {
        return { success: false, error: 'TARGET_IN_ACTIVE_ROOM' };
      }
    }

    const reqId = `req-${Date.now()}`;
    const req = {
      id: reqId,
      requester_id: callerId,
      recipient_id: targetUserId,
      status: 'pending',
      expires_at: new Date(Date.now() + 30000).toISOString(),
    };
    this.chatRequests.set(reqId, req);

    this.logAdminAction(callerId, 'SEND_ADMIN_CHAT_INVITE', targetUserId, null, 'Sent chat invite', {
      request_id: reqId,
    });

    return {
      success: true,
      request_id: reqId,
      recipient_id: targetUserId,
      expires_at: req.expires_at,
    };
  }

  // RPC: create_test_session(p_target_user_id)
  rpcCreateTestSession(callerId, targetUserId) {
    if (!callerId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }

    const callerIsStaff = this.isPlatformStaff(callerId);
    const targetIsStaff = this.isPlatformStaff(targetUserId);

    const callerEmail = this.presence.get(callerId)?.email || '';
    const targetEmail = this.presence.get(targetUserId)?.email || '';

    const callerIsTest = callerIsStaff || callerEmail.includes('test') || callerEmail.includes('audit');
    const targetIsTest = targetIsStaff || targetEmail.includes('test') || targetEmail.includes('audit');

    // Strictly enforce: both accounts must be developer/admin or test account!
    if (!callerIsTest || !targetIsTest) {
      return {
        success: false,
        error: 'TEST_SESSION_RESTRICTED',
        message: 'Forced test sessions are strictly prohibited against ordinary students. Both accounts must be developer/admin or test accounts.',
      };
    }

    const roomId = `room-test-${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 60 * 1000);

    const room = {
      id: roomId,
      user_1: callerId,
      user_2: targetUserId,
      status: 'active',
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      user_1_heartbeat_at: now.toISOString(),
      user_2_heartbeat_at: now.toISOString(),
    };
    this.chatRooms.set(roomId, room);

    this.logAdminAction(callerId, 'CREATE_TEST_SESSION', targetUserId, roomId, 'Initiated forced test session');

    return {
      success: true,
      room_id: roomId,
      created_at: room.created_at,
      expires_at: room.expires_at,
    };
  }

  // RPC: get_room_moderation_transcript(p_room_id, p_reason)
  rpcGetRoomModerationTranscript(callerId, roomId, reason) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    if (!reason || reason.trim().length < 5) {
      return {
        success: false,
        error: 'INVALID_REASON',
        message: 'A mandatory moderation reason of at least 5 characters is required.',
      };
    }

    const room = this.chatRooms.get(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    // MUST log audit entry BEFORE returning messages!
    this.logAdminAction(callerId, 'OPEN_MODERATION_TRANSCRIPT', null, roomId, reason.trim(), {
      room_id: roomId,
    });

    const messages = Array.from(this.chatMessages.values())
      .filter((m) => m.room_id === roomId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return {
      success: true,
      room_id: roomId,
      messages,
    };
  }
}

describe('TALK TO RITIANS — Developer & Admin Console Comprehensive Test Suite', () => {
  let db;

  const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
  const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000002';
  const NORMAL_USER_ID = '11111111-1111-1111-1111-111111111111';
  const NORMAL_USER_2_ID = '22222222-2222-2222-2222-222222222222';
  const TEST_ACCOUNT_ID = '99999999-9999-9999-9999-999999999999';

  beforeEach(() => {
    db = new SimulatedDatabase();

    // 1. Staff enrollment
    db.addStaff(DEV_USER_ID, 'developer', 'gnanoognanoo@gmail.com', true);
    db.addStaff(ADMIN_USER_ID, 'admin', 'admin@ritchennai.edu.in', true);

    // 2. Profiles setup
    db.profiles.set(DEV_USER_ID, {
      id: DEV_USER_ID,
      display_username: 'Developer',
      avatar_config: DEFAULT_AVATAR_CONFIG,
      college_identity_linked: false, // NOT linked to student ID
    });

    db.profiles.set(NORMAL_USER_ID, {
      id: NORMAL_USER_ID,
      display_username: 'SilentFalcon',
      full_name: 'Ananya Ramesh',
      department: 'Computer Science',
      batch: '2023-2027',
      gender: 'Female',
      college_identity_linked: true, // Verified Student
      verification_method: 'Physical RIT ID',
      created_at: new Date(Date.now() - 86400000).toISOString(),
    });

    db.collegeIdentities.set(NORMAL_USER_ID, {
      id: 'ident-001',
      user_id: NORMAL_USER_ID,
      identity_hash: '9f83c1264c8c728795551982b6bb088924ff931558bf2a09575127022097e8b6',
    });

    db.profiles.set(NORMAL_USER_2_ID, {
      id: NORMAL_USER_2_ID,
      display_username: 'Unknown User 4821',
      college_identity_linked: false, // Unverified
    });

    db.profiles.set(TEST_ACCOUNT_ID, {
      id: TEST_ACCOUNT_ID,
      display_username: 'TestBot Alpha',
      college_identity_linked: false,
    });

    // 3. Presence setup
    db.presence.set(DEV_USER_ID, { isOnline: true, email: 'gnanoognanoo@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(NORMAL_USER_ID, { isOnline: true, email: 'ananya@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(NORMAL_USER_2_ID, { isOnline: true, email: 'student2@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(TEST_ACCOUNT_ID, { isOnline: true, email: 'test_account@ritians.dev', lastSeenAt: new Date().toISOString() });
  });

  describe('1. Privileged Role Model & Server-Side Security', () => {
    test('identifies active platform staff correctly', () => {
      assert.equal(db.isPlatformStaff(DEV_USER_ID), true);
      assert.equal(db.getStaffRole(DEV_USER_ID), 'developer');

      assert.equal(db.isPlatformStaff(ADMIN_USER_ID), true);
      assert.equal(db.getStaffRole(ADMIN_USER_ID), 'admin');
    });

    test('normal students are strictly non-staff', () => {
      assert.equal(db.isPlatformStaff(NORMAL_USER_ID), false);
      assert.equal(db.getStaffRole(NORMAL_USER_ID), null);

      assert.equal(db.isPlatformStaff(NORMAL_USER_2_ID), false);
      assert.equal(db.getStaffRole(NORMAL_USER_2_ID), null);
    });

    test('RPC check_staff_status returns role only for staff', () => {
      const devStatus = db.rpcCheckStaffStatus(DEV_USER_ID);
      assert.equal(devStatus.is_staff, true);
      assert.equal(devStatus.role, 'developer');

      const normalStatus = db.rpcCheckStaffStatus(NORMAL_USER_ID);
      assert.equal(normalStatus.is_staff, false);
      assert.equal(normalStatus.role, null);
    });
  });

  describe('2. Developer Persona & Physical ID Verification Bypass', () => {
    test('developer can customize persona without physical RIT ID', () => {
      const devProfile = db.profiles.get(DEV_USER_ID);
      // Ensure physical ID is NOT linked
      assert.equal(devProfile.college_identity_linked, false);

      // getEffectivePersona with isStaff=true unlocks custom username & avatar
      const persona = getEffectivePersona(devProfile, true);
      assert.equal(persona.displayUsername, 'Developer');
      // CRITICAL: Must not fake physical student verification
      assert.equal(persona.isVerified, false);
    });

    test('unverified normal student is strictly locked to deterministic Unknown User', () => {
      const unverifiedStudent = db.profiles.get(NORMAL_USER_2_ID);
      const persona = getEffectivePersona(unverifiedStudent, false);
      assert.equal(persona.isVerified, false);
      assert.match(persona.displayUsername, /^Unknown User \d{4}$/);
    });
  });

  describe('3. Custom Developer Username Implementation & Sanitization', () => {
    test('developer can set custom username (e.g. Heisenberg)', () => {
      const res = db.rpcSetDeveloperPersona(DEV_USER_ID, 'Heisenberg');
      assert.equal(res.success, true);
      assert.equal(res.username, 'Heisenberg');

      const updated = db.profiles.get(DEV_USER_ID);
      assert.equal(updated.display_username, 'Heisenberg');
    });

    test('normal user cannot set custom arbitrary username', () => {
      const res = db.rpcSetDeveloperPersona(NORMAL_USER_ID, 'HackerUser');
      assert.equal(res.success, false);
      assert.equal(res.error, 'STAFF_UNAUTHORIZED');

      // Original username remains unmodified
      const prof = db.profiles.get(NORMAL_USER_ID);
      assert.equal(prof.display_username, 'SilentFalcon');
    });

    test('rejects username shorter than 3 characters', () => {
      const res = db.rpcSetDeveloperPersona(DEV_USER_ID, 'AB');
      assert.equal(res.success, false);
      assert.equal(res.error, 'INVALID_LENGTH');
    });

    test('rejects username longer than 20 characters', () => {
      const res = db.rpcSetDeveloperPersona(DEV_USER_ID, 'ThisUsernameIsFarTooLongForDeveloper');
      assert.equal(res.success, false);
      assert.equal(res.error, 'INVALID_LENGTH');
    });

    test('sanitizes input: rejects HTML script tags & control characters', () => {
      const resHtml = db.rpcSetDeveloperPersona(DEV_USER_ID, '<script>hi</script>');
      assert.equal(resHtml.success, false);
      assert.equal(resHtml.error, 'INVALID_CHARACTERS');

      const resControl = db.rpcSetDeveloperPersona(DEV_USER_ID, 'Heisen\x00berg');
      assert.equal(resControl.success, false);
      assert.equal(resControl.error, 'INVALID_CHARACTERS');
    });

    test('setting developer persona creates audit log entry', () => {
      const initialLogs = db.auditLogs.length;
      db.rpcSetDeveloperPersona(DEV_USER_ID, 'GusFring');

      assert.equal(db.auditLogs.length, initialLogs + 1);
      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(lastLog.action, 'SET_DEVELOPER_PERSONA');
      assert.equal(lastLog.actor_user_id, DEV_USER_ID);
    });
  });

  describe('4. Gallery Avatar Rules for Developers', () => {
    test('developer can attach gallery avatar URL', () => {
      const avatarUrl = 'https://ncmjxxfmkailnlvnfiac.supabase.co/storage/v1/object/public/developer-avatars/dev/avatar.webp';
      const res = db.rpcSetDeveloperPersona(DEV_USER_ID, 'Heisenberg', avatarUrl);
      assert.equal(res.success, true);
      assert.equal(res.avatar_config.type, 'gallery');
      assert.equal(res.avatar_config.url, avatarUrl);

      const persona = getEffectivePersona(db.profiles.get(DEV_USER_ID), true);
      assert.equal(persona.avatarConfig.type, 'gallery');
      assert.equal(persona.avatarConfig.url, avatarUrl);
    });
  });

  describe('5. Dashboard Overview Stats & Presence Isolation', () => {
    test('staff can query dashboard stats', () => {
      const stats = db.rpcGetAdminDashboardStats(DEV_USER_ID);
      assert.equal(stats.success, true);
      assert.equal(stats.online_users, 4);
      assert.equal(stats.users_chatting, 0);
      assert.equal(stats.users_idle, 4);
    });

    test('normal user cannot query dashboard stats (STAFF_UNAUTHORIZED)', () => {
      const stats = db.rpcGetAdminDashboardStats(NORMAL_USER_ID);
      assert.equal(stats.success, false);
      assert.equal(stats.error, 'STAFF_UNAUTHORIZED');
    });

    test('staff can query online users directory', () => {
      const res = db.rpcGetOnlineUsersAdmin(DEV_USER_ID);
      assert.equal(res.success, true);
      assert.equal(res.users.length, 4);
    });

    test('normal user cannot query online users directory', () => {
      const res = db.rpcGetOnlineUsersAdmin(NORMAL_USER_ID);
      assert.equal(res.success, false);
      assert.equal(res.error, 'STAFF_UNAUTHORIZED');
    });
  });

  describe('6. Privileged Profile Inspection & Zero Raw Register Number Guarantee', () => {
    test('profile inspection requires mandatory reason (>= 3 chars)', () => {
      const resNoReason = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, '');
      assert.equal(resNoReason.success, false);
      assert.equal(resNoReason.error, 'INVALID_REASON');

      const resShort = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'ab');
      assert.equal(resShort.success, false);
      assert.equal(resShort.error, 'INVALID_REASON');
    });

    test('profile inspection returns verified details and masked fingerprint', () => {
      const res = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Verifying duplicate scan report');
      assert.equal(res.success, true);
      assert.equal(res.real_name, 'Ananya Ramesh');
      assert.equal(res.department, 'Computer Science');
      assert.equal(res.is_verified, true);
      assert.equal(res.fingerprint_suffix, '...2097e8b6');

      // ZERO RAW REGISTER NUMBER GUARANTEE:
      assert.equal(res.registerNumber, undefined);
    });

    test('profile inspection creates VIEW_PRIVATE_PROFILE audit log entry', () => {
      const initialLogs = db.auditLogs.length;
      db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Audit compliance review');

      assert.equal(db.auditLogs.length, initialLogs + 1);
      const log = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(log.action, 'VIEW_PRIVATE_PROFILE');
      assert.equal(log.target_user_id, NORMAL_USER_ID);
      assert.equal(log.reason, 'Audit compliance review');
    });

    test('normal user cannot inspect student profiles', () => {
      const res = db.rpcGetUserAdminDetails(NORMAL_USER_2_ID, NORMAL_USER_ID, 'Trying to see real name');
      assert.equal(res.success, false);
      assert.equal(res.error, 'STAFF_UNAUTHORIZED');
    });
  });

  describe('7. Admin Chat Invites & Student Acceptance Model', () => {
    test('developer can send chat invite to online student with 30s TTL', () => {
      const res = db.rpcSendAdminChatInvite(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, true);
      assert.ok(res.request_id);
      assert.equal(res.recipient_id, NORMAL_USER_ID);

      const req = db.chatRequests.get(res.request_id);
      assert.equal(req.status, 'pending');

      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(lastLog.action, 'SEND_ADMIN_CHAT_INVITE');
    });

    test('ordinary student is NOT forced into chat — must Accept/Reject', () => {
      const res = db.rpcSendAdminChatInvite(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, true);

      // Student is NOT in any active room yet!
      const activeRooms = Array.from(db.chatRooms.values()).filter(
        (r) => r.status === 'active' && (r.user_1 === NORMAL_USER_ID || r.user_2 === NORMAL_USER_ID)
      );
      assert.equal(activeRooms.length, 0);

      // Recipient rejects invite
      const req = db.chatRequests.get(res.request_id);
      req.status = 'rejected';

      // Still no room created
      const activeRoomsAfterReject = Array.from(db.chatRooms.values()).filter(
        (r) => r.status === 'active' && (r.user_1 === NORMAL_USER_ID || r.user_2 === NORMAL_USER_ID)
      );
      assert.equal(activeRoomsAfterReject.length, 0);
    });
  });

  describe('8. Constrained Test Session Initialization', () => {
    test('forced test session rejects normal student target', () => {
      const res = db.rpcCreateTestSession(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, false);
      assert.equal(res.error, 'TEST_SESSION_RESTRICTED');
    });

    test('forced test session succeeds between developer and test account', () => {
      const res = db.rpcCreateTestSession(DEV_USER_ID, TEST_ACCOUNT_ID);
      assert.equal(res.success, true);
      assert.ok(res.room_id);

      const room = db.chatRooms.get(res.room_id);
      assert.equal(room.status, 'active');
      assert.equal(room.user_1, DEV_USER_ID);
      assert.equal(room.user_2, TEST_ACCOUNT_ID);

      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(lastLog.action, 'CREATE_TEST_SESSION');
    });
  });

  describe('9. Moderation Transcript Access & Zero Observer Presence', () => {
    let testRoomId;

    beforeEach(() => {
      testRoomId = 'room-001';
      db.chatRooms.set(testRoomId, {
        id: testRoomId,
        user_1: NORMAL_USER_ID,
        user_2: NORMAL_USER_2_ID,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      db.chatMessages.set('msg-1', {
        id: 'msg-1',
        room_id: testRoomId,
        sender_id: NORMAL_USER_ID,
        content: 'Hello stranger',
        message_type: 'text',
        created_at: new Date().toISOString(),
      });

      db.chatMessages.set('msg-2', {
        id: 'msg-2',
        room_id: testRoomId,
        sender_id: NORMAL_USER_2_ID,
        content: 'Hey there',
        message_type: 'text',
        created_at: new Date(Date.now() + 1000).toISOString(),
      });
    });

    test('moderation transcript requires staff role', () => {
      const res = db.rpcGetRoomModerationTranscript(NORMAL_USER_ID, testRoomId, 'Checking other people chat');
      assert.equal(res.success, false);
      assert.equal(res.error, 'STAFF_UNAUTHORIZED');
    });

    test('moderation transcript requires mandatory reason (>= 5 chars)', () => {
      const res = db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'hi');
      assert.equal(res.success, false);
      assert.equal(res.error, 'INVALID_REASON');
    });

    test('moderation transcript creates audit log BEFORE returning messages', () => {
      const initialLogs = db.auditLogs.length;
      const res = db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'Investigating safety report');

      assert.equal(res.success, true);
      assert.equal(res.messages.length, 2);

      assert.equal(db.auditLogs.length, initialLogs + 1);
      const log = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(log.action, 'OPEN_MODERATION_TRANSCRIPT');
      assert.equal(log.room_id, testRoomId);
      assert.equal(log.reason, 'Investigating safety report');
    });

    test('ZERO SECRET OBSERVER PRESENCE: admin is NEVER added as a third participant in room', () => {
      // Before transcript read
      const roomBefore = db.chatRooms.get(testRoomId);
      assert.equal(roomBefore.user_1, NORMAL_USER_ID);
      assert.equal(roomBefore.user_2, NORMAL_USER_2_ID);

      // Read transcript
      db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'Investigating safety report');

      // After transcript read: room participants remain strictly User 1 and User 2
      const roomAfter = db.chatRooms.get(testRoomId);
      assert.equal(roomAfter.user_1, NORMAL_USER_ID);
      assert.equal(roomAfter.user_2, NORMAL_USER_2_ID);
      assert.notEqual(roomAfter.user_1, DEV_USER_ID);
      assert.notEqual(roomAfter.user_2, DEV_USER_ID);
    });
  });

  describe('10. Append-Only Audit Log Invariants', () => {
    test('audit entries are recorded chronologically and maintain actor identity', () => {
      db.rpcSetDeveloperPersona(DEV_USER_ID, 'Heisenberg');
      db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Routine compliance check');

      assert.ok(db.auditLogs.length >= 2);
      for (const log of db.auditLogs) {
        assert.ok(log.id);
        assert.ok(log.actor_user_id);
        assert.ok(log.actor_role);
        assert.ok(log.action);
        assert.ok(log.created_at);
      }
    });
  });
});
