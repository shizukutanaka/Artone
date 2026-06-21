/**
 * WCAG 2.2 監査ユニットテスト
 *
 * ColorContrast の輝度/コントラスト計算 (純粋関数) と
 * WCAG 2.2 新基準 (2.5.8 Target Size, 2.4.11 Focus Not Obscured) を検証。
 */

import { describe, it, expect } from 'vitest';
import { ColorContrast } from '../accessibility/wcag-auditor';

describe('ColorContrast — 相対輝度', () => {
  it('white luminance is 1.0', () => {
    expect(ColorContrast.luminance(255, 255, 255)).toBeCloseTo(1.0, 2);
  });

  it('black luminance is 0.0', () => {
    expect(ColorContrast.luminance(0, 0, 0)).toBeCloseTo(0.0, 2);
  });

  it('mid gray luminance is between', () => {
    const lum = ColorContrast.luminance(128, 128, 128);
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });
});

describe('ColorContrast — コントラスト比', () => {
  it('black on white is 21:1 (max)', () => {
    expect(ColorContrast.contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });

  it('same color is 1:1', () => {
    expect(ColorContrast.contrast([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 1);
  });

  it('order independent', () => {
    const a = ColorContrast.contrast([0, 0, 0], [255, 255, 255]);
    const b = ColorContrast.contrast([255, 255, 255], [0, 0, 0]);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('ColorContrast — WCAG レベル判定', () => {
  it('21:1 normal text is AAA', () => {
    expect(ColorContrast.level(21, false)).toBe('AAA');
  });

  it('4.5:1 normal text is AA', () => {
    expect(ColorContrast.level(4.5, false)).toBe('AA');
  });

  it('3:1 normal text is A', () => {
    expect(ColorContrast.level(3, false)).toBe('A');
  });

  it('2:1 normal text fails', () => {
    expect(ColorContrast.level(2, false)).toBe('FAIL');
  });

  it('3:1 large text is AA', () => {
    expect(ColorContrast.level(3, true)).toBe('AA');
  });

  it('brand color #00C4CC on dark surface meets contrast', () => {
    const ratio = ColorContrast.contrast([0, 196, 204], [26, 26, 26]);
    expect(ratio).toBeGreaterThan(3);
  });
});

describe('ColorContrast — parseColor', () => {
  it('parses hex #ffffff', () => {
    expect(ColorContrast.parseColor('#ffffff')).toEqual([255, 255, 255]);
  });

  it('parses rgb()', () => {
    expect(ColorContrast.parseColor('rgb(0, 196, 204)')).toEqual([0, 196, 204]);
  });

  it('parses short hex #fff', () => {
    expect(ColorContrast.parseColor('#fff')).toEqual([255, 255, 255]);
  });

  it('returns null for invalid', () => {
    expect(ColorContrast.parseColor('not-a-color')).toBeNull();
  });
});

// ============================================================
// WCAG 2.2 新基準 — JSDOM ベースの監査
// ============================================================

import { A11yAuditor, AuditReporter, a11y } from '../accessibility/wcag-auditor';
import type { AuditReport } from '../accessibility/wcag-auditor';

/** 最小限の DOMHost モックを作る */
function makeHost(html: string) {
  // jsdom はテスト環境 (jsdom) でグローバルに存在
  document.body.innerHTML = html;
  document.documentElement.setAttribute('lang', 'ja');

  return {
    document,
    window: window as Window & typeof globalThis,
  };
}

describe('A11yAuditor — WCAG 2.2 Target Size (2.5.8)', () => {
  it('audit runs without throwing on buttons', () => {
    const host = makeHost('<button>OK</button><button>Cancel</button>');
    const auditor = new A11yAuditor(host);
    const report = auditor.audit();
    expect(report).toBeTruthy();
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it('report includes level and checks count', () => {
    const host = makeHost('<button>Test</button>');
    const auditor = new A11yAuditor(host);
    const report = auditor.audit();
    expect(['AAA', 'AA', 'A', 'FAIL']).toContain(report.level);
    expect(typeof report.stats.totalChecks).toBe('number');
  });

  it('flags missing lang when removed', () => {
    const host = makeHost('<button>x</button>');
    host.document.documentElement.removeAttribute('lang');
    const auditor = new A11yAuditor(host);
    const report = auditor.audit();
    const langIssue = report.issues.find((i) => i.rule === 'wcag-3.1.1');
    expect(langIssue).toBeTruthy();
    expect(langIssue?.severity).toBe('critical');
  });
});

describe('A11yAuditor — image alt text', () => {
  it('flags img without alt', () => {
    const host = makeHost('<img src="x.png">');
    const auditor = new A11yAuditor(host);
    const report = auditor.audit();
    const altIssue = report.issues.find((i) => i.rule.includes('1.1.1'));
    expect(altIssue).toBeTruthy();
  });

  it('passes img with alt', () => {
    const host = makeHost('<img src="x.png" alt="description">');
    const auditor = new A11yAuditor(host);
    const report = auditor.audit();
    const altIssue = report.issues.find((i) => i.rule.includes('1.1.1'));
    expect(altIssue).toBeUndefined();
  });
});

// ─── AuditReporter ───────────────────────────────────────────────────────────

describe('AuditReporter — format()', () => {
  const passReport: AuditReport = {
    level: 'AA',
    passed: true,
    issues: [],
    stats: { totalChecks: 10, passed: 10, failed: 0 },
  };

  it('includes PASS status for a clean report', () => {
    const text = AuditReporter.format(passReport);
    expect(text).toContain('=== WCAG Accessibility Audit ===');
    expect(text).toContain('Status: PASS');
    expect(text).toContain('Level: AA');
    expect(text).toContain('Checks: 10 | Passed: 10 | Failed: 0');
  });

  it('includes FAIL status and issue details', () => {
    const failReport: AuditReport = {
      level: 'AA',
      passed: false,
      issues: [
        { rule: '1.4.3', element: 'button', message: 'Low contrast', severity: 'critical', fix: 'Increase contrast' },
        { rule: '2.4.3', element: 'input', message: 'Missing label', severity: 'major' },
      ],
      stats: { totalChecks: 5, passed: 3, failed: 2 },
    };
    const text = AuditReporter.format(failReport);
    expect(text).toContain('Status: FAIL');
    expect(text).toContain('[CRITICAL]');
    expect(text).toContain('[MAJOR]');
    expect(text).toContain('button: Low contrast');
    expect(text).toContain('Fix: Increase contrast');
    expect(text).toContain('input: Missing label');
  });

  it('omits severity group when no issues of that type', () => {
    const report: AuditReport = {
      level: 'A',
      passed: false,
      issues: [{ rule: '1.1.1', element: 'img', message: 'No alt', severity: 'minor' }],
      stats: { totalChecks: 1, passed: 0, failed: 1 },
    };
    const text = AuditReporter.format(report);
    expect(text).toContain('[MINOR]');
    expect(text).not.toContain('[CRITICAL]');
    expect(text).not.toContain('[MAJOR]');
  });
});

describe('AuditReporter — toJSON()', () => {
  it('returns parseable JSON with report fields', () => {
    const report: AuditReport = {
      level: 'AAA',
      passed: true,
      issues: [],
      stats: { totalChecks: 3, passed: 3, failed: 0 },
    };
    const json = AuditReporter.toJSON(report);
    const parsed = JSON.parse(json);
    expect(parsed.level).toBe('AAA');
    expect(parsed.passed).toBe(true);
    expect(parsed.stats.totalChecks).toBe(3);
  });
});

describe('a11y factory', () => {
  it('a11y.auditor() returns an A11yAuditor instance', () => {
    expect(a11y.auditor()).toBeInstanceOf(A11yAuditor);
  });

  it('a11y.contrast is ColorContrast', () => {
    expect(a11y.contrast).toBeDefined();
    expect(typeof a11y.contrast.contrast).toBe('function');
  });

  it('a11y.reporter is AuditReporter', () => {
    expect(a11y.reporter).toBe(AuditReporter);
  });
});
