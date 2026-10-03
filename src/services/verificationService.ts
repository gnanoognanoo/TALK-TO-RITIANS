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

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ApiResponse, ParsedCollegeQrResult } from '../types';
import { validateRitQrUrl } from './qrParser';
import { normalizeRegisterNumber } from './legacyCardParser';

export interface CollegeIdentityVerificationResult {
  verified?: boolean;
  identityLinked?: boolean;
  collegeIdentityId: string;
  identityHashPreview: string;
  verifiedAt: string;
  isMockData: boolean;
  name?: string;
  department?: string;
  batch?: string;
  verificationMethod?: string;
  alreadyLinkedToSelf?: boolean;
  message?: string;
  officialHost?: string;
}

export interface CollegeIdentityUnlinkResult {
  unlinkedAt: string;
  unlinkedRecords: number;
}


// In-memory simulation registry for local dev fallback when Supabase RPC is offline
const localDevClaimRegistry = new Map<string, { userId: string; unlinkedAt?: string }>();

export class VerificationService {
  private lastScanTime: number = 0;

  /**
   * Verifies an official RIT student ID QR URL via the secure server-side Edge Function.
   * Fetches official webpage, parses Student Name/Register Number/Course/Batch,
   * generates deterministic identity hash from Register Number, and links in database.
   */
  async verifyRitQrUrl(
    qrUrl: string
  ): Promise<ApiResponse<CollegeIdentityVerificationResult>> {
    try {
      // 0. Rate limiting check: enforce minimum 1.5s between scan attempts
      const now = Date.now();
      if (now - this.lastScanTime < 1500) {
        return {
          success: false,
          data: null,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many QR scan attempts. Please wait a moment before trying again.',
          },
        };
      }
      this.lastScanTime = now;

      // 1. Local URL & Domain validation (fail-fast before network)
      const urlValidation = validateRitQrUrl(qrUrl);
      if (!urlValidation.isValid) {
        return {
          success: false,
          data: null,
          error: {
            code: urlValidation.errorCode || 'INVALID_QR',
            message: urlValidation.errorMessage || 'This QR is not a recognized RIT student ID.',
          },
        };
      }

      // 2. Session verification: Caller must have an active authenticated session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Your session expired. Please sign in again.',
          },
        };
      }

      // 3. Call secure Supabase Edge Function: verify-rit-id
      const { data, error } = await supabase.functions.invoke('verify-rit-id', {
        body: { qrUrl },
      });

      if (error) {
        console.warn('[VerificationService] Edge function invoke error:', error);

        // Attempt to extract response data if returned by edge function
        let edgeErrorData: any = null;
        if (error && typeof error === 'object' && 'context' in error) {
          try {
            const ctx = (error as any).context;
            if (typeof ctx?.json === 'function') {
              edgeErrorData = await ctx.clone?.().json().catch(() => ctx.json());
            }
          } catch {
            // Ignore context parsing failure
          }
        }

        const errorCode = edgeErrorData?.error || (error as any)?.code || 'EDGE_FUNCTION_UNAVAILABLE';
        let userMessage = edgeErrorData?.message || error.message || 'College ID verification failed.';

        if (errorCode === 'IDENTITY_ALREADY_LINKED' || errorCode === 'CARD_ALREADY_LINKED' || userMessage.includes('already linked')) {
          userMessage = 'This RIT ID is already linked to another account.';
        } else if (errorCode === 'AUTH_REQUIRED' || errorCode === 'UNAUTHENTICATED') {
          userMessage = 'Your session expired. Please sign in again.';
        } else if (errorCode === 'UNSUPPORTED_COURSE_FORMAT') {
          userMessage = "We verified your RIT identity, but we couldn't recognize your course format yet. Please try again later.";
        } else if (errorCode === 'INVALID_RIT_QR' || errorCode === 'INVALID_QR' || errorCode === 'UNSUPPORTED_DOMAIN' || errorCode === 'INVALID_RIT_DOMAIN' || errorCode === 'INSECURE_PROTOCOL') {
          userMessage = "This doesn't appear to be a valid RIT ID QR code.";
        } else if (errorCode === 'IMS_TIMEOUT') {
          userMessage = 'Official RIT verification portal timed out. Please try again.';
        } else if (errorCode === 'IMS_FETCH_FAILED' || errorCode === 'RIT_PAGE_UNAVAILABLE' || errorCode === 'RIT_PAGE_FETCH_FAILED') {
          userMessage = 'RIT verification service is temporarily unavailable. Please try again shortly.';
        } else if (errorCode === 'IMS_PAGE_CHANGED' || errorCode === 'INVALID_RIT_PAGE' || errorCode === 'RIT_PAGE_FORMAT_UNSUPPORTED') {
          userMessage = "We couldn't read this RIT ID. Please try again later.";
        } else if (errorCode === 'IMS_STUDENT_NOT_FOUND') {
          userMessage = 'Student record could not be found on the official RIT portal.';
        } else if (errorCode === 'DATABASE_LINK_FAILED') {
          userMessage = 'Failed to link your student identity. Please try again.';
        } else if (errorCode === 'EDGE_FUNCTION_UNAVAILABLE' || errorCode === 'NETWORK_ERROR' || errorCode === 'SERVER_ERROR') {
          userMessage = 'RIT verification service is temporarily unavailable. Please try again shortly.';
        }

        return {
          success: false,
          data: null,
          error: {
            code: errorCode,
            message: userMessage,
          },
        };
      }

      const response = data as {
        valid?: boolean;
        success?: boolean;
        error?: string;
        message?: string;
        source?: string;
        name?: string;
        registerNumber?: string;
        course?: string;
        department?: string;
        batch?: string;
        officialHost?: string;
        collegeIdentityId?: string;
        identityHashPreview?: string;
        alreadyLinkedToSelf?: boolean;
        verifiedAt?: string;
        verificationMethod?: string;
      } | null;

      if (!response || response.success === false) {
        const errorCode = response?.error || 'VERIFICATION_FAILED';
        let errorMessage = response?.message || 'Verification could not be completed.';
        if (errorCode === 'IDENTITY_ALREADY_LINKED' || errorCode === 'CARD_ALREADY_LINKED') {
          errorMessage = 'This RIT ID is already linked to another account.';
        } else if (errorCode === 'UNSUPPORTED_COURSE_FORMAT') {
          errorMessage = "We verified your RIT identity, but we couldn't recognize your course format yet. Please try again later.";
        } else if (errorCode === 'IMS_PAGE_CHANGED') {
          errorMessage = "We couldn't read this RIT ID. Please try again later.";
        } else if (errorCode === 'IMS_STUDENT_NOT_FOUND') {
          errorMessage = 'Student record could not be found on the official RIT portal.';
        } else if (errorCode === 'IMS_FETCH_FAILED') {
          errorMessage = 'RIT verification service is temporarily unavailable. Please try again shortly.';
        } else if (errorCode === 'AUTH_REQUIRED' || errorCode === 'UNAUTHENTICATED') {
          errorMessage = 'Your session expired. Please sign in again.';
        }
        return {
          success: false,
          data: null,
          error: {
            code: errorCode,
            message: errorMessage,
          },
        };
      }

      return {
        success: true,
        data: {
          verified: true,
          identityLinked: true,
          collegeIdentityId: response.collegeIdentityId || 'verified',
          identityHashPreview: response.identityHashPreview || 'sha256...',
          verifiedAt: response.verifiedAt || new Date().toISOString(),
          isMockData: false,
          name: response.name,
          department: response.department,
          batch: response.batch,
          verificationMethod: response.verificationMethod || 'physical_id_ims',
          alreadyLinkedToSelf: Boolean(response.alreadyLinkedToSelf),
          officialHost: response.officialHost || 'ims.ritchennai.edu.in',
          message: response.message,
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        error: { code: 'EDGE_FUNCTION_UNAVAILABLE', message: 'RIT verification service is temporarily unavailable. Please try again shortly.' },
      };
    }
  }

  /**
   * Verifies an older/senior RIT ID card by cross-checking the numeric QR code
   * against the printed Register Number extracted via local OCR from the card front.
   */
  async verifyLegacyRitCard(params: {
    qrNumber: string;
    registerNumber: string;
    name?: string;
    department?: string;
    batch?: string;
  }): Promise<ApiResponse<CollegeIdentityVerificationResult>> {
    try {
      const { qrNumber, registerNumber, name, department, batch } = params;
      const cleanQr = normalizeRegisterNumber(qrNumber);
      const cleanReg = normalizeRegisterNumber(registerNumber);

      // Invariant: normalizedQRNumber === normalizedPrintedRegisterNumber
      if (!cleanQr || !cleanReg || cleanQr !== cleanReg) {
        return {
          success: false,
          data: null,
          error: {
            code: 'ID_NUMBER_MISMATCH',
            message: 'The QR and printed student number do not match. Please scan the same physical RIT ID card again.',
          },
        };
      }

      // Check caller authenticated session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Your session expired. Please sign in again.',
          },
        };
      }

      // Try invoking verify-rit-id edge function in legacy mode
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('verify-rit-id', {
          body: {
            mode: 'legacy',
            qrNumber: cleanQr,
            registerNumber: cleanReg,
            name: name || 'RIT Student',
            department: department || 'General',
            batch: batch || '2024-2028',
          },
        });

        if (!edgeError && edgeData && edgeData.success) {
          return {
            success: true,
            data: {
              verified: true,
              identityLinked: true,
              collegeIdentityId: edgeData.collegeIdentityId || 'legacy-verified',
              identityHashPreview: edgeData.identityHashPreview || 'sha256...',
              verifiedAt: edgeData.verifiedAt || new Date().toISOString(),
              isMockData: false,
              name: edgeData.name || name,
              department: edgeData.department || department,
              batch: edgeData.batch || batch,
              verificationMethod: 'physical_id_legacy',
              alreadyLinkedToSelf: Boolean(edgeData.alreadyLinkedToSelf),
            },
            error: null,
          };
        }

        if (edgeData && edgeData.success === false) {
          const isDuplicate = edgeData.error === 'IDENTITY_ALREADY_LINKED' || edgeData.error === 'CARD_ALREADY_LINKED';
          return {
            success: false,
            data: null,
            error: {
              code: isDuplicate ? 'IDENTITY_ALREADY_LINKED' : (edgeData.error || 'VERIFICATION_REJECTED'),
              message: isDuplicate
                ? 'This college identity is already linked to another account.'
                : edgeData.message || 'Verification could not be completed.',
            },
          };
        }
      } catch {
        // Fall back to direct database RPC if edge function is unreachable
      }

      // Fallback: Direct PostgreSQL RPC call verify_and_link_college_identity
      const { data: rpcData, error: rpcError } = await supabase.rpc('verify_and_link_college_identity', {
        p_student_ref: cleanReg,
        p_name: name || 'RIT Student',
        p_department: department || 'General',
        p_batch: batch || '2024-2028',
        p_qr_metadata: {
          method: 'physical_id_legacy',
          source: 'RIT_LEGACY_CARD_OCR',
          verifiedAt: new Date().toISOString(),
        },
        p_cooldown_hours: 0,
      });

      if (rpcError) {
        if (!isSupabaseConfigured) {
          // Local dev fallback
          const mockKey = `legacy-mock-${cleanReg}`;
          const existing = localDevClaimRegistry.get(mockKey);
          if (existing && existing.userId !== currentUserId && !existing.unlinkedAt) {
            return {
              success: false,
              data: null,
              error: {
                code: 'CARD_ALREADY_LINKED',
                message: 'This college identity is already linked to another account.',
              },
            };
          }
          localDevClaimRegistry.set(mockKey, { userId: currentUserId });
          return {
            success: true,
            data: {
              verified: true,
              identityLinked: true,
              collegeIdentityId: 'local-dev-mock-id',
              identityHashPreview: 'legacy...hash',
              verifiedAt: new Date().toISOString(),
              isMockData: true,
              name,
              department,
              batch,
              verificationMethod: 'physical_id_legacy',
            },
            error: null,
          };
        }

        return {
          success: false,
          data: null,
          error: {
            code: rpcError.code || 'VERIFICATION_FAILED',
            message: rpcError.code === '23505'
              ? 'This college identity is already linked to another account.'
              : rpcError.message || 'Legacy ID verification failed on server.',
          },
        };
      }

      const response = rpcData as any;
      if (response && response.success === false) {
        const isDuplicate = response.error === 'CARD_ALREADY_LINKED';
        return {
          success: false,
          data: null,
          error: {
            code: response.error || 'VERIFICATION_REJECTED',
            message: isDuplicate
              ? 'This college identity is already linked to another account.'
              : response.message || 'Verification rejected.',
          },
        };
      }

      return {
        success: true,
        data: {
          verified: true,
          identityLinked: true,
          collegeIdentityId: response?.college_identity_id || 'verified',
          identityHashPreview: response?.identity_hash_preview || 'sha256...',
          verifiedAt: response?.verified_at || new Date().toISOString(),
          isMockData: false,
          name,
          department,
          batch,
          verificationMethod: 'physical_id_legacy',
          alreadyLinkedToSelf: Boolean(response?.already_linked_to_self),
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown legacy verification error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }


  /**
   * Links a verified college ID QR payload to the current authenticated account.
   * Derives the stable fingerprint on the server via PostgreSQL RPC.
   */
  async linkCollegeIdentity(
    qrResult: ParsedCollegeQrResult,
    cooldownHours: number = 0
  ): Promise<ApiResponse<CollegeIdentityVerificationResult>> {
    try {
      // 0. Rate limiting check: enforce minimum 1.5s between scan attempts
      const now = Date.now();
      if (now - this.lastScanTime < 1500) {
        return {
          success: false,
          data: null,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many QR scan attempts. Please wait a moment before trying again.',
          },
        };
      }
      this.lastScanTime = now;

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

      const { name, department, batch } = qrResult.fields;
      const ref = ((qrResult.fields as Record<string, unknown>).registerNumber as string | undefined || qrResult.fields.studentReference)?.trim();

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

        // Fallback ONLY allowed when Supabase is unconfigured in development
        if (!isSupabaseConfigured) {
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
        // Enforce exact non-leaking message for duplicates and unsupported courses
        const message =
          response.error === 'CARD_ALREADY_LINKED'
            ? 'This college identity is already linked to another account.'
            : response.error === 'UNSUPPORTED_COURSE_FORMAT'
            ? "We verified your RIT identity, but we couldn't recognize your course format yet. Please try again later."
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
          verified: true,
          identityLinked: true,
          collegeIdentityId: response?.college_identity_id || 'verified',
          identityHashPreview: response?.identity_hash_preview || 'sha256...',
          verifiedAt: response?.verified_at || new Date().toISOString(),
          isMockData: qrResult.isMockData,
          name,
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

        // Fallback for local development when Supabase is unconfigured
        if (!isSupabaseConfigured) {
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
