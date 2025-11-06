'use strict';

(function initEnhancedWaveformWorker(global) {
  if (typeof global !== 'object' || !global) {
    throw new Error('Enhanced waveform worker requires a valid global scope');
  }

  const TARGET_BUCKETS = 1200;
  const MAX_BUCKETS = 8192;
  const BATCH_SIZE = 5; // Process up to 5 waveforms in parallel
  const CACHE_VERSION = '1.0.0';

  // Enhanced cache with IndexedDB persistence
  class PersistentCache {
    constructor() {
      this.memoryCache = new Map();
      this.dbName = 'artone-waveform-cache';
      this.storeName = 'waveforms';
      this.db = null;
      this.initPromise = this.initDB();
    }

    async initDB() {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB not available, using memory cache only');
        return;
      }

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);

        request.onerror = () => {
          console.error('Failed to open IndexedDB:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains(this.storeName)) {
            const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
            store.createIndex('clipId', 'clipId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });
    }

    async get(key) {
      // Try memory cache first
      if (this.memoryCache.has(key)) {
        return this.memoryCache.get(key);
      }

      // Try persistent cache
      if (this.db) {
        try {
          await this.initPromise;
          return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
              const result = request.result;
              if (result && result.version === CACHE_VERSION) {
                // Load into memory cache for faster access
                this.memoryCache.set(key, result.data);
                resolve(result.data);
              } else {
                resolve(null);
              }
            };

            request.onerror = () => {
              console.error('Failed to get from IndexedDB:', request.error);
              resolve(null);
            };
          });
        } catch (error) {
          console.error('IndexedDB get error:', error);
          return null;
        }
      }

      return null;
    }

    async set(key, value, clipId = null) {
      // Store in memory cache
      this.memoryCache.set(key, value);

      // Store in persistent cache
      if (this.db) {
        try {
          await this.initPromise;
          return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const record = {
              key,
              clipId,
              data: value,
              timestamp: Date.now(),
              version: CACHE_VERSION
            };

            const request = store.put(record);

            request.onsuccess = () => resolve();
            request.onerror = () => {
              console.error('Failed to save to IndexedDB:', request.error);
              resolve(); // Don't fail the operation
            };
          });
        } catch (error) {
          console.error('IndexedDB set error:', error);
        }
      }
    }

    async delete(key) {
      this.memoryCache.delete(key);

      if (this.db) {
        try {
          await this.initPromise;
          return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => {
              console.error('Failed to delete from IndexedDB:', request.error);
              resolve();
            };
          });
        } catch (error) {
          console.error('IndexedDB delete error:', error);
        }
      }
    }

    async deleteByClipId(clipId) {
      // Clear from memory cache
      const keysToDelete = [];
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(`${clipId}::`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.memoryCache.delete(key));

      // Clear from persistent cache
      if (this.db) {
        try {
          await this.initPromise;
          return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('clipId');
            const request = index.openCursor(IDBKeyRange.only(clipId));

            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              } else {
                resolve();
              }
            };

            request.onerror = () => {
              console.error('Failed to delete by clipId:', request.error);
              resolve();
            };
          });
        } catch (error) {
          console.error('IndexedDB deleteByClipId error:', error);
        }
      }
    }

    async clear() {
      this.memoryCache.clear();

      if (this.db) {
        try {
          await this.initPromise;
          return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => {
              console.error('Failed to clear IndexedDB:', request.error);
              resolve();
            };
          });
        } catch (error) {
          console.error('IndexedDB clear error:', error);
        }
      }
    }

    async cleanOldEntries(maxAge = 7 * 24 * 60 * 60 * 1000) {
      // Clean entries older than maxAge (default: 7 days)
      if (this.db) {
        try {
          await this.initPromise;
          const cutoff = Date.now() - maxAge;

          return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                const key = cursor.value.key;
                this.memoryCache.delete(key);
                cursor.delete();
                cursor.continue();
              } else {
                resolve();
              }
            };

            request.onerror = () => {
              console.error('Failed to clean old entries:', request.error);
              resolve();
            };
          });
        } catch (error) {
          console.error('Clean old entries error:', error);
        }
      }
    }

    getMemoryUsage() {
      return {
        memoryCacheSize: this.memoryCache.size,
        estimatedMemoryBytes: this.estimateMemoryUsage()
      };
    }

    estimateMemoryUsage() {
      let totalSize = 0;
      for (const value of this.memoryCache.values()) {
        if (value && value.buckets) {
          totalSize += value.buckets.length * 16; // Approximate bytes per bucket
        }
      }
      return totalSize;
    }
  }

  // Batch processor for multiple waveform requests
  class BatchProcessor {
    constructor(cache) {
      this.cache = cache;
      this.queue = [];
      this.processing = false;
      this.batchTimeout = null;
    }

    async addToQueue(request) {
      this.queue.push(request);

      // Start batch processing after a short delay
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.processBatch();
          this.batchTimeout = null;
        }, 10);
      }
    }

    async processBatch() {
      if (this.processing || this.queue.length === 0) {
        return;
      }

      this.processing = true;
      const batch = this.queue.splice(0, BATCH_SIZE);

      // Process in parallel
      const promises = batch.map(async (request) => {
        try {
          const result = await this.processRequest(request);
          postMessage({
            type: 'WAVEFORM_READY',
            clipId: request.clipId,
            resolution: request.resolution,
            data: result,
            cached: request.cached ?? false,
            batchId: request.batchId
          });
        } catch (error) {
          postMessage({
            type: 'WAVEFORM_ERROR',
            clipId: request.clipId,
            resolution: request.resolution,
            message: error.message,
            stack: error.stack,
            batchId: request.batchId
          });
        }
      });

      await Promise.all(promises);
      this.processing = false;

      // Process next batch if queue is not empty
      if (this.queue.length > 0) {
        this.processBatch();
      }
    }

    async processRequest(request) {
      const cacheKey = this.toCacheKey(request.clipId, request.resolution);

      // Check cache first
      if (!request.force) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          request.cached = true;
          return cached;
        }
      }

      // Generate new waveform
      const result = this.computeWaveform(request.payload);

      // Save to cache
      await this.cache.set(cacheKey, result, request.clipId);

      return result;
    }

    toCacheKey(clipId, resolution) {
      return `${clipId || 'unknown'}::${resolution || 'auto'}`;
    }

    computeWaveform(payload) {
      const {
        clipId,
        sampleRate,
        channelData,
        startTime = 0,
        endTime = null,
        targetBuckets = TARGET_BUCKETS
      } = payload;

      if (!Array.isArray(channelData) || channelData.length === 0) {
        throw new Error('Waveform generation requires channelData arrays');
      }

      const firstChannel = channelData[0];
      if (!(firstChannel instanceof Float32Array)) {
        throw new Error('channelData must contain Float32Array instances');
      }

      const totalSamples = firstChannel.length;
      const clippedStart = Math.max(0, Math.floor(startTime * sampleRate));
      const clippedEnd = Math.min(
        totalSamples,
        endTime === null ? totalSamples : Math.floor(endTime * sampleRate)
      );

      const sampleCount = clippedEnd - clippedStart;
      const bucketSize = Math.max(1, Math.ceil(sampleCount / Math.min(targetBuckets, MAX_BUCKETS)));

      const buckets = [];
      for (let offset = clippedStart; offset < clippedEnd; offset += bucketSize) {
        const bucketEnd = Math.min(clippedEnd, offset + bucketSize);
        let min = 0;
        let max = 0;
        let sum = 0;
        let count = 0;

        for (let channelIndex = 0; channelIndex < channelData.length; channelIndex++) {
          const channel = channelData[channelIndex];
          for (let i = offset; i < bucketEnd; i++) {
            const sample = channel[i] || 0;
            min = Math.min(min, sample);
            max = Math.max(max, sample);
            sum += sample;
            count++;
          }
        }

        const average = count > 0 ? sum / count : 0;
        buckets.push({ min, max, average });
      }

      return {
        clipId,
        sampleRate,
        startTime: clippedStart / sampleRate,
        endTime: clippedEnd / sampleRate,
        bucketSize,
        buckets,
        bucketCount: buckets.length,
        totalSamples: sampleCount
      };
    }
  }

  // Initialize cache and processor
  const cache = new PersistentCache();
  const processor = new BatchProcessor(cache);

  // Message handlers
  async function handleMessage(event) {
    const message = event && event.data ? event.data : {};

    switch (message.type) {
      case 'INIT':
        // Clean old cache entries on init
        await cache.cleanOldEntries();
        postMessage({
          type: 'WAVEFORM_INIT',
          targetBuckets: TARGET_BUCKETS,
          features: ['persistent-cache', 'batch-processing', 'memory-optimization']
        });
        break;

      case 'GENERATE_WAVEFORM':
        processor.addToQueue(message);
        break;

      case 'BATCH_GENERATE':
        // Process multiple waveforms at once
        if (Array.isArray(message.requests)) {
          message.requests.forEach(request => {
            request.batchId = message.batchId;
            processor.addToQueue(request);
          });
        }
        break;

      case 'EVICT_WAVEFORM':
        await cache.deleteByClipId(message.clipId);
        postMessage({ type: 'WAVEFORM_EVICTED', clipId: message.clipId });
        break;

      case 'CLEAR_CACHE':
        await cache.clear();
        postMessage({ type: 'WAVEFORM_CACHE_CLEARED' });
        break;

      case 'GET_CACHE_STATUS':
        const usage = cache.getMemoryUsage();
        postMessage({
          type: 'CACHE_STATUS',
          ...usage,
          persistentCacheAvailable: cache.db !== null
        });
        break;

      case 'CLEAN_OLD_CACHE':
        await cache.cleanOldEntries(message.maxAge);
        postMessage({ type: 'CACHE_CLEANED' });
        break;

      default:
        postMessage({
          type: 'WAVEFORM_UNKNOWN_MESSAGE',
          originalType: message.type || null
        });
        break;
    }
  }

  global.addEventListener('message', handleMessage);

  postMessage({
    type: 'WAVEFORM_WORKER_READY',
    version: '2.0.0',
    features: ['persistent-cache', 'batch-processing', 'memory-optimization']
  });
})(typeof self !== 'undefined' ? self : globalThis);