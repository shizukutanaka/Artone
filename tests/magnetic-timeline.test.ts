/**
 * MagneticTimeline Tests
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MagneticTimeline,
  serializeTimelineState,
  deserializeTimelineState,
  type Clip,
} from '../timeline/magnetic-timeline';
import { HistoryManager } from '../undo/history-manager';

// ─── helpers ───────────────────────────────────────────────────

function clipSpec(overrides: Partial<Omit<Clip, 'id' | 'selected'>> = {}): Omit<Clip, 'id' | 'selected'> {
  return {
    trackId: '',   // caller should set
    mediaId: 'media-1',
    name: 'Clip',
    startTime: 0,
    duration: 10,
    mediaIn: 0,
    mediaOut: 10,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    type: 'video',
    locked: false,
    ...overrides,
  };
}

// ─── Track management ──────────────────────────────────────────

describe('MagneticTimeline — tracks', () => {
  let tl: MagneticTimeline;
  let v1Id: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    v1Id = [...tl.getState().tracks.values()].find(t => t.name === 'V1')!.id;
  });

  it('creates 3 default tracks (V1, A1, A2)', () => {
    const tracks = [...tl.getState().tracks.values()];
    expect(tracks).toHaveLength(3);
    expect(tracks.map(t => t.name).sort()).toEqual(['A1', 'A2', 'V1']);
  });

  it('createTrack adds a new track and notifies', () => {
    const spy = vi.fn();
    tl.subscribe(spy);
    const t = tl.createTrack('V2', 'video');
    expect(tl.getState().tracks.has(t.id)).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('deleteTrack removes the track and its clips', () => {
    const clip = tl.addClip(clipSpec({ trackId: v1Id }));
    tl.deleteTrack(v1Id);
    expect(tl.getState().tracks.has(v1Id)).toBe(false);
    expect(tl.getState().clips.has(clip.id)).toBe(false);
  });
});

// ─── addClip / insertClip ────────────────────────────────────

describe('MagneticTimeline — addClip', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('adds a clip and returns it with an id', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 5 }));
    expect(clip.id).toBeTruthy();
    expect(tl.getState().clips.has(clip.id)).toBe(true);
  });

  it('ripples subsequent clips when inserting into the middle', () => {
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 5 }));
    // Insert a 4-second clip at time 5
    tl.addClip(clipSpec({ trackId: vid, startTime: 5, duration: 4 }));
    // b should have been shifted right by 4
    const updatedB = tl.getState().clips.get(b.id)!;
    expect(updatedB.startTime).toBeCloseTo(14);
    void a;
  });

  it('notifies listeners on add', () => {
    const spy = vi.fn();
    tl.subscribe(spy);
    tl.addClip(clipSpec({ trackId: vid }));
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('MagneticTimeline — insertClip', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('REGRESSION: insertClip ripples subsequent clips by duration only once', () => {
    // Before fix: shiftClipsAfter was called twice (once in insertClip, once in addClip)
    // so existing clips shifted by 2×duration instead of 1×.
    const existing = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 5 }));
    tl.insertClip(clipSpec({ trackId: vid, duration: 4 }), 0);
    const e = tl.getState().clips.get(existing.id)!;
    // Existing clip was at startTime=10; after inserting 4s at time 0, it should be at 14.
    expect(e.startTime).toBeCloseTo(14);
  });

  it('inserted clip is placed at the requested time', () => {
    const clip = tl.insertClip(clipSpec({ trackId: vid, duration: 5 }), 20);
    expect(tl.getState().clips.get(clip.id)!.startTime).toBeCloseTo(20);
  });
});

// ─── deleteClip ──────────────────────────────────────────────

describe('MagneticTimeline — deleteClip', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('removes the clip', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid }));
    tl.deleteClip(clip.id);
    expect(tl.getState().clips.has(clip.id)).toBe(false);
  });

  it('ripples subsequent clips to close the gap', () => {
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 5 }));
    tl.deleteClip(a.id);
    const bUpdated = tl.getState().clips.get(b.id)!;
    expect(bUpdated.startTime).toBeCloseTo(0);
  });

  it('removes the clip from selection', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid }));
    tl.selectClip(clip.id);
    tl.deleteClip(clip.id);
    expect(tl.getState().selection.has(clip.id)).toBe(false);
  });

  it('is a no-op for unknown id', () => {
    expect(() => tl.deleteClip('ghost')).not.toThrow();
  });
});

// ─── moveClip ────────────────────────────────────────────────

describe('MagneticTimeline — moveClip', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('moves clip to new position', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 5 }));
    tl.moveClip(clip.id, 20);
    expect(tl.getState().clips.get(clip.id)!.startTime).toBeCloseTo(20);
  });

  it('clamps startTime to 0', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 5, duration: 5 }));
    tl.moveClip(clip.id, -10);
    expect(tl.getState().clips.get(clip.id)!.startTime).toBe(0);
  });

  it('changes track when newTrackId is provided', () => {
    const aud = [...tl.getState().tracks.values()].find(t => t.type === 'audio')!.id;
    const clip = tl.addClip(clipSpec({ trackId: vid }));
    tl.moveClip(clip.id, 0, aud);
    expect(tl.getState().clips.get(clip.id)!.trackId).toBe(aud);
  });
});

// ─── trimClipStart / trimClipEnd ─────────────────────────────

describe('MagneticTimeline — trim', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('trimClipStart shrinks duration from left', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    tl.trimClipStart(clip.id, 3);
    const c = tl.getState().clips.get(clip.id)!;
    expect(c.startTime).toBeCloseTo(3);
    expect(c.duration).toBeCloseTo(7);
    expect(c.mediaIn).toBeCloseTo(3);
  });

  it('trimClipStart ignores if newStart would make duration <= 0', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 5 }));
    tl.trimClipStart(clip.id, 5); // newDuration = 0, should be ignored
    expect(tl.getState().clips.get(clip.id)!.duration).toBeCloseTo(5);
  });

  it('trimClipEnd shrinks duration from right', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    tl.trimClipEnd(clip.id, 7);
    const c = tl.getState().clips.get(clip.id)!;
    expect(c.duration).toBeCloseTo(7);
    expect(c.mediaOut).toBeCloseTo(7); // mediaIn=0, mediaOut=duration
  });

  it('trimClipEnd ignores if newEnd <= startTime', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 5, duration: 5 }));
    tl.trimClipEnd(clip.id, 5); // newDuration = 0, ignored
    expect(tl.getState().clips.get(clip.id)!.duration).toBeCloseTo(5);
  });

  it('REGRESSION: extending trimClipEnd ripples following clip (no overlap)', () => {
    // Before fix: ripple used newEnd, skipping clips in [oldEnd, newEnd) →
    // the extended clip overlapped the next clip.
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 10 }));
    tl.trimClipEnd(a.id, 15); // extend end 10 → 15 (delta +5)
    const ca = tl.getState().clips.get(a.id)!;
    const cb = tl.getState().clips.get(b.id)!;
    expect(ca.startTime + ca.duration).toBeCloseTo(15);
    expect(cb.startTime).toBeCloseTo(15); // rippled by +5
    // No overlap
    expect(ca.startTime + ca.duration).toBeLessThanOrEqual(cb.startTime + 1e-9);
  });

  it('shrinking trimClipEnd closes the gap to the following clip', () => {
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 10 }));
    tl.trimClipEnd(a.id, 7); // shrink end 10 → 7 (delta −3)
    const cb = tl.getState().clips.get(b.id)!;
    expect(cb.startTime).toBeCloseTo(7); // rippled left to close gap
  });

  it('REGRESSION: trimClipStart does not move the following clip (no overlap)', () => {
    // Before fix: shiftClipsAfter rippled subsequent clips left by delta even
    // though the trimmed clip's END position was unchanged → overlap.
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 10 }));
    tl.trimClipStart(a.id, 3); // head trim; end stays at 10
    const ca = tl.getState().clips.get(a.id)!;
    const cb = tl.getState().clips.get(b.id)!;
    expect(ca.startTime + ca.duration).toBeCloseTo(10); // end unchanged
    expect(cb.startTime).toBeCloseTo(10); // following clip stays put
    expect(ca.startTime + ca.duration).toBeLessThanOrEqual(cb.startTime + 1e-9);
  });
});

// ─── splitClip ───────────────────────────────────────────────

describe('MagneticTimeline — splitClip', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('splits a clip at a given time into two parts', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10, mediaIn: 0, mediaOut: 10 }));
    const parts = tl.splitClip(clip.id, 4)!;
    expect(parts).not.toBeNull();
    const [first, second] = parts;
    expect(first.duration).toBeCloseTo(4);
    expect(second.duration).toBeCloseTo(6);
    expect(second.startTime).toBeCloseTo(4);
    expect(second.mediaIn).toBeCloseTo(4);
  });

  it('returns null when splitTime is outside the clip', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    expect(tl.splitClip(clip.id, 0)).toBeNull();
    expect(tl.splitClip(clip.id, 10)).toBeNull();
    expect(tl.splitClip(clip.id, 15)).toBeNull();
  });

  it('both parts are stored in clips map', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const parts = tl.splitClip(clip.id, 5)!;
    expect(tl.getState().clips.has(parts[0].id)).toBe(true);
    expect(tl.getState().clips.has(parts[1].id)).toBe(true);
  });
});

// ─── closeGaps ───────────────────────────────────────────────

describe('MagneticTimeline — closeGaps', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('closes gaps between clips', () => {
    // Manually set startTimes to create gaps
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 5 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 5 })); // gap from 5-10
    tl.getState().clips.get(a.id)!.startTime = 0;
    tl.getState().clips.get(b.id)!.startTime = 10;
    tl.closeGaps(vid);
    // After closeGaps, b should start right after a
    const bAfter = tl.getState().clips.get(b.id)!;
    expect(bAfter.startTime).toBeCloseTo(5);
  });
});

// ─── Selection ───────────────────────────────────────────────

describe('MagneticTimeline — selection', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('selectClip selects the clip and sets clip.selected', () => {
    const clip = tl.addClip(clipSpec({ trackId: vid }));
    tl.selectClip(clip.id);
    expect(tl.getState().selection.has(clip.id)).toBe(true);
    expect(tl.getState().clips.get(clip.id)!.selected).toBe(true);
  });

  it('addToSelection=false replaces previous selection', () => {
    const a = tl.addClip(clipSpec({ trackId: vid, name: 'A' }));
    const b = tl.addClip(clipSpec({ trackId: vid, name: 'B' }));
    tl.selectClip(a.id);
    tl.selectClip(b.id, false); // exclusive select
    expect(tl.getState().selection.has(a.id)).toBe(false);
    expect(tl.getState().selection.has(b.id)).toBe(true);
  });

  it('REGRESSION: exclusive selectClip resets clip.selected on previously selected clips', () => {
    // Before fix: state.selection was cleared but clip.selected stayed true,
    // creating an inconsistency between the Set and clip.selected.
    const a = tl.addClip(clipSpec({ trackId: vid, name: 'A' }));
    const b = tl.addClip(clipSpec({ trackId: vid, name: 'B' }));
    tl.selectClip(a.id);
    tl.selectClip(b.id, false); // exclusive — should deselect A
    expect(tl.getState().clips.get(a.id)!.selected).toBe(false);
    expect(tl.getState().clips.get(b.id)!.selected).toBe(true);
  });

  it('addToSelection=true adds without clearing', () => {
    const a = tl.addClip(clipSpec({ trackId: vid, name: 'A' }));
    const b = tl.addClip(clipSpec({ trackId: vid, name: 'B' }));
    tl.selectClip(a.id);
    tl.selectClip(b.id, true);
    expect(tl.getState().selection.has(a.id)).toBe(true);
    expect(tl.getState().selection.has(b.id)).toBe(true);
  });

  it('deselectAll clears selection and resets clip.selected', () => {
    const a = tl.addClip(clipSpec({ trackId: vid }));
    tl.selectClip(a.id);
    tl.deselectAll();
    expect(tl.getState().selection.size).toBe(0);
    expect(tl.getState().clips.get(a.id)!.selected).toBe(false);
  });

  it('selectRange selects clips that overlap the range', () => {
    const a = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 5 }));
    const b = tl.addClip(clipSpec({ trackId: vid, startTime: 5, duration: 5 }));
    const c = tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 5 }));
    tl.selectRange(3, 8, vid);
    expect(tl.getState().selection.has(a.id)).toBe(true);
    expect(tl.getState().selection.has(b.id)).toBe(true);
    expect(tl.getState().selection.has(c.id)).toBe(false);
  });
});

// ─── Playhead / In-Out ───────────────────────────────────────

describe('MagneticTimeline — playhead & in/out', () => {
  let tl: MagneticTimeline;

  beforeEach(() => { tl = new MagneticTimeline(); });

  it('setPlayhead updates position', () => {
    tl.setPlayhead(30.5);
    expect(tl.getState().playhead).toBeCloseTo(30.5);
  });

  it('setPlayhead clamps to 0', () => {
    tl.setPlayhead(-5);
    expect(tl.getState().playhead).toBe(0);
  });

  it('setInPoint sets in-point at current playhead by default', () => {
    tl.setPlayhead(10);
    tl.setInPoint();
    expect(tl.getState().inPoint).toBeCloseTo(10);
  });

  it('setOutPoint sets explicit time', () => {
    tl.setOutPoint(25);
    expect(tl.getState().outPoint).toBeCloseTo(25);
  });

  it('clearInOutPoints resets both to null', () => {
    tl.setInPoint(5);
    tl.setOutPoint(15);
    tl.clearInOutPoints();
    expect(tl.getState().inPoint).toBeNull();
    expect(tl.getState().outPoint).toBeNull();
  });
});

// ─── Queries ─────────────────────────────────────────────────

describe('MagneticTimeline — queries', () => {
  let tl: MagneticTimeline;
  let vid: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
  });

  it('getTrackClips returns only clips on the given track', () => {
    const aud = [...tl.getState().tracks.values()].find(t => t.type === 'audio')!.id;
    tl.addClip(clipSpec({ trackId: vid }));
    tl.addClip(clipSpec({ trackId: aud }));
    expect(tl.getTrackClips(vid)).toHaveLength(1);
    expect(tl.getTrackClips(aud)).toHaveLength(1);
  });

  it('getClipsAtTime returns clips containing the given time', () => {
    tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    tl.addClip(clipSpec({ trackId: vid, startTime: 10, duration: 5 }));
    expect(tl.getClipsAtTime(5)).toHaveLength(1);
    expect(tl.getClipsAtTime(15)).toHaveLength(0);
  });

  it('getTimelineDuration returns the end of the last clip', () => {
    tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    tl.addClip(clipSpec({ trackId: vid, startTime: 15, duration: 5 }));
    expect(tl.getTimelineDuration()).toBeCloseTo(20);
  });

  it('getSnapPoints includes playhead and clip edges', () => {
    tl.setPlayhead(5);
    const clip = tl.addClip(clipSpec({ trackId: vid, startTime: 0, duration: 10 }));
    const pts = tl.getSnapPoints();
    expect(pts.some(p => p.type === 'playhead' && p.time === 5)).toBe(true);
    expect(pts.some(p => p.type === 'clip-start' && p.clipId === clip.id)).toBe(true);
    expect(pts.some(p => p.type === 'clip-end' && p.clipId === clip.id)).toBe(true);
  });
});

// ─── Subscribe ───────────────────────────────────────────────

describe('MagneticTimeline — subscribe / unsubscribe', () => {
  it('subscriber receives state on each change', () => {
    const tl = new MagneticTimeline();
    const vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
    const spy = vi.fn();
    tl.subscribe(spy);
    tl.addClip(clipSpec({ trackId: vid }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops future notifications', () => {
    const tl = new MagneticTimeline();
    const vid = [...tl.getState().tracks.values()].find(t => t.type === 'video')!.id;
    const spy = vi.fn();
    const unsub = tl.subscribe(spy);
    unsub();
    tl.addClip(clipSpec({ trackId: vid }));
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── stepFrame ───────────────────────────────────────────────

describe('MagneticTimeline — stepFrame', () => {
  let tl: MagneticTimeline;
  beforeEach(() => { tl = new MagneticTimeline(); });

  it('stepFrame(true) advances playhead by 1/30 second', () => {
    tl.setPlayhead(0);
    tl.stepFrame(true);
    expect(tl.getState().playhead).toBeCloseTo(1 / 30, 5);
  });

  it('stepFrame(false) moves playhead back by 1/30 second', () => {
    tl.setPlayhead(1.0);
    tl.stepFrame(false);
    expect(tl.getState().playhead).toBeCloseTo(1.0 - 1 / 30, 5);
  });

  it('stepFrame(false) clamps to 0 at start of timeline', () => {
    tl.setPlayhead(0);
    tl.stepFrame(false);
    expect(tl.getState().playhead).toBe(0);
  });
});

// ─── play / pause / stopPlayback ────────────────────────────

describe('MagneticTimeline — play / pause', () => {
  let tl: MagneticTimeline;
  beforeEach(() => { tl = new MagneticTimeline(); });

  it('pause() stops playback when interval is active', () => {
    vi.useFakeTimers();
    try {
      tl.play();
      tl.pause(); // calls stopPlayback() with active interval
      // Advance fake time — playhead should NOT move after pause
      const headBefore = tl.getState().playhead;
      vi.advanceTimersByTime(500);
      expect(tl.getState().playhead).toBe(headBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('togglePlayPause toggles between play and pause', () => {
    vi.useFakeTimers();
    try {
      tl.togglePlayPause(); // play
      tl.togglePlayPause(); // pause
      const head = tl.getState().playhead;
      vi.advanceTimersByTime(500);
      expect(tl.getState().playhead).toBe(head);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── serialize / deserialize (recovery JSON round-trip) ─────────

describe('serializeTimelineState / deserializeTimelineState', () => {
  let tl: MagneticTimeline;
  let vId: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vId = [...tl.getState().tracks.values()].find(t => t.name === 'V1')!.id;
  });

  it('REGRESSION: JSON.stringify(getState()) alone loses Maps/Set (the bug being fixed)', () => {
    tl.addClip(clipSpec({ trackId: vId, startTime: 0, duration: 5 }));
    // Demonstrate the data loss: a raw round-trip flattens Maps/Set to "{}".
    const naive = JSON.parse(JSON.stringify(tl.getState()));
    expect(Object.keys(naive.clips)).toHaveLength(0);  // Map → {} → no keys
    expect(Object.keys(naive.tracks)).toHaveLength(0);
    expect(naive.selection).toEqual({});               // Set → {}
  });

  it('serialize → JSON → deserialize preserves clips, tracks, and selection', () => {
    const clip = tl.addClip(clipSpec({ trackId: vId, startTime: 2, duration: 5 }));
    tl.selectClip(clip.id);
    const before = tl.getState();

    // Full recovery round-trip through a JSON string.
    const json = JSON.stringify(serializeTimelineState(before));
    const after = deserializeTimelineState(JSON.parse(json));

    expect(after.clips).toBeInstanceOf(Map);
    expect(after.tracks).toBeInstanceOf(Map);
    expect(after.selection).toBeInstanceOf(Set);
    expect(after.clips.size).toBe(before.clips.size);
    expect(after.tracks.size).toBe(before.tracks.size);
    expect(after.clips.get(clip.id)?.startTime).toBe(2);
    expect(after.selection.has(clip.id)).toBe(true);
  });

  it('preserves scalar state fields (playhead, zoom, in/out points)', () => {
    tl.setPlayhead(12);
    const before = tl.getState();
    const after = deserializeTimelineState(JSON.parse(JSON.stringify(serializeTimelineState(before))));
    expect(after.playhead).toBe(before.playhead);
    expect(after.zoom).toBe(before.zoom);
    expect(after.inPoint).toBe(before.inPoint);
    expect(after.outPoint).toBe(before.outPoint);
    expect(after.scrollX).toBe(before.scrollX);
  });

  it('deserialize is defensive against null / partial / corrupt input', () => {
    const empty = deserializeTimelineState(null);
    expect(empty.clips.size).toBe(0);
    expect(empty.tracks.size).toBe(0);
    expect(empty.selection.size).toBe(0);
    expect(empty.playhead).toBe(0);
    expect(empty.zoom).toBe(1);

    // Partial object with wrong-typed fields falls back to defaults.
    const partial = deserializeTimelineState({ playhead: 5 } as never);
    expect(partial.playhead).toBe(5);
    expect(partial.clips.size).toBe(0);
    expect(partial.inPoint).toBeNull();
  });

  it('serialized form is JSON-safe (no Map/Set survive)', () => {
    tl.addClip(clipSpec({ trackId: vId }));
    const s = serializeTimelineState(tl.getState());
    expect(Array.isArray(s.clips)).toBe(true);
    expect(Array.isArray(s.tracks)).toBe(true);
    expect(Array.isArray(s.selection)).toBe(true);
    // Survives a round-trip with all data intact.
    const reparsed = JSON.parse(JSON.stringify(s));
    expect(reparsed.clips).toHaveLength(s.clips.length);
  });
});

// ─── Lift / Extract (three-point editing) ──────────────────────

describe('MagneticTimeline — lift / extract', () => {
  let tl: MagneticTimeline;
  let vId: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vId = [...tl.getState().tracks.values()].find((t) => t.name === 'V1')!.id;
  });

  /** Helper: add a clip at [start, start+duration). */
  function add(start: number, duration: number) {
    return tl.addClip(clipSpec({ trackId: vId, startTime: start, duration }));
  }

  it('lift returns false when no in/out range is set', () => {
    add(0, 5);
    expect(tl.lift()).toBe(false);
  });

  it('lift removes the in→out range and leaves a gap (later clip unmoved)', () => {
    const a = add(0, 10);
    const b = add(10, 10); // [10,20)
    tl.setInPoint(2);
    tl.setOutPoint(6); // cut [2,6) from clip a
    expect(tl.lift()).toBe(true);

    const clips = tl.getState().clips;
    // Clip a split into head [0,2) + tail [6,10); clip b unchanged at 10.
    expect(clips.get(b.id)!.startTime).toBe(10);
    const aClips = [...clips.values()].filter((c) => c.id === a.id || c.name.includes('(2)'));
    expect(aClips.some((c) => c.startTime === 0 && c.duration === 2)).toBe(true);
    expect(aClips.some((c) => c.startTime === 6)).toBe(true);
  });

  it('extract removes the range and ripples later clips left to close the gap', () => {
    add(0, 10);
    const b = add(10, 10); // [10,20)
    tl.setInPoint(2);
    tl.setOutPoint(6); // remove 4s
    expect(tl.extract()).toBe(true);
    // Clip b ripples left by 4s → starts at 6.
    expect(tl.getState().clips.get(b.id)!.startTime).toBe(6);
  });

  it('extract over a whole clip deletes it and closes the gap', () => {
    add(0, 5);          // [0,5)
    const mid = add(5, 5);  // [5,10) — fully covered
    const last = add(10, 5); // [10,15)
    tl.setInPoint(5);
    tl.setOutPoint(10);
    expect(tl.extract()).toBe(true);
    expect(tl.getState().clips.has(mid.id)).toBe(false); // removed
    expect(tl.getState().clips.get(last.id)!.startTime).toBe(5); // rippled left by 5
  });

  it('in/out given in reverse order is normalised', () => {
    const b = add(10, 10);
    tl.setInPoint(6); // out < in on purpose
    tl.setOutPoint(2);
    expect(tl.extract()).toBe(true);
    expect(tl.getState().clips.get(b.id)!.startTime).toBe(6); // same as ordered
  });

  it('trackId restricts the edit to a single track', () => {
    const aId = [...tl.getState().tracks.values()].find((t) => t.name === 'A1')!.id;
    const onV = add(0, 10);
    const onA = tl.addClip(clipSpec({ trackId: aId, startTime: 0, duration: 10 }));
    tl.setInPoint(2);
    tl.setOutPoint(6);
    tl.lift(vId); // only V1
    // A1 clip is untouched (still a single clip at 0,10).
    expect(tl.getState().clips.get(onA.id)!.duration).toBe(10);
    void onV;
  });

  it('notifies subscribers when an edit is applied', () => {
    add(0, 10);
    tl.setInPoint(2);
    tl.setOutPoint(6);
    const spy = vi.fn();
    tl.subscribe(spy);
    tl.lift();
    expect(spy).toHaveBeenCalled();
  });
});

