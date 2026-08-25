/**
 * Tests for export/timeline-render.ts の純粋部分
 * (orderClips / clipAtFrame / timelineDuration)
 *
 * 実際の書き出しは WebCodecs を要するため jsdom では走らない — そちらは
 * `tests/timeline-render.spec.ts` (実ブラウザ) が画素まで確認する。ここでは
 * 「どのフレームをどのクリップが担当するか」という**組み立ての骨格**を固定する。
 * ここがずれると、書き出しの順序や長さが編集と食い違う。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { orderClips, clipAtFrame, timelineDuration } from '../export/timeline-render';
import type { RenderClip } from '../export/timeline-render';

/** 素材を持つクリップ (source は組み立て判定に使わないので空 Blob)。 */
function clip(startTime: number, duration: number, mediaIn = 0): RenderClip {
  return { source: new Blob(), startTime, duration, mediaIn };
}

describe('orderClips', () => {
  it('sorts by timeline position regardless of input order', () => {
    const ordered = orderClips([clip(4, 2), clip(0, 2), clip(2, 2)]);
    expect(ordered.map((c) => c.startTime)).toEqual([0, 2, 4]);
  });

  it('accepts clips that touch exactly (end === next start)', () => {
    expect(() => orderClips([clip(0, 2), clip(2, 2)])).not.toThrow();
  });

  it('refuses overlapping clips rather than silently dropping one', () => {
    // 重なりは合成の話。黙って片方を捨てると編集と違うファイルが出る。
    expect(() => orderClips([clip(0, 3), clip(2, 2)])).toThrow(/overlap/i);
  });

  it('does not mutate the caller array', () => {
    const input = [clip(4, 2), clip(0, 2)];
    orderClips(input);
    expect(input[0].startTime).toBe(4);
  });
});

describe('clipAtFrame', () => {
  const ordered = orderClips([clip(0, 1), clip(1, 1)]);

  it('maps each output frame to the clip that owns it', () => {
    expect(clipAtFrame(ordered, 0, 30)).toBe(ordered[0]);
    expect(clipAtFrame(ordered, 29, 30)).toBe(ordered[0]); // 0.966s — まだ1本目
    expect(clipAtFrame(ordered, 30, 30)).toBe(ordered[1]); // 1.000s — 2本目の先頭
    expect(clipAtFrame(ordered, 59, 30)).toBe(ordered[1]);
  });

  it('REGRESSION: the boundary is half-open so no frame is emitted twice', () => {
    // [start, start+duration) にしないと、境界フレームが両方のクリップに属し
    // 1フレーム余る (= 出力が編集より長くなる)。
    const single = orderClips([clip(0, 1)]);
    expect(clipAtFrame(single, 30, 30)).toBeNull(); // ちょうど 1.0s は範囲外
  });

  it('returns null inside a gap (rendered as black)', () => {
    const gapped = orderClips([clip(1, 1)]);
    expect(clipAtFrame(gapped, 0, 30)).toBeNull();  // 前方の空白
    expect(clipAtFrame(gapped, 30, 30)).toBe(gapped[0]);
  });

  it('returns null past the end of the timeline', () => {
    expect(clipAtFrame(ordered, 60, 30)).toBeNull();
  });
});

describe('timelineDuration', () => {
  it('is the furthest clip end, not the sum of durations', () => {
    expect(timelineDuration([clip(0, 1), clip(5, 2)])).toBe(7);
  });

  it('accounts for a leading gap', () => {
    expect(timelineDuration([clip(3, 1)])).toBe(4);
  });

  it('is zero for an empty timeline', () => {
    expect(timelineDuration([])).toBe(0);
  });
});
