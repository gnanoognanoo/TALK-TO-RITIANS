/**
 * ============================================================================
 * TALK TO RITIANS - Central Settings Screen
 * ============================================================================
 * Central management area for:
 * A. Profile Customization (locked when unverified, unlocked when verified)
 * B. College Verification (Scan & Link / Unlink ID)
 * C. Appearance (Light / Dark theme selection)
 * D. Account & Logout
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  User,
  Sparkles,
  ArrowRight,
  Sun,
  Moon,
  LogOut,
  Unlink,
  AlertTriangle,
  Edit2,
  RefreshCw,
  CreditCard,
  Mail,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Avatar,
  Modal,
  ErrorMessage,
} from '../components';
import { useAuth, useTheme } from '../context';
import { GENDER_OPTIONS } from '../config/profileConfig';
import { profileService } from '../services/profileService';
import { getRandomShortAlias } from '../services/aliasPool';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, unlinkCollegeIdentity, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const isVerified = Boolean(profile?.college_identity_linked);
  const displayUsername = profile?.display_username || 'Unknown User';

  // Short random alias reroll state (Change 4: No manual text entry, unlimited rerolls)
  const [aliasCandidate, setAliasCandidate] = useState<string>(() => {
    if (profile?.display_username && !profile.display_username.startsWith('Unknown User')) {
      return profile.display_username;
    }
    return getRandomShortAlias();
  });
  const [isSavingAlias, setIsSavingAlias] = useState<boolean>(false);
  const [aliasSuccessMessage, setAliasSuccessMessage] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Sync candidate when profile changes
  useEffect(() => {
    if (profile?.display_username && !profile.display_username.startsWith('Unknown User')) {
      setAliasCandidate(profile.display_username);
    }
  }, [profile?.display_username]);

  const handleRefreshAlias = () => {
    const nextAlias = getRandomShortAlias(aliasCandidate);
    setAliasCandidate(nextAlias);
    setAliasError(null);
    setAliasSuccessMessage(null);
  };

  const handleSaveAlias = async () => {
    if (!isVerified) {
      setAliasError('You must verify your RIT ID before saving an alias.');
      return;
    }
    setIsSavingAlias(true);
    setAliasError(null);
    setAliasSuccessMessage(null);

    const res = await profileService.saveAnonymousAlias(aliasCandidate);
    setIsSavingAlias(false);

    if (!res.success) {
      setAliasError(res.error?.message || 'Failed to save alias. Please try again.');
      return;
    }

    await refreshProfile();
    setAliasSuccessMessage('Alias saved!');
    setTimeout(() => setAliasSuccessMessage(null), 3000);
  };

  // Gender selection state
  const [selectedGender, setSelectedGender] = useState<string | null>(profile?.gender || null);
  const [isSavingGender, setIsSavingGender] = useState<boolean>(false);
  const [genderSuccessMessage, setGenderSuccessMessage] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);

  // Unlink modal state
  const [showUnlinkModal, setShowUnlinkModal] = useState<boolean>(false);
  const [isUnlinking, setIsUnlinking] = useState<boolean>(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Save private gender
  const handleGenderSave = async (gender: string) => {
    setSelectedGender(gender);
    setIsSavingGender(true);
    setGenderError(null);
    setGenderSuccessMessage(null);

    const res = await profileService.saveGender(gender);
    setIsSavingGender(false);

    if (!res.success) {
      setGenderError(res.error?.message || 'Failed to save gender preference.');
      return;
    }

    await refreshProfile();
    setGenderSuccessMessage('Gender saved privately.');
    setTimeout(() => setGenderSuccessMessage(null), 3000);
  };

  // Unlink college identity
  const handleUnlink = async () => {
    setIsUnlinking(true);
    setUnlinkError(null);

    const res = await unlinkCollegeIdentity();
    setIsUnlinking(false);

    if (!res.success) {
      setUnlinkError(res.error || 'Failed to unlink college identity. Please try again.');
      return;
    }

    setShowUnlinkModal(false);
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('[SettingsPage] Logout error:', err);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-8 animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
            Manage your anonymous persona, college verification, and app preferences.
          </p>
        </div>
        <Link to="/home">
          <Button variant="secondary" size="sm">
            &larr; Back to Home
          </Button>
        </Link>
      </div>

      {/* =========================================================================
          SECTION A: PROFILE CUSTOMIZATION
          ========================================================================= */}
      <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <CardTitle className="text-lg sm:text-xl text-gray-900 dark:text-white">
                Profile Customization
              </CardTitle>
            </div>
            {isVerified ? (
              <Badge variant="success" size="sm" withDot>
                Unlocked
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                Locked
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
            {isVerified
              ? 'Customize your anonymous public handle and modular vector avatar.'
              : 'Verify your RIT ID to unlock anonymous alias and avatar customization.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isVerified ? (
            /* UNVERIFIED LOCKED STATE */
            <div className="p-6 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="h-6 w-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  Verify your RIT ID to unlock profile customization
                </h4>
                <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                  Unverified students chat with a safe anonymous persona (
                  <span className="font-mono font-semibold">{displayUsername}</span>). Link your
                  physical college ID card to choose a custom anonymous alias, design your avatar, and set your private gender.
                </p>
              </div>
              <div className="pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate('/verify')}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Verify RIT ID Now
                </Button>
              </div>
            </div>
          ) : (
            /* VERIFIED UNLOCKED STATE */
            <div className="space-y-6 divide-y divide-gray-100 dark:divide-slate-800">
              {/* Anonymous Username (Change 4: Curated short random alias only, no free-text input) */}
              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider block">
                      Anonymous Username
                    </span>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Short random alias for 7-minute chats. Your real identity is never exposed.
                    </p>
                  </div>
                  {aliasSuccessMessage && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ {aliasSuccessMessage}
                    </span>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400 font-bold text-sm">
                      {aliasCandidate.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span id="alias-candidate-display" className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                          {aliasCandidate}
                        </span>
                        <button
                          type="button"
                          id="alias-refresh-button"
                          onClick={handleRefreshAlias}
                          title="Generate another alias"
                          className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-[11px] text-gray-500 dark:text-slate-400">
                        {aliasCandidate === displayUsername ? 'Currently active in chats' : 'Candidate preview — click Use to save'}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    id="alias-save-button"
                    variant="primary"
                    size="sm"
                    disabled={isSavingAlias || aliasCandidate === displayUsername}
                    isLoading={isSavingAlias}
                    loadingText="Saving..."
                    onClick={handleSaveAlias}
                    className="shrink-0 font-semibold"
                  >
                    {aliasCandidate === displayUsername ? 'Active' : `Use ${aliasCandidate}`}
                  </Button>
                </div>
                {aliasError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{aliasError}</p>
                )}
              </div>

              {/* Avatar Customization */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar
                    size="lg"
                    avatarConfig={profile?.avatar_config as any}
                    initials={displayUsername.slice(0, 2)}
                    shape="circle"
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Vector Avatar
                    </span>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                      Modular Persona Artwork
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Displayed to other students during 7-minute chats.
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/avatar')}
                  leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                >
                  Customize Avatar
                </Button>
              </div>

              {/* Private Gender Selection */}
              <div className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Private Gender
                    </span>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Never shown to strangers. Manually chosen and permanently private.
                    </p>
                  </div>
                  {genderSuccessMessage && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ {genderSuccessMessage}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {GENDER_OPTIONS.map((gOption) => {
                    const isSelected = selectedGender === gOption;
                    return (
                      <button
                        key={gOption}
                        type="button"
                        disabled={isSavingGender}
                        onClick={() => handleGenderSave(gOption)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-600 text-brand-700 dark:text-brand-300 shadow-sm ring-1 ring-brand-500'
                            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-750'
                        }`}
                      >
                        {gOption}
                      </button>
                    );
                  })}
                </div>
                {genderError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{genderError}</p>
                )}
              </div>

              {/* Private Cohort Setup */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Academic Details
                  </span>
                  <p className="text-xs text-gray-900 dark:text-white font-medium">
                    Dept: <span className="font-semibold text-brand-600 dark:text-brand-400">{profile?.department || 'RIT'}</span>
                    {profile?.batch && ` • Batch: ${profile.batch}`}
                    {profile?.section && ` • Section: ${profile.section}`}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Stored privately. Never exposed to strangers in chat.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/profile/setup')}
                >
                  Edit Details
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION B: COLLEGE VERIFICATION
          ========================================================================= */}
      <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <CardTitle className="text-lg sm:text-xl text-gray-900 dark:text-white">
                College Verification
              </CardTitle>
            </div>
            {isVerified ? (
              <Badge variant="success" size="sm" withDot>
                Verified
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Not Verified
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
            {isVerified
              ? 'Your RIT identity is verified and locked to your account.'
              : 'Choose either Physical ID or College Email to verify your RIT identity.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isVerified ? (
            /* UNVERIFIED STATE */
            <div className="p-4 sm:p-5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    Status:
                  </h4>
                  <Badge variant="neutral" size="sm">
                    Not Verified
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Verification unlocks your anonymous profile customization. You can still chat without verification.
                </p>
              </div>

              <div className="pt-1 space-y-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-slate-300 block">
                  Choose verification method:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/verify?method=physical')}
                    leftIcon={<CreditCard className="h-4 w-4" />}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    className="justify-between"
                  >
                    Scan Physical RIT ID
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/verify?method=email')}
                    leftIcon={<Mail className="h-4 w-4" />}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    className="justify-between"
                  >
                    Verify with College Email
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* VERIFIED STATE */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                      ✓ Verified
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-slate-300">
                      Method:{' '}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {profile?.verification_method === 'college_email'
                          ? 'College Email'
                          : 'Physical ID'}
                      </span>
                      {profile?.department && ` • ${profile.department}`}
                      {profile?.batch && ` • Batch: ${profile.batch}`}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnlinkModal(true)}
                  leftIcon={<Unlink className="h-3.5 w-3.5 text-rose-500" />}
                  className="hover:border-rose-300 hover:text-rose-600 text-xs shrink-0"
                >
                  Unlink Verification
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                Your college identity fingerprint ensures 1-to-1 uniqueness across accounts.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION C: APPEARANCE
          ========================================================================= */}
      <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 text-indigo-400" />
            ) : (
              <Sun className="h-5 w-5 text-amber-500" />
            )}
            <CardTitle className="text-lg sm:text-xl text-gray-900 dark:text-white">
              Appearance
            </CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
            Choose your preferred theme style for the interface.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {/* Light Mode Option */}
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-4 rounded-xl border text-left transition-all flex items-center gap-3 ${
                theme === 'light'
                  ? 'border-brand-600 bg-brand-50/70 text-brand-900 shadow-sm ring-2 ring-brand-500/20'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-gray-300'
              }`}
            >
              <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold block">Light</span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">Crisp & Clean</span>
              </div>
            </button>

            {/* Dark Mode Option */}
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-xl border text-left transition-all flex items-center gap-3 ${
                theme === 'dark'
                  ? 'border-brand-500 bg-brand-950/40 text-white shadow-sm ring-2 ring-brand-500/30'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-gray-300'
              }`}
            >
              <div className="h-8 w-8 rounded-lg bg-indigo-950 text-indigo-400 flex items-center justify-center shrink-0">
                <Moon className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold block">Dark</span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">Deep & Focused</span>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION D: ACCOUNT / LOGOUT
          ========================================================================= */}
      <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-gray-500 dark:text-slate-400" />
            <CardTitle className="text-lg sm:text-xl text-gray-900 dark:text-white">
              Account
            </CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
            Manage your authenticated session and sign out.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider block">
                Session Identity
              </span>
              <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-200">
                {user?.email || `User: ${user?.id.slice(0, 8)}...`}
              </span>
            </div>

            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleLogout}
              leftIcon={<LogOut className="h-4 w-4" />}
            >
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Unlink Confirmation Modal */}
      <Modal
        isOpen={showUnlinkModal}
        onClose={() => setShowUnlinkModal(false)}
        title="Unlink College Identity"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Are you sure you want to unlink your ID?</p>
              <p>
                You can still chat anonymously using the safe fallback persona (Unknown User).
                Custom username and avatar customization will be locked until you link your ID again.
              </p>
            </div>
          </div>

          {unlinkError && (
            <ErrorMessage
              title="Unlink Error"
              message={unlinkError}
              onDismiss={() => setUnlinkError(null)}
            />
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isUnlinking}
              onClick={() => setShowUnlinkModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isUnlinking}
              loadingText="Unlinking..."
              onClick={handleUnlink}
            >
              Confirm Unlink
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettingsPage;
