'use strict';

(function initializeModuleLoader(global) {
  // Module dependency management and dynamic loading system

  const ModuleLoader = {
    modules: new Map(),
    dependencies: new Map(),
    loadingPromises: new Map(),

    // Define module dependencies
    defineDependencies() {
      this.dependencies.set('timeline-core', []);
      this.dependencies.set('timeline-enhanced', ['timeline-core']);
      this.dependencies.set('timeline-virtualization', ['timeline-core']);
      this.dependencies.set('project-autosave', []);
      this.dependencies.set('export-presets', []);
      this.dependencies.set('waveform-worker', []);
      this.dependencies.set('waveform-enhanced-worker', ['waveform-worker']);
    },

    // Register a module when it loads
    register(name, moduleExports) {
      this.modules.set(name, moduleExports);

      // Check if any pending modules can now load
      this.checkPendingModules();

      console.log(`Module registered: ${name}`);
    },

    // Get a module by name
    get(name) {
      return this.modules.get(name);
    },

    // Check if all dependencies are loaded
    areDependenciesLoaded(moduleName) {
      const deps = this.dependencies.get(moduleName) || [];
      return deps.every(dep => this.modules.has(dep));
    },

    // Load a module dynamically
    async loadModule(name, path) {
      if (this.modules.has(name)) {
        return this.modules.get(name);
      }

      if (this.loadingPromises.has(name)) {
        return this.loadingPromises.get(name);
      }

      const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = path;
        script.onload = () => {
          // Give the module time to register itself
          setTimeout(() => {
            const module = this.modules.get(name);
            if (module) {
              resolve(module);
            } else {
              reject(new Error(`Module ${name} did not register itself`));
            }
          }, 10);
        };
        script.onerror = () => reject(new Error(`Failed to load module ${name} from ${path}`));
        document.head.appendChild(script);
      });

      this.loadingPromises.set(name, promise);
      return promise;
    },

    // Load a worker module
    async loadWorker(name, path) {
      try {
        const worker = new Worker(path);
        this.register(`worker-${name}`, worker);

        // Return a promise that resolves when worker is ready
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Worker ${name} did not respond within timeout`));
          }, 5000);

          worker.onmessage = (event) => {
            if (event.data && event.data.type && event.data.type.includes('READY')) {
              clearTimeout(timeout);
              resolve(worker);
            }
          };

          worker.onerror = (error) => {
            clearTimeout(timeout);
            reject(error);
          };
        });
      } catch (error) {
        console.error(`Failed to create worker ${name}:`, error);
        throw error;
      }
    },

    checkPendingModules() {
      // Implementation for checking and loading pending modules
      // This would be used for more complex dependency resolution
    },

    // Initialize all core modules
    async initialize() {
      this.defineDependencies();

      // Load workers if needed
      if (global.ARTONE_WORKERS) {
        const workerPromises = [];

        for (const [name, path] of Object.entries(global.ARTONE_WORKERS)) {
          workerPromises.push(
            this.loadWorker(name, path).catch(error => {
              console.warn(`Failed to load worker ${name}:`, error);
              return null;
            })
          );
        }

        await Promise.all(workerPromises);
      }

      console.log('Module loader initialized');

      // Trigger initialization event
      global.dispatchEvent(new CustomEvent('artone:modules-ready', {
        detail: { modules: Array.from(this.modules.keys()) }
      }));
    },

    // Get system information
    getSystemInfo() {
      const info = {
        modules: Array.from(this.modules.keys()),
        workers: Array.from(this.modules.keys()).filter(k => k.startsWith('worker-')),
        dependencies: Object.fromEntries(this.dependencies),
        memoryUsage: this.getMemoryUsage(),
        performance: this.getPerformanceMetrics()
      };

      return info;
    },

    getMemoryUsage() {
      if (global.performance && global.performance.memory) {
        return {
          used: global.performance.memory.usedJSHeapSize,
          total: global.performance.memory.totalJSHeapSize,
          limit: global.performance.memory.jsHeapSizeLimit
        };
      }
      return null;
    },

    getPerformanceMetrics() {
      if (global.performance) {
        const navigation = global.performance.getEntriesByType('navigation')[0];
        return {
          loadTime: navigation ? navigation.loadEventEnd - navigation.loadEventStart : null,
          domReady: navigation ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart : null,
          renderStart: navigation ? navigation.loadEventStart - navigation.navigationStart : null
        };
      }
      return null;
    }
  };

  // Auto-register existing modules
  if (global.TimelineCore) {
    ModuleLoader.register('timeline-core', global.TimelineCore);
  }

  if (global.TimelineEnhanced) {
    ModuleLoader.register('timeline-enhanced', global.TimelineEnhanced);
  }

  if (global.ProjectAutoSave) {
    ModuleLoader.register('project-autosave', global.ProjectAutoSave);
  }

  if (global.ExportPresets) {
    ModuleLoader.register('export-presets', global.ExportPresets);
  }

  // Export to global scope
  global.ModuleLoader = ModuleLoader;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ModuleLoader.initialize();
    });
  } else {
    ModuleLoader.initialize();
  }

})(typeof window !== 'undefined' ? window : globalThis);