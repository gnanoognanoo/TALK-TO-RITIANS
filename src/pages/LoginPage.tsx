import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, ArrowRight, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
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

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, session, signInWithEmail, signInWithPassword, signInWithGoogle, getRedirectPath } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePasswordAuth, setUsePasswordAuth] = useState(false);
  const [authState, setAuthState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
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

  const handleTestLogin = async (testEmail: string) => {
    setAuthState('loading');
    setErrorMessage('');
    const res = await signInWithPassword(testEmail, 'Password123!');
    if (!res.success) {
      setAuthState('error');
      setErrorMessage(res.error || 'Test sign-in failed');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setAuthState('error');
      setErrorMessage('Please enter your personal email address.');
      return;
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setAuthState('error');
      setErrorMessage('Please enter a valid personal email address.');
      return;
    }

    // Prohibit college email directly as per authentication rules
    if (trimmedEmail.endsWith('@rajalakshmi.edu.in') || trimmedEmail.endsWith('@ritchennai.edu.in')) {
      setAuthState('error');
      setErrorMessage(
        'Please sign in with your PERSONAL email account. Your college ID will be verified and linked anonymously in the next step.'
      );
      return;
    }

    setAuthState('loading');
    setErrorMessage('');

    if (usePasswordAuth && password) {
      const res = await signInWithPassword(trimmedEmail, password);
      if (!res.success) {
        setAuthState('error');
        setErrorMessage(res.error || 'Invalid credentials. Please check your password or use magic link.');
      }
    } else {
      const res = await signInWithEmail(trimmedEmail);
      if (!res.success) {
        setAuthState('error');
        setErrorMessage(res.error || 'Failed to send magic link. Please check your connection and try again.');
      } else {
        setAuthState('success');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthState('loading');
    setErrorMessage('');

    const res = await signInWithGoogle();
    if (!res.success) {
      setAuthState('error');
      setErrorMessage(res.error || 'Google login could not be initialized.');
    }
  };

  const handleRetry = () => {
    setAuthState('idle');
    setErrorMessage('');
  };

  return (
    <Card className="border-gray-200 bg-white shadow-card">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-2">
          <Logo size="md" showText={false} />
        </div>
        <CardTitle className="text-2xl font-bold text-gray-900">Welcome Back</CardTitle>
        <CardDescription className="text-sm text-gray-500">
          Sign in to continue
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Error State Banner */}
        {authState === 'error' && (
          <ErrorMessage
            title="Authentication Error"
            message={errorMessage}
            onRetry={handleRetry}
            retryText="Try Again"
            onDismiss={handleRetry}
          />
        )}

        {/* Success State Screen */}
        {authState === 'success' ? (
          <div className="text-center py-4 space-y-4 animate-in fade-in">
            <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center shadow-sm">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-gray-900">Magic Link Dispatched!</h3>
              <p className="text-xs text-gray-600">
                We sent a temporary login link to <span className="font-semibold text-brand-600">{email}</span>.
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed max-w-xs mx-auto pt-1">
                Open the link on this device to instantly activate your session and proceed to college verification.
              </p>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => setAuthState('idle')}
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Use a different email
              </Button>
            </div>
          </div>
        ) : (
          /* Form Inputs */
          <div className="space-y-4">
            <form onSubmit={handleAuthSubmit} className="space-y-3.5" noValidate>
              <Input
                id="personal-email"
                type="email"
                label="Email"
                placeholder="kawshik@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authState === 'error') setAuthState('idle');
                }}
                disabled={authState === 'loading'}
                required
                leftIcon={<Mail className="h-4 w-4" />}
                helperText="Use your personal email address."
              />

              {usePasswordAuth && (
                <div className="space-y-1">
                  <Input
                    id="personal-password"
                    type="password"
                    label="Password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (authState === 'error') setAuthState('idle');
                    }}
                    disabled={authState === 'loading'}
                    required
                    leftIcon={<Lock className="h-4 w-4" />}
                  />
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setUsePasswordAuth(false)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Use passwordless magic link instead
                    </button>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={authState === 'loading'}
                loadingText={usePasswordAuth ? 'Signing in...' : 'Sending magic link...'}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="py-2.5 font-semibold text-sm shadow-sm"
              >
                Sign In
              </Button>

              {!usePasswordAuth && (
                <div className="text-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => setUsePasswordAuth(true)}
                    className="text-xs text-gray-500 hover:text-brand-600 font-medium transition-colors"
                  >
                    Have a password? Sign in with password
                  </button>
                </div>
              )}
            </form>

            {/* Google OAuth Option (Only shown if genuinely configured and enabled) */}
            {Boolean(import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true') && (
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
                  isLoading={authState === 'loading'}
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
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
                  Live Cloud Test Accounts
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTestLogin('student.a.ritian.2026@gmail.com')}
                    disabled={authState === 'loading'}
                  >
                    Login Account A
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTestLogin('student.b.ritian.2026@gmail.com')}
                    disabled={authState === 'loading'}
                  >
                    Login Account B
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-2 text-center border-t border-gray-100 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Your personal email is never shown to chat partners.</span>
        </div>
      </CardFooter>
    </Card>
  );
};

export default LoginPage;
