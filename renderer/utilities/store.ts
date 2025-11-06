import { configureStore, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import type { TimelineState, TimelineClip, TimelineTrack, TimelineAction } from '../types/timeline';

// Initial state
const initialState: TimelineState = {
  clips: [],
  tracks: [
    { id: 'track-video-1', name: 'Video 1', type: 'video', clips: [] },
    { id: 'track-audio-1', name: 'Audio 1', type: 'audio', clips: [] },
    { id: 'track-text-1', name: 'Title', type: 'text', clips: [] }
  ],
  selectedClipId: null,
  playhead: 0,
  duration: 300,
  zoom: 1.0,
  isPlaying: false,
  volume: 1.0,
  muted: false
};

// Async thunks
export const loadProject = createAsyncThunk(
  'timeline/loadProject',
  async (projectId: string) => {
    // Simulate API call
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) {
      throw new Error('Failed to load project');
    }
    return await response.json();
  }
);

export const saveProject = createAsyncThunk(
  'timeline/saveProject',
  async (projectData: Partial<TimelineState>) => {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    if (!response.ok) {
      throw new Error('Failed to save project');
    }
    return await response.json();
  }
);

// Timeline slice
const timelineSlice = createSlice({
  name: 'timeline',
  initialState,
  reducers: {
    play: (state) => {
      state.isPlaying = true;
    },
    pause: (state) => {
      state.isPlaying = false;
    },
    setPlayhead: (state, action: PayloadAction<number>) => {
      state.playhead = Math.max(0, Math.min(action.payload, state.duration));
    },
    advancePlayhead: (state, action: PayloadAction<number>) => {
      state.playhead = Math.max(0, Math.min(state.playhead + action.payload, state.duration));
    },
    nudgePlayhead: (state, action: PayloadAction<number>) => {
      const frameDuration = 1 / 30; // 30 FPS
      state.playhead = Math.max(0, Math.min(state.playhead + (action.payload * frameDuration), state.duration));
    },
    setZoom: (state, action: PayloadAction<number>) => {
      state.zoom = Math.max(0.1, Math.min(action.payload, 5.0));
    },
    addClip: (state, action: PayloadAction<TimelineClip>) => {
      state.clips.push(action.payload);
    },
    removeClip: (state, action: PayloadAction<string>) => {
      state.clips = state.clips.filter(clip => clip.id !== action.payload);
      if (state.selectedClipId === action.payload) {
        state.selectedClipId = null;
      }
    },
    updateClip: (state, action: PayloadAction<{ clipId: string; updates: Partial<TimelineClip> }>) => {
      const { clipId, updates } = action.payload;
      const clipIndex = state.clips.findIndex(clip => clip.id === clipId);
      if (clipIndex !== -1) {
        state.clips[clipIndex] = { ...state.clips[clipIndex], ...updates };
      }
    },
    selectClip: (state, action: PayloadAction<string | null>) => {
      state.selectedClipId = action.payload;
    },
    setDuration: (state, action: PayloadAction<number>) => {
      state.duration = Math.max(0, action.payload);
    },
    setVolume: (state, action: PayloadAction<number>) => {
      state.volume = Math.max(0, Math.min(action.payload, 1));
    },
    toggleMute: (state) => {
      state.muted = !state.muted;
    },
    addTrack: (state, action: PayloadAction<TimelineTrack>) => {
      state.tracks.push(action.payload);
    },
    removeTrack: (state, action: PayloadAction<string>) => {
      state.tracks = state.tracks.filter(track => track.id !== action.payload);
      state.clips = state.clips.filter(clip => clip.trackId !== action.payload);
    },
    updateTrack: (state, action: PayloadAction<{ trackId: string; updates: Partial<TimelineTrack> }>) => {
      const { trackId, updates } = action.payload;
      const trackIndex = state.tracks.findIndex(track => track.id === trackId);
      if (trackIndex !== -1) {
        state.tracks[trackIndex] = { ...state.tracks[trackIndex], ...updates };
      }
    },
    undo: (state) => {
      // This would typically be handled by redux-undo
      console.log('Undo action triggered');
    },
    redo: (state) => {
      // This would typically be handled by redux-undo
      console.log('Redo action triggered');
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadProject.pending, (state) => {
        state.isPlaying = false;
      })
      .addCase(loadProject.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
      })
      .addCase(loadProject.rejected, (state, action) => {
        console.error('Failed to load project:', action.error);
      })
      .addCase(saveProject.pending, (state) => {
        // Could add saving state here
      })
      .addCase(saveProject.fulfilled, (state, action) => {
        // Could update last saved timestamp here
        console.log('Project saved successfully');
      })
      .addCase(saveProject.rejected, (state, action) => {
        console.error('Failed to save project:', action.error);
      });
  }
});

