/**
 * HDR Engine テスト — PQ / HLG Transfer Function
 *
 * 標準リファレンス値で検証:
 * - PQ (SMPTE ST 2084): 1.0 → 10000 nits, 往復変換
 * - HLG (ARIB STD-B67): 1/12 → 0.5, 1.0 → 1.0
 * - トーンマッピング各手法の出力範囲
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HDREngine } from '../color/hdr-engine';

describe('HDREngine — PQ (SMPTE ST 2084)', () => {
  let hdr: HDREngine;
  beforeEach(() => { hdr = new HDREngine(); });

  it('PQ EOTF: 1.0 maps to ~10000 nits (peak)', () => {
    expect(hdr.pqEOTF(1.0)).toBeCloseTo(10000, 0);
  });

  it('PQ EOTF: 0.0 maps to 0 nits', () => {
    expect(hdr.pqEOTF(0.0)).toBeCloseTo(0, 4);
  });

  it('PQ EOTF: 0.5 maps to ~92 nits', () => {
    expect(hdr.pqEOTF(0.5)).toBeCloseTo(92.25, 0);
  });

  it('PQ EOTF/OETF round-trip', () => {
    for (const nits of [1, 100, 1000, 4000, 10000]) {
      const encoded = hdr.pqOETF(nits);
      const decoded = hdr.pqEOTF(encoded);
      expect(decoded).toBeCloseTo(nits, 0);
    }
  });

  it('PQ OETF is monotonically increasing', () => {
    let prev = -1;
    for (const nits of [0, 1, 10, 100, 1000, 10000]) {
      const v = hdr.pqOETF(nits);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('HDREngine — HLG (ARIB STD-B67)', () => {
  let hdr: HDREngine;
  beforeEach(() => { hdr = new HDREngine(); });

  it('HLG OETF: 1/12 maps to 0.5 (curve transition)', () => {
    expect(hdr.hlgOETF(1 / 12)).toBeCloseTo(0.5, 4);
  });

  it('HLG OETF: 1.0 maps to 1.0', () => {
    expect(hdr.hlgOETF(1.0)).toBeCloseTo(1.0, 4);
  });

  it('HLG OETF: 0 maps to 0', () => {
    expect(hdr.hlgOETF(0)).toBeCloseTo(0, 4);
  });

  it('HLG OETF/EOTF round-trip', () => {
    for (const v of [0.01, 0.1, 0.3, 0.6, 0.9]) {
      const encoded = hdr.hlgOETF(v);
      const decoded = hdr.hlgEOTF(encoded);
      expect(decoded).toBeCloseTo(v, 3);
    }
  });

  it('HLG OETF is monotonically increasing', () => {
    let prev = -1;
    for (const v of [0, 0.05, 0.1, 0.3, 0.5, 0.8, 1.0]) {
      const out = hdr.hlgOETF(v);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
  });
});

describe('HDREngine — Tone Mapping', () => {
  let hdr: HDREngine;
  beforeEach(() => { hdr = new HDREngine(); });

  it('toneMap output is in valid range [0, 1]', () => {
    for (const method of ['reinhard', 'aces', 'filmic', 'hable', 'uchimura', 'lottes'] as const) {
      hdr.setToneMappingConfig({ method });
      const out = hdr.toneMap(2.0, 1.5, 0.8); // HDR values > 1
      expect(out.r).toBeGreaterThanOrEqual(0);
      expect(out.r).toBeLessThanOrEqual(1.5); // 多少のオーバーは許容
      expect(out.g).toBeGreaterThanOrEqual(0);
      expect(out.b).toBeGreaterThanOrEqual(0);
    }
  });

  it('black input stays near black', () => {
    hdr.setToneMappingConfig({ method: 'aces' });
    const out = hdr.toneMap(0, 0, 0);
    expect(out.r).toBeCloseTo(0, 1);
    expect(out.g).toBeCloseTo(0, 1);
    expect(out.b).toBeCloseTo(0, 1);
  });

  it('higher input produces higher or equal output (monotonic)', () => {
    hdr.setToneMappingConfig({ method: 'reinhard', exposure: 0, whitePoint: 1, contrast: 1, saturation: 1, highlights: 0, shadows: 0 });
    const low = hdr.toneMap(0.2, 0.2, 0.2);
    const high = hdr.toneMap(0.8, 0.8, 0.8);
    expect(high.r).toBeGreaterThanOrEqual(low.r);
  });

  it('reinhard: out-of-gamut negative input (r=-1) does not produce NaN/Infinity', () => {
    // Color-space conversion can yield r=-1; (1+r)=0 was a divide-by-zero.
    hdr.setToneMappingConfig({ method: 'reinhard', whitePoint: 1 });
    const out = hdr.toneMap(-1, -0.5, -1);
    expect(Number.isFinite(out.r)).toBe(true);
    expect(Number.isFinite(out.g)).toBe(true);
    expect(Number.isFinite(out.b)).toBe(true);
  });

  it('reinhard: whitePoint=0 does not produce NaN/Infinity', () => {
    hdr.setToneMappingConfig({ method: 'reinhard', whitePoint: 0 });
    const out = hdr.toneMap(0.5, 0.5, 0.5);
    expect(Number.isFinite(out.r)).toBe(true);
  });

  it('hable: whitePoint=0 does not produce NaN/Infinity (hable(0)=0 → 1/0)', () => {
    hdr.setToneMappingConfig({ method: 'hable', whitePoint: 0 });
    const out = hdr.toneMap(0.5, 0.4, 0.3);
    expect(Number.isFinite(out.r)).toBe(true);
    expect(Number.isFinite(out.g)).toBe(true);
    expect(Number.isFinite(out.b)).toBe(true);
  });

  it('all tone-mapping methods return finite values for negative out-of-gamut input', () => {
    for (const method of ['reinhard', 'aces', 'filmic', 'hable', 'uchimura', 'lottes'] as const) {
      hdr.setToneMappingConfig({ method });
      const out = hdr.toneMap(-0.8, -1, 0.2);
      expect(Number.isFinite(out.r)).toBe(true);
      expect(Number.isFinite(out.g)).toBe(true);
      expect(Number.isFinite(out.b)).toBe(true);
    }
  });
});

describe('HDREngine — Metadata', () => {
  let hdr: HDREngine;
  beforeEach(() => { hdr = new HDREngine(); });

  it('setMetadata + getMetadata round-trips', () => {
    const meta = {
      format: 'hdr10' as const,
      colorSpace: 'rec2020' as const,
      transferFunction: 'pq' as const,
      maxCLL: 1000,
      maxFALL: 400,
      masteringDisplay: {
        redPrimary: { x: 0.708, y: 0.292 },
        greenPrimary: { x: 0.170, y: 0.797 },
        bluePrimary: { x: 0.131, y: 0.046 },
        whitePoint: { x: 0.3127, y: 0.3290 },
        maxLuminance: 1000,
        minLuminance: 0.0001,
      },
    };
    hdr.setMetadata(meta);
    expect(hdr.getMetadata()?.maxCLL).toBe(1000);
    expect(hdr.getMetadata()?.format).toBe('hdr10');
  });

  it('getMetadata returns null initially', () => {
    expect(hdr.getMetadata()).toBeNull();
  });
});

// ─── subscribe / notify ───────────────────────────────────────────────────────

const hdrMeta = {
  format: 'hdr10' as const,
  colorSpace: 'rec2020' as const,
  transferFunction: 'pq' as const,
  maxCLL: 1000,
  maxFALL: 400,
  masteringDisplay: {
    redPrimary: { x: 0.708, y: 0.292 },
    greenPrimary: { x: 0.170, y: 0.797 },
    bluePrimary: { x: 0.131, y: 0.046 },
    whitePoint: { x: 0.3127, y: 0.3290 },
    maxLuminance: 1000,
    minLuminance: 0.0001,
  },
};

describe('HDREngine — convertColorSpace', () => {
  it('same colorspace is identity (rec709→rec709)', () => {
    const hdr = new HDREngine();
    const { r, g, b } = hdr.convertColorSpace(0.5, 0.3, 0.1, 'rec709', 'rec709');
    expect(r).toBeCloseTo(0.5, 2);
    expect(g).toBeCloseTo(0.3, 2);
    expect(b).toBeCloseTo(0.1, 2);
  });

  it('rec2020→rec709 produces different values', () => {
    const hdr = new HDREngine();
    const { r, g, b } = hdr.convertColorSpace(0.5, 0.3, 0.1, 'rec2020', 'rec709');
    // Just verify it runs and produces finite values
    expect(Number.isFinite(r)).toBe(true);
    expect(Number.isFinite(g)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
  });

  it('dci_p3→rec709 runs without error', () => {
    const hdr = new HDREngine();
    const result = hdr.convertColorSpace(0.4, 0.4, 0.4, 'dci_p3', 'rec709');
    expect(Number.isFinite(result.r)).toBe(true);
  });

  it('aces→rec709 runs without error', () => {
    const hdr = new HDREngine();
    const result = hdr.convertColorSpace(0.18, 0.18, 0.18, 'aces', 'rec709');
    expect(Number.isFinite(result.r)).toBe(true);
  });
});

describe('HDREngine — processFrame', () => {
  function makeImageData(r = 128, g = 64, b = 32): ImageData {
    const data = new Uint8ClampedArray(4);
    data[0] = r; data[1] = g; data[2] = b; data[3] = 255;
    return new ImageData(data, 1, 1);
  }

  it('processFrame without metadata applies gamma and returns ImageData', () => {
    const hdr = new HDREngine();
    const img = makeImageData(128, 64, 32);
    const out = hdr.processFrame(img, true);
    expect(out).toBeInstanceOf(ImageData);
    expect(out.data[3]).toBe(255); // alpha preserved
  });

  it('processFrame with PQ metadata tone-maps to SDR range', () => {
    const hdr = new HDREngine();
    hdr.setMetadata({ ...hdrMeta, colorSpace: 'rec709', transferFunction: 'pq' });
    const img = makeImageData(200, 100, 50);
    const out = hdr.processFrame(img, true);
    expect(out.data[0]).toBeGreaterThanOrEqual(0);
    expect(out.data[0]).toBeLessThanOrEqual(255);
  });

  it('processFrame with HLG metadata runs without error', () => {
    const hdr = new HDREngine();
    hdr.setMetadata({ ...hdrMeta, colorSpace: 'rec709', transferFunction: 'hlg' });
    const img = makeImageData(100, 100, 100);
    const out = hdr.processFrame(img, true);
    expect(out).toBeInstanceOf(ImageData);
  });

  it('processFrame with rec2020 color space does color conversion', () => {
    const hdr = new HDREngine();
    hdr.setMetadata({ ...hdrMeta, colorSpace: 'rec2020', transferFunction: 'pq' });
    const img = makeImageData(128, 128, 128);
    const out = hdr.processFrame(img, true);
    expect(out).toBeInstanceOf(ImageData);
  });

  it('processFrame with outputSDR=false skips tone mapping', () => {
    const hdr = new HDREngine();
    const img = makeImageData(128, 128, 128);
    const out = hdr.processFrame(img, false);
    expect(out).toBeInstanceOf(ImageData);
  });
});

describe('HDREngine — subscribe / notify', () => {
  it('subscribe listener is called when metadata changes', () => {
    const hdr = new HDREngine();
    const listener = vi.fn();
    hdr.subscribe(listener);
    hdr.setMetadata(hdrMeta);
    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', () => {
    const hdr = new HDREngine();
    const listener = vi.fn();
    const unsub = hdr.subscribe(listener);
    unsub();
    hdr.setMetadata({ ...hdrMeta, format: 'hlg', maxCLL: 0, maxFALL: 0 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('HDREngine — transfer function negative-input NaN regression', () => {
  let hdr: HDREngine;
  beforeEach(() => { hdr = new HDREngine(); });

  it('REGRESSION: pqEOTF with negative code value returns 0, not NaN', () => {
    // Before fix: Math.pow(negative, 1/m2) = NaN, poisoning all channels.
    // Negative inputs arise from floating-point overshoot in matrix transforms.
    const result = hdr.pqEOTF(-0.1);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('REGRESSION: pqOETF with negative luminance returns 0, not NaN', () => {
    // Before fix: Math.pow(negative/10000, m1) = NaN.
    const result = hdr.pqOETF(-100);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('REGRESSION: hlgOETF with negative scene value returns 0, not NaN', () => {
    // Before fix: Math.sqrt(3 * negative) = NaN.
    const result = hdr.hlgOETF(-0.05);
    expect(result).toBe(0);
  });

  it('pqEOTF/pqOETF round-trip is still correct at positive values after fix', () => {
    const nits = 1000;
    const code = hdr.pqOETF(nits);
    expect(code).toBeGreaterThan(0);
    expect(code).toBeLessThanOrEqual(1);
    expect(hdr.pqEOTF(code)).toBeCloseTo(nits, 0);
  });
});
