/**
 * Tests for timeline/range-edit.ts — Lift / Extract (three-point editing).
 *
 * Pure clip-set transformations: fully covered → removed, edge overlaps →
 * trimmed, range inside clip → split, Extract ripples the tail left.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { liftRange, extractRange, type TimeRange } from '../timeline/range-edit';
import type { Clip } from '../timeline/magnetic-timeline';

let idCounter = 0;
const ids = () => `gen-${++idCounter}`;

function clip(over: Partial<Clip> = {}): Clip {
  const startTime = over.startTime ?? 0;
  const duration = over.duration ?? 10;
  return {
    id: over.id ?? `c-${startTime}`,
    trackId: over.trackId ?? 'v1',
    mediaId: over.mediaId ?? 'm1',
    name: over.name ?? 'Clip',
    startTime,
    duration,
    mediaIn: over.mediaIn ?? 0,
    mediaOut: over.mediaOut ?? duration,
    transform: over.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    type: over.type ?? 'video',
    locked: over.locked ?? false,
    selected: over.selected ?? false,
  };
}

const range = (start: number, end: number): TimeRange => ({ start, end });
const opts = () => ({ newId: ids });

function byId(clips: Clip[], id: string): Clip | undefined {
  return clips.find((c) => c.id === id);
}

describe('liftRange — clip classification', () => {
  it('removes a clip fully inside the range', () => {
    const c = clip({ id: 'mid', startTime: 5, duration: 3 }); // [5,8)
    const r = liftRange([c], range(4, 9), opts());
    expect(r.removedIds).toEqual(['mid']);
    expect(r.clips).toHaveLength(0);
  });

  it('leaves a clip entirely before the range untouched', () => {
    const c = clip({ id: 'before', startTime: 0, duration: 3 }); // [0,3)
    const r = liftRange([c], range(5, 8), opts());
    expect(r.removedIds).toHaveLength(0);
    expect(r.clips).toHaveLength(0); // unchanged → not returned
  });

  it('leaves a clip entirely after the range untouched (lift does not ripple)', () => {
    const c = clip({ id: 'after', startTime: 20, duration: 3 });
    const r = liftRange([c], range(5, 8), opts());
    expect(r.clips).toHaveLength(0);
    expect(r.removedIds).toHaveLength(0);
  });

  it('trims the tail when the range overlaps the clip end (keeps head)', () => {
    const c = clip({ id: 'L', startTime: 0, duration: 10, mediaIn: 100 }); // [0,10)
    const r = liftRange([c], range(6, 12), opts()); // cut [6,10)
    const head = byId(r.clips, 'L')!;
    expect(head.startTime).toBe(0);
    expect(head.duration).toBe(6);
    expect(head.mediaIn).toBe(100);
    expect(head.mediaOut).toBe(106); // mediaIn + duration
  });

  it('trims the head when the range overlaps the clip start (keeps tail)', () => {
    const c = clip({ id: 'R', startTime: 10, duration: 10, mediaIn: 0 }); // [10,20)
    const r = liftRange([c], range(6, 14), opts()); // cut [10,14)
    const tail = byId(r.clips, 'R')!;
    expect(tail.startTime).toBe(14);      // gap remains (no ripple)
    expect(tail.duration).toBe(6);        // [14,20)
    expect(tail.mediaIn).toBe(4);         // 0 + (14 - 10)
    expect(tail.mediaOut).toBe(10);
  });

  it('splits a clip when the range lies strictly inside it', () => {
    const c = clip({ id: 'span', startTime: 0, duration: 20, mediaIn: 0, mediaOut: 20 });
    const r = liftRange([c], range(8, 12), opts()); // cut [8,12)
    expect(r.removedIds).toHaveLength(0);
    const head = byId(r.clips, 'span')!;
    const tail = r.clips.find((x) => x.id !== 'span')!;
    expect(head.startTime).toBe(0);
    expect(head.duration).toBe(8);
    expect(head.mediaOut).toBe(8);
    // Tail keeps its original position (gap of 4s between head end and tail start).
    expect(tail.startTime).toBe(12);
    expect(tail.duration).toBe(8); // [12,20)
    expect(tail.mediaIn).toBe(12); // 0 + (12 - 0)
    expect(tail.name).toContain('(2)');
  });
});

describe('extractRange — ripple closes the gap', () => {
  it('shifts a clip fully after the range left by the range length', () => {
    const c = clip({ id: 'after', startTime: 20, duration: 5 });
    const r = extractRange([c], range(5, 10), opts()); // length 5
    const moved = byId(r.clips, 'after')!;
    expect(moved.startTime).toBe(15); // 20 - 5
    expect(moved.duration).toBe(5);
  });

  it('pulls a head-trimmed tail back to the range start', () => {
    const c = clip({ id: 'R', startTime: 10, duration: 10, mediaIn: 0 }); // [10,20)
    const r = extractRange([c], range(6, 14), opts()); // cut [10,14), length 8
    const tail = byId(r.clips, 'R')!;
    expect(tail.startTime).toBe(6);  // 14 - 8 → gap closed to the in-point
    expect(tail.duration).toBe(6);
    expect(tail.mediaIn).toBe(4);
  });

  it('split tail is rippled to the in-point (head + tail become contiguous)', () => {
    const c = clip({ id: 'span', startTime: 0, duration: 20 });
    const r = extractRange([c], range(8, 12), opts()); // cut [8,12), length 4
    const head = byId(r.clips, 'span')!;
    const tail = r.clips.find((x) => x.id !== 'span')!;
    expect(head.startTime).toBe(0);
    expect(head.duration).toBe(8);
    expect(tail.startTime).toBe(8); // 12 - 4 → exactly head end (no gap)
    expect(tail.duration).toBe(8);
  });

  it('does not move clips that end before the range', () => {
    const before = clip({ id: 'before', startTime: 0, duration: 3 });
    const after = clip({ id: 'after', startTime: 20, duration: 3 });
    const r = extractRange([before, after], range(5, 10), opts());
    expect(byId(r.clips, 'before')).toBeUndefined(); // untouched
    expect(byId(r.clips, 'after')!.startTime).toBe(15);
  });
});

describe('range-edit — options & guards', () => {
  it('skips locked clips', () => {
    const c = clip({ id: 'locked', startTime: 5, duration: 3, locked: true });
    const r = liftRange([c], range(4, 9), opts());
    expect(r.removedIds).toHaveLength(0);
    expect(r.clips).toHaveLength(0);
  });

  it('restricts the edit to a single track when trackId is given', () => {
    const onV1 = clip({ id: 'v', startTime: 5, duration: 3, trackId: 'v1' });
    const onA1 = clip({ id: 'a', startTime: 5, duration: 3, trackId: 'a1' });
    const r = liftRange([onV1, onA1], range(4, 9), { ...opts(), trackId: 'v1' });
    expect(r.removedIds).toEqual(['v']); // a1 untouched
  });

  it('returns an empty result for an invalid range (end ≤ start)', () => {
    const c = clip({ id: 'x', startTime: 0, duration: 10 });
    expect(liftRange([c], range(5, 5), opts())).toEqual({ clips: [], removedIds: [] });
    expect(liftRange([c], range(8, 4), opts())).toEqual({ clips: [], removedIds: [] });
  });

  it('Lift leaves a gap that Extract would have closed (the two differ)', () => {
    const c = clip({ id: 'after', startTime: 20, duration: 5 });
    const lifted = liftRange([c], range(5, 10), opts());
    const extracted = extractRange([c], range(5, 10), opts());
    expect(lifted.clips).toHaveLength(0);               // gap kept
    expect(byId(extracted.clips, 'after')!.startTime).toBe(15); // gap closed
  });
});
