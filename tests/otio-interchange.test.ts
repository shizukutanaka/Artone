/**
 * Tests for interchange/otio.ts — OTIOExporter / OTIOImporter / OTIOValidator
 *
 * Covers round-trip fidelity (export → import gives back equivalent data),
 * gap filling, rate conversion, speed factor (LinearTimeWarp), markers,
 * transitions, import-loss reporting, validator, error handling, and two
 * regression fixes:
 *   1. fromRationalTime(rt, fps) must not produce Infinity when rt.rate === 0.
 *   2. fromOTIOTrack: transitionIn / transitionOut must be separate copies so
 *      mutating one does not alias-mutate the other.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  OTIOExporter,
  OTIOImporter,
  OTIOValidator,
  otio,
} from '../interchange/otio';
import type { ArtoneTimeline, ArtoneClip, ArtoneTrack } from '../interchange/otio';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClip(over: Partial<ArtoneClip> = {}): ArtoneClip {
  return {
    id: 'c1',
    name: 'Clip 1',
    startFrame: 0,
    durationFrames: 30,
    sourceInFrame: 0,
    mediaUrl: 'file:///video.mp4',
    effects: [],
    markers: [],
    enabled: true,
    ...over,
  };
}

function makeTrack(over: Partial<ArtoneTrack> = {}): ArtoneTrack {
  return {
    name: 'Video 1',
    kind: 'video',
    clips: [makeClip()],
    enabled: true,
    ...over,
  };
}

function makeTimeline(over: Partial<ArtoneTimeline> = {}): ArtoneTimeline {
  return {
    name: 'Test Timeline',
    fps: 30,
    videoTracks: [makeTrack()],
    audioTracks: [],
    markers: [],
    ...over,
  };
}

// ─── OTIOValidator ────────────────────────────────────────────────────────────

describe('OTIOValidator', () => {
  it('accepts a well-formed Timeline.1 object', () => {
    const exp = new OTIOExporter();
    const tl = makeTimeline();
    const r = new OTIOValidator().validate(exp.export(tl));
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects missing schema', () => {
    const r = new OTIOValidator().validate({});
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('Timeline.1'))).toBe(true);
  });

  it('rejects wrong schema version', () => {
    const r = new OTIOValidator().validate({ OTIO_SCHEMA: 'Timeline.2', name: 'x', tracks: { OTIO_SCHEMA: 'Stack.1' } });
    expect(r.valid).toBe(false);
  });

  it('rejects missing name', () => {
    const r = new OTIOValidator().validate({ OTIO_SCHEMA: 'Timeline.1', tracks: { OTIO_SCHEMA: 'Stack.1' } });
    expect(r.errors.some(e => e.includes('name'))).toBe(true);
  });
});

// ─── OTIOExporter ─────────────────────────────────────────────────────────────

describe('OTIOExporter — basic structure', () => {
  it('produces Timeline.1 root schema', () => {
    const exp = new OTIOExporter();
    const out = exp.export(makeTimeline());
    expect(out.OTIO_SCHEMA).toBe('Timeline.1');
    expect(out.name).toBe('Test Timeline');
    expect(out.global_start_time?.rate).toBe(30);
  });

  it('video and audio tracks are both exported into the stack', () => {
    const exp = new OTIOExporter();
    const tl = makeTimeline({ audioTracks: [makeTrack({ name: 'Audio 1', kind: 'audio' })] });
    const out = exp.export(tl);
    expect(out.tracks.children).toHaveLength(2);
    expect(out.tracks.children[0].kind).toBe('Video');
    expect(out.tracks.children[1].kind).toBe('Audio');
  });

  it('clip source_range matches startFrame and durationFrames', () => {
    const exp = new OTIOExporter();
    const clip = makeClip({ startFrame: 0, durationFrames: 60, sourceInFrame: 10 });
    const out = exp.export(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] }));
    const otioClip = out.tracks.children[0].children[0] as { source_range: { duration: { value: number }; start_time: { value: number } } };
    expect(otioClip.source_range.duration.value).toBe(60);
    expect(otioClip.source_range.start_time.value).toBe(10);
  });

  it('exportToString produces valid JSON', () => {
    const exp = new OTIOExporter();
    const json = exp.exportToString(makeTimeline());
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).OTIO_SCHEMA).toBe('Timeline.1');
  });

  it('insertss a Gap when clip does not start at cursor', () => {
    const exp = new OTIOExporter();
    const clip = makeClip({ startFrame: 15, durationFrames: 30 }); // starts at frame 15
    const out = exp.export(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] }));
    const children = out.tracks.children[0].children;
    expect(children[0].OTIO_SCHEMA).toBe('Gap.1');
    expect((children[0] as { source_range: { duration: { value: number } } }).source_range.duration.value).toBe(15);
  });

  it('exports markers on the stack', () => {
    const exp = new OTIOExporter();
    const tl = makeTimeline({ markers: [{ frame: 30, duration: 1, color: 'red', name: 'Scene 1' }] });
    const out = exp.export(tl);
    expect(out.tracks.markers).toHaveLength(1);
    expect(out.tracks.markers[0].color).toBe('RED');
    expect(out.tracks.markers[0].name).toBe('Scene 1');
  });

  it('emits LinearTimeWarp.1 for speedFactor ≠ 1', () => {
    const exp = new OTIOExporter();
    const clip = makeClip({ speedFactor: 2.0 }); // 2x fast
    const out = exp.export(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] }));
    const children = out.tracks.children[0].children;
    const otioClip = children[0] as { effects: Array<{ OTIO_SCHEMA: string; time_scalar: number }> };
    const ltw = otioClip.effects.find(e => e.OTIO_SCHEMA === 'LinearTimeWarp.1');
    expect(ltw).toBeDefined();
    expect(ltw!.time_scalar).toBeCloseTo(0.5, 5); // reciprocal
  });

  it('does NOT emit LinearTimeWarp.1 for speedFactor = 1', () => {
    const exp = new OTIOExporter();
    const clip = makeClip({ speedFactor: 1.0 });
    const out = exp.export(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] }));
    const otioClip = out.tracks.children[0].children[0] as { effects: Array<{ OTIO_SCHEMA: string }> };
    expect(otioClip.effects.some(e => e.OTIO_SCHEMA === 'LinearTimeWarp.1')).toBe(false);
  });

  it('exports a dissolve transition as SMPTE_Dissolve', () => {
    const exp = new OTIOExporter();
    const c1 = makeClip({ id: 'c1', name: 'A', startFrame: 0, durationFrames: 30,
      transitionOut: { type: 'dissolve', inFrames: 5, outFrames: 5 } });
    const c2 = makeClip({ id: 'c2', name: 'B', startFrame: 30, durationFrames: 30 });
    const out = exp.export(makeTimeline({ videoTracks: [makeTrack({ clips: [c1, c2] })] }));
    const children = out.tracks.children[0].children;
    const transition = children.find(c => c.OTIO_SCHEMA === 'Transition.1') as { transition_type: string } | undefined;
    expect(transition).toBeDefined();
    expect(transition!.transition_type).toBe('SMPTE_Dissolve');
  });
});

// ─── OTIOImporter ─────────────────────────────────────────────────────────────

describe('OTIOImporter — basic import', () => {
  it('importFromString round-trips a simple timeline', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const tl = makeTimeline({ name: 'My Film' });
    const json = exp.exportToString(tl);
    const imported = imp.importFromString(json);
    expect(imported.name).toBe('My Film');
    expect(imported.fps).toBe(30);
    expect(imported.videoTracks).toHaveLength(1);
    expect(imported.videoTracks[0].clips).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    const imp = new OTIOImporter();
    expect(() => imp.importFromString('{ bad json')).toThrow(/Invalid OTIO JSON/);
  });

  it('throws on wrong OTIO_SCHEMA', () => {
    const imp = new OTIOImporter();
    expect(() => imp.importFromString(JSON.stringify({ OTIO_SCHEMA: 'Clip.1', name: 'x' }))).toThrow(/Unsupported/);
  });

  it('restores clip name, startFrame, durationFrames, sourceInFrame', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const clip = makeClip({ name: 'Hero Shot', startFrame: 0, durationFrames: 48, sourceInFrame: 12 });
    const tl = makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] });
    const imported = imp.importFromString(exp.exportToString(tl));
    const c = imported.videoTracks[0].clips[0];
    expect(c.name).toBe('Hero Shot');
    expect(c.durationFrames).toBe(48);
    expect(c.sourceInFrame).toBe(12);
  });

  it('restores speedFactor via LinearTimeWarp round-trip', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const clip = makeClip({ speedFactor: 2.0 });
    const imported = imp.importFromString(exp.exportToString(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] })));
    expect(imported.videoTracks[0].clips[0].speedFactor).toBeCloseTo(2.0, 4);
  });

  it('restores markers with color conversion (RED → red)', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const tl = makeTimeline({ markers: [{ frame: 60, duration: 2, color: 'blue', name: 'Cut' }] });
    const imported = imp.importFromString(exp.exportToString(tl));
    expect(imported.markers).toHaveLength(1);
    expect(imported.markers[0].color).toBe('blue');
    expect(imported.markers[0].frame).toBe(60);
  });

  it('applies targetFps rate conversion', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const tl = makeTimeline({ fps: 24, videoTracks: [makeTrack({ clips: [makeClip({ durationFrames: 24 })] })] });
    const json = exp.exportToString(tl);
    const imported = imp.importFromString(json, 30);
    // 24 frames at 24fps = 1 second = 30 frames at 30fps
    expect(imported.videoTracks[0].clips[0].durationFrames).toBe(30);
  });

  it('handles a gap by advancing cursor (no clip emitted)', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    // Clip starting at frame 15 produces a gap of 15 frames before it
    const clip = makeClip({ startFrame: 15, durationFrames: 30 });
    const imported = imp.importFromString(
      exp.exportToString(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] }))
    );
    // Only 1 clip; the gap is absorbed into the cursor
    expect(imported.videoTracks[0].clips).toHaveLength(1);
    expect(imported.videoTracks[0].clips[0].startFrame).toBe(15);
  });
});

// ─── OTIOImporter importWithReport ───────────────────────────────────────────

describe('OTIOImporter.importWithReport', () => {
  it('returns empty losses for a clean Artone-exported file', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const json = exp.exportToString(makeTimeline());
    const { losses } = imp.importWithReport(json);
    expect(losses).toHaveLength(0);
  });

  it('reports MissingReference loss for clips with no media', () => {
    const json = JSON.stringify({
      OTIO_SCHEMA: 'Timeline.1',
      name: 'T',
      global_start_time: { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 0 },
      tracks: {
        OTIO_SCHEMA: 'Stack.1', effects: [], markers: [], children: [{
          OTIO_SCHEMA: 'Track.1', kind: 'Video', effects: [], markers: [], children: [{
            OTIO_SCHEMA: 'Clip.2', name: 'Orphan', effects: [], markers: [],
            media_reference: { OTIO_SCHEMA: 'MissingReference.1' },
            source_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 0 },
              duration:   { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 30 },
            },
          }],
        }],
      },
    });
    const imp = new OTIOImporter();
    const { losses } = imp.importWithReport(json);
    expect(losses.some(l => l.field === 'media_reference')).toBe(true);
  });

  it('reports foreign Effect loss for effects from other tools', () => {
    const json = JSON.stringify({
      OTIO_SCHEMA: 'Timeline.1', name: 'T',
      global_start_time: { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 0 },
      tracks: {
        OTIO_SCHEMA: 'Stack.1', effects: [], markers: [], children: [{
          OTIO_SCHEMA: 'Track.1', kind: 'Video', effects: [], markers: [], children: [{
            OTIO_SCHEMA: 'Clip.2', name: 'C', markers: [],
            effects: [{ OTIO_SCHEMA: 'Effect.1', effect_name: 'SomeForeignEffect' }],
            media_reference: { OTIO_SCHEMA: 'ExternalReference.1', target_url: 'file.mp4' },
            source_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 0 },
              duration:   { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 30 },
            },
          }],
        }],
      },
    });
    const imp = new OTIOImporter();
    const { losses } = imp.importWithReport(json);
    expect(losses.some(l => l.field === 'effect')).toBe(true);
  });
});

// ─── Transition round-trip ────────────────────────────────────────────────────

describe('Transition round-trip', () => {
  it('dissolve round-trips via importWithReport', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const c1 = makeClip({ id: 'c1', startFrame: 0, durationFrames: 30,
      transitionOut: { type: 'dissolve', inFrames: 5, outFrames: 5 } });
    const c2 = makeClip({ id: 'c2', startFrame: 30, durationFrames: 30 });
    const { timeline } = imp.importWithReport(
      exp.exportToString(makeTimeline({ videoTracks: [makeTrack({ clips: [c1, c2] })] }))
    );
    const clips = timeline.videoTracks[0].clips;
    expect(clips[0].transitionOut?.type).toBe('dissolve');
    expect(clips[1].transitionIn?.type).toBe('dissolve');
  });

  it('REGRESSION: transitionIn and transitionOut are separate objects (not aliased)', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const c1 = makeClip({ id: 'c1', startFrame: 0, durationFrames: 30,
      transitionOut: { type: 'dissolve', inFrames: 5, outFrames: 5 } });
    const c2 = makeClip({ id: 'c2', startFrame: 30, durationFrames: 30 });
    const { timeline } = imp.importWithReport(
      exp.exportToString(makeTimeline({ videoTracks: [makeTrack({ clips: [c1, c2] })] }))
    );
    const clips = timeline.videoTracks[0].clips;
    // Mutating one must not affect the other
    clips[1].transitionIn!.inFrames = 99;
    expect(clips[0].transitionOut?.inFrames).toBe(5); // unchanged
  });
});

// ─── fromRationalTime edge cases ─────────────────────────────────────────────

describe('fromRationalTime (via import)', () => {
  it('REGRESSION: rate=0 in an imported clip duration returns 0 not Infinity', () => {
    const json = JSON.stringify({
      OTIO_SCHEMA: 'Timeline.1', name: 'T',
      global_start_time: { OTIO_SCHEMA: 'RationalTime.1', rate: 30, value: 0 },
      tracks: {
        OTIO_SCHEMA: 'Stack.1', effects: [], markers: [], children: [{
          OTIO_SCHEMA: 'Track.1', kind: 'Video', effects: [], markers: [], children: [{
            OTIO_SCHEMA: 'Clip.2', name: 'C', effects: [], markers: [],
            media_reference: { OTIO_SCHEMA: 'ExternalReference.1', target_url: 'f.mp4' },
            source_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', rate: 0, value: 0 }, // rate=0!
              duration:   { OTIO_SCHEMA: 'RationalTime.1', rate: 0, value: 60 }, // rate=0!
            },
          }],
        }],
      },
    });
    const imp = new OTIOImporter();
    const { timeline } = imp.importWithReport(json);
    const c = timeline.videoTracks[0].clips[0];
    expect(Number.isFinite(c.durationFrames)).toBe(true);
    expect(Number.isFinite(c.sourceInFrame)).toBe(true);
    expect(c.durationFrames).toBe(0);
  });

  it('same-rate clips convert without rounding', () => {
    const exp = new OTIOExporter();
    const imp = new OTIOImporter();
    const clip = makeClip({ durationFrames: 100, sourceInFrame: 50 });
    const imported = imp.importFromString(exp.exportToString(makeTimeline({ videoTracks: [makeTrack({ clips: [clip] })] })));
    expect(imported.videoTracks[0].clips[0].durationFrames).toBe(100);
    expect(imported.videoTracks[0].clips[0].sourceInFrame).toBe(50);
  });
});

// ─── otio factory ─────────────────────────────────────────────────────────────

describe('otio factory', () => {
  it('creates exporter, importer, validator instances', () => {
    expect(otio.exporter()).toBeInstanceOf(OTIOExporter);
    expect(otio.importer()).toBeInstanceOf(OTIOImporter);
    expect(otio.validator()).toBeInstanceOf(OTIOValidator);
  });
});
