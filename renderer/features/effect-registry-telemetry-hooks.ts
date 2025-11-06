/**
 * Effect Registry Telemetry Hooks
 * Observes and reports effect registry domain operations
 */

import {
  getEffectRegistryDomainModel,
  EffectIdentity,
  EffectParameters,
  EffectTiming,
  EffectCompatibility,
  EffectRegistry,
  EffectInstanceManager,
  EFFECT_DOMAIN_INVARIANTS
} from '../renderer/effect-registry-domain-model';
import type { TimelineClip } from '../types/timeline';

// Effect registry telemetry event types
export interface EffectRegistryTelemetryEvent {
  type: 'effect_operation' | 'effect_validation' | 'effect_error' | 'registry_performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  operation: string;
  duration?: number;
  data: Record<string, any>;
  timestamp: number;
  effectId?: string;
  definitionId?: string;
  clipId?: string;
}

// Performance thresholds for effect operations
export const EFFECT_OPERATION_THRESHOLDS = {
  REGISTRATION_TIME_WARNING: 1, // ms
  REGISTRATION_TIME_ERROR: 5,   // ms
  VALIDATION_TIME_WARNING: 0.5, // ms
  VALIDATION_TIME_ERROR: 2,     // ms
  SEARCH_TIME_WARNING: 1,       // ms
  SEARCH_TIME_ERROR: 5,         // ms
  RENDER_TIME_WARNING: 2,       // ms
  RENDER_TIME_ERROR: 10,        // ms
  COMPLEXITY_CHECK_WARNING: 0.5,// ms
  COMPLEXITY_CHECK_ERROR: 2,    // ms
} as const;

// Telemetry hooks registry for effect registry
class EffectRegistryTelemetryRegistry {
  private hooks = new Map<string, Set<Function>>();
  private eventBuffer: EffectRegistryTelemetryEvent[] = [];
  private readonly maxBufferSize = 300;

  registerHook(eventType: string, hook: Function): () => void {
    if (!this.hooks.has(eventType)) {
      this.hooks.set(eventType, new Set());
    }

    this.hooks.get(eventType)!.add(hook);

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

  recordEvent(event: EffectRegistryTelemetryEvent): void {
    this.eventBuffer.push(event);

    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    // Emit the event
    this.emit(event.type, event);
  }

  emit(eventType: string, data: any): void {
    const hooks = this.hooks.get(eventType);
    if (hooks) {
      hooks.forEach(hook => {
        try {
          hook(data);
        } catch (error) {
          console.error(`Effect registry telemetry hook failed for ${eventType}:`, error);
        }
      });
    }
  }

  getRecentEvents(count: number = 30): EffectRegistryTelemetryEvent[] {
    return this.eventBuffer.slice(-count);
  }

  clearEvents(): void {
    this.eventBuffer = [];
  }

  getEventsByType(type: string): EffectRegistryTelemetryEvent[] {
    return this.eventBuffer.filter(event => event.type === type);
  }

  getEventsByEffect(effectId: string): EffectRegistryTelemetryEvent[] {
    return this.eventBuffer.filter(event => event.effectId === effectId);
  }
}

// Singleton registry
const effectRegistryTelemetryRegistry = new EffectRegistryTelemetryRegistry();

// Effect operation monitor hook
export class EffectOperationMonitor {
  private domain: ReturnType<typeof getEffectRegistryDomainModel>;
  private operationMetrics = new Map<string, number[]>();
  private readonly maxMetricsHistory = 150;

  constructor(domain: ReturnType<typeof getEffectRegistryDomainModel>) {
    this.domain = domain;
    this.initializeMonitoring();
  }

  private initializeMonitoring(): void {
    this.wrapDomainMethods();
  }

