/**
 * Stack Component
 * Vertical layout primitive with consistent spacing
 */

import React, { HTMLAttributes, forwardRef } from 'react';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  spacing?: 'none' | 'xxsmall' | 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
  alignItems?: 'stretch' | 'center' | 'start' | 'end';
  justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  direction?: 'column' | 'row';
}

const spacingMap = {
  none: '0',
  xxsmall: '4px',
  xsmall: '8px',
  small: '12px',
  medium: '16px',
  large: '24px',
  xlarge: '32px',
  xxlarge: '48px',
};

const Stack = forwardRef<HTMLDivElement, StackProps>(({
  spacing = 'medium',
  alignItems = 'stretch',
  justifyContent = 'start',
  direction = 'column',
  style,
  ...props
}, ref) => {
  const stackStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    alignItems,
    justifyContent,
    gap: spacingMap[spacing],
    ...style,
  };

  return (
    <div
      ref={ref}
      style={stackStyle}
      {...props}
    />
  );
});

Stack.displayName = 'Stack';

export { Stack };
