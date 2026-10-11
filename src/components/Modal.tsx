import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

  // Escape key close handler and body scroll locking
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-200 z-0"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal Dialog Content (Mobile Bottom-Sheet with 100dvh bounding, Desktop Centered) */}
      <div
        ref={modalRef}
        className={`
          relative z-10 w-full ${maxWidthClasses[maxWidth]} bg-white dark:bg-[#0D160E] dark:backdrop-blur-xl border-t sm:border border-gray-200/90 dark:border-[rgba(141,168,82,0.18)]
          rounded-t-[28px] sm:rounded-[28px] shadow-2xl dark:shadow-[0_24px_50px_-10px_rgba(0,0,0,0.85)] flex flex-col max-h-[92dvh] sm:max-h-[88vh]
          overflow-hidden transform transition-all duration-200
          animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95
        `.trim()}
      >
        {/* Mobile bottom sheet grab handle */}
        <div className="flex sm:hidden justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-700/80" />
        </div>

        {/* Sticky Header */}
        {(title || showCloseButton) && (
          <div className="shrink-0 flex items-start justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[rgba(141,168,82,0.12)] bg-white dark:bg-[#0D160E]">
            <div className="pr-2">
              {title && (
                <h2 id={titleId} className="text-base sm:text-lg font-bold text-gray-900 dark:text-[#F4F6F1] tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="text-xs text-gray-500 dark:text-[#9DA89A] mt-0.5">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 dark:text-[#6F796D] hover:text-gray-700 dark:hover:text-[#F4F6F1] hover:bg-gray-100 dark:hover:bg-[#101A12] rounded-xl transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* Independently Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 text-sm text-gray-600 dark:text-[#9DA89A]">
          {children}
        </div>

        {/* Fixed Footer (if provided) with Mobile Safe Area Padding */}
        {footer && (
          <div className="shrink-0 p-4 border-t border-gray-100 dark:border-[rgba(141,168,82,0.12)] bg-gray-50/70 dark:bg-[#070D08]/90 flex items-center justify-end gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Portal directly to document.body to escape any parent layout stacking contexts (AppLayout, Navbar, etc.)
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default Modal;
