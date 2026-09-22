/**
 * ============================================================================
 * TALK TO RITIANS - Authentication Context & Session Provider
 * ============================================================================
 * Manages Supabase Auth session lifecycles, user identity, profile initialization,
 * and reliable sign out.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ProfileRow } from '../types';
import { authService, generateTemporaryUsername, getPostLoginRedirect } from '../services/authService';
import { verificationService } from '../services/verificationService';

export interface AuthContextType {
  user: SupabaseUser | null;
  session: Session | null;
  profile: ProfileRow | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  unlinkCollegeIdentity: () => Promise<{ success: boolean; error?: string }>;
  getRedirectPath: () => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  /**
   * Fetches or provisions the profile row for the user.
   */
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[AuthContext] Profile fetch warning:', error);
      }

      if (data) {
        setProfile(data);
        return;
      }

      // If profile does not exist yet, provision one with defaults
      const tempUsername = generateTemporaryUsername();
      const defaultAvatar = { emoji: '👤', theme: 'indigo' };

      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          display_username: tempUsername,
          avatar_config: defaultAvatar,
          college_identity_linked: false,
          profile_completed: false,
        })
        .select()
        .single();

      if (insertError) {
        console.warn('[AuthContext] Profile insert warning (using fallback):', insertError);
        // Fallback representation
        setProfile({
          id: userId,
          display_username: tempUsername,
          avatar_config: defaultAvatar,
          college_identity_linked: false,
          profile_completed: false,
          department: null,
          section: null,
          class_name: null,
          batch: null,
          graduation_year: null,
          gender: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else {
        setProfile(inserted);
      }
    } catch (err) {
      console.error('[AuthContext] Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Manually refetch profile (e.g. after onboarding steps)
   */
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await loadProfile(user.id);
    }
  }, [user?.id, loadProfile]);

  /**
   * Initial Session Hydration and Realtime Auth Listener
   */
  useEffect(() => {
    let isMounted = true;

    // 1. Check existing session
    supabase.auth.getSession().then(async ({ data: { session: currentSession }, error }) => {
      if (!isMounted) return;
      if (error) {
        console.warn('[AuthContext] getSession warning:', error.message);
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await loadProfile(currentSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // 2. Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
        // Clean up any local storage UI caches
        if (typeof window !== 'undefined') {
          sessionStorage.clear();
        }
      } else if (currentSession?.user) {
        await loadProfile(currentSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  /**
   * Personal Email Magic Link Sign In
   */
  const signInWithEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    const res = await authService.signInWithPersonalEmail(email);
    if (!res.success) {
      return { success: false, error: res.error?.message || 'Failed to send magic link' };
    }
    return { success: true };
  };

  /**
   * Direct Password Sign In (Testing & Admin)
   */
  const signInWithPassword = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const res = await authService.signInWithPassword(email, password);
    if (!res.success) {
      return { success: false, error: res.error?.message || 'Authentication failed' };
    }
    return { success: true };
  };

  /**
   * Personal Email & Password Sign Up (Immediate Authentication)
   */
  const signUpWithPassword = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const res = await authService.signUpWithPassword(email, password);
    if (!res.success) {
      return { success: false, error: res.error?.message || 'Registration failed' };
    }
    if (res.data?.user) {
      await loadProfile(res.data.user.id);
    }
    return { success: true };
  };

  /**
   * Password Reset via Email
   */
  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    const res = await authService.resetPassword(email);
    if (!res.success) {
      return { success: false, error: res.error?.message || 'Password reset failed' };
    }
    return { success: true };
  };

  /**
   * Google OAuth Sign In
   */
  const signInWithGoogle = async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    const res = await authService.signInWithGoogle(redirectTo);
    if (!res.success) {
      return { success: false, error: res.error?.message || 'Failed to initialize Google login' };
    }
    return { success: true };
  };

  /**
   * Reliable Sign Out
   */
  const signOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.signOut();
    } catch (err) {
      console.warn('[AuthContext] Sign out error:', err);
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setLoading(false);
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
      }
    }
  };

  /**
   * Unlinks the active college identity from the account.
   */
  const unlinkCollegeIdentity = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await verificationService.unlinkCollegeIdentity();
      if (!res.success) {
        return { success: false, error: res.error?.message || 'Failed to unlink college identity' };
      }
      await refreshProfile();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink college identity';
      return { success: false, error: message };
    }
  };

  /**
   * Helper to compute redirection path for current profile
   */
  const getRedirectPath = (): string => {
    return getPostLoginRedirect(profile);
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    resetPassword,
    signInWithGoogle,
    signOut,
    refreshProfile,
    unlinkCollegeIdentity,
    getRedirectPath,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
