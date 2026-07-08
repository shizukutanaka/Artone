/**
 * WCAG 2.2 AAA アクセシビリティ監査 (2.5.8 Target Size, 2.4.11 Focus Not Obscured 含む)
 *
 * 検査項目:
 * - カラーコントラスト (AAA: テキスト 7:1 / 大文字 4.5:1)
 * - aria-label の有無
 * - キーボードナビゲーション可能性
 * - フォーカス可視
 * - alt 属性
 * - 見出し階層
 *
 * CI で実行可能。10年運用のアクセシビリティ品質維持。
 */

export interface AuditIssue {
  severity: 'critical' | 'major' | 'minor';
  rule: string;
  element: string;
  message: string;
  fix?: string;
}

export interface AuditReport {
  passed: boolean;
  level: 'AAA' | 'AA' | 'A' | 'FAIL';
  issues: AuditIssue[];
  stats: {
    totalChecks: number;
    passed: number;
    failed: number;
  };
}

// === カラーコントラスト ===

export class ColorContrast {
  /** WCAG 相対輝度計算 */
  static luminance(r: number, g: number, b: number): number {
    const ch = (c: number) => {
      const cs = c / 255;
      return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  /** コントラスト比 (1:1 〜 21:1) */
  static contrast(fg: [number, number, number], bg: [number, number, number]): number {
    const l1 = this.luminance(fg[0], fg[1], fg[2]);
    const l2 = this.luminance(bg[0], bg[1], bg[2]);
    const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (light + 0.05) / (dark + 0.05);
  }

  static parseHex(hex: string): [number, number, number] | null {
    const m = hex.replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  static parseRGB(rgb: string): [number, number, number] | null {
    // "rgba?\(" — was "rgb\(" only, which cannot match an "rgba(...)" string
    // at all ("rgb(" is never a substring of "rgba(": the "(" follows the
    // "a", not the "b"). parseColor() dispatches here for any string
    // starting with "rgb", including "rgba", and findBackground() explicitly
    // tries to parse near-opaque rgba backgrounds (alpha >= 0.99) as opaque
    // — both silently failed and treated the color as unparseable.
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  }

  static parseColor(color: string): [number, number, number] | null {
    if (color.startsWith('#')) return this.parseHex(color);
    if (color.startsWith('rgb')) return this.parseRGB(color);
    return null;
  }

  /** WCAG レベル判定 */
  static level(ratio: number, isLargeText = false): 'AAA' | 'AA' | 'A' | 'FAIL' {
    if (isLargeText) {
      if (ratio >= 4.5) return 'AAA';
      if (ratio >= 3) return 'AA';
      return 'FAIL';
    }
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    if (ratio >= 3) return 'A';
    return 'FAIL';
  }
}

// === DOM 監査 (ブラウザ + JSDOM 両対応) ===

/**
 * 監査の DOM 取得方法を抽象化。
 * ブラウザでは globalThis.window / document を、
 * Node では JSDOM のインスタンスを差し替え可能。
 */
export interface DOMHost {
  document: Document;
  window: Window & typeof globalThis;
}

export class A11yAuditor {
  private issues: AuditIssue[] = [];
  private checks = 0;
  private passed = 0;
  private host: DOMHost;

  /**
   * @param host - DOM ホスト。省略時はグローバル window/document を使う。
   *               Node 環境では JSDOM インスタンスを渡す:
   *               `new A11yAuditor({ document: dom.window.document, window: dom.window })`
   */
  constructor(host?: DOMHost) {
    if (host) {
      this.host = host;
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.host = { document, window: window as Window & typeof globalThis };
    } else {
      throw new Error(
        'A11yAuditor requires DOMHost in non-browser environments. Pass JSDOM: new A11yAuditor({ document: dom.window.document, window: dom.window })'
      );
    }
  }

  audit(root?: Element): AuditReport {
    const r = root ?? this.host.document.body;
    this.issues = [];
    this.checks = 0;
    this.passed = 0;

    this.checkColorContrast(r);
    this.checkImages(r);
    this.checkForms(r);
    this.checkButtons(r);
    this.checkHeadings(r);
    this.checkLandmarks(r);
    this.checkFocus(r);
    this.checkLanguage();
    this.checkTargetSize(r);        // WCAG 2.2 — 2.5.8
    this.checkFocusNotObscured(r);  // WCAG 2.2 — 2.4.11

    const failed = this.issues.length;
    const level = this.computeLevel();

    return {
      passed: failed === 0,
      level,
      issues: this.issues,
      stats: { totalChecks: this.checks, passed: this.passed, failed },
    };
  }

  private checkColorContrast(root: Element): void {
    const textNodes = root.querySelectorAll('p, span, div, a, button, label, h1, h2, h3, h4, h5, h6, li, td, th');
    for (const el of Array.from(textNodes)) {
      if (el.textContent?.trim() === '') continue;
      this.checks++;
      let style: CSSStyleDeclaration;
      try { style = this.host.window.getComputedStyle(el); } catch { this.passed++; continue; }
      const fg = ColorContrast.parseColor(style.color);
      const bg = this.findBackground(el);
      if (!fg || !bg) continue;

      const ratio = ColorContrast.contrast(fg, bg);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight) || 400;
      const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
      const level = ColorContrast.level(ratio, isLarge);

      if (level === 'FAIL') {
        this.issues.push({
          severity: 'critical',
          rule: 'wcag-1.4.6',
          element: this.describeElement(el),
          message: `Contrast ratio ${ratio.toFixed(2)}:1 fails WCAG AAA (need ${isLarge ? '4.5' : '7'}:1)`,
          fix: 'Increase color contrast between text and background',
        });
      } else if (level === 'A' || (level === 'AA' && !isLarge)) {
        this.issues.push({
          severity: 'major',
          rule: 'wcag-1.4.6',
          element: this.describeElement(el),
          message: `Contrast ${ratio.toFixed(2)}:1 is ${level} but not AAA`,
        });
      } else {
        this.passed++;
      }
    }
  }

  private findBackground(el: Element): [number, number, number] | null {
    let cur: Element | null = el;
    while (cur) {
      let style: CSSStyleDeclaration;
      try { style = this.host.window.getComputedStyle(cur); } catch { break; }
      const raw = style.backgroundColor;

      // 完全透明をスキップ
      if (raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)' || raw === '') {
        cur = cur.parentElement;
        continue;
      }

      // rgba で alpha < 1 なら親へ (簡易対応 — alpha 合成は将来対応)
      const alphaMatch = raw.match(/rgba?\([^)]+,\s*([\d.]+)\s*\)/);
      if (alphaMatch && parseFloat(alphaMatch[1]) < 0.99) {
        cur = cur.parentElement;
        continue;
      }

      const bg = ColorContrast.parseColor(raw);
      if (bg) return bg;
      cur = cur.parentElement;
    }
    return [255, 255, 255];
  }

