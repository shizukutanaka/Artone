/**
 * IntervalIndex テスト — 時間範囲検索の正確性
 *
 * 線形走査と同じ結果を返すことを検証 (高速化しても正しさを保証)。
 */

import { describe, it, expect } from 'vitest';
import { IntervalIndex, type Interval } from '../timeline/interval-index';

interface Clip extends Interval {
  name: string;
}

function clip(id: string, start: number, end: number): Clip {
  return { id, start, end, name: id };
}

describe('IntervalIndex — queryPoint', () => {
  it('finds interval containing the point', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    idx.insert(clip('b', 5, 10));
    idx.insert(clip('c', 10, 15));

    const at3 = idx.queryPoint(3);
    expect(at3.map((c) => c.id)).toEqual(['a']);

    const at7 = idx.queryPoint(7);
    expect(at7.map((c) => c.id)).toEqual(['b']);
  });

  it('boundary: start is inclusive, end is exclusive', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 5, 10));
    expect(idx.queryPoint(5).map((c) => c.id)).toEqual(['a']); // start inclusive
    expect(idx.queryPoint(10)).toEqual([]); // end exclusive
  });

  it('returns multiple overlapping intervals', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 10));
    idx.insert(clip('b', 5, 15)); // overlaps a at [5,10)
    const at7 = idx.queryPoint(7);
    expect(at7.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty for point outside all intervals', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    expect(idx.queryPoint(100)).toEqual([]);
  });
});

describe('IntervalIndex — queryRange', () => {
  it('finds intervals overlapping the range', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    idx.insert(clip('b', 5, 10));
    idx.insert(clip('c', 10, 15));
    idx.insert(clip('d', 20, 25));

    const range = idx.queryRange(4, 12);
    expect(range.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('excludes intervals entirely outside range', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    idx.insert(clip('b', 100, 105));
    const range = idx.queryRange(50, 60);
    expect(range).toEqual([]);
  });

  it('touching boundaries do not count as overlap', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    // range [5, 10) — a ends exactly at 5, no overlap
    const range = idx.queryRange(5, 10);
    expect(range).toEqual([]);
  });
});

describe('IntervalIndex — 一致性 (線形走査との比較)', () => {
  it('queryPoint matches brute-force result', () => {
    const idx = new IntervalIndex<Clip>();
    const clips: Clip[] = [];
    // ランダムな区間を100個
    for (let i = 0; i < 100; i++) {
      const start = Math.floor(Math.random() * 1000);
      const c = clip(`c${i}`, start, start + Math.floor(Math.random() * 50) + 1);
      clips.push(c);
      idx.insert(c);
    }

    for (const t of [10, 250, 500, 750, 999]) {
      const fast = idx.queryPoint(t).map((c) => c.id).sort();
      const brute = clips.filter((c) => t >= c.start && t < c.end).map((c) => c.id).sort();
      expect(fast).toEqual(brute);
    }
  });

  it('queryRange matches brute-force result', () => {
    const idx = new IntervalIndex<Clip>();
    const clips: Clip[] = [];
    for (let i = 0; i < 100; i++) {
      const start = Math.floor(Math.random() * 1000);
      const c = clip(`c${i}`, start, start + Math.floor(Math.random() * 50) + 1);
      clips.push(c);
      idx.insert(c);
    }

    const fast = idx.queryRange(200, 400).map((c) => c.id).sort();
    const brute = clips.filter((c) => c.start < 400 && c.end > 200).map((c) => c.id).sort();
    expect(fast).toEqual(brute);
  });
});

describe('IntervalIndex — CRUD', () => {
  it('remove deletes interval', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    expect(idx.remove('a')).toBe(true);
    expect(idx.queryPoint(2)).toEqual([]);
    expect(idx.size).toBe(0);
  });

  it('remove returns false for missing id', () => {
    const idx = new IntervalIndex<Clip>();
    expect(idx.remove('missing')).toBe(false);
  });

  it('clear empties the index', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    idx.insert(clip('b', 5, 10));
    idx.clear();
    expect(idx.size).toBe(0);
  });

  it('size reflects insertions', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('a', 0, 5));
    idx.insert(clip('b', 5, 10));
    expect(idx.size).toBe(2);
  });
});
