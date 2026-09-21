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
import { getPostLoginRedirect } from '../services/authService';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, session, profile, loading } = useAuth();
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

  const path = location.pathname;
  const isCampusRoute = path === '/home' || path.startsWith('/matching') || path.startsWith('/chat');

  // STEP 8: Unfinished users must be routed back into onboarding.
  if (isCampusRoute && !profile?.profile_completed) {
    const nextOnboardingStep = getPostLoginRedirect(profile);
    return <Navigate to={nextOnboardingStep} replace />;
  }

  // Prevent skipping steps in onboarding:
  // 1. Must link college identity before accessing username, avatar, or profile setup
  if (
    !profile?.college_identity_linked &&
    (path.startsWith('/username') || path.startsWith('/avatar') || path.startsWith('/profile/setup'))
  ) {
    return <Navigate to="/verify" replace />;
  }

  // 2. Must select anonymous username before accessing avatar or profile setup
  const hasValidUsername =
    Boolean(profile?.display_username) && !profile?.display_username?.startsWith('Unknown User');
  if (
    profile?.college_identity_linked &&
    !hasValidUsername &&
    (path.startsWith('/avatar') || path.startsWith('/profile/setup'))
  ) {
    return <Navigate to="/username" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
