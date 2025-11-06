/**
 * Input Component
 * Atlassian Design System inspired input with validation and accessibility
 */

import React, { InputHTMLAttributes, forwardRef, useState, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean;
  label?: string;
  description?: string;
  errorMessage?: string;
  required?: boolean;
  fullWidth?: boolean;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  size?: 'small' | 'medium' | 'large';
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ 
  isInvalid,
  label,
  description,
  errorMessage,
  required = false,
  fullWidth = false,
  startAdornment,
  endAdornment,
  size = 'medium',
  className = '',
  id,
  disabled,
  ...props
}, ref) => {
  const [inputId] = useState(id || `input-${Math.random().toString(36).substr(2, 9)}`);
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;

  const baseClasses = [
    'w-full border rounded-md transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'placeholder:text-[var(--color-text-secondary)]',
    fullWidth ? 'w-full' : '',
  ];

  const sizeClasses = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-4 py-3 text-lg',
  };

  const stateClasses = isInvalid
    ? 'border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:ring-blue-500';

  const inputClasses = [
    ...baseClasses,
    sizeClasses[size],
    stateClasses,
    startAdornment ? 'pl-10' : '',
    endAdornment ? 'pr-10' : '',
    disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white',
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
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--color-text)] mb-1"
        >
          {label}
          {required && <span className="text-[var(--color-error)] ml-1" aria-label="required">*</span>}
        </label>
      )}

      <div className="relative">
        {startAdornment && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {startAdornment}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          disabled={disabled}
          required={required}
          aria-describedby={descriptionId || errorId ? [descriptionId, errorId].filter(Boolean).join(' ') : undefined}
          aria-invalid={isInvalid ? 'true' : 'false'}
          {...props}
        />

        {endAdornment && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            {endAdornment}
          </div>
        )}
      </div>

      {description && (
        <p
          id={descriptionId}
          className="mt-1 text-sm text-[var(--color-text-secondary)]"
        >
          {description}
        </p>
      )}

      {errorMessage && isInvalid && (
        <p
          id={errorId}
          className="mt-1 text-sm text-red-600"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export { Input };
