/**
 * ============================================================================
 * TALK TO RITIANS - Campus Profile Setup Page (Phase 8)
 * ============================================================================
 * Final onboarding step after College ID verification, anonymous username
 * selection, and avatar customization.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Badge,
  ErrorMessage,
  Modal,
} from '../components';
import { useAuth } from '../context';
import {
  SECTION_OPTIONS,
  CLASS_OPTIONS,
  GRADUATION_YEAR_OPTIONS,
  GENDER_OPTIONS,
  normalizeDepartment,
  normalizeBatch,
  deriveGraduationYearFromBatch,
  validateProfileSetup,
  ProfileSetupFormValues,
} from '../config/profileConfig';
import { profileService } from '../services/profileService';

export const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();

  const isCollegeVerified = Boolean(profile?.college_identity_linked);
  const isGenderLocked = Boolean(profile?.gender_locked_at || (profile?.gender && profile.gender.trim() !== ''));

  // Determine QR-supplied initial values
  const qrDeptCode = normalizeDepartment(profile?.department);
  const qrBatchNorm = normalizeBatch(profile?.batch);

  // Form State
  const [department, setDepartment] = useState<string>(qrDeptCode || 'CSE');
  const [section, setSection] = useState<string>(profile?.section || 'A');
  const [className, setClassName] = useState<string>(profile?.class_name || CLASS_OPTIONS[1]);
  const [batch, setBatch] = useState<string>(qrBatchNorm || '2023-2027');
  const [graduationYear, setGraduationYear] = useState<number>(() => {
    if (profile?.graduation_year && profile.graduation_year >= 2024) {
      return profile.graduation_year;
    }
    const derived = deriveGraduationYearFromBatch(qrBatchNorm || '2023-2027');
    return derived || 2027;
  });
  const [gender, setGender] = useState<string>(profile?.gender || 'Prefer not to say');
  const [genderToConfirm, setGenderToConfirm] = useState<string | null>(null);

  // Validation & Submission State
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileSetupFormValues, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Synchronize when profile updates from context
  useEffect(() => {
    if (profile) {
      const detectedDept = normalizeDepartment(profile.department);
      if (detectedDept) {
        setDepartment(detectedDept);
      }
      const detectedBatch = normalizeBatch(profile.batch);
      if (detectedBatch) {
        setBatch(detectedBatch);
        const derived = deriveGraduationYearFromBatch(detectedBatch);
        if (derived && (!profile.graduation_year || profile.graduation_year < 2024)) {
          setGraduationYear(derived);
        }
      }
      if (profile.section) setSection(profile.section);
      if (profile.class_name) setClassName(profile.class_name);
      if (profile.graduation_year) setGraduationYear(profile.graduation_year);
      if (profile.gender) setGender(profile.gender);
    }
  }, [profile]);

  const executeSave = async (confirmedGender: string) => {
    if (!isCollegeVerified) {
      setSubmitError('You must verify your college ID before completing your profile.');
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (!isGenderLocked) {
        const genderRes = await profileService.saveGender(confirmedGender);
        if (!genderRes.success && genderRes.error?.code !== 'GENDER_ALREADY_LOCKED') {
          setIsSubmitting(false);
          setSubmitError(genderRes.error?.message || 'Failed to save gender.');
          return;
        }
      }

      const res = await profileService.saveProfileData({
        department,
        section,
        className,
        batch,
        graduationYear: Number(graduationYear),
        gender: confirmedGender,
      });

      if (!res.success) {
        setIsSubmitting(false);
        setSubmitError(res.error?.message || 'Failed to save profile. Please try again.');
        return;
      }

      await refreshProfile();
      setIsSubmitting(false);
      navigate('/settings');
    } catch (err: unknown) {
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setSubmitError(msg);
    }
  };

  /**
   * Handle Form Submission
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isCollegeVerified) {
      setSubmitError('You must verify your college ID before completing your profile.');
      return;
    }

    const formValues: ProfileSetupFormValues = {
      department,
      section,
      className,
      batch,
      graduationYear,
      gender,
    };

    // Client-side validation
    const validation = validateProfileSetup(formValues);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setSubmitError('Please correct the highlighted fields before submitting.');
      return;
    }

    if (!isGenderLocked) {
      setGenderToConfirm(gender);
    } else {
      executeSave(profile?.gender || gender);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      {/* Header & Step Badge */}
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Profile Customization &bull; Cohort Details
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Complete Your Profile
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          Help us keep the community relevant and safe.
        </p>
      </div>

      {/* Verification Gate */}
      {!isCollegeVerified ? (
        <Card className="border-gray-200 bg-white shadow-card text-center p-8 space-y-5 animate-in fade-in">
          <div className="h-16 w-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-gray-900">College ID Required</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Academic profile setup is restricted to verified students. Please scan your physical ID card first.
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
              Verify College ID Now
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border-gray-200 bg-white shadow-card">
          {/* Privacy Guarantee Banner */}
          <div className="bg-gray-50/80 border-b border-gray-100 p-4 sm:p-5 flex items-start gap-3.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Privacy Guarantee
                </h2>
                <Badge variant="success" size="sm">
                  Sealed
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500 leading-relaxed">
                These academic fields are strictly <strong className="text-gray-700 font-semibold">private matching metadata</strong>.
                Chat partners will <strong className="text-gray-700 font-semibold">never</strong> see your real details.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 pt-6 sm:p-6">
              {submitError && (
                <ErrorMessage
                  title="Profile Setup Error"
                  message={submitError}
                  onDismiss={() => setSubmitError(null)}
                />
              )}

              {/* Verified Student Information (Read-Only & Immutable) */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Verified Student Information
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Verified &bull; Immutable
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Name</span>
                    <span className="font-bold text-gray-900 truncate block mt-0.5">
                      {profile?.name || profile?.full_name || 'Verified Student'}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Department</span>
                    <span className="font-semibold text-brand-600 block mt-0.5">
                      {department}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Batch</span>
                    <span className="font-mono font-semibold text-gray-800 block mt-0.5">
                      {batch}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Institutional credentials from your verified ID. Permanently immutable and cannot be edited.
                </p>
              </div>

              {/* Grid for Class and Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Field 2: Academic Year / Class */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="class-select"
                    className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                  >
                    <GraduationCap className="h-3.5 w-3.5 text-brand-600" />
                    <span>Class</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="class-select"
                    value={className}
                    onChange={(e) => {
                      setClassName(e.target.value);
                      if (fieldErrors.className) {
                        setFieldErrors((prev) => ({ ...prev, className: undefined }));
                      }
                    }}
                    className="w-full bg-white text-gray-900 rounded-xl border border-gray-200 hover:border-gray-300 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10"
                  >
                    {CLASS_OPTIONS.map((c) => (
                      <option key={c} value={c} className="text-gray-900">
                        {c}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.className && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.className}</p>
                  )}
                </div>

                {/* Field 3: Section */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="section-select"
                    className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                  >
                    <Layers className="h-3.5 w-3.5 text-brand-600" />
                    <span>Section</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="section-select"
                    value={section}
                    onChange={(e) => {
                      setSection(e.target.value);
                      if (fieldErrors.section) {
                        setFieldErrors((prev) => ({ ...prev, section: undefined }));
                      }
                    }}
                    className="w-full bg-white text-gray-900 rounded-xl border border-gray-200 hover:border-gray-300 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10"
                  >
                    {SECTION_OPTIONS.map((sec) => (
                      <option key={sec} value={sec} className="text-gray-900">
                        Section {sec}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.section && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.section}</p>
                  )}
                </div>
              </div>

              {/* Grid for Graduation Year & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Field 4: Expected Graduation Year */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="grad-year-select"
                    className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5 text-brand-600" />
                    <span>Graduation Year</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="grad-year-select"
                    value={graduationYear}
                    onChange={(e) => {
                      setGraduationYear(parseInt(e.target.value, 10));
                      if (fieldErrors.graduationYear) {
                        setFieldErrors((prev) => ({ ...prev, graduationYear: undefined }));
                      }
                    }}
                    className="w-full bg-white text-gray-900 rounded-xl border border-gray-200 hover:border-gray-300 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10"
                  >
                    {GRADUATION_YEAR_OPTIONS.map((yr) => (
                      <option key={yr} value={yr} className="text-gray-900">
                        Class of {yr}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.graduationYear && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.graduationYear}</p>
                  )}
                </div>

                {/* Field 5: Gender */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="gender-select"
                      className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                    >
                      <Users className="h-3.5 w-3.5 text-brand-600" />
                      <span>Gender</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    {isGenderLocked && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full font-medium">
                        <Lock className="h-3 w-3 text-gray-500" />
                        Locked
                      </span>
                    )}
                  </div>
                  {isGenderLocked ? (
                    <div className="w-full bg-gray-50 text-gray-800 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold">
                      {profile?.gender || gender}
                    </div>
                  ) : (
                    <select
                      id="gender-select"
                      value={gender}
                      onChange={(e) => {
                        setGender(e.target.value);
                        if (fieldErrors.gender) {
                          setFieldErrors((prev) => ({ ...prev, gender: undefined }));
                        }
                      }}
                      className="w-full bg-white text-gray-900 rounded-xl border border-gray-200 hover:border-gray-300 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10"
                    >
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g} value={g} className="text-gray-900">
                          {g}
                        </option>
                      ))}
                    </select>
                  )}
                  {fieldErrors.gender && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.gender}</p>
                  )}
                  <p className="text-[11px] text-gray-400">
                    {isGenderLocked
                      ? 'Gender is frozen and permanently immutable.'
                      : 'You will choose gender once, after which it cannot be modified.'}
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-gray-100 pt-5">
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
                isLoading={isSubmitting}
                loadingText="Saving Profile..."
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="py-2.5 font-semibold shadow-sm"
              >
                Save Profile
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* Confirm Your Gender Modal */}
      <Modal
        isOpen={Boolean(genderToConfirm)}
        onClose={() => setGenderToConfirm(null)}
        title="Confirm your gender"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
            <span className="text-xs text-gray-500 block">Selected:</span>
            <span className="text-base font-bold text-gray-900 block">
              {genderToConfirm}
            </span>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            You won't be able to change this after confirming.
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setGenderToConfirm(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              loadingText="Confirming..."
              onClick={() => genderToConfirm && executeSave(genderToConfirm)}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProfileSetupPage;
