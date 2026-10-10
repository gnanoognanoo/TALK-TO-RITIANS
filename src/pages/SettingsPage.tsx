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
  MessageSquare,
  Terminal,
  Upload,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Avatar,
  Modal,
  ErrorMessage,
  HeisenbergSignature,
} from '../components';
import { useAuth, useTheme } from '../context';
import { GENDER_OPTIONS } from '../config/profileConfig';
import { profileService } from '../services/profileService';
import { staffService } from '../services/staffService';
import { getRandomShortAlias } from '../services/aliasPool';
import { getEffectivePersona } from '../utils/persona';
import { presenceService } from '../services/presenceService';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, isStaff, staffRole, refreshProfile, unlinkCollegeIdentity, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const effectivePersona = getEffectivePersona(profile, isStaff);
  const isVerified = effectivePersona.isVerified;
  const displayUsername = effectivePersona.displayUsername;

  // Short random alias reroll state (Change 4: No manual text entry, unlimited rerolls)
  const [aliasCandidate, setAliasCandidate] = useState<string>(() => {
    if (isVerified && profile?.display_username && !profile.display_username.startsWith('Unknown User')) {
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

  // Developer persona state (manual username + gallery avatar upload)
  const [devUsername, setDevUsername] = useState<string>(() => {
    if (profile?.display_username && !profile.display_username.startsWith('Unknown User')) {
      return profile.display_username;
    }
    return 'Heisenberg';
  });
  const [devAvatarUrl, setDevAvatarUrl] = useState<string | null>(() => {
    if (profile?.avatar_config && typeof profile.avatar_config === 'object' && 'url' in profile.avatar_config) {
      return (profile.avatar_config as { url?: string }).url || null;
    }
    return null;
  });
  const [isUploadingDevAvatar, setIsUploadingDevAvatar] = useState<boolean>(false);
  const [isSavingDevPersona, setIsSavingDevPersona] = useState<boolean>(false);
  const [devPersonaSuccess, setDevPersonaSuccess] = useState<string | null>(null);
  const [devPersonaError, setDevPersonaError] = useState<string | null>(null);

  // Sync dev persona when profile changes
  useEffect(() => {
    if (profile?.display_username && !profile.display_username.startsWith('Unknown User')) {
      setDevUsername(profile.display_username);
    }
    if (profile?.avatar_config && typeof profile.avatar_config === 'object' && 'url' in profile.avatar_config) {
      setDevAvatarUrl((profile.avatar_config as { url?: string }).url || null);
    }
  }, [profile?.display_username, profile?.avatar_config]);

  const handleUploadDevAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDevAvatar(true);
    setDevPersonaError(null);
    setDevPersonaSuccess(null);

    const res = await staffService.uploadDeveloperAvatar(file);
    setIsUploadingDevAvatar(false);

    if (!res.success || !res.data) {
      setDevPersonaError(res.error?.message || 'Failed to upload avatar.');
      return;
    }

    setDevAvatarUrl(res.data.publicUrl);
    setDevPersonaSuccess('Avatar uploaded! Click Save Developer Persona to apply.');
  };

  const handleSaveDevPersona = async () => {
    setIsSavingDevPersona(true);
    setDevPersonaError(null);
    setDevPersonaSuccess(null);

    const res = await staffService.setDeveloperPersona(devUsername, devAvatarUrl || undefined);
    setIsSavingDevPersona(false);

    if (!res.success) {
      setDevPersonaError(res.error?.message || 'Failed to save developer persona.');
      return;
    }

    await refreshProfile();
    setDevPersonaSuccess('Developer persona saved successfully!');
    setTimeout(() => setDevPersonaSuccess(null), 3000);
  };

  // Gender selection & freeze state
  const isGenderLocked = Boolean(profile?.gender_locked_at || (profile?.gender && profile.gender.trim() !== ''));
  const [selectedGender, setSelectedGender] = useState<string | null>(profile?.gender || null);
  const [genderToConfirm, setGenderToConfirm] = useState<string | null>(null);
  const [isSavingGender, setIsSavingGender] = useState<boolean>(false);
  const [genderSuccessMessage, setGenderSuccessMessage] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);

  // Random chat request preference state (Phase 3 Fix)
  const [chatRequestsEnabled, setChatRequestsEnabled] = useState<boolean>(() =>
    presenceService.isChatRequestsEnabled()
  );

  const handleToggleChatRequests = () => {
    const nextVal = !chatRequestsEnabled;
    setChatRequestsEnabled(nextVal);
    presenceService.setChatRequestsEnabled(nextVal);
  };

  // Sync selectedGender if profile updates
  useEffect(() => {
    if (profile?.gender) {
      setSelectedGender(profile.gender);
    }
  }, [profile?.gender]);

  // Unlink modal state
  const [showUnlinkModal, setShowUnlinkModal] = useState<boolean>(false);
  const [isUnlinking, setIsUnlinking] = useState<boolean>(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Save and lock private gender
  const handleConfirmGender = async () => {
    if (!genderToConfirm) return;
    setIsSavingGender(true);
    setGenderError(null);
    setGenderSuccessMessage(null);

    const res = await profileService.saveGender(genderToConfirm);
    setIsSavingGender(false);

    if (!res.success) {
      setGenderError(res.error?.message || 'Failed to save gender preference.');
      return;
    }

    setSelectedGender(genderToConfirm);
    setGenderToConfirm(null);
    await refreshProfile();
    setGenderSuccessMessage('Gender confirmed & locked.');
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
    <div className="max-w-2xl mx-auto w-full px-3.5 sm:px-6 py-6 sm:py-10 space-y-6 animate-in fade-in pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[rgba(141,168,82,0.15)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F4F6F1] tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-[#9DA89A] mt-0.5">
            Anonymous persona, campus verification &amp; preferences
          </p>
        </div>
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] active:scale-95 transition-all"
        >
          <span>← Home</span>
        </Link>
      </div>

      {/* =========================================================================
          DEVELOPER SECTION (Authorized Staff Only)
          ========================================================================= */}
      {isStaff && (
        <Card className="border-amber-500/40 bg-[#14120A] shadow-[0_4px_20px_rgba(227,163,41,0.12)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-amber-400" />
                <CardTitle className="text-base sm:text-lg text-[#F4F6F1]">
                  Developer Controls
                </CardTitle>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                {staffRole?.toUpperCase() || 'DEVELOPER'}
              </span>
            </div>
            <CardDescription className="text-xs text-[#9DA89A]">
              Platform administration, realtime analytics &amp; custom staff persona.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30">
              <div className="text-xs text-[#9DA89A]">
                <strong className="text-amber-300 block mb-0.5">Developer Console</strong>
                <span>Realtime campus metrics, active rooms, online users &amp; audit log.</span>
              </div>
              <Link to="/developer" className="shrink-0">
                <button
                  type="button"
                  className="w-full sm:w-auto px-4 py-2 rounded-full text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black active:scale-95 transition-all shadow-[0_2px_12px_rgba(227,163,41,0.3)]"
                >
                  Open Console →
                </button>
              </Link>
            </div>

            {/* Developer Persona Customization */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="dev-username-input" className="text-xs font-semibold text-[#9DA89A] uppercase tracking-wider block">
                    Custom Anonymous Handle
                  </label>
                  <span className="text-[11px] font-mono text-[#6F796D]">
                    {devUsername.length}/20 chars
                  </span>
                </div>
                <input
                  id="dev-username-input"
                  type="text"
                  value={devUsername}
                  onChange={(e) => setDevUsername(e.target.value)}
                  maxLength={20}
                  placeholder="e.g. Heisenberg"
                  className="liquid-inset w-full px-3.5 py-2 text-sm rounded-xl border border-[rgba(141,168,82,0.2)] bg-[#060A06] text-[#F4F6F1] focus:outline-none focus:border-amber-400 font-medium"
                />
              </div>

              {/* Gallery Avatar Upload */}
              <div className="p-3.5 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] flex flex-col sm:flex-row sm:items-center gap-4">
                <Avatar
                  size="lg"
                  src={devAvatarUrl || undefined}
                  avatarConfig={!devAvatarUrl ? effectivePersona.avatarConfig : undefined}
                  initials={devUsername.slice(0, 2).toUpperCase()}
                  shape="circle"
                />
                <div className="space-y-1.5 flex-1">
                  <span className="text-xs font-bold text-[#F4F6F1] block">
                    Gallery Avatar Upload
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#121E12] border border-[rgba(141,168,82,0.25)] text-xs font-semibold text-[#A2BD63] hover:bg-[#182B18] cursor-pointer transition-all active:scale-95">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{isUploadingDevAvatar ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleUploadDevAvatar}
                        disabled={isUploadingDevAvatar}
                        className="hidden"
                      />
                    </label>
                    {devAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setDevAvatarUrl(null)}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Feedback */}
              {devPersonaError && (
                <p className="text-xs text-rose-400 font-medium">{devPersonaError}</p>
              )}
              {devPersonaSuccess && (
                <p className="text-xs text-[#A2BD63] font-semibold">✓ {devPersonaSuccess}</p>
              )}

              <button
                type="button"
                disabled={isSavingDevPersona}
                onClick={handleSaveDevPersona}
                className="liquid-cta-btn px-5 py-2.5 rounded-full text-xs font-bold text-white shadow-sm active:scale-95 transition-all"
              >
                {isSavingDevPersona ? 'Saving...' : 'Save Developer Persona'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* =========================================================================
          SECTION 1: PERSONA
          ========================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#8DA852]" />
              <CardTitle className="text-base sm:text-lg text-[#F4F6F1]">
                Persona
              </CardTitle>
            </div>
            {isStaff ? (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-semibold">
                Staff Persona
              </span>
            ) : isVerified ? (
              <span className="px-2.5 py-0.5 rounded-full bg-[#121E12] border border-[rgba(141,168,82,0.3)] text-[#A2BD63] text-[11px] font-semibold">
                ✓ Unlocked
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-[#14120A] border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                Locked
              </span>
            )}
          </div>
          <CardDescription className="text-xs text-[#9DA89A]">
            {isVerified
              ? 'Customize your anonymous identity and avatar for 7-minute chats.'
              : 'Link your physical RIT ID to unlock anonymous handle & avatar customization.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-1">
          {!isVerified && !isStaff ? (
            /* Locked State */
            <div className="p-5 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] text-center space-y-3">
              <div className="h-10 w-10 rounded-full bg-[#121E12] text-[#8DA852] flex items-center justify-center mx-auto border border-[rgba(141,168,82,0.2)]">
                <Lock className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#F4F6F1]">
                  Profile Customization Locked
                </h4>
                <p className="text-xs text-[#9DA89A] max-w-sm mx-auto leading-relaxed">
                  You are currently chatting as <span className="font-mono text-[#A2BD63]">{displayUsername}</span>. Scan your physical RIT student ID to unlock custom alias rerolling and modular avatars.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/verify')}
                className="liquid-cta-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-white shadow-sm active:scale-95 transition-all"
              >
                <span>Verify RIT ID Now</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            /* Verified Persona Controls */
            <div className="space-y-5">
              {/* Alias Reroll UI */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#9DA89A] uppercase tracking-wider block">
                    Anonymous Handle
                  </span>
                  {aliasSuccessMessage && (
                    <span className="text-xs font-semibold text-[#A2BD63]">
                      ✓ {aliasSuccessMessage}
                    </span>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-[#091009]/90 border border-[rgba(141,168,82,0.2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#121E12] border border-[rgba(141,168,82,0.25)] flex items-center justify-center text-[#A2BD63] font-bold text-sm shrink-0">
                      {aliasCandidate.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span id="alias-candidate-display" className="text-lg sm:text-xl font-extrabold text-[#F4F6F1] tracking-tight">
                          {aliasCandidate}
                        </span>
                        <button
                          type="button"
                          id="alias-refresh-button"
                          onClick={handleRefreshAlias}
                          title="Generate another alias"
                          className="p-1.5 rounded-full text-[#9DA89A] hover:text-[#F4F6F1] hover:bg-[#121E12] active:scale-95 transition-all"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-[11px] text-[#6F796D]">
                        {aliasCandidate === displayUsername ? 'Active handle' : 'Candidate preview — tap Use to apply'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="alias-save-button"
                    disabled={isSavingAlias || aliasCandidate === displayUsername}
                    onClick={handleSaveAlias}
                    className="liquid-cta-btn px-4 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40 active:scale-95 transition-all shadow-sm shrink-0"
                  >
                    {aliasCandidate === displayUsername ? 'Active' : `Use ${aliasCandidate}`}
                  </button>
                </div>
                {aliasError && (
                  <p className="text-xs text-rose-400">{aliasError}</p>
                )}
              </div>

              {/* Avatar Selection */}
              <div className="p-3.5 rounded-2xl bg-[#091009]/70 border border-[rgba(141,168,82,0.18)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    size="lg"
                    avatarConfig={effectivePersona.avatarConfig}
                    initials={effectivePersona.initials}
                    shape="circle"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#F4F6F1] block">Modular Avatar</span>
                    <span className="text-[11px] text-[#9DA89A]">Face, hairstyles, expressions &amp; clothing</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/avatar')}
                  className="px-3.5 py-2 rounded-full text-xs font-semibold text-[#A2BD63] bg-[#121E12] border border-[rgba(141,168,82,0.25)] hover:bg-[#182B18] active:scale-95 transition-all shrink-0 inline-flex items-center gap-1.5"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Customize</span>
                </button>
              </div>

              {/* Private Gender Selection & Freeze */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#9DA89A] uppercase tracking-wider block">
                    Private Gender
                  </span>
                  {genderSuccessMessage && (
                    <span className="text-xs font-semibold text-[#A2BD63]">
                      ✓ {genderSuccessMessage}
                    </span>
                  )}
                </div>

                {isGenderLocked ? (
                  <div className="p-3 rounded-xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] flex items-center justify-between text-xs">
                    <span className="text-[#9DA89A]">
                      Gender: <strong className="text-[#F4F6F1] ml-1">{profile?.gender || selectedGender}</strong>
                    </span>
                    <span className="text-[11px] font-semibold text-[#A2BD63] px-2 py-0.5 rounded-full bg-[#121E12]">
                      ✓ Locked
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {GENDER_OPTIONS.map((gOption) => (
                      <button
                        key={gOption}
                        type="button"
                        onClick={() => setGenderToConfirm(gOption)}
                        className="py-2 px-3 rounded-xl border border-[rgba(141,168,82,0.2)] bg-[#091009] text-xs font-medium text-[#F4F6F1] hover:border-[#8DA852] hover:bg-[#121E12] active:scale-95 transition-all"
                      >
                        {gOption}
                      </button>
                    ))}
                  </div>
                )}
                {genderError && <p className="text-xs text-rose-400">{genderError}</p>}
              </div>

              {/* Verified Student Credentials (Immutable) */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-semibold text-[#9DA89A] uppercase tracking-wider block">
                  Student Verification Details
                </span>
                <div className="p-3.5 rounded-xl bg-[#091009]/80 border border-[rgba(141,168,82,0.15)] text-xs space-y-1.5">
                  <div className="flex justify-between py-0.5 border-b border-[rgba(141,168,82,0.1)]">
                    <span className="text-[#9DA89A]">Name</span>
                    <span className="font-bold text-[#F4F6F1]">{profile?.name || profile?.full_name || 'Verified Student'}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-[rgba(141,168,82,0.1)]">
                    <span className="text-[#9DA89A]">Department</span>
                    <span className="font-semibold text-[#A2BD63]">{profile?.department || 'RIT'}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-[#9DA89A]">Batch</span>
                    <span className="font-mono text-[#F4F6F1]">{profile?.batch || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION 2: VERIFICATION
          ========================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#8DA852]" />
              <CardTitle className="text-base sm:text-lg text-[#F4F6F1]">
                Verification
              </CardTitle>
            </div>
            {isVerified ? (
              <span className="px-2.5 py-0.5 rounded-full bg-[#121E12] text-[#A2BD63] text-[11px] font-semibold">
                ✓ Verified
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-[#14120A] text-amber-300 text-[11px] font-semibold">
                Unverified
              </span>
            )}
          </div>
          <CardDescription className="text-xs text-[#9DA89A]">
            {isVerified
              ? 'Your RIT identity is cryptographically linked.'
              : 'Scan your physical RIT student ID to link your campus status.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          {!isVerified ? (
            <div className="p-4 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] space-y-3">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#F4F6F1] block">
                  Verify your RIT identity
                </span>
                <p className="text-xs text-[#9DA89A] leading-relaxed">
                  Scan the QR code on your card to link your student status and unlock your custom persona.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/verify')}
                className="liquid-cta-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-white shadow-sm active:scale-95 transition-all"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Scan Physical RIT ID</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-[#121E12] text-[#8DA852] flex items-center justify-center shrink-0 border border-[rgba(141,168,82,0.25)]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-[#F4F6F1] block">Physical RIT ID Verified</span>
                  <span className="text-[#9DA89A]">{profile?.department ? `${profile.department} • Batch ${profile.batch || ''}` : 'Active enrollment linked'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUnlinkModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/20 border border-rose-500/30 hover:bg-rose-950/40 active:scale-95 transition-all shrink-0"
              >
                <Unlink className="h-3.5 w-3.5" />
                <span>Unlink ID</span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION 3: APPEARANCE
          ========================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 text-[#A2BD63]" />
            ) : (
              <Sun className="h-5 w-5 text-amber-400" />
            )}
            <CardTitle className="text-base sm:text-lg text-[#F4F6F1]">
              Appearance
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-[#9DA89A]">
            Select your visual aesthetic. Dark mode is optimized with Heisenberg chemistry depth.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-1">
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {/* Light Mode */}
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-3.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all active:scale-95 ${
                theme === 'light'
                  ? 'border-[#8DA852] bg-[#121E12] shadow-sm'
                  : 'border-[rgba(141,168,82,0.18)] bg-[#091009] hover:border-[rgba(141,168,82,0.3)]'
              }`}
            >
              <Sun className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-[#F4F6F1] block">Light</span>
                <span className="text-[10px] text-[#9DA89A]">Clean</span>
              </div>
            </button>

            {/* Dark Mode */}
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-3.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all active:scale-95 ${
                theme === 'dark'
                  ? 'border-[#8DA852] bg-[#121E12] shadow-[0_0_12px_rgba(141,168,82,0.2)]'
                  : 'border-[rgba(141,168,82,0.18)] bg-[#091009] hover:border-[rgba(141,168,82,0.3)]'
              }`}
            >
              <Moon className="h-4 w-4 text-[#A2BD63] shrink-0" />
              <div>
                <span className="text-xs font-bold text-[#F4F6F1] block">Dark</span>
                <span className="text-[10px] text-[#9DA89A]">Chemical</span>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION 4: CHAT PREFERENCES
          ========================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#8DA852]" />
            <CardTitle className="text-base sm:text-lg text-[#F4F6F1]">
              Chat Preferences
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-[#9DA89A]">
            Control incoming random chat requests while idle online.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-1">
          <div className="p-3.5 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-[#F4F6F1] block">
                Random Chat Requests
              </span>
              <p className="text-[11px] text-[#9DA89A]">
                Allow online students to invite you to chats while idle
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleChatRequests}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                chatRequestsEnabled
                  ? 'bg-[#182B18] border border-[#8DA852] text-[#A2BD63]'
                  : 'bg-[#101A12] border border-[rgba(141,168,82,0.2)] text-[#6F796D]'
              }`}
            >
              {chatRequestsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION 5: ACCOUNT & LOGOUT
          ========================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#8DA852]" />
            <CardTitle className="text-base sm:text-lg text-[#F4F6F1]">
              Account
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-[#9DA89A]">
            Signed-in email identity &amp; session termination.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-1">
          <div className="p-3.5 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] text-[#6F796D] uppercase font-semibold block">Signed In As</span>
              <span className="text-xs font-semibold text-[#F4F6F1] truncate block">
                {user?.email || `User: ${user?.id.slice(0, 8)}...`}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/20 border border-rose-500/30 hover:bg-rose-950/40 active:scale-95 transition-all shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Heisenberg Creator Signature */}
      <div className="pt-4 flex flex-col items-center justify-center text-center">
        <HeisenbergSignature variant="badge" />
      </div>

      {/* Unlink Confirmation Modal */}
      <Modal
        isOpen={showUnlinkModal}
        onClose={() => setShowUnlinkModal(false)}
        title="Unlink RIT ID?"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p>
                This will remove your verified student information, gender selection, anonymous student persona and ID link. You can verify again later as a fresh verification.
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
            <button
              type="button"
              disabled={isUnlinking}
              onClick={() => setShowUnlinkModal(false)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isUnlinking}
              onClick={handleUnlink}
              className="px-4 py-2 rounded-full text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all"
            >
              {isUnlinking ? 'Unlinking & Resetting...' : 'Unlink & Reset'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Your Gender Modal */}
      <Modal
        isOpen={Boolean(genderToConfirm)}
        onClose={() => setGenderToConfirm(null)}
        title="Confirm your gender"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-[#091009] border border-[rgba(141,168,82,0.2)] space-y-1">
            <span className="text-xs text-[#9DA89A] block">Selected:</span>
            <span className="text-base font-bold text-[#F4F6F1] block">
              {genderToConfirm}
            </span>
          </div>

          <p className="text-xs text-[#9DA89A] leading-relaxed">
            You won't be able to change this after confirming.
          </p>

          {genderError && (
            <ErrorMessage
              title="Gender Save Error"
              message={genderError}
              onDismiss={() => setGenderError(null)}
            />
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              disabled={isSavingGender}
              onClick={() => setGenderToConfirm(null)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] transition-all"
            >
              Back
            </button>
            <button
              type="button"
              disabled={isSavingGender}
              onClick={handleConfirmGender}
              className="liquid-cta-btn px-4 py-2 rounded-full text-xs font-bold text-white active:scale-95 transition-all"
            >
              {isSavingGender ? 'Confirming...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettingsPage;
