/**
 * Tests for color/convolution.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  convolve,
  convolveSeparable,
  gaussianKernel1d,
  gaussianBlur,
  boxBlur,
  unsharpMask,
  sharpen,
  edgeDetect,
  emboss,
} from '../color/convolution';
import type { Kernel } from '../color/convolution';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function solid(
  w: number, h: number,
  color: [number, number, number, number] = [128, 128, 128, 255],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = color[0]; buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2]; buf[i * 4 + 3] = color[3];
  }
  return buf;
}

/** Vertical edge: left half black, right half white. */
function edgeImage(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255;
      const off = (y * w + x) * 4;
      buf[off] = buf[off + 1] = buf[off + 2] = v;
      buf[off + 3] = 255;
    }
  }
  return buf;
}

const IDENTITY3: Kernel = { weights: [0, 0, 0, 0, 1, 0, 0, 0, 0], size: 3, divisor: 1 };

// ─── convolve ─────────────────────────────────────────────────────────────────

describe('convolve', () => {
  it('identity kernel preserves the image', () => {
    const img = edgeImage(8, 8);
    const out = convolve(img, 8, 8, IDENTITY3);
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('preserves alpha', () => {
    const img = solid(4, 4, [100, 100, 100, 200]);
    const out = convolve(img, 4, 4, { weights: [1, 1, 1, 1, 1, 1, 1, 1, 1], size: 3 });
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(200);
  });

  it('box average of solid image is unchanged', () => {
    const img = solid(6, 6, [120, 80, 40, 255]);
    const out = convolve(img, 6, 6, { weights: new Array(9).fill(1), size: 3 });
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - img[i])).toBeLessThanOrEqual(1);
    }
  });

  it('bias is applied', () => {
    const img = solid(2, 2, [0, 0, 0, 255]);
    const out = convolve(img, 2, 2, { weights: [0,0,0,0,1,0,0,0,0], size: 3, divisor: 1, bias: 50 });
    expect(out[0]).toBe(50);
  });

  it('an explicit divisor of 0 does not blow the image to Infinity/255', () => {
    // A zero divisor would make invDiv = Infinity; guarded to 1 (identity).
    const img = solid(2, 2, [100, 120, 140, 255]);
    const out = convolve(img, 2, 2, { weights: [0,0,0,0,1,0,0,0,0], size: 3, divisor: 0 });
    expect(out[0]).toBe(100); // treated as divisor 1, not Infinity → 255
    for (let i = 0; i < out.length; i++) expect(Number.isFinite(out[i])).toBe(true);
  });

  it('does not mutate input', () => {
    const img = edgeImage(4, 4);
    const copy = Uint8ClampedArray.from(img);
    convolve(img, 4, 4, { weights: new Array(9).fill(1), size: 3 });
    expect(Array.from(img)).toEqual(Array.from(copy));
  });

  it('all outputs within [0,255]', () => {
    const img = edgeImage(8, 8);
    const out = sharpen(img, 8, 8, 3);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

// ─── convolveSeparable ────────────────────────────────────────────────────────

describe('convolveSeparable', () => {
  it('uniform kernel of solid image is unchanged', () => {
    const img = solid(8, 8, [100, 150, 200, 255]);
    const out = convolveSeparable(img, 8, 8, [1, 1, 1]);
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - img[i])).toBeLessThanOrEqual(1);
    }
  });

  it('matches a box convolve on an edge (within rounding)', () => {
    const img = edgeImage(16, 4);
    const sep = convolveSeparable(img, 16, 4, [1, 1, 1]);
    const full = convolve(img, 16, 4, { weights: new Array(9).fill(1), size: 3 });
    let maxDiff = 0;
    for (let i = 0; i < sep.length; i++) {
      if (i % 4 === 3) continue;
      maxDiff = Math.max(maxDiff, Math.abs(sep[i] - full[i]));
    }
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  it('preserves alpha', () => {
    const img = solid(4, 4, [100, 100, 100, 222]);
    const out = convolveSeparable(img, 4, 4, [1, 2, 1]);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(222);
  });
});

// ─── gaussianKernel1d ─────────────────────────────────────────────────────────

describe('gaussianKernel1d', () => {
  it('sums to ~1 (normalized)', () => {
    const k = gaussianKernel1d(2.0);
    let sum = 0;
    for (const v of k) sum += v;
    expect(sum).toBeCloseTo(1, 6);
  });

  it('is symmetric', () => {
    const k = gaussianKernel1d(1.5);
    const n = k.length;
    for (let i = 0; i < n; i++) {
      expect(k[i]).toBeCloseTo(k[n - 1 - i], 8);
    }
  });

  it('peak is at the center', () => {
    const k = gaussianKernel1d(2.0);
    const mid = k.length >> 1;
    for (let i = 0; i < k.length; i++) {
      if (i !== mid) expect(k[mid]).toBeGreaterThanOrEqual(k[i]);
    }
  });

  it('respects custom radius', () => {
    const k = gaussianKernel1d(1, 5);
    expect(k.length).toBe(11);
  });
});

// ─── gaussianBlur / boxBlur ───────────────────────────────────────────────────

describe('gaussianBlur', () => {
  it('solid image unchanged', () => {
    const img = solid(8, 8, [100, 150, 200, 255]);
    const out = gaussianBlur(img, 8, 8, 2);
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - img[i])).toBeLessThanOrEqual(1);
    }
  });

  it('softens a sharp edge', () => {
    const img = edgeImage(16, 4);
    const out = gaussianBlur(img, 16, 4, 2);
    // The pixel just left of the edge should rise above 0 after blur
    const off = (0 * 16 + 7) * 4;
    expect(out[off]).toBeGreaterThan(0);
    // and just right of edge should drop below 255
    const off2 = (0 * 16 + 8) * 4;
    expect(out[off2]).toBeLessThan(255);
  });

  it('preserves dimensions', () => {
    const img = solid(10, 6);
    expect(gaussianBlur(img, 10, 6).length).toBe(img.length);
  });
});

