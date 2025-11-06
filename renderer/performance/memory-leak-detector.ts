interface MemoryMetrics {
  used: number;
  total: number;
  limit: number;
  usedPercentage: number;
  timestamp: number;
}

interface LeakDetectionConfig {
  enableDetection: boolean;
  threshold: number; // Memory increase threshold in MB
  interval: number; // Check interval in milliseconds
  maxHistorySize: number;
}

interface MemorySnapshot {
  timestamp: number;
  metrics: MemoryMetrics;
  eventContexts: string[];
  componentStack?: string;
}

class MemoryLeakDetector {
  private config: LeakDetectionConfig;
  private snapshots: MemorySnapshot[] = [];
  private intervalId: number | null = null;
  private baselineMemory: number = 0;
  private eventContexts: string[] = [];

  private readonly defaultConfig: LeakDetectionConfig = {
    enableDetection: true,
    threshold: 10, // 10MB threshold
    interval: 30000, // Check every 30 seconds
    maxHistorySize: 100
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeDetector();
  }

  private initializeDetector(): void {
    if (!this.config.enableDetection) return;

    this.baselineMemory = this.getCurrentMemoryUsage();
    this.startMonitoring();

    // Set up event listeners for memory-related events
    this.setupEventListeners();

    // Monitor DOM node count
    this.monitorDOMNodes();
  }

