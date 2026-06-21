/**
 * Tests for audio/fade-curves.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  fadeInGain, fadeOutGain,
  generateFadeCurve,
  applyFadeIn, applyFadeOut,
  crossfade,
  applyGainRamp,
  gainToDb, dbToGain,
  crossfadeMidpointPower, crossfadeMidpointAmplitude,
} from '../audio/fade-curves';
import type { FadeShape } from '../audio/fade-curves';

const ALL_SHAPES: FadeShape[] = [
  'linear', 'equal-power', 'equal-gain', 'logarithmic', 'exponential', 's-curve',
];

/** Constant-value buffer. */
function constBuffer(n: number, v = 1): Float32Array {
  return new Float32Array(n).fill(v);
}

// ─── fadeInGain ───────────────────────────────────────────────────────────────

describe('fadeInGain', () => {
  it('all shapes: g(0) = 0', () => {
    for (const s of ALL_SHAPES) {
      expect(fadeInGain(s, 0)).toBeCloseTo(0, 6);
    }
  });

  it('all shapes: g(1) = 1', () => {
    for (const s of ALL_SHAPES) {
      expect(fadeInGain(s, 1)).toBeCloseTo(1, 6);
    }
  });

  it('all shapes: monotonically increasing', () => {
    for (const s of ALL_SHAPES) {
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const g = fadeInGain(s, i / 20);
        expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = g;
      }
    }
  });

  it('linear g(0.5) = 0.5', () => {
    expect(fadeInGain('linear', 0.5)).toBeCloseTo(0.5, 6);
  });

  it('equal-power g(0.5) = √0.5 (−3 dB)', () => {
    expect(fadeInGain('equal-power', 0.5)).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('s-curve g(0.5) = 0.5 (symmetric)', () => {
    expect(fadeInGain('s-curve', 0.5)).toBeCloseTo(0.5, 6);
  });

  it('clamps progress outside [0,1]', () => {
    expect(fadeInGain('linear', -1)).toBe(0);
    expect(fadeInGain('linear', 2)).toBe(1);
  });

  it('exponential rises slowly at first (g(0.5) < 0.5)', () => {
    expect(fadeInGain('exponential', 0.5)).toBeLessThan(0.5);
  });

  it('logarithmic rises fast at first (g(0.5) > 0.5)', () => {
    expect(fadeInGain('logarithmic', 0.5)).toBeGreaterThan(0.5);
  });
});

// ─── fadeOutGain ──────────────────────────────────────────────────────────────

describe('fadeOutGain', () => {
  it('all shapes: g(0) = 1', () => {
    for (const s of ALL_SHAPES) {
      expect(fadeOutGain(s, 0)).toBeCloseTo(1, 6);
    }
  });

  it('all shapes: g(1) = 0', () => {
    for (const s of ALL_SHAPES) {
      expect(fadeOutGain(s, 1)).toBeCloseTo(0, 6);
    }
  });

  it('all shapes: monotonically decreasing', () => {
    for (const s of ALL_SHAPES) {
      let prev = Infinity;
      for (let i = 0; i <= 20; i++) {
        const g = fadeOutGain(s, i / 20);
        expect(g).toBeLessThanOrEqual(prev + 1e-9);
        prev = g;
      }
    }
  });

  it('equal-power g(0.5) = √0.5', () => {
    expect(fadeOutGain('equal-power', 0.5)).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('linear g(0.5) = 0.5', () => {
    expect(fadeOutGain('linear', 0.5)).toBeCloseTo(0.5, 6);
  });

  it('equal-power: fadeIn² + fadeOut² = 1 (constant power)', () => {
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      const gi = fadeInGain('equal-power', p);
      const go = fadeOutGain('equal-power', p);
      expect(gi * gi + go * go).toBeCloseTo(1, 6);
    }
  });

  it('linear: fadeIn + fadeOut = 1 (constant amplitude)', () => {
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      expect(fadeInGain('linear', p) + fadeOutGain('linear', p)).toBeCloseTo(1, 6);
    }
  });
});

// ─── generateFadeCurve ────────────────────────────────────────────────────────

describe('generateFadeCurve', () => {
  it('produces a curve of the requested length', () => {
    const curve = generateFadeCurve('linear', 'in', 100);
    expect(curve.length).toBe(100);
  });

  it('fade-in starts at 0 and ends at 1', () => {
    const curve = generateFadeCurve('equal-power', 'in', 50);
    expect(curve[0]).toBeCloseTo(0, 6);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
  });

  it('fade-out starts at 1 and ends at 0', () => {
    const curve = generateFadeCurve('equal-power', 'out', 50);
    expect(curve[0]).toBeCloseTo(1, 6);
    expect(curve[curve.length - 1]).toBeCloseTo(0, 6);
  });

  it('throws on length < 1', () => {
    expect(() => generateFadeCurve('linear', 'in', 0)).toThrow(RangeError);
  });

  it('length 1 returns single endpoint value', () => {
    expect(generateFadeCurve('linear', 'in', 1)[0]).toBeCloseTo(1, 6);
    expect(generateFadeCurve('linear', 'out', 1)[0]).toBeCloseTo(1, 6);
  });

  it('all values within [0, 1]', () => {
    for (const s of ALL_SHAPES) {
      const curve = generateFadeCurve(s, 'in', 64);
      for (const v of curve) {
        expect(v).toBeGreaterThanOrEqual(-1e-6);
        expect(v).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
});

// ─── applyFadeIn ──────────────────────────────────────────────────────────────

describe('applyFadeIn', () => {
  it('first sample is silenced, last fade sample at full gain', () => {
    const input = constBuffer(100, 1);
    const out = applyFadeIn(input, 10, 'linear');
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[9]).toBeCloseTo(1, 6);  // last fade sample = full
  });

  it('samples after fade region are unchanged', () => {
    const input = constBuffer(100, 0.8);
    const out = applyFadeIn(input, 10);
    for (let i = 10; i < 100; i++) {
      expect(out[i]).toBeCloseTo(0.8, 6);
    }
  });

  it('does not mutate input', () => {
    const input = constBuffer(20, 1);
    const copy = Float32Array.from(input);
    applyFadeIn(input, 5);
    expect(Array.from(input)).toEqual(Array.from(copy));
  });

  it('fadeSamples <= 0 returns a copy unchanged', () => {
    const input = constBuffer(10, 0.5);
    const out = applyFadeIn(input, 0);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it('fadeSamples larger than input is clamped', () => {
    const input = constBuffer(5, 1);
    const out = applyFadeIn(input, 100, 'linear');
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[4]).toBeCloseTo(1, 6);
  });
});

// ─── applyFadeOut ─────────────────────────────────────────────────────────────

describe('applyFadeOut', () => {
  it('last sample is silenced, first fade sample at full gain', () => {
    const input = constBuffer(100, 1);
    const out = applyFadeOut(input, 10, 'linear');
    expect(out[99]).toBeCloseTo(0, 6);
    expect(out[90]).toBeCloseTo(1, 6); // first fade sample = full
  });

  it('samples before fade region are unchanged', () => {
    const input = constBuffer(100, 0.7);
    const out = applyFadeOut(input, 10);
    for (let i = 0; i < 90; i++) {
      expect(out[i]).toBeCloseTo(0.7, 6);
    }
  });

  it('does not mutate input', () => {
    const input = constBuffer(20, 1);
    const copy = Float32Array.from(input);
    applyFadeOut(input, 5);
    expect(Array.from(input)).toEqual(Array.from(copy));
  });
});

// ─── crossfade ────────────────────────────────────────────────────────────────

describe('crossfade', () => {
  it('output length is A + B − overlap', () => {
    const a = constBuffer(100, 1);
    const b = constBuffer(80, 1);
    const out = crossfade(a, b, { lengthSamples: 20 });
    expect(out.length).toBe(100 + 80 - 20);
  });

  it('zero overlap concatenates', () => {
    const a = constBuffer(5, 0.5);
    const b = constBuffer(5, 0.9);
    const out = crossfade(a, b, { lengthSamples: 0 });
    expect(out.length).toBe(10);
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[5]).toBeCloseTo(0.9, 6);
  });

  it('head of A (before overlap) is preserved', () => {
    const a = constBuffer(100, 0.6);
    const b = constBuffer(100, 0.6);
    const out = crossfade(a, b, { lengthSamples: 20 });
    for (let i = 0; i < 80; i++) {
      expect(out[i]).toBeCloseTo(0.6, 6);
    }
  });

  it('tail of B (after overlap) is preserved', () => {
    const a = constBuffer(100, 0.6);
    const b = constBuffer(100, 0.4);
    const out = crossfade(a, b, { lengthSamples: 20 });
    // After overlap region: B samples from index 20..99
    for (let i = 100; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(0.4, 6);
    }
  });

  it('equal-power crossfade of identical signals stays near constant amplitude only at endpoints', () => {
    // Two identical DC signals: equal-power gives +3dB bump at midpoint
    const a = constBuffer(40, 1);
    const b = constBuffer(40, 1);
    const out = crossfade(a, b, { lengthSamples: 20, shape: 'equal-power' });
    // overlap is samples 20..39; midpoint of overlap should be √2 ≈ 1.414
    const mid = out[20 + 10];
    expect(mid).toBeGreaterThan(1.3);
    expect(mid).toBeLessThan(1.45);
  });

  it('equal-gain crossfade of identical signals is constant amplitude', () => {
    const a = constBuffer(40, 1);
    const b = constBuffer(40, 1);
    const out = crossfade(a, b, { lengthSamples: 20, shape: 'equal-gain' });
    // Across the overlap, gA + gB = 1 always → output stays 1
    for (let i = 20; i < 40; i++) {
      expect(out[i]).toBeCloseTo(1, 5);
    }
  });

  it('overlap larger than clips is clamped', () => {
    const a = constBuffer(10, 1);
    const b = constBuffer(10, 1);
    const out = crossfade(a, b, { lengthSamples: 100 });
    expect(out.length).toBe(10); // 10+10-10
  });

  it('default shape is equal-power', () => {
    const a = constBuffer(40, 1);
    const b = constBuffer(40, 1);
    const out = crossfade(a, b, { lengthSamples: 20 });
    const mid = out[30];
    expect(mid).toBeGreaterThan(1.3); // equal-power bump
  });
});

// ─── applyGainRamp ────────────────────────────────────────────────────────────

describe('applyGainRamp', () => {
  it('ramps from startGain to endGain', () => {
    const input = constBuffer(11, 1);
    const out = applyGainRamp(input, 0, 1);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[10]).toBeCloseTo(1, 6);
    expect(out[5]).toBeCloseTo(0.5, 6);
  });

  it('constant gain when start == end', () => {
    const input = constBuffer(10, 1);
    const out = applyGainRamp(input, 0.5, 0.5);
    for (const v of out) expect(v).toBeCloseTo(0.5, 6);
  });

  it('empty buffer returns empty', () => {
    expect(applyGainRamp(new Float32Array(0), 0, 1).length).toBe(0);
  });

  it('single sample uses endGain', () => {
    const out = applyGainRamp(constBuffer(1, 1), 0, 0.8);
    expect(out[0]).toBeCloseTo(0.8, 6);
  });
});

// ─── dB helpers ───────────────────────────────────────────────────────────────

describe('gainToDb / dbToGain', () => {
  it('unity gain = 0 dB', () => {
    expect(gainToDb(1)).toBeCloseTo(0, 6);
  });

  it('0.5 gain ≈ −6.02 dB', () => {
    expect(gainToDb(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('√0.5 gain ≈ −3.01 dB', () => {
    expect(gainToDb(Math.SQRT1_2)).toBeCloseTo(-3.0103, 3);
  });

  it('gain 0 → −Infinity', () => {
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('0 dB = unity gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 6);
  });

  it('−6 dB ≈ 0.501', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
  });

  it('round trip: dbToGain(gainToDb(x)) = x', () => {
    for (const x of [0.1, 0.25, 0.5, 0.707, 1, 2]) {
      expect(dbToGain(gainToDb(x))).toBeCloseTo(x, 6);
    }
  });
});

// ─── Midpoint power / amplitude ──────────────────────────────────────────────

describe('crossfadeMidpointPower', () => {
  it('equal-power → 1.0 (constant power for uncorrelated)', () => {
    expect(crossfadeMidpointPower('equal-power')).toBeCloseTo(1, 6);
  });

  it('linear → √0.5 (−3 dB power dip for uncorrelated)', () => {
    expect(crossfadeMidpointPower('linear')).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('equal-gain → √0.5', () => {
    expect(crossfadeMidpointPower('equal-gain')).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe('crossfadeMidpointAmplitude', () => {
  it('linear → 1.0 (constant amplitude for correlated)', () => {
    expect(crossfadeMidpointAmplitude('linear')).toBeCloseTo(1, 6);
  });

  it('equal-power → √2 (+3 dB bump for correlated)', () => {
    expect(crossfadeMidpointAmplitude('equal-power')).toBeCloseTo(Math.SQRT2, 6);
  });

  it('equal-gain → 1.0', () => {
    expect(crossfadeMidpointAmplitude('equal-gain')).toBeCloseTo(1, 6);
  });
});
