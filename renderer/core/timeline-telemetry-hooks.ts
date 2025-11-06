/**
 * Timeline Telemetry Hooks
 * Observes and reports timeline rendering pipeline metrics
 */

import {
  TimelineRenderingPipeline,
  TimelineTelemetry,
  PipelineMetrics,
  PipelinePhase
} from '../renderer/timeline-pipeline';

// Telemetry event types
export interface TimelineTelemetryEvent {
  type: 'performance_warning' | 'performance_error' | 'memory_warning' | 'data_integrity_issue';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  timestamp: number;
}

// Performance thresholds (configurable)
export const PERFORMANCE_THRESHOLDS = {
  RENDER_TIME_WARNING: 12, // ms (75% of 16ms budget)
  RENDER_TIME_ERROR: 20,   // ms (over budget)
  MEMORY_WARNING: 40 * 1024 * 1024, // 40MB
  MEMORY_CRITICAL: 60 * 1024 * 1024, // 60MB
  CLIP_COUNT_WARNING: 500,
  CLIP_COUNT_ERROR: 1000
} as const;

// Telemetry hooks registry
class TelemetryHooksRegistry {
  private hooks = new Map<string, Set<Function>>();
  private eventBuffer: TimelineTelemetryEvent[] = [];
  private readonly maxBufferSize = 100;

  registerHook(eventType: string, hook: Function): () => void {
    if (!this.hooks.has(eventType)) {
      this.hooks.set(eventType, new Set());
    }

    this.hooks.get(eventType)!.add(hook);

    // Return unsubscribe function
    return () => {
      const hookSet = this.hooks.get(eventType);
      if (hookSet) {
        hookSet.delete(hook);
        if (hookSet.size === 0) {
          this.hooks.delete(eventType);
        }
      }
    };
  }

  emit(eventType: string, data: any): void {
    const hooks = this.hooks.get(eventType);
    if (hooks) {
      hooks.forEach(hook => {
        try {
          hook(data);
        } catch (error) {
          console.error(`Telemetry hook failed for ${eventType}:`, error);
        }
      });
    }
  }

  recordEvent(event: TimelineTelemetryEvent): void {
    this.eventBuffer.push(event);

    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    // Emit the event
    this.emit(event.type, event);
  }

  getRecentEvents(count: number = 10): TimelineTelemetryEvent[] {
    return this.eventBuffer.slice(-count);
  }

  clearEvents(): void {
    this.eventBuffer = [];
  }
}

// Singleton registry
const telemetryRegistry = new TelemetryHooksRegistry();

// Performance monitor hook
export class TimelinePerformanceMonitor {
  private pipeline: TimelineRenderingPipeline;
  private unsubscribeMetrics: (() => void) | null = null;
  private performanceHistory: Map<PipelinePhase, number[]> = new Map();
  private readonly historySize = 50;

  constructor(pipeline: TimelineRenderingPipeline) {
    this.pipeline = pipeline;
    this.initializeMonitoring();
  }

  private initializeMonitoring(): void {
    const telemetry = this.pipeline.getTelemetry();

    // Subscribe to pipeline metrics
    this.unsubscribeMetrics = telemetry.subscribe((metric) => {
      this.processMetric(metric);
    });

    // Initialize performance history
    Object.values(PipelinePhase).forEach(phase => {
      this.performanceHistory.set(phase, []);
    });
  }

  private processMetric(metric: PipelineMetrics): void {
    // Update performance history
    const history = this.performanceHistory.get(metric.phase) || [];
    history.push(metric.duration);

    if (history.length > this.historySize) {
      history.shift();
    }

    this.performanceHistory.set(metric.phase, history);

    // Check performance thresholds
    this.checkPerformanceThresholds(metric);

    // Emit performance data
    telemetryRegistry.emit('metric_received', {
      metric,
      history: history.slice(-10), // Last 10 measurements
      average: history.reduce((a, b) => a + b, 0) / history.length
    });
  }