// ─── Lift / Extract reversibility (Command pattern, undo/redo) ──

describe('MagneticTimeline — liftCommand / extractCommand (undoable)', () => {
  let tl: MagneticTimeline;
  let vId: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vId = [...tl.getState().tracks.values()].find((t) => t.name === 'V1')!.id;
  });

  function add(start: number, duration: number) {
    return tl.addClip(clipSpec({ trackId: vId, startTime: start, duration }));
  }

  /** Stable, comparable snapshot of all clips (id → start/duration/mediaIn). */
  function snapshot() {
    return [...tl.getState().clips.values()]
      .map((c) => ({ id: c.id, startTime: c.startTime, duration: c.duration, mediaIn: c.mediaIn }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  it('liftCommand returns null when no in/out range is set', () => {
    add(0, 5);
    expect(tl.liftCommand()).toBeNull();
  });

  it('execute then undo restores the timeline exactly (split case)', () => {
    add(0, 20); // single clip; range inside → split into head + tail
    tl.setInPoint(8);
    tl.setOutPoint(12);
    const before = snapshot();

    const cmd = tl.liftCommand()!;
    expect(cmd).not.toBeNull();
    cmd.execute();
    // After lift: head [0,8) + tail [12,20) → 2 clips.
    expect(tl.getState().clips.size).toBe(2);

    cmd.undo();
    expect(snapshot()).toEqual(before); // back to the single original clip
    expect(tl.getState().clips.size).toBe(1);
  });

  it('redo re-applies the same edit (ids stable across undo/redo)', () => {
    add(0, 20);
    tl.setInPoint(8);
    tl.setOutPoint(12);
    const cmd = tl.liftCommand()!;
    cmd.execute();
    const afterFirst = snapshot();
    cmd.undo();
    cmd.redo();
    expect(snapshot()).toEqual(afterFirst); // identical, same split-tail id
  });

  it('extract undo restores rippled clips to their original positions', () => {
    add(0, 5);
    add(5, 5);   // fully covered by [5,10)
    add(10, 5);  // ripples left on extract
    tl.setInPoint(5);
    tl.setOutPoint(10);
    const before = snapshot();

    const cmd = tl.extractCommand()!;
    cmd.execute();
    expect(tl.getState().clips.size).toBe(2); // middle removed

    cmd.undo();
    expect(snapshot()).toEqual(before); // removed clip restored, ripple reverted
    expect(tl.getState().clips.size).toBe(3);
  });

  it('is undoable end-to-end through HistoryManager', () => {
    add(0, 20);
    tl.setInPoint(8);
    tl.setOutPoint(12);
    const before = snapshot();
    const history = new HistoryManager({ autoPersist: false });

    history.execute(tl.liftCommand()!);
    expect(tl.getState().clips.size).toBe(2);

    history.undo();
    expect(snapshot()).toEqual(before);

    history.redo();
    expect(tl.getState().clips.size).toBe(2);
  });
});

// ─── Structural commands: split / add / delete / closeGaps ─────

describe('MagneticTimeline — splitClipCommand (undoable)', () => {
  let tl: MagneticTimeline;
  let vId: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vId = [...tl.getState().tracks.values()].find((t) => t.name === 'V1')!.id;
  });

  function add(start: number, dur: number) {
    return tl.addClip(clipSpec({ trackId: vId, startTime: start, duration: dur, mediaIn: 0, mediaOut: dur }));
  }

  function snap() {
    return [...tl.getState().clips.values()]
      .map((c) => ({ id: c.id, startTime: c.startTime, duration: c.duration }))
      .sort((a, b) => a.startTime - b.startTime);
  }

  it('returns null when splitTime is at or outside clip bounds', () => {
    const c = add(0, 10);
    expect(tl.splitClipCommand(c.id, 0)).toBeNull();
    expect(tl.splitClipCommand(c.id, 10)).toBeNull();
    expect(tl.splitClipCommand(c.id, 15)).toBeNull();
    expect(tl.splitClipCommand('ghost', 5)).toBeNull();
  });

  it('execute() splits the clip into two parts', () => {
    const c = add(0, 10);
    const cmd = tl.splitClipCommand(c.id, 4)!;
    cmd.execute();
    const clips = snap();
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ startTime: 0, duration: 4 });
    expect(clips[1]).toMatchObject({ startTime: 4, duration: 6 });
  });

  it('undo() restores the original single clip', () => {
    const c = add(0, 10);
    const before = snap();
    const cmd = tl.splitClipCommand(c.id, 4)!;
    cmd.execute();
    expect(tl.getState().clips.size).toBe(2);
    cmd.undo();
    expect(snap()).toEqual(before);
    expect(tl.getState().clips.size).toBe(1);
  });

  it('redo() re-applies the split after undo', () => {
    const c = add(0, 10);
    const cmd = tl.splitClipCommand(c.id, 4)!;
    cmd.execute();
    const afterSnap = snap();
    cmd.undo();
    cmd.redo();
    expect(snap()).toEqual(afterSnap);
  });

  it('is undoable end-to-end through HistoryManager', () => {
    const c = add(0, 20);
    const before = snap();
    const history = new HistoryManager({ autoPersist: false });

    history.execute(tl.splitClipCommand(c.id, 8)!);
    expect(tl.getState().clips.size).toBe(2);

    history.undo();
    expect(snap()).toEqual(before);

    history.redo();
    expect(tl.getState().clips.size).toBe(2);
  });

  it('preserves mediaIn / mediaOut across undo-redo', () => {
    const c = tl.addClip(clipSpec({ trackId: vId, startTime: 0, duration: 10, mediaIn: 100, mediaOut: 110 }));
    const cmd = tl.splitClipCommand(c.id, 6)!;
    cmd.execute();
    const head = tl.getState().clips.get(c.id)!;
    expect(head.mediaIn).toBe(100);
    expect(head.mediaOut).toBe(106);
    cmd.undo();
    const restored = tl.getState().clips.get(c.id)!;
    expect(restored.mediaIn).toBe(100);
    expect(restored.mediaOut).toBe(110);
  });
});

