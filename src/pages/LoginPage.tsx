import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  ErrorMessage,
  Spinner,
} from '../components';
import { useAuth } from '../context';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    session,
    signInWithGoogle,
    signInWithPassword,
    getRedirectPath,
  } = useAuth();

  // Status & Error states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Target destination if redirected from protected route
  const fromPath = (location.state as { from?: { pathname: string } })?.from?.pathname;

  // Redirect if already authenticated
  useEffect(() => {
    if (user && session) {
      const destination = fromPath || getRedirectPath();
      navigate(destination, { replace: true });
    }
  }, [user, session, fromPath, getRedirectPath, navigate]);

  /**
   * Primary Authentication: Google OAuth
   */
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');

    const res = await signInWithGoogle();
    setIsLoading(false);

    if (!res.success) {
      if (
        res.error?.includes('provider is not enabled') ||
        res.error?.includes('Unsupported provider')
      ) {
        setErrorMessage(
          'Google Sign-In is awaiting provider activation in Supabase. Please add your Google Cloud OAuth Client ID & Secret in the Supabase Dashboard.'
        );
      } else {
        setErrorMessage(res.error || 'Google login could not be initialized.');
      }
    }
  };

  /**
   * Local Development Quick Test Login (Invisible in Production)
   */
  const handleTestLogin = async (testEmail: string) => {
    setIsLoading(true);
    setErrorMessage('');
    const res = await signInWithPassword(testEmail, 'Password123!');
    setIsLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Test sign-in failed');
    }
  };

  return (
    <Card className="border border-gray-200/80 dark:border-[rgba(140,170,110,0.22)] bg-white/95 dark:bg-[#091009]/90 backdrop-blur-md shadow-card dark:shadow-liquid-outer rounded-[28px] overflow-hidden">
      <CardHeader className="text-center pb-4 pt-6 px-6 sm:px-8">
        <CardTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-[#F4F6F1]">
          Talk to RITians
        </CardTitle>
        <CardDescription className="text-sm text-gray-500 dark:text-[#9DA89A] mt-1.5 font-normal">
          Connect anonymously with fellow RITians.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-6 sm:px-8 pb-6">
        {/* Error State Banner */}
        {errorMessage && (
          <ErrorMessage
            title="Authentication Notice"
            message={errorMessage}
            onDismiss={() => setErrorMessage('')}
          />
        )}

        {/* Primary Action: Clean Google-Style Button */}
        <div>
          <button
            type="button"
            id="google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-gray-300 dark:border-[rgba(140,170,110,0.28)] bg-white dark:bg-[#0D160E] hover:bg-gray-50 dark:hover:bg-[#122013] active:bg-gray-100 dark:active:bg-[#152616] active:scale-[0.98] text-gray-700 dark:text-[#F4F6F1] font-medium text-sm sm:text-base shadow-sm dark:shadow-liquid-outer hover:shadow transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 dark:focus:ring-[#8DA852] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer min-h-[48px]"
          >
            {isLoading ? (
              <Spinner size="sm" variant="brand" label="Connecting..." />
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.07.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.27v3.13C3.25 21.28 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.27C.46 8.21 0 10.05 0 12s.46 3.79 1.27 5.41l4.01-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.72 1.27 6.59l4.01 3.13c.95-2.84 3.6-4.97 6.72-4.97z"
                />
              </svg>
            )}
            <span className="font-semibold text-gray-800 dark:text-[#F4F6F1]">Continue with Google</span>
          </button>
        </div>

        {/* Informational Subtext */}
        <p className="text-xs text-gray-500 dark:text-[#9DA89A] text-center leading-relaxed max-w-xs mx-auto">
          Use your personal Google account. Your college identity is verified separately.
        </p>

        {/* Development Mock Test Logins (Local Dev Only - Not present in production) */}
        {import.meta.env.DEV && (
          <div className="pt-4 border-t border-gray-100 dark:border-[rgba(140,170,110,0.16)] space-y-2">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-[#6F796D] uppercase tracking-wider block text-center">
              Dev Seed Test Accounts (Local Testing Only)
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTestLogin('student.a.ritian.2026@gmail.com')}
                disabled={isLoading}
                className="text-[11px] py-1 px-1 text-gray-600 dark:text-[#9DA89A] truncate"
                title="Login as Student A (Verified CSE)"
              >
                Student A
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTestLogin('student.b.ritian.2026@gmail.com')}
                disabled={isLoading}
                className="text-[11px] py-1 px-1 text-gray-600 dark:text-[#9DA89A] truncate"
                title="Login as Student B (Verified ECE)"
              >
                Student B
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTestLogin('student.c.ritian.2026@gmail.com')}
                disabled={isLoading}
                className="text-[11px] py-1 px-1 text-gray-600 dark:text-[#9DA89A] truncate"
                title="Login as Student C (Verified MECH)"
              >
                Student C
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-gray-50/70 dark:bg-[#070C07]/80 border-t border-gray-100 dark:border-[rgba(140,170,110,0.14)] py-3.5 px-6 rounded-b-[28px]">
        <p className="text-[11px] text-gray-400 dark:text-[#6F796D] text-center w-full leading-relaxed">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </CardFooter>
    </Card>
  );
};

export default LoginPage;
