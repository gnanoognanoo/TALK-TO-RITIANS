import React from 'react';
import { MessageSquareOff } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center p-8 sm:p-12
        rounded-[26px] border border-dashed border-gray-200 dark:border-[rgba(140,170,110,0.22)] bg-white/80 dark:bg-[#091009]/80 shadow-sm ${className}
      `.trim()}
    >
      <div className="h-14 w-14 rounded-2xl bg-brand-50 dark:bg-[#101D11] border border-brand-100 dark:border-[rgba(140,170,110,0.25)] text-brand-600 dark:text-[#8DA852] flex items-center justify-center mb-4 shadow-sm">
        {icon || <MessageSquareOff className="h-7 w-7" aria-hidden="true" />}
      </div>

      <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-[#F4F6F1] tracking-tight">{title}</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-[#9DA89A] max-w-sm mt-1.5 leading-relaxed">
        {description}
      </p>

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};

export default EmptyState;
