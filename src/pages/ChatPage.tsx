/**
 * ============================================================================
 * TALK TO RITIANS - Realtime 1-to-1 Anonymous Text Chat Page (Phase 10)
 * ============================================================================
 * Anonymous real-time text chat with active student peers.
 *
 * Requirements:
 * - CHAT PRIVACY: Displays ONLY anonymous username, modular avatar, messages.
 *   NEVER shows department, class, section, batch, year, gender, email, or real name.
 * - RLS: Restricted to the two room participants only.
 * - REALTIME: Supabase Realtime channel for instant message delivery.
 * - VALIDATION: 1-1000 characters, rejects empty/oversized, escapes raw HTML.
 * - BOTTOM CONTROLS: Skip, Leave, Message input, Send.
 * - IMPORTANT: Zero visible Block or Report buttons anywhere in the view.
 * - CONNECTION STATUS: connecting, connected, stranger disconnected, reconnecting.
 * - AUTO-SCROLL: Automatically scrolls to bottom on new messages.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Send,
  FastForward,
  UserX,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import {
  Button,
  Modal,
  Badge,
  Avatar,
  EmptyState,
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
  const { user, profile } = useAuth();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [roomStatus, setRoomStatus] = useState<ChatRoomStatus>('active');
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>('connecting');
  const [isSkipModalOpen, setIsSkipModalOpen] = useState<boolean>(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [duplicateTabWarning, setDuplicateTabWarning] = useState<boolean>(false);

  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Peer Persona (retrieved from route navigation state or loaded securely from DB)
  const initialPeer = (location.state as { peer?: MatchedPeerPersona } | null)?.peer;
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
   * Initial Data Hydration & Page Refresh Invariant (Step 4 & Step 6)
   * Restores active room and historical messages without creating duplicate rooms.
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

    // 3. Supabase Realtime Subscription (Messages & Room Status)
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
            if (updatedRoom.status === 'ended' || updatedRoom.status === 'skipped') {
              setRoomStatus(updatedRoom.status);
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
   * Room Heartbeat (Step 1 & Step 5)
   * Sends heartbeat while room is active, detecting meaningful peer disconnection.
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
   * Network Interruption, Presence Grace Period & Background Handling (Steps 3, 4, 7)
   */
  useEffect(() => {
    if (!roomId) return;

    const handleOnline = async () => {
      // Clear grace timer if network was restored before expiry
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }

      // Check if room is still valid
      const syncRes = await chatService.reconnectRoom(roomId);
      if (syncRes.success && syncRes.data) {
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

      // 15s grace period: do not immediately terminate based on tiny network interruptions
      if (!graceTimerRef.current && roomStatus === 'active') {
        graceTimerRef.current = setTimeout(async () => {
          // Meaningful disconnect detected after grace period
          setRoomStatus('ended');
          setConnectionStatus('stranger disconnected');
          await chatService.endRoom(roomId, 'disconnect');
        }, 15000);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && roomStatus === 'active') {
        // Mobile browser foregrounded or computer woke from sleep
        const syncRes = await chatService.reconnectRoom(roomId);
        if (syncRes.success && syncRes.data) {
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
      // Ignore if BroadcastChannel unsupported
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
        // Optimistically add to state if not delivered via realtime yet
        const newMsg = res.data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    } catch (err) {
      console.error('[ChatPage] Message send error:', err);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  /**
   * Confirm Skip: End room and jump to new matchmaking search (Step 3)
   */
  const confirmSkip = async () => {
    setIsSkipModalOpen(false);
    if (roomId) {
      await chatService.endRoom(roomId, 'skip');
    }
    navigate('/matching', { replace: true });
  };

  /**
   * Confirm Leave: End room, clear queue, and return to dashboard (Step 4)
   */
  const confirmLeave = async () => {
    setIsLeaveModalOpen(false);
    if (roomId) {
      await chatService.endRoom(roomId, 'leave');
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

  const myInitials = (profile?.display_username || 'Me')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto w-full border-x border-slate-800/80 bg-slate-950">
      {/* =========================================================================
          ACTIVE ROOM HEADER
          CRITICAL PRIVACY: Shows only anonymous username, avatar, and connection state.
          Zero department, roll number, email, or real names. Zero Block/Report buttons.
          ========================================================================= */}
      <header className="px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            size="md"
            avatarConfig={peer.avatarConfig as any}
            initials={peerInitials}
            presence={
              connectionStatus === 'connected'
                ? 'online'
                : connectionStatus === 'stranger disconnected'
                ? 'offline'
                : 'matching'
            }
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base text-white truncate">
                {peer.anonymousUsername}
              </h1>
              <Badge
                variant={
                  connectionStatus === 'connected'
                    ? 'success'
                    : connectionStatus === 'stranger disconnected'
                    ? 'neutral'
                    : 'warning'
                }
                size="sm"
                withDot
              >
                {connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'stranger disconnected'
                  ? 'Chat Ended'
                  : connectionStatus === 'reconnecting'
                  ? 'Reconnecting...'
                  : 'Connecting...'}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Room #{roomId?.slice(0, 8) || 'chat'} &bull; 100% Anonymous &bull; Identity Sealed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 hidden sm:flex">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Campus Verified</span>
          </span>
        </div>
      </header>

      {/* Campus Privacy Assurance Banner (Zero Block/Report Buttons) */}
      <div className="px-4 py-1.5 bg-brand-950/40 border-b border-brand-900/30 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 text-brand-300">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>Anonymous 1-to-1 conversation &bull; Messages not linked to real identity</span>
        </span>
        <span className="text-[10px] text-slate-500 font-medium hidden xs:inline">
          Row-Level Security Active
        </span>
      </div>

      {/* Duplicate Tab Notice */}
      {duplicateTabWarning && (
        <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-indigo-400" />
          <span>This conversation is active in multiple tabs. Messages synchronize automatically.</span>
        </div>
      )}

      {/* Room Inactive Alert Notice (if partner disconnected, skipped, or left) */}
      {roomStatus !== 'active' && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Chat ended. Stranger disconnected. Ready to meet someone new?</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/matching', { replace: true })}
              leftIcon={<FastForward className="h-3.5 w-3.5" />}
            >
              Skip to Next
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await matchmakingService.leaveMatchmaking();
                navigate('/home', { replace: true });
              }}
            >
              Home
            </Button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MESSAGES SCROLL AREA
          ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center py-12">
            <EmptyState
              icon={<MessageSquare className="h-6 w-6" />}
              title="Connected with RIT Peer"
              description="Say hello to break the ice! Your real name, roll number, and department remain completely private."
            />
          </div>
        ) : (
          messages.map((msg) => {
            // System notices (e.g. peer left)
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="text-center py-1.5 animate-in fade-in">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] bg-slate-900 border border-slate-800 text-slate-400 shadow-sm">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span>{msg.content}</span>
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
                className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {!isMe && (
                  <Avatar
                    size="sm"
                    avatarConfig={peer.avatarConfig as any}
                    initials={peerInitials}
                  />
                )}

                <div
                  className={`
                    max-w-[82%] sm:max-w-md rounded-2xl p-3.5 text-sm shadow-md transition-all
                    ${
                      isMe
                        ? 'bg-brand-600 text-white rounded-br-none shadow-brand-600/20'
                        : 'bg-slate-900 text-slate-100 rounded-bl-none border border-slate-800/80 shadow-black/20'
                    }
                  `.trim()}
                >
                  {/* Safely text-rendered; raw HTML is never executed */}
                  <p className="leading-relaxed break-words whitespace-pre-wrap selection:bg-brand-400 selection:text-white">
                    {msg.content}
                  </p>
                  <span
                    className={`block text-[10px] mt-1 text-right font-medium ${
                      isMe ? 'text-brand-200' : 'text-slate-500'
                    }`}
                  >
                    {timeFormatted}
                  </span>
                </div>

                {isMe && (
                  <Avatar
                    size="sm"
                    avatarConfig={profile?.avatar_config as any}
                    initials={myInitials}
                  />
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* =========================================================================
          BOTTOM CONTROLS BAR (Step 5)
          Must include: Skip, Leave, Message input, Send.
          Zero visible Block or Report buttons.
          ========================================================================= */}
      <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {/* Skip Button */}
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => {
              if (roomStatus !== 'active') {
                navigate('/matching', { replace: true });
              } else {
                setIsSkipModalOpen(true);
              }
            }}
            leftIcon={<FastForward className="h-4 w-4 text-brand-400" />}
            title="Skip to next peer"
            className="shrink-0 px-3 sm:px-4"
          >
            <span className="hidden sm:inline">Skip</span>
          </Button>

          {/* Leave Button */}
          <Button
            type="button"
            variant="danger"
            size="md"
            onClick={async () => {
              if (roomStatus !== 'active') {
                await matchmakingService.leaveMatchmaking();
                navigate('/home', { replace: true });
              } else {
                setIsLeaveModalOpen(true);
              }
            }}
            leftIcon={<UserX className="h-4 w-4" />}
            title="Leave conversation"
            className="shrink-0 px-3 sm:px-4"
          >
            <span className="hidden sm:inline">Leave</span>
          </Button>

          {/* Message Input */}
          <input
            ref={inputRef}
            id="chat-message-input"
            type="text"
            value={inputMessage}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={roomStatus !== 'active'}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              roomStatus === 'active'
                ? 'Type message anonymously... (Enter to send)'
                : 'Chat ended. Stranger disconnected. Click Skip to find a new peer.'
            }
            className="flex-1 bg-slate-950 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-800 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            autoComplete="off"
          />

          {/* Send Button */}
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!inputMessage.trim() || isSending || roomStatus !== 'active'}
            rightIcon={<Send className="h-4 w-4" />}
            className="shrink-0 font-semibold"
          >
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </div>

      {/* =========================================================================
          MODALS: Skip & Leave Confirmations
          ========================================================================= */}
      <Modal
        isOpen={isSkipModalOpen}
        onClose={() => setIsSkipModalOpen(false)}
        title="Skip to Next Peer?"
        description="Are you sure you want to end this chat and search for another RITian?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsSkipModalOpen(false)}>
              Keep Chatting
            </Button>
            <Button variant="primary" size="sm" onClick={confirmSkip}>
              Find Next Peer
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-400 leading-relaxed">
          This conversation will end for both students. You will immediately re-enter the random
          matchmaking queue.
        </p>
      </Modal>

      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Leave Conversation?"
        description="Are you sure you want to exit to the campus dashboard?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsLeaveModalOpen(false)}>
              Stay in Chat
            </Button>
            <Button variant="danger" size="sm" onClick={confirmLeave}>
              Leave Chat
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-400 leading-relaxed">
          Leaving closes the room for both participants. You can start a new match anytime from your
          dashboard.
        </p>
      </Modal>
    </div>
  );
};

export default ChatPage;
