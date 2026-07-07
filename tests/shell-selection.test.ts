/**
 * Tests for app/shell.tsx — applyClipSelectionEdit (Inspector -> timeline wiring).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { applyClipSelectionEdit } from '../app/shell';
import type { TimelineClip } from '../app/TimelineView';
import type { Selection } from '../app/Inspector';

function makeClips(): TimelineClip[] {
  return [
    { id: 'c1', trackId: 'v1', start: 0, duration: 5, name: 'Clip One' },
    { id: 'c2', trackId: 'v1', start: 5, duration: 3, name: 'Clip Two' },
  ];
}

function clipSelection(over: Partial<Selection & { type: 'clip' }> = {}): Selection {
  return {
    type: 'clip',
    id: 'c1',
    name: 'Clip One',
    duration: 5,
    startTime: 0,
    speed: 1,
    opacity: 1,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    ...over,
  };
}

describe('applyClipSelectionEdit', () => {
  it('REGRESSION: propagates a renamed clip back onto the timeline', () => {
    // Before fix: Inspector onChange only updated the local `selection`
    // object; the actual TimelineClip was never touched, so renaming a clip
    // in the Inspector had no visible effect on the timeline.
    const clips = makeClips();
    const next = clipSelection({ name: 'Renamed Clip' });
    const updated = applyClipSelectionEdit(clips, next);
    expect(updated.find((c) => c.id === 'c1')!.name).toBe('Renamed Clip');
  });

  it('propagates startTime and duration edits', () => {
    const clips = makeClips();
    const next = clipSelection({ startTime: 2, duration: 8 });
    const updated = applyClipSelectionEdit(clips, next);
    const c1 = updated.find((c) => c.id === 'c1')!;
    expect(c1.start).toBe(2);
    expect(c1.duration).toBe(8);
  });

  it('leaves other clips untouched', () => {
    const clips = makeClips();
    const next = clipSelection({ name: 'Renamed Clip' });
    const updated = applyClipSelectionEdit(clips, next);
    const c2 = updated.find((c) => c.id === 'c2')!;
    expect(c2).toEqual(clips[1]);
  });

  it('returns the same array reference for a non-clip selection (no-op)', () => {
    const clips = makeClips();
    const updated = applyClipSelectionEdit(clips, { type: 'none' });
    expect(updated).toBe(clips);
  });

  it('is a no-op when the selected id no longer matches any clip', () => {
    const clips = makeClips();
    const next = clipSelection({ id: 'ghost', name: 'Ghost' });
    const updated = applyClipSelectionEdit(clips, next);
    expect(updated).toEqual(clips);
  });
});
