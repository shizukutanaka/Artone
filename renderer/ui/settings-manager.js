'use strict';

(function registerSettingsManager(global) {
  // Internationalization data
  const I18N_DATA = {
    en: {
      settings: {
        title: 'Settings',
        general: 'General',
        editor: 'Editor',
        timeline: 'Timeline',
        playback: 'Playback',
        export: 'Export',
        performance: 'Performance',
        keyboard: 'Keyboard',
        ui: 'Interface',
        language: 'Language',
        theme: 'Theme',
        autoSave: 'Auto Save',
        autoSaveInterval: 'Auto Save Interval',
        showWelcomeScreen: 'Show Welcome Screen',
        checkForUpdates: 'Check for Updates',
        snapToGrid: 'Snap to Grid',
        gridSize: 'Grid Size',
        defaultZoom: 'Default Zoom',
        wheelZoomSensitivity: 'Zoom Sensitivity',
        enableVirtualization: 'Enable Virtualization',
        maxUndoHistory: 'Undo History Size',
        previewQuality: 'Preview Quality',
        trackHeight: 'Track Height',
        showWaveforms: 'Show Waveforms',
        waveformResolution: 'Waveform Resolution',
        enableThumbnails: 'Enable Thumbnails',
        thumbnailInterval: 'Thumbnail Interval',
        magneticSnapping: 'Magnetic Snapping',
        snapTolerance: 'Snap Tolerance',
        loopByDefault: 'Loop by Default',
        prerollSeconds: 'Preroll Seconds',
        postrollSeconds: 'Postroll Seconds',
        skipToMarkers: 'Skip to Markers',
        enablePreview: 'Enable Preview',
        previewFrameRate: 'Preview Frame Rate',
        defaultFormat: 'Default Format',
        defaultQuality: 'Default Quality',
        includeMetadata: 'Include Metadata',
        openAfterExport: 'Open After Export',
        defaultPath: 'Default Export Path',
        confirmOverwrite: 'Confirm Overwrite',
        enableGPUAcceleration: 'GPU Acceleration',
        maxMemoryUsage: 'Max Memory Usage (MB)',
        enableMemoryMonitoring: 'Memory Monitoring',
        cacheSize: 'Cache Size (MB)',
        enableWorkers: 'Enable Workers',
        workerCount: 'Worker Count',
        enableShortcuts: 'Enable Shortcuts',
        compactMode: 'Compact Mode',
        showTooltips: 'Show Tooltips',
        animationSpeed: 'Animation Speed',
        panelLayout: 'Panel Layout',
        showStatusBar: 'Show Status Bar',
        showTimecode: 'Show Timecode',
        timecodeFormat: 'Timecode Format',
        save: 'Save',
        cancel: 'Cancel',
        reset: 'Reset to Defaults',
        exportSettings: 'Export Settings',
        importSettings: 'Import Settings',
        keyboardShortcuts: 'Keyboard Shortcuts',
        editShortcut: 'Edit Shortcut',
        pressKeyCombination: 'Press key combination...',
        conflictDetected: 'Conflict detected with existing shortcut',
        shortcutSaved: 'Shortcut saved successfully'
      },
      common: {
        yes: 'Yes',
        no: 'No',
        enabled: 'Enabled',
        disabled: 'Disabled',
        auto: 'Auto',
        manual: 'Manual',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        ultra: 'Ultra',
        seconds: 'seconds',
        frames: 'frames',
        pixels: 'pixels',
        megabytes: 'MB',
        percentage: '%'
      }
    },
    ja: {
      settings: {
        title: '設定',
        general: '一般',
        editor: 'エディタ',
        timeline: 'タイムライン',
        playback: '再生',
        export: 'エクスポート',
        performance: 'パフォーマンス',
        keyboard: 'キーボード',
        ui: 'インターフェース',
        language: '言語',
        theme: 'テーマ',
        autoSave: '自動保存',
        autoSaveInterval: '自動保存間隔',
        showWelcomeScreen: 'ウェルカム画面を表示',
        checkForUpdates: '更新を確認',
        snapToGrid: 'グリッドにスナップ',
        gridSize: 'グリッドサイズ',
        defaultZoom: 'デフォルトズーム',
        wheelZoomSensitivity: 'ズーム感度',
        enableVirtualization: '仮想化を有効化',
        maxUndoHistory: 'アンドゥ履歴サイズ',
        previewQuality: 'プレビュー品質',
        trackHeight: 'トラックの高さ',
        showWaveforms: '波形を表示',
        waveformResolution: '波形解像度',
        enableThumbnails: 'サムネイルを有効化',
        thumbnailInterval: 'サムネイル間隔',
        magneticSnapping: 'マグネティックスナップ',
        snapTolerance: 'スナップ許容値',
        loopByDefault: 'デフォルトでループ',
        prerollSeconds: 'プリロール秒数',
        postrollSeconds: 'ポストロール秒数',
        skipToMarkers: 'マーカーにスキップ',
        enablePreview: 'プレビューを有効化',
        previewFrameRate: 'プレビューフレームレート',
        defaultFormat: 'デフォルト形式',
        defaultQuality: 'デフォルト品質',
        includeMetadata: 'メタデータを追加',
        openAfterExport: 'エクスポート後に開く',
        defaultPath: 'デフォルトエクスポートパス',
        confirmOverwrite: '上書きを確認',
        enableGPUAcceleration: 'GPUアクセラレーション',
        maxMemoryUsage: '最大メモリ使用量 (MB)',
        enableMemoryMonitoring: 'メモリ監視',
        cacheSize: 'キャッシュサイズ (MB)',
        enableWorkers: 'ワーカーを有効化',
        workerCount: 'ワーカー数',
        enableShortcuts: 'ショートカットを有効化',
        compactMode: 'コンパクトモード',
        showTooltips: 'ツールチップを表示',
        animationSpeed: 'アニメーション速度',
        panelLayout: 'パネルレイアウト',
        showStatusBar: 'ステータスバーを表示',
        showTimecode: 'タイムコードを表示',
        timecodeFormat: 'タイムコード形式',
        save: '保存',
        cancel: 'キャンセル',
        reset: 'デフォルトにリセット',
        exportSettings: '設定をエクスポート',
        importSettings: '設定をインポート',
        keyboardShortcuts: 'キーボードショートカット',
        editShortcut: 'ショートカットを編集',
        pressKeyCombination: 'キーの組み合わせを押してください...',
        conflictDetected: '既存のショートカットとの競合が検出されました',
        shortcutSaved: 'ショートカットが正常に保存されました'
      },
      common: {
        yes: 'はい',
        no: 'いいえ',
        enabled: '有効',
        disabled: '無効',
        auto: '自動',
        manual: '手動',
        low: '低',
        medium: '中',
        high: '高',
        ultra: '超高',
        seconds: '秒',
        frames: 'フレーム',
        pixels: 'ピクセル',
        megabytes: 'MB',
        percentage: '%'
      }
    }
  };
  
  const DEFAULT_SETTINGS = {
    general: {
      language: 'auto',
      theme: 'dark',
      autoSave: true,
      autoSaveInterval: 30000,
      showWelcomeScreen: true,
      checkForUpdates: true
    },
    editor: {
      snapToGrid: true,
      gridSize: 1,
      defaultZoom: 1,
      wheelZoomSensitivity: 0.1,
      enableVirtualization: true,
      maxUndoHistory: 50,
      previewQuality: 'medium'
    },
    timeline: {
      trackHeight: 60,
      showWaveforms: true,
      waveformResolution: 'auto',
      enableThumbnails: true,
      thumbnailInterval: 5,
      magneticSnapping: true,
      snapTolerance: 10
    },
    playback: {
      loopByDefault: false,
      prerollSeconds: 0,
      postrollSeconds: 0,
      skipToMarkers: true,
      enablePreview: true,
      previewFrameRate: 30
    },
    export: {
      defaultFormat: 'webm',
      defaultQuality: 'hd-720p',
      includeMetadata: true,
      openAfterExport: true,
      defaultPath: null,
      confirmOverwrite: true
    },
    performance: {
      enableGPUAcceleration: true,
      maxMemoryUsage: 1024,
      enableMemoryMonitoring: true,
      cacheSize: 500,
      enableWorkers: true,
      workerCount: 'auto'
    },
    keyboard: {
      enableShortcuts: true,
      shortcuts: {
        'new_project': 'ctrl+n',
        'open_project': 'ctrl+o',
        'save_project': 'ctrl+s',
        'undo': 'ctrl+z',
        'redo': 'ctrl+y',
        'play_pause': 'space',
        'import_media': 'ctrl+i',
        'export': 'ctrl+e'
      }
    },
    ui: {
      compactMode: false,
      showTooltips: true,
      animationSpeed: 'normal',
      panelLayout: 'default',
      showStatusBar: true,
      showTimecode: true,
      timecodeFormat: 'mm:ss:ff'
    }
  };

  class SettingsManager {
    constructor() {
      this.settings = {};
      this.watchers = new Map();
      this.storageKey = 'artone-settings';
      this.isLoaded = false;
      this.changeListeners = [];
    }

    async initialize() {
      await this.loadSettings();
      this.setupStorageWatcher();
      this.isLoaded = true;
      console.log('Settings manager initialized');
    }

    async loadSettings() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.settings = this.mergeSettings(DEFAULT_SETTINGS, parsed);
        } else {
          this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      }

      this.validateSettings();
      this.migrateSettings();
      await this.saveSettings();
    }

    async saveSettings() {
      try {
        const serialized = JSON.stringify(this.settings, null, 2);
        localStorage.setItem(this.storageKey, serialized);
        this.notifyChangeListeners();
      } catch (error) {
        console.error('Failed to save settings:', error);
        throw error;
      }
    }

    get(path, defaultValue = undefined) {
      const keys = path.split('.');
      let current = this.settings;

      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return defaultValue;
        }
      }

      return current;
    }

    async set(path, value) {
      const keys = path.split('.');
      const lastKey = keys.pop();
      let current = this.settings;

      for (const key of keys) {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }

      const oldValue = current[lastKey];
      current[lastKey] = value;

      this.notifyWatchers(path, value, oldValue);
      await this.saveSettings();
    }

    watch(path, callback) {
      if (!this.watchers.has(path)) {
        this.watchers.set(path, []);
      }
      this.watchers.get(path).push(callback);

      return () => {
        const watchers = this.watchers.get(path);
        if (watchers) {
          const index = watchers.indexOf(callback);
          if (index >= 0) {
            watchers.splice(index, 1);
          }
        }
      };
    }

    notifyWatchers(path, newValue, oldValue) {
      const watchers = this.watchers.get(path);
      if (watchers) {
        for (const callback of watchers) {
          try {
            callback(newValue, oldValue, path);
          } catch (error) {
            console.error(`Error in settings watcher for ${path}:`, error);
          }
        }
      }
    }

    onChange(callback) {
      this.changeListeners.push(callback);
      return () => {
        const index = this.changeListeners.indexOf(callback);
        if (index >= 0) {
          this.changeListeners.splice(index, 1);
        }
      };
    }

    notifyChangeListeners() {
      for (const listener of this.changeListeners) {
        try {
          listener(this.settings);
        } catch (error) {
          console.error('Error in settings change listener:', error);
        }
      }
    }

    async reset() {
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      await this.saveSettings();

      for (const [path] of this.watchers) {
        const newValue = this.get(path);
        this.notifyWatchers(path, newValue, undefined);
      }
    }

    getAll() {
      return JSON.parse(JSON.stringify(this.settings));
    }

    async importSettings(settingsData) {
      try {
        const imported = typeof settingsData === 'string'
          ? JSON.parse(settingsData)
          : settingsData;

        this.settings = this.mergeSettings(DEFAULT_SETTINGS, imported);
        this.validateSettings();
        await this.saveSettings();

        for (const [path] of this.watchers) {
          const newValue = this.get(path);
          this.notifyWatchers(path, newValue, undefined);
        }

        return true;
      } catch (error) {
        console.error('Failed to import settings:', error);
        return false;
      }
    }

    exportSettings() {
      return JSON.stringify(this.settings, null, 2);
    }

    mergeSettings(defaults, overrides) {
      const result = {};

      for (const key in defaults) {
        if (key in overrides) {
          if (typeof defaults[key] === 'object' && defaults[key] !== null &&
              typeof overrides[key] === 'object' && overrides[key] !== null &&
              !Array.isArray(defaults[key]) && !Array.isArray(overrides[key])) {
            result[key] = this.mergeSettings(defaults[key], overrides[key]);
          } else {
            result[key] = overrides[key];
          }
        } else {
          result[key] = defaults[key];
        }
      }

      for (const key in overrides) {
        if (!(key in defaults)) {
          result[key] = overrides[key];
        }
      }

      return result;
    }

    validateSettings() {
      const validLanguages = ['auto', 'en', 'ja'];
      if (!validLanguages.includes(this.settings.general.language)) {
        this.settings.general.language = 'auto';
      }

      const validThemes = ['dark', 'light', 'auto'];
      if (!validThemes.includes(this.settings.general.theme)) {
        this.settings.general.theme = 'dark';
      }

      this.settings.general.autoSaveInterval = Math.max(5000, Math.min(300000, this.settings.general.autoSaveInterval));
      this.settings.editor.defaultZoom = Math.max(0.1, Math.min(10, this.settings.editor.defaultZoom));
      this.settings.performance.maxMemoryUsage = Math.max(256, Math.min(8192, this.settings.performance.maxMemoryUsage));

      if (!this.settings.keyboard.shortcuts || typeof this.settings.keyboard.shortcuts !== 'object') {
        this.settings.keyboard.shortcuts = DEFAULT_SETTINGS.keyboard.shortcuts;
      }
    }

    migrateSettings() {
      if (!this.settings._version) {
        this.settings._version = '1.0.0';
      }
    }

    setupStorageWatcher() {
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', (event) => {
          if (event.key === this.storageKey && event.newValue !== event.oldValue) {
            this.loadSettings();
          }
        });
      }
    }
  }

  const settingsManager = new SettingsManager();
  global.SettingsManager = settingsManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      settingsManager.initialize();
    });
  } else {
    settingsManager.initialize();
  }

})(typeof window !== 'undefined' ? window : globalThis);