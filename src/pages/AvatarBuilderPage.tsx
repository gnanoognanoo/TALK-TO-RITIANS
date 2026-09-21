import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  Dices,
  RotateCcw,
  Lock,
  Sparkles,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Badge,
  ErrorMessage,
} from '../components';
import { AvatarPreview, AvatarCategorySelector } from '../features/avatar';
import {
  AvatarConfig,
  DEFAULT_AVATAR_CONFIG,
  isValidAvatarConfig,
  generateRandomAvatarConfig,
} from '../types/avatar';
import { useAuth } from '../context';
import { profileService } from '../services/profileService';

export const AvatarBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();

  const isVerified = Boolean(profile?.college_identity_linked);

  // Initialize with user's existing avatar config if valid, or default fallback
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(() => {
    if (isValidAvatarConfig(profile?.avatar_config)) {
      return profile.avatar_config;
    }
    return DEFAULT_AVATAR_CONFIG;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justRandomized, setJustRandomized] = useState(false);

  // Sync state if profile loads asynchronously
  useEffect(() => {
    if (isValidAvatarConfig(profile?.avatar_config)) {
      setAvatarConfig(profile.avatar_config);
    }
  }, [profile?.avatar_config]);

  /**
   * Randomize avatar properties across all layers
   */
  const handleRandomize = () => {
    const randomConfig = generateRandomAvatarConfig();
    setAvatarConfig(randomConfig);
    setJustRandomized(true);
    setTimeout(() => setJustRandomized(false), 800);
  };

  /**
   * Reset avatar back to original default configuration
   */
  const handleReset = () => {
    setAvatarConfig(DEFAULT_AVATAR_CONFIG);
  };

  /**
   * Save avatar configuration to database and advance to /profile/setup
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isVerified) {
      setSaveError('You must complete college ID verification before saving your avatar.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const res = await profileService.saveAvatarConfig(avatarConfig);
    setIsSaving(false);

    if (!res.success) {
      setSaveError(res.error?.message || 'Failed to save avatar configuration. Please try again.');
      return;
    }

    await refreshProfile();
    // Step 7: Route to /profile/setup upon saving
    navigate('/profile/setup');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header section */}
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Onboarding Step 3
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Customize Your Campus Avatar
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          Design your modular visual identity for campus conversations. Handcrafted vector artwork,
          100% anonymous, with zero personal student data attached.
        </p>
      </div>

      {/* =========================================================================
          LOCKED STATE: If college ID is not yet linked
          ========================================================================= */}
      {!isVerified ? (
        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl text-center p-8 space-y-5 animate-in fade-in">
          <div className="h-16 w-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 mx-auto flex items-center justify-center">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-white">College Verification Required</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Avatar customization is unlocked for verified Rajalakshmi Institute of Technology
              students. Please verify your physical ID card first.
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
           UNLOCKED CUSTOMIZATION STUDIO
           ========================================================================= */
        <Card className="border-slate-800 bg-slate-900/90 shadow-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-800/80 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Anonymous Avatar Studio</span>
                  <Badge variant="success" size="sm">
                    Verified
                  </Badge>
                </h2>
                <p className="text-xs text-slate-400">
                  Select styles, colors, and accessories or roll the dice for inspiration.
                </p>
              </div>

              {/* Quick Action Controls */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRandomize}
                  leftIcon={<Dices className={`h-4 w-4 ${justRandomized ? 'animate-spin' : ''}`} />}
                >
                  Randomize
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  title="Reset to default avatar"
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>

          <form onSubmit={handleSave}>
            <CardContent className="space-y-8 pt-6">
              {saveError && (
                <ErrorMessage message={saveError} onDismiss={() => setSaveError(null)} />
              )}

              {/* Top Section: Live Preview & Identity Banner */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                {/* Visual Avatar Preview */}
                <div className="md:col-span-5 flex flex-col items-center justify-center">
                  <AvatarPreview
                    config={avatarConfig}
                    size="xl"
                    badge={
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                        <Sparkles className="h-3 w-3 text-brand-400" />
                        <span>Live Dynamic Preview</span>
                      </div>
                    }
                  />
                </div>

                {/* Identity Summary & Tips */}
                <div className="md:col-span-7 space-y-3 text-left">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-400">
                      Chosen Student Handle
                    </span>
                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                      <span>{profile?.display_username || 'Anonymous Student'}</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </h3>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    This avatar will accompany your anonymous handle in matchmaking queues and live 1-to-1 conversations.
                    You can return to change your appearance anytime.
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      <Shield className="h-3.5 w-3.5 shrink-0" />
                      <span>Zero Personal Metadata</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                      <span>SVG Vector Format</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Category Selector Tabs & Customizer */}
              <div className="pt-2">
                <AvatarCategorySelector
                  config={avatarConfig}
                  onChange={(updated: AvatarConfig) => setAvatarConfig(updated)}
                />
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-slate-800/80 pt-5 mt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/username')}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Username
              </Button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
                loadingText="Saving Avatar..."
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Save & Continue to Profile Setup
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
};

export default AvatarBuilderPage;
