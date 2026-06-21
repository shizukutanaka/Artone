/**
 * Tests for color/stylize.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  vignette,
  deinterlace,
  detectCombing,
  motionBlur,
} from '../color/stylize';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function solid(
  w: number, h: number,
  color: [number, number, number, number] = [200, 200, 200, 255],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = color[0]; buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2]; buf[i * 4 + 3] = color[3];
  }
  return buf;
}

function px(buf: Uint8ClampedArray, x: number, y: number, w: number): [number, number, number] {
  const off = (y * w + x) * 4;
  return [buf[off], buf[off + 1], buf[off + 2]];
}

/** Interlaced test image: even lines bright, odd lines dark (max combing). */
function combImage(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y % 2 === 0 ? 240 : 10;
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      buf[off] = buf[off + 1] = buf[off + 2] = v;
      buf[off + 3] = 255;
    }
  }
  return buf;
}

// ─── vignette ─────────────────────────────────────────────────────────────────

describe('vignette', () => {
  it('darkens corners more than center (default negative amount)', () => {
    const img = solid(16, 16, [200, 200, 200, 255]);
    const out = vignette(img, 16, 16, { amount: -0.6, innerRadius: 0.2, outerRadius: 1 });
    const center = px(out, 8, 8, 16);
    const corner = px(out, 0, 0, 16);
    expect(corner[0]).toBeLessThan(center[0]);
  });

  it('center is approximately unchanged', () => {
    const img = solid(16, 16, [200, 200, 200, 255]);
    const out = vignette(img, 16, 16, { amount: -0.6, innerRadius: 0.3 });
    const center = px(out, 8, 8, 16);
    expect(center[0]).toBeGreaterThan(180);
  });

  it('positive amount brightens corners', () => {
    const img = solid(16, 16, [100, 100, 100, 255]);
    const out = vignette(img, 16, 16, { amount: 0.5, innerRadius: 0.2 });
    const corner = px(out, 0, 0, 16);
    expect(corner[0]).toBeGreaterThan(100);
  });

  it('amount=0 leaves image unchanged', () => {
    const img = solid(8, 8, [123, 45, 67, 255]);
    const out = vignette(img, 8, 8, { amount: 0 });
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - img[i])).toBeLessThanOrEqual(1);
    }
  });

  it('preserves alpha', () => {
    const img = solid(8, 8, [200, 200, 200, 180]);
    const out = vignette(img, 8, 8);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(180);
  });

  it('all output values within [0,255]', () => {
    const img = solid(16, 16, [255, 255, 255, 255]);
    const out = vignette(img, 16, 16, { amount: -1 });
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('does not mutate input', () => {
    const img = solid(8, 8);
    const copy = Uint8ClampedArray.from(img);
    vignette(img, 8, 8);
    expect(Array.from(img)).toEqual(Array.from(copy));
  });
});

// ─── deinterlace ──────────────────────────────────────────────────────────────

describe('deinterlace', () => {
  it('bob removes combing (odd lines interpolated from neighbours)', () => {
    const img = combImage(4, 6);
    const out = deinterlace(img, 4, 6, 'bob', 'tff');
    // tff keeps even lines (bright 240); odd lines become avg of neighbours
    // line 1 = avg(line0=240, line2=240) = 240
    expect(px(out, 0, 0, 4)[0]).toBe(240); // kept
    expect(px(out, 0, 1, 4)[0]).toBe(240); // interpolated from 240 & 240
  });

  it('bob bff keeps odd lines', () => {
    const img = combImage(4, 6);
    const out = deinterlace(img, 4, 6, 'bob', 'bff');
    // bff keeps odd lines (dark 10); even lines interpolated
    expect(px(out, 0, 1, 4)[0]).toBe(10);  // kept
  });

  it('blend reduces line-to-line variance', () => {
    const img = combImage(4, 6);
    const out = deinterlace(img, 4, 6, 'blend');
    // After blend, adjacent lines should be much closer than 240 vs 10
    const line0 = px(out, 0, 1, 4)[0];
    const line1 = px(out, 0, 2, 4)[0];
    expect(Math.abs(line0 - line1)).toBeLessThan(230);
  });

  it('preserves dimensions', () => {
    const img = combImage(8, 8);
    expect(deinterlace(img, 8, 8).length).toBe(img.length);
  });

  it('preserves alpha', () => {
    const img = combImage(4, 4);
    for (let i = 3; i < img.length; i += 4) img[i] = 200;
    const out = deinterlace(img, 4, 4, 'blend');
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(200);
  });

  it('progressive (solid) image is essentially unchanged by bob', () => {
    const img = solid(4, 6, [100, 100, 100, 255]);
    const out = deinterlace(img, 4, 6, 'bob');
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(out[i]).toBe(100);
    }
  });
});

