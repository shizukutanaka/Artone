/**
 * Breadcrumbs Component
 * Atlassian Design System inspired breadcrumbs for navigation
 */

import React from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  isCurrentPage?: boolean;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  maxItems?: number;
  separator?: React.ReactNode;
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  maxItems = 5,
  separator,
  className = '',
}) => {
  const defaultSeparator = (
    <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  const displayItems = items.length <= maxItems ? items : [
    items[0],
    { label: '...', href: undefined },
    ...items.slice(-maxItems + 2)
  ];

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center space-x-2 ${className}`}>
      <ol className="flex items-center space-x-2">
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isEllipsis = item.label === '...';

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <span className="mx-2 text-[var(--color-text-secondary)]">
                  {separator || defaultSeparator}
                </span>
              )}

              {isEllipsis ? (
                <span className="text-[var(--color-text-secondary)] select-none">
                  {item.label}
                </span>
              ) : item.isCurrentPage || !item.href || !item.onClick ? (
                <span
                  className={`text-sm ${
                    isLast
                      ? 'text-[var(--color-text)] font-medium'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] cursor-pointer'
                  }`}
                  aria-current={isLast ? 'page' : undefined}
                  onClick={item.onClick}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  onClick={item.onClick}
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export { Breadcrumbs };
