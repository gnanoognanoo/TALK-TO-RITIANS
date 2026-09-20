import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryText?: string;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title,
  message,
  onRetry,
  retryText = 'Try Again',
  onDismiss,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`
        p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200
        flex items-start gap-3 text-sm shadow-lg shadow-rose-950/20 ${className}
      `.trim()}
    >
      <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        {title && <h4 className="font-semibold text-rose-200 text-sm">{title}</h4>}
        <p className={`text-xs text-rose-300/90 leading-relaxed ${title ? 'mt-1' : ''}`}>
          {message}
        </p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 inline-flex items-center text-xs font-semibold text-rose-300 hover:text-white underline underline-offset-4 decoration-rose-500/50 hover:decoration-white transition-colors"
          >
            {retryText} &rarr;
          </button>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="text-rose-400 hover:text-rose-200 p-1 rounded-md hover:bg-rose-900/30 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
