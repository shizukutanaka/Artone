/**
 * Tests for app/timeline-bridge.ts
 *
 * エンジンのタイムラインを UI 表示へ写す変換層の検証。実物の
 * `MagneticTimeline` を相手にするので、engine 側の型/既定値が変わったら
 * ここが落ちる (モックで固めた思い込みにならないようにするため)。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { MagneticTimeline } from '../timeline/magnetic-timeline';
import {
  toTimelineClips, toTimelineTracks, buildEngineClip,
  pickTrackIdForType, nextStartOnTrack, clipColorForTrackType,
} from '../app/timeline-bridge';

/** 既定トラックを持つ実エンジンを用意する。 */
function makeTimeline(): MagneticTimeline {
  return new MagneticTimeline();
}

/** 種別で既定トラック ID を引く (エンジンの ID は UUID なので決め打ちできない)。 */
function trackIdOf(tl: MagneticTimeline, type: 'video' | 'audio'): string {
  const id = pickTrackIdForType(tl.getState(), type);
  if (!id) throw new Error(`no ${type} track`);
  return id;
}

describe('pickTrackIdForType', () => {
  it('finds a video track for video and image media', () => {
    const tl = makeTimeline();
    const state = tl.getState();
    const videoTrack = pickTrackIdForType(state, 'video');
    expect(videoTrack).toBeDefined();
    // 画像も映像トラックに載る。
    expect(pickTrackIdForType(state, 'image')).toBe(videoTrack);
  });

  it('finds an audio track for audio media', () => {
    const tl = makeTimeline();
    const audio = pickTrackIdForType(tl.getState(), 'audio');
    expect(audio).toBeDefined();
    expect(audio).not.toBe(pickTrackIdForType(tl.getState(), 'video'));
  });
});

describe('buildEngineClip + addClip round-trip', () => {
  it('REGRESSION: a built clip is accepted by the real engine (addClip was never called from app/)', () => {
    // 従来 app/ から timeline.addClip() が一度も呼ばれず、エンジンのタイムラインは
    // 常に空だった。実エンジンが受け付けることをここで固定する。
    const tl = makeTimeline();
    const trackId = trackIdOf(tl, 'video');
    const added = tl.addClip(buildEngineClip({
      trackId, mediaId: 'm1', name: 'clip.mp4', startTime: 0, duration: 5, type: 'video',
    }));
    expect(added.id).toBeTruthy();
    expect(tl.getState().clips.size).toBe(1);
  });

  it('uses the whole source by default (mediaIn 0 .. mediaOut duration)', () => {
    const clip = buildEngineClip({
      trackId: 't', mediaId: 'm', name: 'n', startTime: 2, duration: 7, type: 'video',
    });
    expect(clip.mediaIn).toBe(0);
    expect(clip.mediaOut).toBe(7);
    expect(clip.locked).toBe(false);
  });

  it('gives each clip its own transform object (no shared mutable default)', () => {
    const a = buildEngineClip({ trackId: 't', mediaId: 'm', name: 'a', startTime: 0, duration: 1, type: 'video' });
    const b = buildEngineClip({ trackId: 't', mediaId: 'm', name: 'b', startTime: 1, duration: 1, type: 'video' });
    a.transform.x = 99;
    expect(b.transform.x).toBe(0); // 共有していたら 99 になる
  });
});

describe('toTimelineClips', () => {
  it('maps engine startTime onto the UI start field', () => {
    const tl = makeTimeline();
    const trackId = trackIdOf(tl, 'video');
    tl.addClip(buildEngineClip({ trackId, mediaId: 'm', name: 'c', startTime: 3.5, duration: 2, type: 'video' }));
    const [ui] = toTimelineClips(tl.getState());
    expect(ui.start).toBe(3.5);
    expect(ui.duration).toBe(2);
    expect(ui.name).toBe('c');
    expect(ui.trackId).toBe(trackId);
  });

  it('reflects engine selection state (selection lives in a separate Set)', () => {
    const tl = makeTimeline();
    const trackId = trackIdOf(tl, 'video');
    const clip = tl.addClip(buildEngineClip({ trackId, mediaId: 'm', name: 'c', startTime: 0, duration: 1, type: 'video' }));
    expect(toTimelineClips(tl.getState())[0].selected).toBe(false);
    tl.selectClip(clip.id);
    expect(toTimelineClips(tl.getState())[0].selected).toBe(true);
  });

  it('orders clips by start time so display order does not depend on edit history', () => {
    const tl = makeTimeline();
    const trackId = trackIdOf(tl, 'video');
    // 後ろのクリップを先に追加する (Map の反復順は挿入順)。
    tl.addClip(buildEngineClip({ trackId, mediaId: 'm', name: 'late', startTime: 10, duration: 1, type: 'video' }));
    tl.addClip(buildEngineClip({ trackId, mediaId: 'm', name: 'early', startTime: 1, duration: 1, type: 'video' }));
    expect(toTimelineClips(tl.getState()).map((c) => c.name)).toEqual(['early', 'late']);
  });

  it('colors clips by their track type', () => {
    const tl = makeTimeline();
    tl.addClip(buildEngineClip({ trackId: trackIdOf(tl, 'audio'), mediaId: 'm', name: 'a', startTime: 0, duration: 1, type: 'audio' }));
    const [ui] = toTimelineClips(tl.getState());
    expect(ui.color).toBe(clipColorForTrackType('audio'));
    expect(ui.color).not.toBe(clipColorForTrackType('video'));
  });

  it('returns an empty array for an empty timeline', () => {
    expect(toTimelineClips(makeTimeline().getState())).toEqual([]);
  });
});

describe('toTimelineTracks', () => {
  it('exposes the engine default tracks with video first', () => {
    const tracks = toTimelineTracks(makeTimeline().getState());
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0].type).toBe('video');
    // 音声トラックが映像より前に来ない。
    const firstAudio = tracks.findIndex((t) => t.type === 'audio');
    const lastVideo = tracks.map((t) => t.type).lastIndexOf('video');
    expect(firstAudio).toBeGreaterThan(lastVideo);
  });

  it('carries the engine track name and height through', () => {
    const tracks = toTimelineTracks(makeTimeline().getState());
    expect(tracks[0].name).toBeTruthy();
    expect(tracks[0].height).toBeGreaterThan(0);
  });
});

describe('nextStartOnTrack', () => {
  it('is 0 for an empty track', () => {
    const tl = makeTimeline();
    expect(nextStartOnTrack(tl.getState(), trackIdOf(tl, 'video'))).toBe(0);
  });

  it('returns the end of the last clip on that track', () => {
    const tl = makeTimeline();
    const trackId = trackIdOf(tl, 'video');
    tl.addClip(buildEngineClip({ trackId, mediaId: 'm', name: 'a', startTime: 0, duration: 4, type: 'video' }));
    expect(nextStartOnTrack(tl.getState(), trackId)).toBe(4);
  });

  it('ignores clips on other tracks', () => {
    const tl = makeTimeline();
    const video = trackIdOf(tl, 'video');
    const audio = trackIdOf(tl, 'audio');
    tl.addClip(buildEngineClip({ trackId: video, mediaId: 'm', name: 'v', startTime: 0, duration: 9, type: 'video' }));
    expect(nextStartOnTrack(tl.getState(), audio)).toBe(0);
  });
});
