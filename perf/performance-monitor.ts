/**
 * Artone v3 — Performance Monitor
 * 
 * リアルタイムパフォーマンス監視
 * - FPS計測
 * - GPU使用率
 * - メモリ使用量
 * - フレームドロップ検出
 * - ボトルネック分析
 * 
 * Carmack: 計測なくして最適化なし
 * Martin: 単一責務
 * Pike: シンプルなメトリクス
 */

import { createLogger } from '../app/logger';

// ============================================================
// Types
// ============================================================

/**
 * `writeTimestamp` は一部実装で利用可能な timestamp-query 拡張 API。
 * 現行 @webgpu/types には未定義のため、実行時の存在を反映して型を補う。
 */
declare global {
  interface GPUCommandEncoder {
    writeTimestamp?(querySet: GPUQuerySet, queryIndex: number): void;
  }
}

const log = createLogger('Perf');

export interface PerformanceMetrics {
  fps: number;
  frametime: number;
  frametimeMin: number;
  frametimeMax: number;
  frametimeVariance: number;
  droppedFrames: number;
  totalFrames: number;
  gpuTime: number;
  memoryUsed: number;
  memoryTotal: number;
  cpuUsage: number;
  timestamp: number;
}

export interface FrameStats {
  frameId: number;
  startTime: number;
  endTime: number;
  phases: Map<string, number>;
  dropped: boolean;
}

export interface PerformanceConfig {
  sampleWindow: number; // frames
  fpsTarget: number;
  warningThreshold: number; // fps below target
  criticalThreshold: number;
  enableGPUProfiling: boolean;
  enableMemoryProfiling: boolean;
}

export type PerformanceLevel = 'optimal' | 'good' | 'warning' | 'critical';

// ============================================================
// Frame Timer
// ============================================================

export class FrameTimer {
  private frameId = 0;
  private startTime = 0;
  private phases = new Map<string, number>();
  
  begin(): number {
    this.frameId++;
    this.startTime = performance.now();
    this.phases.clear();
    return this.frameId;
  }

  mark(phase: string): void {
    this.phases.set(phase, performance.now() - this.startTime);
  }

  end(): FrameStats {
    const endTime = performance.now();
    return {
      frameId: this.frameId,
      startTime: this.startTime,
      endTime,
      phases: new Map(this.phases),
      dropped: false
    };
  }

  getElapsed(): number {
    return performance.now() - this.startTime;
  }
}

// ============================================================
// Rolling Statistics
// ============================================================

class RollingStats {
  private values: number[] = [];
  private maxSize: number;
  private sum = 0;
  private sumSq = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(value: number): void {
    if (this.values.length >= this.maxSize) {
      const removed = this.values.shift()!;
      this.sum -= removed;
      this.sumSq -= removed * removed;
    }
    this.values.push(value);
    this.sum += value;
    this.sumSq += value * value;
  }

  get mean(): number {
    if (this.values.length === 0) return 0;
    return this.sum / this.values.length;
  }

  get variance(): number {
    if (this.values.length < 2) return 0;
    const n = this.values.length;
    // Naive sum-of-squares variance is subject to catastrophic cancellation:
    // when samples cluster tightly (e.g. a steady 60fps frametime) the two
    // large terms nearly cancel and floating-point error can yield a small
    // NEGATIVE result, which would make stdDev = Math.sqrt(negative) = NaN and
    // poison frametimeVariance in the metrics. Clamp to 0.
    return Math.max(0, (this.sumSq - (this.sum * this.sum) / n) / (n - 1));
  }

  get stdDev(): number {
    return Math.sqrt(this.variance);
  }

  get min(): number {
    return this.values.length > 0 ? Math.min(...this.values) : 0;
  }

  get max(): number {
    return this.values.length > 0 ? Math.max(...this.values) : 0;
  }

  get count(): number {
    return this.values.length;
  }

  get latest(): number {
    return this.values.length > 0 ? this.values[this.values.length - 1] : 0;
  }

  percentile(p: number): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * (p / 100));
    return sorted[Math.min(index, sorted.length - 1)];
  }
}

// ============================================================
// GPU Profiler (WebGPU)
// ============================================================

export class GPUProfiler {
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readBuffer: GPUBuffer | null = null;
  private capacity = 256;
  private queryIndex = 0;

