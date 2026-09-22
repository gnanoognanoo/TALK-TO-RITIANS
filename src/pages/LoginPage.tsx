import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  ErrorMessage,
  Logo,
} from '../components';
import { useAuth } from '../context';

type AuthMode = 'login' | 'signup' | 'forgot';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    user,
    session,
    signInWithPassword,
    signUpWithPassword,
    resetPassword,
    signInWithGoogle,
    getRedirectPath,
  } = useAuth();

  // Mode: 'login' (default) | 'signup' | 'forgot'
  const initialMode =
    (location.state as { mode?: AuthMode } | null)?.mode ||
    (searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status & Error states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Target destination if redirected from protected route
  const fromPath = (location.state as { from?: { pathname: string } })?.from?.pathname;

  // Redirect if already authenticated
  useEffect(() => {
    if (user && session) {
      const destination = fromPath || getRedirectPath();
      navigate(destination, { replace: true });
    }
  }, [user, session, fromPath, getRedirectPath, navigate]);

  const validateEmail = (rawEmail: string): { valid: boolean; error?: string } => {
    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!cleanEmail) {
      return { valid: false, error: 'Please enter your personal email address.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return { valid: false, error: 'Please enter a valid personal email address.' };
    }

    // Prohibit college email directly as per authentication rules
    if (cleanEmail.endsWith('@rajalakshmi.edu.in') || cleanEmail.endsWith('@ritchennai.edu.in')) {
      return {
        valid: false,
        error:
          'Please sign in with your PERSONAL email account. Your college ID will be verified and linked anonymously in the next step.',
      };
    }

    return { valid: true };
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setErrorMessage(emailValidation.error || 'Invalid email');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. FORGOT PASSWORD MODE
    if (mode === 'forgot') {
      setIsLoading(true);
      const res = await resetPassword(cleanEmail);
      setIsLoading(false);

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send password reset email.');
      } else {
        setResetSent(true);
      }
      return;
    }

    // 2. PASSWORD VALIDATION (for Login & Signup)
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    // 3. SIGNUP MODE
    if (mode === 'signup') {
      if (!confirmPassword) {
        setErrorMessage('Please confirm your password.');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please re-enter.');
        return;
      }

      setIsLoading(true);
      const res = await signUpWithPassword(cleanEmail, password);
      setIsLoading(false);

      if (!res.success) {
        setErrorMessage(res.error || 'Account creation failed. Please try again.');
        return;
      }

      // Automatically routed directly to /verify on immediate authentication
      navigate('/verify', { replace: true });
      return;
    }

    // 4. LOGIN MODE (Returning User)
    setIsLoading(true);
    const res = await signInWithPassword(cleanEmail, password);
    setIsLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Invalid email or password. Please try again.');
      return;
    }

    // Route dynamically based on onboarding progression
    const destination = fromPath || getRedirectPath();
    navigate(destination, { replace: true });
  };

  const handleTestLogin = async (testEmail: string) => {
    setIsLoading(true);
    setErrorMessage('');
    const res = await signInWithPassword(testEmail, 'Password123!');
    setIsLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Test sign-in failed');
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');

    const res = await signInWithGoogle();
    setIsLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Google login could not be initialized.');
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage('');
    setResetSent(false);
  };

  return (
    <Card className="border-gray-200 bg-white shadow-card">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-2">
          <Logo size="md" showText={false} />
        </div>
        <CardTitle className="text-2xl font-bold text-gray-900">
          {mode === 'login' && 'Welcome Back'}
          {mode === 'signup' && 'Create Account'}
          {mode === 'forgot' && 'Reset Password'}
        </CardTitle>
        <CardDescription className="text-sm text-gray-500">
          {mode === 'login' && 'Sign in with your personal email to continue'}
          {mode === 'signup' && 'Sign up with your personal email to get started'}
          {mode === 'forgot' && 'Enter your personal email to receive a password reset link'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Error State Banner */}
        {errorMessage && (
          <ErrorMessage
            title="Authentication Error"
            message={errorMessage}
            onDismiss={() => setErrorMessage('')}
          />
        )}

        {/* Forgot Password Success State */}
        {mode === 'forgot' && resetSent ? (
          <div className="text-center py-4 space-y-4 animate-in fade-in">
            <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center shadow-sm">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-gray-900">Reset Email Sent!</h3>
              <p className="text-xs text-gray-600">
                We sent a password reset link to <span className="font-semibold text-brand-600">{email}</span>.
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed max-w-xs mx-auto pt-1">
                Click the link in the email to set a new password, then return here to sign in.
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => switchMode('login')}
              >
                Back to Sign In
              </Button>
            </div>
          </div>
        ) : (
          /* Authentication Form */
          <form onSubmit={handleAuthSubmit} className="space-y-3.5" noValidate>
            <Input
              id="personal-email"
              type="email"
              label="Personal Email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              disabled={isLoading}
              required
              leftIcon={<Mail className="h-4 w-4" />}
              helperText={
                mode === 'signup'
                  ? 'Use your personal email. College ID is linked separately in the next step.'
                  : undefined
              }
            />

            {mode !== 'forgot' && (
              <div className="space-y-1">
                <Input
                  id="personal-password"
                  type="password"
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  disabled={isLoading}
                  required
                  leftIcon={<Lock className="h-4 w-4" />}
                  helperText={mode === 'signup' ? 'Minimum 6 characters' : undefined}
                />

                {mode === 'login' && (
                  <div className="text-right pt-0.5">
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <Input
                id="signup-confirm-password"
                type="password"
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                disabled={isLoading}
                required
                leftIcon={<Lock className="h-4 w-4" />}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              loadingText={
                mode === 'signup'
                  ? 'Creating account...'
                  : mode === 'forgot'
                  ? 'Sending link...'
                  : 'Signing in...'
              }
              rightIcon={<ArrowRight className="h-4 w-4" />}
              className="py-2.5 font-semibold text-sm shadow-sm"
            >
              {mode === 'signup' && 'Create Account'}
              {mode === 'login' && 'Sign In'}
              {mode === 'forgot' && 'Send Reset Link'}
            </Button>
          </form>
        )}

        {/* Mode Switcher Footer Links */}
        <div className="pt-2 text-center text-xs text-gray-500">
          {mode === 'login' && (
            <p>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
              >
                Create Account
              </button>
            </p>
          )}

          {mode === 'signup' && (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
              >
                Sign In
              </button>
            </p>
          )}

          {mode === 'forgot' && !resetSent && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
            >
              &larr; Back to Sign In
            </button>
          )}
        </div>

        {/* Google OAuth Option (Only shown if genuinely configured and enabled) */}
        {Boolean(import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true') && mode !== 'forgot' && (
          <>
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-gray-200 w-full" />
              <span className="bg-white px-3 text-xs text-gray-400 uppercase font-medium tracking-wider shrink-0">
                or
              </span>
              <div className="border-t border-gray-200 w-full" />
            </div>

            <Button
              type="button"
              variant="secondary"
              fullWidth
              isLoading={isLoading}
              onClick={handleGoogleSignIn}
              leftIcon={
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.56 0 2.97.55 4.09 1.62l3.07-3.07C17.3 1.77 14.83 1 12 1 7.39 1 3.47 3.65 1.57 7.48l3.68 2.85C6.11 7.48 8.82 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.69 2.86c2.16-1.99 3.73-4.92 3.73-8.68z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.25 14.67c-.24-.72-.38-1.49-.38-2.67s.14-1.95.38-2.67L1.57 6.48C.57 8.48 0 10.67 0 12s.57 3.52 1.57 5.52l3.68-2.85z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.69-2.86c-1.08.73-2.46 1.16-4.24 1.16-3.18 0-5.89-2.48-6.75-5.33L1.57 15.91C3.47 20.35 7.39 23 12 23z"
                  />
                </svg>
              }
              className="py-2.5 font-medium text-sm"
            >
              Continue with Google
            </Button>
          </>
        )}

        {/* Development Mock Test Logins */}
        {import.meta.env.DEV && (
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block text-center">
              Dev Seed Test Accounts
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTestLogin('student.a.ritian.2026@gmail.com')}
                disabled={isLoading}
                className="text-[11px] py-1 px-1 text-gray-600 truncate"
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
                className="text-[11px] py-1 px-1 text-gray-600 truncate"
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
                className="text-[11px] py-1 px-1 text-gray-600 truncate"
                title="Login as Student C (Verified MECH)"
              >
                Student C
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-gray-50/50 border-t border-gray-100 p-4 rounded-b-2xl">
        <p className="text-[11px] text-gray-400 text-center w-full leading-relaxed">
          Rajalakshmi Institute of Technology &bull; Student Identity Privacy Protocol
        </p>
      </CardFooter>
    </Card>
  );
};

export default LoginPage;
