/**
 * Advanced Service Worker for Artone Video Editor - Comprehensive Offline Support
 * Enhanced caching, background sync, push notifications, and offline-first architecture
 */

const CACHE_NAME = 'artone-v2.0.0';
const OFFLINE_URL = '/offline.html';

// Enhanced cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only',
  RACE_NETWORK_CACHE: 'race-network-cache'
};

// Comprehensive resource categorization
const CACHE_CONFIG = {
  // Critical app resources - cache first, immutable
  critical: {
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    patterns: [
      /\/manifest\.json$/,
      /\/icon\.svg$/,
      /\/favicon\.ico$/
    ],
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    priority: 10
  },

  // Application shell - cache first, high priority
  shell: {
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    patterns: [
      /^\/$/,
      /^\/_next\/static\/.*\.(js|css)$/,
      /^\/_next\/static\/chunks\/.*\.js$/,
      /^\/_next\/static\/css\/.*\.css$/
    ],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    priority: 9
  },

  // API responses - network first with background sync
  api: {
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    patterns: [/^\/api\//],
    maxAge: 5 * 60 * 1000, // 5 minutes
    backgroundSync: true,
    priority: 8
  },

  // User content - cache first for offline access
  userContent: {
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    patterns: [
      /\/projects\//,
      /\/exports\//,
      /\/backups\//
    ],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    priority: 7
  },

  // Media assets - intelligent caching based on usage
  media: {
    strategy: CACHE_STRATEGIES.RACE_NETWORK_CACHE,
    patterns: [
      /\.(?:mp4|webm|ogg|avi|mov|mkv)$/,
      /\.(?:mp3|wav|aac|ogg)$/,
      /\.(?:jpg|jpeg|png|gif|webp|avif)$/
    ],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxEntries: 50,
    priority: 6
  },

  // External resources - selective caching
  external: {
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    patterns: [
      /^https?:\/\/fonts\.googleapis\.com/,
      /^https?:\/\/fonts\.gstatic\.com/
    ],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    priority: 5
  },

  // Analytics and tracking - network only
  analytics: {
    strategy: CACHE_STRATEGIES.NETWORK_ONLY,
    patterns: [
      /^https?:\/\/.*\.google-analytics\.com/,
      /^https?:\/\/.*\.googletagmanager\.com/,
      /^https?:\/\/sentry\.io/
    ],
    priority: 1
  }
};

// Background sync configuration
const SYNC_CONFIG = {
  PROJECT_AUTO_SAVE: {
    tag: 'project-auto-save',
    retryLimit: 3,
    backoffMultiplier: 2,
    initialDelay: 5000
  },
  EXPORT_QUEUE: {
    tag: 'export-queue',
    retryLimit: 5,
    backoffMultiplier: 1.5,
    initialDelay: 10000
  },
  BACKUP_SYNC: {
    tag: 'backup-sync',
    retryLimit: 10,
    backoffMultiplier: 2,
    initialDelay: 30000
  },
  COLLABORATION_SYNC: {
    tag: 'collaboration-sync',
    retryLimit: 3,
    backoffMultiplier: 1.5,
    initialDelay: 15000
  }
};

// Offline queue for storing actions
class OfflineQueue {
  constructor() {
    this.queue = [];
    this.maxSize = 100;
    this.storageKey = 'artone-offline-queue';
    this.loadFromStorage();
  }

  add(action) {
    const queueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    this.queue.push(queueItem);

    // Maintain queue size
    if (this.queue.length > this.maxSize) {
      this.queue.shift();
    }

    this.saveToStorage();
    return queueItem.id;
  }

  getNextPending() {
    return this.queue.find(item => item.status === 'pending');
  }

  markCompleted(id) {
    const item = this.queue.find(item => item.id === id);
    if (item) {
      item.status = 'completed';
      this.saveToStorage();
    }
  }

  markFailed(id, error) {
    const item = this.queue.find(item => item.id === id);
    if (item) {
      item.status = 'failed';
      item.error = error;
      item.retryCount++;
      this.saveToStorage();
    }
  }

  getPendingActions() {
    return this.queue.filter(item => item.status === 'pending');
  }

  clearCompleted() {
    this.queue = this.queue.filter(item => item.status !== 'completed');
    this.saveToStorage();
  }

  async loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[OfflineQueue] Failed to load from storage:', error);
    }
  }

  async saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.warn('[OfflineQueue] Failed to save to storage:', error);
    }
  }
}

