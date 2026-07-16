/**
 * LUT trilinear interpolation + tone curve (Fritsch-Carlson monotone cubic) テスト
 *
 * color/lut-apply.ts の純粋 TypeScript 実装を DOM なしで検証。
 */

import { describe, it, expect } from 'vitest';
import {
  sampleLUT,
  applyLUTToBuffer,
  buildCurve,
  applyCurvesToBuffer,
  parseCubeLUT,
  type LUTData,
  type CurvePoint,
} from '../color/lut-apply';

// ============================================================
// Helper: build a minimal LUT (N=2 — identity or simple shift)
// ============================================================

/** Creates a 2×2×2 identity LUT. */
function identityLUT2(): LUTData {
  // 8 entries: corners of the unit cube → same corner (identity)
  const data = new Float32Array([
    0, 0, 0,   // (0,0,0)
    1, 0, 0,   // (1,0,0)
    0, 1, 0,   // (0,1,0)
    1, 1, 0,   // (1,1,0)
    0, 0, 1,   // (0,0,1)
    1, 0, 1,   // (1,0,1)
    0, 1, 1,   // (0,1,1)
    1, 1, 1,   // (1,1,1)
  ]);
  return { name: 'identity', size: 2, data };
}

/** Creates a 2×2×2 LUT that maps all input to (0.5, 0.5, 0.5). */
function grayLUT2(): LUTData {
  const data = new Float32Array(8 * 3).fill(0.5);
  return { name: 'gray', size: 2, data };
}

// ============================================================
// sampleLUT — trilinear interpolation
// ============================================================

describe('sampleLUT — identity LUT', () => {
  const lut = identityLUT2();

  it('returns (0,0,0) for black', () => {
    const [r, g, b] = sampleLUT(lut, 0, 0, 0);
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
  });

  it('returns (1,1,1) for white', () => {
    const [r, g, b] = sampleLUT(lut, 1, 1, 1);
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(1);
    expect(b).toBeCloseTo(1);
  });

  it('interpolates to (0.5,0,0) for red=0.5', () => {
    const [r, g, b] = sampleLUT(lut, 0.5, 0, 0);
    expect(r).toBeCloseTo(0.5, 4);
    expect(g).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
  });

  it('interpolates mid-grey correctly', () => {
    const [r, g, b] = sampleLUT(lut, 0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.5, 4);
    expect(g).toBeCloseTo(0.5, 4);
    expect(b).toBeCloseTo(0.5, 4);
  });

  it('clamps inputs below 0', () => {
    const [r, g, b] = sampleLUT(lut, -0.5, 0, 0);
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
  });

  it('clamps inputs above 1', () => {
    const [r, g, b] = sampleLUT(lut, 1.5, 1, 1);
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(1);
    expect(b).toBeCloseTo(1);
  });
});

describe('sampleLUT — gray LUT', () => {
  const lut = grayLUT2();

  it('maps any colour to (0.5, 0.5, 0.5)', () => {
    for (const [r, g, b] of [[0, 0, 0], [1, 0, 0], [0.3, 0.7, 0.2]] as [number, number, number][]) {
      const [or, og, ob] = sampleLUT(lut, r, g, b);
      expect(or).toBeCloseTo(0.5, 4);
      expect(og).toBeCloseTo(0.5, 4);
      expect(ob).toBeCloseTo(0.5, 4);
    }
  });
});

describe('sampleLUT — size-1 edge case', () => {
  it('returns input unchanged for size < 2', () => {
    const tiny: LUTData = { name: 'tiny', size: 1, data: new Float32Array([0.8, 0.2, 0.6]) };
    expect(sampleLUT(tiny, 0.3, 0.5, 0.7)).toEqual([0.3, 0.5, 0.7]);
  });
});

// ============================================================
// applyLUTToBuffer
// ============================================================

describe('applyLUTToBuffer', () => {
  it('passes pixels through an identity LUT unchanged', () => {
    const data = new Uint8ClampedArray([128, 64, 32, 255,  200, 100, 50, 200]);
    const copy = new Uint8ClampedArray(data);
    applyLUTToBuffer(data, identityLUT2());
    // Trilinear identity has rounding, allow ±1 LSB
    for (let i = 0; i < data.length; i += 4) {
      expect(Math.abs(data[i]     - copy[i]))    .toBeLessThanOrEqual(1);
      expect(Math.abs(data[i + 1] - copy[i + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(data[i + 2] - copy[i + 2])).toBeLessThanOrEqual(1);
      expect(data[i + 3]).toBe(copy[i + 3]); // alpha unchanged
    }
  });

  it('maps all pixels to grey via gray LUT', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255,  0, 255, 0, 128]);
    applyLUTToBuffer(data, grayLUT2());
    expect(data[0]).toBe(128);
    expect(data[1]).toBe(128);
    expect(data[2]).toBe(128);
    expect(data[3]).toBe(255); // alpha unchanged
    expect(data[4]).toBe(128);
    expect(data[5]).toBe(128);
    expect(data[6]).toBe(128);
    expect(data[7]).toBe(128); // alpha unchanged
  });
});

