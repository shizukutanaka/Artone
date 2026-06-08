/**
 * CIE 1931 xy Chromaticity Tests
 */

import { describe, it, expect } from 'vitest';
import {
  xyzToChromaticity,
  sRGBLinearToXYZ,
  sRGBLinearToChromaticity,
  sRGBByteToChromaticity,
  ILLUMINANTS,
  GAMUT_PRIMARIES,
  planckianLocus,
  planckianLocusPoints,
  estimateCCT,
  sampleBufferChromaticities,
  type Chromaticity,
} from '../color/cie-chromaticity';

// ─── helpers ─────────────────────────────────────────────────────────────────

function xyClose(a: Chromaticity, b: Chromaticity, digits = 3): void {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
}

/** Solid RGBA buffer. */
function solidRGBA(r: number, g: number, b: number, n = 16): Uint8ClampedArray {
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return data;
}

// ─── xyzToChromaticity ───────────────────────────────────────────────────────

describe('xyzToChromaticity', () => {
  it('D65 equal-energy reference (1,1,1) → (1/3, 1/3)', () => {
    const xy = xyzToChromaticity(1, 1, 1)!;
    expect(xy.x).toBeCloseTo(1 / 3, 6);
    expect(xy.y).toBeCloseTo(1 / 3, 6);
  });

  it('pure Y (green axis) → (0, 1)', () => {
    const xy = xyzToChromaticity(0, 1, 0)!;
    expect(xy.x).toBeCloseTo(0, 6);
    expect(xy.y).toBeCloseTo(1, 6);
  });

  it('x + y ≤ 1 for any valid XYZ', () => {
    const xy = xyzToChromaticity(0.5, 0.3, 0.2)!;
    expect(xy.x + xy.y).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('returns null for zero stimulus', () => {
    expect(xyzToChromaticity(0, 0, 0)).toBeNull();
  });

  it('returns null for near-zero stimulus', () => {
    expect(xyzToChromaticity(1e-15, 1e-15, 1e-15)).toBeNull();
  });
});

// ─── sRGBLinearToXYZ ─────────────────────────────────────────────────────────

describe('sRGBLinearToXYZ', () => {
  it('white (1,1,1) gives roughly D65 XYZ (normalized sum ≈ 1)', () => {
    const [X, Y, Z] = sRGBLinearToXYZ(1, 1, 1);
    // Y should be very close to 1 (luminance)
    expect(Y).toBeCloseTo(1.0, 4);
    // X and Z roughly equal to white D65 values
    expect(X).toBeCloseTo(0.9505, 3);
    expect(Z).toBeCloseTo(1.0888, 3);
  });

  it('black (0,0,0) gives (0,0,0)', () => {
    const [X, Y, Z] = sRGBLinearToXYZ(0, 0, 0);
    expect(X).toBe(0);
    expect(Y).toBe(0);
    expect(Z).toBe(0);
  });

  it('pure red gives positive X, lower Y, low Z', () => {
    const [X, Y, Z] = sRGBLinearToXYZ(1, 0, 0);
    expect(X).toBeGreaterThan(Y);
    expect(Z).toBeLessThan(Y);
  });

  it('pure blue gives low X, low Y, high Z', () => {
    const [X, Y, Z] = sRGBLinearToXYZ(0, 0, 1);
    expect(Z).toBeGreaterThan(X);
    expect(Z).toBeGreaterThan(Y);
  });
});

// ─── sRGBLinearToChromaticity ─────────────────────────────────────────────────

describe('sRGBLinearToChromaticity', () => {
  it('D65 white (1,1,1) chromaticity matches ILLUMINANTS.D65', () => {
    const xy = sRGBLinearToChromaticity(1, 1, 1)!;
    xyClose(xy, ILLUMINANTS.D65 as Chromaticity, 3);
  });

  it('returns null for black', () => {
    expect(sRGBLinearToChromaticity(0, 0, 0)).toBeNull();
  });

  it('grey (0.5,0.5,0.5) is near white point', () => {
    const xy = sRGBLinearToChromaticity(0.5, 0.5, 0.5)!;
    xyClose(xy, ILLUMINANTS.D65 as Chromaticity, 3);
  });

  it('pure red chromaticity is in red region (x > 0.6)', () => {
    const xy = sRGBLinearToChromaticity(1, 0, 0)!;
    expect(xy.x).toBeGreaterThan(0.6);
    expect(xy.y).toBeLessThan(0.4);
  });

  it('pure green chromaticity is in green region (y > 0.55)', () => {
    const xy = sRGBLinearToChromaticity(0, 1, 0)!;
    expect(xy.y).toBeGreaterThan(0.55);
  });

  it('pure blue chromaticity is in blue region (x < 0.20, y < 0.10)', () => {
    const xy = sRGBLinearToChromaticity(0, 0, 1)!;
    expect(xy.x).toBeLessThan(0.20);
    expect(xy.y).toBeLessThan(0.10);
  });
});

// ─── sRGBByteToChromaticity ───────────────────────────────────────────────────

describe('sRGBByteToChromaticity', () => {
  it('white (255,255,255) is near D65', () => {
    const xy = sRGBByteToChromaticity(255, 255, 255)!;
    xyClose(xy, ILLUMINANTS.D65 as Chromaticity, 2);
  });

  it('returns null for black (0,0,0)', () => {
    expect(sRGBByteToChromaticity(0, 0, 0)).toBeNull();
  });
});

// ─── ILLUMINANTS ─────────────────────────────────────────────────────────────

describe('ILLUMINANTS', () => {
  it('D65 is at (0.3127, 0.3290)', () => {
    xyClose(ILLUMINANTS.D65 as Chromaticity, { x: 0.3127, y: 0.3290 }, 4);
  });

  it('D50 is at (0.3457, 0.3585)', () => {
    xyClose(ILLUMINANTS.D50 as Chromaticity, { x: 0.3457, y: 0.3585 }, 4);
  });

  it('equal-energy E is at (1/3, 1/3)', () => {
    expect((ILLUMINANTS.E as Chromaticity).x).toBeCloseTo(1 / 3, 6);
    expect((ILLUMINANTS.E as Chromaticity).y).toBeCloseTo(1 / 3, 6);
  });

  it('all illuminants have x and y in (0, 1)', () => {
    for (const [name, ill] of Object.entries(ILLUMINANTS)) {
      if (name === 'acesAP0') continue; // AP0 has y < 0 for blue primary (not illuminant)
      expect(ill.x).toBeGreaterThan(0);
      expect(ill.y).toBeGreaterThan(0);
      expect(ill.x).toBeLessThan(1);
      expect(ill.y).toBeLessThan(1);
    }
  });
});

// ─── GAMUT_PRIMARIES ──────────────────────────────────────────────────────────

describe('GAMUT_PRIMARIES', () => {
  it('sRGB red primary is at (0.640, 0.330)', () => {
    xyClose(GAMUT_PRIMARIES.sRGB.r, { x: 0.640, y: 0.330 }, 4);
  });

  it('Rec.2020 green primary is at (0.170, 0.797)', () => {
    xyClose(GAMUT_PRIMARIES.rec2020.g, { x: 0.170, y: 0.797 }, 4);
  });

  it('Rec.2020 gamut is wider than sRGB (green y further from D65)', () => {
    const rec2020G = GAMUT_PRIMARIES.rec2020.g;
    const sRGBG = GAMUT_PRIMARIES.sRGB.g;
    const white = ILLUMINANTS.D65 as Chromaticity;
    const rec2020Dist = Math.hypot(rec2020G.x - white.x, rec2020G.y - white.y);
    const sRGBDist = Math.hypot(sRGBG.x - white.x, sRGBG.y - white.y);
    expect(rec2020Dist).toBeGreaterThan(sRGBDist);
  });

  it('DCI-P3 has a different white point from sRGB', () => {
    expect(GAMUT_PRIMARIES.dciP3.white.x).not.toBeCloseTo(GAMUT_PRIMARIES.sRGB.white.x, 3);
  });

  it('Display P3 and DCI-P3 share same primaries but different white points', () => {
    xyClose(GAMUT_PRIMARIES.displayP3.r, GAMUT_PRIMARIES.dciP3.r, 4);
    expect(GAMUT_PRIMARIES.displayP3.white.x).toBeCloseTo(ILLUMINANTS.D65.x, 4);
  });
});

// ─── planckianLocus ───────────────────────────────────────────────────────────

describe('planckianLocus', () => {
  it('D65 ≈ 6500K locus point is near ILLUMINANTS.D65', () => {
    const xy = planckianLocus(6500);
    xyClose(xy, ILLUMINANTS.D65 as Chromaticity, 1);
  });

  it('D50 ≈ 5000K locus point is near ILLUMINANTS.D50', () => {
    const xy = planckianLocus(5000);
    xyClose(xy, ILLUMINANTS.D50 as Chromaticity, 1);
  });

  it('lower temperature gives warmer (higher x) chromaticity', () => {
    const warm = planckianLocus(2700);
    const cool = planckianLocus(6500);
    expect(warm.x).toBeGreaterThan(cool.x);
  });

  it('x and y are in physically plausible range', () => {
    for (const T of [2000, 3000, 5000, 6500, 10000]) {
      const { x, y } = planckianLocus(T);
      expect(x).toBeGreaterThan(0.1);
      expect(x).toBeLessThan(0.6);
      expect(y).toBeGreaterThan(0.1);
      expect(y).toBeLessThan(0.5);
    }
  });
});

// ─── planckianLocusPoints ─────────────────────────────────────────────────────

describe('planckianLocusPoints', () => {
  it('returns the requested number of points', () => {
    const pts = planckianLocusPoints(2000, 8000, 20);
    expect(pts.length).toBe(20);
  });

  it('first point is at minT, last is at maxT', () => {
    const pts = planckianLocusPoints(2000, 8000, 10);
    expect(pts[0].label).toBe('2000K');
    expect(pts[9].label).toBe('8000K');
  });

  it('points are monotonically decreasing in x (lower T = higher x)', () => {
    const pts = planckianLocusPoints(2000, 10000, 20);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x).toBeLessThan(pts[i - 1].x);
    }
  });
});

