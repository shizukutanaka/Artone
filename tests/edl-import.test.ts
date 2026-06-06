/**
 * EDL (CMX 3600) Import / Round-trip テスト (interchange 10年互換)
 *
 * EDLExporter で書いた EDL を EDLImporter で読み戻し、構造が保たれることを検証。
 * EDL 単体パース (TITLE/FCM/チャンネル/ディゾルブ duration) も確認。
 */

import { describe, it, expect } from 'vitest';
import { interchange } from '../interchange/legacy-formats';
import { sampleTimeline } from './fixtures/timelines';

describe('EDL round-trip (export → import)', () => {
  it('preserves video clip structure and restores real names from comments', () => {
    const edl = interchange.edl().export(sampleTimeline, { includeAudio: false });
    const tl = interchange.edlImporter().import(edl, { fps: 30 });

    expect(tl.name).toBe('Test Project');
    expect(tl.videoTracks).toHaveLength(1);
    const clips = tl.videoTracks[0].clips;
    const orig = sampleTimeline.videoTracks[0].clips;
    expect(clips).toHaveLength(orig.length);

    for (let i = 0; i < orig.length; i++) {
      expect(clips[i].name).toBe(orig[i].name); // FROM CLIP NAME で復元
      expect(clips[i].startFrame).toBe(orig[i].startFrame);
      expect(clips[i].durationFrames).toBe(orig[i].durationFrames);
      expect(clips[i].sourceInFrame).toBe(orig[i].sourceInFrame);
    }
  });

  it('routes audio events to audioTracks when audio is included', () => {
    const edl = interchange.edl().export(sampleTimeline, { includeAudio: true });
    const tl = interchange.edlImporter().import(edl, { fps: 30 });
    expect(tl.audioTracks).toHaveLength(1);
    expect(tl.audioTracks[0].clips[0].name).toBe('Music');
    expect(tl.audioTracks[0].clips[0].durationFrames).toBe(200);
  });
});

describe('EDL parsing robustness', () => {
  it('parses a hand-written EDL with a dissolve (duration field) and ignores junk lines', () => {
    const edl = [
      'TITLE: Manual',
      'FCM: NON-DROP FRAME',
      '',
      '001  TAPE01   V     C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
      '* FROM CLIP NAME: Intro',
      '002  TAPE02   V     D    030 00:00:05:00 00:00:07:00 00:00:02:00 00:00:04:00',
      '* FROM CLIP NAME: Scene',
      'garbage line that is not an event',
    ].join('\n');

    const tl = interchange.edlImporter().import(edl, { fps: 30 });
    expect(tl.name).toBe('Manual');
    expect(tl.videoTracks[0].clips).toHaveLength(2);
    // 002: rec 00:00:02:00→00:00:04:00 = frame 60→120, src 00:00:05:00 = 150
    const c2 = tl.videoTracks[0].clips[1];
    expect(c2.name).toBe('Scene');
    expect(c2.startFrame).toBe(60);
    expect(c2.durationFrames).toBe(60);
    expect(c2.sourceInFrame).toBe(150);
  });

  it('detects DROP FRAME mode and defaults fps to 29.97', () => {
    const edl = [
      'TITLE: DF',
      'FCM: DROP FRAME',
      '',
      '001  R V     C        00:00:00;00 00:00:01;00 00:00:00;00 00:00:01;00',
    ].join('\n');
    const tl = interchange.edlImporter().import(edl);
    expect(tl.fps).toBe(29.97);
    expect(tl.videoTracks[0].clips).toHaveLength(1);
  });

  it('returns an empty timeline for header-only EDL', () => {
    const tl = interchange.edlImporter().import('TITLE: Empty\nFCM: NON-DROP FRAME\n');
    expect(tl.videoTracks).toHaveLength(0);
    expect(tl.audioTracks).toHaveLength(0);
  });
});
