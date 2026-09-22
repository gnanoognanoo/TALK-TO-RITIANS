import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
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

  // Navigation Links based on authentication status
  const unauthLinks = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/#about' },
    { name: 'Features', path: '/#features' },
  ];

  const authLinks = [
    { name: 'Home', path: '/home' },
    { name: 'Find Chat', path: '/matching' },
    { name: 'Profile', path: '/profile/setup' },
    { name: 'Settings', path: '/avatar' },
  ];

  const currentLinks = user ? authLinks : unauthLinks;
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200/90 bg-white/95 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          to={user ? '/home' : '/'}
          className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl"
          aria-label="Talk to RITians Home"
        >
          <Logo size="md" />
          {import.meta.env.DEV && (
            <span className="hidden xl:inline-block ml-1">
              <Badge variant={isSupabaseConfigured ? 'success' : 'warning'} size="sm" withDot>
                {isSupabaseConfigured ? 'SUPABASE' : 'MOCK'}
              </Badge>
            </span>
          )}
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1.5" aria-label="Main Navigation">
          {currentLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`
                px-3.5 py-1.5 rounded-lg text-sm transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                ${
                  isActive(link.path)
                    ? 'text-brand-600 bg-brand-50 font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-medium'
                }
              `.trim()}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Action / Auth controls */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/avatar"
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-gray-100/80 transition-colors text-xs"
              >
                <Avatar
                  size="xs"
                  avatarConfig={profile?.avatar_config as any}
                  initials={profile?.display_username?.slice(0, 2) || 'ST'}
                  presence="online"
                  shape="circle"
                />
                <span className="font-semibold text-gray-800">
                  {profile?.display_username || 'Student'}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Logout"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-gray-600 hover:text-rose-600 border border-gray-200 hover:border-rose-200 transition-all active:scale-95"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="text-xs font-semibold px-3.5 py-2 rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Login
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span>Get Started</span>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 md:hidden">
          {user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 border border-gray-200"
            >
              Logout
            </button>
          ) : (
            <Link
              to="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white"
            >
              Get Started
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 pt-3 pb-5 space-y-2 animate-in slide-in-from-top-2 shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg mb-2 border border-emerald-200">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Verified Student Campus Network</span>
          </div>

          {currentLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`
                block px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${
                  isActive(link.path)
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `.trim()}
            >
              {link.name}
            </Link>
          ))}

          <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
            {user ? (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                  <Avatar
                    size="sm"
                    avatarConfig={profile?.avatar_config as any}
                    initials={profile?.display_username?.slice(0, 2) || 'ST'}
                    presence="online"
                    shape="circle"
                  />
                  <span className="font-semibold text-gray-800 truncate">
                    {profile?.display_username || 'Student'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut();
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-medium text-sm transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm shadow-sm"
                >
                  <LogIn className="h-4 w-4" />
                  Get Started
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
