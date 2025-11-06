interface PerformanceProfile {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: {
    start: number;
    end: number;
    peak: number;
  };
  cpuTime?: number;
  networkRequests?: number;
  domNodes?: number;
  eventListeners?: number;
  metadata?: Record<string, any>;
}

interface ProfilingConfig {
  enableDetailedProfiling: boolean;
  enableMemoryProfiling: boolean;
  enableNetworkProfiling: boolean;
  enableDOMProfiling: boolean;
  sampleInterval: number;
  maxProfiles: number;
  enableAutoProfiling: boolean;
}

class PerformanceProfiler {
  private config: ProfilingConfig;
  private activeProfiles: Map<string, PerformanceProfile> = new Map();
  private completedProfiles: PerformanceProfile[] = [];
  private memoryBaseline: number = 0;
  private networkRequests: Set<string> = new Set();
  private isProfiling: boolean = false;

  private readonly defaultConfig: ProfilingConfig = {
    enableDetailedProfiling: true,
    enableMemoryProfiling: true,
    enableNetworkProfiling: true,
    enableDOMProfiling: true,
    sampleInterval: 100, // 100ms
    maxProfiles: 1000,
    enableAutoProfiling: false
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeProfiler();
  }

  private initializeProfiler(): void {
    this.memoryBaseline = this.getCurrentMemoryUsage();
    this.setupPerformanceObserver();
    this.setupMemoryMonitoring();
    this.setupNetworkMonitoring();

    if (this.config.enableAutoProfiling) {
      this.startAutoProfiling();
    }
  }

