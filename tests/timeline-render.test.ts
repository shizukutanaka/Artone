/**
 * Tests for export/timeline-render.ts の純粋部分
 * (orderClips / clipAtFrame / timelineDuration)
 *
 * 実際の書き出しは WebCodecs を要するため jsdom では走らない — そちらは
 * `tests/timeline-render.spec.ts` (実ブラウザ) が画素まで確認する。ここでは
 * 「どのフレームに、どのクリップが、どの重ね順で映るか」という**組み立ての骨格**を
 * 固定する。ここがずれると、書き出しの順序・長さ・重なりが編集と食い違う。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { orderClips, clipsAtFrame, timelineDuration } from '../export/timeline-render';
import type { RenderClip } from '../export/timeline-render';

/** 素材を持つクリップ (source は組み立て判定に使わないので空 Blob)。 */
function clip(startTime: number, duration: number, layer = 0): RenderClip {
  return { source: new Blob(), startTime, duration, mediaIn: 0, layer };
}

describe('orderClips', () => {
  it('sorts by timeline position within a layer', () => {
    const ordered = orderClips([clip(4, 2), clip(0, 2), clip(2, 2)]);
    expect(ordered.map((c) => c.startTime)).toEqual([0, 2, 4]);
  });

  it('puts lower layers first so they are drawn behind', () => {
    // 描画は返された順。先に描いたものの上に後のものが重なる。
    const ordered = orderClips([clip(0, 2, 2), clip(0, 2, 0), clip(0, 2, 1)]);
    expect(ordered.map((c) => c.layer)).toEqual([0, 1, 2]);
  });

  it('REGRESSION: accepts overlapping clips (they are composited, not refused)', () => {
    // かつては重なりを拒否していた。キャンバスへ奥から手前へ描けば合成できる。
    expect(() => orderClips([clip(0, 3), clip(2, 2)])).not.toThrow();
    expect(orderClips([clip(0, 3), clip(2, 2)])).toHaveLength(2);
  });

  it('is deterministic for clips sharing a layer and a start time', () => {
    // 並びが不安定だと、同じ編集が実行のたびに違う見た目で書き出されうる。
    const a = clip(0, 1, 0);
    const b = clip(0, 1, 0);
    expect(orderClips([a, b])).toEqual(orderClips([a, b]));
  });

  it('does not mutate the caller array', () => {
    const input = [clip(4, 2), clip(0, 2)];
    orderClips(input);
    expect(input[0].startTime).toBe(4);
  });
});

describe('clipsAtFrame', () => {
  const ordered = orderClips([clip(0, 1), clip(1, 1)]);

  it('maps each output frame to the clip that owns it', () => {
    expect(clipsAtFrame(ordered, 0, 30)).toEqual([ordered[0]]);
    expect(clipsAtFrame(ordered, 29, 30)).toEqual([ordered[0]]); // 0.966s — まだ1本目
    expect(clipsAtFrame(ordered, 30, 30)).toEqual([ordered[1]]); // 1.000s — 2本目の先頭
    expect(clipsAtFrame(ordered, 59, 30)).toEqual([ordered[1]]);
  });

  it('returns every overlapping clip, back to front', () => {
    // 上のレイヤーが後に来る = 後から描かれて手前になる。
    const stacked = orderClips([clip(0, 2, 1), clip(0, 2, 0)]);
    const visible = clipsAtFrame(stacked, 15, 30);
    expect(visible).toHaveLength(2);
    expect(visible.map((c) => c.layer)).toEqual([0, 1]);
  });

  it('drops a clip from the stack once its own range ends', () => {
    // 下 0〜2秒 / 上 1〜2秒。前半は1本、後半は2本。
    const stacked = orderClips([clip(0, 2, 0), clip(1, 1, 1)]);
    expect(clipsAtFrame(stacked, 15, 30)).toHaveLength(1);  // 0.5s
    expect(clipsAtFrame(stacked, 45, 30)).toHaveLength(2);  // 1.5s
  });

  it('REGRESSION: the boundary is half-open so no frame is emitted twice', () => {
    // [start, start+duration) にしないと、境界フレームが両方のクリップに属し
    // 1フレーム余る (= 出力が編集より長くなる)。
    const single = orderClips([clip(0, 1)]);
    expect(clipsAtFrame(single, 30, 30)).toEqual([]); // ちょうど 1.0s は範囲外
  });

  it('is empty inside a gap (rendered as black)', () => {
    const gapped = orderClips([clip(1, 1)]);
    expect(clipsAtFrame(gapped, 0, 30)).toEqual([]);  // 前方の空白
    expect(clipsAtFrame(gapped, 30, 30)).toEqual([gapped[0]]);
  });

  it('is empty past the end of the timeline', () => {
    expect(clipsAtFrame(ordered, 60, 30)).toEqual([]);
  });
});

describe('timelineDuration', () => {
  it('is the furthest clip end, not the sum of durations', () => {
    expect(timelineDuration([clip(0, 1), clip(5, 2)])).toBe(7);
  });

  it('does not grow when clips overlap', () => {
    // 重なりは尺を伸ばさない (0〜2秒 と 1〜2秒 で 2秒)。
    expect(timelineDuration([clip(0, 2), clip(1, 1, 1)])).toBe(2);
  });

  it('accounts for a leading gap', () => {
    expect(timelineDuration([clip(3, 1)])).toBe(4);
  });

  it('is zero for an empty timeline', () => {
    expect(timelineDuration([])).toBe(0);
  });
});
