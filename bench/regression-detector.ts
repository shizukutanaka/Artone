/**
 * パフォーマンス退行検出システム
 *
 * 目的: CI で性能退行を阻止。10年運用の品質維持。
 *
 * 仕組み:
 * 1. ベンチマーク実行 → 計測値記録
 * 2. ベースライン比較 → 退行検出
 * 3. しきい値超過なら CI 失敗
 *
 * Carmack 思想: 計測なくして最適化なし、退行検出なくして維持なし。
 */

export interface BenchmarkSpec {
  name: string;
  category: 'render' | 'decode' | 'encode' | 'effect' | 'export' | 'startup';
  setup?: () => Promise<void> | void;
  run: () => Promise<void> | void;
  teardown?: () => Promise<void> | void;
  /** 反復回数 (デフォルト: 自動) */
  iterations?: number;
  /** ウォームアップ反復 */
  warmup?: number;
  /** 期待最大時間 (ms) — 超過で警告 */
  budget?: number;
}

export interface BenchmarkResult {
  name: string;
  category: string;
  iterations: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface BenchmarkBaseline {
  version: string;
  timestamp: number;
  results: Record<string, BenchmarkResult>;
}

export interface RegressionReport {
  baseline: BenchmarkBaseline;
  current: BenchmarkResult[];
  regressions: Regression[];
  improvements: Improvement[];
  passed: boolean;
}

export interface Regression {
  name: string;
  baselineMeanMs: number;
  currentMeanMs: number;
  deltaPercent: number;
  baselineP95Ms: number;
  currentP95Ms: number;
  p95DeltaPercent: number;
  severity: 'minor' | 'major' | 'critical';
}

export interface BudgetViolation {
  name: string;
  budgetMs: number;
  actualMeanMs: number;
  exceedPercent: number;
}

export interface Improvement {
  name: string;
  baselineMeanMs: number;
  currentMeanMs: number;
  deltaPercent: number;
}

// === ベンチマーク実行 ===

export class BenchmarkRunner {
  private specs: BenchmarkSpec[] = [];

  register(spec: BenchmarkSpec): void {
    this.specs.push(spec);
  }

  registerAll(specs: BenchmarkSpec[]): void {
    this.specs.push(...specs);
  }

  async runAll(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    for (const spec of this.specs) {
      results.push(await this.runOne(spec));
    }
    return results;
  }

  async runOne(spec: BenchmarkSpec): Promise<BenchmarkResult> {
    if (spec.setup) await spec.setup();

    const warmup = spec.warmup ?? 3;
    for (let i = 0; i < warmup; i++) {
      await spec.run();
    }

    // 自動反復決定: 1秒以下なら100回、それ以外は10回
    let iterations = spec.iterations ?? 0;
    if (iterations === 0) {
      const probeStart = performance.now();
      await spec.run();
      const probeMs = performance.now() - probeStart;
      iterations = probeMs < 10 ? 1000 : probeMs < 100 ? 100 : probeMs < 1000 ? 30 : 10;
    }

    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await spec.run();
      samples.push(performance.now() - t0);
    }

    if (spec.teardown) await spec.teardown();

    const stats = computeStats(samples);
    return {
      name: spec.name,
      category: spec.category,
      iterations,
      ...stats,
      opsPerSec: 1000 / stats.meanMs,
      timestamp: Date.now(),
    };
  }
}

function computeStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;

  return {
    meanMs: mean,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    stdDevMs: Math.sqrt(variance),
    minMs: sorted[0],
    maxMs: sorted[n - 1],
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// === 退行検出 ===

export class RegressionDetector {
  /** デフォルトしきい値 (%): 5%以上で minor, 15% major, 30% critical */
  static readonly THRESHOLDS = { minor: 5, major: 15, critical: 30 };

  /** ベンチ別カスタムしきい値 (config 化) */
  private perBenchThresholds: Map<string, { minor: number; major: number; critical: number }> = new Map();

  /** ベンチ単位でしきい値を上書き (騒がしいベンチ等) */
  setThreshold(name: string, t: { minor: number; major: number; critical: number }): void {
    this.perBenchThresholds.set(name, t);
  }

  detect(
    baseline: BenchmarkBaseline,
    current: BenchmarkResult[],
    thresholds: { minor?: number; major?: number; critical?: number } = {}
  ): RegressionReport {
    const defaults = { ...RegressionDetector.THRESHOLDS, ...thresholds };
    const regressions: Regression[] = [];
    const improvements: Improvement[] = [];

    for (const cur of current) {
      const base = baseline.results[cur.name];
      if (!base) continue; // 新規ベンチは比較対象外

      const t = this.perBenchThresholds.get(cur.name) ?? defaults;
      // Guard: a 0ms baseline (sub-resolution timer or a degenerate bench)
      // would make the delta Infinity/NaN and permanently fail CI as a phantom
      // "critical regression". Skip the comparison — there is no meaningful
      // percentage change relative to zero.
      if (base.meanMs === 0) continue;
      const meanDelta = ((cur.meanMs - base.meanMs) / base.meanMs) * 100;
      // bench/CLAUDE.md: "統計値は p50/p95/p99 含める。平均だけで判断しない" —
      // a bench whose mean looks stable can still regress badly in its tail
      // (p95), which matters more for a 60fps editor than the mean does.
      // Judge severity from whichever of mean/p95 regressed worse.
      const p95Delta = base.p95Ms > 0 ? ((cur.p95Ms - base.p95Ms) / base.p95Ms) * 100 : meanDelta;
      const delta = Math.max(meanDelta, p95Delta);

      if (delta > t.minor) {
        const severity =
          delta > t.critical ? 'critical' : delta > t.major ? 'major' : 'minor';
        regressions.push({
          name: cur.name,
          baselineMeanMs: base.meanMs,
          currentMeanMs: cur.meanMs,
          deltaPercent: delta,
          baselineP95Ms: base.p95Ms,
          currentP95Ms: cur.p95Ms,
          p95DeltaPercent: p95Delta,
          severity,
        });
      } else if (delta < -t.minor) {
        improvements.push({
          name: cur.name,
          baselineMeanMs: base.meanMs,
          currentMeanMs: cur.meanMs,
          deltaPercent: delta,
        });
      }
    }

    // critical 退行が1つでもあれば失敗
    const passed = !regressions.some((r) => r.severity === 'critical');

    return { baseline, current, regressions, improvements, passed };
  }

  formatReport(report: RegressionReport): string {
    const lines: string[] = [];
    lines.push('=== Performance Regression Report ===');
    lines.push(`Baseline: v${report.baseline.version} (${new Date(report.baseline.timestamp).toISOString()})`);
    lines.push(`Status: ${report.passed ? 'PASS' : 'FAIL'}`);
    lines.push('');

    if (report.regressions.length > 0) {
      lines.push(`Regressions (${report.regressions.length}):`);
      for (const r of report.regressions) {
        const tag = r.severity.toUpperCase();
        lines.push(
          `  [${tag}] ${r.name}: mean ${r.baselineMeanMs.toFixed(2)}ms → ${r.currentMeanMs.toFixed(2)}ms, ` +
          `p95 ${r.baselineP95Ms.toFixed(2)}ms → ${r.currentP95Ms.toFixed(2)}ms (+${r.deltaPercent.toFixed(1)}%)`
        );
      }
      lines.push('');
    }

    if (report.improvements.length > 0) {
      lines.push(`Improvements (${report.improvements.length}):`);
      for (const imp of report.improvements) {
        lines.push(
          `  [WIN] ${imp.name}: ${imp.baselineMeanMs.toFixed(2)}ms → ${imp.currentMeanMs.toFixed(2)}ms (${imp.deltaPercent.toFixed(1)}%)`
        );
      }
      lines.push('');
    }

    if (report.regressions.length === 0 && report.improvements.length === 0) {
      lines.push('No significant changes detected.');
    }

    return lines.join('\n');
  }
}

/**
 * BenchmarkSpec.budget ("期待最大時間 (ms) — 超過で警告") を実際の計測値と
 * 突き合わせる。ベースライン比較とは独立: budget は絶対時間の予算なので、
 * ベースラインが無い新規ベンチでも即座に検査できる。
 */
export function checkBudgets(specs: BenchmarkSpec[], results: BenchmarkResult[]): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  const resultByName = new Map(results.map((r) => [r.name, r]));

  for (const spec of specs) {
    if (spec.budget === undefined) continue;
    const result = resultByName.get(spec.name);
    if (!result) continue;
    if (result.meanMs > spec.budget) {
      violations.push({
        name: spec.name,
        budgetMs: spec.budget,
        actualMeanMs: result.meanMs,
        exceedPercent: ((result.meanMs - spec.budget) / spec.budget) * 100,
      });
    }
  }

  return violations;
}

// === ベースライン管理 (関数: Pike 流の簡潔さ) ===

export function toBaseline(version: string, results: BenchmarkResult[]): BenchmarkBaseline {
  return {
    version,
    timestamp: Date.now(),
    results: Object.fromEntries(results.map((r) => [r.name, r])),
  };
}

export function serializeBaseline(baseline: BenchmarkBaseline): string {
  return JSON.stringify(baseline, null, 2);
}

export function deserializeBaseline(json: string): BenchmarkBaseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`baseline.json is not valid JSON: ${(e as Error).message}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof obj['version'] !== 'string' ||
    typeof obj['timestamp'] !== 'number' ||
    typeof obj['results'] !== 'object' ||
    obj['results'] === null
  ) {
    throw new Error(
      'baseline.json has invalid shape: expected { version: string, timestamp: number, results: object }'
    );
  }
  return parsed as BenchmarkBaseline;
}

/** @deprecated 関数 toBaseline / serializeBaseline / deserializeBaseline を使うこと */
export const BaselineStore = {
  toBaseline,
  serialize: serializeBaseline,
  deserialize: deserializeBaseline,
};

// === ファクトリ ===

export const bench = {
  runner: () => new BenchmarkRunner(),
  detector: () => new RegressionDetector(),
  store: BaselineStore,
  checkBudgets,
};
