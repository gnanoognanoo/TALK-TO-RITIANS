/**
 * ============================================================================
 * TALK TO RITIANS - Random 1-to-1 Matchmaking Screen (Phase 9)
 * ============================================================================
 * Clean, minimal student matchmaking interface connecting verified peers.
 *
 * Implements:
 * - Server-side queue joining via `joinMatchmaking()`
 * - Heartbeat lifecycle & stale queue handling
 * - Safe exit / cancellation on leave
 * - Multiple-tab safety
 * - Strict Privacy Invariant: Receives ONLY roomId, anonymous username, and avatar.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, X, Lightbulb } from 'lucide-react';
import { Button, Card, ErrorMessage } from '../components';
import { useAuth } from '../context';
import { matchmakingService } from '../services/matchmakingService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { MatchedPeerPersona } from '../types';

export const MatchingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [isMatchingResolved, setIsMatchingResolved] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);

  // Keep references to intervals and state to prevent race conditions during unmount
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isResolvedRef = useRef<boolean>(false);

  /**
   * Transition to chat room with sanitized anonymous peer data.
   */
  const handleMatchSuccess = useCallback(
    (roomId: string, peer?: MatchedPeerPersona, expiresAt?: string) => {
      if (isResolvedRef.current) return;
      isResolvedRef.current = true;
      setIsMatchingResolved(true);

      // Clean up timers immediately
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

      // Navigate to chat room passing sanitized peer details and expiration
      navigate(`/chat/${roomId}`, {
        state: { peer, expiresAt },
        replace: true,
      });
    },
    [navigate]
  );

  /**
   * Leave matchmaking and return home.
   */
  const handleCancel = useCallback(async () => {
    setIsLeaving(true);
    isResolvedRef.current = true;

    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

    try {
      await matchmakingService.leaveMatchmaking();
    } catch (err) {
      console.warn('[MatchingPage] Cancel error:', err);
    } finally {
      navigate('/home', { replace: true });
    }
  }, [navigate]);

  /**
   * Main Matchmaking Lifecycle
   */
  useEffect(() => {
    let isMounted = true;
    isResolvedRef.current = false;

    // 1. Start seconds elapsed counter
    elapsedTimerRef.current = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);

    // 2. Initial Join Queue
    const initMatchmaking = async () => {
      setMatchingError(null);

      const res = await matchmakingService.joinMatchmaking();
      if (!isMounted) return;

      if (!res.success) {
        setMatchingError(res.error?.message || 'Failed to enter campus matchmaking pool.');
        return;
      }

      // Check if immediately matched
      if (res.data?.status === 'matched' && res.data.roomId) {
        handleMatchSuccess(res.data.roomId, res.data.peer, res.data.expiresAt);
        return;
      }

      // 3. Setup periodic heartbeat (every 3.5s) to detect match and maintain presence
      heartbeatTimerRef.current = setInterval(async () => {
        if (isResolvedRef.current) return;

        const hbRes = await matchmakingService.sendHeartbeat();
        if (!isMounted || isResolvedRef.current) return;

        if (hbRes.success && hbRes.data?.status === 'matched' && hbRes.data.roomId) {
          handleMatchSuccess(hbRes.data.roomId, hbRes.data.peer, hbRes.data.expiresAt);
        }
      }, 3500);
    };

    initMatchmaking();

    // 4. Supabase Realtime channel listener (if Supabase is online)
    let channel: any = null;
    if (user?.id && isSupabaseConfigured) {
      channel = supabase
        .channel(`matchmaking:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'matchmaking_queue',
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!isMounted || isResolvedRef.current) return;
            const newRow = payload.new as { status?: string; matched_room_id?: string; matched_user_id?: string };

            if (newRow.status === 'matched' && newRow.matched_room_id) {
              const hbRes = await matchmakingService.sendHeartbeat();
              if (hbRes.success && hbRes.data?.roomId) {
                handleMatchSuccess(hbRes.data.roomId, hbRes.data.peer, hbRes.data.expiresAt);
              } else {
                handleMatchSuccess(newRow.matched_room_id);
              }
            }
          }
        )
        .subscribe();
    }

    // 5. Browser close / tab refresh handler
    const handleBeforeUnload = () => {
      matchmakingService.leaveMatchmaking();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (channel) supabase.removeChannel(channel);

      // If leaving without being matched, remove queue entry
      if (!isResolvedRef.current) {
        matchmakingService.leaveMatchmaking();
      }
    };
  }, [user?.id, handleMatchSuccess]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-md text-center space-y-8">
        {/* Header Titles */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Finding Your Next Conversation...
          </h1>
          <p className="text-sm text-gray-500">
            Connecting you with a random RITian
          </p>
        </div>

        {/* Circular Animated Indicator with Soft Purple Rings (Zero Neon) */}
        <div className="relative flex items-center justify-center h-64 w-64 mx-auto my-6">
          {/* Outermost subtle pulse ring */}
          <div className="absolute inset-0 rounded-full bg-[#F5F3FF] animate-ping opacity-30" />
          {/* Middle soft purple rings */}
          <div className="absolute inset-2 rounded-full border-2 border-[#EDE9FE] animate-pulse" />
          <div className="absolute inset-8 rounded-full bg-[#F5F3FF]/70 border border-[#DDD6FE]" />
          <div className="absolute inset-16 rounded-full bg-[#EDE9FE]/80 border border-[#C4B5FD]" />

          {/* Center Avatar Badge */}
          <div className="relative z-10 h-16 w-16 rounded-full bg-[#6C4CF5] flex items-center justify-center text-white shadow-md">
            <User className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Friendly Message / Icebreaker Card */}
        <Card className="p-4 bg-white border-gray-200 shadow-sm text-left max-w-sm mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-500 shrink-0">
              <Lightbulb className="h-5 w-5" />
            </div>
            <p className="text-xs sm:text-sm text-gray-700 font-medium">
              &ldquo;Good conversations start with open minds.&rdquo;
            </p>
          </div>
        </Card>

        {/* Error notification if matching failed */}
        {matchingError && (
          <ErrorMessage
            title="Matchmaking Error"
            message={matchingError}
            className="text-left"
          />
        )}

        {/* Cancel Action */}
        <div className="pt-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleCancel}
            disabled={isLeaving || isMatchingResolved}
            leftIcon={<X className="h-4 w-4" />}
            className="px-6"
          >
            {isLeaving ? 'Exiting...' : 'Cancel'}
          </Button>
        </div>

        {/* Subtitle / elapsed timer counter */}
        <p className="text-xs text-gray-400">
          Searching for {secondsElapsed}s &bull; Safe & Anonymous
        </p>
      </div>
    </div>
  );
};

export default MatchingPage;