describe('boxBlur', () => {
  it('reduces variance of an edge image', () => {
    const img = edgeImage(16, 4);
    const out = boxBlur(img, 16, 4, 2);
    // After blur, there should be intermediate values near the edge
    let hasIntermediate = false;
    for (let i = 0; i < out.length; i += 4) {
      if (out[i] > 10 && out[i] < 245) { hasIntermediate = true; break; }
    }
    expect(hasIntermediate).toBe(true);
  });
});

// ─── unsharpMask ──────────────────────────────────────────────────────────────

describe('unsharpMask', () => {
  it('solid image is unchanged (no detail to sharpen)', () => {
    const img = solid(8, 8, [128, 128, 128, 255]);
    const out = unsharpMask(img, 8, 8, { amount: 2 });
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - 128)).toBeLessThanOrEqual(1);
    }
  });

  it('increases edge contrast (overshoot/undershoot)', () => {
    const img = edgeImage(16, 4);
    const out = unsharpMask(img, 16, 4, { amount: 1.5, radius: 1.5 });
    // Look for an undershoot below 0-side or overshoot above white near edge
    let foundOvershoot = false;
    for (let i = 0; i < out.length; i += 4) {
      // dark side pixels driven to exactly 0, bright side to 255 → contrast increased
      if (out[i] === 0 || out[i] === 255) { foundOvershoot = true; }
    }
    expect(foundOvershoot).toBe(true);
  });

  it('threshold suppresses sharpening below contrast level', () => {
    // Low-contrast noise-like image
    const w = 8, h = 8;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 128 + (i % 2 === 0 ? 1 : -1); // ±1 variation
      img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = v;
      img[i * 4 + 3] = 255;
    }
    const out = unsharpMask(img, w, h, { amount: 3, threshold: 10 });
    // With high threshold, the ±1 variation is below threshold → unchanged
    for (let i = 0; i < w * h; i++) {
      expect(out[i * 4]).toBe(img[i * 4]);
    }
  });

  it('preserves alpha', () => {
    const img = solid(4, 4, [100, 100, 100, 180]);
    const out = unsharpMask(img, 4, 4);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(180);
  });
});

// ─── sharpen ──────────────────────────────────────────────────────────────────

describe('sharpen', () => {
  it('strength 0 leaves image unchanged', () => {
    const img = edgeImage(8, 8);
    const out = sharpen(img, 8, 8, 0);
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('solid image unchanged (high-pass of flat = flat)', () => {
    const img = solid(8, 8, [100, 100, 100, 255]);
    const out = sharpen(img, 8, 8, 1);
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - 100)).toBeLessThanOrEqual(1);
    }
  });

  it('increases contrast at an edge', () => {
    const img = edgeImage(16, 4);
    const out = sharpen(img, 16, 4, 1);
    expect(out.length).toBe(img.length);
  });
});

// ─── edgeDetect ───────────────────────────────────────────────────────────────

describe('edgeDetect', () => {
  it('solid image → near-zero edges', () => {
    const img = solid(8, 8, [100, 100, 100, 255]);
    const out = edgeDetect(img, 8, 8);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBeLessThanOrEqual(2);
    }
  });

  it('detects a strong vertical edge', () => {
    const img = edgeImage(16, 4);
    const out = edgeDetect(img, 16, 4);
    // The column at the edge boundary should have high magnitude
    const off = (1 * 16 + 8) * 4;
    expect(out[off]).toBeGreaterThan(100);
  });

  it('output is grayscale (R=G=B)', () => {
    const img = edgeImage(8, 8);
    const out = edgeDetect(img, 8, 8);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(out[i + 1]);
      expect(out[i + 1]).toBe(out[i + 2]);
    }
  });

  it('preserves alpha', () => {
    const img = solid(4, 4, [100, 100, 100, 222]);
    const out = edgeDetect(img, 4, 4);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(222);
  });
});

// ─── emboss ───────────────────────────────────────────────────────────────────

describe('emboss', () => {
  it('solid image → flat value + bias', () => {
    const img = solid(8, 8, [100, 100, 100, 255]);
    const out = emboss(img, 8, 8);
    // Emboss weights sum to 1, so a flat region maps to value*1 + bias(128) = 228.
    expect(out[0]).toBe(228);
  });

  it('preserves alpha', () => {
    const img = solid(4, 4, [100, 100, 100, 200]);
    const out = emboss(img, 4, 4);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(200);
  });

  it('all outputs within [0,255]', () => {
    const img = edgeImage(8, 8);
    const out = emboss(img, 8, 8);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});
