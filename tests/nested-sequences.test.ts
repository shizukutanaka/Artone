/**
 * Tests for timeline/nested-sequences.ts — NestedSequenceManager
 *
 * Covers sequence CRUD, nesting/unnesting (incl. trimmed round-trip),
 * compound clips, clip/track ops, duration, parent chains, and the two
 * regression fixes: unnest mediaIn offset and duplicate settings isolation.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NestedSequenceManager } from '../timeline/nested-sequences';
import type { Clip } from '../timeline/nested-sequences';

let mgr: NestedSequenceManager;

beforeEach(() => {
  mgr = new NestedSequenceManager();
});

/** Add a media clip to a sequence with sensible defaults. */
function addClip(seqId: string, over: Partial<Omit<Clip, 'id'>>): Clip {
  const trackId = mgr.getSequence(seqId)!.tracks[0].id;
  return mgr.addClip(seqId, {
    trackId,
    type: 'media',
    startTime: 0,
    duration: 10,
    mediaIn: 0,
    mediaOut: 10,
    speed: 1,
    reversed: false,
    label: 'clip',
    color: '#fff',
    locked: false,
    disabled: false,
    ...over,
  })!;
}

// ─── Sequence management ──────────────────────────────────────────────────────

describe('createSequence', () => {
  it('creates a sequence with default tracks and settings', () => {
    const seq = mgr.createSequence('Main');
    expect(seq.name).toBe('Main');
    expect(seq.tracks.length).toBe(4); // 2 video + 2 audio
    expect(seq.settings.width).toBe(1920);
    expect(seq.duration).toBe(0);
    expect(seq.nested).toBe(false);
  });

  it('applies partial settings overrides', () => {
    const seq = mgr.createSequence('4K', { width: 3840, height: 2160, fps: 24 });
    expect(seq.settings.width).toBe(3840);
    expect(seq.settings.fps).toBe(24);
    expect(seq.settings.sampleRate).toBe(48000); // default retained
  });

  it('first sequence becomes active', () => {
    const seq = mgr.createSequence('A');
    expect(mgr.getActiveSequence()?.id).toBe(seq.id);
  });
});

describe('deleteSequence', () => {
  it('removes a sequence', () => {
    const seq = mgr.createSequence('A');
    mgr.deleteSequence(seq.id);
    expect(mgr.getSequence(seq.id)).toBeUndefined();
  });

  it('throws when deleting a sequence used as nested', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    const nested = mgr.nestSequence(main.id, [c.id])!;
    expect(() => mgr.deleteSequence(nested.id)).toThrow(/used as nested/);
  });

  it('reassigns active sequence after deleting the active one', () => {
    const a = mgr.createSequence('A');
    const b = mgr.createSequence('B');
    mgr.setActiveSequence(a.id);
    mgr.deleteSequence(a.id);
    expect(mgr.getActiveSequence()?.id).toBe(b.id);
  });
});

// ─── duplicateSequence (settings isolation regression) ───────────────────────

describe('duplicateSequence', () => {
  it('returns null for unknown id', () => {
    expect(mgr.duplicateSequence('nope')).toBeNull();
  });

  it('duplicates clips and tracks with fresh ids', () => {
    const a = mgr.createSequence('A');
    addClip(a.id, {});
    const dup = mgr.duplicateSequence(a.id)!;
    expect(dup.id).not.toBe(a.id);
    expect(dup.name).toBe('A Copy');
    expect(dup.clips.length).toBe(1);
    expect(dup.clips[0].id).not.toBe(a.clips[0].id);
    expect(dup.tracks[0].id).not.toBe(a.tracks[0].id);
  });

  it('remaps clip trackIds onto the duplicate tracks', () => {
    const a = mgr.createSequence('A');
    addClip(a.id, {});
    const dup = mgr.duplicateSequence(a.id)!;
    const dupTrackIds = new Set(dup.tracks.map(t => t.id));
    expect(dupTrackIds.has(dup.clips[0].trackId)).toBe(true);
  });

  it('REGRESSION: editing the duplicate settings does not mutate the original', () => {
    const a = mgr.createSequence('A', { width: 1920 });
    const dup = mgr.duplicateSequence(a.id)!;
    dup.settings.width = 1280;
    expect(mgr.getSequence(a.id)!.settings.width).toBe(1920);
  });
});