// ============================================================
// buildCurve — monotone cubic spline
// ============================================================

describe('buildCurve — edge cases', () => {
  it('returns x unchanged for empty points', () => {
    const f = buildCurve([]);
    expect(f(0.5)).toBe(0.5);
  });

  it('returns constant for single point', () => {
    const f = buildCurve([{ x: 0.5, y: 0.8 }]);
    expect(f(0.0)).toBe(0.8);
    expect(f(1.0)).toBe(0.8);
  });

  it('clamps below first point', () => {
    const f = buildCurve([{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }]);
    expect(f(0.0)).toBe(0.1);
  });

  it('clamps above last point', () => {
    const f = buildCurve([{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }]);
    expect(f(1.0)).toBe(0.9);
  });
});

describe('buildCurve — identity', () => {
  const id: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const f = buildCurve(id);

  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    it(`maps ${v} → ${v} for identity curve`, () => {
      expect(f(v)).toBeCloseTo(v, 4);
    });
  }
});

describe('buildCurve — S-curve (contrast)', () => {
  const sCurve: CurvePoint[] = [
    { x: 0,    y: 0    },
    { x: 0.25, y: 0.18 },
    { x: 0.5,  y: 0.5  },
    { x: 0.75, y: 0.82 },
    { x: 1,    y: 1    },
  ];
  const f = buildCurve(sCurve);

  it('is symmetric about (0.5, 0.5)', () => {
    expect(f(0.5)).toBeCloseTo(0.5, 3);
  });

  it('produces darker shadows (< 0.5 input → lower than linear)', () => {
    expect(f(0.25)).toBeLessThan(0.25);
  });

  it('produces brighter highlights (> 0.5 input → higher than linear)', () => {
    expect(f(0.75)).toBeGreaterThan(0.75);
  });

  it('is monotonically increasing', () => {
    let prev = f(0);
    for (let x = 0.01; x <= 1; x += 0.01) {
      const cur = f(x);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });
});

describe('buildCurve — flat region (monotonicity)', () => {
  const flat: CurvePoint[] = [
    { x: 0,   y: 0   },
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 }, // flat plateau
    { x: 1.0, y: 1.0 },
  ];
  const f = buildCurve(flat);

  it('does not decrease in the flat region', () => {
    for (let x = 0.3; x <= 0.7; x += 0.02) {
      expect(f(x)).toBeGreaterThanOrEqual(0.28);
      expect(f(x)).toBeLessThanOrEqual(0.32);
    }
  });
});

// ============================================================
// applyCurvesToBuffer
// ============================================================

describe('applyCurvesToBuffer', () => {
  const identity = (x: number) => x;

  it('leaves pixels unchanged with all-identity curves', () => {
    const data = new Uint8ClampedArray([100, 150, 200, 255]);
    const copy = new Uint8ClampedArray(data);
    applyCurvesToBuffer(data, { master: identity, red: identity, green: identity, blue: identity });
    expect(data[0]).toBe(copy[0]);
    expect(data[1]).toBe(copy[1]);
    expect(data[2]).toBe(copy[2]);
    expect(data[3]).toBe(copy[3]);
  });

  it('applies a master lift (shift all channels up)', () => {
    // master curve: y = x + 0.1 (clamped)
    const lift = (x: number) => Math.min(1, x + 0.1);
    const data = new Uint8ClampedArray([100, 100, 100, 255]);
    applyCurvesToBuffer(data, { master: lift, red: identity, green: identity, blue: identity });
    // 100/255 ≈ 0.392 → 0.492 → ≈ 125
    expect(data[0]).toBeGreaterThan(100);
    expect(data[1]).toBeGreaterThan(100);
    expect(data[2]).toBeGreaterThan(100);
  });

  it('applies per-channel red boost independently', () => {
    const redBoost = (x: number) => Math.min(1, x + 0.2);
    const data = new Uint8ClampedArray([100, 100, 100, 255]);
    applyCurvesToBuffer(data, { master: identity, red: redBoost, green: identity, blue: identity });
    expect(data[0]).toBeGreaterThan(data[1]);
    expect(data[1]).toBe(100);
    expect(data[2]).toBe(100);
  });

  it('preserves alpha channel', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 128]);
    applyCurvesToBuffer(data, { master: (x) => 1 - x, red: identity, green: identity, blue: identity });
    expect(data[3]).toBe(128);
  });
});

// ============================================================
// parseCubeLUT
// ============================================================

