/**
 * Grid Component
 * Atlassian Design System inspired responsive grid layout
 */

import React, { HTMLAttributes, forwardRef } from 'react';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: number | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
  spacing?: 'none' | 'xxsmall' | 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
  alignItems?: 'stretch' | 'center' | 'start' | 'end';
  justifyItems?: 'stretch' | 'center' | 'start' | 'end';
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

const Grid = forwardRef<HTMLDivElement, GridProps>(({
  columns = 12,
  spacing = 'medium',
  alignItems = 'stretch',
  justifyItems = 'stretch',
  style,
  className = '',
  ...props
}, ref) => {
  const getGridTemplateColumns = (cols: GridProps['columns']): string => {
    if (typeof cols === 'number') {
      return `repeat(${cols}, minmax(0, 1fr))`;
    }

    // Responsive columns
    const responsiveClasses: string[] = [];
    if (cols.xs) responsiveClasses.push(`grid-cols-${cols.xs}`);
    if (cols.sm) responsiveClasses.push(`sm:grid-cols-${cols.sm}`);
    if (cols.md) responsiveClasses.push(`md:grid-cols-${cols.md}`);
    if (cols.lg) responsiveClasses.push(`lg:grid-cols-${cols.lg}`);
    if (cols.xl) responsiveClasses.push(`xl:grid-cols-${cols.xl}`);

    return responsiveClasses.length > 0 ? '' : `repeat(12, minmax(0, 1fr))`;
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: typeof columns === 'number' ? getGridTemplateColumns(columns) : undefined,
    gap: spacingMap[spacing],
    alignItems,
    justifyItems,
    ...style,
  };

  const responsiveClasses = typeof columns === 'object' ? [
    'grid',
    columns.xs ? `grid-cols-${columns.xs}` : '',
    columns.sm ? `sm:grid-cols-${columns.sm}` : '',
    columns.md ? `md:grid-cols-${columns.md}` : '',
    columns.lg ? `lg:grid-cols-${columns.lg}` : '',
    columns.xl ? `xl:grid-cols-${columns.xl}` : '',
  ].filter(Boolean).join(' ') : 'grid';

  const classes = [
    responsiveClasses,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      style={gridStyle}
      {...props}
    />
  );
});

Grid.displayName = 'Grid';

export { Grid };
