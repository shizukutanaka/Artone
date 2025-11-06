/**
 * Production-Safe Logger
 * Replaces console.log with structured, privacy-aware logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  stack?: string;
}

class ProductionLogger {
  private readonly isDevelopment: boolean;
  private readonly enableRemote: boolean;
  private buffer: LogEntry[] = [];
  private readonly maxBufferSize = 100;
  private readonly sensitiveKeys = [
    'password', 'token', 'apiKey', 'secret', 'authorization',
    'cookie', 'session', 'ssn', 'creditCard', 'privateKey'
  ];

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.enableRemote = process.env.NEXT_PUBLIC_ENABLE_REMOTE_LOGGING === 'true';
  }

  /**
   * Remove sensitive data from context
   */
  private sanitizeContext(context: any): any {
    if (!context || typeof context !== 'object') {
      return context;
    }

    const sanitized: any = Array.isArray(context) ? [] : {};

    for (const [key, value] of Object.entries(context)) {
      // Check if key contains sensitive information
      const isSensitive = this.sensitiveKeys.some(sensitiveKey =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Create log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: any
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: context ? this.sanitizeContext(context) : undefined
    };

    if (level === 'error' && context?.error instanceof Error) {
      entry.stack = context.error.stack;
    }

    return entry;
  }

  /**
   * Add to buffer and manage size
   */
  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Output to console in development only
   */
  private outputToConsole(entry: LogEntry): void {
    if (!this.isDevelopment) {
      return;
    }

    const { level, message, context, timestamp } = entry;
    const time = new Date(timestamp).toISOString();
    const prefix = `[${time}] [${level.toUpperCase()}]`;

    const consoleMethod = console[level] || console.log;

    if (context) {
      consoleMethod(prefix, message, context);
    } else {
      consoleMethod(prefix, message);
    }
  }

  /**
   * Send to remote logging service
   */
  private async sendToRemote(entry: LogEntry): Promise<void> {
    if (!this.enableRemote || typeof window === 'undefined') {
      return;
    }

    try {
      const endpoint = process.env.NEXT_PUBLIC_LOG_ENDPOINT;
      if (!endpoint) {
        return;
      }

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        // Don't wait for response
        keepalive: true
      }).catch(() => {
        // Silently fail for logging
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Main log method
   */
  private log(level: LogLevel, message: string, context?: any): void {
    const entry = this.createEntry(level, message, context);

    this.addToBuffer(entry);
    this.outputToConsole(entry);

    if (level === 'error' || level === 'warn') {
      this.sendToRemote(entry);
    }
  }

  /**
   * Public API
   */
  debug(message: string, context?: any): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: any): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: any): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: any): void {
    this.log('error', message, context);
  }

  /**
   * Performance logging
   */
  performance(operation: string, duration: number, context?: any): void {
    this.info(`Performance: ${operation}`, {
      ...context,
      duration,
      operation
    });
  }

  /**
   * User action logging (privacy-aware)
   */
  userAction(action: string, context?: any): void {
    // Only log action type, not user data
    this.info(`User Action: ${action}`, {
      action,
      timestamp: Date.now()
    });
  }

  /**
   * Get recent logs for debugging
   */
  getRecentLogs(count: number = 20): LogEntry[] {
    return this.buffer.slice(-count);
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Export logs for support
   */
  exportLogs(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      logs: this.buffer,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    }, null, 2);
  }
}

// Singleton instance
const logger = new ProductionLogger();

// Export convenience functions
export const log = {
  debug: (msg: string, ctx?: any) => logger.debug(msg, ctx),
  info: (msg: string, ctx?: any) => logger.info(msg, ctx),
  warn: (msg: string, ctx?: any) => logger.warn(msg, ctx),
  error: (msg: string, ctx?: any) => logger.error(msg, ctx),
  performance: (op: string, dur: number, ctx?: any) => logger.performance(op, dur, ctx),
  userAction: (action: string, ctx?: any) => logger.userAction(action, ctx),
  getRecent: (count?: number) => logger.getRecentLogs(count),
  export: () => logger.exportLogs(),
  clear: () => logger.clear()
};

export default logger;

// Make available globally for renderer scripts
if (typeof window !== 'undefined') {
  (window as any).ProductionLogger = log;
}
