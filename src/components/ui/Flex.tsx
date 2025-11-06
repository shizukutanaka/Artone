/**
 * Flex Component
 * Flexible layout primitive for complex layouts
 */

import React, { HTMLAttributes, forwardRef } from 'react';

export interface FlexProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'stretch' | 'center' | 'start' | 'end' | 'baseline';
  alignContent?: 'stretch' | 'center' | 'start' | 'end' | 'space-between' | 'space-around';
  gap?: string;
  flex?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
}

const Flex = forwardRef<HTMLDivElement, FlexProps>(({
  direction = 'row',
  wrap = 'nowrap',
  justifyContent = 'start',
  alignItems = 'stretch',
  alignContent = 'stretch',
  gap = '0',
  flex,
  flexGrow,
  flexShrink,
  flexBasis,
  style,
  ...props
}, ref) => {
  const flexStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    flexWrap: wrap,
    justifyContent,
    alignItems,
    alignContent,
    gap,
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    ...style,
  };

  return (
    <div
      ref={ref}
      style={flexStyle}
      {...props}
    />
  );
});

Flex.displayName = 'Flex';

export { Flex };
