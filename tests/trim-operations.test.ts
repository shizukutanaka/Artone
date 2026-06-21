/**
 * Trim Operations Tests — timeline/trim-operations.ts
 *
 * Covers: rippleTrimStart, rippleTrimEnd, rollTrim, slipClip, slideClip,
 * closeGap, sortByStartTime, sequenceDuration, detectGaps, and error paths.
 */

import { describe, it, expect } from 'vitest';
import {
  rippleTrimStart,
  rippleTrimEnd,
  rollTrim,
  slipClip,
  slideClip,
  closeGap,
  sortByStartTime,
  sequenceDuration,
  detectGaps,
  type TrimClip,
} from '../timeline/trim-operations';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _id = 0;

/** Create a simple clip for testing. */
function clip(
  startTime: number,
  duration: number,
  mediaIn = 0,
  mediaOut?: number,
  id?: string,
): TrimClip {
  return {
    id:        id ?? `c${_id++}`,
    startTime,
    duration,
    mediaIn,
    mediaOut:  mediaOut ?? (mediaIn + duration),
    locked:    false,
  };
}

/** Convenience: find clip by id. */
function byId(clips: TrimClip[], id: string): TrimClip | undefined {
  return clips.find((c) => c.id === id);
}

// ─── rippleTrimStart ─────────────────────────────────────────────────────────

