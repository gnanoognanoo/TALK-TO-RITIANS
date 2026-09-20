import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, ShieldCheck, Camera, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, ErrorMessage } from '../components';

export const VerifyCollegePage: React.FC = () => {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleSimulateScan = () => {
    setScanError(null);
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setIsVerified(true);
    }, 1200);
  };

  const handleSimulateScanError = () => {
    setIsVerified(false);
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScanError('Unable to detect a valid RIT student ID barcode. Please check your camera alignment and lighting.');
    }, 800);
  };

  return (
    <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2">
          <Badge variant="brand" size="sm" withDot>
            Step 1 &bull; Verification
          </Badge>
        </div>
        <CardTitle>Verify College ID</CardTitle>
        <CardDescription>
          Scan the QR code printed on your physical Rajalakshmi Institute of Technology student ID card.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Viewport Simulation Box */}
        <div className="relative aspect-video sm:aspect-square max-w-[280px] mx-auto rounded-2xl bg-slate-950 border-2 border-slate-800 flex flex-col items-center justify-center p-4 overflow-hidden group shadow-inner">
          {/* Corner target reticles */}
          <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-brand-400 rounded-tl" />
          <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-brand-400 rounded-tr" />
          <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-brand-400 rounded-bl" />
          <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-brand-400 rounded-br" />

          {/* Scanning Animation */}
          {isScanning && (
            <div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_12px_#6366f1] animate-bounce"
              style={{ top: '40%' }}
            />
          )}

          {isVerified ? (
            <div className="text-center space-y-2 animate-in zoom-in-95">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="text-xs font-bold text-white">ID Verified Successfully</p>
              <p className="text-[11px] text-emerald-400 font-mono">HASH: 7a8f...91e3</p>
            </div>
          ) : (
            <div className="text-center space-y-2 text-slate-400">
              <Camera className="h-8 w-8 mx-auto text-slate-500" />
              <p className="text-xs">Align student QR code within frame</p>
              <p className="text-[11px] text-slate-500">Camera preview placeholder</p>
            </div>
          )}
        </div>

        {/* Scan Error Message */}
        {scanError && (
          <ErrorMessage
            title="Verification Scan Failed"
            message={scanError}
            onRetry={handleSimulateScan}
            retryText="Retry Scan"
            onDismiss={() => setScanError(null)}
          />
        )}

        {/* Action Controls */}
        <div className="space-y-3">
          {isVerified ? (
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/profile/setup')}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continue to Anonymous Profile
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                variant="primary"
                fullWidth
                isLoading={isScanning}
                loadingText="Scanning ID barcode..."
                onClick={handleSimulateScan}
                leftIcon={<QrCode className="h-4 w-4" />}
              >
                Simulate ID Card Scan
              </Button>
              <button
                type="button"
                onClick={handleSimulateScanError}
                className="w-full text-center text-[11px] text-slate-500 hover:text-rose-400 transition-colors py-1"
              >
                Simulate scan error state
              </button>
            </div>
          )}
        </div>

        {/* Privacy & Anti-abuse callout */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Cryptographic Privacy Guarantee</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            We store only a one-way cryptographic hash of your student roll number to enforce 1-to-1 account uniqueness. Your name and card data are never stored in plain text or shared with peers.
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-center border-t border-slate-800/60 pt-4">
        <button
          type="button"
          onClick={() => navigate('/profile/setup')}
          className="text-xs text-slate-400 hover:text-white underline underline-offset-4"
        >
          Skip verification for UI preview &rarr;
        </button>
      </CardFooter>
    </Card>
  );
};

export default VerifyCollegePage;