// ─── Nesting ──────────────────────────────────────────────────────────────────

describe('nestSequence', () => {
  it('returns null for empty clip list or unknown sequence', () => {
    const main = mgr.createSequence('Main');
    expect(mgr.nestSequence(main.id, [])).toBeNull();
    expect(mgr.nestSequence('nope', ['x'])).toBeNull();
  });

  it('moves selected clips into a new nested sequence', () => {
    const main = mgr.createSequence('Main');
    const c1 = addClip(main.id, { startTime: 5, duration: 10 });
    const c2 = addClip(main.id, { startTime: 15, duration: 10 });
    const nested = mgr.nestSequence(main.id, [c1.id, c2.id])!;

    expect(nested.nested).toBe(true);
    expect(nested.parentId).toBe(main.id);
    expect(nested.clips.length).toBe(2);
    // Nested clips are rebased to start at 0
    expect(Math.min(...nested.clips.map(c => c.startTime))).toBe(0);
    // Source now has a single nested clip ref
    const refs = mgr.getSequence(main.id)!.clips;
    expect(refs.length).toBe(1);
    expect(refs[0].type).toBe('nested');
    expect(refs[0].startTime).toBe(5);   // minStart
    expect(refs[0].duration).toBe(20);   // maxEnd(25) - minStart(5)
  });

  it('nested sequence duration equals the clip span', () => {
    const main = mgr.createSequence('Main');
    const c1 = addClip(main.id, { startTime: 5, duration: 10 });
    const c2 = addClip(main.id, { startTime: 15, duration: 10 });
    const nested = mgr.nestSequence(main.id, [c1.id, c2.id])!;
    expect(nested.duration).toBe(20);
  });
});

// ─── Unnesting (mediaIn regression) ──────────────────────────────────────────

describe('unnestSequence', () => {
  it('round-trips clip positions for an untrimmed nested clip', () => {
    const main = mgr.createSequence('Main');
    const c1 = addClip(main.id, { startTime: 5, duration: 10 });
    const c2 = addClip(main.id, { startTime: 20, duration: 10 });
    const originalStarts = [5, 20];

    const nested = mgr.nestSequence(main.id, [c1.id, c2.id])!;
    const ref = mgr.getSequence(main.id)!.clips.find(c => c.sequenceId === nested.id)!;

    mgr.unnestSequence(main.id, ref.id);
    const restored = mgr.getSequence(main.id)!.clips.map(c => c.startTime).sort((a, b) => a - b);
    expect(restored).toEqual(originalStarts);
  });

  it('REGRESSION: respects nested clip mediaIn (trimmed) on unnest', () => {
    const main = mgr.createSequence('Main');
    const c1 = addClip(main.id, { startTime: 0, duration: 10 });
    const c2 = addClip(main.id, { startTime: 10, duration: 10 });
    const nested = mgr.nestSequence(main.id, [c1.id, c2.id])!;
    const ref = mgr.getSequence(main.id)!.clips.find(c => c.sequenceId === nested.id)!;

    // Trim the nested ref: skip the first 5s of the nested content and move it.
    ref.mediaIn = 5;
    ref.startTime = 100;

    mgr.unnestSequence(main.id, ref.id);
    const starts = mgr.getSequence(main.id)!.clips.map(c => c.startTime).sort((a, b) => a - b);
    // Internal starts were 0 and 10; parent = internal + startTime(100) - mediaIn(5)
    expect(starts).toEqual([95, 105]);
  });

  it('REGRESSION: applies the nested clip speed (retime) on unnest', () => {
    // unnestSequence must be the exact inverse of renderNestedFrame's
    //   nestedTime = (t - startTime) * speed + mediaIn.
    // Before the fix it omitted the `/ speed` on position and never rescaled
    // the child duration or composed the child's own speed, so a retimed
    // nested clip (speed !== 1) unnested to wrong positions AND durations —
    // the restored clips no longer reproduced the same frames.
    const main = mgr.createSequence('Main');
    const c1 = addClip(main.id, { startTime: 0, duration: 10, speed: 1 });
    const c2 = addClip(main.id, { startTime: 10, duration: 10, speed: 1 });
    const nested = mgr.nestSequence(main.id, [c1.id, c2.id])!;
    const ref = mgr.getSequence(main.id)!.clips.find(c => c.sequenceId === nested.id)!;

    // Retime the nested ref 2× (Artone convention: speed > 1 = faster) and move it.
    ref.speed = 2;
    ref.mediaIn = 0;
    ref.startTime = 100;

    mgr.unnestSequence(main.id, ref.id);
    const restored = mgr
      .getSequence(main.id)!
      .clips.slice()
      .sort((a, b) => a.startTime - b.startTime);

    // Internal starts 0 and 10 → parent = internal/2 + 100 = 100 and 105.
    expect(restored.map(c => c.startTime)).toEqual([100, 105]);
    // On-timeline duration compresses by 1/speed: 10 → 5.
    expect(restored.map(c => c.duration)).toEqual([5, 5]);
    // Child retime composes with the nested ref's: 1 * 2 = 2.
    expect(restored.map(c => c.speed)).toEqual([2, 2]);
  });

  it('returns false for a non-nested clip', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    expect(mgr.unnestSequence(main.id, c.id)).toBe(false);
  });

  it('deletes the nested sequence when no other references remain', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    const nested = mgr.nestSequence(main.id, [c.id])!;
    const ref = mgr.getSequence(main.id)!.clips.find(x => x.sequenceId === nested.id)!;
    mgr.unnestSequence(main.id, ref.id);
    expect(mgr.getSequence(nested.id)).toBeUndefined();
  });
});