  async init(device: GPUDevice): Promise<void> {
    
    // Check for timestamp query support
    if (!device.features.has('timestamp-query')) {
      log.warn('GPU timestamp queries not supported');
      return;
    }
    
    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: this.capacity * 2 // begin + end
    });
    
    this.resolveBuffer = device.createBuffer({
      size: this.capacity * 2 * 8, // 8 bytes per timestamp
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
    });
    
    this.readBuffer = device.createBuffer({
      size: this.capacity * 2 * 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
  }

  beginQuery(encoder: GPUCommandEncoder): number {
    if (!this.querySet) return -1;
    
    const queryId = this.queryIndex;
    encoder.writeTimestamp?.(this.querySet, queryId * 2);
    this.queryIndex = (this.queryIndex + 1) % this.capacity;
    return queryId;
  }

  endQuery(encoder: GPUCommandEncoder, queryId: number): void {
    if (!this.querySet || queryId < 0) return;
    encoder.writeTimestamp?.(this.querySet, queryId * 2 + 1);
  }

  async resolveQueries(encoder: GPUCommandEncoder): Promise<void> {
    if (!this.querySet || !this.resolveBuffer || !this.readBuffer) return;
    
    encoder.resolveQuerySet(this.querySet, 0, this.capacity * 2, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, this.capacity * 2 * 8);
  }

  async getGPUTime(queryId: number): Promise<number> {
    if (!this.readBuffer || queryId < 0) return 0;
    
    await this.readBuffer.mapAsync(GPUMapMode.READ);
    const data = new BigUint64Array(this.readBuffer.getMappedRange());
    
    const begin = Number(data[queryId * 2]);
    const end = Number(data[queryId * 2 + 1]);
    
    this.readBuffer.unmap();
    
    // Convert nanoseconds to milliseconds
    return (end - begin) / 1_000_000;
  }

  dispose(): void {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    this.readBuffer?.destroy();
  }
}

// ============================================================
// Memory Profiler
// ============================================================

export class MemoryProfiler {
  private samples: { used: number; total: number; timestamp: number }[] = [];
  private maxSamples = 60;

  sample(): { used: number; total: number } {
    // Use Performance API memory (Chrome only)
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    
    if (memory) {
      const sample = {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        timestamp: Date.now()
      };
      
      this.samples.push(sample);
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
      
      return { used: sample.used, total: sample.total };
    }
    
    // Fallback estimate
    return { used: 0, total: 0 };
  }

  getMemoryTrend(): 'stable' | 'growing' | 'shrinking' {
    if (this.samples.length < 10) return 'stable';
    
    const recent = this.samples.slice(-10);
    const older = this.samples.slice(-20, -10);
    
    if (older.length < 10) return 'stable';
    
    const recentAvg = recent.reduce((s, x) => s + x.used, 0) / recent.length;
    const olderAvg = older.reduce((s, x) => s + x.used, 0) / older.length;
    
    // Guard: olderAvg===0 in non-Chrome environments where memory API is absent.
    if (olderAvg === 0) return 'stable';
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.05) return 'growing';
    if (change < -0.05) return 'shrinking';
    return 'stable';
  }

  detectLeaks(): boolean {
    if (this.samples.length < this.maxSamples) return false;
    
    // Check if memory is consistently growing
    let growthCount = 0;
    for (let i = 1; i < this.samples.length; i++) {
      if (this.samples[i].used > this.samples[i - 1].used) {
        growthCount++;
      }
    }
    
    return growthCount > this.samples.length * 0.8;
  }
}

// ============================================================
// Performance Monitor
// ============================================================

export class PerformanceMonitor {
  private config: PerformanceConfig;
  private frameTimer = new FrameTimer();
  private frametimeStats: RollingStats;
  private gpuProfiler = new GPUProfiler();
  private memoryProfiler = new MemoryProfiler();
  
  private totalFrames = 0;
  private droppedFrames = 0;
  private lastFrameTime = 0;
  private lastGPUTime = 0;
  private targetFrametime: number;
  
