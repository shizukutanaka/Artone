/**
 * Box Component
 * Basic layout primitive for spacing and background
 */

import React, { HTMLAttributes, forwardRef } from 'react';

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  display?: 'block' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'inline-grid';
  padding?: string;
  paddingX?: string;
  paddingY?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  margin?: string;
  marginX?: string;
  marginY?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  backgroundColor?: string;
  borderRadius?: string;
  border?: string;
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
}

const Box = forwardRef<HTMLDivElement, BoxProps>(({
  display = 'block',
  padding,
  paddingX,
  paddingY,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  margin,
  marginX,
  marginY,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  backgroundColor,
  borderRadius,
  border,
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  style,
  ...props
}, ref) => {
  const boxStyle: React.CSSProperties = {
    display,
    padding,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    margin,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    backgroundColor,
    borderRadius,
    border,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    ...style,
  };

  // Handle paddingX/paddingY
  if (paddingX) {
    boxStyle.paddingLeft = paddingX;
    boxStyle.paddingRight = paddingX;
  }
  if (paddingY) {
    boxStyle.paddingTop = paddingY;
    boxStyle.paddingBottom = paddingY;
  }

  // Handle marginX/marginY
  if (marginX) {
    boxStyle.marginLeft = marginX;
    boxStyle.marginRight = marginX;
  }
  if (marginY) {
    boxStyle.marginTop = marginY;
    boxStyle.marginBottom = marginY;
  }

  return (
    <div
      ref={ref}
      style={boxStyle}
      {...props}
    />
  );
});

Box.displayName = 'Box';

export { Box };
