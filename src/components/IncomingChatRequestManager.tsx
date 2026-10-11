/**
 * ============================================================================
 * TALK TO RITIANS - Incoming Chat Request Manager (Phase 3 Fix)
 * ============================================================================
 * Coordinates background presence heartbeats and incoming chat request
 * subscriptions for authenticated students.
 *
 * SUPPRESSION RULES:
 * - Active Chat (/chat/:roomId): Never interrupt an active conversation.
 * - ID Verification (/verify): Do not disrupt camera/OCR flow.
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
import { IncomingChatRequestModal } from './IncomingChatRequestModal';

export const IncomingChatRequestManager: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeRequest, setActiveRequest] = useState<IncomingChatRequest | null>(null);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;
  const navigatingRoomIdRef = useRef<string | null>(null);

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

  // Check for an active, unexpired developer-forced room (e.g. on mount or return from background/suspended tab)
  const checkActiveForcedRoom = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;

    const page = getLogicalPage();
    // Do not redirect if already in chat or during verification
    if (page === 'chat' || page === 'verify') return;

    try {
      // Find the most recent developer_forced chat_request for this user
      const { data: forcedReq, error: reqErr } = await supabase
        .from('chat_requests')
        .select('room_id, expires_at, created_at')
        .eq('recipient_id', user.id)
        .eq('status', 'developer_forced')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reqErr || !forcedReq?.room_id) return;

      const roomId = forcedReq.room_id as string;

      // Ensure user did not explicitly leave this room in this session
      if (sessionStorage.getItem(`left_room_${roomId}`) === 'true') {
        return;
      }

      // Check whether the room is still active and unexpired in chat_rooms
      const { data: room, error: roomErr } = await supabase
        .from('chat_rooms')
        .select('id, status, expires_at')
        .eq('id', roomId)
        .maybeSingle();

      if (roomErr || !room) return;

      if (
        room.status === 'active' &&
        room.expires_at &&
        new Date(room.expires_at).getTime() > Date.now()
      ) {
        if (
          navigatingRoomIdRef.current !== roomId &&
          !locationRef.current.startsWith(`/chat/${roomId}`)
        ) {
          navigatingRoomIdRef.current = roomId;
          navigate(`/chat/${roomId}`, { replace: true });
        }
      }
    } catch (err) {
      console.warn('[IncomingChatRequestManager] checkActiveForcedRoom error:', err);
    }
  }, [user, navigate]);

  // Handle suspended/background mobile tab resume and window focus
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        checkActiveForcedRoom();
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [user, checkActiveForcedRoom]);

  // 2. Realtime Chat Request Subscription
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    let isMounted = true;

    // Initial check for pending request or active forced room (e.g. on page reload / navigation)
    const checkPending = async () => {
      const page = getLogicalPage();
      if (page === 'chat' || page === 'verify') return;

      // Restore active forced room if user returns to website
      await checkActiveForcedRoom();

      if (page === 'matching') return;

      const res = await chatRequestService.getPendingRequest();
      if (isMounted && res.success && res.data) {
        setActiveRequest(res.data);
      }
    };

    checkPending();

    // Supabase Realtime channel for incoming chat requests
    const channelName = `user-chat-requests-${user.id}`;
    const channel = supabase
      .channel(channelName)
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

          // Suppress popup during verification flow
          if (page === 'verify') {
            return;
          }

          if (row?.status === 'developer_forced' && row?.room_id) {
            const targetRoomId = row.room_id as string;
            setActiveRequest(null);

            // If already in that room or navigating to it, ignore duplicate events
            if (
              navigatingRoomIdRef.current === targetRoomId ||
              locationRef.current.startsWith(`/chat/${targetRoomId}`)
            ) {
              return;
            }

            // Directly navigate recipient into the chat room — NO MODAL, NO POPUP
            navigatingRoomIdRef.current = targetRoomId;
            navigate(`/chat/${targetRoomId}`, { replace: true });
          } else if (row?.status === 'pending') {
            // Standard invite request — show incoming invite modal
            if (page === 'chat' || page === 'matching') return;
            const res = await chatRequestService.getPendingRequest();
            if (isMounted && res.success && res.data) {
              setActiveRequest(res.data);
            }
          } else {
            // Dismiss popups if status is no longer pending
            setActiveRequest(null);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, checkActiveForcedRoom, navigate]);

  // Suppress modal if user navigates to chat, matching, or verify
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
