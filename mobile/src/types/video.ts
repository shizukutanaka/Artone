// React Native 版 Artone Video Editor - 型定義

export interface RNVideoClip {
  id: string;
  trackId: string;
  name: string;
  start: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  mediaUri?: string;
  type: 'video' | 'audio' | 'image' | 'text';
  effects: RNEffect[];
  transitions: RNTransition[];
  metadata?: Record<string, any>;
}

export interface RNTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  locked: boolean;
  muted: boolean;
  solo: boolean;
  height: number;
  order: number;
}

export interface RNEffect {
  id: string;
  type: string;
  params: Record<string, any>;
  enabled: boolean;
}

export interface RNTransition {
  id: string;
  type: 'fade' | 'dissolve' | 'wipe' | 'slide';
  duration: number;
  params: Record<string, any>;
}

export interface RNProject {
  id: string;
  name: string;
  tracks: RNTrack[];
  clips: RNVideoClip[];
  duration: number;
  frameRate: number;
  resolution: {
    width: number;
    height: number;
  };
  createdAt: Date;
  modifiedAt: Date;
}

export interface RNVideoStore {
  project: RNProject | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedClip: RNVideoClip | null;
  playhead: number;
  isPlaying: boolean;
  playbackRate: number;
  loopingEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  zoom: number;
  viewportStart: number;
  viewportEnd: number;
  rippleEditEnabled: boolean;

  // History management
  history: {
    past: any[];
    future: any[];
    limit: number;
  };
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  createProject: (name: string) => void;
  loadProject: (project: RNProject) => void;
  saveProject: () => RNProject | null;

  // Track operations
  addTrack: (type: 'video' | 'audio', name?: string) => void;
  removeTrack: (trackId: string) => void;
  reorderTracks: (trackId: string, newOrder: number) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;

  // Clip operations
  addClip: (clip: Omit<RNVideoClip, 'id'>) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<RNVideoClip>) => void;
  moveClip: (clipId: string, trackId: string, start: number) => void;
  trimClip: (clipId: string, side: 'left' | 'right', delta: number) => void;
  splitClip: (clipId: string, position: number) => void;
  selectClip: (clipId: string | null) => void;

  // Playback controls
  play: () => void;
  pause: () => void;
  playPause: () => void;
  seek: (time: number) => void;
  nudgePlayhead: (frames: number) => void;
  adjustPlaybackRate: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoopRegion: (start: number | null, end: number | null) => void;
  toggleLoop: () => void;

  // Viewport controls
  setZoom: (zoom: number) => void;
  setViewport: (start: number, end: number) => void;
  zoomToFit: () => void;
  toggleRippleEdit: () => void;

  // Effects and transitions
  addEffect: (clipId: string, effect: Omit<RNEffect, 'id'>) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  updateEffect: (clipId: string, effectId: string, params: Record<string, any>) => void;
  addTransition: (clipId: string, transition: Omit<RNTransition, 'id'>) => void;

  // Export
  exportProject: (settings: any) => Promise<void>;

  // History
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  setHistoryLimit: (limit: number) => void;
}
