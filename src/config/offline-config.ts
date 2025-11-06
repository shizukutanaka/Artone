/**
 * Offline Configuration for Personal Use
 * 個人使用向けオフライン設定
 *
 * Maximizes offline functionality for privacy and independence
 */

/**
 * Service Worker Configuration
 * サービスワーカー設定
 */
export const OFFLINE_CONFIG = {
  // Cache strategy
  cacheStrategy: {
    // Cache all static assets indefinitely
    staticAssets: {
      strategy: 'CacheFirst',
      maxAge: 365 * 24 * 60 * 60, // 1 year
      maxEntries: 100,
    },

    // Cache application shell
    appShell: {
      strategy: 'CacheFirst',
      files: [
        '/',
        '/editor',
        '/manifest.json',
        '/icon.svg',
      ],
    },

    // Runtime caching for dynamic content
    runtime: {
      strategy: 'NetworkFirst',
      maxAge: 24 * 60 * 60, // 24 hours
      maxEntries: 50,
    },
  },

  // Local storage limits and management
  storage: {
    // Maximum storage quota to request (in bytes)
    requestQuota: 10 * 1024 * 1024 * 1024, // 10GB

    // Warn user when storage exceeds this threshold
    warningThreshold: 0.8, // 80%

    // Automatically clean old projects when storage is full
    autoCleanup: true,

    // Keep projects for this many days
    projectRetentionDays: 90,
  },

  // IndexedDB configuration for project storage
  indexedDB: {
    dbName: 'ArtoneVideoEditor',
    version: 1,
    stores: {
      projects: {
        keyPath: 'id',
        indexes: [
          { name: 'lastModified', keyPath: 'lastModified' },
          { name: 'created', keyPath: 'created' },
          { name: 'name', keyPath: 'name' },
        ],
      },
      media: {
        keyPath: 'id',
        indexes: [
          { name: 'projectId', keyPath: 'projectId' },
          { name: 'type', keyPath: 'type' },
        ],
      },
      settings: {
        keyPath: 'key',
      },
      exportHistory: {
        keyPath: 'id',
        indexes: [
          { name: 'timestamp', keyPath: 'timestamp' },
          { name: 'projectId', keyPath: 'projectId' },
        ],
      },
    },
  },

  // Automatic backup configuration
  backup: {
    // Auto-save interval (milliseconds)
    autoSaveInterval: 30000, // 30 seconds

    // Maximum number of backup versions to keep
    maxBackupVersions: 10,

    // Backup strategy
    strategy: 'incremental', // 'full' or 'incremental'

    // Enable cloud sync (requires configuration)
    enableCloudSync: false,
  },

  // Media processing configuration
  media: {
    // Generate thumbnails for imported media
    generateThumbnails: true,

    // Thumbnail size
    thumbnailSize: { width: 160, height: 90 },

    // Extract audio waveform data
    extractWaveform: true,

    // Waveform resolution
    waveformResolution: 512,

    // Store media in IndexedDB (vs memory only)
    persistMedia: true,

    // Maximum individual file size (bytes)
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
  },
};

/**
 * Privacy-focused settings
 * プライバシー重視の設定
 */
export const PRIVACY_CONFIG = {
  // Disable all external network requests
  offlineMode: true,

  // Disable analytics
  disableAnalytics: true,

  // Disable error reporting
  disableErrorReporting: true,

  // Disable automatic updates check
  disableUpdateCheck: true,

  // Clear temporary data on exit
  clearTempOnExit: true,

  // Don't store usage statistics
  disableUsageStats: true,

  // Encrypt local storage
  encryptLocalStorage: false, // Set to true for extra security
};

/**
 * Performance optimization for offline use
 * オフライン使用向けパフォーマンス最適化
 */
export const OFFLINE_PERFORMANCE = {
  // Preload frequently used assets
  preloadAssets: [
    '/lib/react.production.min.js',
    '/lib/react-dom.production.min.js',
  ],

  // Lazy load large components
  lazyLoadThreshold: 100 * 1024, // 100KB

  // Use Web Workers for heavy tasks
  useWebWorkers: true,
  maxWorkers: navigator.hardwareConcurrency || 4,

  // Enable GPU acceleration
  enableGPUAcceleration: true,

  // Memory management
  memoryManagement: {
    // Unload clips outside viewport
    unloadOffscreenClips: true,

    // Maximum memory usage (bytes)
    maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB

    // Garbage collection threshold
    gcThreshold: 0.8, // 80% of max
  },
};

/**
 * Export settings optimized for personal use
 * 個人使用向けに最適化されたエクスポート設定
 */
export const PERSONAL_EXPORT_CONFIG = {
  // Default export location
  defaultLocation: 'downloads', // or 'local-storage'

  // Naming convention
  fileNaming: {
    prefix: 'Artone',
    includeDate: true,
    includeProjectName: true,
    format: '{prefix}_{projectName}_{date}', // e.g., Artone_MyVideo_20250106
  },

  // Quality presets order (most used first)
  defaultPresets: [
    'youtube-1080p',
    'instagram-story',
    'web-hd',
    'mobile-optimized',
  ],

  // Export queue management
  queue: {
    maxConcurrent: 1, // Process one export at a time
    enableBackground: true, // Continue export when tab is not focused
    notifyOnComplete: true,
  },
};

/**
 * User preference defaults for personal use
 * 個人使用向けのユーザー設定デフォルト
 */
export const PERSONAL_DEFAULTS = {
  // Interface language
  language: 'auto', // 'ja', 'en', or 'auto'

  // Theme
  theme: 'dark', // 'light', 'dark', or 'auto'

  // Timeline settings
  timeline: {
    snapToGrid: true,
    snapThreshold: 0.1, // seconds
    defaultZoom: 1.0,
    showWaveforms: true,
    showThumbnails: true,
  },

  // Playback settings
  playback: {
    previewQuality: 'auto', // 'low', 'medium', 'high', 'auto'
    volume: 1.0,
    loopPlayback: false,
    skipBackwardSeconds: 5,
    skipForwardSeconds: 5,
  },

  // Keyboard shortcuts
  shortcuts: {
    enabled: true,
    customizable: true,
  },

  // Notifications
  notifications: {
    showOnSave: false,
    showOnExport: true,
    showOnError: true,
    position: 'bottom-right',
  },
};

/**
 * Check if offline mode is available
 * オフラインモードが利用可能かチェック
 */
export function isOfflineCapable(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    'serviceWorker' in navigator &&
    'indexedDB' in window &&
    'caches' in window &&
    'localStorage' in window
  );
}

/**
 * Get storage quota information
 * ストレージクォータ情報を取得
 */
export async function getStorageInfo(): Promise<{
  usage: number;
  quota: number;
  percentage: number;
  available: number;
}> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return {
      usage: 0,
      quota: 0,
      percentage: 0,
      available: 0,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;
    const available = quota - usage;

    return {
      usage,
      quota,
      percentage,
      available,
    };
  } catch (error) {
    console.error('Failed to get storage info:', error);
    return {
      usage: 0,
      quota: 0,
      percentage: 0,
      available: 0,
    };
  }
}

/**
 * Request persistent storage
 * 永続ストレージをリクエスト
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !('persist' in navigator.storage)) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch (error) {
    console.error('Failed to request persistent storage:', error);
    return false;
  }
}
