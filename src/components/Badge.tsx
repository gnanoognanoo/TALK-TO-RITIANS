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
    bg: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
    dot: 'bg-brand-400',
  },
  success: {
    bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  warning: {
    bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  danger: {
    bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  neutral: {
    bg: 'bg-slate-800 text-slate-300 border-slate-700/60',
    dot: 'bg-slate-400',
  },
  outline: {
    bg: 'bg-transparent text-slate-300 border-slate-700',
    dot: 'bg-slate-400',
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
