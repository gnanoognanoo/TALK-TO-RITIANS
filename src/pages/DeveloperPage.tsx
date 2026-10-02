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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Radio,
  Check,
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
import {
  AdminDashboardStats,
  AdminOnlineUser,
  AdminUserDetails,
  AdminActiveRoom,
  AdminRoomDetails,
  ModerationTranscriptMessage,
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
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // 3. Moderation Transcript
  const [transcriptRoomId, setTranscriptRoomId] = useState<string | null>(null);
  const [transcriptReason, setTranscriptReason] = useState<string>('Investigating reported incident');
  const [transcriptMessages, setTranscriptMessages] = useState<ModerationTranscriptMessage[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState<boolean>(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  // Action pending states
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [testSessionTargetId, setTestSessionTargetId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

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

  const handleSendInvite = async (targetUserId: string) => {
    setInvitingUserId(targetUserId);
    const res = await staffService.sendAdminChatInvite(targetUserId);
    setInvitingUserId(null);

    if (!res.success) {
      showNotification('error', res.error?.message || 'Failed to send chat invite.');
      return;
    }

    showNotification('success', 'Admin chat invite sent! Target received prompt with 30s expiration.');
    fetchStats();
    fetchUsers();
    fetchAuditLogs();
  };

  const handleStartTestSession = async (targetUserId: string) => {
    setTestSessionTargetId(targetUserId);
    const res = await staffService.createTestSession(targetUserId);
    setTestSessionTargetId(null);

    if (!res.success || !res.data) {
      showNotification('error', res.error?.message || 'Forced test session failed.');
      return;
    }

    showNotification('success', 'Test session created! Redirecting to chat room...');
    setTimeout(() => {
      navigate(`/chat/${res.data!.roomId}`);
    }, 800);
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

    setTranscriptMessages(res.data);
    fetchAuditLogs();
  };

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
              : 'bg-rose-950/90 border-rose-700 text-rose-100'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
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

      {/* Console Tab Navigation */}
      <div className="flex items-center gap-1.5 border-b border-gray-200 dark:border-slate-800 pb-px overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Online Users</span>
          {stats?.online_users !== undefined && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300">
              {stats.online_users}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('rooms')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'rooms'
              ? 'border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Active Rooms</span>
          {stats?.active_rooms !== undefined && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300">
              {stats.active_rooms}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: OVERVIEW
          ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {/* 1. Online Users */}
            <Card className="p-4 sm:p-5 border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Online Users</span>
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {statsLoading ? '...' : stats?.online_users ?? 0}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active heartbeats
              </div>
            </Card>

            {/* 2. Currently Chatting */}
            <Card className="p-4 sm:p-5 border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">In Chat</span>
                <MessageSquare className="h-4 w-4 text-brand-500" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {statsLoading ? '...' : stats?.users_chatting ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                In 7-minute rooms
              </div>
            </Card>

            {/* 3. Users Idle */}
            <Card className="p-4 sm:p-5 border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Users Idle</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {statsLoading ? '...' : stats?.users_idle ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                Available on campus
              </div>
            </Card>

            {/* 4. Active Rooms */}
            <Card className="p-4 sm:p-5 border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Active Rooms</span>
                <Radio className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {statsLoading ? '...' : stats?.active_rooms ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                Realtime sessions
              </div>
            </Card>

            {/* 5. Pending Chat Requests */}
            <Card className="p-4 sm:p-5 border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Requests</span>
                <Send className="h-4 w-4 text-cyan-500" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {statsLoading ? '...' : stats?.pending_requests ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                Awaiting student response
              </div>
            </Card>
          </div>

          {/* Quick Actions & Security Governance Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
              <CardHeader>
                <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Shield className="h-4 w-4 text-brand-500" />
                  Staff Security Invariants
                </CardTitle>
                <CardDescription className="text-xs text-gray-500 dark:text-slate-400">
                  Strict privacy boundaries enforced by PostgreSQL engine rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-gray-600 dark:text-slate-300">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-gray-900 dark:text-white">Zero Raw Register Numbers:</strong> Raw student IDs are never stored in the database. Identity verification references use one-way salted hashes and masked suffix fingerprints.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-gray-900 dark:text-white">Audited Profile Access:</strong> Inspecting any private student profile requires a mandatory reason and is immutably logged to <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">admin_audit_log</code>.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-gray-900 dark:text-white">Zero Secret Observer Presence:</strong> Staff moderation does not invisibly join chat rooms as a third participant, preserving standard 2-person participant caps and 7-minute timers.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-gray-900 dark:text-white">Forced Test Isolation:</strong> Forced test sessions are strictly prohibited against normal students and succeed exclusively when both participants are staff/test accounts.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
              <CardHeader>
                <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-500" />
                  Platform Staff Session
                </CardTitle>
                <CardDescription className="text-xs text-gray-500 dark:text-slate-400">
                  Current authenticated operator privileges.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-800">
                  <span className="text-gray-500 dark:text-slate-400">Staff Role</span>
                  <Badge variant="warning" size="sm">{staffRole?.toUpperCase() || 'DEVELOPER'}</Badge>
                </div>
                <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-800">
                  <span className="text-gray-500 dark:text-slate-400">Operator User ID</span>
                  <span className="font-mono text-gray-900 dark:text-white text-[11px]">
                    {user?.id.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-800">
                  <span className="text-gray-500 dark:text-slate-400">Operator Email</span>
                  <span className="text-gray-900 dark:text-white font-medium">{user?.email || 'Authenticated'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500 dark:text-slate-400">Database Engine</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Supabase PostgreSQL 15 (ap-south-1)</span>
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
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by anonymous handle or user UUID..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400 shrink-0" />
              <select
                value={userStateFilter}
                onChange={(e) => setUserStateFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

          {/* Users Table */}
          <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-card">
            {usersLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Spinner size="md" variant="brand" label="Fetching online users..." />
                <p className="text-xs text-gray-400">Querying platform presence registry...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Users className="h-8 w-8 text-gray-400 mx-auto" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-slate-200">No users found</h4>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {userSearchQuery ? 'No online users match your search query.' : 'No active student sessions detected.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Anonymous Persona</th>
                      <th className="py-3 px-4">Verification</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4">Last Seen</th>
                      <th className="py-3 px-4">Current Room</th>
                      <th className="py-3 px-4 text-right">Privileged Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800/80">
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
                          className="hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-colors"
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
                                <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                  <span>{u.anonymous_username}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 font-semibold">
                                      You
                                    </span>
                                  )}
                                  {u.is_staff && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold">
                                      {u.staff_role?.toUpperCase() || 'STAFF'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-gray-400 dark:text-slate-500">
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
                          <td className="py-3 px-4 text-gray-500 dark:text-slate-400">
                            {formatRelativeTime(u.last_seen_at)}
                          </td>

                          {/* Current Room */}
                          <td className="py-3 px-4">
                            {u.current_room_id ? (
                              <button
                                type="button"
                                onClick={() => handleOpenRoomDetails(u.current_room_id!)}
                                className="font-mono text-[11px] text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                              >
                                <span>#{u.current_room_id.slice(0, 8)}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <span className="text-gray-400 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Inspect Profile Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setInspectUserId(u.user_id);
                                  setUserDetails(null);
                                  setInspectError(null);
                                }}
                                title={
                                  staffRole !== 'admin'
                                    ? 'Requires Admin role to inspect private credentials'
                                    : 'Inspect private student profile (audited)'
                                }
                                className="text-xs h-7 px-2"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Inspect{staffRole !== 'admin' ? ' (Admin)' : ''}
                              </Button>

                              {/* Invite to Chat Button */}
                              {!isSelf && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={u.state === 'in_chat' || invitingUserId === u.user_id}
                                  isLoading={invitingUserId === u.user_id}
                                  onClick={() => handleSendInvite(u.user_id)}
                                  title={u.state === 'in_chat' ? 'User is already chatting' : 'Send direct chat invite'}
                                  className="text-xs h-7 px-2"
                                >
                                  <Send className="h-3.5 w-3.5 mr-1" />
                                  Invite
                                </Button>
                              )}

                              {/* Forced Test Session (Restricted to test/developer accounts only) */}
                              {!isSelf && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={!u.is_test_account || testSessionTargetId === u.user_id}
                                  isLoading={testSessionTargetId === u.user_id}
                                  onClick={() => handleStartTestSession(u.user_id)}
                                  title={
                                    u.is_test_account
                                      ? 'Start forced test session between test/dev accounts'
                                      : 'Forced sessions strictly prohibited against normal students'
                                  }
                                  className="text-xs h-7 px-2 border-dashed"
                                >
                                  <Play className="h-3.5 w-3.5 mr-1 text-amber-500" />
                                  Test
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
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
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

          <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-card">
            {roomsLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Spinner size="md" variant="brand" label="Fetching active rooms..." />
                <p className="text-xs text-gray-400">Retrieving active chat sessions...</p>
              </div>
            ) : roomsList.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <MessageSquare className="h-8 w-8 text-gray-400 mx-auto" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-slate-200">No active rooms</h4>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  There are currently no active 7-minute conversations in progress.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Room ID</th>
                      <th className="py-3 px-4">Participant A</th>
                      <th className="py-3 px-4">Participant B</th>
                      <th className="py-3 px-4">Remaining</th>
                      <th className="py-3 px-4">Started At</th>
                      <th className="py-3 px-4">Msgs</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800/80">
                    {roomsList.map((r) => {
                      const initA = r.participant_a_username.slice(0, 2).toUpperCase();
                      const initB = r.participant_b_username.slice(0, 2).toUpperCase();

                      return (
                        <tr
                          key={r.room_id}
                          className="hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          {/* Room ID */}
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-brand-600 dark:text-brand-400">
                              #{r.room_id.slice(0, 8)}
                            </span>
                          </td>

                          {/* Participant A */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Avatar
                                size="xs"
                                avatarConfig={r.participant_a_avatar}
                                initials={initA}
                                shape="circle"
                              />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {r.participant_a_username}
                              </span>
                            </div>
                          </td>

                          {/* Participant B */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Avatar
                                size="xs"
                                avatarConfig={r.participant_b_avatar}
                                initials={initB}
                                shape="circle"
                              />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {r.participant_b_username}
                              </span>
                            </div>
                          </td>

                          {/* Remaining */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-600 dark:text-amber-400">
                              <Clock className="h-3 w-3" />
                              {formatSeconds(r.remaining_seconds)}
                            </span>
                          </td>

                          {/* Started At */}
                          <td className="py-3 px-4 text-gray-500 dark:text-slate-400">
                            {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>

                          {/* Message Count */}
                          <td className="py-3 px-4 font-mono text-gray-600 dark:text-slate-300">
                            {r.message_count}
                          </td>

                          {/* Actions */}
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
                                title={
                                  staffRole !== 'admin'
                                    ? 'Requires Admin role to access moderation transcripts'
                                    : 'Read moderation chat transcript (audited)'
                                }
                                className="text-xs h-7 px-2"
                              >
                                Moderation{staffRole !== 'admin' ? ' (Admin)' : ''}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
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

          <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-card">
            {auditLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Spinner size="md" variant="brand" label="Fetching audit records..." />
                <p className="text-xs text-gray-400">Querying immutable admin_audit_log...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <FileText className="h-8 w-8 text-gray-400 mx-auto" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-slate-200">No audit records yet</h4>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Privileged actions will automatically create entries here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Target / Room</th>
                      <th className="py-3 px-4">Mandatory Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800/80">
                    {auditLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-gray-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-brand-600 dark:text-brand-400">
                            {log.action}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white block">
                              {log.actor_email || log.actor_role.toUpperCase()}
                            </span>
                            <span className="font-mono text-[10px] text-gray-400">
                              {log.actor_user_id.slice(0, 8)}...
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px] text-gray-600 dark:text-slate-300">
                          {log.target_user_id && (
                            <div>User: {log.target_user_id.slice(0, 8)}...</div>
                          )}
                          {log.room_id && (
                            <div>Room: #{log.room_id.slice(0, 8)}</div>
                          )}
                          {!log.target_user_id && !log.room_id && <span className="text-gray-400">—</span>}
                        </td>

                        <td className="py-3 px-4 text-gray-700 dark:text-slate-300 max-w-xs truncate">
                          {log.reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
        }}
        title="Privileged Student Profile Inspection"
        maxWidth="md"
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

              {staffRole !== 'admin' && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <Shield className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Admin Role Required:</strong> Access to private student credentials (real name, department, batch, gender, verification details) is strictly restricted to accounts with the Admin role.
                  </p>
                </div>
              )}

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
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={inspectLoading}
                  onClick={handleInspectUser}
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
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
                <span className="text-[10px] text-emerald-600 dark:text-emerald-500">
                  Action: VIEW_PRIVATE_PROFILE
                </span>
              </div>

              {/* Persona Header */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex items-center gap-3.5">
                <Avatar
                  size="lg"
                  avatarConfig={userDetails.avatar_config}
                  initials={userDetails.anonymous_username.slice(0, 2).toUpperCase()}
                  shape="circle"
                />
                <div className="space-y-0.5">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {userDetails.anonymous_username}
                  </h3>
                  <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
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

              {/* Credential Attributes */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Real Verified Name</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {userDetails.real_name || 'Not Linked / Anonymous'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Department</span>
                  <span className="font-semibold text-brand-600 dark:text-brand-400">
                    {userDetails.department || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Batch</span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {userDetails.batch || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Gender</span>
                  <span className="text-gray-900 dark:text-white">
                    {userDetails.gender || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Verification Status</span>
                  {userDetails.is_verified ? (
                    <Badge variant="success" size="sm" withDot>Verified Student</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">Unverified</Badge>
                  )}
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Verification Method</span>
                  <span className="text-gray-700 dark:text-slate-300 font-medium">
                    {userDetails.verification_method || 'None'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Identity Fingerprint (Masked)</span>
                  <span className="font-mono text-[11px] text-gray-700 dark:text-slate-300">
                    {userDetails.fingerprint_suffix || 'None'}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-gray-500 dark:text-slate-400">Account Created</span>
                  <span className="text-gray-600 dark:text-slate-400">
                    {new Date(userDetails.account_created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setInspectUserId(null);
                    setUserDetails(null);
                  }}
                >
                  Close
                </Button>
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
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Room ID</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">
                    {roomDetails.room_id}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Status</span>
                  <Badge variant={roomDetails.status === 'active' ? 'success' : 'neutral'} size="sm">
                    {roomDetails.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Remaining Time</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatSeconds(roomDetails.remaining_seconds)}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">Total Messages</span>
                  <span className="font-mono text-gray-900 dark:text-white font-semibold">
                    {roomDetails.message_count}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-200/60 dark:border-slate-700/60">
                  <span className="text-gray-500 dark:text-slate-400">User 1 Heartbeat</span>
                  <span className="text-gray-600 dark:text-slate-300">
                    {formatRelativeTime(roomDetails.user_1_heartbeat_at)}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-gray-500 dark:text-slate-400">User 2 Heartbeat</span>
                  <span className="text-gray-600 dark:text-slate-300">
                    {formatRelativeTime(roomDetails.user_2_heartbeat_at)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
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
                >
                  Open Moderation Transcript
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedRoomId(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* =====================================================================
          MODAL 3: MODERATION TRANSCRIPT VIEW (Audited Inspection)
          ===================================================================== */}
      <Modal
        isOpen={Boolean(transcriptRoomId)}
        onClose={() => {
          setTranscriptRoomId(null);
          setTranscriptMessages(null);
          setTranscriptError(null);
        }}
        title="Room Moderation Transcript"
        maxWidth="lg"
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

              {staffRole !== 'admin' && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <Shield className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Admin Role Required:</strong> Chat transcript inspection is strictly restricted to accounts with the Admin role.
                  </p>
                </div>
              )}

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
                  onClick={() => setTranscriptRoomId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={transcriptLoading}
                  onClick={handleOpenModerationTranscript}
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                >
                  Confirm &amp; Load Transcript
                </Button>
              </div>
            </div>
          ) : (
            /* Transcript Display */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Audited Transcript Inspection Active
                </span>
                <span className="font-mono text-[11px]">
                  Room #{transcriptRoomId?.slice(0, 8)}
                </span>
              </div>

              {/* Chronological Chat Messages */}
              <div className="max-h-96 overflow-y-auto p-4 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 space-y-3">
                {transcriptMessages.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-6">
                    No messages sent in this room yet.
                  </p>
                ) : (
                  transcriptMessages.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-brand-600 dark:text-brand-400">
                          {m.sender_username}
                        </span>
                        <span className="text-gray-400 font-mono">
                          {new Date(m.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-800 dark:text-slate-200 break-words">
                        {m.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTranscriptRoomId(null);
                    setTranscriptMessages(null);
                  }}
                >
                  Close Transcript
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default DeveloperPage;
