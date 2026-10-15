/**
 * ============================================================================
 * TALK TO RITIANS - Global Active Room & Chat Request Manager
 * ============================================================================
 * Coordinates:
 * 1. Background presence heartbeats.
 * 2. Realtime incoming chat request notifications (with instant cancellation).
 * 3. Global active room detection & auto-navigation:
 *    Whenever an authenticated user is assigned a committed active chat room,
 *    both users are automatically routed to /chat/:roomId without manual refresh.
 * 4. Resumption on mobile tab foreground / focus / reconnect.
 *
 * SUPPRESSION & SAFETY RULES:
 * - Active Chat (/chat/:roomId): Never redirect away or disrupt current room.
 * - ID Verification (/verify): Do not disrupt camera/OCR flow.
 * - Intentionally left room: Suppressed via sessionStorage left_room_<roomId>.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { presenceService } from '../services/presenceService';
import {
  chatRequestService,
  IncomingChatRequest,
} from '../services/chatRequestService';
import { chatService } from '../services/chatService';
import { IncomingChatRequestModal } from './IncomingChatRequestModal';

export const IncomingChatRequestManager: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeRequest, setActiveRequest] = useState<IncomingChatRequest | null>(null);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;
  const navigatingRoomIdRef = useRef<string | null>(null);

  // Clear navigating room ref if user reaches the chat room or leaves it
  useEffect(() => {
    if (location.pathname.startsWith('/chat/')) {
      const currentRoomId = location.pathname.replace('/chat/', '').split('/')[0];
      if (navigatingRoomIdRef.current === currentRoomId) {
        navigatingRoomIdRef.current = null;
      }
    } else {
      navigatingRoomIdRef.current = null;
    }
  }, [location.pathname]);

  // Determine current logical page for presence
  const getLogicalPage = (): string => {
    const path = locationRef.current;
    if (path.startsWith('/chat')) return 'chat';
    if (path.startsWith('/verify')) return 'verify';
    if (path.startsWith('/matching')) return 'matching';
    if (path.startsWith('/settings')) return 'settings';
    return 'home';
  };

  // 1. Presence Heartbeat Loop
  useEffect(() => {
    if (!user) return;

    // Send immediate heartbeat on route change
    presenceService.sendHeartbeat(getLogicalPage());

    const stopHeartbeat = presenceService.startHeartbeat(() => getLogicalPage());

    return () => {
      stopHeartbeat();
    };
  }, [user, location.pathname]);

  /**
   * Authoritatively checks for any active, unexpired chat room assigned to this user.
   * If a committed match exists and the user is not yet inside it, automatically navigates
   * both participants into the room.
   */
  const checkActiveRoom = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;

    const page = getLogicalPage();
    // Do not redirect if already in chat or during identity verification
    if (page === 'chat' || page === 'verify') return;

    try {
      const res = await chatService.getCurrentActiveRoom();
      if (!res.success || !res.data?.hasActiveRoom || !res.data.roomId) {
        return;
      }

      const roomId = res.data.roomId;

      // Ensure user did not explicitly leave/end this room in this session
      if (sessionStorage.getItem(`left_room_${roomId}`) === 'true') {
        return;
      }

      // Prevent repeated navigation loops
      if (
        navigatingRoomIdRef.current === roomId ||
        locationRef.current.startsWith(`/chat/${roomId}`)
      ) {
        return;
      }

      navigatingRoomIdRef.current = roomId;
      navigate(`/chat/${roomId}`, {
        state: {
          peer: res.data.peer,
          expiresAt: res.data.expiresAt,
        },
        replace: true,
      });
    } catch (err) {
      console.warn('[IncomingChatRequestManager] checkActiveRoom error:', err);
    }
  }, [user, navigate]);

  // 2. Mobile tab foreground / focus / network reconnect catch-up handler
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        checkActiveRoom();
      }
    };

    const handleOnline = () => {
      checkActiveRoom();
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleOnline);
    };
  }, [user, checkActiveRoom]);

  // 3. Realtime Chat Request & Active Room Subscriptions
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    let isMounted = true;

    // Initial check for pending request or active room on page mount
    const checkInitialState = async () => {
      const page = getLogicalPage();
      if (page === 'chat' || page === 'verify') return;

      // Check active room first
      await checkActiveRoom();

      if (page === 'matching') return;

      const res = await chatRequestService.getPendingRequest();
      if (isMounted && res.success && res.data) {
        setActiveRequest(res.data);
      }
    };

    checkInitialState();

    // Supabase Realtime channel for incoming & outgoing request changes,
    // plus queue matches and room assignments
    const channelName = `global-room-detection-${user.id}`;
    const channel = supabase
      .channel(channelName)
      // A) Incoming requests to current user
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_requests',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          if (!isMounted) return;

          const row = payload.new as any;
          const page = getLogicalPage();

          if (page === 'verify') return;

          if (row?.status === 'developer_forced' && row?.room_id) {
            // Direct developer force chat navigation (handles idle user or active chat override)
            setActiveRequest(null);
            sessionStorage.removeItem(`left_room_${row.room_id}`);
            navigatingRoomIdRef.current = row.room_id;
            navigate(`/chat/${row.room_id}`, { replace: true });
          } else if (row?.status === 'pending') {
            // Standard invite request — show incoming invite modal
            if (page === 'chat' || page === 'matching') return;
            const res = await chatRequestService.getPendingRequest();
            if (isMounted && res.success && res.data) {
              setActiveRequest(res.data);
            }
          } else {
            // Cancelled, rejected, or expired: dismiss popup IMMEDIATELY
            setActiveRequest(null);
          }
        }
      )
      // B) Outgoing requests sent by current user that were accepted
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_requests',
          filter: `requester_id=eq.${user.id}`,
        },
        async (payload) => {
          if (!isMounted) return;
          const row = payload.new as any;
          if (row?.status === 'accepted' && row?.room_id) {
            checkActiveRoom();
          }
        }
      )
      // C) Matchmaking queue transitions for current user
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matchmaking_queue',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          if (!isMounted) return;
          const row = payload.new as any;
          if (row?.status === 'matched' && row?.matched_room_id) {
            checkActiveRoom();
          }
        }
      )
      // D) Chat room events where current user is participant 1
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_rooms',
          filter: `user_1=eq.${user.id}`,
        },
        async () => {
          if (!isMounted) return;
          checkActiveRoom();
        }
      )
      // E) Chat room events where current user is participant 2
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_rooms',
          filter: `user_2=eq.${user.id}`,
        },
        async () => {
          if (!isMounted) return;
          checkActiveRoom();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, checkActiveRoom]);

  // Suppress modal popup if user navigates to chat, matching, or verify
  const isSuppressedRoute =
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/verify') ||
    location.pathname.startsWith('/matching');

  if (isSuppressedRoute) {
    return null;
  }

  if (!activeRequest) {
    return null;
  }

  return (
    <IncomingChatRequestModal
      request={activeRequest}
      onDismiss={() => setActiveRequest(null)}
    />
  );
};

export default IncomingChatRequestManager;
