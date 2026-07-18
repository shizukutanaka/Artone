/**
 * Color Science テスト — ACES / sRGB / matrix transforms
 *
 * 標準参照値で行列・転送関数・パイプラインの精度を検証。
 * DOM 不要。
 */

import { describe, it, expect } from 'vitest';
import {
  mat3MulVec,
  mat3Mul,
  SRGB_TO_XYZ_D65,
  XYZ_D65_TO_SRGB,
  AP0_TO_AP1,
  AP1_TO_AP0,
  AP1_TO_SRGB,
  SRGB_TO_AP1,
  sRGBOETF,
  sRGBEOTF,
  acescCOETF,
  acescEOTF,
  acescctOETF,
  acescctEOTF,
  acesHillRRTODT,
  sRGBToACEScg,
  acesCgToSRGB,
  acesRenderPipeline,
  applyColorPipelineToBuffer,
  gamutClip,
} from '../color/color-science';

// ============================================================
// mat3MulVec
// ============================================================

describe('mat3MulVec', () => {
  it('identity matrix leaves vector unchanged', () => {
    const I = [1,0,0, 0,1,0, 0,0,1] as const;
    expect(mat3MulVec(I, 0.5, 0.3, 0.9)).toEqual([0.5, 0.3, 0.9]);
  });

  it('zero matrix produces zero vector', () => {
    const Z = [0,0,0, 0,0,0, 0,0,0] as const;
    const [r,g,b] = mat3MulVec(Z, 1, 2, 3);
    expect(r).toBe(0); expect(g).toBe(0); expect(b).toBe(0);
  });
});

// ============================================================
// mat3Mul — inverse × forward = identity
// ============================================================

describe('mat3Mul — round-trip product ≈ identity', () => {
  function isIdentity(M: readonly number[]): void {
    const I = [1,0,0, 0,1,0, 0,0,1];
    for (let i = 0; i < 9; i++) {
      expect(M[i]).toBeCloseTo(I[i], 4);
    }
  }

  it('SRGB→XYZ × XYZ→SRGB ≈ I', () => {
    isIdentity(mat3Mul(XYZ_D65_TO_SRGB, SRGB_TO_XYZ_D65));
  });

  it('AP0→AP1 × AP1→AP0 ≈ I', () => {
    isIdentity(mat3Mul(AP0_TO_AP1, AP1_TO_AP0));
  });

  it('AP1→SRGB × SRGB→AP1 ≈ I (within 0.01)', () => {
    const product = mat3Mul(AP1_TO_SRGB, SRGB_TO_AP1);
    const I = [1,0,0, 0,1,0, 0,0,1];
    for (let i = 0; i < 9; i++) {
      expect(Math.abs(product[i] - I[i])).toBeLessThan(0.01);
    }
  });
});

// ============================================================
// sRGB OETF / EOTF
// ============================================================

describe('sRGBOETF', () => {
  it('maps 0 → 0', () => {
    expect(sRGBOETF(0)).toBeCloseTo(0, 8);
  });

  it('maps 1 → 1', () => {
    expect(sRGBOETF(1)).toBeCloseTo(1, 6);
  });

  it('linear toe: 0.0031308 → 12.92 × 0.0031308', () => {
    expect(sRGBOETF(0.0031308)).toBeCloseTo(12.92 * 0.0031308, 6);
  });

  it('is monotonically increasing', () => {
    let prev = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      const v = sRGBOETF(x);
      expect(v).toBeGreaterThan(prev - 1e-9);
      prev = v;
    }
  });
});

describe('sRGBEOTF round-trip', () => {
  for (const v of [0, 0.1, 0.25, 0.5, 0.75, 1.0]) {
    it(`sRGBOETF(sRGBEOTF(${v})) ≈ ${v}`, () => {
      expect(sRGBOETF(sRGBEOTF(v))).toBeCloseTo(v, 6);
    });
  }
});

// ============================================================
// ACEScc OETF / EOTF
// ============================================================

