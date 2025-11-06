/**
 * Link Component
 * Atlassian Design System inspired link component
 */

import React, { AnchorHTMLAttributes, forwardRef } from 'react';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'default' | 'subtle' | 'primary';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  children: React.ReactNode;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(({
  variant = 'default',
  size = 'medium',
  disabled = false,
  className = '',
  onClick,
  href,
  ...props
}, ref) => {
  const baseClasses = [
    'inline-flex items-center transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2',
    disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer',
  ];

  const variantClasses = {
    default: 'text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]',
    subtle: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]',
    primary: 'text-[var(--color-text)] hover:text-[var(--color-primary)]',
  };

  const sizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  };

  const classes = [
    ...baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].filter(Boolean).join(' ');

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <a
      ref={ref}
      className={classes}
      href={disabled ? undefined : href}
      onClick={handleClick}
      aria-disabled={disabled}
      {...props}
    />
  );
});

Link.displayName = 'Link';

export { Link };
