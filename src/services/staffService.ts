/**
 * ============================================================================
 * TALK TO RITIANS - Staff & Developer Console Service
 * ============================================================================
 * Provides secure server-enforced operations for authorized developers/admins:
 * - Realtime stats and online users query
 * - Privileged profile inspection with mandatory audited reasons
 * - Active room inspection and moderation transcripts
 * - Direct admin chat invites and constrained test sessions
 * - Developer gallery avatar processing (512x512 WebP) & persona setup
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  ApiResponse,
  PlatformStaffRole,
  AdminDashboardStats,
  AdminOnlineUser,
  AdminUserDetails,
  AdminActiveRoom,
  AdminRoomDetails,
  ModerationTranscriptMessage,
  AdminAuditLogRow,
} from '../types';

export class StaffService {
  /**
   * Validates whether the active session has an authorized developer or admin role.
   */
  async checkStaffStatus(): Promise<{
    isStaff: boolean;
    role: PlatformStaffRole | null;
    email: string | null;
  }> {
    try {
      if (!isSupabaseConfigured) {
        return { isStaff: false, role: null, email: null };
      }

      const { data, error } = await supabase.rpc('check_staff_status');
      if (error || !data) {
        return { isStaff: false, role: null, email: null };
      }

      const res = data as { is_staff?: boolean; role?: PlatformStaffRole; email?: string };
      return {
        isStaff: Boolean(res.is_staff),
        role: res.role || null,
        email: res.email || null,
      };
    } catch {
      return { isStaff: false, role: null, email: null };
    }
  }

  /**
   * Fetches real-time summary statistics for the staff overview dashboard.
   */
  async getAdminDashboardStats(): Promise<ApiResponse<AdminDashboardStats>> {
    try {
      const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'STATS_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'UNAUTHORIZED', message: res?.message || 'Unauthorized access' },
        };
      }

      return {
        success: true,
        data: {
          online_users: res.online_users ?? 0,
          users_chatting: res.users_chatting ?? 0,
          users_idle: res.users_idle ?? 0,
          active_rooms: res.active_rooms ?? 0,
          pending_requests: res.pending_requests ?? 0,
          updated_at: res.updated_at || new Date().toISOString(),
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Fetches currently online users for the Developer -> Users list.
   */
  async getOnlineUsersAdmin(): Promise<ApiResponse<AdminOnlineUser[]>> {
    try {
      const { data, error } = await supabase.rpc('get_online_users_admin');
      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'USERS_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'UNAUTHORIZED', message: res?.message || 'Access denied' },
        };
      }

      return {
        success: true,
        data: (res.users || []) as AdminOnlineUser[],
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Fetches privileged profile details with a mandatory audited reason.
   */
  async getUserAdminDetails(
    userId: string,
    reason: string
  ): Promise<ApiResponse<AdminUserDetails>> {
    try {
      if (!reason || reason.trim().length < 3) {
        return {
          success: false,
          data: null,
          error: { code: 'INVALID_REASON', message: 'A valid reason (minimum 3 characters) is required.' },
        };
      }

      const { data, error } = await supabase.rpc('get_user_admin_details', {
        p_user_id: userId,
        p_reason: reason.trim(),
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'PROFILE_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'FETCH_FAILED', message: res?.message || 'Failed to fetch details' },
        };
      }

      return {
        success: true,
        data: res as AdminUserDetails,
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Fetches active rooms list for Developer -> Rooms dashboard.
   */
  async getActiveRoomsAdmin(): Promise<ApiResponse<AdminActiveRoom[]>> {
    try {
      const { data, error } = await supabase.rpc('get_active_rooms_admin');
      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'ROOMS_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'UNAUTHORIZED', message: res?.message || 'Access denied' },
        };
      }

      return {
        success: true,
        data: (res.rooms || []) as AdminActiveRoom[],
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Fetches room metadata for room inspection drawer.
   */
  async getRoomAdminDetails(roomId: string): Promise<ApiResponse<AdminRoomDetails>> {
    try {
      const { data, error } = await supabase.rpc('get_room_admin_details', {
        p_room_id: roomId,
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'ROOM_DETAILS_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'NOT_FOUND', message: res?.message || 'Failed to load room details' },
        };
      }

      return {
        success: true,
        data: res as AdminRoomDetails,
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Fetches moderation transcript with a mandatory operational/moderation reason.
   */
  async getRoomModerationTranscript(
    roomId: string,
    reason: string
  ): Promise<ApiResponse<ModerationTranscriptMessage[]>> {
    try {
      if (!reason || reason.trim().length < 5) {
        return {
          success: false,
          data: null,
          error: { code: 'INVALID_REASON', message: 'A mandatory moderation reason of at least 5 characters is required.' },
        };
      }

      const { data, error } = await supabase.rpc('get_room_moderation_transcript', {
        p_room_id: roomId,
        p_reason: reason.trim(),
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'TRANSCRIPT_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'UNAUTHORIZED', message: res?.message || 'Failed to fetch transcript' },
        };
      }

      return {
        success: true,
        data: (res.messages || []) as ModerationTranscriptMessage[],
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Sends an admin chat invite to an online student (student gets standard Accept/Reject modal).
   */
  async sendAdminChatInvite(userId: string): Promise<ApiResponse<{ requestId: string; recipientId: string; expiresAt: string }>> {
    try {
      const { data, error } = await supabase.rpc('send_admin_chat_invite', {
        p_user_id: userId,
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'INVITE_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'INVITE_REJECTED', message: res?.message || 'Could not send chat invite.' },
        };
      }

      return {
        success: true,
        data: {
          requestId: res.request_id,
          recipientId: res.recipient_id,
          expiresAt: res.expires_at,
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Initiates a forced test session between controlled test/developer accounts.
   */
  async createTestSession(targetUserId: string): Promise<ApiResponse<{ roomId: string; createdAt: string; expiresAt: string }>> {
    try {
      const { data, error } = await supabase.rpc('create_test_session', {
        p_target_user_id: targetUserId,
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'TEST_SESSION_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'RESTRICTED', message: res?.message || 'Cannot create test session.' },
        };
      }

      return {
        success: true,
        data: {
          roomId: res.room_id,
          createdAt: res.created_at,
          expiresAt: res.expires_at,
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Fetches recent entries from the immutable admin audit log.
   */
  async getAdminAuditLogs(limit: number = 50): Promise<ApiResponse<AdminAuditLogRow[]>> {
    try {
      const { data, error } = await supabase.rpc('get_admin_audit_logs', {
        p_limit: limit,
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'AUDIT_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'UNAUTHORIZED', message: res?.message || 'Access denied' },
        };
      }

      return {
        success: true,
        data: (res.logs || []) as AdminAuditLogRow[],
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }

  /**
   * Client-side optimization: crops and resizes image to 512x512 WebP,
   * strips metadata, and uploads to developer-avatars bucket.
   */
  async uploadDeveloperAvatar(file: File): Promise<ApiResponse<{ publicUrl: string }>> {
    try {
      // 1. MIME check
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(file.type.toLowerCase())) {
        return {
          success: false,
          data: null,
          error: { code: 'INVALID_MIME_TYPE', message: 'Only JPEG, PNG, and WebP images are allowed. SVG is prohibited.' },
        };
      }

      // 2. Max file size: 5MB
      if (file.size > 5 * 1024 * 1024) {
        return {
          success: false,
          data: null,
          error: { code: 'FILE_TOO_LARGE', message: 'Image must be smaller than 5 MB.' },
        };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        return {
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to upload.' },
        };
      }

      // 3. Process image in browser canvas (Crop square + resize to 512x512 WebP)
      const webpBlob = await this.processImageToSquareWebP(file, 512);

      // 4. Random storage object name
      const randomId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      const filePath = `${userId}/${randomId}.webp`;

      const { error: uploadError } = await supabase.storage
        .from('developer-avatars')
        .upload(filePath, webpBlob, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        return {
          success: false,
          data: null,
          error: { code: uploadError.name || 'UPLOAD_FAILED', message: uploadError.message },
        };
      }

      const { data: publicUrlData } = supabase.storage
        .from('developer-avatars')
        .getPublicUrl(filePath);

      return {
        success: true,
        data: { publicUrl: publicUrlData.publicUrl },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'PROCESSING_ERROR', message: err instanceof Error ? err.message : 'Image processing failed' },
      };
    }
  }

  /**
   * Helper: Crops and scales an image file to a square WebP blob.
   */
  private processImageToSquareWebP(file: File, size: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          // Center crop
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;

          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas to Blob conversion failed'));
              }
            },
            'image/webp',
            0.88
          );
        } catch (e) {
          reject(e);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for processing'));
      };

      img.src = url;
    });
  }

  /**
   * Saves the custom developer persona (username and optional gallery avatar URL).
   */
  async setDeveloperPersona(
    username: string,
    avatarUrl?: string
  ): Promise<ApiResponse<{ username: string; avatarConfig: Record<string, unknown> }>> {
    try {
      const trimmed = username.trim();
      if (!trimmed || trimmed.length < 3 || trimmed.length > 20) {
        return {
          success: false,
          data: null,
          error: { code: 'INVALID_LENGTH', message: 'Username must be between 3 and 20 characters.' },
        };
      }

      const { data, error } = await supabase.rpc('set_developer_persona', {
        p_username: trimmed,
        p_avatar_url: avatarUrl?.trim() || null,
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'UPDATE_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res?.success) {
        return {
          success: false,
          data: null,
          error: { code: res?.error || 'SAVE_REJECTED', message: res?.message || 'Failed to save developer persona.' },
        };
      }

      return {
        success: true,
        data: {
          username: res.username,
          avatarConfig: res.avatar_config,
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }
  }
}

export const staffService = new StaffService();
