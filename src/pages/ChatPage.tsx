import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send,
  UserX,
  FastForward,
  ShieldCheck,
  Flag,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { Button, Input, Modal, Badge, Avatar, EmptyState } from '../components';

interface MockMessage {
  id: string;
  sender: 'me' | 'peer';
  content: string;
  timestamp: string;
}

export const ChatPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<MockMessage[]>([
    {
      id: '1',
      sender: 'peer',
      content: 'Hey there! Connected from 3rd block CSE.',
      timestamp: 'Just now',
    },
    {
      id: '2',
      sender: 'me',
      content: 'Hey! Nice to meet you. Day scholar or hosteller?',
      timestamp: 'Just now',
    },
    {
      id: '3',
      sender: 'peer',
      content: 'Hosteller! Just chilling after afternoon classes.',
      timestamp: 'Just now',
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMsg: MockMessage = {
      id: Date.now().toString(),
      sender: 'me',
      content: inputMessage.trim(),
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');

    // Optional simulated peer response for realism
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'peer',
          content: 'Cool! Got any tips for upcoming semester internals?',
          timestamp: 'Just now',
        },
      ]);
    }, 1500);
  };

  const confirmSkip = () => {
    setIsSkipModalOpen(false);
    navigate('/matching');
  };

  const confirmLeave = () => {
    setIsLeaveModalOpen(false);
    navigate('/home');
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto w-full border-x border-slate-800/80 bg-slate-950">
      {/* Active Room Header */}
      <header className="px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/70 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar size="md" initials="CO" presence="online" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base text-white truncate">
                CleverOtter_77
              </h1>
              <Badge variant="success" size="sm" withDot>
                Verified
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Room #{roomId || 'rit-chat'} &bull; 100% Anonymous
            </p>
          </div>
        </div>

        {/* Action Controls: Skip & Leave */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsSkipModalOpen(true)}
            leftIcon={<FastForward className="h-4 w-4 text-brand-400" />}
          >
            <span className="hidden xs:inline">Skip</span>
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsLeaveModalOpen(true)}
            leftIcon={<UserX className="h-4 w-4" />}
          >
            <span className="hidden xs:inline">Leave</span>
          </Button>
        </div>
      </header>

      {/* Campus Trust Banner */}
      <div className="px-4 py-1.5 bg-brand-950/40 border-b border-brand-900/30 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 text-brand-300">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>Anonymous 1-to-1 conversation &bull; Messages not linked to identity</span>
        </span>
        <button
          type="button"
          onClick={() => alert('Report feature will be connected in safety phase.')}
          className="hover:text-rose-400 flex items-center gap-1 transition-colors"
        >
          <Flag className="h-3 w-3" />
          <span className="hidden sm:inline">Report</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
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
            const isMe = msg.sender === 'me';
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {!isMe && <Avatar size="sm" initials="CO" />}

                <div
                  className={`
                    max-w-[80%] sm:max-w-md rounded-2xl p-3.5 text-sm shadow-md transition-all
                    ${
                      isMe
                        ? 'bg-brand-600 text-white rounded-br-none shadow-brand-600/20'
                        : 'bg-slate-900 text-slate-100 rounded-bl-none border border-slate-800/80 shadow-black/20'
                    }
                  `.trim()}
                >
                  <p className="leading-relaxed break-words">{msg.content}</p>
                  <span
                    className={`block text-[10px] mt-1 text-right ${
                      isMe ? 'text-brand-200' : 'text-slate-500'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {isMe && <Avatar size="sm" initials="ME" />}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer Bar */}
      <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Input
            id="chat-input"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message anonymously..."
            className="flex-1"
            aria-label="Type message"
            autoComplete="off"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={!inputMessage.trim()}
            aria-label="Send message"
            rightIcon={<Send className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </div>

      {/* Skip Confirmation Modal */}
      <Modal
        isOpen={isSkipModalOpen}
        onClose={() => setIsSkipModalOpen(false)}
        title="Skip to Next Student?"
        description="Are you sure you want to end this conversation and find a new peer?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsSkipModalOpen(false)}>
              Keep Chatting
            </Button>
            <Button variant="primary" size="sm" onClick={confirmSkip}>
              Find Next RITian
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-400 leading-relaxed">
          The current conversation will end for both participants. You will immediately re-enter the matchmaking queue.
        </p>
      </Modal>

      {/* Leave Confirmation Modal */}
      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Leave Chat Room?"
        description="This will permanently disconnect you from this session."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsLeaveModalOpen(false)}>
              Stay in Chat
            </Button>
            <Button variant="danger" size="sm" onClick={confirmLeave}>
              Exit to Dashboard
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <p className="leading-relaxed">
            Exiting will disconnect the room. You can match again anytime from your student dashboard.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ChatPage;
