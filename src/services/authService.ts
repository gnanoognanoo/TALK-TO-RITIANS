/**
 * ============================================================================
 * TALK TO RITIANS - Authentication Service
 * ============================================================================
 * Handles Supabase personal email authentication, Google OAuth, session state,
 * and new user profile initialization with anonymous defaults.
 */

import { supabase } from '../lib/supabase';
import { User, Profile, ApiResponse } from '../types';
import { IAuthService } from './index';
import type { Session } from '@supabase/supabase-js';

export interface EnsureProfileResult {
  profile: Profile;
  isNewUser: boolean;
}

/**
 * Determine the appropriate post-login route based on student onboarding state.
 */
export function getPostLoginRedirect(profile: {
  college_identity_linked?: boolean | null;
  profile_completed?: boolean | null;
} | null): string {
  if (!profile || !profile.college_identity_linked) {
    return '/verify';
  }
  if (!profile.profile_completed) {
    return '/username';
  }
  return '/home';
}

/**
 * Generates an anonymous temporary identity placeholder: "Unknown User ####"
 */
export function generateTemporaryUsername(): string {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `Unknown User ${randomSuffix}`;
}

export class AuthService implements IAuthService {
  /**
   * Retrieves the current authenticated user session.
   */
  async getSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    } catch (err) {
      console.error('[AuthService] getSession error:', err);
      return null;
    }
  }

  /**
   * Retrieves the current authenticated Supabase User.
   */
  async getCurrentUser(): Promise<ApiResponse<User>> {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return {
          success: false,
          data: null,
          error: {
            code: 'UNAUTHENTICATED',
            message: error?.message || 'No authenticated user session',
          },
        };
      }

      const appUser: User = {
        id: data.user.id,
        email: data.user.email || '',
        accountState: 'unverified',
        isCollegeVerified: false,
        createdAt: data.user.created_at || new Date().toISOString(),
        updatedAt: data.user.updated_at || new Date().toISOString(),
      };

      return {
        success: true,
        data: appUser,
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown auth error';
      return {
        success: false,
        data: null,
        error: { code: 'AUTH_ERROR', message },
      };
    }
  }

  /**
   * Sends a magic link / OTP to the student's personal email address.
   */
  async signInWithPersonalEmail(
    email: string,
    redirectTo?: string
  ): Promise<ApiResponse<{ confirmationSent: boolean }>> {
    try {
      const redirectUrl = redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: 'MAGIC_LINK_FAILED', message: error.message },
        };
      }

      return {
        success: true,
        data: { confirmationSent: true },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send magic link';
      return {
        success: false,
        data: null,
        error: { code: 'NETWORK_ERROR', message },
      };
    }
  }

  /**
   * Initiates Google OAuth redirect.
   */
  async signInWithGoogle(): Promise<ApiResponse<{ initiated: boolean }>> {
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        return {
          success: false,
          data: null,
          error: { code: 'OAUTH_FAILED', message: error.message },
        };
      }

      return {
        success: true,
        data: { initiated: true },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'OAuth initiation failed';
      return {
        success: false,
        data: null,
        error: { code: 'OAUTH_ERROR', message },
      };
    }
  }

  /**
   * Signs out the authenticated user.
   */
  async signOut(): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return {
        success: true,
        data: null,
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      return {
        success: false,
        data: null,
        error: { code: 'SIGNOUT_FAILED', message },
      };
    }
  }

  /**
   * Ensures a profile row exists for the user.
   * If not present, initializes one with:
   * - college_identity_linked: false
   * - profile_completed: false
   * - display_username: "Unknown User ####"
   * - avatar_config: default avatar
   */
  async ensureUserProfile(userId: string): Promise<ApiResponse<EnsureProfileResult>> {
    try {
      // 1. Check if profile already exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        console.warn('[AuthService] Error checking profile existence:', fetchError);
      }

      if (existingProfile) {
        const profile: Profile = {
          id: existingProfile.id,
          anonymousUsername: existingProfile.display_username || generateTemporaryUsername(),
          avatarId: 'default',
          avatarConfig: existingProfile.avatar_config as Record<string, unknown>,
          createdAt: existingProfile.created_at,
          updatedAt: existingProfile.updated_at,
        };

        return {
          success: true,
          data: { profile, isNewUser: false },
          error: null,
        };
      }

      // 2. New user profile initialization
      const tempUsername = generateTemporaryUsername();
      const defaultAvatarConfig = { emoji: '👤', theme: 'indigo' };

      const { data: newProfileRow, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          display_username: tempUsername,
          avatar_config: defaultAvatarConfig,
          college_identity_linked: false,
          profile_completed: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[AuthService] Profile insertion failed:', insertError);
        // Fallback in-memory representation if DB insert fails
        const fallbackProfile: Profile = {
          id: userId,
          anonymousUsername: tempUsername,
          avatarId: 'default',
          avatarConfig: defaultAvatarConfig,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return {
          success: true,
          data: { profile: fallbackProfile, isNewUser: true },
          error: null,
        };
      }

      const profile: Profile = {
        id: newProfileRow.id,
        anonymousUsername: newProfileRow.display_username || tempUsername,
        avatarId: 'default',
        avatarConfig: newProfileRow.avatar_config as Record<string, unknown>,
        createdAt: newProfileRow.created_at,
        updatedAt: newProfileRow.updated_at,
      };

      return {
        success: true,
        data: { profile, isNewUser: true },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Profile initialization failed';
      return {
        success: false,
        data: null,
        error: { code: 'PROFILE_INIT_FAILED', message },
      };
    }
  }
}

export const authService = new AuthService();
export default authService;
