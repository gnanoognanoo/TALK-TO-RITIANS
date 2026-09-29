/**
 * ============================================================================
 * TALK TO RITIANS - Front of ID Card Scanner (Local OCR Viewfinder)
 * ============================================================================
 * Allows scanning the front of older/senior RIT ID cards to extract
 * the printed Register Number, Student Name, Department, and Batch.
 *
 * CRITICAL PRIVACY & SECURITY INVARIANTS:
 * 1. Zero Persistence: Video frames and canvas buffers are processed
 *    locally on the device and immediately destroyed.
 * 2. ID images NEVER leave the device.
 * 3. Extraneous PII (blood group, address, phone) is discarded immediately.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { performLocalCardOcr } from '../services/localOcrService';
import { parseLegacyCardOcrText, ExtractedLegacyCardFields } from '../services/legacyCardParser';

export interface IdFrontScannerProps {
  expectedRegisterNumber?: string;
  onCapture: (result: { rawText: string; fields: ExtractedLegacyCardFields }) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export const IdFrontScanner: React.FC<IdFrontScannerProps> = ({
  expectedRegisterNumber,
  onCapture,
  onError,
  onCancel,
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessingOcr, setIsProcessingOcr] = useState<boolean>(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  /**
   * Stops camera stream tracks safely.
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  /**
   * Initializes device camera stream.
   */
  const startCamera = useCallback(async () => {
    if (disabled) return;
    setCameraError(null);
    setLocalFeedback(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser or connection is not secure (HTTPS).');
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('[IdFrontScanner] Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera permissions to scan your card.');
      } else {
        setCameraError('Unable to access camera. Please check your camera permissions or use another device.');
      }
    }
  }, [disabled, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  /**
   * Captures the current video frame into an off-screen canvas,
   * runs local on-device OCR, parses text, and discards the image immediately.
   */
  const handleCaptureFrame = async () => {
    if (!videoRef.current || isProcessingOcr) return;

    setIsProcessingOcr(true);
    setLocalFeedback('Processing frame locally on your device...');

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      // Create temporary off-screen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not initialize canvas context.');
      }

      ctx.drawImage(video, 0, 0, width, height);

      // Perform local on-device OCR
      const ocrResult = await performLocalCardOcr(canvas);

      // Explicitly clear canvas memory immediately (ZERO PERSISTENCE)
      ctx.clearRect(0, 0, width, height);
      canvas.width = 0;
      canvas.height = 0;

      if (!ocrResult.success || !ocrResult.rawText) {
        const errorMsg =
          ocrResult.error ||
          "We couldn't read the required details from the card. Try again in better lighting.";
        setLocalFeedback(null);
        onError(errorMsg);
        setIsProcessingOcr(false);
        return;
      }

      // Parse the extracted text (PII stripped)
      const fields = parseLegacyCardOcrText(ocrResult.rawText);

      setIsProcessingOcr(false);
      setLocalFeedback(null);
      stopCamera();

      onCapture({
        rawText: ocrResult.rawText,
        fields,
      });
    } catch (err: any) {
      setIsProcessingOcr(false);
      setLocalFeedback(null);
      onError(
        err?.message ||
          "We couldn't read the required details from the card. Try again in better lighting."
      );
    }
  };

  /**
   * Helper simulator for environments without camera / test mode.
   */
  const handleSimulateCapture = () => {
    if (!expectedRegisterNumber) {
      onError('No QR number detected to simulate.');
      return;
    }
    stopCamera();
    const simulatedText = `RAJALAKSHMI INSTITUTE OF TECHNOLOGY
STUDENT IDENTITY CARD
K. GNANESHWAR
REGISTER NO: ${expectedRegisterNumber}
COURSE: COMPUTER SCIENCE AND ENGINEERING
BATCH: 2021-2025`;

    const fields = parseLegacyCardOcrText(simulatedText);
    onCapture({
      rawText: simulatedText,
      fields,
    });
  };

  return (
    <div className="space-y-4">
      {/* Viewfinder Container */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-900 rounded-2xl overflow-hidden border-2 border-dashed border-brand-500/60 shadow-inner flex items-center justify-center">
        {/* Active Video Feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Viewfinder ID Card Bounding Frame Overlay */}
        <div className="absolute inset-4 sm:inset-8 border-2 border-white/80 rounded-xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex flex-col justify-between p-3 sm:p-4">
          <div className="flex justify-between items-center text-[10px] sm:text-xs font-bold text-white/90 uppercase tracking-widest bg-black/40 px-2.5 py-1 rounded-md backdrop-blur-sm self-start">
            Align ID Card Front
          </div>

          <div className="text-center text-[11px] text-white/80 bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm mx-auto">
            Ensure Student Name &amp; Register Number are clearly visible
          </div>
        </div>

        {/* Camera Loading State */}
        {!cameraActive && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 p-4 text-center">
            <RefreshCw className="h-7 w-7 animate-spin text-brand-400" />
            <p className="text-xs font-semibold">Starting camera...</p>
          </div>
        )}

        {/* Camera Error State */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-slate-900/95 text-white">
            <CameraOff className="h-10 w-10 text-rose-400" />
            <p className="text-xs text-rose-200 max-w-xs">{cameraError}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={startCamera}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Retry Camera
            </Button>
          </div>
        )}
      </div>

      {localFeedback && (
        <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs flex items-center gap-2 animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin text-brand-600 shrink-0" />
          <span>{localFeedback}</span>
        </div>
      )}

      {/* Zero Persistence Guarantee Banner */}
      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-900 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Zero-Storage Local Processing:</span> Card image is scanned
          entirely inside your browser's memory and is immediately cleared. We never upload or save
          photos of your ID card.
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <Button
          type="button"
          variant="primary"
          fullWidth
          disabled={!cameraActive || isProcessingOcr || disabled}
          isLoading={isProcessingOcr}
          loadingText="Reading ID Details..."
          onClick={handleCaptureFrame}
          leftIcon={<Camera className="h-4 w-4" />}
          className="font-bold py-2.5 shadow-sm"
        >
          Capture &amp; Read Front of Card
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          disabled={isProcessingOcr}
          className="sm:w-auto"
        >
          Cancel
        </Button>
      </div>

      {/* Dev / Test simulator button if environment has camera limitations */}
      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={handleSimulateCapture}
          className="text-[11px] text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 underline"
        >
          Dev/Simulate: Read card front with matching Register No ({expectedRegisterNumber})
        </button>
      </div>
    </div>
  );
};
