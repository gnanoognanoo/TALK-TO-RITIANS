import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ShieldCheck } from 'lucide-react';

export interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* Global Navigation */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col" id="main-content">
        {children || <Outlet />}
      </main>

      {/* Campus Community Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 backdrop-blur py-8 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-semibold text-slate-300">Talk to RITians</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified Anonymous Campus Network
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-slate-300 transition-colors">
              Home
            </Link>
            <Link to="/verify" className="hover:text-slate-300 transition-colors">
              ID Verification
            </Link>
            <Link to="/home" className="hover:text-slate-300 transition-colors">
              Student Dashboard
            </Link>
            <Link to="/login" className="hover:text-slate-300 transition-colors">
              Sign In
            </Link>
          </div>

          <p className="text-slate-500 text-[11px] text-center md:text-right">
            Zero identity leakage &bull; Built for Rajalakshmi Institute of Technology students
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;
