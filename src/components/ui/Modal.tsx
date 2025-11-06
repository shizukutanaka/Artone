/**
 * Modal Component
 * Atlassian Design System inspired modal dialog
 */

import React, { ReactNode, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

interface ModalContextType {
  onClose: () => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  className?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'medium',
  className = '',
}) => {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-lg',
    large: 'max-w-2xl',
    xlarge: 'max-w-4xl',
  };

  const modalClasses = [
    'w-full mx-4 bg-[var(--color-surface)] rounded-lg shadow-[var(--shadow-large)] border border-[var(--color-border)]',
    sizeClasses[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className={modalClasses}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <ModalContext.Provider value={{ onClose }}>
              {children}
            </ModalContext.Provider>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Sub-components

export const ModalHeader: React.FC<{ children: ReactNode; showCloseButton?: boolean }> = ({ children, showCloseButton = true }) => {
  const { onClose } = useContext(ModalContext)!;
  return (
    <div className="flex items-start justify-between p-5 border-b border-gray-200 rounded-t">
      <h3 id="modal-title" className="text-xl font-semibold text-gray-900">
        {children}
      </h3>
      {showCloseButton && (
        <button
          type="button"
          className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
          onClick={onClose}
          aria-label="Close modal"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
        </button>
      )}
    </div>
  );
};

export const ModalBody: React.FC<{ children: ReactNode; className?: string }> = ({ children, className }) => {
  return <div className={`p-6 space-y-6 ${className}`}>{children}</div>;
};

export const ModalFooter: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div className="flex items-center justify-end p-6 space-x-2 border-t border-gray-200 rounded-b">
      {children}
    </div>
  );
};

export { Modal };
