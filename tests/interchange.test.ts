/**
 * OTIO 互換層のテスト
 */

import { describe, it, expect } from 'vitest';
import { otio, type ArtoneTimeline } from '../interchange/otio';
import { interchange } from '../interchange/legacy-formats';
import { sampleTimeline } from './fixtures/timelines';

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
