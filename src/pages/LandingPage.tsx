import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  QrCode,
  Users,
  ArrowRight,
  Zap,
  Sparkles,
  Lock,
  Compass,
} from 'lucide-react';
import { Button, Card, Badge, Avatar } from '../components';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6 lg:px-8 border-b border-slate-900">
        {/* Subtle radial ambient glows */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-brand-600/15 blur-[140px] rounded-full pointer-events-none"
          aria-hidden="true"
        />

        <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold shadow-inner">
            <Sparkles className="h-3.5 w-3.5 text-brand-400" />
            <span>Exclusively for Rajalakshmi Institute of Technology</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
            Talk anonymously with <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-brand-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              other RITians.
            </span>
          </h1>

          <p className="text-slate-300 sm:text-lg max-w-2xl mx-auto font-normal leading-relaxed">
            Connect with fellow campus students, discuss coursework, share honest thoughts, or
            make new campus friends without the fear of judgment. 100% anonymous, safe, and
            strictly verified.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                rightIcon={<ArrowRight className="h-5 w-5" />}
                className="shadow-xl shadow-brand-600/30"
              >
                Get Started
              </Button>
            </Link>

            <Link to="/verify" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                leftIcon={<QrCode className="h-5 w-5 text-emerald-400" />}
              >
                Verify College ID
              </Button>
            </Link>
          </div>

          {/* Micro trust indicators */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Zero Identity Leakage</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-400" />
              <span>1 Account per Student ID</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Instant 1-to-1 Pairing</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Preview / Interactive Teaser Section */}
      <section className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-slate-950/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              A modern campus lounge in your pocket
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
              Designed specifically for college life. Clean, fast, and respectful.
            </p>
          </div>

          <Card variant="interactive" className="p-6 sm:p-8 border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <Avatar size="md" initials="CF" presence="online" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">CuriousFalcon</span>
                    <Badge variant="brand" size="sm">
                      Peer
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">Connected in anonymous room #842</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="success" size="sm" withDot>
                  Campus ID Verified
                </Badge>
              </div>
            </div>

            {/* Mock chat stream */}
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="flex items-start gap-3">
                <Avatar size="sm" initials="CF" />
                <div className="bg-slate-800/80 rounded-2xl rounded-tl-none p-3.5 max-w-md text-slate-200 border border-slate-700/50">
                  <p>Hey! Anyone in 3rd year CSE know if the lab internal timetable got postponed?</p>
                </div>
              </div>

              <div className="flex items-start gap-3 justify-end">
                <div className="bg-brand-600 rounded-2xl rounded-tr-none p-3.5 max-w-md text-white shadow-md shadow-brand-600/20">
                  <p>Yeah, HOD just posted the circular on notice board. It begins next Monday!</p>
                </div>
                <Avatar size="sm" initials="YOU" />
              </div>

              <div className="flex items-start gap-3">
                <Avatar size="sm" initials="CF" />
                <div className="bg-slate-800/80 rounded-2xl rounded-tl-none p-3.5 max-w-md text-slate-200 border border-slate-700/50">
                  <p>Awesome, thank you so much! Life saver 🙌</p>
                </div>
              </div>
            </div>

            {/* Mock chat footer bar */}
            <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Press Skip to pair with another RITian anytime.</span>
              <Link to="/home" className="text-brand-400 hover:text-brand-300 font-semibold">
                Try Demo Match &rarr;
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* Feature Pillar Grid */}
      <section className="py-12 md:py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-900">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <Badge variant="neutral" size="sm">
              Core Principles
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Why RITians Love This Platform
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
              Engineered from scratch to solve the harassment, spam, and privacy issues of legacy stranger chat tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 space-y-4">
              <div className="h-11 w-11 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white">Campus-Exclusive Peers</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                No random internet strangers or bots. Every participant is a fellow student holding a valid physical college ID card.
              </p>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white">Zero Identity Leakage</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your real name, roll number, email, and department are cryptographically segregated in private tables via Row-Level Security.
              </p>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="h-11 w-11 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                <Compass className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white">Fast & Frictionless</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                One-tap random pairing. If the conversation dries up, hit Skip and instantly meet another peer from the queue.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-slate-900/30 border-t border-slate-900">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">How It Works</h2>
            <p className="text-xs sm:text-sm text-slate-400">Three easy steps to start chatting</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="h-8 w-8 rounded-full bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center text-xs font-bold">
                1
              </div>
              <h3 className="text-sm font-bold text-white">Sign In with Email</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter your personal email address to receive an instant magic link login.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="h-8 w-8 rounded-full bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center text-xs font-bold">
                2
              </div>
              <h3 className="text-sm font-bold text-white">Scan Physical ID Card</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scan your student card QR code once. A unique hash prevents duplicate accounts while protecting identity.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="h-8 w-8 rounded-full bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center text-xs font-bold">
                3
              </div>
              <h3 className="text-sm font-bold text-white">Create Persona & Chat</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose a fun anonymous handle, select an avatar preset, and start chatting with other RITians immediately.
              </p>
            </div>
          </div>

          <div className="text-center pt-4">
            <Link to="/login">
              <Button variant="primary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Get Started Now
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
