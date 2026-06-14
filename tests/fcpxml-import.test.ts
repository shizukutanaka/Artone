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
