import React from 'react';

export interface HeisenbergIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Minimalist geometric icon inspired by the iconic Heisenberg pork-pie hat & wire glasses silhouette.
 * Designed with clean line geometry to feel premium, modern, and mysterious.
 */
export const HeisenbergIcon: React.FC<HeisenbergIconProps> = ({
  size = 16,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block shrink-0 ${className}`}
    aria-hidden="true"
    {...props}
  >
    {/* Hat Crown */}
    <path
      d="M7.5 10V6.2C7.5 5.5 8.1 5 8.8 5H15.2C15.9 5 16.5 5.5 16.5 6.2V10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Hat Ribbon */}
    <path
      d="M7.5 8.5H16.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.6"
    />
    {/* Hat Brim */}
    <path
      d="M3.5 10.5C5.5 10.2 8.5 10 12 10C15.5 10 18.5 10.2 20.5 10.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* Glasses Frames */}
    <circle cx="8" cy="15" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="16" cy="15" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    {/* Glasses Bridge */}
    <path d="M10.2 15H13.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    {/* Glasses Temples */}
    <path d="M5.8 14.8L4 13.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M18.2 14.8L20 13.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export interface HeisenbergSignatureProps {
  variant?: 'footer' | 'badge' | 'subtle';
  className?: string;
}

export const HeisenbergSignature: React.FC<HeisenbergSignatureProps> = ({
  variant = 'subtle',
  className = '',
}) => {
  if (variant === 'footer') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-[#758275] hover:text-gray-600 dark:hover:text-[#AEB9AE] transition-colors select-none group ${className}`}
        title="Built for RITians. Signed: Heisenberg."
      >
        <HeisenbergIcon
          size={14}
          className="text-gray-400 dark:text-[#8FAF56] group-hover:text-emerald-600 dark:group-hover:text-[#A8C96A] transition-colors"
        />
        <span>
          Built for RITians. Signed:{' '}
          <span className="font-signature font-bold text-base tracking-wide text-gray-600 dark:text-[#9CB65F] dark:[text-shadow:0_0_18px_rgba(140,170,80,0.10)] group-hover:text-gray-800 dark:group-hover:text-[#A8C96A]">
            Heisenberg
          </span>
        </span>
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200/80 dark:border-[rgba(120,160,100,0.18)] bg-gray-50/60 dark:bg-[#0D150F]/70 text-gray-500 dark:text-[#AEB9AE] text-xs select-none ${className}`}
      >
        <HeisenbergIcon size={14} className="text-gray-400 dark:text-[#8FAF56]" />
        <span>
          An anonymous student project by{' '}
          <span className="font-signature font-bold text-lg text-gray-700 dark:text-[#9CB65F] dark:[text-shadow:0_0_18px_rgba(140,170,80,0.10)] tracking-wide">
            Heisenberg
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-[#758275] select-none ${className}`}
    >
      <HeisenbergIcon size={13} className="text-gray-400 dark:text-[#8FAF56]" />
      <span>
        Cooked by{' '}
        <span className="font-signature font-bold text-base text-gray-600 dark:text-[#9CB65F] dark:[text-shadow:0_0_18px_rgba(140,170,80,0.10)]">Heisenberg</span>
      </span>
    </div>
  );
};

export default HeisenbergSignature;