describe('MagneticTimeline — deleteClipCommand / deleteSelectedCommand (undoable)', () => {
  let tl: MagneticTimeline;
  let vId: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vId = [...tl.getState().tracks.values()].find((t) => t.name === 'V1')!.id;
  });

  function add(start: number, dur: number) {
    return tl.addClip(clipSpec({ trackId: vId, startTime: start, duration: dur }));
  }

  function snap() {
    return [...tl.getState().clips.values()]
      .map((c) => ({ id: c.id, startTime: c.startTime, duration: c.duration }))
      .sort((a, b) => a.startTime - b.startTime);
  }

  it('deleteClipCommand returns null for unknown or locked clips', () => {
    expect(tl.deleteClipCommand('ghost')).toBeNull();
    const locked = tl.addClip(clipSpec({ trackId: vId, locked: true }));
    expect(tl.deleteClipCommand(locked.id)).toBeNull();
  });

  it('execute() deletes the clip and ripples the gap closed', () => {
    const a = add(0, 10);
    add(10, 5);         // b follows a
    const before = snap();
    void before;
    const cmd = tl.deleteClipCommand(a.id)!;
    cmd.execute();
    expect(tl.getState().clips.size).toBe(1);
    // b should have rippled to time 0
    const remaining = snap()[0];
    expect(remaining.startTime).toBe(0);
    expect(remaining.duration).toBe(5);
  });

  it('undo() restores the deleted clip and closes-gap ripple', () => {
    const a = add(0, 10);
    add(10, 5);
    const before = snap();
    const cmd = tl.deleteClipCommand(a.id)!;
    cmd.execute();
    cmd.undo();
    expect(snap()).toEqual(before);
  });

  it('deleteSelectedCommand returns null when nothing is selected', () => {
    add(0, 10);
    expect(tl.deleteSelectedCommand()).toBeNull();
  });

  it('deleteSelectedCommand deletes all selected clips atomically', () => {
    const a = add(0, 5);
    const b = add(5, 5);
    const c = add(10, 5);
    tl.selectClip(a.id);
    tl.selectClip(b.id, true);
    const before = snap();
    void before;
    const cmd = tl.deleteSelectedCommand()!;
    cmd.execute();
    // only c remains
    expect(tl.getState().clips.size).toBe(1);
    expect(tl.getState().clips.has(c.id)).toBe(true);
  });

  it('deleteSelectedCommand undo restores all clips', () => {
    const a = add(0, 5);
    const b = add(5, 5);
    tl.selectClip(a.id);
    tl.selectClip(b.id, true);
    const before = snap();
    const cmd = tl.deleteSelectedCommand()!;
    cmd.execute();
    cmd.undo();
    expect(snap()).toEqual(before);
  });

  it('deleteSelectedCommand skips locked clips', () => {
    const a = add(0, 5);
    const locked = tl.addClip(clipSpec({ trackId: vId, startTime: 5, duration: 5, locked: true }));
    tl.selectClip(a.id);
    tl.selectClip(locked.id, true);
    const cmd = tl.deleteSelectedCommand()!;
    cmd.execute();
    // locked clip survives
    expect(tl.getState().clips.has(locked.id)).toBe(true);
    expect(tl.getState().clips.has(a.id)).toBe(false);
  });
});

