import {
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import Icon from './Icon';

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Overlay background class. Defaults to bg-warm-charcoal/70 */
  overlayClass?: string;
  /** Content max-width class. Defaults to max-w-lg */
  maxWidthClass?: string;
  /** If true, close button is hidden */
  hideClose?: boolean;
  /** Additional footer content below children */
  footer?: ReactNode;
}

/**
 * Reusable modal wrapper with focus trapping, Escape key handling,
 * backdrop click dismissal, and proper ARIA attributes.
 */
const ModalBase: React.FC<ModalBaseProps> = ({
  isOpen,
  onClose,
  title,
  children,
  overlayClass = 'bg-warm-charcoal/70',
  maxWidthClass = 'max-w-lg',
  hideClose = false,
  footer,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  // Focus trap: focus the modal content on open
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const focusable = contentRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, [isOpen]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  // Prevent clicks inside the modal from closing it
  const handleContentClick = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();
    },
    [],
  );

  if (!isOpen) return null;

  return (
    <div
      className={`z-50 fixed inset-0 flex justify-center items-center ${overlayClass} animate-fade-in`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={contentRef}
        className={`bg-gunmetal-400 shadow-xl mx-4 p-6 rounded-lg w-[90%] ${maxWidthClass} animate-scale-in overflow-y-auto max-h-[90vh]`}
        onClick={handleContentClick}
        onKeyDown={(e: KeyboardEvent<HTMLElement>) => e.stopPropagation()}
        role="document"
        tabIndex={-1}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id={titleId} className="font-semibold text-seasalt text-xl">
            {title}
          </h2>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="flex justify-center items-center bg-gunmetal-500 hover:bg-gunmetal-600 rounded-full size-8 text-seasalt-400 hover:text-seasalt transition-colors cursor-pointer"
              title={`Close ${title}`}
            >
              <Icon content="✕" className="text-lg" />
            </button>
          )}
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
};

export default ModalBase;
