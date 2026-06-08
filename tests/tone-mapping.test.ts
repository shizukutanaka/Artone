/**
 * トーンマッピング演算子のテスト
 */

import { describe, it, expect } from 'vitest';
import {
  reinhard, reinhardExtended, hable, acesNarkowicz, uchimura,
  createToneMapper,
  type ToneMappingAlgo,
} from '../render/tone-mapping';

const ALL_ALGOS: ToneMappingAlgo[] = [
  'linear', 'reinhard', 'reinhard-extended', 'hable', 'aces-narkowicz', 'uchimura',
];

/** 単調増加性チェック: 隣接サンプル差が -1e-10 未満にならないこと */
function isMonotonic(fn: (x: number) => number, xs: number[]): boolean {
  for (let i = 0; i + 1 < xs.length; i++) {
    if (fn(xs[i + 1]) < fn(xs[i]) - 1e-10) return false;
  }
  return true;
}

const SCENE_RANGE = Array.from({ length: 50 }, (_, i) => i * 0.1); // 0..4.9

// ─── reinhard ──────────────────────────────────────────────────────────────

describe('reinhard', () => {
  it('maps 0 to 0', () => expect(reinhard(0)).toBe(0));

  it('maps 1 to exactly 0.5', () => expect(reinhard(1)).toBeCloseTo(0.5, 10));

  it('is monotonically increasing', () => {
    expect(isMonotonic(reinhard, SCENE_RANGE)).toBe(true);
  });

  it('asymptotes to 1 for large input', () => {
    expect(reinhard(10000)).toBeCloseTo(1, 3);
  });

  it('never exceeds 1', () => {
    for (const x of [0.1, 0.5, 1, 2, 10, 100]) {
      expect(reinhard(x)).toBeLessThanOrEqual(1);
    }
  });
});

// ─── reinhardExtended ──────────────────────────────────────────────────────

describe('reinhardExtended', () => {
  it('maps 0 to 0', () => expect(reinhardExtended(0, 4)).toBe(0));

  it('maps Lw exactly to 1 (algebraic property)', () => {
    // reinhardExtended(Lw, Lw) = Lw*(1+1/Lw)/(1+Lw) = (Lw+1)/(1+Lw) = 1
    expect(reinhardExtended(4, 4)).toBeCloseTo(1, 10);
  });

  it('is monotonically increasing', () => {
    expect(isMonotonic((x) => reinhardExtended(x, 4), SCENE_RANGE)).toBe(true);
  });

  it('exceeds simple reinhard at same input (higher contrast)', () => {
    for (const x of [0.5, 1, 2]) {
      expect(reinhardExtended(x, 4)).toBeGreaterThan(reinhard(x));
    }
  });

  it('approaches 1 beyond white point', () => {
    // Values beyond Lw can slightly exceed 1 but createToneMapper clamps
    const v = reinhardExtended(10, 4);
    expect(v).toBeGreaterThan(0.99);
  });
});

// ─── hable ─────────────────────────────────────────────────────────────────

