/**
 * ============================================================================
 * TALK TO RITIANS - Anonymous Username Selection Page (Phase 6 / Update)
 * ============================================================================
 * Verified users select from curated short random aliases (3-8 chars, max 10).
 * Free-text username entry is prohibited to prevent leaking real identities.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  ErrorMessage,
} from '../components';
import { useAuth } from '../context';
import { getRandomShortAlias } from '../services/aliasPool';
import { profileService } from '../services/profileService';
import { getEffectivePersona } from '../utils/persona';

export const UsernameSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile, isStaff } = useAuth();

  useEffect(() => {
    if (isStaff) {
      navigate('/settings', { replace: true });
    }
  }, [isStaff, navigate]);

  const effectivePersona = getEffectivePersona(profile, isStaff);
  const isVerified = effectivePersona.isVerified;

  // Initialize ONE curated short alias
  const [candidateAlias, setCandidateAlias] = useState<string>(() => {
    if (isVerified && profile?.display_username && !profile.display_username.startsWith('Unknown User')) {
      return profile.display_username;
    }
    return getRandomShortAlias();
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Reroll ONE fresh alias candidate from the pool.
   * Unlimited refresh without writing to the database.
   */
  const handleReroll = () => {
    const nextAlias = getRandomShortAlias(candidateAlias);
    setCandidateAlias(nextAlias);
    setSaveError(null);
  };

  /**
   * Finalize and save chosen alias.
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isVerified) {
      setSaveError('You must complete college ID verification before selecting an anonymous alias.');
      return;
    }

    if (!candidateAlias) {
      setSaveError('Please choose an anonymous alias.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const res = await profileService.saveAnonymousAlias(candidateAlias);
    setIsSaving(false);

    if (!res.success) {
      setSaveError(res.error?.message || 'Failed to save chosen alias. Please try again.');
      return;
    }

    await refreshProfile();
    navigate('/settings');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Profile Customization &bull; Anonymous Username
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1] tracking-tight">
          Choose Your Anonymous Username
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-[#C0CCBC] max-w-md mx-auto leading-relaxed">
          Short random alias for 7-minute chats. Your real identity is never exposed.
        </p>
      </div>

      {/* LOCKED STATE: If college ID is not yet linked */}
      {!isVerified ? (
        <Card className="border border-slate-200/80 dark:border-[rgba(140,170,110,0.22)] bg-white/95 dark:bg-[#091009]/90 backdrop-blur-md shadow-card dark:shadow-liquid-outer rounded-[28px] text-center p-8 space-y-5 animate-in fade-in">
          <div className="h-16 w-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 mx-auto flex items-center justify-center shadow-sm">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-[#F4F6F1]">College Verification Required</h3>
            <p className="text-xs text-slate-600 dark:text-[#C0CCBC] leading-relaxed">
              Your account currently displays as{' '}
              <span className="font-semibold text-brand-600 dark:text-[#8DA852]">
                {effectivePersona.displayUsername}
              </span>
              . You must link your student ID card to customize your anonymous profile.
            </p>
          </div>

          <div className="pt-2 max-w-xs mx-auto">
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={() => navigate('/verify')}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Verify College ID First
            </Button>
          </div>
        </Card>
      ) : (
        /* UNLOCKED SELECTION: Verified Student Identity Active */
        <Card className="border border-slate-200/80 dark:border-[rgba(140,170,110,0.22)] bg-white/95 dark:bg-[#091009]/90 backdrop-blur-md shadow-card dark:shadow-liquid-outer rounded-[28px]">
          <CardHeader className="pb-3 border-b border-slate-200 dark:border-[rgba(140,170,110,0.14)]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg text-slate-900 dark:text-[#F4F6F1]">Anonymous Username</CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-[#C0CCBC]">
                  Click refresh to roll a new short alias. No manual typing required.
                </CardDescription>
              </div>

              {/* Reroll Button */}
              <button
                type="button"
                id="alias-reroll-btn"
                onClick={handleReroll}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#0D160E] hover:bg-slate-50 dark:hover:bg-[#122013] text-brand-600 dark:text-[#8DA852] hover:text-brand-700 border border-slate-200 dark:border-[rgba(140,170,110,0.25)] shadow-sm active:scale-[0.98] transition-all"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                <span>Refresh Alias</span>
              </button>
            </div>
          </CardHeader>

          <form onSubmit={handleSave}>
            <CardContent className="space-y-6 pt-6">
              {/* Single Short Alias Display */}
              <div className="p-6 rounded-[24px] bg-gradient-to-br from-brand-50/70 to-emerald-50/40 dark:from-[#0D160E] dark:to-[#122214] border border-brand-200/70 dark:border-[rgba(140,170,110,0.25)] flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
                <div className="h-16 w-16 rounded-2xl bg-brand-600 dark:bg-[#526C34] text-white flex items-center justify-center font-extrabold text-2xl shadow-sm">
                  {candidateAlias.slice(0, 2).toUpperCase()}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <span id="candidate-alias-display" className="text-3xl font-extrabold text-slate-900 dark:text-[#F4F6F1] tracking-tight">
                      {candidateAlias}
                    </span>
                    <button
                      type="button"
                      onClick={handleReroll}
                      title="Roll another alias"
                      className="p-1.5 rounded-full text-brand-600 dark:text-[#8DA852] hover:text-brand-800 dark:hover:text-[#A2BD63] hover:bg-brand-100/60 dark:hover:bg-[#152616] transition-colors"
                    >
                      <RefreshCw className="h-5 w-5" />
                    </button>
                  </div>
                  <span className="text-xs text-slate-600 dark:text-[#C0CCBC]">Curated short anonymous alias (3–8 chars)</span>
                </div>
              </div>

              {/* Error Message */}
              {saveError && (
                <ErrorMessage
                  title="Selection Error"
                  message={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              )}

              {/* Anti-Leakage Shield Notice */}
              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-[#0D160E]/70 border border-slate-200 dark:border-[rgba(140,170,110,0.18)] text-xs text-slate-600 dark:text-[#C0CCBC] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-brand-700 dark:text-[#A2BD63]">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-[#8DA852]" />
                  <span>Curated Anti-Leakage Shield</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-[#A2B09D]">
                  Curated short aliases prevent accidental exposure of student roll numbers, departments, or real names.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-slate-200 dark:border-[rgba(140,170,110,0.14)] pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate('/settings')}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Settings
              </Button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
                loadingText="Saving..."
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="py-2.5 font-semibold shadow-sm"
              >
                Use {candidateAlias}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
};

export default UsernameSelectionPage;
