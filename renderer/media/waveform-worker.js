'use strict';

/**
 * Artone Waveform Worker - Unified waveform processing with basic and enhanced features
 * Integrates both standard and advanced caching, batch processing, and visualization support
 */

(function initWaveformWorker(global) {
  if (typeof global !== 'object' || !global) {
    throw new Error('Waveform worker requires a valid global scope');
  }

  // Configuration flags for feature selection
  const config = {
    enableEnhancedFeatures: true, // Set to false for basic mode
    targetBuckets: 1200,
    maxBuckets: 8192,
    batchSize: 5,
    cacheVersion: '1.0.0',
    enablePersistentCache: true,
    cacheMaxAge: 3600000, // 1 hour
    cacheMaxEntries: 100
  };

  // Basic cache for standard mode
  const basicCache = new Map();
  const basicBatchQueue = [];
  const basicActiveBatches = new Set();
  let basicIsProcessingBatch = false;

  // Enhanced cache with IndexedDB for advanced mode
  class PersistentCache {
    constructor() {
      this.memoryCache = new Map();
      this.dbName = 'artone-waveform-cache';
      this.storeName = 'waveforms';
      this.db = null;
      this.initPromise = this.initDB();
    }

    async initDB() {
      if (!config.enableEnhancedFeatures || typeof indexedDB === 'undefined') {
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
      if (!config.enableEnhancedFeatures) return null;

      await this.initPromise;
      if (!this.db) return null;

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          if (result && Date.now() - result.timestamp < config.cacheMaxAge) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    }

    async set(key, data, metadata = {}) {
      if (!config.enableEnhancedFeatures) return;

      await this.initPromise;
      if (!this.db) return;

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const entry = {
          key,
          data,
          timestamp: Date.now(),
          ...metadata
        };

        const request = store.put(entry);

        request.onsuccess = () => {
          this.memoryCache.set(key, { ...entry, cached: true });
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    }
  }

  const persistentCache = new PersistentCache();

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toCacheKey(clipId, resolution) {
    return `${clipId || 'unknown'}::${resolution || 'auto'}`;
  }

  // Basic waveform processing
  function processWaveformBasic(audioBuffer, options = {}) {
    const { targetBuckets = config.targetBuckets, resolution = 'auto' } = options;
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.floor(channelData.length / targetBuckets);
    const waveform = [];

    for (let i = 0; i < targetBuckets; i++) {
      const start = i * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, channelData.length);
      let sum = 0;

      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j]);
      }

      waveform.push(sum / (end - start));
    }

    return waveform;
  }

  // Enhanced waveform processing with better quality
  async function processWaveformEnhanced(audioBuffer, options = {}) {
    if (!config.enableEnhancedFeatures) {
      return processWaveformBasic(audioBuffer, options);
    }

    const { targetBuckets = config.targetBuckets, resolution = 'auto' } = options;
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.floor(channelData.length / targetBuckets);
    const waveform = [];

    // Use RMS calculation for better audio representation
    for (let i = 0; i < targetBuckets; i++) {
      const start = i * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, channelData.length);
      let sumSquares = 0;

      for (let j = start; j < end; j++) {
        sumSquares += channelData[j] * channelData[j];
      }

      const rms = Math.sqrt(sumSquares / (end - start));
      waveform.push(rms);
    }

    return waveform;
  }

  // Batch processing for basic mode
  function processBasicBatch() {
    if (basicIsProcessingBatch || basicBatchQueue.length === 0) return;

    basicIsProcessingBatch = true;
    const batch = basicBatchQueue.splice(0, config.batchSize);

    batch.forEach(({ id, audioBuffer, options, resolve, reject }) => {
      try {
        const waveform = processWaveformBasic(audioBuffer, options);
        resolve({ id, waveform });
      } catch (error) {
        reject({ id, error: error.message });
      }
    });

    basicIsProcessingBatch = false;

    if (basicBatchQueue.length > 0) {
      setTimeout(processBasicBatch, 0);
    }
  }

  // Batch processing for enhanced mode
  async function processEnhancedBatch() {
    if (basicBatchQueue.length === 0) return;

    const batch = basicBatchQueue.splice(0, config.batchSize);

    for (const { id, audioBuffer, options, resolve, reject } of batch) {
      try {
        const waveform = await processWaveformEnhanced(audioBuffer, options);
        resolve({ id, waveform });
      } catch (error) {
        reject({ id, error: error.message });
      }
    }

    if (basicBatchQueue.length > 0) {
      setTimeout(processEnhancedBatch, 0);
    }
  }

  // Main processing function
  async function processWaveform(audioBuffer, options = {}) {
    const { clipId, resolution = 'auto' } = options;
    const cacheKey = toCacheKey(clipId, resolution);

    // Check cache first
    if (config.enableEnhancedFeatures) {
      const cached = await persistentCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    } else {
      const cached = basicCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < config.cacheMaxAge) {
        return cached.data;
      }
    }

    // Process waveform
    const waveform = config.enableEnhancedFeatures
      ? await processWaveformEnhanced(audioBuffer, options)
      : processWaveformBasic(audioBuffer, options);

    // Cache the result
    if (config.enableEnhancedFeatures) {
      await persistentCache.set(cacheKey, waveform, { clipId, resolution });
    } else {
      basicCache.set(cacheKey, { data: waveform, timestamp: Date.now() });
      // Clean up old cache entries
      if (basicCache.size > config.cacheMaxEntries) {
        const oldestKey = basicCache.keys().next().value;
        basicCache.delete(oldestKey);
      }
    }

    return waveform;
  }

  // Message handling
  global.addEventListener('message', async (event) => {
    const { type, payload } = event.data;

    switch (type) {
      case 'PROCESS_WAVEFORM':
        try {
          const { id, audioBuffer, options } = payload;
          const waveform = await processWaveform(audioBuffer, options);
          global.postMessage({ type: 'WAVEFORM_RESULT', payload: { id, waveform } });
        } catch (error) {
          global.postMessage({ type: 'WAVEFORM_ERROR', payload: { id: payload.id, error: error.message } });
        }
        break;

      case 'BATCH_PROCESS':
        const { batch } = payload;
        basicBatchQueue.push(...batch.map(item => ({
          ...item,
          resolve: (result) => global.postMessage({ type: 'BATCH_RESULT', payload: result }),
          reject: (error) => global.postMessage({ type: 'BATCH_ERROR', payload: error })
        })));

        if (config.enableEnhancedFeatures) {
          processEnhancedBatch();
        } else {
          processBasicBatch();
        }
        break;

      case 'CLEAR_CACHE':
        if (config.enableEnhancedFeatures) {
          persistentCache.memoryCache.clear();
        } else {
          basicCache.clear();
        }
        global.postMessage({ type: 'CACHE_CLEARED' });
        break;

      case 'SET_CONFIG':
        Object.assign(config, payload);
        global.postMessage({ type: 'CONFIG_UPDATED' });
        break;

      default:
        global.postMessage({ type: 'ERROR', payload: { message: `Unknown message type: ${type}` } });
    }
  });

  // Initialize
  global.postMessage({ type: 'WORKER_READY' });

})(typeof self !== 'undefined' ? self : globalThis);
