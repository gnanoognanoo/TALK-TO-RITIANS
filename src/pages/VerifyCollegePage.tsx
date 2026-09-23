/**
 * ============================================================================
 * TALK TO RITIANS - College ID Verification Page
 * ============================================================================
 * Handles:
 * 1. Scanning physical ID QR code via camera (or dev mock simulator)
 * 2. Multi-format parsing abstraction (no assumed official RIT format)
 * 3. Verification review screen displaying Detected Name, Dept, Batch
 * 4. Explicit non-institutional MOCK DATA labeling & security disclaimers
 * 5. Server-side cryptographic identity linking & uniqueness enforcement
 *    - Rejects duplicates: "This college identity is already linked to another account."
 *    - Handles same-user re-scan gracefully
 *    - Unlink architecture support with audit preservation
 * 6. Direct transition to /username upon successful verification
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  User,
  GraduationCap,
  Calendar,
  AlertCircle,
  HelpCircle,
  Unlink,
  AlertTriangle,
  CreditCard,
  Hash,
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
  Modal,
} from '../components';
import { parseCollegeQr } from '../services/qrParser';
import { verificationService, CollegeIdentityVerificationResult } from '../services/verificationService';
import { ParsedCollegeQrResult } from '../types';
import { useAuth } from '../context';

export const VerifyCollegePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile, unlinkCollegeIdentity } = useAuth();

  // Workflow states: 'scanning' | 'review' | 'success'
  const [viewState, setViewState] = useState<'scanning' | 'review' | 'success'>('scanning');
  const [parsedResult, setParsedResult] = useState<ParsedCollegeQrResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [verifiedData, setVerifiedData] = useState<CollegeIdentityVerificationResult | null>(null);

  // Unlinking confirmation modal state
  const [showUnlinkModal, setShowUnlinkModal] = useState<boolean>(false);
  const [isUnlinking, setIsUnlinking] = useState<boolean>(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  /**
   * Called when QrScanner captures a QR string.
   */
  const handleQrCaptured = async (decodedText: string) => {
    setScanError(null);
    setLinkError(null);

    const result = parseCollegeQr(decodedText);

    if (!result.validStructure) {
      setScanError(
        result.validationErrors[0] ||
          'Unable to read valid student information from this QR code. Please ensure you are scanning an ID card QR.'
      );
      return;
    }

    // REAL FLOW: When official RIT QR URL is detected, immediately verify with backend
    if (result.formatDetected === 'rit_official_url') {
      setIsLinking(true);
      const res = await verificationService.verifyRitQrUrl(decodedText);
      setIsLinking(false);

      if (!res.success || !res.data) {
        setScanError(
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
          studentReference: res.data.registerNumber,
          department: res.data.department,
          batch: res.data.batch,
        },
      });
      await refreshProfile();
      setViewState('success');
      return;
    }

    // Dev mock flow: Show review state before manual confirmation
    setParsedResult(result);
    setViewState('review');
  };

  /**
   * Resets verification state to re-scan.
   */
  const handleScanAgain = () => {
    setParsedResult(null);
    setScanError(null);
    setLinkError(null);
    setViewState('scanning');
  };

  /**
   * Confirms the detected identity and sends it for server-side fingerprinting and linkage.
   */
  const handleConfirmVerification = async () => {
    if (!parsedResult) return;

    setIsLinking(true);
    setLinkError(null);

    const res = await verificationService.linkCollegeIdentity(parsedResult);
    setIsLinking(false);

    if (!res.success || !res.data) {
      setLinkError(
        res.error?.message ||
          'Failed to link college identity. Please try scanning your ID card again.'
      );
      return;
    }

    setVerifiedData(res.data);
    await refreshProfile();
    setViewState('success');
  };

  /**
   * Handles explicit unlinking of current college identity.
   */
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
    setParsedResult(null);
    setViewState('scanning');
  };

  return (
    <>
      <Card className="border-gray-200 bg-white shadow-card">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-2">
            <Badge variant="brand" size="sm" withDot>
              Step 1 &bull; College Verification
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            {viewState === 'scanning' && 'Verify Your College ID'}
            {viewState === 'review' && 'Review Detected Identity'}
            {viewState === 'success' && 'College Identity Verified!'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            {viewState === 'scanning' &&
              'Scan the QR code on the back of your RIT ID card.'}
            {viewState === 'review' &&
              'Confirm the student information decoded from your card before choosing your anonymous handle.'}
            {viewState === 'success' &&
              'Your college identity has been linked successfully.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Active Verification Status Banner (If already linked) */}
          {profile?.college_identity_linked && viewState === 'scanning' && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-gray-900">College ID Already Linked</h4>
                  <p className="text-[11px] text-gray-600">
                    Dept: <span className="font-semibold text-emerald-700">{profile.department || 'RIT'}</span>
                    {profile.batch && ` • Batch: ${profile.batch}`}
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
                Unlink Card
              </Button>
            </div>
          )}

          {/* =========================================================================
              STATE 1: SCANNING VIEW (Phase 4)
              ========================================================================= */}
          {viewState === 'scanning' && (
            <div className="space-y-5">
              {/* Verifying Status Indicator */}
              {isLinking && (
                <div className="p-4 rounded-xl bg-brand-50 border border-brand-200 text-center space-y-2 animate-in fade-in">
                  <RefreshCw className="h-6 w-6 text-brand-600 animate-spin mx-auto" />
                  <h4 className="text-xs font-bold text-gray-900">Verifying with Official RIT Portal</h4>
                  <p className="text-[11px] text-gray-600">
                    Connecting to ims.ritchennai.edu.in to securely confirm your student credentials...
                  </p>
                </div>
              )}

              {/* Live Camera Scanner with subtle corner brackets */}
              <QrScanner
                onScan={handleQrCaptured}
                onError={(err) => setScanError(err)}
                disabled={isLinking}
              />

              {/* Scan Error Message */}
              {scanError && (
                <ErrorMessage
                  title="Verification Error"
                  message={scanError}
                  onDismiss={() => setScanError(null)}
                />
              )}

              {/* Where to find it? Help Card */}
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-gray-900">Where to find it?</span>
                  <p className="text-gray-500 leading-relaxed">
                    The QR code is printed on the back side of your physical college ID card.
                  </p>
                </div>
              </div>

              {/* Privacy Guarantee Notice */}
              <div className="p-3.5 rounded-xl bg-brand-50/50 border border-brand-100 text-xs text-gray-600 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-brand-700">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Zero-Storage Camera Privacy</span>
                </div>
                <p className="text-[11px] leading-relaxed text-gray-500">
                  Camera frames are processed in local memory. We never record, upload, or store snapshots of your card.
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              STATE 2: QR REVIEW SCREEN
              ========================================================================= */}
          {viewState === 'review' && parsedResult && (
            <div className="space-y-5 animate-in fade-in">
              {/* Development Mock Notice Banner */}
              {parsedResult.isMockData && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>DEVELOPMENT MOCK DATA DETECTED</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    This verification uses simulated student credentials for local testing.
                  </p>
                </div>
              )}

              {/* Card Showing Decoded Student Information */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Decoded Card Attributes
                  </span>
                  <Badge variant={parsedResult.isMockData ? 'warning' : 'success'} size="sm">
                    {parsedResult.isMockData ? 'Dev Mock' : 'Card Scanned'}
                  </Badge>
                </div>

                <div className="space-y-2.5 pt-1">
                  {/* Detected Name */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      Detected Name:
                    </span>
                    <span className="font-semibold text-gray-900">
                      {parsedResult.fields.name || 'Not Specified'}
                    </span>
                  </div>

                  {/* Detected Department */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                      Detected Department:
                    </span>
                    <span className="font-semibold text-brand-600">
                      {parsedResult.fields.department || 'Not Specified'}
                    </span>
                  </div>

                  {/* Detected Batch */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      Detected Batch:
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {parsedResult.fields.batch || 'Not Specified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Link Error Message */}
              {linkError && (
                <ErrorMessage
                  title="Verification Rejected"
                  message={linkError}
                  onDismiss={() => setLinkError(null)}
                />
              )}

              {/* Security Notice */}
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-500 leading-relaxed flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <span>
                  QR verification binds this physical student card to your account with cryptographic uniqueness.
                </span>
              </div>

              {/* Actions: Confirm or Scan Again */}
              <div className="space-y-2.5 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  isLoading={isLinking}
                  loadingText="Verifying 1-to-1 uniqueness..."
                  onClick={handleConfirmVerification}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Confirm &amp; Link College Identity
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  disabled={isLinking}
                  onClick={handleScanAgain}
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                >
                  Scan Again
                </Button>
              </div>
            </div>
          )}

          {/* =========================================================================
              STATE 3: SUCCESS CONFIRMATION (Phase 5)
              ========================================================================= */}
          {viewState === 'success' && (
            <div className="text-center space-y-5 animate-in fade-in">
              {/* Large Soft Green Circular Check Icon */}
              <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-gray-900">
                  {verifiedData?.alreadyLinkedToSelf ? 'Identity Confirmed!' : 'College Identity Verified!'}
                </h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                  Your college identity has been linked successfully.
                </p>
              </div>

              {/* Clean Information Card (Name, Department, Batch) */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-left text-xs space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-500 uppercase tracking-wider text-[11px]">
                    Verified Student Credentials
                  </span>
                  <Badge variant="success" size="sm" withDot>
                    Linked
                  </Badge>
                </div>

                {Boolean(parsedResult?.fields?.name || verifiedData) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      Name:
                    </span>
                    <span className="font-semibold text-gray-900">
                      {String(parsedResult?.fields?.name || 'Verified Student')}
                    </span>
                  </div>
                )}

                {Boolean(parsedResult?.fields?.studentReference || (parsedResult?.fields as any)?.rollNumber) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-gray-400" />
                      Roll / ID:
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {String(parsedResult?.fields?.studentReference || (parsedResult?.fields as any)?.rollNumber)}
                    </span>
                  </div>
                )}

                {Boolean(verifiedData?.department || parsedResult?.fields?.department) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                      Department:
                    </span>
                    <span className="font-semibold text-brand-600">
                      {String(verifiedData?.department || parsedResult?.fields?.department)}
                    </span>
                  </div>
                )}

                {Boolean(verifiedData?.batch || parsedResult?.fields?.batch) && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      Batch:
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {String(verifiedData?.batch || parsedResult?.fields?.batch)}
                    </span>
                  </div>
                )}
              </div>

              {/* Private Shield Note */}
              <div className="p-3 rounded-xl bg-brand-50/60 border border-brand-100 text-left text-xs text-gray-600 space-y-1">
                <div className="flex items-center gap-1.5 text-brand-700 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Private Identity Shield Active</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Your real name and credentials will NEVER be shown to other students in chats.
                </p>
              </div>

              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={() => navigate('/username')}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="py-2.5 font-semibold shadow-sm"
              >
                Continue
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => navigate('/username')}
            className="text-xs text-gray-400 hover:text-brand-600 underline underline-offset-4"
          >
            Skip verification for UI preview &rarr;
          </button>
        </CardFooter>
      </Card>

      {/* Confirmation Modal for Card Unlinking */}
      <Modal
        isOpen={showUnlinkModal}
        onClose={() => setShowUnlinkModal(false)}
        title="Unlink College Identity"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Unlinking your student ID card will revoke your campus chat access until another ID card
              is verified. Your audit history will be securely retained for system integrity.
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
