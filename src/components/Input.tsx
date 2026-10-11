import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      id: customId,
      disabled,
      required,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = customId || generatedId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    const hasError = Boolean(error);
    const describedBy = hasError ? errorId : helperText ? helperId : undefined;

    return (
      <div className={`w-full space-y-1.5 ${containerClassName}`}>
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={id}
              className="block text-xs font-semibold text-slate-800 dark:text-[#F4F6F1]"
            >
              {label}
              {required && <span className="text-rose-500 ml-1" aria-hidden="true">*</span>}
            </label>
            {required && (
              <span className="text-[10px] text-gray-400 sr-only">required</span>
            )}
          </div>
        )}

        <div className="relative rounded-xl">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-[#A2B09D]">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            className={`
              w-full bg-white dark:bg-[#070D08] text-slate-900 dark:text-[#F4F6F1] placeholder-slate-400 dark:placeholder-[#A2B09D] rounded-xl
              border text-sm transition-all duration-150 min-h-[44px] shadow-sm
              focus-visible:outline-none focus-visible:border-[#6D42E8] dark:focus-visible:border-[#A2BD63] focus-visible:ring-4 focus-visible:ring-[#6D42E8]/10 dark:focus-visible:ring-[#A2BD63]/15
              disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-[#101A12] disabled:cursor-not-allowed
              ${leftIcon ? 'pl-10' : 'pl-3.5'}
              ${rightIcon ? 'pr-10' : 'pr-3.5'}
              py-2.5
              ${
                hasError
                  ? 'border-rose-300 text-rose-900 focus-visible:border-rose-500 focus-visible:ring-rose-500/15'
                  : 'border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)] hover:border-slate-300 dark:hover:border-[rgba(150,175,120,0.35)]'
              }
              ${className}
            `.trim()}
            {...props}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 dark:text-[#A2B09D]">
              {rightIcon}
            </div>
          )}
        </div>

        {hasError ? (
          <p id={errorId} className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1" role="alert">
            <span aria-hidden="true">&bull;</span> {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-slate-600 dark:text-[#A2B09D] mt-1">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