  private checkPerformanceThresholds(metric: PipelineMetrics): void {
    const issues: TimelineTelemetryEvent[] = [];

    // Render time checks
    if (metric.duration > PERFORMANCE_THRESHOLDS.RENDER_TIME_ERROR) {
      issues.push({
        type: 'performance_error',
        severity: 'high',
        message: `Pipeline phase ${metric.phase} exceeded time budget`,
        data: {
          phase: metric.phase,
          duration: metric.duration,
          budget: PERFORMANCE_THRESHOLDS.RENDER_TIME_ERROR,
          clipsProcessed: metric.clipsProcessed
        },
        timestamp: Date.now()
      });
    } else if (metric.duration > PERFORMANCE_THRESHOLDS.RENDER_TIME_WARNING) {
      issues.push({
        type: 'performance_warning',
        severity: 'medium',
        message: `Pipeline phase ${metric.phase} approaching time budget`,
        data: {
          phase: metric.phase,
          duration: metric.duration,
          budget: PERFORMANCE_THRESHOLDS.RENDER_TIME_WARNING,
          clipsProcessed: metric.clipsProcessed
        },
        timestamp: Date.now()
      });
    }

    // Memory checks (if available)
    if (metric.memoryUsage) {
      if (metric.memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL) {
        issues.push({
          type: 'memory_warning',
          severity: 'critical',
          message: 'Timeline memory usage critically high',
          data: {
            memoryUsage: metric.memoryUsage,
            limit: PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL,
            phase: metric.phase
          },
          timestamp: Date.now()
        });
      } else if (metric.memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
        issues.push({
          type: 'memory_warning',
          severity: 'high',
          message: 'Timeline memory usage high',
          data: {
            memoryUsage: metric.memoryUsage,
            limit: PERFORMANCE_THRESHOLDS.MEMORY_WARNING,
            phase: metric.phase
          },
          timestamp: Date.now()
        });
      }
    }

    // Clip count checks
    if (metric.clipsProcessed > PERFORMANCE_THRESHOLDS.CLIP_COUNT_ERROR) {
      issues.push({
        type: 'performance_error',
        severity: 'high',
        message: 'Excessive clip count processed',
        data: {
          clipsProcessed: metric.clipsProcessed,
          limit: PERFORMANCE_THRESHOLDS.CLIP_COUNT_ERROR,
          phase: metric.phase
        },
        timestamp: Date.now()
      });
    } else if (metric.clipsProcessed > PERFORMANCE_THRESHOLDS.CLIP_COUNT_WARNING) {
      issues.push({
        type: 'performance_warning',
        severity: 'medium',
        message: 'High clip count processed',
        data: {
          clipsProcessed: metric.clipsProcessed,
          limit: PERFORMANCE_THRESHOLDS.CLIP_COUNT_WARNING,
          phase: metric.phase
        },
        timestamp: Date.now()
      });
    }

    // Record issues
    issues.forEach(issue => {
      telemetryRegistry.recordEvent(issue);
    });
  }

  getPerformanceStats(): Record<PipelinePhase, {
    average: number;
    median: number;
    p95: number;
    min: number;
    max: number;
    samples: number;
  }> {
    const stats: any = {};

    this.performanceHistory.forEach((durations, phase) => {
      if (durations.length === 0) {
        stats[phase] = {
          average: 0,
          median: 0,
          p95: 0,
          min: 0,
          max: 0,
          samples: 0
        };
        return;
      }

      const sorted = [...durations].sort((a, b) => a - b);
      const average = durations.reduce((a, b) => a + b, 0) / durations.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      stats[phase] = {
        average: Math.round(average * 100) / 100,
        median: Math.round(median * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        min: Math.round(Math.min(...durations) * 100) / 100,
        max: Math.round(Math.max(...durations) * 100) / 100,
        samples: durations.length
      };
    });

    return stats;
  }

  destroy(): void {
    if (this.unsubscribeMetrics) {
      this.unsubscribeMetrics();
      this.unsubscribeMetrics = null;
    }
  }
}

// Data integrity monitor hook
export class TimelineDataIntegrityMonitor {
  private pipeline: TimelineRenderingPipeline;
  private lastKnownState: any = null;
  private integrityChecks = 0;
  private integrityViolations = 0;

  constructor(pipeline: TimelineRenderingPipeline) {
    this.pipeline = pipeline;
    this.initializeIntegrityMonitoring();
  }

