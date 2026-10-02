/**
 * ============================================================================
 * TALK TO RITIANS - Incoming Chat Request Modal (Phase 3 Fix)
 * ============================================================================
 * Realtime popup displayed to an online idle student when another student searches.
 *
 * PRIVACY INVARIANTS:
 * - Shows exclusively the requester's EFFECTIVE ANONYMOUS PERSONA (alias + avatar).
 * - Zero institutional details (no name, dept, batch, gender, roll no, email).
 * - Automatically dismisses after 20-second TTL expires.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, Check, X, Shield } from 'lucide-react';
import { Button, Avatar, Modal } from './index';
import { IncomingChatRequest, chatRequestService } from '../services/chatRequestService';

export interface IncomingChatRequestModalProps {
  request: IncomingChatRequest | null;
  onDismiss: () => void;
}

export const IncomingChatRequestModal: React.FC<IncomingChatRequestModalProps> = ({
  request,
  onDismiss,
}) => {
  const navigate = useNavigate();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (!request) return 20;
    const diff = Math.floor((new Date(request.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sync remaining seconds when request changes
  useEffect(() => {
    if (!request) return;

    const diff = Math.floor((new Date(request.expiresAt).getTime() - Date.now()) / 1000);
    setSecondsRemaining(Math.max(0, diff));
    setActionError(null);

    const timer = setInterval(() => {
      const currentDiff = Math.floor((new Date(request.expiresAt).getTime() - Date.now()) / 1000);
      if (currentDiff <= 0) {
        clearInterval(timer);
        onDismiss();
      } else {
        setSecondsRemaining(currentDiff);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [request, onDismiss]);

  if (!request) return null;

  const handleAccept = async () => {
    setIsAccepting(true);
    setActionError(null);

    const res = await chatRequestService.acceptChatRequest(request.requestId);
    setIsAccepting(false);

    if (!res.success || !res.data) {
      setActionError(res.error?.message || 'Unable to join conversation.');
      setTimeout(() => onDismiss(), 1800);
      return;
    }

    onDismiss();
    navigate(`/chat/${res.data.roomId}`, {
      state: {
        peer: res.data.peer,
        expiresAt: res.data.expiresAt,
      },
    });
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await chatRequestService.rejectChatRequest(request.requestId);
    } catch (err) {
      console.warn('[IncomingChatRequestModal] Reject error:', err);
    } finally {
      setIsRejecting(false);
      onDismiss();
    }
  };

  const initials = request.requester.anonymousUsername
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Modal
      isOpen={Boolean(request)}
      onClose={handleReject}
      title=""
      maxWidth="sm"
    >
      <div className="text-center space-y-5 pt-1 pb-2">
        {/* Top Status & Live Countdown Badge */}
        <div className="flex items-center justify-between text-xs font-semibold px-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
            <MessageSquare className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            <span>Incoming Chat Request</span>
          </div>

          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="h-3.5 w-3.5 text-amber-600 animate-spin" />
            <span>{secondsRemaining}s</span>
          </div>
        </div>

        {/* Center Requester Avatar Snapshot */}
        <div className="flex flex-col items-center justify-center space-y-3 py-2">
          <Avatar
            size="xl"
            avatarConfig={request.requester.avatarConfig}
            initials={initials}
            shape="circle"
          />

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {request.requester.anonymousUsername} wants to chat
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs mx-auto">
              Start a 7-minute anonymous conversation?
            </p>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-left flex items-center gap-2 text-[11px] text-gray-600 dark:text-slate-300">
          <Shield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>Real identity &amp; credentials remain permanently sealed.</span>
        </div>

        {actionError && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {actionError}
          </p>
        )}

        {/* Action Buttons: [Reject] [Accept] */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={isAccepting || isRejecting}
            isLoading={isRejecting}
            onClick={handleReject}
            leftIcon={<X className="h-4 w-4" />}
            className="py-2.5 font-semibold text-gray-700 dark:text-slate-200"
          >
            Reject
          </Button>

          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isAccepting || isRejecting}
            isLoading={isAccepting}
            loadingText="Connecting..."
            onClick={handleAccept}
            leftIcon={<Check className="h-4 w-4" />}
            className="py-2.5 font-bold shadow-md"
          >
            Accept
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default IncomingChatRequestModal;
