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
    'bg-[#6D42E8] hover:bg-[#5B34CF] text-white shadow-sm border border-transparent active:scale-[0.98] dark:bg-gradient-to-r dark:from-[#8DA852] dark:to-[#A2BD63] dark:hover:from-[#96B25A] dark:hover:to-[#ACCA6E] dark:text-[#10170B] dark:font-bold dark:shadow-[0_8px_20px_-4px_rgba(141,168,82,0.35),inset_0_1px_1px_rgba(255,255,255,0.35)] dark:border-t dark:border-white/25',
  secondary:
    'bg-white hover:bg-slate-50 text-slate-800 border border-[#DCE3EC] hover:border-slate-300 shadow-sm active:scale-[0.98] dark:bg-[#0D160E] dark:hover:bg-[#152117] dark:text-[#F4F6F1] dark:border-[rgba(150,175,120,0.24)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]',
  danger:
    'bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 hover:border-rose-300 active:scale-[0.98] dark:bg-[#140C0E] dark:hover:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40 dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
  outline:
    'bg-transparent hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 active:scale-[0.98] dark:text-[#C0CCBC] dark:border-[rgba(150,175,120,0.24)] dark:hover:bg-[#101A12] dark:hover:text-[#F4F6F1]',
  ghost:
    'bg-transparent hover:bg-slate-100 text-slate-700 hover:text-slate-900 active:scale-[0.98] dark:text-[#C0CCBC] dark:hover:text-[#F4F6F1] dark:hover:bg-[#101A12]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-xl gap-1.5 font-medium min-h-[36px]',
  md: 'text-sm px-4.5 py-2.5 rounded-2xl gap-2 font-medium min-h-[44px]',
  lg: 'text-base px-6 py-3.5 rounded-2xl gap-2.5 font-semibold min-h-[48px]',
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
