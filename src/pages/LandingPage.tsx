import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Button, Card, Badge } from '../components';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC]">
      {/* =========================================================================
          HERO SECTION (Matching Reference Phase 1)
          ========================================================================= */}
      <section className="pt-10 pb-16 md:pt-16 md:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Headline, Subheading, CTAs, Badges */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-brand-600" />
              <span>Exclusively for Rajalakshmi Institute of Technology</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.12]">
              Real Students.<br />
              Real Conversations.<br />
              <span className="text-brand-600">Stay Anonymous.</span>
            </h1>

            <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed max-w-xl">
              A safe space for RITians to meet, talk, and connect anonymously.
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Link to="/login?mode=signup" className="w-full sm:w-auto">
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
            <div className="pt-4 flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-semibold">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-sm">
                <Users className="h-4 w-4 text-brand-600" />
                <span>RIT Community</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-sm">
                <MessageSquare className="h-4 w-4 text-brand-600" />
                <span>Anonymous Chats</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-sm">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Built for Students</span>
              </div>
            </div>
          </div>

          {/* Right Column: Clean Campus Visual in Soft Rounded Container */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl overflow-hidden border border-gray-200/90 shadow-card bg-white p-2">
              <img
                src="/campus.jpg"
                alt="Rajalakshmi Institute of Technology Campus"
                className="w-full h-auto aspect-[4/3] object-cover rounded-xl"
              />
              <div className="p-3 text-center bg-white">
                <p className="text-xs font-semibold text-gray-800">
                  Rajalakshmi Institute of Technology
                </p>
                <p className="text-[11px] text-gray-500">
                  Verified anonymous connection for all departments
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          BUILT FOR A SAFER COMMUNITY (Matching Reference Phase 13)
          ========================================================================= */}
      <section id="features" className="py-14 px-4 sm:px-6 lg:px-8 bg-white border-y border-gray-200/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <Badge variant="brand" size="sm">
              Campus Security
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Built for a Safer Community
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
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
                className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200/80 bg-gray-50/50 hover:bg-white hover:shadow-sm transition-all"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{item.text}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
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
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            How It Works
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Start talking with fellow RITians in less than 2 minutes
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="p-6 space-y-3 border-gray-200 shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center text-sm font-bold">
              1
            </div>
            <h3 className="text-base font-bold text-gray-900">Sign In with Email</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Use your personal email address. Your identity remains private and isolated.
            </p>
          </Card>

          <Card className="p-6 space-y-3 border-gray-200 shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center text-sm font-bold">
              2
            </div>
            <h3 className="text-base font-bold text-gray-900">Scan Student ID Card</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Scan the QR code on the back of your physical card to link your campus status.
            </p>
          </Card>

          <Card className="p-6 space-y-3 border-gray-200 shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center text-sm font-bold">
              3
            </div>
            <h3 className="text-base font-bold text-gray-900">Create Persona &amp; Chat</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Choose an anonymous handle, build your avatar, and meet new students anytime.
            </p>
          </Card>
        </div>

        <div className="text-center pt-2">
          <Link to="/login?mode=signup">
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
