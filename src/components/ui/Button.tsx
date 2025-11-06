/**
 * Button Component
 * Atlassian Design System inspired button with variants and accessibility
 */

import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'subtle' | 'link' | 'warning' | 'danger';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  as?: React.ElementType;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'default',
  size = 'medium',
  isLoading = false,
  icon,
  iconPosition = 'start',
  fullWidth = false,
  disabled,
  children,
  className = '',
  as: Component = 'button',
  ...props
}, ref) => {
  const baseClasses = [
    'inline-flex items-center justify-center gap-2',
    'font-medium rounded-md transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    fullWidth ? 'w-full' : '',
  ];

  const variantClasses: Record<string, string[]> = {
    primary: [
      'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
      'focus:ring-blue-500',
      'shadow-sm',
    ],
    default: [
      'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300',
      'border border-gray-300',
      'focus:ring-blue-500',
    ],
    subtle: [
      'bg-transparent text-gray-800 hover:bg-gray-100 active:bg-gray-200',
      'focus:ring-blue-500',
    ],
    warning: [
      'bg-yellow-500 text-gray-900 hover:bg-yellow-600 active:bg-yellow-700',
      'focus:ring-yellow-400',
      'shadow-sm',
    ],
    danger: [
      'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
      'focus:ring-red-500',
      'shadow-sm',
    ],
    link: [
      'bg-transparent text-blue-600 hover:underline',
      'focus:ring-blue-500',
      'p-0',
    ],
  };

  const sizeClasses: Record<string, string> = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg',
  };

  const classes = [
    ...baseClasses,
    ...(variantClasses[variant] || []),
    sizeClasses[size] || '',
    className,
  ].filter(Boolean).join(' ');

  const isDisabled = disabled || isLoading;

  return (
    <Component
      ref={ref}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      {...props}
    >
      {isLoading && <Spinner size={size === 'large' ? 'medium' : 'small'} />}
      {!isLoading && icon && iconPosition === 'start' && icon}
      {children}
      {!isLoading && icon && iconPosition === 'end' && icon}
    </Component>
  );
});

Button.displayName = 'Button';

export { Button };
