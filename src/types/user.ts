/**
 * ============================================================================
 * TALK TO RITIANS - User & Identity Types
 * ============================================================================
 * Defines user records, private college identity, profile onboarding state,
 * and public anonymous identities.
 */

import { AvatarConfig } from './avatar';

/**
 * Account verification and onboarding states.
 */
export type UserAccountState =
  | 'unverified'       // Authenticated via personal email, not yet verified college ID
  | 'verified'         // College ID verified, profile not yet fully completed
  | 'onboarded'        // Profile + anonymous identity created, ready for matchmaking
  | 'suspended';       // Administrative moderation hold

/**
 * Authenticated Application User (Client-accessible session representation).
 * Links the Supabase auth user with application onboarding stage.
 */
export interface User {
  id: string;                      // Supabase Auth UUID (auth.users.id)
  email: string;                   // Personal email used for registration
  accountState: UserAccountState;  // Current lifecycle status
  isCollegeVerified: boolean;      // True once college ID QR is validated and linked
  createdAt: string;               // ISO 8601 timestamp
  updatedAt: string;               // ISO 8601 timestamp
}

/**
 * Private College Identity linked to a user account.
 * CRITICAL PRIVACY RULE: This data is strictly private.
 * It is accessible ONLY to the verified user themselves (or elevated backend RPC),
 * and is NEVER disclosed to chat strangers or public APIs.
 *
 * NOTE: Fields remain flexible until the physical college ID QR code structure
 * is inspected and finalized.
 */
export interface CollegeIdentity {
  id: string;                      // Primary key
  userId: string;                  // References User(id)
  collegeIdHash: string;           // One-way cryptographic hash to enforce 1-to-1 uniqueness
  registerNumber?: string;         // College Register / Roll Number (Private)
  collegeEmail?: string;           // @rajalakshmi.edu.in or equivalent (Private)
  fullName?: string;               // Official student name (Private)
  department?: string;             // Engineering / Academic department (Private)
  section?: string;                // Section / Division (Private)
  batch?: string;                  // Academic batch year (Private)
  graduationYear?: number;         // Projected graduation year (Private)
  gender?: string;                 // Self-reported or card gender (Private)
  verifiedAt: string;              // ISO 8601 timestamp of verification
}

/**
 * User Profile information.
 * Tracks both private configuration and anonymous display metadata.
 */
export interface Profile {
  id: string;                      // References User(id)
  anonymousUsername: string;       // Chosen anonymous display handle (e.g., "CosmicOwl")
  avatarId: string;                // Identifier for chosen avatar/preset
  avatarConfig?: AvatarConfig | Record<string, unknown>; // Custom color/accessory attributes
  bio?: string;                    // Short optional anonymous tag
  interests?: string[];            // Optional topics for post-V1, placeholder in V1
  createdAt: string;               // ISO 8601 timestamp
  updatedAt: string;               // ISO 8601 timestamp
}

/**
 * Public Anonymous Identity.
 * THIS IS THE ONLY IDENTITY DATA A CHAT STRANGER IS PERMITTED TO SEE.
 * Must NOT contain any personal names, emails, register numbers, department, etc.
 */
export interface AnonymousIdentity {
  anonymousUsername: string;       // Public pseudonym
  avatarId: string;                // Public avatar identifier
  avatarConfig?: AvatarConfig | Record<string, unknown>; // Visual rendering properties
}
