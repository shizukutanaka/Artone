/**
 * Tests for timeline/edit-snapping.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  targetPriority,
  clipEdgeTargets,
  gridTargets,
  snapToGrid,
  snapValue,
  snapClipDrag,
  mergeTargets,
  targetsInRange,
} from '../timeline/edit-snapping';
import type { SnapTarget, SnapClip } from '../timeline/edit-snapping';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const t = (time: number, type: SnapTarget['type'], extra: Partial<SnapTarget> = {}): SnapTarget =>
  ({ time, type, ...extra });

// ─── targetPriority ───────────────────────────────────────────────────────────

describe('targetPriority', () => {
  it('uses explicit priority when present', () => {
    expect(targetPriority(t(1, 'grid', { priority: 999 }))).toBe(999);
  });

  it('playhead has higher default priority than grid', () => {
    expect(targetPriority(t(1, 'playhead'))).toBeGreaterThan(targetPriority(t(1, 'grid')));
  });

  it('marker has higher priority than clip edges', () => {
    expect(targetPriority(t(1, 'marker'))).toBeGreaterThan(targetPriority(t(1, 'clip-start')));
  });
});

// ─── clipEdgeTargets ──────────────────────────────────────────────────────────

describe('clipEdgeTargets', () => {
  it('produces two targets per clip', () => {
    const clips: SnapClip[] = [{ id: 'a', startTime: 0, duration: 5 }];
    const targets = clipEdgeTargets(clips);
    expect(targets.length).toBe(2);
  });

  it('start and end times are correct', () => {
    const clips: SnapClip[] = [{ id: 'a', startTime: 2, duration: 3 }];
    const targets = clipEdgeTargets(clips);
    expect(targets[0]).toMatchObject({ time: 2, type: 'clip-start', clipId: 'a' });
    expect(targets[1]).toMatchObject({ time: 5, type: 'clip-end', clipId: 'a' });
  });

  it('empty clip list → empty targets', () => {
    expect(clipEdgeTargets([])).toEqual([]);
  });
});

// ─── gridTargets ──────────────────────────────────────────────────────────────

describe('gridTargets', () => {
  it('generates grid lines at multiples of interval', () => {
    const targets = gridTargets(0, 10, 2.5);
    expect(targets.map(g => g.time)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('respects start offset (only includes lines >= start)', () => {
    const targets = gridTargets(3, 10, 2);
    expect(targets.map(g => g.time)).toEqual([4, 6, 8, 10]);
  });

  it('all targets are of type grid', () => {
    const targets = gridTargets(0, 5, 1);
    for (const g of targets) expect(g.type).toBe('grid');
  });

  it('returns empty when end < start', () => {
    expect(gridTargets(10, 5, 1)).toEqual([]);
  });

  it('throws when interval <= 0', () => {
    expect(() => gridTargets(0, 10, 0)).toThrow(RangeError);
    expect(() => gridTargets(0, 10, -1)).toThrow(RangeError);
  });
});

// ─── snapToGrid ───────────────────────────────────────────────────────────────

describe('snapToGrid', () => {
  it('snaps to nearest multiple', () => {
    expect(snapToGrid(2.3, 1)).toBe(2);
    expect(snapToGrid(2.6, 1)).toBe(3);
  });

  it('exact multiple stays put', () => {
    expect(snapToGrid(5, 2.5)).toBe(5);
  });

  it('throws when interval <= 0', () => {
    expect(() => snapToGrid(5, 0)).toThrow(RangeError);
  });
});

// ─── snapValue ────────────────────────────────────────────────────────────────

describe('snapValue', () => {
  const targets: SnapTarget[] = [
    t(0, 'sequence-start'),
    t(5, 'clip-start', { clipId: 'a' }),
    t(10, 'clip-end', { clipId: 'a' }),
    t(10.05, 'playhead'),
  ];

  it('snaps to nearest target within threshold', () => {
    const r = snapValue(5.1, targets, 0.2);
    expect(r.snapped).toBe(true);
    expect(r.time).toBe(5);
    expect(r.target?.type).toBe('clip-start');
  });

  it('no snap when outside threshold', () => {
    const r = snapValue(7, targets, 0.5);
    expect(r.snapped).toBe(false);
    expect(r.time).toBe(7);
    expect(r.delta).toBe(0);
  });

  it('delta is signed (target − value)', () => {
    const r = snapValue(4.9, targets, 0.5);
    expect(r.delta).toBeCloseTo(0.1, 6); // 5 - 4.9
  });

  it('tie broken by priority (playhead beats clip-end)', () => {
    // value 10.025 is equidistant (0.025) from clip-end@10 and playhead@10.05
    const r = snapValue(10.025, targets, 0.1);
    expect(r.snapped).toBe(true);
    expect(r.target?.type).toBe('playhead');
  });

  it('excludes targets by clipId', () => {
    // Excluding clip 'a' removes its start@5 and end@10
    const r = snapValue(5.05, targets, 0.2, ['a']);
    expect(r.snapped).toBe(false);
  });

  it('accepts a Set for excludeClipIds', () => {
    const r = snapValue(5.05, targets, 0.2, new Set(['a']));
    expect(r.snapped).toBe(false);
  });

  it('empty targets → no snap', () => {
    const r = snapValue(5, [], 1);
    expect(r.snapped).toBe(false);
  });

  it('picks closer target over higher-priority distant one', () => {
    const ts: SnapTarget[] = [
      t(5, 'playhead'),     // high priority but far
      t(5.4, 'grid'),       // low priority but closer
    ];
    const r = snapValue(5.45, ts, 0.5);
    expect(r.target?.type).toBe('grid'); // closer wins over priority
  });
});

// ─── snapClipDrag ─────────────────────────────────────────────────────────────

describe('snapClipDrag', () => {
  const targets: SnapTarget[] = [
    t(0, 'sequence-start'),
    t(10, 'clip-start', { clipId: 'other' }),
    t(20, 'clip-end', { clipId: 'other' }),
  ];

  it('snaps start edge to a target', () => {
    // Clip 'x' (duration 5) dragged so start ≈ 9.9 → snaps start to 10
    const r = snapClipDrag('x', 9.9, 5, targets, 0.2);
    expect(r.snapped).toBe(true);
    expect(r.edge).toBe('start');
    expect(r.startTime).toBe(10);
    expect(r.shift).toBeCloseTo(0.1, 6);
  });

  it('snaps end edge to a target', () => {
    // Clip 'x' (duration 5) with start 14.9 → end 19.9 → snaps end to 20
    const r = snapClipDrag('x', 14.9, 5, targets, 0.2);
    expect(r.snapped).toBe(true);
    expect(r.edge).toBe('end');
    // end snapped to 20 → start = 20 - 5 = 15
    expect(r.startTime).toBeCloseTo(15, 6);
  });

  it('chooses the edge with smaller delta', () => {
    // start 9.95 (delta 0.05 to 10), end 14.95... let's make end closer
    // duration 10: start 9.8 (delta 0.2 to 10), end 19.8 (delta 0.2 to 20) → tie → start
    const r = snapClipDrag('x', 9.8, 10, targets, 0.3);
    expect(r.snapped).toBe(true);
    expect(r.edge).toBe('start'); // tie prefers start
  });

  it('excludes the dragged clip own edges', () => {
    const selfTargets: SnapTarget[] = [
      t(5, 'clip-start', { clipId: 'x' }),
      t(10, 'clip-end', { clipId: 'x' }),
    ];
    const r = snapClipDrag('x', 5.05, 5, selfTargets, 0.2);
    expect(r.snapped).toBe(false);
  });

  it('no snap when both edges far from targets', () => {
    const r = snapClipDrag('x', 50, 5, targets, 0.2);
    expect(r.snapped).toBe(false);
    expect(r.startTime).toBe(50);
    expect(r.shift).toBe(0);
    expect(r.edge).toBeNull();
  });

  it('shift moves whole clip consistently', () => {
    const r = snapClipDrag('x', 9.9, 5, targets, 0.2);
    // After snap, start + shift relationship holds
    expect(r.startTime).toBeCloseTo(9.9 + r.shift, 6);
  });
});

// ─── mergeTargets ─────────────────────────────────────────────────────────────

describe('mergeTargets', () => {
  it('combines multiple lists', () => {
    const a = [t(1, 'grid'), t(2, 'grid')];
    const b = [t(3, 'marker')];
    const merged = mergeTargets([a, b]);
    expect(merged.length).toBe(3);
  });

  it('sorts by time', () => {
    const merged = mergeTargets([[t(5, 'grid'), t(1, 'grid'), t(3, 'grid')]]);
    expect(merged.map(m => m.time)).toEqual([1, 3, 5]);
  });

  it('deduplicates same-time targets keeping highest priority', () => {
    const merged = mergeTargets([
      [t(5, 'grid')],         // priority 10
      [t(5, 'playhead')],     // priority 100
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].type).toBe('playhead');
  });

  it('keeps near-but-distinct targets separate', () => {
    const merged = mergeTargets([[t(5, 'grid'), t(5.1, 'marker')]], 1e-6);
    expect(merged.length).toBe(2);
  });

  it('respects custom epsilon for dedup', () => {
    const merged = mergeTargets([[t(5, 'grid'), t(5.05, 'playhead')]], 0.1);
    expect(merged.length).toBe(1);
    expect(merged[0].type).toBe('playhead');
  });

  it('empty input → empty output', () => {
    expect(mergeTargets([])).toEqual([]);
  });
});

// ─── targetsInRange ───────────────────────────────────────────────────────────

describe('targetsInRange', () => {
  const targets: SnapTarget[] = [
    t(0, 'grid'), t(5, 'grid'), t(10, 'grid'), t(15, 'grid'), t(20, 'grid'),
  ];

  it('filters to visible range', () => {
    const r = targetsInRange(targets, 4, 16);
    expect(r.map(x => x.time)).toEqual([5, 10, 15]);
  });

  it('includes margin', () => {
    const r = targetsInRange(targets, 5, 15, 1);
    // margin 1 → [4, 16] → includes 5, 10, 15
    expect(r.map(x => x.time)).toEqual([5, 10, 15]);
  });

  it('boundary targets are inclusive', () => {
    const r = targetsInRange(targets, 5, 15);
    expect(r.map(x => x.time)).toEqual([5, 10, 15]);
  });

  it('empty when no targets in range', () => {
    expect(targetsInRange(targets, 100, 200)).toEqual([]);
  });
});

// ─── Integration ──────────────────────────────────────────────────────────────

describe('snapping integration', () => {
  it('grid + clip edges merged, dragged clip snaps to nearest', () => {
    const clips: SnapClip[] = [
      { id: 'a', startTime: 0,  duration: 4 },
      { id: 'b', startTime: 10, duration: 6 },
    ];
    const grid = gridTargets(0, 30, 5);
    const edges = clipEdgeTargets(clips);
    const all = mergeTargets([grid, edges]);

    // Drag clip 'a' to start ≈ 9.8 → should snap to clip 'b' start at 10
    const r = snapClipDrag('a', 9.8, 4, all, 0.5);
    expect(r.snapped).toBe(true);
    expect(r.startTime).toBe(10);
  });

  it('full pipeline respects priority on ties', () => {
    const grid = gridTargets(0, 20, 10);   // grid line at 10
    const markers: SnapTarget[] = [t(10, 'marker')];
    const all = mergeTargets([grid, markers]);
    // At time 10 there are two targets; merge keeps marker (higher priority)
    const r = snapValue(10.05, all, 0.2);
    expect(r.target?.type).toBe('marker');
  });
});
