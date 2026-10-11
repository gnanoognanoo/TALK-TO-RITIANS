/**
 * ============================================================================
 * TALK TO RITIANS - Production Chat Page UI Fix Regression Test Suite
 * ============================================================================
 * Verifies:
 * 1. Fixed Header outside scroll container with flex-shrink: 0 and z-index layer.
 * 2. Fixed Composer docked to bottom with flex-shrink: 0 and safe-area inset.
 * 3. Only the middle messages section has overflow scrolling (flex: 1, min-h-0, overflow-y-auto).
 * 4. Document body and html scroll locking during active chat session.
 * 5. Elimination of element.scrollIntoView to avoid window-level displacement.
 * 6. Dynamic Viewport handling (100dvh + visualViewport API cleanup).
 * 7. Dark-Theme-Only isolation regardless of global theme preference.
 * 8. Heisenberg green-black color palette compliance across all chat surfaces.
 * 9. Mobile responsive header constraints (text truncation, shrink-0 on Leave/Timer).
 * 10. Developer Freeze/Resume control preservation and authorized containment.
 * 11. Modal dark-theme enforcement via forceDark portal support.
 * 12. No site footer or navigation bar intrusion in ChatPage.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('TALK TO RITIANS - Production Chat Page UI Fix Suite', () => {
  const chatPageContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/ChatPage.tsx'), 'utf8');
  const appContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/App.tsx'), 'utf8');
  const modalContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/Modal.tsx'), 'utf8');

  // ==========================================================================
  // 1. Root Container & Viewport Locking
  // ==========================================================================
  describe('1. Root Container & Viewport Locking', () => {
    test('root container is fixed, viewport-locked, and uses 100dvh', () => {
      assert.ok(chatPageContent.includes('id="chat-page-root"'), 'Root must have id="chat-page-root"');
      assert.ok(chatPageContent.includes('fixed inset-0'), 'Root must use fixed inset-0 to prevent window scrolling');
      assert.ok(chatPageContent.includes('h-[100dvh]'), 'Root must have h-[100dvh]');
      assert.ok(chatPageContent.includes('max-h-[100dvh]'), 'Root must have max-h-[100dvh]');
      assert.ok(chatPageContent.includes('overflow-hidden'), 'Root must be overflow-hidden');
    });

    test('ChatPage is standalone without AppLayout or global site footer', () => {
      // In App.tsx, ChatPage must be rendered directly without AppLayout
      assert.ok(appContent.includes('<Route path="/chat/:roomId" element={<ChatPage />} />'));
      assert.equal(
        chatPageContent.includes('<footer'),
        false,
        'ChatPage must not render any footer element'
      );
    });

    test('document body and html are scroll-locked when ChatPage is active', () => {
      assert.ok(chatPageContent.includes("document.body.style.overflow = 'hidden'"));
      assert.ok(chatPageContent.includes("document.documentElement.style.overflow = 'hidden'"));
      assert.ok(chatPageContent.includes("document.body.style.overscrollBehavior = 'none'"));
      assert.ok(chatPageContent.includes("window.scrollTo(0, 0)"));
    });

    test('tracks visualViewport for mobile virtual keyboards and cleans up listeners', () => {
      assert.ok(chatPageContent.includes('window.visualViewport'));
      assert.ok(chatPageContent.includes("vv.addEventListener('resize'"));
      assert.ok(chatPageContent.includes("vv.removeEventListener('resize'"));
    });
  });

  // ==========================================================================
  // 2. Fixed Top Header
  // ==========================================================================
  describe('2. Fixed Top Header', () => {
    test('header is outside the scrollable messages container and has shrink-0', () => {
      assert.ok(chatPageContent.includes('id="chat-header"'));
      const headerIdx = chatPageContent.indexOf('id="chat-header"');
      const messagesIdx = chatPageContent.indexOf('id="chat-messages-container"');
      assert.ok(headerIdx < messagesIdx, 'Header must be declared before scroll container');
      assert.ok(chatPageContent.includes('shrink-0 z-20'), 'Header must have shrink-0 and elevated z-index');
    });

    test('header renders avatar, username, online presence, timer, and Leave button', () => {
      assert.ok(chatPageContent.includes('id="chat-peer-username"'));
      assert.ok(chatPageContent.includes('id="chat-header-timer"'));
      assert.ok(chatPageContent.includes('id="chat-leave-header-btn"'));
      assert.ok(chatPageContent.includes('Online'));
      assert.ok(chatPageContent.includes('Leave'));
    });

    test('header username has truncate constraint to prevent Leave button clipping on 360px', () => {
      assert.ok(chatPageContent.includes('truncate max-w-[120px]'));
      assert.ok(chatPageContent.includes('min-w-0 flex-1'));
    });

    test('developer Freeze/Resume controls are preserved in fixed header', () => {
      assert.ok(chatPageContent.includes('id="developer-freeze-timer-btn"'));
      assert.ok(chatPageContent.includes('id="developer-resume-timer-btn"'));
      assert.ok(chatPageContent.includes('handleFreezeTimer'));
      assert.ok(chatPageContent.includes('handleResumeTimer'));
      assert.ok(chatPageContent.includes('isDeveloper'));
    });
  });

  // ==========================================================================
  // 3. Middle Messages Scroll Area
  // ==========================================================================
  describe('3. Middle Messages Scroll Area', () => {
    test('messages container is the ONLY scrollable element in chat', () => {
      assert.ok(chatPageContent.includes('id="chat-messages-container"'));
      assert.ok(chatPageContent.includes('flex-1 min-h-0 overflow-y-auto overscroll-y-contain'));
      assert.ok(chatPageContent.includes("WebkitOverflowScrolling: 'touch'"));
    });

    test('eliminates element.scrollIntoView to protect window scroll offset', () => {
      assert.equal(
        chatPageContent.includes('.scrollIntoView('),
        false,
        'ChatPage must not call .scrollIntoView() which causes outer window scrolling'
      );
      assert.ok(chatPageContent.includes('el.scrollTo({ top: el.scrollHeight'));
    });

    test('supports near-bottom auto-scroll and floating "New messages" pill when scrolled up', () => {
      assert.ok(chatPageContent.includes('isNearBottomRef'));
      assert.ok(chatPageContent.includes('showNewMessages'));
      assert.ok(chatPageContent.includes('New messages'));
    });

    test('renders centered empty state when no messages exist', () => {
      assert.ok(chatPageContent.includes("You're connected with a fellow RITian!"));
    });
  });

  // ==========================================================================
  // 4. Fixed Bottom Composer
  // ==========================================================================
  describe('4. Fixed Bottom Composer', () => {
    test('composer is rendered after message area with shrink-0', () => {
      assert.ok(chatPageContent.includes('id="chat-composer-container"'));
      const messagesIdx = chatPageContent.indexOf('id="chat-messages-container"');
      const composerIdx = chatPageContent.indexOf('id="chat-composer-container"');
      assert.ok(composerIdx > messagesIdx, 'Composer must be rendered after scroll container');
      assert.ok(chatPageContent.includes('shrink-0 z-20 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))]'));
    });

    test('composer retains Skip button, message input, and Send button', () => {
      assert.ok(chatPageContent.includes('id="chat-skip-btn"'));
      assert.ok(chatPageContent.includes('id="chat-message-input"'));
      assert.ok(chatPageContent.includes('id="chat-send-btn"'));
      assert.ok(chatPageContent.includes('handleSkip'));
      assert.ok(chatPageContent.includes('handleSendMessage'));
    });

    test('input resets window scroll on focus to prevent iOS Safari displacement', () => {
      assert.ok(chatPageContent.includes('onFocus={() => {'));
      assert.ok(chatPageContent.includes('window.scrollTo(0, 0)'));
    });
  });

  // ==========================================================================
  // 5. Dark Theme Only Requirement & Heisenberg Palette
  // ==========================================================================
  describe('5. Dark Theme Only Isolation & Heisenberg Palette', () => {
    test('chat page root is strictly styled with dark class and #050805 background', () => {
      assert.ok(chatPageContent.includes('bg-[#050805] text-[#F4F6F1] dark'));
    });

    test('header and composer use #091009 background with Heisenberg border', () => {
      assert.ok(chatPageContent.includes("bg-[#091009]/95"));
      assert.ok(chatPageContent.includes("border-[rgba(155,185,115,0.16)]"));
    });

    test('outgoing bubbles use #2A3C1C and incoming bubbles use #142016', () => {
      assert.ok(chatPageContent.includes('bg-[#2A3C1C] text-[#F4F6F1]'));
      assert.ok(chatPageContent.includes('bg-[#142016] text-[#F4F6F1]'));
    });

    test('modal component supports forceDark for theme-isolated modals', () => {
      assert.ok(modalContent.includes('forceDark?: boolean'));
      assert.ok(modalContent.includes("forceDark ? 'dark' : ''"));
      assert.ok(chatPageContent.includes('<Modal\n        forceDark'));
    });
  });
});
