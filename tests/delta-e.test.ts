/**
 * CIE Color Difference (ΔE) Tests
 *
 * Covers XYZ↔Lab conversion, sRGB→Lab shortcuts, CIE76/94, and
 * CIEDE2000 with verified test vectors from Sharma et al. (2005).
 */

import { describe, it, expect } from 'vitest';
import {
  xyzToLab,
  labToXYZ,
  sRGBLinearToLab,
  sRGBByteToLab,
  labToLCH,
  lchToLab,
  deltaE76,
  deltaE94,
  deltaE00,
  D65_WHITE,
  D50_WHITE,
  type Lab,
} from '../color/delta-e';

// ─── helpers ─────────────────────────────────────────────────────────────────

function labClose(a: Lab, b: Lab, digits = 3): void {
  expect(a.L).toBeCloseTo(b.L, digits);
  expect(a.a).toBeCloseTo(b.a, digits);
  expect(a.b).toBeCloseTo(b.b, digits);
}

// ─── xyzToLab ────────────────────────────────────────────────────────────────

describe('xyzToLab', () => {
  it('D65 white gives L=100, a≈0, b≈0', () => {
    const lab = xyzToLab(D65_WHITE.Xn, D65_WHITE.Yn, D65_WHITE.Zn);
    expect(lab.L).toBeCloseTo(100, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('perfect black (0,0,0) gives L=0, a=0, b=0', () => {
    const lab = xyzToLab(0, 0, 0);
    expect(lab.L).toBeCloseTo(0, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('L is monotonically related to Y', () => {
    const lab1 = xyzToLab(0.1, 0.1, 0.1);
    const lab2 = xyzToLab(0.5, 0.5, 0.5);
    expect(lab2.L).toBeGreaterThan(lab1.L);
  });

  it('D50 reference gives different result from D65', () => {
    // Same absolute XYZ, different reference → different Lab
    const labD65 = xyzToLab(0.5, 0.5, 0.5);
    const labD50 = xyzToLab(0.5, 0.5, 0.5, D50_WHITE);
    expect(labD65.a).not.toBeCloseTo(labD50.a, 2);
  });
});

// ─── labToXYZ ────────────────────────────────────────────────────────────────

describe('labToXYZ', () => {
  it('round-trips: xyzToLab → labToXYZ recovers original XYZ', () => {
    const X = 0.3576, Y = 0.7152, Z = 0.1192;
    const lab = xyzToLab(X, Y, Z);
    const [Xr, Yr, Zr] = labToXYZ(lab);
    expect(Xr).toBeCloseTo(X, 5);
    expect(Yr).toBeCloseTo(Y, 5);
    expect(Zr).toBeCloseTo(Z, 5);
  });

  it('white Lab (100,0,0) → D65 white XYZ', () => {
    const [X, Y, Z] = labToXYZ({ L: 100, a: 0, b: 0 });
    expect(X).toBeCloseTo(D65_WHITE.Xn, 3);
    expect(Y).toBeCloseTo(D65_WHITE.Yn, 3);
    expect(Z).toBeCloseTo(D65_WHITE.Zn, 3);
  });
});

// ─── sRGBLinearToLab ─────────────────────────────────────────────────────────

describe('sRGBLinearToLab', () => {
  it('linear white (1,1,1) gives L≈100, a≈0, b≈0', () => {
    const lab = sRGBLinearToLab(1, 1, 1);
    expect(lab.L).toBeCloseTo(100, 1);
    expect(lab.a).toBeCloseTo(0, 1);
    expect(lab.b).toBeCloseTo(0, 1);
  });

  it('black (0,0,0) gives L=0', () => {
    expect(sRGBLinearToLab(0, 0, 0).L).toBeCloseTo(0, 3);
  });

  it('neutral grey has a≈0 and b≈0', () => {
    const lab = sRGBLinearToLab(0.5, 0.5, 0.5);
    expect(Math.abs(lab.a)).toBeLessThan(0.01);
    expect(Math.abs(lab.b)).toBeLessThan(0.01);
  });

  it('pure red has positive a*, negative or low b*', () => {
    const lab = sRGBLinearToLab(1, 0, 0);
    expect(lab.a).toBeGreaterThan(30);  // red = positive a*
  });

  it('pure green has negative a*', () => {
    const lab = sRGBLinearToLab(0, 1, 0);
    expect(lab.a).toBeLessThan(-30);   // green = negative a*
  });

  it('pure blue has negative b*', () => {
    const lab = sRGBLinearToLab(0, 0, 1);
    expect(lab.b).toBeLessThan(-30);   // blue = negative b*
  });
});

// ─── sRGBByteToLab ───────────────────────────────────────────────────────────

describe('sRGBByteToLab', () => {
  it('white (255,255,255) gives L≈100', () => {
    expect(sRGBByteToLab(255, 255, 255).L).toBeCloseTo(100, 1);
  });

  it('black (0,0,0) gives L=0', () => {
    expect(sRGBByteToLab(0, 0, 0).L).toBeCloseTo(0, 3);
  });

  it('neutral mid-grey (128,128,128) has L≈53', () => {
    const lab = sRGBByteToLab(128, 128, 128);
    expect(lab.L).toBeGreaterThan(50);
    expect(lab.L).toBeLessThan(56);
  });
});

// ─── labToLCH / lchToLab ─────────────────────────────────────────────────────

describe('labToLCH / lchToLab', () => {
  it('neutral grey has C=0', () => {
    const lch = labToLCH({ L: 50, a: 0, b: 0 });
    expect(lch.C).toBeCloseTo(0, 6);
  });

  it('H is in [0, 360)', () => {
    const lch = labToLCH({ L: 50, a: -20, b: -30 });
    expect(lch.H).toBeGreaterThanOrEqual(0);
    expect(lch.H).toBeLessThan(360);
  });

  it('round-trips through lchToLab', () => {
    const lab: Lab = { L: 60, a: 25, b: -35 };
    const lch = labToLCH(lab);
    const back = lchToLab(lch);
    labClose(back, lab, 5);
  });

  it('C = sqrt(a² + b²)', () => {
    const lab: Lab = { L: 50, a: 30, b: 40 };
    expect(labToLCH(lab).C).toBeCloseTo(50, 5);
  });
});

// ─── deltaE76 ────────────────────────────────────────────────────────────────

describe('deltaE76', () => {
  it('identical colors give ΔE=0', () => {
    const lab: Lab = { L: 50, a: 10, b: -20 };
    expect(deltaE76(lab, lab)).toBe(0);
  });

  it('white vs black gives ΔE≈100', () => {
    const white = sRGBLinearToLab(1, 1, 1);
    const black = sRGBLinearToLab(0, 0, 0);
    expect(deltaE76(white, black)).toBeCloseTo(100, 0);
  });

  it('is symmetric', () => {
    const lab1: Lab = { L: 50, a: 10, b: -20 };
    const lab2: Lab = { L: 60, a: -5, b: 15 };
    expect(deltaE76(lab1, lab2)).toBeCloseTo(deltaE76(lab2, lab1), 10);
  });

  it('JND (just-noticeable difference) is approximately ΔE ≈ 2.3', () => {
    // A perceptible difference should be > 1
    const lab1: Lab = { L: 50, a: 0, b: 0 };
    const lab2: Lab = { L: 51, a: 0, b: 0 };
    expect(deltaE76(lab1, lab2)).toBeCloseTo(1, 3);
  });
});

// ─── deltaE94 ────────────────────────────────────────────────────────────────

describe('deltaE94', () => {
  it('identical colors give ΔE=0', () => {
    const lab: Lab = { L: 50, a: 10, b: -20 };
    expect(deltaE94(lab, lab)).toBeCloseTo(0, 10);
  });

  it('grey-to-grey matches ΔE76 (no chroma, no hue difference)', () => {
    const lab1: Lab = { L: 40, a: 0, b: 0 };
    const lab2: Lab = { L: 60, a: 0, b: 0 };
    // With no chroma, SL=1, SC=1, SH=1 → same result
    expect(deltaE94(lab1, lab2)).toBeCloseTo(deltaE76(lab1, lab2), 3);
  });

  it('chromatic difference is weighted by chroma', () => {
    // Two colours that differ only in hue, one very saturated
    const lab1: Lab = { L: 50, a:  50, b:  0 };
    const lab2: Lab = { L: 50, a: -50, b:  0 };
    const de94 = deltaE94(lab1, lab2);
    const de76 = deltaE76(lab1, lab2);
    // CIE94 should be less than CIE76 for saturated differences
    expect(de94).toBeLessThan(de76);
  });

  it('textiles parametrization gives larger SL penalty for lightness', () => {
    const lab1: Lab = { L: 40, a: 10, b: 5 };
    const lab2: Lab = { L: 60, a: 10, b: 5 };
    const ga = deltaE94(lab1, lab2);                          // graphic arts (kL=1)
    const tx = deltaE94(lab1, lab2, { kL: 2 });              // textiles (kL=2)
    expect(tx).toBeLessThan(ga);                              // divided by kL=2 → smaller
  });
});

// ─── deltaE00 — Sharma et al. (2005) test vectors ────────────────────────────
//
// Source: Table 1, "Supplementary Test Data" from:
// Sharma, Wu & Dalal (2005) Color Research & Application 30(1):21–30
// These are the reference values used to validate CIEDE2000 implementations.

describe('deltaE00 — Sharma 2005 test vectors', () => {
  // Full 34-pair canonical supplementary test data from Sharma, Wu & Dalal
  // (2005), Table 1. Exercises every branch: blue-region G factor (1–6),
  // gray axis (7–8), hue wraparound / near-zero chroma (9–16), large
  // differences (17–20), JND-scale chromatic pairs (21–24), and real colours
  // (25–34). Expected ΔE00 are the paper's published values (4 dp).
  const cases: [Lab, Lab, number][] = [
    [{ L: 50.0000, a:  2.6772, b: -79.7751 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 2.0425],
    [{ L: 50.0000, a:  3.1571, b: -77.2803 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 2.8615],
    [{ L: 50.0000, a:  2.8361, b: -74.0200 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 3.4412],
    [{ L: 50.0000, a: -1.3802, b: -84.2814 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 1.0000],
    [{ L: 50.0000, a: -1.1848, b: -84.8006 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 1.0000],
    [{ L: 50.0000, a: -0.9009, b: -85.5211 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 1.0000],
    [{ L: 50.0000, a:  0.0000, b:   0.0000 }, { L: 50.0000, a: -1.0000, b:   2.0000 }, 2.3669],
    [{ L: 50.0000, a: -1.0000, b:   2.0000 }, { L: 50.0000, a:  0.0000, b:   0.0000 }, 2.3669],
    [{ L: 50.0000, a:  2.4900, b:  -0.0010 }, { L: 50.0000, a: -2.4900, b:   0.0009 }, 7.1792],
    [{ L: 50.0000, a:  2.4900, b:  -0.0010 }, { L: 50.0000, a: -2.4900, b:   0.0010 }, 7.1792],
    [{ L: 50.0000, a:  2.4900, b:  -0.0010 }, { L: 50.0000, a: -2.4900, b:   0.0011 }, 7.2195],
    [{ L: 50.0000, a:  2.4900, b:  -0.0010 }, { L: 50.0000, a: -2.4900, b:   0.0012 }, 7.2195],
    [{ L: 50.0000, a: -0.0010, b:   2.4900 }, { L: 50.0000, a:  0.0009, b:  -2.4900 }, 4.8045],
    [{ L: 50.0000, a: -0.0010, b:   2.4900 }, { L: 50.0000, a:  0.0010, b:  -2.4900 }, 4.8045],
    [{ L: 50.0000, a: -0.0010, b:   2.4900 }, { L: 50.0000, a:  0.0011, b:  -2.4900 }, 4.7461],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 50.0000, a:  0.0000, b:  -2.5000 }, 4.3065],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 73.0000, a: 25.0000, b: -18.0000 }, 27.1492],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 61.0000, a: -5.0000, b:  29.0000 }, 22.8977],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 56.0000, a: -27.0000, b: -3.0000 }, 31.9030],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 58.0000, a: 24.0000, b:  15.0000 }, 19.4535],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 50.0000, a:  3.1736, b:   0.5854 }, 1.0000],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 50.0000, a:  3.2972, b:   0.0000 }, 1.0000],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 50.0000, a:  1.8634, b:   0.5757 }, 1.0000],
    [{ L: 50.0000, a:  2.5000, b:   0.0000 }, { L: 50.0000, a:  3.2592, b:   0.3350 }, 1.0000],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ L: 63.0109, a: -31.0961, b: -5.8663 }, { L: 62.8187, a: -29.7946, b: -4.0864 }, 1.2630],
    [{ L: 61.2901, a:  3.7196, b:  -5.3901 }, { L: 61.4292, a:  2.2480, b:  -4.9620 }, 1.8731],
    [{ L: 35.0831, a: -44.1164, b:  3.7933 }, { L: 35.0232, a: -40.0716, b:  1.5901 }, 1.8645],
    [{ L: 22.7233, a: 20.0904, b: -46.6940 }, { L: 23.0331, a: 14.9730, b: -42.5619 }, 2.0373],
    [{ L: 36.4612, a: 47.8580, b:  18.3852 }, { L: 36.2715, a: 50.5065, b:  21.2231 }, 1.4146],
    [{ L: 90.8027, a: -2.0831, b:   1.4410 }, { L: 91.1528, a: -1.6435, b:   0.0447 }, 1.4441],
    [{ L: 90.9257, a: -0.5406, b:  -0.9208 }, { L: 88.6381, a: -0.8985, b:  -0.7239 }, 1.5381],
    [{ L:  6.7747, a: -0.2908, b:  -2.4247 }, { L:  5.8714, a: -0.0985, b:  -2.2286 }, 0.6377],
    [{ L:  2.0776, a:  0.0795, b:  -1.1350 }, { L:  0.9033, a: -0.0636, b:  -0.5514 }, 0.9082],
  ];

  it.each(cases.map(([l1, l2, expected], i) => [i + 1, l1, l2, expected] as const))(
    'pair %i: ΔE00 ≈ %f',
    (_i, lab1, lab2, expected) => {
      expect(deltaE00(lab1, lab2)).toBeCloseTo(expected, 3);
    },
  );

  it('identical colors give ΔE00 = 0', () => {
    const lab: Lab = { L: 50, a: 25, b: -30 };
    expect(deltaE00(lab, lab)).toBeCloseTo(0, 10);
  });

  it('is symmetric', () => {
    const lab1: Lab = { L: 50, a: 10, b: -20 };
    const lab2: Lab = { L: 65, a: -5, b: 15 };
    expect(deltaE00(lab1, lab2)).toBeCloseTo(deltaE00(lab2, lab1), 4);
  });

  it('white vs black gives ΔE00 ≈ 100', () => {
    const white: Lab = { L: 100, a: 0, b: 0 };
    const black: Lab = { L: 0, a: 0, b: 0 };
    expect(deltaE00(white, black)).toBeCloseTo(100, 0);
  });
});
