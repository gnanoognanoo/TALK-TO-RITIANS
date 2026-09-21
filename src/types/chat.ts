/**
 * ============================================================================
 * TALK TO RITIANS - Chat Types
 * ============================================================================
 * Defines 1-to-1 anonymous chat rooms, real-time messages, and session states.
 *
 * CRITICAL PRIVACY RULE:
 * Chat displays strictly:
 * - anonymous username
 * - avatar
 * - messages
 * Never displays real name, email, roll number, department, class, section,
 * batch, year, or gender.
 */

import { AnonymousIdentity } from './user';
import { MatchedPeerPersona } from './matchmaking';

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Status lifecycle of a 1-to-1 anonymous chat room.
 */
export type ChatRoomStatus =
  | 'active'     // Both participants are connected and chatting
  | 'skipped'    // A participant clicked Skip
  | 'ended';     // A participant clicked Leave or session closed

/**
 * Realtime Connection Status Lifecycle.
 */
export type ChatConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stranger disconnected';

/**
 * Type of message: regular participant text or automated system notice.
 */
export type ChatMessageType = 'text' | 'system';

export type ChatEndReason = 'skip' | 'leave' | 'disconnect' | 'timeout';

/**
 * Chat room representation.
 * RLS enforces that only room participants can read or interact with this room.
 */
export interface ChatRoom {
  id: string;                     // Unique Room UUID
  user1: string;                  // User UUID
  user2: string;                  // User UUID
  status: ChatRoomStatus;         // Current room state
  createdAt: string;              // ISO 8601 creation timestamp
  endedAt?: string | null;        // ISO 8601 completion timestamp
  endReason?: ChatEndReason | string | null;
}

/**
 * Individual chat message in a 1-to-1 conversation.
 * V1 supports text messages only (no media, audio, or files).
 */
export interface ChatMessage {
  id: string;                     // Message UUID
  roomId: string;                 // References ChatRoom(id)
  senderId: string;               // User UUID of the sender
  content: string;                // Plaintext sanitized message body
  createdAt: string;              // ISO 8601 timestamp
  messageType?: ChatMessageType;  // 'text' | 'system'
  isSystem?: boolean;             // Computed helper: true if messageType === 'system'
}

/**
 * Contextual representation of the chat partner presented to the local client.
 * Strictly guarantees anonymity.
 */
export interface ChatStranger {
  anonymousIdentity: AnonymousIdentity;
  isConnected: boolean;
}

export interface GetRoomPeerResult {
  roomId: string;
  roomStatus: ChatRoomStatus;
  peer: MatchedPeerPersona;
}
