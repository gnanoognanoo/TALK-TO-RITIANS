import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'brand' | 'white' | 'slate';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-3',
};

const variantClasses = {
  brand: 'border-brand-200 border-t-brand-600',
  white: 'border-white/20 border-t-white',
  slate: 'border-gray-200 border-t-gray-600',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'brand',
  className = '',
  label = 'Loading...',
}) => {
  return (
    <div
      role="status"
      className={`inline-flex items-center justify-center ${className}`}
      aria-label={label}
    >
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} ${variantClasses[variant]}`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default Spinner;
