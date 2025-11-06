/**
 * Timeline Rendering Pipeline - Modular Architecture
 * Implements the timeline drawing pipeline as independent, testable modules
 */

import type { TimelineState, TimelineClip, TimelineTrack } from '../types/timeline';

// Pipeline phases
export enum PipelinePhase {
  VIEWPORT_CALCULATION = 'viewport_calculation',
  CLIP_FILTERING = 'clip_filtering',
  RENDER_PREPARATION = 'render_preparation',
  DOM_UPDATE = 'dom_update',
  CLEANUP = 'cleanup'
}

// Pipeline metrics
export interface PipelineMetrics {
  phase: PipelinePhase;
  duration: number;
  clipsProcessed: number;
  memoryUsage?: number;
  renderTime?: number;
  timestamp: number;
}

// Invariants for the timeline rendering pipeline
export const TIMELINE_INVARIANTS = {
  // Viewport invariants
  VIEWPORT_MIN_WIDTH: 100,
  VIEWPORT_MAX_ZOOM: 4.0,
  VIEWPORT_MIN_ZOOM: 0.5,

  // Clip rendering invariants
  CLIP_MIN_WIDTH: 4,
  CLIP_MAX_OVERLAP: 0.1, // Maximum allowed overlap ratio

  // Performance invariants
  MAX_RENDER_TIME: 16, // 60fps budget
  MAX_CLIPS_PER_FRAME: 1000,

  // Memory invariants
  MAX_MEMORY_USAGE_MB: 50,
  CACHE_TTL_MS: 30000
} as const;

// Viewport calculation module
export class ViewportManager {
  private lastViewport: { start: number; end: number } | null = null;

  calculateViewport(
    duration: number,
    zoom: number,
    scrollLeft: number,
    containerWidth: number
  ): { start: number; end: number; changed: boolean } {
    const pixelsPerSecond = 80 * zoom; // BASE_PIXELS_PER_SECOND
    const start = Math.max(0, scrollLeft / pixelsPerSecond);
    const widthSeconds = containerWidth / pixelsPerSecond;
    const end = Math.min(duration, start + widthSeconds);

    const newViewport = { start, end };
    const changed = !this.lastViewport ||
      Math.abs(this.lastViewport.start - start) > 0.01 ||
      Math.abs(this.lastViewport.end - end) > 0.01;

    if (changed) {
      this.lastViewport = newViewport;
    }

    return { ...newViewport, changed };
  }

  isViewportValid(start: number, end: number, duration: number): boolean {
    return start >= 0 &&
           end > start &&
           end <= duration &&
           (end - start) >= TIMELINE_INVARIANTS.VIEWPORT_MIN_WIDTH / 80; // pixels to seconds
  }
}

// Clip filtering and virtualization module
export class ClipVirtualizer {
  private cache = new Map<string, { data: any; timestamp: number }>();

