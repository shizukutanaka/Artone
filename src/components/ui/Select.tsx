/**
 * Select Component
 * Atlassian Design System inspired select dropdown with accessibility
 */

import React, { SelectHTMLAttributes, forwardRef, useState, useRef, useEffect } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  isInvalid?: boolean;
  label?: string;
  description?: string;
  errorMessage?: string;
  options?: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  isInvalid,
  label,
  description,
  errorMessage,
  options = [],
  placeholder,
  fullWidth = false,
  size = 'medium',
  className = '',
  id,
  disabled,
  required,
  ...props
}, ref) => {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  const descriptionId = description ? `${selectId}-description` : undefined;
  const errorId = errorMessage ? `${selectId}-error` : undefined;

  const baseClasses = [
    'w-full border rounded-md transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'text-gray-900',
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

  const selectClasses = [
    ...baseClasses,
    sizeClasses[size],
    stateClasses,
    disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {required && <span className="text-red-600 ml-1" aria-label="required">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={selectClasses}
          disabled={disabled}
          required={required}
          aria-describedby={descriptionId || errorId ? [descriptionId, errorId].filter(Boolean).join(' ') : undefined}
          aria-invalid={isInvalid ? 'true' : 'false'}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>

        {/* Custom dropdown arrow */}
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {description && (
        <p
          id={descriptionId}
          className="mt-1 text-sm text-gray-500"
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

Select.displayName = 'Select';

export { Select };