  private wrapDomainMethods(): void {
    const methodsToMonitor = [
      'registerEffect', 'unregisterEffect', 'getEffectDefinition',
      'createEffectInstance', 'validateEffectInstance', 'cloneEffectInstance',
      'updateEffectParameters', 'applyEffectToClip', 'canApplyEffect',
      'validateEffectComplexity', 'calculateEffectProgress', 'renderEffectStack',
      'searchEffects', 'getEffectsByType', 'getEffectsByCategory'
    ];

    methodsToMonitor.forEach(methodName => {
      const originalMethod = (this.domain as any)[methodName];
      if (typeof originalMethod === 'function') {
        (this.domain as any)[methodName] = this.createMonitoredMethod(methodName, originalMethod);
      }
    });
  }

  private createMonitoredMethod(methodName: string, originalMethod: Function): Function {
    return (...args: any[]) => {
      const startTime = performance.now();

      try {
        const result = originalMethod.apply(this.domain, args);
        const duration = performance.now() - startTime;

        this.recordOperation(methodName, duration, args, result, null);
        return result;

      } catch (error) {
        const duration = performance.now() - startTime;
        this.recordOperation(methodName, duration, args, null, error);
        throw error;
      }
    };
  }

  private recordOperation(
    operation: string,
    duration: number,
    args: any[],
    result: any,
    error: any
  ): void {
    // Update metrics history
    if (!this.operationMetrics.has(operation)) {
      this.operationMetrics.set(operation, []);
    }

    const metrics = this.operationMetrics.get(operation)!;
    metrics.push(duration);

    if (metrics.length > this.maxMetricsHistory) {
      metrics.shift();
    }

    // Determine severity and create event
    const severity = this.calculateSeverity(operation, duration, args, error);
    const event: EffectRegistryTelemetryEvent = {
      type: error ? 'effect_error' : 'effect_operation',
      severity,
      operation,
      duration,
      data: {
        argsCount: args.length,
        hasResult: result !== null && result !== undefined,
        hasError: error !== null,
        errorMessage: error?.message,
        effectId: this.extractEffectId(args, result),
        definitionId: this.extractDefinitionId(args, result),
        clipId: this.extractClipId(args, result)
      },
      timestamp: Date.now(),
      effectId: this.extractEffectId(args, result),
      definitionId: this.extractDefinitionId(args, result),
      clipId: this.extractClipId(args, result)
    };

    effectRegistryTelemetryRegistry.recordEvent(event);
  }

  private calculateSeverity(
    operation: string,
    duration: number,
    args: any[],
    error: any
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (error) return 'high';

    const thresholds = this.getThresholdsForOperation(operation);

    if (duration > thresholds.error) return 'high';
    if (duration > thresholds.warning) return 'medium';

    // Check for potentially expensive operations
    if (operation === 'renderEffectStack' && Array.isArray(args[0])) {
      const effectCount = args[0].length;
      if (effectCount > 20) return 'medium';
      if (effectCount > 50) return 'high';
    }

    if (operation === 'searchEffects' && typeof args[0] === 'string') {
      const queryLength = args[0].length;
      if (queryLength > 100) return 'low'; // Unusual but not critical
    }

    return 'low';
  }

  private getThresholdsForOperation(operation: string): { warning: number; error: number } {
    switch (operation) {
      case 'registerEffect':
      case 'unregisterEffect':
        return {
          warning: EFFECT_OPERATION_THRESHOLDS.REGISTRATION_TIME_WARNING,
          error: EFFECT_OPERATION_THRESHOLDS.REGISTRATION_TIME_ERROR
        };
      case 'validateEffectInstance':
      case 'canApplyEffect':
        return {
          warning: EFFECT_OPERATION_THRESHOLDS.VALIDATION_TIME_WARNING,
          error: EFFECT_OPERATION_THRESHOLDS.VALIDATION_TIME_ERROR
        };
      case 'searchEffects':
      case 'getEffectsByType':
      case 'getEffectsByCategory':
        return {
          warning: EFFECT_OPERATION_THRESHOLDS.SEARCH_TIME_WARNING,
          error: EFFECT_OPERATION_THRESHOLDS.SEARCH_TIME_ERROR
        };
      case 'renderEffectStack':
        return {
          warning: EFFECT_OPERATION_THRESHOLDS.RENDER_TIME_WARNING,
          error: EFFECT_OPERATION_THRESHOLDS.RENDER_TIME_ERROR
        };
      case 'validateEffectComplexity':
        return {
          warning: EFFECT_OPERATION_THRESHOLDS.COMPLEXITY_CHECK_WARNING,
          error: EFFECT_OPERATION_THRESHOLDS.COMPLEXITY_CHECK_ERROR
        };
      default:
        return { warning: 1, error: 5 };
    }
  }

