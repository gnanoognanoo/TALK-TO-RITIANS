/**
 * ============================================================================
 * TALK TO RITIANS - Chat Types
 * ============================================================================
 * Defines 1-to-1 anonymous chat rooms, real-time messages, and session states.
 */

import { AnonymousIdentity } from './user';

/**
 * Status lifecycle of a 1-to-1 anonymous chat room.
 */
export type ChatRoomStatus =
  | 'active'     // Both participants are connected and chatting
  | 'skipped'    // One participant clicked Skip
  | 'ended';     // One or both participants Left or closed session

/**
 * Chat room representation.
 * RLS enforces that only participant1 or participant2 can read or join this room.
 */
export interface ChatRoom {
  id: string;                     // Unique Room UUID
  participant1Id: string;         // User UUID
  participant2Id: string;         // User UUID
  status: ChatRoomStatus;         // Current room state
  createdAt: string;              // ISO 8601 creation timestamp
  endedAt?: string | null;        // ISO 8601 completion timestamp
  endedBy?: string | null;        // User UUID who triggered skip or leave
}

/**
 * Individual chat message in a 1-to-1 conversation.
 * V1 supports text messages only (no media, audio, or files).
 */
export interface ChatMessage {
  id: string;                     // Message UUID
  roomId: string;                 // References ChatRoom(id)
  senderId: string;               // User UUID of the sender
  content: string;                // Plaintext message body
  createdAt: string;              // ISO 8601 timestamp
  isSystem?: boolean;             // True for automated notices (e.g., "Partner skipped")
}

/**
 * Contextual representation of the chat partner presented to the local client.
 * Strictly guarantees anonymity.
 */
export interface ChatStranger {
  anonymousIdentity: AnonymousIdentity;
  isTyping: boolean;
  isConnected: boolean;
}
