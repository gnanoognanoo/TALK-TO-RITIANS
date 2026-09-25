/**
 * ============================================================================
 * TALK TO RITIANS - Profile & Anonymous Identity Service
 * ============================================================================
 * Handles saving the selected anonymous alias, profile fetching,
 * and avatar configuration updates.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ApiResponse, Profile, AvatarConfig, isValidAvatarConfig, Json, ProfileSetupFormData } from '../types';
import { isValidAliasFormat } from './aliasPool';
import { validateProfileSetup, GENDER_OPTIONS } from '../config/profileConfig';

export class ProfileService {
  /**
   * Saves the student's chosen anonymous handle once college identity is verified.
   * Calls the server-side RPC procedure `save_anonymous_alias`.
   */
  async saveAnonymousAlias(alias: string): Promise<ApiResponse<{ alias: string }>> {
    try {
      // 1. Client-side pre-validation
      const formatCheck = isValidAliasFormat(alias);
      if (!formatCheck.valid) {
        return {
          success: false,
          data: null,
          error: {
            code: 'INVALID_ALIAS_FORMAT',
            message: formatCheck.error || 'Invalid alias format.',
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
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in to select an anonymous handle.',
          },
        };
      }

      // 3. Call server-side RPC procedure
      const { data, error } = await supabase.rpc('save_anonymous_alias', {
        p_alias: alias.trim(),
      });

      if (error) {
        console.warn('[ProfileService] RPC call save_anonymous_alias error:', error);

        // Fallback only if Supabase is unconfigured
        if (!isSupabaseConfigured) {
          console.info('[ProfileService] Running local development fallback for alias save');
          // Update in profiles table directly if possible
          await supabase
            .from('profiles')
            .update({ display_username: alias.trim() })
            .eq('id', currentUserId);

          return {
            success: true,
            data: { alias: alias.trim() },
            error: null,
          };
        }

        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'SAVE_FAILED',
            message: error.message || 'Failed to save anonymous handle on server.',
          },
        };
      }

      const response = data as {
        success?: boolean;
        error?: string;
        message?: string;
        alias?: string;
      } | null;

      if (response && response.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: response.error || 'SAVE_REJECTED',
            message: response.message || 'Unable to save anonymous handle.',
          },
        };
      }

      return {
        success: true,
        data: { alias: response?.alias || alias.trim() },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown profile error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Saves the student's customized modular avatar configuration.
   * Calls the server-side RPC procedure `save_avatar_config`.
   */
  async saveAvatarConfig(
    config: AvatarConfig
  ): Promise<ApiResponse<{ avatarConfig: AvatarConfig }>> {
    try {
      // 1. Client-side validation
      if (!isValidAvatarConfig(config)) {
        return {
          success: false,
          data: null,
          error: {
            code: 'INVALID_AVATAR_CONFIG',
            message: 'Avatar configuration contains missing or invalid vector layer values.',
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
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in to save your avatar.',
          },
        };
      }

      // 3. Call server-side RPC procedure
      const { data, error } = await supabase.rpc('save_avatar_config', {
        p_config: config as unknown as Json,
      });

      if (error) {
        console.warn('[ProfileService] RPC call save_avatar_config error:', error);

        // Fallback only if Supabase is unconfigured
        if (!isSupabaseConfigured) {
          console.info('[ProfileService] Running local development fallback for avatar save');
          await supabase
            .from('profiles')
            .update({ avatar_config: config as unknown as Json })
            .eq('id', currentUserId);

          return {
            success: true,
            data: { avatarConfig: config },
            error: null,
          };
        }

        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'SAVE_FAILED',
            message: error.message || 'Failed to save avatar configuration on server.',
          },
        };
      }

      const response = data as {
        success?: boolean;
        error?: string;
        message?: string;
        avatar_config?: AvatarConfig;
      } | null;

      if (response && response.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: response.error || 'SAVE_REJECTED',
            message: response.message || 'Unable to save avatar configuration.',
          },
        };
      }

      return {
        success: true,
        data: { avatarConfig: response?.avatar_config || config },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown avatar save error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Saves the student's private profile metadata and marks onboarding completed.
   * Calls the server-side RPC procedure `save_profile_data`.
   */
  async saveProfileData(
    formData: ProfileSetupFormData
  ): Promise<ApiResponse<{ profileCompleted: boolean }>> {
    try {
      // 1. Client-side validation
      const validation = validateProfileSetup(formData);
      if (!validation.isValid) {
        const firstError = Object.values(validation.errors)[0] || 'Invalid profile information.';
        return {
          success: false,
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: firstError,
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
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in to complete your profile.',
          },
        };
      }

      // 3. Call server-side RPC procedure
      const gradYearNum = typeof formData.graduationYear === 'number'
        ? formData.graduationYear
        : parseInt(String(formData.graduationYear), 10);

      const { data, error } = await supabase.rpc('save_profile_data', {
        p_department: formData.department.trim(),
        p_section: formData.section.trim().toUpperCase(),
        p_class_name: formData.className.trim(),
        p_batch: formData.batch.trim(),
        p_graduation_year: gradYearNum,
        p_gender: formData.gender.trim(),
      });

      if (error) {
        console.warn('[ProfileService] RPC call save_profile_data error:', error);

        // Fallback only if Supabase is unconfigured
        if (!isSupabaseConfigured) {
          console.info('[ProfileService] Running local development fallback for profile setup');
          await supabase
            .from('profiles')
            .update({
              department: formData.department.trim(),
              section: formData.section.trim().toUpperCase(),
              class_name: formData.className.trim(),
              batch: formData.batch.trim(),
              graduation_year: gradYearNum,
              gender: formData.gender.trim(),
              profile_completed: true,
            })
            .eq('id', currentUserId);

          return {
            success: true,
            data: { profileCompleted: true },
            error: null,
          };
        }

        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'SAVE_FAILED',
            message: error.message || 'Failed to save profile information on server.',
          },
        };
      }

      const response = data as {
        success?: boolean;
        error?: string;
        message?: string;
        profile_completed?: boolean;
      } | null;

      if (response && response.success === false) {
        return {
          success: false,
          data: null,
          error: {
            code: response.error || 'SAVE_REJECTED',
            message: response.message || 'Unable to save profile setup.',
          },
        };
      }

      return {
        success: true,
        data: { profileCompleted: Boolean(response?.profile_completed ?? true) },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown profile save error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Saves the student's manually selected gender to their private profile.
   * Enforces:
   * - Must be explicitly selected by the user (never inferred or guessed)
   * - Must match supported database values in GENDER_OPTIONS
   * - Caller must have an authenticated session
   */
  async saveGender(gender: string): Promise<ApiResponse<{ gender: string }>> {
    try {
      const trimmed = gender?.trim();
      if (!trimmed || !GENDER_OPTIONS.includes(trimmed as any)) {
        return {
          success: false,
          data: null,
          error: {
            code: 'INVALID_GENDER',
            message: 'Please select a valid gender option.',
          },
        };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      if (!currentUserId) {
        return {
          success: false,
          data: null,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be signed in to save your gender.',
          },
        };
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          gender: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentUserId);

      if (error) {
        console.warn('[ProfileService] saveGender update error:', error);
        if (!isSupabaseConfigured) {
          return {
            success: true,
            data: { gender: trimmed },
            error: null,
          };
        }
        return {
          success: false,
          data: null,
          error: {
            code: error.code || 'SAVE_FAILED',
            message: error.message || 'Failed to save gender on server.',
          },
        };
      }

      return {
        success: true,
        data: { gender: trimmed },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown gender save error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Retrieves profile for the specified user.
   */
  async getProfile(userId: string): Promise<ApiResponse<Profile>> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        return {
          success: false,
          data: null,
          error: {
            code: error?.code || 'NOT_FOUND',
            message: error?.message || 'Profile not found.',
          },
        };
      }

      const profile: Profile = {
        id: data.id,
        anonymousUsername: data.display_username || 'Unknown User',
        avatarId: 'default',
        avatarConfig: data.avatar_config as Record<string, unknown>,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      return {
        success: true,
        data: profile,
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown profile fetch error';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }
}

export const profileService = new ProfileService();
export default profileService;
