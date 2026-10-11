/**
 * ============================================================================
 * TALK TO RITIANS - Developer & Admin Console Page
 * ============================================================================
 * Privileged operational dashboard for authorized platform staff (DEVELOPER, ADMIN).
 * Features:
 * - Live metrics overview (Online Users, Active Rooms, Chatting, Idle, Requests)
 * - Realtime Online Users directory with State tracking & Privileged Profile inspection
 * - Active Rooms dashboard with live countdown & connection heartbeats
 * - Controlled Moderation Transcript reader with mandatory audited reasons
 * - Chat invite dispatch & constrained test session initialization
 * - Append-only admin audit log inspector
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Terminal,
  Shield,
  Users,
  MessageSquare,
  Clock,
  Activity,
  FileText,
  Eye,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Radio,
  Check,
  ChevronDown,
  Zap,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Avatar,
  Modal,
  ErrorMessage,
  Spinner,
} from '../components';
import { useAuth } from '../context';
import { staffService } from '../services/staffService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  AdminDashboardStats,
  AdminOnlineUser,
  AdminUserDetails,
  AdminActiveRoom,
  AdminRoomDetails,
  ModerationTranscriptMessage,
  RoomModerationData,
  AdminAuditLogRow,
  AdminUserState,
} from '../types';

type ConsoleTab = 'overview' | 'users' | 'rooms' | 'audit';

export const DeveloperPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, staffRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as ConsoleTab) || 'overview';
  const setTab = (tab: ConsoleTab) => {
    setSearchParams({ tab });
  };

  // State: Dashboard Stats
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(true);

  // State: Online Users
  const [usersList, setUsersList] = useState<AdminOnlineUser[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userStateFilter, setUserStateFilter] = useState<string>('all');

  // State: Active Rooms
  const [roomsList, setRoomsList] = useState<AdminActiveRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState<boolean>(false);

  // State: Audit Logs
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  // State: Global refresh & toast messages
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modals state
  // 1. Privileged Profile Inspection
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const [inspectReason, setInspectReason] = useState<string>('Routine administrative verification');
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<AdminUserDetails | null>(null);

  // 2. Room Details
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomDetails, setRoomDetails] = useState<AdminRoomDetails | null>(null);
  const [roomDetailsLoading, setRoomDetailsLoading] = useState<boolean>(false);
  const [roomDetailsError, setRoomDetailsError] = useState<string | null>(null);

  // 3. Moderation Transcript (Live Read-Only Chat Viewer)
  const [transcriptRoomId, setTranscriptRoomId] = useState<string | null>(null);
  const [transcriptReason, setTranscriptReason] = useState<string>('Investigating reported incident');
  const [transcriptMessages, setTranscriptMessages] = useState<ModerationTranscriptMessage[] | null>(null);
  const [moderationData, setModerationData] = useState<RoomModerationData | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'reconnecting' | 'ended'>('connecting');
  const [hasUnreadMessages, setHasUnreadMessages] = useState<boolean>(false);
  const [transcriptLoading, setTranscriptLoading] = useState<boolean>(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Action pending states
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [sentInvite, setSentInvite] = useState<{
    requestId: string;
    targetUserId: string;
    expiresAt: string;
  } | null>(null);
  const [forcingUserId, setForcingUserId] = useState<string | null>(null);
  const [revealedRegisterNumber, setRevealedRegisterNumber] = useState<string | null>(null);
  const [isRevealingRegNo, setIsRevealingRegNo] = useState<boolean>(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Realtime subscription for active developer chat invite
  useEffect(() => {
    if (!sentInvite || !isSupabaseConfigured) return;

    const channelName = `developer-invite-watch-${sentInvite.requestId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_requests',
          filter: `id=eq.${sentInvite.requestId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.status === 'rejected') {
            showNotification('info', 'Invitation declined.');
            setSentInvite(null);
          } else if (row?.status === 'expired') {
            showNotification('info', 'Chat invitation expired.');
            setSentInvite(null);
          } else if (row?.status === 'cancelled') {
            setSentInvite(null);
          } else if (row?.status === 'accepted' && row?.room_id) {
            setSentInvite(null);
            navigate(`/chat/${row.room_id}`);
          }
        }
      )
      .subscribe();

    const msUntilExpiry = new Date(sentInvite.expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => {
      showNotification('info', 'Chat invitation expired.');
      setSentInvite(null);
    }, Math.max(1000, msUntilExpiry));

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [sentInvite, navigate]);

  const handleCopy = (text: string, label: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  /**
   * Data Fetchers
   */
  const fetchStats = useCallback(async () => {
    const res = await staffService.getAdminDashboardStats();
    if (res.success && res.data) {
      setStats(res.data);
    }
    setStatsLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    const res = await staffService.getOnlineUsersAdmin();
    if (res.success && res.data) {
      setUsersList(res.data);
    }
    setUsersLoading(false);
  }, []);

  const fetchRooms = useCallback(async () => {
    setRoomsLoading(true);
    const res = await staffService.getActiveRoomsAdmin();
    if (res.success && res.data) {
      setRoomsList(res.data);
    }
    setRoomsLoading(false);
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    const res = await staffService.getAdminAuditLogs(50);
    if (res.success && res.data) {
      setAuditLogs(res.data);
    }
    setAuditLoading(false);
  }, []);

  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchStats(),
      activeTab === 'users' ? fetchUsers() : Promise.resolve(),
      activeTab === 'rooms' ? fetchRooms() : Promise.resolve(),
      activeTab === 'audit' ? fetchAuditLogs() : Promise.resolve(),
    ]);
    setIsRefreshing(false);
  }, [activeTab, fetchStats, fetchUsers, fetchRooms, fetchAuditLogs]);

  // Initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Tab switch loading
  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'rooms') fetchRooms();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab, fetchUsers, fetchRooms, fetchAuditLogs]);

  // Auto refresh interval (every 10 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      refreshAllData();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshAllData]);

  /**
   * Action Handlers
   */
  const handleInspectUser = async () => {
    if (!inspectUserId) return;
    if (!inspectReason.trim() || inspectReason.trim().length < 3) {
      setInspectError('A valid operational reason (min 3 characters) is required to access private student data.');
      return;
    }

    setInspectLoading(true);
    setInspectError(null);
    const res = await staffService.getUserAdminDetails(inspectUserId, inspectReason.trim());
    setInspectLoading(false);

    if (!res.success || !res.data) {
      setInspectError(res.error?.message || 'Failed to inspect user profile.');
      return;
    }

    setUserDetails(res.data);
    // Refresh audit logs in background
    fetchAuditLogs();
  };

  const handleSendInvite = async (targetUser: AdminOnlineUser) => {
    if (!isUserEligibleForInvite(targetUser)) {
      const reason = !isUserOnline(targetUser)
        ? 'This user is currently offline.'
        : targetUser.state === 'in_chat'
        ? 'User is currently in an active chat room.'
        : 'This user is currently unavailable.';
      showNotification('error', reason);
      return;
    }

    setInvitingUserId(targetUser.user_id);
    const res = await staffService.sendAdminChatInvite(targetUser.user_id);
    setInvitingUserId(null);

    if (!res.success || !res.data) {
      showNotification('error', res.error?.message || 'Failed to send chat invite.');
      return;
    }

    showNotification('info', 'Invitation sent — waiting for response.');
    setSentInvite({
      requestId: res.data.requestId,
      targetUserId: targetUser.user_id,
      expiresAt: res.data.expiresAt,
    });
    fetchStats();
    fetchUsers();
    fetchAuditLogs();
  };

  const handleForceChat = async (targetUser: AdminOnlineUser) => {
    setForcingUserId(targetUser.user_id);
    const res = await staffService.forceDeveloperChat(targetUser.user_id);
    setForcingUserId(null);

    if (!res.success || !res.data) {
      showNotification('error', res.error?.message || 'Failed to start direct Developer chat.');
      return;
    }

    navigate(`/chat/${res.data.roomId}`);
  };

  const handleRevealRegisterNumber = async () => {
    if (!userDetails) return;
    setIsRevealingRegNo(true);
    setRevealError(null);
    const res = await staffService.revealStudentRegisterNumber(
      userDetails.user_id,
      inspectReason || 'Developer profile inspection'
    );
    setIsRevealingRegNo(false);

    if (!res.success || !res.data) {
      setRevealError(res.error?.message || 'Failed to decrypt register number.');
      return;
    }

    setRevealedRegisterNumber(res.data);
    fetchAuditLogs();
  };

  const handleOpenRoomDetails = async (roomId: string) => {
    setSelectedRoomId(roomId);
    setRoomDetailsLoading(true);
    setRoomDetailsError(null);
    setRoomDetails(null);

    const res = await staffService.getRoomAdminDetails(roomId);
    setRoomDetailsLoading(false);

    if (!res.success || !res.data) {
      setRoomDetailsError(res.error?.message || 'Could not load room details.');
      return;
    }

    setRoomDetails(res.data);
    fetchAuditLogs();
  };

  const handleOpenModerationTranscript = async () => {
    if (!transcriptRoomId) return;
    if (!transcriptReason.trim() || transcriptReason.trim().length < 5) {
      setTranscriptError('A mandatory operational/moderation reason of at least 5 characters is required.');
      return;
    }

    setTranscriptLoading(true);
    setTranscriptError(null);
    const res = await staffService.getRoomModerationTranscript(transcriptRoomId, transcriptReason.trim());
    setTranscriptLoading(false);

    if (!res.success || !res.data) {
      setTranscriptError(res.error?.message || 'Failed to load moderation transcript.');
      return;
    }

    setModerationData(res.data);
    setTranscriptMessages(res.data.messages);
    setLiveStatus(res.data.room_status === 'ended' ? 'ended' : 'live');
    fetchAuditLogs();
  };

  // Realtime Room Moderation Chat Viewer
  useEffect(() => {
    if (!transcriptRoomId || !moderationData) return;

    const roomId = transcriptRoomId;
    let isSubscribed = true;

    const channel = supabase
      .channel(`live_moderation_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (!isSubscribed) return;
          const newMsg = payload.new as any;
          if (!newMsg || newMsg.room_id !== roomId) return;

          setTranscriptMessages((prev) => {
            if (!prev) return prev;
            if (prev.some((m) => m.id === newMsg.id)) return prev;

            const senderUsername =
              newMsg.sender_id === moderationData.participant_a.id
                ? moderationData.participant_a.username
                : newMsg.sender_id === moderationData.participant_b.id
                ? moderationData.participant_b.username
                : 'Participant';

            const fullMsg: ModerationTranscriptMessage = {
              id: newMsg.id,
              room_id: newMsg.room_id,
              sender_id: newMsg.sender_id,
              sender_username: senderUsername,
              content: newMsg.content,
              message_type: newMsg.message_type || 'text',
              created_at: newMsg.created_at,
            };

            const next = [...prev, fullMsg].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            return next;
          });

          if (isNearBottomRef.current) {
            setTimeout(() => {
              chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          } else {
            setHasUnreadMessages(true);
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
          if (!isSubscribed) return;
          const updatedRoom = payload.new as any;
          if (updatedRoom && updatedRoom.status === 'ended') {
            setLiveStatus('ended');
          }
        }
      )
      .subscribe((status) => {
        if (!isSubscribed) return;
        if (status === 'SUBSCRIBED') {
          setLiveStatus(moderationData.room_status === 'ended' ? 'ended' : 'live');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setLiveStatus('reconnecting');
        }
      });

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [transcriptRoomId, moderationData]);

  // Initial scroll to bottom when moderation transcript opens
  useEffect(() => {
    if (transcriptMessages && transcriptMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [moderationData]);

  const handleModerationScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 60;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    isNearBottomRef.current = isAtBottom;
    if (isAtBottom) {
      setHasUnreadMessages(false);
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasUnreadMessages(false);
    isNearBottomRef.current = true;
  };

  const handleCloseModeration = useCallback(async () => {
    const roomId = transcriptRoomId;
    setTranscriptRoomId(null);
    setTranscriptMessages(null);
    setModerationData(null);
    setTranscriptError(null);
    setHasUnreadMessages(false);
    setLiveStatus('connecting');

    if (roomId) {
      await staffService.closeRoomModerationSession(roomId);
    }
  }, [transcriptRoomId]);

  /**
   * Filtered Users List
   */
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesSearch =
        u.anonymous_username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.user_id.toLowerCase().includes(userSearchQuery.toLowerCase());

      const matchesState =
        userStateFilter === 'all' ||
        (userStateFilter === 'online' && u.is_online) ||
        u.state === userStateFilter;

      return matchesSearch && matchesState;
    });
  }, [usersList, userSearchQuery, userStateFilter]);

  const isUserOnline = (u: AdminOnlineUser) => {
    if (!u.is_online) return false;
    if (!u.last_seen_at) return false;
    const diffMs = Date.now() - new Date(u.last_seen_at).getTime();
    return diffMs <= 30000;
  };

  const isUserEligibleForInvite = (u: AdminOnlineUser) => {
    if (!isUserOnline(u)) return false;
    if (u.state === 'in_chat') return false;
    if (u.available_for_chat_requests === false) return false;
    if (u.current_page === 'chat' || u.current_page === 'verify') return false;
    return true;
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  const formatRelativeTime = (isoString?: string | null) => {
    if (!isoString) return 'Unknown';
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const getStateBadge = (state: AdminUserState) => {
    switch (state) {
      case 'in_chat':
        return <Badge variant="brand" size="sm" withDot>In Chat</Badge>;
      case 'searching':
        return <Badge variant="warning" size="sm" withDot>Searching</Badge>;
      case 'pending_request':
        return <Badge variant="neutral" size="sm" withDot>Pending Req</Badge>;
      case 'idle':
        return <Badge variant="success" size="sm" withDot>Idle</Badge>;
      case 'offline':
      default:
        return <Badge variant="neutral" size="sm">Offline</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-in fade-in">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 text-sm animate-in slide-in-from-top-4 ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700 text-emerald-100'
              : notification.type === 'info'
              ? 'bg-slate-900/95 border-brand-500/50 text-slate-100 dark:bg-[#101A12] dark:border-[rgba(155,185,115,0.4)] dark:text-[#F4F6F1]'
              : 'bg-rose-950/90 border-rose-700 text-rose-100'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : notification.type === 'info' ? (
            <Send className="h-4 w-4 text-brand-400 dark:text-[#A2BD63] shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Staff Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Terminal className="h-4 w-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
              Developer Console
            </h1>
            <Badge variant="warning" size="sm">
              {staffRole?.toUpperCase() || 'DEVELOPER'}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
            Authorized platform administration, realtime presence, and audited chat moderation.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              autoRefresh
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-400'
            }`}
            title="Auto-refresh every 10 seconds"
          >
            <Radio className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-pulse text-emerald-500' : ''}`} />
            <span>Auto: {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>

          <Button
            variant="secondary"
            size="sm"
            onClick={refreshAllData}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings')}
          >
            &larr; Exit Console
          </Button>
        </div>
      </div>

      {/* Console Tab Navigation (Mobile Horizontally Scrollable Pill Tabs) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
            activeTab === 'overview'
              ? 'bg-brand-50 text-brand-700 border border-brand-300 shadow-[0_2px_8px_rgba(109,66,232,0.15)] dark:bg-[#182B18] dark:text-[#A2BD63] dark:border-[#8DA852]/50 dark:shadow-[0_2px_8px_rgba(141,168,82,0.2)]'
              : 'bg-white text-slate-700 border border-slate-200 hover:text-slate-900 hover:bg-slate-50 dark:bg-[#091009] dark:text-[#9DA89A] dark:border-[rgba(141,168,82,0.15)] dark:hover:text-[#F4F6F1] dark:hover:bg-[#101A12]'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
            activeTab === 'users'
              ? 'bg-brand-50 text-brand-700 border border-brand-300 shadow-[0_2px_8px_rgba(109,66,232,0.15)] dark:bg-[#182B18] dark:text-[#A2BD63] dark:border-[#8DA852]/50 dark:shadow-[0_2px_8px_rgba(141,168,82,0.2)]'
              : 'bg-white text-slate-700 border border-slate-200 hover:text-slate-900 hover:bg-slate-50 dark:bg-[#091009] dark:text-[#9DA89A] dark:border-[rgba(141,168,82,0.15)] dark:hover:text-[#F4F6F1] dark:hover:bg-[#101A12]'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Online Users</span>
          {stats?.online_users !== undefined && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-slate-700 dark:bg-[#121E12] dark:text-[#A2BD63]">
              {stats.online_users}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('rooms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
            activeTab === 'rooms'
              ? 'bg-brand-50 text-brand-700 border border-brand-300 shadow-[0_2px_8px_rgba(109,66,232,0.15)] dark:bg-[#182B18] dark:text-[#A2BD63] dark:border-[#8DA852]/50 dark:shadow-[0_2px_8px_rgba(141,168,82,0.2)]'
              : 'bg-white text-slate-700 border border-slate-200 hover:text-slate-900 hover:bg-slate-50 dark:bg-[#091009] dark:text-[#9DA89A] dark:border-[rgba(141,168,82,0.15)] dark:hover:text-[#F4F6F1] dark:hover:bg-[#101A12]'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Active Rooms</span>
          {stats?.active_rooms !== undefined && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-slate-700 dark:bg-[#121E12] dark:text-[#A2BD63]">
              {stats.active_rooms}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
            activeTab === 'audit'
              ? 'bg-brand-50 text-brand-700 border border-brand-300 shadow-[0_2px_8px_rgba(109,66,232,0.15)] dark:bg-[#182B18] dark:text-[#A2BD63] dark:border-[#8DA852]/50 dark:shadow-[0_2px_8px_rgba(141,168,82,0.2)]'
              : 'bg-white text-slate-700 border border-slate-200 hover:text-slate-900 hover:bg-slate-50 dark:bg-[#091009] dark:text-[#9DA89A] dark:border-[rgba(141,168,82,0.15)] dark:hover:text-[#F4F6F1] dark:hover:bg-[#101A12]'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: OVERVIEW
          ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards: 2-column mobile grid, 5-column desktop grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* 1. Online Users */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-slate-600 dark:text-[#9DA89A]">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Online Users</span>
                <Users className="h-4 w-4 text-brand-600 dark:text-[#8DA852]" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1]">
                {statsLoading ? '...' : stats?.online_users ?? 0}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-[#A2BD63] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#8DA852] animate-pulse" />
                Active heartbeats
              </div>
            </Card>

            {/* 2. Currently Chatting */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-slate-600 dark:text-[#9DA89A]">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider">In Chat</span>
                <MessageSquare className="h-4 w-4 text-brand-600 dark:text-[#8DA852]" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1]">
                {statsLoading ? '...' : stats?.users_chatting ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-[#6F796D]">
                In 7-minute rooms
              </div>
            </Card>

            {/* 3. Users Idle */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-slate-600 dark:text-[#9DA89A]">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Users Idle</span>
                <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1]">
                {statsLoading ? '...' : stats?.users_idle ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-[#6F796D]">
                Available on campus
              </div>
            </Card>

            {/* 4. Active Rooms */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-slate-600 dark:text-[#9DA89A]">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Active Rooms</span>
                <Radio className="h-4 w-4 text-brand-600 dark:text-[#A2BD63]" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1]">
                {statsLoading ? '...' : stats?.active_rooms ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-[#6F796D]">
                Realtime sessions
              </div>
            </Card>

            {/* 5. Pending Chat Requests */}
            <Card className="p-4 sm:p-5 col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-[#9DA89A]">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Pending Requests</span>
                <Send className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1]">
                {statsLoading ? '...' : stats?.pending_requests ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-[#6F796D]">
                Awaiting response
              </div>
            </Card>
          </div>

          {/* Quick Actions & Security Governance Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base text-slate-900 dark:text-[#F4F6F1] flex items-center gap-2">
                  <Shield className="h-4 w-4 text-brand-600 dark:text-[#8DA852]" />
                  Staff Security Invariants
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-[#9DA89A]">
                  Strict privacy boundaries enforced by PostgreSQL engine rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-700 dark:text-[#9DA89A]">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-[#8DA852] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 dark:text-[#F4F6F1]">Encrypted Register Numbers:</strong> Student register numbers are AES-256 encrypted server-side with strict developer-only audited reveal, and are permanently purged upon ID unlink.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-[#8DA852] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 dark:text-[#F4F6F1]">Audited Profile Access:</strong> Inspecting any private student profile requires a mandatory reason and is immutably logged to <code className="bg-slate-100 dark:bg-[#121E12] px-1 py-0.5 rounded text-[11px] text-brand-700 dark:text-[#A2BD63]">admin_audit_log</code>.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-[#8DA852] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 dark:text-[#F4F6F1]">Zero Secret Observer Presence:</strong> Staff moderation does not invisibly join chat rooms as a third participant, preserving standard 2-person participant caps.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-[#8DA852] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 dark:text-[#F4F6F1]">Privileged Force Chat:</strong> Authorized developers can initiate a direct 7-minute chat session with any online student, fully audited with transparent participant notification.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base text-slate-900 dark:text-[#F4F6F1] flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                  Platform Staff Session
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-[#9DA89A]">
                  Current authenticated operator privileges.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[rgba(141,168,82,0.1)]">
                  <span className="text-slate-600 dark:text-[#9DA89A]">Staff Role</span>
                  <Badge variant="warning" size="sm">{staffRole?.toUpperCase() || 'DEVELOPER'}</Badge>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[rgba(141,168,82,0.1)]">
                  <span className="text-slate-600 dark:text-[#9DA89A]">Operator User ID</span>
                  <span className="font-mono text-slate-900 dark:text-[#F4F6F1] text-[11px]">
                    {user?.id.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[rgba(141,168,82,0.1)]">
                  <span className="text-slate-600 dark:text-[#9DA89A]">Operator Email</span>
                  <span className="text-slate-900 dark:text-[#F4F6F1] font-medium">{user?.email || 'Authenticated'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600 dark:text-[#9DA89A]">Database Engine</span>
                  <span className="text-brand-600 dark:text-[#A2BD63] font-semibold">Supabase PostgreSQL 15</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: USERS (Online Users View)
          ===================================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Controls: Search and State filter */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#6F796D]" />
              <input
                type="text"
                placeholder="Search by anonymous handle or UUID..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-full border border-slate-300 dark:border-[rgba(141,168,82,0.2)] bg-white dark:bg-[#060A06] text-slate-900 dark:text-[#F4F6F1] placeholder-slate-400 dark:placeholder-[#6F796D] focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:border-[#8DA852] shadow-inner"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 dark:text-[#6F796D] shrink-0" />
              <select
                value={userStateFilter}
                onChange={(e) => setUserStateFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-full border border-slate-300 dark:border-[rgba(141,168,82,0.2)] bg-white dark:bg-[#091009] text-slate-800 dark:text-[#9DA89A] focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:border-[#8DA852]"
              >
                <option value="all">All States</option>
                <option value="idle">Idle / Available</option>
                <option value="in_chat">In Chat</option>
                <option value="searching">Searching</option>
                <option value="pending_request">Pending Request</option>
                <option value="offline">Offline (&gt;30s)</option>
              </select>
            </div>
          </div>

          {/* Users List: Mobile Stacked Cards + Desktop Table */}
          <Card className="overflow-hidden">
            {usersLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Spinner size="md" variant="brand" label="Fetching online users..." />
                <p className="text-xs text-slate-500 dark:text-[#6F796D]">Querying platform presence registry...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Users className="h-8 w-8 text-slate-400 dark:text-[#6F796D] mx-auto" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-[#F4F6F1]">No users found</h4>
                <p className="text-xs text-slate-600 dark:text-[#9DA89A]">
                  {userSearchQuery ? 'No online users match your search query.' : 'No active student sessions detected.'}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Stacked User Cards */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-[rgba(141,168,82,0.12)]">
                  {filteredUsers.map((u) => {
                    const isSelf = u.user_id === user?.id;
                    const initials = u.anonymous_username
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div key={u.user_id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              size="md"
                              avatarConfig={u.avatar_config}
                              initials={initials}
                              shape="circle"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-slate-900 dark:text-[#F4F6F1] flex items-center gap-1.5 truncate">
                                <span>{u.anonymous_username}</span>
                                {isSelf && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 dark:bg-[#121E12] dark:text-[#A2BD63] font-semibold">
                                    You
                                  </span>
                                )}
                                {u.is_staff && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold">
                                    {u.staff_role?.toUpperCase() || 'STAFF'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-[#9DA89A] flex items-center gap-1.5 mt-0.5">
                                <span>{u.is_verified_student ? 'Verified RITian' : 'Unverified'}</span>
                                <span>•</span>
                                {isUserOnline(u) ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-[#A2BD63] font-semibold">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#A2BD63]" />
                                    Online
                                  </span>
                                ) : (
                                  <span>Last seen {formatRelativeTime(u.last_seen_at)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            {getStateBadge(u.state)}
                          </div>
                        </div>

                        {/* Actions: Inspect, Invite, Force (Mobile 44px min touch target) */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectUserId(u.user_id);
                              setUserDetails(null);
                              setInspectError(null);
                              setRevealedRegisterNumber(null);
                              setRevealError(null);
                            }}
                            className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 border border-slate-200 dark:text-[#9DA89A] dark:hover:text-[#F4F6F1] dark:bg-[#121E12] dark:border-[rgba(141,168,82,0.2)] active:scale-95 transition-all"
                          >
                            <Eye className="h-4 w-4" />
                            <span>Inspect</span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              disabled={!isUserEligibleForInvite(u) || invitingUserId === u.user_id || sentInvite?.targetUserId === u.user_id}
                              onClick={() => handleSendInvite(u)}
                              title={
                                !isUserOnline(u)
                                  ? 'User is offline'
                                  : u.state === 'in_chat'
                                  ? 'User is already chatting'
                                  : u.available_for_chat_requests === false
                                  ? 'User is unavailable for chat requests'
                                  : sentInvite?.targetUserId === u.user_id
                                  ? 'Waiting for response...'
                                  : 'Send direct chat invite'
                              }
                              className="flex-1 min-h-[44px] liquid-cta-btn inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-bold text-white disabled:opacity-40 active:scale-95 transition-all shadow-sm"
                            >
                              <Send className="h-4 w-4" />
                              <span>
                                {invitingUserId === u.user_id
                                  ? 'Inviting...'
                                  : sentInvite?.targetUserId === u.user_id
                                  ? 'Waiting...'
                                  : 'Invite'}
                              </span>
                            </button>
                          )}

                          {!isSelf && (
                            <button
                              type="button"
                              disabled={u.state === 'in_chat' || !isUserOnline(u) || forcingUserId === u.user_id}
                              onClick={() => handleForceChat(u)}
                              title={
                                u.state === 'in_chat'
                                  ? 'User is already chatting'
                                  : !isUserOnline(u)
                                  ? 'User is offline'
                                  : 'Force direct chat session (privileged)'
                              }
                              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 disabled:opacity-40 active:scale-95 transition-all"
                            >
                              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                              <span>{forcingUserId === u.user_id ? 'Starting...' : 'Force'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop User Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[rgba(141,168,82,0.15)] bg-slate-50 dark:bg-[#091009]/80 text-slate-700 dark:text-[#9DA89A] font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Anonymous Persona</th>
                        <th className="py-3 px-4">Verification</th>
                        <th className="py-3 px-4">State</th>
                        <th className="py-3 px-4">Last Seen</th>
                        <th className="py-3 px-4">Current Room</th>
                        <th className="py-3 px-4 text-right">Privileged Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[rgba(141,168,82,0.12)]">
                      {filteredUsers.map((u) => {
                        const isSelf = u.user_id === user?.id;
                        const initials = u.anonymous_username
                          .split(' ')
                          .map((w) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();

                        return (
                          <tr
                            key={u.user_id}
                            className="hover:bg-slate-50/80 dark:hover:bg-[#121E12]/40 transition-colors"
                          >
                            {/* Anonymous Persona */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <Avatar
                                  size="sm"
                                  avatarConfig={u.avatar_config}
                                  initials={initials}
                                  shape="circle"
                                />
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-[#F4F6F1] flex items-center gap-1.5">
                                    <span>{u.anonymous_username}</span>
                                    {isSelf && (
                                      <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-[#121E12] dark:text-[#A2BD63] font-semibold">
                                        You
                                      </span>
                                    )}
                                    {u.is_staff && (
                                      <span className="text-[10px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold">
                                        {u.staff_role?.toUpperCase() || 'STAFF'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500 dark:text-[#A2B09D]">
                                    {u.user_id.slice(0, 8)}...
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Verification */}
                            <td className="py-3 px-4">
                              {u.is_staff ? (
                                <Badge variant="warning" size="sm">Staff Account</Badge>
                              ) : u.is_verified_student ? (
                                <Badge variant="success" size="sm" withDot>Verified Student</Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">Unverified</Badge>
                              )}
                            </td>

                            {/* State */}
                            <td className="py-3 px-4">
                              {getStateBadge(u.state)}
                            </td>

                            {/* Last Seen */}
                            <td className="py-3 px-4">
                              {isUserOnline(u) ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-[#A2BD63]">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-[#A2BD63] animate-pulse" />
                                  Online
                                </span>
                              ) : (
                                <span className="text-xs text-slate-600 dark:text-[#C0CCBC]">
                                  {formatRelativeTime(u.last_seen_at)}
                                </span>
                              )}
                            </td>

                            {/* Current Room */}
                            <td className="py-3 px-4">
                              {u.current_room_id ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRoomDetails(u.current_room_id!)}
                                  className="font-mono text-[11px] text-brand-600 dark:text-[#A2BD63] hover:underline flex items-center gap-1"
                                >
                                  <span>#{u.current_room_id.slice(0, 8)}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              ) : (
                                <span className="text-slate-400 dark:text-[#6F796D]">—</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setInspectUserId(u.user_id);
                                    setUserDetails(null);
                                    setInspectError(null);
                                    setRevealedRegisterNumber(null);
                                    setRevealError(null);
                                  }}
                                  title="Inspect private student profile (audited)"
                                  className="text-xs h-7 px-2.5"
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  Inspect
                                </Button>

                                {!isSelf && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={!isUserEligibleForInvite(u) || invitingUserId === u.user_id || sentInvite?.targetUserId === u.user_id}
                                    isLoading={invitingUserId === u.user_id}
                                    onClick={() => handleSendInvite(u)}
                                    title={
                                      !isUserOnline(u)
                                        ? 'User is offline'
                                        : u.state === 'in_chat'
                                        ? 'User is already chatting'
                                        : u.available_for_chat_requests === false
                                        ? 'User is unavailable for chat requests'
                                        : sentInvite?.targetUserId === u.user_id
                                        ? 'Waiting for response...'
                                        : 'Send direct chat invite'
                                    }
                                    className="text-xs h-7 px-2.5"
                                  >
                                    <Send className="h-3.5 w-3.5 mr-1" />
                                    {sentInvite?.targetUserId === u.user_id ? 'Waiting...' : 'Invite'}
                                  </Button>
                                )}

                                {!isSelf && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={u.state === 'in_chat' || !isUserOnline(u) || forcingUserId === u.user_id}
                                    isLoading={forcingUserId === u.user_id}
                                    onClick={() => handleForceChat(u)}
                                    title={
                                      u.state === 'in_chat'
                                        ? 'User is already chatting'
                                        : !isUserOnline(u)
                                        ? 'User is offline'
                                        : 'Force direct chat session (privileged)'
                                    }
                                    className="text-xs h-7 px-2.5 font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 active:scale-95 transition-all"
                                  >
                                    <Zap className="h-3.5 w-3.5 mr-1 text-amber-600 dark:text-amber-500" />
                                    Force
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* =====================================================================
          TAB 3: ROOMS (Active Rooms Dashboard)
          ===================================================================== */}
      {activeTab === 'rooms' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9DA89A]">
              Real-time monitoring of all active 7-minute rooms.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchRooms}
              isLoading={roomsLoading}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${roomsLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh Rooms
            </Button>
          </div>

          <Card className="overflow-hidden">
            {roomsLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Spinner size="md" variant="brand" label="Fetching active rooms..." />
                <p className="text-xs text-slate-500 dark:text-[#6F796D]">Retrieving active chat sessions...</p>
              </div>
            ) : roomsList.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <MessageSquare className="h-8 w-8 text-slate-400 dark:text-[#6F796D] mx-auto" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-[#F4F6F1]">No active rooms</h4>
                <p className="text-xs text-slate-600 dark:text-[#9DA89A]">
                  There are currently no active 7-minute conversations in progress.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Stacked Room Cards */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-[rgba(141,168,82,0.12)]">
                  {roomsList.map((r) => {
                    const initA = r.participant_a_username.slice(0, 2).toUpperCase();
                    const initB = r.participant_b_username.slice(0, 2).toUpperCase();

                    return (
                      <div key={r.room_id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-brand-600 dark:text-[#A2BD63]">
                            Room #{r.room_id.slice(0, 8)}
                          </span>
                          {r.timer_paused_at ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-0.5 rounded-full border border-sky-300 dark:border-sky-500/40">
                              ⏸ {formatSeconds(r.remaining_seconds)} PAUSED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-500/30">
                              <Clock className="h-3 w-3" />
                              {formatSeconds(r.remaining_seconds)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-900 dark:text-[#F4F6F1]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Avatar size="xs" avatarConfig={r.participant_a_avatar} initials={initA} shape="circle" />
                            <span className="truncate font-semibold">{r.participant_a_username}</span>
                          </div>
                          <span className="text-slate-400 dark:text-[#6F796D] px-2 font-bold">↔</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Avatar size="xs" avatarConfig={r.participant_b_avatar} initials={initB} shape="circle" />
                            <span className="truncate font-semibold">{r.participant_b_username}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-600 dark:text-[#9DA89A]">
                            {r.message_count} messages
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenRoomDetails(r.room_id)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 border border-slate-200 dark:text-[#9DA89A] dark:hover:text-[#F4F6F1] dark:bg-[#121E12] dark:border-[rgba(141,168,82,0.2)] active:scale-95 transition-all"
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTranscriptRoomId(r.room_id);
                                setTranscriptMessages(null);
                                setTranscriptError(null);
                              }}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/30 active:scale-95 transition-all"
                            >
                              Moderation
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Room Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[rgba(141,168,82,0.15)] bg-slate-50 dark:bg-[#091009]/80 text-slate-700 dark:text-[#9DA89A] font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Room ID</th>
                        <th className="py-3 px-4">Participant A</th>
                        <th className="py-3 px-4">Participant B</th>
                        <th className="py-3 px-4">Remaining</th>
                        <th className="py-3 px-4">Started At</th>
                        <th className="py-3 px-4">Msgs</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[rgba(141,168,82,0.12)]">
                      {roomsList.map((r) => {
                        const initA = r.participant_a_username.slice(0, 2).toUpperCase();
                        const initB = r.participant_b_username.slice(0, 2).toUpperCase();

                        return (
                          <tr
                            key={r.room_id}
                            className="hover:bg-slate-50/80 dark:hover:bg-[#121E12]/40 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-brand-600 dark:text-[#A2BD63]">
                                #{r.room_id.slice(0, 8)}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  size="xs"
                                  avatarConfig={r.participant_a_avatar}
                                  initials={initA}
                                  shape="circle"
                                />
                                <span className="font-medium text-slate-900 dark:text-[#F4F6F1]">
                                  {r.participant_a_username}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  size="xs"
                                  avatarConfig={r.participant_b_avatar}
                                  initials={initB}
                                  shape="circle"
                                />
                                <span className="font-medium text-slate-900 dark:text-[#F4F6F1]">
                                  {r.participant_b_username}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              {r.timer_paused_at ? (
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded border border-sky-300 dark:border-sky-500/40">
                                  <span>⏸</span>
                                  <span>{formatSeconds(r.remaining_seconds)}</span>
                                  <span className="text-[10px] uppercase tracking-wider font-semibold ml-0.5">PAUSED</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-700 dark:text-amber-400">
                                  <Clock className="h-3 w-3" />
                                  {formatSeconds(r.remaining_seconds)}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-slate-600 dark:text-[#9DA89A]">
                              {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>

                            <td className="py-3 px-4 font-mono text-slate-900 dark:text-[#F4F6F1]">
                              {r.message_count}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenRoomDetails(r.room_id)}
                                  className="text-xs h-7 px-2"
                                >
                                  Details
                                </Button>

                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setTranscriptRoomId(r.room_id);
                                    setTranscriptMessages(null);
                                    setTranscriptError(null);
                                  }}
                                  className="text-xs h-7 px-2"
                                >
                                  Moderation
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* =====================================================================
          TAB 4: AUDIT LOG (Immutable Platform Staff Logs)
          ===================================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9DA89A]">
              Append-only audit trail. Every privileged access and moderation query is recorded here.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchAuditLogs}
              isLoading={auditLoading}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh Logs
            </Button>
          </div>

          <Card className="overflow-hidden">
            {auditLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Spinner size="md" variant="brand" label="Fetching audit records..." />
                <p className="text-xs text-slate-500 dark:text-[#6F796D]">Querying immutable admin_audit_log...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <FileText className="h-8 w-8 text-slate-400 dark:text-[#6F796D] mx-auto" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-[#F4F6F1]">No audit records yet</h4>
                <p className="text-xs text-slate-600 dark:text-[#9DA89A]">
                  Privileged actions will automatically create entries here.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Stacked Audit Cards */}
                <div className="block md:hidden divide-y divide-slate-100 dark:divide-[rgba(141,168,82,0.12)]">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-brand-600 dark:text-[#A2BD63]">
                          {log.action}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 dark:text-[#6F796D]">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-[#9DA89A] flex items-center justify-between">
                        <span>Actor: {log.actor_email || log.actor_role}</span>
                        {log.room_id && <span>Room: #{log.room_id.slice(0, 6)}</span>}
                      </div>
                      {log.reason && (
                        <p className="text-[11px] text-slate-900 dark:text-[#F4F6F1] bg-slate-50 dark:bg-[#091009] p-2 rounded-xl border border-slate-200 dark:border-[rgba(141,168,82,0.15)] leading-relaxed">
                          {log.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Audit Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[rgba(141,168,82,0.15)] bg-slate-50 dark:bg-[#091009]/80 text-slate-700 dark:text-[#9DA89A] font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Target / Room</th>
                        <th className="py-3 px-4">Mandatory Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[rgba(141,168,82,0.12)]">
                      {auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-[#121E12]/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-[#9DA89A] whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-brand-600 dark:text-[#A2BD63]">
                              {log.action}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-[#F4F6F1] block">
                                {log.actor_email || log.actor_role.toUpperCase()}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-[#6F796D]">
                                {log.actor_user_id.slice(0, 8)}...
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-[#9DA89A]">
                            {log.target_user_id && (
                              <div>User: {log.target_user_id.slice(0, 8)}...</div>
                            )}
                            {log.room_id && (
                              <div>Room: #{log.room_id.slice(0, 8)}</div>
                            )}
                            {!log.target_user_id && !log.room_id && <span className="text-slate-400 dark:text-[#6F796D]">—</span>}
                          </td>

                          <td className="py-3 px-4 text-slate-600 dark:text-[#9DA89A] max-w-xs truncate">
                            {log.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: PRIVILEGED USER PROFILE VIEW (With Mandatory Audited Reason)
          ===================================================================== */}
      <Modal
        isOpen={Boolean(inspectUserId)}
        onClose={() => {
          setInspectUserId(null);
          setUserDetails(null);
          setInspectError(null);
          setRevealedRegisterNumber(null);
          setRevealError(null);
        }}
        title="Privileged Student Profile Inspection"
        maxWidth="md"
        footer={
          userDetails ? (
            <div className="flex justify-end w-full">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setInspectUserId(null);
                  setUserDetails(null);
                  setInspectError(null);
                  setRevealedRegisterNumber(null);
                  setRevealError(null);
                }}
                className="w-full sm:w-auto min-h-[44px] min-w-[120px] font-semibold"
              >
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!userDetails ? (
            /* Reason Input Prompt Before Viewing Data */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Mandatory Auditing:</strong> Inspecting private student credentials creates an immutable log in <code className="font-mono">public.admin_audit_log</code>. Enter a specific operational or moderation reason.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider block">
                  Inspection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={inspectReason}
                  onChange={(e) => setInspectReason(e.target.value)}
                  placeholder="e.g., Verifying duplicate report, addressing safety report, or checking persona synchronization"
                  className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {inspectError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {inspectError}
                </p>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setInspectUserId(null)}
                  className="min-h-[44px] min-w-[90px]"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={inspectLoading}
                  onClick={handleInspectUser}
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                  className="min-h-[44px]"
                >
                  Confirm &amp; Inspect Profile
                </Button>
              </div>
            </div>
          ) : (
            /* Detailed Profile View */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  Access Logged to Audit Trail
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono">
                  Action: VIEW_PRIVATE_PROFILE
                </span>
              </div>

              {/* Persona Header */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3.5">
                <Avatar
                  size="lg"
                  avatarConfig={userDetails.avatar_config}
                  initials={userDetails.anonymous_username.slice(0, 2).toUpperCase()}
                  shape="circle"
                />
                <div className="space-y-0.5 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {userDetails.anonymous_username}
                  </h3>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                    <span>User UUID:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(userDetails.user_id, 'uuid')}
                      className="font-mono text-[11px] text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                    >
                      {userDetails.user_id.slice(0, 16)}...
                      {copiedText === 'uuid' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 1: ACCOUNT DETAILS */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider pb-1.5 border-b border-slate-200/80 dark:border-slate-700/60">
                  Account Details
                </h4>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Anonymous Username</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {userDetails.anonymous_username}
                  </span>
                </div>

                <div className="py-1 border-b border-slate-200/80 dark:border-slate-700/60 space-y-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">Google Account Name</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {userDetails.google_name || 'Not available'}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-700 dark:text-amber-400/90 block text-right font-medium">
                    Unverified account display name
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">User UUID</span>
                  <span className="font-mono text-[11px] text-slate-800 dark:text-slate-300">
                    {userDetails.user_id}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Account Created</span>
                  <span className="text-slate-800 dark:text-slate-300">
                    {new Date(userDetails.account_created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-600 dark:text-slate-400">Current Presence</span>
                  <span className="font-semibold text-brand-600 dark:text-[#A2BD63] capitalize">
                    {userDetails.presence_state || (userDetails.is_verified ? 'Active' : 'Idle')}
                  </span>
                </div>
              </div>

              {/* SECTION 2: VERIFIED COLLEGE DETAILS */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider pb-1.5 border-b border-slate-200/80 dark:border-slate-700/60">
                  Verified College Details
                </h4>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Verified Student Name</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {userDetails.is_verified && userDetails.real_name ? userDetails.real_name : 'Not verified'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Department</span>
                  <span className="font-semibold text-brand-700 dark:text-brand-400">
                    {userDetails.department || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Batch</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {userDetails.batch || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Gender</span>
                  <span className="text-slate-900 dark:text-white">
                    {userDetails.gender || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Verification Status</span>
                  {userDetails.is_verified ? (
                    <Badge variant="success" size="sm" withDot>Verified Student</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">Unverified</Badge>
                  )}
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Verification Method</span>
                  <span className="text-slate-800 dark:text-slate-300 font-medium">
                    {userDetails.verification_method || 'None'}
                  </span>
                </div>

                {/* Register Number (Secure Encrypted Storage & Audited Reveal) */}
                <div className="py-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Register Number</span>
                    <div>
                      {!userDetails.is_verified ? (
                        <span className="text-slate-500 dark:text-slate-500">Not verified</span>
                      ) : revealedRegisterNumber ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-brand-600 dark:text-[#A2BD63] text-sm">
                            {revealedRegisterNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(revealedRegisterNumber, 'regno')}
                            title="Copy Register Number"
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            {copiedText === 'regno' ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ) : userDetails.has_encrypted_register_number ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 dark:text-slate-500 tracking-wider text-xs">
                            ••••••••••••
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            isLoading={isRevealingRegNo}
                            onClick={handleRevealRegisterNumber}
                            className="text-xs h-6 px-2 font-semibold"
                          >
                            Reveal
                          </Button>
                        </div>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 text-[11px] font-medium">
                          Unavailable — re-verification required
                        </span>
                      )}
                    </div>
                  </div>

                  {revealError && (
                    <p className="text-[11px] text-rose-500 font-medium text-right">
                      {revealError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>



      {/* =====================================================================
          MODAL 2: ACTIVE ROOM DETAILS
          ===================================================================== */}
      <Modal
        isOpen={Boolean(selectedRoomId)}
        onClose={() => {
          setSelectedRoomId(null);
          setRoomDetails(null);
          setRoomDetailsError(null);
        }}
        title="Active Room Details"
        maxWidth="md"
        footer={
          roomDetails ? (
            <div className="flex justify-between items-center w-full gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const rId = selectedRoomId;
                  setSelectedRoomId(null);
                  setTranscriptRoomId(rId);
                  setTranscriptMessages(null);
                }}
                leftIcon={<Eye className="h-3.5 w-3.5" />}
                className="min-h-[44px]"
              >
                Open Moderation
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedRoomId(null)}
                className="min-h-[44px] min-w-[90px]"
              >
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {roomDetailsLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Spinner size="md" variant="brand" label="Loading room metadata..." />
            </div>
          ) : roomDetailsError ? (
            <ErrorMessage title="Room Details Error" message={roomDetailsError} />
          ) : roomDetails ? (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Room ID</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {roomDetails.room_id}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Status</span>
                  <Badge variant={roomDetails.status === 'active' ? 'success' : 'neutral'} size="sm">
                    {roomDetails.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Timer</span>
                  {roomDetails.timer_paused_at ? (
                    <Badge variant="warning" size="sm">PAUSED</Badge>
                  ) : (
                    <Badge variant="success" size="sm">RUNNING</Badge>
                  )}
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Remaining Time</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                    {formatSeconds(roomDetails.remaining_seconds)}
                  </span>
                </div>

                {roomDetails.timer_paused_at && (
                  <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-slate-600 dark:text-slate-400">Paused At</span>
                    <span className="font-mono text-slate-800 dark:text-slate-300">
                      {new Date(roomDetails.timer_paused_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">Total Messages</span>
                  <span className="font-mono text-slate-900 dark:text-white font-semibold">
                    {roomDetails.message_count}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-600 dark:text-slate-400">User 1 Heartbeat</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatRelativeTime(roomDetails.user_1_heartbeat_at)}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-600 dark:text-slate-400">User 2 Heartbeat</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatRelativeTime(roomDetails.user_2_heartbeat_at)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* =====================================================================
          MODAL 3: MODERATION TRANSCRIPT VIEW (Live Read-Only Chat Overview)
          ===================================================================== */}
      <Modal
        isOpen={Boolean(transcriptRoomId)}
        onClose={handleCloseModeration}
        title={transcriptMessages ? undefined : 'Room Moderation'}
        maxWidth="xl"
        footer={
          transcriptMessages ? (
            <div className="flex justify-end w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCloseModeration}
                className="min-h-[44px] min-w-[100px]"
              >
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!transcriptMessages ? (
            /* Reason Prompt Before Transcript Access */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Mandatory Auditing:</strong> Opening a student conversation transcript creates an immutable log in <code className="font-mono">public.admin_audit_log</code>. Enter a specific operational or moderation reason (minimum 5 characters).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider block">
                  Moderation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={transcriptReason}
                  onChange={(e) => setTranscriptReason(e.target.value)}
                  placeholder="e.g., Investigating abuse report from user, verifying message latency, or debugging timeout behavior"
                  className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {transcriptError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {transcriptError}
                </p>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCloseModeration}
                  className="min-h-[44px] min-w-[90px]"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={transcriptLoading}
                  onClick={handleOpenModerationTranscript}
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                  className="min-h-[44px]"
                >
                  Confirm &amp; Inspect Live Chat
                </Button>
              </div>
            </div>
          ) : (
            /* Live Chat Overview Display */
            <div className="space-y-3 animate-in fade-in">
              {/* Live Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[rgba(141,168,82,0.15)]">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-[#F4F6F1]">Room Moderation</h3>
                    <span className="font-mono text-xs text-brand-600 dark:text-[#A2BD63]">
                      Room #{transcriptRoomId?.slice(0, 8)}
                    </span>
                    {liveStatus === 'live' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                        LIVE
                      </span>
                    )}
                    {liveStatus === 'reconnecting' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/40">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Reconnecting...
                      </span>
                    )}
                    {liveStatus === 'ended' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-slate-700 dark:text-[#9DA89A] bg-slate-100 dark:bg-[#121E12] border border-slate-200 dark:border-[rgba(141,168,82,0.2)]">
                        Room ended
                      </span>
                    )}
                  </div>
                  {moderationData && (
                    <p className="text-xs text-slate-600 dark:text-[#9DA89A] mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="text-brand-700 dark:text-[#A2BD63] font-semibold">{moderationData.participant_a.username}</span>
                      <span className="text-slate-400 dark:text-[#6F796D] font-bold">↔</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{moderationData.participant_b.username}</span>
                    </p>
                  )}
                </div>

                <div className="p-1.5 px-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-400 text-[11px] inline-flex items-center gap-1.5 self-start sm:self-auto">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Audited inspection active</span>
                </div>
              </div>

              {/* Realtime Live Chat Messages Viewport */}
              <div
                ref={chatContainerRef}
                onScroll={handleModerationScroll}
                className="h-[55vh] sm:h-[450px] overflow-y-auto p-4 rounded-2xl bg-slate-50 dark:bg-[#091009] border border-slate-200 dark:border-[rgba(141,168,82,0.18)] space-y-3 relative flex flex-col"
              >
                {transcriptMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 dark:text-[#6F796D] py-12 space-y-1">
                    <MessageSquare className="h-8 w-8 text-slate-300 dark:text-[#6F796D]/60" />
                    <p className="text-xs">No messages sent in this room yet.</p>
                    <p className="text-[11px] text-slate-500 dark:text-[#4A5448]">Live incoming messages will appear automatically.</p>
                  </div>
                ) : (
                  transcriptMessages.map((m) => {
                    const isParticipantA = m.sender_id === moderationData?.participant_a.id;

                    if (isParticipantA) {
                      return (
                        <div key={m.id} className="flex flex-col items-start max-w-[85%] sm:max-w-[75%] space-y-1">
                          <span className="text-[10px] font-bold text-brand-700 dark:text-[#A2BD63] px-1">
                            {m.sender_username}
                          </span>
                          <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 bg-white border border-slate-200 text-slate-900 shadow-sm dark:bg-[#121E12] dark:border-[rgba(141,168,82,0.22)] dark:text-[#F4F6F1] text-xs break-words leading-relaxed">
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            <span className="block text-[10px] text-slate-500 dark:text-[#6F796D] text-right mt-1 font-mono">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className="flex flex-col items-end max-w-[85%] sm:max-w-[75%] ml-auto space-y-1">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 px-1">
                          {m.sender_username}
                        </span>
                        <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-slate-900 shadow-sm dark:bg-[#1F2F1D] dark:border-emerald-500/30 dark:text-[#F4F6F1] text-xs break-words leading-relaxed">
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <span className="block text-[10px] text-emerald-600 dark:text-[#8DA852] text-right mt-1 font-mono">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />

                {/* Floating New Messages Jump Button */}
                {hasUnreadMessages && (
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    className="sticky bottom-2 mx-auto px-3.5 py-1.5 rounded-full bg-brand-600 dark:bg-[#A2BD63] text-white dark:text-[#091009] text-xs font-bold shadow-lg flex items-center gap-1.5 hover:bg-brand-700 dark:hover:bg-[#b0cc6e] active:scale-95 transition-all animate-bounce z-10"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>New messages</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default DeveloperPage;
