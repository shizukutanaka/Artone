/**
 * Artone v3 — Accessibility Audit Bundle Entry
 *
 * `npm run build:a11y` が esbuild で IIFE バンドル化するエントリポイント。
 * 生成された dist/a11y-bundle.js を Playwright が `addScriptTag` でページに inject し、
 * グローバルに公開される `__artoneA11yAudit()` を実行して WCAG レポートを取得する。
 *
 * tests/a11y.spec.ts と契約: `globalThis.__artoneA11yAudit` は
 * `AuditReport`（{ issues, level, passed, stats }）を返す関数であること。
 *
 * @version 3.0.0
 */
import { A11yAuditor, type AuditReport } from './wcag-auditor';

declare global {
   
  var __artoneA11yAudit: (() => AuditReport) | undefined;
}

/**
 * ライブ DOM（document.body 配下）を監査して WCAG レポートを返す。
 * ブラウザ環境前提（グローバル window/document を使用）。
 */
function runAudit(): AuditReport {
  const auditor = new A11yAuditor();
  return auditor.audit();
}

globalThis.__artoneA11yAudit = runAudit;

export { runAudit };
