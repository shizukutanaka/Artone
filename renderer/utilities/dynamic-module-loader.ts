interface ModuleLoaderConfig {
  enableLazyLoading: boolean;
  preloadCriticalModules: boolean;
  cacheModules: boolean;
  timeout: number;
}

interface LoadedModule {
  name: string;
  module: any;
  loadedAt: number;
  size: number;
}

class DynamicModuleLoader {
  private config: ModuleLoaderConfig;
  private loadedModules: Map<string, LoadedModule> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();
  private readonly defaultConfig: ModuleLoaderConfig = {
    enableLazyLoading: true,
    preloadCriticalModules: true,
    cacheModules: true,
    timeout: 10000
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeLazyLoading();
  }

  private initializeLazyLoading(): void {
    if (!this.config.enableLazyLoading) return;

    this.setupIntersectionObserver();
    this.preloadCriticalModules();
    this.setupModulePreloading();
  }

  private setupIntersectionObserver(): void {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            const moduleName = element.dataset.lazyModule;

            if (moduleName && !this.isModuleLoaded(moduleName)) {
              this.loadModule(moduleName).catch((error) => {
                console.error(`Failed to lazy load module ${moduleName}:`, error);
              });
            }

            observer.unobserve(element);
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.1
      }
    );

    // Observe elements with lazy-module attribute
    document.addEventListener('DOMContentLoaded', () => {
      const lazyElements = document.querySelectorAll('[data-lazy-module]');
      lazyElements.forEach((element) => observer.observe(element));
    });
  }

  private preloadCriticalModules(): void {
    if (!this.config.preloadCriticalModules) return;

    const criticalModules = [
      'timeline-core',
      'ui-manager',
      'performance-optimizer'
    ];

    // Preload critical modules after initial page load
    setTimeout(() => {
      criticalModules.forEach((moduleName) => {
        this.loadModule(moduleName, { priority: 'low' });
      });
    }, 100);
  }

  private setupModulePreloading(): void {
    // Preload modules based on user behavior
    document.addEventListener('mouseenter', (event) => {
      const target = event.target as HTMLElement;
      const moduleHint = target.dataset.preloadModule;

      if (moduleHint && !this.isModuleLoaded(moduleHint)) {
        this.preloadModule(moduleHint);
      }
    }, true);
  }

  public async loadModule(moduleName: string, options: { priority?: 'high' | 'low' } = {}): Promise<any> {
    // Check if already loaded
    if (this.isModuleLoaded(moduleName)) {
      return this.loadedModules.get(moduleName)!.module;
    }

    // Check if already loading
    if (this.loadingPromises.has(moduleName)) {
      return this.loadingPromises.get(moduleName);
    }

    // Start loading
    const loadingPromise = this.loadModuleInternal(moduleName, options);
    this.loadingPromises.set(moduleName, loadingPromise);

    try {
      const module = await loadingPromise;
      this.loadedModules.set(moduleName, {
        name: moduleName,
        module,
        loadedAt: Date.now(),
        size: this.estimateModuleSize(module)
      });

      this.loadingPromises.delete(moduleName);
      this.logModuleLoad(moduleName, 'success');
      return module;
    } catch (error) {
      this.loadingPromises.delete(moduleName);
      this.logModuleLoad(moduleName, 'error', error);
      throw error;
    }
  }

  private async loadModuleInternal(moduleName: string, options: { priority?: 'high' | 'low' }): Promise<any> {
    const startTime = performance.now();

    try {
      // Dynamic import based on module name
      let module;

      switch (moduleName) {
        case 'timeline-core':
          module = await import('./timeline-core.js');
          break;
        case 'timeline-enhanced':
          module = await import('./timeline-enhanced.js');
          break;
        case 'advanced-audio':
          module = await import('./advanced-audio.js');
          break;
        case 'advanced-effects':
          module = await import('./advanced-effects.js');
          break;
        case 'export-manager':
          module = await import('./export-manager.js');
          break;
        case 'ui-manager':
          module = await import('./ui-manager.js');
          break;
        case 'performance-optimizer':
          module = await import('./performance-optimizer.js');
          break;
        case 'settings-manager':
          module = await import('./settings-manager.js');
          break;
        case 'cache-manager':
          module = await import('./cache-manager.js');
          break;
        case 'project-autosave':
          module = await import('./project-autosave.js');
          break;
        case 'error-boundary':
          module = await import('./ErrorBoundary.tsx');
          break;
        case 'accessibility-manager':
          module = await import('./accessibility-manager.js');
          break;
        case 'pwa-manager':
          module = await import('./pwa-manager.js');
          break;
        case 'offline-storage':
          module = await import('./offline-storage.js');
          break;
        case 'security-headers':
          module = await import('./security-headers.js');
          break;
        case 'performance-monitor':
          module = await import('./performance-monitor.js');
          break;
        case 'global-error-handler':
          module = await import('./global-error-handler.js');
          break;
        default:
          throw new Error(`Unknown module: ${moduleName}`);
      }

      const loadTime = performance.now() - startTime;
      console.log(`Module ${moduleName} loaded in ${loadTime.toFixed(2)}ms`);

      return module;
    } catch (error) {
      console.error(`Failed to load module ${moduleName}:`, error);
      throw error;
    }
  }

  private preloadModule(moduleName: string): void {
    // Preload without executing
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = this.getModulePath(moduleName);

    document.head.appendChild(link);
  }

  private getModulePath(moduleName: string): string {
    const basePath = './renderer/';
    return `${basePath}${moduleName}.js`;
  }

  private isModuleLoaded(moduleName: string): boolean {
    return this.loadedModules.has(moduleName);
  }

  private estimateModuleSize(module: any): number {
    // Rough estimation based on module properties
    return Object.keys(module).length * 100; // bytes
  }

  private logModuleLoad(moduleName: string, status: 'success' | 'error', error?: any): void {
    const logData = {
      moduleName,
      status,
      timestamp: Date.now(),
      loadTime: Date.now(),
      error: error?.message
    };

    console.log('[Module Loader]', logData);

    // Send to analytics if available
    if (window.gtag && status === 'error') {
      window.gtag('event', 'module_load_error', {
        event_category: 'Module Loading',
        event_label: moduleName,
        value: error?.message
      });
    }
  }

  // Public API
  public async loadModules(moduleNames: string[]): Promise<any[]> {
    const promises = moduleNames.map(name => this.loadModule(name));
    return Promise.all(promises);
  }

  public async preloadModules(moduleNames: string[]): Promise<void> {
    const promises = moduleNames.map(name => this.preloadModule(name));
    await Promise.all(promises);
  }

  public getLoadedModules(): string[] {
    return Array.from(this.loadedModules.keys());
  }

  public getModuleInfo(moduleName: string): LoadedModule | null {
    return this.loadedModules.get(moduleName) || null;
  }

  public getTotalLoadedSize(): number {
    return Array.from(this.loadedModules.values())
      .reduce((total, module) => total + module.size, 0);
  }

  public clearModuleCache(moduleName?: string): void {
    if (moduleName) {
      this.loadedModules.delete(moduleName);
    } else {
      this.loadedModules.clear();
    }
  }

  public generateLoadReport(): string {
    const modules = Array.from(this.loadedModules.values());
    const report = {
      totalModules: modules.length,
      totalSize: this.getTotalLoadedSize(),
      modules: modules.map(m => ({
        name: m.name,
        size: m.size,
        loadedAt: new Date(m.loadedAt).toISOString()
      })),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public getConfig(): ModuleLoaderConfig {
    return { ...this.config };
  }
}

// Global instance
let moduleLoader: DynamicModuleLoader | null = null;

export function initializeModuleLoader(): void {
  if (typeof window === 'undefined') return;

  moduleLoader = new DynamicModuleLoader();
}

export function getModuleLoader(): DynamicModuleLoader | null {
  return moduleLoader;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeModuleLoader();
}