// ─── Compound clips ───────────────────────────────────────────────────────────

describe('createCompoundClip', () => {
  it('creates a compound ref and marks the clip type compound', () => {
    const main = mgr.createSequence('Main');
    const c1 = addClip(main.id, { startTime: 0, duration: 10 });
    const c2 = addClip(main.id, { startTime: 10, duration: 10 });
    const ref = mgr.createCompoundClip(main.id, [c1.id, c2.id], 'Cmp')!;
    expect(ref.instances.length).toBe(1);
    const clip = mgr.getSequence(main.id)!.clips.find(c => c.id === ref.instances[0])!;
    expect(clip.type).toBe('compound');
  });

  it('duplicateCompoundInstance adds a linked instance', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, { startTime: 0, duration: 10 });
    const ref = mgr.createCompoundClip(main.id, [c.id])!;
    const inst = mgr.duplicateCompoundInstance(main.id, ref.instances[0])!;
    expect(inst.type).toBe('compound');
    expect(ref.instances.length).toBe(2);
  });
});

// ─── Clip / track ops & duration ──────────────────────────────────────────────

describe('clip operations', () => {
  it('addClip updates duration', () => {
    const seq = mgr.createSequence('A');
    addClip(seq.id, { startTime: 5, duration: 10 });
    expect(mgr.getSequence(seq.id)!.duration).toBe(15);
  });

  it('removeClip recomputes duration (and handles emptied sequence)', () => {
    const seq = mgr.createSequence('A');
    const c = addClip(seq.id, { startTime: 5, duration: 10 });
    mgr.removeClip(seq.id, c.id);
    expect(mgr.getSequence(seq.id)!.duration).toBe(0);
  });

  it('moveClip clamps startTime to >= 0', () => {
    const seq = mgr.createSequence('A');
    const c = addClip(seq.id, { startTime: 5 });
    mgr.moveClip(seq.id, c.id, -100);
    expect(mgr.getSequence(seq.id)!.clips[0].startTime).toBe(0);
  });
});

