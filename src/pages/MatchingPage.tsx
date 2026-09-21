/**
 * ============================================================================
 * TALK TO RITIANS - Random 1-to-1 Matchmaking Screen (Phase 9)
 * ============================================================================
 * Live matching interface connecting verified students.
 *
 * Implements:
 * - Server-side queue joining via `joinMatchmaking()`
 * - Heartbeat lifecycle & stale queue handling (Step 6)
 * - Safe exit / cancellation on leave (Step 5)
 * - Multiple-tab safety (Step 7)
 * - Strict Privacy Invariant: Receives ONLY roomId, anonymous username, and avatar.
 *   Zero personal email, roll number, department, section, batch, or gender (Step 4).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, X, Sparkles, ShieldCheck } from 'lucide-react';
import { Button, Card, Badge, ErrorMessage } from '../components';
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
    (roomId: string, peer?: MatchedPeerPersona) => {
      if (isResolvedRef.current) return;
      isResolvedRef.current = true;
      setIsMatchingResolved(true);

      // Clean up timers immediately
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

      // Navigate to chat room passing sanitized peer details
      navigate(`/chat/${roomId}`, {
        state: { peer },
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
        handleMatchSuccess(res.data.roomId, res.data.peer);
        return;
      }

      // 3. Setup periodic heartbeat (every 3.5s) to detect match and maintain presence
      heartbeatTimerRef.current = setInterval(async () => {
        if (isResolvedRef.current) return;

        const hbRes = await matchmakingService.sendHeartbeat();
        if (!isMounted || isResolvedRef.current) return;

        if (hbRes.success && hbRes.data?.status === 'matched' && hbRes.data.roomId) {
          handleMatchSuccess(hbRes.data.roomId, hbRes.data.peer);
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
              // Trigger heartbeat to fetch sanitized peer info and resolve
              const hbRes = await matchmakingService.sendHeartbeat();
              if (hbRes.success && hbRes.data?.roomId) {
                handleMatchSuccess(hbRes.data.roomId, hbRes.data.peer);
              } else {
                handleMatchSuccess(newRow.matched_room_id);
              }
            }
          }
        )
        .subscribe();
    }

    // 5. Browser close / tab refresh handler (Step 6)
    const handleBeforeUnload = () => {
      matchmakingService.leaveMatchmaking();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on unmount (Step 5)
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-600/10 blur-[120px] rounded-full pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md text-center space-y-8">
        {/* Radar Animation Display */}
        <div className="relative flex items-center justify-center h-56 w-56 mx-auto">
          {/* Outer Ripple Rings */}
          <div className="absolute inset-0 rounded-full border border-brand-500/20 animate-ping opacity-25" />
          <div className="absolute -inset-4 rounded-full border border-brand-500/15 animate-pulse-slow" />
          <div className="absolute inset-4 rounded-full border border-brand-500/30" />
          <div className="absolute inset-12 rounded-full border border-brand-500/40 bg-brand-950/30" />

          {/* Center Beacon */}
          <div className="relative z-10 h-20 w-20 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl shadow-brand-500/40">
            <Radio className="h-9 w-9 animate-pulse" />
          </div>

          {/* Floating Campus Ping Indicator */}
          <span className="absolute top-6 right-8 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-bounce" />
        </div>

        {/* Status Message */}
        <div className="space-y-2">
          <Badge variant="brand" size="md" withDot>
            Pairing in Progress ({secondsElapsed}s)
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Finding a Fellow RITian...
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
            Matching you randomly with an active, verified student from Rajalakshmi Institute of
            Technology.
          </p>
        </div>

        {/* Error notification if matching failed */}
        {matchingError && (
          <ErrorMessage
            title="Matchmaking Error"
            message={matchingError}
            className="text-left"
          />
        )}

        {/* Icebreaker Card */}
        <Card className="p-4 bg-slate-900/60 border-slate-800 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-xs space-y-1">
              <span className="font-semibold text-white">Icebreaker Idea:</span>
              <p className="text-slate-400 leading-relaxed">
                "Are you a day scholar or hosteller? What's your favorite spot on campus during breaks?"
              </p>
            </div>
          </div>
        </Card>

        {/* Actions: Cancel Option */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleCancel}
            disabled={isLeaving || isMatchingResolved}
            leftIcon={<X className="h-4 w-4" />}
            className="w-full sm:w-auto shadow-lg"
          >
            {isLeaving ? 'Exiting Pool...' : 'Cancel & Return Home'}
          </Button>
        </div>

        {/* Security / Privacy Trust Guarantee */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>Random 1-to-1 matching &bull; Real identity stays sealed</span>
        </div>
      </div>
    </div>
  );
};

export default MatchingPage;
