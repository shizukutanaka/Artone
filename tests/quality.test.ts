/**
 * Quality 系モジュールのテスト
 */

import { describe, it, expect } from 'vitest';
import { bench, BaselineStore } from '../bench/regression-detector';
import { ColorContrast } from '../accessibility/wcag-auditor';
import { LicenseAnalyzer, supplyChain, type Component } from '../security/sbom';

describe('Benchmark Runner', () => {
  it('runs and produces statistics', async () => {
    const runner = bench.runner();
    runner.register({
      name: 'test.noop',
      category: 'render',
      iterations: 50,
      warmup: 5,
      run: () => {
        let s = 0;
        for (let i = 0; i < 100; i++) s += i;
        void s;
      },
    });

    const results = await runner.runAll();
    expect(results.length).toBe(1);
    expect(results[0].iterations).toBe(50);
    expect(results[0].meanMs).toBeGreaterThan(0);
    expect(results[0].p95Ms).toBeGreaterThanOrEqual(results[0].medianMs);
    expect(results[0].opsPerSec).toBeGreaterThan(0);
  });
});

describe('Regression Detector', () => {
  it('detects regression', () => {
    const baseline = BaselineStore.toBaseline('1.0.0', [
      {
        name: 'test.foo',
        category: 'render',
        iterations: 10,
        meanMs: 10,
        medianMs: 10,
        p95Ms: 11,
        p99Ms: 12,
        stdDevMs: 0.5,
        minMs: 9,
        maxMs: 13,
        opsPerSec: 100,
        timestamp: 0,
      },
    ]);

    const current = [
      {
        name: 'test.foo',
        category: 'render',
        iterations: 10,
        meanMs: 14, // 40% slower → critical
        medianMs: 14,
        p95Ms: 15,
        p99Ms: 16,
        stdDevMs: 0.5,
        minMs: 13,
        maxMs: 17,
        opsPerSec: 71,
        timestamp: 0,
      },
    ];

    const detector = bench.detector();
    const report = detector.detect(baseline, current);

    expect(report.regressions.length).toBe(1);
    expect(report.regressions[0].severity).toBe('critical');
    expect(report.passed).toBe(false);
  });

  it('detects improvements', () => {
    const baseline = BaselineStore.toBaseline('1.0.0', [
      {
        name: 'test.foo',
        category: 'render',
        iterations: 10,
        meanMs: 10,
        medianMs: 10,
        p95Ms: 11,
        p99Ms: 12,
        stdDevMs: 0.5,
        minMs: 9,
        maxMs: 13,
        opsPerSec: 100,
        timestamp: 0,
      },
    ]);

    const current = [
      {
        ...baseline.results['test.foo'],
        meanMs: 7, // 30% faster
      },
    ];

    const detector = bench.detector();
    const report = detector.detect(baseline, current);

    expect(report.improvements.length).toBe(1);
    expect(report.improvements[0].deltaPercent).toBeLessThan(0);
    expect(report.passed).toBe(true);
  });

  it('passes when no significant change', () => {
    const baseline = BaselineStore.toBaseline('1.0.0', [
      {
        name: 'test.foo',
        category: 'render',
        iterations: 10,
        meanMs: 10,
        medianMs: 10,
        p95Ms: 11,
        p99Ms: 12,
        stdDevMs: 0.5,
        minMs: 9,
        maxMs: 13,
        opsPerSec: 100,
        timestamp: 0,
      },
    ]);

    const current = [{ ...baseline.results['test.foo'], meanMs: 10.2 }]; // 2% — under threshold

    const detector = bench.detector();
    const report = detector.detect(baseline, current);

    expect(report.regressions.length).toBe(0);
    expect(report.passed).toBe(true);
  });
});

