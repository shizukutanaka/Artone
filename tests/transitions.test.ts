/**
 * Tests for render/transitions.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  easeLinear, easeInOut, easeIn, easeOut,
  crossDissolve, dipToColor,
  wipe, slide, push,
  radialWipe, irisWipe,
  getTransition,
} from '../render/transitions';
import type { TransitionKind } from '../render/transitions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function solid(
  w: number, h: number,
  color: [number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = color[0]; buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
}

const RED:  [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];

function pixel(buf: Uint8ClampedArray, x: number, y: number, w: number): [number, number, number] {
  const off = (y * w + x) * 4;
  return [buf[off], buf[off + 1], buf[off + 2]];
}

// ─── Easing ───────────────────────────────────────────────────────────────────

describe('easing functions', () => {
  it('all easings map 0→0 and 1→1', () => {
    for (const e of [easeLinear, easeInOut, easeIn, easeOut]) {
      expect(e(0)).toBeCloseTo(0, 6);
      expect(e(1)).toBeCloseTo(1, 6);
    }
  });

  it('easeInOut(0.5) = 0.5', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });

  it('easeIn(0.5) < 0.5 (slow start)', () => {
    expect(easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut(0.5) > 0.5 (fast start)', () => {
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

// ─── crossDissolve ────────────────────────────────────────────────────────────

describe('crossDissolve', () => {
  it('t=0 returns A', () => {
    const a = solid(4, 4, RED), b = solid(4, 4, BLUE);
    const out = crossDissolve(a, b, 4, 4, 0);
    expect(pixel(out, 0, 0, 4)).toEqual([255, 0, 0]);
  });

  it('t=1 returns B', () => {
    const a = solid(4, 4, RED), b = solid(4, 4, BLUE);
    const out = crossDissolve(a, b, 4, 4, 1);
    expect(pixel(out, 0, 0, 4)).toEqual([0, 0, 255]);
  });

  it('t=0.5 is a 50/50 blend', () => {
    const a = solid(2, 2, [200, 0, 0]), b = solid(2, 2, [0, 0, 200]);
    const out = crossDissolve(a, b, 2, 2, 0.5);
    expect(out[0]).toBeCloseTo(100, -0.3);
    expect(out[2]).toBeCloseTo(100, -0.3);
  });

  it('result is always opaque', () => {
    const a = solid(4, 4, RED), b = solid(4, 4, BLUE);
    const out = crossDissolve(a, b, 4, 4, 0.3);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it('clamps t outside [0,1]', () => {
    const a = solid(2, 2, RED), b = solid(2, 2, BLUE);
    expect(pixel(crossDissolve(a, b, 2, 2, -1), 0, 0, 2)).toEqual([255, 0, 0]);
    expect(pixel(crossDissolve(a, b, 2, 2, 2), 0, 0, 2)).toEqual([0, 0, 255]);
  });
});

// ─── dipToColor ───────────────────────────────────────────────────────────────

describe('dipToColor', () => {
  it('t=0 returns A', () => {
    const a = solid(2, 2, RED), b = solid(2, 2, BLUE);
    expect(pixel(dipToColor(a, b, 2, 2, 0), 0, 0, 2)).toEqual([255, 0, 0]);
  });

  it('t=1 returns B', () => {
    const a = solid(2, 2, RED), b = solid(2, 2, BLUE);
    expect(pixel(dipToColor(a, b, 2, 2, 1), 0, 0, 2)).toEqual([0, 0, 255]);
  });

  it('t=0.5 is the dip color (black by default)', () => {
    const a = solid(2, 2, RED), b = solid(2, 2, BLUE);
    const out = dipToColor(a, b, 2, 2, 0.5);
    expect(pixel(out, 0, 0, 2)).toEqual([0, 0, 0]);
  });

  it('dip to white reaches white at midpoint', () => {
    const a = solid(2, 2, RED), b = solid(2, 2, BLUE);
    const out = dipToColor(a, b, 2, 2, 0.5, [255, 255, 255]);
    expect(pixel(out, 0, 0, 2)).toEqual([255, 255, 255]);
  });
});

// ─── wipe ─────────────────────────────────────────────────────────────────────

describe('wipe', () => {
  it('t=0 is all A', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = wipe(a, b, 8, 4, 0, 'left');
    expect(pixel(out, 7, 0, 8)).toEqual([255, 0, 0]);
  });

  it('t=1 is all B', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = wipe(a, b, 8, 4, 1, 'left');
    expect(pixel(out, 0, 0, 8)).toEqual([0, 0, 255]);
    expect(pixel(out, 7, 0, 8)).toEqual([0, 0, 255]);
  });

  it('wipe-left reveals B from the left at t=0.5', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = wipe(a, b, 8, 4, 0.5, 'left');
    // Left column should be B, right column should be A
    expect(pixel(out, 0, 0, 8)).toEqual([0, 0, 255]);
    expect(pixel(out, 7, 0, 8)).toEqual([255, 0, 0]);
  });

  it('wipe-right reveals B from the right', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = wipe(a, b, 8, 4, 0.5, 'right');
    expect(pixel(out, 7, 0, 8)).toEqual([0, 0, 255]);
    expect(pixel(out, 0, 0, 8)).toEqual([255, 0, 0]);
  });

  it('wipe-up and wipe-down work vertically', () => {
    const a = solid(4, 8, RED), b = solid(4, 8, BLUE);
    const up = wipe(a, b, 4, 8, 0.5, 'up');
    expect(pixel(up, 0, 0, 4)).toEqual([0, 0, 255]); // top revealed
    const down = wipe(a, b, 4, 8, 0.5, 'down');
    expect(pixel(down, 0, 7, 4)).toEqual([0, 0, 255]); // bottom revealed
  });

  it('softness produces blended boundary pixels', () => {
    const a = solid(16, 1, RED), b = solid(16, 1, BLUE);
    const out = wipe(a, b, 16, 1, 0.5, 'left', 0.3);
    let hasBlend = false;
    for (let x = 0; x < 16; x++) {
      const [r, , bl] = pixel(out, x, 0, 16);
      if (r > 10 && r < 245 && bl > 10 && bl < 245) { hasBlend = true; break; }
    }
    expect(hasBlend).toBe(true);
  });

  it('result is opaque', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = wipe(a, b, 8, 4, 0.5, 'left');
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});

// ─── slide ────────────────────────────────────────────────────────────────────

describe('slide', () => {
  it('t=0 shows A (B fully off-screen)', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = slide(a, b, 8, 4, 0, 'left');
    expect(pixel(out, 4, 0, 8)).toEqual([255, 0, 0]);
  });

  it('t=1 shows B (fully slid in)', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = slide(a, b, 8, 4, 1, 'left');
    expect(pixel(out, 0, 0, 8)).toEqual([0, 0, 255]);
    expect(pixel(out, 7, 0, 8)).toEqual([0, 0, 255]);
  });

  it('B occupies left portion mid-slide from left', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = slide(a, b, 8, 4, 0.5, 'left');
    // B entering from left → left side should be B
    expect(pixel(out, 0, 0, 8)).toEqual([0, 0, 255]);
  });

  it('result is opaque', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = slide(a, b, 8, 4, 0.5, 'left');
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});

// ─── push ─────────────────────────────────────────────────────────────────────

describe('push', () => {
  it('t=0 shows A', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = push(a, b, 8, 4, 0, 'left');
    expect(pixel(out, 4, 0, 8)).toEqual([255, 0, 0]);
  });

  it('t=1 shows B', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = push(a, b, 8, 4, 1, 'left');
    expect(pixel(out, 0, 0, 8)).toEqual([0, 0, 255]);
    expect(pixel(out, 7, 0, 8)).toEqual([0, 0, 255]);
  });

  it('mid-push shows both A and B', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = push(a, b, 8, 4, 0.5, 'left');
    let hasRed = false, hasBlue = false;
    for (let x = 0; x < 8; x++) {
      const [r, , bl] = pixel(out, x, 0, 8);
      if (r > 200) hasRed = true;
      if (bl > 200) hasBlue = true;
    }
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });

  it('result is opaque', () => {
    const a = solid(8, 4, RED), b = solid(8, 4, BLUE);
    const out = push(a, b, 8, 4, 0.5, 'left');
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});

// ─── radialWipe ───────────────────────────────────────────────────────────────

describe('radialWipe', () => {
  it('t=0 is all A', () => {
    const a = solid(8, 8, RED), b = solid(8, 8, BLUE);
    const out = radialWipe(a, b, 8, 8, 0);
    expect(pixel(out, 7, 7, 8)).toEqual([255, 0, 0]);
  });

  it('t=1 is all B', () => {
    const a = solid(8, 8, RED), b = solid(8, 8, BLUE);
    const out = radialWipe(a, b, 8, 8, 1);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i + 2]).toBe(255); // blue channel
    }
  });

  it('mid-sweep shows both frames', () => {
    const a = solid(16, 16, RED), b = solid(16, 16, BLUE);
    const out = radialWipe(a, b, 16, 16, 0.5);
    let hasRed = false, hasBlue = false;
    for (let i = 0; i < out.length; i += 4) {
      if (out[i] > 200) hasRed = true;
      if (out[i + 2] > 200) hasBlue = true;
    }
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });
});

// ─── irisWipe ─────────────────────────────────────────────────────────────────

describe('irisWipe', () => {
  it('t=0 is all A', () => {
    const a = solid(8, 8, RED), b = solid(8, 8, BLUE);
    const out = irisWipe(a, b, 8, 8, 0);
    expect(pixel(out, 0, 0, 8)).toEqual([255, 0, 0]);
  });

  it('t=1 is all B', () => {
    const a = solid(8, 8, RED), b = solid(8, 8, BLUE);
    const out = irisWipe(a, b, 8, 8, 1);
    expect(pixel(out, 0, 0, 8)).toEqual([0, 0, 255]);
    expect(pixel(out, 7, 7, 8)).toEqual([0, 0, 255]);
  });

  it('center is B before corners during iris open', () => {
    const a = solid(16, 16, RED), b = solid(16, 16, BLUE);
    const out = irisWipe(a, b, 16, 16, 0.4);
    // Center should be B (inside circle), corner should be A
    expect(pixel(out, 8, 8, 16)).toEqual([0, 0, 255]);
    expect(pixel(out, 0, 0, 16)).toEqual([255, 0, 0]);
  });

  it('result is opaque', () => {
    const a = solid(8, 8, RED), b = solid(8, 8, BLUE);
    const out = irisWipe(a, b, 8, 8, 0.5);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});

// ─── getTransition registry ───────────────────────────────────────────────────

describe('getTransition', () => {
  const kinds: TransitionKind[] = [
    'cross-dissolve', 'dip-to-black', 'dip-to-white',
    'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
    'slide-left', 'slide-right', 'push-left', 'push-right',
    'radial', 'iris',
  ];

  it('every kind resolves to a working function', () => {
    const a = solid(8, 8, RED), b = solid(8, 8, BLUE);
    for (const kind of kinds) {
      const fn = getTransition(kind);
      const out = fn(a, b, 8, 8, 0.5);
      expect(out.length).toBe(8 * 8 * 4);
      for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
    }
  });

  it('t=0 returns A for cross-dissolve', () => {
    const a = solid(4, 4, RED), b = solid(4, 4, BLUE);
    const fn = getTransition('cross-dissolve');
    expect(pixel(fn(a, b, 4, 4, 0), 0, 0, 4)).toEqual([255, 0, 0]);
  });

  it('t=1 returns B for cross-dissolve', () => {
    const a = solid(4, 4, RED), b = solid(4, 4, BLUE);
    const fn = getTransition('cross-dissolve');
    expect(pixel(fn(a, b, 4, 4, 1), 0, 0, 4)).toEqual([0, 0, 255]);
  });

  it('applies easing to t', () => {
    const a = solid(2, 2, [200, 0, 0]), b = solid(2, 2, [0, 0, 200]);
    // easeIn(0.5) < 0.5 → dissolve closer to A than linear midpoint
    const eased  = getTransition('cross-dissolve', easeIn)(a, b, 2, 2, 0.5);
    const linear = getTransition('cross-dissolve', easeLinear)(a, b, 2, 2, 0.5);
    expect(eased[0]).toBeGreaterThan(linear[0]); // more red (A) retained
  });
});
