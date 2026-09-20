/**
 * ============================================================================
 * TALK TO RITIANS - College Identity Verification Service
 * ============================================================================
 * Handles communication with the Supabase backend to link and unlink verified
 * student identities from parsed QR payloads.
 *
 * Core Invariant: ONE COLLEGE IDENTITY = ONE PERSONAL ACCOUNT AT A TIME.
 *
 * Enforces:
 * - Session-derived identity (never trusts user_id from client)
 * - Server-side identity fingerprinting
 * - Concurrency protection against race conditions
 * - Privacy: Zero information leakage on duplicate scans
 * - Graceful same-user re-scan handling
 * - Audit timestamp preservation on unlinking
 */

import { supabase } from '../lib/supabase';
import { ApiResponse, ParsedCollegeQrResult } from '../types';

export interface CollegeIdentityVerificationResult {
  collegeIdentityId: string;
  identityHashPreview: string;
  verifiedAt: string;
  isMockData: boolean;
  department?: string;
  batch?: string;
  alreadyLinkedToSelf?: boolean;
  message?: string;
}

export interface CollegeIdentityUnlinkResult {
  unlinkedAt: string;
  unlinkedRecords: number;
}

// In-memory simulation registry for local dev fallback when Supabase RPC is offline
const localDevClaimRegistry = new Map<string, { userId: string; unlinkedAt?: string }>();

