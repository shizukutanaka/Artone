/**
 * Radio Component
 * Atlassian Design System inspired radio button with accessibility
 */

import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

const Radio = forwardRef<HTMLInputElement, RadioProps>(({
  label,
  description,
  className = '',
  id,
  disabled,
  name,
  value,
  checked,
  ...props
}, ref) => {
  const radioId = id || `radio-${Math.random().toString(36).substr(2, 9)}`;
  const descriptionId = description ? `${radioId}-description` : undefined;

  const radioClasses = [
    'w-4 h-4 text-[var(--color-primary)] bg-[var(--color-background)] border-[var(--color-border)]',
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
          id={radioId}
          type="radio"
          name={name}
          value={value}
          className={radioClasses}
          disabled={disabled}
          checked={checked}
          aria-describedby={descriptionId}
          {...props}
        />
      </div>
      {label && (
        <div className="ml-3">
          <label
            htmlFor={radioId}
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
        </div>
      )}
    </div>
  );
});

Radio.displayName = 'Radio';

export { Radio };
