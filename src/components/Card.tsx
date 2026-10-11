import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'outline' | 'glass';
  children: React.ReactNode;
}

const variantStyles = {
  default:
    'bg-white dark:bg-[#0D160E] border border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_16px_36px_-6px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(162,189,99,0.12),inset_0_-1px_0_0_rgba(0,0,0,0.5)]',
  interactive:
    'bg-white dark:bg-[#0D160E] border border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)] hover:border-brand-400 dark:hover:border-[rgba(162,189,99,0.4)] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_16px_36px_-6px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(162,189,99,0.14)] hover:shadow-lg dark:hover:shadow-[0_20px_42px_-6px_rgba(0,0,0,0.75)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200',
  outline: 'bg-transparent border border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)]',
  glass:
    'bg-white/95 dark:bg-[#0D160E]/90 backdrop-blur-md border border-[#DCE3EC] dark:border-[rgba(150,175,120,0.24)] shadow-[0_12px_28px_-6px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.7),inset_0_1px_1px_0_rgba(162,189,99,0.2)]',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-[24px] sm:rounded-[28px] overflow-hidden ${variantStyles[variant]} ${className}`.trim()}
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
      className={`text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-[#F4F6F1] ${className}`}
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
    <p className={`text-xs sm:text-sm text-slate-600 dark:text-[#A2B09D] leading-relaxed ${className}`} {...props}>
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
      className={`p-6 pt-0 border-t border-slate-100 dark:border-[rgba(150,175,120,0.24)] mt-3 flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
