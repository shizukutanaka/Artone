import type { TimelineState, TimelineAction, HistoryState, TimelineClip, TimelineTrack } from '../types/timeline';

// Timeline core constants and utilities
export const HIGH_RESOLUTION_FRAME_RATE = 60;
export const STANDARD_FRAME_RATE = 30;
export const BASE_PIXELS_PER_SECOND = 80;
export const HIGH_RES_PIXELS_PER_SECOND = 120;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const RENDER_QUEUE_SIZE = 8;
export const MAX_CONCURRENT_RENDERS = 4;
export const RENDER_CHUNK_SIZE = 64;
export const CACHE_TTL_MS = 30000;
export const PRELOAD_FRAMES = 30;

export const DEFAULT_HISTORY_SKIP_TYPES = Object.freeze(
  new Set([
    'SET_PLAYHEAD',
    'PLAY',
    'PAUSE',
    'ADVANCE_PLAYHEAD',
    'NUDGE_PLAYHEAD',
    'SELECT_CLIP',
    'SET_ZOOM'
  ])
);

// Zoom analytics tracking
export interface ZoomAnalytics {
  zoomChanges: number;
  zoomLevels: number[];
  zoomDurations: number[];
  zoomFrictionPoints: Array<{
    fromZoom: number;
    toZoom: number;
    timestamp: number;
    context?: string;
  }>;
  lastZoomChange: number;
}

export const createZoomAnalytics = (): ZoomAnalytics => ({
  zoomChanges: 0,
  zoomLevels: [],
  zoomDurations: [],
  zoomFrictionPoints: [],
  lastZoomChange: Date.now()
});

export const trackZoomChange = (
  analytics: ZoomAnalytics,
  fromZoom: number,
  toZoom: number,
  context?: string
): void => {
  analytics.zoomChanges++;
  analytics.zoomLevels.push(toZoom);
  analytics.zoomFrictionPoints.push({
    fromZoom,
    toZoom,
    timestamp: Date.now(),
    context
  });
  analytics.lastZoomChange = Date.now();
};

export const getZoomFrictionScore = (analytics: ZoomAnalytics): number => {
  if (analytics.zoomFrictionPoints.length < 2) return 0;

  let frictionScore = 0;
  const points = analytics.zoomFrictionPoints;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // Calculate zoom direction changes (potential friction)
    const prevDirection = Math.sign(curr.toZoom - prev.fromZoom);
    const currDirection = Math.sign(curr.toZoom - curr.fromZoom);

    if (prevDirection !== currDirection) {
      frictionScore += 0.5; // Direction change indicates confusion
    }

    // Rapid zoom changes indicate frustration
    const timeDiff = curr.timestamp - prev.timestamp;
    if (timeDiff < 1000) { // Less than 1 second between changes
      frictionScore += 0.3;
    }

    // Extreme zoom levels might indicate difficulty
    if (curr.toZoom < MIN_ZOOM + 0.5 || curr.toZoom > MAX_ZOOM - 1) {
      frictionScore += 0.2;
    }
  }

  return Math.min(frictionScore, 10); // Cap at 10
};

export const SAMPLE_TRACKS: readonly TimelineTrack[] = [
  { id: 'track-video-1', name: 'Video 1', type: 'video', clips: [] },
  { id: 'track-audio-1', name: 'Audio 1', type: 'audio', clips: [] },
  { id: 'track-text-1', name: 'Title', type: 'text', clips: [] }
];

export const SAMPLE_CLIPS: readonly TimelineClip[] = [
  {
    id: 'clip-intro',
    trackId: 'track-video-1',
    name: 'Opening.mp4',
    type: 'video',
    start: 0,
    duration: 8,
    effects: [],
    properties: { color: '#2563eb' }
  },
  {
    id: 'clip-main',
    trackId: 'track-video-1',
    name: 'MainScene.mp4',
    type: 'video',
    start: 9,
    duration: 12,
    effects: [],
    properties: { color: '#0f766e' }
  }
];

// Clip snapping analytics
export interface ClipSnapAnalytics {
  snapAttempts: number;
  snapSuccesses: number;
  snapFailures: number;
  snapDistances: number[];
  snapFrictionPoints: Array<{
    attemptedPosition: number;
    snappedPosition: number;
    distance: number;
    timestamp: number;
    context?: string;
  }>;
  lastSnapAttempt: number;
}

export const createClipSnapAnalytics = (): ClipSnapAnalytics => ({
  snapAttempts: 0,
  snapSuccesses: 0,
  snapFailures: 0,
  snapDistances: [],
  snapFrictionPoints: [],
  lastSnapAttempt: Date.now()
});

export const trackClipSnapAttempt = (
  analytics: ClipSnapAnalytics,
  attemptedPosition: number,
  snappedPosition: number,
  tolerance: number,
  context?: string
): void => {
  analytics.snapAttempts++;
  const distance = Math.abs(snappedPosition - attemptedPosition);

  if (distance <= tolerance) {
    analytics.snapSuccesses++;
    analytics.snapDistances.push(distance);
  } else {
    analytics.snapFailures++;
  }

  analytics.snapFrictionPoints.push({
    attemptedPosition,
    snappedPosition,
    distance,
    timestamp: Date.now(),
    context
  });

  analytics.lastSnapAttempt = Date.now();
};

