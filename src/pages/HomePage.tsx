import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  User,
  Settings,
  LogOut,
  ArrowRight,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, Avatar } from '../components';
import { useAuth } from '../context';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const displayUsername = profile?.display_username || 'RITian';
  const initials = displayUsername
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('[HomePage] Sign out error:', err);
    } finally {
      navigate('/login');
    }
  };

  const navItems = [
    { label: 'Home', href: '/home', icon: Home, active: true },
    { label: 'Find a Chat', href: '/matching', icon: MessageSquare, active: false },
    { label: 'Profile', href: '/profile/setup', icon: User, active: false },
    { label: 'Settings', href: '/avatar', icon: Settings, active: false },
  ];

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* =========================================================================
            DESKTOP SIDEBAR (4 of 12 columns on lg)
            Clean, white, minimal navigation card
            ========================================================================= */}
        <aside className="lg:col-span-3">
          <Card className="p-4 sm:p-5 flex flex-col justify-between min-h-[380px] bg-white border-gray-200 shadow-card">
            <div className="space-y-6">
              {/* User Mini Profile summary */}
              <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <Avatar
                  size="md"
                  avatarConfig={profile?.avatar_config as any}
                  initials={initials}
                  presence="online"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-gray-900 truncate">
                      {displayUsername}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Campus Verified</span>
                  </div>
                </div>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1.5" aria-label="Dashboard Sidebar">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      to={item.href}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        item.active
                          ? 'bg-[#F5F3FF] text-[#6C4CF5] font-semibold'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          item.active ? 'text-[#6C4CF5]' : 'text-gray-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Logout at bottom */}
            <div className="pt-4 border-t border-gray-100 mt-6">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
              >
                <LogOut className="h-4 w-4 text-red-500" />
                <span>Logout</span>
              </button>
            </div>
          </Card>
        </aside>

        {/* =========================================================================
            MAIN AREA (9 of 12 columns on lg)
            Simple greeting, Start Chatting, and clean campus card.
            Zero fake analytics, zero charts, zero neon.
            ========================================================================= */}
        <main className="lg:col-span-9 space-y-6">
          {/* Main Welcome Hero Card */}
          <Card className="p-6 sm:p-10 bg-white border-gray-200 shadow-card">
            <div className="max-w-xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F5F3FF] text-[#6C4CF5] text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                <span>RIT Anonymous Network</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Welcome, {displayUsername} 👋
              </h1>

              <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed">
                Ready to meet a new RITian? Connect 1-on-1 with a fellow student from campus. Completely anonymous and private.
              </p>

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => navigate('/matching')}
                  rightIcon={<ArrowRight className="h-5 w-5" />}
                  className="font-bold px-8 shadow-md"
                >
                  Start Chatting
                </Button>
              </div>
            </div>
          </Card>

          {/* Campus-Themed Feature Card (as shown in reference image "V1 Live") */}
          <Card className="overflow-hidden bg-white border-gray-200 shadow-card">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-0 items-center">
              <div className="p-6 sm:p-8 md:col-span-7 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Verified Campus Community</span>
                </div>
                <blockquote className="text-lg sm:text-xl font-bold text-gray-900 leading-snug">
                  &ldquo;Different departments. Same campus. Infinite conversations.&rdquo;
                </blockquote>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                  Every student you meet is a verified member of Rajalakshmi Institute of Technology. Personal identity and contact details are permanently sealed.
                </p>
                <div className="pt-2 flex items-center gap-4 text-xs font-medium text-gray-500">
                  <Link to="/avatar" className="text-[#6C4CF5] hover:underline font-semibold">
                    Customize Avatar &rarr;
                  </Link>
                  <span>&bull;</span>
                  <Link to="/profile/setup" className="text-gray-600 hover:text-gray-900">
                    Cohort Details &rarr;
                  </Link>
                </div>
              </div>

              <div className="md:col-span-5 h-48 sm:h-56 md:h-full min-h-[180px] relative overflow-hidden bg-gray-100">
                <img
                  src="/campus.jpg"
                  alt="RIT Campus Grounds"
                  className="w-full h-full object-cover object-center"
                />
              </div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default HomePage;
