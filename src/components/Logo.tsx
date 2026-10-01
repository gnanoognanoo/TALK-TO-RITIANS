import React from 'react';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
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
        <span className={`font-bold tracking-tight text-gray-900 dark:text-[#F2F5F2] ${textSizes[size]}`}>
          Talk to <span className="text-brand-600 dark:text-[#8FAF56]">RITians</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
