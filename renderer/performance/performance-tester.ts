interface PerformanceTestConfig {
  enableLighthouse: boolean;
  enableWebVitals: boolean;
  enableProfiling: boolean;
  thresholds: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    cumulativeLayoutShift: number;
    totalBlockingTime: number;
  };
}

interface PerformanceMetrics {
  lighthouse: any;
  webVitals: any;
  profiling: any;
  timestamp: number;
}

class PerformanceTester {
  private config: PerformanceTestConfig;
  private metrics: PerformanceMetrics[] = [];

  private readonly defaultConfig: PerformanceTestConfig = {
    enableLighthouse: true,
    enableWebVitals: true,
    enableProfiling: true,
    thresholds: {
      performance: 0.8,
      accessibility: 0.9,
      bestPractices: 0.9,
      seo: 0.9,
      firstContentfulPaint: 2000,
      largestContentfulPaint: 3000,
      cumulativeLayoutShift: 0.1,
      totalBlockingTime: 500
    }
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializePerformanceTesting();
  }

  private initializePerformanceTesting(): void {
    if (this.config.enableWebVitals) {
      this.initializeWebVitals();
    }

    if (this.config.enableProfiling) {
      this.initializeProfiling();
    }

    // Run initial performance audit
    this.runPerformanceAudit();
  }

  private initializeWebVitals(): void {
    // This would integrate with the web-vitals library
    if (typeof window !== 'undefined') {
      this.measureWebVitals();
    }
  }

