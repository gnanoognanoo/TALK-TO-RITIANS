/**
 * ============================================================================
 * TALK TO RITIANS - Central Home Screen (Primary App Screen)
 * ============================================================================
 * Central hub for authenticated students:
 * 1. Current anonymous persona display (avatar + username)
 * 2. Verification status (Verified Badge vs subtle Verification Pending banner)
 * 3. Primary "Start Chat" CTA entering random 1-on-1 7-minute matchmaking
 * 4. Settings management link
 */

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { Button, Card, Avatar } from '../components';
import { useAuth } from '../context';
import { getEffectivePersona } from '../utils/persona';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isStaff, staffRole } = useAuth();

  const effectivePersona = getEffectivePersona(profile, isStaff);
  const isVerified = effectivePersona.isVerified;
  const displayUsername = effectivePersona.displayUsername;
  const initials = effectivePersona.initials;

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-6 animate-in fade-in">
      {/* =========================================================================
          VERIFICATION STATUS NOTICE (Subtle, Non-blocking)
          ========================================================================= */}
      {isStaff ? (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong className="font-bold uppercase tracking-wider">{staffRole || 'Developer'} Mode</strong> &bull; Custom persona active &bull; College ID verification bypassed
            </span>
          </div>
          <Link
            to="/developer"
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Developer Console</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : !isVerified ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Verification Pending
                </span>
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-200 leading-relaxed max-w-xl">
                Link your RIT ID to get verified and unlock custom avatar and anonymous username customization. You can still chat right now!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/verify')}
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
              className="border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 text-xs font-semibold"
            >
              Verify RIT ID
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              <strong className="font-semibold">✓ RIT Student Verified</strong> &bull; Anonymous persona active
            </span>
          </div>
          <Link
            to="/settings"
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Settings</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* =========================================================================
          MAIN HERO CARD: Start Chat CTA & Anonymous Identity Status
          ========================================================================= */}
      <Card className="p-6 sm:p-10 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-8 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-xs font-semibold border border-brand-100 dark:border-brand-900/40">
              <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              <span>RIT Anonymous Network</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
              Welcome, {displayUsername} 👋
            </h1>

            <p className="text-base text-gray-600 dark:text-slate-300 font-normal leading-relaxed max-w-xl">
              Ready to meet a new RITian? Connect 1-on-1 with a fellow student from campus for a 7-minute anonymous conversation.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/matching')}
                rightIcon={<ArrowRight className="h-5 w-5" />}
                className="font-bold px-8 py-3.5 shadow-md text-base"
              >
                Start Chat
              </Button>

              <Link to="/settings" className="sm:inline-block">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto font-medium" leftIcon={<Settings className="h-4 w-4" />}>
                  Settings
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Persona Snapshot */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-6 rounded-2xl bg-gray-50/80 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700 text-center space-y-3">
            <Avatar
              size="xl"
              avatarConfig={effectivePersona.avatarConfig}
              initials={initials}
              presence="online"
              shape="circle"
            />
            <div className="space-y-0.5">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                {displayUsername}
              </h4>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                {isVerified ? '✓ Verified Student' : 'Default Anonymous Persona'}
              </p>
            </div>

            <Link
              to="/settings"
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline pt-1 inline-flex items-center gap-1"
            >
              <span>{isVerified ? 'Customize Persona' : 'Verify to Unlock'}</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </Card>

      {/* =========================================================================
          CAMPUS FEATURE CARD
          ========================================================================= */}
      <Card className="overflow-hidden bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-0 items-center">
          <div className="p-6 sm:p-8 md:col-span-7 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Campus Community</span>
            </div>
            <blockquote className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-snug">
              &ldquo;Different departments. Same campus. Infinite conversations.&rdquo;
            </blockquote>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              Every conversation runs with a server-authoritative 7-minute timer. Personal identity and contact details are permanently sealed.
            </p>
            <div className="pt-2 flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-slate-400">
              <Link to="/settings" className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">
                Manage Profile &amp; Settings &rarr;
              </Link>
            </div>
          </div>

          <div className="md:col-span-5 h-52 sm:h-60 md:h-full min-h-[200px] relative overflow-hidden bg-black">
            <img
              src="/heisenberg.jpg"
              alt="Heisenberg"
              className="w-full h-full object-cover object-[center_42%]"
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default HomePage;
