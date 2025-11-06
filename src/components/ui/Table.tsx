/**
 * Table Component
 * Atlassian Design System inspired table for data display
 */

import React, { TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  variant?: 'default' | 'compact';
}

export interface TableHeaderProps extends ThHTMLAttributes<HTMLTableHeaderCellElement> {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableDataCellElement> {
  align?: 'left' | 'center' | 'right';
}

const Table: React.FC<TableProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const baseClasses = [
    'w-full border-collapse',
    variant === 'compact' ? 'text-sm' : 'text-base',
  ].filter(Boolean).join(' ');

  const classes = [baseClasses, className].filter(Boolean).join(' ');

  return (
    <div className="overflow-x-auto">
      <table className={classes} {...props}>
        {children}
      </table>
    </div>
  );
};

const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className = '',
  children,
  ...props
}) => {
  const classes = [
    'bg-[var(--color-surface-hover)] border-b border-[var(--color-border)]',
    className,
  ].filter(Boolean).join(' ');

  return (
    <thead className={classes} {...props}>
      {children}
    </thead>
  );
};

const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className = '',
  children,
  ...props
}) => {
  const classes = [className].filter(Boolean).join(' ');

  return (
    <tbody className={classes} {...props}>
      {children}
    </tbody>
  );
};

const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className = '',
  children,
  ...props
}) => {
  const classes = [
    'border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors',
    'focus-within:bg-[var(--color-surface-hover)]',
    className,
  ].filter(Boolean).join(' ');

  return (
    <tr className={classes} {...props}>
      {children}
    </tr>
  );
};

const TableHead: React.FC<TableHeaderProps> = ({
  sortable = false,
  sortDirection,
  onSort,
  className = '',
  children,
  ...props
}) => {
  const baseClasses = [
    'px-4 py-3 text-left font-medium text-[var(--color-text)]',
    'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-inset',
  ];

  const sortableClasses = sortable ? [
    'cursor-pointer select-none',
    'hover:bg-[var(--color-surface)]',
  ] : [];

  const classes = [
    ...baseClasses,
    ...sortableClasses,
    className,
  ].filter(Boolean).join(' ');

  const handleClick = () => {
    if (sortable && onSort) {
      onSort();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (sortable && onSort && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onSort();
    }
  };

  return (
    <th
      className={classes}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={sortable ? 0 : undefined}
      role={sortable ? 'button' : undefined}
      aria-sort={sortDirection ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span>{children}</span>
        {sortable && (
          <div className="ml-2 flex flex-col">
            <svg
              className={`w-3 h-3 ${sortDirection === 'asc' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <svg
              className={`w-3 h-3 -mt-1 ${sortDirection === 'desc' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}
      </div>
    </th>
  );
};

const TableCell: React.FC<TableCellProps> = ({
  align = 'left',
  className = '',
  children,
  ...props
}) => {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  const classes = [
    'px-4 py-3 text-[var(--color-text)]',
    alignClasses[align],
    className,
  ].filter(Boolean).join(' ');

  return (
    <td className={classes} {...props}>
      {children}
    </td>
  );
};

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
