/**
 * Timeline Event Handlers
 *
 * This module contains all event handling logic for the timeline component,
 * separated from the main component for better testability and modularity.
 */

import type {
  TimelineRenderContext,
  TimelineRenderState,
  TimelineEventHandlers,
  DragInfo,
  SnappingState
} from './types';
import { logTimelineInteraction } from '../../../utils/analytics';

export class TimelineEventHandler implements TimelineEventHandlers {
  private context: TimelineRenderContext;
  private state: TimelineRenderState;
  private updateState: (updates: Partial<TimelineRenderState>) => void;
  private storeActions: {
    seek: (time: number) => void;
    selectClip: (clipId: string) => void;
    moveClip: (clipId: string, trackId: string, start: number) => void;
    setZoom: (zoom: number, metadata?: any) => void;
    setViewport: (start: number, end: number) => void;
  };

  constructor(
    context: TimelineRenderContext,
    state: TimelineRenderState,
    updateState: (updates: Partial<TimelineRenderState>) => void,
    storeActions: any
  ) {
    this.context = context;
    this.state = state;
    this.updateState = updateState;
    this.storeActions = storeActions;
  }

  updateContext(context: TimelineRenderContext) {
    this.context = context;
  }

  updateStateReference(state: TimelineRenderState) {
    this.state = state;
  }

  onZoomIn = () => {
    const nextZoom = Math.min(this.context.zoom + 0.1, 4);
    this.storeActions.setZoom(nextZoom, {
      source: 'button',
      metadata: {
        control: 'zoom_in_button',
        previousZoom: this.context.zoom,
        nextZoom,
        timestamp: Date.now()
      }
    });
  };

  onZoomOut = () => {
    const nextZoom = Math.max(this.context.zoom - 0.1, 0.25);
    this.storeActions.setZoom(nextZoom, {
      source: 'button',
      metadata: {
        control: 'zoom_out_button',
        previousZoom: this.context.zoom,
        nextZoom,
        timestamp: Date.now()
      }
    });
  };

  onZoomChange = (value: number) => {
    const nextZoom = Math.min(Math.max(value, 0.25), 4);
    this.storeActions.setZoom(nextZoom, {
      source: 'slider',
      metadata: {
        control: 'zoom_slider',
        previousZoom: this.context.zoom,
        nextZoom,
        timestamp: Date.now()
      }
    });
  };

  onTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / this.context.pixelsPerSecond) + this.context.viewportStart;
    this.storeActions.seek(time);
  };

  onClipMouseDown = (e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();

    if (!this.context.project) return;

    this.storeActions.selectClip(clipId);

    const clip = this.context.project.clips.find(c => c.id === clipId);
    if (!clip) return;

    const dragInfo: DragInfo = {
      clipId,
      initialMouseX: e.clientX,
      initialClipStart: clip.start,
      initialTrackId: clip.trackId,
      clipDuration: clip.duration,
      startedAt: performance.now()
    };

    this.updateState({
      isDragging: true,
      dragInfo,
      snappingState: 'free'
    });

    logTimelineInteraction('clip_drag_start', {
      clipId,
      trackId: clip.trackId,
      start: clip.start,
      duration: clip.duration,
      rippleEnabled: false, // This will be passed from parent
      elapsedMs: 0,
      positionDelta: 0,
      pixelDelta: 0
    });
  };

  onClipKeyDown = (event: React.KeyboardEvent, clip: any) => {
    const { key } = event;
    if (key !== 'Enter' && key !== ' ') {
      return;
    }

    event.preventDefault();
    this.storeActions.selectClip(clip.id);

    logTimelineInteraction('clip_keyboard_select', {
      clipId: clip.id,
      trackId: clip.trackId,
      start: clip.start,
      duration: clip.duration,
      timestamp: Date.now()
    });
  };

  onWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    // This will be handled by the pipeline
  };

  onShortcutsToggle = () => {
    this.updateState({
      showShortcuts: !this.state.showShortcuts
    });
  };

  onShortcutCopy = () => {
    const shortcutList = [
      'Space: Toggle playback',
      'Ctrl/Cmd + S: Save project',
      'Ctrl/Cmd + E: Export project',
      'Ctrl/Cmd + Z: Undo',
      'Ctrl/Cmd + Shift + Z: Redo',
      'Ctrl/Cmd + =: Zoom in',
      'Ctrl/Cmd + -: Zoom out',
      'Ctrl/Cmd + 0: Zoom to fit',
      'Shift + Mouse Wheel: Zoom timeline around pointer',
      'Ctrl/Cmd + /: Toggle shortcut overlay',
      'Ctrl/Cmd + ]: Increase playback speed by 0.1x',
      'Ctrl/Cmd + [: Decrease playback speed by 0.1x',
      'Ctrl/Cmd + \\ : Reset playback speed to 1x',
      ', (Comma): Step backward one frame',
      '. (Period): Step forward one frame',
      'Home: Skip to timeline start',
      'End: Skip to timeline end',
      'L: Toggle loop playback',
      'Shift + I: Set loop start at playhead',
      'Shift + O: Set loop end at playhead'
    ];

    const reference = `Artone Timeline Shortcuts\n${shortcutList.join('\n')}`;

    this.updateState({ clipboardError: null });

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(reference).catch(() => {
        this.updateState({
          clipboardError: 'Clipboard access is restricted. Copy manually if needed.'
        });
      });
    }

    logTimelineInteraction('shortcuts_copy', {
      source: 'button',
      shortcutCount: shortcutList.length
    });
  };

  // Additional methods for drag handling
  handleMouseMove = (e: MouseEvent) => {
    if (!this.state.isDragging || !this.state.dragInfo || !this.context.project) return;

    const clip = this.context.project.clips.find(c => c.id === this.state.dragInfo!.clipId);
    if (!clip) return;

    const deltaX = e.clientX - this.state.dragInfo.initialMouseX;
    const deltaTime = deltaX / this.context.pixelsPerSecond;
    const rawStart = Math.max(0, this.state.dragInfo.initialClipStart + deltaTime);

    const snapEnabled = !e.shiftKey;
    const snapResult = this.calculateSnapPosition(rawStart, snapEnabled);

    const projectDuration = this.context.project.duration || 0;
    const maxStart = Math.max(0, projectDuration - this.state.dragInfo.clipDuration);
    const clampedStart = Math.min(snapResult.snappedStart, maxStart);

    const positionDelta = clampedStart - this.state.dragInfo.initialClipStart;
    const pixelDelta = deltaX;
    const elapsedMs = performance.now() - this.state.dragInfo.startedAt;

    const nextSnappingState: SnappingState = !snapEnabled ? 'free' : snapResult.snapped ? 'snapped' : 'free';

    this.updateState({ snappingState: nextSnappingState });

    // Log snapping state changes
    this.logSnappingStateChange(clip, nextSnappingState, elapsedMs, positionDelta, pixelDelta);

    // Find target track
    const targetTrackId = this.findTargetTrack(e.clientY);

    if (targetTrackId !== clip.trackId) {
      logTimelineInteraction('clip_track_change', {
        clipId: clip.id,
        previousTrackId: clip.trackId,
        trackId: targetTrackId,
        start: clampedStart,
        duration: clip.duration,
        elapsedMs,
        positionDelta,
        pixelDelta
      });
    }

    this.storeActions.moveClip(this.state.dragInfo.clipId, targetTrackId, clampedStart);
  };

  handleMouseUp = () => {
    if (!this.state.dragInfo) return;

    const finalClip = this.context.project?.clips.find(c => c.id === this.state.dragInfo!.clipId);

    if (finalClip) {
      const elapsedMs = performance.now() - this.state.dragInfo.startedAt;
      const positionDelta = finalClip.start - this.state.dragInfo.initialClipStart;
      const pixelDelta = positionDelta * this.context.pixelsPerSecond;

      logTimelineInteraction('clip_drag_end', {
        clipId: finalClip.id,
        trackId: finalClip.trackId,
        start: finalClip.start,
        duration: finalClip.duration,
        previousStart: this.state.dragInfo.initialClipStart,
        previousTrackId: this.state.dragInfo.initialTrackId,
        rippleEnabled: false, // Will be passed from parent
        elapsedMs,
        positionDelta,
        pixelDelta
      });
    }

    this.updateState({
      isDragging: false,
      dragInfo: null,
      snappingState: 'idle'
    });
  };

  private calculateSnapPosition(rawStart: number, snapEnabled: boolean) {
    if (!snapEnabled) {
      return { snappedStart: rawStart, snapped: false };
    }

    const candidate = Math.round(rawStart / 0.25) * 0.25;
    if (Math.abs(candidate - rawStart) <= 0.08) {
      return { snappedStart: candidate, snapped: true };
    }

    return { snappedStart: rawStart, snapped: false };
  }

  private findTargetTrack(clientY: number): string {
    if (!this.state.dragInfo) return '';

    const trackElements = document.querySelectorAll('[data-track-id]');
    let targetTrackId = this.state.dragInfo.initialTrackId;

    trackElements.forEach((elem) => {
      const rect = elem.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        targetTrackId = elem.getAttribute('data-track-id') || this.state.dragInfo!.initialTrackId;
      }
    });

    return targetTrackId;
  }

  private logSnappingStateChange(
    clip: any,
    nextSnappingState: SnappingState,
    elapsedMs: number,
    positionDelta: number,
    pixelDelta: number
  ) {
    logTimelineInteraction('clip_drag_mode_change', {
      clipId: clip.id,
      dragMode: nextSnappingState,
      snapInterval: 0.25,
      snapEnabled: nextSnappingState !== 'free',
      start: clip.start,
      rippleEnabled: false,
      elapsedMs,
      positionDelta,
      pixelDelta
    });

    if (nextSnappingState === 'snapped') {
      const now = Date.now();
      const key = `${clip.id}|${clip.start.toFixed(3)}`;

      logTimelineInteraction('clip_snap', {
        clipId: clip.id,
        start: clip.start,
        snapInterval: 0.25,
        snapOffset: 0, // Calculate if needed
        elapsedMs,
        positionDelta,
        pixelDelta
      });
    }
  }
}
