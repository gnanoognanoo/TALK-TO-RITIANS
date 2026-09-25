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

export const ChatPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [roomStatus, setRoomStatus] = useState<ChatRoomStatus>('active');
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>('connecting');
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [duplicateTabWarning, setDuplicateTabWarning] = useState<boolean>(false);

  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
   * Helper to format seconds as MM:SS
   */
  const formatTimer = (seconds: number | null): string => {
    if (seconds === null || isNaN(seconds)) return '07:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * 7-Minute Countdown Timer & Expiration Trigger
   */
  useEffect(() => {
    if (!expiresAt || roomStatus !== 'active') return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        setRoomStatus('ended');
        setEndReason('time_limit');
        setConnectionStatus('stranger disconnected');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, roomStatus]);

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

    // Supabase Realtime Subscription (Messages & Room Status)
    let channel: any = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel(`room:${roomId}`)
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            if (!isMounted) return;
            const updatedRoom = payload.new as any;
            if (updatedRoom.expires_at) {
              setExpiresAt(updatedRoom.expires_at);
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
        .subscribe((status) => {
          if (!isMounted) return;
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
          } else if (status === 'CLOSED') {
            setConnectionStatus('stranger disconnected');
          } else if (status === 'CHANNEL_ERROR') {
            setConnectionStatus('reconnecting');
          }
        });
    }

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, initialPeer, scrollToBottom]);

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
   * Fast Skip: Immediate skip without blocking confirmation
   */
  const handleSkip = async () => {
    if (roomId && roomStatus === 'active') {
      try {
        await chatService.endRoom(roomId, 'skip');
      } catch (err) {
        console.warn('[ChatPage] Skip error:', err);
      }
    }
    navigate('/matching', { replace: true });
  };

  /**
   * Confirm Leave: End room, leave queue, navigate to home
   */
  const confirmLeave = async () => {
    setIsLeaveModalOpen(false);
    if (roomId && roomStatus === 'active') {
      try {
        await chatService.endRoom(roomId, 'leave');
      } catch (err) {
        console.warn('[ChatPage] Leave error:', err);
      }
    }
    await matchmakingService.leaveMatchmaking();
    navigate('/home', { replace: true });
  };

  const peerInitials = peer.anonymousUsername
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isDisconnected = roomStatus !== 'active' || connectionStatus === 'stranger disconnected';

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-65px)] max-w-4xl mx-auto w-full bg-white sm:border-x sm:border-gray-200">
      {/* =========================================================================
          TOP BAR (Phase 10)
          Left: Avatar, anonymous username, online / connected status.
          Right: Leave button (clean red outline / subtle action).
          CRITICAL: NO department, roll number, email, or real names.
          CRITICAL: NO visible Block or Report buttons.
          ========================================================================= */}
      <header className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-normal">Chatting with</span>
              <h1 className="font-bold text-sm sm:text-base text-gray-900 truncate">
                {peer.anonymousUsername}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : isDisconnected
                    ? 'bg-gray-400'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span className="text-gray-500 text-[11px] font-medium">
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
        <div className="flex items-center gap-2 sm:gap-3">
          {roomStatus === 'active' && (
            <div
              id="chat-header-timer"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold tabular-nums tracking-wide transition-colors ${
                (remainingSeconds ?? 420) <= 10
                  ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                  : (remainingSeconds ?? 420) <= 60
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              }`}
              title="7-minute chat session timer"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>
          )}

          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setIsLeaveModalOpen(true)}
            leftIcon={<LogOut className="h-4 w-4" />}
            className="border border-red-200 font-medium"
          >
            Leave
          </Button>
        </div>
      </header>

      {/* Duplicate Tab Warning */}
      {duplicateTabWarning && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Active in multiple tabs. Messages sync automatically.</span>
        </div>
      )}

      {/* =========================================================================
          MAIN CHAT BODY OR DISCONNECTED SCREEN (Phase 12)
          ========================================================================= */}
      {isDisconnected ? (
        endReason === 'time_limit' ? (
          /* Time-Limit End Screen (Requirement 8) */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gray-50/50">
            <div className="max-w-sm w-full bg-white border border-gray-200 rounded-2xl p-8 shadow-card space-y-6">
              <div className="h-16 w-16 mx-auto rounded-full bg-purple-50 flex items-center justify-center text-[#6C4CF5]">
                <Clock className="h-8 w-8 stroke-[1.75]" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Time's up!
                </h2>
                <p className="text-sm text-gray-500">
                  Your 7-minute conversation has ended.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => navigate('/matching', { replace: true })}
                  className="font-bold"
                >
                  Find Another RITian
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={async () => {
                    await matchmakingService.leaveMatchmaking();
                    navigate('/home', { replace: true });
                  }}
                >
                  Leave
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Phase 12 - Disconnected Page / State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gray-50/50">
            <div className="max-w-sm w-full bg-white border border-gray-200 rounded-2xl p-8 shadow-card space-y-6">
              {/* Broken Link Icon */}
              <div className="h-16 w-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <Unlink className="h-8 w-8 stroke-[1.75]" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Chat Ended
                </h2>
                <p className="text-sm text-gray-500">
                  The other user has disconnected.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => navigate('/matching', { replace: true })}
                  className="font-bold"
                >
                  Find a New Chat
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={async () => {
                    await matchmakingService.leaveMatchmaking();
                    navigate('/home', { replace: true });
                  }}
                >
                  Back to Home
                </Button>
              </div>
            </div>
          </div>
        )
      ) : (
        /* Phase 10 - Message Stream */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#FAFAFC]">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 text-gray-400 space-y-2">
              <div className="h-12 w-12 rounded-full bg-[#F5F3FF] flex items-center justify-center text-[#6C4CF5]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-gray-700">
                You're connected with a fellow RITian!
              </p>
              <p className="text-xs text-gray-400 max-w-xs">
                Say hello to break the ice. Your real name, department, and roll number are completely confidential.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="text-center py-1">
                    <span className="inline-block px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-500 font-medium">
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
                      max-w-[80%] sm:max-w-md px-4 py-2.5 text-sm transition-all
                      ${
                        isMe
                          ? 'bg-[#6C4CF5] text-white rounded-2xl rounded-br-none shadow-sm'
                          : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-none'
                      }
                    `}
                  >
                    <p className="leading-relaxed break-words whitespace-pre-wrap">
                      {msg.content}
                    </p>
                    <span
                      className={`block text-[10px] mt-1 text-right ${
                        isMe ? 'text-purple-200' : 'text-gray-400'
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
          BOTTOM CONTROLS BAR (Phase 10)
          Skip (secondary purple action)
          Rounded input field
          Send button (solid purple)
          Zero visible Block or Report buttons
          ========================================================================= */}
      {!isDisconnected && (
        <div className="p-3 sm:p-4 border-t border-gray-200 bg-white shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            {/* Skip Button: Secondary Purple Action */}
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleSkip}
              leftIcon={<FastForward className="h-4 w-4 text-[#6C4CF5]" />}
              title="Skip to next RITian"
              className="shrink-0 px-3 sm:px-4 border-purple-200 text-[#6C4CF5] hover:bg-[#F5F3FF]"
            >
              <span className="hidden sm:inline">Skip</span>
            </Button>

            {/* Message Input: Clean rounded input */}
            <input
              ref={inputRef}
              id="chat-message-input"
              type="text"
              value={inputMessage}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={roomStatus !== 'active'}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-white text-gray-900 placeholder-gray-400 rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:border-[#6C4CF5] focus:ring-2 focus:ring-[#6C4CF5]/10 transition-colors disabled:opacity-50"
              autoComplete="off"
            />

            {/* Send Button: Solid Purple Action */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!inputMessage.trim() || isSending || roomStatus !== 'active'}
              rightIcon={<Send className="h-4 w-4" />}
              className="shrink-0 rounded-full px-4"
            >
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </div>
      )}

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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsLeaveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmLeave}
            >
              Leave
            </Button>
          </>
        }
      >
        <p className="text-xs text-gray-500 leading-relaxed">
          Leaving will end the session for both students. You will return to your student dashboard.
        </p>
      </Modal>
    </div>
  );
};

export default ChatPage;
