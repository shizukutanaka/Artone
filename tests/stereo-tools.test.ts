/**
 * Stereo Tools Tests — audio/stereo-tools.ts
 *
 * Covers: encodeMidSide, decodeMidSide, stereoWidth, panGains,
 * panMono, panStereo, monoMix, phaseInvert, measureCorrelation,
 * measureWidth, applyChannelGain.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeMidSide,
  decodeMidSide,
  stereoWidth,
  panGains,
  panMono,
  panStereo,
  monoMix,
  phaseInvert,
  measureCorrelation,
  measureWidth,
  applyChannelGain,
  type PanLaw,
} from '../audio/stereo-tools';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** RMS of a Float32Array. */
function rms(a: Float32Array): number {
  let sum = 0;
  for (const v of a) sum += v * v;
  return Math.sqrt(sum / Math.max(1, a.length));
}

/** DC signal. */
function dc(n: number, amp: number): Float32Array {
  return new Float32Array(n).fill(amp);
}

/** Sine wave at sample rate 48000. */
function sine(n: number, freq = 440, amp = 0.5): Float32Array {
  const out = new Float32Array(n);
  const w   = (2 * Math.PI * freq) / 48000;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

// ─── encodeMidSide / decodeMidSide ───────────────────────────────────────────

describe('encodeMidSide', () => {
  it('output length equals min(left, right)', () => {
    const r = encodeMidSide(new Float32Array(100), new Float32Array(80));
    expect(r.left.length).toBe(80);
    expect(r.right.length).toBe(80);
  });

  it('identical channels → side = 0', () => {
    const sig = sine(1024);
    const { left: mid, right: side } = encodeMidSide(sig, sig);
    for (const v of side) expect(v).toBeCloseTo(0, 8);
    for (let i = 0; i < mid.length; i++) expect(mid[i]).toBeCloseTo(sig[i], 5);
  });

  it('opposite-polarity channels → mid = 0', () => {
    const L = sine(1024, 440, 0.5);
    const R = phaseInvert(L);
    const { left: mid, right: side } = encodeMidSide(L, R);
    for (const v of mid) expect(Math.abs(v)).toBeLessThan(1e-6);
    // side should equal L
    for (let i = 0; i < side.length; i++) expect(side[i]).toBeCloseTo(L[i], 5);
  });

  it('general: M = (L+R)/2, S = (L-R)/2', () => {
    const L = new Float32Array([1, 2, 3, 4]);
    const R = new Float32Array([3, 0, -1, 2]);
    const { left: mid, right: side } = encodeMidSide(L, R);
    expect(mid[0]).toBeCloseTo((1 + 3) / 2, 8);
    expect(mid[1]).toBeCloseTo((2 + 0) / 2, 8);
    expect(side[0]).toBeCloseTo((1 - 3) / 2, 8);
    expect(side[1]).toBeCloseTo((2 - 0) / 2, 8);
  });
});

describe('decodeMidSide', () => {
  it('output length equals min(mid, side)', () => {
    const r = decodeMidSide(new Float32Array(100), new Float32Array(80));
    expect(r.left.length).toBe(80);
    expect(r.right.length).toBe(80);
  });

  it('L = M + S, R = M - S', () => {
    const mid  = new Float32Array([2, 1]);
    const side = new Float32Array([1, 3]);
    const { left, right } = decodeMidSide(mid, side);
    expect(left[0]).toBeCloseTo(3, 8);
    expect(right[0]).toBeCloseTo(1, 8);
    expect(left[1]).toBeCloseTo(4, 8);
    expect(right[1]).toBeCloseTo(-2, 8);
  });
});

describe('M/S round-trip', () => {
  it('encode then decode returns original signal', () => {
    const L = sine(1024, 440, 0.5);
    const R = sine(1024, 880, 0.3);
    const { left: mid, right: side } = encodeMidSide(L, R);
    const { left: L2, right: R2 }    = decodeMidSide(mid, side);
    for (let i = 0; i < L.length; i++) {
      expect(L2[i]).toBeCloseTo(L[i], 5);
      expect(R2[i]).toBeCloseTo(R[i], 5);
    }
  });
});

// ─── stereoWidth ─────────────────────────────────────────────────────────────

describe('stereoWidth', () => {
  it('width=1 → output equals input', () => {
    const L = sine(512, 440, 0.5);
    const R = sine(512, 880, 0.3);
    const { left, right } = stereoWidth(L, R, 1.0);
    for (let i = 0; i < L.length; i++) {
      expect(left[i]).toBeCloseTo(L[i], 5);
      expect(right[i]).toBeCloseTo(R[i], 5);
    }
  });

  it('width=0 → mono (L = R)', () => {
    const L = sine(512, 440, 0.5);
    const R = sine(512, 880, 0.3);
    const { left, right } = stereoWidth(L, R, 0);
    // Both channels should equal the mid = (L+R)/2
    for (let i = 0; i < L.length; i++) {
      const mid = (L[i] + R[i]) / 2;
      expect(left[i]).toBeCloseTo(mid, 5);
      expect(right[i]).toBeCloseTo(mid, 5);
    }
  });

  it('width=2 → exaggerated stereo (wider than original)', () => {
    const L = sine(1024, 440, 0.5);
    const R = sine(1024, 880, 0.3);
    const w1 = stereoWidth(L, R, 1);
    const w2 = stereoWidth(L, R, 2);
    // Width 2 should produce wider signal (higher L-R difference)
    const diff1 = new Float32Array(L.length).map((_, i) => w1.left[i] - w1.right[i]);
    const diff2 = new Float32Array(L.length).map((_, i) => w2.left[i] - w2.right[i]);
    expect(rms(diff2)).toBeGreaterThan(rms(diff1));
  });

  it('output length equals min(left, right)', () => {
    const { left, right } = stereoWidth(new Float32Array(100), new Float32Array(80));
    expect(left.length).toBe(80);
    expect(right.length).toBe(80);
  });

  it('negative width is clamped to 0', () => {
    const L = sine(256);
    const R = sine(256, 880, 0.3);
    const { left, right } = stereoWidth(L, R, -1);
    // Should behave same as width=0
    const w0 = stereoWidth(L, R, 0);
    for (let i = 0; i < L.length; i++) {
      expect(left[i]).toBeCloseTo(w0.left[i], 5);
      expect(right[i]).toBeCloseTo(w0.right[i], 5);
    }
  });
});

// ─── panGains ─────────────────────────────────────────────────────────────────

describe('panGains — constant-power', () => {
  it('centre: L = R = sqrt(0.5)', () => {
    const { left, right } = panGains(0.5, 'constant-power');
    expect(left).toBeCloseTo(Math.SQRT1_2, 5);
    expect(right).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('full left: L = 1, R = 0', () => {
    const { left, right } = panGains(0, 'constant-power');
    expect(left).toBeCloseTo(1, 5);
    expect(right).toBeCloseTo(0, 5);
  });

  it('full right: L = 0, R = 1', () => {
    const { left, right } = panGains(1, 'constant-power');
    expect(left).toBeCloseTo(0, 5);
    expect(right).toBeCloseTo(1, 5);
  });

  it('L² + R² = 1 (constant power)', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const { left, right } = panGains(p, 'constant-power');
      expect(left * left + right * right).toBeCloseTo(1, 5);
    }
  });
});

describe('panGains — linear', () => {
  it('centre: L = 0.5, R = 0.5', () => {
    const { left, right } = panGains(0.5, 'linear');
    expect(left).toBeCloseTo(0.5, 8);
    expect(right).toBeCloseTo(0.5, 8);
  });

  it('L + R = 1 across range', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const { left, right } = panGains(p, 'linear');
      expect(left + right).toBeCloseTo(1, 8);
    }
  });

  it('6db alias equals linear', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      const li  = panGains(p, 'linear');
      const s6  = panGains(p, '6db');
      expect(li.left).toBeCloseTo(s6.left, 8);
      expect(li.right).toBeCloseTo(s6.right, 8);
    }
  });
});

