/**
 * Toggle Component
 * Atlassian Design System inspired toggle switch
 */

import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'small' | 'medium' | 'large';
}

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(({
  label,
  description,
  size = 'medium',
  className = '',
  id,
  disabled,
  checked,
  ...props
}, ref) => {
  const toggleId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`;
  const descriptionId = description ? `${toggleId}-description` : undefined;

  const sizeClasses = {
    small: {
      switch: 'w-8 h-4',
      knob: 'w-3 h-3',
      translate: 'translate-x-4',
    },
    medium: {
      switch: 'w-11 h-6',
      knob: 'w-5 h-5',
      translate: 'translate-x-5',
    },
    large: {
      switch: 'w-14 h-7',
      knob: 'w-6 h-6',
      translate: 'translate-x-7',
    },
  };

  const switchClasses = [
    'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent',
    'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2',
    checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    sizeClasses[size].switch,
  ].filter(Boolean).join(' ');

  const knobClasses = [
    'pointer-events-none inline-block rounded-full bg-white shadow transform ring-0',
    'transition duration-200 ease-in-out',
    checked ? sizeClasses[size].translate : 'translate-x-0.5',
    sizeClasses[size].knob,
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
          id={toggleId}
          type="checkbox"
          className="sr-only"
          disabled={disabled}
          checked={checked}
          aria-describedby={descriptionId}
          {...props}
        />
        <button
          type="button"
          className={switchClasses}
          role="switch"
          aria-checked={checked}
          aria-labelledby={label ? toggleId : undefined}
          onClick={() => {
            if (!disabled) {
              // This will be handled by the parent component
              // The actual state management should be done in the parent
            }
          }}
        >
          <span className={knobClasses} />
        </button>
      </div>
      {label && (
        <div className="ml-3">
          <label
            htmlFor={toggleId}
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

Toggle.displayName = 'Toggle';

export { Toggle };
