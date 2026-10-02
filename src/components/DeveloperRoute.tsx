/**
 * ============================================================================
 * TALK TO RITIANS - Developer & Admin Route Guard
 * ============================================================================
 * Strictly protects /developer routes from ordinary students.
 * Enforces server-verified isStaff session check.
 */

import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context';
import { Spinner } from './Spinner';
import { IncomingChatRequestManager } from './IncomingChatRequestManager';

export interface DeveloperRouteProps {
  children?: React.ReactNode;
}

export const DeveloperRoute: React.FC<DeveloperRouteProps> = ({ children }) => {
  const { user, session, isStaff, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 px-4">
        <Spinner size="lg" variant="brand" label="Verifying staff authorization..." />
        <p className="text-xs text-slate-400 font-medium">Authenticating platform staff session...</p>
      </div>
    );
  }

  // If unauthenticated, redirect to login
  if (!user || !session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If not developer or admin, redirect to home
  if (!isStaff) {
    return <Navigate to="/home" replace />;
  }

  return (
    <>
      <IncomingChatRequestManager />
      {children ? <>{children}</> : <Outlet />}
    </>
  );
};

export default DeveloperRoute;
