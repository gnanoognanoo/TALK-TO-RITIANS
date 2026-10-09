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
import { Avatar, Modal } from './index';
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
      <div className="text-center space-y-4 pt-1 pb-1">
        {/* Top Countdown Badge */}
        <div className="flex items-center justify-between text-xs font-semibold px-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#121E12] text-[#A2BD63] border border-[rgba(141,168,82,0.2)]">
            <MessageSquare className="h-3.5 w-3.5 text-[#8DA852]" />
            <span>Chat Request</span>
          </div>

          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/40 text-amber-300 border border-amber-500/30">
            <Clock className="h-3.5 w-3.5 text-amber-400 animate-spin" />
            <span>{secondsRemaining}s</span>
          </div>
        </div>

        {/* Center Requester Avatar Snapshot */}
        <div className="flex flex-col items-center justify-center space-y-3 py-1">
          <Avatar
            size="xl"
            avatarConfig={request.requester.avatarConfig}
            initials={initials}
            shape="circle"
          />

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-[#F4F6F1] tracking-tight">
              {request.requester.anonymousUsername} wants to chat
            </h3>
            <p className="text-xs text-[#9DA89A]">
              7-minute anonymous conversation
            </p>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="px-3.5 py-2 rounded-xl bg-[#091009]/80 border border-[rgba(141,168,82,0.15)] text-left flex items-center gap-2 text-[11px] text-[#9DA89A]">
          <Shield className="h-3.5 w-3.5 text-[#8DA852] shrink-0" />
          <span>Real identity &amp; credentials remain permanently sealed.</span>
        </div>

        {actionError && (
          <p className="text-xs text-rose-400 font-medium">
            {actionError}
          </p>
        )}

        {/* Action Buttons: [Reject] [Accept] */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleReject}
            className="py-3 px-4 rounded-full text-sm font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#0E170E] border border-[rgba(141,168,82,0.2)] hover:border-rose-500/40 hover:text-rose-300 hover:bg-rose-950/20 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <X className="h-4 w-4" />
            <span>{isRejecting ? 'Rejecting...' : 'Reject'}</span>
          </button>

          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleAccept}
            className="liquid-cta-btn py-3 px-4 rounded-full text-sm font-bold text-white shadow-[0_4px_16px_rgba(141,168,82,0.35)] active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Check className="h-4 w-4" />
            <span>{isAccepting ? 'Connecting...' : 'Accept'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default IncomingChatRequestModal;
