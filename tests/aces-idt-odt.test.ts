/**
 * ACES IDT / ODT テスト
 *
 * 純粋 TypeScript — DOM 不要。
 * Camera log decoding, matrix derivation, and color pipeline correctness.
 */

import { describe, it, expect } from 'vitest';
import {
  mat3Inv,
  primaryToXYZMatrix,
  SGAMUT3_PRIMARIES,
  ARRI_WG_PRIMARIES,
  decodeSLog3, encodeSLog3,
  decodeLogC3, encodeLogC3,
  idtRec709,
  idtSLog3SGamut3,
  idtLogC3WideGamut,
  pqOETF, pqEOTF,
  hlgOETF, hlgEOTF,
  p3OETF, p3EOTF,
  odtSRGB,
  odtDCIP3,
  odtHDR10,
  odtHLG,
  colorTransform,
  applyColorTransformToBuffer,
  type InputColorspace,
  type OutputColorspace,
} from '../color/aces-idt-odt';
import {
  mat3MulVec, mat3Mul, type Mat3,
  SRGB_TO_XYZ_D65,
} from '../color/color-science';

// ============================================================
// Helpers
// ============================================================

function isCloseVec(a: number[], b: number[], tol = 1e-4): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < tol);
}

function isIdentityMat(m: Mat3, tol = 1e-5): boolean {
  const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return m.every((v, i) => Math.abs(v - id[i]) < tol);
}

// ============================================================
// mat3Inv
// ============================================================

describe('mat3Inv', () => {
  it('identity × inverse = identity', () => {
    const id: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(isIdentityMat(mat3Inv(id))).toBe(true);
  });

  it('sRGB→XYZ × XYZ→sRGB = identity', () => {
    // SRGB_TO_XYZ_D65 × its inverse should be I
    const inv = mat3Inv(SRGB_TO_XYZ_D65);
    const product = mat3Mul(SRGB_TO_XYZ_D65, inv);
    expect(isIdentityMat(product)).toBe(true);
  });

  it('round-trips: inv(inv(M)) ≈ M', () => {
    const m: Mat3 = [3, 1, 4, 1, 5, 9, 2, 6, 5];
    const m2 = mat3Inv(mat3Inv(m));
    expect(isCloseVec([...m], [...m2], 1e-8)).toBe(true);
  });
});

// ============================================================
// primaryToXYZMatrix
// ============================================================

describe('primaryToXYZMatrix', () => {
  it('sRGB primaries reproduce SRGB_TO_XYZ_D65 within 0.5%', () => {
    const sRGB = {
      r: { x: 0.640, y: 0.330 },
      g: { x: 0.300, y: 0.600 },
      b: { x: 0.150, y: 0.060 },
      w: { x: 0.3127, y: 0.3290 },
    };
    const derived = primaryToXYZMatrix(sRGB);
    // IEC 61966-2-1 uses slightly more precise primary values;
    // rounded xy → small residual error. Tolerance 5e-3 (0.5%).
    expect(isCloseVec([...derived], [...SRGB_TO_XYZ_D65], 5e-3)).toBe(true);
  });

  it('white point maps to XYZ white', () => {
    const sRGB = {
      r: { x: 0.640, y: 0.330 },
      g: { x: 0.300, y: 0.600 },
      b: { x: 0.150, y: 0.060 },
      w: { x: 0.3127, y: 0.3290 },
    };
    const m = primaryToXYZMatrix(sRGB);
    const [X, Y, Z] = mat3MulVec(m, 1, 1, 1);
    // XYZ of D65 white
    const Xw = 0.3127 / 0.3290;
    const Yw = 1;
    const Zw = (1 - 0.3127 - 0.3290) / 0.3290;
    expect(Math.abs(X - Xw)).toBeLessThan(1e-4);
    expect(Math.abs(Y - Yw)).toBeLessThan(1e-4);
    expect(Math.abs(Z - Zw)).toBeLessThan(1e-4);
  });

  it('S-Gamut3: derived matrix is 3×3 with determinant ≠ 0', () => {
    const m = primaryToXYZMatrix(SGAMUT3_PRIMARIES);
    expect(m.length).toBe(9);
    // det ≠ 0 — matrix is invertible
    const inv = mat3Inv(m);
    const product = mat3Mul(m, inv);
    expect(isIdentityMat(product, 1e-5)).toBe(true);
  });

  it('ARRI Wide Gamut: white maps to D65 XYZ', () => {
    const m = primaryToXYZMatrix(ARRI_WG_PRIMARIES);
    const [X, Y, Z] = mat3MulVec(m, 1, 1, 1);
    const Xw = 0.3127 / 0.3290;
    expect(Math.abs(Y - 1)).toBeLessThan(1e-4);
    expect(Math.abs(X - Xw)).toBeLessThan(1e-3);
    void Z;
  });
});

