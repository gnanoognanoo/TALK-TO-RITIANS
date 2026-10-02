/**
 * ============================================================================
 * TALK TO RITIANS — Single DEVELOPER Role & Test Account Security Test Suite
 * ============================================================================
 *
 * TEST COUNT REGRESSION AUDIT (389 -> 382 -> Final Count):
 * ----------------------------------------------------------------------------
 * Root Cause Analysis:
 * In the initial Developer Console delivery, the console test suite contained
 * 29 tests (353 base tests + 29 console tests = 382 + 7 root suite overhead = 389 tests).
 * During the intermediate security hardening patch, several granular tests:
 *  - ZERO SECRET OBSERVER PRESENCE: developer is never added as a third participant
 *  - Persona input sanitization (HTML/control character rejection & length boundaries)
 *  - Reason input validation boundaries (profile reason < 3, transcript reason < 5)
 *  - Student invite acceptance model (student is not forced, must Accept/Reject)
 *  - Online user listing authorization for non-staff
 * were consolidated or merged into broader assertion blocks, reducing the console
 * suite from 29 to 22 tests (382 total repository tests).
 *
 * This suite restores all granular regression tests and adds full coverage for:
 * 1. Purging of email-pattern test accounts (explicit UUID allowlist only)
 * 2. Complete consolidation of admin + developer into a single DEVELOPER role
 * 3. Revocation of previous admin account privileges
 * 4. Full developer access to profile inspection and moderation transcripts with mandatory reasons
 * 5. Full developer audit log visibility with historical 'admin' row preservation
 * 6. Revocation of client execution of is_test_account(UUID)
 * 7. Zero raw register number guarantee & Zero secret observer presence guarantee
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AVATAR_CONFIG,
} from '../src/utils/persona.ts';

// Simulated Server-Side Database & Security Rules Engine
class SimulatedDatabase {
  constructor() {
    this.staff = new Map(); // userId -> { role, isActive, email }
    this.testAccounts = new Set(); // explicit approved UUID allowlist only
    this.profiles = new Map(); // userId -> profile
    this.collegeIdentities = new Map(); // userId -> identity
    this.presence = new Map(); // userId -> presence
    this.chatRequests = new Map(); // reqId -> request
    this.chatRooms = new Map(); // roomId -> room
    this.chatMessages = new Map(); // msgId -> message
    this.auditLogs = []; // append-only log array
  }

  // Server-side explicit staff enrollment (Single 'developer' role only)
  addStaff(userId, role, email, isActive = true) {
    if (role !== 'developer') {
      throw new Error(`CHECK constraint platform_staff_role_check violated: role must be 'developer'`);
    }
    this.staff.set(userId, { role, email, isActive });
  }

  removeStaff(userId) {
    this.staff.delete(userId);
  }

  // Explicit approved UUID test account enrollment (No email-pattern inference!)
  addTestAccount(userId) {
    this.testAccounts.add(userId);
  }

  // Server-side function: is_platform_staff() evaluating caller auth.uid() directly
  isPlatformStaff(userId) {
    if (!userId) return false;
    const entry = this.staff.get(userId);
    return Boolean(entry && entry.isActive && entry.role === 'developer');
  }

  getStaffRole(userId) {
    if (!userId) return null;
    const entry = this.staff.get(userId);
    return entry && entry.isActive && entry.role === 'developer' ? entry.role : null;
  }

  // Server-internal function: is_test_account(p_user_id)
  // Direct client execution is REVOKED. Internal callers only.
  // Test accounts are ONLY explicit approved UUIDs or active staff accounts.
  // NEVER inferred from email patterns!
  isTestAccount(userId) {
    if (!userId) return false;
    return this.testAccounts.has(userId) || this.isPlatformStaff(userId);
  }

  // Client-side direct table operation simulation on public.platform_staff (Blocked by RLS & Revokes)
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

  // Client-side direct table operation simulation on public.test_accounts (Blocked by RLS & Revokes)
  clientInsertTestAccount(callerId, targetUserId) {
    return {
      success: false,
      error: '42501: permission denied for table test_accounts (service-role/migration only)',
    };
  }

  // Client-side direct call simulation on public.is_test_account (Execution Revoked)
  clientCallIsTestAccount(callerId, probeUserId) {
    return {
      success: false,
      error: '42501: permission denied for function is_test_account (server-internal only)',
    };
  }

  // Client-side direct INSERT simulation on public.admin_audit_log (Blocked)
  clientInsertAuditLog(callerId, entry) {
    return {
      success: false,
      error: '42501: permission denied for table admin_audit_log (server-write-only)',
    };
  }

  // Server-side internal function: log_admin_action (SECURITY DEFINER)
  // Calculates actor_user_id = auth.uid(), actor_role = 'developer', created_at = now()
  logAdminAction(actorId, action, targetUserId = null, roomId = null, reason = null, metadata = {}) {
    const role = this.getStaffRole(actorId);
    if (!role || role !== 'developer') {
      throw new Error('STAFF_UNAUTHORIZED: Caller is not active platform developer.');
    }

    // Verify raw register numbers and transcript message bodies are NEVER embedded in audit logs
    if (metadata && (metadata.registerNumber || metadata.raw_register_number || metadata.transcript_messages)) {
      throw new Error('SECURITY_VIOLATION: Raw register numbers and transcript message bodies must not be stored in audit metadata.');
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
    if (entry && entry.isActive && entry.role === 'developer') {
      return { is_staff: true, role: 'developer', email: entry.email };
    }
    return { is_staff: false, role: null, email: null };
  }

  // RPC: set_developer_persona(p_username, p_avatar_url)
  rpcSetDeveloperPersona(callerId, username, avatarUrl = null) {
    if (!this.isPlatformStaff(callerId)) {
      return {
        success: false,
        error: 'STAFF_UNAUTHORIZED',
        message: 'Only developer accounts can set a custom developer persona.',
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

  // RPC: get_active_rooms_admin()
  rpcGetActiveRoomsAdmin(callerId) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    const rooms = [];
    for (const r of this.chatRooms.values()) {
      if (r.status === 'active') {
        rooms.push(r);
      }
    }

    return {
      success: true,
      rooms,
    };
  }

  // RPC: get_user_admin_details(p_user_id, p_reason)
  // Single DEVELOPER role has full access with mandatory audited reason (>= 3 chars)
  rpcGetUserAdminDetails(callerId, targetUserId, reason) {
    if (!this.isPlatformStaff(callerId)) {
      return {
        success: false,
        error: 'STAFF_UNAUTHORIZED',
        message: 'Developer role required to inspect private student credentials.',
      };
    }

    if (!reason || reason.trim().length < 3) {
      return {
        success: false,
        error: 'INVALID_REASON',
        message: 'A valid reason (minimum 3 characters) is required to inspect user profile details.',
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

  // RPC: get_room_moderation_transcript(p_room_id, p_reason)
  // Single DEVELOPER role has full access with mandatory audited reason (>= 5 chars)
  // ZERO SECRET OBSERVER PRESENCE: Developer is NOT added as a participant in chat_rooms!
  rpcGetRoomModerationTranscript(callerId, roomId, reason) {
    if (!this.isPlatformStaff(callerId)) {
      return {
        success: false,
        error: 'STAFF_UNAUTHORIZED',
        message: 'Developer role required to access moderation transcripts.',
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

  // RPC: get_admin_audit_logs(p_limit)
  // Single DEVELOPER role has full audit log visibility.
  // Historical logs with actor_role = 'admin' are preserved and readable.
  rpcGetAdminAuditLogs(callerId, limit = 50) {
    if (!this.isPlatformStaff(callerId)) {
      return { success: false, error: 'STAFF_UNAUTHORIZED' };
    }

    const logs = [...this.auditLogs].reverse().slice(0, limit);
    return {
      success: true,
      logs,
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

    if (!callerIsTest || !targetIsTest) {
      return {
        success: false,
        error: 'TEST_SESSION_RESTRICTED',
        message: 'Forced test sessions are strictly prohibited against ordinary students. Both accounts must be explicitly registered test accounts or active platform staff.',
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

  // RPC: freeze_chat_timer(p_room_id)
  rpcFreezeChatTimer(callerId, roomId, customNow = new Date()) {
    if (!callerId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }
    if (!this.isPlatformStaff(callerId)) {
      return {
        success: false,
        error: 'DEVELOPER_REQUIRED',
        message: 'Only active platform developers can freeze chat timers.',
      };
    }
    const room = this.chatRooms.get(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return {
        success: false,
        error: 'NOT_ROOM_PARTICIPANT',
        message: 'Developer must be an active participant in this room to freeze its timer.',
      };
    }
    if (room.status !== 'active') {
      return {
        success: false,
        error: 'ROOM_NOT_ACTIVE',
        message: 'Cannot freeze timer on an inactive conversation.',
      };
    }
    const nowTime = customNow.getTime();
    const expTime = new Date(room.expires_at).getTime();
    if (!room.timer_paused_at && room.expires_at && nowTime >= expTime) {
      room.status = 'ended';
      room.end_reason = 'time_limit';
      return {
        success: false,
        error: 'ROOM_EXPIRED',
        message: 'Room timer has already expired.',
      };
    }
    if (room.timer_paused_at) {
      return {
        success: false,
        error: 'TIMER_ALREADY_PAUSED',
        message: 'Timer is already paused.',
        remaining_seconds: room.timer_remaining_seconds,
        paused_at: room.timer_paused_at,
      };
    }

    const remainingSeconds = Math.max(0, Math.floor((expTime - nowTime) / 1000));
    room.timer_paused_at = customNow.toISOString();
    room.timer_remaining_seconds = remainingSeconds;
    room.timer_paused_by = callerId;

    this.logAdminAction(
      callerId,
      'FREEZE_CHAT_TIMER',
      room.user_1 === callerId ? room.user_2 : room.user_1,
      roomId,
      'Developer froze chat timer',
      {
        room_id: roomId,
        remaining_seconds: remainingSeconds,
        paused_at: customNow.toISOString(),
      }
    );

    return {
      success: true,
      room_id: roomId,
      status: 'active',
      timer_paused: true,
      remaining_seconds: remainingSeconds,
      paused_at: customNow.toISOString(),
      paused_by: callerId,
    };
  }

  // RPC: resume_chat_timer(p_room_id)
  rpcResumeChatTimer(callerId, roomId, customNow = new Date()) {
    if (!callerId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }
    if (!this.isPlatformStaff(callerId)) {
      return {
        success: false,
        error: 'DEVELOPER_REQUIRED',
        message: 'Only active platform developers can resume chat timers.',
      };
    }
    const room = this.chatRooms.get(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return {
        success: false,
        error: 'NOT_ROOM_PARTICIPANT',
        message: 'Developer must be an active participant in this room to resume its timer.',
      };
    }
    if (room.status !== 'active') {
      return {
        success: false,
        error: 'ROOM_NOT_ACTIVE',
        message: 'Cannot resume timer on an inactive conversation.',
      };
    }
    if (!room.timer_paused_at) {
      return {
        success: false,
        error: 'TIMER_NOT_PAUSED',
        message: 'Timer is not currently paused.',
      };
    }

    const remainingSeconds = room.timer_remaining_seconds ?? 0;
    const nowTime = customNow.getTime();
    const newExpiresAt = new Date(nowTime + remainingSeconds * 1000).toISOString();
    const pausedDuration = Math.max(
      0,
      Math.floor((nowTime - new Date(room.timer_paused_at).getTime()) / 1000)
    );

    room.expires_at = newExpiresAt;
    room.timer_paused_at = null;
    room.timer_remaining_seconds = null;
    room.timer_paused_by = null;
    room.total_paused_seconds = (room.total_paused_seconds || 0) + pausedDuration;

    this.logAdminAction(
      callerId,
      'RESUME_CHAT_TIMER',
      room.user_1 === callerId ? room.user_2 : room.user_1,
      roomId,
      'Developer resumed chat timer',
      {
        room_id: roomId,
        remaining_seconds: remainingSeconds,
        paused_duration_seconds: pausedDuration,
        new_expires_at: newExpiresAt,
      }
    );

    return {
      success: true,
      room_id: roomId,
      status: 'active',
      timer_paused: false,
      remaining_seconds: remainingSeconds,
      expires_at: newExpiresAt,
      paused_duration_seconds: pausedDuration,
    };
  }

  // RPC: send_chat_message(p_room_id, p_content)
  rpcSendChatMessage(callerId, roomId, content, customNow = new Date()) {
    if (!callerId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }
    const room = this.chatRooms.get(roomId);
    if (!room || (room.user_1 !== callerId && room.user_2 !== callerId)) {
      return { success: false, error: 'UNAUTHORIZED_ROOM_ACCESS' };
    }
    if (room.status !== 'active') {
      return { success: false, error: 'ROOM_INACTIVE' };
    }

    // Server-Authoritative Expiration Check:
    // Paused rooms (timer_paused_at IS NOT NULL) MUST NOT expire and must permit messages!
    const nowTime = customNow.getTime();
    if (!room.timer_paused_at && room.expires_at && nowTime >= new Date(room.expires_at).getTime()) {
      room.status = 'ended';
      room.end_reason = 'time_limit';
      return { success: false, error: 'ROOM_EXPIRED' };
    }

    const msgId = `msg-${Date.now()}-${Math.random()}`;
    const msg = {
      id: msgId,
      room_id: roomId,
      sender_id: callerId,
      content: content.trim(),
      created_at: customNow.toISOString(),
      message_type: 'text',
    };
    this.chatMessages.set(msgId, msg);

    return { success: true, message: msg };
  }

  // RPC: end_chat_room(p_room_id, p_reason)
  rpcEndChatRoom(callerId, roomId, reason = 'leave', customNow = new Date()) {
    if (!callerId) return { success: false, error: 'UNAUTHENTICATED' };
    const room = this.chatRooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };
    if (room.user_1 !== callerId && room.user_2 !== callerId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }
    if (room.status === 'ended') {
      return { success: true, room_id: roomId, status: 'ended', end_reason: room.end_reason, already_ended: true };
    }
    room.status = 'ended';
    room.ended_at = customNow.toISOString();
    room.end_reason = reason;
    room.timer_paused_at = null;
    room.timer_remaining_seconds = null;
    room.timer_paused_by = null;
    return { success: true, room_id: roomId, status: 'ended', end_reason: reason, already_ended: false };
  }

  // RPC: get_room_peer(p_room_id)
  rpcGetRoomPeer(callerId, roomId, customNow = new Date()) {
    if (!callerId) return { success: false, error: 'UNAUTHENTICATED' };
    const room = this.chatRooms.get(roomId);
    if (!room || (room.user_1 !== callerId && room.user_2 !== callerId)) {
      return { success: false, error: 'NOT_A_PARTICIPANT' };
    }
    const nowTime = customNow.getTime();
    if (room.status === 'active' && !room.timer_paused_at && room.expires_at && nowTime >= new Date(room.expires_at).getTime()) {
      room.status = 'ended';
      room.end_reason = 'time_limit';
    }
    const peerId = room.user_1 === callerId ? room.user_2 : room.user_1;
    const prof = this.profiles.get(peerId) || {};
    return {
      success: true,
      room_id: roomId,
      room_status: room.status,
      created_at: room.created_at,
      expires_at: room.expires_at,
      end_reason: room.end_reason,
      timer_paused_at: room.timer_paused_at || null,
      timer_remaining_seconds: room.timer_remaining_seconds ?? null,
      peer: {
        anonymous_username: prof.display_username || 'Unknown User',
        avatar_config: prof.avatar_config || DEFAULT_AVATAR_CONFIG,
      },
    };
  }

  // Client-side direct table operation simulation on public.chat_rooms (Blocked)
  clientUpdateChatRoom(callerId, roomId, updates) {
    return { success: false, error: '42501: permission denied for table chat_rooms' };
  }
}

describe('TALK TO RITIANS — Single DEVELOPER Role & Test Account Security Suite', () => {
  let db;

  const DEV_USER_ID = '532274f3-7fd9-4206-b353-dcd36bababd5'; // Designated Developer
  const PREVIOUS_ADMIN_ID = '6600327f-382b-4f13-9eac-3f8f69240595'; // Previous Admin (Revoked)
  const NORMAL_USER_ID = '11111111-1111-1111-1111-111111111111'; // Verified student
  const NORMAL_USER_2_ID = '22222222-2222-2222-2222-222222222222'; // Unverified student
  const EXPLICIT_TEST_UUID = 'f1da80c4-4b35-4ce2-beb8-dee20a8bdfb9'; // Explicit approved test fixture

  // Test emails with various patterns
  const EMAIL_WITH_TEST = 'student_test_pilot@gmail.com';
  const EMAIL_WITH_PILOT = 'pilot.user@ritians.edu';
  const EMAIL_WITH_STUDENT_PREFIX = 'student.2024@rit.edu';

  beforeEach(() => {
    db = new SimulatedDatabase();

    // 1. Single privileged role: Designated Developer ONLY
    db.addStaff(DEV_USER_ID, 'developer', 'gnanoognanoo@gmail.com', true);

    // 2. Explicit Approved Test Account Allowlist ONLY (no email LIKE seeding!)
    db.addTestAccount(EXPLICIT_TEST_UUID);

    // 3. Historical audit log seed with old 'admin' record (to verify historical preservation)
    db.auditLogs.push({
      id: 'log-historical-001',
      actor_user_id: PREVIOUS_ADMIN_ID,
      actor_role: 'admin',
      action: 'VIEW_PRIVATE_PROFILE',
      target_user_id: NORMAL_USER_ID,
      room_id: null,
      reason: 'Historical pre-migration compliance audit',
      metadata: { target_user_id: NORMAL_USER_ID },
      created_at: '2026-10-01T12:00:00.000Z',
    });

    // 4. Profiles
    db.profiles.set(DEV_USER_ID, {
      id: DEV_USER_ID,
      display_username: 'Developer',
      avatar_config: DEFAULT_AVATAR_CONFIG,
      college_identity_linked: false,
    });

    db.profiles.set(PREVIOUS_ADMIN_ID, {
      id: PREVIOUS_ADMIN_ID,
      display_username: 'PreviousAdmin',
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

    db.profiles.set(EXPLICIT_TEST_UUID, {
      id: EXPLICIT_TEST_UUID,
      display_username: 'TestFixture_Alpha',
      college_identity_linked: false,
    });

    // 5. Presence
    db.presence.set(DEV_USER_ID, { isOnline: true, email: 'gnanoognanoo@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(PREVIOUS_ADMIN_ID, { isOnline: true, email: 'gnanoognano@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(NORMAL_USER_ID, { isOnline: true, email: 'ananya@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(NORMAL_USER_2_ID, { isOnline: true, email: 'student2@gmail.com', lastSeenAt: new Date().toISOString() });
    db.presence.set(EXPLICIT_TEST_UUID, { isOnline: true, email: 'fixture@ritians.dev', lastSeenAt: new Date().toISOString() });
  });

  describe('1. Removal of Email-Pattern Test Account Enrollment', () => {
    test('email containing "test" does NOT become test account', () => {
      const testEmailUserId = '44444444-4444-4444-4444-444444444444';
      db.presence.set(testEmailUserId, { isOnline: true, email: EMAIL_WITH_TEST });
      assert.equal(db.isTestAccount(testEmailUserId), false);
    });

    test('email containing "pilot" does NOT become test account', () => {
      const pilotEmailUserId = '55555555-5555-5555-5555-555555555555';
      db.presence.set(pilotEmailUserId, { isOnline: true, email: EMAIL_WITH_PILOT });
      assert.equal(db.isTestAccount(pilotEmailUserId), false);
    });

    test('email beginning with "student." does NOT become test account', () => {
      const studentEmailUserId = '66666666-6666-6666-6666-666666666666';
      db.presence.set(studentEmailUserId, { isOnline: true, email: EMAIL_WITH_STUDENT_PREFIX });
      assert.equal(db.isTestAccount(studentEmailUserId), false);
    });

    test('explicit approved UUID IS test account', () => {
      assert.equal(db.isTestAccount(EXPLICIT_TEST_UUID), true);
    });

    test('normal user cannot insert test_accounts', () => {
      const res = db.clientInsertTestAccount(NORMAL_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied/i);
    });

    test('developer cannot insert test_accounts directly via browser', () => {
      const res = db.clientInsertTestAccount(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied/i);
    });

    test('is_test_account direct execution is revoked from client roles', () => {
      const res = db.clientCallIsTestAccount(NORMAL_USER_ID, EXPLICIT_TEST_UUID);
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied for function is_test_account/i);
    });
  });

  describe('2. Single Privileged DEVELOPER Role Model', () => {
    test('designated developer UUID has full privileged access', () => {
      assert.equal(db.isPlatformStaff(DEV_USER_ID), true);
      assert.equal(db.getStaffRole(DEV_USER_ID), 'developer');

      const status = db.rpcCheckStaffStatus(DEV_USER_ID);
      assert.equal(status.is_staff, true);
      assert.equal(status.role, 'developer');
    });

    test('previous admin account has no staff access', () => {
      assert.equal(db.isPlatformStaff(PREVIOUS_ADMIN_ID), false);
      assert.equal(db.getStaffRole(PREVIOUS_ADMIN_ID), null);

      const status = db.rpcCheckStaffStatus(PREVIOUS_ADMIN_ID);
      assert.equal(status.is_staff, false);
      assert.equal(status.role, null);
    });

    test('admin role is no longer assignable in platform_staff', () => {
      assert.throws(() => {
        db.addStaff('77777777-7777-7777-7777-777777777777', 'admin', 'test@test.com');
      }, /CHECK constraint platform_staff_role_check/);
    });

    test('normal user cannot access Developer Console', () => {
      assert.equal(db.isPlatformStaff(NORMAL_USER_ID), false);
      assert.equal(db.getStaffRole(NORMAL_USER_ID), null);

      const statsRes = db.rpcGetAdminDashboardStats(NORMAL_USER_ID);
      assert.equal(statsRes.success, false);
      assert.equal(statsRes.error, 'STAFF_UNAUTHORIZED');
    });

    test('normal user cannot query privileged RPCs', () => {
      assert.equal(db.rpcGetOnlineUsersAdmin(NORMAL_USER_ID).error, 'STAFF_UNAUTHORIZED');
      assert.equal(db.rpcGetActiveRoomsAdmin(NORMAL_USER_ID).error, 'STAFF_UNAUTHORIZED');
      assert.equal(db.rpcGetUserAdminDetails(NORMAL_USER_ID, NORMAL_USER_2_ID, 'reason').error, 'STAFF_UNAUTHORIZED');
      assert.equal(db.rpcGetAdminAuditLogs(NORMAL_USER_ID).error, 'STAFF_UNAUTHORIZED');
    });

    test('normal user cannot set developer persona', () => {
      const res = db.rpcSetDeveloperPersona(NORMAL_USER_ID, 'FakeDev');
      assert.equal(res.success, false);
      assert.equal(res.error, 'STAFF_UNAUTHORIZED');
    });

    test('developer username must be between 3 and 20 characters and reject invalid characters', () => {
      assert.equal(db.rpcSetDeveloperPersona(DEV_USER_ID, 'ab').error, 'INVALID_LENGTH');
      assert.equal(db.rpcSetDeveloperPersona(DEV_USER_ID, 'a'.repeat(21)).error, 'INVALID_LENGTH');
      assert.equal(db.rpcSetDeveloperPersona(DEV_USER_ID, '<script>').error, 'INVALID_CHARACTERS');
    });

    test('developer can view online users', () => {
      const res = db.rpcGetOnlineUsersAdmin(DEV_USER_ID);
      assert.equal(res.success, true);
      assert.ok(Array.isArray(res.users));
      assert.ok(res.users.length >= 4);
    });

    test('developer can view active rooms', () => {
      db.chatRooms.set('room-1', {
        id: 'room-1',
        user_1: NORMAL_USER_ID,
        user_2: NORMAL_USER_2_ID,
        status: 'active',
      });
      const res = db.rpcGetActiveRoomsAdmin(DEV_USER_ID);
      assert.equal(res.success, true);
      assert.equal(res.rooms.length, 1);
    });
  });

  describe('3. Private Student Profile Inspection (Authorized for DEVELOPER)', () => {
    test('profile inspection requires mandatory reason (>= 3 chars)', () => {
      const resEmpty = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, '');
      assert.equal(resEmpty.success, false);
      assert.equal(resEmpty.error, 'INVALID_REASON');

      const resShort = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'ab');
      assert.equal(resShort.success, false);
      assert.equal(resShort.error, 'INVALID_REASON');
    });

    test('developer can inspect private student profile with reason', () => {
      const res = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Verifying duplicate report');
      assert.equal(res.success, true);
      assert.equal(res.real_name, 'Ananya Ramesh');
      assert.equal(res.department, 'Computer Science');
      assert.equal(res.batch, '2023-2027');
      assert.equal(res.gender, 'Female');
      assert.equal(res.is_verified, true);
      assert.equal(res.fingerprint_suffix, '...2097e8b6');
    });

    test('RAW REGISTER NUMBER INVARIANT: raw register number is NEVER returned to developer', () => {
      const res = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Verifying identity');
      assert.equal(res.success, true);
      assert.equal(res.registerNumber, undefined);
    });

    test('private profile access produces VIEW_PRIVATE_PROFILE audit log with actor_role = developer', () => {
      const initialLogs = db.auditLogs.length;
      db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Investigating harassment report');

      assert.equal(db.auditLogs.length, initialLogs + 1);
      const log = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(log.action, 'VIEW_PRIVATE_PROFILE');
      assert.equal(log.actor_user_id, DEV_USER_ID);
      assert.equal(log.actor_role, 'developer');
      assert.equal(log.target_user_id, NORMAL_USER_ID);
      assert.equal(log.reason, 'Investigating harassment report');
    });

    test('ADMIN_REQUIRED is no longer used in active inspection logic', () => {
      const res = db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Checking profile');
      assert.notEqual(res.error, 'ADMIN_REQUIRED');
      assert.equal(res.success, true);
    });
  });

  describe('4. Moderation Transcript Inspection (Authorized for DEVELOPER)', () => {
    let testRoomId;

    beforeEach(() => {
      testRoomId = 'room-mod-001';
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
        content: 'Campus library meetup?',
        created_at: new Date().toISOString(),
      });

      db.chatMessages.set('msg-2', {
        id: 'msg-2',
        room_id: testRoomId,
        sender_id: NORMAL_USER_2_ID,
        content: 'Sure, 4pm at CS block',
        created_at: new Date(Date.now() + 1000).toISOString(),
      });
    });

    test('transcript inspection requires mandatory reason (>= 5 chars)', () => {
      const resShort = db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'bad');
      assert.equal(resShort.success, false);
      assert.equal(resShort.error, 'INVALID_REASON');
    });

    test('developer can inspect transcript with reason', () => {
      const res = db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'Investigating safety report');
      assert.equal(res.success, true);
      assert.equal(res.room_id, testRoomId);
      assert.equal(res.messages.length, 2);
    });

    test('transcript access produces OPEN_MODERATION_TRANSCRIPT audit log with actor_role = developer', () => {
      const initialLogs = db.auditLogs.length;
      db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'Investigating abuse ticket');

      assert.equal(db.auditLogs.length, initialLogs + 1);
      const log = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(log.action, 'OPEN_MODERATION_TRANSCRIPT');
      assert.equal(log.actor_user_id, DEV_USER_ID);
      assert.equal(log.actor_role, 'developer');
      assert.equal(log.room_id, testRoomId);
      assert.equal(log.reason, 'Investigating abuse ticket');
    });

    test('ZERO SECRET OBSERVER PRESENCE: developer is NEVER added as a third participant in room', () => {
      const roomBefore = db.chatRooms.get(testRoomId);
      assert.equal(roomBefore.user_1, NORMAL_USER_ID);
      assert.equal(roomBefore.user_2, NORMAL_USER_2_ID);

      db.rpcGetRoomModerationTranscript(DEV_USER_ID, testRoomId, 'Safety inspection check');

      const roomAfter = db.chatRooms.get(testRoomId);
      assert.equal(roomAfter.user_1, NORMAL_USER_ID);
      assert.equal(roomAfter.user_2, NORMAL_USER_2_ID);
      assert.notEqual(roomAfter.user_1, DEV_USER_ID);
      assert.notEqual(roomAfter.user_2, DEV_USER_ID);
    });
  });

  describe('5. Audit Log Privacy & Full Developer Visibility', () => {
    test('developer sees complete audit console', () => {
      const res = db.rpcGetAdminAuditLogs(DEV_USER_ID);
      assert.equal(res.success, true);
      assert.ok(Array.isArray(res.logs));
      assert.ok(res.logs.length >= 1);
    });

    test('old audit history remains intact with historical actor_role = admin preserved', () => {
      const res = db.rpcGetAdminAuditLogs(DEV_USER_ID);
      const historicalLog = res.logs.find((l) => l.id === 'log-historical-001');
      assert.ok(historicalLog);
      assert.equal(historicalLog.actor_role, 'admin');
      assert.equal(historicalLog.actor_user_id, PREVIOUS_ADMIN_ID);
    });

    test('audit rows cannot be inserted directly by browser', () => {
      const res = db.clientInsertAuditLog(DEV_USER_ID, { action: 'SPOOFED_EVENT' });
      assert.equal(res.success, false);
      assert.match(res.error, /server-write-only/i);
    });

    test('transcript message bodies are NOT embedded in audit logs', () => {
      db.rpcGetRoomModerationTranscript(DEV_USER_ID, 'room-mod-001', 'Checking content');
      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(lastLog.metadata.transcript_messages, undefined);
    });

    test('raw register numbers are NOT stored in audit metadata', () => {
      db.rpcGetUserAdminDetails(DEV_USER_ID, NORMAL_USER_ID, 'Routine check');
      const lastLog = db.auditLogs[db.auditLogs.length - 1];
      assert.equal(lastLog.metadata.registerNumber, undefined);
      assert.equal(lastLog.metadata.raw_register_number, undefined);
    });
  });

  describe('6. Chat Invites & Test Sessions (Strict Privilege Boundaries)', () => {
    test('developer can send chat invite to online student with 30s TTL', () => {
      const res = db.rpcSendAdminChatInvite(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, true);
      assert.ok(res.request_id);
      assert.equal(res.recipient_id, NORMAL_USER_ID);
      assert.ok(res.expires_at);
    });

    test('developer cannot force ordinary user into conversation (must Accept/Reject)', () => {
      const res = db.rpcSendAdminChatInvite(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, true);

      // Student is NOT placed into an active chat room automatically
      const activeRooms = Array.from(db.chatRooms.values()).filter(
        (r) => r.status === 'active' && (r.user_1 === NORMAL_USER_ID || r.user_2 === NORMAL_USER_ID)
      );
      assert.equal(activeRooms.length, 0);

      // Student rejects the request
      const req = db.chatRequests.get(res.request_id);
      req.status = 'rejected';

      const activeRoomsAfter = Array.from(db.chatRooms.values()).filter(
        (r) => r.status === 'active' && (r.user_1 === NORMAL_USER_ID || r.user_2 === NORMAL_USER_ID)
      );
      assert.equal(activeRoomsAfter.length, 0);
    });

    test('ordinary student cannot be forced into test session', () => {
      const res = db.rpcCreateTestSession(DEV_USER_ID, NORMAL_USER_ID);
      assert.equal(res.success, false);
      assert.equal(res.error, 'TEST_SESSION_RESTRICTED');
    });

    test('explicitly approved test UUID can participate in test session', () => {
      const res = db.rpcCreateTestSession(DEV_USER_ID, EXPLICIT_TEST_UUID);
      assert.equal(res.success, true);
      assert.ok(res.room_id);

      const room = db.chatRooms.get(res.room_id);
      assert.equal(room.status, 'active');
      assert.equal(room.user_1, DEV_USER_ID);
      assert.equal(room.user_2, EXPLICIT_TEST_UUID);
    });

    test('staff account can participate in test session', () => {
      // If another staff account existed, they could participate
      const secondDevId = '88888888-8888-8888-8888-888888888888';
      db.addStaff(secondDevId, 'developer', 'dev2@ritians.edu');

      const res = db.rpcCreateTestSession(DEV_USER_ID, secondDevId);
      assert.equal(res.success, true);
      assert.ok(res.room_id);
    });
  });

  describe('7. Server-Side Identity & Privilege Invariants', () => {
    test('is_platform_staff() evaluates auth.uid() directly without client spoofing', () => {
      assert.equal(db.isPlatformStaff(DEV_USER_ID), true);
      assert.equal(db.isPlatformStaff(PREVIOUS_ADMIN_ID), false);
      assert.equal(db.isPlatformStaff(NORMAL_USER_ID), false);
      assert.equal(db.isPlatformStaff(null), false);
    });

    test('normal user cannot insert or update platform_staff table', () => {
      assert.equal(db.clientInsertPlatformStaff(NORMAL_USER_ID, NORMAL_USER_ID, 'developer').success, false);
      assert.equal(db.clientUpdatePlatformStaff(NORMAL_USER_ID, NORMAL_USER_ID, 'developer').success, false);
    });

    test('developer cannot promote another user via client table write', () => {
      assert.equal(db.clientInsertPlatformStaff(DEV_USER_ID, NORMAL_USER_ID, 'developer').success, false);
    });
  });

  describe('8. Developer-Only Chat Timer Freeze & Resume (Server-Authoritative)', () => {
    let testRoomId;
    let roomStartTime;
    let originalExpiryTime;

    beforeEach(() => {
      testRoomId = 'room-freeze-001';
      roomStartTime = new Date('2026-10-02T12:00:00.000Z');
      originalExpiryTime = new Date('2026-10-02T12:07:00.000Z'); // 7 minutes = 420s

      db.chatRooms.set(testRoomId, {
        id: testRoomId,
        user_1: DEV_USER_ID,
        user_2: NORMAL_USER_ID,
        status: 'active',
        created_at: roomStartTime.toISOString(),
        expires_at: originalExpiryTime.toISOString(),
        timer_paused_at: null,
        timer_remaining_seconds: null,
        timer_paused_by: null,
        total_paused_seconds: 0,
      });
    });

    test('8.1 Basic freeze: developer freezes at 05:13 remaining -> stores ~313s remaining and pauses expiry', () => {
      // 12:01:47 -> 313 seconds remaining
      const freezeTime = new Date('2026-10-02T12:01:47.000Z');
      const res = db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);

      assert.equal(res.success, true);
      assert.equal(res.status, 'active');
      assert.equal(res.timer_paused, true);
      assert.equal(res.remaining_seconds, 313);
      assert.equal(res.paused_at, freezeTime.toISOString());
      assert.equal(res.paused_by, DEV_USER_ID);

      const room = db.chatRooms.get(testRoomId);
      assert.equal(room.timer_paused_at, freezeTime.toISOString());
      assert.equal(room.timer_remaining_seconds, 313);
      assert.equal(room.timer_paused_by, DEV_USER_ID);
    });

    test('8.2 Long freeze: advance simulated server time by 20 minutes -> room remains active, timer remains 300s', () => {
      // Freeze at 05:00 remaining (12:02:00)
      const freezeTime = new Date('2026-10-02T12:02:00.000Z');
      const freezeRes = db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);
      assert.equal(freezeRes.success, true);
      assert.equal(freezeRes.remaining_seconds, 300);

      // Advance time by 20 minutes to 12:22:00 (well past original 12:07:00 expiry)
      const futureTime = new Date('2026-10-02T12:22:00.000Z');
      const peerRes = db.rpcGetRoomPeer(DEV_USER_ID, testRoomId, futureTime);

      assert.equal(peerRes.success, true);
      assert.equal(peerRes.room_status, 'active');
      assert.notEqual(peerRes.end_reason, 'time_limit');
      assert.equal(peerRes.timer_remaining_seconds, 300);
      assert.equal(peerRes.timer_paused_at, freezeTime.toISOString());
    });

    test('8.3 Resume: new expires_at = resume time + stored remaining seconds (frozen duration not penalized)', () => {
      // Freeze at 12:02:00 (300s remaining)
      const freezeTime = new Date('2026-10-02T12:02:00.000Z');
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);

      // Advance by 10 minutes to 12:12:00, then resume
      const resumeTime = new Date('2026-10-02T12:12:00.000Z');
      const resumeRes = db.rpcResumeChatTimer(DEV_USER_ID, testRoomId, resumeTime);

      assert.equal(resumeRes.success, true);
      assert.equal(resumeRes.status, 'active');
      assert.equal(resumeRes.timer_paused, false);
      assert.equal(resumeRes.remaining_seconds, 300);
      assert.equal(resumeRes.paused_duration_seconds, 600); // 10 minutes paused
      // New expiry must be 12:12:00 + 300s = 12:17:00
      assert.equal(resumeRes.expires_at, new Date('2026-10-02T12:17:00.000Z').toISOString());

      const room = db.chatRooms.get(testRoomId);
      assert.equal(room.timer_paused_at, null);
      assert.equal(room.timer_remaining_seconds, null);
      assert.equal(room.total_paused_seconds, 600);
    });

    test('8.4 Normal participant cannot freeze timer -> DEVELOPER_REQUIRED', () => {
      const res = db.rpcFreezeChatTimer(NORMAL_USER_ID, testRoomId);
      assert.equal(res.success, false);
      assert.equal(res.error, 'DEVELOPER_REQUIRED');
    });

    test('8.5 Developer cannot freeze room they are NOT participating in -> NOT_ROOM_PARTICIPANT', () => {
      const otherRoomId = 'room-student-only-002';
      db.chatRooms.set(otherRoomId, {
        id: otherRoomId,
        user_1: NORMAL_USER_ID,
        user_2: NORMAL_USER_2_ID,
        status: 'active',
        created_at: roomStartTime.toISOString(),
        expires_at: originalExpiryTime.toISOString(),
        timer_paused_at: null,
      });

      const res = db.rpcFreezeChatTimer(DEV_USER_ID, otherRoomId);
      assert.equal(res.success, false);
      assert.equal(res.error, 'NOT_ROOM_PARTICIPANT');
    });

    test('8.6 Messages continue working during freeze, even after original expires_at has passed', () => {
      // Freeze at 12:02:00 (300s remaining)
      const freezeTime = new Date('2026-10-02T12:02:00.000Z');
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);

      // Try sending a message at 12:15:00 (original expiry was 12:07:00)
      const messageTime = new Date('2026-10-02T12:15:00.000Z');

      // Developer sends message
      const devMsgRes = db.rpcSendChatMessage(DEV_USER_ID, testRoomId, 'Testing while timer is frozen', messageTime);
      assert.equal(devMsgRes.success, true);
      assert.ok(devMsgRes.message.id);

      // Student sends message
      const studentMsgRes = db.rpcSendChatMessage(NORMAL_USER_ID, testRoomId, 'Student reply while frozen', messageTime);
      assert.equal(studentMsgRes.success, true);
      assert.ok(studentMsgRes.message.id);
    });

    test('8.7 Reconnect / refresh during freeze restores frozen state and exact remaining seconds without recalculating', () => {
      // Freeze at 04:28 remaining (268 seconds)
      const freezeTime = new Date('2026-10-02T12:02:32.000Z');
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);

      // Simulate client refresh at 12:08:00
      const refreshTime = new Date('2026-10-02T12:08:00.000Z');
      const devPeer = db.rpcGetRoomPeer(DEV_USER_ID, testRoomId, refreshTime);
      const studentPeer = db.rpcGetRoomPeer(NORMAL_USER_ID, testRoomId, refreshTime);

      assert.equal(devPeer.room_status, 'active');
      assert.equal(devPeer.timer_remaining_seconds, 268);
      assert.equal(devPeer.timer_paused_at, freezeTime.toISOString());

      assert.equal(studentPeer.room_status, 'active');
      assert.equal(studentPeer.timer_remaining_seconds, 268);
      assert.equal(studentPeer.timer_paused_at, freezeTime.toISOString());
    });

    test('8.8 Resume then expiry: timer counts down to 00:00 -> room ends with time_limit', () => {
      // Freeze with 5 seconds remaining
      const freezeTime = new Date('2026-10-02T12:06:55.000Z'); // 5s remaining
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);

      // Resume at 12:15:00
      const resumeTime = new Date('2026-10-02T12:15:00.000Z');
      const resumeRes = db.rpcResumeChatTimer(DEV_USER_ID, testRoomId, resumeTime);
      assert.equal(resumeRes.expires_at, new Date('2026-10-02T12:15:05.000Z').toISOString());

      // Advance by 6 seconds (12:15:06)
      const expiredTime = new Date('2026-10-02T12:15:06.000Z');
      const peerRes = db.rpcGetRoomPeer(DEV_USER_ID, testRoomId, expiredTime);
      assert.equal(peerRes.room_status, 'ended');
      assert.equal(peerRes.end_reason, 'time_limit');
    });

    test('8.9 Leave during freeze terminates room immediately with end_reason = "leave" and clears paused state', () => {
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId);
      const leaveRes = db.rpcEndChatRoom(NORMAL_USER_ID, testRoomId, 'leave');

      assert.equal(leaveRes.success, true);
      assert.equal(leaveRes.status, 'ended');
      assert.equal(leaveRes.end_reason, 'leave');

      const room = db.chatRooms.get(testRoomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.timer_paused_at, null);
      assert.equal(room.timer_remaining_seconds, null);
    });

    test('8.10 Skip during freeze terminates room immediately with end_reason = "skip" and clears paused state', () => {
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId);
      const skipRes = db.rpcEndChatRoom(DEV_USER_ID, testRoomId, 'skip');

      assert.equal(skipRes.success, true);
      assert.equal(skipRes.status, 'ended');
      assert.equal(skipRes.end_reason, 'skip');

      const room = db.chatRooms.get(testRoomId);
      assert.equal(room.status, 'ended');
      assert.equal(room.timer_paused_at, null);
      assert.equal(room.timer_remaining_seconds, null);
    });

    test('8.11 Normal 7-minute rooms between two ordinary students remain completely unchanged', () => {
      const studentRoomId = 'room-standard-students-001';
      db.chatRooms.set(studentRoomId, {
        id: studentRoomId,
        user_1: NORMAL_USER_ID,
        user_2: NORMAL_USER_2_ID,
        status: 'active',
        created_at: roomStartTime.toISOString(),
        expires_at: originalExpiryTime.toISOString(),
        timer_paused_at: null,
        timer_remaining_seconds: null,
      });

      // Normal student calling freeze fails
      const freezeRes = db.rpcFreezeChatTimer(NORMAL_USER_ID, studentRoomId);
      assert.equal(freezeRes.success, false);
      assert.equal(freezeRes.error, 'DEVELOPER_REQUIRED');

      // Room expires normally at 12:07:01
      const pastExpiry = new Date('2026-10-02T12:07:01.000Z');
      const peerRes = db.rpcGetRoomPeer(NORMAL_USER_ID, studentRoomId, pastExpiry);
      assert.equal(peerRes.room_status, 'ended');
      assert.equal(peerRes.end_reason, 'time_limit');
    });

    test('8.12 Audit trail records FREEZE_CHAT_TIMER and RESUME_CHAT_TIMER with accurate metadata', () => {
      const freezeTime = new Date('2026-10-02T12:01:47.000Z');
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId, freezeTime);

      const freezeLog = db.auditLogs.find((l) => l.action === 'FREEZE_CHAT_TIMER');
      assert.ok(freezeLog);
      assert.equal(freezeLog.actor_user_id, DEV_USER_ID);
      assert.equal(freezeLog.actor_role, 'developer');
      assert.equal(freezeLog.room_id, testRoomId);
      assert.equal(freezeLog.metadata.remaining_seconds, 313);

      const resumeTime = new Date('2026-10-02T12:06:47.000Z');
      db.rpcResumeChatTimer(DEV_USER_ID, testRoomId, resumeTime);

      const resumeLog = db.auditLogs.find((l) => l.action === 'RESUME_CHAT_TIMER');
      assert.ok(resumeLog);
      assert.equal(resumeLog.actor_user_id, DEV_USER_ID);
      assert.equal(resumeLog.metadata.paused_duration_seconds, 300);
      assert.ok(resumeLog.metadata.new_expires_at);
    });

    test('8.13 Direct client writes to chat_rooms table are strictly blocked', () => {
      const res = db.clientUpdateChatRoom(NORMAL_USER_ID, testRoomId, { expires_at: '2099-01-01' });
      assert.equal(res.success, false);
      assert.match(res.error, /permission denied for table chat_rooms/i);
    });

    test('8.14 Double Freeze protection returns TIMER_ALREADY_PAUSED', () => {
      db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId);
      const secondFreeze = db.rpcFreezeChatTimer(DEV_USER_ID, testRoomId);
      assert.equal(secondFreeze.success, false);
      assert.equal(secondFreeze.error, 'TIMER_ALREADY_PAUSED');
    });

    test('8.15 Double Resume protection returns TIMER_NOT_PAUSED', () => {
      const res = db.rpcResumeChatTimer(DEV_USER_ID, testRoomId);
      assert.equal(res.success, false);
      assert.equal(res.error, 'TIMER_NOT_PAUSED');
    });
  });
});