const offlineQueue = new OfflineQueue();

// Enhanced install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing enhanced service worker');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Cache critical resources immediately
      const criticalResources = [
        '/',
        OFFLINE_URL,
        '/manifest.json',
        '/icon.svg'
      ];

      try {
        await cache.addAll(criticalResources);
        console.log('[SW] Critical resources cached');
      } catch (error) {
        console.warn('[SW] Failed to cache critical resources:', error);
      }

      // Pre-cache essential routes
      const essentialRoutes = [
        '/projects',
        '/editor',
        '/settings',
        '/help'
      ];

      for (const route of essentialRoutes) {
        try {
          await cache.add(new Request(route, { cache: 'reload' }));
        } catch (error) {
          console.warn(`[SW] Failed to cache route ${route}:`, error);
        }
      }

      self.skipWaiting();
    })()
  );
});

// Enhanced activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating enhanced service worker');

  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => name !== CACHE_NAME);

      await Promise.all(
        oldCaches.map(cacheName => {
          console.log(`[SW] Deleting old cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );

      // Initialize offline queue processing
      setInterval(processOfflineQueue, 30000); // Process every 30 seconds

      // Take control of all clients
      await self.clients.claim();
    })()
  );
});

// Advanced fetch event with intelligent caching
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (except for specific cases)
  if (event.request.method !== 'GET') {
    // Handle POST requests for file uploads
    if (event.request.method === 'POST' && url.pathname.includes('/upload')) {
      event.respondWith(handleFileUpload(event.request));
    }
    return;
  }

  // Skip browser extensions and certain external requests
  if (url.protocol === 'chrome-extension:' ||
      url.hostname !== location.hostname) {
    const config = getCacheConfig(url);
    if (config.strategy === CACHE_STRATEGIES.NETWORK_ONLY) {
      return;
    }
  }

  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const config = getCacheConfig(url);

  try {
    switch (config.strategy) {
      case CACHE_STRATEGIES.CACHE_FIRST:
        return await cacheFirstStrategy(request, config);

      case CACHE_STRATEGIES.NETWORK_FIRST:
        return await networkFirstStrategy(request, config);

      case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
        return await staleWhileRevalidateStrategy(request, config);

      case CACHE_STRATEGIES.RACE_NETWORK_CACHE:
        return await raceNetworkCacheStrategy(request, config);

      case CACHE_STRATEGIES.NETWORK_ONLY:
        return fetch(request);

      case CACHE_STRATEGIES.CACHE_ONLY:
        const cachedResponse = await caches.match(request);
        return cachedResponse || new Response('', { status: 404 });

      default:
        return fetch(request);
    }
  } catch (error) {
    console.warn('[SW] Request failed, attempting recovery:', error);

    // Try cache fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.destination === 'document') {
      const offlineResponse = await caches.match(OFFLINE_URL);
      return offlineResponse || new Response('Offline - Please check your connection', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    throw error;
  }
}

function getCacheConfig(url) {
  for (const [category, config] of Object.entries(CACHE_CONFIG)) {
    if (config.patterns.some(pattern => pattern.test(url.href))) {
      return { ...config, category };
    }
  }

  // Default configuration
  return {
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    maxAge: 60 * 60 * 1000, // 1 hour
    priority: 3
  };
}

async function cacheFirstStrategy(request, config) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Check if cache is still fresh
    const cacheDate = new Date(cachedResponse.headers.get('sw-cache-date') || 0);
    const age = Date.now() - cacheDate.getTime();

    if (age < config.maxAge) {
      return cachedResponse;
    }
  }

  // Fetch fresh response
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Clone and add cache metadata
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });

      cache.put(request, cachedResponse);
    }
    return networkResponse;
  } catch (error) {
    return cachedResponse || Promise.reject(error);
  }
}

async function networkFirstStrategy(request, config) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });

      cache.put(request, cachedResponse);
    }

    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    return cachedResponse || Promise.reject(error);
  }
}

async function staleWhileRevalidateStrategy(request, config) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Always attempt to update cache in background
  const updatePromise = fetch(request).then(async networkResponse => {
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });

      await cache.put(request, cachedResponse);
    }
    return networkResponse;
  }).catch(() => null);

  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // Wait for network response
  const networkResponse = await updatePromise;
  return networkResponse || new Response('', { status: 503 });
}

async function raceNetworkCacheStrategy(request, config) {
  const cache = await caches.open(CACHE_NAME);

  // Start both cache and network requests simultaneously
  const cachePromise = cache.match(request);
  const networkPromise = fetch(request).then(async response => {
    if (response.ok) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });

      cache.put(request, cachedResponse);
    }
    return response;
  }).catch(() => null);

  // Return whichever completes first
  const result = await Promise.race([
    cachePromise.then(response => ({ source: 'cache', response })),
    networkPromise.then(response => ({ source: 'network', response }))
  ]);

  return result.response || new Response('', { status: 503 });
}

async function handleFileUpload(request) {
  // Handle file upload requests
  try {
    // In a real implementation, this would process the uploaded files
    // and store them appropriately
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Enhanced background sync
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  event.waitUntil(
    (async () => {
      switch (event.tag) {
        case SYNC_CONFIG.PROJECT_AUTO_SAVE.tag:
          await syncProjectAutoSave();
          break;

        case SYNC_CONFIG.EXPORT_QUEUE.tag:
          await syncExportQueue();
          break;

        case SYNC_CONFIG.BACKUP_SYNC.tag:
          await syncBackupUploads();
          break;

        case SYNC_CONFIG.COLLABORATION_SYNC.tag:
          await syncCollaborationChanges();
          break;

        default:
          console.warn('[SW] Unknown sync tag:', event.tag);
      }
    })()
  );
});

// Periodic sync for maintenance tasks
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync:', event.tag);

  event.waitUntil(
    (async () => {
      switch (event.tag) {
        case 'cache-maintenance':
          await performCacheMaintenance();
          break;

        case 'content-sync':
          await performContentSync();
          break;

        case 'analytics-sync':
          await syncAnalyticsData();
          break;
      }
    })()
  );
});

// Enhanced push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || 'New update available',
    icon: '/icon.svg',
    badge: '/icons/badge.png',
    image: data.image,
    vibrate: data.vibrate || [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.id || 1,
      url: data.url || '/'
    },
    actions: [
      {
        action: 'view',
        title: data.actionTitle || 'View',
        icon: '/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss.png'
      }
    ],
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Artone Video Editor', options)
  );
});

// Enhanced notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification action:', event.action);

  event.notification.close();

  const url = event.notification.data.url || '/';

  switch (event.action) {
    case 'view':
      event.waitUntil(
        clients.openWindow(url)
      );
      break;

    case 'dismiss':
      // Just close the notification
      break;

    default:
      event.waitUntil(
        clients.openWindow(url)
      );
  }
});

// Advanced message handling
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'REGISTER_BACKGROUND_SYNC':
      registerBackgroundSync(data.tag, data.options);
      break;

    case 'QUEUE_OFFLINE_ACTION':
      const actionId = offlineQueue.add(data.action);
      event.ports[0].postMessage({ actionId });
      break;

    case 'GET_OFFLINE_QUEUE_STATUS':
      event.ports[0].postMessage({
        pendingCount: offlineQueue.getPendingActions().length,
        totalCount: offlineQueue.queue.length
      });
      break;

    case 'CACHE_RESOURCE':
      cacheResource(data.url, data.config);
      break;

    case 'GET_CACHE_INFO':
      getCacheInfo().then(info => {
        event.ports[0].postMessage({ type: 'CACHE_INFO', data: info });
      });
      break;

    case 'CLEAR_CACHE':
      clearOldCache().then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      });
      break;

    default:
      console.warn('[SW] Unknown message type:', type);
  }
});

// Background sync implementations
async function syncProjectAutoSave() {
  console.log('[SW] Syncing project auto-saves');
  // Implementation for syncing unsaved project changes
}

async function syncExportQueue() {
  console.log('[SW] Syncing export queue');
  // Implementation for syncing queued exports
}

async function syncBackupUploads() {
  console.log('[SW] Syncing backup uploads');
  // Implementation for syncing backup uploads
}

async function syncCollaborationChanges() {
  console.log('[SW] Syncing collaboration changes');
  // Implementation for syncing collaboration changes
}

async function performCacheMaintenance() {
  console.log('[SW] Performing cache maintenance');
  await clearOldCache();
  await optimizeCacheSize();
}

async function performContentSync() {
  console.log('[SW] Performing content synchronization');
  // Sync latest content versions
}

async function syncAnalyticsData() {
  console.log('[SW] Syncing analytics data');
  // Send cached analytics data
}

// Offline queue processing
async function processOfflineQueue() {
  if (!navigator.onLine) return;

  const pendingActions = offlineQueue.getPendingActions();

  for (const action of pendingActions) {
    try {
      await processOfflineAction(action);
      offlineQueue.markCompleted(action.id);
    } catch (error) {
      offlineQueue.markFailed(action.id, error.message);

      // Retry logic
      if (action.retryCount < 3) {
        // Schedule retry with exponential backoff
        setTimeout(() => processOfflineQueue(), Math.pow(2, action.retryCount) * 1000);
      }
    }
  }
}

async function processOfflineAction(action) {
  // Process individual offline action
  console.log('[SW] Processing offline action:', action.action.type);

  // Implementation depends on action type
  switch (action.action.type) {
    case 'save_project':
      // Sync project save
      break;
    case 'export_video':
      // Sync export
      break;
    default:
      console.warn('[SW] Unknown offline action type:', action.action.type);
  }
}

// Utility functions
async function registerBackgroundSync(tag, options = {}) {
  try {
    await self.registration.sync.register(tag, options);
    console.log(`[SW] Registered background sync: ${tag}`);
  } catch (error) {
    console.warn(`[SW] Failed to register background sync: ${tag}`, error);
  }
}

async function cacheResource(url, config = {}) {
  const cache = await caches.open(CACHE_NAME);
  const request = new Request(url);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response);
      console.log(`[SW] Cached resource: ${url}`);
    }
  } catch (error) {
    console.warn(`[SW] Failed to cache resource: ${url}`, error);
  }
}

async function getCacheInfo() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();

  let totalSize = 0;
  const resources = [];

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength, 10) : 0;
      totalSize += size;

      resources.push({
        url: request.url,
        size,
        cachedAt: response.headers.get('sw-cache-date') || 'unknown'
      });
    }
  }

  return {
    name: CACHE_NAME,
    entries: keys.length,
    totalSize,
    resources: resources.slice(0, 20) // Limit for performance
  };
}

async function clearOldCache() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();

  let removedCount = 0;
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const cacheDate = new Date(response.headers.get('sw-cache-date') || 0);
      const age = Date.now() - cacheDate.getTime();

      if (age > maxAge) {
        await cache.delete(request);
        removedCount++;
      }
    }
  }

  console.log(`[SW] Cleared ${removedCount} old cache entries`);
}

async function optimizeCacheSize() {
  const cacheInfo = await getCacheInfo();
  const maxSize = 500 * 1024 * 1024; // 500MB

  if (cacheInfo.totalSize > maxSize) {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();

    // Sort by cache date (oldest first)
    const sortedKeys = await Promise.all(
      keys.map(async (request) => {
        const response = await cache.match(request);
        const cacheDate = new Date(response?.headers.get('sw-cache-date') || 0);
        return { request, cacheDate };
      })
    );

    sortedKeys.sort((a, b) => a.cacheDate.getTime() - b.cacheDate.getTime());

    // Remove oldest entries until under limit
    let removedSize = 0;
    for (const { request } of sortedKeys) {
      if (cacheInfo.totalSize - removedSize <= maxSize * 0.8) break;

      const response = await cache.match(request);
      if (response) {
        const contentLength = response.headers.get('content-length');
        const size = contentLength ? parseInt(contentLength, 10) : 0;

        await cache.delete(request);
        removedSize += size;
      }
    }

    console.log(`[SW] Optimized cache size, removed ${removedSize} bytes`);
  }
}

// Error handling
self.addEventListener('error', (event) => {
  console.error('[SW] Runtime error:', event.error, event.filename, event.lineno);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

// Network status monitoring
let isOnline = navigator.onLine;

self.addEventListener('online', () => {
  isOnline = true;
  console.log('[SW] Back online, processing offline queue');
  processOfflineQueue();
});

self.addEventListener('offline', () => {
  isOnline = false;
  console.log('[SW] Gone offline');
});

// Initialize offline queue processing
setInterval(processOfflineQueue, 30000);

// Cache cleanup
setInterval(clearOldCache, 24 * 60 * 60 * 1000); // Daily cleanup

console.log('[SW] Enhanced service worker loaded and ready');
