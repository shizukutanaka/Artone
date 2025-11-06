interface LoadBalancingConfig {
  enablePredictiveLoading: boolean;
  enableRouteBasedSplitting: boolean;
  enableComponentBasedSplitting: boolean;
  enableVendorSplitting: boolean;
  preloadThreshold: number;
  cacheTimeout: number;
  maxConcurrentLoads: number;
  enableRetryOnFailure: boolean;
  retryAttempts: number;
}

interface ModuleLoadMetrics {
  moduleName: string;
  loadTime: number;
  size: number;
  loadCount: number;
  errorCount: number;
  lastLoaded: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

interface RouteModuleMap {
  [route: string]: string[];
}

interface ComponentModuleMap {
  [componentName: string]: string[];
}

class LoadBalancer {
  private config: LoadBalancingConfig;
  private loadMetrics: Map<string, ModuleLoadMetrics> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();
  private failedModules: Set<string> = new Set();
  private routeModuleMap: RouteModuleMap = {};
  private componentModuleMap: ComponentModuleMap = {};

  private readonly defaultConfig: LoadBalancingConfig = {
    enablePredictiveLoading: true,
    enableRouteBasedSplitting: true,
    enableComponentBasedSplitting: true,
    enableVendorSplitting: true,
    preloadThreshold: 0.7, // 70% probability threshold
    cacheTimeout: 300000, // 5 minutes
    maxConcurrentLoads: 3,
    enableRetryOnFailure: true,
    retryAttempts: 2
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeLoadBalancer();
  }

  private initializeLoadBalancer(): void {
    this.setupRouteModuleMapping();
    this.setupComponentModuleMapping();
    this.setupPredictiveLoading();
    this.setupModulePreloading();
  }

  private setupRouteModuleMapping(): void {
    this.routeModuleMap = {
      '/': ['timeline-core', 'ui-components'],
      '/editor': ['timeline-enhanced', 'advanced-audio', 'advanced-effects'],
      '/export': ['export-manager', 'performance-optimizer'],
      '/settings': ['settings-manager', 'ui-components'],
      '/project/:id': ['timeline-core', 'cache-manager', 'project-autosave'],
      '/admin': ['admin-components', 'security-headers', 'performance-monitor']
    };
  }

  private setupComponentModuleMapping(): void {
    this.componentModuleMap = {
      'Timeline': ['timeline-core', 'timeline-enhanced'],
      'VideoPlayer': ['video-player', 'advanced-audio'],
      'AudioEditor': ['audio-editor', 'advanced-audio'],
      'ExportDialog': ['export-manager', 'ui-components'],
      'SettingsPanel': ['settings-manager', 'ui-components'],
      'AdminPanel': ['admin-components', 'security-headers']
    };
  }

  private setupPredictiveLoading(): void {
    if (!this.config.enablePredictiveLoading) return;

    // Predict user navigation based on current page
    this.predictUserNavigation();

    // Predict component usage based on user behavior
    this.predictComponentUsage();

    // Preload modules based on predictions
    this.preloadPredictedModules();
  }

  private predictUserNavigation(): void {
    const currentPath = window.location.pathname;
    const currentTime = Date.now();

    // Analyze user behavior patterns
    const navigationHistory = this.getNavigationHistory();
    const nextRoutes = this.predictNextRoutes(currentPath, navigationHistory);

    nextRoutes.forEach(route => {
      const modules = this.routeModuleMap[route] || [];
      this.preloadModules(modules, 'low');
    });
  }

  private predictComponentUsage(): void {
    // Analyze which components are likely to be used based on current context
    const visibleComponents = this.getVisibleComponents();
    const likelyComponents = this.predictLikelyComponents(visibleComponents);

    likelyComponents.forEach(component => {
      const modules = this.componentModuleMap[component] || [];
      this.preloadModules(modules, 'normal');
    });
  }

  private getNavigationHistory(): any[] {
    try {
      return JSON.parse(localStorage.getItem('artone_navigation_history') || '[]');
    } catch {
      return [];
    }
  }

  private predictNextRoutes(currentPath: string, history: any[]): string[] {
    const predictions: string[] = [];

    // Simple prediction based on common navigation patterns
    if (currentPath === '/') {
      predictions.push('/editor', '/settings');
    } else if (currentPath.startsWith('/editor')) {
      predictions.push('/export', '/settings');
    } else if (currentPath.startsWith('/project')) {
      predictions.push('/editor', '/export');
    }

    return predictions;
  }

  private getVisibleComponents(): string[] {
    const components: string[] = [];

    // Get all visible React components (simplified)
    document.querySelectorAll('[data-component]').forEach(element => {
      const componentName = element.getAttribute('data-component');
      if (componentName) {
        components.push(componentName);
      }
    });

    return components;
  }

  private predictLikelyComponents(visibleComponents: string[]): string[] {
    const predictions: string[] = [];

    // Predict based on visible components
    if (visibleComponents.includes('Timeline')) {
      predictions.push('VideoPlayer', 'AudioEditor', 'ExportDialog');
    }

    if (visibleComponents.includes('VideoPlayer')) {
      predictions.push('AudioEditor', 'Timeline');
    }

    return [...new Set(predictions)];
  }