describe('rippleTrimStart', () => {
  it('shrinking from left shifts downstream clips right', () => {
    // [A:0-4][B:4-8]
    const A = clip(0, 4, 0, 4, 'A');
    const B = clip(4, 4, 0, 4, 'B');
    const { clips, ok } = rippleTrimStart([A, B], 'A', 2); // trim 2s from A's start
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    const b = byId(clips, 'B')!;
    // A starts at 2, duration shrinks by 2
    expect(a.startTime).toBeCloseTo(2);
    expect(a.duration).toBeCloseTo(2);
    expect(a.mediaIn).toBeCloseTo(2);
    // B shifts right by 2 (from 4 to 6)
    expect(b.startTime).toBeCloseTo(6);
    expect(b.duration).toBeCloseTo(4); // unchanged
  });

  it('extending from left (negative delta) shifts clips left', () => {
    const A = clip(2, 4, 2, 6, 'A');
    const B = clip(6, 4, 0, 4, 'B');
    const { clips, ok } = rippleTrimStart([A, B], 'A', -2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    expect(a.startTime).toBeCloseTo(0);
    expect(a.duration).toBeCloseTo(6);
    expect(a.mediaIn).toBeCloseTo(0);
    const b = byId(clips, 'B')!;
    expect(b.startTime).toBeCloseTo(4); // moved left by 2
  });

  it('returns ok=false for zero duration result', () => {
    const A = clip(0, 2, 0, 2, 'A');
    const r = rippleTrimStart([A], 'A', 2); // exact trim → duration=0
    expect(r.ok).toBe(false);
  });

  it('returns ok=false for negative mediaIn', () => {
    const A = clip(0, 4, 0, 4, 'A');
    const r = rippleTrimStart([A], 'A', -5); // mediaIn = -5
    expect(r.ok).toBe(false);
  });

  it('returns ok=false for unknown clip id', () => {
    const r = rippleTrimStart([clip(0, 4, 0, 4, 'X')], 'MISSING', 1);
    expect(r.ok).toBe(false);
  });

  it('does not modify original clips array', () => {
    const A = clip(0, 4, 0, 4, 'A');
    const orig = [A];
    const { clips } = rippleTrimStart(orig, 'A', 1);
    expect(orig[0]).toBe(A); // original reference unchanged
    expect(clips[0]).not.toBe(A);
  });
});

// ─── rippleTrimEnd ───────────────────────────────────────────────────────────

describe('rippleTrimEnd', () => {
  it('extending end shifts downstream clips right', () => {
    const A = clip(0, 4, 0, 4, 'A');
    const B = clip(4, 4, 0, 4, 'B');
    const { clips, ok } = rippleTrimEnd([A, B], 'A', 2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    const b = byId(clips, 'B')!;
    expect(a.duration).toBeCloseTo(6);
    expect(a.mediaOut).toBeCloseTo(6);
    expect(b.startTime).toBeCloseTo(6);
  });

  it('shrinking end shifts downstream clips left', () => {
    const A = clip(0, 4, 0, 4, 'A');
    const B = clip(4, 4, 0, 4, 'B');
    const { clips, ok } = rippleTrimEnd([A, B], 'A', -2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    const b = byId(clips, 'B')!;
    expect(a.duration).toBeCloseTo(2);
    expect(b.startTime).toBeCloseTo(2);
  });

  it('returns ok=false if duration goes to zero', () => {
    const A = clip(0, 3, 0, 3, 'A');
    expect(rippleTrimEnd([A], 'A', -3).ok).toBe(false);
  });

  it('returns ok=false if mediaOut crosses mediaIn', () => {
    const A = clip(0, 4, 2, 6, 'A');
    expect(rippleTrimEnd([A], 'A', -5).ok).toBe(false);
  });

  it('locked clip cannot be trimmed', () => {
    const A: TrimClip = { ...clip(0, 4, 0, 4, 'A'), locked: true };
    expect(rippleTrimEnd([A], 'A', 1).ok).toBe(false);
  });
});

// ─── rollTrim ────────────────────────────────────────────────────────────────

describe('rollTrim', () => {
  it('positive delta extends A and shortens B', () => {
    const A = clip(0, 5, 0, 5, 'A');
    const B = clip(5, 5, 0, 5, 'B');
    const { clips, ok } = rollTrim([A, B], 'A', 'B', 2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    const b = byId(clips, 'B')!;
    expect(a.duration).toBeCloseTo(7);
    expect(a.mediaOut).toBeCloseTo(7);
    expect(b.duration).toBeCloseTo(3);
    expect(b.mediaIn).toBeCloseTo(2);
    expect(b.startTime).toBeCloseTo(7);
  });

  it('negative delta shortens A and extends B', () => {
    const A = clip(0, 5, 0, 5, 'A');
    const B = clip(5, 5, 0, 5, 'B');
    const { clips, ok } = rollTrim([A, B], 'A', 'B', -2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    const b = byId(clips, 'B')!;
    expect(a.duration).toBeCloseTo(3);
    expect(b.duration).toBeCloseTo(7);
    expect(b.startTime).toBeCloseTo(3);
  });

  it('total end position unchanged (C after B is unaffected)', () => {
    const A = clip(0, 5, 0, 5, 'A');
    const B = clip(5, 5, 0, 5, 'B');
    const C = clip(10, 4, 0, 4, 'C');
    const { clips, ok } = rollTrim([A, B, C], 'A', 'B', 2);
    expect(ok).toBe(true);
    const c = byId(clips, 'C')!;
    expect(c.startTime).toBeCloseTo(10); // C not moved
  });

  it('returns ok=false if A or B not found', () => {
    const A = clip(0, 5, 0, 5, 'A');
    const B = clip(5, 5, 0, 5, 'B');
    expect(rollTrim([A, B], 'MISS', 'B', 1).ok).toBe(false);
    expect(rollTrim([A, B], 'A', 'MISS', 1).ok).toBe(false);
  });

  it('returns ok=false if roll exceeds clip capacity', () => {
    const A = clip(0, 3, 0, 3, 'A');
    const B = clip(3, 3, 0, 3, 'B');
    expect(rollTrim([A, B], 'A', 'B', 3).ok).toBe(false); // B duration = 0
  });
});

// ─── slipClip ────────────────────────────────────────────────────────────────

describe('slipClip', () => {
  it('shifts mediaIn and mediaOut without changing timeline position or duration', () => {
    const A = clip(2, 4, 0, 4, 'A');
    const { clips, ok } = slipClip([A], 'A', 2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    expect(a.startTime).toBeCloseTo(2);    // unchanged
    expect(a.duration).toBeCloseTo(4);     // unchanged
    expect(a.mediaIn).toBeCloseTo(2);      // +2
    expect(a.mediaOut).toBeCloseTo(6);     // +2
  });

  it('negative delta shifts to earlier media', () => {
    const A = clip(0, 4, 2, 6, 'A');
    const { clips, ok } = slipClip([A], 'A', -2);
    expect(ok).toBe(true);
    const a = byId(clips, 'A')!;
    expect(a.mediaIn).toBeCloseTo(0);
    expect(a.mediaOut).toBeCloseTo(4);
  });

  it('other clips are not affected', () => {
    const A = clip(0, 4, 0, 4, 'A');
    const B = clip(4, 4, 0, 4, 'B');
    const { clips } = slipClip([A, B], 'A', 1);
    expect(byId(clips, 'B')).toEqual(B);
  });

  it('returns ok=false when mediaIn would go negative', () => {
    const A = clip(0, 4, 0, 4, 'A');
    expect(slipClip([A], 'A', -2).ok).toBe(false);
  });

  it('clamps to mediaDurationSec', () => {
    const A = clip(0, 4, 2, 6, 'A');
    expect(slipClip([A], 'A', 6, 10).ok).toBe(false); // mediaOut = 12 > 10
  });

  it('clip not found → ok=false', () => {
    expect(slipClip([clip(0, 4, 0, 4, 'A')], 'MISS', 1).ok).toBe(false);
  });
});

// ─── slideClip ───────────────────────────────────────────────────────────────

describe('slideClip', () => {
  it('positive delta: clip moves right, left neighbour extends, right shrinks', () => {
    // [L:0-4][C:4-8][R:8-12]
    const L = clip(0, 4, 0, 4, 'L');
    const C = clip(4, 4, 0, 4, 'C');
    const R = clip(8, 4, 0, 4, 'R');
    const { clips, ok } = slideClip([L, C, R], 'C', 2);
    expect(ok).toBe(true);
    const l = byId(clips, 'L')!;
    const c = byId(clips, 'C')!;
    const r = byId(clips, 'R')!;
    // C moves right by 2
    expect(c.startTime).toBeCloseTo(6);
    expect(c.duration).toBeCloseTo(4); // unchanged
    expect(c.mediaIn).toBeCloseTo(0);  // unchanged
    // L extends by 2 (its right edge follows C's new start)
    expect(l.duration).toBeCloseTo(6);
    expect(l.mediaOut).toBeCloseTo(6);
    // R shrinks by 2 (its left edge follows C's new end)
    expect(r.startTime).toBeCloseTo(10);
    expect(r.duration).toBeCloseTo(2);
    expect(r.mediaIn).toBeCloseTo(2);
  });

  it('negative delta: clip moves left, left shrinks, right extends', () => {
    const L = clip(0, 4, 0, 4, 'L');
    const C = clip(4, 4, 0, 4, 'C');
    const R = clip(8, 4, 0, 4, 'R');
    const { clips, ok } = slideClip([L, C, R], 'C', -2);
    expect(ok).toBe(true);
    const l = byId(clips, 'L')!;
    const c = byId(clips, 'C')!;
    const r = byId(clips, 'R')!;
    expect(c.startTime).toBeCloseTo(2);
    expect(l.duration).toBeCloseTo(2);
    expect(r.startTime).toBeCloseTo(6);
    expect(r.duration).toBeCloseTo(6);
  });

  it('delta=0 → no change', () => {
    const A = clip(0, 4, 0, 4, 'A');
    const { clips, ok } = slideClip([A], 'A', 0);
    expect(ok).toBe(true);
    expect(clips[0]).toBe(A); // same reference (no-op returns original)
  });

  it('returns ok=false if neighbour would reach zero duration', () => {
    const L = clip(0, 2, 0, 2, 'L');
    const C = clip(2, 4, 0, 4, 'C');
    const R = clip(6, 4, 0, 4, 'R');
    // Slide C right by 3 → L needs to grow by 3, R shrinks to 1 (ok)
    // Slide C right by 5 → R duration = -1 (fail)
    expect(slideClip([L, C, R], 'C', 5).ok).toBe(false);
  });

  it('clip not found → ok=false', () => {
    expect(slideClip([clip(0, 4, 0, 4, 'A')], 'MISS', 1).ok).toBe(false);
  });
});

// ─── closeGap ─────────────────────────────────────────────────────────────────

describe('closeGap', () => {
  it('shifts clips after gap start to the left', () => {
    const A = clip(0, 3, 0, 3, 'A');
    const B = clip(6, 3, 0, 3, 'B'); // gap from 3 to 6
    const { clips, ok } = closeGap([A, B], 3, 3);
    expect(ok).toBe(true);
    const b = byId(clips, 'B')!;
    expect(b.startTime).toBeCloseTo(3); // moved left by 3
    const a = byId(clips, 'A')!;
    expect(a.startTime).toBeCloseTo(0); // unchanged
  });

  it('returns ok=false for zero or negative gap', () => {
    const A = clip(0, 3, 0, 3, 'A');
    expect(closeGap([A], 1, 0).ok).toBe(false);
    expect(closeGap([A], 1, -1).ok).toBe(false);
  });

  it('locked clips are not shifted', () => {
    const A: TrimClip = { ...clip(0, 3, 0, 3, 'A'), locked: true };
    const B = clip(6, 3, 0, 3, 'B');
    const { clips } = closeGap([A, B], 3, 3);
    expect(byId(clips, 'A')!.startTime).toBeCloseTo(0); // unchanged
    expect(byId(clips, 'B')!.startTime).toBeCloseTo(3); // shifted
  });
});

// ─── sequenceDuration ────────────────────────────────────────────────────────

describe('sequenceDuration', () => {
  it('returns end of last clip', () => {
    const clips = [clip(0, 4), clip(5, 3), clip(2, 10)]; // ends: 4, 8, 12
    expect(sequenceDuration(clips)).toBeCloseTo(12);
  });

  it('empty → 0', () => {
    expect(sequenceDuration([])).toBe(0);
  });
});

// ─── sortByStartTime ─────────────────────────────────────────────────────────

describe('sortByStartTime', () => {
  it('sorts ascending', () => {
    const clips = [clip(5, 2), clip(0, 4), clip(3, 1)];
    const sorted = sortByStartTime(clips);
    expect(sorted[0].startTime).toBeLessThan(sorted[1].startTime);
    expect(sorted[1].startTime).toBeLessThan(sorted[2].startTime);
  });

  it('does not mutate original array', () => {
    const clips = [clip(5, 2), clip(0, 4)];
    const orig  = [...clips];
    sortByStartTime(clips);
    expect(clips[0]).toBe(orig[0]); // same ref → not mutated
  });
});

// ─── detectGaps ──────────────────────────────────────────────────────────────

describe('detectGaps', () => {
  it('detects a single gap', () => {
    const A = clip(0, 3, 0, 3, 'A');
    const B = clip(5, 3, 0, 3, 'B');
    const gaps = detectGaps([A, B]);
    expect(gaps.length).toBe(1);
    expect(gaps[0][0]).toBeCloseTo(3);
    expect(gaps[0][1]).toBeCloseTo(5);
  });

  it('no gaps when clips are contiguous', () => {
    const A = clip(0, 3, 0, 3, 'A');
    const B = clip(3, 3, 0, 3, 'B');
    expect(detectGaps([A, B])).toHaveLength(0);
  });

  it('multiple gaps', () => {
    const clips = [clip(0, 2), clip(4, 2), clip(8, 2)];
    const gaps  = detectGaps(clips);
    expect(gaps.length).toBe(2);
    expect(gaps[0]).toEqual([2, 4]);
    expect(gaps[1]).toEqual([6, 8]);
  });

  it('empty → no gaps', () => {
    expect(detectGaps([])).toHaveLength(0);
  });

  it('respects minGapSec', () => {
    const A = clip(0, 3);
    const B = clip(3.0005, 3); // 0.5 ms gap
    const big  = detectGaps([A, B], 0.001);
    const small = detectGaps([A, B], 0.0001);
    expect(big).toHaveLength(0);  // gap < minGapSec
    expect(small).toHaveLength(1); // gap > minGapSec
  });
});
