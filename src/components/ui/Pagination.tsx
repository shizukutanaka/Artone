/**
 * Pagination Component
 * Atlassian Design System inspired pagination for large data sets
 */

import React from 'react';
import { Button } from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  showPageNumbers?: boolean;
  maxVisiblePages?: number;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  showFirstLast = true,
  showPageNumbers = true,
  maxVisiblePages = 5,
  size = 'medium',
  className = '',
}) => {
  const getVisiblePages = () => {
    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const visiblePages = getVisiblePages();

  const sizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  };

  const buttonSize = size === 'large' ? 'medium' : 'small';

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className={`flex items-center justify-between ${sizeClasses[size]} ${className}`}
      aria-label="Pagination"
    >
      <div className="flex items-center space-x-1">
        {/* First button */}
        {showFirstLast && (
          <Button
            variant="secondary"
            size={buttonSize}
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            aria-label="Go to first page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </Button>
        )}

        {/* Previous button */}
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Go to previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>

        {/* Page numbers */}
        {showPageNumbers && (
          <>
            {visiblePages[0] > 1 && (
              <>
                <Button
                  variant={1 === currentPage ? 'primary' : 'secondary'}
                  size={buttonSize}
                  onClick={() => onPageChange(1)}
                >
                  1
                </Button>
                {visiblePages[0] > 2 && (
                  <span className="px-2 text-[var(--color-text-secondary)]">...</span>
                )}
              </>
            )}

            {visiblePages.map((page) => (
              <Button
                key={page}
                variant={page === currentPage ? 'primary' : 'secondary'}
                size={buttonSize}
                onClick={() => onPageChange(page)}
                aria-label={`Go to page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </Button>
            ))}

            {visiblePages[visiblePages.length - 1] < totalPages && (
              <>
                {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                  <span className="px-2 text-[var(--color-text-secondary)]">...</span>
                )}
                <Button
                  variant={totalPages === currentPage ? 'primary' : 'secondary'}
                  size={buttonSize}
                  onClick={() => onPageChange(totalPages)}
                >
                  {totalPages}
                </Button>
              </>
            )}
          </>
        )}

        {/* Next button */}
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Go to next page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>

        {/* Last button */}
        {showFirstLast && (
          <Button
            variant="secondary"
            size={buttonSize}
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            aria-label="Go to last page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </Button>
        )}
      </div>

      {/* Page info */}
      <div className="text-sm text-[var(--color-text-secondary)]">
        Page {currentPage} of {totalPages}
      </div>
    </nav>
  );
};

export { Pagination };
