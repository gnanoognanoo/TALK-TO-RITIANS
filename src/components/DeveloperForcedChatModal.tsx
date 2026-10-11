import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, LogOut, ArrowRight, Zap } from 'lucide-react';
import { Modal, Button } from './index';
import { supabase } from '../lib/supabase';

export interface DeveloperForcedChatModalProps {
  roomId: string;
  onDismiss: () => void;
}

export const DeveloperForcedChatModal: React.FC<DeveloperForcedChatModalProps> = ({
  roomId,
  onDismiss,
}) => {
  const navigate = useNavigate();
  const [isLeaving, setIsLeaving] = useState<boolean>(false);

  const handleOpenChat = () => {
    onDismiss();
    navigate(`/chat/${roomId}`);
  };

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      await supabase.rpc('force_leave_active_room');
    } catch (err) {
      console.warn('[DeveloperForcedChatModal] Leave error:', err);
    } finally {
      setIsLeaving(false);
      onDismiss();
    }
  };

  return (
    <Modal
      isOpen={Boolean(roomId)}
      onClose={handleLeave}
      title="Developer-Initiated Chat"
      maxWidth="sm"
    >
      <div className="text-center space-y-4 pt-1 pb-1">
        {/* Top Badge */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Developer-Initiated Chat</span>
          </div>
        </div>

        {/* Center Requester Avatar Snapshot */}
        <div className="flex flex-col items-center justify-center space-y-3 py-1">
          <div className="h-16 w-16 rounded-full bg-slate-900 border-2 border-amber-500/40 flex items-center justify-center text-white text-xl font-bold shadow-lg">
            H
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-[#F4F6F1] tracking-tight">
              A Developer-initiated chat has started.
            </h3>
            <p className="text-xs text-gray-500 dark:text-[#9DA89A]">
              Heisenberg has initiated a direct chat session with your account.
            </p>
          </div>
        </div>

        {/* Privacy & Transparency Note */}
        <div className="px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-[#091009]/80 border border-gray-200 dark:border-[rgba(141,168,82,0.15)] text-left flex items-start gap-2.5 text-xs text-gray-600 dark:text-[#9DA89A]">
          <Shield className="h-4 w-4 text-brand-600 dark:text-[#8DA852] shrink-0 mt-0.5" />
          <span>
            This session was initiated via privileged Developer action. You can open the room or leave immediately.
          </span>
        </div>

        {/* Action Buttons: [Leave] [Open Chat] */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isLeaving}
            isLoading={isLeaving}
            onClick={handleLeave}
            className="min-h-[44px] text-xs font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/20"
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            Leave
          </Button>

          <Button
            type="button"
            variant="primary"
            disabled={isLeaving}
            onClick={handleOpenChat}
            className="min-h-[44px] text-xs font-bold"
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Open Chat
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeveloperForcedChatModal;
