/**
 * ============================================================================
 * TALK TO RITIANS - Campus Profile Setup Page (Phase 8)
 * ============================================================================
 * Final onboarding step after College ID verification, anonymous username
 * selection, and avatar customization.
 *
 * Captures private student cohort metadata for relevant campus matching:
 * - Department
 * - Section
 * - Class / Academic Year
 * - Batch
 * - Expected Graduation Year
 * - Gender
 *
 * CRITICAL PRIVACY RULE:
 * These fields are strictly PRIVATE profile & matching metadata. They are
 * protected at the database engine level via Row Level Security and are NEVER
 * displayed publicly to strangers in V1 chat.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  GraduationCap,
  Users,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Edit2,
  AlertCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Badge,
  ErrorMessage,
  Spinner,
} from '../components';
import { useAuth } from '../context';
import {
  INSTITUTIONAL_DEPARTMENTS,
  SECTION_OPTIONS,
  CLASS_OPTIONS,
  BATCH_OPTIONS,
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

  // Editability toggles for QR-supplied fields
  const [isDeptLocked, setIsDeptLocked] = useState<boolean>(Boolean(qrDeptCode));
  const [isBatchLocked, setIsBatchLocked] = useState<boolean>(Boolean(qrBatchNorm));

  // Validation & Submission State
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileSetupFormValues, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Automatically sync graduation year when batch changes (unless explicitly customized)
  const handleBatchChange = (newBatch: string) => {
    setBatch(newBatch);
    const derivedGradYear = deriveGraduationYearFromBatch(newBatch);
    if (derivedGradYear) {
      setGraduationYear(derivedGradYear);
    }
    if (fieldErrors.batch) {
      setFieldErrors((prev) => ({ ...prev, batch: undefined }));
    }
  };

  // Synchronize when profile updates from context
  useEffect(() => {
    if (profile) {
      const detectedDept = normalizeDepartment(profile.department);
      if (detectedDept) {
        setDepartment(detectedDept);
        setIsDeptLocked(true);
      }
      const detectedBatch = normalizeBatch(profile.batch);
      if (detectedBatch) {
        setBatch(detectedBatch);
        setIsBatchLocked(true);
        const derived = deriveGraduationYearFromBatch(detectedBatch);
        if (derived) setGraduationYear(derived);
      }
      if (profile.section) setSection(profile.section);
      if (profile.class_name) setClassName(profile.class_name);
      if (profile.graduation_year) setGraduationYear(profile.graduation_year);
      if (profile.gender) setGender(profile.gender);
    }
  }, [profile]);

  /**
   * Handle Form Submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
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

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const res = await profileService.saveProfileData({
        department,
        section,
        className,
        batch,
        graduationYear: Number(graduationYear),
        gender,
      });

      if (!res.success) {
        setIsSubmitting(false);
        setSubmitError(res.error?.message || 'Failed to save profile. Please try again.');
        return;
      }

      // Refresh auth profile state to sync profile_completed = true
      await refreshProfile();

      setIsSubmitting(false);
      // STEP 6: Route to /home
      navigate('/home');
    } catch (err: unknown) {
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setSubmitError(msg);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header & Step Badge */}
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Onboarding Step 3
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Campus Profile Setup
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          Provide your academic cohort details for relevant peer matching. Real student data is
          permanently sealed from chat rooms.
        </p>
      </div>

      {/* =========================================================================
          GATE CHECK: If college ID is not yet linked
          ========================================================================= */}
      {!isCollegeVerified ? (
        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl text-center p-8 space-y-5 animate-in fade-in">
          <div className="h-16 w-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 mx-auto flex items-center justify-center">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h2 className="text-lg font-bold text-white">College Verification Required</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Profile setup is unlocked exclusively for verified Rajalakshmi Institute of Technology
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
              Verify College ID Now
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
          {/* Strict Privacy Guarantee Banner */}
          <div className="bg-slate-950/80 border-b border-slate-800/80 p-4 sm:p-5 flex items-start gap-3.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Cryptographic Privacy Guarantee
                </h2>
                <Badge variant="success" size="sm">
                  Sealed
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                These academic fields are strictly <strong className="text-slate-300">private metadata</strong> used
                for peer matching. Under Row-Level Security, matched strangers in chat rooms will
                <strong className="text-rose-300"> never</strong> see your department, section, batch, or gender.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6 pt-6 sm:p-6">
              {submitError && (
                <ErrorMessage
                  title="Profile Setup Error"
                  message={submitError}
                />
              )}

              {/* Field 1: Department */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="department-select"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                  >
                    <BookOpen className="h-4 w-4 text-brand-400" />
                    <span>Department / Branch</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  {isDeptLocked ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified from ID Card
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDeptLocked(false)}
                        className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500">Official RIT Departments</span>
                  )}
                </div>

                <select
                  id="department-select"
                  value={department}
                  disabled={isDeptLocked}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    if (fieldErrors.department) {
                      setFieldErrors((prev) => ({ ...prev, department: undefined }));
                    }
                  }}
                  className={`
                    w-full bg-slate-900 text-slate-100 rounded-xl border px-4 py-2.5 text-sm transition-colors
                    focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500
                    ${isDeptLocked ? 'opacity-85 cursor-not-allowed bg-slate-950 border-slate-800' : 'border-slate-800 hover:border-slate-700'}
                    ${fieldErrors.department ? 'border-rose-500/60 focus-visible:ring-rose-500' : 'focus-visible:border-brand-500'}
                  `.trim()}
                >
                  {INSTITUTIONAL_DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.code} className="bg-slate-900 text-slate-100">
                      {dept.code} &mdash; {dept.name}
                    </option>
                  ))}
                </select>

                {fieldErrors.department ? (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.department}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Used to match you with peers in your field of study.
                  </p>
                )}
              </div>

              {/* Two-Column Grid: Section & Class */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Field 2: Section */}
                <div className="space-y-2">
                  <label
                    htmlFor="section-select"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                  >
                    <Layers className="h-4 w-4 text-cyan-400" />
                    <span>Section / Division</span>
                    <span className="text-rose-400">*</span>
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
                    className={`
                      w-full bg-slate-900 text-slate-100 rounded-xl border border-slate-800 px-4 py-2.5 text-sm transition-colors
                      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500
                      ${fieldErrors.section ? 'border-rose-500/60 focus-visible:ring-rose-500' : 'focus-visible:border-brand-500'}
                    `.trim()}
                  >
                    {SECTION_OPTIONS.map((sec) => (
                      <option key={sec} value={sec} className="bg-slate-900 text-slate-100">
                        Section {sec}
                      </option>
                    ))}
                  </select>

                  {fieldErrors.section && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.section}
                    </p>
                  )}
                </div>

                {/* Field 3: Class / Academic Year */}
                <div className="space-y-2">
                  <label
                    htmlFor="class-select"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                  >
                    <GraduationCap className="h-4 w-4 text-emerald-400" />
                    <span>Current Class Year</span>
                    <span className="text-rose-400">*</span>
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
                    className={`
                      w-full bg-slate-900 text-slate-100 rounded-xl border border-slate-800 px-4 py-2.5 text-sm transition-colors
                      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500
                      ${fieldErrors.className ? 'border-rose-500/60 focus-visible:ring-rose-500' : 'focus-visible:border-brand-500'}
                    `.trim()}
                  >
                    {CLASS_OPTIONS.map((yr) => (
                      <option key={yr} value={yr} className="bg-slate-900 text-slate-100">
                        {yr}
                      </option>
                    ))}
                  </select>

                  {fieldErrors.className && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.className}
                    </p>
                  )}
                </div>
              </div>

              {/* Two-Column Grid: Batch & Expected Graduation Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Field 4: Batch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="batch-select"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                    >
                      <Calendar className="h-4 w-4 text-amber-400" />
                      <span>Academic Batch</span>
                      <span className="text-rose-400">*</span>
                    </label>
                    {isBatchLocked ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsBatchLocked(false)}
                          className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <select
                    id="batch-select"
                    value={batch}
                    disabled={isBatchLocked}
                    onChange={(e) => handleBatchChange(e.target.value)}
                    className={`
                      w-full bg-slate-900 text-slate-100 rounded-xl border px-4 py-2.5 text-sm transition-colors
                      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500
                      ${isBatchLocked ? 'opacity-85 cursor-not-allowed bg-slate-950 border-slate-800' : 'border-slate-800 hover:border-slate-700'}
                      ${fieldErrors.batch ? 'border-rose-500/60 focus-visible:ring-rose-500' : 'focus-visible:border-brand-500'}
                    `.trim()}
                  >
                    {BATCH_OPTIONS.map((b) => (
                      <option key={b} value={b} className="bg-slate-900 text-slate-100">
                        Batch {b}
                      </option>
                    ))}
                  </select>

                  {fieldErrors.batch && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.batch}
                    </p>
                  )}
                </div>

                {/* Field 5: Expected Graduation Year */}
                <div className="space-y-2">
                  <label
                    htmlFor="grad-year-select"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                  >
                    <GraduationCap className="h-4 w-4 text-brand-400" />
                    <span>Graduation Year</span>
                    <span className="text-rose-400">*</span>
                  </label>

                  <select
                    id="grad-year-select"
                    value={graduationYear}
                    onChange={(e) => {
                      setGraduationYear(Number(e.target.value));
                      if (fieldErrors.graduationYear) {
                        setFieldErrors((prev) => ({ ...prev, graduationYear: undefined }));
                      }
                    }}
                    className={`
                      w-full bg-slate-900 text-slate-100 rounded-xl border border-slate-800 px-4 py-2.5 text-sm transition-colors
                      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500
                      ${fieldErrors.graduationYear ? 'border-rose-500/60 focus-visible:ring-rose-500' : 'focus-visible:border-brand-500'}
                    `.trim()}
                  >
                    {GRADUATION_YEAR_OPTIONS.map((yr) => (
                      <option key={yr} value={yr} className="bg-slate-900 text-slate-100">
                        {yr} (Projected)
                      </option>
                    ))}
                  </select>

                  {fieldErrors.graduationYear && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.graduationYear}
                    </p>
                  )}
                </div>
              </div>

              {/* Field 6: Gender */}
              <div className="space-y-2">
                <label
                  htmlFor="gender-select"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                >
                  <Users className="h-4 w-4 text-purple-400" />
                  <span>Gender</span>
                  <span className="text-rose-400">*</span>
                </label>

                <select
                  id="gender-select"
                  value={gender}
                  onChange={(e) => {
                    setGender(e.target.value);
                    if (fieldErrors.gender) {
                      setFieldErrors((prev) => ({ ...prev, gender: undefined }));
                    }
                  }}
                  className={`
                    w-full bg-slate-900 text-slate-100 rounded-xl border border-slate-800 px-4 py-2.5 text-sm transition-colors
                    focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500
                    ${fieldErrors.gender ? 'border-rose-500/60 focus-visible:ring-rose-500' : 'focus-visible:border-brand-500'}
                  `.trim()}
                >
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g} className="bg-slate-900 text-slate-100">
                      {g}
                    </option>
                  ))}
                </select>

                {fieldErrors.gender && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.gender}
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80 p-6 bg-slate-950/40">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/avatar')}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                disabled={isSubmitting}
              >
                Back to Avatar
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                rightIcon={
                  isSubmitting ? (
                    <Spinner size="sm" variant="white" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )
                }
                className="w-full sm:w-auto shadow-xl shadow-brand-600/25 font-bold"
              >
                {isSubmitting ? 'Finalizing Setup...' : 'Complete Setup & Enter Campus'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
};

export default ProfileSetupPage;
