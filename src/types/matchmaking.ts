/**
 * ============================================================================
 * TALK TO RITIANS - Matchmaking Types
 * ============================================================================
 * Defines queue entry states, matchmaking status, and pairing contracts.
 */

/**
 * Lifecycle state of a user waiting in the matchmaking pool.
 */
export type MatchmakingStatus =
  | 'idle'       // Not currently looking for a match
  | 'searching'  // Waiting in queue for an available peer
  | 'matched'    // Matched with a peer, room created
  | 'failed'     // Matchmaking timed out or encountered an error
  | 'cancelled'; // User manually exited the queue

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
  matchedRoomId?: string | null;  // Created room UUID upon match
}

/**
 * Outcome payload returned upon successful matchmaking.
 */
export interface MatchResult {
  roomId: string;
  matchedAt: string;
}
