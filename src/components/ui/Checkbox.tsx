/**
 * Checkbox Component
 * Atlassian Design System inspired checkbox with accessibility
 */

import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  error?: string;
  indeterminate?: boolean;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  label,
  description,
  error,
  indeterminate = false,
  className = '',
  id,
  disabled,
  checked,
  ...props
}, ref) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const descriptionId = description ? `${checkboxId}-description` : undefined;
  const errorId = error ? `${checkboxId}-error` : undefined;

  const checkboxClasses = [
    'w-4 h-4 text-[var(--color-primary)] bg-[var(--color-background)] border-[var(--color-border)] rounded',
    'focus:ring-[var(--color-primary)] focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    className,
  ].filter(Boolean).join(' ');

  const labelClasses = [
    'ml-3 text-sm',
    disabled ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text)]',
  ].filter(Boolean).join(' ');

  return (
    <div className="flex items-start">
      <div className="flex items-center h-5">
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          className={checkboxClasses}
          disabled={disabled}
          checked={checked}
          aria-describedby={descriptionId || errorId ? [descriptionId, errorId].filter(Boolean).join(' ') : undefined}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        />
      </div>
      {label && (
        <div className="ml-3">
          <label
            htmlFor={checkboxId}
            className={labelClasses}
          >
            {label}
          </label>
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
      )}
    </div>
  );
});

Checkbox.displayName = 'Checkbox';

export { Checkbox };
