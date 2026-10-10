/**
 * ============================================================================
 * TALK TO RITIANS - Central Home Screen (Primary App Screen)
 * ============================================================================
 * Simplified, mobile-first chat-launch interface:
 * 1. Compact status pill (Developer Mode / Verification Status)
 * 2. Greeting & Persona Card (Avatar + Anonymous Handle + Verified RITian / Developer Persona)
 * 3. Primary Hero Action: [ 💬 Start Anonymous Chat → ]
 * 4. Minimal secondary action for Settings
 */

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Settings,
  MessageSquare,
  Shield,
} from 'lucide-react';
import { Card, Avatar } from '../components';
import { useAuth } from '../context';
import { getEffectivePersona } from '../utils/persona';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isStaff } = useAuth();

  const effectivePersona = getEffectivePersona(profile, isStaff);
  const isVerified = effectivePersona.isVerified;
  const displayUsername = effectivePersona.displayUsername;
  const initials = effectivePersona.initials;

  const personaLabel = isStaff
    ? 'Developer Persona'
    : isVerified
    ? 'Verified RITian'
    : 'Unverified persona';

  return (
    <div className="max-w-xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-5 animate-in fade-in">
      {/* =========================================================================
          STATUS PILL (Developer Mode or Verification State)
          ========================================================================= */}
      {isStaff ? (
        <div className="flex justify-center">
          <Link
            to="/developer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-semibold shadow-[0_2px_10px_rgba(227,163,41,0.15)] hover:bg-amber-950/60 active:scale-95 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>⚡ Developer Access Active</span>
            <span className="text-amber-400/60">•</span>
            <span className="text-[11px] text-amber-200/90 underline font-normal">Console</span>
            <ArrowRight className="h-3 w-3 text-amber-400" />
          </Link>
        </div>
      ) : !isVerified ? (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-950/25 border border-amber-500/30 flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-amber-300 block truncate">Verification Pending</span>
              <span className="text-[11px] text-[#9DA89A] block truncate">Link your physical RIT ID to customize</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/verify')}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 active:scale-95 transition-all"
          >
            Verify ID
          </button>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#101A12]/80 border border-[rgba(141,168,82,0.22)] text-[#A2BD63] text-xs font-medium shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#8DA852] shrink-0" />
            <span>Verified RIT Student &bull; Cryptographically Isolated</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          GREETING & PERSONA CARD (Who am I?)
          ========================================================================= */}
      <Card className="p-6 sm:p-7 space-y-6 text-center">
        {/* Welcome Text */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F4F6F1] tracking-tight">
            Welcome, {displayUsername} 👋
          </h1>
          <p className="text-xs sm:text-sm text-[#9DA89A] max-w-sm mx-auto">
            Ready for a 7-minute anonymous conversation with a fellow RITian?
          </p>
        </div>

        {/* Compact Liquid Persona Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#091009]/70 border border-[rgba(141,168,82,0.18)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.3)] flex flex-col items-center gap-3">
          <Avatar
            size="xl"
            avatarConfig={effectivePersona.avatarConfig}
            initials={initials}
            presence="online"
            shape="circle"
          />

          <div className="space-y-0.5">
            <h2 className="font-bold text-base text-[#F4F6F1] tracking-tight">
              {displayUsername}
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#121E12] border border-[rgba(141,168,82,0.2)] text-[11px] font-medium text-[#A2BD63]">
              <Shield className="h-3 w-3 text-[#8DA852]" />
              <span>{personaLabel}</span>
            </div>
          </div>

          <Link
            to="/settings"
            className="text-xs text-[#8DA852] hover:text-[#A2BD63] hover:underline font-semibold inline-flex items-center gap-1 pt-0.5"
          >
            <span>{isStaff ? 'Edit Developer Persona' : isVerified ? 'Customize Persona' : 'Verify to Unlock Persona'}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* =========================================================================
            PRIMARY ACTION: START CHAT
            ========================================================================= */}
        <div className="pt-1 space-y-3">
          <button
            type="button"
            onClick={() => navigate('/matching')}
            className="liquid-cta-btn w-full flex items-center justify-center gap-3 py-4 px-6 rounded-full text-base sm:text-lg font-bold text-white shadow-[0_4px_24px_rgba(141,168,82,0.4)] transition-all active:scale-[0.98]"
          >
            <MessageSquare className="h-5 w-5 shrink-0" />
            <span>Start Anonymous Chat</span>
            <ArrowRight className="h-5 w-5 shrink-0" />
          </button>

          {/* Quick secondary action */}
          <div className="flex items-center justify-center gap-4 text-xs text-[#9DA89A]">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 hover:text-[#F4F6F1] transition-colors py-1 px-3 rounded-full hover:bg-[#121E12]"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Settings &amp; Preferences</span>
            </Link>
          </div>
        </div>
      </Card>

      {/* =========================================================================
          CAMPUS ATMOSPHERE NOTE (Subtle, Minimal)
          ========================================================================= */}
      <div className="p-4 rounded-2xl bg-[#091009]/50 border border-[rgba(141,168,82,0.12)] text-center text-xs text-[#9DA89A] space-y-1">
        <p className="font-medium text-[#F4F6F1]">
          &ldquo;Different departments. Same campus. Infinite conversations.&rdquo;
        </p>
        <p className="text-[11px] text-[#6F796D]">
          7-minute server-authoritative timer &bull; Cryptographic identity isolation
        </p>
      </div>
    </div>
  );
};

export default HomePage;

