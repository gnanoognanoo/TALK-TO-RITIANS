import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, X, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button, Card, Badge } from '../components';

export const MatchingPage: React.FC = () => {
  const navigate = useNavigate();
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleMatchFound = () => {
    navigate('/chat/room-rit-4092');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-600/10 blur-[120px] rounded-full pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md text-center space-y-8">
        {/* Radar Radar Animation Display */}
        <div className="relative flex items-center justify-center h-56 w-56 mx-auto">
          {/* Outer Ripple Rings */}
          <div className="absolute inset-0 rounded-full border border-brand-500/20 animate-ping opacity-25" />
          <div className="absolute -inset-4 rounded-full border border-brand-500/15 animate-pulse-slow" />
          <div className="absolute inset-4 rounded-full border border-brand-500/30" />
          <div className="absolute inset-12 rounded-full border border-brand-500/40 bg-brand-950/30" />

          {/* Center Avatar / Radar Beacon */}
          <div className="relative z-10 h-20 w-20 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl shadow-brand-500/40">
            <Radio className="h-9 w-9 animate-pulse" />
          </div>

          {/* Floating Campus Ping Indicator */}
          <span className="absolute top-6 right-8 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-bounce" />
        </div>

        {/* Status Message */}
        <div className="space-y-2">
          <Badge variant="brand" size="md" withDot>
            Pairing in Progress ({secondsElapsed}s)
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Finding a Fellow RITian...
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            Matching you with an active, verified student from Rajalakshmi Institute of Technology.
          </p>
        </div>

        {/* Icebreaker Card */}
        <Card className="p-4 bg-slate-900/60 border-slate-800 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-xs space-y-1">
              <span className="font-semibold text-white">Icebreaker Idea:</span>
              <p className="text-slate-400 leading-relaxed">
                "Are you a day scholar or hosteller? What's your favorite spot on campus during breaks?"
              </p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/home')}
            leftIcon={<X className="h-4 w-4" />}
          >
            Cancel & Return Home
          </Button>

          <Button
            variant="primary"
            onClick={handleMatchFound}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Simulate Match Found
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Queue is protected & encrypted via Supabase Realtime</span>
        </div>
      </div>
    </div>
  );
};

export default MatchingPage;