describe('hable', () => {
  it('maps 0 to 0', () => expect(hable(0)).toBe(0));

  it('is monotonically increasing', () => {
    expect(isMonotonic(hable, SCENE_RANGE)).toBe(true);
  });

  it('output is always in [0,1]', () => {
    for (const x of [0, 0.18, 0.5, 1, 2, 5, 20, 100]) {
      const v = hable(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('maps large value to 1 (clamped)', () => {
    expect(hable(1000)).toBeCloseTo(1, 5);
  });

  it('maps W=11.2 near 1', () => {
    // partial(11.2)/partial(11.2) = 1 before clamping
    expect(hable(11.2)).toBeCloseTo(1, 2);
  });
});

// ─── acesNarkowicz ─────────────────────────────────────────────────────────

describe('acesNarkowicz', () => {
  it('maps 0 to 0', () => expect(acesNarkowicz(0)).toBe(0));

  it('maps large value to 1', () => expect(acesNarkowicz(1000)).toBeCloseTo(1, 5));

  it('is monotonically increasing in [0,5]', () => {
    expect(isMonotonic(acesNarkowicz, Array.from({ length: 50 }, (_, i) => i * 0.1))).toBe(true);
  });

  it('output is always in [0,1]', () => {
    for (const x of [0, 0.18, 0.5, 1, 2, 5]) {
      const v = acesNarkowicz(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('maps 18% scene grey to ~26.7% display (Narkowicz midtone)', () => {
    // (0.18*(2.51*0.18+0.03)) / (0.18*(2.43*0.18+0.59)+0.14) ≈ 0.267
    expect(acesNarkowicz(0.18)).toBeCloseTo(0.267, 2);
  });
});

// ─── uchimura ──────────────────────────────────────────────────────────────

describe('uchimura', () => {
  it('maps 0 to 0 (pedestal b=0)', () => {
    expect(uchimura(0)).toBeCloseTo(0, 5);
  });

  it('is identity in the linear section start (x=0.22)', () => {
    // In the linear region, output = L = m + a*(x-m) = x when a=1
    expect(uchimura(0.22)).toBeCloseTo(0.22, 4);
  });

  it('is monotonically increasing', () => {
    expect(isMonotonic(uchimura, SCENE_RANGE)).toBe(true);
  });

  it('output never exceeds P=1.0', () => {
    for (const x of [0, 0.5, 1, 2, 5, 100]) {
      expect(uchimura(x)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('compresses highlights (uchimura(1) < 1 and > 0.7)', () => {
    const v = uchimura(1);
    expect(v).toBeLessThan(1);
    expect(v).toBeGreaterThan(0.7);
  });

  it('supports custom contrast parameter (a=1.5 → brighter shoulder)', () => {
    // With higher contrast, midtone x=0.5 is in the shoulder → brighter
    const high = uchimura(0.5, 1, 1.5);
    const norm = uchimura(0.5, 1, 1.0);
    expect(high).toBeGreaterThan(norm);
  });

  it('pedestal b>0 raises black floor', () => {
    expect(uchimura(0, 1, 1, 0.22, 0.4, 1.33, 0.05)).toBeCloseTo(0.05, 5);
  });
});

// ─── createToneMapper — boundary conditions across all algos ──────────────

describe('createToneMapper — boundary conditions', () => {
  for (const algo of ALL_ALGOS) {
    it(`${algo}: map(0) = 0 (linear output)`, () => {
      const tm = createToneMapper(algo, { outputEncoding: 'linear' });
      expect(tm.map(0)).toBeCloseTo(0, 6);
    });

    it(`${algo}: map(large) ≈ 1 (linear output)`, () => {
      const tm = createToneMapper(algo, { outputEncoding: 'linear' });
      expect(tm.map(10000)).toBeCloseTo(1, 3);
    });
  }
});

// ─── createToneMapper — options ────────────────────────────────────────────

describe('createToneMapper — options', () => {
  it('exposure: scales input before tone mapping', () => {
    const tm2 = createToneMapper('reinhard', { exposure: 2, outputEncoding: 'linear' });
    const tm1 = createToneMapper('reinhard', { exposure: 1, outputEncoding: 'linear' });
    // map(0.5, exposure=2) should equal map(1.0, exposure=1) = reinhard(1) = 0.5
    expect(tm2.map(0.5)).toBeCloseTo(tm1.map(1.0), 10);
  });

  it('sRGB output encoding (default) applies sRGB OETF on top of tone map', () => {
    const tmSrgb = createToneMapper('reinhard');          // sRGB default
    const tmLin  = createToneMapper('reinhard', { outputEncoding: 'linear' });
    const lin = tmLin.map(1);   // reinhard(1) = 0.5
    const srgb = tmSrgb.map(1); // sRGB(0.5) ≈ 0.7353
    expect(srgb).toBeGreaterThan(lin); // sRGB is brighter than linear at same value
    expect(srgb).toBeCloseTo(0.7353, 3);
  });

  it('power-law gamma output', () => {
    const gamma = 1 / 2.2;
    const tm = createToneMapper('reinhard', { outputEncoding: gamma });
    // reinhard(1) = 0.5 → pow(0.5, 1/2.2)
    expect(tm.map(1)).toBeCloseTo(Math.pow(0.5, gamma), 6);
  });

  it('linear output: map(x) matches raw operator', () => {
    const tm = createToneMapper('reinhard', { outputEncoding: 'linear' });
    expect(tm.map(1)).toBeCloseTo(reinhard(1), 10);
    expect(tm.map(0.5)).toBeCloseTo(reinhard(0.5), 10);
  });

  it('whitePoint option used by reinhard-extended', () => {
    const tmLow  = createToneMapper('reinhard-extended', { whitePoint: 2, outputEncoding: 'linear' });
    const tmHigh = createToneMapper('reinhard-extended', { whitePoint: 8, outputEncoding: 'linear' });
    // Lower white point → same scene value maps higher (more contrast)
    expect(tmLow.map(1)).toBeGreaterThan(tmHigh.map(1));
  });
});

// ─── createToneMapper — applyToFloatBuffer ─────────────────────────────────

describe('createToneMapper — applyToFloatBuffer', () => {
  it('processes all complete RGB triplets', () => {
    const buf = new Float32Array([1.0, 2.0, 3.0, 0.5, 0.5, 0.5]);
    createToneMapper('reinhard', { outputEncoding: 'linear' }).applyToFloatBuffer(buf);
    // reinhard(1.0) = 0.5, reinhard(2.0) = 2/3, reinhard(3.0) = 0.75
    expect(buf[0]).toBeCloseTo(0.5, 6);
    expect(buf[1]).toBeCloseTo(2 / 3, 5);
    expect(buf[2]).toBeCloseTo(0.75, 6);
    // reinhard(0.5) = 1/3
    expect(buf[3]).toBeCloseTo(1 / 3, 5);
  });

  it('does not modify incomplete final triplet', () => {
    const buf = new Float32Array([1.0, 0.5]); // only 2 values
    const copy = Float32Array.from(buf);
    createToneMapper('reinhard').applyToFloatBuffer(buf);
    expect(buf[0]).toBe(copy[0]);
    expect(buf[1]).toBe(copy[1]);
  });

  it('handles empty buffer without error', () => {
    expect(() => createToneMapper('reinhard').applyToFloatBuffer(new Float32Array())).not.toThrow();
  });

  it('handles exactly 3 elements (one triplet)', () => {
    const buf = new Float32Array([1.0, 1.0, 1.0]);
    createToneMapper('reinhard', { outputEncoding: 'linear' }).applyToFloatBuffer(buf);
    expect(buf[0]).toBeCloseTo(0.5, 6);
    expect(buf[1]).toBeCloseTo(0.5, 6);
    expect(buf[2]).toBeCloseTo(0.5, 6);
  });
});

// ─── createToneMapper — applyToUint8Buffer ─────────────────────────────────

describe('createToneMapper — applyToUint8Buffer', () => {
  it('preserves alpha channel for every pixel', () => {
    const buf = new Uint8ClampedArray([200, 150, 100, 128, 50, 50, 50, 77]);
    createToneMapper('reinhard').applyToUint8Buffer(buf);
    expect(buf[3]).toBe(128);
    expect(buf[7]).toBe(77);
  });

  it('maps black (0,0,0) to black output', () => {
    const buf = new Uint8ClampedArray([0, 0, 0, 255]);
    createToneMapper('reinhard').applyToUint8Buffer(buf);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
  });

  it('tone-maps white (255,255,255): output < 255 for reinhard', () => {
    const buf = new Uint8ClampedArray([255, 255, 255, 255]);
    createToneMapper('reinhard').applyToUint8Buffer(buf);
    // sRGBEOTF(1)=1 → reinhard(1)=0.5 → sRGBOETF(0.5)≈0.7353 → ~187
    expect(buf[0]).toBeLessThan(255);
    expect(buf[0]).toBeGreaterThan(100);
  });

  it('linear operator: white stays white', () => {
    const buf = new Uint8ClampedArray([255, 255, 255, 255]);
    createToneMapper('linear').applyToUint8Buffer(buf);
    expect(buf[0]).toBe(255);
    expect(buf[1]).toBe(255);
    expect(buf[2]).toBe(255);
  });

  it('handles empty buffer without error', () => {
    expect(() => createToneMapper('reinhard').applyToUint8Buffer(new Uint8ClampedArray())).not.toThrow();
  });

  it('ignores incomplete RGBA pixel (< 4 bytes)', () => {
    const buf = new Uint8ClampedArray([200, 150, 100]); // 3 bytes, no alpha
    const copy = Uint8ClampedArray.from(buf);
    createToneMapper('reinhard').applyToUint8Buffer(buf);
    expect(buf[0]).toBe(copy[0]);
    expect(buf[1]).toBe(copy[1]);
    expect(buf[2]).toBe(copy[2]);
  });

  it('processes multiple pixels consistently', () => {
    // Both grey pixels should map identically
    const grey = 128;
    const buf = new Uint8ClampedArray([grey, grey, grey, 255, grey, grey, grey, 128]);
    createToneMapper('reinhard').applyToUint8Buffer(buf);
    expect(buf[0]).toBe(buf[4]);
    expect(buf[1]).toBe(buf[5]);
    expect(buf[2]).toBe(buf[6]);
  });
});

// ─── インテグレーション ────────────────────────────────────────────────────

describe('integration: all algos produce non-trivial tone-mapped output', () => {
  it('all algos: map(0.18) returns a value in (0, 0.5] (midtone smoke test)', () => {
    for (const algo of ALL_ALGOS) {
      const tm = createToneMapper(algo, { outputEncoding: 'linear' });
      const v = tm.map(0.18);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(0.5);
    }
  });

  it('all algos: sRGB output of map(0) is 0', () => {
    for (const algo of ALL_ALGOS) {
      expect(createToneMapper(algo).map(0)).toBeCloseTo(0, 6);
    }
  });
});
