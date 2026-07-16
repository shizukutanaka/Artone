/**
 * Tests for render/motion-estimation.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  rgbaToGray,
  sampleBilinear,
  lucasKanade,
  blockMatch,
  estimateGlobalMotion,
  selectFeatures,
} from '../render/motion-estimation';
import type { GrayImage, Vec2 } from '../render/motion-estimation';

// ─── Synthetic image helpers ─────────────────────────────────────────────────

/** A smooth textured gray image: value = function of x,y (sinusoidal pattern). */
function texturedImage(w: number, h: number): GrayImage {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 128 + 60 * Math.sin(x * 0.5) + 40 * Math.cos(y * 0.4)
              + 20 * Math.sin((x + y) * 0.3);
      data[y * w + x] = Math.max(0, Math.min(255, v));
    }
  }
  return { data, width: w, height: h };
}

/** Shift a gray image by an INTEGER (dx, dy) with replicate borders. */
function shiftImageInt(img: GrayImage, dx: number, dy: number): GrayImage {
  const { width: w, height: h } = img;
  const out = new Float32Array(w * h);
  const clamp = (i: number, n: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = clamp(x - dx, w);
      const sy = clamp(y - dy, h);
      out[y * w + x] = img.data[sy * w + sx];
    }
  }
  return { data: out, width: w, height: h };
}

/** Shift by a fractional amount via bilinear resampling. */
function shiftImageFrac(img: GrayImage, dx: number, dy: number): GrayImage {
  const { width: w, height: h } = img;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = sampleBilinear(img, x - dx, y - dy);
    }
  }
  return { data: out, width: w, height: h };
}

// ─── rgbaToGray ───────────────────────────────────────────────────────────────

describe('rgbaToGray', () => {
  it('converts white to ~255', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    const g = rgbaToGray(rgba, 1, 1);
    expect(g.data[0]).toBeCloseTo(255, 4);
  });

  it('converts black to 0', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    expect(rgbaToGray(rgba, 1, 1).data[0]).toBe(0);
  });

  it('green is brightest (Rec.601)', () => {
    const r = rgbaToGray(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1).data[0];
    const g = rgbaToGray(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1).data[0];
    expect(g).toBeGreaterThan(r);
  });

  it('produces correct dimensions', () => {
    const img = rgbaToGray(new Uint8ClampedArray(4 * 3 * 4), 4, 3);
    expect(img.width).toBe(4);
    expect(img.height).toBe(3);
    expect(img.data.length).toBe(12);
  });
});

// ─── sampleBilinear ───────────────────────────────────────────────────────────

describe('sampleBilinear', () => {
  const img: GrayImage = { data: new Float32Array([0, 100, 200, 300]), width: 2, height: 2 };

  it('returns exact value at integer coords', () => {
    expect(sampleBilinear(img, 0, 0)).toBeCloseTo(0, 6);
    expect(sampleBilinear(img, 1, 0)).toBeCloseTo(100, 6);
    expect(sampleBilinear(img, 0, 1)).toBeCloseTo(200, 6);
  });

  it('interpolates at midpoints', () => {
    expect(sampleBilinear(img, 0.5, 0)).toBeCloseTo(50, 6);
    expect(sampleBilinear(img, 0, 0.5)).toBeCloseTo(100, 6);
    expect(sampleBilinear(img, 0.5, 0.5)).toBeCloseTo(150, 6);
  });

  it('clamps out-of-bounds coordinates', () => {
    expect(sampleBilinear(img, -5, -5)).toBeCloseTo(0, 6);
    expect(sampleBilinear(img, 10, 10)).toBeCloseTo(300, 6);
  });
});

// ─── blockMatch ───────────────────────────────────────────────────────────────

describe('blockMatch', () => {
  it('recovers a known integer shift (2, 1)', () => {
    const a = texturedImage(48, 48);
    const b = shiftImageInt(a, 2, 1);
    const vectors = blockMatch(a, b, { blockSize: 16, searchRange: 4 });
    // Most blocks should report motion (2, 1)
    const dx = vectors.map(v => v.motion.x);
    const dy = vectors.map(v => v.motion.y);
    const modeX = dx.sort((p, q) => p - q)[Math.floor(dx.length / 2)];
    const modeY = dy.sort((p, q) => p - q)[Math.floor(dy.length / 2)];
    expect(modeX).toBe(2);
    expect(modeY).toBe(1);
  });

  it('zero shift → zero motion', () => {
    const a = texturedImage(48, 48);
    const vectors = blockMatch(a, a, { blockSize: 16, searchRange: 4 });
    for (const v of vectors) {
      expect(v.motion.x).toBe(0);
      expect(v.motion.y).toBe(0);
      expect(v.cost).toBe(0);
    }
  });

  it('produces a grid of vectors', () => {
    const a = texturedImage(48, 48);
    const vectors = blockMatch(a, a, { blockSize: 16, step: 16 });
    expect(vectors.length).toBe(9); // 3×3 grid
  });

  it('vector centers are within image bounds', () => {
    const a = texturedImage(32, 32);
    const vectors = blockMatch(a, a, { blockSize: 16 });
    for (const v of vectors) {
      expect(v.center.x).toBeGreaterThan(0);
      expect(v.center.x).toBeLessThan(32);
    }
  });
});