  private extractEffectId(args: any[], result: any): string | undefined {
    // Try to extract effect ID from args or result
    for (const arg of args) {
      if (arg && typeof arg === 'object' && arg.id && arg.definitionId) {
        return arg.id; // Effect instance
      }
    }

    if (result && typeof result === 'object' && result.id && result.definitionId) {
      return result.id;
    }

    return undefined;
  }

  private extractDefinitionId(args: any[], result: any): string | undefined {
    // Try to extract definition ID from args or result
    for (const arg of args) {
      if (arg && typeof arg === 'object' && arg.id && !arg.definitionId) {
        return arg.id; // Effect definition
      }
      if (arg && typeof arg === 'object' && arg.definitionId) {
        return arg.definitionId; // From effect instance
      }
    }

    if (result && typeof result === 'object' && result.definitionId) {
      return result.definitionId;
    }

    return undefined;
  }

  private extractClipId(args: any[], result: any): string | undefined {
    // Try to extract clip ID from args or result
    for (const arg of args) {
      if (arg && typeof arg === 'object' && arg.id && arg.type && typeof arg.type === 'string') {
        return arg.id; // TimelineClip
      }
      if (arg && typeof arg === 'object' && arg.clipId) {
        return arg.clipId; // From effect instance
      }
    }

    if (result && typeof result === 'object' && result.clipId) {
      return result.clipId;
    }

    return undefined;
  }

  getOperationMetrics(): Record<string, {
    count: number;
    average: number;
    median: number;
    p95: number;
    min: number;
    max: number;
  }> {
    const metrics: any = {};

    this.operationMetrics.forEach((durations, operation) => {
      if (durations.length === 0) return;

      const sorted = [...durations].sort((a, b) => a - b);
      const average = durations.reduce((a, b) => a + b, 0) / durations.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      metrics[operation] = {
        count: durations.length,
        average: Math.round(average * 100) / 100,
        median: Math.round(median * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        min: Math.round(Math.min(...durations) * 100) / 100,
        max: Math.round(Math.max(...durations) * 100) / 100
      };
    });

    return metrics;
  }

  detectPerformanceIssues(): Array<{
    operation: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
    metric: any;
  }> {
    const issues: Array<any> = [];
    const metrics = this.getOperationMetrics();

    Object.entries(metrics).forEach(([operation, metric]) => {
      const thresholds = this.getThresholdsForOperation(operation);

      if (metric.p95 > thresholds.error) {
        issues.push({
          operation,
          issue: `P95 duration exceeds error threshold`,
          severity: 'high' as const,
          metric
        });
      } else if (metric.average > thresholds.warning) {
        issues.push({
          operation,
          issue: `Average duration exceeds warning threshold`,
          severity: 'medium' as const,
          metric
        });
      }

      // Check for high variance (potential performance instability)
      if (metric.max > metric.average * 5) {
        issues.push({
          operation,
          issue: `Extreme performance variance detected`,
          severity: 'high' as const,
          metric
        });
      }
    });

    return issues;
  }
}

// Effect validation monitor hook
export class EffectValidationMonitor {
  private domain: ReturnType<typeof getEffectRegistryDomainModel>;
  private validationStats = {
    totalValidations: 0,
    validationErrors: 0,
    validationWarnings: 0,
    commonErrors: new Map<string, number>(),
    commonWarnings: new Map<string, number>(),
    effectTypeErrors: new Map<string, number>(),
    clipTypeErrors: new Map<string, number>()
  };