  private preloadPredictedModules(): void {
    setTimeout(() => {
      this.preloadModules(['ui-components', 'timeline-core'], 'low');
    }, 2000); // Preload after initial page load
  }

  private setupModulePreloading(): void {
    // Preload modules on user interaction hints
    document.addEventListener('mouseenter', (event) => {
      const target = event.target as HTMLElement;
      const preloadModule = target.dataset.preloadModule;

      if (preloadModule && !this.isModuleLoaded(preloadModule)) {
        this.preloadModule(preloadModule);
      }
    }, true);

    // Preload modules on scroll
    let ticking = false;
    document.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.preloadOnScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  private preloadOnScroll(): void {
    const scrollPercent = this.getScrollPercent();

    if (scrollPercent > 0.5) { // User scrolled more than 50%
      this.preloadModules(['export-manager', 'advanced-effects'], 'low');
    }
  }

  private getScrollPercent(): number {
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    return scrollTop / docHeight;
  }

  public async loadModule(moduleName: string, priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'): Promise<any> {
    // Check if already loaded
    if (this.isModuleLoaded(moduleName)) {
      return this.getLoadedModule(moduleName);
    }

    // Check if already loading
    if (this.loadingPromises.has(moduleName)) {
      return this.loadingPromises.get(moduleName);
    }

    // Check if failed recently
    if (this.failedModules.has(moduleName)) {
      if (this.config.enableRetryOnFailure) {
        this.failedModules.delete(moduleName);
      } else {
        throw new Error(`Module ${moduleName} failed to load previously`);
      }
    }

    // Start loading
    const loadingPromise = this.loadModuleInternal(moduleName, priority);
    this.loadingPromises.set(moduleName, loadingPromise);

    try {
      const module = await loadingPromise;
      this.recordLoadSuccess(moduleName, priority);
      this.loadingPromises.delete(moduleName);
      return module;
    } catch (error) {
      this.recordLoadFailure(moduleName, priority);
      this.loadingPromises.delete(moduleName);
      throw error;
    }
  }

  private async loadModuleInternal(moduleName: string, priority: string): Promise<any> {
    const startTime = performance.now();

    try {
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
        case 'ui-components':
          module = await import('./ui-components.js');
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
        case 'admin-components':
          module = await import('./admin-components.js');
          break;
        case 'video-player':
          module = await import('./video-player.js');
          break;
        case 'audio-editor':
          module = await import('./audio-editor.js');
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

  private recordLoadSuccess(moduleName: string, priority: string): void {
    const metrics = this.loadMetrics.get(moduleName) || {
      moduleName,
      loadTime: 0,
      size: 0,
      loadCount: 0,
      errorCount: 0,
      lastLoaded: 0,
      priority: priority as any
    };

    metrics.loadCount++;
    metrics.lastLoaded = Date.now();

    this.loadMetrics.set(moduleName, metrics);
  }

  private recordLoadFailure(moduleName: string, priority: string): void {
    const metrics = this.loadMetrics.get(moduleName) || {
      moduleName,
      loadTime: 0,
      size: 0,
      loadCount: 0,
      errorCount: 0,
      lastLoaded: 0,
      priority: priority as any
    };

    metrics.errorCount++;

    this.loadMetrics.set(moduleName, metrics);
    this.failedModules.add(moduleName);
  }

  private isModuleLoaded(moduleName: string): boolean {
    // Check if module is already loaded in memory
    return this.loadMetrics.has(moduleName);
  }

  private getLoadedModule(moduleName: string): any {
    // Return cached module (simplified)
    return {};
  }

  public preloadModule(moduleName: string): void {
    // Preload without executing
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = this.getModulePath(moduleName);

    document.head.appendChild(link);
  }

  public preloadModules(moduleNames: string[], priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'): void {
    moduleNames.forEach(moduleName => {
      this.preloadModule(moduleName);
    });
  }

  private getModulePath(moduleName: string): string {
    const basePath = './modules/';
    return `${basePath}${moduleName}.js`;
  }

  public getLoadMetrics(): ModuleLoadMetrics[] {
    return Array.from(this.loadMetrics.values());
  }

  public getFailedModules(): string[] {
    return Array.from(this.failedModules);
  }

  public getLoadingQueue(): string[] {
    return Array.from(this.loadingPromises.keys());
  }

  public updateConfig(newConfig: Partial<LoadBalancingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): LoadBalancingConfig {
    return { ...this.config };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      loadMetrics: this.getLoadMetrics(),
      failedModules: this.getFailedModules(),
      loadingQueue: this.getLoadingQueue(),
      routeModuleMap: this.routeModuleMap,
      componentModuleMap: this.componentModuleMap,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }
}

// Global instance
let loadBalancer: LoadBalancer | null = null;

export function initializeLoadBalancer(): void {
  if (typeof window === 'undefined') return;

  loadBalancer = new LoadBalancer();
}

export function getLoadBalancer(): LoadBalancer | null {
  return loadBalancer;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeLoadBalancer();
}
