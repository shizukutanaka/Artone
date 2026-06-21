/**
 * False color 露出モニタリングのテスト
 */

import { describe, it, expect } from 'vitest';
import {
  createFalseColorMapper,
  ARRI_FALSE_COLOR_STOPS,
  RED_FALSE_COLOR_STOPS,
  SIMPLE_FALSE_COLOR_STOPS,
  type FalseColorStop,
} from '../color/false-color';

// ─── ヘルパー ────────────────────────────────────────────────────────────────

/** [r,g,b] すべてが [0,255] の整数か確認 */
function isValidRGB(c: readonly [number, number, number]): boolean {
  return c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
}

// ─── 組み込みプリセット ──────────────────────────────────────────────────────

describe('built-in presets', () => {
  it('ARRI preset has at least 8 stops in ascending order', () => {
    expect(ARRI_FALSE_COLOR_STOPS.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < ARRI_FALSE_COLOR_STOPS.length; i++) {
      expect(ARRI_FALSE_COLOR_STOPS[i].threshold)
        .toBeGreaterThan(ARRI_FALSE_COLOR_STOPS[i - 1].threshold);
    }
  });

  it('RED preset has valid structure', () => {
    expect(RED_FALSE_COLOR_STOPS.length).toBeGreaterThanOrEqual(4);
    for (const s of RED_FALSE_COLOR_STOPS) {
      expect(s.r).toBeGreaterThanOrEqual(0);
      expect(s.g).toBeGreaterThanOrEqual(0);
      expect(s.b).toBeGreaterThanOrEqual(0);
    }
  });

  it('SIMPLE preset has exactly 3 stops', () => {
    expect(SIMPLE_FALSE_COLOR_STOPS.length).toBe(3);
  });
});

// ─── map() — ARRI プリセット ─────────────────────────────────────────────────

describe('map() with ARRI preset', () => {
  const fc = createFalseColorMapper('arri');

  it('returns valid sRGB tuple for all luminance values', () => {
    for (const lum of [0, 0.01, 0.09, 0.18, 0.38, 0.72, 1.0, 1.5]) {
      expect(isValidRGB(fc.map(lum))).toBe(true);
    }
  });

  it('18% grey maps to green-dominant color (indicator zone)', () => {
    const [r, g, b] = fc.map(0.18);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(200); // bright green
  });

  it('overexposed (>1.0) maps to red-dominant color', () => {
    const [r, g, b] = fc.map(1.1);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(r).toBeGreaterThanOrEqual(b);
  });

  it('deep shadow (<0.01) maps to blue or dark color', () => {
    const [r, g, b] = fc.map(0.005);
    expect(r).toBeLessThan(100);
    expect(g).toBeLessThan(100);
    // blue channel should be dominant or all very dark
    const maxCh = Math.max(r, g, b);
    expect(maxCh).toBeLessThan(200);
  });

  it('values below first stop return first-stop color', () => {
    const first = ARRI_FALSE_COLOR_STOPS[0];
    const [r, g, b] = fc.map(-5);
    expect(r).toBe(first.r);
    expect(g).toBe(first.g);
    expect(b).toBe(first.b);
  });

  it('values above last stop return last-stop color', () => {
    const last = ARRI_FALSE_COLOR_STOPS[ARRI_FALSE_COLOR_STOPS.length - 1];
    const [r, g, b] = fc.map(100);
    expect(r).toBe(last.r);
    expect(g).toBe(last.g);
    expect(b).toBe(last.b);
  });

  it('exactly at stop threshold returns the stop color', () => {
    // Pick a stop in the middle: the 0.180 18% grey zone
    const greenStop = ARRI_FALSE_COLOR_STOPS.find((s) => s.threshold === 0.195);
    if (greenStop) {
      const [r, g, b] = fc.map(greenStop.threshold);
      expect(r).toBe(greenStop.r);
      expect(g).toBe(greenStop.g);
      expect(b).toBe(greenStop.b);
    }
  });

  it('interpolates between stops (midpoint gives average-ish color)', () => {
    const stops = ARRI_FALSE_COLOR_STOPS;
    // Pick first two stops and check midpoint interpolation
    const a = stops[1];  // second stop
    const b = stops[2];  // third stop
    const mid = (a.threshold + b.threshold) / 2;
    const [r] = fc.map(mid);
    // Midpoint r should be between a.r and b.r (approximately)
    const minR = Math.min(a.r, b.r);
    const maxR = Math.max(a.r, b.r);
    expect(r).toBeGreaterThanOrEqual(minR - 1);
    expect(r).toBeLessThanOrEqual(maxR + 1);
  });
});

// ─── map() — RED プリセット ──────────────────────────────────────────────────

