import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Settings, Terminal, ArrowRight } from 'lucide-react';
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
  const { user, isStaff } = useAuth();

  // Navigation Links for public / unauthenticated visitors only
  const unauthLinks = [
    { name: 'About', path: '/#about' },
    { name: 'Features', path: '/#features' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)] bg-white/95 dark:bg-[#050805]/90 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
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
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {user ? (
            <>
              {/* Privileged Staff Control: Developer Console (Authorized Staff Only) */}
              {isStaff && (
                <Link
                  to="/developer"
                  aria-label="Developer Console"
                  title="Developer Console"
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95 ${
                    location.pathname.startsWith('/developer')
                      ? 'bg-amber-100 border border-amber-400 text-amber-900 shadow-sm dark:bg-amber-950/70 dark:border-amber-500/70 dark:text-amber-300 dark:shadow-[0_0_12px_rgba(227,163,41,0.25)]'
                      : 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-500/30 dark:text-amber-400 dark:hover:border-amber-500/60 dark:hover:bg-amber-950/50'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="hidden xs:inline">Console</span>
                </Link>
              )}

              {/* Primary Persistent Control: Settings */}
              <Link
                to="/settings"
                aria-label="Settings"
                title="Settings"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
                  isActive('/settings')
                    ? 'bg-brand-50 text-brand-700 border border-brand-300 font-semibold shadow-sm dark:bg-[#182918] dark:text-[#A2BD63] dark:border-[#8DA852]/50 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(141,168,82,0.15)]'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-[#0E170E]/80 dark:text-[#C0CCBC] dark:hover:text-[#F4F6F1] dark:border-[rgba(150,175,120,0.24)] dark:hover:bg-[#132213]'
                }`}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">Settings</span>
              </Link>
            </>
          ) : (
            <>
              {/* Public Links (Desktop) */}
              <nav className="hidden md:flex items-center gap-1 mr-2" aria-label="Public Navigation">
                {unauthLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-[#C0CCBC] dark:hover:text-[#F4F6F1] dark:hover:bg-[#121E12]/60 transition-colors"
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>

              {/* Single Sleek CTA to enter */}
              <Link
                to="/login"
                className="liquid-cta-btn inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 sm:px-4 py-1.5 rounded-full text-white transition-all active:scale-95"
              >
                <span>Enter</span>
                <ArrowRight className="h-3 w-3" />
              </Link>

              {/* Mobile menu button for extra links */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle navigation menu"
                className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-[#C0CCBC] dark:hover:text-[#F4F6F1] dark:hover:bg-[#121E12] rounded-full transition-colors"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Public Mobile Drawer */}
      {!user && mobileMenuOpen && (
        <div className="md:hidden border-t border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)] bg-white/95 dark:bg-[#091009]/95 backdrop-blur-xl px-4 pt-3 pb-4 space-y-2 animate-in slide-in-from-top-2 shadow-2xl">
          {unauthLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-[#C0CCBC] dark:hover:text-[#F4F6F1] dark:hover:bg-[#121E12] transition-colors"
            >
              {link.name}
            </Link>
          ))}
          <div className="pt-2 border-t border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)]">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="liquid-cta-btn flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-white font-medium text-sm"
            >
              <span>Enter Talk to RITians</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;

