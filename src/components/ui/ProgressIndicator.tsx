/**
 * Progress Indicator Component
 * Atlassian Design System inspired progress indicator for loading states
 */

import React from 'react';

export interface ProgressIndicatorProps {
  value?: number; // 0-100
  size?: 'small' | 'medium' | 'large';
  variant?: 'linear' | 'circular';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  showValue?: boolean;
  className?: string;
  indeterminate?: boolean;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  value = 0,
  size = 'medium',
  variant = 'linear',
  color = 'primary',
  showValue = false,
  className = '',
  indeterminate = false,
}) => {
  const colorClasses = {
    primary: 'bg-[var(--color-primary)]',
    secondary: 'bg-[var(--color-secondary)]',
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    error: 'bg-[var(--color-error)]',
  };

  if (variant === 'circular') {
    const sizeClasses = {
      small: 'w-4 h-4',
      medium: 'w-8 h-8',
      large: 'w-12 h-12',
    };

    const strokeWidth = {
      small: 2,
      medium: 3,
      large: 4,
    };

    const radius = {
      small: 6,
      medium: 13,
      large: 20,
    };

    const circumference = 2 * Math.PI * radius[size];
    const strokeDasharray = circumference;
    const strokeDashoffset = indeterminate ? circumference * 0.75 : circumference - (value / 100) * circumference;

    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <svg
          className={`${sizeClasses[size]} transform -rotate-90`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r={radius[size]}
            stroke="currentColor"
            strokeWidth={strokeWidth[size]}
            className="text-[var(--color-border)]"
          />
          <circle
            cx="12"
            cy="12"
            r={radius[size]}
            stroke="currentColor"
            strokeWidth={strokeWidth[size]}
            className={`${colorClasses[color]} transition-all duration-300`}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              animation: indeterminate ? 'spin 1s linear infinite' : undefined,
            }}
          />
        </svg>
        {showValue && !indeterminate && (
          <span className="ml-2 text-sm text-[var(--color-text)]">
            {Math.round(value)}%
          </span>
        )}
      </div>
    );
  }

  // Linear progress
  const heightClasses = {
    small: 'h-1',
    medium: 'h-2',
    large: 'h-3',
  };

  const progressValue = indeterminate ? 30 : Math.min(100, Math.max(0, value));

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full bg-[var(--color-surface-hover)] rounded-full overflow-hidden ${heightClasses[size]}`}>
        <div
          className={`${colorClasses[color]} h-full rounded-full transition-all duration-300 ${
            indeterminate ? 'animate-pulse' : ''
          }`}
          style={{
            width: `${progressValue}%`,
            animation: indeterminate ? 'progress-indeterminate 1.5s ease-in-out infinite' : undefined,
          }}
        />
      </div>
      {showValue && !indeterminate && (
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-[var(--color-text-secondary)]">
            {Math.round(value)}%
          </span>
        </div>
      )}
      <style jsx>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export { ProgressIndicator };
