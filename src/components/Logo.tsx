import React from 'react';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const iconSizes = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
    lg: 'h-11 w-11',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Overlapping chat bubbles custom icon */}
      <div className={`relative shrink-0 flex items-center justify-center rounded-xl bg-brand-50 p-1.5 border border-brand-100 ${iconSizes[size]}`}>
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full text-brand-600"
          aria-hidden="true"
        >
          {/* Back bubble */}
          <path
            d="M20 7H9C6.79 7 5 8.79 5 11V18C5 20.21 6.79 22 9 22H10V25L14 22H20C22.21 22 24 20.21 24 18V11C24 8.79 22.21 7 20 7Z"
            fill="#DDD6FE"
            stroke="#7C5CFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Front bubble overlapping */}
          <path
            d="M23 11H15C13.34 11 12 12.34 12 14V20C12 21.66 13.34 23 15 23H20L23.5 25.5V23H24C25.66 23 27 21.66 27 20V15C27 12.79 25.21 11 23 11Z"
            fill="#6C4CF5"
            stroke="#5B3CE3"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Subtle dots in front bubble */}
          <circle cx="16.5" cy="17" r="1" fill="white" />
          <circle cx="19.5" cy="17" r="1" fill="white" />
          <circle cx="22.5" cy="17" r="1" fill="white" />
        </svg>
      </div>

      {showText && (
        <span className={`font-bold tracking-tight text-gray-900 ${textSizes[size]}`}>
          Talk to <span className="text-brand-600">RITians</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
