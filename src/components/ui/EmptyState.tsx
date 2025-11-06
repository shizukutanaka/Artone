/**
 * Empty State Component
 * Atlassian Design System inspired empty state for when there's no content
 */

import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'link';
    disabled?: boolean;
  }>;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actions = [],
  size = 'medium',
  className = '',
}) => {
  const sizeClasses = {
    small: {
      container: 'py-8',
      icon: 'w-12 h-12',
      title: 'text-lg',
      description: 'text-sm',
      spacing: 'space-y-4',
    },
    medium: {
      container: 'py-12',
      icon: 'w-16 h-16',
      title: 'text-xl',
      description: 'text-base',
      spacing: 'space-y-6',
    },
    large: {
      container: 'py-16',
      icon: 'w-20 h-20',
      title: 'text-2xl',
      description: 'text-lg',
      spacing: 'space-y-8',
    },
  };

  const defaultIcon = (
    <svg
      className={`${sizeClasses[size].icon} text-[var(--color-text-secondary)]`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );

  return (
    <div className={`flex flex-col items-center justify-center text-center ${sizeClasses[size].container} ${className}`}>
      <div className={sizeClasses[size].spacing}>
        <div className="flex justify-center">
          {icon || defaultIcon}
        </div>

        <div className="space-y-2">
          <h3 className={`font-semibold text-[var(--color-text)] ${sizeClasses[size].title}`}>
            {title}
          </h3>
          {description && (
            <p className={`text-[var(--color-text-secondary)] max-w-md ${sizeClasses[size].description}`}>
              {description}
            </p>
          )}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || (index === 0 ? 'primary' : 'secondary')}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export { EmptyState };
