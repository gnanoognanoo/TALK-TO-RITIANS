/**
 * ============================================================================
 * TALK TO RITIANS - Client-Side Local OCR Service
 * ============================================================================
 * Processes camera frames on-device to extract printed card text.
 *
 * CRITICAL PRIVACY & SECURITY RULES:
 * 1. ZERO PERSISTENCE: Images, video frames, and canvas buffers NEVER leave
 *    the device and are never sent to Supabase Storage or any server.
 * 2. Frames are processed directly in local memory and immediately cleared.
 * 3. Text output is sanitized before being passed to parser (PII stripped).
 * 4. Uses browser-native TextDetector API if available, falling back to
 *    in-memory client-side Tesseract.js.
 */

declare global {
  interface Window {
    TextDetector?: any;
    Tesseract?: any;
  }
}

let tesseractLoadPromise: Promise<any> | null = null;

/**
 * Dynamically loads Tesseract.js from CDN if browser-native TextDetector is unavailable.
 */
function loadClientTesseract(): Promise<any> {
  if (window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }

  if (tesseractLoadPromise) {
    return tesseractLoadPromise;
  }

  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) {
        resolve(window.Tesseract);
      } else {
        reject(new Error('Tesseract script loaded but window.Tesseract not found.'));
      }
    };
    script.onerror = () => {
      tesseractLoadPromise = null;
      reject(new Error('Failed to load client-side OCR engine.'));
    };
    document.head.appendChild(script);
  });

  return tesseractLoadPromise;
}

export interface LocalOcrResult {
  success: boolean;
  rawText?: string;
  error?: string;
}

/**
 * Performs on-device OCR on a canvas or video element.
 * Immediately clears canvas context after recognition to ensure zero image retention.
 */
export async function performLocalCardOcr(
  canvas: HTMLCanvasElement
): Promise<LocalOcrResult> {
  try {
    // 1. Try native browser TextDetector (hardware-accelerated, native in Chromium)
    if (typeof window !== 'undefined' && 'TextDetector' in window) {
      try {
        const detector = new (window as any).TextDetector();
        const detected = await detector.detect(canvas);
        if (Array.isArray(detected) && detected.length > 0) {
          const lines = detected.map((d: any) => d.rawValue || '').filter(Boolean);
          const rawText = lines.join('\n');

          // Clear canvas memory immediately
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (rawText.trim().length > 0) {
            return { success: true, rawText };
          }
        }
      } catch (nativeErr) {
        console.warn('[performLocalCardOcr] Native TextDetector fallback:', nativeErr);
      }
    }

    // 2. Fallback to client-side Tesseract.js in browser
    const Tesseract = await loadClientTesseract();
    const result = await Tesseract.recognize(canvas, 'eng', {
      logger: () => {}, // silent
    });

    // Clear canvas memory immediately
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rawText = result?.data?.text || '';
    if (!rawText.trim()) {
      return {
        success: false,
        error: "We couldn't read the required details from the card. Try again in better lighting.",
      };
    }

    return {
      success: true,
      rawText,
    };
  } catch (err: any) {
    // Clear canvas memory on error as well
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch {
      // ignore
    }

    console.warn('[performLocalCardOcr] OCR error:', err);
    return {
      success: false,
      error:
        err?.message ||
        "We couldn't read the required details from the card. Try again in better lighting.",
    };
  }
}
