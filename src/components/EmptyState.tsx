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
        rounded-2xl border border-dashed border-gray-200 bg-white/80 shadow-sm ${className}
      `.trim()}
    >
      <div className="h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center mb-4 shadow-sm">
        {icon || <MessageSquareOff className="h-7 w-7" aria-hidden="true" />}
      </div>

      <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
      <p className="text-xs sm:text-sm text-gray-500 max-w-sm mt-1.5 leading-relaxed">
        {description}
      </p>

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};

export default EmptyState;
