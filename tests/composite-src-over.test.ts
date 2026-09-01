/**
 * Tests for bench/standard-suite.ts の `compositeSrcOver`
 *
 * ## なぜベンチの実装をテストするのか
 * `npm run bench` は CI の性能ゲートで、その数字が意味を持つのは**測っている
 * 処理が正しい**場合だけである。合成を速くするために整数近似へ置き換えたので、
 * 参照実装 (画素ごとの浮動小数除算) との差が許容範囲に収まることを固定する。
 * ここが緩むと「速いが違う計算」を測るベンチになってしまう。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { compositeSrcOver } from '../bench/standard-suite';

/** 参照実装 — 最適化前のベンチが行っていた素直な src-over。 */
function referenceComposite(
  fg: Uint8ClampedArray, bg: Uint8ClampedArray, out: Uint8ClampedArray,
): void {
  for (let i = 0; i < fg.length; i += 4) {
    const a = fg[i + 3] / 255;
    const inv = 1 - a;
    out[i] = fg[i] * a + bg[i] * inv;
    out[i + 1] = fg[i + 1] * a + bg[i + 1] * inv;
    out[i + 2] = fg[i + 2] * a + bg[i + 2] * inv;
    out[i + 3] = 255;
  }
}

/** 決定的な擬似乱数 (テストを再現可能にする)。 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s & 255;
  };
}

function fill(n: number, next: () => number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) a[i] = next();
  return a;
}

describe('compositeSrcOver', () => {
  it('matches the reference implementation within 1/255 on random data', () => {
    const n = 4 * 4096;
    const next = seeded(12345);
    const fg = fill(n, next);
    const bg = fill(n, next);
    const expected = new Uint8ClampedArray(n);
    const actual = new Uint8ClampedArray(n);

    referenceComposite(fg, bg, expected);
    compositeSrcOver(fg, bg, actual);

    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(expected[i] - actual[i]));
    // 整数近似による丸めのみ。2以上ずれるなら実装が壊れている。
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('passes the foreground through where it is fully opaque', () => {
    const fg = new Uint8ClampedArray([10, 20, 30, 255]);
    const bg = new Uint8ClampedArray([200, 210, 220, 255]);
    const out = new Uint8ClampedArray(4);
    compositeSrcOver(fg, bg, out);
    expect([out[0], out[1], out[2]]).toEqual([10, 20, 30]);
  });

  it('shows the background where the foreground is fully transparent', () => {
    const fg = new Uint8ClampedArray([10, 20, 30, 0]);
    const bg = new Uint8ClampedArray([200, 210, 220, 255]);
    const out = new Uint8ClampedArray(4);
    compositeSrcOver(fg, bg, out);
    expect([out[0], out[1], out[2]]).toEqual([200, 210, 220]);
  });

  it('blends halfway at 50% alpha', () => {
    const fg = new Uint8ClampedArray([0, 0, 0, 128]);
    const bg = new Uint8ClampedArray([255, 255, 255, 255]);
    const out = new Uint8ClampedArray(4);
    compositeSrcOver(fg, bg, out);
    // 128/255 ≈ 0.502 → 背景が約 127 残る。
    expect(out[0]).toBeGreaterThan(120);
    expect(out[0]).toBeLessThan(134);
  });

  it('always writes an opaque alpha channel', () => {
    const next = seeded(999);
    const fg = fill(4 * 64, next);
    const bg = fill(4 * 64, next);
    const out = new Uint8ClampedArray(4 * 64);
    compositeSrcOver(fg, bg, out);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});