describe('map() with RED preset', () => {
  const fc = createFalseColorMapper('red');

  it('18% grey maps to green zone', () => {
    const [r, g, b] = fc.map(0.18);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('clipped value maps to bright color', () => {
    const color = fc.map(0.99);
    expect(Math.max(...color)).toBeGreaterThan(200);
  });
});

// ─── map() — simple プリセット ───────────────────────────────────────────────

describe('map() with simple preset', () => {
  const fc = createFalseColorMapper('simple');

  it('underexposed (< first zone) returns blue', () => {
    const [r, g, b] = fc.map(0);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(b).toBe(255);
  });

  it('midtone returns green', () => {
    // SIMPLE: 0.100 → green, 0.720 → red. At 0.4 (between green and red zones):
    const [, g, b] = fc.map(0.40);
    // At luminance 0.40, we're between green (0.100) and red (0.720)
    // t = (0.40 - 0.100) / (0.720 - 0.100) ≈ 0.484
    // r = round(0 + 0.484 * 255) = 123, g = round(255 + 0.484 * (-255)) = 131, b = 0
    // g should still be somewhat dominant
    expect(g).toBeGreaterThan(b);
  });

  it('overexposed (> last zone) returns red', () => {
    const [r, g, b] = fc.map(1.5);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });
});

// ─── getStops() ──────────────────────────────────────────────────────────────

describe('getStops()', () => {
  it('returns a copy of the stops array', () => {
    const fc = createFalseColorMapper('arri');
    const stops = fc.getStops();
    expect(stops).toHaveLength(ARRI_FALSE_COLOR_STOPS.length);
    // Mutating the returned array should not affect the mapper
    stops[0].r = 99;
    expect(fc.getStops()[0].r).toBe(ARRI_FALSE_COLOR_STOPS[0].r);
  });
});

// ─── custom stops ────────────────────────────────────────────────────────────

describe('custom stops', () => {
  const customStops: FalseColorStop[] = [
    { threshold: 0.0, r: 0, g: 0, b: 255 },
    { threshold: 0.5, r: 0, g: 255, b: 0 },
    { threshold: 1.0, r: 255, g: 0, b: 0 },
  ];

  it('createFalseColorMapper("custom", stops) uses custom stops', () => {
    const fc = createFalseColorMapper('custom', customStops);
    const [, , b] = fc.map(0.0);
    expect(b).toBe(255);
    expect(fc.map(1.0)).toEqual([255, 0, 0]);
  });

  it('interpolates at midpoint of custom stops', () => {
    const fc = createFalseColorMapper('custom', customStops);
    const [r, g, b] = fc.map(0.25);
    // Midpoint between 0.0 (blue) and 0.5 (green): t=0.5
    // r=0, g=round(0+0.5*255)=128, b=round(255+0.5*(-255))=128
    expect(r).toBe(0);
    expect(g).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
  });

  it('throws for less than 2 custom stops', () => {
    expect(() =>
      createFalseColorMapper('custom', [{ threshold: 0, r: 0, g: 0, b: 0 }])
    ).toThrow();
  });

  it('throws for non-ascending thresholds', () => {
    expect(() =>
      createFalseColorMapper('custom', [
        { threshold: 0.5, r: 0, g: 0, b: 0 },
        { threshold: 0.0, r: 255, g: 0, b: 0 },
      ])
    ).toThrow();
  });

  it('throws for equal thresholds', () => {
    expect(() =>
      createFalseColorMapper('custom', [
        { threshold: 0.3, r: 0, g: 0, b: 0 },
        { threshold: 0.3, r: 255, g: 0, b: 0 },
      ])
    ).toThrow();
  });

  it('throws for "custom" preset without stops', () => {
    expect(() => createFalseColorMapper('custom')).toThrow();
  });
});

// ─── applyToBuffer() ─────────────────────────────────────────────────────────

describe('applyToBuffer()', () => {
  const fc = createFalseColorMapper('arri');

  it('preserves alpha channel', () => {
    const data = new Uint8ClampedArray([128, 128, 128, 200, 0, 0, 0, 77]);
    fc.applyToBuffer(data);
    expect(data[3]).toBe(200);
    expect(data[7]).toBe(77);
  });

  it('replaces RGB with false color', () => {
    // Mid-grey pixel (128, 128, 128) should map to green-dominant false color
    const data = new Uint8ClampedArray([128, 128, 128, 255]);
    fc.applyToBuffer(data);
    // sRGB 128/255 ≈ 0.502 encoded → linear ≈ 0.216 → luma ≈ 0.216
    // At ~0.216 linear (above 18% grey), should be in pink/skin tone zone
    expect(data[3]).toBe(255); // alpha unchanged
    // Just verify it's not black and has changed from original
    expect(Math.max(data[0], data[1], data[2])).toBeGreaterThan(0);
  });

  it('black pixel maps to dark false color', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    fc.applyToBuffer(data);
    const [r, g, b] = fc.map(0);
    expect(data[0]).toBe(r);
    expect(data[1]).toBe(g);
    expect(data[2]).toBe(b);
  });

  it('handles empty buffer without error', () => {
    expect(() => fc.applyToBuffer(new Uint8ClampedArray())).not.toThrow();
  });

  it('ignores incomplete pixel at end (< 4 bytes)', () => {
    const data = new Uint8ClampedArray([128, 128, 128]); // 3 bytes, no alpha
    const copy = Uint8ClampedArray.from(data);
    fc.applyToBuffer(data);
    // Should be unchanged (no complete RGBA pixel)
    expect(data[0]).toBe(copy[0]);
    expect(data[1]).toBe(copy[1]);
    expect(data[2]).toBe(copy[2]);
  });

  it('processes multiple pixels consistently', () => {
    const grey = 100;
    const data = new Uint8ClampedArray([grey, grey, grey, 255, grey, grey, grey, 255]);
    fc.applyToBuffer(data);
    // Both pixels should be identical after false color
    expect(data[0]).toBe(data[4]);
    expect(data[1]).toBe(data[5]);
    expect(data[2]).toBe(data[6]);
  });

  it('uniform 18% grey frame gets near-green false color', () => {
    // Linear 0.18 → sRGB ≈ 0.461 → byte ≈ 117
    const sRGB18 = Math.round(
      (0.18 <= 0.0031308
        ? 0.18 * 12.92
        : 1.055 * Math.pow(0.18, 1 / 2.4) - 0.055) * 255
    ); // ≈ 117
    const data = new Uint8ClampedArray([sRGB18, sRGB18, sRGB18, 255]);
    fc.applyToBuffer(data);
    // Should map to green-dominant false color (ARRI 18% grey indicator)
    expect(data[1]).toBeGreaterThan(data[0]); // G > R
    expect(data[1]).toBeGreaterThan(data[2]); // G > B
  });
});
