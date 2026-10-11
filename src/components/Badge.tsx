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
    bg: 'bg-brand-50 dark:bg-[#121E12] text-brand-700 dark:text-[#A2BD63] border-brand-200 dark:border-[rgba(150,175,120,0.24)]',
    dot: 'bg-brand-600 dark:bg-[#8DA852]',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-[#101D11] text-emerald-800 dark:text-[#7FAE61] border-emerald-200 dark:border-[rgba(150,175,120,0.24)]',
    dot: 'bg-emerald-600 dark:bg-[#7FAE61]',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  danger: {
    bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    dot: 'bg-rose-600 dark:bg-rose-400',
  },
  neutral: {
    bg: 'bg-slate-100 dark:bg-[#101A12] text-slate-800 dark:text-[#C0CCBC] border-slate-200 dark:border-[rgba(150,175,120,0.24)]',
    dot: 'bg-slate-500 dark:bg-[#A2B09D]',
  },
  outline: {
    bg: 'bg-transparent text-slate-700 dark:text-[#C0CCBC] border-slate-300 dark:border-[rgba(150,175,120,0.24)]',
    dot: 'bg-slate-500 dark:bg-[#A2B09D]',
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
