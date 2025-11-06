// Analytics and telemetry manager for production monitoring

export interface AnalyticsEvent {
  name: string;
  category: 'user' | 'performance' | 'error' | 'business';
  properties?: Record<string, any>;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

export interface UserMetrics {
  userId: string;
  sessionDuration: number;
  projectsCreated: number;
  videosExported: number;
  featuresUsed: string[];
  lastActivity: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  exportTime: number;
  memoryUsage: number;
  cpuUsage: number;
  fps: number;
  errorRate: number;
}

export interface UIEventPayload {
  event: string;
  element?: string;
  value?: unknown;
  metadata?: Record<string, any>;
}

export type TimelineInteractionAction =
  | 'clip_drag_start'
  | 'clip_drag_end'
  | 'clip_snap'
  | 'clip_drag_mode_change'
  | 'clip_track_change'
  | 'clip_move_committed'
  | 'clip_ripple_shift'
  | 'clip_split'
  | 'zoom_adjust'
  | 'ripple_toggle'
  | 'shortcuts_copy'
  | 'transport_play'
  | 'transport_pause'
  | 'transport_seek'
  | 'transport_loop_toggle'
  | 'transport_loop_region_set'
  | 'transport_loop_restart'
  | 'transport_loop_clear'
  | 'playback_rate_adjust';

export interface TimelineInteractionPayload {
  clipId?: string;
  trackId?: string;
  previousTrackId?: string;
  start?: number;
  previousStart?: number;
  duration?: number;
  snapInterval?: number;
  snapOffset?: number;
  rippleEnabled?: boolean;
  dragMode?: 'snapped' | 'free';
  zoom?: number;
  source?: string;
  shortcutCount?: number;
  elapsedMs?: number;
  positionDelta?: number;
  pixelDelta?: number;
  [key: string]: any;
}

declare global {
  interface Window {
    analyticsDiagnostics?: {
      getMetrics: () => ReturnType<AnalyticsManager['getQueueMetrics']>;
      logMetrics: (label?: string) => void;
    };
  }
}

class AnalyticsManager {
  private events: AnalyticsEvent[] = [];
  private isEnabled = true;
  private sessionId: string;
  private userId?: string;
  private batchSize = 50;
  private flushInterval = 30000; // 30 seconds
  private retryAttempts = 3;
  private endpoint = '/api/analytics';
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heatmapInitialized = false;
  private heatmapHandler?: (event: MouseEvent) => void;
  private totalEventsSent = 0;
  private totalSendFailures = 0;
  private lastFlushTimestamp: number | null = null;
  private lastSendError?: string;
  private readonly maxQueueSize = 1000;
  private readonly sensitiveKeys = new Set([
    'password',
    'token',
    'secret',
    'authorization',
    'auth',
    'creditCard',
    'cardNumber',
    'ssn',
    'iban',
    'bic',
    'apiKey'
  ]);

  constructor() {
    if (typeof window === 'undefined') {
      this.isEnabled = false;
      this.sessionId = 'server';
      return;
    }

    this.sessionId = this.generateSessionId();
    this.setupAutoFlush();
    this.setupBeforeUnload();
    this.trackPageLoad();
    this.exposeDiagnostics();
  }
  // Core tracking methods
  track(name: string, properties?: Record<string, any>, category: AnalyticsEvent['category'] = 'user'): void {
    if (!this.isEnabled || typeof window === 'undefined') return;

    const sanitizedProperties = this.sanitizeProperties(properties);

    const event: AnalyticsEvent = {
      name,
      category,
      properties: {
        ...sanitizedProperties,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: Date.now()
      },
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.events.push(event);

    // Auto-flush
    if (this.events.length > this.maxQueueSize) {
      this.events = this.events.slice(-this.maxQueueSize);
    }

    if (this.events.length >= this.batchSize) {
      this.flush();
    }

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Analytics:', event);
    }
  }

  // User behavior tracking
  trackUserAction(action: string, element?: string, value?: any): void {
    this.track('user_action', {
      action,
      element,
      value,
      path: window.location.pathname
    }, 'user');
  }

  trackFeatureUsage(feature: string, properties?: Record<string, any>): void {
    this.track('feature_used', {
      feature,
      ...properties
    }, 'user');
  }

  trackProjectEvent(event: 'created' | 'opened' | 'saved' | 'exported', projectId: string, metadata?: Record<string, any>): void {
    this.track('project_event', {
      event,
      projectId,
      ...metadata
    }, 'business');
  }

  // Performance tracking
  trackPerformance(metric: string, value: number, unit: string = 'ms'): void {
    this.track('performance_metric', {
      metric,
      value,
      unit,
      url: window.location.href
    }, 'performance');
  }

  trackRenderTime(component: string, duration: number): void {
    this.trackPerformance(`render_time_${component}`, duration);
  }

  trackExportTime(format: string, duration: number, fileSize?: number): void {
    this.track('export_completed', {
      format,
      duration,
      fileSize,
      success: true
    }, 'business');
  }

  trackError(error: Error, context?: Record<string, any>): void {
    this.track('error_occurred', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      url: window.location.href
    }, 'error');
  }