  private setupPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) return;

    // Monitor performance entries
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.handlePerformanceEntry(entry);
      }
    });

    observer.observe({ entryTypes: ['measure', 'navigation', 'paint', 'resource'] });
  }

  private setupMemoryMonitoring(): void {
    if (!this.config.enableMemoryProfiling) return;

    // Monitor memory usage
    setInterval(() => {
      if (this.isProfiling) {
        const currentMemory = this.getCurrentMemoryUsage();
        const memoryIncrease = currentMemory - this.memoryBaseline;

        if (memoryIncrease > 50) { // 50MB threshold
          console.warn(`High memory usage detected: ${memoryIncrease.toFixed(2)}MB increase`);
          this.recordMemorySpike(memoryIncrease);
        }
      }
    }, this.config.sampleInterval);
  }

  private setupNetworkMonitoring(): void {
    if (!this.config.enableNetworkProfiling) return;

    // Monitor fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = args[0] as string;

      if (!url.startsWith('data:') && !url.startsWith('blob:')) {
        this.networkRequests.add(url);
      }

      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;

        if (duration > 1000) { // Requests taking more than 1s
          console.warn(`Slow network request: ${url} (${duration.toFixed(2)}ms)`);
        }

        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.error(`Network request failed: ${url} (${duration.toFixed(2)}ms)`, error);
        throw error;
      }
    };
  }

  private handlePerformanceEntry(entry: PerformanceEntry): void {
    switch (entry.entryType) {
      case 'navigation':
        this.analyzeNavigationTiming(entry as PerformanceNavigationTiming);
        break;
      case 'paint':
        this.analyzePaintTiming(entry);
        break;
      case 'measure':
        this.analyzeUserTiming(entry);
        break;
      case 'resource':
        this.analyzeResourceTiming(entry as PerformanceResourceTiming);
        break;
    }
  }

  private analyzeNavigationTiming(entry: PerformanceNavigationTiming): void {
    const metrics = {
      domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
      loadComplete: entry.loadEventEnd - entry.loadEventStart,
      networkLatency: entry.responseEnd - entry.requestStart,
      serverResponseTime: entry.responseEnd - entry.responseStart,
      totalLoadTime: entry.loadEventEnd - entry.navigationStart
    };

    console.log('Navigation Timing:', metrics);

    if (metrics.totalLoadTime > 3000) {
      console.warn('Page load time is slow:', metrics.totalLoadTime);
    }
  }

  private analyzePaintTiming(entry: PerformanceEntry): void {
    console.log('Paint Timing:', {
      name: entry.name,
      startTime: entry.startTime
    });

    if (entry.name === 'first-contentful-paint' && entry.startTime > 2000) {
      console.warn('First Contentful Paint is slow:', entry.startTime);
    }
  }

  private analyzeUserTiming(entry: PerformanceEntry): void {
    console.log('User Timing:', {
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration
    });
  }

  private analyzeResourceTiming(entry: PerformanceResourceTiming): void {
    if (entry.duration > 2000) { // Resources taking more than 2s
      console.warn('Slow resource loading:', {
        name: entry.name,
        duration: entry.duration,
        size: entry.transferSize,
        type: entry.initiatorType
      });
    }
  }

  private recordMemorySpike(increase: number): void {
    if (window.analyticsManager) {
      window.analyticsManager.captureMessage('Memory spike detected', 'warning', {
        memoryIncrease: increase,
        timestamp: Date.now()
      });
    }
  }

  private getCurrentMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  public startProfiling(name: string, metadata?: Record<string, any>): string {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const profile: PerformanceProfile = {
      name,
      startTime: performance.now(),
      memoryUsage: this.config.enableMemoryProfiling ? {
        start: this.getCurrentMemoryUsage(),
        end: 0,
        peak: this.getCurrentMemoryUsage()
      } : undefined,
      metadata
    };

    this.activeProfiles.set(profileId, profile);
    this.isProfiling = true;

    // Mark performance timeline
    performance.mark(`${name}-start`);

    console.log(`Started profiling: ${name}`);
    return profileId;
  }

  public endProfiling(profileId: string): PerformanceProfile | null {
    const profile = this.activeProfiles.get(profileId);
    if (!profile) return null;

    profile.endTime = performance.now();
    profile.duration = profile.endTime - profile.startTime;

    if (profile.memoryUsage) {
      profile.memoryUsage.end = this.getCurrentMemoryUsage();
      profile.memoryUsage.peak = Math.max(profile.memoryUsage.peak, profile.memoryUsage.end);
    }

    // Mark performance timeline
    performance.mark(`${profile.name}-end`);
    performance.measure(profile.name, `${profile.name}-start`, `${profile.name}-end`);

    this.activeProfiles.delete(profileId);
    this.completedProfiles.push(profile);

    // Keep only recent profiles
    if (this.completedProfiles.length > this.config.maxProfiles) {
      this.completedProfiles.shift();
    }

    this.isProfiling = this.activeProfiles.size > 0;

    console.log(`Ended profiling: ${profile.name}`, {
      duration: profile.duration,
      memoryIncrease: profile.memoryUsage ? profile.memoryUsage.end - profile.memoryUsage.start : 0
    });

    return profile;
  }

  public async profileFunction<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const profileId = this.startProfiling(name, metadata);

    try {
      const result = await fn();
      this.endProfiling(profileId);
      return result;
    } catch (error) {
      this.endProfiling(profileId);
      throw error;
    }
  }

  public profileSyncFunction<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const profileId = this.startProfiling(name, metadata);

    try {
      const result = fn();
      this.endProfiling(profileId);
      return result;
    } catch (error) {
      this.endProfiling(profileId);
      throw error;
    }
  }

  public startAutoProfiling(): void {
    this.config.enableAutoProfiling = true;

    // Profile React component renders
    this.profileReactRenders();

    // Profile user interactions
    this.profileUserInteractions();
  }

  private profileReactRenders(): void {
    if (typeof window !== 'undefined' && (window as any).React) {
      const originalCreateElement = (window as any).React.createElement;

      (window as any).React.createElement = function(component: any, props: any, ...children: any[]) {
        const startTime = performance.now();

        const result = originalCreateElement.call(this, component, props, ...children);

        const endTime = performance.now();
        const renderTime = endTime - startTime;

        if (renderTime > 16) { // More than one frame at 60fps
          console.warn(`Slow React render:`, {
            component: component?.name || 'Unknown',
            renderTime,
            props: Object.keys(props || {})
          });
        }

        return result;
      };
    }
  }

  private profileUserInteractions(): void {
    let interactionStartTime: number | null = null;

    document.addEventListener('mousedown', () => {
      interactionStartTime = performance.now();
    }, true);

    document.addEventListener('mouseup', () => {
      if (interactionStartTime) {
        const duration = performance.now() - interactionStartTime;

        if (duration > 100) { // Interactions longer than 100ms
          console.warn('Long user interaction:', {
            duration,
            timestamp: Date.now()
          });
        }

        interactionStartTime = null;
      }
    }, true);
  }

  public getActiveProfiles(): PerformanceProfile[] {
    return Array.from(this.activeProfiles.values());
  }

  public getCompletedProfiles(): PerformanceProfile[] {
    return [...this.completedProfiles];
  }

  public getProfilingStats(): any {
    const totalProfiles = this.completedProfiles.length;
    const averageDuration = totalProfiles > 0
      ? this.completedProfiles.reduce((sum, p) => sum + (p.duration || 0), 0) / totalProfiles
      : 0;

    const memoryProfiles = this.completedProfiles.filter(p => p.memoryUsage);
    const averageMemoryIncrease = memoryProfiles.length > 0
      ? memoryProfiles.reduce((sum, p) => sum + ((p.memoryUsage?.end || 0) - (p.memoryUsage?.start || 0)), 0) / memoryProfiles.length
      : 0;

    return {
      totalProfiles,
      activeProfiles: this.activeProfiles.size,
      averageDuration,
      averageMemoryIncrease,
      networkRequests: this.networkRequests.size,
      isProfiling: this.isProfiling
    };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      stats: this.getProfilingStats(),
      recentProfiles: this.completedProfiles.slice(-10),
      memoryBaseline: this.memoryBaseline,
      networkRequests: Array.from(this.networkRequests),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public exportProfiles(): void {
    const dataStr = JSON.stringify(this.completedProfiles, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-profiles-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  public updateConfig(newConfig: Partial<ProfilingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.config.enableAutoProfiling && !this.isProfiling) {
      this.startAutoProfiling();
    }
  }

  public getConfig(): ProfilingConfig {
    return { ...this.config };
  }

  public destroy(): void {
    this.activeProfiles.clear();
    this.completedProfiles = [];
    this.networkRequests.clear();
    this.isProfiling = false;
  }
}

// Global instance
let performanceProfiler: PerformanceProfiler | null = null;

export function initializePerformanceProfiler(): void {
  if (typeof window === 'undefined') return;

  performanceProfiler = new PerformanceProfiler();
}

export function getPerformanceProfiler(): PerformanceProfiler | null {
  return performanceProfiler;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializePerformanceProfiler();
}
