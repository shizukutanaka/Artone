/**
 * FCPXML Import / Round-trip テスト (interchange 10年互換)
 *
 * FCPXMLExporter で書いた XML を FCPXMLImporter で読み戻し、構造保持を検証。
 * 注: exporter は spine に映像のみ書き出すため、検証は映像トラック中心。
 */

import { describe, it, expect } from 'vitest';
import { interchange } from '../interchange/legacy-formats';
import { sampleTimeline } from './fixtures/timelines';

describe('FCPXML round-trip (export → import)', () => {
  it('preserves video clips, names, frames, and media refs', () => {
    const xml = interchange.fcpxml().export(sampleTimeline);
    const tl = interchange.fcpxmlImporter().import(xml);

    expect(tl.name).toBe('Test Project');
    expect(tl.fps).toBe(30);
    expect(tl.videoTracks).toHaveLength(1);

    const clips = tl.videoTracks[0].clips;
    const orig = sampleTimeline.videoTracks[0].clips;
    expect(clips).toHaveLength(orig.length);
    for (let i = 0; i < orig.length; i++) {
      expect(clips[i].name).toBe(orig[i].name);
      expect(clips[i].startFrame).toBe(orig[i].startFrame);
      expect(clips[i].durationFrames).toBe(orig[i].durationFrames);
      expect(clips[i].sourceInFrame).toBe(orig[i].sourceInFrame);
      expect(clips[i].mediaUrl).toBe(orig[i].mediaUrl); // asset ref で復元
    }
  });

  it('REGRESSION: fills the gap between clips with a <gap> spine element (real FCP compatibility)', () => {
    // sampleTimeline's video clips are [0,90) then start at frame 100 — a
    // 10-frame hole. Before fix: the spine only ever emitted <clip>
    // elements with absolute offsets — round-tripped fine through this
    // codebase's own importer (which reads each clip's offset directly and
    // never inspects gaps), but a real Final Cut Pro import of a <spine>
    // (FCP's primary storyline, expected to be contiguous) treats an
    // un-filled hole as ambiguous/misplaced clips.
    const xml = interchange.fcpxml().export(sampleTimeline);
    expect(xml).toContain('<gap name="Gap" offset="90/30s" duration="10/30s"/>');
  });

  it('does not emit a <gap> when clips are already contiguous', () => {
    const contiguous = {
      ...sampleTimeline,
      videoTracks: [{
        ...sampleTimeline.videoTracks[0],
        clips: [
          { ...sampleTimeline.videoTracks[0].clips[0], startFrame: 0, durationFrames: 90 },
          { ...sampleTimeline.videoTracks[0].clips[1], startFrame: 90, durationFrames: 60 },
        ],
      }],
    };
    const xml = interchange.fcpxml().export(contiguous);
    expect(xml).not.toContain('<gap');
  });

  it('gap-filled export still round-trips clip positions correctly through this importer', () => {
    // The importer positions clips by their own absolute `offset` attribute
    // and simply ignores <gap> tags (getElementsByTagName('clip') only), so
    // adding gap fillers to the export must not change round-trip results.
    const xml = interchange.fcpxml().export(sampleTimeline);
    const tl = interchange.fcpxmlImporter().import(xml);
    const clips = tl.videoTracks[0].clips;
    const orig = sampleTimeline.videoTracks[0].clips;
    for (let i = 0; i < orig.length; i++) {
      expect(clips[i].startFrame).toBe(orig[i].startFrame);
    }
  });
});

