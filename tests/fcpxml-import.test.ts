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

  it('throws on malformed XML', () => {
    expect(() => interchange.fcpxmlImporter().import('<fcpxml><unclosed>')).toThrow();
  });

  it('returns an empty timeline when there are no clips', () => {
    const xml = '<fcpxml version="1.10"><resources><format id="r1" frameDuration="1/30s"/></resources></fcpxml>';
    const tl = interchange.fcpxmlImporter().import(xml);
    expect(tl.videoTracks).toHaveLength(0);
  });
});