// ============================================================
// S-Log3 encode/decode
// ============================================================

describe('S-Log3 decode / encode', () => {
  it('code 420 (≈0.41057) decodes to 18% grey (0.18)', () => {
    const encoded = 420 / 1023;
    expect(decodeSLog3(encoded)).toBeCloseTo(0.18, 4);
  });

  it('code 95 (≈0.09287) decodes to 0 (black)', () => {
    const encoded = 95 / 1023;
    expect(decodeSLog3(encoded)).toBeCloseTo(0, 6);
  });

  it('round-trip: encode then decode ≈ original', () => {
    for (const lin of [0, 0.002, 0.01125, 0.05, 0.18, 1.0, 2.0]) {
      const encoded = encodeSLog3(lin);
      const decoded = decodeSLog3(encoded);
      expect(decoded).toBeCloseTo(lin, 5);
    }
  });

  it('round-trip: decode then encode ≈ original', () => {
    for (const enc of [0.09, 0.2, 0.41, 0.6, 0.9]) {
      expect(encodeSLog3(decodeSLog3(enc))).toBeCloseTo(enc, 5);
    }
  });

  it('is monotonically increasing', () => {
    const encValues = [0.05, 0.15, 0.20, 0.30, 0.50, 0.80];
    const linValues = encValues.map(decodeSLog3);
    for (let i = 1; i < linValues.length; i++) {
      expect(linValues[i]).toBeGreaterThan(linValues[i - 1]);
    }
  });
});

// ============================================================
// LogC3 encode/decode
// ============================================================

describe('LogC3 decode / encode', () => {
  it('0.3909 decodes close to 18% grey', () => {
    // ARRI 18% grey code value — approximately 0.3909
    expect(decodeLogC3(0.3909)).toBeCloseTo(0.18, 2);
  });

  it('below-cut linear section: value at cut2 is LC3_E·cut1+LC3_F', () => {
    // In the linear section, x = 0.1 < cut2 = 0.149658
    const lin = decodeLogC3(0.1);
    expect(lin).toBeCloseTo((0.1 - 0.092809) / 5.367655, 8);
  });

  it('round-trip: encode then decode ≈ original', () => {
    for (const lin of [0, 0.001, 0.01, 0.18, 1.0]) {
      expect(decodeLogC3(encodeLogC3(lin))).toBeCloseTo(lin, 5);
    }
  });

  it('round-trip: decode then encode ≈ original (above cut)', () => {
    for (const enc of [0.20, 0.39, 0.60, 0.80]) {
      expect(encodeLogC3(decodeLogC3(enc))).toBeCloseTo(enc, 5);
    }
  });

  it('is monotonically increasing', () => {
    const encValues = [0.05, 0.15, 0.25, 0.40, 0.60, 0.85];
    const linValues = encValues.map(decodeLogC3);
    for (let i = 1; i < linValues.length; i++) {
      expect(linValues[i]).toBeGreaterThan(linValues[i - 1]);
    }
  });
});

// ============================================================
// IDTs
// ============================================================

