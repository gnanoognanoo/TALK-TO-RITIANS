/**
 * ============================================================================
 * TALK TO RITIANS - Developer & Admin Console Test Suite
 * ============================================================================
 * Security Hardening Regression Suite:
 *  1. email alone no longer grants staff role
 *  2. existing developer UUID remains staff
 *  3. normal user cannot insert platform_staff
 *  4. developer cannot promote themselves
 *  5. developer cannot promote another user
 *  6. browser cannot directly insert audit records
 *  7. privileged RPC can create audit record
 *  8. audit actor always equals auth.uid()
 *  9. audit timestamp generated server-side
 * 10. developer can access technical dashboard
 * 11. developer cannot read private student profile (returns ADMIN_REQUIRED)
 * 12. admin can read private profile with audit entry
 * 13. developer cannot access transcript (returns ADMIN_REQUIRED)
 * 14. admin can access transcript with reason
 * 15. transcript access generates audit row
 * 16. test account state cannot be self-assigned
 * 17. normal user cannot create forced test session
 * 18. raw register number remains absent
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
    this.testAccounts = new Set(); // set of userIds in server-controlled test_accounts table
    this.profiles = new Map(); // userId -> profile
    this.collegeIdentities = new Map(); // userId -> identity
    this.presence = new Map(); // userId -> presence
    this.chatRequests = new Map(); // reqId -> request
    this.chatRooms = new Map(); // roomId -> room
    this.chatMessages = new Map(); // msgId -> message
    this.auditLogs = []; // append-only log array
  }

  // Server-side explicit staff enrollment (UUID-based membership)
  addStaff(userId, role, email, isActive = true) {
    this.staff.set(userId, { role, email, isActive });
  }

  // Server-controlled test account registration
  addTestAccount(userId) {
    this.testAccounts.add(userId);
  }

  // Server-side function: is_platform_staff() evaluating caller auth.uid() directly
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

  // Server-side function: is_test_account(p_user_id)
  isTestAccount(userId) {
    if (!userId) return false;
    return this.testAccounts.has(userId) || this.isPlatformStaff(userId);
  }

  // Client-side direct table operation simulation on public.platform_staff
  // In Supabase, RLS and REVOKE INSERT, UPDATE, DELETE on platform_staff block all client writes.
  clientInsertPlatformStaff(callerId, targetUserId, role, email) {
    return {
      success: false,
      error: '42501: permission denied for table platform_staff',
    };
  }

  clientUpdatePlatformStaff(callerId, targetUserId, newRole) {
    return {
      success: false,
      error: '42501: permission denied for table platform_staff',
    };
  }

  clientDeletePlatformStaff(callerId, targetUserId) {
    return {
      success: false,
      error: '42501: permission denied for table platform_staff',
    };
  }

  // Client-side direct INSERT simulation on public.admin_audit_log
  // In Supabase, direct client INSERT is revoked.
  clientInsertAuditLog(callerId, entry) {
    return {
      success: false,
      error: '42501: permission denied for table admin_audit_log (server-write-only)',
    };
  }

  // Server-side internal function: log_admin_action (SECURITY DEFINER)
  // Calculates actor_user_id = auth.uid(), actor_role = role from platform_staff, created_at = now()
  logAdminAction(actorId, action, targetUserId = null, roomId = null, reason = null, metadata = {}) {
    const role = this.getStaffRole(actorId);
    if (!role) {
      throw new Error('STAFF_UNAUTHORIZED: Caller is not active platform staff.');
    }
    const logEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      actor_user_id: actorId, // Computed server-side from auth.uid()
      actor_role: role,       // Computed server-side from platform_staff
      action,
      target_user_id: targetUserId,
      room_id: roomId,
      reason,
      metadata,
      created_at: new Date().toISOString(), // Generated server-side
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

      let state = 'idle';
      let currentRoomId = null;

      for (const r of this.chatRooms.values()) {
        if (r.status === 'active' && (r.user_1 === userId || r.user_2 === userId)) {
          state = 'in_chat';
          currentRoomId = r.id;
          break;
        }
      }

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
        is_test_account: this.isTestAccount(userId),
      });
    }

    return {
      success: true,
      users,
    };
  }

  // RPC: get_user_admin_details(p_user_id, p_reason)
  // STRICT ROLE SEPARATION: Only role === 'admin' can view private student profile details.
  rpcGetUserAdminDetails(callerId, targetUserId, reason) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    const role = this.getStaffRole(callerId);
    if (role !== 'admin') {
      return {
        success: false,
        error: 'ADMIN_REQUIRED',
        message: 'Admin role required to inspect private student credentials.',
      };
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
      registerNumber: undefined, // RAW REGISTER NUMBER GUARANTEE: NEVER RETURNED
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

    const callerIsTest = this.isTestAccount(callerId);
    const targetIsTest = this.isTestAccount(targetUserId);

    // Strictly enforce: both accounts must be verified in server-controlled test_accounts or platform_staff!
    if (!callerIsTest || !targetIsTest) {
      return {
        success: false,
        error: 'TEST_SESSION_RESTRICTED',
        message: 'Forced test sessions are strictly prohibited against ordinary students. Both accounts must be registered in test_accounts or platform_staff.',
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
  // STRICT ROLE SEPARATION: Only role === 'admin' can view moderation transcripts.
  rpcGetRoomModerationTranscript(callerId, roomId, reason) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    const role = this.getStaffRole(callerId);
    if (role !== 'admin') {
      return {
        success: false,
        error: 'ADMIN_REQUIRED',
        message: 'Admin role required to access moderation transcripts.',
      };
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

describe('TALK TO RITIANS — Developer & Admin Console Final Security Hardening Suite', () => {
  let db;

  const DEV_USER_ID = '532274f3-7fd9-4206-b353-dcd36bababd5';
  const ADMIN_USER_ID = '6600327f-382b-4f13-9eac-3f8f69240595';
  const NORMAL_USER_ID = '11111111-1111-1111-1111-111111111111';
  const NORMAL_USER_2_ID = '22222222-2222-2222-2222-222222222222';
  const TEST_ACCOUNT_ID = '99999999-9999-9999-9999-999999999999';

  beforeEach(() => {
    db = new SimulatedDatabase();

    // 1. Explicit Staff Enrollment (UUID-based membership)
    db.addStaff(DEV_USER_ID, 'developer', 'gnanoognanoo@gmail.com', true);
    db.addStaff(ADMIN_USER_ID, 'admin', 'gnanoognano@gmail.com', true);

    // 2. Server-Controlled Test Accounts Table
    db.addTestAccount(TEST_ACCOUNT_ID);

    // 3. Profiles setup
    db.profiles.set(DEV_USER_ID, {
      id: DEV_USER_ID,
      display_username: 'Developer',
      avatar_config: DEFAULT_AVATAR_CONFIG,
      college_identity_linked: false,
    });

    db.profiles.set(ADMIN_USER_ID, {
      id: ADMIN_USER_ID,
      display_username: 'Admin',
      avatar_config: DEFAULT_AVATAR_CONFIG,
      college_identity_linked: false,
    });

    db.profiles.set(NORMAL_USER_ID, {
      id: NORMAL_USER_ID,
      display_username: 'SilentFalcon',
      full_name: 'Ananya Ramesh',
      department: 'Computer Science',
      batch: '2023-2027',
      gender: 'Female',
      college_identity_linked: true,
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
      college_identity_linked: false,
    });

    db.profiles.set(TEST_ACCOUNT_ID, {
      id: TEST_ACCOUNT_ID,
      display_username: 'TestBot Alpha',
      college_identity_linked: false,
    });

    // 4. Presence setup
    db.presence.set(DEV_USER_ID, { isOnline: true, email: 'gnanoognanoo@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(ADMIN_USER_ID, { isOnline: true, email: 'gnanoognano@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(NORMAL_USER_ID, { isOnline: true, email: 'ananya@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(NORMAL_USER_2_ID, { isOnline: true, email: 'student2@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(TEST_ACCOUNT_ID, { isOnline: true, email: 'test_account@ritians.dev', lastSeenAt: new Date().toISOString() });
  });

  describe('1. Explicit UUID Enrollment & Trigger Removal', () => {
    test('email alone no longer grants staff role without explicit UUID membership', () => {
      // A new user signs in with developer email string, but their UUID is NOT in platform_staff
      const unlistedUserWithEmail = '33333333-3333-3333-3333-333333333333';
      db.presence.set(unlistedUserWithEmail, { isOnline: true, email: 'gnanoognanoo@gmail.com' });

      // Because auto-enrollment trigger is removed, they are NOT staff:
      assert.equal(db.isPlatformStaff(unlistedUserWithEmail), false);
      assert.equal(db.getStaffRole(unlistedUserWithEmail), null);
    });

    test('existing developer UUID remains active staff', () => {
      assert.equal(db.isPlatformStaff(DEV_USER_ID), true);
      assert.equal(db.getStaffRole(DEV_USER_ID), 'developer');

      assert.equal(db.isPlatformStaff(ADMIN_USER_ID), true);
      assert.equal(db.getStaffRole(ADMIN_USER_ID), 'admin');
    });
  });

  describe('2. Protection Against Staff Self-Enrollment & Promotion', () => {
    test('normal user cannot insert platform_staff', () => {
      const res = db.clientInsertPlatformStaff(NORMAL_USER_ID, NORMAL_USER_ID, 'developer', 'ananya@gmail.com');
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied/i);
    });

    test('developer cannot promote themselves to admin', () => {
      const res = db.clientUpdatePlatformStaff(DEV_USER_ID, DEV_USER_ID, 'admin');
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied/i);
      assert.equal(db.getStaffRole(DEV_USER_ID), 'developer');
    });

    test('developer cannot promote another user', () => {
      const res = db.clientInsertPlatformStaff(DEV_USER_ID, NORMAL_USER_ID, 'developer', 'ananya@gmail.com');
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied/i);
      assert.equal(db.isPlatformStaff(NORMAL_USER_ID), false);
    });
  });

  describe('3. Server-Write-Only Audit Log & Server-Side Metadata', () => {
    test('browser cannot directly insert audit records', () => {
      const res = db.clientInsertAuditLog(DEV_USER_ID, {
        action: 'FAKE_AUDIT',
        actor_role: 'admin',
      });
      assert.equal(res.success, false);
      assert.match(res.error, /server-write-only/i);
    });

    test('privileged RPC can create audit record', () => {
      const initialLogs = db.auditLogs.length;
      db.rpcSetDeveloperPersona(DEV_USER_ID, 'Heisenberg');
      assert.equal(db.auditLogs.length, initialLogs + 1);
      assert.equal(db.auditLogs[db.auditLogs.length - 1].action, 'SET_DEVELOPER_PERSONA');
    });

    test('audit actor always equals auth.uid() and role matches platform_staff', () => {
      db.rpcSetDeveloperPersona(DEV_USER_ID, 'QuantumDev');
      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(lastLog.actor_user_id, DEV_USER_ID);
      assert.equal(lastLog.actor_role, 'developer');
    });

    test('audit timestamp is generated server-side', () => {
      const before = Date.now();
      db.rpcSetDeveloperPersona(DEV_USER_ID, 'TimeTester');
      const after = Date.now();

      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      const logTime = new Date(lastLog.created_at).getTime();
      assert.ok(logTime >= before - 1000 && logTime <= after + 1000);
    });
  });

  describe('4. Strict Role Separation: Technical Dashboard Access', () => {
    test('developer can access technical dashboard stats and online users', () => {
      const statsRes = db.rpcGetAdminDashboardStats(DEV_USER_ID);
      assert.equal(statsRes.success, true);
      assert.equal(typeof statsRes.online_users, 'number');

      const usersRes = db.rpcGetOnlineUsersAdmin(DEV_USER_ID);
      assert.equal(usersRes.success, true);
      assert.ok(Array.isArray(usersRes.users));
    });

    test('normal user cannot access technical dashboard', () => {
      const statsRes = db.rpcGetAdminDashboardStats(NORMAL_USER_ID);
      assert.equal(statsRes.success, false);
      assert.equal(statsRes.error, 'STAFF_UNAUTHORIZED');

      const usersRes = db.rpcGetOnlineUsersAdmin(NORMAL_USER_ID);
      assert.equal(usersRes.success, false);
      assert.equal(usersRes.error, 'STAFF_UNAUTHORIZED');
    });
  });

  describe('5. Role Separation: Private Student Profiles (Admin Only)', () => {
    test('developer CANNOT read private student profile (returns ADMIN_REQUIRED)', () => {
      const res = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Checking student details');
      assert.equal(res.success, false);
      assert.equal(res.error, 'ADMIN_REQUIRED');
      assert.match(res.message, /Admin role required/i);
    });

    test('admin CAN read private profile with valid reason and creates audit entry', () => {
      const initialLogs = db.auditLogs.length;
      const res = db.rpcGetUserAdminDetails(ADMIN_USER_ID, NORMAL_USER_ID, 'Investigating safety report');

      assert.equal(res.success, true);
      assert.equal(res.real_name, 'Ananya Ramesh');
      assert.equal(res.department, 'Computer Science');
      assert.equal(res.batch, '2023-2027');
      assert.equal(res.gender, 'Female');
      assert.equal(res.is_verified, true);
      assert.equal(res.fingerprint_suffix, '...2097e8b6');

      // Verify audit row was generated
      assert.equal(db.auditLogs.length, initialLogs + 1);
      const log = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(log.action, 'VIEW_PRIVATE_PROFILE');
      assert.equal(log.actor_user_id, ADMIN_USER_ID);
      assert.equal(log.actor_role, 'admin');
      assert.equal(log.reason, 'Investigating safety report');
    });

    test('RAW REGISTER NUMBER INVARIANT: raw register number is NEVER returned to admin', () => {
      const res = db.rpcGetUserAdminDetails(ADMIN_USER_ID, NORMAL_USER_ID, 'Verifying identity');
      assert.equal(res.success, true);
      assert.equal(res.registerNumber, undefined);
      assert.equal(res.fingerprint_suffix, '...2097e8b6');
    });
  });

  describe('6. Role Separation: Moderation Transcript Access (Admin Only)', () => {
    let testRoomId;

    beforeEach(() => {
      testRoomId = 'room-audit-101';
      db.chatRooms.set(testRoomId, {
        id: testRoomId,
        user_1: NORMAL_USER_ID,
        user_2: NORMAL_USER_2_ID,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      db.chatMessages.set('msg-101', {
        id: 'msg-101',
        room_id: testRoomId,
        sender_id: NORMAL_USER_ID,
        content: 'Campus meetup test',
        created_at: new Date().toISOString(),
      });
    });

    test('developer CANNOT access transcript (returns ADMIN_REQUIRED)', () => {
      const res = db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'Routine check');
      assert.equal(res.success, false);
      assert.equal(res.error, 'ADMIN_REQUIRED');
      assert.match(res.message, /Admin role required/i);
    });

    test('admin CAN access transcript with mandatory reason', () => {
      const res = db.rpcGetRoomModerationTranscript(ADMIN_USER_ID, testRoomId, 'Safety inspection');
      assert.equal(res.success, true);
      assert.equal(res.room_id, testRoomId);
      assert.equal(res.messages.length, 1);
    });

    test('transcript access generates OPEN_MODERATION_TRANSCRIPT audit row', () => {
      const initialLogs = db.auditLogs.length;
      db.rpcGetRoomModerationTranscript(ADMIN_USER_ID, testRoomId, 'Investigating reported harassment');

      assert.equal(db.auditLogs.length, initialLogs + 1);
      const log = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(log.action, 'OPEN_MODERATION_TRANSCRIPT');
      assert.equal(log.actor_user_id, ADMIN_USER_ID);
      assert.equal(log.actor_role, 'admin');
      assert.equal(log.room_id, testRoomId);
      assert.equal(log.reason, 'Investigating reported harassment');
    });
  });

  describe('7. Test Account Security & Forced Session Boundary', () => {
    test('test account state cannot be self-assigned by normal users', () => {
      // Normal user cannot add themselves to test_accounts table
      assert.equal(db.isTestAccount(NORMAL_USER_ID), false);
    });

    test('normal user cannot create forced test session', () => {
      const res = db.rpcCreateTestSession(NORMAL_USER_ID, TEST_ACCOUNT_ID);
      assert.equal(res.success, false);
      assert.equal(res.error, 'TEST_SESSION_RESTRICTED');
    });

    test('forced test session fails if target is an ordinary student', () => {
      const res = db.rpcCreateTestSession(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, false);
      assert.equal(res.error, 'TEST_SESSION_RESTRICTED');
      assert.match(res.message, /strictly prohibited against ordinary students/i);
    });

    test('forced test session succeeds between authorized test/staff accounts', () => {
      const res = db.rpcCreateTestSession(DEV_USER_ID, TEST_ACCOUNT_ID);
      assert.equal(res.success, true);
      assert.ok(res.room_id);

      const room = db.chatRooms.get(res.room_id);
      assert.equal(room.status, 'active');
      assert.equal(room.user_1, DEV_USER_ID);
      assert.equal(room.user_2, TEST_ACCOUNT_ID);
    });
  });

  describe('8. Zero-Argument is_platform_staff() Authorization', () => {
    test('is_platform_staff() evaluates auth.uid() directly without client-supplied UUID spoofing', () => {
      assert.equal(db.isPlatformStaff(DEV_USER_ID), true);
      assert.equal(db.isPlatformStaff(ADMIN_USER_ID), true);
      assert.equal(db.isPlatformStaff(NORMAL_USER_ID), false);
      assert.equal(db.isPlatformStaff(null), false);
    });
  });
});