  constructor(domain: ReturnType<typeof getEffectRegistryDomainModel>) {
    this.domain = domain;
    this.initializeValidationMonitoring();
  }

  private initializeValidationMonitoring(): void {
    // Wrap validation methods
    const originalValidateInstance = this.domain.validateEffectInstance;
    const originalCanApply = this.domain.canApplyEffect;

    this.domain.validateEffectInstance = ((instance: any) => {
      const result = originalValidateInstance.call(this.domain, instance);
      this.recordValidationResult(result, instance);
      return result;
    }) as any;

    this.domain.canApplyEffect = ((definition: any, clip: TimelineClip) => {
      const result = originalCanApply.call(this.domain, definition, clip);
      this.recordCompatibilityCheck(definition, clip, result);
      return result;
    }) as any;
  }

  private recordValidationResult(result: any, instance: any): void {
    this.validationStats.totalValidations++;

    if (!result.valid) {
      this.validationStats.validationErrors++;
      result.errors.forEach((error: string) => {
        this.recordError(error);
        this.validationStats.effectTypeErrors.set(
          instance.definitionId || 'unknown',
          (this.validationStats.effectTypeErrors.get(instance.definitionId || 'unknown') || 0) + 1
        );
      });
    }

    if (result.warnings && result.warnings.length > 0) {
      this.validationStats.validationWarnings += result.warnings.length;
      result.warnings.forEach((warning: string) => this.recordWarning(warning));
    }

    // Emit validation event
    effectRegistryTelemetryRegistry.recordEvent({
      type: 'effect_validation',
      severity: result.valid ? 'low' : 'medium',
      operation: 'validate_instance',
      data: {
        valid: result.valid,
        errorCount: result.errors?.length || 0,
        warningCount: result.warnings?.length || 0,
        definitionId: instance.definitionId,
        effectId: instance.id
      },
      timestamp: Date.now(),
      effectId: instance.id,
      definitionId: instance.definitionId
    });
  }

  private recordCompatibilityCheck(definition: any, clip: TimelineClip, result: any): void {
    if (!result.compatible) {
      this.validationStats.clipTypeErrors.set(
        clip.type,
        (this.validationStats.clipTypeErrors.get(clip.type) || 0) + 1
      );

      effectRegistryTelemetryRegistry.recordEvent({
        type: 'effect_validation',
        severity: 'medium',
        operation: 'compatibility_check',
        data: {
          compatible: false,
          reason: result.reason,
          definitionId: definition.id,
          definitionType: definition.type,
          clipType: clip.type,
          clipId: clip.id
        },
        timestamp: Date.now(),
        definitionId: definition.id,
        clipId: clip.id
      });
    }
  }

  private recordError(error: string): void {
    const count = this.validationStats.commonErrors.get(error) || 0;
    this.validationStats.commonErrors.set(error, count + 1);
  }

  private recordWarning(warning: string): void {
    const count = this.validationStats.commonWarnings.get(warning) || 0;
    this.validationStats.commonWarnings.set(warning, count + 1);
  }

  getValidationStats(): {
    totalValidations: number;
    errorRate: number;
    warningRate: number;
    topErrors: Array<{ error: string; count: number }>;
    topWarnings: Array<{ warning: string; count: number }>;
    problematicEffectTypes: Array<{ type: string; errors: number }>;
    problematicClipTypes: Array<{ type: string; errors: number }>;
  } {
    const topErrors = Array.from(this.validationStats.commonErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    const topWarnings = Array.from(this.validationStats.commonWarnings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([warning, count]) => ({ warning, count }));

    const problematicEffectTypes = Array.from(this.validationStats.effectTypeErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, errors]) => ({ type, errors }));