// ─── detectCombing ────────────────────────────────────────────────────────────

describe('detectCombing', () => {
  it('combed image scores high', () => {
    const img = combImage(8, 8);
    expect(detectCombing(img, 8, 8)).toBeGreaterThan(0.8);
  });

  it('progressive solid image scores ~0', () => {
    const img = solid(8, 8, [100, 100, 100, 255]);
    expect(detectCombing(img, 8, 8)).toBeLessThan(0.05);
  });

  it('deinterlaced image scores lower than original', () => {
    const img = combImage(8, 8);
    const before = detectCombing(img, 8, 8);
    const after = detectCombing(deinterlace(img, 8, 8, 'blend'), 8, 8);
    expect(after).toBeLessThan(before);
  });

  it('returns 0 for images shorter than 3 rows', () => {
    expect(detectCombing(solid(4, 2), 4, 2)).toBe(0);
  });
});

// ─── motionBlur ───────────────────────────────────────────────────────────────

describe('motionBlur', () => {
  it('length 0 leaves image unchanged', () => {
    const img = solid(8, 8, [100, 150, 200, 255]);
    const out = motionBlur(img, 8, 8, { length: 0 });
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('solid image unchanged by blur', () => {
    const img = solid(8, 8, [120, 120, 120, 255]);
    const out = motionBlur(img, 8, 8, { length: 6, angle: 0 });
    for (let i = 0; i < out.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out[i] - 120)).toBeLessThanOrEqual(1);
    }
  });

  it('horizontal blur smears a vertical edge', () => {
    // vertical edge: left black, right white
    const w = 16, h = 4;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x < w / 2 ? 0 : 255;
        const off = (y * w + x) * 4;
        img[off] = img[off + 1] = img[off + 2] = v;
        img[off + 3] = 255;
      }
    }
    const out = motionBlur(img, w, h, { angle: 0, length: 6 });
    // Near the edge there should be intermediate gray values
    let hasGray = false;
    for (let x = 0; x < w; x++) {
      const v = px(out, x, 0, w)[0];
      if (v > 20 && v < 235) { hasGray = true; break; }
    }
    expect(hasGray).toBe(true);
  });

  it('vertical blur (90°) smears a horizontal edge', () => {
    const w = 4, h = 16;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const v = y < h / 2 ? 0 : 255;
      for (let x = 0; x < w; x++) {
        const off = (y * w + x) * 4;
        img[off] = img[off + 1] = img[off + 2] = v;
        img[off + 3] = 255;
      }
    }
    const out = motionBlur(img, w, h, { angle: 90, length: 6 });
    let hasGray = false;
    for (let y = 0; y < h; y++) {
      const v = px(out, 0, y, w)[0];
      if (v > 20 && v < 235) { hasGray = true; break; }
    }
    expect(hasGray).toBe(true);
  });

  it('preserves alpha', () => {
    const img = solid(8, 8, [100, 100, 100, 222]);
    const out = motionBlur(img, 8, 8, { length: 5 });
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(222);
  });

  it('all output values within [0,255]', () => {
    const img = solid(8, 8, [255, 0, 128, 255]);
    const out = motionBlur(img, 8, 8, { angle: 45, length: 10 });
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('preserves dimensions', () => {
    const img = solid(10, 6);
    expect(motionBlur(img, 10, 6, { length: 4 }).length).toBe(img.length);
  });
});
