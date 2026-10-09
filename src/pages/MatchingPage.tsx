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
 * - Existing-room detection: Shows Resume/Leave dialog when user has an active session.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, X, Lightbulb, RefreshCw } from 'lucide-react';
import { Card, ErrorMessage, Modal } from '../components';
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
  const [hasPendingRequest, setHasPendingRequest] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Existing room dialog state
  const [existingRoomId, setExistingRoomId] = useState<string | null>(null);
  const [existingRoomPeer, setExistingRoomPeer] = useState<MatchedPeerPersona | undefined>(undefined);
  const [existingRoomExpiresAt, setExistingRoomExpiresAt] = useState<string | undefined>(undefined);
  const [isForceLeaving, setIsForceLeaving] = useState<boolean>(false);

  // Keep references to intervals and state to prevent race conditions during unmount
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isResolvedRef = useRef<boolean>(false);
  // Guard to prevent double-init after force-leave re-join
  const initCalledRef = useRef<boolean>(false);

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
   * Resume existing active room (user chose to go back).
   */
  const handleResumeExistingRoom = useCallback(() => {
    if (!existingRoomId) return;
    handleMatchSuccess(existingRoomId, existingRoomPeer, existingRoomExpiresAt);
  }, [existingRoomId, existingRoomPeer, existingRoomExpiresAt, handleMatchSuccess]);

  /**
   * Force-leave old room and immediately re-join matchmaking.
   */
  const handleForceLeaveAndRematch = useCallback(async () => {
    setIsForceLeaving(true);
    setExistingRoomId(null);

    try {
      await matchmakingService.forceLeaveActiveRoom();
    } catch (err) {
      console.warn('[MatchingPage] forceLeaveActiveRoom error:', err);
    }

    // Reset state and re-trigger matchmaking
    isResolvedRef.current = false;
    initCalledRef.current = false;
    setMatchingError(null);
    setIsForceLeaving(false);
    setSecondsElapsed(0);
    setIsMatchingResolved(false);

    // Re-join after a brief delay to let the DB update propagate
    setTimeout(async () => {
      const res = await matchmakingService.joinMatchmaking();
      if (!res.success) {
        setMatchingError(res.error?.message || 'Failed to enter campus matchmaking pool.');
        return;
      }
      if ((res.data?.status === 'matched' || res.data?.status === 'existing_room') && res.data.roomId) {
        handleMatchSuccess(res.data.roomId, res.data.peer, res.data.expiresAt);
      }
      // If still 'searching', the heartbeat timer (already running) will pick up the match
    }, 800);
  }, [handleMatchSuccess]);

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
      if (initCalledRef.current) return;
      initCalledRef.current = true;
      setMatchingError(null);

      const res = await matchmakingService.joinMatchmaking();
      if (!isMounted) return;

      if (!res.success) {
        setMatchingError(res.error?.message || 'Failed to enter campus matchmaking pool.');
        return;
      }

      // Immediately matched or found new room
      if (res.data?.status === 'matched' && res.data.roomId) {
        handleMatchSuccess(res.data.roomId, res.data.peer, res.data.expiresAt);
        return;
      }

      // Existing active room found — show the resume/leave dialog
      if (res.data?.status === 'existing_room' && res.data.roomId) {
        setExistingRoomId(res.data.roomId);
        setExistingRoomPeer(res.data.peer);
        setExistingRoomExpiresAt(res.data.expiresAt);
        return;
      }

      if (res.data?.hasPendingRequest) {
        setHasPendingRequest(true);
        setStatusMessage(res.data.message || 'Waiting for a RITian to respond...');
      }

      // 3. Setup periodic heartbeat (every 3.5s) to detect match and maintain presence
      heartbeatTimerRef.current = setInterval(async () => {
        if (isResolvedRef.current) return;

        const hbRes = await matchmakingService.sendHeartbeat();
        if (!isMounted || isResolvedRef.current) return;

        if (hbRes.success && hbRes.data?.status === 'matched' && hbRes.data.roomId) {
          handleMatchSuccess(hbRes.data.roomId, hbRes.data.peer, hbRes.data.expiresAt);
          return;
        }

        if (hbRes.success && hbRes.data?.hasPendingRequest !== undefined) {
          setHasPendingRequest(hbRes.data.hasPendingRequest);
          if (hbRes.data.message) {
            setStatusMessage(hbRes.data.message);
          }
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F4F6F1] tracking-tight">
            {hasPendingRequest
              ? statusMessage || 'Waiting for a RITian to respond...'
              : 'Finding a RITian...'}
          </h1>
          <p className="text-xs sm:text-sm text-[#9DA89A]">
            {hasPendingRequest
              ? 'Request sent to an active online student'
              : 'Connecting you with a fellow student from campus'}
          </p>
        </div>

        {/* Liquid Concentric Blobs / Soft Pulses */}
        <div className="relative flex items-center justify-center h-60 w-60 sm:h-64 sm:w-64 mx-auto my-6">
          {/* Outermost subtle pulse ring */}
          <div className="absolute inset-0 rounded-full bg-[#8DA852]/10 animate-ping opacity-25" />
          {/* Concentric liquid rings */}
          <div className="absolute inset-3 rounded-full border border-[rgba(141,168,82,0.2)] animate-pulse" />
          <div className="absolute inset-8 rounded-full bg-[#0D160E]/70 border border-[rgba(141,168,82,0.25)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]" />
          <div className="absolute inset-16 rounded-full bg-[#121E12]/80 border border-[rgba(141,168,82,0.35)] shadow-[0_4px_20px_rgba(0,0,0,0.5)]" />

          {/* Center Avatar Badge */}
          <div className="relative z-10 h-16 w-16 rounded-full bg-[#1A2E1A] border border-[rgba(141,168,82,0.5)] flex items-center justify-center text-[#A2BD63] shadow-[0_0_28px_rgba(141,168,82,0.35),inset_0_1px_1px_rgba(255,255,255,0.15)]">
            <User className="h-8 w-8 text-[#A2BD63]" />
          </div>
        </div>

        {/* Friendly Message / Icebreaker Card */}
        <Card className="p-4 text-left max-w-sm mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#121E12] text-[#A2BD63] shrink-0 border border-[rgba(141,168,82,0.2)]">
              <Lightbulb className="h-4 w-4" />
            </div>
            <p className="text-xs sm:text-sm text-[#9DA89A] font-medium leading-relaxed">
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
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLeaving || isMatchingResolved || isForceLeaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#0E170E]/80 border border-[rgba(141,168,82,0.2)] hover:border-[rgba(141,168,82,0.35)] hover:bg-[#132213] active:scale-95 transition-all disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            <span>{isLeaving ? 'Exiting...' : 'Cancel Search'}</span>
          </button>
        </div>

        {/* Subtitle / elapsed timer counter */}
        <p className="text-[11px] text-[#6F796D]">
          Searching for {secondsElapsed}s &bull; Safe &amp; Anonymous
        </p>
      </div>

      {/* ================================================================
          Existing Active Room Dialog
          Shown when the user already has a live active chat session.
          Lets them Resume it or cleanly abandon it to start fresh.
          ================================================================ */}
      <Modal
        isOpen={Boolean(existingRoomId)}
        onClose={handleResumeExistingRoom}
        title="You have an active conversation"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#9DA89A]">
            You're already connected to a chat room that is still active. Would you like to return to
            it, or leave it and find a new match?
          </p>
          <div className="flex flex-col gap-3 sm:flex-row pt-2">
            <button
              type="button"
              onClick={handleResumeExistingRoom}
              className="liquid-cta-btn flex-1 py-3 px-4 rounded-full text-sm font-semibold text-white transition-all active:scale-95"
            >
              Resume Conversation
            </button>
            <button
              type="button"
              onClick={handleForceLeaveAndRematch}
              disabled={isForceLeaving}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-full text-sm font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#0E170E] border border-[rgba(141,168,82,0.2)] hover:bg-[#132213] transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              <span>{isForceLeaving ? 'Leaving...' : 'Leave & Rematch'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MatchingPage;