    const problematicClipTypes = Array.from(this.validationStats.clipTypeErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, errors]) => ({ type, errors }));

    return {
      totalValidations: this.validationStats.totalValidations,
      errorRate: this.validationStats.totalValidations > 0
        ? (this.validationStats.validationErrors / this.validationStats.totalValidations) * 100
        : 0,
      warningRate: this.validationStats.totalValidations > 0
        ? (this.validationStats.validationWarnings / this.validationStats.totalValidations) * 100
        : 0,
      topErrors,
      topWarnings,
      problematicEffectTypes,
      problematicClipTypes
    };
  }
}

// Effect registry health monitor
export class EffectRegistryHealthMonitor {
  private domain: ReturnType<typeof getEffectRegistryDomainModel>;
  private operationMonitor: EffectOperationMonitor;
  private validationMonitor: EffectValidationMonitor;
  private healthChecks = new Map<string, { lastCheck: number; status: 'healthy' | 'degraded' | 'unhealthy' }>();

  constructor(domain: ReturnType<typeof getEffectRegistryDomainModel>) {
    this.domain = domain;
    this.operationMonitor = new EffectOperationMonitor(domain);
    this.validationMonitor = new EffectValidationMonitor(domain);
    this.initializeHealthMonitoring();
  }

  private initializeHealthMonitoring(): void {
    // Perform regular health checks
    setInterval(() => this.performHealthCheck(), 45000); // Every 45 seconds (staggered from timeline)
  }

  private async performHealthCheck(): Promise<void> {
    const issues: Array<{ check: string; status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> = [];

    // Check operation performance
    const performanceIssues = this.operationMonitor.detectPerformanceIssues();
    if (performanceIssues.length > 0) {
      issues.push({
        check: 'operation_performance',
        status: performanceIssues.some(i => i.severity === 'high') ? 'unhealthy' : 'degraded',
        details: performanceIssues
      });
    }

    // Check validation health
    const validationStats = this.validationMonitor.getValidationStats();
    if (validationStats.errorRate > 30) { // More than 30% validation errors
      issues.push({
        check: 'validation_health',
        status: 'degraded',
        details: validationStats
      });
    }

    // Check registry integrity
    const registryIssues = this.checkRegistryIntegrity();
    if (registryIssues.length > 0) {
      issues.push({
        check: 'registry_integrity',
        status: registryIssues.some(i => i.critical) ? 'unhealthy' : 'degraded',
        details: registryIssues
      });
    }

    // Update health status
    const overallStatus = issues.some(i => i.status === 'unhealthy') ? 'unhealthy' :
                         issues.some(i => i.status === 'degraded') ? 'degraded' : 'healthy';

    this.healthChecks.set('overall', {
      lastCheck: Date.now(),
      status: overallStatus
    });

    // Emit health event
    effectRegistryTelemetryRegistry.recordEvent({
      type: 'registry_performance',
      severity: overallStatus === 'healthy' ? 'low' : overallStatus === 'degraded' ? 'medium' : 'high',
      operation: 'health_check',
      data: {
        status: overallStatus,
        issues: issues.length,
        checksPerformed: issues.map(i => i.check)
      },
      timestamp: Date.now()
    });
  }

  private checkRegistryIntegrity(): Array<{ issue: string; violated: boolean; critical: boolean; details: any }> {
    const issues: Array<any> = [];
    const registryValidation = this.domain.validateRegistry();

    if (!registryValidation.valid) {
      registryValidation.issues.forEach(registryIssue => {
        issues.push({
          issue: `Registry validation: ${registryIssue.issue}`,
          violated: true,
          critical: true,
          details: registryIssue
        });
      });
    }

    // Check for reasonable registry size
    const allEffects = this.domain.getAllEffects();
    if (allEffects.length > 1000) {
      issues.push({
        issue: 'Registry size exceeds recommended limit',
        violated: true,
        critical: false,
        details: { currentSize: allEffects.length, recommendedMax: 1000 }
      });
    }

    return issues;
  }

  getHealthStatus(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, { lastCheck: number; status: 'healthy' | 'degraded' | 'unhealthy' }>;
    issues: any[];
  } {
    const issues = [
      ...this.operationMonitor.detectPerformanceIssues().map(i => ({ type: 'performance', ...i })),
      ...this.getValidationIssues()
    ];

    return {
      overall: this.healthChecks.get('overall')?.status || 'healthy',
      checks: Object.fromEntries(this.healthChecks.entries()),
      issues
    };
  }

  private getValidationIssues(): any[] {
    const validationStats = this.validationMonitor.getValidationStats();

    if (validationStats.errorRate > 50) {
      return [{
        type: 'validation',
        operation: 'validation_health',
        issue: 'Extremely high validation error rate',
        severity: 'critical',
        metric: validationStats
      }];
    }

    return [];
  }
}

// Main effect registry telemetry hooks manager
export class EffectRegistryTelemetryHooks {
  private operationMonitor: EffectOperationMonitor;
  private validationMonitor: EffectValidationMonitor;
  private healthMonitor: EffectRegistryHealthMonitor;
  private domain: ReturnType<typeof getEffectRegistryDomainModel>;

