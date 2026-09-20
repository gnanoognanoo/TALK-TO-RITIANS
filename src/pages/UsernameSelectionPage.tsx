import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, Check, ArrowRight, ArrowLeft, ShieldAlert, Sparkles } from 'lucide-react';
import { Button, Input, Card, CardContent, CardFooter, Badge } from '../components';

const randomAdjectives = ['Swift', 'Curious', 'Cyber', 'Neon', 'Cosmic', 'Solar', 'Clever', 'Silent', 'Brave', 'Quantum'];
const randomNouns = ['Falcon', 'Cheetah', 'Otter', 'Panda', 'Tiger', 'Phoenix', 'Wolf', 'Owl', 'Badger', 'Lynx'];

const suggestions = [
  'SwiftFalcon_88',
  'CuriousOtter_23',
  'CyberCheetah_07',
  'CosmicPanda_99',
  'QuantumWolf_42',
];

export const UsernameSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('SwiftFalcon_88');
  const [error, setError] = useState('');

  const generateRandomUsername = () => {
    const adj = randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)];
    const noun = randomNouns[Math.floor(Math.random() * randomNouns.length)];
    const num = Math.floor(10 + Math.random() * 90);
    const generated = `${adj}${noun}_${num}`;
    setUsername(generated);
    setError('');
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please choose a username');
      return;
    }
    if (username.length < 3 || username.length > 20) {
      setError('Username must be between 3 and 20 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Only letters, numbers, and underscores are allowed');
      return;
    }

    navigate('/avatar');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm">
          Onboarding Step 2
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Choose Anonymous Handle
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          This is the only name fellow RITians will see during conversations. Never use your real name.
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
        <form onSubmit={handleNext}>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="anonymous-username"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Anonymous Handle
                </label>
                <button
                  type="button"
                  onClick={generateRandomUsername}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
                >
                  <Dices className="h-4 w-4" />
                  <span>Randomize</span>
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  id="anonymous-username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g. SwiftFalcon_88"
                  error={error}
                  rightIcon={
                    !error && username.length >= 3 ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : null
                  }
                  helperText="3-20 characters: letters, numbers, underscores only."
                />
              </div>
            </div>

            {/* Quick Suggestions Chips */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Quick suggestions:</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setUsername(s);
                      setError('');
                    }}
                    className={`
                      px-3 py-1 rounded-lg text-xs font-medium border transition-colors
                      ${
                        username === s
                          ? 'bg-brand-600/20 text-brand-300 border-brand-500/50'
                          : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                      }
                    `.trim()}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Anonymity Alert */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              <p className="leading-relaxed">
                For your safety, avoid using your real roll number, initials, or identifiable handles from other social platforms.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-slate-800/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/profile/setup')}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>

            <Button
              type="submit"
              variant="primary"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Next: Pick Avatar
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default UsernameSelectionPage;
