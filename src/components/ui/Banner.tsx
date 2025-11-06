/**
 * Banner Component
 * Atlassian Design System inspired banner for important announcements
 */

import React from 'react';
import { Button } from './Button';

export interface BannerProps {
  children: React.ReactNode;
  appearance?: 'info' | 'success' | 'warning' | 'error' | 'announcement';
  icon?: React.ReactNode;
  title?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  onDismiss?: () => void;
  className?: string;
}

const Banner: React.FC<BannerProps> = ({
  children,
  appearance = 'info',
  icon,
  title,
  actions = [],
  onDismiss,
  className = '',
}) => {
  const appearanceStyles = {
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: 'text-blue-600',
      title: 'text-blue-900',
      button: 'text-blue-800 hover:bg-blue-100',
    },
    success: {
      container: 'bg-green-50 border-green-200 text-green-800',
      icon: 'text-green-600',
      title: 'text-green-900',
      button: 'text-green-800 hover:bg-green-100',
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      icon: 'text-yellow-600',
      title: 'text-yellow-900',
      button: 'text-yellow-800 hover:bg-yellow-100',
    },
    error: {
      container: 'bg-red-50 border-red-200 text-red-800',
      icon: 'text-red-600',
      title: 'text-red-900',
      button: 'text-red-800 hover:bg-red-100',
    },
    announcement: {
      container: 'bg-purple-50 border-purple-200 text-purple-800',
      icon: 'text-purple-600',
      title: 'text-purple-900',
      button: 'text-purple-800 hover:bg-purple-100',
    },
  };

  const defaultIcons = {
    info: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
    success: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    announcement: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    ),
  };

  const styles = appearanceStyles[appearance];
  const bannerIcon = icon || defaultIcons[appearance];

  const containerClasses = [
    'border-l-4 p-4',
    styles.container,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} role="banner">
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${styles.icon}`}>
          {bannerIcon}
        </div>

        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${styles.title}`}>
              {title}
            </h3>
          )}

          <div className={`text-sm ${title ? 'mt-2' : ''}`}>
            {children}
          </div>

          {actions.length > 0 && (
            <div className="mt-3 flex space-x-3">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || 'primary'}
                  size="small"
                  onClick={action.onClick}
                  className={styles.button}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {onDismiss && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.button}`}
                onClick={onDismiss}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export { Banner };
