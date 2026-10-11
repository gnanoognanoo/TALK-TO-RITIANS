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
  onDark = true,
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
  // On dark navbar (default):
  //   Light Mode: "Talk to" is crisp white (#FFFFFF), "RITians" is vibrant high-contrast purple (#A78BFA / text-brand-400)
  //   Dark Mode: "Talk to" is off-white (#F2F5F2), "RITians" is muted chemical green (#8FAF56)
  // On light surface (when onDark = false):
  //   Light Mode: "Talk to" is dark navy/slate (#111827 / text-gray-900), "RITians" is primary brand purple (#6C4CF5 / text-brand-600)
  //   Dark Mode: "Talk to" is off-white (#F2F5F2), "RITians" is muted chemical green (#8FAF56)
  const talkToColor = onDark
    ? 'text-white dark:text-[#F2F5F2]'
    : 'text-gray-900 dark:text-[#F2F5F2]';

  const ritiansColor = onDark
    ? 'text-brand-400 dark:text-[#8FAF56]'
    : 'text-brand-600 dark:text-[#8FAF56]';

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
