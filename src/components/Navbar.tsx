import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Shield, Menu, X, LogIn, LogOut } from 'lucide-react';
import { Badge } from './Badge';
import { Avatar } from './Avatar';
import { useAuth } from '../context';
import { isSupabaseConfigured } from '../lib/supabase';

export interface NavbarProps {
  isAuthenticated?: boolean;
  username?: string;
}

export const Navbar: React.FC<NavbarProps> = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, profile, signOut } = useAuth();

  const navLinks = [
    { name: 'Home', path: '/home' },
    { name: 'Matchmaking', path: '/matching' },
    ...(profile?.profile_completed
      ? [{ name: 'Avatar', path: '/avatar' }]
      : [{ name: 'Onboarding', path: '/profile/setup' }]),
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          to="/"
          className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl"
          aria-label="Talk to RITians Home"
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-700 via-brand-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-brand-600/30 group-hover:scale-105 transition-transform">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg tracking-tight text-white group-hover:text-brand-300 transition-colors">
                Talk to RITians
              </span>
              <span className="hidden sm:inline-block">
                <Badge variant="brand" size="sm" withDot>
                  Campus
                </Badge>
              </span>
              {import.meta.env.DEV && (
                <span className="hidden lg:inline-flex items-center gap-1">
                  <Badge variant={isSupabaseConfigured ? 'success' : 'warning'} size="sm" withDot>
                    {isSupabaseConfigured ? 'BACKEND: SUPABASE LIVE' : 'MOCK DEV'}
                  </Badge>
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 font-medium hidden xs:block">
              Anonymous Student Community
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`
                px-3.5 py-2 rounded-xl text-xs font-semibold transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                ${
                  isActive(link.path)
                    ? 'bg-brand-600/15 text-brand-300 border border-brand-500/25'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }
              `.trim()}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Action / Auth controls */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">100% Zero-Leakage</span>
          </div>

          {user ? (
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <Avatar
                  size="xs"
                  avatarConfig={profile?.avatar_config as any}
                  initials={profile?.display_username?.slice(0, 2) || 'ST'}
                  shape="circle"
                />
                <span className="font-semibold text-slate-200">
                  {profile?.display_username || 'Student'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/40 transition-all active:scale-95"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/20 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 md:hidden">
          {user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700"
            >
              Sign Out
            </button>
          ) : (
            <Link
              to="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white"
            >
              Sign In
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950/95 px-4 pt-3 pb-5 space-y-2 backdrop-blur-2xl animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg mb-2">
            <Shield className="h-4 w-4 shrink-0" />
            <span>Verified student network &bull; Zero identity leakage</span>
          </div>

          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`
                block px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${
                  isActive(link.path)
                    ? 'bg-brand-600/20 text-brand-300 font-semibold'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }
              `.trim()}
            >
              {link.name}
            </Link>
          ))}

          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
            {user ? (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                  <Avatar
                    size="sm"
                    avatarConfig={profile?.avatar_config as any}
                    initials={profile?.display_username?.slice(0, 2) || 'ST'}
                    shape="circle"
                  />
                  <span className="font-semibold text-slate-200 truncate">
                    {profile?.display_username || 'Student'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut();
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 font-medium text-sm transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-slate-800 text-slate-200 font-medium text-sm"
                >
                  <Shield className="h-4 w-4 text-emerald-400" />
                  Verify College ID
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
