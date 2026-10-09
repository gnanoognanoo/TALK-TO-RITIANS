import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
  showCloseButton = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = title ? 'modal-title' : undefined;
  const descriptionId = description ? 'modal-description' : undefined;

  // Escape key close handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal Dialog Content (Mobile Bottom-Sheet, Desktop Centered) */}
      <div
        ref={modalRef}
        className={`
          relative w-full ${maxWidthClasses[maxWidth]} bg-white dark:bg-[#0D160E] dark:backdrop-blur-xl border-t sm:border border-gray-200/90 dark:border-[rgba(141,168,82,0.18)]
          rounded-t-[28px] sm:rounded-[28px] shadow-2xl dark:shadow-[0_24px_50px_-10px_rgba(0,0,0,0.85)] z-10 overflow-hidden transform transition-all duration-200
          animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 pb-safe
        `.trim()}
      >
        {/* Mobile bottom sheet grab handle */}
        <div className="flex sm:hidden justify-center pt-2.5 pb-1" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-700/80" />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-5 pb-3 border-b border-gray-100 dark:border-[rgba(141,168,82,0.12)]">
            <div>
              {title && (
                <h2 id={titleId} className="text-lg font-bold text-gray-900 dark:text-[#F4F6F1] tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="text-xs text-gray-500 dark:text-[#9DA89A] mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="text-gray-400 dark:text-[#6F796D] hover:text-gray-600 dark:hover:text-[#F4F6F1] hover:bg-gray-100 dark:hover:bg-[#101A12] p-1.5 rounded-xl transition-colors ml-auto"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-5 text-sm text-gray-600 dark:text-[#9DA89A]">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-5 pt-3 border-t border-gray-100 dark:border-[rgba(141,168,82,0.12)] bg-gray-50/50 dark:bg-[#070D08]/80 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
