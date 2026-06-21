/**
 * Spatial Resampler Tests
 *
 * Tests nearest-neighbour, bilinear, bicubic, and Lanczos-3 kernels for
 * correctness on identity, scale-to-1×1, solid-color, and halving scenarios.
 */

import { describe, it, expect } from 'vitest';
import {
  resampleNearest,
  resampleBilinear,
  resampleBicubic,
  resampleLanczos3,
  resample,
} from '../render/spatial-resampler';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a solid RGBA buffer (all pixels same colour). */
function solid(r: number, g: number, b: number, a: number, w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

/** Return pixel [r,g,b,a] at (x, y) from a buffer. */
function px(data: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] {
  const off = (y * w + x) * 4;
  return [data[off], data[off + 1], data[off + 2], data[off + 3]];
}

type KernelFn = (s: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number) => Uint8ClampedArray;
const KERNELS: [string, KernelFn][] = [
  ['nearest',  resampleNearest],
  ['bilinear', resampleBilinear],
  ['bicubic',  resampleBicubic],
  ['lanczos3', resampleLanczos3],
];

// ─── output size ─────────────────────────────────────────────────────────────

describe('output size', () => {
  it.each(KERNELS)('%s returns buffer of dstW×dstH×4 bytes', (_name, fn) => {
    const src = solid(100, 150, 200, 255, 10, 10);
    const out = fn(src, 10, 10, 5, 8);
    expect(out.length).toBe(5 * 8 * 4);
  });
});

// ─── solid colour preservation ────────────────────────────────────────────────

describe('solid colour preservation', () => {
  // A solid-colour image should resample to the same solid colour
  it.each(KERNELS)('%s preserves solid colour on 2× upscale', (_name, fn) => {
    const r = 120, g = 80, b = 200, a = 255;
    const src = solid(r, g, b, a, 4, 4);
    const out = fn(src, 4, 4, 8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = px(out, 8, x, y);
        expect(p[0]).toBeCloseTo(r, 0);
        expect(p[1]).toBeCloseTo(g, 0);
        expect(p[2]).toBeCloseTo(b, 0);
        expect(p[3]).toBeCloseTo(a, 0);
      }
    }
  });

  it.each(KERNELS)('%s preserves solid colour on 2× downscale', (_name, fn) => {
    const r = 220, g = 30, b = 90, a = 200;
    const src = solid(r, g, b, a, 8, 8);
    const out = fn(src, 8, 8, 4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const p = px(out, 4, x, y);
        expect(Math.abs(p[0] - r)).toBeLessThanOrEqual(1);
        expect(Math.abs(p[1] - g)).toBeLessThanOrEqual(1);
        expect(Math.abs(p[2] - b)).toBeLessThanOrEqual(1);
        expect(Math.abs(p[3] - a)).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─── scale to 1×1 ────────────────────────────────────────────────────────────

describe('scale to 1×1', () => {
  it.each(KERNELS)('%s scales 2×2 to 1×1', (_name, fn) => {
    const src = new Uint8ClampedArray([
      100, 0, 0, 255,  200, 0, 0, 255,
      100, 0, 0, 255,  200, 0, 0, 255,
    ]);
    const out = fn(src, 2, 2, 1, 1);
    expect(out.length).toBe(4);
    // The result should be somewhere between 100 and 200
    expect(out[0]).toBeGreaterThanOrEqual(100);
    expect(out[0]).toBeLessThanOrEqual(200);
    expect(out[3]).toBe(255);
  });
});

// ─── identity resize (1:1) ────────────────────────────────────────────────────

describe('identity resize', () => {
  it.each(KERNELS)('%s identical dimensions returns same pixel values', (_name, fn) => {
    const src = solid(80, 160, 240, 255, 4, 4);
    const out = fn(src, 4, 4, 4, 4);
    for (let i = 0; i < src.length; i++) {
      expect(Math.abs(out[i] - src[i])).toBeLessThanOrEqual(1);
    }
  });
});

// ─── alpha channel ────────────────────────────────────────────────────────────

describe('alpha channel', () => {
  it.each(KERNELS)('%s preserves alpha = 0 (transparent)', (_name, fn) => {
    const src = solid(200, 200, 200, 0, 4, 4);
    const out = fn(src, 4, 4, 8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(px(out, 8, x, y)[3]).toBe(0);
      }
    }
  });
});

// ─── non-square resize ────────────────────────────────────────────────────────

describe('non-square resize', () => {
  it.each(KERNELS)('%s handles non-square source and dest', (_name, fn) => {
    const src = solid(60, 120, 180, 255, 16, 9);
    const out = fn(src, 16, 9, 8, 5);
    expect(out.length).toBe(8 * 5 * 4);
    // Spot-check centre pixel colour
    const p = px(out, 8, 4, 2);
    expect(Math.abs(p[0] - 60)).toBeLessThanOrEqual(1);
  });
});

// ─── resample() unified API ──────────────────────────────────────────────────

describe('resample() unified API', () => {
  it('defaults to bilinear', () => {
    const src = solid(100, 200, 50, 255, 4, 4);
    const out = resample(src, 4, 4, 8, 8);
    expect(out.length).toBe(8 * 8 * 4);
  });

  it.each(['nearest', 'bilinear', 'bicubic', 'lanczos3'] as const)(
    '%s kernel via resample() returns correct size', (kernel) => {
      const src = solid(100, 100, 100, 255, 4, 4);
      const out = resample(src, 4, 4, 6, 6, { kernel });
      expect(out.length).toBe(6 * 6 * 4);
    }
  );
});

// ─── nearest-neighbour correctness ───────────────────────────────────────────

describe('nearest-neighbour specific', () => {
  it('2× upscale of 2-colour image: top-left quadrant = first pixel colour', () => {
    // 2×2 source: R top-left, G top-right, B bottom-left, W bottom-right
    const src = new Uint8ClampedArray([
      255, 0, 0, 255,    0, 255, 0, 255,
        0, 0, 255, 255,  255, 255, 255, 255,
    ]);
    const out = resampleNearest(src, 2, 2, 4, 4);
    // Top-left 2×2 should be red
    expect(px(out, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(out, 4, 1, 0)).toEqual([255, 0, 0, 255]);
    // Top-right 2×2 should be green
    expect(px(out, 4, 2, 0)).toEqual([0, 255, 0, 255]);
    expect(px(out, 4, 3, 0)).toEqual([0, 255, 0, 255]);
  });
});
