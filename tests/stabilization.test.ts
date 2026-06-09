/**
 * Tests for render/stabilization.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  accumulateTrajectory,
  smoothSeries,
  smoothTrajectory,
  computeCorrections,
  computeCropWindow,
  stabilize,
  trajectoryShakiness,
} from '../render/stabilization';
import type { Translation } from '../render/stabilization';

// ─── accumulateTrajectory ─────────────────────────────────────────────────────

describe('accumulateTrajectory', () => {
  it('starts at origin', () => {
    const traj = accumulateTrajectory([{ x: 5, y: 3 }]);
    expect(traj[0]).toEqual({ x: 0, y: 0 });
  });

  it('has length motions+1', () => {
    const motions = [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: -1, y: 0 }];
    expect(accumulateTrajectory(motions).length).toBe(4);
  });

  it('accumulates correctly', () => {
    const motions = [{ x: 1, y: 1 }, { x: 2, y: -1 }, { x: 3, y: 0 }];
    const traj = accumulateTrajectory(motions);
    expect(traj[1]).toEqual({ x: 1, y: 1 });
    expect(traj[2]).toEqual({ x: 3, y: 0 });
    expect(traj[3]).toEqual({ x: 6, y: 0 });
  });

  it('empty motions → single origin point', () => {
    const traj = accumulateTrajectory([]);
    expect(traj).toEqual([{ x: 0, y: 0 }]);
  });
});

// ─── smoothSeries ─────────────────────────────────────────────────────────────

describe('smoothSeries', () => {
  it('radius 0 returns a copy', () => {
    const v = [1, 2, 3];
    const out = smoothSeries(v, 0);
    expect(out).toEqual(v);
    expect(out).not.toBe(v);
  });

  it('constant series is unchanged', () => {
    const v = [5, 5, 5, 5, 5];
    const out = smoothSeries(v, 2, 'moving-average');
    for (const x of out) expect(x).toBeCloseTo(5, 6);
  });

  it('moving-average reduces variance of a noisy series', () => {
    const v = [0, 10, 0, 10, 0, 10, 0, 10];
    const out = smoothSeries(v, 2, 'moving-average');
    // Smoothed values should cluster around 5, much less spread
    const variance = (arr: number[]) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };
    expect(variance(out)).toBeLessThan(variance(v));
  });

  it('gaussian smoothing preserves the mean (approximately)', () => {
    const v = [1, 3, 2, 5, 4, 6, 3, 2];
    const out = smoothSeries(v, 2, 'gaussian');
    const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
    expect(mean(out)).toBeCloseTo(mean(v), 0);
  });

  it('preserves length', () => {
    const v = [1, 2, 3, 4, 5];
    expect(smoothSeries(v, 3).length).toBe(5);
  });

  it('empty series → empty', () => {
    expect(smoothSeries([], 3)).toEqual([]);
  });
});

// ─── smoothTrajectory ─────────────────────────────────────────────────────────

describe('smoothTrajectory', () => {
  it('smooths x and y independently', () => {
    const traj: Translation[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 },
    ];
    const out = smoothTrajectory(traj, 2, 'moving-average');
    expect(out.length).toBe(5);
    // y stays 0
    for (const p of out) expect(p.y).toBeCloseTo(0, 6);
    // x is smoothed toward the mean
    expect(out[2].x).toBeGreaterThan(0);
    expect(out[2].x).toBeLessThan(10);
  });
});

// ─── computeCorrections ───────────────────────────────────────────────────────

describe('computeCorrections', () => {
  it('correction = smoothed − trajectory', () => {
    const traj: Translation[]     = [{ x: 0, y: 0 }, { x: 10, y: 4 }];
    const smoothed: Translation[] = [{ x: 0, y: 0 }, { x: 6,  y: 2 }];
    const c = computeCorrections(traj, smoothed);
    expect(c[1].correction).toEqual({ x: -4, y: -2 });
  });

  it('zero when trajectory already smooth', () => {
    const traj: Translation[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    const c = computeCorrections(traj, traj);
    for (const fc of c) {
      expect(fc.correction.x).toBe(0);
      expect(fc.correction.y).toBe(0);
    }
  });

  it('clamps correction magnitude to maxCorrection', () => {
    const traj: Translation[]     = [{ x: 0, y: 0 }];
    const smoothed: Translation[] = [{ x: 30, y: 40 }]; // magnitude 50
    const c = computeCorrections(traj, smoothed, 10);
    const mag = Math.hypot(c[0].correction.x, c[0].correction.y);
    expect(mag).toBeCloseTo(10, 5);
    // direction preserved (3:4)
    expect(c[0].correction.x / c[0].correction.y).toBeCloseTo(0.75, 5);
  });

  it('frame index is set', () => {
    const traj: Translation[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const c = computeCorrections(traj, traj);
    expect(c[0].frame).toBe(0);
    expect(c[1].frame).toBe(1);
  });
});

// ─── computeCropWindow ────────────────────────────────────────────────────────

describe('computeCropWindow', () => {
  it('no correction → full frame', () => {
    const crop = computeCropWindow([{ frame: 0, correction: { x: 0, y: 0 } }], 100, 80);
    expect(crop).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it('insets by max correction symmetrically', () => {
    const corrections = [
      { frame: 0, correction: { x: 5, y: 0 } },
      { frame: 1, correction: { x: -3, y: 4 } },
    ];
    const crop = computeCropWindow(corrections, 100, 80);
    // max |x| inset = 5 → width = 100 - 10 = 90
    expect(crop.x).toBe(5);
    expect(crop.width).toBe(90);
    // max |y| inset = 4 → height = 80 - 8 = 72
    expect(crop.y).toBe(4);
    expect(crop.height).toBe(72);
  });

  it('crop stays at least 1px even with huge corrections', () => {
    const corrections = [{ frame: 0, correction: { x: 1000, y: 1000 } }];
    const crop = computeCropWindow(corrections, 100, 80);
    expect(crop.width).toBeGreaterThanOrEqual(1);
    expect(crop.height).toBeGreaterThanOrEqual(1);
  });

  it('rounds insets up (ceil) for safety', () => {
    const corrections = [{ frame: 0, correction: { x: 2.3, y: 0 } }];
    const crop = computeCropWindow(corrections, 100, 80);
    expect(crop.x).toBe(3); // ceil(2.3)
  });
});

// ─── stabilize (full pipeline) ────────────────────────────────────────────────

describe('stabilize', () => {
  it('produces corrections for all trajectory frames', () => {
    const motions: Translation[] = [
      { x: 2, y: 0 }, { x: -3, y: 1 }, { x: 4, y: -2 }, { x: -1, y: 1 },
    ];
    const result = stabilize(motions, 200, 150, { smoothingRadius: 2 });
    // trajectory has motions+1 = 5 entries
    expect(result.corrections.length).toBe(5);
    expect(result.trajectory.length).toBe(5);
    expect(result.smoothed.length).toBe(5);
  });

  it('reduces shakiness of a shaky trajectory', () => {
    // Shaky camera: alternating jitter superimposed on a slow pan
    const motions: Translation[] = [];
    for (let i = 0; i < 30; i++) {
      const jitter = (i % 2 === 0 ? 6 : -6);
      motions.push({ x: 1 + jitter, y: (i % 3 === 0 ? 4 : -4) });
    }
    const result = stabilize(motions, 320, 240, { smoothingRadius: 8 });

    const shakeBefore = trajectoryShakiness(result.trajectory);
    const shakeAfter  = trajectoryShakiness(result.smoothed);
    expect(shakeAfter).toBeLessThan(shakeBefore);
  });

  it('steady camera needs near-zero correction (interior frames)', () => {
    const radius = 5;
    const motions: Translation[] = new Array(20).fill({ x: 2, y: 1 });
    const result = stabilize(motions, 200, 150, { smoothingRadius: radius });
    // A constant-velocity pan is a linear ramp; Gaussian smoothing reproduces it
    // exactly in the interior (edge replication only perturbs boundary frames).
    for (let i = radius; i < result.corrections.length - radius; i++) {
      const c = result.corrections[i];
      expect(Math.abs(c.correction.x)).toBeLessThan(1e-6);
      expect(Math.abs(c.correction.y)).toBeLessThan(1e-6);
    }
  });

  it('crop window is within frame bounds', () => {
    const motions: Translation[] = [];
    for (let i = 0; i < 20; i++) motions.push({ x: (i % 2 ? 5 : -5), y: 0 });
    const result = stabilize(motions, 200, 150, { smoothingRadius: 6 });
    expect(result.crop.x).toBeGreaterThanOrEqual(0);
    expect(result.crop.width).toBeLessThanOrEqual(200);
    expect(result.crop.height).toBeLessThanOrEqual(150);
  });

  it('respects maxCorrection clamp', () => {
    const motions: Translation[] = [];
    for (let i = 0; i < 20; i++) motions.push({ x: (i % 2 ? 50 : -50), y: 0 });
    const result = stabilize(motions, 400, 300, { smoothingRadius: 8, maxCorrection: 10 });
    for (const c of result.corrections) {
      expect(Math.hypot(c.correction.x, c.correction.y)).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it('empty motions → single-frame trivial result', () => {
    const result = stabilize([], 100, 100);
    expect(result.corrections.length).toBe(1);
    expect(result.crop).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

// ─── trajectoryShakiness ──────────────────────────────────────────────────────

describe('trajectoryShakiness', () => {
  it('straight-line (constant velocity) trajectory → 0 shakiness', () => {
    const traj: Translation[] = [];
    for (let i = 0; i < 10; i++) traj.push({ x: i * 2, y: i * 3 });
    expect(trajectoryShakiness(traj)).toBeCloseTo(0, 6);
  });

  it('zigzag trajectory → high shakiness', () => {
    const traj: Translation[] = [];
    for (let i = 0; i < 10; i++) traj.push({ x: (i % 2 ? 10 : 0), y: 0 });
    expect(trajectoryShakiness(traj)).toBeGreaterThan(5);
  });

  it('fewer than 3 points → 0', () => {
    expect(trajectoryShakiness([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});