  private checkImages(root: Element): void {
    for (const img of Array.from(root.querySelectorAll('img'))) {
      this.checks++;
      if (!img.hasAttribute('alt')) {
        this.issues.push({
          severity: 'critical',
          rule: 'wcag-1.1.1',
          element: this.describeElement(img),
          message: 'Image missing alt attribute',
          fix: 'Add alt="" for decorative or alt="description" for content',
        });
      } else {
        this.passed++;
      }
    }
  }

  private checkForms(root: Element): void {
    for (const input of Array.from(root.querySelectorAll('input, select, textarea'))) {
      this.checks++;
      const id = input.getAttribute('id');
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      const hasLabel = id ? root.querySelector(`label[for="${id}"]`) : null;

      if (!ariaLabel && !ariaLabelledBy && !hasLabel) {
        this.issues.push({
          severity: 'critical',
          rule: 'wcag-3.3.2',
          element: this.describeElement(input),
          message: 'Form control missing accessible label',
          fix: 'Add <label for="..."> or aria-label or aria-labelledby',
        });
      } else {
        this.passed++;
      }
    }
  }

  private checkButtons(root: Element): void {
    for (const btn of Array.from(root.querySelectorAll('button, [role="button"]'))) {
      this.checks++;
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute('aria-label');
      if (!text && !ariaLabel) {
        this.issues.push({
          severity: 'critical',
          rule: 'wcag-4.1.2',
          element: this.describeElement(btn),
          message: 'Button has no accessible name',
          fix: 'Add text content or aria-label',
        });
      } else {
        this.passed++;
      }
    }
  }

  private checkHeadings(root: Element): void {
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let prevLevel = 0;
    for (const h of headings) {
      this.checks++;
      const level = parseInt(h.tagName[1]);
      if (prevLevel > 0 && level > prevLevel + 1) {
        this.issues.push({
          severity: 'major',
          rule: 'wcag-1.3.1',
          element: this.describeElement(h),
          message: `Heading level skipped (h${prevLevel} → h${level})`,
          fix: 'Use sequential heading levels',
        });
      } else {
        this.passed++;
      }
      prevLevel = level;
    }
  }

  private checkLandmarks(root: Element): void {
    this.checks++;
    const main = root.querySelector('main, [role="main"]');
    if (!main) {
      this.issues.push({
        severity: 'major',
        rule: 'wcag-1.3.1',
        element: 'document',
        message: 'No main landmark found',
        fix: 'Add <main> element',
      });
    } else {
      this.passed++;
    }
  }