// ─── estimateCCT ─────────────────────────────────────────────────────────────

describe('estimateCCT', () => {
  it('D65 white gives approximately 6500K', () => {
    const cct = estimateCCT(ILLUMINANTS.D65 as Chromaticity);
    expect(cct).toBeGreaterThan(6000);
    expect(cct).toBeLessThan(7000);
  });

  it('D50 white gives approximately 5000K', () => {
    const cct = estimateCCT(ILLUMINANTS.D50 as Chromaticity);
    expect(cct).toBeGreaterThan(4500);
    expect(cct).toBeLessThan(5500);
  });

  it('Illuminant A (tungsten) gives approximately 2856K', () => {
    const cct = estimateCCT(ILLUMINANTS.A as Chromaticity);
    expect(cct).toBeGreaterThan(2500);
    expect(cct).toBeLessThan(3200);
  });

  it('round-trips through Planckian locus (within ~5%)', () => {
    const T = 5000;
    const xy = planckianLocus(T);
    const cct = estimateCCT(xy);
    expect(Math.abs(cct - T) / T).toBeLessThan(0.05);
  });
});

// ─── sampleBufferChromaticities ───────────────────────────────────────────────

describe('sampleBufferChromaticities', () => {
  it('returns empty array for empty buffer', () => {
    expect(sampleBufferChromaticities(new Uint8ClampedArray(0))).toEqual([]);
  });

  it('returns empty array for all-black buffer (below minLuma)', () => {
    const data = solidRGBA(0, 0, 0, 100);
    expect(sampleBufferChromaticities(data)).toEqual([]);
  });

  it('returns samples for a bright solid-colour frame', () => {
    const data = solidRGBA(200, 100, 50, 100);
    const pts = sampleBufferChromaticities(data);
    expect(pts.length).toBeGreaterThan(0);
  });

  it('all sample points have x and y in (0, 1)', () => {
    const data = solidRGBA(180, 120, 60, 200);
    const pts = sampleBufferChromaticities(data);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
    }
  });

  it('identical pixels produce the same chromaticity', () => {
    const data = solidRGBA(100, 150, 200, 50);
    const pts = sampleBufferChromaticities(data, 50);
    // All points should be identical
    if (pts.length > 1) {
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].x).toBeCloseTo(pts[0].x, 8);
        expect(pts[i].y).toBeCloseTo(pts[0].y, 8);
      }
    }
  });

  it('respects maxSamples limit', () => {
    const data = solidRGBA(200, 100, 50, 1000);
    const pts = sampleBufferChromaticities(data, 10);
    expect(pts.length).toBeLessThanOrEqual(10);
  });
});
