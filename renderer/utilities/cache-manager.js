'use strict';

(function registerCacheManager(global) {
  // Advanced caching system with multiple storage strategies

  class CacheManager {
    constructor(options = {}) {
      this.maxMemorySize = options.maxMemorySize || 100 * 1024 * 1024; // 100MB
      this.maxIndexedDBSize = options.maxIndexedDBSize || 500 * 1024 * 1024; // 500MB
      this.compressionThreshold = options.compressionThreshold || 10 * 1024; // 10KB

      this.memoryCache = new Map();
      this.indexedDBCache = null;
      this.compressionWorker = null;

      this.stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        compressionSaved: 0
      };

      this.initializeIndexedDB();
      this.initializeCompressionWorker();
    }

    async initializeIndexedDB() {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB not available');
        return;
      }

      try {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('artone-cache', 2);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);

          request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('cache')) {
              const store = db.createObjectStore('cache', { keyPath: 'key' });
              store.createIndex('timestamp', 'timestamp', { unique: false });
              store.createIndex('size', 'size', { unique: false });
              store.createIndex('type', 'type', { unique: false });
            }
          };
        });

        this.indexedDBCache = db;
        console.log('IndexedDB cache initialized');
      } catch (error) {
        console.error('Failed to initialize IndexedDB cache:', error);
      }
    }

    initializeCompressionWorker() {
      if (typeof Worker === 'undefined') {
        console.warn('Web Workers not available, compression disabled');
        return;
      }

      try {
        const workerCode = `
          self.addEventListener('message', async (event) => {
            const { id, action, data } = event.data;

            try {
              if (action === 'compress') {
                const compressed = await compress(data);
                self.postMessage({ id, result: compressed, success: true });
              } else if (action === 'decompress') {
                const decompressed = await decompress(data);
                self.postMessage({ id, result: decompressed, success: true });
              }
            } catch (error) {
              self.postMessage({ id, error: error.message, success: false });
            }
          });

          async function compress(data) {
            const stream = new CompressionStream('gzip');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();

            writer.write(new TextEncoder().encode(JSON.stringify(data)));
            writer.close();

            const chunks = [];
            let done = false;

            while (!done) {
              const { value, done: readerDone } = await reader.read();
              done = readerDone;
              if (value) chunks.push(value);
            }

            return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
          }

          async function decompress(compressedData) {
            const stream = new DecompressionStream('gzip');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();

            writer.write(compressedData);
            writer.close();

            const chunks = [];
            let done = false;

            while (!done) {
              const { value, done: readerDone } = await reader.read();
              done = readerDone;
              if (value) chunks.push(value);
            }

            const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
            return JSON.parse(new TextDecoder().decode(decompressed));
          }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.compressionWorker = new Worker(URL.createObjectURL(blob));

        console.log('Compression worker initialized');
      } catch (error) {
        console.error('Failed to initialize compression worker:', error);
      }
    }

    async get(key) {
      // Try memory cache first
      if (this.memoryCache.has(key)) {
        const entry = this.memoryCache.get(key);
        entry.lastAccess = Date.now();
        entry.accessCount++;
        this.stats.hits++;
        return entry.data;
      }

      // Try IndexedDB cache
      if (this.indexedDBCache) {
        try {
          const entry = await this.getFromIndexedDB(key);
          if (entry) {
            // Move to memory cache if frequently accessed
            if (entry.accessCount > 2) {
              this.setInMemory(key, entry.data, entry);
            }
            this.stats.hits++;
            return entry.compressed ? await this.decompress(entry.data) : entry.data;
          }
        } catch (error) {
          console.error('IndexedDB get error:', error);
        }
      }

      this.stats.misses++;
      return null;
    }

    async set(key, data, options = {}) {
      const size = this.estimateSize(data);
      const type = options.type || 'default';
      const ttl = options.ttl || null;
      const priority = options.priority || 1;

      const entry = {
        key,
        data,
        size,
        type,
        timestamp: Date.now(),
        lastAccess: Date.now(),
        accessCount: 1,
        ttl,
        priority,
        compressed: false
      };

      // Store in memory cache if small enough
      if (size < this.maxMemorySize / 10) {
        this.setInMemory(key, data, entry);
      }

      // Store in IndexedDB for persistence
      if (this.indexedDBCache && size < this.maxIndexedDBSize / 20) {
        try {
          // Compress large data
          if (size > this.compressionThreshold && this.compressionWorker) {
            const compressed = await this.compress(data);
            if (compressed && compressed.length < size * 0.8) {
              entry.data = compressed;
              entry.compressed = true;
              entry.originalSize = size;
              entry.size = compressed.length;
              this.stats.compressionSaved += size - compressed.length;
            }
          }

          await this.setInIndexedDB(key, entry);
        } catch (error) {
          console.error('IndexedDB set error:', error);
        }
      }
    }

    setInMemory(key, data, entry) {
      // Check memory usage and evict if needed
      while (this.getMemoryUsage() > this.maxMemorySize) {
        this.evictFromMemory();
      }

      this.memoryCache.set(key, entry);
    }

    async setInIndexedDB(key, entry) {
      return new Promise((resolve, reject) => {
        const transaction = this.indexedDBCache.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async getFromIndexedDB(key) {
      return new Promise((resolve, reject) => {
        const transaction = this.indexedDBCache.transaction(['cache'], 'readonly');
        const store = transaction.objectStore('cache');
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            // Check TTL
            if (result.ttl && Date.now() > result.timestamp + result.ttl) {
              this.delete(key);
              resolve(null);
            } else {
              // Update access info
              result.lastAccess = Date.now();
              result.accessCount++;
              this.setInIndexedDB(key, result);
              resolve(result);
            }
          } else {
            resolve(null);
          }
        };

        request.onerror = () => reject(request.error);
      });
    }

    async delete(key) {
      this.memoryCache.delete(key);

      if (this.indexedDBCache) {
        try {
          await new Promise((resolve, reject) => {
            const transaction = this.indexedDBCache.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        } catch (error) {
          console.error('IndexedDB delete error:', error);
        }
      }
    }

    evictFromMemory() {
      if (this.memoryCache.size === 0) return;

      // Find least recently used item with lowest priority
      let lruKey = null;
      let lruScore = Infinity;

      for (const [key, entry] of this.memoryCache) {
        const score = (entry.lastAccess * entry.priority) / entry.accessCount;
        if (score < lruScore) {
          lruScore = score;
          lruKey = key;
        }
      }

      if (lruKey) {
        this.memoryCache.delete(lruKey);
        this.stats.evictions++;
      }
    }

    async compress(data) {
      if (!this.compressionWorker) return null;

      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substr(2, 9);

        const timeout = setTimeout(() => {
          reject(new Error('Compression timeout'));
        }, 5000);

        const handler = (event) => {
          if (event.data.id === id) {
            clearTimeout(timeout);
            this.compressionWorker.removeEventListener('message', handler);

            if (event.data.success) {
              resolve(event.data.result);
            } else {
              reject(new Error(event.data.error));
            }
          }
        };

        this.compressionWorker.addEventListener('message', handler);
        this.compressionWorker.postMessage({ id, action: 'compress', data });
      });
    }

    async decompress(compressedData) {
      if (!this.compressionWorker) return compressedData;

      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substr(2, 9);

        const timeout = setTimeout(() => {
          reject(new Error('Decompression timeout'));
        }, 5000);

        const handler = (event) => {
          if (event.data.id === id) {
            clearTimeout(timeout);
            this.compressionWorker.removeEventListener('message', handler);

            if (event.data.success) {
              resolve(event.data.result);
            } else {
              reject(new Error(event.data.error));
            }
          }
        };

        this.compressionWorker.addEventListener('message', handler);
        this.compressionWorker.postMessage({ id, action: 'decompress', data: compressedData });
      });
    }

    getMemoryUsage() {
      let total = 0;
      for (const entry of this.memoryCache.values()) {
        total += entry.size;
      }
      return total;
    }

    estimateSize(data) {
      return new TextEncoder().encode(JSON.stringify(data)).length;
    }

    async cleanup() {
      const now = Date.now();
      const keysToDelete = [];

      // Clean memory cache
      for (const [key, entry] of this.memoryCache) {
        if (entry.ttl && now > entry.timestamp + entry.ttl) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.memoryCache.delete(key));

      // Clean IndexedDB cache
      if (this.indexedDBCache) {
        try {
          await new Promise((resolve) => {
            const transaction = this.indexedDBCache.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.openCursor();

            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                const entry = cursor.value;
                if (entry.ttl && now > entry.timestamp + entry.ttl) {
                  cursor.delete();
                }
                cursor.continue();
              } else {
                resolve();
              }
            };
          });
        } catch (error) {
          console.error('Cache cleanup error:', error);
        }
      }
    }

    getStats() {
      return {
        ...this.stats,
        memoryUsage: this.getMemoryUsage(),
        memoryCacheSize: this.memoryCache.size,
        memoryUsageFormatted: this.formatBytes(this.getMemoryUsage()),
        compressionSavedFormatted: this.formatBytes(this.stats.compressionSaved),
        hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
      };
    }

    formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
  }

  // Export cache manager
  global.CacheManager = CacheManager;

  // Create default instance
  global.defaultCache = new CacheManager();

})(typeof window !== 'undefined' ? window : globalThis);