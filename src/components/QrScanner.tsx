/**
 * ============================================================================
 * TALK TO RITIANS - College ID QR Scanner Component
 * ============================================================================
 * Implements a camera-based QR scanner using html5-qrcode.
 *
 * Handles:
 * - Camera device support detection
 * - Permission requests & permission denied states
 * - No camera available state
 * - Active scanning with custom viewfinder & laser reticle
 * - Scan success & error handling
 * - Clean hardware release on unmount (zero video stream memory leaks)
 * - Strict privacy: NO images, frames, or canvas snapshots are ever stored or transmitted.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, AlertTriangle, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import { CameraStatus } from '../types';
import { MOCK_COLLEGE_QR_SAMPLES } from '../services/qrParser';

export interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onScan, onError, disabled = false }) => {
  const containerId = 'rit-qr-scanner-viewport';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  /**
   * Safely stops and cleans up the camera stream.
   */
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current && isRunningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.warn('[QrScanner] Error stopping html5QrCode:', err);
      } finally {
        isRunningRef.current = false;
      }
    }
  }, []);

  /**
   * Initializes and starts the camera scan loop.
   */
  const startScanner = useCallback(async () => {
    if (disabled) return;
    isProcessingRef.current = false;

    // 1. Check browser mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('no_camera');
      setErrorMessage('Your browser does not support camera access or the page is not served over a secure (HTTPS) connection.');
      return;
    }

    setStatus('checking_support');
    setErrorMessage('');

    try {
      // 2. Enumerate available video inputs
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setStatus('no_camera');
        setErrorMessage('No camera devices were detected on your system. Please connect a webcam or scan from a mobile phone.');
        return;
      }

      setHasMultipleCameras(devices.length > 1);

      // 3. Stop any prior instance
      await stopScanner();

      // 4. Create scanner instance
      const scanner = new Html5Qrcode(containerId);
      html5QrCodeRef.current = scanner;

      setStatus('scanning');

      // 5. Start camera stream (prefer environment/back camera on mobile)
      await scanner.start(
        { facingMode },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.75);
            return { width: qrboxSize, height: qrboxSize };
          },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          // Lock scanning immediately to prevent duplicate detections across video frames
          if (isProcessingRef.current) return;
          isProcessingRef.current = true;

          // Scan success callback
          setStatus('scan_success');
          isRunningRef.current = false;
          try {
            await scanner.stop();
          } catch {
            // Ignore stop errors on success
          }
          onScan(decodedText);
        },
        () => {
          // Frame-by-frame miss callback (normal during scanning, ignore)
        }
      );

      isRunningRef.current = true;
    } catch (err: unknown) {
      isRunningRef.current = false;
      const errorStr = String(err);

      if (
        errorStr.includes('NotAllowedError') ||
        errorStr.includes('Permission denied') ||
        errorStr.includes('PermissionDeniedError')
      ) {
        setStatus('permission_denied');
        setErrorMessage('Camera access was blocked by your browser. Please grant camera permission in your site settings to scan your student ID card.');
      } else if (errorStr.includes('NotFoundError') || errorStr.includes('DevicesNotFoundError')) {
        setStatus('no_camera');
        setErrorMessage('No camera was found on your device.');
      } else {
        setStatus('scan_error');
        setErrorMessage("We couldn't scan the QR. Try again or use the verification-link option.");
      }

      if (onError) {
        onError("We couldn't scan the QR. Try again or use the verification-link option.");
      }
    }
  }, [disabled, facingMode, onScan, onError, stopScanner]);

  /**
   * Mount and unmount lifecycle
   */
  useEffect(() => {
    let isMounted = true;

    if (!disabled && isMounted) {
      startScanner();
    }

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [disabled, startScanner, stopScanner]);

  /**
   * Toggle between front and back camera (mobile devices)
   */
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  /**
   * Quick development simulation trigger
   */
  const handleSimulateMock = (mockPayload: string) => {
    setStatus('scan_success');
    stopScanner();
    onScan(mockPayload);
  };

  return (
    <div className="space-y-4">
      {/* Scanner Viewport Container (Native Viewfinder Feel) */}
      <div className="relative aspect-square max-w-[280px] sm:max-w-[310px] mx-auto rounded-[28px] bg-[#050805] border border-[rgba(141,168,82,0.25)] overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center">
        {/* DOM node where html5-qrcode attaches the <video> element */}
        <div
          id={containerId}
          className={`w-full h-full object-cover ${status === 'scanning' ? 'block' : 'hidden'}`}
        />

        {/* Viewfinder Overlay with Soft Corner Brackets & Subtle Moving Scan Line */}
        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
            <div className="relative w-full h-full rounded-2xl overflow-hidden border border-white/5">
              {/* Soft corner brackets */}
              <div className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-[#8DA852] rounded-tl-xl shadow-[0_0_8px_rgba(141,168,82,0.4)]" />
              <div className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-[#8DA852] rounded-tr-xl shadow-[0_0_8px_rgba(141,168,82,0.4)]" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-[#8DA852] rounded-bl-xl shadow-[0_0_8px_rgba(141,168,82,0.4)]" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-[#8DA852] rounded-br-xl shadow-[0_0_8px_rgba(141,168,82,0.4)]" />

              {/* Moving / pulsing laser reticle */}
              <div
                className="absolute inset-x-3 h-0.5 bg-gradient-to-r from-transparent via-[#8DA852] to-transparent rounded-full animate-pulse shadow-[0_0_8px_rgba(141,168,82,0.8)]"
                style={{ top: '48%' }}
              />
            </div>
          </div>
        )}

        {/* State: Checking support */}
        {status === 'checking_support' && (
          <div className="text-center p-6 space-y-3 text-[#9DA89A]">
            <RefreshCw className="h-8 w-8 mx-auto text-[#8DA852] animate-spin" />
            <p className="text-xs font-semibold text-[#F4F6F1]">Initializing Camera...</p>
            <p className="text-[11px] text-[#6F796D]">Requesting device video stream</p>
          </div>
        )}

        {/* State: Permission Denied */}
        {status === 'permission_denied' && (
          <div className="text-center p-5 space-y-3 animate-in fade-in">
            <div className="h-12 w-12 rounded-full bg-amber-950/40 text-amber-400 border border-amber-500/30 mx-auto flex items-center justify-center">
              <CameraOff className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#F4F6F1]">Camera Access Denied</h4>
              <p className="text-[11px] text-[#9DA89A] leading-relaxed max-w-[240px] mx-auto">
                {errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={startScanner}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-amber-300 bg-amber-950/30 border border-amber-500/30 hover:bg-amber-950/50 active:scale-95 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Permission</span>
            </button>
          </div>
        )}

        {/* State: No Camera */}
        {status === 'no_camera' && (
          <div className="text-center p-5 space-y-3 animate-in fade-in">
            <div className="h-12 w-12 rounded-full bg-rose-950/40 text-rose-400 border border-rose-500/30 mx-auto flex items-center justify-center">
              <CameraOff className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#F4F6F1]">No Camera Detected</h4>
              <p className="text-[11px] text-[#9DA89A] leading-relaxed max-w-[240px] mx-auto">
                {errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={startScanner}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-rose-300 bg-rose-950/30 border border-rose-500/30 hover:bg-rose-950/50 active:scale-95 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Re-check Devices</span>
            </button>
          </div>
        )}

        {/* State: Scan Error */}
        {status === 'scan_error' && (
          <div className="text-center p-5 space-y-3 animate-in fade-in">
            <div className="h-12 w-12 rounded-full bg-rose-950/40 text-rose-400 border border-rose-500/30 mx-auto flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#F4F6F1]">Scanner Interrupted</h4>
              <p className="text-[11px] text-[#9DA89A] leading-relaxed max-w-[240px] mx-auto">
                {errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={startScanner}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#9DA89A] hover:text-[#F4F6F1] bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:bg-[#142314] active:scale-95 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Restart Camera</span>
            </button>
          </div>
        )}

        {/* State: Scan Success */}
        {status === 'scan_success' && (
          <div className="text-center p-5 space-y-2 animate-in zoom-in-95">
            <div className="h-12 w-12 rounded-full bg-[#121E12] text-[#A2BD63] border border-[rgba(141,168,82,0.4)] mx-auto flex items-center justify-center shadow-[0_0_16px_rgba(141,168,82,0.3)]">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-[#F4F6F1]">QR Captured!</h4>
            <p className="text-[11px] text-[#8DA852]">Validating student credentials...</p>
          </div>
        )}
      </div>

      {/* Camera Controls & Mobile Facing Mode Switch */}
      {status === 'scanning' && hasMultipleCameras && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleFacingMode}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#101A12] border border-[rgba(141,168,82,0.25)] text-[#A2BD63] text-xs hover:bg-[#182B18] transition-all shadow-sm active:scale-95"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Switch to {facingMode === 'environment' ? 'Front' : 'Back'} Camera</span>
          </button>
        </div>
      )}

      {/* Development Mock Simulation Toolbar - Visible ONLY in development mode */}
      {import.meta.env.DEV && (
        <div className="p-3.5 rounded-2xl bg-[#091009]/80 border border-[rgba(141,168,82,0.18)] space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#A2BD63]">
            <Sparkles className="h-3.5 w-3.5 text-[#8DA852]" />
            <span>Development Testing (Mock QR Inputs)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.validMockCSE)}
              className="px-2.5 py-1.5 rounded-xl bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:border-[#8DA852] text-left text-[11px] text-[#9DA89A] hover:text-[#F4F6F1] transition-all font-medium active:scale-95"
            >
              🎓 Mock CSE Student
            </button>
            <button
              type="button"
              onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.validMockECE)}
              className="px-2.5 py-1.5 rounded-xl bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:border-[#8DA852] text-left text-[11px] text-[#9DA89A] hover:text-[#F4F6F1] transition-all font-medium active:scale-95"
            >
              ⚡ Mock ECE Student
            </button>
            <button
              type="button"
              onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.delimitedSample)}
              className="px-2.5 py-1.5 rounded-xl bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:border-amber-400 text-left text-[11px] text-[#9DA89A] hover:text-[#F4F6F1] transition-all font-medium active:scale-95"
            >
              📋 Delimited Key-Value
            </button>
            <button
              type="button"
              onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.invalidQr)}
              className="px-2.5 py-1.5 rounded-xl bg-[#101A12] border border-[rgba(141,168,82,0.2)] hover:border-rose-400 text-left text-[11px] text-[#9DA89A] hover:text-[#F4F6F1] transition-all font-medium active:scale-95"
            >
              ❌ Invalid External QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QrScanner;