  private listeners: Set<(metrics: PerformanceMetrics) => void> = new Set();
  private enabled = true;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      sampleWindow: 60,
      fpsTarget: 60,
      warningThreshold: 10,
      criticalThreshold: 20,
      enableGPUProfiling: true,
      enableMemoryProfiling: true,
      ...config
    };
    
    this.frametimeStats = new RollingStats(this.config.sampleWindow);
    this.targetFrametime = 1000 / this.config.fpsTarget;
  }

  async initGPU(device: GPUDevice): Promise<void> {
    if (this.config.enableGPUProfiling) {
      await this.gpuProfiler.init(device);
    }
  }

  // ----- フレーム計測 -----
  beginFrame(): number {
    if (!this.enabled) return -1;
    return this.frameTimer.begin();
  }

  markPhase(phase: string): void {
    if (!this.enabled) return;
    this.frameTimer.mark(phase);
  }

  endFrame(): void {
    if (!this.enabled) return;
    
    const stats = this.frameTimer.end();
    const frametime = stats.endTime - stats.startTime;
    
    this.frametimeStats.push(frametime);
    this.totalFrames++;
    
    // Detect dropped frames
    if (this.lastFrameTime > 0) {
      const elapsed = stats.startTime - this.lastFrameTime;
      if (elapsed > this.targetFrametime * 1.5) {
        const dropped = Math.floor(elapsed / this.targetFrametime) - 1;
        this.droppedFrames += dropped;
      }
    }
    
    this.lastFrameTime = stats.startTime;
    
    // Notify listeners
    if (this.totalFrames % 10 === 0) {
      this.notifyListeners();
    }
  }

  // ----- GPU計測 -----
  beginGPUQuery(encoder: GPUCommandEncoder): number {
    return this.gpuProfiler.beginQuery(encoder);
  }

  endGPUQuery(encoder: GPUCommandEncoder, queryId: number): void {
    this.gpuProfiler.endQuery(encoder, queryId);
  }

  async getGPUTime(queryId: number): Promise<number> {
    return this.gpuProfiler.getGPUTime(queryId);
  }

  /**
   * Reads back GPU timestamp data for the given query and caches it so that
   * the next `getMetrics()` call returns an accurate `gpuTime`.
   * Call this after `device.queue.submit()` completes.
   */
  async recordGPUTime(queryId: number): Promise<void> {
    if (queryId < 0 || !this.config.enableGPUProfiling) return;
    this.lastGPUTime = await this.gpuProfiler.getGPUTime(queryId);
  }

  // ----- メトリクス取得 -----
  getMetrics(): PerformanceMetrics {
    const memory = this.config.enableMemoryProfiling 
      ? this.memoryProfiler.sample()
      : { used: 0, total: 0 };
    
    // Guard: mean===0 before any frames are recorded; 1000/0 = Infinity.
    const mean = this.frametimeStats.mean;
    return {
      fps: mean > 0 ? 1000 / mean : 0,
      frametime: mean,
      frametimeMin: this.frametimeStats.min,
      frametimeMax: this.frametimeStats.max,
      frametimeVariance: this.frametimeStats.variance,
      droppedFrames: this.droppedFrames,
      totalFrames: this.totalFrames,
      gpuTime: this.lastGPUTime,
      memoryUsed: memory.used,
      memoryTotal: memory.total,
      cpuUsage: this.estimateCPUUsage(),
      timestamp: Date.now()
    };
  }

  private estimateCPUUsage(): number {
    // Rough estimate based on frametime vs target
    const ratio = this.frametimeStats.mean / this.targetFrametime;
    return Math.min(ratio * 100, 100);
  }

  // ----- パフォーマンスレベル判定 -----
  getPerformanceLevel(): PerformanceLevel {
    const mean = this.frametimeStats.mean;
    // Guard: no frames yet → treat as optimal (monitoring not started).
    if (mean === 0) return 'optimal';
    const fps = 1000 / mean;
    const target = this.config.fpsTarget;
    
    if (fps >= target - 2) return 'optimal';
    if (fps >= target - this.config.warningThreshold) return 'good';
    if (fps >= target - this.config.criticalThreshold) return 'warning';
    return 'critical';
  }

  // ----- ボトルネック分析 -----
  analyzeBottleneck(): {
    bottleneck: 'none' | 'cpu' | 'gpu' | 'memory' | 'gc';
    details: string;
    suggestions: string[];
  } {
    const metrics = this.getMetrics();
    const memoryTrend = this.memoryProfiler.getMemoryTrend();
    const hasLeak = this.memoryProfiler.detectLeaks();
    
    
    // Check for memory issues
    if (hasLeak) {
      return {
        bottleneck: 'memory',
        details: 'Memory leak detected',
        suggestions: [
          'Check for unreleased VideoFrames',
          'Verify texture cleanup',
          'Review event listener cleanup'
        ]
      };
    }
    
    // Check for GC pressure
    if (memoryTrend === 'growing' && metrics.frametimeVariance > 10) {
      return {
        bottleneck: 'gc',
        details: 'High GC pressure detected',
        suggestions: [
          'Reduce object allocations per frame',
          'Use object pools for frequent allocations',
          'Pre-allocate typed arrays'
        ]
      };
    }
    
    // Check GPU bound
    if (metrics.gpuTime > metrics.frametime * 0.8) {
      return {
        bottleneck: 'gpu',
        details: `GPU time: ${metrics.gpuTime.toFixed(1)}ms`,
        suggestions: [
          'Reduce shader complexity',
          'Lower render resolution',
          'Enable proxy editing'
        ]
      };
    }
    
    // CPU bound (high frametime, low GPU time)
    if (metrics.frametime > this.targetFrametime * 1.2) {
      return {
        bottleneck: 'cpu',
        details: `Frametime: ${metrics.frametime.toFixed(1)}ms`,
        suggestions: [
          'Move work to Web Workers',
          'Optimize hot code paths',
          'Reduce timeline complexity'
        ]
      };
    }
    
    return {
      bottleneck: 'none',
      details: 'Performance is optimal',
      suggestions: []
    };
  }

  // ----- リスナー -----
  subscribe(listener: (metrics: PerformanceMetrics) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const metrics = this.getMetrics();
    this.listeners.forEach(listener => listener(metrics));
  }

  // ----- 制御 -----
  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  reset(): void {
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.lastFrameTime = 0;
    this.frametimeStats = new RollingStats(this.config.sampleWindow);
  }

  dispose(): void {
    this.gpuProfiler.dispose();
  }
}

