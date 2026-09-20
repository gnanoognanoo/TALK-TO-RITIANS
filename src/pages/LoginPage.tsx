import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setIsLoading(true);

    // Mock sign-in delay
    setTimeout(() => {
      setIsLoading(false);
      setIsSent(true);
    }, 800);
  };

  return (
    <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
      <CardHeader className="text-center">
        <CardTitle>Welcome Back</CardTitle>
        <CardDescription>
          Sign in with your personal email to access your anonymous RIT account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isSent ? (
          <div className="text-center py-4 space-y-4 animate-in fade-in zoom-in-95">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Magic Link Sent!</h3>
              <p className="text-xs text-slate-400 mt-1">
                We sent a temporary sign-in link to <span className="text-slate-200 font-medium">{email}</span>.
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/verify')}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Continue to College Verification
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              id="user-email"
              type="email"
              label="Personal Email Address"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
              required
              leftIcon={<Mail className="h-4 w-4" />}
              helperText="We never reveal your email address to chat partners."
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              loadingText="Sending link..."
              rightIcon={<ArrowRight className="h-4 w-4" />}
              className="mt-2"
            >
              Send Magic Link
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3 text-center border-t border-slate-800/60 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Need to verify student ID first?</span>
          <Link to="/verify" className="text-brand-400 hover:text-brand-300 font-semibold underline">
            Verify here
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
};

export default LoginPage;