describe('parseCubeLUT', () => {
  function minimalCube(size: number): string {
    const n3 = size ** 3;
    const lines = [
      `TITLE "TestLUT"`,
      `LUT_3D_SIZE ${size}`,
      '',
    ];
    for (let i = 0; i < n3; i++) {
      const v = i / (n3 - 1);
      lines.push(`${v.toFixed(6)} ${v.toFixed(6)} ${v.toFixed(6)}`);
    }
    return lines.join('\n');
  }

  it('parses a minimal 2-point .cube file', () => {
    const lut = parseCubeLUT(minimalCube(2));
    expect(lut.size).toBe(2);
    expect(lut.name).toBe('TestLUT');
    expect(lut.data.length).toBe(2 ** 3 * 3);
  });

  it('parses a 4-point .cube file', () => {
    const lut = parseCubeLUT(minimalCube(4));
    expect(lut.size).toBe(4);
    expect(lut.data.length).toBe(4 ** 3 * 3);
  });

  it('ignores comment lines starting with #', () => {
    const text = [
      '# This is a comment',
      'LUT_3D_SIZE 2',
      '# another comment',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '1 1 0',
      '0 0 1',
      '1 0 1',
      '0 1 1',
      '1 1 1',
    ].join('\n');
    const lut = parseCubeLUT(text);
    expect(lut.size).toBe(2);
    expect(lut.data.length).toBe(24);
  });

  it('throws if LUT_3D_SIZE is missing', () => {
    expect(() => parseCubeLUT('0 0 0\n1 1 1')).toThrow('LUT_3D_SIZE');
  });

  it('throws if data is too short', () => {
    expect(() => parseCubeLUT('LUT_3D_SIZE 4\n0 0 0')).toThrow('too short');
  });
});

// ============================================================
// Zero-allocation trilinear refactor — equivalence with reference
// ============================================================

/** Independent reference: the original array-allocating trilinear math. */
function refSampleLUT(lut: LUTData, r: number, g: number, b: number): [number, number, number] {
  const N = lut.size;
  if (N < 2) return [r, g, b];
  const scale = N - 1;
  const ri = Math.min(Math.max(r * scale, 0), scale);
  const gi = Math.min(Math.max(g * scale, 0), scale);
  const bi = Math.min(Math.max(b * scale, 0), scale);
  const r0 = Math.floor(ri), g0 = Math.floor(gi), b0 = Math.floor(bi);
  const r1 = Math.min(r0 + 1, scale), g1 = Math.min(g0 + 1, scale), b1 = Math.min(b0 + 1, scale);
  const dr = ri - r0, dg = gi - g0, db = bi - b0;
  const at = (rr: number, gg: number, bb: number): [number, number, number] => {
    const idx = (bb * N * N + gg * N + rr) * 3;
    return [lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]];
  };
  const lerp = (a: number[], c: number[], t: number): [number, number, number] =>
    [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  const c00 = lerp(at(r0, g0, b0), at(r1, g0, b0), dr);
  const c10 = lerp(at(r0, g1, b0), at(r1, g1, b0), dr);
  const c01 = lerp(at(r0, g0, b1), at(r1, g0, b1), dr);
  const c11 = lerp(at(r0, g1, b1), at(r1, g1, b1), dr);
  const c0 = lerp(c00, c10, dg);
  const c1 = lerp(c01, c11, dg);
  return lerp(c0, c1, db);
}

/** Build an N³ LUT from a deterministic per-coordinate function. */
function makeLUT(N: number, fn: (r: number, g: number, b: number) => [number, number, number]): LUTData {
  const data = new Float32Array(N * N * N * 3);
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const idx = (b * N * N + g * N + r) * 3;
        const [vr, vg, vb] = fn(r / (N - 1), g / (N - 1), b / (N - 1));
        data[idx] = vr; data[idx + 1] = vg; data[idx + 2] = vb;
      }
    }
  }
  return { name: `lut${N}`, size: N, data };
}

describe('sampleLUT — zero-alloc core matches reference', () => {
  it('is bit-identical to the array-allocating reference over randomized inputs', () => {
    let seed = 424242;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    // A non-trivial LUT (gamma-ish per channel + cross-channel mix) at several sizes.
    for (const N of [2, 3, 5, 17, 33]) {
      const lut = makeLUT(N, (r, g, b) => [
        Math.pow(r, 0.9),
        Math.min(1, g * 0.8 + b * 0.2),
        Math.min(1, b * 0.7 + r * 0.1),
      ]);
      for (let k = 0; k < 400; k++) {
        const r = rng(), g = rng(), b = rng();
        const got = sampleLUT(lut, r, g, b);
        const ref = refSampleLUT(lut, r, g, b);
        // Exact equality: identical float operations in identical order.
        expect(got[0]).toBe(ref[0]);
        expect(got[1]).toBe(ref[1]);
        expect(got[2]).toBe(ref[2]);
      }
    }
  });

  it('applyLUTToBuffer reuses one scratch tuple yet matches per-pixel sampleLUT', () => {
    const lut = makeLUT(9, (r, g, b) => [g, b, r]); // channel swap
    const px = new Uint8ClampedArray([10, 20, 30, 255, 200, 100, 50, 128]);
    const expected = new Uint8ClampedArray(px);
    for (let i = 0; i < expected.length; i += 4) {
      const [or, og, ob] = sampleLUT(lut, expected[i] / 255, expected[i + 1] / 255, expected[i + 2] / 255);
      expected[i] = Math.round(Math.max(0, Math.min(1, or)) * 255);
      expected[i + 1] = Math.round(Math.max(0, Math.min(1, og)) * 255);
      expected[i + 2] = Math.round(Math.max(0, Math.min(1, ob)) * 255);
    }
    applyLUTToBuffer(px, lut);
    expect(Array.from(px)).toEqual(Array.from(expected));
  });
});
