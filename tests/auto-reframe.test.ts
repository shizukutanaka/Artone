/**
 * Auto Reframe テスト (SPEC G9 — アスペクト比リターゲット)
 *
 * timeline/auto-reframe.ts の純関数: フォーカス点集約・クロップ寸法・追従/クランプ。
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateFocus,
  fitCropSize,
  computeReframe,
  type FocusPoint,
} from '../timeline/auto-reframe';

describe('aggregateFocus', () => {
  it('weighted-averages multiple points; empty → null', () => {
    expect(aggregateFocus([])).toBeNull();
    const f = aggregateFocus([
      { x: 0, y: 0, weight: 1 },
      { x: 100, y: 200, weight: 3 },
    ]);
    expect(f!.x).toBe(75);
    expect(f!.y).toBe(150);
  });
});

describe('fitCropSize', () => {
  it('9:16 crop from 1920x1080 is 607.5 x 1080 (height-bound)', () => {
    const s = fitCropSize(1920, 1080, 9 / 16);
    expect(s.height).toBe(1080);
    expect(s.width).toBeCloseTo(1080 * (9 / 16), 3);
  });

  it('16:9 crop from 1080x1920 is 1080 x 607.5 (width-bound)', () => {
    const s = fitCropSize(1080, 1920, 16 / 9);
    expect(s.width).toBe(1080);
    expect(s.height).toBeCloseTo(1080 / (16 / 9), 3);
  });
});

describe('computeReframe', () => {
  const opts = { sourceWidth: 1920, sourceHeight: 1080, targetAspect: 9 / 16 };

  it('produces one crop window per frame with the target aspect ratio', () => {
    const frames: FocusPoint[][] = [[{ x: 960, y: 540 }], [{ x: 960, y: 540 }]];
    const crops = computeReframe(frames, opts);
    expect(crops).toHaveLength(2);
    for (const c of crops) {
      expect(c.width / c.height).toBeCloseTo(9 / 16, 5);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(1920 + 1e-6);
    }
  });

  it('static centered focus → static centered crop', () => {
    const frames: FocusPoint[][] = Array.from({ length: 5 }, () => [{ x: 960, y: 540 }]);
    const crops = computeReframe(frames, opts);
    const expectedX = 960 - (1080 * (9 / 16)) / 2;
    for (const c of crops) expect(c.x).toBeCloseTo(expectedX, 3);
  });

  it('follows a moving subject but is smoothed (lags the instantaneous target)', () => {
    // 1フレーム目は左端、その後右端へジャンプ
    const frames: FocusPoint[][] = [
      [{ x: 300, y: 540 }],
      [{ x: 1600, y: 540 }],
      [{ x: 1600, y: 540 }],
    ];
    const crops = computeReframe(frames, { ...opts, smoothing: 0.15, maxSpeed: 50 });
    const centerOf = (c: { x: number; width: number }) => c.x + c.width / 2;
    // 2フレーム目は急ジャンプせず、速度制限により最大50px程度しか動かない。
    const move = centerOf(crops[1]) - centerOf(crops[0]);
    expect(move).toBeGreaterThan(0);
    expect(move).toBeLessThanOrEqual(50 + 1e-6);
  });

  it('clamps to source edges when subject is near the border', () => {
    const frames: FocusPoint[][] = [[{ x: 10, y: 540 }]];
    const crops = computeReframe(frames, opts);
    expect(crops[0].x).toBe(0); // 左端にクランプ
  });

  it('empty focus frames hold the previous center (no jump)', () => {
    const frames: FocusPoint[][] = [[{ x: 700, y: 540 }], [], []];
    const crops = computeReframe(frames, opts);
    expect(crops[1].x).toBeCloseTo(crops[0].x, 3);
    expect(crops[2].x).toBeCloseTo(crops[0].x, 3);
  });
});
