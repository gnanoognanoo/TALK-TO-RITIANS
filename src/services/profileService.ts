/**
 * ============================================================================
 * TALK TO RITIANS - Profile & Anonymous Identity Service
 * ============================================================================
 * Handles saving the selected anonymous alias, profile fetching,
 * and avatar configuration updates.
 */

import { supabase } from '../lib/supabase';
import { ApiResponse, Profile } from '../types';
import { isValidAliasFormat } from './aliasPool';

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

        // Fallback for local development when Supabase RPC is offline
        if (
          error.code === 'PGRST202' ||
          error.message?.includes('fetch') ||
          error.message?.includes('not found') ||
          !import.meta.env.VITE_SUPABASE_URL
        ) {
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
