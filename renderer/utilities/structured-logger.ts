import { getSafeStorage } from './safe-storage';

interface LogContext {
  userId?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
  duration?: number;
  error?: Error;
  filename?: string;
  lineno?: number;
  colno?: number;
  promise?: Promise<unknown>;
  userAgent?: string;
  url?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  context: LogContext;
  stack?: string;
}

interface LoggerConfig {
  level: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  maxFileSize: number;
  maxFiles: number;
  remoteEndpoint?: string;
}

const LOG_STORAGE_KEY = 'artone_logs';

class StructuredLogger {
  private config: LoggerConfig;
  private sessionId: string;
  private logs: LogEntry[] = [];
  private storage = typeof window !== 'undefined' ? getSafeStorage('local') : null;

  private readonly defaultConfig: LoggerConfig = {
    level: 'info',
    enableConsole: true,
    enableFile: true,
    enableRemote: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.sessionId = this.generateSessionId();
    this.initializeLogger();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeLogger(): void {
    // Set up global error handlers to log errors
    this.setupGlobalErrorLogging();

    // Set up performance monitoring
    this.setupPerformanceLogging();

    // Set up user interaction logging
    this.setupUserInteractionLogging();
  }

  private setupGlobalErrorLogging(): void {
    window.addEventListener('error', (event) => {
      this.error('Uncaught JavaScript error', {
        error: event.error,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', {
        error: event.reason,
        promise: event.promise
      });
    });
  }

  private setupPerformanceLogging(): void {
    if ('PerformanceObserver' in window) {
      // Monitor Largest Contentful Paint
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.info('Largest Contentful Paint', {
              component: 'performance',
              metadata: {
                value: entry.startTime,
                element: (entry as any).element?.tagName
              }
            });
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        console.warn('LCP observer not supported');
      }

      // Monitor First Input Delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.info('First Input Delay', {
              component: 'performance',
              metadata: {
                value: (entry as any).processingStart - entry.startTime,
                inputType: (entry as any).name
              }
            });
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        console.warn('FID observer not supported');
      }
    }
  }

  private setupUserInteractionLogging(): void {
    let interactionStartTime: number | null = null;

    document.addEventListener('mousedown', () => {
      interactionStartTime = performance.now();
    }, true);

    document.addEventListener('mouseup', () => {
      if (interactionStartTime) {
        const duration = performance.now() - interactionStartTime;
        if (duration > 100) { // Log interactions longer than 100ms
          this.debug('Long user interaction', {
            component: 'user-interaction',
            metadata: { duration }
          });
        }
        interactionStartTime = null;
      }
    }, true);
  }

  public error(message: string, context: LogContext = {}): void {
    this.log('error', message, context);
  }

  public warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  public info(message: string, context: LogContext = {}): void {
    this.log('info', message, context);
  }

  public debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, context);
  }

  private log(level: LogEntry['level'], message: string, context: LogContext = {}): void {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      stack: level === 'error' && context.error ? context.error.stack : undefined
    };

    // Add to internal log array
    this.logs.push(logEntry);

    // Keep only last 1000 logs in memory
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.outputToConsole(logEntry);
    }

    // Write to file if enabled
    if (this.config.enableFile) {
      this.writeToFile(logEntry);
    }

    // Send to remote service if enabled
    if (this.config.enableRemote) {
      this.sendToRemote(logEntry);
    }
  }

  private outputToConsole(logEntry: LogEntry): void {
    // Only output to console in development
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const logMethod = console[logEntry.level] || console.log;
    const prefix = `[${logEntry.timestamp}] [${logEntry.level.toUpperCase()}]`;

    if (logEntry.level === 'error' && logEntry.stack) {
      logMethod(`${prefix} ${logEntry.message}`, logEntry.stack);
    } else {
      logMethod(`${prefix} ${logEntry.message}`, logEntry.context);
    }
  }

  private writeToFile(logEntry: LogEntry): void {
    if (!this.storage) {
      return;
    }

    try {
      const existingLogsRaw = this.storage.getItem(LOG_STORAGE_KEY);
      const logs: LogEntry[] = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];

      logs.push(logEntry);

      // Keep only last 100 logs in storage to prevent unbounded growth
      if (logs.length > 100) {
        logs.splice(0, logs.length - 100);
      }

      this.storage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
      console.warn('Failed to write log to storage:', error);
    }
  }

  private sendToRemote(logEntry: LogEntry): void {
    if (!this.config.remoteEndpoint) return;

    try {
      fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logEntry)
      }).catch(error => {
        console.warn('Failed to send log to remote service:', error);
      });
    } catch (error) {
      console.warn('Failed to send log to remote service:', error);
    }
  }

  // Public API
  public setLevel(level: string): void {
    this.config.level = level;
  }

  public setUserId(userId: string): void {
    // This would typically be set by the application
    console.log('Setting user ID for logging:', userId);
  }

  public getLogs(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  public getLogsByComponent(component: string): LogEntry[] {
    return this.logs.filter(log => log.context.component === component);
  }

  public exportLogs(): string {
    const exportData = {
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      logs: this.logs,
      summary: {
        totalLogs: this.logs.length,
        errors: this.logs.filter(l => l.level === 'error').length,
        warnings: this.logs.filter(l => l.level === 'warn').length,
        info: this.logs.filter(l => l.level === 'info').length,
        debug: this.logs.filter(l => l.level === 'debug').length
      }
    };

    return JSON.stringify(exportData, null, 2);
  }

  public clearLogs(): void {
    this.logs = [];
    if (typeof window === 'undefined' || !this.storage) {
      return;
    }

    try {
      this.storage.removeItem(LOG_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear logs from storage', error);
    }
  }

  public getConfig(): LoggerConfig {
    return { ...this.config };
  }
}
let logger: StructuredLogger | null = null;

export function initializeLogger(): void {
  if (typeof window === 'undefined') return;

  logger = new StructuredLogger();
}

export function getLogger(): StructuredLogger | null {
  return logger;
}

// Convenience functions for common logging scenarios
export const logError = (message: string, context?: LogContext) => {
  logger?.error(message, context);
};

export const logWarning = (message: string, context?: LogContext) => {
  logger?.warn(message, context);
};

export const logInfo = (message: string, context?: LogContext) => {
  logger?.info(message, context);
};

export const logDebug = (message: string, context?: LogContext) => {
  logger?.debug(message, context);
};

export const logPerformance = (operation: string, duration: number, context?: LogContext) => {
  logger?.info(`Performance: ${operation}`, {
    ...context,
    metadata: { ...context?.metadata, duration, operation }
  });
};

export const logUserAction = (action: string, context?: LogContext) => {
  logger?.info(`User Action: ${action}`, {
    ...context,
    action,
    component: context?.component || 'user-interaction'
  });
};

// Auto-initialize logger
if (typeof window !== 'undefined') {
  initializeLogger();
}
