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
  clipDragModeForX,
  computeRulerClickTime,
  formatTime,
  CLIP_EDGE_PX,
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

  it('returns null when shrunk below the minimum (consistent with resize-l)', () => {
    // clientX=0 → dx = (0−500)/100 = −5 → newDuration = 5−5 = 0 ≤ MIN → null
    const r = computeClipDrag(drag({ mode: 'resize-r' }), 0, PPS);
    expect(r).toBeNull();
  });

  it('returns a valid result when duration stays above the minimum', () => {
    // clientX=550 → dx=+0.5s → duration 5.5 — well above MIN
    const r = computeClipDrag(drag({ mode: 'resize-r' }), 550, PPS);
    expect(r).toEqual({ clipId: 'c1', start: 2, duration: 5.5 });
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

describe('computeClipDrag — trim symmetry', () => {
  it('INVARIANT: resize-l and resize-r both return null when result is at or below minimum', () => {
    // resize-l: drag right until newDuration ≤ MIN
    const left = computeClipDrag(
      drag({ mode: 'resize-l', initialStart: 0, initialDuration: 5 }),
      500 + 5 * PPS,  // dx = +5s → newDuration = 0
      PPS,
    );
    // resize-r: drag left until newDuration ≤ MIN
    const right = computeClipDrag(
      drag({ mode: 'resize-r', initialStart: 0, initialDuration: 5 }),
      500 - 5 * PPS,  // dx = −5s → newDuration = 0
      PPS,
    );
    expect(left).toBeNull();
    expect(right).toBeNull();
  });

  it('INVARIANT: both trim modes accept a result exactly one frame above minimum', () => {
    const aboveMin = MIN_CLIP_DURATION + 1 / 60; // one frame above minimum
    const leftDx = 5 - aboveMin;  // shrink from 5s to aboveMin
    const left = computeClipDrag(
      drag({ mode: 'resize-l', initialStart: 0, initialDuration: 5 }),
      500 + leftDx * PPS,
      PPS,
    );
    const right = computeClipDrag(
      drag({ mode: 'resize-r', initialStart: 0, initialDuration: 5 }),
      500 - leftDx * PPS,
      PPS,
    );
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left!.duration).toBeCloseTo(aboveMin);
    expect(right!.duration).toBeCloseTo(aboveMin);
  });
});

// ─── clipDragModeForX (edge hit-test) ──────────────────────────────────────────

describe('clipDragModeForX', () => {
  const W = 100;

  it('left edge zone → resize-l', () => {
    expect(clipDragModeForX(0, W)).toBe('resize-l');
    expect(clipDragModeForX(CLIP_EDGE_PX - 0.1, W)).toBe('resize-l');
  });

  it('right edge zone → resize-r', () => {
    expect(clipDragModeForX(W, W)).toBe('resize-r');
    expect(clipDragModeForX(W - CLIP_EDGE_PX + 0.1, W)).toBe('resize-r');
  });

  it('interior → move', () => {
    expect(clipDragModeForX(W / 2, W)).toBe('move');
    expect(clipDragModeForX(CLIP_EDGE_PX, W)).toBe('move');          // boundary is exclusive
    expect(clipDragModeForX(W - CLIP_EDGE_PX, W)).toBe('move');
  });

  it('left edge wins when both zones overlap on a narrow clip', () => {
    // width < 2*edge: every x < edge is resize-l (checked first), matching the
    // original inline if/else-if order.
    expect(clipDragModeForX(0, 4)).toBe('resize-l');
    expect(clipDragModeForX(3, 4)).toBe('resize-l'); // 3 < 6 → resize-l before resize-r
  });
});

// ─── computeRulerClickTime (ruler click → playhead seconds) ───────────────────

describe('computeRulerClickTime', () => {
  const PPS = 100;

  it('REGRESSION: does not double-correct for scroll/header offset', () => {
    // Before fix: handleRulerClick added `+ scrollX - HEADER_W` on top of
    // rect.left, which already accounts for both — clicking exactly at the
    // ruler's left edge (rectLeft) must land at time 0, not at a negative
    // offset masked by the Math.max(0, ...) clamp.
    expect(computeRulerClickTime(500, 500, PPS)).toBe(0);
  });

  it('click 5 seconds in (500px at 100px/s) from the ruler origin', () => {
    expect(computeRulerClickTime(1000, 500, PPS)).toBe(5);
  });

  it('clamps to 0 when clicking left of the ruler origin', () => {
    expect(computeRulerClickTime(400, 500, PPS)).toBe(0);
  });

  it('result is independent of viewport position — only the click-to-rect delta matters', () => {
    // Same 5s click, but the whole ruler (and click) shifted 300px right —
    // e.g. a wider left panel or different scroll position.
    expect(computeRulerClickTime(1300, 800, PPS)).toBe(5);
  });
});

describe('formatTime — ruler label (m:ss.cc)', () => {
  it('formats whole and half seconds (the values the ruler actually emits)', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(0.5)).toBe('0:00.50');
    expect(formatTime(65)).toBe('1:05.00');
    expect(formatTime(90.5)).toBe('1:30.50');
  });

  it('REGRESSION: centisecond field is not truncated-down by float error', () => {
    // Previously `Math.floor((seconds % 1) * 100)`: (4.13 % 1) * 100 = 12.999…
    // floored to 12, so 4.13s rendered "0:04.12". Rounding to integer
    // centiseconds first is exact. (Same bug fixed in the caption/marker
    // formatters; here the ruler only feeds 0.5s multiples today, but the
    // helper must be correct for any input.)
    expect(formatTime(4.13)).toBe('0:04.13');
    expect(formatTime(0.29)).toBe('0:00.29');
    // Rounding carries into seconds correctly.
    expect(formatTime(59.9996)).toBe('1:00.00');
  });
});
