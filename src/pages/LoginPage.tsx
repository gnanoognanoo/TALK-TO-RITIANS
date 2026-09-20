import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, ArrowRight, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
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
  Badge,
} from '../components';
import { useAuth } from '../context';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, session, signInWithEmail, signInWithGoogle, getRedirectPath } = useAuth();

  const [email, setEmail] = useState('');
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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setAuthState('error');
      setErrorMessage('Please enter your personal email address.');
      return;
    }

    if (!trimmed.includes('@') || !trimmed.includes('.')) {
      setAuthState('error');
      setErrorMessage('Please enter a valid personal email address (e.g. name@gmail.com).');
      return;
    }

    // Prohibit college email directly as per authentication rules
    if (trimmed.endsWith('@rajalakshmi.edu.in') || trimmed.endsWith('@ritchennai.edu.in')) {
      setAuthState('error');
      setErrorMessage(
        'Please sign in with your PERSONAL email account. Your college ID will be verified and linked anonymously in the next step.'
      );
      return;
    }

    setAuthState('loading');
    setErrorMessage('');

    const res = await signInWithEmail(trimmed);
    if (!res.success) {
      setAuthState('error');
      setErrorMessage(res.error || 'Failed to send magic link. Please check your connection and try again.');
    } else {
      setAuthState('success');
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
    <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2">
          <Badge variant="brand" size="sm" withDot>
            Personal Account
          </Badge>
        </div>
        <CardTitle>Sign In to Campus</CardTitle>
        <CardDescription>
          Sign in using your personal account. Your student ID will be linked anonymously afterwards.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
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
          <div className="text-center py-4 space-y-4 animate-in fade-in zoom-in-95">
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">Magic Link Dispatched!</h3>
              <p className="text-xs text-slate-300">
                We sent a temporary login link to <span className="font-semibold text-brand-300">{email}</span>.
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto pt-1">
                Open the link on this device to instantly activate your session. You'll be directed straight to campus ID verification.
              </p>
            </div>

            <div className="pt-3 space-y-2">
              <Button
                variant="outline"
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
          /* Idle & Loading Form States */
          <div className="space-y-4">
            {/* Preferred Option: Google OAuth */}
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
            >
              Continue with Google
            </Button>

            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shrink-0">
                Or personal email
              </span>
              <div className="border-t border-slate-800 w-full" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
              <Input
                id="personal-email"
                type="email"
                label="Personal Email Address"
                placeholder="student.name@gmail.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authState === 'error') setAuthState('idle');
                }}
                disabled={authState === 'loading'}
                required
                leftIcon={<Mail className="h-4 w-4" />}
                helperText="Use your personal account. Do not use your college email here."
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={authState === 'loading'}
                loadingText="Sending magic link..."
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Send Magic Link
              </Button>
            </form>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-2.5 text-center border-t border-slate-800/60 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Your personal email is never shown to chat partners.</span>
        </div>
      </CardFooter>
    </Card>
  );
};

export default LoginPage;
