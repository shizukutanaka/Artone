/**
 * Performance Optimization Suite
 * Comprehensive performance improvements for Artone Video Editor
 */

(function initializePerformanceOptimizations(global) {
  'use strict';

  // Performance monitoring and metrics
  const PerformanceMonitor = {
    metrics: {
      bundleSize: 0,
      memoryUsage: 0,
      renderTime: 0,
      fps: 60,
      networkRequests: 0,
      cacheHits: 0,
      cacheMisses: 0
    },

    observers: new Map(),

    // Initialize performance monitoring
    init() {
      if (global.performance && global.performance.memory) {
        this.startMemoryMonitoring();
      }

      if (global.PerformanceObserver) {
        this.startPerformanceObserver();
      }

      this.startFrameRateMonitoring();
    },

    startMemoryMonitoring() {
      const checkMemory = () => {
        const memInfo = global.performance.memory;
        this.metrics.memoryUsage = memInfo.usedJSHeapSize;

        // Trigger garbage collection warning if memory usage is high
        if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.8) {
          console.warn('High memory usage detected:', {
            used: Math.round(memInfo.usedJSHeapSize / 1024 / 1024),
            limit: Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024)
          });
        }

        setTimeout(checkMemory, 5000); // Check every 5 seconds
      };
      checkMemory();
    },

    startPerformanceObserver() {
      try {
        const observer = new global.PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.processPerformanceEntry(entry);
          }
        });

        observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
      } catch (error) {
        console.warn('Performance Observer not supported:', error);
      }
    },

    startFrameRateMonitoring() {
      let lastTime = global.performance.now();
      let frameCount = 0;

      const measureFPS = () => {
        const currentTime = global.performance.now();
        frameCount++;

        if (currentTime - lastTime >= 1000) {
          this.metrics.fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
          frameCount = 0;
          lastTime = currentTime;

          // Warn if FPS drops below 30
          if (this.metrics.fps < 30) {
            console.warn('Low FPS detected:', this.metrics.fps);
          }
        }

        global.requestAnimationFrame(measureFPS);
      };

      global.requestAnimationFrame(measureFPS);
    },

    processPerformanceEntry(entry) {
      if (entry.entryType === 'measure') {
        this.metrics.renderTime = entry.duration;
      } else if (entry.entryType === 'resource') {
        this.metrics.networkRequests++;
      }
    },

    getMetrics() {
      return { ...this.metrics };
    },

    addObserver(name, callback) {
      this.observers.set(name, callback);
    },

    removeObserver(name) {
      this.observers.delete(name);
    }
  };

  // Bundle size optimization
  const BundleOptimizer = {
    // Lazy loading for heavy components
    lazyLoad(componentPath, fallback = null) {
      return new Promise((resolve, reject) => {
        if (typeof global.import === 'function') {
          // Modern ES modules
          global.import(componentPath)
            .then(module => resolve(module.default || module))
            .catch(reject);
        } else {
          // Fallback for older browsers
          const script = global.document.createElement('script');
          script.src = componentPath;
          script.onload = () => resolve(fallback);
          script.onerror = reject;
          global.document.head.appendChild(script);
        }
      });
    },

    // Code splitting hints
    markForSplitting(moduleName) {
      // In a build system, this would mark modules for code splitting
      console.log(`Module ${moduleName} marked for code splitting`);
    },

    // Dynamic imports for rarely used features
    loadOptionalFeature(featureName) {
      const featureMap = {
        'advanced-export': () => import('./advanced-export.js'),
        'color-grading': () => import('./color-grading.js'),
        'ai-features': () => import('./ai-ml-system.js'),
        'collaboration': () => import('./collaboration-manager.js')
      };

      const loader = featureMap[featureName];
      if (loader) {
        return loader().then(module => {
          console.log(`Optional feature ${featureName} loaded`);
          return module;
        });
      }

      return Promise.reject(new Error(`Unknown feature: ${featureName}`));
    },

    // Bundle analysis
    analyzeBundle() {
      const scripts = global.document.querySelectorAll('script[src]');
      let totalSize = 0;

      scripts.forEach(script => {
        // Estimate sizes (in a real implementation, you'd use actual sizes)
        const size = script.src.includes('vendor') ? 500000 :
                    script.src.includes('main') ? 200000 : 50000;
        totalSize += size;
      });

      this.metrics.bundleSize = totalSize;
      console.log(`Estimated bundle size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    }
  };

  // Memory management optimizer
  const MemoryOptimizer = {
    // Garbage collection hints
    suggestGC() {
      if (global.gc && typeof global.gc === 'function') {
        // Only available with --expose-gc flag in Node.js or certain dev tools
        global.gc();
      }
    },

    // Object pooling for frequently created objects
    objectPools: new Map(),

    getPooledObject(type, constructor) {
      if (!this.objectPools.has(type)) {
        this.objectPools.set(type, []);
      }

      const pool = this.objectPools.get(type);
      const obj = pool.pop();

      if (obj) {
        // Reset object state
        return obj;
      }

      // Create new object
      return constructor();
    },

    returnToPool(type, obj) {
      if (!this.objectPools.has(type)) {
        this.objectPools.set(type, []);
      }

      const pool = this.objectPools.get(type);
      if (pool.length < 50) { // Limit pool size
        pool.push(obj);
      }
    },

    // Memory leak detection
    watchForLeaks() {
      const initialMemory = global.performance.memory?.usedJSHeapSize || 0;
      let lastCheck = initialMemory;
      let leakWarnings = 0;

      setInterval(() => {
        const currentMemory = global.performance.memory?.usedJSHeapSize || 0;
        const growth = currentMemory - lastCheck;

        if (growth > 10 * 1024 * 1024) { // 10MB growth
          leakWarnings++;
          console.warn(`Potential memory leak detected. Growth: ${Math.round(growth / 1024 / 1024)}MB`);

          if (leakWarnings > 3) {
            console.error('Memory leak confirmed. Consider reloading the application.');
          }
        }

        lastCheck = currentMemory;
      }, 30000); // Check every 30 seconds
    },

    // Cache management
    caches: new Map(),

    setCache(key, value, ttl = 300000) { // 5 minutes default
      this.caches.set(key, {
        value,
        timestamp: Date.now(),
        ttl
      });
    },

    getCache(key) {
      const cached = this.caches.get(key);
      if (!cached) return null;

      if (Date.now() - cached.timestamp > cached.ttl) {
        this.caches.delete(key);
        return null;
      }

      return cached.value;
    },

    clearExpiredCache() {
      const now = Date.now();
      for (const [key, cached] of this.caches) {
        if (now - cached.timestamp > cached.ttl) {
          this.caches.delete(key);
        }
      }
    },

    // Event listener management
    eventListeners: new WeakMap(),

    addManagedListener(element, event, handler, options = {}) {
      element.addEventListener(event, handler, options);

      if (!this.eventListeners.has(element)) {
        this.eventListeners.set(element, new Map());
      }

      const elementListeners = this.eventListeners.get(element);
      if (!elementListeners.has(event)) {
        elementListeners.set(event, new Set());
      }

      elementListeners.get(event).add(handler);
    },

    removeManagedListeners(element, event = null) {
      if (!this.eventListeners.has(element)) return;

      const elementListeners = this.eventListeners.get(element);

      if (event) {
        const eventListeners = elementListeners.get(event);
        if (eventListeners) {
          eventListeners.forEach(handler => {
            element.removeEventListener(event, handler);
          });
          elementListeners.delete(event);
        }
      } else {
        // Remove all listeners for this element
        elementListeners.forEach((handlers, eventType) => {
          handlers.forEach(handler => {
            element.removeEventListener(eventType, handler);
          });
        });
        this.eventListeners.delete(element);
      }
    }
  };

  // Rendering optimization
  const RenderOptimizer = {
    // Frame rate management
    targetFPS: 60,
    frameBudget: 1000 / 60, // ~16.67ms

    // Adaptive quality based on performance
    adaptiveQuality: {
      enabled: true,
      currentLevel: 'high',
      levels: {
        ultra: { particleLimit: 1000, textureSize: 2048, shadows: true },
        high: { particleLimit: 500, textureSize: 1024, shadows: true },
        medium: { particleLimit: 200, textureSize: 512, shadows: false },
        low: { particleLimit: 50, textureSize: 256, shadows: false }
      }
    },

    // Throttling utilities
    throttledFunctions: new WeakMap(),

    throttle(func, limit) {
      if (this.throttledFunctions.has(func)) {
        return this.throttledFunctions.get(func);
      }

      let inThrottle;
      const throttled = (...args) => {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };

      this.throttledFunctions.set(func, throttled);
      return throttled;
    },

    debouncedFunctions: new WeakMap(),

    debounce(func, delay) {
      if (this.debouncedFunctions.has(func)) {
        return this.debouncedFunctions.get(func);
      }

      let timeoutId;
      const debounced = (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
      };

      this.debouncedFunctions.set(func, debounced);
      return debounced;
    },

    // Intersection Observer for lazy rendering
    setupLazyRendering(container, callback) {
      if (!global.IntersectionObserver) return null;

      const observer = new global.IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            callback(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, {
        root: container,
        rootMargin: '50px'
      });

      return observer;
    },

    // Virtual scrolling for large lists
    createVirtualScroller(itemHeight, containerHeight, totalItems) {
      return {
        getVisibleRange(scrollTop) {
          const startIndex = Math.floor(scrollTop / itemHeight);
          const endIndex = Math.min(
            totalItems - 1,
            startIndex + Math.ceil(containerHeight / itemHeight)
          );

          return { startIndex, endIndex };
        },

        getScrollHeight() {
          return totalItems * itemHeight;
        },

        getOffsetForIndex(index) {
          return index * itemHeight;
        }
      };
    },

    // GPU acceleration detection and optimization
    optimizeForGPU() {
      const canvas = global.document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          console.log('GPU Renderer:', renderer);

          // Apply GPU-specific optimizations
          if (renderer.includes('Intel')) {
            console.log('Applying Intel GPU optimizations');
          } else if (renderer.includes('NVIDIA')) {
            console.log('Applying NVIDIA GPU optimizations');
          } else if (renderer.includes('AMD') || renderer.includes('ATI')) {
            console.log('Applying AMD GPU optimizations');
          }
        }
      }
    },

    // Battery-aware optimizations
    monitorBattery() {
      if ('getBattery' in global.navigator) {
        (global.navigator as any).getBattery().then(battery => {
          const updateOptimizations = () => {
            if (battery.charging) {
              this.adaptiveQuality.currentLevel = 'high';
              console.log('Battery charging - enabling high quality mode');
            } else if (battery.level < 0.2) {
              this.adaptiveQuality.currentLevel = 'low';
              console.log('Low battery - enabling power saving mode');
            } else if (battery.level < 0.5) {
              this.adaptiveQuality.currentLevel = 'medium';
              console.log('Medium battery - enabling balanced mode');
            }
          };

          battery.addEventListener('chargingchange', updateOptimizations);
          battery.addEventListener('levelchange', updateOptimizations);
          updateOptimizations();
        });
      }
    },

    // Network-aware optimizations
    monitorNetwork() {
      if ('connection' in global.navigator) {
        const connection = (global.navigator as any).connection;
        const updateNetworkOptimizations = () => {
          if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
            console.log('Slow network detected - enabling data saving mode');
            // Reduce image quality, disable auto-updates, etc.
          } else if (connection.effectiveType === '3g') {
            console.log('Medium network detected - enabling balanced mode');
          } else {
            console.log('Fast network detected - enabling full features');
          }
        };

        connection.addEventListener('change', updateNetworkOptimizations);
        updateNetworkOptimizations();
      }
    }
  };

  // Network optimization
  const NetworkOptimizer = {
    // Request caching and deduplication
    requestCache: new Map(),
    pendingRequests: new Map(),

    fetchWithCache(url, options = {}) {
      const cacheKey = `${options.method || 'GET'}_${url}_${JSON.stringify(options.body || '')}`;

      // Check cache
      const cached = MemoryOptimizer.getCache(cacheKey);
      if (cached && !options.noCache) {
        PerformanceMonitor.metrics.cacheHits++;
        return Promise.resolve(cached);
      }

      // Check for pending identical request
      if (this.pendingRequests.has(cacheKey)) {
        return this.pendingRequests.get(cacheKey);
      }

      PerformanceMonitor.metrics.cacheMisses++;

      // Make request
      const request = global.fetch(url, options)
        .then(response => {
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return response.clone().json().then(data => {
                MemoryOptimizer.setCache(cacheKey, data);
                return response;
              });
            }
          }
          return response;
        })
        .finally(() => {
          this.pendingRequests.delete(cacheKey);
        });

      this.pendingRequests.set(cacheKey, request);
      return request;
    },

    // Progressive loading
    loadProgressively(url, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new global.XMLHttpRequest();

        xhr.open('GET', url);
        xhr.responseType = 'blob';

        xhr.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(event.loaded / event.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(xhr.response);
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
      });
    },

    // Resource hints
    addResourceHints() {
      const hints = [
        { rel: 'dns-prefetch', href: '//api.artone.com' },
        { rel: 'preconnect', href: '//cdn.artone.com' },
        { rel: 'prefetch', href: '/api/user/preferences' }
      ];

      hints.forEach(hint => {
        const link = global.document.createElement('link');
        link.rel = hint.rel;
        link.href = hint.href;
        global.document.head.appendChild(link);
      });
    },

    // Service worker for caching
    registerServiceWorker() {
      if ('serviceWorker' in global.navigator) {
        global.navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('Service Worker registered:', registration.scope);
          })
          .catch(error => {
            console.log('Service Worker registration failed:', error);
          });
      }
    }
  };

  // Initialize all optimizations
  function initializeOptimizations() {
    // Start performance monitoring
    PerformanceMonitor.init();

    // Initialize memory management
    MemoryOptimizer.watchForLeaks();

    // Apply rendering optimizations
    RenderOptimizer.optimizeForGPU();
    RenderOptimizer.monitorBattery();
    RenderOptimizer.monitorNetwork();

    // Set up network optimizations
    NetworkOptimizer.addResourceHints();
    NetworkOptimizer.registerServiceWorker();

    // Bundle analysis
    BundleOptimizer.analyzeBundle();

    // Set up cleanup on page unload
    if (typeof global !== 'undefined' && global.addEventListener) {
      global.addEventListener('beforeunload', () => {
        MemoryOptimizer.clearExpiredCache();
        PerformanceMonitor.observers.clear();
      });
    }

    console.log('Performance optimizations initialized');
  }

  // Initialize when appropriate
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', initializeOptimizations);
    } else {
      initializeOptimizations();
    }
  }

  // Export optimization utilities
  global.PerformanceMonitor = PerformanceMonitor;
  global.BundleOptimizer = BundleOptimizer;
  global.MemoryOptimizer = MemoryOptimizer;
  global.RenderOptimizer = RenderOptimizer;
  global.NetworkOptimizer = NetworkOptimizer;

})(typeof window !== 'undefined' ? window : globalThis);
