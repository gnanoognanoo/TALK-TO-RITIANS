/**
 * ============================================================================
 * TALK TO RITIANS - Realtime 1-to-1 Anonymous Text Chat Page (Phases 10, 11, 12)
 * ============================================================================
 * Clean, student-friendly anonymous chat interface matching reference design.
 *
 * Implements:
 * - CHAT PRIVACY: Displays ONLY anonymous username, modular avatar, messages.
 *   NEVER shows department, class, section, batch, year, gender, email, or real name.
 * - TOP BAR: Avatar, anonymous username, online status, and Leave button.
 * - MESSAGE BUBBLES: User is solid purple (#6C4CF5), stranger is light gray (#F3F4F6).
 * - BOTTOM CONTROLS: Skip, rounded message input, Send button.
 * - CONTROLS INVARIANT: Zero visible Block or Report buttons.
 * - PHASE 11: Instant Skip & clean Leave confirmation modal.
 * - PHASE 12: Clean Disconnect / Chat Ended view with broken link icon and Find New Chat.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Send,
  FastForward,
  LogOut,
  ShieldCheck,
  Unlink,
  AlertCircle,
  Clock,
  Pause,
  Play,
} from 'lucide-react';
import {
  Button,
  Modal,
  Avatar,
} from '../components';
import { useAuth } from '../context';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { chatService } from '../services/chatService';
import { matchmakingService } from '../services/matchmakingService';
import {
  ChatMessage,
  ChatConnectionStatus,
  ChatRoomStatus,
  MatchedPeerPersona,
  MAX_MESSAGE_LENGTH,
} from '../types';
import { formatTimer, getTimerThresholdState } from '../utils/timer';

export const ChatPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isDeveloper } = useAuth();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSkipping, setIsSkipping] = useState<boolean>(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState<boolean>(false);
  const [roomStatus, setRoomStatus] = useState<ChatRoomStatus>('active');
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>('connecting');
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [duplicateTabWarning, setDuplicateTabWarning] = useState<boolean>(false);

  // Developer Chat Timer Freeze / Resume State
  const [timerPausedAt, setTimerPausedAt] = useState<string | null>(null);
  const [isTogglingFreeze, setIsTogglingFreeze] = useState<boolean>(false);
  const isTimerFrozen = Boolean(timerPausedAt);

  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasWarnedOneMinuteRef = useRef<boolean>(false);

  // Reset 1-minute warning flag on room change
  useEffect(() => {
    hasWarnedOneMinuteRef.current = false;
  }, [roomId]);

  // Peer Persona and Authoritative Expiration (from route state or DB)
  const navState = location.state as { peer?: MatchedPeerPersona; expiresAt?: string } | null;
  const initialPeer = navState?.peer;
  const initialExpiresAt = navState?.expiresAt;

  const [peer, setPeer] = useState<MatchedPeerPersona>(
    initialPeer || {
      anonymousUsername: 'Anonymous RITian',
      avatarConfig: {
        face: 'round',
        skin: '#FDDBB4',
        hair: 'short',
        hairColor: '#1A1A1A',
        eyes: 'normal',
        eyebrows: 'natural',
        mouth: 'smile',
        shirt: 'crew',
        shirtColor: '#4F46E5',
        accessory: 'none',
        background: 'indigo',
      },
    }
  );

  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt || null);
  const [endReason, setEndReason] = useState<string | null>(null);

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    if (!initialExpiresAt) return 420;
    const diff = Math.floor((new Date(initialExpiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  /**
   * 7-Minute Countdown Timer & Expiration Trigger
   * Starts at 07:00, warns at 01:00 remaining, and automatically ends at 00:00.
   * If isTimerFrozen is true, the timer is paused and does NOT decrement or expire!
   */
  useEffect(() => {
    if (!expiresAt || roomStatus !== 'active' || isTimerFrozen) return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      // 01:00 remaining warning trigger (shown once in message stream)
      if (remaining <= 60 && remaining > 0 && !hasWarnedOneMinuteRef.current) {
        hasWarnedOneMinuteRef.current = true;
        setMessages((prev) => {
          if (prev.some((m) => m.id === `sys-warning-1m-${roomId}`)) return prev;
          return [
            ...prev,
            {
              id: `sys-warning-1m-${roomId}`,
              roomId: roomId || '',
              senderId: 'system',
              content: '⏳ 1 minute remaining — chat ends at 00:00.',
              createdAt: new Date().toISOString(),
              messageType: 'system',
              isSystem: true,
            },
          ];
        });
      }

      // 00:00 expiration: room automatically ends with end_reason = 'time_limit'
      if (remaining <= 0) {
        setRoomStatus('ended');
        setEndReason('time_limit');
        setConnectionStatus('stranger disconnected');
        if (roomId) {
          chatService.endRoom(roomId, 'time_limit').catch(() => {});
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, roomStatus, roomId, isTimerFrozen]);

  /**
   * Auto-scroll when messages update
   */
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /**
   * Initial Data Hydration & Page Refresh Invariant
   */
  useEffect(() => {
    let isMounted = true;
    if (!roomId) return;

    const hydrateRoom = async () => {
      setConnectionStatus('connecting');

      const res = await chatService.reconnectRoom(roomId);
      if (!isMounted) return;

      if (res.success && res.data) {
        if (res.data.peer) {
          setPeer(res.data.peer);
        }
        if (res.data.timerPausedAt) {
          setTimerPausedAt(res.data.timerPausedAt);
          setRemainingSeconds(res.data.timerRemainingSeconds ?? 420);
        } else {
          setTimerPausedAt(null);
          if (res.data.expiresAt) {
            setExpiresAt(res.data.expiresAt);
            const diff = Math.floor((new Date(res.data.expiresAt).getTime() - Date.now()) / 1000);
            setRemainingSeconds(Math.max(0, diff));
            if (diff <= 0) {
              setRoomStatus('ended');
              setEndReason('time_limit');
              setConnectionStatus('stranger disconnected');
              return;
            }
          }
        }
        if (res.data.endReason) {
          setEndReason(res.data.endReason);
        }
        setMessages(res.data.messages);
        setRoomStatus(res.data.status);

        if (res.data.status === 'active') {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('stranger disconnected');
        }
      } else {
        setRoomStatus('ended');
        setConnectionStatus('stranger disconnected');
      }

      scrollToBottom(false);
    };

    hydrateRoom();

    // Supabase Realtime Subscriptions (Separated Message & Room Status Channels)
    let messagesChannel: any = null;
    let roomStatusChannel: any = null;

    if (isSupabaseConfigured) {
      // 1. Dedicated Messages Channel: chat-messages-${roomId}
      console.info('[Realtime:Messages] CHANNEL_CREATED:', `chat-messages-${roomId}`);
      console.info('[Realtime:Messages] SUBSCRIBING:', `chat-messages-${roomId}`);

      messagesChannel = supabase
        .channel(`chat-messages-${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (!isMounted) return;
            const newRow = payload.new as any;

            console.info('[Realtime:Messages] PAYLOAD_RECEIVED:', {
              received: true,
              eventType: payload.eventType,
              schema: payload.schema,
              table: payload.table,
              hasNewRecord: Boolean(payload.new),
              hasMessageId: Boolean(newRow?.id),
              hasRoomId: Boolean(newRow?.room_id),
            });

            const formattedMsg: ChatMessage = {
              id: newRow.id,
              roomId: newRow.room_id,
              senderId: newRow.sender_id,
              content: newRow.content,
              createdAt: newRow.created_at,
              messageType: newRow.message_type,
              isSystem: newRow.message_type === 'system',
            };

            setMessages((prev) => {
              if (prev.some((m) => m.id === formattedMsg.id)) return prev;
              return [...prev, formattedMsg];
            });

            // If system message indicating room exit
            if (formattedMsg.isSystem) {
              setConnectionStatus('stranger disconnected');
              setRoomStatus('ended');
            }
          }
        )
        .subscribe(async (status: string) => {
          if (!isMounted) return;
          console.info(`[Realtime:Messages] ${status}:`, `chat-messages-${roomId}`);

          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
            // Catch-up fetch: cover any messages inserted between initial
            // hydration and the moment the subscription became active.
            try {
              const catchUp = await chatService.getRoomMessages(roomId);
              if (catchUp.success && catchUp.data && isMounted) {
                setMessages((prev) => {
                  const existingIds = new Set(prev.map((m) => m.id));
                  const newMsgs = catchUp.data!.filter((m) => !existingIds.has(m.id));
                  return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
                });
              }
            } catch {
              // Non-fatal: subscription is now live, catch-up is best-effort
            }
          } else if (status === 'CLOSED') {
            console.info('[Realtime:Messages] CLOSED:', `chat-messages-${roomId}`);
            setConnectionStatus('stranger disconnected');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[Realtime:Messages] CHANNEL_ERROR:', `chat-messages-${roomId}`);
            setConnectionStatus('reconnecting');
            // Attempt a catch-up fetch on error to sync any missed messages
            setTimeout(async () => {
              if (!isMounted) return;
              try {
                const syncRes = await chatService.reconnectRoom(roomId);
                if (syncRes.success && syncRes.data && isMounted) {
                  if (syncRes.data.status === 'active') {
                    setMessages(syncRes.data.messages);
                    setConnectionStatus('connected');
                  }
                }
              } catch {
                // Will retry on next heartbeat or visibility change
              }
            }, 2000);
          } else if (status === 'TIMED_OUT') {
            console.warn('[Realtime:Messages] TIMED_OUT:', `chat-messages-${roomId}`);
            setConnectionStatus('reconnecting');
          }
        });

      // 2. Dedicated Room Status Channel: chat-room-status-${roomId}
      console.info('[Realtime:RoomStatus] CHANNEL_CREATED:', `chat-room-status-${roomId}`);
      roomStatusChannel = supabase
        .channel(`chat-room-status-${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_rooms',
            filter: `id=eq.${roomId}`,
          },
          async (payload) => {
            if (!isMounted) return;
            const updatedRoom = payload.new as any;
            if (updatedRoom.timer_paused_at) {
              setTimerPausedAt(updatedRoom.timer_paused_at);
              if (updatedRoom.timer_remaining_seconds !== undefined && updatedRoom.timer_remaining_seconds !== null) {
                setRemainingSeconds(updatedRoom.timer_remaining_seconds);
              }
            } else if (updatedRoom.timer_paused_at === null) {
              setTimerPausedAt(null);
              if (updatedRoom.expires_at) {
                setExpiresAt(updatedRoom.expires_at);
                const diff = Math.max(0, Math.floor((new Date(updatedRoom.expires_at).getTime() - Date.now()) / 1000));
                setRemainingSeconds(diff);
              }
            } else if (updatedRoom.expires_at) {
              setExpiresAt(updatedRoom.expires_at);
            }
            if (updatedRoom.persona_updated_at) {
              // Peer or own persona was updated (e.g. unlink or relink identity)
              // Fetch authoritative effective peer persona immediately without requiring refresh
              try {
                const peerRes = await chatService.getRoomPeer(roomId);
                if (peerRes.success && peerRes.data?.peer && isMounted) {
                  setPeer(peerRes.data.peer);
                }
              } catch (err) {
                console.warn('[Realtime:RoomStatus] Failed to refresh peer persona:', err);
              }
            }
            if (updatedRoom.status === 'ended' || updatedRoom.status === 'skipped') {
              setRoomStatus(updatedRoom.status);
              if (updatedRoom.end_reason) {
                setEndReason(updatedRoom.end_reason);
              }
              setConnectionStatus('stranger disconnected');
            }
          }
        )
        .subscribe((status: string) => {
          if (!isMounted) return;
          console.info(`[Realtime:RoomStatus] ${status}:`, `chat-room-status-${roomId}`);
        });
    }

    return () => {
      isMounted = false;
      if (messagesChannel) supabase.removeChannel(messagesChannel);
      if (roomStatusChannel) supabase.removeChannel(roomStatusChannel);
    };
    // IMPORTANT: Only roomId should trigger re-subscription.
    // initialPeer and scrollToBottom are stable references and must NOT
    // cause the Realtime channel to be torn down and recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /**
   * Room Heartbeat
   */
  useEffect(() => {
    if (!roomId || roomStatus !== 'active') return;

    heartbeatTimerRef.current = setInterval(async () => {
      const res = await chatService.heartbeatRoom(roomId);
      if (res.success && res.data) {
        if (res.data.peerDisconnected || !res.data.isActive) {
          setRoomStatus('ended');
          setConnectionStatus('stranger disconnected');
        }
      }
    }, 6000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [roomId, roomStatus]);

  /**
   * Network Interruption & Background Handling
   */
  useEffect(() => {
    if (!roomId) return;

    const handleOnline = async () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }

      const syncRes = await chatService.reconnectRoom(roomId);
      if (syncRes.success && syncRes.data) {
        if (syncRes.data.expiresAt) {
          setExpiresAt(syncRes.data.expiresAt);
          const diff = Math.floor((new Date(syncRes.data.expiresAt).getTime() - Date.now()) / 1000);
          setRemainingSeconds(Math.max(0, diff));
          if (diff <= 0) {
            setRoomStatus('ended');
            setEndReason('time_limit');
            setConnectionStatus('stranger disconnected');
            return;
          }
        }
        if (syncRes.data.endReason) {
          setEndReason(syncRes.data.endReason);
        }
        if (syncRes.data.status === 'active') {
          setRoomStatus('active');
          setConnectionStatus('connected');
          setMessages(syncRes.data.messages);
        } else {
          setRoomStatus('ended');
          setConnectionStatus('stranger disconnected');
        }
      }
    };

    const handleOffline = () => {
      setConnectionStatus('reconnecting');

      if (!graceTimerRef.current && roomStatus === 'active') {
        graceTimerRef.current = setTimeout(async () => {
          setRoomStatus('ended');
          setConnectionStatus('stranger disconnected');
          await chatService.endRoom(roomId, 'disconnect');
        }, 15000);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && roomStatus === 'active') {
        if (expiresAt) {
          const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
          setRemainingSeconds(Math.max(0, diff));
          if (diff <= 0) {
            setRoomStatus('ended');
            setEndReason('time_limit');
            setConnectionStatus('stranger disconnected');
            return;
          }
        }
        const syncRes = await chatService.reconnectRoom(roomId);
        if (syncRes.success && syncRes.data) {
          if (syncRes.data.expiresAt) {
            setExpiresAt(syncRes.data.expiresAt);
            const diff = Math.floor((new Date(syncRes.data.expiresAt).getTime() - Date.now()) / 1000);
            setRemainingSeconds(Math.max(0, diff));
            if (diff <= 0) {
              setRoomStatus('ended');
              setEndReason('time_limit');
              setConnectionStatus('stranger disconnected');
              return;
            }
          }
          if (syncRes.data.endReason) {
            setEndReason(syncRes.data.endReason);
          }
          if (syncRes.data.status === 'active') {
            setConnectionStatus('connected');
            setMessages(syncRes.data.messages);
          } else {
            setRoomStatus('ended');
            setConnectionStatus('stranger disconnected');
          }
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [roomId, roomStatus]);

  /**
   * Duplicate Tab Detection
   */
  useEffect(() => {
    if (!roomId) return;
    let tabChannel: BroadcastChannel | null = null;
    try {
      tabChannel = new BroadcastChannel(`talk_to_ritians_chat_${roomId}`);
      tabChannel.onmessage = (e) => {
        if (e.data?.type === 'TAB_OPENED') {
          setDuplicateTabWarning(true);
        }
      };
      tabChannel.postMessage({ type: 'TAB_OPENED' });
    } catch {
      // Ignore
    }

    return () => {
      tabChannel?.close();
    };
  }, [roomId]);

  /**
   * Privileged Developer Action: Freeze Chat Timer
   */
  const handleFreezeTimer = useCallback(async () => {
    if (!roomId || isTogglingFreeze || roomStatus !== 'active' || isTimerFrozen) return;
    setIsTogglingFreeze(true);
    try {
      const res = await chatService.freezeChatTimer(roomId);
      if (res.success && res.data) {
        setTimerPausedAt(res.data.pausedAt);
        setRemainingSeconds(res.data.remainingSeconds);
      } else {
        console.warn('[ChatPage] Freeze timer failed:', res.error);
      }
    } catch (err) {
      console.warn('[ChatPage] Freeze timer error:', err);
    } finally {
      setIsTogglingFreeze(false);
    }
  }, [roomId, isTogglingFreeze, roomStatus, isTimerFrozen]);

  /**
   * Privileged Developer Action: Resume Chat Timer
   */
  const handleResumeTimer = useCallback(async () => {
    if (!roomId || isTogglingFreeze || roomStatus !== 'active' || !isTimerFrozen) return;
    setIsTogglingFreeze(true);
    try {
      const res = await chatService.resumeChatTimer(roomId);
      if (res.success && res.data) {
        setTimerPausedAt(null);
        setExpiresAt(res.data.expiresAt);
        setRemainingSeconds(res.data.remainingSeconds);
      } else {
        console.warn('[ChatPage] Resume timer failed:', res.error);
      }
    } catch (err) {
      console.warn('[ChatPage] Resume timer error:', err);
    } finally {
      setIsTogglingFreeze(false);
    }
  }, [roomId, isTogglingFreeze, roomStatus, isTimerFrozen]);

  /**
   * Developer Keyboard Shortcut: Ctrl/Cmd + Shift + P
   */
  useEffect(() => {
    if (!isDeveloper || roomStatus !== 'active') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        if (isTimerFrozen) {
          handleResumeTimer();
        } else {
          handleFreezeTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeveloper, roomStatus, isTimerFrozen, handleResumeTimer, handleFreezeTimer]);

  /**
   * Handle Sending Messages
   */
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!roomId || !inputMessage.trim() || isSending || roomStatus !== 'active') return;

    const contentToSend = inputMessage.trim();
    if (contentToSend.length > MAX_MESSAGE_LENGTH) return;

    setInputMessage('');
    setIsSending(true);

    try {
      const res = await chatService.sendMessage(roomId, contentToSend);
      if (res.success && res.data) {
        const newMsg = res.data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } else if (res.error?.code === 'ROOM_EXPIRED') {
        setRoomStatus('ended');
        setEndReason('time_limit');
        setConnectionStatus('stranger disconnected');
      }
    } catch (err) {
      console.error('[ChatPage] Message send error:', err);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  /**
   * Fast Skip: Awaits room termination transaction before navigating to matching
   */
  const handleSkip = async () => {
    if (isSkipping || !roomId) return;
    setIsSkipping(true);
    try {
      if (roomId) {
        sessionStorage.setItem(`left_room_${roomId}`, 'true');
      }
      if (roomStatus === 'active') {
        const res = await chatService.endRoom(roomId, 'skip');
        if (!res.success && res.error?.code === 'RATE_LIMITED') {
          console.warn('[ChatPage] Skip rate limited:', res.error?.message);
          setIsSkipping(false);
          return;
        }
      }
      navigate('/matching', { replace: true });
    } catch (err) {
      console.warn('[ChatPage] Skip error:', err);
      navigate('/matching', { replace: true });
    } finally {
      setIsSkipping(false);
    }
  };

  /**
   * Confirm Leave: End room, leave queue, navigate to home
   */
  const confirmLeave = async () => {
    if (isLeavingRoom) return;
    setIsLeavingRoom(true);
    try {
      if (roomId) {
        sessionStorage.setItem(`left_room_${roomId}`, 'true');
      }
      if (roomId && roomStatus === 'active') {
        await chatService.endRoom(roomId, 'leave');
      }
      await matchmakingService.leaveMatchmaking();
      setIsLeaveModalOpen(false);
      navigate('/home', { replace: true });
    } catch (err) {
      console.warn('[ChatPage] Leave error:', err);
      setIsLeaveModalOpen(false);
      navigate('/home', { replace: true });
    } finally {
      setIsLeavingRoom(false);
    }
  };

  const peerInitials = peer.anonymousUsername
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isDisconnected = roomStatus !== 'active' || connectionStatus === 'stranger disconnected';

  return (
    <div
      id="chat-page-root"
      className="h-[100dvh] max-h-[100dvh] w-full flex flex-col overflow-hidden bg-[#050805]"
    >
      <div
        id="chat-page-container"
        className="flex-1 flex flex-col h-full max-w-4xl mx-auto w-full bg-[#050805] sm:border-x sm:border-[rgba(141,168,82,0.15)] overflow-hidden"
      >
        {/* =========================================================================
            TOP BAR (Fixed Header: flex-shrink: 0)
            Left: Avatar, peer username, online / connected status.
            Right: Timer and Leave button.
            CRITICAL: Peer label prefix removed per Change 2.
            CRITICAL: Header is shrink-0 and remains visible at all times.
            ========================================================================= */}
        <header
          id="chat-header"
          className="px-3.5 sm:px-6 py-2.5 sm:py-3 border-b border-[rgba(141,168,82,0.18)] bg-[#091009]/95 backdrop-blur-xl flex items-center justify-between gap-2.5 shrink-0"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Avatar
              size="md"
              avatarConfig={peer.avatarConfig as any}
              initials={peerInitials}
              presence={
                connectionStatus === 'connected'
                  ? 'online'
                  : isDisconnected
                  ? 'offline'
                  : 'matching'
              }
            />
            <div className="min-w-0">
              <h1
                id="chat-peer-username"
                className="font-bold text-sm sm:text-base text-[#F4F6F1] truncate"
              >
                {peer.anonymousUsername}
              </h1>
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connectionStatus === 'connected'
                      ? 'bg-[#8DA852] animate-pulse shadow-[0_0_8px_rgba(141,168,82,0.6)]'
                      : isDisconnected
                      ? 'bg-[#6F796D]'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="text-[#9DA89A] text-[11px] font-medium">
                  {connectionStatus === 'connected'
                    ? 'Online'
                    : isDisconnected
                    ? 'Disconnected'
                    : connectionStatus === 'reconnecting'
                    ? 'Reconnecting...'
                    : 'Connecting...'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Action: Timer and Leave */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {roomStatus === 'active' && (
              <div className="flex items-center gap-1.5">
                {isTimerFrozen ? (
                  /* FROZEN STATE: Distinct paused badge without pulsing warnings */
                  <div
                    id="chat-header-timer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold tabular-nums tracking-wide bg-sky-950/60 text-sky-300 border-sky-500/40 shadow-sm"
                    title={isDeveloper ? 'Timer frozen by developer' : 'Timer paused'}
                  >
                    <Pause className="h-3.5 w-3.5 text-sky-400" />
                    <span>
                      {formatTimer(remainingSeconds)}{' '}
                      {isDeveloper ? '— FROZEN' : '(Timer paused)'}
                    </span>
                  </div>
                ) : (
                  /* RUNNING STATE: Standard 7-minute timer with warning colors */
                  <div
                    id="chat-header-timer"
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full border text-xs font-semibold tabular-nums tracking-wide transition-all ${
                      getTimerThresholdState(remainingSeconds) === 'red'
                        ? 'bg-red-950/70 text-red-300 border-red-500/70 font-bold ring-2 ring-red-500/30 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                        : getTimerThresholdState(remainingSeconds) === 'amber'
                        ? 'bg-amber-950/70 text-amber-300 border-amber-500/60 font-bold ring-2 ring-amber-500/30 animate-pulse shadow-[0_0_12px_rgba(227,163,41,0.25)]'
                        : 'bg-[#101A12] text-[#A2BD63] border-[rgba(141,168,82,0.3)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]'
                    }`}
                    title="7-minute chat session timer"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatTimer(remainingSeconds)}</span>
                  </div>
                )}

                {/* Privileged Developer Only: Freeze / Resume Control */}
                {isDeveloper && (
                  isTimerFrozen ? (
                    <Button
                      id="developer-resume-timer-btn"
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleResumeTimer}
                      isLoading={isTogglingFreeze}
                      disabled={isTogglingFreeze}
                      leftIcon={<Play className="h-3.5 w-3.5" />}
                      className="text-xs h-7 px-2.5 font-semibold bg-[#526C34] hover:bg-[#688a42] text-white border-0 shadow-sm rounded-full"
                      title="Resume countdown timer (Ctrl+Shift+P)"
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      id="developer-freeze-timer-btn"
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleFreezeTimer}
                      isLoading={isTogglingFreeze}
                      disabled={isTogglingFreeze}
                      leftIcon={<Pause className="h-3.5 w-3.5 text-sky-400" />}
                      className="text-xs h-7 px-2.5 font-semibold border-sky-500/40 text-sky-300 bg-sky-950/40 hover:bg-sky-950/60 shadow-sm rounded-full"
                      title="Freeze countdown timer (Ctrl+Shift+P)"
                    >
                      Freeze
                    </Button>
                  )
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/25 border border-rose-500/35 hover:bg-rose-950/50 active:scale-95 transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Leave</span>
            </button>
          </div>
        </header>

        {/* 01:00 Remaining Warning Banner (Suppressed while timer is frozen) */}
        {roomStatus === 'active' && !isTimerFrozen && remainingSeconds !== null && remainingSeconds <= 60 && remainingSeconds > 0 && (
          <div
            id="chat-time-warning-banner"
            role="alert"
            aria-live="polite"
            className="px-4 py-2 bg-amber-950/70 border-b border-amber-500/40 text-amber-200 text-xs font-medium flex items-center justify-between gap-3 shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
              <span className="truncate">
                <strong className="font-semibold text-white">1 minute remaining</strong> — Wrap up your chat! Room ends at 00:00.
              </span>
            </div>
            <span className="shrink-0 tabular-nums font-bold text-amber-300 bg-amber-900/60 border border-amber-500/50 px-2.5 py-0.5 rounded-full text-xs">
              {formatTimer(remainingSeconds)}
            </span>
          </div>
        )}

        {/* Duplicate Tab Warning */}
        {duplicateTabWarning && (
          <div className="px-4 py-2 bg-amber-950/50 border-b border-amber-500/30 text-amber-200 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Active in multiple tabs. Messages sync automatically.</span>
          </div>
        )}

        {/* =========================================================================
            MAIN CHAT BODY OR DISCONNECTED SCREEN (Phase 12)
            ========================================================================= */}
        {isDisconnected ? (
          endReason === 'time_limit' ? (
            /* Time-Limit End Screen: "7-minute chat ended" */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#050805]">
              <div className="max-w-sm w-full bg-[#0D160E] border border-[rgba(141,168,82,0.22)] rounded-[28px] p-7 shadow-[0_8px_32px_rgba(0,0,0,0.5)] space-y-6">
                <div className="h-16 w-16 mx-auto rounded-full bg-[#121E12] border border-[rgba(141,168,82,0.3)] flex items-center justify-center text-[#A2BD63]">
                  <Clock className="h-8 w-8 stroke-[1.75]" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-[#F4F6F1]">
                    Time's up!
                  </h2>
                  <p className="text-sm text-[#9DA89A]">
                    Your 7-minute conversation has ended.
                  </p>
                </div>

                {/* Action Buttons: [Find Another RITian] [Leave] */}
                <div className="space-y-2.5 pt-2">
                  <button
                    id="chat-find-another-button"
                    type="button"
                    onClick={() => navigate('/matching', { replace: true })}
                    className="liquid-cta-btn w-full py-3 px-4 rounded-full font-bold text-sm text-white transition-all active:scale-95 shadow-[0_4px_16px_rgba(141,168,82,0.35)]"
                  >
                    Find Another RITian
                  </button>
                  <button
                    id="chat-leave-button"
                    type="button"
                    onClick={async () => {
                      await matchmakingService.leaveMatchmaking();
                      navigate('/home', { replace: true });
                    }}
                    className="w-full py-3 px-4 rounded-full font-semibold text-sm text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] transition-all active:scale-95"
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Phase 12 - Disconnected Page / State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#050805]">
              <div className="max-w-sm w-full bg-[#0D160E] border border-[rgba(141,168,82,0.22)] rounded-[28px] p-7 shadow-[0_8px_32px_rgba(0,0,0,0.5)] space-y-6">
                {/* Broken Link Icon */}
                <div className="h-16 w-16 mx-auto rounded-full bg-[#121E12] border border-[rgba(141,168,82,0.3)] flex items-center justify-center text-[#A2BD63]">
                  <Unlink className="h-8 w-8 stroke-[1.75]" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-[#F4F6F1]">
                    Chat Ended
                  </h2>
                  <p className="text-sm text-[#9DA89A]">
                    The other user has disconnected.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (roomId) {
                        sessionStorage.setItem(`left_room_${roomId}`, 'true');
                      }
                      navigate('/matching', { replace: true });
                    }}
                    className="liquid-cta-btn w-full py-3 px-4 rounded-full font-bold text-sm text-white transition-all active:scale-95 shadow-[0_4px_16px_rgba(141,168,82,0.35)]"
                  >
                    Find a New Chat
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (roomId) {
                        sessionStorage.setItem(`left_room_${roomId}`, 'true');
                      }
                      await matchmakingService.leaveMatchmaking();
                      navigate('/home', { replace: true });
                    }}
                    className="w-full py-3 px-4 rounded-full font-semibold text-sm text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] transition-all active:scale-95"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* Phase 10 - Message Stream (ONLY this area scrolls: flex: 1, min-height: 0, overflow-y: auto) */
          <div
            id="chat-messages-container"
            className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#050805]"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16 text-[#6F796D] space-y-3">
                <div className="h-12 w-12 rounded-full bg-[#101A12] border border-[rgba(141,168,82,0.22)] flex items-center justify-center text-[#8DA852] shadow-sm">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#F4F6F1]">
                    You're connected with a fellow RITian!
                  </p>
                  <p className="text-xs text-[#9DA89A] max-w-xs leading-relaxed">
                    Say hello to break the ice. Your real name, department, and roll number are completely confidential.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="text-center py-1">
                      <span className="inline-block px-3.5 py-1 rounded-full text-xs bg-[#101A12] text-[#9DA89A] border border-[rgba(141,168,82,0.18)] font-medium">
                        {msg.content}
                      </span>
                    </div>
                  );
                }

                const isMe = msg.senderId === user?.id;
                const timeFormatted = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`
                        max-w-[82%] sm:max-w-md px-4 py-2.5 text-sm transition-all
                        ${
                          isMe
                            ? 'bg-[#293B18] text-[#F4F6F1] font-medium rounded-2xl rounded-br-sm border border-[rgba(162,189,99,0.3)] shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                            : 'bg-[#0E170E] text-[#F4F6F1] rounded-2xl rounded-bl-sm border border-[rgba(141,168,82,0.2)] shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                        }
                      `}
                    >
                      <p className="leading-relaxed break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      <span
                        className={`block text-[10px] mt-1 text-right ${
                          isMe ? 'text-[#A2BD63]/80' : 'text-[#6F796D]'
                        }`}
                      >
                        {timeFormatted}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* =========================================================================
            BOTTOM CONTROLS BAR (Fixed Composer: flex-shrink: 0 / shrink-0)
            Skip (secondary action)
            Rounded liquid inset input field
            Send button (liquid CTA)
            Zero visible Block or Report buttons
            ========================================================================= */}
        {!isDisconnected && (
          <div
            id="chat-composer-container"
            className="p-2.5 sm:p-3.5 border-t border-[rgba(141,168,82,0.18)] bg-[#091009]/95 backdrop-blur-xl shrink-0 pb-safe"
          >
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              {/* Skip Button */}
              <button
                type="button"
                onClick={handleSkip}
                title="Skip to next RITian"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-xs font-semibold bg-[#101A12] border border-[rgba(141,168,82,0.25)] text-[#A2BD63] hover:bg-[#142314] active:scale-95 transition-all"
              >
                <FastForward className="h-4 w-4 text-[#8DA852]" />
                <span className="hidden sm:inline">Skip</span>
              </button>

              {/* Message Input: Liquid Inset */}
              <input
                ref={inputRef}
                id="chat-message-input"
                type="text"
                value={inputMessage}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={roomStatus !== 'active'}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="liquid-inset flex-1 bg-[#060A06] text-[#F4F6F1] placeholder-[#6F796D] rounded-full border border-[rgba(141,168,82,0.22)] px-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:border-[#8DA852] focus:ring-2 focus:ring-[#8DA852]/20 transition-all disabled:opacity-50"
                autoComplete="off"
              />

              {/* Send Button: Liquid CTA */}
              <button
                type="submit"
                disabled={!inputMessage.trim() || isSending || roomStatus !== 'active'}
                className="liquid-cta-btn shrink-0 rounded-full h-9 w-9 sm:h-10 sm:w-auto sm:px-4 flex items-center justify-center gap-1.5 text-white font-bold disabled:opacity-40 transition-all active:scale-95 shadow-[0_2px_12px_rgba(141,168,82,0.35)]"
                title="Send message"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline text-xs font-bold">Send</span>
              </button>
            </form>
          </div>
        )}

      {/* Close chat-page-container */}
      </div>

      {/* =========================================================================
          LEAVE CHAT CONFIRMATION MODAL (Phase 11)
          Title: Leave chat?
          Text: This will end your current conversation.
          Buttons: Cancel, Leave
          ========================================================================= */}
      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Leave chat?"
        description="This will end your current conversation."
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(false)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLeave}
              className="px-4 py-2 rounded-full text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-[0_2px_10px_rgba(225,29,72,0.3)]"
            >
              Leave
            </button>
          </>
        }
      >
        <p className="text-xs text-[#9DA89A] leading-relaxed">
          Leaving will end the session for both students. You will return to your student dashboard.
        </p>
      </Modal>
    </div>
  );
};

export default ChatPage;
