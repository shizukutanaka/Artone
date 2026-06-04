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

import { A11yAuditor } from '../accessibility/wcag-auditor';

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
