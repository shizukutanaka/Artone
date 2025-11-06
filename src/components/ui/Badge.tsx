/**
 * Badge Component
 * Atlassian Design System inspired badge for status indicators
 */

import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'medium',
  className = '',
}) => {
  const baseClasses = [
    'inline-flex items-center font-medium transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2',
  ];

  const variantClasses = {
    default: 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]',
    primary: 'bg-[var(--color-primary)] text-white',
    secondary: 'bg-[var(--color-secondary)] text-white',
    success: 'bg-[var(--color-success)] text-white',
    warning: 'bg-[var(--color-warning)] text-white',
    error: 'bg-[var(--color-error)] text-white',
    info: 'bg-[var(--color-info)] text-white',
  };

  const sizeClasses = {
    small: 'px-2 py-0.5 text-xs rounded',
    medium: 'px-2.5 py-0.5 text-sm rounded-md',
    large: 'px-3 py-1 text-base rounded-lg',
  };

  const classes = [
    ...baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {children}
    </span>
  );
};

export { Badge };
