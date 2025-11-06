/**
 * Avatar Component
 * Atlassian Design System inspired avatar for user representation
 */

import React from 'react';

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
  variant?: 'circle' | 'square';
  className?: string;
  onClick?: () => void;
}

const Avatar: React.FC<AvatarProps> = ({
  src,
  name = '',
  size = 'medium',
  variant = 'circle',
  className = '',
  onClick,
}) => {
  const sizeClasses = {
    xsmall: 'w-6 h-6 text-xs',
    small: 'w-8 h-8 text-sm',
    medium: 'w-10 h-10 text-base',
    large: 'w-12 h-12 text-lg',
    xlarge: 'w-16 h-16 text-xl',
    xxlarge: 'w-20 h-20 text-2xl',
  };

  const variantClasses = {
    circle: 'rounded-full',
    square: 'rounded-md',
  };

  const baseClasses = [
    'inline-flex items-center justify-center',
    'bg-[var(--color-primary)] text-white font-medium',
    'border-2 border-[var(--color-surface)]',
    sizeClasses[size],
    variantClasses[variant],
    onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : '',
    className,
  ].filter(Boolean).join(' ');

  // Generate initials from name
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  const initials = getInitials(name);

  return (
    <div
      className={baseClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {src ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="select-none">{initials || '?'}</span>
      )}
    </div>
  );
};

export { Avatar };
