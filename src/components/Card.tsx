import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'outline' | 'glass';
  children: React.ReactNode;
}

const variantStyles = {
  default: 'bg-white dark:bg-[#0D150F]/90 border border-gray-200/80 dark:border-[rgba(120,160,100,0.16)] shadow-card dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
  interactive:
    'bg-white dark:bg-[#0D150F]/90 border border-gray-200/80 dark:border-[rgba(120,160,100,0.16)] hover:border-brand-300 dark:hover:border-[rgba(140,175,110,0.35)] hover:shadow-md transition-all duration-200',
  outline: 'bg-transparent border border-gray-200 dark:border-[rgba(120,160,100,0.2)]',
  glass: 'bg-white/95 dark:bg-[#0D150F]/85 backdrop-blur-md border border-gray-200/80 dark:border-[rgba(120,160,100,0.18)] shadow-card',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${variantStyles[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-6 pb-3 flex flex-col space-y-1.5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3
      className={`text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-[#F2F5F2] ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p className={`text-xs sm:text-sm text-gray-500 dark:text-[#AEB9AE] leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-6 pt-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-6 pt-0 border-t border-gray-100 dark:border-[rgba(120,160,100,0.14)] mt-3 flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
