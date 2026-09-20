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
  const handleQrCaptured = (decodedText: string) => {
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
      <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <Badge variant="brand" size="sm" withDot>
              Step 1 &bull; College Verification
            </Badge>
          </div>
          <CardTitle>
            {viewState === 'scanning' && 'Scan Student ID Card'}
            {viewState === 'review' && 'Review Detected Identity'}
            {viewState === 'success' && 'Student ID Verified!'}
          </CardTitle>
          <CardDescription>
            {viewState === 'scanning' &&
              'Scan the QR code printed on the back of your physical college ID card to link your student status.'}
            {viewState === 'review' &&
              'Confirm the student information decoded from your card before choosing your anonymous handle.'}
            {viewState === 'success' &&
              'Your college identity is securely verified and linked. Your real student information will remain strictly private.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Active Verification Status Banner (If already linked) */}
          {profile?.college_identity_linked && viewState === 'scanning' && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white">College ID Already Linked</h4>
                  <p className="text-[11px] text-slate-300">
                    Dept: <span className="font-semibold text-emerald-400">{profile.department || 'RIT'}</span>
                    {profile.batch && ` • Batch: ${profile.batch}`}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUnlinkModal(true)}
                leftIcon={<Unlink className="h-3.5 w-3.5 text-rose-400" />}
                className="hover:border-rose-500/50 hover:text-rose-300 text-xs"
              >
                Unlink Card
              </Button>
            </div>
          )}

          {/* =========================================================================
              STATE 1: SCANNING VIEW
              ========================================================================= */}
          {viewState === 'scanning' && (
            <div className="space-y-5">
              {/* Live Camera Scanner */}
              <QrScanner onScan={handleQrCaptured} onError={(err) => setScanError(err)} />

              {/* Scan Error Message */}
              {scanError && (
                <ErrorMessage
                  title="Invalid or Unreadable QR"
                  message={scanError}
                  onDismiss={() => setScanError(null)}
                />
              )}

              {/* Privacy Guarantee Banner */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>Zero-Storage Camera Privacy</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Your camera stream is processed entirely within your browser memory. We never upload,
                  record, or store camera frames, snapshots, or photos of your student ID card.
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              STATE 2: QR REVIEW SCREEN
              ========================================================================= */}
          {viewState === 'review' && parsedResult && (
            <div className="space-y-5 animate-in fade-in zoom-in-95">
              {/* Development Mock Warning Banner */}
              {parsedResult.isMockData && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>DEVELOPMENT MOCK DATA DETECTED</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Real RIT ID card format will be calibrated once physical card samples are scanned.
                    This verification uses simulated student credentials for local testing and does NOT
                    represent institutional RIT verification.
                  </p>
                </div>
              )}

              {/* Card Showing Decoded Student Information */}
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Decoded Card Fields
                  </span>
                  <Badge variant={parsedResult.isMockData ? 'warning' : 'success'} size="sm">
                    {parsedResult.isMockData ? 'Dev Mock' : 'Card Scanned'}
                  </Badge>
                </div>

                <div className="space-y-2.5 pt-1">
                  {/* Detected Name */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                      <User className="h-3.5 w-3.5 text-slate-500" />
                      Detected Name:
                    </span>
                    <span className="font-semibold text-white">
                      {parsedResult.fields.name || 'Not Specified'}
                    </span>
                  </div>

                  {/* Detected Department */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                      <GraduationCap className="h-3.5 w-3.5 text-slate-500" />
                      Detected Department:
                    </span>
                    <span className="font-semibold text-brand-300">
                      {parsedResult.fields.department || 'Not Specified'}
                    </span>
                  </div>

                  {/* Detected Batch */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                      <Calendar className="h-3.5 w-3.5 text-slate-500" />
                      Detected Batch:
                    </span>
                    <span className="font-mono font-semibold text-slate-200">
                      {parsedResult.fields.batch || 'Not Specified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Link Error Message (Duplicate or Validation Failure) */}
              {linkError && (
                <ErrorMessage
                  title="Verification Rejected"
                  message={linkError}
                  onDismiss={() => setLinkError(null)}
                />
              )}

              {/* Security Warning Notice */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-400 leading-relaxed flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  QR possession verifies card attributes. Server-side salted fingerprinting ensures that
                  each physical card can only be linked to a single personal account at a time.
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
                  variant="outline"
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
              STATE 3: SUCCESS CONFIRMATION
              ========================================================================= */}
          {viewState === 'success' && (
            <div className="text-center space-y-5 animate-in zoom-in-95">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white">
                  {verifiedData?.alreadyLinkedToSelf ? 'Identity Confirmed!' : 'Student ID Verified!'}
                </h3>
                <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                  {verifiedData?.alreadyLinkedToSelf
                    ? 'This college identity is already linked to your personal account.'
                    : `Your personal account is now linked to an RIT student identity (${verifiedData?.department || 'RIT'}).`}
                </p>
                {verifiedData?.identityHashPreview && (
                  <p className="text-[11px] text-slate-500 font-mono pt-1">
                    Fingerprint: {verifiedData.identityHashPreview}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Private Identity Shield Active</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Your real student name, roll number, and department are sealed. Next, choose your
                  anonymous handle and avatar for campus chats.
                </p>
              </div>

              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={() => navigate('/username')}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Continue to Choose Anonymous Handle
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-slate-800/60 pt-4">
          <button
            type="button"
            onClick={() => navigate('/username')}
            className="text-xs text-slate-400 hover:text-white underline underline-offset-4"
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
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
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
              variant="ghost"
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
              loadingText="Unlinking ID card..."
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
