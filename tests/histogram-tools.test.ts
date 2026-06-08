/**
 * Tests for color/histogram-tools.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  luma709,
  computeHistogram,
  cumulativeHistogram,
  channelStats,
  histogramPercentile,
  buildLevelsLUT,
  applyChannelLUT,
  applyLevels,
  buildEqualizationLUT,
  equalizeHistogram,
  autoContrast,
  meanLuminance,
  identityLUT,
} from '../color/histogram-tools';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Solid-color RGBA image. */
function solid(
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

/** Horizontal gradient 0..255 across width. */
function gradient(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const off = (y * w + x) * 4;
      buf[off] = buf[off + 1] = buf[off + 2] = v;
      buf[off + 3] = 255;
    }
  }
  return buf;
}

// ─── luma709 ──────────────────────────────────────────────────────────────────

describe('luma709', () => {
  it('white → 255', () => {
    expect(luma709(255, 255, 255)).toBe(255);
  });

  it('black → 0', () => {
    expect(luma709(0, 0, 0)).toBe(0);
  });

  it('pure green is brightest channel', () => {
    expect(luma709(0, 255, 0)).toBeGreaterThan(luma709(255, 0, 0));
    expect(luma709(0, 255, 0)).toBeGreaterThan(luma709(0, 0, 255));
  });

  it('Rec.709 weights: green ≈ 182', () => {
    expect(luma709(0, 255, 0)).toBe(Math.round(0.7152 * 255));
  });
});

// ─── computeHistogram ─────────────────────────────────────────────────────────

describe('computeHistogram', () => {
  it('solid image has a single populated bin per channel', () => {
    const img = solid(4, 4, [100, 150, 200, 255]);
    const h = computeHistogram(img, 4, 4);
    expect(h.r[100]).toBe(16);
    expect(h.g[150]).toBe(16);
    expect(h.b[200]).toBe(16);
    expect(h.pixelCount).toBe(16);
  });

  it('all other bins are zero for solid image', () => {
    const img = solid(2, 2, [50, 50, 50, 255]);
    const h = computeHistogram(img, 2, 2);
    let nonZero = 0;
    for (let v = 0; v < 256; v++) if (h.r[v] > 0) nonZero++;
    expect(nonZero).toBe(1);
  });

  it('gradient populates many bins', () => {
    const img = gradient(256, 1);
    const h = computeHistogram(img, 256, 1);
    let populated = 0;
    for (let v = 0; v < 256; v++) if (h.luma[v] > 0) populated++;
    expect(populated).toBeGreaterThan(200);
  });

  it('counts sum to pixel count', () => {
    const img = gradient(16, 16);
    const h = computeHistogram(img, 16, 16);
    let sum = 0;
    for (let v = 0; v < 256; v++) sum += h.r[v];
    expect(sum).toBe(256);
  });
});

// ─── cumulativeHistogram ──────────────────────────────────────────────────────

describe('cumulativeHistogram', () => {
  it('is monotonically non-decreasing', () => {
    const img = gradient(64, 1);
    const h = computeHistogram(img, 64, 1);
    const cdf = cumulativeHistogram(h.luma);
    for (let v = 1; v < 256; v++) {
      expect(cdf[v]).toBeGreaterThanOrEqual(cdf[v - 1]);
    }
  });

  it('final value equals total pixel count', () => {
    const img = solid(8, 8);
    const h = computeHistogram(img, 8, 8);
    const cdf = cumulativeHistogram(h.r);
    expect(cdf[255]).toBe(64);
  });
});

// ─── channelStats ─────────────────────────────────────────────────────────────

describe('channelStats', () => {
  it('solid value: min = max = mean = median', () => {
    const img = solid(4, 4, [128, 128, 128, 255]);
    const h = computeHistogram(img, 4, 4);
    const s = channelStats(h.r);
    expect(s.min).toBe(128);
    expect(s.max).toBe(128);
    expect(s.mean).toBe(128);
    expect(s.median).toBe(128);
  });

  it('empty channel returns zeros', () => {
    const empty = new Uint32Array(256);
    const s = channelStats(empty);
    expect(s).toEqual({ min: 0, max: 0, mean: 0, median: 0 });
  });

  it('gradient: min ≈ 0, max ≈ 255, mean ≈ 127', () => {
    const img = gradient(256, 1);
    const h = computeHistogram(img, 256, 1);
    const s = channelStats(h.luma);
    expect(s.min).toBeLessThan(5);
    expect(s.max).toBeGreaterThan(250);
    expect(s.mean).toBeGreaterThan(120);
    expect(s.mean).toBeLessThan(135);
  });

  it('two-value channel: median is correct', () => {
    const ch = new Uint32Array(256);
    ch[10] = 3;
    ch[200] = 1;
    const s = channelStats(ch);
    expect(s.min).toBe(10);
    expect(s.max).toBe(200);
    // 3 of 4 pixels at 10, median (cumulative half=2) at 10
    expect(s.median).toBe(10);
  });
});