  virtualizeClips(
    allClips: TimelineClip[],
    viewport: { start: number; end: number },
    pixelsPerSecond: number
  ): {
    visibleClips: TimelineClip[];
    offscreenClips: TimelineClip[];
    clipsByTrack: Record<string, TimelineClip[]>;
    metrics: { totalClips: number; visibleCount: number; filteredCount: number };
  } {
    const cacheKey = `${viewport.start}-${viewport.end}-${pixelsPerSecond}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < TIMELINE_INVARIANTS.CACHE_TTL_MS) {
      return cached.data;
    }

    // Filter clips that are visible in viewport (with padding)
    const padding = Math.max(1, (viewport.end - viewport.start) * 0.1); // 10% padding
    const visibleStart = Math.max(0, viewport.start - padding);
    const visibleEnd = Math.min(allClips[0]?.trackId ? 999999 : viewport.end + padding, viewport.end + padding);

    const visibleClips = allClips.filter(clip => {
      const clipEnd = clip.start + clip.duration;
      return clipEnd > visibleStart && clip.start < visibleEnd;
    });

    // Group by track
    const clipsByTrack: Record<string, TimelineClip[]> = {};
    visibleClips.forEach(clip => {
      if (!clipsByTrack[clip.trackId]) {
        clipsByTrack[clip.trackId] = [];
      }
      clipsByTrack[clip.trackId].push(clip);
    });

    const offscreenClips = allClips.filter(clip => !visibleClips.includes(clip));

    const result = {
      visibleClips,
      offscreenClips,
      clipsByTrack,
      metrics: {
        totalClips: allClips.length,
        visibleCount: visibleClips.length,
        filteredCount: allClips.length - visibleClips.length
      }
    };

    // Cache result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    // Cleanup old cache entries
    if (this.cache.size > 10) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      this.cache = new Map(entries.slice(0, 5));
    }

    return result;
  }

  validateClipData(clips: TimelineClip[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    clips.forEach((clip, index) => {
      if (!clip.id) errors.push(`Clip ${index}: missing id`);
      if (!clip.trackId) errors.push(`Clip ${index}: missing trackId`);
      if (typeof clip.start !== 'number' || clip.start < 0) {
        errors.push(`Clip ${index}: invalid start time`);
      }
      if (typeof clip.duration !== 'number' || clip.duration <= 0) {
        errors.push(`Clip ${index}: invalid duration`);
      }
      if (clip.start + clip.duration < clip.start) {
        errors.push(`Clip ${index}: end time before start time`);
      }
    });

    return { valid: errors.length === 0, errors };
  }
}

// Render preparation module
export class RenderPreparer {
  prepareClipStyles(
    clip: TimelineClip,
    pixelsPerSecond: number,
    viewportStart: number
  ): {
    left: number;
    width: number;
    backgroundColor: string;
    zIndex: number;
  } {
    const left = (clip.start - viewportStart) * pixelsPerSecond;
    const width = Math.max(TIMELINE_INVARIANTS.CLIP_MIN_WIDTH, clip.duration * pixelsPerSecond);

    // Ensure clips don't overlap too much
    const maxWidth = clip.duration * pixelsPerSecond;
    const clampedWidth = Math.min(width, maxWidth * (1 + TIMELINE_INVARIANTS.CLIP_MAX_OVERLAP));

    return {
      left,
      width: clampedWidth,
      backgroundColor: clip.properties?.color || '#2563eb',
      zIndex: clip.properties?.zIndex || 1
    };
  }

  prepareTrackStyles(track: TimelineTrack): {
    height: number;
    background: string;
  } {
    const height = track.height || 60;
    const background = track.type === 'audio'
      ? 'linear-gradient(to right, rgba(34, 197, 94, 0.1) 1px, transparent 1px)'
      : 'linear-gradient(to right, rgba(59, 130, 246, 0.1) 1px, transparent 1px)';

    return { height, background };
  }

  validateRenderData(
    clips: TimelineClip[],
    tracks: TimelineTrack[],
    pixelsPerSecond: number
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (pixelsPerSecond < 1) {
      warnings.push('Very low zoom level may cause rendering issues');
    }

    if (clips.length > TIMELINE_INVARIANTS.MAX_CLIPS_PER_FRAME) {
      warnings.push(`High clip count (${clips.length}) may impact performance`);
    }

    const totalDuration = Math.max(...clips.map(c => c.start + c.duration));
    if (totalDuration > 3600) { // 1 hour
      warnings.push('Very long timeline may cause memory issues');
    }

    return { valid: warnings.length === 0, warnings };
  }
}

// DOM update module
export class DOMUpdater {
  private renderQueue: Array<() => void> = [];
  private isRendering = false;

  queueUpdate(updateFn: () => void): void {
    this.renderQueue.push(updateFn);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isRendering || this.renderQueue.length === 0) return;

    this.isRendering = true;

    const startTime = performance.now();

    try {
      // Process updates in batches
      const batchSize = 10;
      while (this.renderQueue.length > 0 && performance.now() - startTime < TIMELINE_INVARIANTS.MAX_RENDER_TIME) {
        const batch = this.renderQueue.splice(0, batchSize);
        await new Promise(resolve => {
          requestAnimationFrame(() => {
            batch.forEach(fn => fn());
            resolve(void 0);
          });
        });
      }
    } finally {
      this.isRendering = false;

      // Continue processing if more updates queued
      if (this.renderQueue.length > 0) {
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }

  validateDOMUpdate(element: HTMLElement, styles: any): boolean {
    try {
      // Check if element still exists
      if (!element.isConnected) return false;

      // Validate style properties
      for (const [key, value] of Object.entries(styles)) {
        if (typeof value === 'number' && !isFinite(value)) {
          console.warn(`Invalid style value for ${key}: ${value}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('DOM validation failed:', error);
      return false;
    }
  }
}

