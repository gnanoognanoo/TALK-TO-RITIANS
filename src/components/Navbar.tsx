import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogIn, Settings } from 'lucide-react';
import { Logo } from './Logo';
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
  const { user } = useAuth();

  // Navigation Links for public / unauthenticated visitors only
  const unauthLinks = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/#about' },
    { name: 'Features', path: '/#features' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200/90 dark:border-[rgba(130,160,100,0.14)] bg-white/95 dark:bg-[#080D09]/95 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left Region: Brand Logo & Primary Persistent Settings Control */}
        <div className="flex items-center gap-3">
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

          {/* Primary Persistent Control: Settings icon in top-left/header region */}
          {user && (
            <Link
              to="/settings"
              aria-label="Settings"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-95 ${
                isActive('/settings')
                  ? 'bg-brand-50 dark:bg-[#101A12] text-brand-600 dark:text-[#A8C96A] border border-brand-200 dark:border-[rgba(140,170,110,0.3)]'
                  : 'text-gray-700 dark:text-[#F2F5F2] hover:text-brand-600 dark:hover:text-[#A8C96A] bg-gray-100/80 dark:bg-[#101A12]/80 hover:bg-brand-50 dark:hover:bg-[#101A12] border border-gray-200 dark:border-[rgba(120,160,100,0.2)]'
              }`}
            >
              <Settings className="h-3.5 w-3.5 text-gray-500 dark:text-[#AEB9AE]" />
              <span>Settings</span>
            </Link>
          )}
        </div>

        {/* Public Desktop Nav Links (Only for unauthenticated visitors) */}
        {!user && (
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Public Navigation">
            {unauthLinks.map((link) => (
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
        )}

        {/* Action / Auth controls (Unauthenticated Only) */}
        {!user && (
          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/login"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl text-gray-700 dark:text-slate-200 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
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

        {/* Public Mobile menu trigger */}
        {!user && (
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white"
            >
              Get Started
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        )}
      </div>

      {/* Public Mobile Drawer */}
      {!user && mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-3 pb-5 space-y-2 animate-in slide-in-from-top-2 shadow-lg">
          {unauthLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`
                block px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${
                  isActive(link.path)
                    ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'
                }
              `.trim()}
            >
              {link.name}
            </Link>
          ))}

          <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm shadow-sm"
            >
              <LogIn className="h-4 w-4" />
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