// ─── histogramPercentile ──────────────────────────────────────────────────────

describe('histogramPercentile', () => {
  it('0th percentile is min value', () => {
    const img = gradient(256, 1);
    const h = computeHistogram(img, 256, 1);
    expect(histogramPercentile(h.luma, 0)).toBeLessThan(5);
  });

  it('100th percentile is max value', () => {
    const img = gradient(256, 1);
    const h = computeHistogram(img, 256, 1);
    expect(histogramPercentile(h.luma, 100)).toBeGreaterThan(250);
  });

  it('50th percentile ≈ median', () => {
    const img = gradient(256, 1);
    const h = computeHistogram(img, 256, 1);
    const p50 = histogramPercentile(h.luma, 50);
    const median = channelStats(h.luma).median;
    expect(Math.abs(p50 - median)).toBeLessThanOrEqual(2);
  });

  it('empty channel returns 0', () => {
    expect(histogramPercentile(new Uint32Array(256), 50)).toBe(0);
  });

  it('clamps percentile outside [0,100]', () => {
    const img = solid(4, 4, [100, 100, 100, 255]);
    const h = computeHistogram(img, 4, 4);
    expect(histogramPercentile(h.r, -10)).toBe(100);
    expect(histogramPercentile(h.r, 200)).toBe(100);
  });
});

// ─── buildLevelsLUT ───────────────────────────────────────────────────────────

describe('buildLevelsLUT', () => {
  it('default params produce identity LUT', () => {
    const lut = buildLevelsLUT();
    for (let v = 0; v < 256; v++) expect(lut[v]).toBe(v);
  });

  it('input black/white stretches range', () => {
    const lut = buildLevelsLUT({ inBlack: 50, inWhite: 200 });
    expect(lut[50]).toBe(0);
    expect(lut[200]).toBe(255);
    expect(lut[25]).toBe(0);   // below inBlack clamps
    expect(lut[255]).toBe(255); // above inWhite clamps
  });

  it('gamma > 1 brightens midtones', () => {
    const lut = buildLevelsLUT({ gamma: 2.0 });
    expect(lut[128]).toBeGreaterThan(128);
  });

  it('gamma < 1 darkens midtones', () => {
    const lut = buildLevelsLUT({ gamma: 0.5 });
    expect(lut[128]).toBeLessThan(128);
  });

  it('output black/white compresses range', () => {
    const lut = buildLevelsLUT({ outBlack: 50, outWhite: 200 });
    expect(lut[0]).toBe(50);
    expect(lut[255]).toBe(200);
  });

  it('LUT is monotonically non-decreasing', () => {
    const lut = buildLevelsLUT({ inBlack: 20, inWhite: 240, gamma: 1.5 });
    for (let v = 1; v < 256; v++) {
      expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1]);
    }
  });

  it('degenerate inBlack == inWhite does not throw', () => {
    expect(() => buildLevelsLUT({ inBlack: 128, inWhite: 128 })).not.toThrow();
  });
});

// ─── applyChannelLUT ──────────────────────────────────────────────────────────

describe('applyChannelLUT', () => {
  it('identity LUT preserves image', () => {
    const img = gradient(8, 8);
    const out = applyChannelLUT(img, 8, 8, identityLUT());
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('preserves alpha channel', () => {
    const img = solid(4, 4, [100, 100, 100, 222]);
    const lut = buildLevelsLUT({ gamma: 2 });
    const out = applyChannelLUT(img, 4, 4, lut);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(222);
  });

  it('different LUTs per channel are applied independently', () => {
    const img = solid(2, 2, [100, 100, 100, 255]);
    const lutR = buildLevelsLUT({ outBlack: 10, outWhite: 10 }); // → all 10
    const lutG = buildLevelsLUT({ outBlack: 20, outWhite: 20 }); // → all 20
    const lutB = buildLevelsLUT({ outBlack: 30, outWhite: 30 }); // → all 30
    const out = applyChannelLUT(img, 2, 2, lutR, lutG, lutB);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
    expect(out[2]).toBe(30);
  });

  it('does not mutate the input', () => {
    const img = solid(4, 4, [100, 100, 100, 255]);
    const copy = Float32Array.from(img);
    applyChannelLUT(img, 4, 4, buildLevelsLUT({ gamma: 2 }));
    expect(Array.from(img)).toEqual(Array.from(copy));
  });
});

// ─── applyLevels ──────────────────────────────────────────────────────────────

describe('applyLevels', () => {
  it('stretches a low-contrast image', () => {
    // image with values only in [100, 150]
    const img = gradient(51, 1);
    for (let x = 0; x < 51; x++) {
      const v = 100 + x; // 100..150
      img[x * 4] = img[x * 4 + 1] = img[x * 4 + 2] = v;
    }
    const out = applyLevels(img, 51, 1, { inBlack: 100, inWhite: 150 });
    expect(out[0]).toBe(0);          // value 100 → 0
    expect(out[50 * 4]).toBe(255);   // value 150 → 255
  });

  it('identity params preserve image', () => {
    const img = gradient(8, 8);
    const out = applyLevels(img, 8, 8, {});
    expect(Array.from(out)).toEqual(Array.from(img));
  });
});

// ─── buildEqualizationLUT ─────────────────────────────────────────────────────

describe('buildEqualizationLUT', () => {
  it('empty channel returns identity', () => {
    const lut = buildEqualizationLUT(new Uint32Array(256));
    for (let v = 0; v < 256; v++) expect(lut[v]).toBe(v);
  });

  it('is monotonically non-decreasing', () => {
    const img = gradient(64, 1);
    const h = computeHistogram(img, 64, 1);
    const lut = buildEqualizationLUT(h.luma);
    for (let v = 1; v < 256; v++) {
      expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1]);
    }
  });

  it('maps max input to 255', () => {
    const img = gradient(256, 1);
    const h = computeHistogram(img, 256, 1);
    const lut = buildEqualizationLUT(h.luma);
    expect(lut[255]).toBe(255);
  });
});

