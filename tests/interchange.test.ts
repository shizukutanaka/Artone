/**
 * OTIO 互換層のテスト
 */

import { describe, it, expect, vi } from 'vitest';
import { otio, type ArtoneTimeline, type OTIOImportLoss, type OTIOImportResult } from '../interchange/otio';
import { interchange } from '../interchange/legacy-formats';
import { sampleTimeline } from './fixtures/timelines';
import { pad, escapeXML, uuid, safeParseJSON } from '../interchange/utils';

describe('OTIO Round-trip', () => {
  it('exports to valid OTIO JSON', () => {
    const exporter = otio.exporter();
    const result = exporter.export(sampleTimeline);
    expect(result.OTIO_SCHEMA).toBe('Timeline.1');
    expect(result.tracks.OTIO_SCHEMA).toBe('Stack.1');
    expect(result.tracks.children.length).toBe(2); // V1 + A1
  });

  it('preserves clip structure on round-trip', () => {
    const exporter = otio.exporter();
    const importer = otio.importer();

    const json = exporter.exportToString(sampleTimeline);
    const restored = importer.importFromString(json, 30);

    expect(restored.name).toBe(sampleTimeline.name);
    expect(restored.fps).toBe(30);
    expect(restored.videoTracks.length).toBe(1);
    expect(restored.audioTracks.length).toBe(1);

    const v1 = restored.videoTracks[0];
    expect(v1.clips.length).toBe(2);
    expect(v1.clips[0].name).toBe('Shot 1');
    expect(v1.clips[0].durationFrames).toBe(90);
  });

  it('preserves effect parameters', () => {
    const exporter = otio.exporter();
    const importer = otio.importer();

    const json = exporter.exportToString(sampleTimeline);
    const restored = importer.importFromString(json, 30);

    const clip2 = restored.videoTracks[0].clips[1];
    expect(clip2.effects.length).toBe(1);
    expect(clip2.effects[0].type).toBe('colorGrade');
    expect(clip2.effects[0].params.temp).toBe(-10);
  });

  it('handles gaps between clips', () => {
    const exporter = otio.exporter();
    const result = exporter.export(sampleTimeline);
    const v1 = result.tracks.children[0];

    // clip1 end = 90, clip2 start = 100 → 10frame gap
    const hasGap = v1.children.some((c) => c.OTIO_SCHEMA === 'Gap.1');
    expect(hasGap).toBe(true);
  });

  it('validates schema', () => {
    const validator = otio.validator();
    const exporter = otio.exporter();
    const result = exporter.export(sampleTimeline);

    const validation = validator.validate(result);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('rejects invalid schema', () => {
    const validator = otio.validator();
    const result = validator.validate({ foo: 'bar' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('Timecode utilities', () => {
  const TC = interchange.timecode;

  it('converts frames to non-drop-frame TC', () => {
    expect(TC.framesToTC(0, 30)).toBe('00:00:00:00');
    expect(TC.framesToTC(30, 30)).toBe('00:00:01:00');
    expect(TC.framesToTC(1800, 30)).toBe('00:01:00:00');
    expect(TC.framesToTC(108000, 30)).toBe('01:00:00:00');
  });

  it('converts TC back to frames', () => {
    expect(TC.tcToFrames('00:00:00:00', 30)).toBe(0);
    expect(TC.tcToFrames('00:00:01:00', 30)).toBe(30);
    expect(TC.tcToFrames('01:00:00:00', 30)).toBe(108000);
  });

  it('round-trips frames through TC', () => {
    for (const fps of [24, 25, 30, 60]) {
      for (const frames of [0, 100, 1000, 100000]) {
        const tc = TC.framesToTC(frames, fps);
        expect(TC.tcToFrames(tc, fps)).toBe(frames);
      }
    }
  });
});

describe('EDL Export', () => {
  it('produces valid EDL header', () => {
    const edl = interchange.edl().export(sampleTimeline, { title: 'My Edit' });
    expect(edl).toContain('TITLE: My Edit');
    expect(edl).toContain('FCM: NON-DROP FRAME');
  });

  it('numbers edits sequentially', () => {
    const edl = interchange.edl().export(sampleTimeline);
    expect(edl).toMatch(/^001\s+/m);
    expect(edl).toMatch(/^002\s+/m);
  });

  it('includes audio tracks by default', () => {
    const edl = interchange.edl().export(sampleTimeline);
    expect(edl).toMatch(/A\s+C/); // Audio track
    expect(edl).toMatch(/V\s+C/); // Video track
  });

  it('excludes audio when includeAudio=false', () => {
    const edl = interchange.edl().export(sampleTimeline, { includeAudio: false });
    expect(edl).not.toMatch(/A\s+C/);
    expect(edl).toMatch(/V\s+C/);
  });
});

describe('FCPXML Export', () => {
  it('produces valid FCPXML structure', () => {
    const xml = interchange.fcpxml().export(sampleTimeline);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<fcpxml version="1.10">');
    expect(xml).toContain('<resources>');
    expect(xml).toContain('<library>');
    expect(xml).toContain('Test Project');
  });

  it('escapes XML special characters', () => {
    const tl: ArtoneTimeline = {
      ...sampleTimeline,
      name: '<script>&"alert"',
    };
    const xml = interchange.fcpxml().export(tl);
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).not.toContain('<script>');
  });

  it('computes sequence duration from clips', () => {
    const xml = interchange.fcpxml().export(sampleTimeline);
    // 最終クリップ: clip-2 が startFrame=100, duration=60 → end=160
    // audio-1 は startFrame=0, duration=200 → end=200 (max)
    expect(xml).toContain('duration="200/30s"');
    expect(xml).not.toContain('duration="0s"');
  });
});

describe('EDL reel name conflicts', () => {
  it('disambiguates duplicate clip names', () => {
    const tl: ArtoneTimeline = {
      ...sampleTimeline,
      videoTracks: [
        {
          name: 'V1',
          kind: 'video',
          enabled: true,
          clips: [
            { ...sampleTimeline.videoTracks[0].clips[0], id: 'c1', name: 'Shot' },
            { ...sampleTimeline.videoTracks[0].clips[0], id: 'c2', name: 'Shot', startFrame: 100 },
            { ...sampleTimeline.videoTracks[0].clips[0], id: 'c3', name: 'Shot', startFrame: 200 },
          ],
        },
      ],
    };
    // videoTrack の重複名のみを検証するため audio は除外
    // (sampleTimeline の audio "Music" が startFrame 0 で interleave するのを防ぐ)。
    const edl = interchange.edl().export(tl, { includeAudio: false });
    // 1個目: SHOT, 2個目: SHOT2, 3個目: SHOT3 (4文字baseに連番suffix)
    expect(edl.match(/^001\s+SHOT\s+/m)).toBeTruthy();
    expect(edl.match(/^002\s+SHOT2\s+/m)).toBeTruthy();
    expect(edl.match(/^003\s+SHOT3\s+/m)).toBeTruthy();
  });
});

describe('OTIO LinearTimeWarp round-trip', () => {
  const makeSpeedClip = (speedFactor?: number) => ({
    id: 's1',
    name: 'SlowMo',
    startFrame: 0,
    durationFrames: 60,
    sourceInFrame: 0,
    mediaUrl: 'file:///tmp/clip.mp4',
    effects: [],
    markers: [],
    enabled: true,
    ...(speedFactor !== undefined ? { speedFactor } : {}),
  });

  const makeSpeedTimeline = (speedFactor?: number): ArtoneTimeline => ({
    name: 'Speed Test',
    fps: 30,
    videoTracks: [{ name: 'V1', kind: 'video', enabled: true, clips: [makeSpeedClip(speedFactor)] }],
    audioTracks: [],
    markers: [],
  });

  it('exports speedFactor 2.0 as LinearTimeWarp.1 with time_scalar 0.5', () => {
    const json = otio.exporter().exportToString(makeSpeedTimeline(2.0));
    const parsed = JSON.parse(json);
    const clip = parsed.tracks.children[0].children[0];
    const ltw = clip.effects.find((e: { OTIO_SCHEMA: string }) => e.OTIO_SCHEMA === 'LinearTimeWarp.1');
    expect(ltw).toBeDefined();
    expect(ltw.time_scalar).toBeCloseTo(0.5, 10);
    expect(ltw.effect_name).toBe('LinearTimeWarp');
  });

  it('stores original speedFactor in artone metadata', () => {
    const json = otio.exporter().exportToString(makeSpeedTimeline(2.0));
    const parsed = JSON.parse(json);
    const clip = parsed.tracks.children[0].children[0];
    const ltw = clip.effects.find((e: { OTIO_SCHEMA: string }) => e.OTIO_SCHEMA === 'LinearTimeWarp.1');
    expect((ltw.metadata?.artone as { speedFactor?: number })?.speedFactor).toBe(2.0);
  });

  it('exports speedFactor 0.5 (double speed) as time_scalar 2.0', () => {
    const json = otio.exporter().exportToString(makeSpeedTimeline(0.5));
    const ltw = JSON.parse(json).tracks.children[0].children[0].effects
      .find((e: { OTIO_SCHEMA: string }) => e.OTIO_SCHEMA === 'LinearTimeWarp.1');
    expect(ltw.time_scalar).toBeCloseTo(2.0, 10);
  });

  it('does not emit LinearTimeWarp for normal speed (1.0)', () => {
    const json = otio.exporter().exportToString(makeSpeedTimeline(1.0));
    const clip = JSON.parse(json).tracks.children[0].children[0];
    const ltw = clip.effects.find((e: { OTIO_SCHEMA: string }) => e.OTIO_SCHEMA === 'LinearTimeWarp.1');
    expect(ltw).toBeUndefined();
    expect(clip.effects.length).toBe(0);
  });

  it('does not emit LinearTimeWarp when speedFactor is undefined', () => {
    const json = otio.exporter().exportToString(makeSpeedTimeline(undefined));
    const clip = JSON.parse(json).tracks.children[0].children[0];
    const ltw = clip.effects.find((e: { OTIO_SCHEMA: string }) => e.OTIO_SCHEMA === 'LinearTimeWarp.1');
    expect(ltw).toBeUndefined();
  });

  it('round-trips speedFactor 2.0 through export/import', () => {
    const original = makeSpeedTimeline(2.0);
    const json = otio.exporter().exportToString(original);
    const restored = otio.importer().importFromString(json, 30);
    expect(restored.videoTracks[0].clips[0].speedFactor).toBeCloseTo(2.0, 10);
  });

  it('round-trips speedFactor 0.25 through export/import', () => {
    const original = makeSpeedTimeline(0.25);
    const json = otio.exporter().exportToString(original);
    const restored = otio.importer().importFromString(json, 30);
    expect(restored.videoTracks[0].clips[0].speedFactor).toBeCloseTo(0.25, 10);
  });

  it('leaves speedFactor undefined when no LinearTimeWarp in OTIO', () => {
    const original = makeSpeedTimeline(undefined);
    const json = otio.exporter().exportToString(original);
    const restored = otio.importer().importFromString(json, 30);
    expect(restored.videoTracks[0].clips[0].speedFactor).toBeUndefined();
  });
});

describe('OTIOImporter.importWithReport', () => {
  const makeCleanJson = (): string =>
    otio.exporter().exportToString(sampleTimeline);

  it('returns OTIOImportResult with timeline and losses fields', () => {
    const result: OTIOImportResult = otio.importer().importWithReport(makeCleanJson(), 30);
    expect(result).toHaveProperty('timeline');
    expect(result).toHaveProperty('losses');
    expect(Array.isArray(result.losses)).toBe(true);
  });

  it('returns empty losses for a clean Artone-originated round-trip', () => {
    const result = otio.importer().importWithReport(makeCleanJson(), 30);
    expect(result.losses).toEqual([]);
  });

  it('timeline from importWithReport matches importFromString', () => {
    const json = makeCleanJson();
    const withReport = otio.importer().importWithReport(json, 30);
    const direct = otio.importer().importFromString(json, 30);
    expect(withReport.timeline.name).toBe(direct.name);
    expect(withReport.timeline.fps).toBe(direct.fps);
    expect(withReport.timeline.videoTracks.length).toBe(direct.videoTracks.length);
    expect(withReport.timeline.videoTracks[0].clips.length).toBe(direct.videoTracks[0].clips.length);
  });

  it('reports a loss for a foreign NLE effect (no artone metadata)', () => {
    // Build OTIO JSON with a foreign effect (no metadata.artone.params)
    const baseJson = makeCleanJson();
    const parsed = JSON.parse(baseJson);
    parsed.tracks.children[0].children[0].effects = [
      { OTIO_SCHEMA: 'Effect.1', effect_name: 'DaVinci_FilmGrain', name: 'Film Grain' },
    ];
    const result = otio.importer().importWithReport(JSON.stringify(parsed), 30);
    const losses: OTIOImportLoss[] = result.losses;
    expect(losses.length).toBeGreaterThan(0);
    const loss = losses.find((l) => l.field === 'effect');
    expect(loss).toBeDefined();
    expect(loss?.otioType).toContain('DaVinci_FilmGrain');
    expect(loss?.trackName).toBe('V1');
    expect(loss?.clipName).toBe('Shot 1');
  });

  it('does NOT report a loss for an effect that came from Artone (has artone metadata)', () => {
    const baseJson = makeCleanJson();
    const parsed = JSON.parse(baseJson);
    parsed.tracks.children[0].children[1].effects = [
      {
        OTIO_SCHEMA: 'Effect.1',
        effect_name: 'colorGrade',
        name: 'Cool Look',
        metadata: { artone: { params: { temp: -10 } } },
      },
    ];
    const result = otio.importer().importWithReport(JSON.stringify(parsed), 30);
    const effectLosses = result.losses.filter((l) => l.field === 'effect');
    expect(effectLosses.length).toBe(0);
  });

  it('reports a loss for MissingReference.1 media', () => {
    const baseJson = makeCleanJson();
    const parsed = JSON.parse(baseJson);
    parsed.tracks.children[0].children[0].media_reference = {
      OTIO_SCHEMA: 'MissingReference.1',
    };
    const result = otio.importer().importWithReport(JSON.stringify(parsed), 30);
    const loss = result.losses.find((l) => l.field === 'media_reference');
    expect(loss).toBeDefined();
    expect(loss?.otioType).toBe('MissingReference.1');
    expect(loss?.clipName).toBe('Shot 1');
  });

  it('reports losses for multiple clips independently', () => {
    const baseJson = makeCleanJson();
    const parsed = JSON.parse(baseJson);
    // Foreign effects on both clips
    parsed.tracks.children[0].children[0].effects = [
      { OTIO_SCHEMA: 'Effect.1', effect_name: 'ForeignA', name: 'A' },
    ];
    parsed.tracks.children[0].children[2].effects = [
      { OTIO_SCHEMA: 'Effect.1', effect_name: 'ForeignB', name: 'B' },
    ];
    const result = otio.importer().importWithReport(JSON.stringify(parsed), 30);
    const effectLosses = result.losses.filter((l) => l.field === 'effect');
    expect(effectLosses.length).toBe(2);
    const types = effectLosses.map((l) => l.otioType);
    expect(types.some((t) => t.includes('ForeignA'))).toBe(true);
    expect(types.some((t) => t.includes('ForeignB'))).toBe(true);
  });

  it('speedFactor round-trip via importWithReport preserves speed', () => {
    const tl: ArtoneTimeline = {
      name: 'Speed',
      fps: 24,
      videoTracks: [{
        name: 'V1', kind: 'video', enabled: true,
        clips: [{
          id: 'x1', name: 'Clip', startFrame: 0, durationFrames: 48,
          sourceInFrame: 0, mediaUrl: 'x.mp4', effects: [], markers: [],
          enabled: true, speedFactor: 4.0,
        }],
      }],
      audioTracks: [],
      markers: [],
    };
    const json = otio.exporter().exportToString(tl);
    const result = otio.importer().importWithReport(json, 24);
    expect(result.losses).toEqual([]);
    expect(result.timeline.videoTracks[0].clips[0].speedFactor).toBeCloseTo(4.0, 10);
  });

  it('throws on invalid JSON', () => {
    expect(() => otio.importer().importWithReport('not json', 30)).toThrow('Invalid OTIO JSON');
  });

  it('throws on non-Timeline.1 schema', () => {
    expect(() =>
      otio.importer().importWithReport(JSON.stringify({ OTIO_SCHEMA: 'Clip.1' }), 30)
    ).toThrow('Unsupported OTIO schema');
  });
});

describe('OTIO Transition round-trip', () => {
  it('preserves dissolve transitions', () => {
    const tl: ArtoneTimeline = {
      name: 'Transition Test',
      fps: 30,
      videoTracks: [
        {
          name: 'V1',
          kind: 'video',
          enabled: true,
          clips: [
            {
              id: 'a',
              name: 'A',
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              mediaUrl: 'a.mp4',
              effects: [],
              markers: [],
              enabled: true,
              transitionOut: { type: 'dissolve', inFrames: 12, outFrames: 12 },
            },
            {
              id: 'b',
              name: 'B',
              startFrame: 60,
              durationFrames: 60,
              sourceInFrame: 0,
              mediaUrl: 'b.mp4',
              effects: [],
              markers: [],
              enabled: true,
              transitionIn: { type: 'dissolve', inFrames: 12, outFrames: 12 },
            },
          ],
        },
      ],
      audioTracks: [],
      markers: [],
    };

    const json = otio.exporter().exportToString(tl);
    expect(json).toContain('Transition.1');
    expect(json).toContain('SMPTE_Dissolve');

    const restored = otio.importer().importFromString(json, 30);
    expect(restored.videoTracks[0].clips.length).toBe(2);
    const second = restored.videoTracks[0].clips[1];
    expect(second.transitionIn?.type).toBe('dissolve');
    expect(second.transitionIn?.inFrames).toBe(12);
  });
});

describe('interchange/utils — pad', () => {
  it('pads single digit to width 2', () => {
    expect(pad(5)).toBe('05');
  });

  it('pads to specified width', () => {
    expect(pad(42, 4)).toBe('0042');
  });

  it('does not truncate wide numbers', () => {
    expect(pad(1234, 2)).toBe('1234');
  });
});

describe('interchange/utils — escapeXML', () => {
  it('escapes ampersand', () => {
    expect(escapeXML('a & b')).toBe('a &amp; b');
  });

  it('escapes less than and greater than', () => {
    expect(escapeXML('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeXML('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeXML("it's")).toBe('it&apos;s');
  });

  it('returns unchanged string with no special chars', () => {
    expect(escapeXML('hello world')).toBe('hello world');
  });
});

describe('interchange/utils — uuid', () => {
  it('returns a UUID-format string', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns unique values', () => {
    expect(uuid()).not.toBe(uuid());
  });
});

describe('interchange/utils — uuid fallback (no crypto.randomUUID)', () => {
  it('falls back to Math.random UUID when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    try {
      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('interchange/utils — safeParseJSON', () => {
  it('parses valid JSON', () => {
    expect(safeParseJSON<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(safeParseJSON('{invalid}')).toBeNull();
  });

  it('parses JSON arrays', () => {
    expect(safeParseJSON('[1,2,3]')).toEqual([1, 2, 3]);
  });
});
