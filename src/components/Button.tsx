import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 hover:bg-brand-700 text-white shadow-sm border border-transparent active:scale-[0.98] dark:bg-[#839D50] dark:hover:bg-[#96AF5E] dark:text-[#050806] dark:font-semibold',
  secondary:
    'bg-white hover:bg-slate-50 text-gray-700 border border-gray-200 hover:border-gray-300 shadow-sm active:scale-[0.98] dark:bg-[#0D150F]/80 dark:hover:bg-[#101A12] dark:text-[#F2F5F2] dark:border-[rgba(120,160,100,0.22)]',
  danger:
    'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 active:scale-[0.98] dark:bg-[#0D150F] dark:hover:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40',
  outline:
    'bg-transparent hover:bg-slate-100 text-gray-700 border border-gray-300 hover:border-gray-400 active:scale-[0.98] dark:text-[#AEB9AE] dark:border-[rgba(120,160,100,0.25)] dark:hover:bg-[#101A12]',
  ghost:
    'bg-transparent hover:bg-slate-100 text-gray-600 hover:text-gray-900 active:scale-[0.98] dark:text-[#AEB9AE] dark:hover:text-[#F2F5F2] dark:hover:bg-[#101A12]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5 font-medium min-h-[32px]',
  md: 'text-sm px-4 py-2.5 rounded-xl gap-2 font-medium min-h-[42px]',
  lg: 'text-base px-6 py-3 rounded-xl gap-2.5 font-semibold min-h-[48px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading}
        className={`
          inline-flex items-center justify-center transition-all duration-200 select-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white
          disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {isLoading ? (
          <>
            <Spinner
              size={size === 'lg' ? 'md' : 'sm'}
              variant={variant === 'primary' ? 'white' : 'brand'}
            />
            <span>{loadingText || children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0 items-center">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="inline-flex shrink-0 items-center">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
