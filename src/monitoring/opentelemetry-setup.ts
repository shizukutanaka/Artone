/**
 * OpenTelemetry Configuration
 * Vendor-neutral observability with structured logging, tracing, and metrics
 * Implements W3C standards for context propagation
 */

import { getConfig } from '@/config/environment';

/**
 * Structured logging levels following standard conventions
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured log entry with OpenTelemetry context
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Correlation context for distributed tracing
 * Follows W3C Trace Context standard
 */
interface CorrelationContext {
  traceId: string;
  spanId: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}

/**
 * Generate unique IDs in W3C format (128-bit hex)
 */
function generateId(length: number = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Structured Logger with OpenTelemetry context propagation
 * Outputs JSON logs suitable for log aggregation services
 */
export class StructuredLogger {
  private context: CorrelationContext;
  private config = getConfig();

  constructor(context?: Partial<CorrelationContext>) {
    this.context = {
      traceId: context?.traceId || generateId(),
      spanId: context?.spanId || generateId(8),
      ...context,
    };
  }

  /**
   * Get current correlation context for propagation to child spans/requests
   */
  getContext(): CorrelationContext {
    return { ...this.context };
  }

  /**
   * Format log entry as JSON (production) or readable text (development)
   */
  private formatLogEntry(entry: LogEntry): string {
    if (this.config.logging.format === 'json') {
      return JSON.stringify(entry);
    }

    // Human-readable format for development
    const timestamp = entry.timestamp;
    const level = entry.level.padEnd(5);
    const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const traceInfo = entry.traceId ? ` [${entry.traceId.slice(0, 8)}:${entry.spanId}]` : '';
    return `${timestamp} ${level} ${entry.message}${context}${traceInfo}`;
  }

  /**
   * Output log (respects configuration)
   */
  private output(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);

    if (this.config.logging.enableConsole) {
      const logFn = {
        DEBUG: console.debug,
        INFO: console.info,
        WARN: console.warn,
        ERROR: console.error,
      }[entry.level];

      logFn(formatted);
    }

    // File logging would be implemented here in production
    // Example: fs.appendFileSync(logPath, formatted + '\n')
  }

  /**
   * Check if logging level should output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    const configLevel = { debug: 0, info: 1, warn: 2, error: 3 }[this.config.logging.level];
    return levels[level] >= configLevel;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    this.output({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    this.output({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
    });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    this.output({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
    });
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    let errorInfo: LogEntry['error'];
    if (error instanceof Error) {
      errorInfo = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    } else if (typeof error === 'string') {
      errorInfo = { message: error };
    } else if (error) {
      errorInfo = { message: String(error) };
    }

    this.output({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      error: errorInfo,
    });
  }

  /**
   * Create child logger with new span ID (preserves trace ID)
   */
  createChild(spanContext?: Partial<CorrelationContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      spanId: generateId(8),
      ...spanContext,
    });
  }
}

/**
 * Simple metrics collector for application observability
 */
export interface Metrics {
  [key: string]: number;
}

export class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  private logger: StructuredLogger;

  constructor(logger?: StructuredLogger) {
    this.logger = logger || new StructuredLogger();
  }

  /**
   * Record a metric value (e.g., response time, memory usage)
   */
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name: string): { count: number; min: number; max: number; avg: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }

  /**
   * Get all metrics as a report
   */
  getReport(): Record<string, { count: number; min: number; max: number; avg: number }> {
    const report: Record<string, { count: number; min: number; max: number; avg: number }> = {};

    this.metrics.forEach((values, name) => {
      const stats = this.getMetricStats(name);
      if (stats) {
        report[name] = stats;
      }
    });

    return report;
  }

  /**
   * Clear metrics (useful for periodic reporting)
   */
  reset(): void {
    this.metrics.clear();
  }
}

/**
 * Global logger instance (singleton)
 */
let globalLogger: StructuredLogger | null = null;

export function initializeLogger(context?: Partial<CorrelationContext>): StructuredLogger {
  globalLogger = new StructuredLogger(context);
  return globalLogger;
}

export function getLogger(): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger();
  }
  return globalLogger;
}

/**
 * Error boundary with structured logging
 * Ensures errors are properly logged with context
 */
export class ErrorWithContext extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>,
    public correlationId?: string
  ) {
    super(message);
    this.name = 'ErrorWithContext';
  }
}
