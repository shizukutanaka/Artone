/**
 * MagneticTimeline Tests
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MagneticTimeline, type Clip } from '../timeline/magnetic-timeline';

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
