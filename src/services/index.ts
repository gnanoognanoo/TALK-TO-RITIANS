/**
 * ============================================================================
 * TALK TO RITIANS - Service Interfaces & Contracts
 * ============================================================================
 * Defines the contract boundaries between the React UI layer (Person A)
 * and the Supabase Backend/Data Access layer (Person B).
 */

import {
  User,
  Profile,
  CollegeIdentity,
  ChatMessage,
  ChatRoom,
  MatchmakingQueueEntry,
  ParsedQRIdentity,
  ApiResponse,
} from '../types';

/**
 * Authentication Service Contract
 */
export interface IAuthService {
  getCurrentUser(): Promise<ApiResponse<User>>;
  signInWithPersonalEmail(email: string): Promise<ApiResponse<{ confirmationSent: boolean }>>;
  signOut(): Promise<ApiResponse<void>>;
}

/**
 * College Identity Verification Contract
 */
export interface IVerificationService {
  /**
   * Links a verified college QR payload to the authenticated user.
   * Enforces 1-to-1 uniqueness (one college ID cannot link multiple accounts).
   */
  linkCollegeIdentity(qrPayload: ParsedQRIdentity): Promise<ApiResponse<CollegeIdentity>>;
}

/**
 * Profile & Anonymous Avatar Contract
 */
export interface IProfileService {
  getProfile(userId: string): Promise<ApiResponse<Profile>>;
  upsertProfile(params: {
    anonymousUsername: string;
    avatarId: string;
    avatarConfig?: Record<string, unknown>;
    bio?: string;
  }): Promise<ApiResponse<Profile>>;
}

/**
 * Matchmaking Service Contract
 */
export interface IMatchmakingService {
  joinMatchmaking(): Promise<ApiResponse<MatchmakingQueueEntry>>;
  leaveMatchmaking(): Promise<ApiResponse<void>>;
}

/**
 * Real-time 1-to-1 Anonymous Chat Contract
 */
export interface IChatService {
  getRoom(roomId: string): Promise<ApiResponse<ChatRoom>>;
  sendMessage(roomId: string, content: string): Promise<ApiResponse<ChatMessage>>;
  skipChat(roomId: string): Promise<ApiResponse<void>>;
  leaveChat(roomId: string): Promise<ApiResponse<void>>;
}

export * from './authService';
export * from './qrParser';
export * from './verificationService';