  // Business metrics
  trackConversion(event: string, value?: number): void {
    this.track('conversion', {
      event,
      value
    }, 'business');
  }

  trackRetention(daysActive: number): void {
    this.track('retention', {
      daysActive,
      firstVisit: localStorage.getItem('first_visit') || new Date().toISOString()
    }, 'business');
  }

  // Advanced tracking
  trackEngagement(): void {
    const startTime = performance.now();
    const path = window.location.pathname;

    return () => {
      const duration = performance.now() - startTime;
      this.track('page_engagement', {
        duration,
        path,
        scrollDepth: this.getScrollDepth()
      }, 'user');
    };
  }

  trackVideoPlayback(action: 'play' | 'pause' | 'seek' | 'end', position: number, duration: number): void {
    this.track('video_playback', {
      action,
      position,
      duration,
      percentage: (position / duration) * 100
    }, 'user');
  }

  // User identification
  identify(userId: string, traits?: Record<string, any>): void {
    this.userId = userId;
    this.track('user_identified', {
      userId,
      traits
    }, 'user');
  }

  // Session management
  startSession(): void {
    this.sessionId = this.generateSessionId();
    this.track('session_started', {
      referrer: document.referrer,
      landingPage: window.location.pathname
    }, 'user');
  }

  endSession(): void {
    this.track('session_ended', {
      duration: this.getSessionDuration()
    }, 'user');
    this.flush();
  }

  // Data management
  async flush(): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await this.sendEvents(eventsToSend);
      this.totalEventsSent += eventsToSend.length;
      this.lastFlushTimestamp = Date.now();
      this.lastSendError = undefined;
    } catch (error) {
      console.error('Failed to send analytics events:', error);
      // Re-add events to queue for retry
      this.events = [...eventsToSend, ...this.events];
      this.totalSendFailures += 1;
      this.lastSendError = error instanceof Error ? error.message : String(error);
    }
  }

  private async sendEvents(events: AnalyticsEvent[], attempt: number = 1): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt < this.retryAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        setTimeout(() => this.sendEvents(events, attempt + 1), delay);
      } else {
        this.totalSendFailures += 1;
        this.lastSendError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }
  }

  getQueueMetrics() {
    return {
      pendingEvents: this.events.length,
      totalEventsSent: this.totalEventsSent,
      totalSendFailures: this.totalSendFailures,
      lastFlushTimestamp: this.lastFlushTimestamp,
      lastSendError: this.lastSendError
    };
  }

  logQueueMetrics(label = 'Analytics Queue Metrics'): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const metrics = this.getQueueMetrics();
    console.group(label);
    console.table(metrics);
    console.groupEnd();
  }

  exposeDiagnostics(): void {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
      return;
    }

    window.analyticsDiagnostics = {
      getMetrics: () => this.getQueueMetrics(),
      logMetrics: (label?: string) => this.logQueueMetrics(label)
    };
  }

  teardownDiagnostics(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.analyticsDiagnostics) {
      delete window.analyticsDiagnostics;
    }
  }

  // Configuration
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  setBatchSize(size: number): void {
    this.batchSize = size;
  }

  setFlushInterval(interval: number): void {
    this.flushInterval = interval;
    this.setupAutoFlush();
  }

  enable(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.isEnabled = true;
    this.setupAutoFlush();
    this.exposeDiagnostics();
  }

  disable(): void {
    this.isEnabled = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (typeof document !== 'undefined' && this.heatmapHandler) {
      document.removeEventListener('click', this.heatmapHandler);
      this.heatmapHandler = undefined;
      this.heatmapInitialized = false;
    }

    this.teardownDiagnostics();
  }

  // Utility methods
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeProperties(
    properties?: Record<string, any>,
    depth: number = 0
  ): Record<string, any> | undefined {
    if (!properties) {
      return undefined;
    }

    const result: Record<string, any> = {};
    const MAX_KEYS = 50;
    const MAX_STRING_LENGTH = 500;
    const MAX_ARRAY_LENGTH = 20;

    for (const key of Object.keys(properties).slice(0, MAX_KEYS)) {
      const value = properties[key];

      if (value === undefined || value === null) {
        continue;
      }

       if (this.isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
        continue;
      }

      if (typeof value === 'string') {
        result[key] = value.length > MAX_STRING_LENGTH
          ? `${value.substring(0, MAX_STRING_LENGTH)}…`
          : value;
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value;
        continue;
      }

      if (value instanceof Date) {
        result[key] = value.toISOString();
        continue;
      }

      if (Array.isArray(value)) {
        if (depth >= 1) {
          continue;
        }

        result[key] = value.slice(0, MAX_ARRAY_LENGTH).map((entry) => {
          if (typeof entry === 'string') {
            return entry.length > MAX_STRING_LENGTH
              ? `${entry.substring(0, MAX_STRING_LENGTH)}…`
              : entry;
          }
          if (typeof entry === 'number' || typeof entry === 'boolean') {
            return entry;
          }
          if (entry instanceof Date) {
            return entry.toISOString();
          }
          if (typeof entry === 'object' && entry !== null) {
            return this.sanitizeProperties(entry as Record<string, any>, depth + 1);
          }
          return undefined;
        }).filter((entry) => entry !== undefined);

        continue;
      }

      if (typeof value === 'object') {
        if (depth >= 1) {
          continue;
        }

        const nested = this.sanitizeProperties(value as Record<string, any>, depth + 1);
        if (nested && Object.keys(nested).length > 0) {
          result[key] = nested;
        }
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return this.sensitiveKeys.has(normalized)
      || normalized.includes('password')
      || normalized.includes('token')
      || normalized.includes('secret')
      || normalized.includes('credit')
      || normalized.includes('card')
      || normalized.includes('auth')
      || normalized.includes('ssn');
  }

  private getSessionDuration(): number {
    const startTime = parseInt(this.sessionId.split('-')[0]);
    return Date.now() - startTime;
  }

  private getScrollDepth(): number {
    const scrollTop = window.pageYOffset;
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    return documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;
  }

  private setupAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (typeof window === 'undefined' || !this.isEnabled) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.events.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  private setupBeforeUnload(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('beforeunload', () => {
      this.endSession();
    });
  }

  private trackPageLoad(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('load', () => {
      this.track('page_loaded', {
        loadTime: performance.now(),
        path: window.location.pathname
      }, 'performance');
    });
  }

  // A/B Testing support
  trackExperiment(experimentId: string, variant: string): void {
    this.track('experiment_viewed', {
      experimentId,
      variant
    }, 'user');
  }

  // Heat mapping data collection
  collectHeatmapData(): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (this.heatmapInitialized) {
      return;
    }

    this.heatmapInitialized = true;
    this.heatmapHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.tagName) {
        return;
      }

      const tagName = target.tagName.toLowerCase();
      // Focus on interactive elements to reduce noise
      if (!target.closest('button, a, input, [role="button"], [role="link"]')) {
        return;
      }

      this.track('click_heatmap', {
        x: event.clientX,
        y: event.clientY,
        element: tagName,
        className: target.className,
        id: target.id,
        text: target.textContent?.substring(0, 100)
      }, 'user');
    };

    document.addEventListener('click', this.heatmapHandler, { passive: true });
  }

  // Export analytics data
  exportData(startDate?: Date, endDate?: Date): AnalyticsEvent[] {
    const start = startDate?.getTime() || 0;
    const end = endDate?.getTime() || Date.now();

    return this.events.filter(event =>
      event.timestamp && event.timestamp >= start && event.timestamp <= end
    );
  }

  // Get analytics summary
  getSummary(): {
    totalEvents: number;
    sessionDuration: number;
    topFeatures: string[];
    errorRate: number;
  } {
    const totalEvents = this.events.length;
    const sessionDuration = this.getSessionDuration();

    const featureUsage = this.events
      .filter(e => e.name === 'feature_used')
      .map(e => e.properties?.feature)
      .filter(Boolean);

    const topFeatures = [...new Set(featureUsage)].slice(0, 5);

    const errors = this.events.filter(e => e.category === 'error').length;
    const errorRate = totalEvents > 0 ? (errors / totalEvents) * 100 : 0;

    return {
      totalEvents,
      sessionDuration,
      topFeatures,
      errorRate
    };
  }
}

