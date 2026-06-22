/**
 * Tests for app/TimelineView.tsx — computeClipDrag (pure drag math).
 *
 * The component now uses Pointer Events (mouse + touch + pen) with
 * setPointerCapture; the drag arithmetic is extracted here so it is testable
 * without a DOM / React Testing Library.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  computeClipDrag,
  MIN_CLIP_DURATION,
  type ClipDragState,
} from '../app/TimelineView';

const PPS = 100; // px per second

function drag(over: Partial<ClipDragState> = {}): ClipDragState {
  return {
    clipId: 'c1',
    mode: 'move',
    startX: 500,
    initialStart: 2,
    initialDuration: 5,
    ...over,
  };
}

describe('computeClipDrag — move', () => {
  it('moves the clip start by the pointer delta (px → seconds)', () => {
    // +200px at 100px/s = +2s
    const r = computeClipDrag(drag({ mode: 'move' }), 700, PPS);
    expect(r).toEqual({ clipId: 'c1', start: 4, duration: 5 });
  });

  it('dragging left past 0 clamps start to 0 (no negative time)', () => {
    const r = computeClipDrag(drag({ mode: 'move', initialStart: 1 }), 0, PPS);
    expect(r!.start).toBe(0);
    expect(r!.duration).toBe(5); // duration unchanged when moving
  });

  it('duration is never changed in move mode', () => {
    const r = computeClipDrag(drag({ mode: 'move' }), 1234, PPS);
    expect(r!.duration).toBe(5);
  });
});

describe('computeClipDrag — resize-r', () => {
  it('extends duration by the delta', () => {
    const r = computeClipDrag(drag({ mode: 'resize-r' }), 800, PPS); // +300px = +3s
    expect(r).toEqual({ clipId: 'c1', start: 2, duration: 8 });
  });

  it('clamps duration to the minimum when shrunk too far', () => {
    const r = computeClipDrag(drag({ mode: 'resize-r' }), 0, PPS); // huge negative delta
    expect(r!.duration).toBe(MIN_CLIP_DURATION);
    expect(r!.start).toBe(2); // start unchanged on right-resize
  });
});

describe('computeClipDrag — resize-l', () => {
  it('moves start right and shrinks duration accordingly', () => {
    // +100px = +1s: start 2→3, duration 5→4
    const r = computeClipDrag(drag({ mode: 'resize-l' }), 600, PPS);
    expect(r).toEqual({ clipId: 'c1', start: 3, duration: 4 });
  });

  it('dragging left past 0 clamps start to 0 and grows duration', () => {
    // initialStart 2, drag far left → start 0, duration 5 + 2 = 7
    const r = computeClipDrag(drag({ mode: 'resize-l', initialStart: 2 }), -10_000, PPS);
    expect(r!.start).toBe(0);
    expect(r!.duration).toBe(7);
  });

  it('returns null when the left-trim would shrink below the minimum', () => {
    // Drag right almost to the clip end: newDuration ≤ MIN → null (ignored)
    const r = computeClipDrag(drag({ mode: 'resize-l', initialStart: 0, initialDuration: 5 }), 500 + 5 * PPS, PPS);
    expect(r).toBeNull();
  });
});

describe('computeClipDrag — guards', () => {
  it('returns null when pxPerSecond is 0 (no divide-by-zero)', () => {
    expect(computeClipDrag(drag(), 700, 0)).toBeNull();
  });

  it('returns null when pxPerSecond is negative', () => {
    expect(computeClipDrag(drag(), 700, -100)).toBeNull();
  });

  it('zero delta returns the clip unchanged (move)', () => {
    const r = computeClipDrag(drag({ mode: 'move' }), 500, PPS);
    expect(r).toEqual({ clipId: 'c1', start: 2, duration: 5 });
  });

  it('preserves the clipId', () => {
    const r = computeClipDrag(drag({ clipId: 'xyz' }), 600, PPS);
    expect(r!.clipId).toBe('xyz');
  });
});