  constructor(domain: ReturnType<typeof getEffectRegistryDomainModel>) {
    this.domain = domain;
  }

  initializeAllHooks(): void {
    this.operationMonitor = new EffectOperationMonitor(this.domain);
    this.validationMonitor = new EffectValidationMonitor(this.domain);
    this.healthMonitor = new EffectRegistryHealthMonitor(this.domain);
  }

  getOperationMetrics(): any {
    return this.operationMonitor.getOperationMetrics();
  }

  getValidationStats(): any {
    return this.validationMonitor.getValidationStats();
  }

  getHealthStatus(): any {
    return this.healthMonitor.getHealthStatus();
  }

  getRecentEvents(count: number = 30): EffectRegistryTelemetryEvent[] {
    return effectRegistryTelemetryRegistry.getRecentEvents(count);
  }

  // Hook registration for external consumers
  onEffectOperation(callback: (event: EffectRegistryTelemetryEvent) => void): () => void {
    return effectRegistryTelemetryRegistry.registerHook('effect_operation', callback);
  }

  onEffectValidation(callback: (event: EffectRegistryTelemetryEvent) => void): () => void {
    return effectRegistryTelemetryRegistry.registerHook('effect_validation', callback);
  }

  onEffectError(callback: (event: EffectRegistryTelemetryEvent) => void): () => void {
    return effectRegistryTelemetryRegistry.registerHook('effect_error', callback);
  }

  onRegistryPerformance(callback: (event: EffectRegistryTelemetryEvent) => void): () => void {
    return effectRegistryTelemetryRegistry.registerHook('registry_performance', callback);
  }

  destroy(): void {
    // Cleanup will be handled by monitors
  }
}

// Global telemetry hooks instance
let globalEffectRegistryTelemetryHooks: EffectRegistryTelemetryHooks | null = null;

export function getEffectRegistryTelemetryHooks(domain?: ReturnType<typeof getEffectRegistryDomainModel>): EffectRegistryTelemetryHooks {
  if (!globalEffectRegistryTelemetryHooks) {
    if (!domain) {
      throw new Error('Domain required for first effect registry telemetry hooks initialization');
    }
    globalEffectRegistryTelemetryHooks = new EffectRegistryTelemetryHooks(domain);
    globalEffectRegistryTelemetryHooks.initializeAllHooks();
  }
  return globalEffectRegistryTelemetryHooks;
}

export function resetEffectRegistryTelemetryHooks(): void {
  globalEffectRegistryTelemetryHooks?.destroy();
  globalEffectRegistryTelemetryHooks = null;
  effectRegistryTelemetryRegistry.clearEvents();
}

// Export for testing
export { effectRegistryTelemetryRegistry };
