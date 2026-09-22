import { Outlet, Link, useLocation } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { Logo } from '../components/Logo';

export interface AuthLayoutProps {
  children?: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 flex flex-col relative overflow-hidden selection:bg-brand-600 selection:text-white">
      {/* Auth Navigation Bar */}
      <header className="relative z-10 px-4 sm:px-8 py-5 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg p-1"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Landing</span>
        </Link>

        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Verified Student Gateway</span>
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6">
        <div className="w-full max-w-md">
          {/* Brand header */}
          <div className="text-center mb-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center mb-3"
              aria-label="Talk to RITians Home"
            >
              <Logo size="lg" showText={false} />
            </Link>
            {!isLoginPage && (
              <>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
                  Talk to RITians
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  Rajalakshmi Institute of Technology Student Community
                </p>
              </>
            )}
          </div>

          {/* Child Outlet */}
          {children || <Outlet />}
        </div>
      </main>

      {/* Micro Footer */}
      <footer className="relative z-10 py-5 text-center text-xs text-gray-400">
        100% Anonymous &bull; Zero Identity Segregation &bull; Protected by RLS
      </footer>
    </div>
  );
};

export default AuthLayout;