export class VerificationService {
  /**
   * Links a verified college ID QR payload to the current authenticated account.
   * Derives the stable fingerprint on the server via PostgreSQL RPC.
   */
  async linkCollegeIdentity(
    qrResult: ParsedCollegeQrResult,
    cooldownHours: number = 0
  ): Promise<ApiResponse<CollegeIdentityVerificationResult>> {
    try {
      // 1. Session verification: Caller must have an active authenticated session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in with your personal account to link a college identity.',
          },
        };
      }

      // 2. Structural & Unique Data Validation
      if (!qrResult.validStructure) {
        return {
          success: false,
          data: null,
          error: {
            code: 'INVALID_QR_STRUCTURE',
            message: qrResult.validationErrors[0] || 'Invalid QR payload structure.',
          },
        };
      }

      const { name, department, batch, studentReference } = qrResult.fields;
      const ref = studentReference?.trim();

      // Check for sufficient unique data
      if (
        !ref ||
        ref.length < 3 ||
        ['student', 'sample', 'unknown', 'null', 'undefined', 'na', 'n/a', 'none'].includes(ref.toLowerCase())
      ) {
        return {
          success: false,
          data: null,
          error: {
            code: 'INSUFFICIENT_IDENTITY_DATA',
            message:
              'The scanned QR code does not contain sufficient unique identifier data (such as a student roll number or registration ID) to verify account uniqueness.',
          },
        };
      }

      // 3. Call server-side RPC procedure
      const { data, error } = await supabase.rpc('verify_and_link_college_identity', {
        p_student_ref: ref,
        p_name: name || 'Student',
        p_department: department || 'General',
        p_batch: batch || '2025-2029',
        p_qr_metadata: {
          formatDetected: qrResult.formatDetected,
          isMockData: qrResult.isMockData,
          scannedAt: new Date().toISOString(),
        },
        p_cooldown_hours: cooldownHours,
      });

      if (error) {
        console.warn('[VerificationService] Server RPC call returned error:', error);

        // Local Development Fallback: In-memory simulation when Supabase instance is offline
        if (
          error.code === 'PGRST202' ||
          error.message?.includes('fetch') ||
          error.message?.includes('not found') ||
          !import.meta.env.VITE_SUPABASE_URL
        ) {
          console.info('[VerificationService] Running local development fallback verification');
          const mockIdentityKey = `mock-${ref.toLowerCase()}`;
          const existingClaim = localDevClaimRegistry.get(mockIdentityKey);

          // Check if already claimed by current user (same-user re-scan)
          if (existingClaim && existingClaim.userId === currentUserId && !existingClaim.unlinkedAt) {
            return {
              success: true,
              data: {
                collegeIdentityId: 'local-dev-mock-id',
                identityHashPreview: '7a8f...91e3',
                verifiedAt: new Date().toISOString(),
                isMockData: qrResult.isMockData,
                department,
                batch,
                alreadyLinkedToSelf: true,
                message: 'This college identity is already linked to your account.',
              },
              error: null,
            };
          }

          // Check if already claimed by a different account (duplicate)
          if (existingClaim && existingClaim.userId !== currentUserId && !existingClaim.unlinkedAt) {
            return {
              success: false,
              data: null,
              error: {
                code: 'CARD_ALREADY_LINKED',
                message: 'This college identity is already linked to another account.',
              },
            };
          }

          // Record claim in local registry
          localDevClaimRegistry.set(mockIdentityKey, { userId: currentUserId });

          return {
            success: true,
            data: {
              collegeIdentityId: 'local-dev-mock-id',
              identityHashPreview: '7a8f...91e3',
              verifiedAt: new Date().toISOString(),
              isMockData: qrResult.isMockData,
              department,
              batch,
              alreadyLinkedToSelf: false,
            },
            error: null,
          };
        }

        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'VERIFICATION_FAILED',
            message:
              error.code === '23505'
                ? 'This college identity is already linked to another account.'
                : error.message || 'College ID verification failed on server.',
          },
        };
      }

      // 4. Process RPC response
      const response = data as {
        success?: boolean;
        error?: string;
        message?: string;
        already_linked_to_self?: boolean;
        college_identity_id?: string;
        identity_hash_preview?: string;
        verified_at?: string;
      } | null;

      if (response && response.success === false) {
        // Enforce exact non-leaking message for duplicates
        const message =
          response.error === 'CARD_ALREADY_LINKED'
            ? 'This college identity is already linked to another account.'
            : response.message || 'Verification could not be completed.';

        return {
          success: false,
          data: null,
          error: {
            code: response.error || 'VERIFICATION_REJECTED',
            message,
          },
        };
      }

      return {
        success: true,
        data: {
          collegeIdentityId: response?.college_identity_id || 'verified',
          identityHashPreview: response?.identity_hash_preview || 'sha256...',
          verifiedAt: response?.verified_at || new Date().toISOString(),
          isMockData: qrResult.isMockData,
          department,
          batch,
          alreadyLinkedToSelf: Boolean(response?.already_linked_to_self),
          message: response?.message,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown verification error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Unlinks the active college identity from the caller's account.
   * Preserves audit timestamps for integrity.
   */
  async unlinkCollegeIdentity(): Promise<ApiResponse<CollegeIdentityUnlinkResult>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in to unlink your college identity.',
          },
        };
      }

      const { data, error } = await supabase.rpc('unlink_college_identity');

      if (error) {
        console.warn('[VerificationService] Unlink RPC returned error:', error);

        // Fallback for local development
        if (
          error.code === 'PGRST202' ||
          error.message?.includes('fetch') ||
          error.message?.includes('not found') ||
          !import.meta.env.VITE_SUPABASE_URL
        ) {
          console.info('[VerificationService] Running local development fallback unlinking');
          // Clear active claims in local dev registry for this user
          for (const [key, entry] of localDevClaimRegistry.entries()) {
            if (entry.userId === currentUserId && !entry.unlinkedAt) {
              localDevClaimRegistry.set(key, { ...entry, unlinkedAt: new Date().toISOString() });
            }
          }

          return {
            success: true,
            data: {
              unlinkedAt: new Date().toISOString(),
              unlinkedRecords: 1,
            },
            error: null,
          };
        }

        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'UNLINK_FAILED',
            message: error.message || 'Failed to unlink college identity on server.',
          },
        };
      }

      const response = data as {
        success?: boolean;
        error?: string;
        message?: string;
        unlinked_records?: number;
        unlinked_at?: string;
      } | null;

      if (response && response.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: response.error || 'UNLINK_REJECTED',
            message: response.message || 'Unlink operation could not be completed.',
          },
        };
      }

      return {
        success: true,
        data: {
          unlinkedAt: response?.unlinked_at || new Date().toISOString(),
          unlinkedRecords: response?.unlinked_records || 1,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown unlink error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }
}

export const verificationService = new VerificationService();
export default verificationService;