describe('acescCOETF / acescEOTF', () => {
  it('round-trip for positive values', () => {
    for (const x of [0.001, 0.1, 0.5, 1.0, 10.0]) {
      expect(acescEOTF(acescCOETF(x))).toBeCloseTo(x, 5);
    }
  });

  it('is monotonically increasing', () => {
    let prev = -Infinity;
    for (let x = 0.0001; x <= 2; x *= 1.5) {
      const v = acescCOETF(x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('1.0 encodes to (log2(1)+9.72)/17.52', () => {
    expect(acescCOETF(1.0)).toBeCloseTo(9.72 / 17.52, 6);
  });

  it('REGRESSION: non-positive linear encodes to the ACEScc black constant (S-2014-006)', () => {
    // Per Academy S-2014-006, lin ≤ 0 → (log2(2^-16) + 9.72) / 17.52 =
    // -0.358447…, the standard ACEScc black code. The old x ≤ 0 branch put a
    // second -16 where the +9.72 offset belongs and returned -1.8265, which is
    // off the valid range AND discontinuous with the toe branch. Guard both
    // the value and continuity so a future edit can't silently break either.
    const black = (Math.log2(Math.pow(2, -16)) + 9.72) / 17.52; // -0.358447…
    expect(acescCOETF(0)).toBeCloseTo(black, 9);
    expect(acescCOETF(-1)).toBeCloseTo(black, 9);
    // Continuous with the x→0⁺ limit of the toe branch and round-trips to 0.
    expect(acescCOETF(0)).toBeCloseTo(acescCOETF(Number.MIN_VALUE), 9);
    expect(acescEOTF(acescCOETF(0))).toBeCloseTo(0, 9);
  });
});

// ============================================================
// ACEScct OETF / EOTF
// ============================================================

describe('acescctOETF / acescctEOTF', () => {
  it('round-trip for values above cut', () => {
    for (const x of [0.05, 0.1, 0.5, 1.0]) {
      expect(acescctEOTF(acescctOETF(x))).toBeCloseTo(x, 5);
    }
  });

  it('linear toe below cut is round-trip consistent', () => {
    const x = 0.001;
    expect(acescctEOTF(acescctOETF(x))).toBeCloseTo(x, 8);
  });

  it('is monotonically increasing', () => {
    let prev = -Infinity;
    for (let x = 0.0001; x <= 2; x *= 2) {
      const v = acescctOETF(x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

// ============================================================
// sRGB → XYZ — reference values
// ============================================================

describe('sRGB → XYZ (D65)', () => {
  it('white (1,1,1) → approx D65 white point', () => {
    const [x, y, z] = mat3MulVec(SRGB_TO_XYZ_D65, 1, 1, 1);
    expect(x).toBeCloseTo(0.9505, 3);
    expect(y).toBeCloseTo(1.0000, 3);
    expect(z).toBeCloseTo(1.0888, 3);
  });

  it('black (0,0,0) → (0,0,0)', () => {
    const [x, y, z] = mat3MulVec(SRGB_TO_XYZ_D65, 0, 0, 0);
    expect(x).toBe(0); expect(y).toBe(0); expect(z).toBe(0);
  });

  it('red (1,0,0) → Y ≈ 0.2126 (Rec.709 luminance)', () => {
    const [, y] = mat3MulVec(SRGB_TO_XYZ_D65, 1, 0, 0);
    expect(y).toBeCloseTo(0.2126, 3);
  });

  it('green (0,1,0) → Y ≈ 0.7152', () => {
    const [, y] = mat3MulVec(SRGB_TO_XYZ_D65, 0, 1, 0);
    expect(y).toBeCloseTo(0.7152, 3);
  });

  it('blue (0,0,1) → Y ≈ 0.0722', () => {
    const [, y] = mat3MulVec(SRGB_TO_XYZ_D65, 0, 0, 1);
    expect(y).toBeCloseTo(0.0722, 3);
  });
});

// ============================================================
// sRGBToACEScg / acesCgToSRGB round-trip
// ============================================================

describe('sRGBToACEScg / acesCgToSRGB', () => {
  it('encodes white (1,1,1) to approximately (1,1,1) in ACEScg', () => {
    const [r, g, b] = sRGBToACEScg(1, 1, 1);
    // D65 and D60 white are close but not identical
    expect(r).toBeCloseTo(1, 0);
    expect(g).toBeCloseTo(1, 0);
    expect(b).toBeCloseTo(1, 0);
  });

  it('round-trips grey values through ACEScg space', () => {
    for (const v of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const encoded = sRGBOETF(v); // go to encoded first
      const [r, g, b] = sRGBToACEScg(encoded, encoded, encoded);
      const [er, eg, eb] = acesCgToSRGB(r, g, b);
      expect(er).toBeCloseTo(encoded, 2);
      expect(eg).toBeCloseTo(encoded, 2);
      expect(eb).toBeCloseTo(encoded, 2);
    }
  });
});

// ============================================================
// acesHillRRTODT — tone mapping
// ============================================================

describe('acesHillRRTODT', () => {
  it('maps (0,0,0) to approximately (0,0,0)', () => {
    const [r, g, b] = acesHillRRTODT(0, 0, 0);
    expect(r).toBeCloseTo(0, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('maps positive values to [0,1] range', () => {
    for (const v of [0.5, 1.0, 5.0, 10.0, 100.0]) {
      const [r, g, b] = acesHillRRTODT(v, v, v);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });

  it('is monotonically increasing for equal-channel input', () => {
    let prev = -1;
    for (let v = 0; v <= 10; v += 0.1) {
      const [r] = acesHillRRTODT(v, v, v);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
  });

  it('saturates asymptotically below 1.0 at very high exposures', () => {
    const [r] = acesHillRRTODT(1000, 1000, 1000);
    expect(r).toBeLessThanOrEqual(1.0);
    expect(r).toBeGreaterThan(0.9);
  });

  it('handles negative inputs (clips to 0)', () => {
    const [r, g, b] = acesHillRRTODT(-1, -0.5, -0.1);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });
});

// ============================================================
// gamutClip
// ============================================================

describe('gamutClip', () => {
  it('clamps negative values to 0', () => {
    expect(gamutClip(-0.5, 0.5, -0.1)).toEqual([0, 0.5, 0]);
  });

  it('passes through non-negative values unchanged', () => {
    expect(gamutClip(0.5, 0.7, 0.9)).toEqual([0.5, 0.7, 0.9]);
  });
});

// ============================================================
// acesRenderPipeline — end-to-end
// ============================================================

describe('acesRenderPipeline', () => {
  it('maps (0,0,0) to near black', () => {
    const [r, g, b] = acesRenderPipeline(0, 0, 0);
    expect(r).toBeLessThan(0.1);
    expect(g).toBeLessThan(0.1);
    expect(b).toBeLessThan(0.1);
  });

  it('maps (1,1,1) to near white', () => {
    const [r, g, b] = acesRenderPipeline(1, 1, 1);
    expect(r).toBeGreaterThan(0.9);
    expect(g).toBeGreaterThan(0.9);
    expect(b).toBeGreaterThan(0.9);
  });

  it('output is always in [0,1]', () => {
    for (const [sr, sg, sb] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5]]) {
      const [r, g, b] = acesRenderPipeline(sr, sg, sb);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================
// applyColorPipelineToBuffer
// ============================================================

describe('applyColorPipelineToBuffer', () => {
  it('applies identity transform without changing pixel values', () => {
    const data = new Uint8ClampedArray([128, 64, 32, 255, 200, 100, 50, 200]);
    const copy = new Uint8ClampedArray(data);
    applyColorPipelineToBuffer(data, (r, g, b) => [r, g, b]);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(copy[i]);
      expect(data[i+1]).toBe(copy[i+1]);
      expect(data[i+2]).toBe(copy[i+2]);
      expect(data[i+3]).toBe(copy[i+3]); // alpha unchanged
    }
  });

  it('applies ACES render pipeline to a pixel buffer', () => {
    const data = new Uint8ClampedArray([255, 128, 64, 255]);
    applyColorPipelineToBuffer(data, (r, g, b) => acesRenderPipeline(r, g, b));
    // Output should be valid pixel values
    expect(data[0]).toBeGreaterThanOrEqual(0);
    expect(data[0]).toBeLessThanOrEqual(255);
    expect(data[3]).toBe(255); // alpha preserved
  });
});
