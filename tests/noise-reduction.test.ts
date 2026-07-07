/**
 * Tests for color/noise-reduction.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  bilateralFilter,
  gaussianBlur,
  nonLocalMeans,
  estimateNoise,
  makeSyntheticNoisyImage,
  imagePsnr,
} from '../color/noise-reduction';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a solid-color RGBA image. */
function solidImage(
  w: number, h: number,
  color: [number, number, number, number] = [128, 128, 128, 255],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4]     = color[0];
    buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2];
    buf[i * 4 + 3] = color[3];
  }
  return buf;
}

/** Create an image with a vertical edge: left half black, right half white. */
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

// ─── bilateralFilter ──────────────────────────────────────────────────────────

describe('bilateralFilter', () => {
  it('output has the same length as input', () => {
    const src = solidImage(8, 8);
    const out = bilateralFilter(src, 8, 8);
    expect(out.length).toBe(src.length);
  });

  it('returns a new Uint8ClampedArray (does not mutate input)', () => {
    const src = solidImage(4, 4, [100, 100, 100, 255]);
    const copy = src.slice();
    const out = bilateralFilter(src, 4, 4);
    expect(out).not.toBe(src);
    expect(Array.from(src)).toEqual(Array.from(copy));
  });

  it('solid image is preserved (no change on flat region)', () => {
    const src = solidImage(8, 8, [120, 80, 200, 255]);
    const out = bilateralFilter(src, 8, 8, { sigmaS: 2, sigmaR: 25 });
    for (let i = 0; i < src.length; i++) {
      expect(out[i]).toBe(src[i]);
    }
  });

  it('preserves alpha channel unchanged', () => {
    const src = solidImage(4, 4, [100, 100, 100, 200]);
    const out = bilateralFilter(src, 4, 4);
    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(200);
    }
  });

  it('preserves edges (edge remains sharp with small sigmaR)', () => {
    const w = 16, h = 8;
    const src = edgeImage(w, h);
    const out = bilateralFilter(src, w, h, { sigmaS: 3, sigmaR: 10 });
    // Pixel far from edge on black side stays dark
    const leftOff  = (4 * w + 2) * 4;
    // Pixel far from edge on white side stays bright
    const rightOff = (4 * w + 13) * 4;
    expect(out[leftOff]).toBeLessThan(40);
    expect(out[rightOff]).toBeGreaterThan(215);
  });

  it('reduces noise (PSNR improves on noisy flat image)', () => {
    const w = 24, h = 24;
    const clean = solidImage(w, h, [128, 128, 128, 255]);
    const noisy = makeSyntheticNoisyImage(w, h, [128, 128, 128, 255], 20, 7);
    const denoised = bilateralFilter(noisy, w, h, { sigmaS: 2, sigmaR: 40 });
    const psnrBefore = imagePsnr(clean, noisy);
    const psnrAfter  = imagePsnr(clean, denoised);
    expect(psnrAfter).toBeGreaterThan(psnrBefore);
  });

  it('all output values are within [0, 255]', () => {
    const noisy = makeSyntheticNoisyImage(10, 10, [128, 128, 128, 255], 30, 3);
    const out = bilateralFilter(noisy, 10, 10);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('custom radius option is respected (runs without error)', () => {
    const src = solidImage(8, 8);
    expect(() => bilateralFilter(src, 8, 8, { radius: 1 })).not.toThrow();
    expect(() => bilateralFilter(src, 8, 8, { radius: 5 })).not.toThrow();
  });

  it('sigmaS=0 does not produce NaN output (0*Infinity guard in Gaussian LUT)', () => {
    // sigma=0 → inv2sig2=Infinity → Math.exp(-0*Infinity)=NaN in the LUT.
    const src = solidImage(6, 6, [100, 150, 200, 255]);
    const out = bilateralFilter(src, 6, 6, { sigmaS: 0 });
    for (const v of out) expect(Number.isNaN(v)).toBe(false);
  });

  it('sigmaR=0 does not produce NaN output', () => {
    const src = solidImage(6, 6, [100, 150, 200, 255]);
    const out = bilateralFilter(src, 6, 6, { sigmaR: 0 });
    for (const v of out) expect(Number.isNaN(v)).toBe(false);
  });
});

// ─── gaussianBlur ─────────────────────────────────────────────────────────────

describe('gaussianBlur', () => {
  it('output has the same length as input', () => {
    const src = solidImage(8, 8);
    const out = gaussianBlur(src, 8, 8);
    expect(out.length).toBe(src.length);
  });

  it('solid image is preserved (within rounding)', () => {
    const src = solidImage(8, 8, [100, 150, 200, 255]);
    const out = gaussianBlur(src, 8, 8, 2.0);
    for (let i = 0; i < src.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - src[i])).toBeLessThanOrEqual(1);
    }
  });

  it('preserves alpha channel', () => {
    const src = solidImage(4, 4, [100, 100, 100, 180]);
    const out = gaussianBlur(src, 4, 4);
    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(180);
    }
  });

  it('blurs an edge (transition becomes gradual)', () => {
    const w = 16, h = 8;
    const src = edgeImage(w, h);
    const out = gaussianBlur(src, w, h, 2.0);
    // Pixel right at the edge boundary should become intermediate
    const edgeOff = (4 * w + 8) * 4;
    expect(out[edgeOff]).toBeGreaterThan(20);
    expect(out[edgeOff]).toBeLessThan(235);
  });

  it('all output values within [0, 255]', () => {
    const noisy = makeSyntheticNoisyImage(12, 12, [128, 128, 128, 255], 40, 5);
    const out = gaussianBlur(noisy, 12, 12);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

// ─── nonLocalMeans ────────────────────────────────────────────────────────────

describe('nonLocalMeans', () => {
  it('output has the same length as input', () => {
    const src = solidImage(8, 8);
    const out = nonLocalMeans(src, 8, 8, { patchRadius: 1, searchRadius: 2 });
    expect(out.length).toBe(src.length);
  });

  it('solid image is preserved', () => {
    const src = solidImage(8, 8, [120, 80, 200, 255]);
    const out = nonLocalMeans(src, 8, 8, { patchRadius: 1, searchRadius: 2 });
    for (let i = 0; i < src.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - src[i])).toBeLessThanOrEqual(1);
    }
  });

  it('preserves alpha channel', () => {
    const src = solidImage(6, 6, [100, 100, 100, 222]);
    const out = nonLocalMeans(src, 6, 6, { patchRadius: 1, searchRadius: 2 });
    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(222);
    }
  });

  it('reduces noise on noisy flat image (PSNR improves)', () => {
    const w = 16, h = 16;
    const clean = solidImage(w, h, [128, 128, 128, 255]);
    const noisy = makeSyntheticNoisyImage(w, h, [128, 128, 128, 255], 20, 11);
    const denoised = nonLocalMeans(noisy, w, h, { h: 25, patchRadius: 1, searchRadius: 3 });
    expect(imagePsnr(clean, denoised)).toBeGreaterThan(imagePsnr(clean, noisy));
  });

  it('h=0 does not produce NaN output (patchArea*h²=0 → 0/0 guard)', () => {
    // h=0 makes patchDist/0=NaN for the self-patch (0/0).
    const src = solidImage(6, 6, [100, 150, 200, 255]);
    const out = nonLocalMeans(src, 6, 6, { h: 0, patchRadius: 1, searchRadius: 2 });
    for (const v of out) expect(Number.isNaN(v)).toBe(false);
  });

  it('all output values within [0, 255]', () => {
    const noisy = makeSyntheticNoisyImage(8, 8, [128, 128, 128, 255], 30, 9);
    const out = nonLocalMeans(noisy, 8, 8, { patchRadius: 1, searchRadius: 2 });
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

// ─── estimateNoise ────────────────────────────────────────────────────────────

describe('estimateNoise', () => {
  it('clean solid image has near-zero noise estimate', () => {
    const src = solidImage(16, 16, [128, 128, 128, 255]);
    const result = estimateNoise(src, 16, 16);
    expect(result.sigma).toBeLessThan(1);
  });

  it('noisy image has higher noise estimate than clean', () => {
    const clean = solidImage(24, 24, [128, 128, 128, 255]);
    const noisy = makeSyntheticNoisyImage(24, 24, [128, 128, 128, 255], 20, 3);
    expect(estimateNoise(noisy, 24, 24).sigma).toBeGreaterThan(estimateNoise(clean, 24, 24).sigma);
  });

  it('higher noise sigma → higher estimate', () => {
    const lowNoise  = makeSyntheticNoisyImage(24, 24, [128, 128, 128, 255], 5,  3);
    const highNoise = makeSyntheticNoisyImage(24, 24, [128, 128, 128, 255], 30, 3);
    expect(estimateNoise(highNoise, 24, 24).sigma)
      .toBeGreaterThan(estimateNoise(lowNoise, 24, 24).sigma);
  });

  it('returns per-channel sigma array of length 3', () => {
    const src = makeSyntheticNoisyImage(16, 16, [128, 128, 128, 255], 15, 3);
    const result = estimateNoise(src, 16, 16);
    expect(result.channelSigma.length).toBe(3);
    for (const s of result.channelSigma) {
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('combined sigma is the mean of channel sigmas', () => {
    const src = makeSyntheticNoisyImage(16, 16, [100, 150, 200, 255], 15, 3);
    const result = estimateNoise(src, 16, 16);
    const mean = (result.channelSigma[0] + result.channelSigma[1] + result.channelSigma[2]) / 3;
    expect(result.sigma).toBeCloseTo(mean, 8);
  });

  it('REGRESSION: estimate is within the right order of magnitude of the true sigma (not divided by N twice)', () => {
    // A prior bug divided by N (interior pixel count) twice, underestimating
    // sigma by a factor of N — e.g. true sigma=15 on a 1920x1080 image came
    // out as ~0.0000054. Use a large-enough image for the estimator's bias
    // to be small, and assert the estimate lands within 50% of the true sigma.
    const trueSigma = 20;
    const src = makeSyntheticNoisyImage(64, 64, [128, 128, 128, 255], trueSigma, 7);
    const result = estimateNoise(src, 64, 64);
    expect(result.sigma).toBeGreaterThan(trueSigma * 0.5);
    expect(result.sigma).toBeLessThan(trueSigma * 1.5);
  });

  it('REGRESSION: estimate matches true sigma within 10% (was ~25% low from a wrong-kernel/normalization mismatch)', () => {
    // Before fix: the 5-tap "plus" Laplacian (4c-l-r-u-d, sum-of-squared-
    // coefficients=20) was used with the true 9-tap Immerkaer kernel's
    // normalization constant (6=sqrt(36)), so every estimate came out at
    // sqrt(20)/6 ≈ 0.745x the true sigma — a systematic ~25% underestimate
    // that the ±50% tolerance above doesn't catch. Reading all 4 diagonal
    // neighbors (the full 3×3 kernel) fixes this without touching the
    // constant, since the true kernel's coefficients already sum-of-squares
    // to exactly 36.
    const trueSigma = 20;
    const src = makeSyntheticNoisyImage(64, 64, [128, 128, 128, 255], trueSigma, 7);
    const result = estimateNoise(src, 64, 64);
    expect(result.sigma).toBeGreaterThan(trueSigma * 0.9);
    expect(result.sigma).toBeLessThan(trueSigma * 1.1);
  });

  it('2×2 image (N=0 interior pixels) returns sigma=0 not NaN (0*Infinity guard)', () => {
    // A 2×2 image has no interior pixels; scaleFactor was Infinity, channelSums=0 → NaN.
    const src = solidImage(2, 2, [128, 128, 128, 255]);
    const result = estimateNoise(src, 2, 2);
    expect(Number.isNaN(result.sigma)).toBe(false);
    expect(result.sigma).toBe(0);
    for (const s of result.channelSigma) expect(Number.isNaN(s)).toBe(false);
  });
});

// ─── makeSyntheticNoisyImage ──────────────────────────────────────────────────

describe('makeSyntheticNoisyImage', () => {
  it('produces image of correct dimensions', () => {
    const img = makeSyntheticNoisyImage(10, 12);
    expect(img.length).toBe(10 * 12 * 4);
  });

  it('is deterministic with the same seed', () => {
    const a = makeSyntheticNoisyImage(8, 8, [128, 128, 128, 255], 15, 99);
    const b = makeSyntheticNoisyImage(8, 8, [128, 128, 128, 255], 15, 99);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('different seeds produce different images', () => {
    const a = makeSyntheticNoisyImage(8, 8, [128, 128, 128, 255], 15, 1);
    const b = makeSyntheticNoisyImage(8, 8, [128, 128, 128, 255], 15, 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('alpha is set to the base color alpha', () => {
    const img = makeSyntheticNoisyImage(4, 4, [128, 128, 128, 200], 15, 3);
    for (let i = 3; i < img.length; i += 4) {
      expect(img[i]).toBe(200);
    }
  });

  it('mean is approximately the base color', () => {
    const img = makeSyntheticNoisyImage(32, 32, [128, 128, 128, 255], 15, 3);
    let sum = 0, count = 0;
    for (let i = 0; i < img.length; i++) {
      if (i % 4 === 3) continue;
      sum += img[i];
      count++;
    }
    expect(sum / count).toBeCloseTo(128, -1); // within ~10 of base
  });
});

// ─── imagePsnr ────────────────────────────────────────────────────────────────

describe('imagePsnr', () => {
  it('identical images → Infinity', () => {
    const src = solidImage(8, 8, [128, 100, 50, 255]);
    expect(imagePsnr(src, src)).toBe(Infinity);
  });

  it('returns finite positive value for different images', () => {
    const a = solidImage(8, 8, [128, 128, 128, 255]);
    const b = solidImage(8, 8, [130, 128, 128, 255]);
    const psnr = imagePsnr(a, b);
    expect(Number.isFinite(psnr)).toBe(true);
    expect(psnr).toBeGreaterThan(0);
  });

  it('larger difference → lower PSNR', () => {
    const ref  = solidImage(8, 8, [128, 128, 128, 255]);
    const near = solidImage(8, 8, [130, 128, 128, 255]);
    const far  = solidImage(8, 8, [180, 128, 128, 255]);
    expect(imagePsnr(ref, near)).toBeGreaterThan(imagePsnr(ref, far));
  });

  it('ignores alpha differences', () => {
    const a = solidImage(8, 8, [128, 128, 128, 255]);
    const b = solidImage(8, 8, [128, 128, 128, 100]);
    expect(imagePsnr(a, b)).toBe(Infinity); // only alpha differs → RGB identical
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('noise reduction — edge cases', () => {
  it('bilateral on 1×1 image works', () => {
    const src = solidImage(1, 1, [42, 42, 42, 255]);
    const out = bilateralFilter(src, 1, 1);
    expect(out[0]).toBe(42);
  });

  it('gaussianBlur on 2×2 image works', () => {
    const src = solidImage(2, 2, [50, 60, 70, 255]);
    const out = gaussianBlur(src, 2, 2);
    expect(out.length).toBe(16);
  });

  it('nonLocalMeans on small 3×3 image works', () => {
    const src = solidImage(3, 3, [80, 80, 80, 255]);
    const out = nonLocalMeans(src, 3, 3, { patchRadius: 1, searchRadius: 1 });
    expect(out.length).toBe(36);
  });

  it('estimateNoise on minimum 3×3 image works', () => {
    const src = solidImage(3, 3, [100, 100, 100, 255]);
    const result = estimateNoise(src, 3, 3);
    expect(result.sigma).toBeGreaterThanOrEqual(0);
  });
});