describe('panGains — 3db alias', () => {
  it('3db alias equals constant-power', () => {
    for (const p of [0, 0.5, 1]) {
      const cp = panGains(p, 'constant-power');
      const s3 = panGains(p, '3db');
      expect(cp.left).toBeCloseTo(s3.left, 8);
      expect(cp.right).toBeCloseTo(s3.right, 8);
    }
  });
});

describe('panGains — clamp', () => {
  it('pan < 0 is clamped to 0', () => {
    const { left, right } = panGains(-0.5, 'linear');
    expect(left).toBeCloseTo(1, 8);
    expect(right).toBeCloseTo(0, 8);
  });

  it('pan > 1 is clamped to 1', () => {
    const { left, right } = panGains(1.5, 'linear');
    expect(left).toBeCloseTo(0, 8);
    expect(right).toBeCloseTo(1, 8);
  });
});

// ─── panMono ──────────────────────────────────────────────────────────────────

describe('panMono', () => {
  it('centre: L and R have same RMS', () => {
    const { left, right } = panMono(sine(1024), 0.5);
    expect(rms(left)).toBeCloseTo(rms(right), 3);
  });

  it('full left: R is silence', () => {
    const { right } = panMono(sine(1024), 0);
    for (const v of right) expect(v).toBeCloseTo(0, 8);
  });

  it('full right: L is silence', () => {
    const { left } = panMono(sine(1024), 1);
    for (const v of left) expect(v).toBeCloseTo(0, 8);
  });

  it('output length equals input length', () => {
    const { left, right } = panMono(new Float32Array(256));
    expect(left.length).toBe(256);
    expect(right.length).toBe(256);
  });
});

