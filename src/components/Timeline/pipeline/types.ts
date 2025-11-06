/**
 * Timeline Rendering Pipeline - Core Interfaces and Types
 *
 * This module defines the core interfaces and types for the timeline rendering pipeline.
 * It provides the foundation for modular timeline rendering with clear boundaries.
 */

export interface TimelineRenderContext {
  project: import('../../store/videoStore').Project | null;
  playhead: number;
  zoom: number;
  viewportStart: number;
  viewportEnd: number;
  pixelsPerSecond: number;
  selectedClipId: string | null;
}

export interface TimelineRenderState {
  isDragging: boolean;
  dragInfo: DragInfo | null;
  snappingState: SnappingState;
  showShortcuts: boolean;
  clipboardError: string | null;
}

export interface TimelineRenderConfig {
  minZoomLevel: number;
  maxZoomLevel: number;
  zoomWheelSensitivity: number;
  snapInterval: number;
  snapThreshold: number;
  snapLogIntervalMs: number;
}

export interface DragInfo {
  clipId: string;
  initialMouseX: number;
  initialClipStart: number;
  initialTrackId: string;
  clipDuration: number;
  startedAt: number;
}

export type SnappingState = 'idle' | 'snapped' | 'free';

export interface TimelineRenderResult {
  timelineWidth: number;
  tracks: Array<{
    id: string;
    height: number;
    clips: Array<{
      id: string;
      start: number;
      duration: number;
      trackId: string;
    }>;
  }>;
  playheadPosition: number;
}

export interface TimelineEventHandlers {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomChange: (value: number) => void;
  onTimelineClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClipMouseDown: (event: React.MouseEvent, clipId: string) => void;
  onClipKeyDown: (event: React.KeyboardEvent, clip: import('../../store/videoStore').Clip) => void;
  onWheelZoom: (event: React.WheelEvent<HTMLDivElement>) => void;
  onShortcutsToggle: () => void;
  onShortcutCopy: () => void;
}

export interface TimelinePipeline {
  /**
   * Calculate rendering dimensions and layout
   */
  calculateLayout(context: TimelineRenderContext): TimelineRenderResult;

  /**
   * Process zoom level clamping and validation
   */
  clampZoomLevel(value: number): number;

  /**
   * Handle snapping logic for clip positioning
   */
  calculateSnapPosition(
    rawStart: number,
    snapEnabled: boolean,
    snapInterval: number,
    snapThreshold: number
  ): { snappedStart: number; snapped: boolean };

  /**
   * Calculate viewport bounds from scroll position
   */
  calculateViewportFromScroll(
    scrollLeft: number,
    clientWidth: number,
    pixelsPerSecond: number,
    projectDuration: number
  ): { start: number; end: number };

  /**
   * Process wheel zoom with pointer anchoring
   */
  processWheelZoom(
    event: React.WheelEvent<HTMLDivElement>,
    context: TimelineRenderContext,
    contentRect: DOMRect
  ): {
    nextZoom: number;
    nextViewportStart: number;
    nextViewportEnd: number;
    nextScrollLeft: number;
  } | null;
}
