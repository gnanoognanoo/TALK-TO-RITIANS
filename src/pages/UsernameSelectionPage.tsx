/**
 * ============================================================================
 * TALK TO RITIANS - Anonymous Username Selection Page (Phase 6)
 * ============================================================================
 * In V1, users select from curated random aliases to prevent accidental leakage
 * of personal names, departments, sections, or roll numbers.
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
  const [selectedAlias, setSelectedAlias] = useState<string>(() => options[0] || 'SkyRider');
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
          Step 2 &bull; Anonymous Alias
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Choose Your Anonymous Username
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          Pick a name that represents you in chats. Your real identity will never be shown.
        </p>
      </div>

      {/* =========================================================================
          LOCKED STATE: If college ID is not yet linked
          ========================================================================= */}
      {!isVerified ? (
        <Card className="border-gray-200 bg-white shadow-card text-center p-8 space-y-5 animate-in fade-in">
          <div className="h-16 w-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-gray-900">College Verification Required</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Your account currently displays as{' '}
              <span className="font-semibold text-brand-600">
                {profile?.display_username || 'Unknown Student'}
              </span>
              . You must link your student ID card to unlock custom anonymous alias selection.
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
        <Card className="border-gray-200 bg-white shadow-card">
          <CardHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg text-gray-900">Choose Your Handle</CardTitle>
                <CardDescription className="text-xs text-gray-500">
                  Select one of the 3 pre-screened aliases below.
                </CardDescription>
              </div>

              {/* Reroll Button */}
              <button
                type="button"
                onClick={handleReroll}
                disabled={rerollsRemaining <= 0 || isSaving}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${
                    rerollsRemaining > 0
                      ? 'bg-white hover:bg-gray-50 text-brand-600 hover:text-brand-700 border border-gray-200 shadow-sm'
                      : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
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
              {/* Selected Alias Banner Display */}
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                    Active Selection
                  </span>
                  <span className="text-xl font-extrabold text-gray-900">{selectedAlias}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Ready to Use</span>
                </div>
              </div>

              {/* 3 Interactive Selection Cards */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2.5">
                  Available Alias Options
                </label>
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
                          relative p-4 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between group
                          ${
                            isSelected
                              ? 'bg-brand-50 border-brand-500 shadow-sm ring-2 ring-brand-100'
                              : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }
                        `.trim()}
                      >
                        <div className="flex items-center justify-between w-full mb-3">
                          <div
                            className={`
                              h-8 w-8 rounded-lg flex items-center justify-center transition-colors
                              ${
                                isSelected
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-gray-100 text-gray-500 group-hover:text-gray-700'
                              }
                            `.trim()}
                          >
                            <UserCheck className="h-4 w-4" />
                          </div>

                          {isSelected ? (
                            <CheckCircle2 className="h-5 w-5 text-brand-600" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border border-gray-300 group-hover:border-gray-400" />
                          )}
                        </div>

                        <div>
                          <span
                            className={`block text-sm font-bold tracking-wide ${
                              isSelected ? 'text-brand-900' : 'text-gray-900'
                            }`}
                          >
                            {alias}
                          </span>
                          <span className="text-[11px] text-gray-500">Anonymous Persona</span>
                        </div>
                      </button>
                    );
                  })}
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

              {/* Security & Anti-Leakage Shield Notice */}
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-brand-700">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Curated Anti-Leakage Shield</span>
                </div>
                <p className="text-[11px] leading-relaxed text-gray-500">
                  Pre-screened aliases prevent accidental leakage of student roll numbers, departments, or real names.
                </p>
              </div>

              {/* Reroll exhausted notice */}
              {rerollsRemaining === 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    You have utilized all 5 rerolls for this session. Please select your preferred alias from above.
                  </span>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="secondary"
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
                className="py-2.5 font-semibold shadow-sm"
              >
                Continue
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
};

export default UsernameSelectionPage;
