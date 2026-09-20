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
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              {label}
              {required && <span className="text-rose-400 ml-1" aria-hidden="true">*</span>}
            </label>
            {required && (
              <span className="text-[10px] text-slate-500 sr-only">required</span>
            )}
          </div>
        )}

        <div className="relative rounded-xl shadow-sm">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
              w-full bg-slate-900/90 text-slate-100 placeholder-slate-500 rounded-xl
              border text-sm transition-all duration-150 min-h-[42px]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
              disabled:opacity-50 disabled:cursor-not-allowed
              ${leftIcon ? 'pl-10' : 'pl-4'}
              ${rightIcon ? 'pr-10' : 'pr-4'}
              py-2.5
              ${
                hasError
                  ? 'border-rose-500/80 focus-visible:border-rose-500 focus-visible:ring-rose-500/40 text-rose-100'
                  : 'border-slate-800 hover:border-slate-700 focus-visible:border-brand-500 focus-visible:ring-brand-500/40'
              }
              ${className}
            `.trim()}
            {...props}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>

        {hasError ? (
          <p id={errorId} className="text-xs text-rose-400 flex items-center gap-1 mt-1" role="alert">
            <span aria-hidden="true">&bull;</span> {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-slate-400 mt-1">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
