import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import type { RNProject, RNVideoClip, RNTrack, RNEffect, RNTransition, RNVideoStore } from '../types/video';

const HISTORY_LIMIT_DEFAULT = 50;
const HISTORY_LIMIT_MIN = 1;

function clampTime(value: number, maxDuration: number): number {
  const upper = Number.isFinite(maxDuration) ? maxDuration : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(0, value), upper);
}

function clampZoom(value: number): number {
  return Math.max(0.25, Math.min(4, Number.isFinite(value) ? value : 1));
}

export const useVideoStore = create<RNVideoStore>()(
  immer((set, get) => ({
    project: null,
    selectedClipId: null,
    selectedTrackId: null,
    selectedClip: null,
    playhead: 0,
    isPlaying: false,
    playbackRate: 1,
    loopingEnabled: false,
    loopStart: null,
    loopEnd: null,
    zoom: 1,
    viewportStart: 0,
    viewportEnd: 30,
    rippleEditEnabled: false,

    history: {
      past: [],
      future: [],
      limit: HISTORY_LIMIT_DEFAULT,
    },
    canUndo: false,
    canRedo: false,

    createProject: (name: string) =>
      set((state) => {
        const timestamp = new Date();
        const tracks: RNTrack[] = [
          { id: uuidv4(), name: 'Video 1', type: 'video', locked: false, muted: false, solo: false, height: 120, order: 0 },
          { id: uuidv4(), name: 'Video 2', type: 'video', locked: false, muted: false, solo: false, height: 120, order: 1 },
          { id: uuidv4(), name: 'Audio 1', type: 'audio', locked: false, muted: false, solo: false, height: 80, order: 2 },
          { id: uuidv4(), name: 'Audio 2', type: 'audio', locked: false, muted: false, solo: false, height: 80, order: 3 }
        ];

        state.project = {
          id: uuidv4(),
          name,
          tracks,
          clips: [],
          duration: 0,
          frameRate: 30,
          resolution: { width: 1920, height: 1080 },
          createdAt: timestamp,
          modifiedAt: timestamp
        };

        state.playbackRate = 1;
        state.playhead = 0;
        state.isPlaying = false;
        state.loopingEnabled = false;
        state.loopStart = null;
        state.loopEnd = null;
        state.zoom = 1;
        state.viewportStart = 0;
        state.viewportEnd = 30;
        state.rippleEditEnabled = false;
        state.selectedClipId = null;
        state.selectedClip = null;
        state.selectedTrackId = null;
        state.canUndo = false;
        state.canRedo = false;
        state.history.past = [];
        state.history.future = [];
        state.history.limit = HISTORY_LIMIT_DEFAULT;
      }),

    loadProject: (project: RNProject) =>
      set((state) => {
        state.project = project;
        state.selectedClipId = null;
        state.selectedTrackId = null;
        state.playhead = 0;
        state.isPlaying = false;
        state.playbackRate = 1;
        state.canUndo = false;
        state.canRedo = false;
      }),

    saveProject: (): RNProject | null => {
      const state = get();
      if (!state.project) return null;

      const projectData = {
        ...state.project,
        modifiedAt: new Date()
      };

      return projectData;
    },

    addTrack: (type: 'video' | 'audio', name?: string) =>
      set((state) => {
        if (!state.project) return;

        const trackCount = state.project.tracks.filter(t => t.type === type).length;
        const newTrack: RNTrack = {
          id: uuidv4(),
          name: name || `${type === 'video' ? 'Video' : 'Audio'} ${trackCount + 1}`,
          type,
          locked: false,
          muted: false,
          solo: false,
          height: type === 'video' ? 120 : 80,
          order: state.project.tracks.length
        };

        state.project.tracks.push(newTrack);
      }),

    removeTrack: (trackId: string) =>
      set((state) => {
        if (!state.project) return;

        state.project.tracks = state.project.tracks.filter(track => track.id !== trackId);
        state.project.clips = state.project.clips.filter(clip => clip.trackId !== trackId);

        if (state.selectedTrackId === trackId) {
          state.selectedTrackId = null;
          state.selectedClipId = null;
          state.selectedClip = null;
        }

        state.project.tracks.forEach((track, index) => {
          track.order = index;
        });
      }),

    addClip: (clipData: Omit<RNVideoClip, 'id'>) =>
      set((state) => {
        if (!state.project) return;

        const clip: RNVideoClip = {
          ...clipData,
          id: uuidv4(),
          effects: clipData.effects || [],
          transitions: clipData.transitions || []
        };

        state.project.clips.push(clip);

        const clipEnd = clip.start + clip.duration;
        if (clipEnd > state.project.duration) {
          state.project.duration = clipEnd;
        }

        if (state.selectedClipId !== clip.id) {
          state.selectedClipId = clip.id;
          state.selectedClip = clip;
          state.selectedTrackId = clip.trackId;
        }
      }),

    selectClip: (clipId: string | null) =>
      set((state) => {
        state.selectedClipId = clipId;

        if (!clipId || !state.project) {
          state.selectedClip = null;
          state.selectedTrackId = null;
          return;
        }

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          state.selectedClip = clip;
          state.selectedTrackId = clip.trackId;
        } else {
          state.selectedClip = null;
          state.selectedClipId = null;
          state.selectedTrackId = null;
        }
      }),

    play: () =>
      set((state) => {
        state.isPlaying = true;
      }),

    pause: () =>
      set((state) => {
        state.isPlaying = false;
      }),

    playPause: () =>
      set((state) => {
        state.isPlaying = !state.isPlaying;
      }),

    seek: (time: number) =>
      set((state) => {
        const duration = state.project?.duration ?? Number.POSITIVE_INFINITY;
        state.playhead = clampTime(time, duration);

        if (state.project && state.playhead >= state.project.duration) {
          state.isPlaying = false;
        }
      }),

    nudgePlayhead: (frames: number) => {
      const state = get();
      const frameRate = state.project?.frameRate ?? 30;
      const seconds = frames / frameRate;
      state.seek(state.playhead + seconds);
    },

    setPlaybackRate: (rate: number) =>
      set((state) => {
        state.playbackRate = Math.max(0.25, Math.min(4, rate));
      }),

    adjustPlaybackRate: (delta: number) =>
      set((state) => {
        const current = state.playbackRate;
        state.playbackRate = Math.max(0.25, Math.min(4, Number((current + delta).toFixed(2))));
      }),

    setLoopRegion: (start: number | null, end: number | null) =>
      set((state) => {
        const duration = state.project?.duration ?? Number.POSITIVE_INFINITY;
        state.loopStart = start === null ? null : clampTime(start, duration);
        state.loopEnd = end === null ? null : clampTime(end, duration);

        if (state.loopingEnabled && state.loopStart !== null && state.loopEnd !== null && state.loopStart >= state.loopEnd) {
          state.loopingEnabled = false;
        }
      }),

    toggleLoop: () =>
      set((state) => {
        const duration = state.project?.duration ?? Number.POSITIVE_INFINITY;
        const normalizedStart = state.loopStart === null ? null : clampTime(state.loopStart, duration);
        const normalizedEnd = state.loopEnd === null ? null : clampTime(state.loopEnd, duration);

        const validRegion = normalizedStart !== null && normalizedEnd !== null && normalizedEnd > normalizedStart;

        state.loopStart = normalizedStart;
        state.loopEnd = normalizedEnd;
        state.loopingEnabled = !state.loopingEnabled && validRegion;
      }),

    setZoom: (zoomValue: number) =>
      set((state) => {
        state.zoom = clampZoom(zoomValue);
      }),

    setViewport: (start: number, end: number) =>
      set((state) => {
        state.viewportStart = Math.max(0, start);
        state.viewportEnd = Math.max(state.viewportStart + 0.1, end);
      }),

    zoomToFit: () =>
      set((state) => {
        if (!state.project) return;

        const { clips } = state.project;
        if (clips.length === 0) {
          state.zoom = 1;
          state.viewportStart = 0;
          state.viewportEnd = 30;
          return;
        }

        const minStart = Math.min(...clips.map(clip => clip.start));
        const maxEnd = Math.max(...clips.map(clip => clip.start + clip.duration));
        const duration = Math.max(maxEnd - minStart, 1);
        const padding = duration * 0.1;
        const adjustedStart = Math.max(0, minStart - padding);
        const adjustedEnd = maxEnd + padding;

        state.zoom = clampZoom(30 / duration);
        state.viewportStart = adjustedStart;
        state.viewportEnd = adjustedEnd;
      }),

    toggleRippleEdit: () =>
      set((state) => {
        state.rippleEditEnabled = !state.rippleEditEnabled;
      }),

    addEffect: (clipId: string, effect: Omit<RNEffect, 'id'>) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          clip.effects.push({
            ...effect,
            id: uuidv4()
          });
        }
      }),

    removeEffect: (clipId: string, effectId: string) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          clip.effects = clip.effects.filter(e => e.id !== effectId);
        }
      }),

    updateEffect: (clipId: string, effectId: string, params: Record<string, any>) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          const effect = clip.effects.find(e => e.id === effectId);
          if (effect) {
            effect.params = { ...effect.params, ...params };
          }
        }
      }),

    addTransition: (clipId: string, transition: Omit<RNTransition, 'id'>) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          clip.transitions.push({
            ...transition,
            id: uuidv4()
          });
        }
      }),

    exportProject: async (settings: any) => {
      // React Native 版のエクスポート機能
      // 実際の実装では ffmpeg-kit-react-native を使用
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2000);
      });
    },

    undo: () =>
      set((state) => {
        // 簡易的な undo 機能
        // 実際には履歴管理システムを実装
        state.canUndo = state.history.past.length > 0;
      }),

    redo: () =>
      set((state) => {
        // 簡易的な redo 機能
        // 実際には履歴管理システムを実装
        state.canRedo = state.history.future.length > 0;
      }),

    clearHistory: () =>
      set((state) => {
        state.history.past = [];
        state.history.future = [];
        state.canUndo = false;
        state.canRedo = false;
      }),

    setHistoryLimit: (limit: number) =>
      set((state) => {
        state.history.limit = Math.max(HISTORY_LIMIT_MIN, Math.floor(limit));
        while (state.history.past.length > state.history.limit) {
          state.history.past.shift();
        }
        while (state.history.future.length > state.history.limit) {
          state.history.future.shift();
        }
      }),

    // 他の関数も同様に実装...
    removeClip: (clipId: string) =>
      set((state) => {
        if (!state.project) return;

        state.project.clips = state.project.clips.filter(clip => clip.id !== clipId);
        if (state.selectedClipId === clipId) {
          state.selectedClipId = null;
          state.selectedClip = null;
          state.selectedTrackId = null;
        }
      }),

    updateClip: (clipId: string, updates: Partial<RNVideoClip>) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          Object.assign(clip, updates);
          if (state.selectedClipId === clipId) {
            state.selectedClip = { ...clip };
          }
        }
      }),

    moveClip: (clipId: string, trackId: string, start: number) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (clip) {
          clip.trackId = trackId;
          clip.start = Math.max(0, start);
        }
      }),

    trimClip: (clipId: string, side: 'left' | 'right', delta: number) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (!clip) return;

        if (side === 'left') {
          const newStart = Math.max(0, clip.start + delta);
          const trimAmount = newStart - clip.start;
          clip.start = newStart;
          clip.duration = Math.max(0.1, clip.duration - trimAmount);
          clip.inPoint += trimAmount;
          clip.outPoint = clip.inPoint + clip.duration;
        } else {
          const nextDuration = Math.max(0.1, clip.duration + delta);
          clip.duration = nextDuration;
          clip.outPoint = clip.inPoint + clip.duration;
        }

        const updatedDuration = state.project.clips.reduce((maxEnd, currentClip) =>
          Math.max(maxEnd, currentClip.start + currentClip.duration), 0);
        state.project.duration = Math.max(updatedDuration, state.project.duration);

        if (state.selectedClipId === clipId) {
          state.selectedClip = { ...clip };
        }
      }),

    splitClip: (clipId: string, position: number) =>
      set((state) => {
        if (!state.project) return;

        const clip = state.project.clips.find(c => c.id === clipId);
        if (!clip) return;

        const splitOffset = position - clip.start;
        if (splitOffset <= 0 || splitOffset >= clip.duration) return;

        const leftDuration = splitOffset;
        const rightDuration = clip.duration - splitOffset;

        clip.duration = Math.max(0.1, leftDuration);
        clip.outPoint = clip.inPoint + clip.duration;

        const newClip: RNVideoClip = {
          id: uuidv4(),
          trackId: clip.trackId,
          name: `${clip.name} (Part 2)`,
          start: position,
          duration: Math.max(0.1, rightDuration),
          inPoint: clip.inPoint + splitOffset,
          outPoint: clip.inPoint + splitOffset + Math.max(0.1, rightDuration),
          mediaUri: clip.mediaUri,
          type: clip.type,
          effects: clip.effects.map(effect => ({
            ...effect,
            id: uuidv4()
          })),
          transitions: [],
          metadata: clip.metadata ? { ...clip.metadata } : undefined
        };

        state.project.clips.push(newClip);
        state.project.clips.sort((a, b) => a.start - b.start);

        const projectDuration = Math.max(...state.project.clips.map(c => c.start + c.duration));
        state.project.duration = projectDuration;

        state.selectedClipId = newClip.id;
        state.selectedClip = newClip;
        state.selectedTrackId = newClip.trackId;
      }),

    reorderTracks: (trackId: string, newOrder: number) =>
      set((state) => {
        if (!state.project) return;

        const track = state.project.tracks.find(t => t.id === trackId);
        if (!track || track.order === newOrder) return;

        const oldOrder = track.order;

        state.project.tracks.forEach(candidate => {
          if (candidate.id === trackId) {
            candidate.order = newOrder;
          } else if (oldOrder < newOrder && candidate.order > oldOrder && candidate.order <= newOrder) {
            candidate.order--;
          } else if (oldOrder > newOrder && candidate.order < oldOrder && candidate.order >= newOrder) {
            candidate.order++;
          }
        });

        state.project.tracks.sort((a, b) => a.order - b.order);
      }),

    toggleTrackLock: (trackId: string) =>
      set((state) => {
        if (!state.project) return;

        const track = state.project.tracks.find(t => t.id === trackId);
        if (track) {
          track.locked = !track.locked;
        }
      }),

    toggleTrackMute: (trackId: string) =>
      set((state) => {
        if (!state.project) return;

        const track = state.project.tracks.find(t => t.id === trackId);
        if (track) {
          track.muted = !track.muted;
        }
      }),

    toggleTrackSolo: (trackId: string) =>
      set((state) => {
        if (!state.project) return;

        const track = state.project.tracks.find(t => t.id === trackId);
        if (track) {
          track.solo = !track.solo;
        }
      }),
  }))
);
