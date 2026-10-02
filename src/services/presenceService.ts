/**
 * ============================================================================
 * TALK TO RITIANS - User Presence Service (Phase 3 Fix)
 * ============================================================================
 * Manages lightweight client presence heartbeats and chat request availability.
 *
 * PRIVACY INVARIANTS:
 * - Heartbeats only communicate online status and availability.
 * - Clients can never query the list of online users.
 * - Random selection happens strictly server-side.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ApiResponse } from '../types';

const CHAT_REQUESTS_ENABLED_KEY = 'rit_chat_requests_enabled';

export class PresenceService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentPage: string = 'home';

  /**
   * Whether the user has opted in to receive random incoming chat requests.
   * ON (true) by default.
   */
  isChatRequestsEnabled(): boolean {
    try {
      const stored = localStorage.getItem(CHAT_REQUESTS_ENABLED_KEY);
      return stored !== 'false';
    } catch {
      return true;
    }
  }

  /**
   * Sets user's preference for receiving random incoming chat requests.
   */
  setChatRequestsEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(CHAT_REQUESTS_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignored
    }
    // Immediately emit an updated heartbeat if active
    this.sendHeartbeat(this.currentPage);
  }

  /**
   * Dispatches a single presence heartbeat to the server.
   */
  async sendHeartbeat(page: string = 'home'): Promise<ApiResponse<{ updatedAt: string }>> {
    this.currentPage = page;
    try {
      if (!isSupabaseConfigured) {
        return {
          success: true,
          data: { updatedAt: new Date().toISOString() },
          error: null,
        };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return {
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'No active session' },
        };
      }

      const available = this.isChatRequestsEnabled();
      const { data, error } = await supabase.rpc('update_user_presence', {
        p_is_online: true,
        p_available: available,
        p_current_page: page,
      });

      if (error) {
        console.warn('[PresenceService] update_user_presence error:', error);
        return {
          success: false,
          data: null,
          error: { code: error.code || 'PRESENCE_ERROR', message: error.message },
        };
      }

      const res = data as any;
      return {
        success: true,
        data: { updatedAt: res?.updated_at || new Date().toISOString() },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Presence heartbeat failure';
      return {
        success: false,
        data: null,
        error: { code: 'CLIENT_ERROR', message },
      };
    }
  }

  /**
   * Explicitly marks user as offline (e.g. on sign out or page unload).
   */
  async markOffline(): Promise<void> {
    try {
      if (!isSupabaseConfigured) return;
      await supabase.rpc('update_user_presence', {
        p_is_online: false,
        p_available: false,
        p_current_page: 'offline',
      });
    } catch {
      // Best effort
    }
  }

  /**
   * Starts periodic heartbeat loop (every 18 seconds).
   * Server online window is 30 seconds.
   */
  startHeartbeat(getPage: () => string): () => void {
    this.stopHeartbeat();

    // Initial heartbeat
    this.sendHeartbeat(getPage());

    // 18-second recurring timer
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat(getPage());
    }, 18000);

    return () => this.stopHeartbeat();
  }

  /**
   * Stops periodic heartbeat.
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export const presenceService = new PresenceService();
export default presenceService;
