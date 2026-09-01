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

    // 自動反復決定 (probe 実測に基づく4段階): <10ms→1000回, <100ms→100回, <1000ms→30回, それ以外→10回
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

/**
 * サンプル統計を計算する (テスト可能なよう export)。
 * medianMs は真の統計的中央値 (偶数長は中央2値の平均) を返す。
 */
export function computeStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;

  return {
    meanMs: mean,
    medianMs: median(sorted),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    stdDevMs: Math.sqrt(variance),
    minMs: sorted[0],
    maxMs: sorted[n - 1],
  };
}

/**
 * 統計的中央値。偶数長は中央2値の平均、奇数長は中央値そのもの。
 * 以前は `percentile(sorted, 50)` を使っており、これは
 * `sorted[floor(0.5·n)]` = 偶数長で上側の中央値を返していた (例:
 * [10,20,30,40] → 30。真の中央値は 25)。medianMs は「median」と明示された
 * 診断値であり (detect() のゲート判定には mean/p95 のみを使うため退行検出には
 * 影響しないが) 統計値としては誤りだった。
 */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// === 退行検出 ===

export class RegressionDetector {
  /** デフォルトしきい値 (%): 5%以上で minor, 15% major, 30% critical */
  static readonly THRESHOLDS = { minor: 5, major: 15, critical: 30 };

  /**
   * ノイズ下限 (ms)。これ未満の**絶対差**は、割合がいくつでも退行/改善と見なさない。
   *
   * ## なぜ必要か
   * 割合だけで判定すると、**1ms に満たないベンチのノイズが CRITICAL になる**。
   * 実測: コード変更ゼロでベースラインを取り直した直後の再実行で
   * `render.canvas_putImageData_1080p: 0.00ms → 0.00ms (+100.3%)`、
   * `decode.parse_box_atom: 0.00ms → 0.00ms (+76.8%)` が CRITICAL 判定になり、
   * ゲートが落ちた。タイマ分解能とスケジューラ揺らぎを「性能退行」と呼んでいる
   * だけで、意味が無いどころか**本物の退行を埋もれさせる**。
   *
   * 0.5ms を採るのは 60fps のフレーム予算 16.7ms に対する下限として — 単一処理の
   * 0.5ms 未満の増減がフレームを予算から押し出すことはない。逆にこれを超える
   * 変化は、割合しきい値と合わせて初めて退行として扱う。
   *
   * 改善側にも同じ下限を適用する (でないとノイズを「97% 高速化」と報告してしまう)。
   */
  static readonly MIN_ABSOLUTE_DELTA_MS = 0.5;

  /**
   * p95 に適用するしきい値の倍率。
   *
   * p95 は**裾の統計量**であり、平均より本質的にばらつく。共有マシンでの実測:
   * 同一コードのまま繰り返すと `effect.gaussian_blur_720p` の p95 は
   * 16.73 → 19.75 → 22.10 → 26.81ms と振れる一方、平均は 16.25 → 17.57ms と
   * ほとんど動かない。両者を同じしきい値で裁くと、**スケジューラの外れ値ひとつが
   * 「30% の critical 退行」になる**。
   *
   * p95 を判定から**外しはしない** (bench/CLAUDE.md「平均だけで判断しない」 —
   * 60fps エディタでは裾の遅さこそが体感を壊す)。分散が大きい分だけしきい値を
   * 広げる。倍率2は上記実測 (平均の変動幅に対し p95 は概ね2〜3倍振れる) の
   * 下限側を採ったもの。
   */
  static readonly P95_THRESHOLD_FACTOR = 2;

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
      // 報告値は「悪いほう」。ただし**重大度の判定**は下で指標ごとのしきい値を使う
      // (p95 は平均より本質的にばらつくため — P95_THRESHOLD_FACTOR 参照)。
      const delta = Math.max(meanDelta, p95Delta);

      // 割合の前に**絶対差**で足切りする。どちらの指標で判定するにせよ、
      // 実時間で 0.5ms 動いていないものは性能上の事実ではなく測定ノイズである。
      const absoluteDeltaMs = Math.max(
        Math.abs(cur.meanMs - base.meanMs),
        Math.abs(cur.p95Ms - base.p95Ms),
      );
      if (absoluteDeltaMs < RegressionDetector.MIN_ABSOLUTE_DELTA_MS) continue;

      // REGRESSION fix: THRESHOLDS' own doc comment says "5%以上で minor, 15%
      // major, 30% critical" (5/15/30 percent OR MORE), but these comparisons
      // used strict `>` -- a delta of exactly 5.0% was not registered as a
      // regression at all, exactly 15.0% classified as 'minor' instead of
      // 'major', and exactly 30.0% classified as 'major' instead of
      // 'critical' (which would NOT fail CI, since only 'critical'
      // regressions fail the build). Use >= to match the documented
      // "or more" semantics at each boundary.
      // 平均と p95 を**それぞれのしきい値**で裁き、重いほうを採る。
      // 同一のしきい値で max(mean, p95) を裁くと、裾の外れ値ひとつが critical に
      // なる (実測: 平均 +8% に対し p95 +32%)。
      const p95T = RegressionDetector.P95_THRESHOLD_FACTOR;
      const rank = (d: number, minor: number, major: number, critical: number): number =>
        d >= critical ? 3 : d >= major ? 2 : d >= minor ? 1 : 0;
      const severityRank = Math.max(
        rank(meanDelta, t.minor, t.major, t.critical),
        rank(p95Delta, t.minor * p95T, t.major * p95T, t.critical * p95T),
      );

      if (severityRank > 0) {
        const severity =
          severityRank === 3 ? 'critical' : severityRank === 2 ? 'major' : 'minor';
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

  /**
   * Names of current results absent from the baseline — these are silently
   * skipped by detect() ("新規ベンチは比較対象外") and so have zero regression
   * protection until the baseline is regenerated. Exposed so callers (the CI
   * runner) can surface the gap instead of leaving it invisible.
   */
  findMissingBaseline(baseline: BenchmarkBaseline, current: BenchmarkResult[]): string[] {
    return current.filter((r) => !baseline.results[r.name]).map((r) => r.name);
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