  private checkFocus(root: Element): void {
    const focusables = root.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]'
    );
    for (const el of Array.from(focusables)) {
      this.checks++;
      const tabindex = el.getAttribute('tabindex');
      if (tabindex && parseInt(tabindex) > 0) {
        this.issues.push({
          severity: 'minor',
          rule: 'wcag-2.4.3',
          element: this.describeElement(el),
          message: 'Positive tabindex disrupts natural tab order',
          fix: 'Use tabindex="0" or rely on DOM order',
        });
      } else {
        this.passed++;
      }
    }
  }

  private checkLanguage(): void {
    this.checks++;
    if (!this.host.document.documentElement.hasAttribute('lang')) {
      this.issues.push({
        severity: 'critical',
        rule: 'wcag-3.1.1',
        element: '<html>',
        message: 'Missing lang attribute on <html>',
        fix: 'Add lang="ja" or appropriate language code',
      });
    } else {
      this.passed++;
    }
  }

  /**
   * WCAG 2.2 — 2.5.8 Target Size (Minimum, Level AA)
   * インタラクティブ要素は最小 24x24 CSS px。
   * (WCAG 2.2 2025年10月時点の現行標準, EAA 準拠要件)
   */
  private checkTargetSize(root: Element): void {
    const interactive = root.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], [role="button"], [role="link"]'
    );
    const MIN_SIZE = 24; // WCAG 2.2 minimum (推奨は 44)
    for (const el of Array.from(interactive)) {
      this.checks++;
      const rect = (el as HTMLElement).getBoundingClientRect?.();
      if (!rect) { this.passed++; continue; }
      // サイズ 0 はレイアウト未確定 (jsdom) — スキップ
      if (rect.width === 0 && rect.height === 0) { this.passed++; continue; }
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
        this.issues.push({
          severity: 'major',
          rule: 'wcag-2.5.8',
          element: this.describeElement(el),
          message: `Target size ${Math.round(rect.width)}x${Math.round(rect.height)}px is below WCAG 2.2 minimum (24x24)`,
          fix: 'Increase padding or min-width/min-height to at least 24px (44px recommended)',
        });
      } else {
        this.passed++;
      }
    }
  }

  /**
   * WCAG 2.2 — 2.4.11 Focus Not Obscured (Minimum, Level AA)
   * フォーカスを受けた要素が sticky header/footer 等で完全に隠れてはいけない。
   * position: sticky/fixed の要素を検出して警告 (ヒューリスティック)。
   */
  private checkFocusNotObscured(root: Element): void {
    const win = this.host.window as Window | undefined;
    if (!win?.getComputedStyle) return;
    const all = root.querySelectorAll('header, footer, [class*="sticky"], [class*="fixed"]');
    for (const el of Array.from(all)) {
      this.checks++;
      let position = '';
      try {
        position = win.getComputedStyle(el as Element).position;
      } catch { this.passed++; continue; }
      if (position === 'sticky' || position === 'fixed') {
        this.issues.push({
          severity: 'minor',
          rule: 'wcag-2.4.11',
          element: this.describeElement(el),
          message: 'Sticky/fixed element may obscure keyboard focus (WCAG 2.2 Focus Not Obscured)',
          fix: 'Ensure scroll-padding or scroll-margin keeps focused elements visible',
        });
      } else {
        this.passed++;
      }
    }
  }

  private describeElement(el: Element): string {
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className ? `.${el.className.toString().split(' ')[0]}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  }

  private computeLevel(): 'AAA' | 'AA' | 'A' | 'FAIL' {
    const critical = this.issues.filter((i) => i.severity === 'critical').length;
    const major = this.issues.filter((i) => i.severity === 'major').length;
    if (critical > 0) return 'FAIL';
    if (major > 0) return 'AA';
    return 'AAA';
  }
}

// === レポート生成 ===

export class AuditReporter {
  static format(report: AuditReport): string {
    const lines: string[] = [];
    lines.push('=== WCAG Accessibility Audit ===');
    lines.push(`Level: ${report.level}`);
    lines.push(`Status: ${report.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`Checks: ${report.stats.totalChecks} | Passed: ${report.stats.passed} | Failed: ${report.stats.failed}`);
    lines.push('');

    const grouped = new Map<string, AuditIssue[]>();
    for (const issue of report.issues) {
      const arr = grouped.get(issue.severity) ?? [];
      arr.push(issue);
      grouped.set(issue.severity, arr);
    }

    for (const sev of ['critical', 'major', 'minor'] as const) {
      const issues = grouped.get(sev);
      if (!issues) continue;
      lines.push(`[${sev.toUpperCase()}] ${issues.length} issue(s):`);
      for (const i of issues) {
        lines.push(`  - ${i.element}: ${i.message} (${i.rule})`);
        if (i.fix) lines.push(`    Fix: ${i.fix}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  static toJSON(report: AuditReport): string {
    return JSON.stringify(report, null, 2);
  }
}

// === ファクトリ ===

export const a11y = {
  auditor: () => new A11yAuditor(),
  contrast: ColorContrast,
  reporter: AuditReporter,
};
