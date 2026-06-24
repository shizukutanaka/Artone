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

// ============================================================
// max-length windowing: correctness at late query times
// ============================================================

/** Brute-force reference (the linear semantics the index must reproduce). */
function refPoint(clips: Clip[], time: number): string[] {
  return clips.filter((c) => time >= c.start && time < c.end).map((c) => c.id).sort();
}
function refRange(clips: Clip[], a: number, b: number): string[] {
  return clips.filter((c) => c.start < b && c.end > a).map((c) => c.id).sort();
}

describe('IntervalIndex — windowing correctness', () => {
  it('finds a hit when the playhead is far past the timeline start', () => {
    const idx = new IntervalIndex<Clip>();
    // Many early non-overlapping clips, plus one active clip near time=1000.
    for (let i = 0; i < 200; i++) idx.insert(clip(`e${i}`, i, i + 1));
    idx.insert(clip('late', 1000, 1010));
    expect(idx.queryPoint(1005).map((c) => c.id)).toEqual(['late']);
    expect(idx.queryPoint(500)).toEqual([]); // gap between dense block and late clip
  });

  it('a long spanning interval is still found long after its start (large maxLength)', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('bg', 0, 1000));        // spans the whole timeline
    idx.insert(clip('short', 990, 995));
    // At t=995 only bg is active (short is end-exclusive at 995).
    expect(idx.queryPoint(995).map((c) => c.id).sort()).toEqual(['bg']);
    // At t=992 both are active.
    expect(idx.queryPoint(992).map((c) => c.id).sort()).toEqual(['bg', 'short']);
  });

  it('matches brute force over randomized mixed-length intervals (point & range)', () => {
    // Deterministic PRNG so failures reproduce.
    let seed = 90210;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 60; trial++) {
      const clips: Clip[] = [];
      const idx = new IntervalIndex<Clip>();
      const n = 1 + Math.floor(rng() * 40);
      for (let i = 0; i < n; i++) {
        const start = rng() * 100;
        // Mix of short clips and occasional long spanning ones (varied maxLength).
        const len = rng() < 0.15 ? rng() * 80 + 20 : rng() * 4 + 0.01;
        const c = clip(`c${i}`, start, start + len);
        clips.push(c);
        idx.insert(c);
      }
      for (let q = 0; q < 25; q++) {
        const t = rng() * 130 - 5; // spans before-start..after-end
        expect(idx.queryPoint(t).map((c) => c.id).sort()).toEqual(refPoint(clips, t));
        const a = rng() * 120 - 5;
        const b = a + rng() * 30;
        expect(idx.queryRange(a, b).map((c) => c.id).sort()).toEqual(refRange(clips, a, b));
      }
    }
  });

  it('stays correct after removing the longest interval (stale-high maxLength is safe)', () => {
    const idx = new IntervalIndex<Clip>();
    idx.insert(clip('bg', 0, 1000));
    idx.insert(clip('a', 10, 12));
    idx.queryPoint(11);            // forces sort + maxLength = 1000
    idx.remove('bg');             // keeps order; maxLength stays 1000 (safe upper bound)
    expect(idx.queryPoint(11).map((c) => c.id)).toEqual(['a']);
    expect(idx.queryPoint(500)).toEqual([]);
  });
});
