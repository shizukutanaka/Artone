/**
 * TextArea Component
 * Atlassian Design System inspired textarea with validation and accessibility
 */

import React, { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({
  label,
  description,
  error,
  required = false,
  fullWidth = false,
  size = 'medium',
  resize = 'vertical',
  className = '',
  id,
  disabled,
  ...props
}, ref) => {
  const textAreaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  const descriptionId = description ? `${textAreaId}-description` : undefined;
  const errorId = error ? `${textAreaId}-error` : undefined;

  const baseClasses = [
    'w-full border rounded-md transition-all duration-200 resize-none',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'placeholder:text-[var(--color-text-secondary)]',
    fullWidth ? 'w-full' : '',
  ];

  const sizeClasses = {
    small: 'px-3 py-1.5 text-sm min-h-[80px]',
    medium: 'px-4 py-2 text-base min-h-[100px]',
    large: 'px-4 py-3 text-lg min-h-[120px]',
  };

  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize',
  };

  const stateClasses = error
    ? 'border-[var(--color-error)] focus:ring-[var(--color-error)]'
    : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]';

  const textAreaClasses = [
    ...baseClasses,
    sizeClasses[size],
    resizeClasses[resize],
    stateClasses,
    disabled ? 'opacity-50 cursor-not-allowed bg-[var(--color-surface-hover)]' : 'bg-[var(--color-background)]',
    className,
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'relative',
    fullWidth ? 'w-full' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {label && (
        <label
          htmlFor={textAreaId}
          className="block text-sm font-medium text-[var(--color-text)] mb-1"
        >
          {label}
          {required && <span className="text-[var(--color-error)] ml-1" aria-label="required">*</span>}
        </label>
      )}

      <textarea
        ref={ref}
        id={textAreaId}
        className={textAreaClasses}
        disabled={disabled}
        required={required}
        aria-describedby={descriptionId || errorId ? [descriptionId, errorId].filter(Boolean).join(' ') : undefined}
        aria-invalid={error ? 'true' : 'false'}
        {...props}
      />

      {description && (
        <p
          id={descriptionId}
          className="mt-1 text-sm text-[var(--color-text-secondary)]"
        >
          {description}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="mt-1 text-sm text-[var(--color-error)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
});

TextArea.displayName = 'TextArea';

export { TextArea };
