import React, { useState, useEffect } from 'react';
import { HeisenbergIcon } from './HeisenbergSignature';

export const SPLASH_SESSION_KEY = 'talk_to_ritians_intro_seen';

export interface CreatorSplashScreenProps {
  /**
   * For testing or forced preview purposes.
   */
  forceShow?: boolean;
}

/**
 * CreatorSplashScreen
 * A minimal, elegant, mysterious initial intro splash displaying:
 * Talk to RITians -> Created by -> HEISENBERG [signature icon]
 *
 * Runs once per browser session using sessionStorage.
 * Does not block background authentication or session restoration.
 */
export const CreatorSplashScreen: React.FC<CreatorSplashScreenProps> = ({ forceShow = false }) => {
  const [visible, setVisible] = useState<boolean>(() => {
    if (forceShow) return true;
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(SPLASH_SESSION_KEY) !== 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) return;

    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    } catch {
      // Ignore private/incognito quota restrictions
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Total intro stays under 2 seconds:
    // reduced motion exits earlier (1000ms), standard completes after fadeout (1850ms)
    const timeout = setTimeout(
      () => {
        setVisible(false);
      },
      prefersReducedMotion ? 1000 : 1850
    );

    return () => clearTimeout(timeout);
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      id="creator-splash-screen"
      role="status"
      aria-label="Talk to RITians Intro"
      className="fixed inset-0 z-[9999] splash-bg bg-[#090D16] flex flex-col items-center justify-center px-4 select-none pointer-events-auto"
    >
      <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto">
        {/* Talk to RITians */}
        <h1 className="splash-title text-2xl sm:text-3xl font-extrabold tracking-tight">
          <span className="text-white">Talk to </span>
          <span className="text-brand-500">RITians</span>
        </h1>

        {/* Created by */}
        <p className="splash-subtitle text-xs sm:text-[13px] font-mono tracking-widest uppercase text-slate-400">
          Created by
        </p>

        {/* HEISENBERG [signature icon] */}
        <div className="splash-creator flex items-center justify-center gap-2.5 pt-0.5">
          <span className="text-base sm:text-lg font-bold tracking-[0.25em] text-white uppercase font-mono">
            HEISENBERG
          </span>
          <HeisenbergIcon
            size={18}
            className="text-emerald-400 shrink-0"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
};

export default CreatorSplashScreen;
