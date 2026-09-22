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
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Edit2,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Badge,
  ErrorMessage,
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

  // Automatically sync graduation year when batch changes
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
      // Route to /home
      navigate('/home');
    } catch (err: unknown) {
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setSubmitError(msg);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      {/* Header & Step Badge */}
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm" withDot>
          Step 4 &bull; Profile
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

              {/* Field 1: Department */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="department-select"
                    className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                    <span>Department</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  {isDeptLocked ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Verified from ID Card
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDeptLocked(false)}
                        className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-400">Official RIT Departments</span>
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
                    w-full bg-white text-gray-900 rounded-xl border px-4 py-2.5 text-sm transition-all
                    focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10
                    ${isDeptLocked ? 'opacity-85 cursor-not-allowed bg-gray-50 border-gray-200' : 'border-gray-200 hover:border-gray-300'}
                    ${fieldErrors.department ? 'border-rose-300 text-rose-900' : ''}
                  `.trim()}
                >
                  {INSTITUTIONAL_DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.code} className="text-gray-900">
                      {dept.code} &mdash; {dept.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.department && (
                  <p className="text-xs text-rose-600 mt-1">{fieldErrors.department}</p>
                )}
              </div>

              {/* Grid for Class, Year/Batch, Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

                {/* Field 3: Academic Batch */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="batch-select"
                      className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                    >
                      <Calendar className="h-3.5 w-3.5 text-brand-600" />
                      <span>Year / Batch</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    {isBatchLocked && (
                      <button
                        type="button"
                        onClick={() => setIsBatchLocked(false)}
                        className="text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <select
                    id="batch-select"
                    value={batch}
                    disabled={isBatchLocked}
                    onChange={(e) => handleBatchChange(e.target.value)}
                    className={`
                      w-full bg-white text-gray-900 rounded-xl border px-4 py-2.5 text-sm transition-all
                      focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10
                      ${isBatchLocked ? 'opacity-85 cursor-not-allowed bg-gray-50 border-gray-200' : 'border-gray-200 hover:border-gray-300'}
                      ${fieldErrors.batch ? 'border-rose-300 text-rose-900' : ''}
                    `.trim()}
                  >
                    {BATCH_OPTIONS.map((b) => (
                      <option key={b} value={b} className="text-gray-900">
                        {b}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.batch && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.batch}</p>
                  )}
                </div>

                {/* Field 4: Section */}
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
                {/* Field 5: Expected Graduation Year */}
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

                {/* Field 6: Gender */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="gender-select"
                    className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                  >
                    <Users className="h-3.5 w-3.5 text-brand-600" />
                    <span>Gender</span>
                    <span className="text-rose-500">*</span>
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
                    className="w-full bg-white text-gray-900 rounded-xl border border-gray-200 hover:border-gray-300 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-500/10"
                  >
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g} className="text-gray-900">
                        {g}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.gender && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.gender}</p>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-gray-100 pt-5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate('/avatar')}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Avatar
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
    </div>
  );
};

export default ProfileSetupPage;