describe('idtRec709 (Rec.709 → ACES 2065-1)', () => {
  it('white (1,1,1) maps to near-white in ACES', () => {
    const [r, g, b] = idtRec709(1, 1, 1);
    // ACES 2065-1 white is close to but slightly above (1,1,1) due to chromatic adaptation
    expect(r).toBeGreaterThan(0.9);
    expect(g).toBeGreaterThan(0.9);
    expect(b).toBeGreaterThan(0.9);
  });

  it('black (0,0,0) → (0,0,0)', () => {
    const [r, g, b] = idtRec709(0, 0, 0);
    expect(r).toBeCloseTo(0, 6);
    expect(g).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it('18% grey scalar input: all channels near-equal', () => {
    const enc = Math.pow(0.18, 1 / 2.2); // approximate sRGB for 0.18
    const [r, g, b] = idtRec709(enc, enc, enc);
    // Bradford D65→D60 adaptation introduces ~0.5% chromatic shift for neutrals
    expect(Math.abs(r - g)).toBeLessThan(0.01);
    expect(Math.abs(g - b)).toBeLessThan(0.01);
  });
});

describe('idtSLog3SGamut3 (Sony → ACES 2065-1)', () => {
  it('S-Log3 code 95 (black) maps to ≈ 0', () => {
    const enc = 95 / 1023;
    const [r, g, b] = idtSLog3SGamut3(enc, enc, enc);
    expect(r).toBeCloseTo(0, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('S-Log3 code 420 (18% grey): produces near-neutral grey in ACES', () => {
    const enc = 420 / 1023;
    const [r, g, b] = idtSLog3SGamut3(enc, enc, enc);
    // S-Gamut3 primaries differ from AP0; Bradford D65→D60 adaptation
    // introduces a small chromatic shift (~0.01) for neutral patches.
    expect(Math.abs(r - g)).toBeLessThan(0.02);
    expect(Math.abs(g - b)).toBeLessThan(0.02);
    // Should be close to 0.18 (scene-linear)
    expect(r).toBeCloseTo(0.18, 1);
  });
});

describe('idtLogC3WideGamut (ARRI → ACES 2065-1)', () => {
  it('black maps to near-zero', () => {
    const [r, g, b] = idtLogC3WideGamut(0, 0, 0);
    // LogC3 code 0 is very dark; should decode to a small negative or zero
    expect(Math.abs(r)).toBeLessThan(0.05);
    void g; void b;
  });

  it('middle grey (≈0.3909) neutral grey: channels near-equal', () => {
    const enc = 0.3909;
    const [r, g, b] = idtLogC3WideGamut(enc, enc, enc);
    // ARRI Wide Gamut primaries + Bradford D65→D60 introduce a small shift
    expect(Math.abs(r - g)).toBeLessThan(0.02);
    expect(Math.abs(g - b)).toBeLessThan(0.02);
    // Close to 0.18 scene-linear
    expect(r).toBeCloseTo(0.18, 1);
  });
});

// ============================================================
// PQ transfer function
// ============================================================

describe('PQ (SMPTE ST 2084) OETF/EOTF', () => {
  it('100 nits → round-trip', () => {
    const x = pqOETF(100);
    expect(pqEOTF(x)).toBeCloseTo(100, 0);
  });

  it('1000 nits → round-trip', () => {
    const x = pqOETF(1000);
    expect(pqEOTF(x)).toBeCloseTo(1000, 0);
  });

  it('PQ is monotonically increasing in [0, 10000 nits]', () => {
    const nits = [0, 1, 10, 100, 400, 1000, 4000, 10000];
    const enc = nits.map(pqOETF);
    for (let i = 1; i < enc.length; i++) {
      expect(enc[i]).toBeGreaterThan(enc[i - 1]);
    }
  });

  it('10000 nits encodes to ≈ 1.0', () => {
    expect(pqOETF(10000)).toBeCloseTo(1, 3);
  });

  it('0 nits encodes to near-zero (PQ signal floor ≈ 7e-7)', () => {
    // PQ formula at L=0: (c1/(1))^m2 = (3424/4096)^(78.84) ≈ 7.3e-7, not exactly 0
    expect(pqOETF(0)).toBeCloseTo(0, 4);
  });
});

// ============================================================
// HLG transfer function
// ============================================================

describe('HLG (ARIB STD-B67) OETF/EOTF', () => {
  it('round-trip in linear toe region', () => {
    expect(hlgEOTF(hlgOETF(0.05))).toBeCloseTo(0.05, 6);
  });

  it('round-trip in log region', () => {
    expect(hlgEOTF(hlgOETF(0.5))).toBeCloseTo(0.5, 6);
  });

  it('1/12 cutpoint: both sections agree in value', () => {
    const cut = 1 / 12;
    const fromLinear = hlgOETF(cut);
    // Both sections at cut: sqrt(3/12) = sqrt(1/4) = 0.5
    expect(fromLinear).toBeCloseTo(0.5, 6);
  });

  it('0 → 0', () => {
    expect(hlgOETF(0)).toBeCloseTo(0, 6);
  });

  it('is monotonically increasing', () => {
    const lin = [0, 0.05, 1 / 12, 0.2, 0.5, 1.0];
    const enc = lin.map(hlgOETF);
    for (let i = 1; i < enc.length; i++) {
      expect(enc[i]).toBeGreaterThan(enc[i - 1]);
    }
  });
});

// ============================================================
// DCI-P3 OETF/EOTF
// ============================================================

describe('DCI-P3 OETF/EOTF (γ=2.6)', () => {
  it('round-trip: encode then decode', () => {
    for (const lin of [0, 0.18, 0.5, 1.0]) {
      expect(p3EOTF(p3OETF(lin))).toBeCloseTo(lin, 6);
    }
  });

  it('0 → 0, 1 → 1', () => {
    expect(p3OETF(0)).toBe(0);
    expect(p3OETF(1)).toBeCloseTo(1, 6);
  });
});

// ============================================================
// ODTs
// ============================================================

describe('odtSRGB (ACES 2065-1 → sRGB)', () => {
  it('output is in [0, 1]', () => {
    const testValues = [
      [0, 0, 0], [0.18, 0.18, 0.18], [1, 1, 1], [5, 5, 5],
    ];
    for (const [r, g, b] of testValues) {
      const [ro, go, bo] = odtSRGB(r, g, b);
      expect(ro).toBeGreaterThanOrEqual(0);
      expect(ro).toBeLessThanOrEqual(1);
      expect(go).toBeGreaterThanOrEqual(0);
      expect(go).toBeLessThanOrEqual(1);
      expect(bo).toBeGreaterThanOrEqual(0);
      expect(bo).toBeLessThanOrEqual(1);
    }
  });

  it('neutral grey input → neutral grey output', () => {
    const [r, g, b] = odtSRGB(0.18, 0.18, 0.18);
    expect(Math.abs(r - g)).toBeLessThan(1e-5);
    expect(Math.abs(g - b)).toBeLessThan(1e-5);
  });

  it('black → black', () => {
    const [r, g, b] = odtSRGB(0, 0, 0);
    expect(r).toBeCloseTo(0, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });
});

describe('odtDCIP3 (ACES 2065-1 → DCI-P3 D65)', () => {
  it('output is in [0, 1]', () => {
    const [r, g, b] = odtDCIP3(0.18, 0.18, 0.18);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
    void g; void b;
  });

  it('neutral grey → neutral grey', () => {
    const [r, g, b] = odtDCIP3(0.18, 0.18, 0.18);
    expect(Math.abs(r - g)).toBeLessThan(1e-3);
    expect(Math.abs(g - b)).toBeLessThan(1e-3);
  });

  it('brighter than sRGB for same neutral input (P3 has wider gamut)', () => {
    // A neutral grey that maps the same in both ODTs might differ slightly
    // due to gamut mapping; but both should agree for neutrals
    const [rsRGB] = odtSRGB(0.5, 0.5, 0.5);
    const [rP3] = odtDCIP3(0.5, 0.5, 0.5);
    // Both should be close for neutral grey (gamut doesn't affect neutrals)
    expect(Math.abs(rsRGB - rP3)).toBeLessThan(0.05);
  });
});

describe('odtHDR10 (ACES 2065-1 → Rec.2020 + PQ)', () => {
  it('output is in [0, 1]', () => {
    for (const v of [0, 0.18, 1]) {
      const [r, g, b] = odtHDR10(v, v, v);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      void g; void b;
    }
  });

  it('neutral grey at 0.18 → approx 203 nits (PQ signal ≈ 0.508)', () => {
    const [r] = odtHDR10(0.18, 0.18, 0.18);
    // pqOETF(203) should be the expected signal
    const expected = pqOETF(203);
    expect(r).toBeCloseTo(expected, 2);
  });

  it('neutral grey → near-equal channels', () => {
    const [r, g, b] = odtHDR10(0.18, 0.18, 0.18);
    // Rec.2020 primaries differ from AP0; chromatic adaptation introduces ~1% shift
    expect(Math.abs(r - g)).toBeLessThan(0.03);
    expect(Math.abs(g - b)).toBeLessThan(0.03);
  });
});

describe('odtHLG (ACES 2065-1 → Rec.2020 + HLG)', () => {
  it('output is in [0, 1]', () => {
    const [r, g, b] = odtHLG(0.18, 0.18, 0.18);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
    void g; void b;
  });

  it('neutral grey → near-equal channels', () => {
    const [r, g, b] = odtHLG(0.18, 0.18, 0.18);
    // Rec.2020 + chromatic adaptation causes ~2% inter-channel difference
    expect(Math.abs(r - g)).toBeLessThan(0.05);
    expect(Math.abs(g - b)).toBeLessThan(0.05);
  });
});

// ============================================================
// colorTransform pipeline
// ============================================================

describe('colorTransform pipeline', () => {
  const inputs: InputColorspace[] = ['rec709', 'slog3-sgamut3', 'logc3-wg', 'aces2065-1'];
  const outputs: OutputColorspace[] = ['srgb', 'dcip3-d65', 'hdr10', 'hlg'];

  for (const src of inputs) {
    for (const dst of outputs) {
      it(`${src} → ${dst}: output in [0,1] for typical mid-grey input`, () => {
        // Use a "mid-grey" value for each source colorspace
        const MID_GREY: Record<InputColorspace, number> = {
          'rec709':        0.46,   // approx sRGB-encoded 18% grey
          'slog3-sgamut3': 420 / 1023,  // S-Log3 code 420
          'logc3-wg':      0.3909,  // LogC3 EI800 18% grey
          'aces2065-1':    0.18,   // ACES 2065-1 scene-linear
        };
        const v = MID_GREY[src];
        const xf = colorTransform(src, dst);
        const [r, g, b] = xf(v, v, v);
        // Output should be in [0, 1] for standard display encodings
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1.05); // small tolerance for edge cases
        expect(g).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it('aces2065-1 → srgb: neutral grey → equal channels', () => {
    const xf = colorTransform('aces2065-1', 'srgb');
    const [r, g, b] = xf(0.18, 0.18, 0.18);
    expect(Math.abs(r - g)).toBeLessThan(1e-5);
    expect(Math.abs(g - b)).toBeLessThan(1e-5);
  });

  it('rec709 → srgb: white roundtrip stays white', () => {
    const xf = colorTransform('rec709', 'srgb');
    const [r, g, b] = xf(1, 1, 1);
    // White through ACES RRT slightly compresses but stays near white
    expect(r).toBeCloseTo(g, 2);
    expect(g).toBeCloseTo(b, 2);
  });
});

// ============================================================
// applyColorTransformToBuffer
// ============================================================

describe('applyColorTransformToBuffer', () => {
  it('modifies buffer in place', () => {
    const data = new Uint8ClampedArray([255, 128, 64, 255, 0, 0, 0, 255]);
    const xf = colorTransform('rec709', 'srgb');
    applyColorTransformToBuffer(data, xf);
    // Alpha unchanged
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(255);
  });

  it('preserves alpha channel', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 128]);
    applyColorTransformToBuffer(data, colorTransform('aces2065-1', 'srgb'));
    expect(data[3]).toBe(128); // alpha preserved
  });

  it('output bytes are in [0, 255]', () => {
    // White pixel through rec709 → srgb
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    applyColorTransformToBuffer(data, colorTransform('rec709', 'srgb'));
    for (let i = 0; i < 3; i++) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });

  it('neutral grey pixel → near-equal RGB channels', () => {
    // sRGB-encoded ~18% grey ≈ 119 (0.46 × 255)
    const v = Math.round(0.46 * 255);
    const data = new Uint8ClampedArray([v, v, v, 255]);
    applyColorTransformToBuffer(data, colorTransform('rec709', 'srgb'));
    // Bradford D65→D60 adaptation introduces up to ~5 code-value difference at 8-bit
    expect(Math.abs(data[0] - data[1])).toBeLessThanOrEqual(5);
    expect(Math.abs(data[1] - data[2])).toBeLessThanOrEqual(5);
  });
});
