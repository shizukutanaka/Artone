/**
 * Tests for bench/regression-detector.ts
 *
 * The module is pure computation (no DOM, no network) so all public API
 * surfaces can be covered in a standard jsdom environment.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BenchmarkRunner,
  RegressionDetector,
  toBaseline,
  serializeBaseline,
  deserializeBaseline,
  BaselineStore,
  bench,
  type BenchmarkSpec,
  type BenchmarkResult,
  type BenchmarkBaseline,
} from '../bench/regression-detector';
import { standardBenchmarks } from '../bench/standard-suite';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResult(name: string, meanMs: number, extra: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    name,
    category: 'effect',
    iterations: 10,
    meanMs,
    medianMs: meanMs,
    p95Ms: meanMs * 1.1,
    p99Ms: meanMs * 1.2,
    stdDevMs: 0.5,
    minMs: meanMs * 0.9,
    maxMs: meanMs * 1.1,
    opsPerSec: 1000 / meanMs,
    timestamp: Date.now(),
    ...extra,
  };
}

function makeBaseline(version: string, results: BenchmarkResult[]): BenchmarkBaseline {
  return {
    version,
    timestamp: Date.now(),
    results: Object.fromEntries(results.map((r) => [r.name, r])),
  };
}

function fastSpec(name = 'test'): BenchmarkSpec {
  return { name, category: 'effect', run: () => {}, iterations: 1, warmup: 0 };
}

// ── BenchmarkRunner ───────────────────────────────────────────────────────────

describe('BenchmarkRunner', () => {
  let runner: BenchmarkRunner;

  beforeEach(() => { runner = new BenchmarkRunner(); });

  it('register() adds a single spec; runAll returns one result', async () => {
    runner.register(fastSpec('a'));
    const results = await runner.runAll();
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('a');
  });

  it('registerAll() adds multiple specs', async () => {
    runner.registerAll([fastSpec('x'), fastSpec('y'), fastSpec('z')]);
    const results = await runner.runAll();
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.name)).toEqual(['x', 'y', 'z']);
  });

  it('runOne() calls setup then teardown', async () => {
    const setup = vi.fn(async () => {});
    const teardown = vi.fn(async () => {});
    const spec: BenchmarkSpec = { name: 'life', category: 'effect', run: () => {}, setup, teardown, iterations: 1, warmup: 0 };
    await runner.runOne(spec);
    expect(setup).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('runOne() runs warmup iterations before timed loop', async () => {
    const calls: string[] = [];
    let isMeasuring = false;
    const spec: BenchmarkSpec = {
      name: 'warm',
      category: 'effect',
      warmup: 3,
      iterations: 2,
      run: () => { calls.push(isMeasuring ? 'timed' : 'warmup'); },
    };
    // Mark when we've switched to measurement phase (after warmup)
    const origFn = spec.run;
    let callCount = 0;
    spec.run = () => {
      callCount++;
      if (callCount > 3) isMeasuring = true;
      origFn();
    };
    await runner.runOne(spec);
    expect(calls.filter((c) => c === 'warmup')).toHaveLength(3);
    expect(calls.filter((c) => c === 'timed')).toHaveLength(2);
  });

  it('runOne() result has all expected statistical fields', async () => {
    const result = await runner.runOne(fastSpec());
    const keys: (keyof BenchmarkResult)[] = [
      'name', 'category', 'iterations', 'meanMs', 'medianMs',
      'p95Ms', 'p99Ms', 'stdDevMs', 'minMs', 'maxMs', 'opsPerSec', 'timestamp',
    ];
    for (const key of keys) {
      expect(result).toHaveProperty(key);
    }
  });

  it('runOne() opsPerSec = 1000 / meanMs', async () => {
    const spec: BenchmarkSpec = { name: 'ops', category: 'effect', iterations: 5, warmup: 0, run: () => {} };
    const result = await runner.runOne(spec);
    expect(result.opsPerSec).toBeCloseTo(1000 / result.meanMs, 5);
  });

  it('runOne() minMs <= medianMs <= maxMs', async () => {
    const result = await runner.runOne({ name: 'stats', category: 'render', iterations: 10, warmup: 0, run: () => {} });
    expect(result.minMs).toBeLessThanOrEqual(result.medianMs);
    expect(result.medianMs).toBeLessThanOrEqual(result.maxMs);
  });

  it('runOne() auto-determines iterations when spec.iterations is 0 (default)', async () => {
    // A very fast sync spec: probe < 10ms → 1000 iterations
    const spec: BenchmarkSpec = { name: 'auto', category: 'effect', run: () => {} };
    const result = await runner.runOne(spec);
    // iterations should be auto-assigned (non-zero)
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('runAll() returns results in registration order', async () => {
    runner.registerAll([fastSpec('alpha'), fastSpec('beta'), fastSpec('gamma')]);
    const results = await runner.runAll();
    expect(results.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma']);
  });
});

// ── RegressionDetector ────────────────────────────────────────────────────────

describe('RegressionDetector', () => {
  let detector: RegressionDetector;

  beforeEach(() => { detector = new RegressionDetector(); });

  it('detect() returns passed:true when no regressions', () => {
    const baseline = makeBaseline('1.0.0', [makeResult('a', 10)]);
    const current = [makeResult('a', 10)];
    const report = detector.detect(baseline, current);
    expect(report.passed).toBe(true);
    expect(report.regressions).toHaveLength(0);
    expect(report.improvements).toHaveLength(0);
  });

  it('detect() skips benchmarks not in baseline', () => {
    const baseline = makeBaseline('1.0.0', []);
    const current = [makeResult('new-bench', 5)];
    const report = detector.detect(baseline, current);
    expect(report.regressions).toHaveLength(0);
    expect(report.improvements).toHaveLength(0);
  });

  it('detect() classifies minor regression correctly', () => {
    // 10% slower → above minor(5%), below major(15%)
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 110)];
    const report = detector.detect(baseline, current);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0].severity).toBe('minor');
    expect(report.passed).toBe(true); // only critical fails
  });

  it('detect() classifies major regression correctly', () => {
    // 20% slower → above major(15%), below critical(30%)
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 120)];
    const report = detector.detect(baseline, current);
    expect(report.regressions[0].severity).toBe('major');
    expect(report.passed).toBe(true);
  });

  it('detect() classifies critical regression and fails', () => {
    // 35% slower → above critical(30%)
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 135)];
    const report = detector.detect(baseline, current);
    expect(report.regressions[0].severity).toBe('critical');
    expect(report.passed).toBe(false);
  });

  it('detect() records improvements', () => {
    // 10% faster → improvement
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 90)];
    const report = detector.detect(baseline, current);
    expect(report.improvements).toHaveLength(1);
    expect(report.improvements[0].deltaPercent).toBeLessThan(0);
    expect(report.passed).toBe(true);
  });

  it('detect() respects custom global thresholds', () => {
    // 8% regression — normally minor with default 5% threshold
    // With custom minor=10, it should NOT register as a regression
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 108)];
    const report = detector.detect(baseline, current, { minor: 10, major: 20, critical: 40 });
    expect(report.regressions).toHaveLength(0);
  });

  it('setThreshold() applies per-bench override', () => {
    // 8% slower — within minor threshold by default, but set to 5% for 'a'
    detector.setThreshold('a', { minor: 5, major: 15, critical: 30 });
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 108)];
    const report = detector.detect(baseline, current);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0].name).toBe('a');
  });

  it('THRESHOLDS static defaults are {minor:5, major:15, critical:30}', () => {
    expect(RegressionDetector.THRESHOLDS).toEqual({ minor: 5, major: 15, critical: 30 });
  });

  it('detect() deltaPercent is computed correctly', () => {
    // baseline 100ms → current 150ms → +50%
    const baseline = makeBaseline('1.0.0', [makeResult('a', 100)]);
    const current = [makeResult('a', 150)];
    const report = detector.detect(baseline, current);
    expect(report.regressions[0].deltaPercent).toBeCloseTo(50, 1);
  });
});

// ── RegressionDetector.formatReport ──────────────────────────────────────────

describe('RegressionDetector.formatReport()', () => {
  let detector: RegressionDetector;

  beforeEach(() => { detector = new RegressionDetector(); });

  it('shows PASS status when no critical regressions', () => {
    const baseline = makeBaseline('2.0.0', [makeResult('a', 10)]);
    const report = detector.detect(baseline, [makeResult('a', 10)]);
    const text = detector.formatReport(report);
    expect(text).toContain('PASS');
    expect(text).toContain('v2.0.0');
  });

  it('shows FAIL status for critical regression', () => {
    const baseline = makeBaseline('1.0.0', [makeResult('a', 10)]);
    const report = detector.detect(baseline, [makeResult('a', 15)]);
    // 50% regression → critical → FAIL
    const text = detector.formatReport(report);
    expect(text).toContain('FAIL');
    expect(text).toContain('CRITICAL');
  });

  it('shows "No significant changes" when nothing detected', () => {
    const baseline = makeBaseline('1.0.0', [makeResult('a', 10)]);
    const report = detector.detect(baseline, [makeResult('a', 10)]);
    const text = detector.formatReport(report);
    expect(text).toContain('No significant changes');
  });

  it('lists improvements with [WIN] tag', () => {
    const baseline = makeBaseline('1.0.0', [makeResult('b', 100)]);
    const report = detector.detect(baseline, [makeResult('b', 80)]);
    const text = detector.formatReport(report);
    expect(text).toContain('[WIN]');
    expect(text).toContain('b');
  });

  it('includes critical tag for severe regressions', () => {
    const baseline = makeBaseline('1.0.0', [makeResult('c', 100)]);
    const report = detector.detect(baseline, [makeResult('c', 140)]);
    const text = detector.formatReport(report);
    expect(text).toContain('CRITICAL');
  });
});

// ── Baseline utilities ────────────────────────────────────────────────────────

describe('toBaseline / serializeBaseline / deserializeBaseline', () => {
  it('toBaseline() creates baseline with version and keyed results', () => {
    const results = [makeResult('r1', 10), makeResult('r2', 20)];
    const baseline = toBaseline('3.0.0', results);
    expect(baseline.version).toBe('3.0.0');
    expect(baseline.results['r1'].meanMs).toBe(10);
    expect(baseline.results['r2'].meanMs).toBe(20);
    expect(typeof baseline.timestamp).toBe('number');
  });

  it('serializeBaseline() → deserializeBaseline() round-trips perfectly', () => {
    const original = toBaseline('1.2.3', [makeResult('bench', 42)]);
    const json = serializeBaseline(original);
    const restored = deserializeBaseline(json);
    expect(restored.version).toBe(original.version);
    expect(restored.results['bench'].meanMs).toBe(42);
  });

  it('serializeBaseline() produces valid JSON with indentation', () => {
    const baseline = toBaseline('1.0.0', [makeResult('x', 5)]);
    const json = serializeBaseline(baseline);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).toContain('\n'); // pretty-printed
  });

  // REGRESSION: malformed JSON must throw a descriptive Error, not a raw SyntaxError
  // that surfaces a confusing stack trace from inside JSON.parse when the CI gate reads
  // a corrupt baseline.json.
  it('REGRESSION: deserializeBaseline() throws Error on malformed JSON', () => {
    expect(() => deserializeBaseline('{invalid json}')).toThrow(
      /baseline\.json is not valid JSON/
    );
  });

  it('REGRESSION: deserializeBaseline() throws Error when results field is missing', () => {
    expect(() =>
      deserializeBaseline('{"version":"1.0","timestamp":0}')
    ).toThrow(/invalid shape/);
  });

  it('REGRESSION: deserializeBaseline() throws Error when parsed value is null', () => {
    expect(() => deserializeBaseline('null')).toThrow(/invalid shape/);
  });

  it('REGRESSION: deserializeBaseline() throws Error when version is not a string', () => {
    expect(() =>
      deserializeBaseline('{"version":1,"timestamp":0,"results":{}}')
    ).toThrow(/invalid shape/);
  });

  it('REGRESSION: deserializeBaseline() throws Error when results is null', () => {
    expect(() =>
      deserializeBaseline('{"version":"1.0","timestamp":0,"results":null}')
    ).toThrow(/invalid shape/);
  });

  it('REGRESSION: valid-but-minimal baseline parses without error', () => {
    const bl = deserializeBaseline('{"version":"2.0","timestamp":1000,"results":{}}');
    expect(bl.version).toBe('2.0');
    expect(bl.results).toEqual({});
  });
});

// ── BaselineStore (deprecated namespace) ──────────────────────────────────────

describe('BaselineStore', () => {
  it('delegates to module-level functions', () => {
    const results = [makeResult('q', 7)];
    const baseline = BaselineStore.toBaseline('9.0.0', results);
    expect(baseline.version).toBe('9.0.0');
    const json = BaselineStore.serialize(baseline);
    const restored = BaselineStore.deserialize(json);
    expect(restored.version).toBe('9.0.0');
  });
});

// ── bench factory ─────────────────────────────────────────────────────────────

describe('bench factory', () => {
  it('bench.runner() returns a BenchmarkRunner', () => {
    expect(bench.runner()).toBeInstanceOf(BenchmarkRunner);
  });

  it('bench.detector() returns a RegressionDetector', () => {
    expect(bench.detector()).toBeInstanceOf(RegressionDetector);
  });

  it('bench.store is BaselineStore', () => {
    expect(bench.store).toBe(BaselineStore);
  });
});

// ── standardBenchmarks ────────────────────────────────────────────────────────

describe('standardBenchmarks — suite structure', () => {
  it('exports a non-empty array of BenchmarkSpec', () => {
    expect(Array.isArray(standardBenchmarks)).toBe(true);
    expect(standardBenchmarks.length).toBeGreaterThan(0);
  });

  it('every spec has a name, category, budget, and run function', () => {
    for (const spec of standardBenchmarks) {
      expect(typeof spec.name).toBe('string');
      expect(spec.name.length).toBeGreaterThan(0);
      expect(typeof spec.category).toBe('string');
      expect(typeof spec.budget).toBe('number');
      expect(typeof spec.run).toBe('function');
    }
  });

  it('covers expected categories (render, effect, decode, encode, export, startup)', () => {
    const categories = new Set(standardBenchmarks.map((s) => s.category));
    expect(categories.has('render')).toBe(true);
    expect(categories.has('effect')).toBe(true);
    expect(categories.has('decode')).toBe(true);
    expect(categories.has('encode')).toBe(true);
    expect(categories.has('export')).toBe(true);
    expect(categories.has('startup')).toBe(true);
  });
});

describe('standardBenchmarks — execution via BenchmarkRunner', () => {
  it('runs all non-canvas benchmarks synchronously without throwing', async () => {
    const runner = bench.runner();
    // Filter out benchmarks that need OffscreenCanvas (browser-only)
    const runnable = standardBenchmarks.filter(
      (s) => !s.name.includes('putImageData') && !s.name.includes('canvas')
    );
    runner.registerAll(runnable);
    const results = await runner.runAll();
    expect(results.length).toBe(runnable.length);
    for (const r of results) {
      expect(r.meanMs).toBeGreaterThanOrEqual(0);
      expect(r.opsPerSec).toBeGreaterThan(0);
    }
  }, 30000);

  it('render.fill_1080p benchmark completes and measures correctly', async () => {
    const spec = standardBenchmarks.find((s) => s.name === 'render.fill_1080p')!;
    expect(spec).toBeDefined();
    const runner = bench.runner();
    runner.register(spec);
    const results = await runner.runAll();
    expect(results[0].name).toBe('render.fill_1080p');
    expect(results[0].meanMs).toBeGreaterThanOrEqual(0);
  }, 15000);

  it('startup.json_parse_5kb benchmark runs and produces a result', async () => {
    const spec = standardBenchmarks.find((s) => s.name === 'startup.json_parse_5kb')!;
    expect(spec).toBeDefined();
    const runner = bench.runner();
    runner.register(spec);
    const results = await runner.runAll();
    expect(results[0].opsPerSec).toBeGreaterThan(0);
  }, 15000);
});