// ─── estimateGlobalMotion ─────────────────────────────────────────────────────

describe('estimateGlobalMotion', () => {
  it('recovers a global translation (3, -2)', () => {
    const a = texturedImage(64, 64);
    const b = shiftImageInt(a, 3, -2);
    const gm = estimateGlobalMotion(a, b, { blockSize: 16, searchRange: 6 });
    expect(gm.translation.x).toBe(3);
    expect(gm.translation.y).toBe(-2);
  });

  it('zero motion for identical frames', () => {
    const a = texturedImage(48, 48);
    const gm = estimateGlobalMotion(a, a, { blockSize: 16, searchRange: 4 });
    expect(gm.translation.x).toBe(0);
    expect(gm.translation.y).toBe(0);
  });

  it('is robust to a local moving region (median rejects outliers)', () => {
    const a = texturedImage(64, 64);
    const b = shiftImageInt(a, 2, 0);
    // Corrupt a small region of b to simulate a moving object
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        b.data[y * 64 + x] = (x * 7 + y * 3) % 255;
      }
    }
    const gm = estimateGlobalMotion(a, b, { blockSize: 16, searchRange: 6 });
    expect(gm.translation.x).toBe(2);
    expect(gm.translation.y).toBe(0);
  });

  it('reports sample count', () => {
    const a = texturedImage(48, 48);
    const gm = estimateGlobalMotion(a, a, { blockSize: 16, step: 16 });
    expect(gm.sampleCount).toBe(9);
  });
});

// ─── lucasKanade ──────────────────────────────────────────────────────────────

describe('lucasKanade', () => {
  it('recovers a small sub-pixel shift', () => {
    const a = texturedImage(64, 64);
    const b = shiftImageFrac(a, 1.0, 0.5);
    const points: Vec2[] = [{ x: 32, y: 32 }, { x: 20, y: 40 }, { x: 44, y: 24 }];
    const flows = lucasKanade(a, b, points, { windowRadius: 4, maxIterations: 20 });
    const valid = flows.filter(f => f.valid);
    expect(valid.length).toBeGreaterThan(0);
    // Average recovered flow should be close to (1.0, 0.5)
    let sx = 0, sy = 0;
    for (const f of valid) { sx += f.flow.x; sy += f.flow.y; }
    expect(sx / valid.length).toBeCloseTo(1.0, 0);
    expect(sy / valid.length).toBeCloseTo(0.5, 0);
  });

  it('zero shift → near-zero flow', () => {
    const a = texturedImage(64, 64);
    const flows = lucasKanade(a, a, [{ x: 32, y: 32 }], { windowRadius: 4 });
    expect(Math.abs(flows[0].flow.x)).toBeLessThan(0.1);
    expect(Math.abs(flows[0].flow.y)).toBeLessThan(0.1);
  });

  it('flat region point is marked invalid (no texture)', () => {
    const flat: GrayImage = { data: new Float32Array(64 * 64).fill(128), width: 64, height: 64 };
    const flows = lucasKanade(flat, flat, [{ x: 32, y: 32 }], { minEigenvalue: 0.01 });
    expect(flows[0].valid).toBe(false);
  });

  it('returns one result per input point', () => {
    const a = texturedImage(48, 48);
    const points: Vec2[] = [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }];
    expect(lucasKanade(a, a, points).length).toBe(3);
  });

  it('REGRESSION: valid reflects actual convergence, not hardcoded true', () => {
    // Before fix: `valid: converged || true` was always true regardless of
    // whether the iterative refinement actually converged.
    const a = texturedImage(64, 64);
    const b = shiftImageFrac(a, 8, 6); // large displacement, textured point
    const flows = lucasKanade(a, b, [{ x: 32, y: 32 }], {
      windowRadius: 4, maxIterations: 1, epsilon: 1e-6,
    });
    // One iteration can't converge to 1e-6 precision on an 8px shift.
    expect(flows[0].valid).toBe(false);
  });
});

// ─── selectFeatures ───────────────────────────────────────────────────────────

describe('selectFeatures', () => {
  it('selects up to one point per grid cell', () => {
    const a = texturedImage(64, 64);
    const features = selectFeatures(a, 4, 4);
    expect(features.length).toBeLessThanOrEqual(16);
    expect(features.length).toBeGreaterThan(0);
  });

  it('features lie within the image (respecting margin)', () => {
    const a = texturedImage(64, 64);
    const features = selectFeatures(a, 4, 4, 4);
    for (const f of features) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThan(64);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThan(64);
    }
  });

  it('flat image yields no strong features', () => {
    const flat: GrayImage = { data: new Float32Array(64 * 64).fill(100), width: 64, height: 64 };
    const features = selectFeatures(flat, 4, 4);
    expect(features.length).toBe(0);
  });

  it('selected features are trackable by Lucas-Kanade', () => {
    const a = texturedImage(64, 64);
    const b = shiftImageFrac(a, 1.0, 0.0);
    const features = selectFeatures(a, 3, 3);
    const flows = lucasKanade(a, b, features, { windowRadius: 4, maxIterations: 20 });
    const valid = flows.filter(f => f.valid);
    expect(valid.length).toBeGreaterThan(0);
  });
});
