import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { MessageSquare, ShieldCheck, ArrowLeft } from 'lucide-react';

export interface AuthLayoutProps {
  children?: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden selection:bg-brand-500 selection:text-white">
      {/* Background Decorative Glows */}
      <div
        className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-brand-600/15 blur-[120px] rounded-full pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[300px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none"
        aria-hidden="true"
      />

      {/* Auth Navigation Bar */}
      <header className="relative z-10 px-4 sm:px-8 py-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg p-1"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Landing</span>
        </Link>

        <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Verified Student Gateway</span>
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-md">
          {/* Brand header */}
          <div className="text-center mb-8">
            <Link
              to="/"
              className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-700 via-brand-600 to-indigo-500 shadow-xl shadow-brand-600/30 text-white mb-4 hover:scale-105 transition-transform"
              aria-label="Talk to RITians Home"
            >
              <MessageSquare className="h-6 w-6" />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Talk to RITians
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Rajalakshmi Institute of Technology Student Community
            </p>
          </div>

          {/* Child Outlet */}
          {children || <Outlet />}
        </div>
      </main>

      {/* Micro Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-slate-600">
        100% Anonymous &bull; Zero Identity Segregation &bull; Protected by RLS
      </footer>
    </div>
  );
};

export default AuthLayout;
