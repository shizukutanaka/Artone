/**
 * Loading States and Notification System
 * Comprehensive UX improvements for Artone Video Editor
 */

(function initializeUXImprovements(global) {
  'use strict';

  const React = global.React;
  const { useState, useEffect, useCallback, useMemo } = React;

  if (!React) {
    console.error('React is required for UX improvements');
    return;
  }

  // Loading Spinner Component
  function LoadingSpinner({ size = 'medium', color = 'indigo', className = '' }) {
    const sizeClasses = {
      small: 'w-4 h-4',
      medium: 'w-8 h-8',
      large: 'w-12 h-12',
      xl: 'w-16 h-16'
    };

    const colorClasses = {
      indigo: 'text-indigo-600',
      blue: 'text-blue-600',
      green: 'text-green-600',
      red: 'text-red-600',
      yellow: 'text-yellow-600',
      gray: 'text-gray-600'
    };

    return React.createElement('div', {
      className: `animate-spin rounded-full border-2 border-gray-300 border-t-transparent ${sizeClasses[size]} ${colorClasses[color]} ${className}`,
      role: 'status',
      'aria-label': 'Loading'
    });
  }

  // Skeleton Loader Components
  function SkeletonText({ lines = 1, className = '' }) {
    const lineElements = Array.from({ length: lines }, (_, i) =>
      React.createElement('div', {
        key: i,
        className: `h-4 bg-gray-200 rounded animate-pulse ${i < lines - 1 ? 'mb-2' : ''} ${i === 0 ? 'w-full' : i === lines - 1 ? 'w-3/4' : 'w-5/6'}`
      })
    );

    return React.createElement('div', { className }, ...lineElements);
  }

  function SkeletonCard({ className = '' }) {
    return React.createElement('div', {
      className: `bg-white p-4 rounded-lg shadow animate-pulse ${className}`
    }, [
      React.createElement('div', {
        key: 'header',
        className: 'h-4 bg-gray-200 rounded w-3/4 mb-3'
      }),
      React.createElement('div', {
        key: 'content',
        className: 'space-y-2'
      }, [
        React.createElement('div', { key: 1, className: 'h-3 bg-gray-200 rounded w-full' }),
        React.createElement('div', { key: 2, className: 'h-3 bg-gray-200 rounded w-5/6' }),
        React.createElement('div', { key: 3, className: 'h-3 bg-gray-200 rounded w-4/6' })
      ])
    ]);
  }

  function SkeletonVideoThumbnail({ className = '' }) {
    return React.createElement('div', {
      className: `bg-gray-200 rounded-lg animate-pulse ${className}`
    }, [
      React.createElement('div', {
        key: 'thumbnail',
        className: 'aspect-video bg-gray-300 rounded-t-lg'
      }),
      React.createElement('div', {
        key: 'info',
        className: 'p-3 space-y-2'
      }, [
        React.createElement('div', { key: 1, className: 'h-4 bg-gray-300 rounded w-3/4' }),
        React.createElement('div', { key: 2, className: 'h-3 bg-gray-300 rounded w-1/2' })
      ])
    ]);
  }

  // Progress Bar Component
  function ProgressBar({ progress, color = 'indigo', size = 'medium', showLabel = false, className = '' }) {
    const sizeClasses = {
      small: 'h-1',
      medium: 'h-2',
      large: 'h-3'
    };

    const colorClasses = {
      indigo: 'bg-indigo-600',
      blue: 'bg-blue-600',
      green: 'bg-green-600',
      red: 'bg-red-600',
      yellow: 'bg-yellow-600'
    };

    const clampedProgress = Math.max(0, Math.min(100, progress));

    return React.createElement('div', {
      className: `w-full bg-gray-200 rounded-full ${sizeClasses[size]} ${className}`,
      role: 'progressbar',
      'aria-valuenow': clampedProgress,
      'aria-valuemin': 0,
      'aria-valuemax': 100
    }, [
      React.createElement('div', {
        key: 'progress',
        className: `h-full rounded-full transition-all duration-300 ease-out ${colorClasses[color]}`,
        style: { width: `${clampedProgress}%` }
      }),
      showLabel && React.createElement('div', {
        key: 'label',
        className: 'text-xs text-gray-600 mt-1 text-center'
      }, `${Math.round(clampedProgress)}%`)
    ]);
  }

  // Loading Overlay Component
  function LoadingOverlay({ isVisible, message = 'Loading...', spinnerSize = 'large', children }) {
    if (!isVisible) return children;

    return React.createElement('div', {
      className: 'relative'
    }, [
      children,
      React.createElement('div', {
        key: 'overlay',
        className: 'absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50 rounded-lg'
      }, [
        React.createElement('div', {
          key: 'content',
          className: 'text-center'
        }, [
          React.createElement(LoadingSpinner, { key: 'spinner', size: spinnerSize }),
          message && React.createElement('p', {
            key: 'message',
            className: 'mt-2 text-sm text-gray-600'
          }, message)
        ])
      ])
    ]);
  }

  // Notification System
  const NotificationType = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    LOADING: 'loading'
  };

  const NotificationPosition = {
    TOP_RIGHT: 'top-right',
    TOP_LEFT: 'top-left',
    BOTTOM_RIGHT: 'bottom-right',
    BOTTOM_LEFT: 'bottom-left',
    TOP_CENTER: 'top-center',
    BOTTOM_CENTER: 'bottom-center'
  };

  class NotificationManager {
    constructor() {
      this.notifications = new Map();
      this.listeners = new Set();
      this.nextId = 1;
    }

    show(notification) {
      const id = this.nextId++;
      const fullNotification = {
        id,
        type: NotificationType.INFO,
        duration: 5000,
        position: NotificationPosition.TOP_RIGHT,
        persistent: false,
        ...notification
      };

      this.notifications.set(id, fullNotification);
      this.notifyListeners();

      // Auto-dismiss if not persistent
      if (!fullNotification.persistent && fullNotification.duration > 0) {
        setTimeout(() => {
          this.dismiss(id);
        }, fullNotification.duration);
      }

      return id;
    }

    dismiss(id) {
      if (this.notifications.delete(id)) {
        this.notifyListeners();
      }
    }

    clear() {
      this.notifications.clear();
      this.notifyListeners();
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    getNotifications() {
      return Array.from(this.notifications.values());
    }

    notifyListeners() {
      this.listeners.forEach(listener => listener(this.getNotifications()));
    }

    // Convenience methods
    success(message, options = {}) {
      return this.show({ ...options, type: NotificationType.SUCCESS, message });
    }

    error(message, options = {}) {
      return this.show({ ...options, type: NotificationType.ERROR, message, persistent: true });
    }

    warning(message, options = {}) {
      return this.show({ ...options, type: NotificationType.WARNING, message });
    }

    info(message, options = {}) {
      return this.show({ ...options, type: NotificationType.INFO, message });
    }

    loading(message, options = {}) {
      return this.show({ ...options, type: NotificationType.LOADING, message, persistent: true });
    }
  }

  // Global notification manager instance
  const notificationManager = new NotificationManager();

  // Notification Component
  function NotificationItem({ notification, onDismiss }) {
    const [isVisible, setIsVisible] = useState(true);
    const [isExiting, setIsExiting] = useState(false);

    const handleDismiss = useCallback(() => {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        onDismiss(notification.id);
      }, 300);
    }, [notification.id, onDismiss]);

    useEffect(() => {
      if (notification.type === NotificationType.LOADING) {
        // Auto-dismiss loading notifications after 10 seconds
        const timer = setTimeout(() => {
          handleDismiss();
        }, 10000);
        return () => clearTimeout(timer);
      }
    }, [notification.type, handleDismiss]);

    if (!isVisible) return null;

    const typeStyles = {
      [NotificationType.SUCCESS]: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-800',
        icon: '✅'
      },
      [NotificationType.ERROR]: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-800',
        icon: '❌'
      },
      [NotificationType.WARNING]: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        text: 'text-yellow-800',
        icon: '⚠️'
      },
      [NotificationType.INFO]: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-800',
        icon: 'ℹ️'
      },
      [NotificationType.LOADING]: {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-800',
        icon: '⏳'
      }
    };

    const style = typeStyles[notification.type];

    return React.createElement('div', {
      className: `max-w-sm w-full shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 transition-all duration-300 ${
        isExiting ? 'opacity-0 transform translate-y-2' : 'opacity-100 transform translate-y-0'
      } ${style.bg} ${style.border}`,
      role: 'alert'
    }, [
      React.createElement('div', {
        key: 'content',
        className: 'p-4'
      }, [
        React.createElement('div', {
          key: 'flex',
          className: 'flex items-start'
        }, [
          React.createElement('div', {
            key: 'icon',
            className: 'flex-shrink-0'
          }, notification.type === NotificationType.LOADING
            ? React.createElement(LoadingSpinner, { size: 'small', className: 'text-gray-600' })
            : React.createElement('span', { className: 'text-lg' }, style.icon)
          ),
          React.createElement('div', {
            key: 'text',
            className: 'ml-3 w-0 flex-1 pt-0.5'
          }, [
            React.createElement('p', {
              key: 'message',
              className: `text-sm font-medium ${style.text}`
            }, notification.message),
            notification.description && React.createElement('p', {
              key: 'description',
              className: `mt-1 text-sm ${style.text} opacity-75`
            }, notification.description)
          ]),
          React.createElement('div', {
            key: 'close',
            className: 'ml-4 flex-shrink-0 flex'
          }, [
            React.createElement('button', {
              key: 'button',
              className: `inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.text} hover:bg-black hover:bg-opacity-5`,
              onClick: handleDismiss
            }, [
              React.createElement('span', { key: 'sr', className: 'sr-only' }, 'Dismiss'),
              React.createElement('svg', {
                key: 'icon',
                className: 'h-5 w-5',
                fill: 'currentColor',
                viewBox: '0 0 20 20'
              }, React.createElement('path', {
                fillRule: 'evenodd',
                d: 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z',
                clipRule: 'evenodd'
              }))
            ])
          ])
        ]),
        notification.progress !== undefined && React.createElement('div', {
          key: 'progress',
          className: 'mt-3'
        }, React.createElement(ProgressBar, {
          progress: notification.progress,
          size: 'small'
        }))
      ])
    ]);
  }

  // Notification Container Component
  function NotificationContainer({ position = NotificationPosition.TOP_RIGHT }) {
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
      const unsubscribe = notificationManager.subscribe(setNotifications);
      return unsubscribe;
    }, []);

    const positionClasses = {
      [NotificationPosition.TOP_RIGHT]: 'top-0 right-0',
      [NotificationPosition.TOP_LEFT]: 'top-0 left-0',
      [NotificationPosition.BOTTOM_RIGHT]: 'bottom-0 right-0',
      [NotificationPosition.BOTTOM_LEFT]: 'bottom-0 left-0',
      [NotificationPosition.TOP_CENTER]: 'top-0 left-1/2 transform -translate-x-1/2',
      [NotificationPosition.BOTTOM_CENTER]: 'bottom-0 left-1/2 transform -translate-x-1/2'
    };

    const handleDismiss = useCallback((id) => {
      notificationManager.dismiss(id);
    }, []);

    if (notifications.length === 0) return null;

    return React.createElement('div', {
      className: `fixed z-50 w-full max-w-sm p-4 ${positionClasses[position]}`,
      'aria-live': 'assertive',
      'aria-atomic': 'true'
    }, React.createElement('div', {
      className: 'flex flex-col space-y-2'
    }, notifications
      .filter(n => n.position === position)
      .map(notification =>
        React.createElement(NotificationItem, {
          key: notification.id,
          notification,
          onDismiss: handleDismiss
        })
      )
    ));
  }

  // Toast Hook for React components
  function useToast() {
    return useMemo(() => ({
      show: (notification) => notificationManager.show(notification),
      success: (message, options) => notificationManager.success(message, options),
      error: (message, options) => notificationManager.error(message, options),
      warning: (message, options) => notificationManager.warning(message, options),
      info: (message, options) => notificationManager.info(message, options),
      loading: (message, options) => notificationManager.loading(message, options),
      dismiss: (id) => notificationManager.dismiss(id),
      clear: () => notificationManager.clear()
    }), []);
  }

  // Loading Hook for async operations
  function useLoading(initialState = false) {
    const [isLoading, setIsLoading] = useState(initialState);
    const [loadingMessage, setLoadingMessage] = useState('');

    const startLoading = useCallback((message = 'Loading...') => {
      setLoadingMessage(message);
      setIsLoading(true);
    }, []);

    const stopLoading = useCallback(() => {
      setIsLoading(false);
      setLoadingMessage('');
    }, []);

    const withLoading = useCallback(async (asyncFn, message = 'Loading...') => {
      startLoading(message);
      try {
        const result = await asyncFn();
        return result;
      } finally {
        stopLoading();
      }
    }, [startLoading, stopLoading]);

    return {
      isLoading,
      loadingMessage,
      startLoading,
      stopLoading,
      withLoading
    };
  }

  // Export components and utilities
  global.LoadingSpinner = LoadingSpinner;
  global.SkeletonText = SkeletonText;
  global.SkeletonCard = SkeletonCard;
  global.SkeletonVideoThumbnail = SkeletonVideoThumbnail;
  global.ProgressBar = ProgressBar;
  global.LoadingOverlay = LoadingOverlay;
  global.NotificationContainer = NotificationContainer;
  global.NotificationManager = notificationManager;
  global.useToast = useToast;
  global.useLoading = useLoading;

})(typeof window !== 'undefined' ? window : globalThis);
