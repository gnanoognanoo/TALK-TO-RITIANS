/**
 * ============================================================================
 * TALK TO RITIANS - Chat Request Service (Phase 3 Fix)
 * ============================================================================
 * Handles incoming random chat requests for online idle students:
 * - Query pending requests (with zero PII, requester effective anonymous persona only)
 * - Atomic accept (creates 7-minute active chat room)
 * - Reject (records exclusion, requester continues searching without knowing B rejected)
 * - Realtime subscriptions for recipient popups
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ApiResponse, MatchedPeerPersona, DEFAULT_AVATAR_CONFIG } from '../types';

export interface IncomingChatRequest {
  requestId: string;
  requester: MatchedPeerPersona;
  expiresAt: string;
  remainingSeconds: number;
}

export interface AcceptChatRequestResult {
  roomId: string;
  createdAt: string;
  expiresAt: string;
  peer: MatchedPeerPersona;
}

export class ChatRequestService {
  /**
   * Fetches the current user's active pending chat request if one exists.
   * Returns exclusively the requester's sanitized effective persona.
   */
  async getPendingRequest(): Promise<ApiResponse<IncomingChatRequest | null>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: true, data: null, error: null };
      }

      const { data, error } = await supabase.rpc('get_pending_chat_request');
      if (error) {
        console.warn('[ChatRequestService] get_pending_chat_request error:', error);
        return {
          success: false,
          data: null,
          error: { code: error.code || 'REQUEST_FETCH_FAILED', message: error.message },
        };
      }

      const res = data as any;
      if (!res || !res.has_request) {
        return { success: true, data: null, error: null };
      }

      const avatar =
        res.requester?.avatar_config && Object.keys(res.requester.avatar_config).length > 0
          ? res.requester.avatar_config
          : DEFAULT_AVATAR_CONFIG;

      return {
        success: true,
        data: {
          requestId: res.request_id,
          requester: {
            anonymousUsername: res.requester?.anonymous_username || 'Unknown User',
            avatarConfig: avatar,
          },
          expiresAt: res.expires_at,
          remainingSeconds: res.remaining_seconds ?? 20,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query chat requests';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Accepts an incoming chat request.
   * Server atomically locks request, checks ONE USER = ONE ACTIVE ROOM,
   * creates the 7-minute room, and matches both users.
   */
  async acceptChatRequest(
    requestId: string
  ): Promise<ApiResponse<AcceptChatRequestResult>> {
    try {
      if (!isSupabaseConfigured) {
        return {
          success: true,
          data: {
            roomId: 'mock-room-' + Date.now(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
            peer: {
              anonymousUsername: 'Nova',
              avatarConfig: DEFAULT_AVATAR_CONFIG,
            },
          },
          error: null,
        };
      }

      const { data, error } = await supabase.rpc('accept_chat_request', {
        p_request_id: requestId,
      });

      if (error) {
        console.warn('[ChatRequestService] accept_chat_request error:', error);
        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'ACCEPT_FAILED',
            message: error.message || 'Failed to accept chat request.',
          },
        };
      }

      const res = data as any;
      if (res && res.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: res.error || 'ACCEPT_REJECTED',
            message: res.message || 'Unable to accept chat request.',
          },
        };
      }

      const avatar =
        res.peer?.avatar_config && Object.keys(res.peer.avatar_config).length > 0
          ? res.peer.avatar_config
          : DEFAULT_AVATAR_CONFIG;

      return {
        success: true,
        data: {
          roomId: res.room_id,
          createdAt: res.created_at,
          expiresAt: res.expires_at,
          peer: {
            anonymousUsername: res.peer?.anonymous_username || 'Unknown User',
            avatarConfig: avatar,
          },
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Accept error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Rejects an incoming chat request.
   * Recipient remains on current screen; requester automatically resumes searching
   * without learning recipient identity.
   */
  async rejectChatRequest(requestId: string): Promise<ApiResponse<boolean>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: true, data: true, error: null };
      }

      const { data, error } = await supabase.rpc('reject_chat_request', {
        p_request_id: requestId,
      });

      if (error) {
        console.warn('[ChatRequestService] reject_chat_request error:', error);
        return {
          success: false,
          data: null,
          error: { code: error.code || 'REJECT_FAILED', message: error.message },
        };
      }

      const res = data as any;
      return {
        success: res?.success ?? true,
        data: true,
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reject error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Cancels a pending outgoing request.
   */
  async cancelChatRequest(requestId: string): Promise<ApiResponse<boolean>> {
    try {
      if (!isSupabaseConfigured) {
        return { success: true, data: true, error: null };
      }

      const { error } = await supabase.rpc('cancel_chat_request', {
        p_request_id: requestId,
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: error.code || 'CANCEL_FAILED', message: error.message },
        };
      }

      return { success: true, data: true, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cancel error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }
}

export const chatRequestService = new ChatRequestService();
export default chatRequestService;