describe('FCPXML parsing', () => {
  it('derives fps from frameDuration', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<fcpxml version="1.10">',
      '  <resources><format id="r1" frameDuration="1/24s"/></resources>',
      '  <library><event name="E"><project name="P">',
      '    <sequence format="r1"><spine>',
      '      <clip name="A" offset="0/24s" start="0/24s" duration="48/24s" ref="r2"/>',
      '    </spine></sequence>',
      '  </project></event></library>',
      '</fcpxml>',
    ].join('\n');
    const tl = interchange.fcpxmlImporter().import(xml);
    expect(tl.fps).toBe(24);
    expect(tl.name).toBe('P');
    expect(tl.videoTracks[0].clips[0].durationFrames).toBe(48);
  });

  it('converts reduced rationals from real FCP (denominator ≠ fps)', () => {
    // Real Final Cut reduces fractions: a 3 s clip at 30 fps is "3s", and a
    // 1 s start offset is "1s" — not "90/30s"/"30/30s". The importer must
    // convert by seconds×fps, not return the bare numerator.
    const xml = [
      '<fcpxml version="1.10">',
      '  <resources><format id="r1" frameDuration="1/30s"/>',
      '    <asset id="r2" name="A" src="a.mov"/></resources>',
      '  <library><event name="E"><project name="P">',
      '    <sequence format="r1"><spine>',
      // offset 1 s = 30 frames, start 0.5 s = 15 frames, duration 3 s = 90 frames
      '      <clip name="A" offset="1s" start="1/2s" duration="3s" ref="r2"/>',
      '    </spine></sequence>',
      '  </project></event></library>',
      '</fcpxml>',
    ].join('\n');
    const clip = interchange.fcpxmlImporter().import(xml).videoTracks[0].clips[0];
    expect(clip.startFrame).toBe(30);      // was 1 (bare numerator) before the fix
    expect(clip.sourceInFrame).toBe(15);   // was 1
    expect(clip.durationFrames).toBe(90);  // was 3
  });

  it('round-trips NTSC reduced frame durations (29.97 → fps 30)', () => {
    // 100 frames at 29.97: real FCP writes 100×1001/30000 = 100100/30000 s.
    const xml = [
      '<fcpxml version="1.10">',
      '  <resources><format id="r1" frameDuration="1001/30000s"/>',
      '    <asset id="r2" name="A" src="a.mov"/></resources>',
      '  <library><event name="E"><project name="P">',
      '    <sequence format="r1"><spine>',
      '      <clip name="A" offset="0s" start="0s" duration="100100/30000s" ref="r2"/>',
      '    </spine></sequence>',
      '  </project></event></library>',
      '</fcpxml>',
    ].join('\n');
    const tl = interchange.fcpxmlImporter().import(xml);
    expect(tl.fps).toBe(30);
    expect(tl.videoTracks[0].clips[0].durationFrames).toBe(100);
  });

  it('throws on malformed XML', () => {
    expect(() => interchange.fcpxmlImporter().import('<fcpxml><unclosed>')).toThrow();
  });

  it('returns an empty timeline when there are no clips', () => {
    const xml = '<fcpxml version="1.10"><resources><format id="r1" frameDuration="1/30s"/></resources></fcpxml>';
    const tl = interchange.fcpxmlImporter().import(xml);
    expect(tl.videoTracks).toHaveLength(0);
  });
});

// ─── REGRESSION: degenerate frameDuration guard ───────────────────────────────

describe('FCPXMLImporter — REGRESSION: degenerate frameDuration falls back to fps=30', () => {
  it('frameDuration "1/0s" (division-by-zero fps) falls back to 30', () => {
    const xml = [
      '<fcpxml version="1.10">',
      '  <resources>',
      '    <format id="r1" frameDuration="1/0s" width="1920" height="1080"/>',
      '    <asset id="r2" name="Clip" src="file://clip.mp4" hasVideo="1" hasAudio="1" format="r1"/>',
      '  </resources>',
      '  <library><event name="E"><project name="P">',
      '    <sequence format="r1" duration="30/30s">',
      '      <spine>',
      '        <clip name="A" offset="0s" start="0s" duration="30s" ref="r2"/>',
      '      </spine>',
      '    </sequence>',
      '  </project></event></library>',
      '</fcpxml>',
    ].join('\n');
    const tl = interchange.fcpxmlImporter().import(xml);
    // fps must fall back to 30, not 0 — which would silently zero all frame numbers.
    expect(tl.fps).toBe(30);
    // duration "30s" at fps=30 → 30*30=900 frames (not 0).
    const clip = tl.videoTracks[0]?.clips[0];
    expect(clip).toBeDefined();
    expect(clip!.durationFrames).toBeGreaterThan(0);
  });
});