  private initializeIntegrityMonitoring(): void {
    const telemetry = this.pipeline.getTelemetry();

    telemetry.subscribe((metric) => {
      this.checkDataIntegrity(metric);
    });
  }

  private checkDataIntegrity(metric: PipelineMetrics): void {
    this.integrityChecks++;

    // Check for data consistency issues
    const issues: TimelineTelemetryEvent[] = [];

    // Check for NaN or infinite values
    if (!isFinite(metric.duration) || metric.duration < 0) {
      issues.push({
        type: 'data_integrity_issue',
        severity: 'high',
        message: 'Invalid metric duration detected',
        data: {
          phase: metric.phase,
          duration: metric.duration,
          clipsProcessed: metric.clipsProcessed
        },
        timestamp: Date.now()
      });
    }

    // Check for unreasonable clip counts
    if (metric.clipsProcessed < 0 || metric.clipsProcessed > 10000) {
      issues.push({
        type: 'data_integrity_issue',
        severity: 'high',
        message: 'Invalid clip count detected',
        data: {
          phase: metric.phase,
          clipsProcessed: metric.clipsProcessed
        },
        timestamp: Date.now()
      });
    }

    // Check for memory usage anomalies
    if (metric.memoryUsage && (metric.memoryUsage < 0 || !isFinite(metric.memoryUsage))) {
      issues.push({
        type: 'data_integrity_issue',
        severity: 'medium',
        message: 'Invalid memory usage value',
        data: {
          phase: metric.phase,
          memoryUsage: metric.memoryUsage
        },
        timestamp: Date.now()
      });
    }

    // Record violations
    issues.forEach(issue => {
      this.integrityViolations++;
      telemetryRegistry.recordEvent(issue);
    });
  }

  getIntegrityStats(): {
    checksPerformed: number;
    violationsDetected: number;
    integrityRate: number;
  } {
    return {
      checksPerformed: this.integrityChecks,
      violationsDetected: this.integrityViolations,
      integrityRate: this.integrityChecks > 0
        ? ((this.integrityChecks - this.integrityViolations) / this.integrityChecks) * 100
        : 100
    };
  }
}

// User experience monitor hook
export class TimelineUserExperienceMonitor {
  private pipeline: TimelineRenderingPipeline;
  private userInteractions: Array<{
    type: string;
    timestamp: number;
    data?: any;
  }> = [];
  private readonly maxInteractions = 100;

  constructor(pipeline: TimelineRenderingPipeline) {
    this.pipeline = pipeline;
    this.initializeUXMonitoring();
  }

  private initializeUXMonitoring(): void {
    // Listen for timeline interaction events
    if (typeof document !== 'undefined') {
      document.addEventListener('timeline-interaction', (event: any) => {
        this.recordUserInteraction(event.detail.type, event.detail);
      });
    }
  }

  private recordUserInteraction(type: string, data?: any): void {
    this.userInteractions.push({
      type,
      timestamp: Date.now(),
      data
    });

    if (this.userInteractions.length > this.maxInteractions) {
      this.userInteractions.shift();
    }

    // Analyze user experience patterns
    this.analyzeUXPatterns();
  }

  private analyzeUXPatterns(): void {
    const recentInteractions = this.userInteractions.slice(-20);

    // Detect rapid clicking (potential frustration)
    const clickEvents = recentInteractions.filter(i => i.type === 'click');
    if (clickEvents.length >= 5) {
      const timeSpan = clickEvents[clickEvents.length - 1].timestamp - clickEvents[0].timestamp;
      const avgInterval = timeSpan / (clickEvents.length - 1);

      if (avgInterval < 200) { // Less than 200ms between clicks
        telemetryRegistry.recordEvent({
          type: 'performance_warning',
          severity: 'medium',
          message: 'Rapid user interactions detected - possible frustration',
          data: {
            interactionCount: clickEvents.length,
            avgInterval,
            timeSpan
          },
          timestamp: Date.now()
        });
      }
    }

    // Detect zoom level changes without clip interactions
    const zoomEvents = recentInteractions.filter(i => i.type === 'zoom');
    const clipEvents = recentInteractions.filter(i => i.type === 'clip_select');

    if (zoomEvents.length > 3 && clipEvents.length === 0) {
      telemetryRegistry.recordEvent({
        type: 'performance_warning',
        severity: 'low',
        message: 'User adjusting zoom without interacting with clips',
        data: {
          zoomEvents: zoomEvents.length,
          clipEvents: clipEvents.length
        },
        timestamp: Date.now()
      });
    }
  }

