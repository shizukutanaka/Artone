/**
 * A11y E2E テスト — WCAG AAA 監査
 *
 * 実装: wcag-auditor をビルド済みバンドルとして addScriptTag で inject。
 * `npm run build:a11y` で dist/a11y-bundle.js を生成し、bundle 不在時はスキップ。
 *
 * ## 監査対象 (以前の欠陥)
 * 従来は `/` を開くだけで監査していたが、`/` は**初回起動のティア選択画面**であり、
 * エディタ本体 (メディアブラウザ / プレビュー / タイムライン / ヘッダ) は
 * **一度も監査されていなかった**。「WCAG AAA critical なし」というゲートが、
 * 実際にはユーザーが大半の時間を過ごす画面を見ていなかったことになる。
 * オンボーディングとエディタの**両方**を監査する。
 */

import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { openEditor } from './open-editor';

const AUDITOR_DIST = join(process.cwd(), 'dist', 'a11y-bundle.js');

interface A11yIssue { severity: string; element: string; message: string }

/** 現在のページを監査し、critical な指摘だけ返す。 */
async function auditCritical(page: Page): Promise<A11yIssue[]> {
  await page.addScriptTag({ content: readFileSync(AUDITOR_DIST, 'utf-8') });
  const report = await page.evaluate(() => {
    const audit = (globalThis as { __artoneA11yAudit?: () => unknown }).__artoneA11yAudit;
    if (!audit) throw new Error('Auditor not loaded');
    return audit();
  });
  const r = report as { issues: A11yIssue[] };
  return r.issues.filter((i) => i.severity === 'critical');
}

test.describe('Accessibility (WCAG AAA)', () => {
  test('main page passes WCAG AAA audit', async ({ page }) => {
    test.skip(
      !existsSync(AUDITOR_DIST),
      `Bundle not found: ${AUDITOR_DIST}. Build with 'npm run build:a11y' first.`
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const auditorCode = readFileSync(AUDITOR_DIST, 'utf-8');
    await page.addScriptTag({ content: auditorCode });

    const report = await page.evaluate(() => {
      const audit = (globalThis as { __artoneA11yAudit?: () => unknown }).__artoneA11yAudit;
      if (!audit) throw new Error('Auditor not loaded');
      return audit();
    });

    writeFileSync('a11y-report.json', JSON.stringify(report, null, 2));

    const r = report as { issues: Array<{ severity: string; element: string; message: string }>; level: string };
    const critical = r.issues.filter((i) => i.severity === 'critical');

    if (critical.length > 0) {
      console.error('Critical A11y issues:');
      for (const issue of critical) {
        console.error(`  - ${issue.element}: ${issue.message}`);
      }
    }

    expect(critical.length).toBe(0);
    expect(['AAA', 'AA']).toContain(r.level);
  });

  test('REGRESSION: the editor itself passes the audit (not just onboarding)', async ({ page }) => {
    test.skip(
      !existsSync(AUDITOR_DIST),
      `Bundle not found: ${AUDITOR_DIST}. Build with 'npm run build:a11y' first.`
    );

    // ユーザーが実際に作業する画面まで進んでから監査する。
    await openEditor(page);
    const critical = await auditCritical(page);

    if (critical.length > 0) {
      console.error('Critical A11y issues in the editor:');
      for (const issue of critical) console.error(`  - ${issue.element}: ${issue.message}`);
    }
    expect(critical.length).toBe(0);
  });

  test('html has lang attribute', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });

  test('all images have alt attributes', async ({ page }) => {
    await page.goto('/');
    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt).toBe(0);
  });

  test('all form controls have labels', async ({ page }) => {
    await page.goto('/');
    const unlabeled = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.filter((el) => {
        const id = el.getAttribute('id');
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
        return !ariaLabel && !ariaLabelledBy && !hasLabel;
      }).length;
    });
    expect(unlabeled).toBe(0);
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });
});
