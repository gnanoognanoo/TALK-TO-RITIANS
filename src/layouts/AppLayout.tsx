import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ShieldCheck } from 'lucide-react';
import { HeisenbergSignature } from '../components/HeisenbergSignature';

export interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-gray-900 dark:text-slate-100 flex flex-col selection:bg-brand-600 selection:text-white">
      {/* Global Navigation */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col" id="main-content">
        {children || <Outlet />}
      </main>

      {/* Campus Community Footer */}
      <footer className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8 text-xs text-gray-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
            <span className="font-semibold text-gray-900 dark:text-white">Talk to RITians</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Anonymous Campus Network
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/" className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              Home
            </Link>
            <Link to="/home" className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              Chat
            </Link>
            <Link to="/settings" className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              Settings
            </Link>
          </div>

          <div className="flex flex-col items-center md:items-end gap-1.5">
            <p className="text-gray-400 dark:text-slate-500 text-[11px] text-center md:text-right">
              Zero identity leakage &bull; Built for Rajalakshmi Institute of Technology students
            </p>
            <HeisenbergSignature variant="footer" />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;
