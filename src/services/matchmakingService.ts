/**
 * ============================================================================
 * TALK TO RITIANS - Matchmaking Service (Phase 9)
 * ============================================================================
 * Handles joining the server-side random 1-to-1 matchmaking queue, heartbeat
 * lifecycle, queue departure, and pairing resolution.
 *
 * CRITICAL PRIVACY RULE:
 * Match results strictly provide ONLY the stranger's anonymous display handle
 * and modular vector avatar. All private academic and demographic metadata
 * (email, roll number, department, section, batch, graduation year, gender)
 * is permanently sealed and NEVER transmitted.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  ApiResponse,
  MatchmakingResponse,
  MatchedPeerPersona,
  AvatarConfig,
} from '../types';

// In-memory simulation registry for local development fallback when Supabase is offline
interface LocalDevQueueItem {
  userId: string;
  joinedAt: number;
  heartbeatAt: number;
  username: string;
  avatarConfig: AvatarConfig;
}

const localDevQueue: LocalDevQueueItem[] = [];
const localDevMatchedRooms = new Map<string, { roomId: string; peer: MatchedPeerPersona }>();

export class MatchmakingService {
  private lastJoinTime: number = 0;

  /**
   * Enters the server-side matchmaking queue.
   * Atomically pairs two waiting students if available, or enqueues the caller.
   */
  async joinMatchmaking(): Promise<ApiResponse<MatchmakingResponse>> {
    try {
      // 0. Rate limiting check: enforce minimum 1.5s between join attempts
      const now = Date.now();
      if (now - this.lastJoinTime < 1500) {
        return {
          success: false,
          data: null,
          error: {
            code: 'RATE_LIMITED',
            message: 'Please wait a moment before joining matchmaking again.',
          },
        };
      }
      this.lastJoinTime = now;

      // 1. Session check
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in with your verified campus account to join matchmaking.',
          },
        };
      }

      // 2. Call server-side atomic pairing RPC
      const { data, error } = await supabase.rpc('join_matchmaking');

      if (error) {
        console.warn('[MatchmakingService] RPC join_matchmaking error:', error);

        // Fallback ONLY allowed when Supabase is completely unconfigured
        if (!isSupabaseConfigured) {
          console.info('[MatchmakingService] Running local development fallback for matchmaking');
          return this.handleLocalDevJoin(currentUserId);
        }

        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'MATCHMAKING_ERROR',
            message: error.message || 'Failed to join matchmaking queue on server.',
          },
        };
      }

      const res = data as {
        success?: boolean;
        error?: string;
        message?: string;
        status?: string;
        room_id?: string;
        queue_id?: string;
        peer?: {
          anonymous_username?: string;
          avatar_config?: AvatarConfig;
        };
      } | null;

      if (res && res.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: res.error || 'MATCHMAKING_REJECTED',
            message: res.message || 'Unable to join campus matchmaking pool.',
          },
        };
      }

      if (res?.status === 'matched' && res.room_id) {
        return {
          success: true,
          data: {
            status: 'matched',
            roomId: res.room_id,
            queueId: res.queue_id,
            peer: {
              anonymousUsername: res.peer?.anonymous_username || 'Anonymous RITian',
              avatarConfig: res.peer?.avatar_config || ({} as AvatarConfig),
            },
          },
          error: null,
        };
      }

      return {
        success: true,
        data: {
          status: 'searching',
          queueId: res?.queue_id,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown matchmaking error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Periodic heartbeat to maintain queue presence and check for match resolution.
   */
  async sendHeartbeat(): Promise<ApiResponse<MatchmakingResponse>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'No active session.' },
        };
      }

      // Check local dev fallback if offline
      if (!isSupabaseConfigured) {
        return this.handleLocalDevHeartbeat(currentUserId);
      }

      const { data, error } = await supabase.rpc('heartbeat_matchmaking');

      if (error) {
        if (!isSupabaseConfigured) {
          return this.handleLocalDevHeartbeat(currentUserId);
        }
        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'HEARTBEAT_FAILED',
            message: error.message || 'Matchmaking heartbeat failed on server.',
          },
        };
      }

      const res = data as {
        success?: boolean;
        error?: string;
        status?: string;
        room_id?: string;
        queue_id?: string;
        peer?: {
          anonymous_username?: string;
          avatar_config?: AvatarConfig;
        };
      } | null;

      if (res?.status === 'matched' && res.room_id) {
        return {
          success: true,
          data: {
            status: 'matched',
            roomId: res.room_id,
            queueId: res.queue_id,
            peer: {
              anonymousUsername: res.peer?.anonymous_username || 'Anonymous RITian',
              avatarConfig: res.peer?.avatar_config || ({} as AvatarConfig),
            },
          },
          error: null,
        };
      }

      return {
        success: true,
        data: {
          status: (res?.status as any) || 'searching',
          queueId: res?.queue_id,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Heartbeat failure';
      return {
        success: false,
        data: null,
        error: { code: 'HEARTBEAT_ERROR', message },
      };
    }
  }

  /**
   * Reliably cancels active queue presence when exiting the matching screen.
   */
  async leaveMatchmaking(): Promise<ApiResponse<void>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return { success: true, data: undefined, error: null };
      }

      // Local dev cleanup only if offline
      if (!isSupabaseConfigured) {
        this.handleLocalDevLeave(currentUserId);
        return { success: true, data: undefined, error: null };
      }

      await supabase.rpc('leave_matchmaking');
      return { success: true, data: undefined, error: null };
    } catch (err: unknown) {
      console.warn('[MatchmakingService] leaveMatchmaking error:', err);
      return { success: true, data: undefined, error: null };
    }
  }

  // =========================================================================
  // Local Development Simulation Registry
  // =========================================================================
  private handleLocalDevJoin(userId: string): ApiResponse<MatchmakingResponse> {
    // Check if already matched
    const existingMatch = localDevMatchedRooms.get(userId);
    if (existingMatch) {
      return {
        success: true,
        data: {
          status: 'matched',
          roomId: existingMatch.roomId,
          peer: existingMatch.peer,
        },
        error: null,
      };
    }

    const now = Date.now();
    // Prune stale local entries (> 25s)
    const validQueue = localDevQueue.filter(
      (item) => item.userId !== userId && now - item.heartbeatAt < 25000
    );

    if (validQueue.length > 0) {
      // Pair with the first waiting student
      const partner = validQueue.shift()!;
      const roomId = `room-rit-${Math.floor(1000 + Math.random() * 9000)}`;

      const partnerPeer: MatchedPeerPersona = {
        anonymousUsername: partner.username || 'QuietFalcon',
        avatarConfig: partner.avatarConfig,
      };

      const myPeer: MatchedPeerPersona = {
        anonymousUsername: 'CuriousOtter',
        avatarConfig: {
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
        },
      };

      localDevMatchedRooms.set(userId, { roomId, peer: partnerPeer });
      localDevMatchedRooms.set(partner.userId, { roomId, peer: myPeer });

      // Remove current user from queue
      const myIdx = localDevQueue.findIndex((i) => i.userId === userId);
      if (myIdx >= 0) localDevQueue.splice(myIdx, 1);

      return {
        success: true,
        data: {
          status: 'matched',
          roomId,
          peer: partnerPeer,
        },
        error: null,
      };
    }

    // No partner: Enqueue caller
    const existingIdx = localDevQueue.findIndex((i) => i.userId === userId);
    if (existingIdx >= 0) {
      localDevQueue[existingIdx].heartbeatAt = now;
    } else {
      localDevQueue.push({
        userId,
        joinedAt: now,
        heartbeatAt: now,
        username: 'SilentWolf',
        avatarConfig: {
          face: 'oval',
          skin: '#F3B183',
          hair: 'buzz',
          hairColor: '#000000',
          eyes: 'happy',
          eyebrows: 'natural',
          mouth: 'grin',
          shirt: 'hoodie',
          shirtColor: '#059669',
          accessory: 'none',
          background: 'emerald',
        },
      });
    }

    return {
      success: true,
      data: {
        status: 'searching',
        queueId: `local-queue-${userId}`,
      },
      error: null,
    };
  }

  private handleLocalDevHeartbeat(userId: string): ApiResponse<MatchmakingResponse> {
    const match = localDevMatchedRooms.get(userId);
    if (match) {
      return {
        success: true,
        data: {
          status: 'matched',
          roomId: match.roomId,
          peer: match.peer,
        },
        error: null,
      };
    }

    const item = localDevQueue.find((i) => i.userId === userId);
    if (item) {
      item.heartbeatAt = Date.now();
      return {
        success: true,
        data: { status: 'searching', queueId: `local-queue-${userId}` },
        error: null,
      };
    }

    return {
      success: true,
      data: { status: 'idle' },
      error: null,
    };
  }

  private handleLocalDevLeave(userId: string) {
    const idx = localDevQueue.findIndex((i) => i.userId === userId);
    if (idx >= 0) localDevQueue.splice(idx, 1);
    localDevMatchedRooms.delete(userId);
  }
}

export const matchmakingService = new MatchmakingService();
export default matchmakingService;
