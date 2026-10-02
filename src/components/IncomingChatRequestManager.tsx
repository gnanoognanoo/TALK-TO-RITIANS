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

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  const [activeRequest, setActiveRequest] = useState<IncomingChatRequest | null>(null);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

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

  // 2. Realtime Chat Request Subscription
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    let isMounted = true;

    // Initial check for pending request (e.g. on page reload)
    const checkPending = async () => {
      const page = getLogicalPage();
      if (page === 'chat' || page === 'verify' || page === 'matching') return;

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

          // Suppress popup during active chat or verification flow
          if (page === 'chat' || page === 'verify' || page === 'matching') {
            return;
          }

          if (row?.status === 'pending') {
            const res = await chatRequestService.getPendingRequest();
            if (isMounted && res.success && res.data) {
              setActiveRequest(res.data);
            }
          } else {
            // Dismiss popup if status is no longer pending (accepted elsewhere, rejected, expired, cancelled)
            setActiveRequest(null);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Suppress modal if user navigates to chat, matching, or verify
  const isSuppressedRoute =
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/verify') ||
    location.pathname.startsWith('/matching');

  if (isSuppressedRoute || !activeRequest) {
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
