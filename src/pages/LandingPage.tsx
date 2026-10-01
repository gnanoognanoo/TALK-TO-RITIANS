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
import { Button, Card, Badge } from '../components';
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
    <div className="flex-1 flex flex-col bg-[#F8FAFC] dark:bg-transparent">
      {/* =========================================================================
          HERO SECTION (Matching Reference Phase 1)
          ========================================================================= */}
      {/* =========================================================================
          HERO SECTION (Matching Reference Phase 1)
          ========================================================================= */}
      <section className="relative overflow-hidden pt-10 pb-14 md:pt-16 md:pb-20 lg:pt-18 lg:pb-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left Column: Hero Text, CTAs & Community Badges */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-[#101A12] border border-brand-100 dark:border-[rgba(120,160,100,0.22)] text-brand-700 dark:text-[#A8C96A] text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-[#8FAF56]" />
              <span>Exclusively for Rajalakshmi Institute of Technology</span>
            </div>

            <h1 className="tracking-tight text-left">
              <span className="block text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-[#F2F5F2] leading-[1.1]">
                Talk to RITians
              </span>
              <span className="block text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-[#F2F5F2] mt-2 sm:mt-3 leading-tight">
                Cooked by{' '}
                <span className="font-signature font-bold text-5xl sm:text-6xl lg:text-7xl text-brand-600 dark:text-[#9CB65F] dark:[text-shadow:0_0_18px_rgba(140,170,80,0.12)] inline-block align-baseline ml-1">
                  Heisenberg
                </span>
              </span>
            </h1>

            <p className="text-base sm:text-lg text-gray-600 dark:text-[#AEB9AE] font-normal leading-relaxed max-w-xl">
              A safe space for RITians to meet, talk, and connect anonymously.
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Link to="/login" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  className="px-6 py-3 font-semibold shadow-sm"
                >
                  Get Started
                </Button>
              </Link>

              <a href="#how-it-works" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="px-6 py-3 font-semibold"
                >
                  Learn More
                </Button>
              </a>
            </div>

            {/* Below Headline Trust Badges (Non-numeric, Authentic) */}
            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-semibold">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0D150F]/90 border border-gray-200 dark:border-[rgba(120,160,100,0.16)] text-gray-700 dark:text-[#AEB9AE] shadow-sm">
                <Users className="h-4 w-4 text-brand-600 dark:text-[#8FAF56]" />
                <span>RIT Community</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0D150F]/90 border border-gray-200 dark:border-[rgba(120,160,100,0.16)] text-gray-700 dark:text-[#AEB9AE] shadow-sm">
                <MessageSquare className="h-4 w-4 text-brand-600 dark:text-[#8FAF56]" />
                <span>Anonymous Chats</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0D150F]/90 border border-gray-200 dark:border-[rgba(120,160,100,0.16)] text-gray-700 dark:text-[#AEB9AE] shadow-sm">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-[#7FAE61]" />
                <span>Built for Students</span>
              </div>
            </div>
          </div>

          {/* Right Column: Decorative Heisenberg Creator Emblem (Floats naturally, dark-mode atmospheric visual) */}
          <div
            className="hidden dark:flex lg:col-span-5 flex-col items-center justify-center relative select-none pointer-events-none mt-8 lg:mt-0"
            aria-hidden="true"
          >
            {/* Soft Atmospheric Green Glow */}
            <div
              className="absolute -inset-8 sm:-inset-12 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(130, 160, 70, 0.12) 0%, rgba(130, 160, 70, 0.03) 50%, transparent 70%)',
              }}
            />

            {/* Optional Subtle Chemistry Notation Offset Outside Face Symbol */}
            <div className="absolute top-0 right-2 sm:right-6 text-right opacity-[0.06] select-none pointer-events-none">
              <span className="font-serif text-2xl sm:text-3xl text-[#9CB65F] tracking-tight block">
                C<sub>10</sub>H<sub>15</sub>N
              </span>
              <span className="font-mono text-[10px] sm:text-xs text-[#A8C96A] tracking-widest block">
                149.24
              </span>
            </div>

            {/* Floating Heisenberg Emblem Asset */}
            <picture className="relative z-10 w-full flex justify-center">
              <source srcSet="/heisenberg-emblem.webp" type="image/webp" />
              <img
                src="/heisenberg-emblem.png"
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="async"
                className="w-[180px] sm:w-[210px] md:w-[260px] lg:w-[290px] xl:w-[350px] 2xl:w-[390px] h-auto object-contain filter drop-shadow-[0_0_30px_rgba(140,170,80,0.12)]"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* =========================================================================
          BUILT FOR A SAFER COMMUNITY (Matching Reference Phase 13)
          ========================================================================= */}
      <section id="features" className="py-14 px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#080D09]/80 border-y border-gray-200/80 dark:border-[rgba(120,160,100,0.12)]">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <Badge variant="brand" size="sm">
              Campus Security
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#F2F5F2] tracking-tight">
              Built for a Safer Community
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-[#758275] max-w-md mx-auto">
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
                className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200/80 dark:border-[rgba(120,160,100,0.16)] bg-gray-50/50 dark:bg-[#0D150F]/70 hover:bg-white dark:hover:bg-[#101A12] hover:shadow-sm transition-all"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-[#7FAE61] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-[#F2F5F2]">{item.text}</h3>
                  <p className="text-xs text-gray-500 dark:text-[#AEB9AE] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          HOW IT WORKS SECTION
          ========================================================================= */}
      <section id="how-it-works" className="py-14 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full space-y-10">
        <div className="text-center space-y-2">
          <Badge variant="neutral" size="sm">
            Simple 3-Step Process
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#F2F5F2] tracking-tight">
            How It Works
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-[#758275]">
            Start talking with fellow RITians in less than 2 minutes
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="p-6 space-y-3 border-gray-200 dark:border-[rgba(120,160,100,0.16)] shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-brand-50 dark:bg-[#101A12] text-brand-600 dark:text-[#8FAF56] border border-brand-100 dark:border-[rgba(120,160,100,0.22)] flex items-center justify-center text-sm font-bold">
              1
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-[#F2F5F2]">Sign In with Email</h3>
            <p className="text-xs text-gray-500 dark:text-[#AEB9AE] leading-relaxed">
              Use your personal email address. Your identity remains private and isolated.
            </p>
          </Card>

          <Card className="p-6 space-y-3 border-gray-200 dark:border-[rgba(120,160,100,0.16)] shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-brand-50 dark:bg-[#101A12] text-brand-600 dark:text-[#8FAF56] border border-brand-100 dark:border-[rgba(120,160,100,0.22)] flex items-center justify-center text-sm font-bold">
              2
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-[#F2F5F2]">Scan Student ID Card</h3>
            <p className="text-xs text-gray-500 dark:text-[#AEB9AE] leading-relaxed">
              Scan the QR code on the back of your physical card to link your campus status.
            </p>
          </Card>

          <Card className="p-6 space-y-3 border-gray-200 dark:border-[rgba(120,160,100,0.16)] shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-brand-50 dark:bg-[#101A12] text-brand-600 dark:text-[#8FAF56] border border-brand-100 dark:border-[rgba(120,160,100,0.22)] flex items-center justify-center text-sm font-bold">
              3
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-[#F2F5F2]">Create Persona &amp; Chat</h3>
            <p className="text-xs text-gray-500 dark:text-[#AEB9AE] leading-relaxed">
              Choose an anonymous handle, build your avatar, and meet new students anytime.
            </p>
          </Card>
        </div>

        <div className="text-center pt-2">
          <Link to="/login">
            <Button variant="primary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Get Started Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