  private initializeProfiling(): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      this.startPerformanceProfiling();
    }
  }

  private measureWebVitals(): void {
    // Measure Core Web Vitals
    if ('PerformanceObserver' in window) {
      // First Contentful Paint
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('fcp', entry.startTime);
        }
      });
      fcpObserver.observe({ entryTypes: ['paint'] });

      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('lcp', entry.startTime);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fid = (entry as any).processingStart - entry.startTime;
          this.recordMetric('fid', fid);
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        this.recordMetric('cls', clsValue);
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    }
  }

  private startPerformanceProfiling(): void {
    if (!('performance' in window)) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordProfilingEntry(entry);
      }
    });

    observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
  }

  private recordMetric(name: string, value: number): void {
    const metric = {
      name,
      value,
      timestamp: Date.now()
    };

    console.log(`[Performance] ${name}: ${value}`);

    // Store metric
    this.storeMetric(metric);
  }

  private recordProfilingEntry(entry: PerformanceEntry): void {
    const profilingData = {
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration,
      timestamp: Date.now()
    };

    this.storeProfilingData(profilingData);
  }

  private storeMetric(metric: any): void {
    try {
      const existingMetrics = JSON.parse(localStorage.getItem('artone_performance_metrics') || '[]');
      existingMetrics.push(metric);

      // Keep only last 100 metrics
      if (existingMetrics.length > 100) {
        existingMetrics.splice(0, existingMetrics.length - 100);
      }

      localStorage.setItem('artone_performance_metrics', JSON.stringify(existingMetrics));
    } catch (e) {
      console.warn('Could not store performance metric');
    }
  }

  private storeProfilingData(data: any): void {
    try {
      const existingData = JSON.parse(localStorage.getItem('artone_profiling_data') || '[]');
      existingData.push(data);

      // Keep only last 50 profiling entries
      if (existingData.length > 50) {
        existingData.splice(0, existingData.length - 50);
      }

      localStorage.setItem('artone_profiling_data', JSON.stringify(existingData));
    } catch (e) {
      console.warn('Could not store profiling data');
    }
  }

  public async runPerformanceAudit(): Promise<any> {
    if (!this.config.enableLighthouse) {
      return { message: 'Lighthouse testing disabled' };
    }

    try {
      // Simulate Lighthouse audit
      const auditResult = await this.simulateLighthouseAudit();

      this.metrics.push({
        lighthouse: auditResult,
        webVitals: this.getWebVitalsMetrics(),
        profiling: this.getProfilingData(),
        timestamp: Date.now()
      });

      this.analyzePerformance(auditResult);
      return auditResult;
    } catch (error) {
      console.error('Performance audit failed:', error);
      throw error;
    }
  }

  private async simulateLighthouseAudit(): Promise<any> {
    // Simulate Lighthouse audit results
    // In a real implementation, this would run actual Lighthouse
    const mockResults = {
      performance: Math.random() * 0.3 + 0.7, // 0.7-1.0
      accessibility: Math.random() * 0.2 + 0.8, // 0.8-1.0
      bestPractices: Math.random() * 0.2 + 0.8, // 0.8-1.0
      seo: Math.random() * 0.2 + 0.8, // 0.8-1.0
      categories: {
        performance: {
          score: Math.random() * 0.3 + 0.7,
          auditRefs: []
        },
        accessibility: {
          score: Math.random() * 0.2 + 0.8,
          auditRefs: []
        }
      },
      audits: {
        'first-contentful-paint': {
          displayValue: `${(Math.random() * 1000 + 500).toFixed(0)} ms`,
          score: Math.random() > 0.3 ? 1 : 0
        },
        'largest-contentful-paint': {
          displayValue: `${(Math.random() * 2000 + 1000).toFixed(0)} ms`,
          score: Math.random() > 0.4 ? 1 : 0
        },
        'cumulative-layout-shift': {
          displayValue: (Math.random() * 0.2).toFixed(3),
          score: Math.random() > 0.5 ? 1 : 0
        },
        'total-blocking-time': {
          displayValue: `${(Math.random() * 400 + 100).toFixed(0)} ms`,
          score: Math.random() > 0.6 ? 1 : 0
        }
      }
    };

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    return mockResults;
  }

  private getWebVitalsMetrics(): any {
    try {
      const stored = JSON.parse(localStorage.getItem('artone_performance_metrics') || '[]');
      return stored.slice(-10); // Last 10 metrics
    } catch (e) {
      return [];
    }
  }

  private getProfilingData(): any {
    try {
      const stored = JSON.parse(localStorage.getItem('artone_profiling_data') || '[]');
      return stored.slice(-5); // Last 5 profiling entries
    } catch (e) {
      return [];
    }
  }

  private analyzePerformance(auditResult: any): void {
    const issues = [];

    // Check thresholds
    if (auditResult.performance < this.config.thresholds.performance) {
      issues.push({
        category: 'performance',
        message: `Performance score ${auditResult.performance} is below threshold ${this.config.thresholds.performance}`,
        severity: 'warning'
      });
    }

    if (auditResult.accessibility < this.config.thresholds.accessibility) {
      issues.push({
        category: 'accessibility',
        message: `Accessibility score ${auditResult.accessibility} is below threshold ${this.config.thresholds.accessibility}`,
        severity: 'error'
      });
    }

    // Check specific metrics
    const fcp = parseFloat(auditResult.audits['first-contentful-paint'].displayValue);
    if (fcp > this.config.thresholds.firstContentfulPaint) {
      issues.push({
        category: 'performance',
        message: `First Contentful Paint ${fcp}ms exceeds threshold ${this.config.thresholds.firstContentfulPaint}ms`,
        severity: 'warning'
      });
    }

    const lcp = parseFloat(auditResult.audits['largest-contentful-paint'].displayValue);
    if (lcp > this.config.thresholds.largestContentfulPaint) {
      issues.push({
        category: 'performance',
        message: `Largest Contentful Paint ${lcp}ms exceeds threshold ${this.config.thresholds.largestContentfulPaint}ms`,
        severity: 'warning'
      });
    }

    if (issues.length > 0) {
      console.warn('[Performance Test] Issues found:', issues);
      this.reportIssues(issues);
    } else {
      console.log('[Performance Test] All performance metrics are within acceptable thresholds');
    }
  }

  private reportIssues(issues: any[]): void {
    // Report to logging system
    issues.forEach(issue => {
      console.warn(`Performance Issue [${issue.category}]: ${issue.message}`);
    });

    // Store issues for analysis
    try {
      const existingIssues = JSON.parse(localStorage.getItem('artone_performance_issues') || '[]');
      existingIssues.push({
        issues,
        timestamp: Date.now()
      });

      // Keep only last 20 issue reports
      if (existingIssues.length > 20) {
        existingIssues.splice(0, existingIssues.length - 20);
      }

      localStorage.setItem('artone_performance_issues', JSON.stringify(existingIssues));
    } catch (e) {
      console.warn('Could not store performance issues');
    }
  }

  public async runLoadTest(): Promise<any> {
    const startTime = performance.now();
    const loadTestResults = {
      testType: 'load',
      startTime,
      endTime: 0,
      duration: 0,
      metrics: {}
    };

    // Simulate load testing
    for (let i = 0; i < 10; i++) {
      await this.runPerformanceAudit();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    loadTestResults.endTime = performance.now();
    loadTestResults.duration = loadTestResults.endTime - startTime;

    return loadTestResults;
  }

  public async runStressTest(): Promise<any> {
    const startTime = performance.now();
    const stressTestResults = {
      testType: 'stress',
      startTime,
      endTime: 0,
      duration: 0,
      iterations: 50,
      metrics: []
    };

    // Simulate stress testing
    for (let i = 0; i < stressTestResults.iterations; i++) {
      const iterationStart = performance.now();
      await this.runPerformanceAudit();
      const iterationEnd = performance.now();

      stressTestResults.metrics.push({
        iteration: i + 1,
        duration: iterationEnd - iterationStart,
        timestamp: iterationEnd
      });

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    stressTestResults.endTime = performance.now();
    stressTestResults.duration = stressTestResults.endTime - startTime;

    return stressTestResults;
  }

  public getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  public getConfig(): PerformanceTestConfig {
    return { ...this.config };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      lastAudit: this.metrics[this.metrics.length - 1],
      totalAudits: this.metrics.length,
      averagePerformance: this.calculateAverage('lighthouse.performance'),
      averageAccessibility: this.calculateAverage('lighthouse.accessibility'),
      issues: this.getIssues(),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  private calculateAverage(path: string): number {
    const values = this.metrics.map(m => {
      const keys = path.split('.');
      let value: any = m;
      for (const key of keys) {
        value = value?.[key];
      }
      return value || 0;
    });

    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private getIssues(): any[] {
    try {
      return JSON.parse(localStorage.getItem('artone_performance_issues') || '[]');
    } catch (e) {
      return [];
    }
  }

  public updateThresholds(newThresholds: Partial<PerformanceTestConfig['thresholds']>): void {
    this.config.thresholds = { ...this.config.thresholds, ...newThresholds };
  }
}

// Global instance
let performanceTester: PerformanceTester | null = null;

export function initializePerformanceTester(): void {
  if (typeof window === 'undefined') return;

  performanceTester = new PerformanceTester();
}

export function getPerformanceTester(): PerformanceTester | null {
  return performanceTester;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializePerformanceTester();
}
