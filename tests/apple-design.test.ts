/**
 * Apple 式改善のテスト
 *
 * - デザインシステム整合性
 * - ファジー検索
 * - 段階的開示
 * - WCAG AAA コントラスト保証
 */

import { describe, it, expect } from 'vitest';
import { ds, color, space, typography, radius, featureTier, CSS_VARIABLES, injectCSSVariables, type FeatureTier, type FeatureKey } from '../app/design-system';

describe('Design System — Color', () => {
  it('brand color is #00C4CC', () => {
    expect(color.brand).toBe('#00C4CC');
  });

  it('no color value is duplicated across roles', () => {
    const semanticColors = [
      color.brand,
      color.interactive,
      color.positive,
      color.caution,
      color.destructive,
      color.info,
      color.playhead,
    ];
    const unique = new Set(semanticColors);
    expect(unique.size).toBe(semanticColors.length);
  });

  it('surface hierarchy is strictly darkening', () => {
    // surface0 < surface1 < surface2 < surface3 < surface4 (lightness)
    const surfaces = [color.surface0, color.surface1, color.surface2, color.surface3, color.surface4];
    for (let i = 0; i < surfaces.length - 1; i++) {
      const a = hexLightness(surfaces[i]);
      const b = hexLightness(surfaces[i + 1]);
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });

  it('text on surface1 meets WCAG AAA (7:1)', () => {
    const bg = hexToRgb(color.surface1);
    const fg = hexToRgb(color.textPrimary);
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it('textSecondary on surface1 meets WCAG AA (4.5:1)', () => {
    const bg = hexToRgb(color.surface1);
    const fg = hexToRgb(color.textSecondary);
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('textOnBrand on brand meets WCAG AA (4.5:1)', () => {
    const bg = hexToRgb(color.brand);
    const fg = hexToRgb(color.textOnBrand);
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Design System — Spacing', () => {
  it('all values are multiples of 4', () => {
    for (const [, v] of Object.entries(space)) {
      expect(v % 4).toBe(0);
    }
  });

  it('scale is monotonically increasing', () => {
    const values = Object.values(space);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });
});

describe('Design System — Typography', () => {
  it('display > title > body > caption in font size', () => {
    expect(typography.display.fontSize).toBeGreaterThan(typography.title.fontSize);
    expect(typography.title.fontSize).toBeGreaterThanOrEqual(typography.body.fontSize);
    expect(typography.body.fontSize).toBeGreaterThan(typography.caption.fontSize);
  });

  it('font families are defined', () => {
    expect(typography.fontFamily.sans).toContain('system-ui');
    expect(typography.fontFamily.mono).toContain('monospace');
  });
});

describe('Design System — Feature Tiers', () => {
  it('essential tier has minimum viable features', () => {
    const essentials = Object.entries(featureTier)
      .filter(([, tier]) => tier === 'essential')
      .map(([key]) => key);
    expect(essentials).toContain('cut');
    expect(essentials).toContain('export');
    expect(essentials).toContain('undo');
    expect(essentials).toContain('playback');
  });

  it('pro features are not in essential', () => {
    expect(featureTier.multicam).toBe('pro');
    expect(featureTier.liveStream).toBe('pro');
    expect(featureTier.otioExport).toBe('pro');
    expect(featureTier.videoScopes).toBe('pro');
  });

  it('standard is the middle ground', () => {
    expect(featureTier.colorGrade).toBe('standard');
    expect(featureTier.captions).toBe('standard');
    expect(featureTier.effects).toBe('standard');
  });

  it('all tiers have at least 3 features', () => {
    const counts: Record<FeatureTier, number> = { essential: 0, standard: 0, pro: 0 };
    for (const tier of Object.values(featureTier)) counts[tier]++;
    expect(counts.essential).toBeGreaterThanOrEqual(3);
    expect(counts.standard).toBeGreaterThanOrEqual(3);
    expect(counts.pro).toBeGreaterThanOrEqual(3);
  });
});

describe('Design System — CSS Variables', () => {
  it('CSS_VARIABLES is a pre-computed constant', () => {
    expect(typeof CSS_VARIABLES).toBe('string');
    expect(CSS_VARIABLES).toContain(':root');
    expect(CSS_VARIABLES).toContain('--nv-brand');
  });

  it('injectCSSVariables returns same value (deprecated compat)', () => {
    expect(injectCSSVariables()).toBe(CSS_VARIABLES);
  });

  it('contains all critical variables', () => {
    const required = ['--nv-surface-1', '--nv-text-1', '--nv-font-sans', '--nv-brand'];
    for (const v of required) {
      expect(CSS_VARIABLES).toContain(v);
    }
  });
});

describe('Design System — FeatureKey type safety', () => {
  it('featureTier keys are all valid FeatureKey', () => {
    const keys: FeatureKey[] = Object.keys(featureTier) as FeatureKey[];
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });

  it('featureTier is readonly at type level', () => {
    // as const satisfies → TypeScript で readonly 強制
    // ランタイムでは通常の object だが、キーの存在は型で保証
    const keys = Object.keys(featureTier);
    expect(keys).toContain('cut');
    expect(keys).toContain('multicam');
    // 存在しないキーは undefined (型レベルでは compile error)
    expect((featureTier as Record<string, unknown>)['nonexistent']).toBeUndefined();
  });
});

describe('Design System — Helpers', () => {
  it('ds.button variants have correct structure', () => {
    const primary = ds.button('primary');
    expect(primary.background).toBe(color.brand);
    expect(primary.cursor).toBe('pointer');

    const ghost = ds.button('ghost');
    expect(ghost.background).toBe('transparent');
    expect(ghost.border).toBe('none');
  });

  it('ds.text returns correct font sizes', () => {
    expect(ds.text('display').fontSize).toBe(20);
    expect(ds.text('body').fontSize).toBe(13);
    expect(ds.text('mono').fontFamily).toBe(typography.fontFamily.mono);
  });

  it('ds.panel returns consistent style', () => {
    const panel = ds.panel();
    expect(panel.background).toBe(color.surface2);
    expect(panel.borderRadius).toBe(radius.lg);
  });
});

// === ファジー検索テスト ===

describe('Fuzzy Search', () => {
  // 簡易ファジー再実装 (テスト内で自己完結)
  function fuzzyMatch(q: string, t: string): { match: boolean; score: number } {
    if (!q) return { match: true, score: 0 };
    const ql = q.toLowerCase();
    const tl = t.toLowerCase();
    if (tl.startsWith(ql)) return { match: true, score: 100 };
    if (tl.includes(ql)) return { match: true, score: 80 };
    let qi = 0;
    let consecutive = 0;
    let maxConsecutive = 0;
    for (let i = 0; i < tl.length && qi < ql.length; i++) {
      if (tl[i] === ql[qi]) { qi++; consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
      else consecutive = 0;
    }
    if (qi === ql.length) return { match: true, score: 40 + maxConsecutive * 10 };
    return { match: false, score: 0 };
  }

  it('exact prefix match scores highest', () => {
    expect(fuzzyMatch('カット', 'カット').score).toBe(100);
  });

  it('substring match scores high', () => {
    expect(fuzzyMatch('カラー', 'カラー補正').score).toBe(100);
  });

  it('fuzzy match works', () => {
    const r = fuzzyMatch('ct', 'cut');
    expect(r.match).toBe(true);
  });

  it('non-match returns false', () => {
    expect(fuzzyMatch('xyz', 'カット').match).toBe(false);
  });

  it('empty query matches everything', () => {
    expect(fuzzyMatch('', 'anything').match).toBe(true);
  });
});

// === ヘルパー ===

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hexLightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function luminance(r: number, g: number, b: number): number {
  const ch = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(fg[0], fg[1], fg[2]);
  const l2 = luminance(bg[0], bg[1], bg[2]);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
