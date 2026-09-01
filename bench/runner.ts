/**
 * ベンチマーク実行ランナー
 *
 * 使用:
 *   npm run bench               # ベースライン比較
 *   npm run bench:baseline      # ベースライン更新
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { bench, BaselineStore } from './regression-detector';
import { standardBenchmarks } from './standard-suite';

const BASELINE_PATH = join(process.cwd(), 'bench', 'baseline.json');
const REPORT_PATH = join(process.cwd(), 'bench', 'report.json');

async function main(): Promise<void> {
  const updateBaseline = process.argv.includes('--update-baseline');

  console.log('=== Artone v3 Benchmark Suite ===');
  console.log(`Mode: ${updateBaseline ? 'UPDATE BASELINE' : 'COMPARE'}`);
  console.log(`Benchmarks: ${standardBenchmarks.length}`);
  console.log('');

  const runner = bench.runner();
  runner.registerAll(standardBenchmarks);

  const t0 = Date.now();
  const results = await runner.runAll();
  const elapsed = Date.now() - t0;

  console.log(`Completed in ${elapsed}ms`);
  console.log('');

  // 結果出力
  for (const r of results) {
    console.log(
      `${r.name.padEnd(40)} ${r.meanMs.toFixed(2)}ms (p95: ${r.p95Ms.toFixed(2)}ms, ${r.opsPerSec.toFixed(0)} ops/s)`
    );
  }
  console.log('');

  // budget 超過 (BenchmarkSpec.budget: 期待最大時間)。
  //
  // REGRESSION fix: ここは以前 `console.warn` だけで**終了コードに影響しなかった**。
  // その結果 `effect.alpha_composite_1080p` が予算 18ms に対し 36.68ms
  // (+103.8%) でも `Status: PASS` / exit 0 になり、CI 品質ゲート
  // 「パフォーマンス退行 critical なし」が**通ってしまっていた**。
  // 予算は「許容できる上限の宣言」であって参考値ではない — 破ったら落とす。
  const budgetViolations = bench.checkBudgets(standardBenchmarks, results);
  if (budgetViolations.length > 0) {
    console.error(`Budget exceeded (${budgetViolations.length}):`);
    for (const v of budgetViolations) {
      console.error(`  ${v.name}: ${v.actualMeanMs.toFixed(2)}ms > budget ${v.budgetMs}ms (+${v.exceedPercent.toFixed(1)}%)`);
    }
    console.log('');
  }

  // レポート保存
  writeFileSync(REPORT_PATH, JSON.stringify({ timestamp: Date.now(), results }, null, 2));

  if (updateBaseline) {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const baseline = BaselineStore.toBaseline(pkg.version, results);
    writeFileSync(BASELINE_PATH, BaselineStore.serialize(baseline));
    console.log(`Baseline updated: v${pkg.version}`);
    return;
  }

  // ベースライン比較
  if (!existsSync(BASELINE_PATH)) {
    console.warn('No baseline found. Creating initial baseline from this run.');
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const baseline = BaselineStore.toBaseline(pkg.version, results);
    writeFileSync(BASELINE_PATH, BaselineStore.serialize(baseline));
    console.log(`Initial baseline saved: v${pkg.version}`);
    console.log('Subsequent runs will compare against this baseline.');
    process.exit(0);
  }

  const baseline = BaselineStore.deserialize(readFileSync(BASELINE_PATH, 'utf-8'));
  const detector = bench.detector();
  const report = detector.detect(baseline, results);

  // REGRESSION fix: detector.detect() silently `continue`s past any
  // benchmark absent from baseline.results ("新規ベンチは比較対象外") -- correct
  // for a bench genuinely new this run, but when standardBenchmarks grows
  // and nobody re-runs `bench:baseline`, those benchmarks stay permanently
  // unprotected with zero visible signal in CI output. Surface the gap
  // explicitly instead of leaving it silent (bench/CLAUDE.md: this suite is
  // the CI gate against performance decay over a 10-year lifetime).
  //
  // これも警告止まりでは意味がない: 「ベースラインに無い」= 退行検出の**外**に
  // いるということで、黙って通すと守っているつもりの穴が広がり続ける
  // (実際 13 本中 5 本が外に出たまま、そのうち1本が予算超過していた)。
  const missingBaseline = detector.findMissingBaseline(baseline, results);
  if (missingBaseline.length > 0) {
    console.error(
      `${missingBaseline.length} benchmark(s) have no baseline entry and are NOT covered by ` +
      `regression detection. Run 'npm run bench:baseline' to add them: ${missingBaseline.join(', ')}`
    );
    console.log('');
  }

  console.log(detector.formatReport(report));

  // critical は**再現を要求する**。
  //
  // ## なぜか (実測)
  // これらは共有マシン上のマイクロベンチで、同一コードのまま繰り返すと
  // `effect.gaussian_blur_720p` の p95 が 16.73ms → 19.75 → 22.10 → 26.81ms と
  // 振れる (平均は 16.25 → 17.57ms とほぼ動かない)。判定は mean と p95 の
  // 悪いほうを採るため、**スケジューラの外れ値ひとつでゲートが落ちる**。
  //
  // しきい値を緩めるのは誤った解で、本物の退行まで見逃す。代わりに
  // 「疑わしい benchmark だけを測り直し、二度とも critical なら退行と認める」。
  // 単発のノイズは再現せず、本物の退行は必ず再現する。p95 を判定から外さない
  // のは bench/CLAUDE.md「平均だけで判断しない」に従うため。
  let confirmedCritical = report.regressions.filter((r) => r.severity === 'critical');
  if (confirmedCritical.length > 0) {
    const names = new Set(confirmedCritical.map((r) => r.name));
    console.log(`Re-measuring ${names.size} critical candidate(s) to rule out measurement noise...`);
    const recheck = bench.runner();
    recheck.registerAll(standardBenchmarks.filter((b) => names.has(b.name)));
    const second = await recheck.runAll();
    const secondReport = detector.detect(baseline, second);
    const stillCritical = new Set(
      secondReport.regressions
        .filter((entry) => entry.severity === 'critical')
        .map((entry) => entry.name)
    );
    for (const r of confirmedCritical) {
      if (!stillCritical.has(r.name)) {
        console.log(`  ${r.name}: not reproduced on re-measurement — treated as noise`);
      }
    }
    confirmedCritical = confirmedCritical.filter((r) => stillCritical.has(r.name));
    console.log('');
  }

  // ゲートの判定は3つ全ての AND。1つでも欠けると「緑なのに守れていない」状態になる。
  const failures: string[] = [];
  if (confirmedCritical.length > 0) {
    failures.push(
      `critical performance regression vs baseline (reproduced): ${confirmedCritical.map((r) => r.name).join(', ')}`
    );
  }
  if (budgetViolations.length > 0) failures.push(`${budgetViolations.length} budget violation(s)`);
  if (missingBaseline.length > 0) failures.push(`${missingBaseline.length} benchmark(s) outside regression detection`);

  if (failures.length > 0) {
    console.error(`FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('Gate: PASS (no regression, all budgets met, all benchmarks covered)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