describe('Color Contrast (WCAG)', () => {
  it('computes luminance correctly', () => {
    const black = ColorContrast.luminance(0, 0, 0);
    const white = ColorContrast.luminance(255, 255, 255);
    expect(black).toBe(0);
    expect(white).toBeCloseTo(1, 2);
  });

  it('computes black/white contrast as 21:1', () => {
    const ratio = ColorContrast.contrast([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('rates AAA for high contrast text', () => {
    const ratio = ColorContrast.contrast([0, 0, 0], [255, 255, 255]);
    expect(ColorContrast.level(ratio, false)).toBe('AAA');
  });

  it('rates FAIL for low contrast', () => {
    const ratio = ColorContrast.contrast([200, 200, 200], [255, 255, 255]);
    expect(ColorContrast.level(ratio, false)).toBe('FAIL');
  });

  it('parses hex colors', () => {
    expect(ColorContrast.parseHex('#000000')).toEqual([0, 0, 0]);
    expect(ColorContrast.parseHex('#ffffff')).toEqual([255, 255, 255]);
    expect(ColorContrast.parseHex('#fff')).toEqual([255, 255, 255]);
    expect(ColorContrast.parseHex('invalid')).toBeNull();
  });

  it('parses rgb() colors', () => {
    expect(ColorContrast.parseRGB('rgb(100, 200, 50)')).toEqual([100, 200, 50]);
  });
});

describe('License Analyzer', () => {
  it('categorizes permissive licenses', () => {
    expect(LicenseAnalyzer.categorize('MIT')).toBe('permissive');
    expect(LicenseAnalyzer.categorize('Apache-2.0')).toBe('permissive');
    expect(LicenseAnalyzer.categorize('BSD-3-Clause')).toBe('permissive');
    expect(LicenseAnalyzer.categorize('MIT-0')).toBe('permissive'); // not "MIT" prefix match
  });

  it('categorizes copyleft licenses', () => {
    expect(LicenseAnalyzer.categorize('GPL-3.0')).toBe('strong-copyleft');
    expect(LicenseAnalyzer.categorize('GPL-3.0-or-later')).toBe('strong-copyleft');
    expect(LicenseAnalyzer.categorize('AGPL-3.0')).toBe('strong-copyleft');
    expect(LicenseAnalyzer.categorize('LGPL-2.1')).toBe('weak-copyleft');
  });

  it('handles SPDX expressions (OR/AND)', () => {
    // OR で結ばれた式: 最強 (制約多い側) を採用
    expect(LicenseAnalyzer.categorize('MIT OR GPL-3.0')).toBe('strong-copyleft');
    expect(LicenseAnalyzer.categorize('Apache-2.0 OR MIT')).toBe('permissive');
  });

  it('rejects unknown licenses', () => {
    expect(LicenseAnalyzer.categorize('SuperCustom-2.0')).toBe('unknown');
    expect(LicenseAnalyzer.categorize(null)).toBe('unknown');
  });

  it('flags incompatible licenses', () => {
    const r = LicenseAnalyzer.compatible('MIT', 'GPL-3.0');
    expect(r.compatible).toBe(false);
    expect(r.warning).toBeTruthy();
  });

  it('allows compatible licenses', () => {
    const r = LicenseAnalyzer.compatible('MIT', 'Apache-2.0');
    expect(r.compatible).toBe(true);
  });
});

describe('Supply Chain Auditor', () => {
  const project: Component = {
    name: 'test-project',
    version: '1.0.0',
    type: 'application',
    license: 'MIT',
  };

  it('passes audit with safe components', () => {
    const components: Component[] = [
      { name: 'react', version: '18.3.1', type: 'library', license: 'MIT' },
      { name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT' },
    ];

    const auditor = supplyChain.auditor();
    const report = auditor.audit(project, components, []);

    expect(report.summary.passed).toBe(true);
    expect(report.licenseConflicts.length).toBe(0);
  });

  it('detects license conflicts', () => {
    const components: Component[] = [
      { name: 'gpl-lib', version: '1.0.0', type: 'library', license: 'GPL-3.0' },
    ];

    const auditor = supplyChain.auditor();
    const report = auditor.audit(project, components, []);

    expect(report.summary.passed).toBe(false);
    expect(report.licenseConflicts.length).toBe(1);
  });

  it('detects vulnerabilities', () => {
    const components: Component[] = [
      { name: 'vulnerable-pkg', version: '1.0.0', type: 'library', license: 'MIT' },
    ];

    const cves = [
      {
        id: 'CVE-2024-0001',
        package: 'vulnerable-pkg',
        affectedVersions: '<2.0.0',
        severity: 'critical' as const,
        description: 'RCE vulnerability',
        fixedIn: '2.0.0',
      },
    ];

    const auditor = supplyChain.auditor();
    const report = auditor.audit(project, components, [], cves);

    expect(report.summary.criticalVulns).toBe(1);
    expect(report.summary.passed).toBe(false);
  });
});

// === A11yAuditor DOM walking tests ===
import { a11y } from '../accessibility/wcag-auditor';

describe('A11yAuditor (DOM walking)', () => {
  function setupDOM(html: string): void {
    document.documentElement.innerHTML = `<head></head><body>${html}</body>`;
  }

  it('passes when DOM is clean', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><h1 style="color:black;background:white">Hello</h1></main>');
    const report = a11y.auditor().audit();
    expect(report.issues.filter((i) => i.severity === 'critical')).toEqual([]);
  });

  it('flags missing lang attribute', () => {
    document.documentElement.removeAttribute('lang');
    setupDOM('<main><p>test</p></main>');
    const report = a11y.auditor().audit();
    const langIssue = report.issues.find((i) => i.rule === 'wcag-3.1.1');
    expect(langIssue).toBeTruthy();
    expect(langIssue?.severity).toBe('critical');
  });

  it('flags images without alt', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><img src="x"></main>');
    const report = a11y.auditor().audit();
    const altIssue = report.issues.find((i) => i.rule === 'wcag-1.1.1');
    expect(altIssue?.severity).toBe('critical');
  });

  it('passes images with empty alt (decorative)', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><img src="x" alt=""></main>');
    const report = a11y.auditor().audit();
    const altIssues = report.issues.filter((i) => i.rule === 'wcag-1.1.1');
    expect(altIssues).toEqual([]);
  });

  it('flags unlabeled form inputs', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><input type="text"></main>');
    const report = a11y.auditor().audit();
    const labelIssue = report.issues.find((i) => i.rule === 'wcag-3.3.2');
    expect(labelIssue?.severity).toBe('critical');
  });

  it('passes inputs with aria-label', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><input type="text" aria-label="Search"></main>');
    const report = a11y.auditor().audit();
    const issues = report.issues.filter((i) => i.rule === 'wcag-3.3.2');
    expect(issues).toEqual([]);
  });

  it('flags buttons without accessible name', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><button></button></main>');
    const report = a11y.auditor().audit();
    const btnIssue = report.issues.find((i) => i.rule === 'wcag-4.1.2');
    expect(btnIssue?.severity).toBe('critical');
  });

  it('flags positive tabindex', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><a href="#" tabindex="5">Link</a></main>');
    const report = a11y.auditor().audit();
    const tabIssue = report.issues.find((i) => i.rule === 'wcag-2.4.3');
    expect(tabIssue?.severity).toBe('minor');
  });

  it('flags skipped heading levels', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<main><h1>A</h1><h3>B</h3></main>');
    const report = a11y.auditor().audit();
    const headingIssue = report.issues.find(
      (i) => i.rule === 'wcag-1.3.1' && i.message.includes('Heading')
    );
    expect(headingIssue?.severity).toBe('major');
  });

  it('flags missing main landmark', () => {
    document.documentElement.lang = 'ja';
    setupDOM('<div><p>No main</p></div>');
    const report = a11y.auditor().audit();
    const mainIssue = report.issues.find(
      (i) => i.rule === 'wcag-1.3.1' && i.element === 'document'
    );
    expect(mainIssue?.severity).toBe('major');
  });
});