// UI slice for managing UI state
interface UIState {
  sidebarOpen: boolean;
  modalOpen: { [key: string]: boolean };
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
  }>;
  loading: { [key: string]: boolean };
}

const initialUIState: UIState = {
  sidebarOpen: true,
  modalOpen: {},
  notifications: [],
  loading: {}
};

const uiSlice = createSlice({
  name: 'ui',
  initialState: initialUIState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    openModal: (state, action: PayloadAction<string>) => {
      state.modalOpen[action.payload] = true;
    },
    closeModal: (state, action: PayloadAction<string>) => {
      state.modalOpen[action.payload] = false;
    },
    closeAllModals: (state) => {
      state.modalOpen = {};
    },
    addNotification: (state, action: PayloadAction<UIState['notifications'][0]>) => {
      state.notifications.push(action.payload);
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    setLoading: (state, action: PayloadAction<{ key: string; loading: boolean }>) => {
      state.loading[action.payload.key] = action.payload.loading;
    }
  }
});

// Settings slice
interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  autosave: boolean;
  autosaveInterval: number;
  playback: {
    frameRate: number;
    quality: 'low' | 'medium' | 'high';
    loop: boolean;
  };
  export: {
    format: 'webm' | 'mp4';
    quality: 'low' | 'medium' | 'high';
    includeAudio: boolean;
    includeVideo: boolean;
  };
}

const initialSettingsState: SettingsState = {
  theme: 'dark',
  language: 'ja',
  autosave: true,
  autosaveInterval: 30000, // 30 seconds
  playback: {
    frameRate: 30,
    quality: 'medium',
    loop: false
  },
  export: {
    format: 'webm',
    quality: 'medium',
    includeAudio: true,
    includeVideo: true
  }
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    setTheme: (state, action: PayloadAction<SettingsState['theme']>) => {
      state.theme = action.payload;
    },
    setLanguage: (state, action: PayloadAction<string>) => {
      state.language = action.payload;
    },
    setAutosave: (state, action: PayloadAction<boolean>) => {
      state.autosave = action.payload;
    },
    setAutosaveInterval: (state, action: PayloadAction<number>) => {
      state.autosaveInterval = action.payload;
    },
    updatePlaybackSettings: (state, action: PayloadAction<Partial<SettingsState['playback']>>) => {
      state.playback = { ...state.playback, ...action.payload };
    },
    updateExportSettings: (state, action: PayloadAction<Partial<SettingsState['export']>>) => {
      state.export = { ...state.export, ...action.payload };
    }
  }
});

// Store configuration
export const store = configureStore({
  reducer: {
    timeline: timelineSlice.reducer,
    ui: uiSlice.reducer,
    settings: settingsSlice.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
      }
    }),
  devTools: process.env.NODE_ENV === 'development'
});

// Export actions
export const timelineActions = timelineSlice.actions;
export const uiActions = uiSlice.actions;
export const settingsActions = settingsSlice.actions;

// Export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Export async actions
export { loadProject, saveProject };