describe('MagneticTimeline — closeGapsCommand (undoable)', () => {
  let tl: MagneticTimeline;
  let vId: string;

  beforeEach(() => {
    tl = new MagneticTimeline();
    vId = [...tl.getState().tracks.values()].find((t) => t.name === 'V1')!.id;
  });

  function snap() {
    return [...tl.getState().clips.values()]
      .map((c) => ({ id: c.id, startTime: c.startTime, duration: c.duration }))
      .sort((a, b) => a.startTime - b.startTime);
  }

  it('returns null when there are no gaps', () => {
    tl.addClip(clipSpec({ trackId: vId, startTime: 0, duration: 10 }));
    tl.addClip(clipSpec({ trackId: vId, startTime: 10, duration: 5 }));
    expect(tl.closeGapsCommand(vId)).toBeNull();
  });

  it('execute() removes gaps and shifts clips left', () => {
    tl.addClip(clipSpec({ trackId: vId, startTime: 0, duration: 5 }));
    // Force a gap by directly setting startTime (bypassing magnetic ripple)
    const b = tl.addClip(clipSpec({ trackId: vId, startTime: 10, duration: 5 }));
    tl.getState().clips.get(b.id)!.startTime = 10; // already 10 from addClip above
    const cmd = tl.closeGapsCommand(vId)!;
    cmd.execute();
    const clips = snap();
    expect(clips[0].startTime).toBe(0);
    expect(clips[1].startTime).toBe(5); // gap closed
  });

  it('undo() restores the original gap', () => {
    tl.addClip(clipSpec({ trackId: vId, startTime: 0, duration: 5 }));
    const b = tl.addClip(clipSpec({ trackId: vId, startTime: 10, duration: 5 }));
    tl.getState().clips.get(b.id)!.startTime = 10;
    const before = snap();
    const cmd = tl.closeGapsCommand(vId)!;
    cmd.execute();
    cmd.undo();
    expect(snap()).toEqual(before);
  });
});
