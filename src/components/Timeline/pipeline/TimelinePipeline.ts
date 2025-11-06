/**
 * Timeline Rendering Pipeline Implementation
 *
 * This module implements the core timeline rendering pipeline logic,
 * separating rendering calculations from UI components for better modularity.
 */

import type {
  TimelineRenderContext,
  TimelineRenderResult,
  TimelineRenderConfig,
  TimelinePipeline
} from './types';

export class TimelineRenderingPipeline implements TimelinePipeline {
  private config: TimelineRenderConfig;

  constructor(config: TimelineRenderConfig) {
    this.config = config;
  }

  calculateLayout(context: TimelineRenderContext): TimelineRenderResult {
    if (!context.project) {
      return {
        timelineWidth: 1000,
        tracks: [],
        playheadPosition: 0
      };
    }

    const timelineWidth = Math.max(
      context.project.duration * context.pixelsPerSecond,
      1000
    );

    const tracks = context.project.tracks.map(track => ({
      id: track.id,
      height: track.height,
      clips: context.project!.clips
        .filter(clip => clip.trackId === track.id)
        .map(clip => ({
          id: clip.id,
          start: clip.start,
          duration: clip.duration,
          trackId: clip.trackId
        }))
    }));

    const playheadPosition = context.playhead * context.pixelsPerSecond;

    return {
      timelineWidth,
      tracks,
      playheadPosition
    };
  }

  clampZoomLevel(value: number): number {
    if (!Number.isFinite(value)) {
      return this.config.minZoomLevel;
    }
    return Math.min(
      Math.max(value, this.config.minZoomLevel),
      this.config.maxZoomLevel
    );
  }

  calculateSnapPosition(
    rawStart: number,
    snapEnabled: boolean,
    snapInterval: number = this.config.snapInterval,
    snapThreshold: number = this.config.snapThreshold
  ): { snappedStart: number; snapped: boolean } {
    if (!snapEnabled) {
      return { snappedStart: rawStart, snapped: false };
    }

    const candidate = Math.round(rawStart / snapInterval) * snapInterval;
    if (Math.abs(candidate - rawStart) <= snapThreshold) {
      return { snappedStart: candidate, snapped: true };
    }

    return { snappedStart: rawStart, snapped: false };
  }

  calculateViewportFromScroll(
    scrollLeft: number,
    clientWidth: number,
    pixelsPerSecond: number,
    projectDuration: number
  ): { start: number; end: number } {
    const newStart = scrollLeft / pixelsPerSecond;
    const newEnd = (scrollLeft + clientWidth) / pixelsPerSecond;

    return {
      start: newStart,
      end: Math.min(newEnd, projectDuration)
    };
  }

  processWheelZoom(
    event: React.WheelEvent<HTMLDivElement>,
    context: TimelineRenderContext,
    contentRect: DOMRect
  ): {
    nextZoom: number;
    nextViewportStart: number;
    nextViewportEnd: number;
    nextScrollLeft: number;
  } | null {
    if (!event.shiftKey) {
      return null;
    }

    const deltaInput = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (!deltaInput) {
      return null;
    }

    event.preventDefault();

    const pointerOffsetX = event.clientX - contentRect.left;
    const currentScrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const anchorTime = (currentScrollLeft + pointerOffsetX) / context.pixelsPerSecond;

    const zoomFactor = Math.exp(-deltaInput * this.config.zoomWheelSensitivity);
    const nextZoom = this.clampZoomLevel(context.zoom * zoomFactor);

    if (Math.abs(nextZoom - context.zoom) < 0.0001) {
      return null;
    }

    const nextPixelsPerSecond = 100 * nextZoom;
    const nextScrollLeft = Math.max(anchorTime * nextPixelsPerSecond - pointerOffsetX, 0);

    const visibleDuration = contentRect.width / nextPixelsPerSecond;
    const nextViewportStart = nextScrollLeft / nextPixelsPerSecond;
    const nextViewportEnd = nextViewportStart + visibleDuration;

    return {
      nextZoom,
      nextViewportStart,
      nextViewportEnd,
      nextScrollLeft
    };
  }
}

// Default configuration for the timeline rendering pipeline
export const DEFAULT_TIMELINE_CONFIG: TimelineRenderConfig = {
  minZoomLevel: 0.25,
  maxZoomLevel: 4,
  zoomWheelSensitivity: 0.002,
  snapInterval: 0.25,
  snapThreshold: 0.08,
  snapLogIntervalMs: 200
};

// Factory function to create a configured timeline pipeline
export function createTimelinePipeline(config: Partial<TimelineRenderConfig> = {}): TimelinePipeline {
  return new TimelineRenderingPipeline({
    ...DEFAULT_TIMELINE_CONFIG,
    ...config
  });
}
