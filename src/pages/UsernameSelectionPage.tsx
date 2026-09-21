/**
 * ============================================================================
 * TALK TO RITIANS - Anonymous Username Selection Page
 * ============================================================================
 * In V1, users DO NOT type arbitrary usernames to prevent accidental leakage
 * of personal names, departments, sections, or roll numbers.
 *
 * Rules:
 * 1. Unverified users cannot finalize a custom alias (display as Unknown User ####)
 * 2. College verified users unlock 3 randomized options from the curated alias pool
 * 3. Students select 1 of the 3 predefined options
 * 4. Reroll is allowed a limited number of times (5 max per session)
 * 5. On confirmation, alias is saved and user is routed to /avatar
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Lock,
  ShieldCheck,
  UserCheck,
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
import { getRandomAliasBatch } from '../services/aliasPool';
import { profileService } from '../services/profileService';

const MAX_REROLLS = 5;

export const UsernameSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();

  const isVerified = Boolean(profile?.college_identity_linked);

  // Initialize 3 random aliases
  const [options, setOptions] = useState<string[]>(() => getRandomAliasBatch(3));
  const [selectedAlias, setSelectedAlias] = useState<string>(() => options[0] || 'SilentFox');
  const [rerollsRemaining, setRerollsRemaining] = useState<number>(MAX_REROLLS);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync default selection if options change
  useEffect(() => {
    if (options.length > 0 && !options.includes(selectedAlias)) {
      setSelectedAlias(options[0]);
    }
  }, [options, selectedAlias]);

  /**
   * Reroll 3 fresh alias options from the pool.
   */
  const handleReroll = () => {
    if (rerollsRemaining <= 0) return;

    const newBatch = getRandomAliasBatch(3, options);
    setOptions(newBatch);
    setSelectedAlias(newBatch[0]);
    setRerollsRemaining((prev) => prev - 1);
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

    if (!selectedAlias) {
      setSaveError('Please select one of the available anonymous aliases.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const res = await profileService.saveAnonymousAlias(selectedAlias);
    setIsSaving(false);

    if (!res.success) {
      setSaveError(res.error?.message || 'Failed to save chosen alias. Please try again.');
      return;
    }

    await refreshProfile();
    // Step 6: Route to /avatar
    navigate('/avatar');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Onboarding Step 2
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Select Your Anonymous Alias
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          This is the pseudonym peers will see during campus matchmaking and chats. Real student
          identities are permanently sealed.
        </p>
      </div>

      {/* =========================================================================
          LOCKED STATE: If college ID is not yet linked
          ========================================================================= */}
      {!isVerified ? (
        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl text-center p-6 space-y-5 animate-in fade-in">
          <div className="h-16 w-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 mx-auto flex items-center justify-center">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-white">College Verification Required</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your account currently displays as{' '}
              <span className="font-semibold text-brand-300">
                {profile?.display_username || 'Unknown User'}
              </span>
              . You must verify and link your physical Rajalakshmi Institute of Technology student ID card
              to unlock custom alias selection.
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
        /* =========================================================================
           UNLOCKED SELECTION: Verified Student Identity Active
           ========================================================================= */
        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
          <CardHeader className="pb-3 border-b border-slate-800/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg">Choose From Curated Personas</CardTitle>
                <CardDescription className="text-xs">
                  Pick one of the 3 pre-screened aliases below.
                </CardDescription>
              </div>

              {/* Reroll Button & Counter */}
              <button
                type="button"
                onClick={handleReroll}
                disabled={rerollsRemaining <= 0 || isSaving}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${
                    rerollsRemaining > 0
                      ? 'bg-slate-800 hover:bg-slate-700 text-brand-300 hover:text-white border border-slate-700'
                      : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                  }
                `.trim()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                <span>Reroll ({rerollsRemaining} left)</span>
              </button>
            </div>
          </CardHeader>

          <form onSubmit={handleSave}>
            <CardContent className="space-y-6 pt-6">
              {/* 3 Interactive Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {options.map((alias) => {
                  const isSelected = selectedAlias === alias;
                  return (
                    <button
                      key={alias}
                      type="button"
                      onClick={() => {
                        setSelectedAlias(alias);
                        setSaveError(null);
                      }}
                      className={`
                        relative p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between group
                        ${
                          isSelected
                            ? 'bg-brand-600/15 border-brand-500 shadow-lg shadow-brand-500/10 ring-1 ring-brand-500/50'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                        }
                      `.trim()}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div
                          className={`
                            h-8 w-8 rounded-lg flex items-center justify-center transition-colors
                            ${
                              isSelected
                                ? 'bg-brand-500 text-white'
                                : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                            }
                          `.trim()}
                        >
                          <UserCheck className="h-4 w-4" />
                        </div>

                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-brand-400" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border border-slate-700 group-hover:border-slate-500" />
                        )}
                      </div>

                      <div>
                        <span className="block text-sm font-bold text-white tracking-wide">
                          {alias}
                        </span>
                        <span className="text-[11px] text-slate-400">Anonymous Persona</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Error Message */}
              {saveError && (
                <ErrorMessage
                  title="Selection Error"
                  message={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              )}

              {/* Security & Privacy Callout */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>Curated Anti-Leakage Shield</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Free-text typing is restricted in V1 to prevent inadvertent disclosure of student register numbers,
                  departments, or personal names. All aliases are non-identifiable and clean.
                </p>
              </div>

              {/* Reroll exhausted notice */}
              {rerollsRemaining === 0 && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    You have utilized all 5 rerolls for this session. Please select your favorite alias from the options above.
                  </span>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-slate-800/60 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/verify')}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Verify
              </Button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
                loadingText="Securing Alias..."
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Next: Pick Avatar
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
};

export default UsernameSelectionPage;