// ─── equalizeHistogram ────────────────────────────────────────────────────────

describe('equalizeHistogram', () => {
  it('output has same dimensions', () => {
    const img = gradient(16, 16);
    const out = equalizeHistogram(img, 16, 16);
    expect(out.length).toBe(img.length);
  });

  it('preserves alpha', () => {
    const img = solid(4, 4, [100, 120, 140, 200]);
    const out = equalizeHistogram(img, 4, 4);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(200);
  });

  it('expands dynamic range of a low-contrast image', () => {
    // Narrow-range image
    const w = 64, h = 1;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      const v = 110 + Math.round((x / (w - 1)) * 30); // 110..140
      img[x * 4] = img[x * 4 + 1] = img[x * 4 + 2] = v;
      img[x * 4 + 3] = 255;
    }
    const out = equalizeHistogram(img, w, h);
    const before = computeHistogram(img, w, h);
    const after  = computeHistogram(out, w, h);
    const rangeBefore = channelStats(before.luma).max - channelStats(before.luma).min;
    const rangeAfter  = channelStats(after.luma).max  - channelStats(after.luma).min;
    expect(rangeAfter).toBeGreaterThan(rangeBefore);
  });

  it('per-channel mode runs and preserves dimensions', () => {
    const img = gradient(16, 16);
    const out = equalizeHistogram(img, 16, 16, true);
    expect(out.length).toBe(img.length);
  });

  it('all output values within [0, 255]', () => {
    const img = gradient(32, 32);
    const out = equalizeHistogram(img, 32, 32);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

// ─── autoContrast ─────────────────────────────────────────────────────────────

describe('autoContrast', () => {
  it('stretches low-contrast image toward full range', () => {
    const w = 100, h = 1;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      const v = 100 + Math.round((x / (w - 1)) * 50); // 100..150
      img[x * 4] = img[x * 4 + 1] = img[x * 4 + 2] = v;
      img[x * 4 + 3] = 255;
    }
    const out = autoContrast(img, w, h, 0.5);
    const after = computeHistogram(out, w, h);
    const s = channelStats(after.luma);
    expect(s.min).toBeLessThan(30);
    expect(s.max).toBeGreaterThan(225);
  });

  it('flat image is returned unchanged', () => {
    const img = solid(8, 8, [128, 128, 128, 255]);
    const out = autoContrast(img, 8, 8);
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('preserves alpha', () => {
    const img = gradient(16, 16);
    for (let i = 3; i < img.length; i += 4) img[i] = 180;
    const out = autoContrast(img, 16, 16);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(180);
  });
});

// ─── meanLuminance ────────────────────────────────────────────────────────────

describe('meanLuminance', () => {
  it('white image → ~255', () => {
    expect(meanLuminance(solid(4, 4, [255, 255, 255, 255]), 4, 4)).toBeCloseTo(255, 4);
  });

  it('black image → 0', () => {
    expect(meanLuminance(solid(4, 4, [0, 0, 0, 255]), 4, 4)).toBe(0);
  });

  it('empty image → 0', () => {
    expect(meanLuminance(new Uint8ClampedArray(0), 0, 0)).toBe(0);
  });

  it('gradient → ~127', () => {
    const m = meanLuminance(gradient(256, 1), 256, 1);
    expect(m).toBeGreaterThan(120);
    expect(m).toBeLessThan(135);
  });
});

// ─── identityLUT ──────────────────────────────────────────────────────────────

describe('identityLUT', () => {
  it('lut[v] === v for all v', () => {
    const lut = identityLUT();
    for (let v = 0; v < 256; v++) expect(lut[v]).toBe(v);
  });

  it('has length 256', () => {
    expect(identityLUT().length).toBe(256);
  });
});