describe('track operations', () => {
  it('addTrack appends a typed track', () => {
    const seq = mgr.createSequence('A');
    const before = seq.tracks.length;
    mgr.addTrack(seq.id, 'video');
    expect(mgr.getSequence(seq.id)!.tracks.length).toBe(before + 1);
  });

  it('removeTrack drops the track and its clips', () => {
    const seq = mgr.createSequence('A');
    const trackId = seq.tracks[0].id;
    addClip(seq.id, { trackId });
    mgr.removeTrack(seq.id, trackId);
    const s = mgr.getSequence(seq.id)!;
    expect(s.tracks.find(t => t.id === trackId)).toBeUndefined();
    expect(s.clips.some(c => c.trackId === trackId)).toBe(false);
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('navigation', () => {
  it('openNested switches active sequence to the nested one', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    const nested = mgr.nestSequence(main.id, [c.id])!;
    const ref = mgr.getSequence(main.id)!.clips.find(x => x.sequenceId === nested.id)!;
    const opened = mgr.openNested(ref.id);
    expect(opened?.id).toBe(nested.id);
    expect(mgr.getActiveSequence()?.id).toBe(nested.id);
  });

  it('closeNested returns to the parent', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    const nested = mgr.nestSequence(main.id, [c.id])!;
    const ref = mgr.getSequence(main.id)!.clips.find(x => x.sequenceId === nested.id)!;
    mgr.openNested(ref.id);
    mgr.closeNested();
    expect(mgr.getActiveSequence()?.id).toBe(main.id);
  });

  it('getParentChain returns root→leaf order', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    const nested = mgr.nestSequence(main.id, [c.id])!;
    const chain = mgr.getParentChain(nested.id);
    expect(chain[0].id).toBe(main.id);
    expect(chain[chain.length - 1].id).toBe(nested.id);
  });

  it('getTopLevelSequences excludes nested ones', () => {
    const main = mgr.createSequence('Main');
    const c = addClip(main.id, {});
    mgr.nestSequence(main.id, [c.id]);
    const tops = mgr.getTopLevelSequences();
    expect(tops.every(s => !s.nested)).toBe(true);
    expect(tops.some(s => s.id === main.id)).toBe(true);
  });
});

// ─── Cycle safety (corrupted / imported project data) ─────────────────────────

describe('cycle safety', () => {
  it('getParentChain does not hang on a parentId cycle', () => {
    const a = mgr.createSequence('A');
    const b = mgr.createSequence('B');
    // Simulate a corrupted/imported project where parentId links form a cycle.
    mgr.getSequence(a.id)!.parentId = b.id;
    mgr.getSequence(b.id)!.parentId = a.id;
    const chain = mgr.getParentChain(a.id);
    // Terminates (no infinite loop) and visits each sequence at most once.
    expect(chain.length).toBe(2);
    expect(new Set(chain.map(s => s.id)).size).toBe(chain.length);
  });

  it('renderNestedFrame does not stack-overflow on a self-referential nested clip', async () => {
    // OffscreenCanvas is unavailable in jsdom; install a minimal stub so the
    // recursion path runs and the cycle guard (not a crash) is what stops it.
    interface CanvasGlobal { OffscreenCanvas?: unknown }
    const g = globalThis as unknown as CanvasGlobal;
    const had = 'OffscreenCanvas' in g;
    const prev = g.OffscreenCanvas;
    const ctxStub = {
      fillStyle: '', fillRect: () => {}, putImageData: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    };
    g.OffscreenCanvas = class { getContext() { return ctxStub; } };
    try {
      const a = mgr.createSequence('A');
      const trackId = mgr.getSequence(a.id)!.tracks[0].id;
      // Nested clip pointing back at its own sequence → infinite recursion
      // without the guard.
      mgr.addClip(a.id, {
        trackId, type: 'nested', startTime: 0, duration: 5, mediaIn: 0, mediaOut: 5,
        speed: 1, reversed: false, sequenceId: a.id, label: 'self', color: '#fff',
        locked: false, disabled: false,
      });
      // Should resolve (not throw RangeError: Maximum call stack size exceeded).
      await expect(mgr.renderNestedFrame(a.id, 1)).resolves.toBeDefined();
    } finally {
      if (had) g.OffscreenCanvas = prev; else delete g.OffscreenCanvas;
    }
  });
});

// ─── Subscriptions ────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('notifies listeners on mutation and unsubscribes cleanly', () => {
    const seq = mgr.createSequence('A');
    let calls = 0;
    const unsub = mgr.subscribe(() => { calls++; });
    addClip(seq.id, {});
    expect(calls).toBeGreaterThan(0);
    const after = calls;
    unsub();
    addClip(seq.id, {});
    expect(calls).toBe(after);
  });
});