// ============================================================
// Performance Overlay UI
// ============================================================

export function PerformanceOverlayUI(metrics: PerformanceMetrics): string {
  const fps = Math.round(metrics.fps);
  const frametime = metrics.frametime.toFixed(1);
  const memoryMB = (metrics.memoryUsed / (1024 * 1024)).toFixed(1);
  
  const fpsColor = fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#ef4444';
  
  return `
    <div class="perf-overlay" style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      color: #e0e0e0;
      z-index: 10000;
      min-width: 160px;
    ">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>FPS</span>
        <span style="color: ${fpsColor}; font-weight: 600;">${fps}</span>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #888;">Frame</span>
        <span>${frametime} ms</span>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #888;">Min/Max</span>
        <span>${metrics.frametimeMin.toFixed(1)} / ${metrics.frametimeMax.toFixed(1)}</span>
      </div>
      
      <div style="
        height: 1px;
        background: #333;
        margin: 8px 0;
      "></div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #888;">Memory</span>
        <span>${memoryMB} MB</span>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #888;">Dropped</span>
        <span style="color: ${metrics.droppedFrames > 0 ? '#fbbf24' : '#888'};">
          ${metrics.droppedFrames}
        </span>
      </div>
      
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #888;">CPU</span>
        <span>${Math.round(metrics.cpuUsage)}%</span>
      </div>
      
      <!-- Frametime graph -->
      <div style="
        margin-top: 8px;
        height: 30px;
        background: #1a1a1a;
        border-radius: 4px;
        overflow: hidden;
      ">
        <canvas id="frametime-graph" width="160" height="30"></canvas>
      </div>
    </div>
  `;
}

// ============================================================
// Frametime Graph Renderer
// ============================================================

export class FrametimeGraph {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private values: number[] = [];
  private maxValues = 100;
  private targetFrametime = 16.67;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
  }

  push(frametime: number): void {
    this.values.push(frametime);
    if (this.values.length > this.maxValues) {
      this.values.shift();
    }
    this.render();
  }

  private render(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    
    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Target line
    const targetY = height - (this.targetFrametime / 33.33) * height;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();
    
    // Graph
    if (this.values.length < 2) return;
    
    const step = width / (this.maxValues - 1);
    
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    this.values.forEach((v, i) => {
      const x = i * step;
      const y = height - (v / 33.33) * height;
      ctx.lineTo(x, Math.max(0, Math.min(height, y)));
    });
    
    ctx.lineTo((this.values.length - 1) * step, height);
    ctx.closePath();
    
    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
    gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
    gradient.addColorStop(1, 'rgba(74, 222, 128, 0.3)');
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.values.forEach((v, i) => {
      const x = i * step;
      const y = height - (v / 33.33) * height;
      if (i === 0) {
        ctx.moveTo(x, Math.max(0, Math.min(height, y)));
      } else {
        ctx.lineTo(x, Math.max(0, Math.min(height, y)));
      }
    });
    ctx.stroke();
  }
}

// ============================================================
// Auto Quality Adjuster
// ============================================================

export class AutoQualityAdjuster {
  private monitor: PerformanceMonitor;
  private qualityLevel = 1.0;
  private adjustmentCooldown = 0;
  private cooldownFrames = 60;

  constructor(monitor: PerformanceMonitor) {
    this.monitor = monitor;
  }

  update(): number {
    if (this.adjustmentCooldown > 0) {
      this.adjustmentCooldown--;
      return this.qualityLevel;
    }
    
    const level = this.monitor.getPerformanceLevel();
    
    switch (level) {
      case 'critical':
        this.qualityLevel = Math.max(0.25, this.qualityLevel - 0.25);
        this.adjustmentCooldown = this.cooldownFrames;
        break;
      case 'warning':
        this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
        this.adjustmentCooldown = this.cooldownFrames;
        break;
      case 'optimal':
        if (this.qualityLevel < 1.0) {
          this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.05);
          this.adjustmentCooldown = this.cooldownFrames;
        }
        break;
    }
    
    return this.qualityLevel;
  }

  getQualityLevel(): number {
    return this.qualityLevel;
  }

  setQualityLevel(level: number): void {
    this.qualityLevel = Math.max(0.25, Math.min(1.0, level));
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const performanceMonitor = new PerformanceMonitor();
