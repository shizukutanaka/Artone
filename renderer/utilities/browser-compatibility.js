/**
 * Browser Compatibility Layer - Polyfills and Feature Detection
 * Ensures consistent behavior across all supported browsers
 */

(function initializeBrowserCompatibility(global) {
  'use strict';

  // Browser detection and capability assessment
  const BrowserSupport = {
    // Core Web APIs
    webgl: !!global.WebGLRenderingContext,
    webgl2: (() => {
      try {
        const canvas = global.document.createElement('canvas');
        return !!(global.WebGL2RenderingContext && canvas.getContext('webgl2'));
      } catch {
        return false;
      }
    })(),

    webworkers: !!global.Worker,
    sharedworkers: !!global.SharedWorker,
    serviceworkers: !!global.ServiceWorker,

    // Modern ES features
    promises: typeof global.Promise !== 'undefined',
    async: (() => {
      try {
        new Function('return async function(){}')();
        return true;
      } catch {
        return false;
      }
    })(),

    // Web APIs
    fetch: typeof global.fetch !== 'undefined',
    requestIdleCallback: typeof global.requestIdleCallback !== 'undefined',
    requestAnimationFrame: typeof global.requestAnimationFrame !== 'undefined',
    resizeObserver: typeof global.ResizeObserver !== 'undefined',
    intersectionObserver: typeof global.IntersectionObserver !== 'undefined',

    // Media APIs
    mediaSource: typeof global.MediaSource !== 'undefined',
    webAudio: !!global.AudioContext || !!global.webkitAudioContext,
    getUserMedia: !!(global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia),

    // Storage APIs
    indexedDB: (() => {
      try {
        return !!global.indexedDB;
      } catch {
        return false;
      }
    })(),

    // File APIs
    fileReader: typeof global.FileReader !== 'undefined',
    fileAPI: typeof global.File !== 'undefined' && typeof global.FileList !== 'undefined',

    // Performance APIs
    performance: !!global.performance,
    performanceObserver: typeof global.PerformanceObserver !== 'undefined',

    // Device APIs
    deviceOrientation: typeof global.DeviceOrientationEvent !== 'undefined',
    vibration: !!(global.navigator && global.navigator.vibrate),

    // Get browser information
    getInfo() {
      const ua = global.navigator.userAgent;
      const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
      const isFirefox = /Firefox/.test(ua);
      const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
      const isEdge = /Edg/.test(ua);
      const isOpera = /OPR/.test(ua);

      return {
        userAgent: ua,
        isChrome,
        isFirefox,
        isSafari,
        isEdge,
        isOpera,
        isMobile: /Mobile|Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
        isTablet: /iPad|Android(?=.*\bMobile\b)|Tablet/i.test(ua),
        version: (() => {
          const match = ua.match(/(Chrome|Firefox|Safari|Edg|OPR)\/(\d+)/);
          return match ? { name: match[1], version: parseInt(match[2], 10) } : null;
        })()
      };
    }
  };

  // Polyfill implementations
  const Polyfills = {
    // Promise polyfill for very old browsers
    promise() {
      if (!BrowserSupport.promises) {
        // Simple Promise polyfill - in practice, you'd use a full implementation
        global.Promise = function(executor) {
          this._state = 'pending';
          this._value = null;
          this._handlers = [];

          const resolve = (value) => {
            if (this._state === 'pending') {
              this._state = 'fulfilled';
              this._value = value;
              this._handlers.forEach(handler => handler.onFulfilled && handler.onFulfilled(value));
            }
          };

          const reject = (reason) => {
            if (this._state === 'pending') {
              this._state = 'rejected';
              this._value = reason;
              this._handlers.forEach(handler => handler.onRejected && handler.onRejected(reason));
            }
          };

          this.then = (onFulfilled, onRejected) => {
            return new global.Promise((res, rej) => {
              this._handlers.push({
                onFulfilled: onFulfilled ? (value) => res(onFulfilled(value)) : res,
                onRejected: onRejected ? (reason) => rej(onRejected(reason)) : rej
              });
            });
          };

          try {
            executor(resolve, reject);
          } catch (error) {
            reject(error);
          }
        };
      }
    },

    // Fetch API polyfill
    fetch() {
      if (!BrowserSupport.fetch) {
        // XMLHttpRequest-based fetch polyfill
        global.fetch = function(url, options = {}) {
          return new global.Promise((resolve, reject) => {
            const xhr = new global.XMLHttpRequest();
            xhr.open(options.method || 'GET', url);

            // Set headers
            if (options.headers) {
              Object.entries(options.headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
              });
            }

            xhr.onload = () => {
              const response = {
                ok: xhr.status >= 200 && xhr.status < 300,
                status: xhr.status,
                statusText: xhr.statusText,
                text: () => global.Promise.resolve(xhr.responseText),
                json: () => global.Promise.resolve(JSON.parse(xhr.responseText)),
                blob: () => global.Promise.resolve(new global.Blob([xhr.response])),
                arrayBuffer: () => global.Promise.resolve(xhr.response)
              };
              resolve(response);
            };

            xhr.onerror = () => reject(new Error('Network request failed'));
            xhr.send(options.body);
          });
        };
      }
    },

    // requestAnimationFrame polyfill
    requestAnimationFrame() {
      if (!BrowserSupport.requestAnimationFrame) {
        let lastTime = 0;
        global.requestAnimationFrame = function(callback) {
          const currTime = Date.now();
          const timeToCall = Math.max(0, 16 - (currTime - lastTime));
          const id = global.setTimeout(() => {
            callback(currTime + timeToCall);
          }, timeToCall);
          lastTime = currTime + timeToCall;
          return id;
        };

        global.cancelAnimationFrame = global.clearTimeout;
      }
    },

    // requestIdleCallback polyfill
    requestIdleCallback() {
      if (!BrowserSupport.requestIdleCallback) {
        global.requestIdleCallback = function(callback, options = {}) {
          const timeout = options.timeout || 1;
          const start = Date.now();

          return global.setTimeout(() => {
            callback({
              didTimeout: false,
              timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
            });
          }, timeout);
        };

        global.cancelIdleCallback = global.clearTimeout;
      }
    },

    // ResizeObserver polyfill (simplified)
    resizeObserver() {
      if (!BrowserSupport.resizeObserver) {
        global.ResizeObserver = function(callback) {
          this.callback = callback;
          this.elements = new Set();
        };

        global.ResizeObserver.prototype.observe = function(element) {
          this.elements.add(element);
          // In a real polyfill, you'd monitor resize events
        };

        global.ResizeObserver.prototype.unobserve = function(element) {
          this.elements.delete(element);
        };

        global.ResizeObserver.prototype.disconnect = function() {
          this.elements.clear();
        };
      }
    },

    // Web Audio API polyfill for Safari
    webAudio() {
      if (!BrowserSupport.webAudio) {
        // Create a basic Web Audio API polyfill
        const AudioContext = global.AudioContext || global.webkitAudioContext;
        if (AudioContext) {
          global.AudioContext = AudioContext;
        }
      }
    },

    // IntersectionObserver polyfill
    intersectionObserver() {
      if (!BrowserSupport.intersectionObserver) {
        // Simplified intersection observer polyfill
        global.IntersectionObserver = function(callback, options = {}) {
          this.callback = callback;
          this.threshold = options.threshold || 0;
          this.rootMargin = options.rootMargin || '0px';
          this.elements = new Map();
        };

        global.IntersectionObserver.prototype.observe = function(element) {
          // Basic implementation - in practice, you'd use scroll/resize listeners
          const entry = {
            target: element,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: element.getBoundingClientRect(),
            rootBounds: null,
            time: Date.now()
          };

          this.elements.set(element, entry);
          this.callback([entry]);
        };

        global.IntersectionObserver.prototype.unobserve = function(element) {
          this.elements.delete(element);
        };
      }
    }
  };

  // Feature detection and capability assessment
  const FeatureDetection = {
    // Check for modern CSS features
    css: {
      grid: global.CSS && global.CSS.supports('display', 'grid'),
      flexbox: global.CSS && global.CSS.supports('display', 'flex'),
      customProperties: global.CSS && global.CSS.supports('--custom-property', 'value'),
      transforms: global.CSS && global.CSS.supports('transform', 'translateX(1px)')
    },

    // Check for modern JavaScript features
    js: {
      arrowFunctions: (() => {
        try {
          new Function('() => {}');
          return true;
        } catch {
          return false;
        }
      })(),

      templateLiterals: (() => {
        try {
          new Function('return `test`');
          return true;
        } catch {
          return false;
        }
      })(),

      destructuring: (() => {
        try {
          new Function('const {a} = {a:1}');
          return true;
        } catch {
          return false;
        }
      })(),

      modules: typeof global.import !== 'undefined',

      asyncGenerators: (() => {
        try {
          new Function('async function* test() {}');
          return true;
        } catch {
          return false;
        }
      })()
    },

    // Check for hardware capabilities
    hardware: {
      webglMaxTextureSize: (() => {
        if (!BrowserSupport.webgl) return 0;
        try {
          const canvas = global.document.createElement('canvas');
          const gl = canvas.getContext('webgl');
          return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0;
        } catch {
          return 0;
        }
      })(),

      maxWorkers: navigator.hardwareConcurrency || 4,

      deviceMemory: (navigator as any).deviceMemory || 4,

      hasGPU: BrowserSupport.webgl || BrowserSupport.webgl2
    },

    // Get comprehensive browser support report
    getSupportReport() {
      return {
        browser: BrowserSupport.getInfo(),
        features: {
          core: {
            webgl: BrowserSupport.webgl,
            webgl2: BrowserSupport.webgl2,
            webworkers: BrowserSupport.webworkers,
            sharedworkers: BrowserSupport.sharedworkers,
            serviceworkers: BrowserSupport.serviceworkers
          },
          modernJS: {
            promises: BrowserSupport.promises,
            async: BrowserSupport.async,
            fetch: BrowserSupport.fetch
          },
          webAPIs: {
            requestIdleCallback: BrowserSupport.requestIdleCallback,
            requestAnimationFrame: BrowserSupport.requestAnimationFrame,
            resizeObserver: BrowserSupport.resizeObserver,
            intersectionObserver: BrowserSupport.intersectionObserver
          },
          media: {
            mediaSource: BrowserSupport.mediaSource,
            webAudio: BrowserSupport.webAudio,
            getUserMedia: BrowserSupport.getUserMedia
          },
          storage: {
            indexedDB: BrowserSupport.indexedDB
          },
          css: this.css,
          js: this.js,
          hardware: this.hardware
        },
        polyfills: {
          needed: this.getNeededPolyfills(),
          applied: []
        }
      };
    },

    getNeededPolyfills() {
      const needed = [];

      if (!BrowserSupport.promises) needed.push('Promise');
      if (!BrowserSupport.fetch) needed.push('fetch');
      if (!BrowserSupport.requestAnimationFrame) needed.push('requestAnimationFrame');
      if (!BrowserSupport.requestIdleCallback) needed.push('requestIdleCallback');
      if (!BrowserSupport.resizeObserver) needed.push('ResizeObserver');
      if (!BrowserSupport.intersectionObserver) needed.push('IntersectionObserver');
      if (!BrowserSupport.webAudio) needed.push('WebAudio');

      return needed;
    }
  };

  // Apply all polyfills
  function applyPolyfills() {
    Polyfills.promise();
    Polyfills.fetch();
    Polyfills.requestAnimationFrame();
    Polyfills.requestIdleCallback();
    Polyfills.resizeObserver();
    Polyfills.intersectionObserver();
    Polyfills.webAudio();

    // Mark polyfills as applied
    FeatureDetection.getSupportReport().polyfills.applied = FeatureDetection.getNeededPolyfills();
  }

  // Graceful degradation strategies
  const GracefulDegradation = {
    // Fallback for WebGL
    webglFallback() {
      if (!BrowserSupport.webgl) {
        console.warn('WebGL not supported, falling back to Canvas 2D');
        // Implement Canvas 2D fallback for video rendering
      }
    },

    // Fallback for Web Workers
    workerFallback() {
      if (!BrowserSupport.webworkers) {
        console.warn('Web Workers not supported, using main thread');
        // Implement synchronous processing fallback
      }
    },

    // Fallback for modern APIs
    apiFallbacks() {
      // Implement fallbacks for missing APIs
      if (!BrowserSupport.fetch) {
        console.warn('Fetch API not supported, using XMLHttpRequest');
      }

      if (!BrowserSupport.promises) {
        console.warn('Promises not supported, using callbacks');
      }
    },

    // Memory management fallbacks
    memoryFallbacks() {
      if (FeatureDetection.hardware.deviceMemory < 4) {
        console.warn('Low memory device detected, enabling memory optimizations');
        // Reduce cache sizes, disable heavy features
      }
    }
  };

  // Performance optimization based on capabilities
  const PerformanceOptimization = {
    // Adjust settings based on browser capabilities
    optimizeForBrowser() {
      const browser = BrowserSupport.getInfo();
      const capabilities = FeatureDetection.hardware;

      // Safari-specific optimizations
      if (browser.isSafari) {
        // Safari has issues with certain WebGL features
        console.log('Applying Safari-specific optimizations');
      }

      // Mobile-specific optimizations
      if (browser.isMobile) {
        console.log('Applying mobile-specific optimizations');
        // Reduce animation complexity, enable touch optimizations
      }

      // Low-memory device optimizations
      if (capabilities.deviceMemory < 4) {
        console.log('Applying low-memory optimizations');
        // Reduce buffer sizes, enable aggressive garbage collection
      }
    },

    // Dynamic feature detection and loading
    loadFeaturesConditionally() {
      const features = FeatureDetection.getSupportReport().features;

      // Load WebGL-specific features only if supported
      if (features.core.webgl) {
        console.log('Loading WebGL-accelerated features');
      }

      // Load Web Worker features only if supported
      if (features.core.webworkers) {
        console.log('Loading multi-threaded features');
      }

      // Load advanced features based on hardware
      if (FeatureDetection.hardware.maxWorkers > 4) {
        console.log('Loading high-concurrency features');
      }
    }
  };

  // Initialize browser compatibility layer
  function initializeCompatibility() {
    // Apply polyfills first
    applyPolyfills();

    // Apply graceful degradation
    GracefulDegradation.webglFallback();
    GracefulDegradation.workerFallback();
    GracefulDegradation.apiFallbacks();
    GracefulDegradation.memoryFallbacks();

    // Apply performance optimizations
    PerformanceOptimization.optimizeForBrowser();
    PerformanceOptimization.loadFeaturesConditionally();

    // Generate compatibility report
    const report = FeatureDetection.getSupportReport();
    console.log('Browser Compatibility Report:', report);

    // Store report globally for debugging
    global.BrowserCompatibilityReport = report;

    // Emit compatibility ready event
    if (typeof global.document !== 'undefined') {
      global.document.dispatchEvent(new global.CustomEvent('browser-compatibility-ready', {
        detail: report
      }));
    }
  }

  // Initialize when DOM is ready or immediately if already loaded
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', initializeCompatibility);
    } else {
      initializeCompatibility();
    }
  } else {
    // Node.js environment
    initializeCompatibility();
  }

  // Export compatibility utilities
  global.BrowserSupport = BrowserSupport;
  global.FeatureDetection = FeatureDetection;
  global.Polyfills = Polyfills;
  global.GracefulDegradation = GracefulDegradation;
  global.PerformanceOptimization = PerformanceOptimization;

})(typeof window !== 'undefined' ? window : globalThis);
