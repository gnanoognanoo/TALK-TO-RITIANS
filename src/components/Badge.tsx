import React from 'react';

export type BadgeVariant = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  withDot?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, { bg: string; dot: string }> = {
  brand: {
    bg: 'bg-brand-50 dark:bg-[#101A12] text-brand-700 dark:text-[#A8C96A] border-brand-200 dark:border-[rgba(120,160,100,0.25)]',
    dot: 'bg-brand-600 dark:bg-[#8FAF56]',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-[#101A12] text-emerald-700 dark:text-[#7FAE61] border-emerald-200 dark:border-[rgba(120,160,100,0.25)]',
    dot: 'bg-emerald-500 dark:bg-[#7FAE61]',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  danger: {
    bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
    dot: 'bg-rose-500 dark:bg-rose-400',
  },
  neutral: {
    bg: 'bg-gray-100 dark:bg-[#0D150F] text-gray-700 dark:text-[#AEB9AE] border-gray-200 dark:border-[rgba(120,160,100,0.18)]',
    dot: 'bg-gray-400 dark:bg-[#758275]',
  },
  outline: {
    bg: 'bg-transparent text-gray-600 dark:text-[#AEB9AE] border-gray-300 dark:border-[rgba(120,160,100,0.22)]',
    dot: 'bg-gray-400 dark:bg-[#758275]',
  },
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[11px] px-2 py-0.5 gap-1.5',
  md: 'text-xs px-2.5 py-1 gap-1.5',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'brand',
  size = 'md',
  withDot = false,
  className = '',
  children,
  ...props
}) => {
  const { bg, dot } = variantStyles[variant];

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full border
        ${bg} ${sizeStyles[size]} ${className}
      `.trim()}
      {...props}
    >
      {withDot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

export default Badge;