// Telemetry and monitoring module
export class TimelineTelemetry {
  private metrics: PipelineMetrics[] = [];
  private readonly maxMetrics = 100;
  private observers = new Set<(metrics: PipelineMetrics) => void>();

  recordMetric(phase: PipelinePhase, duration: number, clipsProcessed: number, additionalData?: any): void {
    const metric: PipelineMetrics = {
      phase,
      duration,
      clipsProcessed,
      timestamp: Date.now(),
      ...additionalData
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Notify observers
    this.observers.forEach(observer => {
      try {
        observer(metric);
      } catch (error) {
        console.error('Telemetry observer failed:', error);
      }
    });
  }

  subscribe(observer: (metrics: PipelineMetrics) => void): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  getMetrics(timeRange?: { start: number; end: number }): PipelineMetrics[] {
    if (!timeRange) return [...this.metrics];

    return this.metrics.filter(m =>
      m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }

  getAverageDuration(phase: PipelinePhase, timeRange?: { start: number; end: number }): number {
    const relevantMetrics = this.getMetrics(timeRange).filter(m => m.phase === phase);
    if (relevantMetrics.length === 0) return 0;

    const total = relevantMetrics.reduce((sum, m) => sum + m.duration, 0);
    return total / relevantMetrics.length;
  }

  detectPerformanceIssues(): Array<{ issue: string; severity: 'low' | 'medium' | 'high'; metric: PipelineMetrics }> {
    const issues: Array<{ issue: string; severity: 'low' | 'medium' | 'high'; metric: PipelineMetrics }> = [];

    this.metrics.forEach(metric => {
      if (metric.duration > TIMELINE_INVARIANTS.MAX_RENDER_TIME) {
        issues.push({
          issue: `Slow ${metric.phase} phase`,
          severity: metric.duration > TIMELINE_INVARIANTS.MAX_RENDER_TIME * 2 ? 'high' : 'medium',
          metric
        });
      }

      if (metric.memoryUsage && metric.memoryUsage > TIMELINE_INVARIANTS.MAX_MEMORY_USAGE_MB * 1024 * 1024) {
        issues.push({
          issue: 'High memory usage',
          severity: 'high',
          metric
        });
      }
    });

    return issues;
  }
}

// Main pipeline orchestrator
export class TimelineRenderingPipeline {
  private viewportManager: ViewportManager;
  private clipVirtualizer: ClipVirtualizer;
  private renderPreparer: RenderPreparer;
  private domUpdater: DOMUpdater;
  private telemetry: TimelineTelemetry;

  constructor() {
    this.viewportManager = new ViewportManager();
    this.clipVirtualizer = new ClipVirtualizer();
    this.renderPreparer = new RenderPreparer();
    this.domUpdater = new DOMUpdater();
    this.telemetry = new TimelineTelemetry();
  }

  // Main rendering method
  async render(
    state: TimelineState,
    viewportElement: HTMLElement,
    options: {
      onMetrics?: (metrics: PipelineMetrics) => void;
      onValidationError?: (errors: string[]) => void;
    } = {}
  ): Promise<{
    success: boolean;
    metrics: PipelineMetrics[];
    warnings: string[];
  }> {
    const pipelineStart = performance.now();
    const warnings: string[] = [];

    try {
      // Phase 1: Viewport calculation
      const viewportStart = performance.now();
      const viewport = this.viewportManager.calculateViewport(
        state.duration,
        state.zoom,
        viewportElement.scrollLeft,
        viewportElement.clientWidth
      );

      if (!this.viewportManager.isViewportValid(viewport.start, viewport.end, state.duration)) {
        throw new Error('Invalid viewport parameters');
      }

      this.telemetry.recordMetric(
        PipelinePhase.VIEWPORT_CALCULATION,
        performance.now() - viewportStart,
        state.clips.length
      );

      // Phase 2: Clip filtering
      const filterStart = performance.now();
      const virtualized = this.clipVirtualizer.virtualizeClips(
        state.clips,
        viewport,
        80 * state.zoom // BASE_PIXELS_PER_SECOND
      );

      // Validate clip data
      const validation = this.clipVirtualizer.validateClipData(state.clips);
      if (!validation.valid) {
        if (options.onValidationError) {
          options.onValidationError(validation.errors);
        }
        warnings.push(...validation.errors);
      }

      this.telemetry.recordMetric(
        PipelinePhase.CLIP_FILTERING,
        performance.now() - filterStart,
        virtualized.metrics.totalClips,
        { visibleCount: virtualized.metrics.visibleCount }
      );

      // Phase 3: Render preparation
      const prepareStart = performance.now();
      const pixelsPerSecond = 80 * state.zoom;

      // Validate render data
      const renderValidation = this.renderPreparer.validateRenderData(
        virtualized.visibleClips,
        state.tracks,
        pixelsPerSecond
      );
      warnings.push(...renderValidation.warnings);

      // Prepare clip styles
      const clipStyles = virtualized.visibleClips.map(clip =>
        this.renderPreparer.prepareClipStyles(clip, pixelsPerSecond, viewport.start)
      );

      // Prepare track styles
      const trackStyles = state.tracks.map(track =>
        this.renderPreparer.prepareTrackStyles(track)
      );

      this.telemetry.recordMetric(
        PipelinePhase.RENDER_PREPARATION,
        performance.now() - prepareStart,
        virtualized.visibleClips.length
      );

      // Phase 4: DOM update (queued)
      const updateStart = performance.now();

      this.domUpdater.queueUpdate(() => {
        // Update DOM elements
        this.updateDOMElements(viewportElement, virtualized, clipStyles, trackStyles, state);
      });

      this.telemetry.recordMetric(
        PipelinePhase.DOM_UPDATE,
        performance.now() - updateStart,
        virtualized.visibleClips.length
      );

      // Phase 5: Cleanup
      this.telemetry.recordMetric(
        PipelinePhase.CLEANUP,
        0, // Cleanup is async
        0
      );

      const totalDuration = performance.now() - pipelineStart;

      // Subscribe to metrics if callback provided
      if (options.onMetrics) {
        this.telemetry.subscribe(options.onMetrics);
      }

      return {
        success: true,
        metrics: this.telemetry.getMetrics(),
        warnings
      };

    } catch (error) {
      console.error('Timeline rendering pipeline failed:', error);

      this.telemetry.recordMetric(
        PipelinePhase.CLEANUP,
        performance.now() - pipelineStart,
        0,
        { error: error.message }
      );

      return {
        success: false,
        metrics: this.telemetry.getMetrics(),
        warnings: [...warnings, error.message]
      };
    }
  }

  private updateDOMElements(
    container: HTMLElement,
    virtualized: any,
    clipStyles: any[],
    trackStyles: any[],
    state: TimelineState
  ): void {
    // This would update the actual DOM elements
    // Implementation depends on the specific rendering framework
    console.log('Updating DOM elements:', {
      visibleClips: virtualized.visibleClips.length,
      tracks: state.tracks.length
    });
  }

  // Public API for telemetry
  getTelemetry(): TimelineTelemetry {
    return this.telemetry;
  }

  getViewportManager(): ViewportManager {
    return this.viewportManager;
  }

  getClipVirtualizer(): ClipVirtualizer {
    return this.clipVirtualizer;
  }

  getRenderPreparer(): RenderPreparer {
    return this.renderPreparer;
  }
}

// Singleton instance
let timelinePipeline: TimelineRenderingPipeline | null = null;

export function getTimelinePipeline(): TimelineRenderingPipeline {
  if (!timelinePipeline) {
    timelinePipeline = new TimelineRenderingPipeline();
  }
  return timelinePipeline;
}

export function resetTimelinePipeline(): void {
  timelinePipeline = null;
}

// Export all modules for testing
export {
  type PipelineMetrics,
  PipelinePhase,
  TIMELINE_INVARIANTS
};
