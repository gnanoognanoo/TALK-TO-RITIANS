/**
 * ============================================================================
 * TALK TO RITIANS - Staff & Developer Console Types
 * ============================================================================
 */

export type PlatformStaffRole = 'developer' | 'admin';

export interface PlatformStaffRow {
  user_id: string;
  role: PlatformStaffRole;
  email: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface AdminAuditLogRow {
  id: string;
  actor_user_id: string;
  actor_role: string;
  action: string;
  target_user_id: string | null;
  room_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_email?: string | null;
}

export interface AdminDashboardStats {
  online_users: number;
  users_chatting: number;
  users_idle: number;
  active_rooms: number;
  pending_requests: number;
  updated_at: string;
}

export type AdminUserState = 'idle' | 'searching' | 'pending_request' | 'in_chat' | 'offline';

export interface AdminOnlineUser {
  user_id: string;
  anonymous_username: string;
  avatar_config: Record<string, unknown>;
  is_verified_student: boolean;
  is_staff: boolean;
  staff_role: PlatformStaffRole | null;
  is_online: boolean;
  last_seen_at: string;
  current_page: string;
  state: AdminUserState;
  current_room_id: string | null;
  is_test_account: boolean;
}

export interface AdminUserDetails {
  user_id: string;
  anonymous_username: string;
  avatar_config: Record<string, unknown>;
  real_name: string | null;
  department: string | null;
  batch: string | null;
  gender: string | null;
  is_verified: boolean;
  ever_verified: boolean;
  verification_method: string | null;
  verified_at: string | null;
  identity_id: string | null;
  fingerprint_suffix: string | null;
  account_created_at: string;
  last_seen_at: string | null;
  is_online: boolean;
}

export interface AdminActiveRoom {
  room_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  remaining_seconds: number;
  participant_a_id: string;
  participant_a_username: string;
  participant_a_avatar: Record<string, unknown>;
  participant_b_id: string;
  participant_b_username: string;
  participant_b_avatar: Record<string, unknown>;
  message_count: number;
}

export interface AdminRoomDetails {
  room_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  ended_at: string | null;
  end_reason: string | null;
  remaining_seconds: number;
  user_1: string;
  user_2: string;
  user_1_heartbeat_at: string | null;
  user_2_heartbeat_at: string | null;
  message_count: number;
}

export interface ModerationTranscriptMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_username: string;
  content: string;
  message_type: string;
  created_at: string;
}