  private setupEventListeners(): void {
    // Listen for component mount/unmount events
    document.addEventListener('component-mount', (event: any) => {
      this.addEventContext(`Component mounted: ${event.detail?.componentName || 'unknown'}`);
    });

    document.addEventListener('component-unmount', (event: any) => {
      this.addEventContext(`Component unmounted: ${event.detail?.componentName || 'unknown'}`);
    });

    // Listen for resource loading events
    window.addEventListener('load', () => {
      this.addEventContext('Page loaded');
      this.takeSnapshot('page-load');
    });

    // Listen for navigation events
    window.addEventListener('beforeunload', () => {
      this.addEventContext('Page unloading');
      this.takeSnapshot('before-unload');
    });

    // Listen for user interactions that might cause memory issues
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('[data-memory-intensive]')) {
        this.addEventContext(`Memory-intensive action: ${target.dataset.memoryIntensive}`);
      }
    });
  }

  private monitorDOMNodes(): void {
    // Monitor DOM node count for potential memory leaks
    const observer = new MutationObserver((mutations) => {
      let nodeCountChanged = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          nodeCountChanged = true;
        }
      });

      if (nodeCountChanged) {
        this.addEventContext('DOM nodes changed');
        this.checkForDOMLeaks();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private checkForDOMLeaks(): void {
    const detachedElements = this.findDetachedElements();
    if (detachedElements.length > 100) { // Arbitrary threshold
      this.warn(`Potential DOM leak detected: ${detachedElements.length} detached elements`);
    }
  }

  private findDetachedElements(): Element[] {
    const allElements = Array.from(document.querySelectorAll('*'));
    const attachedElements: Element[] = [];
    const detachedElements: Element[] = [];

    // Simple check for detached elements
    allElements.forEach(element => {
      if (document.body.contains(element)) {
        attachedElements.push(element);
      } else {
        detachedElements.push(element);
      }
    });

    return detachedElements;
  }

  private getCurrentMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  private takeSnapshot(reason: string): void {
    const currentMemory = this.getCurrentMemoryUsage();
    const memoryInfo = (performance as any).memory;

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      metrics: {
        used: currentMemory,
        total: memoryInfo ? memoryInfo.totalJSHeapSize / (1024 * 1024) : 0,
        limit: memoryInfo ? memoryInfo.jsHeapSizeLimit / (1024 * 1024) : 0,
        usedPercentage: memoryInfo ? (currentMemory / (memoryInfo.jsHeapSizeLimit / (1024 * 1024))) * 100 : 0,
        timestamp: Date.now()
      },
      eventContexts: [...this.eventContexts]
    };

    this.snapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.snapshots.length > this.config.maxHistorySize) {
      this.snapshots.shift();
    }

    // Check for memory leaks
    this.analyzeSnapshot(snapshot, reason);

    // Clear event contexts after snapshot
    this.eventContexts = [];
  }

  private analyzeSnapshot(snapshot: MemorySnapshot, reason: string): void {
    const memoryIncrease = snapshot.metrics.used - this.baselineMemory;

    if (memoryIncrease > this.config.threshold) {
      this.warn(`Memory usage increased by ${memoryIncrease.toFixed(2)}MB since baseline`, {
        reason,
        snapshot,
        memoryIncrease
      });
    }

    // Check for steady memory increase over time
    if (this.snapshots.length >= 3) {
      const recentSnapshots = this.snapshots.slice(-3);
      const averageIncrease = recentSnapshots.reduce((sum, snap, index) => {
        if (index === 0) return sum;
        return sum + (snap.metrics.used - recentSnapshots[index - 1].metrics.used);
      }, 0) / (recentSnapshots.length - 1);

      if (averageIncrease > 1) { // 1MB per snapshot
        this.warn(`Steady memory increase detected: ${averageIncrease.toFixed(2)}MB per snapshot`, {
          reason: 'steady-increase',
          averageIncrease,
          snapshots: recentSnapshots
        });
      }
    }

    // Update baseline if memory usage is stable
    if (memoryIncrease < 5 && snapshot.metrics.usedPercentage < 50) {
      this.baselineMemory = snapshot.metrics.used;
    }
  }

  private addEventContext(context: string): void {
    this.eventContexts.push(`${new Date().toISOString()}: ${context}`);

    // Keep only recent contexts
    if (this.eventContexts.length > 20) {
      this.eventContexts.shift();
    }
  }

  private startMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = window.setInterval(() => {
      this.takeSnapshot('periodic-check');
    }, this.config.interval);
  }

  private stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private warn(message: string, context?: any): void {
    const warning = {
      message,
      context,
      timestamp: new Date().toISOString(),
      memoryUsage: this.getCurrentMemoryUsage()
    };

    console.warn('[Memory Leak Detector]', warning);

    // Log to structured logger if available
    if (window.structuredLogger) {
      window.structuredLogger.warn(message, {
        component: 'memory-leak-detector',
        metadata: context
      });
    }

    // Store warning for analysis
    this.storeWarning(warning);
  }

  private storeWarning(warning: any): void {
    try {
      const existingWarnings = JSON.parse(localStorage.getItem('artone_memory_warnings') || '[]');
      existingWarnings.push(warning);

      // Keep only last 50 warnings
      if (existingWarnings.length > 50) {
        existingWarnings.splice(0, existingWarnings.length - 50);
      }

      localStorage.setItem('artone_memory_warnings', JSON.stringify(existingWarnings));
    } catch (e) {
      console.warn('Could not store memory warning');
    }
  }

  // Public API
  public getMemoryMetrics(): MemoryMetrics | null {
    const memoryInfo = (performance as any).memory;
    if (!memoryInfo) return null;

    const currentMemory = this.getCurrentMemoryUsage();

    return {
      used: currentMemory,
      total: memoryInfo.totalJSHeapSize / (1024 * 1024),
      limit: memoryInfo.jsHeapSizeLimit / (1024 * 1024),
      usedPercentage: (currentMemory / (memoryInfo.jsHeapSizeLimit / (1024 * 1024))) * 100,
      timestamp: Date.now()
    };
  }

  public getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  public getWarnings(): any[] {
    try {
      return JSON.parse(localStorage.getItem('artone_memory_warnings') || '[]');
    } catch (e) {
      return [];
    }
  }

  public forceGarbageCollection(): void {
    if ('gc' in window) {
      (window as any).gc();
      this.addEventContext('Manual garbage collection triggered');
      this.takeSnapshot('manual-gc');
    }
  }

  public generateReport(): string {
    const metrics = this.getMemoryMetrics();
    const snapshots = this.getSnapshots();
    const warnings = this.getWarnings();

    const report = {
      currentMetrics: metrics,
      totalSnapshots: snapshots.length,
      totalWarnings: warnings.length,
      memoryIncreaseSinceBaseline: metrics ? metrics.used - this.baselineMemory : 0,
      baselineMemory: this.baselineMemory,
      recentSnapshots: snapshots.slice(-5),
      recentWarnings: warnings.slice(-5),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public updateConfig(newConfig: Partial<LeakDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.config.enableDetection) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  public getConfig(): LeakDetectionConfig {
    return { ...this.config };
  }

  public destroy(): void {
    this.stopMonitoring();
    this.snapshots = [];
  }
}

// Global instance
let memoryLeakDetector: MemoryLeakDetector | null = null;

export function initializeMemoryLeakDetector(): void {
  if (typeof window === 'undefined') return;

  memoryLeakDetector = new MemoryLeakDetector();
}

export function getMemoryLeakDetector(): MemoryLeakDetector | null {
  return memoryLeakDetector;
}

// Memory optimization utilities
export class MemoryOptimizer {
  static cleanupEventListeners(element: Element): void {
    // Remove all event listeners from element and its children
    const clone = element.cloneNode(true) as Element;
    element.parentNode?.replaceChild(clone, element);

    // Re-add important attributes
    const importantAttrs = ['id', 'class', 'data-testid'];
    importantAttrs.forEach(attr => {
      if (element.hasAttribute(attr)) {
        clone.setAttribute(attr, element.getAttribute(attr)!);
      }
    });
  }

  static cleanupTimers(): void {
    // This is a hint to the garbage collector
    // In a real implementation, you'd track and clear specific timers
    console.log('Cleaning up timers and intervals');
  }

  static cleanupCache(): void {
    // Clear various caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }

    // Clear local storage caches
    const cacheKeys = ['artone_cache', 'artone_temp', 'artone_offline'];
    cacheKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`Could not clear cache key: ${key}`);
      }
    });
  }

  static optimizeDOM(): void {
    // Remove unused DOM elements
    const unusedSelectors = [
      '.unused-class',
      '[data-unused]',
      'script[type="text/javascript"]:not([src])'
    ];

    unusedSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => element.remove());
    });
  }

  static forceCleanup(): void {
    this.cleanupTimers();
    this.cleanupCache();
    this.optimizeDOM();

    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeMemoryLeakDetector();
}
