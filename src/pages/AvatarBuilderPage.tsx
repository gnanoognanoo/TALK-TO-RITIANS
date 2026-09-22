import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  Dices,
  RotateCcw,
  Lock,
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
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      {/* Header section */}
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Step 3 &bull; Avatar Builder
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Create Your Avatar
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
          Express yourself with a unique avatar. Handcrafted vector artwork, 100% anonymous.
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
           UNLOCKED CUSTOMIZATION STUDIO (Matching Reference Phase 7)
           ========================================================================= */
        <Card className="border-gray-200 bg-white shadow-card overflow-hidden">
          <CardHeader className="border-b border-gray-100 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>Customization Studio</span>
                  <Badge variant="success" size="sm">
                    Verified
                  </Badge>
                </h2>
                <p className="text-xs text-gray-500">
                  Pick your look using the tabs below or roll the dice for inspiration.
                </p>
              </div>

              {/* Quick Action Controls */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRandomize}
                  leftIcon={<Dices className={`h-4 w-4 text-brand-600 ${justRandomized ? 'animate-spin' : ''}`} />}
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
            <CardContent className="space-y-6 pt-6">
              {saveError && (
                <ErrorMessage message={saveError} onDismiss={() => setSaveError(null)} />
              )}

              {/* 2-Column Studio: Left Preview & Right Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT: Large Avatar Preview Card */}
                <div className="lg:col-span-5 p-6 rounded-2xl bg-gray-50/70 border border-gray-200 flex flex-col items-center justify-center space-y-4">
                  <AvatarPreview
                    config={avatarConfig}
                    size="xl"
                  />

                  <div className="text-center space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Your Active Alias
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center justify-center gap-1.5">
                      <span>{profile?.display_username || 'SkyRider'}</span>
                      <CheckCircle2 className="h-4 w-4 text-brand-600" />
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>Zero Personal Metadata</span>
                  </div>
                </div>

                {/* RIGHT: Tabs and Customizer Panels */}
                <div className="lg:col-span-7">
                  <AvatarCategorySelector
                    config={avatarConfig}
                    onChange={(updated: AvatarConfig) => setAvatarConfig(updated)}
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-gray-100 pt-5 mt-2">
              <Button
                type="button"
                variant="secondary"
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

export default AvatarBuilderPage;