  getUXStats(): {
    totalInteractions: number;
    interactionTypes: Record<string, number>;
    averageInteractionRate: number;
  } {
    const interactionTypes: Record<string, number> = {};

    this.userInteractions.forEach(interaction => {
      interactionTypes[interaction.type] = (interactionTypes[interaction.type] || 0) + 1;
    });

    const timeSpan = this.userInteractions.length > 1
      ? this.userInteractions[this.userInteractions.length - 1].timestamp - this.userInteractions[0].timestamp
      : 0;

    const averageInteractionRate = timeSpan > 0
      ? (this.userInteractions.length / timeSpan) * 1000 // per second
      : 0;

    return {
      totalInteractions: this.userInteractions.length,
      interactionTypes,
      averageInteractionRate
    };
  }
}

// Main telemetry hooks manager
export class TimelineTelemetryHooks {
  private performanceMonitor: TimelinePerformanceMonitor | null = null;
  private integrityMonitor: TimelineDataIntegrityMonitor | null = null;
  private uxMonitor: TimelineUserExperienceMonitor | null = null;
  private pipeline: TimelineRenderingPipeline;

  constructor(pipeline: TimelineRenderingPipeline) {
    this.pipeline = pipeline;
  }

  initializeAllHooks(): void {
    this.performanceMonitor = new TimelinePerformanceMonitor(this.pipeline);
    this.integrityMonitor = new TimelineDataIntegrityMonitor(this.pipeline);
    this.uxMonitor = new TimelineUserExperienceMonitor(this.pipeline);
  }

  getPerformanceStats(): any {
    return this.performanceMonitor?.getPerformanceStats();
  }

  getIntegrityStats(): any {
    return this.integrityMonitor?.getIntegrityStats();
  }

  getUXStats(): any {
    return this.uxMonitor?.getUXStats();
  }

  getRecentEvents(count: number = 10): TimelineTelemetryEvent[] {
    return telemetryRegistry.getRecentEvents(count);
  }

  // Hook registration for external consumers
  onPerformanceWarning(callback: (event: TimelineTelemetryEvent) => void): () => void {
    return telemetryRegistry.registerHook('performance_warning', callback);
  }

  onPerformanceError(callback: (event: TimelineTelemetryEvent) => void): () => void {
    return telemetryRegistry.registerHook('performance_error', callback);
  }

  onMemoryWarning(callback: (event: TimelineTelemetryEvent) => void): () => void {
    return telemetryRegistry.registerHook('memory_warning', callback);
  }

  onDataIntegrityIssue(callback: (event: TimelineTelemetryEvent) => void): () => void {
    return telemetryRegistry.registerHook('data_integrity_issue', callback);
  }

  onMetricReceived(callback: (data: any) => void): () => void {
    return telemetryRegistry.registerHook('metric_received', callback);
  }

  destroy(): void {
    this.performanceMonitor?.destroy();
    this.performanceMonitor = null;
    this.integrityMonitor = null;
    this.uxMonitor = null;
  }
}

// Global telemetry hooks instance
let globalTelemetryHooks: TimelineTelemetryHooks | null = null;

export function getTimelineTelemetryHooks(pipeline?: TimelineRenderingPipeline): TimelineTelemetryHooks {
  if (!globalTelemetryHooks) {
    if (!pipeline) {
      throw new Error('Pipeline required for first telemetry hooks initialization');
    }
    globalTelemetryHooks = new TimelineTelemetryHooks(pipeline);
    globalTelemetryHooks.initializeAllHooks();
  }
  return globalTelemetryHooks;
}

export function resetTimelineTelemetryHooks(): void {
  globalTelemetryHooks?.destroy();
  globalTelemetryHooks = null;
  telemetryRegistry.clearEvents();
}

// Export for testing
export { telemetryRegistry, TelemetryHooksRegistry };
