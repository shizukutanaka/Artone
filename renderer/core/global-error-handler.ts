interface GlobalErrorHandler {
  handleError: (error: ErrorEvent | PromiseRejectionEvent) => void;
  logError: (error: Error, context?: any) => void;
}

class GlobalErrorHandlerImpl implements GlobalErrorHandler {
  private errorQueue: Array<{error: Error, context?: any, timestamp: number}> = [];
  private readonly maxQueueSize = 50;

  constructor() {
    this.initializeGlobalHandlers();
  }

  private initializeGlobalHandlers(): void {
    // Handle uncaught JavaScript errors
    window.addEventListener('error', (event) => {
      this.handleError(event);
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event);
    });

    // Handle console errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      originalConsoleError.apply(console, args);
      this.logError(new Error(args.join(' ')), { source: 'console' });
    };
  }

  public handleError(errorEvent: ErrorEvent | PromiseRejectionEvent): void {
    let error: Error;
    let context: any = {};

    if (errorEvent instanceof ErrorEvent) {
      error = errorEvent.error || new Error(errorEvent.message);
      context = {
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
        type: 'javascript'
      };
    } else {
      // Promise rejection
      error = errorEvent.reason instanceof Error ? errorEvent.reason : new Error(String(errorEvent.reason));
      context = {
        type: 'promise',
        promise: errorEvent.promise
      };
    }

    this.logError(error, context);
  }

  public logError(error: Error, context?: any): void {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: Date.now(),
      context: {
        ...context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        memory: (performance as any).memory ? {
          used: (performance as any).memory.usedJSHeapSize,
          total: (performance as any).memory.totalJSHeapSize,
          limit: (performance as any).memory.jsHeapSizeLimit
        } : undefined
      }
    };

    // Add to queue
    this.errorQueue.push(errorInfo);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // Only log to console in development
    if (process.env.NODE_ENV === 'development') {
      // Use structured logging instead of console.error
      if (typeof window !== 'undefined' && (window as any).__ARTONE_LOGGER__) {
        (window as any).__ARTONE_LOGGER__.error('[Global Error Handler]', errorInfo);
      }
    }

    // Send to error reporting service
    this.reportError(errorInfo);
  }

  private reportError(errorInfo: any): void {
    // Send to external service
    if (window.Sentry) {
      window.Sentry.captureException(new Error(errorInfo.message), {
        contexts: {
          global_error: errorInfo.context
        },
        tags: {
          error_type: errorInfo.context.type || 'unknown'
        }
      });
    }

    // Store locally
    try {
      const existingErrors = JSON.parse(localStorage.getItem('artone_global_errors') || '[]');
      existingErrors.push(errorInfo);

      // Keep only last 20 errors
      if (existingErrors.length > 20) {
        existingErrors.splice(0, existingErrors.length - 20);
      }

      localStorage.setItem('artone_global_errors', JSON.stringify(existingErrors));
    } catch (e) {
      console.warn('Could not store global error');
    }
  }

  public getErrorQueue(): any[] {
    return [...this.errorQueue];
  }

  public clearErrorQueue(): void {
    this.errorQueue = [];
  }

  public generateErrorReport(): string {
    const errors = this.getErrorQueue();
    const summary = {
      totalErrors: errors.length,
      errorsByType: this.groupErrorsByType(errors),
      recentErrors: errors.slice(-5),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(summary, null, 2);
  }

  private groupErrorsByType(errors: any[]): Record<string, number> {
    return errors.reduce((acc, error) => {
      const type = error.context?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

// Global instance
let globalErrorHandler: GlobalErrorHandlerImpl | null = null;

export function initializeGlobalErrorHandler(): void {
  if (typeof window === 'undefined') return;

  globalErrorHandler = new GlobalErrorHandlerImpl();
}

export function getGlobalErrorHandler(): GlobalErrorHandlerImpl | null {
  return globalErrorHandler;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeGlobalErrorHandler();
}
