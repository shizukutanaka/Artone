/**
 * White Balance Tests
 *
 * Tests for Gray World, White Patch, percentile, illuminant, and gain utility
 * functions in color/white-balance.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  grayWorldGains,
  whitePatchGains,
  percentileGains,
  illuminantGains,
  estimateWhiteBalance,
  applyWhiteBalance,
  composeGains,
  invertGains,
  type WBGains,
} from '../color/white-balance';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a solid RGBA buffer (all pixels the same colour). */
function solid(r: number, g: number, b: number, count = 100): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Create a buffer with two alternating pixel colours. */
function alternating(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
  count = 100,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const even = i % 2 === 0;
    data[i * 4]     = even ? r1 : r2;
    data[i * 4 + 1] = even ? g1 : g2;
    data[i * 4 + 2] = even ? b1 : b2;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Expect gains to be close to target values. */
function expectGains(gains: WBGains, r: number, g: number, b: number, tol = 1e-3): void {
  expect(gains.r).toBeCloseTo(r, 3);
  expect(gains.g).toBeCloseTo(g, 3);
  expect(gains.b).toBeCloseTo(b, 3);
}

// ─── grayWorldGains ───────────────────────────────────────────────────────────

describe('grayWorldGains', () => {
  it('neutral grey → gains = {r:1, g:1, b:1}', () => {
    const data = solid(128, 128, 128);
    expectGains(grayWorldGains(data), 1, 1, 1);
  });

  it('green channel = 1 always (reference channel)', () => {
    const data = solid(100, 200, 150);
    const gains = grayWorldGains(data);
    expect(gains.g).toBe(1);
  });

  it('warm cast (R > G > B) → r gain < 1, b gain > 1', () => {
    // Warm illuminant: R=200, G=160, B=100
    const data = solid(200, 160, 100);
    const gains = grayWorldGains(data);
    expect(gains.r).toBeLessThan(1);
    expect(gains.b).toBeGreaterThan(1);
    expect(gains.g).toBe(1);
  });

  it('cool cast (B dominant) → r gain > 1, b gain < 1', () => {
    const data = solid(80, 120, 200);
    const gains = grayWorldGains(data);
    expect(gains.r).toBeGreaterThan(1);
    expect(gains.b).toBeLessThan(1);
  });

  it('empty buffer → {r:1, g:1, b:1}', () => {
    expectGains(grayWorldGains(new Uint8ClampedArray(0)), 1, 1, 1);
  });

  it('all pixels below minLuma → {r:1, g:1, b:1}', () => {
    const data = solid(5, 5, 5);  // luma ≈ 5 < 20
    expectGains(grayWorldGains(data), 1, 1, 1);
  });

  it('all pixels above maxLuma → {r:1, g:1, b:1}', () => {
    const data = solid(250, 250, 250);  // luma ≈ 250 > 235
    expectGains(grayWorldGains(data), 1, 1, 1);
  });

  it('gain formula: r = gMean/rMean, b = gMean/bMean', () => {
    // Use solid colour with known mean; only mid-luma pixels are included
    const data = solid(100, 160, 200);
    const gains = grayWorldGains(data);
    expect(gains.r).toBeCloseTo(160 / 100, 4);
    expect(gains.b).toBeCloseTo(160 / 200, 4);
  });

  it('custom minLuma / maxLuma respected', () => {
    // Two groups: dark (luma≈5) with skewed chromaticity, bright warm pixels
    // Dark pixels: (5, 120, 80) — very different R/G/B ratios
    // Bright pixels: (100, 160, 80)
    const data = new Uint8ClampedArray(200 * 4);
    for (let i = 0; i < 100; i++) {
      // luma ≈ 0.299*5+0.587*120+0.114*80 = 1.5+70.4+9.1 ≈ 81 — actually above 20
      // Use near-black: (2, 5, 80) luma ≈ 0.299*2+0.587*5+0.114*80 ≈ 0.6+2.9+9.1 ≈ 12.6 < 20
      data[i * 4] = 2; data[i * 4 + 1] = 5; data[i * 4 + 2] = 80; data[i * 4 + 3] = 255;
    }
    for (let i = 100; i < 200; i++) {
      data[i * 4] = 100; data[i * 4 + 1] = 160; data[i * 4 + 2] = 80; data[i * 4 + 3] = 255;
    }
    const gainsDefault = grayWorldGains(data);          // minLuma=20 → only bright pixels
    const gainsMinZero  = grayWorldGains(data, 0, 235);  // minLuma=0 → both groups

    // Default should match solid(100,160,80): r gain = 160/100 = 1.6
    expect(gainsDefault.r).toBeCloseTo(160 / 100, 3);
    // With minLuma=0: mean R=(2+100)/2=51, mean G=(5+160)/2=82.5 → r gain=82.5/51≈1.618
    // Blue: mean B=(80+80)/2=80 → b gain = 82.5/80 ≈ 1.031 (vs default 160/80=2.0)
    // b gain should differ significantly between the two
    expect(gainsMinZero.b).not.toBeCloseTo(gainsDefault.b, 0);
  });
});

// ─── whitePatchGains ──────────────────────────────────────────────────────────

describe('whitePatchGains', () => {
  it('neutral white patch → {r:1, g:1, b:1}', () => {
    const data = solid(220, 220, 220);
    expectGains(whitePatchGains(data), 1, 1, 1);
  });

  it('green gain = 1', () => {
    const data = solid(180, 220, 160);
    expect(whitePatchGains(data).g).toBe(1);
  });

  it('uses per-channel maximum as illuminant', () => {
    // Two pixels: (100,200,50) and (180,150,120)
    const data = new Uint8ClampedArray([
      100, 200, 50, 255,
      180, 150, 120, 255,
    ]);
    const gains = whitePatchGains(data);
    // maxR=180, maxG=200, maxB=120 → r=200/180, b=200/120
    expect(gains.r).toBeCloseTo(200 / 180, 4);
    expect(gains.b).toBeCloseTo(200 / 120, 4);
  });

  it('all pixels below minLuma → {r:1, g:1, b:1}', () => {
    const data = solid(5, 5, 5);
    expectGains(whitePatchGains(data, 20), 1, 1, 1);
  });

  it('empty buffer → {r:1, g:1, b:1}', () => {
    expectGains(whitePatchGains(new Uint8ClampedArray(0)), 1, 1, 1);
  });
});

// ─── percentileGains ─────────────────────────────────────────────────────────

describe('percentileGains', () => {
  it('p=100 matches white-patch result for simple image', () => {
    const data = solid(180, 210, 140);
    const wp  = whitePatchGains(data);
    const pct = percentileGains(data, 100);
    expect(pct.r).toBeCloseTo(wp.r, 2);
    expect(pct.b).toBeCloseTo(wp.b, 2);
  });

  it('green gain = 1', () => {
    const data = solid(100, 180, 150);
    expect(percentileGains(data).g).toBe(1);
  });

  it('empty buffer → {r:1, g:1, b:1}', () => {
    expectGains(percentileGains(new Uint8ClampedArray(0)), 1, 1, 1);
  });

  it('all pixels below minLuma → {r:1, g:1, b:1}', () => {
    const data = solid(5, 5, 5);
    expectGains(percentileGains(data, 98, 20), 1, 1, 1);
  });

  it('neutral solid image → gains ≈ {r:1, g:1, b:1} at any percentile', () => {
    const data = solid(150, 150, 150);
    for (const p of [50, 75, 90, 98, 100]) {
      expectGains(percentileGains(data, p), 1, 1, 1, 0.01);
    }
  });

  it('lower percentile is less sensitive to outliers', () => {
    // Image dominated by neutral grey with a single bright warm pixel
    const data = new Uint8ClampedArray(101 * 4);
    for (let i = 0; i < 100; i++) {
      data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 128; data[i * 4 + 3] = 255;
    }
    // One very warm outlier
    data[100 * 4] = 255; data[100 * 4 + 1] = 200; data[100 * 4 + 2] = 100; data[100 * 4 + 3] = 255;

    const g100 = percentileGains(data, 100);  // includes outlier
    const g90  = percentileGains(data, 90);   // likely excludes it

    // p=90 result should be closer to neutral (r gain closer to 1) than p=100
    expect(Math.abs(g90.r - 1)).toBeLessThanOrEqual(Math.abs(g100.r - 1) + 0.01);
  });
});

// ─── illuminantGains ─────────────────────────────────────────────────────────

describe('illuminantGains', () => {
  it('neutral point (r=g=b) → {r:1, g:1, b:1}', () => {
    expectGains(illuminantGains(128, 128, 128), 1, 1, 1);
  });

  it('warm neutral point → compensating gains', () => {
    const g = illuminantGains(200, 160, 100);
    expect(g.r).toBeCloseTo(160 / 200, 4);
    expect(g.b).toBeCloseTo(160 / 100, 4);
    expect(g.g).toBe(1);
  });

  it('pure green (0, 255, 0) → r and b gain very large', () => {
    const g = illuminantGains(0, 255, 0);
    expect(g.r).toBeGreaterThan(100);
    expect(g.b).toBeGreaterThan(100);
  });

  it('pure black (0,0,0) → {r:1, g:1, b:1} (gEst < 1e-6 guard)', () => {
    expectGains(illuminantGains(0, 0, 0), 1, 1, 1);
  });
});

// ─── estimateWhiteBalance ─────────────────────────────────────────────────────

describe('estimateWhiteBalance', () => {
  it('defaults to gray-world algorithm', () => {
    const data = solid(100, 160, 80);
    const auto = estimateWhiteBalance(data);
    const gw   = grayWorldGains(data);
    expectGains(auto, gw.r, gw.g, gw.b);
  });

  it('white-patch algorithm', () => {
    const data = solid(180, 220, 150);
    const auto = estimateWhiteBalance(data, { algorithm: 'white-patch' });
    const wp   = whitePatchGains(data);
    expectGains(auto, wp.r, wp.g, wp.b);
  });

  it('percentile algorithm with custom percentile', () => {
    const data = solid(180, 220, 150);
    const auto = estimateWhiteBalance(data, { algorithm: 'percentile', percentile: 95 });
    const pct  = percentileGains(data, 95);
    expectGains(auto, pct.r, pct.g, pct.b);
  });

  it('custom minLuma / maxLuma are forwarded', () => {
    const data = solid(128, 128, 128);
    const r = estimateWhiteBalance(data, { minLuma: 0, maxLuma: 255 });
    expectGains(r, 1, 1, 1);
  });
});

// ─── applyWhiteBalance ────────────────────────────────────────────────────────

describe('applyWhiteBalance', () => {
  it('identity gains {r:1, g:1, b:1} → buffer unchanged', () => {
    const data = solid(100, 150, 200);
    const original = data.slice();
    applyWhiteBalance(data, { r: 1, g: 1, b: 1 });
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBe(original[i]);
    }
  });

  it('doubles R channel (gain.r = 2)', () => {
    const data = solid(100, 0, 0);
    applyWhiteBalance(data, { r: 2, g: 1, b: 1 });
    expect(data[0]).toBe(200);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it('clamped to 255 when gain produces overflow', () => {
    const data = solid(200, 200, 200);
    applyWhiteBalance(data, { r: 2, g: 1, b: 1 });
    expect(data[0]).toBe(255);
  });

  it('clamped to 0 when gain produces underflow (negative gain guard)', () => {
    const data = solid(100, 100, 100);
    // Negative gain would give negative values
    applyWhiteBalance(data, { r: -1, g: 1, b: 1 });
    expect(data[0]).toBe(0);
  });

  it('alpha channel is unchanged', () => {
    const data = new Uint8ClampedArray([100, 150, 200, 128]);
    applyWhiteBalance(data, { r: 2, g: 2, b: 2 });
    expect(data[3]).toBe(128);
  });

  it('modifies buffer in-place (no new allocation)', () => {
    const data = solid(100, 100, 100);
    const ref = data;
    applyWhiteBalance(data, { r: 1.5, g: 1, b: 0.5 });
    expect(data).toBe(ref);
  });

  it('round-trips with invertGains', () => {
    const data = solid(120, 160, 80);
    const original = data.slice();
    const gains = grayWorldGains(data);
    applyWhiteBalance(data, gains);
    applyWhiteBalance(data, invertGains(gains));
    // Should be back close to original (within ±1 from integer rounding)
    for (let i = 0; i < data.length; i += 4) {
      expect(Math.abs(data[i]     - original[i])).toBeLessThanOrEqual(2);
      expect(Math.abs(data[i + 1] - original[i + 1])).toBeLessThanOrEqual(2);
      expect(Math.abs(data[i + 2] - original[i + 2])).toBeLessThanOrEqual(2);
    }
  });
});

// ─── composeGains ─────────────────────────────────────────────────────────────

describe('composeGains', () => {
  it('identity ∘ identity = identity', () => {
    const id = { r: 1, g: 1, b: 1 };
    expectGains(composeGains(id, id), 1, 1, 1);
  });

  it('multiplies per channel', () => {
    const a = { r: 2, g: 1.5, b: 0.8 };
    const b = { r: 0.5, g: 2, b: 1.25 };
    const c = composeGains(a, b);
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(3, 5);
    expect(c.b).toBeCloseTo(1, 5);
  });

  it('a ∘ identity = a', () => {
    const a = { r: 1.2, g: 1, b: 0.9 };
    const id = { r: 1, g: 1, b: 1 };
    const c = composeGains(a, id);
    expectGains(c, a.r, a.g, a.b);
  });

  it('compose then apply equals applying both in sequence', () => {
    const a = { r: 1.3, g: 1, b: 0.8 };
    const b = { r: 0.9, g: 1, b: 1.2 };

    const data1 = solid(100, 150, 120);
    const data2 = data1.slice();

    // Apply sequentially
    applyWhiteBalance(data1, a);
    applyWhiteBalance(data1, b);

    // Apply composed
    applyWhiteBalance(data2, composeGains(a, b));

    for (let i = 0; i < data1.length; i++) {
      expect(Math.abs(data1[i] - data2[i])).toBeLessThanOrEqual(1);
    }
  });
});

// ─── invertGains ─────────────────────────────────────────────────────────────

describe('invertGains', () => {
  it('invert identity → identity', () => {
    expectGains(invertGains({ r: 1, g: 1, b: 1 }), 1, 1, 1);
  });

  it('invert then compose = identity', () => {
    const g = { r: 1.5, g: 1, b: 0.75 };
    const c = composeGains(g, invertGains(g));
    expectGains(c, 1, 1, 1, 1e-6);
  });

  it('handles near-zero gains without throwing', () => {
    const g = invertGains({ r: 1e-15, g: 1e-15, b: 1e-15 });
    expect(isFinite(g.r)).toBe(true);
    expect(isFinite(g.g)).toBe(true);
    expect(isFinite(g.b)).toBe(true);
  });

  it('invert(invert(g)) ≈ g', () => {
    const g = { r: 1.8, g: 1, b: 0.6 };
    const gg = invertGains(invertGains(g));
    expectGains(gg, g.r, g.g, g.b, 1e-5);
  });
});

// ─── end-to-end correction ────────────────────────────────────────────────────

describe('end-to-end white balance correction', () => {
  it('gray-world correction makes mean of R, G, B channels approximately equal', () => {
    // Create an image with a strong warm cast
    const data = alternating(200, 150, 80, 180, 140, 70, 200);
    const gains = grayWorldGains(data);
    applyWhiteBalance(data, gains);

    // After correction, channel means should be closer together
    let sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
    }
    const n = data.length / 4;
    const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;

    expect(Math.abs(meanR - meanG)).toBeLessThan(5);
    expect(Math.abs(meanB - meanG)).toBeLessThan(5);
  });

  it('estimateWhiteBalance + applyWhiteBalance neutralises a warm solid cast', () => {
    const data = solid(220, 160, 80);
    const gains = estimateWhiteBalance(data, { algorithm: 'gray-world' });
    applyWhiteBalance(data, gains);

    // After correction all three channels should be equal (solid → solid neutral)
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });
});
