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

  // budget 超過警告 (BenchmarkSpec.budget: 期待最大時間)
  const budgetViolations = bench.checkBudgets(standardBenchmarks, results);
  if (budgetViolations.length > 0) {
    console.warn(`Budget exceeded (${budgetViolations.length}):`);
    for (const v of budgetViolations) {
      console.warn(`  ${v.name}: ${v.actualMeanMs.toFixed(2)}ms > budget ${v.budgetMs}ms (+${v.exceedPercent.toFixed(1)}%)`);
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

  console.log(detector.formatReport(report));

  if (!report.passed) {
    console.error('FAILED: Critical performance regression detected');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
