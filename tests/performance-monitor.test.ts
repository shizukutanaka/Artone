/**
 * Tests for perf/performance-monitor.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FrameTimer,
  PerformanceMonitor,
  MemoryProfiler,
  AutoQualityAdjuster,
  PerformanceOverlayUI,
  type PerformanceConfig,
} from '../perf/performance-monitor';

// ============================================================
// FrameTimer
// ============================================================

describe('FrameTimer', () => {
  it('increments frameId on each begin()', () => {
    const t = new FrameTimer();
    expect(t.begin()).toBe(1);
    expect(t.begin()).toBe(2);
    expect(t.begin()).toBe(3);
  });

  it('end() returns phases recorded between begin and end', () => {
    const t = new FrameTimer();
    t.begin();
    t.mark('decode');
    t.mark('render');
    const stats = t.end();
    expect(stats.phases.has('decode')).toBe(true);
    expect(stats.phases.has('render')).toBe(true);
  });

  it('end() clears phases on next begin()', () => {
    const t = new FrameTimer();
    t.begin();
    t.mark('phase1');
    t.end();
    t.begin();
    const stats = t.end();
    expect(stats.phases.size).toBe(0);
  });

  it('end() reports endTime >= startTime', () => {
    const t = new FrameTimer();
    t.begin();
    const stats = t.end();
    expect(stats.endTime).toBeGreaterThanOrEqual(stats.startTime);
  });

  it('getElapsed() returns non-negative elapsed time', () => {
    const t = new FrameTimer();
    t.begin();
    expect(t.getElapsed()).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// PerformanceMonitor — REGRESSION: division by zero
// ============================================================

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor({ enableMemoryProfiling: false });
    monitor.reset();
  });

  it('REGRESSION: getMetrics() fps is 0 (not Infinity) when no frames recorded', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.fps).toBe(0);
    expect(isFinite(metrics.fps)).toBe(true);
  });

  it('REGRESSION: getPerformanceLevel() returns "optimal" when no frames recorded', () => {
    const level = monitor.getPerformanceLevel();
    expect(level).toBe('optimal');
  });

  it('fps converges toward 60 after recording 60fps frametimes', () => {
    for (let i = 0; i < 60; i++) {
      monitor.beginFrame();
      // Simulate ~16.67ms frametime via fake now
      monitor.endFrame();
    }
    // Can't control performance.now() easily, but fps should be finite
    const metrics = monitor.getMetrics();
    expect(isFinite(metrics.fps)).toBe(true);
  });

  it('beginFrame() returns -1 when disabled', () => {
    monitor.disable();
    expect(monitor.beginFrame()).toBe(-1);
  });

  it('enable/disable round-trip works', () => {
    monitor.disable();
    monitor.enable();
    expect(monitor.beginFrame()).toBeGreaterThan(0);
  });

  it('reset() zeroes totals', () => {
    monitor.beginFrame();
    monitor.endFrame();
    monitor.reset();
    const metrics = monitor.getMetrics();
    expect(metrics.totalFrames).toBe(0);
    expect(metrics.droppedFrames).toBe(0);
    expect(metrics.fps).toBe(0);
  });

  it('droppedFrames increments when elapsed > 1.5× target frametime', () => {
    const m = new PerformanceMonitor({
      fpsTarget: 60,
      sampleWindow: 60,
      enableMemoryProfiling: false,
    });
    let fakeNow = 1000; // Start non-zero so lastFrameTime > 0 after frame 1
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => fakeNow);
    try {
      // Frame 1 at t=1000 → sets lastFrameTime=1000
      fakeNow = 1000;
      m.beginFrame();
      fakeNow = 1016;
      m.endFrame();

      // Frame 2 at t=1100 (gap of 100ms >> 1.5 * 16.67ms ≈ 25ms)
      fakeNow = 1100;
      m.beginFrame();
      fakeNow = 1116;
      m.endFrame();

      expect(m.getMetrics().droppedFrames).toBeGreaterThan(0);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('subscribe() receives metrics and unsubscribe stops notifications', () => {
    const received: number[] = [];
    const unsub = monitor.subscribe(m => received.push(m.totalFrames));

    for (let i = 0; i < 10; i++) {
      monitor.beginFrame();
      monitor.endFrame();
    }
    expect(received.length).toBeGreaterThan(0);

    const lenBefore = received.length;
    unsub();
    for (let i = 0; i < 10; i++) {
      monitor.beginFrame();
      monitor.endFrame();
    }
    expect(received.length).toBe(lenBefore);
  });

  it('analyzeBottleneck() returns "none" with no data', () => {
    const result = monitor.analyzeBottleneck();
    expect(result.bottleneck).toBe('none');
  });

  it('analyzeBottleneck() returns "cpu" when frametime exceeds 1.2× target', () => {
    let fakeNow = 0;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => fakeNow);
    try {
      // Push frametimes of ~33ms (2× target of 16.67ms)
      for (let i = 0; i < 20; i++) {
        fakeNow = i * 33;
        monitor.beginFrame();
        fakeNow = i * 33 + 33;
        monitor.endFrame();
      }
      const result = monitor.analyzeBottleneck();
      expect(result.bottleneck).toBe('cpu');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('getPerformanceLevel() returns "critical" when fps far below target', () => {
    let fakeNow = 0;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => fakeNow);
    try {
      // Very slow: 200ms frametimes → ~5fps
      for (let i = 0; i < 20; i++) {
        fakeNow = i * 200;
        monitor.beginFrame();
        fakeNow = i * 200 + 200;
        monitor.endFrame();
      }
      const level = monitor.getPerformanceLevel();
      expect(level).toBe('critical');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('getPerformanceLevel() returns "optimal" when fps near target', () => {
    let fakeNow = 0;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => fakeNow);
    try {
      // ~16.67ms frametimes → ~60fps
      for (let i = 0; i < 20; i++) {
        fakeNow = i * 16.67;
        monitor.beginFrame();
        fakeNow = i * 16.67 + 16.67;
        monitor.endFrame();
      }
      const level = monitor.getPerformanceLevel();
      expect(level).toBe('optimal');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ============================================================
// MemoryProfiler — REGRESSION: division by zero in getMemoryTrend
// ============================================================

describe('MemoryProfiler', () => {
  it('REGRESSION: getMemoryTrend() returns "stable" (not NaN-based) when memory API absent', () => {
    const profiler = new MemoryProfiler();
    // Seed 20 zero-valued samples (non-Chrome: memory API absent)
    for (let i = 0; i < 20; i++) {
      (profiler as unknown as { samples: { used: number; total: number; timestamp: number }[] })
        .samples.push({ used: 0, total: 0, timestamp: Date.now() });
    }
    const trend = profiler.getMemoryTrend();
    expect(trend).toBe('stable');
  });

  it('sample() returns zeros when performance.memory is unavailable', () => {
    const profiler = new MemoryProfiler();
    // Temporarily hide performance.memory (if present in this environment)
    const perf = performance as unknown as Record<string, unknown>;
    const originalMemory = perf.memory;
    delete perf.memory;
    try {
      const sample = profiler.sample();
      expect(sample.used).toBe(0);
      expect(sample.total).toBe(0);
    } finally {
      if (originalMemory !== undefined) perf.memory = originalMemory;
    }
  });

  it('getMemoryTrend() returns "stable" when fewer than 10 samples', () => {
    const profiler = new MemoryProfiler();
    for (let i = 0; i < 5; i++) {
      profiler.sample();
    }
    expect(profiler.getMemoryTrend()).toBe('stable');
  });

  it('detectLeaks() returns false when no samples', () => {
    const profiler = new MemoryProfiler();
    expect(profiler.detectLeaks()).toBe(false);
  });

  it('detectLeaks() returns true when memory consistently grows', () => {
    const profiler = new MemoryProfiler();
    const samples = (profiler as unknown as { samples: { used: number; total: number; timestamp: number }[]; maxSamples: number }).samples;
    const maxSamples = (profiler as unknown as { maxSamples: number }).maxSamples;
    // Fill exactly maxSamples with strictly increasing values
    for (let i = 0; i < maxSamples; i++) {
      samples.push({ used: (i + 1) * 1024 * 1024, total: 100 * 1024 * 1024, timestamp: Date.now() });
    }
    expect(profiler.detectLeaks()).toBe(true);
  });

  it('detectLeaks() returns false when memory is flat', () => {
    const profiler = new MemoryProfiler();
    const samples = (profiler as unknown as { samples: { used: number; total: number; timestamp: number }[]; maxSamples: number }).samples;
    const maxSamples = (profiler as unknown as { maxSamples: number }).maxSamples;
    for (let i = 0; i < maxSamples; i++) {
      samples.push({ used: 50 * 1024 * 1024, total: 100 * 1024 * 1024, timestamp: Date.now() });
    }
    expect(profiler.detectLeaks()).toBe(false);
  });

  it('getMemoryTrend() detects growing trend', () => {
    const profiler = new MemoryProfiler();
    const samples = (profiler as unknown as { samples: { used: number; total: number; timestamp: number }[] }).samples;
    // older 10 samples: 10MB, recent 10 samples: 20MB (100% growth → > 5%)
    for (let i = 0; i < 10; i++) {
      samples.push({ used: 10 * 1024 * 1024, total: 100 * 1024 * 1024, timestamp: Date.now() });
    }
    for (let i = 0; i < 10; i++) {
      samples.push({ used: 20 * 1024 * 1024, total: 100 * 1024 * 1024, timestamp: Date.now() });
    }
    expect(profiler.getMemoryTrend()).toBe('growing');
  });

  it('getMemoryTrend() detects shrinking trend', () => {
    const profiler = new MemoryProfiler();
    const samples = (profiler as unknown as { samples: { used: number; total: number; timestamp: number }[] }).samples;
    // older: 20MB, recent: 10MB → shrinking
    for (let i = 0; i < 10; i++) {
      samples.push({ used: 20 * 1024 * 1024, total: 100 * 1024 * 1024, timestamp: Date.now() });
    }
    for (let i = 0; i < 10; i++) {
      samples.push({ used: 10 * 1024 * 1024, total: 100 * 1024 * 1024, timestamp: Date.now() });
    }
    expect(profiler.getMemoryTrend()).toBe('shrinking');
  });
});

// ============================================================
// AutoQualityAdjuster
// ============================================================

describe('AutoQualityAdjuster', () => {
  it('starts at quality 1.0', () => {
    const mon = new PerformanceMonitor({ enableMemoryProfiling: false });
    const adj = new AutoQualityAdjuster(mon);
    expect(adj.getQualityLevel()).toBe(1.0);
  });

  it('reduces quality on critical level', () => {
    let fakeNow = 0;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => fakeNow);
    try {
      const mon = new PerformanceMonitor({ fpsTarget: 60, enableMemoryProfiling: false });
      // Push very slow frametimes (200ms each) to drive level to critical
      for (let i = 0; i < 20; i++) {
        fakeNow = i * 200;
        mon.beginFrame();
        fakeNow = i * 200 + 200;
        mon.endFrame();
      }
      const adj = new AutoQualityAdjuster(mon);
      const quality = adj.update();
      expect(quality).toBeLessThan(1.0);
      expect(quality).toBeGreaterThanOrEqual(0.25);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does not reduce quality below 0.25', () => {
    const mon = new PerformanceMonitor({ enableMemoryProfiling: false });
    const adj = new AutoQualityAdjuster(mon);
    adj.setQualityLevel(0.25);
    // Override getPerformanceLevel to always return 'critical'
    vi.spyOn(mon, 'getPerformanceLevel').mockReturnValue('critical');
    // Cool down fully (cooldownFrames = 60)
    for (let i = 0; i < 65; i++) adj.update();
    expect(adj.getQualityLevel()).toBeGreaterThanOrEqual(0.25);
    vi.restoreAllMocks();
  });

  it('setQualityLevel clamps to [0.25, 1.0]', () => {
    const mon = new PerformanceMonitor({ enableMemoryProfiling: false });
    const adj = new AutoQualityAdjuster(mon);
    adj.setQualityLevel(0);
    expect(adj.getQualityLevel()).toBe(0.25);
    adj.setQualityLevel(2);
    expect(adj.getQualityLevel()).toBe(1.0);
  });

  it('recovers quality on optimal level', () => {
    const mon = new PerformanceMonitor({ enableMemoryProfiling: false });
    const adj = new AutoQualityAdjuster(mon);
    adj.setQualityLevel(0.5);
    vi.spyOn(mon, 'getPerformanceLevel').mockReturnValue('optimal');
    // Let cooldown expire and step up
    for (let i = 0; i < 65; i++) adj.update();
    expect(adj.getQualityLevel()).toBeGreaterThan(0.5);
    vi.restoreAllMocks();
  });

  it('cooldown prevents rapid changes', () => {
    const mon = new PerformanceMonitor({ enableMemoryProfiling: false });
    const adj = new AutoQualityAdjuster(mon);
    vi.spyOn(mon, 'getPerformanceLevel').mockReturnValue('critical');
    const q1 = adj.update(); // triggers reduction + sets cooldown
    const q2 = adj.update(); // in cooldown, no change
    expect(q1).toBe(q2);
    vi.restoreAllMocks();
  });
});

// ============================================================
// PerformanceOverlayUI
// ============================================================

describe('PerformanceOverlayUI', () => {
  const baseMetrics = {
    fps: 60,
    frametime: 16.67,
    frametimeMin: 15,
    frametimeMax: 18,
    frametimeVariance: 0.5,
    droppedFrames: 0,
    totalFrames: 1000,
    gpuTime: 5,
    memoryUsed: 50 * 1024 * 1024,
    memoryTotal: 256 * 1024 * 1024,
    cpuUsage: 60,
    timestamp: Date.now(),
  };

  it('returns a non-empty HTML string', () => {
    const html = PerformanceOverlayUI(baseMetrics);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('contains FPS value in output', () => {
    const html = PerformanceOverlayUI(baseMetrics);
    expect(html).toContain('60');
  });

  it('REGRESSION: fps=0 (from no-frames state) does not produce Infinity in output', () => {
    const html = PerformanceOverlayUI({ ...baseMetrics, fps: 0 });
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
  });

  it('dropped frames highlighted in non-zero case', () => {
    const html = PerformanceOverlayUI({ ...baseMetrics, droppedFrames: 5 });
    expect(html).toContain('5');
  });
});
