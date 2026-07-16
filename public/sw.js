/**
 * Artone v3 — Service Worker
 *
 * オフライン対応 + PWAキャッシュ戦略
 * 設計: Carmack (高速), Pike (シンプル), Martin (戦略分離)
 *
 * キャッシュ戦略:
 * - 静的アセット: Cache-First (HTML, JS, CSS, 画像)
 * - APIレスポンス: Network-First (フォールバック付き)
 * - メディアファイル: Cache-First (大容量を意識)
 * - AIモデル: Cache-First (一度ダウンロードしたら永続)
 *
 * @version 3.0.0
 */

const CACHE_VERSION = 'v3.1.0';
const CACHE_PREFIX = 'artone';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const MEDIA_CACHE = `${CACHE_PREFIX}-media-${CACHE_VERSION}`;
const MODEL_CACHE = `${CACHE_PREFIX}-models-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

const STATIC_EXT = /\.(js|css|woff2?|ttf|otf|eot)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|webp|svg|gif|ico)$/i;
const MEDIA_EXT = /\.(mp4|webm|mov|mkv|mp3|wav|flac|ogg)$/i;
const MODEL_EXT = /\.(onnx|gguf|bin|safetensors)$/i;

// ============================================================
// Install
// ============================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((e) => {
        console.warn('Precache partial failure:', e);
      });
    })
  );
  self.skipWaiting();
});

// ============================================================
// Activate (古いキャッシュ削除)
// ============================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(
            (k) =>
              k.startsWith(CACHE_PREFIX) &&
              !k.endsWith(CACHE_VERSION)
          )
          .map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// ============================================================
// Fetch
// ============================================================

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin && !isAllowedCrossOrigin(url)) return;

  // Strategy selection
  if (MODEL_EXT.test(url.pathname)) {
    event.respondWith(cacheFirst(req, MODEL_CACHE));
  } else if (MEDIA_EXT.test(url.pathname)) {
    event.respondWith(cacheFirstWithRange(req, MEDIA_CACHE));
  } else if (STATIC_EXT.test(url.pathname) || IMAGE_EXT.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
  } else if (req.mode === 'navigate') {
    event.respondWith(navigationStrategy(req));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
  } else {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
  }
});

function isAllowedCrossOrigin(url) {
  const allowed = [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'huggingface.co',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  return allowed.some((d) => url.hostname.endsWith(d));
}

// ============================================================
// Strategies
// ============================================================

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const response = await fetch(req);
    if (response.ok) {
      cache.put(req, response.clone());
    }
    return response;
  } catch (e) {
    return errorResponse(503, 'Network unavailable');
  }
}

async function cacheFirstWithRange(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    const range = req.headers.get('range');
    if (range && cached.body) return rangeResponse(cached, range);
    return cached;
  }
  try {
    const response = await fetch(req);
    if (response.ok && response.status === 200) {
      cache.put(req, response.clone());
    }
    return response;
  } catch (e) {
    return errorResponse(503, 'Media unavailable offline');
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(req);
    if (response.ok) {
      cache.put(req, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return errorResponse(503, 'API unavailable');
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((response) => {
      if (response.ok) cache.put(req, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function navigationStrategy(req) {
  try {
    const response = await fetch(req);
    return response;
  } catch (e) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match('/index.html') || await cache.match('/');
    if (cached) return cached;
    return errorResponse(503, 'Offline');
  }
}

// ============================================================
// Range Request Support (動画再生用)
// ============================================================

async function rangeResponse(response, rangeHeader) {
  const body = await response.arrayBuffer();
  const total = body.byteLength;
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return response;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : total - 1;
  const chunk = body.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(chunk.byteLength),
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Accept-Ranges': 'bytes'
    }
  });
}

function errorResponse(status, message) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// ============================================================
// Message Handler (キャッシュ操作)
// ============================================================

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'CACHE_STATUS': {
      const status = await getCacheStatus();
      event.ports[0]?.postMessage(status);
      break;
    }
    case 'CLEAR_CACHE': {
      const target = payload?.cacheName;
      if (target) {
        await caches.delete(target);
      } else {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      event.ports[0]?.postMessage({ success: true });
      break;
    }
    case 'PREFETCH': {
      const urls = payload?.urls || [];
      const cache = await caches.open(RUNTIME_CACHE);
      await Promise.allSettled(
        urls.map((u) => cache.add(u))
      );
      event.ports[0]?.postMessage({ prefetched: urls.length });
      break;
    }
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

async function getCacheStatus() {
  const keys = await caches.keys();
  const result = {};
  for (const key of keys) {
    const cache = await caches.open(key);
    const requests = await cache.keys();
    let totalSize = 0;
    for (const req of requests) {
      const res = await cache.match(req);
      if (res) {
        const blob = await res.blob();
        totalSize += blob.size;
      }
    }
    result[key] = {
      count: requests.length,
      sizeBytes: totalSize
    };
  }
  return result;
}

// ============================================================
// Background Sync
// ============================================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-projects') {
    event.waitUntil(syncProjects());
  }
});

async function syncProjects() {
  // クライアントに通知を送る
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_TRIGGERED', tag: 'sync-projects' });
  }
}

// ============================================================
// Push Notifications
// ============================================================

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Artone', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: data.data
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
