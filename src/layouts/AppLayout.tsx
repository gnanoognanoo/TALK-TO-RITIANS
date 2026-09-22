import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ShieldCheck } from 'lucide-react';

export interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 flex flex-col selection:bg-brand-600 selection:text-white">
      {/* Global Navigation */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col" id="main-content">
        {children || <Outlet />}
      </main>

      {/* Campus Community Footer */}
      <footer className="border-t border-gray-200 bg-white py-8 px-4 sm:px-6 lg:px-8 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-600">
            <span className="font-semibold text-gray-900">Talk to RITians</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1 text-emerald-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified Anonymous Campus Network
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/" className="text-gray-500 hover:text-gray-900 transition-colors">
              Home
            </Link>
            <Link to="/verify" className="text-gray-500 hover:text-gray-900 transition-colors">
              ID Verification
            </Link>
            <Link to="/home" className="text-gray-500 hover:text-gray-900 transition-colors">
              Student Dashboard
            </Link>
            <Link to="/login" className="text-gray-500 hover:text-gray-900 transition-colors">
              Sign In
            </Link>
          </div>

          <p className="text-gray-400 text-[11px] text-center md:text-right">
            Zero identity leakage &bull; Built for Rajalakshmi Institute of Technology students
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;
