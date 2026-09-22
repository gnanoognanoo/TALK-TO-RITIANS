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
import { Button } from './Button';
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
        setErrorMessage(`Camera initialization error: ${err instanceof Error ? err.message : 'Unable to start camera'}`);
      }

      if (onError) {
        onError(errorStr);
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
      {/* Scanner Viewport Container */}
      <div className="relative aspect-square max-w-[280px] sm:max-w-[300px] mx-auto rounded-2xl bg-gray-50 border border-gray-200 overflow-hidden shadow-sm flex flex-col items-center justify-center">
        {/* DOM node where html5-qrcode attaches the <video> element */}
        <div
          id={containerId}
          className={`w-full h-full object-cover ${status === 'scanning' ? 'block' : 'hidden'}`}
        />

        {/* Viewfinder Overlay with Subtle Corner Brackets */}
        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
            <div className="relative w-full h-full rounded-xl overflow-hidden">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-brand-500 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-brand-500 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-brand-500 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-brand-500 rounded-br" />

              {/* Subtle Scanning Pulse Indicator */}
              <div
                className="absolute inset-x-4 h-0.5 bg-brand-500/60 rounded-full animate-pulse"
                style={{ top: '48%' }}
              />
            </div>
          </div>
        )}

        {/* State: Checking support */}
        {status === 'checking_support' && (
          <div className="text-center p-6 space-y-3 text-gray-500">
            <RefreshCw className="h-8 w-8 mx-auto text-brand-600 animate-spin" />
            <p className="text-xs font-semibold text-gray-900">Initializing Camera...</p>
            <p className="text-[11px] text-gray-400">Requesting device video stream</p>
          </div>
        )}

        {/* State: Permission Denied */}
        {status === 'permission_denied' && (
          <div className="text-center p-5 space-y-3 animate-in fade-in">
            <div className="h-12 w-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center">
              <CameraOff className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">Camera Access Denied</h4>
              <p className="text-[11px] text-gray-500 leading-relaxed max-w-[240px] mx-auto">
                {errorMessage}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startScanner}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Retry Camera Permission
            </Button>
          </div>
        )}

        {/* State: No Camera */}
        {status === 'no_camera' && (
          <div className="text-center p-5 space-y-3 animate-in fade-in">
            <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 border border-rose-200 mx-auto flex items-center justify-center">
              <CameraOff className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">No Camera Found</h4>
              <p className="text-[11px] text-gray-500 leading-relaxed max-w-[240px] mx-auto">
                {errorMessage}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startScanner}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Re-check Devices
            </Button>
          </div>
        )}

        {/* State: Scan Error */}
        {status === 'scan_error' && (
          <div className="text-center p-5 space-y-3 animate-in fade-in">
            <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 border border-rose-200 mx-auto flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">Scanner Interrupted</h4>
              <p className="text-[11px] text-gray-500 leading-relaxed max-w-[240px] mx-auto">
                {errorMessage}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startScanner}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Restart Camera
            </Button>
          </div>
        )}

        {/* State: Scan Success */}
        {status === 'scan_success' && (
          <div className="text-center p-5 space-y-2 animate-in zoom-in-95">
            <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-gray-900">QR Code Captured!</h4>
            <p className="text-[11px] text-emerald-600">Parsing student card attributes...</p>
          </div>
        )}
      </div>

      {/* Camera Controls & Mobile Facing Mode Switch */}
      {status === 'scanning' && hasMultipleCameras && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleFacingMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Switch to {facingMode === 'environment' ? 'Front' : 'Back'} Camera</span>
          </button>
        </div>
      )}

      {/* Development Mock Simulation Toolbar */}
      <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
          <span>Development Testing Tools (Mock QR Inputs)</span>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Don't have a physical student card handy? Test the scanner with pre-configured mock payloads:
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.validMockCSE)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50/50 text-left text-[11px] text-gray-700 transition-all font-medium shadow-sm"
          >
            🎓 Mock CSE Student
          </button>
          <button
            type="button"
            onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.validMockECE)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50/50 text-left text-[11px] text-gray-700 transition-all font-medium shadow-sm"
          >
            ⚡ Mock ECE Student
          </button>
          <button
            type="button"
            onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.delimitedSample)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 text-left text-[11px] text-gray-700 transition-all font-medium shadow-sm"
          >
            📋 Delimited Key-Value
          </button>
          <button
            type="button"
            onClick={() => handleSimulateMock(MOCK_COLLEGE_QR_SAMPLES.invalidQr)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-rose-300 hover:bg-rose-50/50 text-left text-[11px] text-gray-700 transition-all font-medium shadow-sm"
          >
            ❌ Invalid External QR
          </button>
        </div>
      </div>
    </div>
  );
};

export default QrScanner;
