/**
 * Lozenge Component
 * Atlassian Design System inspired lozenge for status indicators
 */

import React from 'react';

export interface LozengeProps {
  children: React.ReactNode;
  appearance?: 'default' | 'success' | 'removed' | 'inprogress' | 'new' | 'moved';
  maxWidth?: number | string;
  className?: string;
}

const Lozenge: React.FC<LozengeProps> = ({
  children,
  appearance = 'default',
  maxWidth,
  className = '',
}) => {
  const appearanceStyles = {
    default: 'bg-[var(--color-surface-hover)] text-[var(--color-text)] border-[var(--color-border)]',
    success: 'bg-green-100 text-green-800 border-green-200',
    removed: 'bg-red-100 text-red-800 border-red-200',
    inprogress: 'bg-blue-100 text-blue-800 border-blue-200',
    new: 'bg-purple-100 text-purple-800 border-purple-200',
    moved: 'bg-orange-100 text-orange-800 border-orange-200',
  };

  const baseClasses = [
    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
    'border transition-colors whitespace-nowrap',
  ];

  const classes = [
    ...baseClasses,
    appearanceStyles[appearance],
    maxWidth ? '' : '',
    className,
  ].filter(Boolean).join(' ');

  const style = maxWidth ? { maxWidth, overflow: 'hidden', textOverflow: 'ellipsis' } : undefined;

  return (
    <span className={classes} style={style} title={typeof children === 'string' ? children : undefined}>
      {children}
    </span>
  );
};

export { Lozenge };
