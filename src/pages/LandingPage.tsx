import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Card, Badge } from '../components';
import { useAuth } from '../context';

export const LandingPage: React.FC = () => {
  const { user, session, getRedirectPath } = useAuth();
  const navigate = useNavigate();

  // Redirect to onboarding or home when returning from OAuth with tokens/code
  useEffect(() => {
    if (user && session) {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const search = typeof window !== 'undefined' ? window.location.search : '';
      if (hash.includes('access_token') || search.includes('code=')) {
        navigate(getRedirectPath(), { replace: true });
      }
    }
  }, [user, session, getRedirectPath, navigate]);

  return (
    <div className="flex-1 flex flex-col bg-transparent">
      {/* =========================================================================
          HERO SECTION (Mobile-First Neomorphic + Liquid UI)
          ========================================================================= */}
      <section className="relative overflow-hidden pt-8 pb-12 sm:pt-12 sm:pb-16 md:pt-16 md:pb-20 lg:pt-20 lg:pb-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Hero Content */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Small Brand Indicator */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50/80 border border-brand-200/60 text-brand-700 dark:bg-[#121E12]/80 dark:border-[rgba(141,168,82,0.22)] dark:text-[#A2BD63] text-xs font-semibold shadow-sm dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-[#8DA852] shrink-0" />
              <span>Exclusively for Rajalakshmi Institute of Technology</span>
            </div>

            {/* Hero Typography */}
            <div className="space-y-2">
              <h1 className="tracking-tight text-left">
                <span className="block text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-[#F4F6F1] leading-[1.1]">
                  Talk to RITians
                </span>
                <span className="block text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-[#F4F6F1] mt-2 sm:mt-3 leading-tight">
                  Cooked by{' '}
                  <span className="font-signature font-bold text-5xl sm:text-6xl lg:text-7xl text-[#6D42E8] dark:text-[#A2BD63] [text-shadow:0_0_20px_rgba(109,66,232,0.2)] dark:[text-shadow:0_0_20px_rgba(162,189,99,0.25)] inline-block align-baseline ml-1">
                    Heisenberg
                  </span>
                </span>
              </h1>
            </div>

            {/* Mobile-only Atmospheric Emblem (Sophisticated & Compact Branding) */}
            <div className="flex lg:hidden items-center gap-4 py-1">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center p-2 rounded-2xl bg-white border border-slate-200 shadow-sm dark:bg-[#0E170E]/80 dark:border-[rgba(141,168,82,0.2)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.4)]">
                <picture className="w-full h-full flex items-center justify-center">
                  <source srcSet="/heisenberg-emblem.webp" type="image/webp" />
                  <img
                    src="/heisenberg-emblem.png"
                    alt="Heisenberg"
                    aria-hidden="true"
                    className="max-w-full max-h-full object-contain filter drop-shadow-[0_0_8px_rgba(109,66,232,0.15)] dark:drop-shadow-[0_0_8px_rgba(141,168,82,0.2)]"
                  />
                </picture>
              </div>
              <div className="text-left">
                <span className="font-mono text-xs text-brand-600 dark:text-[#8DA852] tracking-wider block">C₁₀H₁₅N • 149.24</span>
                <span className="text-xs text-slate-600 dark:text-[#9DA89A]">Campus Identity Isolation</span>
              </div>
            </div>

            <p className="text-base sm:text-lg text-slate-600 dark:text-[#9DA89A] font-normal leading-relaxed max-w-xl">
              A safe space for RITians to meet, talk and connect anonymously.
            </p>

            {/* Single Primary Action + Subtle Secondary Link */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <Link to="/login" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="liquid-cta-btn w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full text-base font-semibold text-white transition-all active:scale-95 shadow-md"
                >
                  <span>Enter Talk to RITians</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>

              <a
                href="#how-it-works"
                className="text-xs sm:text-sm text-slate-600 hover:text-slate-900 dark:text-[#9DA89A] dark:hover:text-[#F4F6F1] font-medium transition-colors text-center sm:text-left py-1"
              >
                Learn More ↓
              </a>
            </div>

            {/* Subtle Mini Liquid Pills (Authentic Community Signals) */}
            <div className="pt-2 flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-semibold">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-[#101A12]/80 dark:border-[rgba(141,168,82,0.18)] dark:text-[#9DA89A]">
                <Users className="h-3.5 w-3.5 text-brand-600 dark:text-[#8DA852]" />
                <span>RIT Community</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-[#101A12]/80 dark:border-[rgba(141,168,82,0.18)] dark:text-[#9DA89A]">
                <MessageSquare className="h-3.5 w-3.5 text-brand-600 dark:text-[#8DA852]" />
                <span>Anonymous Chats</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-[#101A12]/80 dark:border-[rgba(141,168,82,0.18)] dark:text-[#9DA89A]">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-600 dark:text-[#8DA852]" />
                <span>Built for Students</span>
              </div>
            </div>
          </div>

          {/* Right Column: Desktop Heisenberg Creator Visual */}
          <div
            className="hidden lg:flex lg:col-span-5 flex-col items-center justify-center relative select-none pointer-events-none"
            aria-hidden="true"
          >
            {/* Atmospheric Glow */}
            <div
              className="absolute -inset-10 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(141, 168, 82, 0.14) 0%, rgba(141, 168, 82, 0.03) 55%, transparent 70%)',
              }}
            />

            {/* Chemical Formula Accent */}
            <div className="absolute top-2 right-4 text-right opacity-25 select-none pointer-events-none">
              <span className="font-serif text-2xl text-brand-600 dark:text-[#A2BD63] tracking-tight block">
                C<sub>10</sub>H<sub>15</sub>N
              </span>
              <span className="font-mono text-xs text-brand-500 dark:text-[#8DA852] tracking-widest block">
                149.24
              </span>
            </div>

            {/* Elevated Liquid Card for Emblem */}
            <div className="relative z-10 p-8 rounded-[32px] bg-white/80 border border-gray-200 shadow-xl dark:bg-[#0E170E]/70 dark:border-[rgba(141,168,82,0.22)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md">
              <picture className="w-full flex justify-center">
                <source srcSet="/heisenberg-emblem.webp" type="image/webp" />
                <img
                  src="/heisenberg-emblem.png"
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  decoding="async"
                  className="w-[240px] xl:w-[280px] h-auto object-contain filter drop-shadow-[0_0_24px_rgba(109,66,232,0.15)] dark:drop-shadow-[0_0_24px_rgba(141,168,82,0.2)]"
                />
              </picture>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          BUILT FOR A SAFER COMMUNITY (Liquid Surfaces)
          ========================================================================= */}
      <section id="features" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-y border-slate-200 bg-slate-50/70 dark:border-[rgba(141,168,82,0.12)] dark:bg-[#091009]/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <Badge variant="brand" size="sm">
              Campus Security
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1] tracking-tight">
              Built for a Safer Community
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9DA89A] max-w-md mx-auto">
              Engineered exclusively for RIT students with complete identity isolation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            {[
              { text: 'Verified RIT students only', desc: 'No bots or random internet strangers' },
              { text: 'College ID QR verification', desc: 'One-time scan validates authentic student enrollment' },
              { text: 'Anonymous chat identity', desc: 'Only your custom alias and modular avatar are visible' },
              { text: 'No personal details shown', desc: 'Roll number, department, and name stay cryptographically sealed' },
              { text: 'Content monitoring & safety', desc: 'Realtime safeguards keep conversations respectful' },
              { text: 'Data encrypted with Supabase', desc: 'Industry-standard encryption with strict Row-Level Security' },
              { text: 'One campus identity per account', desc: 'Prevents harassment and ensures campus accountability' },
              { text: 'Option to disconnect at any time', desc: 'Instant skip or leave whenever you wish' },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm dark:border-[rgba(141,168,82,0.16)] dark:bg-[#0D160E]/80 dark:hover:bg-[#121E12]/90 dark:hover:border-[rgba(141,168,82,0.3)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.04),0_4px_16px_rgba(0,0,0,0.3)] transition-all"
              >
                <CheckCircle2 className="h-5 w-5 text-brand-600 dark:text-[#8DA852] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F4F6F1]">{item.text}</h3>
                  <p className="text-xs text-slate-600 dark:text-[#9DA89A] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          HOW IT WORKS SECTION (Neomorphic Step Cards)
          ========================================================================= */}
      <section id="how-it-works" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full space-y-10">
        <div className="text-center space-y-2">
          <Badge variant="neutral" size="sm">
            Simple 3-Step Process
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1] tracking-tight">
            How It Works
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9DA89A]">
            Start talking with fellow RITians in less than 2 minutes
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="p-6 space-y-3">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 dark:bg-[#121E12] dark:text-[#A2BD63] dark:border-[rgba(141,168,82,0.25)] flex items-center justify-center text-sm font-bold shadow-sm dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
              1
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F6F1]">Sign In with Email</h3>
            <p className="text-xs text-slate-600 dark:text-[#9DA89A] leading-relaxed">
              Use your personal email address. Your identity remains private and isolated.
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 dark:bg-[#121E12] dark:text-[#A2BD63] dark:border-[rgba(141,168,82,0.25)] flex items-center justify-center text-sm font-bold shadow-sm dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
              2
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F6F1]">Scan Student ID Card</h3>
            <p className="text-xs text-slate-600 dark:text-[#9DA89A] leading-relaxed">
              Scan the QR code on the back of your physical card to link your campus status.
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 dark:bg-[#121E12] dark:text-[#A2BD63] dark:border-[rgba(141,168,82,0.25)] flex items-center justify-center text-sm font-bold shadow-sm dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
              3
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F6F1]">Create Persona &amp; Chat</h3>
            <p className="text-xs text-slate-600 dark:text-[#9DA89A] leading-relaxed">
              Choose an anonymous handle, build your avatar, and meet new students anytime.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;

