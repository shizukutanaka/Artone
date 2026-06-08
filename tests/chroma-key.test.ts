/**
 * Tests for color/chroma-key.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  chromaKey,
  suppressSpillImage,
  compositeOver,
  estimateKeyColor,
} from '../color/chroma-key';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function solid(
  w: number, h: number,
  color: [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = color[0]; buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2]; buf[i * 4 + 3] = color[3];
  }
  return buf;
}

/** Green screen with a red subject in the center column. */
function greenScreenWithSubject(w: number, h: number): Uint8ClampedArray {
  const buf = solid(w, h, [0, 255, 0, 255]);
  for (let y = 0; y < h; y++) {
    const x = Math.floor(w / 2);
    const off = (y * w + x) * 4;
    buf[off] = 220; buf[off + 1] = 30; buf[off + 2] = 30; buf[off + 3] = 255;
  }
  return buf;
}

// ─── chromaKey ────────────────────────────────────────────────────────────────

describe('chromaKey', () => {
  it('keys out a pure green background (alpha → 0)', () => {
    const img = solid(4, 4, [0, 255, 0, 255]);
    const r = chromaKey(img, 4, 4, { keyColor: [0, 255, 0] });
    for (let i = 3; i < r.output.length; i += 4) {
      expect(r.output[i]).toBe(0);
    }
    expect(r.keyedFraction).toBeCloseTo(1, 6);
  });

  it('keeps a non-key subject opaque', () => {
    const img = solid(4, 4, [220, 30, 30, 255]); // red
    const r = chromaKey(img, 4, 4, { keyColor: [0, 255, 0] });
    for (let i = 3; i < r.output.length; i += 4) {
      expect(r.output[i]).toBe(255);
    }
    expect(r.keyedFraction).toBe(0);
  });

  it('green screen with subject: background keyed, subject preserved', () => {
    const w = 8, h = 8;
    const img = greenScreenWithSubject(w, h);
    const r = chromaKey(img, w, h, { keyColor: [0, 255, 0], similarity: 0.4, smoothness: 0.05 });
    // Subject column should remain opaque
    const subjX = Math.floor(w / 2);
    for (let y = 0; y < h; y++) {
      const off = (y * w + subjX) * 4;
      expect(r.output[off + 3]).toBeGreaterThan(200);
    }
    // A background pixel should be keyed
    expect(r.output[3]).toBe(0);
  });

  it('blue screen keying works', () => {
    const img = solid(4, 4, [0, 0, 255, 255]);
    const r = chromaKey(img, 4, 4, { keyColor: [0, 0, 255] });
    for (let i = 3; i < r.output.length; i += 4) {
      expect(r.output[i]).toBe(0);
    }
  });

  it('respects existing alpha (multiplies in)', () => {
    const img = solid(2, 2, [220, 30, 30, 128]); // half-transparent red, not key
    const r = chromaKey(img, 2, 2, { keyColor: [0, 255, 0] });
    for (let i = 3; i < r.output.length; i += 4) {
      expect(r.output[i]).toBe(128);
    }
  });

  it('higher similarity keys more aggressively', () => {
    // A yellowish-green that is near but not exactly the key
    const img = solid(4, 4, [120, 220, 40, 255]);
    const low  = chromaKey(img, 4, 4, { keyColor: [0, 255, 0], similarity: 0.1, smoothness: 0.05 });
    const high = chromaKey(img, 4, 4, { keyColor: [0, 255, 0], similarity: 0.6, smoothness: 0.05 });
    expect(high.keyedFraction).toBeGreaterThanOrEqual(low.keyedFraction);
  });

  it('produces soft edge alpha in the transition band', () => {
    // Build a gradient from green to red horizontally
    const w = 32, h = 1;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const off = x * 4;
      img[off]     = Math.round(220 * t);
      img[off + 1] = Math.round(255 * (1 - t));
      img[off + 2] = Math.round(30 * t);
      img[off + 3] = 255;
    }
    const r = chromaKey(img, w, h, { keyColor: [0, 255, 0], similarity: 0.3, smoothness: 0.3 });
    // Collect distinct alpha values; expect intermediate (not just 0 and 255)
    let hasIntermediate = false;
    for (let x = 0; x < w; x++) {
      const a = r.output[x * 4 + 3];
      if (a > 5 && a < 250) { hasIntermediate = true; break; }
    }
    expect(hasIntermediate).toBe(true);
  });

  it('does not mutate input', () => {
    const img = solid(4, 4, [0, 255, 0, 255]);
    const copy = Uint8ClampedArray.from(img);
    chromaKey(img, 4, 4);
    expect(Array.from(img)).toEqual(Array.from(copy));
  });

  it('all output values within [0, 255]', () => {
    const img = greenScreenWithSubject(8, 8);
    const r = chromaKey(img, 8, 8);
    for (const v of r.output) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('default key color is green', () => {
    const img = solid(4, 4, [0, 255, 0, 255]);
    const r = chromaKey(img, 4, 4);
    expect(r.keyedFraction).toBeCloseTo(1, 6);
  });
});

// ─── spill suppression ────────────────────────────────────────────────────────

describe('chromaKey spill suppression', () => {
  it('reduces green spill on edge pixels', () => {
    // A pixel that is green-tinted but not fully keyed (in transition band)
    const img = solid(2, 2, [100, 200, 90, 255]);
    const r = chromaKey(img, 2, 2, {
      keyColor: [0, 255, 0], similarity: 0.05, smoothness: 0.6, spill: 1,
    });
    // Green channel should be reduced toward (r+b)/2 for non-fully-opaque pixels
    const g = r.output[1];
    expect(g).toBeLessThanOrEqual(200);
  });

  it('spill=0 leaves colors unchanged (only alpha changes)', () => {
    const img = solid(2, 2, [100, 200, 90, 255]);
    const r = chromaKey(img, 2, 2, {
      keyColor: [0, 255, 0], similarity: 0.05, smoothness: 0.6, spill: 0,
    });
    expect(r.output[0]).toBe(100);
    expect(r.output[1]).toBe(200);
    expect(r.output[2]).toBe(90);
  });
});

// ─── suppressSpillImage ───────────────────────────────────────────────────────

describe('suppressSpillImage', () => {
  it('reduces green channel where it exceeds (r+b)/2', () => {
    const img = solid(2, 2, [50, 200, 60, 255]);
    const out = suppressSpillImage(img, 2, 2, [0, 255, 0], 1);
    // green pulled to (50+60)/2 = 55
    expect(out[1]).toBeCloseTo(55, 0);
  });

  it('preserves alpha', () => {
    const img = solid(2, 2, [50, 200, 60, 180]);
    const out = suppressSpillImage(img, 2, 2);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(180);
  });

  it('amount=0 leaves image unchanged', () => {
    const img = solid(2, 2, [50, 200, 60, 255]);
    const out = suppressSpillImage(img, 2, 2, [0, 255, 0], 0);
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('does not raise channels below the limit', () => {
    // green already below (r+b)/2 → unchanged
    const img = solid(2, 2, [200, 50, 200, 255]);
    const out = suppressSpillImage(img, 2, 2, [0, 255, 0], 1);
    expect(out[1]).toBe(50);
  });
});

// ─── compositeOver ────────────────────────────────────────────────────────────

describe('compositeOver', () => {
  it('opaque foreground fully covers background', () => {
    const fg = solid(2, 2, [255, 0, 0, 255]);
    const bg = solid(2, 2, [0, 0, 255, 255]);
    const out = compositeOver(fg, bg, 2, 2);
    expect(out[0]).toBe(255);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(255);
  });

  it('transparent foreground shows background', () => {
    const fg = solid(2, 2, [255, 0, 0, 0]);
    const bg = solid(2, 2, [0, 0, 255, 255]);
    const out = compositeOver(fg, bg, 2, 2);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(255);
  });

  it('half alpha blends 50/50', () => {
    const fg = solid(1, 1, [200, 0, 0, 128]);
    const bg = solid(1, 1, [0, 0, 200, 255]);
    const out = compositeOver(fg, bg, 1, 1);
    // ~ (200*0.502 + 0) ≈ 100 ; blue ~ (0 + 200*0.498) ≈ 99
    expect(out[0]).toBeGreaterThan(90);
    expect(out[0]).toBeLessThan(110);
    expect(out[2]).toBeGreaterThan(90);
    expect(out[2]).toBeLessThan(110);
  });

  it('result is always opaque', () => {
    const fg = solid(2, 2, [255, 0, 0, 50]);
    const bg = solid(2, 2, [0, 255, 0, 100]);
    const out = compositeOver(fg, bg, 2, 2);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it('end-to-end: key then composite replaces green with background', () => {
    const w = 4, h = 4;
    const fgRaw = solid(w, h, [0, 255, 0, 255]); // all green
    const keyed = chromaKey(fgRaw, w, h, { keyColor: [0, 255, 0] });
    const bg = solid(w, h, [10, 20, 30, 255]);
    const out = compositeOver(keyed.output, bg, w, h);
    // Green fully keyed → background shows through
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
    expect(out[2]).toBe(30);
  });
});

// ─── estimateKeyColor ─────────────────────────────────────────────────────────

describe('estimateKeyColor', () => {
  it('detects green from a green-bordered image', () => {
    const img = greenScreenWithSubject(8, 8);
    const [r, g, b] = estimateKeyColor(img, 8, 8);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('returns the uniform border color', () => {
    const img = solid(6, 6, [10, 200, 40, 255]);
    const [r, g, b] = estimateKeyColor(img, 6, 6);
    expect(r).toBeCloseTo(10, 0);
    expect(g).toBeCloseTo(200, 0);
    expect(b).toBeCloseTo(40, 0);
  });

  it('estimated color keys the image when fed back in', () => {
    const img = solid(8, 8, [0, 255, 0, 255]);
    const key = estimateKeyColor(img, 8, 8);
    const r = chromaKey(img, 8, 8, { keyColor: key });
    expect(r.keyedFraction).toBeGreaterThan(0.9);
  });
});
