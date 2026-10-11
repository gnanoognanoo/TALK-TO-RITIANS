import React from 'react';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  onDark?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  onDark = false,
}) => {
  // Visual sizing targets:
  // Mobile: 40px–48px square
  // Desktop: 42px–50px square
  const iconSizes = {
    sm: 'h-8 w-auto max-w-[38px]',
    md: 'h-10 sm:h-11 w-auto max-w-[48px] sm:max-w-[52px]',
    lg: 'h-14 sm:h-16 w-auto max-w-[68px] sm:max-w-[76px]',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  // Text contrast strategy:
  // Default (theme-aware):
  //   Light Mode: "Talk to" is dark slate (#0F172A / text-slate-900), "RITians" is primary purple (#6D42E8 / text-brand-600)
  //   Dark Mode: "Talk to" is off-white (#F4F6F1), "RITians" is chemical green (#A2BD63)
  // When explicitly on dark background (onDark = true):
  //   "Talk to" is pure white (#FFFFFF), "RITians" is accent green (#A2BD63)
  const talkToColor = onDark
    ? 'text-white dark:text-[#F4F6F1]'
    : 'text-slate-900 dark:text-[#F4F6F1]';

  const ritiansColor = onDark
    ? 'text-[#A2BD63] dark:text-[#A2BD63]'
    : 'text-[#6D42E8] dark:text-[#A2BD63]';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Breaking Bad BrBa Chat Bubble Logo */}
      <div className="relative shrink-0 flex items-center justify-center transition-transform group-hover:scale-105">
        <img
          src="/brba-logo.svg"
          alt={showText ? '' : 'Talk to RITians'}
          aria-hidden={showText ? 'true' : undefined}
          className={`${iconSizes[size]} object-contain drop-shadow-[0_2px_8px_rgba(74,222,128,0.18)]`}
          loading="eager"
          decoding="async"
        />
      </div>

      {showText && (
        <span className={`font-bold tracking-tight ${talkToColor} ${textSizes[size]}`}>
          Talk to <span className={ritiansColor}>RITians</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