// Singleton instance
export const analytics = new AnalyticsManager();

// React hook for analytics
export const useAnalytics = () => {
  const trackEvent = (name: string, properties?: Record<string, any>) => {
    analytics.track(name, properties);
  };

  const trackFeature = (feature: string, properties?: Record<string, any>) => {
    analytics.trackFeatureUsage(feature, properties);
  };

  const trackError = (error: Error, context?: Record<string, any>) => {
    analytics.trackError(error, context);
  };

  return {
    track: trackEvent,
    trackFeature,
    trackError,
    trackUserAction: analytics.trackUserAction.bind(analytics),
    trackPerformance: analytics.trackPerformance.bind(analytics)
  };
};

export const logUIEvent = (event: string, payload?: Omit<UIEventPayload, 'event'>) => {
  if (typeof window === 'undefined') {
    return;
  }

  analytics.track('ui_event', {
    event,
    ...payload,
    path: window.location.pathname
  }, 'user');
};

export const logTimelineInteraction = (
  action: TimelineInteractionAction,
  payload: TimelineInteractionPayload = {}
) => {
  if (typeof window === 'undefined') {
    return;
  }

  logUIEvent('timeline-interaction', {
    metadata: {
      action,
      timestamp: Date.now(),
      ...payload
    }
  });
};

// Initialize analytics with privacy compliance
if (typeof window !== 'undefined') {
  // Check for user consent
  const hasConsent = localStorage.getItem('analytics_consent') === 'true';

  if (hasConsent) {
    analytics.enable();
    analytics.collectHeatmapData();
  } else {
    analytics.disable();
  }

  // Set first visit timestamp
  if (!localStorage.getItem('first_visit')) {
    localStorage.setItem('first_visit', new Date().toISOString());
  }
}