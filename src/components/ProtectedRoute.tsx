/**
 * ============================================================================
 * TALK TO RITIANS - Protected Route Guard
 * ============================================================================
 * Blocks unauthenticated access to protected campus pages (/verify, /profile/setup,
 * /username, /avatar, /home, /matching, /chat/:roomId) and redirects to /login.
 */

import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context';
import { Spinner } from './Spinner';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 px-4">
        <Spinner size="lg" variant="brand" label="Verifying campus session..." />
        <p className="text-xs text-slate-400 font-medium">Authenticating student session...</p>
      </div>
    );
  }

  if (!user || !session) {
    // Redirect unauthenticated student to login, preserving intended route
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