export const getClipSnapFrictionScore = (analytics: ClipSnapAnalytics): number => {
  if (analytics.snapAttempts === 0) return 0;

  const successRate = analytics.snapSuccesses / analytics.snapAttempts;
  const averageDistance = analytics.snapDistances.length > 0
    ? analytics.snapDistances.reduce((a, b) => a + b, 0) / analytics.snapDistances.length
    : 0;

  let frictionScore = 0;

  // Low success rate indicates frustration
  if (successRate < 0.7) {
    frictionScore += (1 - successRate) * 3;
  }

  // Large average snap distances indicate poor precision
  if (averageDistance > 0.1) { // More than 0.1 seconds average snap
    frictionScore += averageDistance * 5;
  }

  // Rapid failed attempts indicate user struggle
  const recentFailures = analytics.snapFrictionPoints
    .slice(-5)
    .filter(point => point.distance > 0.05); // Failed snaps

  if (recentFailures.length >= 3) {
    frictionScore += 1;
  }

  return Math.min(frictionScore, 10);
};

// Snap guides for accessibility
export const createSnapGuides = (clips: TimelineClip[], currentTime: number, tolerance: number = 0.1) => {
  const guides: Array<{ position: number; type: 'clip-start' | 'clip-end' | 'playhead'; label: string }> = [];

  // Add clip boundaries
  clips.forEach(clip => {
    guides.push({
      position: clip.start,
      type: 'clip-start',
      label: `Clip "${clip.name}" start`
    });
    guides.push({
      position: clip.start + clip.duration,
      type: 'clip-end',
      label: `Clip "${clip.name}" end`
    });
  });

  // Add playhead
  guides.push({
    position: currentTime,
    type: 'playhead',
    label: 'Playhead position'
  });

  return guides.filter(guide => Math.abs(guide.position - currentTime) <= tolerance);
};

export function roundToFrame(seconds: number): number {
  return Math.round(seconds * STANDARD_FRAME_RATE) / STANDARD_FRAME_RATE;
}

export function createInitialState(): TimelineState {
  return {
    clips: [...SAMPLE_CLIPS] as TimelineClip[],
    tracks: [...SAMPLE_TRACKS] as TimelineTrack[],
    selectedClipId: null,
    playhead: 0,
    duration: 300, // 5 minutes default
    zoom: 1.0,
    isPlaying: false,
    volume: 1.0,
    muted: false
  };
}

// Timeline reducer
export function timelineReducer(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case 'PLAY':
      return { ...state, isPlaying: true };

    case 'PAUSE':
      return { ...state, isPlaying: false };

    case 'SET_PLAYHEAD':
      return { ...state, playhead: Math.max(0, Math.min(action.seconds, state.duration)) };

    case 'ADVANCE_PLAYHEAD':
      return {
        ...state,
        playhead: Math.max(0, Math.min(state.playhead + action.delta, state.duration))
      };

    case 'NUDGE_PLAYHEAD':
      const frameDuration = 1 / STANDARD_FRAME_RATE;
      const newPlayhead = state.playhead + (action.deltaFrames * frameDuration);
      return {
        ...state,
        playhead: Math.max(0, Math.min(newPlayhead, state.duration))
      };

    case 'SET_ZOOM':
      return {
        ...state,
        zoom: Math.max(MIN_ZOOM, Math.min(action.value, MAX_ZOOM))
      };

    case 'ADD_CLIP':
      return {
        ...state,
        clips: [...state.clips, action.clip]
      };

    case 'REMOVE_CLIP':
      return {
        ...state,
        clips: state.clips.filter(clip => clip.id !== action.clipId),
        selectedClipId: state.selectedClipId === action.clipId ? null : state.selectedClipId
      };

    case 'UPDATE_CLIP':
      return {
        ...state,
        clips: state.clips.map(clip =>
          clip.id === action.clipId ? { ...clip, ...action.updates } : clip
        )
      };

    case 'SELECT_CLIP':
      return {
        ...state,
        selectedClipId: action.clipId
      };

    case 'SET_DURATION':
      return {
        ...state,
        duration: Math.max(0, action.duration)
      };

    default:
      return state;
  }
}

// History reducer factory
export function createHistoryReducer(
  stateReducer: (state: TimelineState, action: TimelineAction) => TimelineState,
  options: { maxHistory: number; skipTypes: string[] }
) {
  const { maxHistory, skipTypes } = options;

  return function historyReducer(
    state: HistoryState,
    action: TimelineAction
  ): HistoryState {
    const currentState = state.present;
    const newState = stateReducer(currentState, action);

    // Skip history for certain action types
    if (skipTypes.includes(action.type)) {
      return { ...state, present: newState };
    }

    // Don't add to history if state hasn't changed
    if (newState === currentState) {
      return state;
    }

    return {
      past: [...state.past, currentState].slice(-maxHistory),
      present: newState,
      future: []
    };
  };
}

// Timeline components
export const TimelineComponents = {
  // Placeholder for timeline viewport component
  TimelineViewport: ({ state, dispatch, onVirtualizationMetrics, onVisibleClips, waveforms }: any) => {
    // This would be implemented as a React component
    return null;
  }
};
