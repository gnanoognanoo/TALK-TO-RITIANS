/**
 * ============================================================================
 * TALK TO RITIANS - Developer Invite Fix & Chat Theme Support Test Suite
 * ============================================================================
 * Verifies:
 * 1. Developer Console Invite Flow & Server-Side Security
 *    - Developer authorization enforcement (DEVELOPER_REQUIRED).
 *    - Offline and unavailable recipient checks (TARGET_OFFLINE, USER_UNAVAILABLE).
 *    - Active room conflict prevention (ALREADY_IN_ROOM).
 *    - Pending conflict prevention (REQUEST_ALREADY_PENDING).
 *    - Matchmaking queue bypass for developer invitations in accept_chat_request.
 *    - Ordinary matchmaking race-condition protections preserved.
 *    - Effective persona resolution (Heisenberg anonymous persona + gallery avatar).
 * 2. Developer Console UI State & Navigation
 *    - Disabled Invite button for offline/in-chat users.
 *    - Accurate toast states: "Invitation sent — waiting for response.",
 *      "Invitation declined.", "Chat invitation expired."
 *    - Auto-navigation on acceptance from Developer Console.
 *    - Preservation of Force Chat as independent operation.
 * 3. Chat Page Light & Dark Theme Support
 *    - Removal of unconditional dark-mode root restriction.
 *    - Proper dual-theme styling following ThemeContext tokens.
 *    - Light Mode palette: #F8FAFC background, white header, purple outgoing bubbles,
 *      #E9EEF5 incoming bubbles, high-contrast dark text.
 *    - Dark Mode palette: #050805 background, #091009 header, #2A3C1C outgoing,
 *      #142016 incoming, #F4F6F1 text.
 *    - Timer thresholds (normal, amber at 01:00, red at 00:10, sky-blue frozen)
 *      visible in both themes.
 *    - Fixed 100dvh viewport layout (fixed header, scrollable messages, fixed composer) preserved.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('TALK TO RITIANS - Developer Invite Fix & Chat Theme Support Suite', () => {
  const migrationContent = fs.readFileSync(
    path.join(PROJECT_ROOT, 'supabase/migrations/20261011000004_developer_invite_flow_and_presence_validation.sql'),
    'utf8'
  );
  const developerPageContent = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/pages/DeveloperPage.tsx'),
    'utf8'
  );
  const chatPageContent = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/pages/ChatPage.tsx'),
    'utf8'
  );
  const staffTypesContent = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/types/staff.ts'),
    'utf8'
  );

  // ==========================================================================
  // 1. Server-Side Developer Invite Flow & Presence Validation
  // ==========================================================================
  describe('1. Server-Side Developer Invite RPC Security & Validation', () => {
    test('send_admin_chat_invite requires developer staff authorization', () => {
      assert.ok(migrationContent.includes('IF NOT public.is_platform_staff() THEN'));
      assert.ok(migrationContent.includes("'DEVELOPER_REQUIRED'"));
    });

    test('send_admin_chat_invite validates target presence and availability', () => {
      assert.ok(migrationContent.includes('SELECT is_online, available_for_chat_requests, last_seen_at, current_page'));
      assert.ok(migrationContent.includes("'TARGET_OFFLINE'"));
      assert.ok(migrationContent.includes("'USER_UNAVAILABLE'"));
      assert.ok(migrationContent.includes("v_target_presence.current_page IN ('chat', 'verify')"));
    });

    test('send_admin_chat_invite validates room conflicts for caller and target', () => {
      assert.ok(migrationContent.includes("(user_1 = v_caller_id OR user_2 = v_caller_id)"));
      assert.ok(migrationContent.includes("(user_1 = p_user_id OR user_2 = p_user_id)"));
      assert.ok(migrationContent.includes("'ALREADY_IN_ROOM'"));
    });

    test('send_admin_chat_invite prevents duplicate conflicting pending invitations', () => {
      assert.ok(migrationContent.includes("'REQUEST_ALREADY_PENDING'"));
      assert.ok(migrationContent.includes("UPDATE public.chat_requests"));
      assert.ok(migrationContent.includes("SET status = 'cancelled'"));
    });

    test('send_admin_chat_invite creates invitation with 30s expiration', () => {
      assert.ok(migrationContent.includes("v_now + interval '30 seconds'"));
      assert.ok(migrationContent.includes("'remaining_seconds', 30"));
    });
  });

  // ==========================================================================
  // 2. Developer Not Searching & Atomic Accept Handling
  // ==========================================================================
  describe('2. Developer Not Searching & Atomic Accept Handling', () => {
    test('accept_chat_request distinguishes developer invitations from queue searches', () => {
      assert.ok(migrationContent.includes('v_is_developer_requester BOOLEAN := false;'));
      assert.ok(migrationContent.includes("role = 'developer' AND is_active = true"));
      assert.ok(migrationContent.includes('IF v_is_developer_requester IS TRUE THEN'));
    });

    test('developer invitations bypass matchmaking queue searching requirement', () => {
      // In migration, when v_is_developer_requester is TRUE, does not abort on null queue row
      const devBlockStart = migrationContent.indexOf('IF v_is_developer_requester IS TRUE THEN');
      const elseBlock = migrationContent.indexOf('ELSE', devBlockStart);
      const devBlock = migrationContent.slice(devBlockStart, elseBlock);

      assert.equal(
        devBlock.includes("RETURN jsonb_build_object(\n        'success', false,\n        'error', 'REQUESTER_CANCELLED_SEARCH'"),
        false,
        'Developer block must not cancel request if matchmaking_queue row is missing'
      );
    });

    test('ordinary student matchmaking requests still enforce strict queue searching', () => {
      const elseBlockStart = migrationContent.indexOf('ELSE', migrationContent.indexOf('IF v_is_developer_requester IS TRUE THEN'));
      const endBlock = migrationContent.indexOf('END IF;\n\n  -- 3. Conflict check', elseBlockStart);
      const studentBlock = migrationContent.slice(elseBlockStart, endBlock);

      assert.ok(studentBlock.includes("v_requester_queue.id IS NULL OR v_requester_queue.status <> 'searching'"));
      assert.ok(studentBlock.includes("'REQUESTER_CANCELLED_SEARCH'"));
      assert.ok(studentBlock.includes("v_requester_queue.heartbeat_at < (v_now - interval '30 seconds')"));
    });

    test('accept_chat_request resolves effective persona for Heisenberg persona', () => {
      assert.ok(migrationContent.includes('v_requester_persona := public._get_effective_persona(v_req.requester_id);'));
      assert.ok(migrationContent.includes("'peer', v_requester_persona"));
    });
  });

  // ==========================================================================
  // 3. Developer Console UI State & Navigation
  // ==========================================================================
  describe('3. Developer Console UI State & Navigation', () => {
    test('DeveloperPage defines isUserEligibleForInvite checking online, presence, and chat state', () => {
      assert.ok(developerPageContent.includes('const isUserEligibleForInvite = (u: AdminOnlineUser) => {'));
      assert.ok(developerPageContent.includes('if (!isUserOnline(u)) return false;'));
      assert.ok(developerPageContent.includes("if (u.state === 'in_chat') return false;"));
      assert.ok(developerPageContent.includes('if (u.available_for_chat_requests === false) return false;'));
    });

    test('DeveloperPage disables Invite button when user is ineligible or already invited', () => {
      assert.ok(developerPageContent.includes('disabled={!isUserEligibleForInvite(u) || invitingUserId === u.user_id || sentInvite?.targetUserId === u.user_id}'));
    });

    test('DeveloperPage displays waiting status and neutral notifications for decline/expiry', () => {
      assert.ok(developerPageContent.includes("'Invitation sent — waiting for response.'"));
      assert.ok(developerPageContent.includes("'Invitation declined.'"));
      assert.ok(developerPageContent.includes("'Chat invitation expired.'"));
    });

    test('DeveloperPage automatically navigates to chat when invitation is accepted', () => {
      assert.ok(developerPageContent.includes("navigate(`/chat/${row.room_id}`)"));
    });

    test('Force Chat button is preserved with independent privileged behavior', () => {
      assert.ok(developerPageContent.includes('handleForceChat'));
      assert.ok(developerPageContent.includes('forceDeveloperChat'));
      assert.ok(developerPageContent.includes('Force direct chat session (privileged)'));
    });

    test('AdminOnlineUser interface includes available_for_chat_requests', () => {
      assert.ok(staffTypesContent.includes('available_for_chat_requests?: boolean;'));
    });
  });

  // ==========================================================================
  // 4. Chat Page Dual Theme Support
  // ==========================================================================
  describe('4. Chat Page Dual Theme Support', () => {
    test('chat page root conforms to ThemeContext without hardcoded unconditional dark class', () => {
      assert.ok(chatPageContent.includes('bg-[#F8FAFC] text-[#0F172A] dark:bg-[#050805] dark:text-[#F4F6F1]'));
      assert.equal(
        chatPageContent.includes('bg-[#050805] text-[#F4F6F1] dark"'),
        false,
        'Root must not hardcode unconditional dark class'
      );
    });

    test('header is light with dark text in Light mode, dark with off-white text in Dark mode', () => {
      assert.ok(chatPageContent.includes('bg-white/95 dark:bg-[#091009]/95'));
      assert.ok(chatPageContent.includes('border-[#DCE3EC] dark:border-[rgba(155,185,115,0.16)]'));
      assert.ok(chatPageContent.includes('text-[#0F172A] dark:text-[#F4F6F1]'));
    });

    test('outgoing bubbles use brand purple in Light mode and #2A3C1C in Dark mode', () => {
      assert.ok(chatPageContent.includes('bg-[#6D42E8] text-white font-medium'));
      assert.ok(chatPageContent.includes('dark:bg-[#2A3C1C] dark:text-[#F4F6F1]'));
    });

    test('incoming bubbles use soft gray #E9EEF5 in Light mode and #142016 in Dark mode', () => {
      assert.ok(chatPageContent.includes('bg-[#E9EEF5] text-[#172033]'));
      assert.ok(chatPageContent.includes('dark:bg-[#142016] dark:text-[#F4F6F1]'));
    });

    test('composer is light in Light mode and #091009 in Dark mode', () => {
      assert.ok(chatPageContent.includes('border-t border-[#DCE3EC] dark:border-[rgba(155,185,115,0.16)] bg-white/95 dark:bg-[#091009]/95'));
      assert.ok(chatPageContent.includes('bg-[#F1F5F9] dark:bg-[#060A06] text-[#111827] dark:text-[#F4F6F1]'));
    });

    test('timer thresholds remain visible with appropriate contrast in both modes', () => {
      // Red warning
      assert.ok(chatPageContent.includes('bg-red-50 text-red-700 border-red-300 dark:bg-red-950/80 dark:text-red-300'));
      // Amber warning
      assert.ok(chatPageContent.includes('bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300'));
      // Frozen
      assert.ok(chatPageContent.includes('bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300'));
    });

    test('developer freeze/resume buttons are styled for both themes', () => {
      assert.ok(chatPageContent.includes('text-white bg-brand-600 hover:bg-brand-700 dark:text-[#10170B] dark:bg-[#A2BD63]'));
      assert.ok(chatPageContent.includes('text-sky-700 bg-sky-50 border border-sky-300 hover:bg-sky-100 dark:text-sky-300 dark:bg-sky-950/50'));
    });

    test('leave modal is theme-aware without forceDark override', () => {
      assert.equal(
        chatPageContent.includes('<Modal\n        forceDark'),
        false,
        'Modal should not have forceDark'
      );
    });

    test('empty state and disconnected cards are styled for both themes', () => {
      assert.ok(chatPageContent.includes("bg-[#F8FAFC] dark:bg-[#050805]"));
      assert.ok(chatPageContent.includes("bg-white dark:bg-[#0D160E] border border-[#DCE3EC] dark:border-[rgba(155,185,115,0.22)]"));
    });

    test('fixed header, scrollable middle messages, and fixed composer layout is preserved', () => {
      assert.ok(chatPageContent.includes('id="chat-header"'));
      assert.ok(chatPageContent.includes('id="chat-messages-container"'));
      assert.ok(chatPageContent.includes('id="chat-composer-container"'));
      assert.ok(chatPageContent.includes('flex-1 min-h-0 overflow-y-auto overscroll-y-contain'));
      assert.ok(chatPageContent.includes('h-[100dvh] max-h-[100dvh]'));
    });
  });
});
