/**
 * ============================================================================
 * TALK TO RITIANS - Dual College Verification Page
 * ============================================================================
 * Supports TWO primary verification methods:
 * 1. Physical RIT ID:
 *    - Newer cards: IMS URL (ims.ritchennai.edu.in) auto-detected & verified via portal.
 *    - Older/Senior cards: Numeric QR (e.g. 2117XXXXXXXXX) auto-detected -> prompts front scan
 *      -> on-device local OCR -> cross-checks QR vs printed Register Number.
 * 2. College Email:
 *    - Validates institutional domains (ALLOWED_RIT_EMAIL_DOMAINS).
 *    - 6-digit short-lived OTP (10 min expiry) stored securely hashed.
 *    - Unlocks profile customization without inferring real name/gender.
 *
 * PRIVACY INVARIANTS:
 * - Zero Image Persistence: Card images never leave device memory and are never uploaded.
 * - Personal Google account remains the primary login account.
 * - Raw register numbers and institutional emails are never exposed in anonymous chats.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  User,
  GraduationCap,
  Calendar,
  Unlink,
  AlertTriangle,
  CreditCard,
  Users,
  Mail,
  KeyRound,
  ChevronLeft,
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
  QrScanner,
  IdFrontScanner,
  Modal,
  Input,
} from '../components';
import { parseCollegeQr } from '../services/qrParser';
import {
  verificationService,
  CollegeIdentityVerificationResult,
} from '../services/verificationService';
import { profileService } from '../services/profileService';
import { GENDER_OPTIONS } from '../config/profileConfig';
import { validateCollegeEmailDomain } from '../config/collegeEmailConfig';
import {
  isLegacyNumericRitQr,
  crossCheckLegacyCard,
  ExtractedLegacyCardFields,
} from '../services/legacyCardParser';
import { ParsedCollegeQrResult } from '../types';
import { useAuth } from '../context';

type VerificationStep =
  | 'method_selection'
  | 'physical_qr'
  | 'legacy_prompt'
  | 'legacy_front_scan'
  | 'legacy_review'
  | 'email_input'
  | 'email_otp'
  | 'success';

export const VerifyCollegePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, refreshProfile, unlinkCollegeIdentity } = useAuth();

  // Determine initial step based on query param or default to method selection
  const initialMethod = searchParams.get('method');
  const [step, setStep] = useState<VerificationStep>(() => {
    if (initialMethod === 'physical') return 'physical_qr';
    if (initialMethod === 'email') return 'email_input';
    return 'method_selection';
  });

  // Physical ID State
  const [isVerifyingPhysical, setIsVerifyingPhysical] = useState<boolean>(false);
  const [physicalError, setPhysicalError] = useState<string | null>(null);
  const [legacyQrValue, setLegacyQrValue] = useState<string>('');
  const [legacyExtractedFields, setLegacyExtractedFields] = useState<ExtractedLegacyCardFields | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedCollegeQrResult | null>(null);

  // College Email State
  const [collegeEmail, setCollegeEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<Date | null>(null);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState<number>(600);

  // Success State & Gender setup
  const [verifiedData, setVerifiedData] = useState<CollegeIdentityVerificationResult | null>(null);
  const [selectedGender, setSelectedGender] = useState<string | null>(profile?.gender || null);
  const [isSavingGender, setIsSavingGender] = useState<boolean>(false);
  const [genderError, setGenderError] = useState<string | null>(null);

  // Unlink modal
  const [showUnlinkModal, setShowUnlinkModal] = useState<boolean>(false);
  const [isUnlinking, setIsUnlinking] = useState<boolean>(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (step !== 'email_otp' || !otpExpiresAt) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((otpExpiresAt.getTime() - Date.now()) / 1000));
      setOtpRemainingSeconds(diff);
      if (diff === 0) {
        setEmailError('That code has expired. Request a new one.');
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step, otpExpiresAt]);

  /**
   * Resets all verification states.
   */
  const handleResetToSelection = () => {
    setPhysicalError(null);
    setEmailError(null);
    setLegacyQrValue('');
    setLegacyExtractedFields(null);
    setParsedResult(null);
    setOtpCode('');
    setStep('method_selection');
  };

  // ==========================================================================
  // METHOD A: PHYSICAL RIT ID HANDLERS
  // ==========================================================================

  /**
   * Handle QR code captured by camera scanner.
   * Auto-detects Newer IMS URL vs Older Numeric QR vs Unsupported.
   */
  const handleQrCaptured = async (decodedText: string) => {
    setPhysicalError(null);

    // 1. Check if candidate is an Older/Senior RIT ID card with numeric register number in QR
    if (isLegacyNumericRitQr(decodedText)) {
      setLegacyQrValue(decodedText.trim());
      setStep('legacy_prompt');
      return;
    }

    // 2. Parse standard college QR structures (including official ims.ritchennai.edu.in URL)
    const result = parseCollegeQr(decodedText);

    if (result.formatDetected === 'rit_official_url') {
      setIsVerifyingPhysical(true);
      const res = await verificationService.verifyRitQrUrl(decodedText);
      setIsVerifyingPhysical(false);

      if (!res.success || !res.data) {
        setPhysicalError(
          res.error?.message ||
            'Failed to verify student ID with the official RIT portal. Please try again.'
        );
        return;
      }

      setVerifiedData(res.data);
      setParsedResult({
        ...result,
        fields: {
          name: res.data.name,
          department: res.data.department,
          batch: res.data.batch,
        },
      });
      await refreshProfile();
      setStep('success');
      return;
    }

    if (!result.validStructure) {
      setPhysicalError(
        "We couldn't read the QR code. Try again or use College Email verification."
      );
      return;
    }

    // Mock/Dev format fallback
    setParsedResult(result);
    setIsVerifyingPhysical(true);
    const linkRes = await verificationService.linkCollegeIdentity(result);
    setIsVerifyingPhysical(false);

    if (!linkRes.success || !linkRes.data) {
      setPhysicalError(
        linkRes.error?.message ||
          'Failed to verify student ID. Please try scanning your ID card again.'
      );
      return;
    }

    setVerifiedData(linkRes.data);
    await refreshProfile();
    setStep('success');
  };

  /**
   * Called when front of legacy card is captured and parsed via local on-device OCR.
   */
  const handleLegacyFrontCaptured = (res: {
    rawText: string;
    fields: ExtractedLegacyCardFields;
  }) => {
    setPhysicalError(null);

    if (!res.fields.registerNumber) {
      setPhysicalError(
        "We couldn't read the required details from the card. Try again in better lighting."
      );
      return;
    }

    // CRITICAL SECURITY RULE: Cross-check QR number against printed Register Number
    const check = crossCheckLegacyCard(legacyQrValue, res.fields.registerNumber);

    if (!check.matches) {
      setPhysicalError(
        'The QR and printed student number do not match. Please scan the same physical RIT ID card again.'
      );
      return;
    }

    setLegacyExtractedFields(res.fields);
    setStep('legacy_review');
  };

  /**
   * Confirms verified legacy card data and securely links identity on server.
   */
  const handleConfirmLegacyVerification = async () => {
    if (!legacyQrValue || !legacyExtractedFields?.registerNumber) {
      setPhysicalError('Missing verified student credentials.');
      return;
    }

    setIsVerifyingPhysical(true);
    setPhysicalError(null);

    const res = await verificationService.verifyLegacyRitCard({
      qrNumber: legacyQrValue,
      registerNumber: legacyExtractedFields.registerNumber,
      name: legacyExtractedFields.name,
      department: legacyExtractedFields.department,
      batch: legacyExtractedFields.batch,
    });

    setIsVerifyingPhysical(false);

    if (!res.success || !res.data) {
      setPhysicalError(
        res.error?.message ||
          'Failed to verify older RIT ID card. Please ensure your card details are accurate.'
      );
      return;
    }

    setVerifiedData(res.data);
    await refreshProfile();
    setStep('success');
  };

  // ==========================================================================
  // METHOD B: COLLEGE EMAIL HANDLERS
  // ==========================================================================

  /**
   * Validates institutional email and sends 6-digit OTP code.
   */
  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setOtpSentMessage(null);

    const cleanEmail = collegeEmail.trim().toLowerCase();

    // Strict domain validation against ALLOWED_RIT_EMAIL_DOMAINS
    const domainCheck = validateCollegeEmailDomain(cleanEmail);
    if (!domainCheck.isValid) {
      setEmailError(domainCheck.error || 'Enter a valid RIT institutional email address.');
      return;
    }

    setIsSendingOtp(true);
    const res = await verificationService.requestCollegeEmailOtp(cleanEmail);
    setIsSendingOtp(false);

    if (!res.success) {
      setEmailError(
        res.error?.message || 'Failed to send verification code. Please check your email and try again.'
      );
      return;
    }

    // Set expiry countdown (10 minutes)
    setOtpExpiresAt(new Date(Date.now() + 10 * 60 * 1000));
    setOtpRemainingSeconds(600);
    setOtpSentMessage(`Verification code sent to ${cleanEmail}.`);
    setStep('email_otp');
  };

  /**
   * Verifies the 6-digit OTP and establishes unified verified state.
   */
  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setEmailError('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsVerifyingOtp(true);
    const res = await verificationService.verifyCollegeEmailOtp(collegeEmail.trim(), cleanOtp);
    setIsVerifyingOtp(false);

    if (!res.success || !res.data) {
      setEmailError(res.error?.message || 'That code is incorrect.');
      return;
    }

    setVerifiedData(res.data);
    await refreshProfile();
    setStep('success');
  };

  // ==========================================================================
  // UNLINK IDENTITY HANDLER
  // ==========================================================================

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
    setVerifiedData(null);
    setStep('method_selection');
  };

  const isAlreadyLinked = Boolean(profile?.college_identity_linked);

  return (
    <>
      <Card className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-2">
            <Badge variant="brand" size="sm" withDot>
              Dual College Verification
            </Badge>
          </div>

          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
            {step === 'method_selection' && 'Verify your RIT identity'}
            {step === 'physical_qr' && 'Scan Physical RIT ID'}
            {step === 'legacy_prompt' && 'Older RIT ID Detected'}
            {step === 'legacy_front_scan' && 'Scan Front of ID Card'}
            {step === 'legacy_review' && 'Confirm ID Details'}
            {step === 'email_input' && 'Verify with College Email'}
            {step === 'email_otp' && 'Enter Verification Code'}
            {step === 'success' && 'College Identity Verified'}
          </CardTitle>

          <CardDescription className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto">
            {step === 'method_selection' &&
              'Choose your preferred verification method. Either option unlocks full profile customization while preserving anonymous chat privacy.'}
            {step === 'physical_qr' &&
              'Scan the QR code on the back of your physical RIT student ID card.'}
            {step === 'legacy_prompt' &&
              'An older numeric RIT ID card was detected. Scan the front of the same card to cross-check credentials.'}
            {step === 'legacy_front_scan' &&
              'Align the front of your ID card inside the frame to read the printed student number.'}
            {step === 'legacy_review' &&
              'Review the student details extracted from your physical card.'}
            {step === 'email_input' &&
              'College email verification sends a verification code to your institutional mailbox.'}
            {step === 'email_otp' &&
              `Enter the 6-digit code sent to ${collegeEmail}. Code expires in 10 minutes.`}
            {step === 'success' &&
              'Your RIT identity has been verified successfully. Your academic credentials remain sealed and private.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Active Verification Status Banner (If already linked) */}
          {isAlreadyLinked && (step === 'method_selection' || step === 'physical_qr' || step === 'email_input') && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                    College Identity Currently Verified
                  </h4>
                  <p className="text-[11px] text-gray-600 dark:text-slate-300">
                    Method:{' '}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {profile?.verification_method === 'college_email'
                        ? 'College Email'
                        : 'Physical ID'}
                    </span>
                    {profile?.department && ` • ${profile.department}`}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUnlinkModal(true)}
                leftIcon={<Unlink className="h-3.5 w-3.5 text-rose-500" />}
                className="hover:border-rose-300 hover:text-rose-600 text-xs"
              >
                Unlink Identity
              </Button>
            </div>
          )}

          {/* =========================================================================
              VIEW 1: METHOD SELECTION
              ========================================================================= */}
          {step === 'method_selection' && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">
                  Choose a verification method:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Method 1: Physical RIT ID */}
                <button
                  type="button"
                  id="choose-physical-id-btn"
                  onClick={() => setStep('physical_qr')}
                  className="p-5 rounded-2xl border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-500 dark:hover:border-brand-500 hover:shadow-md transition-all text-left flex flex-col justify-between gap-4 group"
                >
                  <div className="space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center justify-between">
                        <span>Scan Physical RIT ID</span>
                        <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                        Scan newer IMS QR cards or older numeric ID cards with instant on-device cross-checking.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Zero image storage</span>
                  </div>
                </button>

                {/* Method 2: College Email */}
                <button
                  type="button"
                  id="choose-college-email-btn"
                  onClick={() => setStep('email_input')}
                  className="p-5 rounded-2xl border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-500 dark:hover:border-brand-500 hover:shadow-md transition-all text-left flex flex-col justify-between gap-4 group"
                >
                  <div className="space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Mail className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center justify-between">
                        <span>Verify with College Email</span>
                        <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                        Verify via 6-digit code sent to your official institutional mailbox (@ritchennai.edu.in).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>One-time 10-min code</span>
                  </div>
                </button>
              </div>

              {/* Supporting Text */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-center space-y-1">
                <p className="text-xs text-gray-700 dark:text-slate-300 font-medium">
                  &ldquo;Verification unlocks your anonymous profile customization. You can still chat without verification.&rdquo;
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Unverified students chat with an assigned anonymous handle. Verification is optional and enables choosing a custom alias &amp; avatar.
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 2: PHYSICAL RIT ID - QR SCANNER
              ========================================================================= */}
          {step === 'physical_qr' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetToSelection}
                  className="text-xs font-semibold text-gray-500 hover:text-brand-600 flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Choose Another Method</span>
                </button>
                <Badge variant="brand" size="sm">
                  Physical ID
                </Badge>
              </div>

              {isVerifyingPhysical && (
                <div className="p-4 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 text-center space-y-2 animate-in fade-in">
                  <RefreshCw className="h-6 w-6 text-brand-600 animate-spin mx-auto" />
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                    Verifying Student Credentials
                  </h4>
                  <p className="text-[11px] text-gray-600 dark:text-slate-300">
                    Validating card format with cryptographic uniqueness...
                  </p>
                </div>
              )}

              <QrScanner
                onScan={handleQrCaptured}
                onError={(err) => setPhysicalError(err)}
                disabled={isVerifyingPhysical}
              />

              {physicalError && (
                <ErrorMessage
                  title="Scan Notice"
                  message={physicalError}
                  onDismiss={() => setPhysicalError(null)}
                />
              )}

              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-brand-50 dark:bg-brand-950/50 border border-brand-100 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-gray-900 dark:text-white">Where is the QR code?</span>
                  <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
                    The QR code is printed on the back of your ID card. Newer cards connect to the IMS portal; older cards contain a numeric register number.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 3: LEGACY CARD DETECTED - PROMPT FRONT SCAN
              ========================================================================= */}
          {step === 'legacy_prompt' && (
            <div className="space-y-5 text-center animate-in fade-in">
              <div className="h-14 w-14 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <CreditCard className="h-7 w-7" />
              </div>

              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Older RIT ID detected
                </h3>
                <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                  Now scan the front of the same physical ID card to cross-check your printed student number.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-left text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-slate-400">Detected QR Number:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">
                    {legacyQrValue.replace(/^(\d{4})\d+(\d{4})$/, '$1••••$2')}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                  The numeric QR alone is not sufficient proof. We will match this against the printed Register Number on the front using on-device OCR.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  onClick={() => setStep('legacy_front_scan')}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  className="font-bold py-2.5"
                >
                  Scan Front of ID
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep('physical_qr')}
                >
                  Back to QR Scan
                </Button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 4: LEGACY CARD FRONT OCR SCANNER
              ========================================================================= */}
          {step === 'legacy_front_scan' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('legacy_prompt')}
                  className="text-xs font-semibold text-gray-500 hover:text-brand-600 flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                <Badge variant="warning" size="sm">
                  Front of Card Scan
                </Badge>
              </div>

              {physicalError && (
                <ErrorMessage
                  title="Cross-Check Notice"
                  message={physicalError}
                  onDismiss={() => setPhysicalError(null)}
                />
              )}

              <IdFrontScanner
                expectedRegisterNumber={legacyQrValue}
                onCapture={handleLegacyFrontCaptured}
                onError={(err) => setPhysicalError(err)}
                onCancel={() => setStep('legacy_prompt')}
              />
            </div>
          )}

          {/* =========================================================================
              VIEW 5: LEGACY CARD CONFIRMATION REVIEW
              ========================================================================= */}
          {step === 'legacy_review' && legacyExtractedFields && (
            <div className="space-y-5 animate-in fade-in">
              <div className="rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-2.5">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Cross-Checked Student Attributes
                  </span>
                  <Badge variant="success" size="sm" withDot>
                    QR &amp; Card Matched
                  </Badge>
                </div>

                <div className="space-y-2.5 pt-1 text-xs">
                  {legacyExtractedFields.name && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400 font-medium">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        Student Name:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {legacyExtractedFields.name}
                      </span>
                    </div>
                  )}

                  {legacyExtractedFields.department && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400 font-medium">
                        <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                        Department:
                      </span>
                      <span className="font-semibold text-brand-600 dark:text-brand-400">
                        {legacyExtractedFields.department}
                      </span>
                    </div>
                  )}

                  {legacyExtractedFields.batch && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        Batch:
                      </span>
                      <span className="font-mono font-semibold text-gray-800 dark:text-slate-200">
                        {legacyExtractedFields.batch}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      Register Number:
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      ✓ Matched &amp; Fingerprinted
                    </span>
                  </div>
                </div>
              </div>

              {physicalError && (
                <ErrorMessage
                  title="Verification Rejected"
                  message={physicalError}
                  onDismiss={() => setPhysicalError(null)}
                />
              )}

              <div className="space-y-2.5 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  isLoading={isVerifyingPhysical}
                  loadingText="Linking verified identity..."
                  onClick={handleConfirmLegacyVerification}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  className="font-bold py-2.5"
                >
                  Confirm &amp; Link College Identity
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  disabled={isVerifyingPhysical}
                  onClick={() => setStep('legacy_front_scan')}
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                >
                  Scan Front Again
                </Button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 6: COLLEGE EMAIL INPUT
              ========================================================================= */}
          {step === 'email_input' && (
            <form onSubmit={handleSendEmailOtp} className="space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetToSelection}
                  className="text-xs font-semibold text-gray-500 hover:text-brand-600 flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Choose Another Method</span>
                </button>
                <Badge variant="brand" size="sm">
                  College Email
                </Badge>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="college-email-input"
                  className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider"
                >
                  College Email
                </label>
                <Input
                  id="college-email-input"
                  type="email"
                  placeholder="e.g. yourname.dept@cse.ritchennai.edu.in"
                  value={collegeEmail}
                  onChange={(e) => {
                    setCollegeEmail(e.target.value);
                    setEmailError(null);
                  }}
                  autoFocus
                  required
                  disabled={isSendingOtp}
                />
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Must be an official institutional email (@ritchennai.edu.in or department subdomains).
                </p>
              </div>

              {emailError && (
                <ErrorMessage
                  title="Email Verification Notice"
                  message={emailError}
                  onDismiss={() => setEmailError(null)}
                />
              )}

              {/* Security & Privacy Notice */}
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-slate-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                  <ShieldCheck className="h-4 w-4 text-brand-600 shrink-0" />
                  <span>No Passwords Required</span>
                </div>
                <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
                  We will never ask for your email password, Google Workspace, or IMS password. Verification only requires reading a 6-digit code sent to your inbox.
                </p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 italic">
                  Note: College email verification sends a verification code to your institutional mailbox.
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isSendingOtp}
                loadingText="Sending 6-digit code..."
                disabled={!collegeEmail.trim() || isSendingOtp}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="font-bold py-2.5"
              >
                Send Verification Code
              </Button>
            </form>
          )}

          {/* =========================================================================
              VIEW 7: COLLEGE EMAIL - ENTER 6-DIGIT OTP
              ========================================================================= */}
          {step === 'email_otp' && (
            <form onSubmit={handleVerifyEmailOtp} className="space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('email_input')}
                  className="text-xs font-semibold text-gray-500 hover:text-brand-600 flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Change Email</span>
                </button>
                <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400">
                  {Math.floor(otpRemainingSeconds / 60)}:
                  {String(otpRemainingSeconds % 60).padStart(2, '0')}
                </span>
              </div>

              {otpSentMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{otpSentMessage}</span>
                </div>
              )}

              <div className="space-y-2 text-center">
                <label
                  htmlFor="otp-code-input"
                  className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider"
                >
                  Enter 6-Digit Code
                </label>
                <input
                  id="otp-code-input"
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ''));
                    setEmailError(null);
                  }}
                  autoFocus
                  required
                  disabled={isVerifyingOtp}
                  className="w-48 mx-auto text-center font-mono text-2xl tracking-[0.5em] px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Expires in 10 minutes. 5 verification attempts allowed.
                </p>
              </div>

              {emailError && (
                <ErrorMessage
                  title="Verification Error"
                  message={emailError}
                  onDismiss={() => setEmailError(null)}
                />
              )}

              <div className="space-y-2.5 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  isLoading={isVerifyingOtp}
                  loadingText="Verifying code..."
                  disabled={otpCode.length !== 6 || isVerifyingOtp}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  className="font-bold py-2.5"
                >
                  Verify Code
                </Button>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={handleSendEmailOtp}
                    disabled={isSendingOtp || otpRemainingSeconds > 540}
                    className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    Resend Code
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep('email_input')}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Use different email
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* =========================================================================
              VIEW 8: SUCCESS CONFIRMATION & GENDER SELECTION
              ========================================================================= */}
          {step === 'success' && (
            <div className="text-center space-y-5 animate-in fade-in">
              <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 mx-auto flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  College Identity Verified
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Your student identity has been verified successfully. Your academic credentials remain sealed and private.
                </p>
              </div>

              {/* Verified Credentials Summary */}
              <div className="rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 p-4 text-left text-xs space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-slate-700">
                  <span className="font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                    Verified Credentials
                  </span>
                  <Badge variant="success" size="sm" withDot>
                    Verified
                  </Badge>
                </div>

                {Boolean(verifiedData?.name || parsedResult?.fields?.name || legacyExtractedFields?.name) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      Name:
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {String(verifiedData?.name || parsedResult?.fields?.name || legacyExtractedFields?.name)}
                    </span>
                  </div>
                )}

                {Boolean(verifiedData?.department || parsedResult?.fields?.department || legacyExtractedFields?.department) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                      Department:
                    </span>
                    <span className="font-semibold text-brand-600 dark:text-brand-400">
                      {String(verifiedData?.department || parsedResult?.fields?.department || legacyExtractedFields?.department)}
                    </span>
                  </div>
                )}

                {Boolean(verifiedData?.batch || parsedResult?.fields?.batch || legacyExtractedFields?.batch) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      Batch:
                    </span>
                    <span className="font-mono font-semibold text-gray-800 dark:text-slate-200">
                      {String(verifiedData?.batch || parsedResult?.fields?.batch || legacyExtractedFields?.batch)}
                    </span>
                  </div>
                )}

                {/* Email verification notice when academic fields remain null */}
                {!Boolean(verifiedData?.department || parsedResult?.fields?.department || legacyExtractedFields?.department) && (
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Verification Proof:
                    </span>
                    <span className="font-semibold">Institutional Mailbox Active</span>
                  </div>
                )}
              </div>

              {/* Manual Gender Selection (Never inferred) */}
              <div className="rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 p-4 text-left text-xs space-y-3 shadow-sm">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-200 dark:border-slate-700">
                  <span className="font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                    Select Your Gender
                  </span>
                  <Badge variant="brand" size="sm">
                    Required
                  </Badge>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                  Please select your gender manually. We never infer or guess this from your name, email, or department.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {GENDER_OPTIONS.map((gOption) => (
                    <button
                      key={gOption}
                      type="button"
                      onClick={() => {
                        setSelectedGender(gOption);
                        setGenderError(null);
                      }}
                      className={`p-2.5 rounded-lg border text-xs font-semibold text-center transition-all ${
                        selectedGender === gOption
                          ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-600 text-brand-700 dark:text-brand-300 shadow-sm ring-1 ring-brand-500'
                          : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {gOption}
                    </button>
                  ))}
                </div>
                {genderError && (
                  <p className="text-[11px] text-rose-600 font-medium">{genderError}</p>
                )}
              </div>

              {/* Private Shield Note */}
              <div className="p-3 rounded-xl bg-brand-50/60 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/40 text-left text-xs text-gray-600 dark:text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 text-brand-700 dark:text-brand-400 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Private Identity Shield Active</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Your real name, email, and credentials will NEVER be shown to other students in chats.
                </p>
              </div>

              {/* Navigation Options */}
              <div className="space-y-2.5 pt-1">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    fullWidth
                    isLoading={isSavingGender}
                    loadingText="Saving..."
                    onClick={async () => {
                      if (selectedGender) {
                        setIsSavingGender(true);
                        await profileService.saveGender(selectedGender);
                        setIsSavingGender(false);
                      }
                      await refreshProfile();
                      navigate('/settings');
                    }}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    className="py-2.5 font-semibold shadow-sm"
                  >
                    Go to Settings
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={async () => {
                      if (selectedGender) {
                        setIsSavingGender(true);
                        await profileService.saveGender(selectedGender);
                        setIsSavingGender(false);
                      }
                      await refreshProfile();
                      navigate('/home');
                    }}
                    className="py-2.5 font-semibold"
                  >
                    Back to Home
                  </Button>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      if (selectedGender) {
                        await profileService.saveGender(selectedGender);
                      }
                      await refreshProfile();
                      navigate('/username');
                    }}
                    className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    <span>Or customize your anonymous username now</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-gray-100 dark:border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="text-xs text-gray-400 hover:text-brand-600 underline underline-offset-4"
          >
            &larr; Back to Settings
          </button>
        </CardFooter>
      </Card>

      {/* Confirmation Modal for Identity Unlinking */}
      <Modal
        isOpen={showUnlinkModal}
        onClose={() => setShowUnlinkModal(false)}
        title="Unlink College Identity"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Unlinking your verification resets your public profile persona to an anonymous guest during chats. Active chat rooms will immediately see your persona revert to Unknown User.
            </p>
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
    </>
  );
};

export default VerifyCollegePage;
