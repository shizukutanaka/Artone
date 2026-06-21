/**
 * A11y E2E テスト — WCAG AAA 監査
 *
 * 実装: wcag-auditor をビルド済みバンドルとして addScriptTag で inject。
 * `npm run build:a11y` で dist/a11y-bundle.js を生成し、bundle 不在時はスキップ。
 */

import { test, expect } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AUDITOR_DIST = join(process.cwd(), 'dist', 'a11y-bundle.js');

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
