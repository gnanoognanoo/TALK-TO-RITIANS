/**
 * ============================================================================
 * TALK TO RITIANS - Matchmaking Types
 * ============================================================================
 * Defines queue entry states, matchmaking status, and pairing contracts.
 *
 * CRITICAL PRIVACY RULE:
 * Matched peer payload returns exclusively anonymous public identity data
 * (anonymous username and vector avatar configuration). Zero real names,
 * emails, roll numbers, departments, sections, batches, or genders.
 */

import { AvatarConfig } from './avatar';

/**
 * Lifecycle state of a user waiting in the matchmaking pool.
 */
export type MatchmakingStatus =
  | 'idle'       // Not currently looking for a match
  | 'searching'  // Waiting in queue for an available peer
  | 'matched'    // Matched with a peer, room created
  | 'failed'     // Matchmaking timed out or encountered an error
  | 'cancelled'  // User manually exited the queue
  | 'expired';   // Queue entry expired due to lost heartbeat

/**
 * Representation of a user record waiting in the matchmaking pool.
 * Note: In V1, matchmaking is completely random among verified students.
 * No department, year, or gender filters exist in V1.
 */
export interface MatchmakingQueueEntry {
  id: string;                     // Queue record UUID
  userId: string;                 // User UUID searching for chat
  joinedAt: string;               // ISO 8601 timestamp
  status: MatchmakingStatus;      // Current queue status
  heartbeatAt: string;            // ISO 8601 timestamp
  matchedRoomId?: string | null;  // Created room UUID upon match
  matchedUserId?: string | null;  // Matched peer UUID
}

/**
 * Public Anonymous Peer Persona received by the frontend upon match.
 * Strictly guarantees ZERO disclosure of real identity or cohort details.
 */
export interface MatchedPeerPersona {
  anonymousUsername: string;
  avatarConfig: AvatarConfig;
}

/**
 * Outcome payload returned upon successful matchmaking.
 */
export interface MatchResult {
  roomId: string;
  matchedAt: string;
  peer: MatchedPeerPersona;
}

/**
 * Response contract from matchmaking operations.
 */
export interface MatchmakingResponse {
  status: MatchmakingStatus;
  roomId?: string;
  queueId?: string;
  peer?: MatchedPeerPersona;
  message?: string;
}
