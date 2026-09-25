/**
 * ============================================================================
 * TALK TO RITIANS - Realtime Text Chat Service (Phase 10)
 * ============================================================================
 * Manages 1-to-1 anonymous chat sessions, message dispatch, real-time message
 * delivery, room termination (Skip/Leave), and partner persona resolution.
 *
 * CRITICAL PRIVACY RULE:
 * Chat displays strictly:
 * - anonymous username
 * - avatar
 * - messages
 * Never displays real name, email, roll number, department, class, section,
 * batch, year, or gender.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  ApiResponse,
  ChatMessage,
  ChatRoomStatus,
  ChatEndReason,
  GetRoomPeerResult,
  MatchedPeerPersona,
  MAX_MESSAGE_LENGTH,
} from '../types';

// In-memory simulation registry for offline local development
interface LocalRoomState {
  roomId: string;
  user1: string;
  user2: string;
  status: ChatRoomStatus;
  endReason?: ChatEndReason | null;
  messages: ChatMessage[];
  peerPersonas: Map<string, MatchedPeerPersona>;
  createdAt?: string;
  expiresAt?: string;
  user1HeartbeatAt?: number;
  user2HeartbeatAt?: number;
}

const localDevRooms = new Map<string, LocalRoomState>();

export class ChatService {
  private messageTimestamps: number[] = [];
  private lastSkipTime: number = 0;

  /**
   * Fetches chronological messages for the active conversation.
   * RLS guarantees only participants can read.
   */
  async getRoomMessages(roomId: string): Promise<ApiResponse<ChatMessage[]>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to view messages.' },
        };
      }

      // Check local dev fallback if offline
      if (!isSupabaseConfigured) {
        const localRoom = localDevRooms.get(roomId);
        return {
          success: true,
          data: localRoom ? [...localRoom.messages] : [],
          error: null,
        };
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[ChatService] getRoomMessages error:', error);
        if (!isSupabaseConfigured) {
          const localRoom = localDevRooms.get(roomId);
          return {
            success: true,
            data: localRoom ? [...localRoom.messages] : [],
            error: null,
          };
        }
        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'MESSAGES_FETCH_FAILED',
            message: error.message || 'Failed to fetch messages.',
          },
        };
      }

      const formatted: ChatMessage[] = (data || []).map((row) => ({
        id: row.id,
        roomId: row.room_id,
        senderId: row.sender_id,
        content: row.content,
        createdAt: row.created_at,
        messageType: row.message_type as any,
        isSystem: row.message_type === 'system',
      }));

      return {
        success: true,
        data: formatted,
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Resolves the stranger's sanitized anonymous persona for the room.
   * CRITICAL PRIVACY: Returns exclusively anonymous handle & avatar.
   */
  async getRoomPeer(roomId: string): Promise<ApiResponse<GetRoomPeerResult>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
        };
      }

      // Check local dev fallback
      if (!isSupabaseConfigured) {
        const local = localDevRooms.get(roomId);
        const peer = local?.peerPersonas.get(currentUserId) || {
          anonymousUsername: 'Anonymous RITian',
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
        if (local?.status === 'active' && local?.expiresAt && Date.now() >= new Date(local.expiresAt).getTime()) {
          local.status = 'ended';
          local.endReason = 'time_limit';
        }

        return {
          success: true,
          data: {
            roomId,
            roomStatus: local?.status || 'active',
            createdAt: local?.createdAt,
            expiresAt: local?.expiresAt,
            endReason: local?.endReason,
            peer,
          },
          error: null,
        };
      }

      const { data, error } = await supabase.rpc('get_room_peer', {
        p_room_id: roomId,
      });

      if (error) {
        console.warn('[ChatService] get_room_peer error:', error);
        if (!isSupabaseConfigured) {
          return {
            success: true,
            data: {
              roomId,
              roomStatus: 'active',
              peer: {
                anonymousUsername: 'Anonymous RITian',
                avatarConfig: {} as any,
              },
            },
            error: null,
          };
        }
        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'PEER_RESOLUTION_FAILED',
            message: error.message || 'Failed to resolve peer profile.',
          },
        };
      }

      const res = data as any;
      return {
        success: true,
        data: {
          roomId: res.room_id || roomId,
          roomStatus: res.room_status || 'active',
          createdAt: res.created_at,
          expiresAt: res.expires_at,
          endReason: res.end_reason,
          peer: {
            anonymousUsername: res.peer?.anonymous_username || 'Anonymous RITian',
            avatarConfig: res.peer?.avatar_config || {},
          },
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resolve peer';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Sends a message to the active chat room.
   * Enforces 1-1000 length validation and active room status.
   */
  async sendMessage(roomId: string, content: string): Promise<ApiResponse<ChatMessage>> {
    try {
      // 0. Rate limiting check: max 6 messages per 3 seconds
      const now = Date.now();
      this.messageTimestamps = this.messageTimestamps.filter((t) => now - t < 3000);
      if (this.messageTimestamps.length >= 6) {
        return {
          success: false,
          data: null,
          error: {
            code: 'RATE_LIMITED',
            message: 'You are sending messages too quickly. Please wait a moment.',
          },
        };
      }
      this.messageTimestamps.push(now);

      const trimmed = content.trim();

      // 1. Validation
      if (!trimmed || trimmed.length === 0) {
        return {
          success: false,
          data: null,
          error: { code: 'EMPTY_MESSAGE', message: 'Message cannot be empty.' },
        };
      }

      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        return {
          success: false,
          data: null,
          error: {
            code: 'MESSAGE_TOO_LONG',
            message: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`,
          },
        };
      }

      // 2. Session check
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to send messages.' },
        };
      }

      // Local development fallback
      if (!isSupabaseConfigured) {
        const local = localDevRooms.get(roomId);

        if (local) {
          if (local.status !== 'active') {
            return {
              success: false,
              data: null,
              error: {
                code: 'ROOM_INACTIVE',
                message: 'This conversation has ended and is closed to new messages.',
              },
            };
          }

          if (local.expiresAt && Date.now() >= new Date(local.expiresAt).getTime()) {
            local.status = 'ended';
            local.endReason = 'time_limit';
            return {
              success: false,
              data: null,
              error: {
                code: 'ROOM_EXPIRED',
                message: 'This 7-minute conversation has expired.',
              },
            };
          }
        }

        const nowIso = new Date().toISOString();
        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          roomId,
          senderId: currentUserId,
          content: trimmed,
          createdAt: nowIso,
          messageType: 'text',
          isSystem: false,
        };

        if (local) {
          local.messages.push(newMsg);
        } else {
          localDevRooms.set(roomId, {
            roomId,
            user1: currentUserId,
            user2: 'peer-simulated',
            status: 'active',
            createdAt: nowIso,
            expiresAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
            messages: [newMsg],
            peerPersonas: new Map(),
          });
        }

        return {
          success: true,
          data: newMsg,
          error: null,
        };
      }

      // 3. Call server-side RPC
      const { data, error } = await supabase.rpc('send_chat_message', {
        p_room_id: roomId,
        p_content: trimmed,
      });

      if (error) {
        console.warn('[ChatService] send_chat_message error:', error);
        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'SEND_FAILED',
            message: error.message || 'Failed to send message.',
          },
        };
      }

      const res = data as any;
      if (res && res.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: res.error || 'SEND_REJECTED',
            message: res.message || 'Unable to send message.',
          },
        };
      }

      const msg = res?.message;
      return {
        success: true,
        data: {
          id: msg?.id,
          roomId: msg?.room_id,
          senderId: msg?.sender_id,
          content: msg?.content,
          createdAt: msg?.created_at,
          messageType: msg?.message_type,
          isSystem: msg?.message_type === 'system',
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown send error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Terminates the chat room (Skip, Leave, or Disconnect).
   * Step 1 & 2: Server-side room termination setting status = ended, ended_at, end_reason.
   * Step 5: Inserts system notification "Stranger disconnected."
   */
  async endRoom(roomId: string, reason: ChatEndReason = 'leave'): Promise<ApiResponse<{ status: string; endReason: string }>> {
    try {
      // Rate limiting: cooldown on skip spam
      if (reason === 'skip') {
        const now = Date.now();
        if (now - this.lastSkipTime < 1500) {
          return {
            success: false,
            data: null,
            error: {
              code: 'RATE_LIMITED',
              message: 'Please wait a moment before skipping again.',
            },
          };
        }
        this.lastSkipTime = now;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return { success: true, data: { status: 'ended', endReason: reason }, error: null };
      }

      // Local fallback
      const local = localDevRooms.get(roomId);
      if (local) {
        local.status = 'ended';
        local.endReason = reason;

        // Push system message
        local.messages.push({
          id: `sys-${Date.now()}`,
          roomId,
          senderId: currentUserId,
          content: 'Stranger disconnected.',
          createdAt: new Date().toISOString(),
          messageType: 'system',
          isSystem: true,
        });
      }

      if (isSupabaseConfigured) {
        await supabase.rpc('end_chat_room', {
          p_room_id: roomId,
          p_reason: reason,
        });
      }

      return {
        success: true,
        data: { status: 'ended', endReason: reason },
        error: null,
      };
    } catch (err: unknown) {
      console.warn('[ChatService] endRoom error:', err);
      return { success: true, data: { status: 'ended', endReason: reason }, error: null };
    }
  }

  /**
   * Room Heartbeat (Step 1 & Step 3)
   * Sends heartbeat for active chat session, detecting meaningful peer disconnection.
   */
  async heartbeatRoom(roomId: string): Promise<ApiResponse<{ status: string; isActive: boolean; peerDisconnected: boolean }>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return { success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Not signed in.' } };
      }

      if (!isSupabaseConfigured) {
        const local = localDevRooms.get(roomId);
        if (!local) {
          return { success: false, data: null, error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } };
        }

        const now = Date.now();

        if (local.expiresAt && now >= new Date(local.expiresAt).getTime() && local.status === 'active') {
          local.status = 'ended';
          local.endReason = 'time_limit';
          return {
            success: true,
            data: {
              status: 'ended',
              isActive: false,
              peerDisconnected: false,
            },
            error: null,
          };
        }

        if (local.user1 === currentUserId) {
          local.user1HeartbeatAt = now;
        } else {
          local.user2HeartbeatAt = now;
        }

        const peerHeartbeat = local.user1 === currentUserId ? local.user2HeartbeatAt : local.user1HeartbeatAt;
        const peerTimedOut = peerHeartbeat ? now - peerHeartbeat > 35000 : false;

        if (peerTimedOut && local.status === 'active') {
          local.status = 'ended';
          local.endReason = 'disconnect';
          local.messages.push({
            id: `sys-${Date.now()}`,
            roomId,
            senderId: currentUserId,
            content: 'Stranger disconnected.',
            createdAt: new Date().toISOString(),
            messageType: 'system',
            isSystem: true,
          });
        }

        return {
          success: true,
          data: {
            status: local.status,
            isActive: local.status === 'active',
            peerDisconnected: local.status !== 'active',
          },
          error: null,
        };
      }

      const { data, error } = await supabase.rpc('heartbeat_chat_room', { p_room_id: roomId });
      if (error) {
        return {
          success: true,
          data: { status: 'active', isActive: true, peerDisconnected: false },
          error: null,
        };
      }

      const res = data as any;
      return {
        success: true,
        data: {
          status: res?.status || 'active',
          isActive: res?.is_active ?? true,
          peerDisconnected: res?.peer_disconnected ?? false,
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: true,
        data: { status: 'active', isActive: true, peerDisconnected: false },
        error: null,
      };
    }
  }

  /**
   * Reconnect Room (Step 4 & Step 6)
   * Restores active room state and synchronizes messages without creating new rooms.
   */
  async reconnectRoom(
    roomId: string
  ): Promise<ApiResponse<{
    status: ChatRoomStatus;
    messages: ChatMessage[];
    peer: MatchedPeerPersona | null;
    createdAt?: string;
    expiresAt?: string;
    endReason?: ChatEndReason | string | null;
  }>> {
    try {
      const [peerRes, msgRes] = await Promise.all([
        this.getRoomPeer(roomId),
        this.getRoomMessages(roomId),
      ]);

      if (!peerRes.success || !peerRes.data) {
        return {
          success: false,
          data: null,
          error: { code: 'RECONNECT_FAILED', message: 'Unable to restore conversation.' },
        };
      }

      return {
        success: true,
        data: {
          status: peerRes.data.roomStatus,
          messages: msgRes.success && msgRes.data ? msgRes.data : [],
          peer: peerRes.data.peer,
          createdAt: peerRes.data.createdAt,
          expiresAt: peerRes.data.expiresAt,
          endReason: peerRes.data.endReason,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reconnect failed';
      return {
        success: false,
        data: null,
        error: { code: 'RECONNECT_ERROR', message },
      };
    }
  }

  /**
   * Helper for tests or local dev to pre-seed room state.
   */
  seedLocalRoom(
    roomId: string,
    user1: string,
    user2: string,
    peerA: MatchedPeerPersona,
    peerB: MatchedPeerPersona,
    expiresAt?: string,
    createdAt?: string
  ) {
    const peers = new Map<string, MatchedPeerPersona>();
    peers.set(user1, peerB);
    peers.set(user2, peerA);

    const now = new Date();
    localDevRooms.set(roomId, {
      roomId,
      user1,
      user2,
      status: 'active',
      messages: [],
      peerPersonas: peers,
      createdAt: createdAt || now.toISOString(),
      expiresAt: expiresAt || new Date(now.getTime() + 7 * 60 * 1000).toISOString(),
    });
  }
}

export const chatService = new ChatService();
export default chatService;