// ─── panStereo ────────────────────────────────────────────────────────────────

describe('panStereo', () => {
  it('centre pan: both channels unchanged (constant-power centre = 1/√2)', () => {
    const L = dc(256, 1.0);
    const R = dc(256, 1.0);
    const { left, right } = panStereo(L, R, 0.5);
    // At centre, constant-power gain = 1/√2 ≈ 0.707
    for (const v of left)  expect(v).toBeCloseTo(Math.SQRT1_2, 4);
    for (const v of right) expect(v).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('full-left: left channel at gain 1, right at 0', () => {
    const L = dc(256, 1.0);
    const R = dc(256, 0.5);
    const { left, right } = panStereo(L, R, 0);
    for (const v of left)  expect(v).toBeCloseTo(1.0, 5);
    for (const v of right) expect(v).toBeCloseTo(0.0, 5);
  });

  it('output length = min(left, right)', () => {
    const { left, right } = panStereo(new Float32Array(100), new Float32Array(80));
    expect(left.length).toBe(80);
    expect(right.length).toBe(80);
  });
});

// ─── monoMix ─────────────────────────────────────────────────────────────────

describe('monoMix', () => {
  it('output length equals min(left, right)', () => {
    const out = monoMix(new Float32Array(100), new Float32Array(80));
    expect(out.length).toBe(80);
  });

  it('identical channels: out = (L+R)/√2 = √2 for DC(1)', () => {
    const L = dc(256, 1.0);
    const R = dc(256, 1.0);
    const mono = monoMix(L, R);
    // equal-power sum: (1+1)*k where k=1/√2 → √2
    for (const v of mono) expect(v).toBeCloseTo(Math.SQRT2, 5);
  });

  it('opposite polarity: out = 0', () => {
    const L = sine(256, 440, 0.5);
    const R = phaseInvert(L);
    const mono = monoMix(L, R);
    for (const v of mono) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('silence: out = 0', () => {
    const mono = monoMix(new Float32Array(256), new Float32Array(256));
    for (const v of mono) expect(v).toBe(0);
  });
});

// ─── phaseInvert ─────────────────────────────────────────────────────────────

describe('phaseInvert', () => {
  it('inverts every sample', () => {
    const s   = sine(256, 440, 0.5);
    const inv = phaseInvert(s);
    for (let i = 0; i < s.length; i++) expect(inv[i]).toBeCloseTo(-s[i], 8);
  });

  it('double inversion restores original', () => {
    const s    = sine(256);
    const s2   = phaseInvert(phaseInvert(s));
    for (let i = 0; i < s.length; i++) expect(s2[i]).toBeCloseTo(s[i], 8);
  });

  it('output length equals input', () => {
    expect(phaseInvert(new Float32Array(100)).length).toBe(100);
  });
});

// ─── measureCorrelation / measureWidth ───────────────────────────────────────

describe('measureCorrelation', () => {
  it('identical channels → correlation = +1', () => {
    const s = sine(1024);
    expect(measureCorrelation(s, s)).toBeCloseTo(1, 4);
  });

  it('opposite-polarity channels → correlation = -1', () => {
    const s = sine(1024);
    expect(measureCorrelation(s, phaseInvert(s))).toBeCloseTo(-1, 4);
  });

  it('silence → 0', () => {
    expect(measureCorrelation(new Float32Array(256), new Float32Array(256))).toBe(0);
  });

  it('result is in [-1, 1]', () => {
    const L = sine(1024, 440, 0.5);
    const R = sine(1024, 880, 0.3);
    const r = measureCorrelation(L, R);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('uncorrelated signals: |r| < 0.3', () => {
    // Two sine waves at very different frequencies are nearly orthogonal
    const L = sine(4096, 440, 0.5);
    const R = sine(4096, 1000, 0.5);
    expect(Math.abs(measureCorrelation(L, R))).toBeLessThan(0.3);
  });
});

describe('measureWidth', () => {
  it('mono (identical channels) → 0', () => {
    const s = sine(1024);
    expect(measureWidth(s, s)).toBeCloseTo(0, 4);
  });

  it('phase-inverted channels → 1', () => {
    const s = sine(1024);
    expect(measureWidth(s, phaseInvert(s))).toBeCloseTo(1, 4);
  });

  it('result is in [0, 1]', () => {
    const L = sine(1024, 440, 0.5);
    const R = sine(1024, 880, 0.3);
    const w = measureWidth(L, R);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThanOrEqual(1);
  });

  it('wider signal → higher width score', () => {
    const L = sine(1024, 440, 0.5);
    const R = sine(1024, 880, 0.3);
    const mono = monoMix(L, R); // essentially same channel
    const monoPair = { L: mono, R: mono.slice() };
    const stereoPair = { L, R };
    const wMono   = measureWidth(monoPair.L, monoPair.R);
    const wStereo = measureWidth(stereoPair.L, stereoPair.R);
    expect(wStereo).toBeGreaterThan(wMono);
  });
});

// ─── applyChannelGain ────────────────────────────────────────────────────────

describe('applyChannelGain', () => {
  it('gain=1 → unchanged', () => {
    const L = sine(256, 440, 0.5);
    const R = sine(256, 880, 0.3);
    const { left, right } = applyChannelGain({ left: L, right: R }, 1, 1);
    for (let i = 0; i < L.length; i++) {
      expect(left[i]).toBeCloseTo(L[i], 8);
      expect(right[i]).toBeCloseTo(R[i], 8);
    }
  });

  it('gain=0 → silence', () => {
    const L = sine(256);
    const R = sine(256);
    const { left, right } = applyChannelGain({ left: L, right: R }, 0, 0);
    for (const v of left)  expect(Math.abs(v)).toBeCloseTo(0, 8);
    for (const v of right) expect(Math.abs(v)).toBeCloseTo(0, 8);
  });

  it('independent gains: different scales per channel', () => {
    const L = dc(256, 1.0);
    const R = dc(256, 1.0);
    const { left, right } = applyChannelGain({ left: L, right: R }, 0.5, 2.0);
    for (const v of left)  expect(v).toBeCloseTo(0.5, 8);
    for (const v of right) expect(v).toBeCloseTo(2.0, 8);
  });

  it('output length equals min(left, right)', () => {
    const { left, right } = applyChannelGain(
      { left: new Float32Array(100), right: new Float32Array(80) }, 1, 1,
    );
    expect(left.length).toBe(80);
    expect(right.length).toBe(80);
  });
});

// ─── Integration ─────────────────────────────────────────────────────────────

describe('Integration — stereo processing chain', () => {
  it('width=0 signal has correlation=1 (pure mono)', () => {
    const L = sine(1024, 440, 0.5);
    const R = sine(1024, 880, 0.3);
    const { left, right } = stereoWidth(L, R, 0);
    expect(measureCorrelation(left, right)).toBeCloseTo(1, 4);
  });

  it('panning laws all produce non-negative gains', () => {
    const laws: PanLaw[] = ['linear', 'constant-power', '3db', '6db', 'balanced'];
    for (const law of laws) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const { left, right } = panGains(p, law);
        expect(left).toBeGreaterThanOrEqual(-1e-8);
        expect(right).toBeGreaterThanOrEqual(-1e-8);
      }
    }
  });
});
