/**
 * Tests for export/export-source.ts
 *
 * 「何を、どの区間で書き出すか」の決定。区間の切り出し (トリム) は
 * `Conversion` が表現できるが、複数クリップの連結・合成・変形・前方の空白は
 * できない — それらを無視して素材を素通しすると、編集と違うファイルが黙って出る。
 *
 * ## このテストが固定する2つの誤出力
 * 1. タイムラインがエンジンへ統合される前は「最初に取り込んだ映像」を無条件に
 *    選んでおり、ユーザーの編集内容と異なるファイルが無言で出ていた。
 * 2. 統合後も、トリム・変形・複数配置・開始位置のオフセットを**無視して**素材を
 *    丸ごと素通ししていた。切ったはずの映像が入ったファイルが無言で出るという、
 *    1 と同じ種類の誤出力である。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { decideExportSource, explainExportSourceFailure } from '../export/export-source';
import type { ExportClip } from '../export/export-source';

/** 無加工で先頭に置かれた 10 秒のクリップ (素通しできる唯一の形)。 */
function wholeClip(mediaId: string, duration = 10): ExportClip {
  return { mediaId, startTime: 0, duration, mediaIn: 0, mediaOut: duration };
}

const IDENTITY = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 } as const;

describe('decideExportSource', () => {
  it('REGRESSION: exports what the timeline references, not the first imported media', () => {
    // 素材 A を取り込んだ後 B を取り込み、タイムラインには B だけを置いた状況。
    // 従来はライブラリ先頭の A が書き出されていた (ユーザーの編集と違うファイル)。
    expect(decideExportSource([wholeClip('media-B')])).toEqual({ kind: 'ok', mediaId: 'media-B' });
  });

  it('passes through an untouched clip (identity transform is not a blocker)', () => {
    const clip: ExportClip = { ...wholeClip('media-A'), transform: { ...IDENTITY } };
    expect(decideExportSource([clip], () => 10)).toEqual({ kind: 'ok', mediaId: 'media-A' });
  });

  it('reports an empty timeline rather than silently picking something', () => {
    expect(decideExportSource([])).toEqual({ kind: 'empty' });
  });

  it('ignores clips with no backing media (e.g. titles)', () => {
    const decision = decideExportSource([
      { ...wholeClip(''), duration: 3 }, wholeClip('real'),
    ]);
    expect(decision).toEqual({ kind: 'ok', mediaId: 'real' });
  });

  it('treats a timeline of only media-less clips as empty', () => {
    expect(decideExportSource([wholeClip('')])).toEqual({ kind: 'empty' });
  });
});

// ============================================================
// 素通しでは編集を再現できないケース (無言の誤出力を止める)
// ============================================================

describe('decideExportSource — refuses to misrepresent the edit', () => {
  it('REGRESSION: a head-trimmed clip exports the trimmed range, not the whole source', () => {
    // 先頭 3 秒を切った状態。素材を素通しすると**切ったはずの 3 秒が入ったファイル**が出る。
    const trimmed: ExportClip = { mediaId: 'a', startTime: 0, duration: 7, mediaIn: 3, mediaOut: 10 };
    expect(decideExportSource([trimmed])).toEqual({
      kind: 'ok', mediaId: 'a', trim: { start: 3, end: 10 },
    });
  });

  it('REGRESSION: a tail-trimmed clip is caught by comparing against the source duration', () => {
    // 末尾トリムはクリップ単体からは判別できない (mediaOut は常に mediaIn + duration)。
    const tailTrimmed = wholeClip('a', 7); // 素材は 10 秒、使っているのは 7 秒
    expect(decideExportSource([tailTrimmed], () => 10)).toEqual({
      kind: 'ok', mediaId: 'a', trim: { start: 0, end: 7 },
    });
    // 使い切っているなら区間指定を付けない (不要なデコード経路を避ける)。
    expect(decideExportSource([tailTrimmed], () => 7)).toEqual({ kind: 'ok', mediaId: 'a' });
    // 素材の尺を渡さないと末尾トリムは検出できない — 既知の限界であり、呼び出し側
    // (app/main.ts) が必ずライブラリの尺を渡すことで成立している。
    expect(decideExportSource([tailTrimmed])).toEqual({ kind: 'ok', mediaId: 'a' });
  });

  it('carries both edges of a range trim', () => {
    const both: ExportClip = { mediaId: 'a', startTime: 0, duration: 4, mediaIn: 2, mediaOut: 6 };
    expect(decideExportSource([both], () => 10)).toEqual({
      kind: 'ok', mediaId: 'a', trim: { start: 2, end: 6 },
    });
  });

  it('REGRESSION: the same source placed twice is no longer treated as a single passthrough', () => {
    // 同じ動画を2箇所に置いた編集は「2回分の尺」を意味する。素材を1回素通ししても
    // ユーザーの編集にはならない (以前はこれを ok と判定していた)。
    const decision = decideExportSource([wholeClip('a'), { ...wholeClip('a'), startTime: 10 }], () => 10);
    expect(decision.kind).toBe('needs-rendering');
    if (decision.kind === 'needs-rendering') {
      expect(decision.blockers).toContain('multiple-clips');
    }
  });

  it('refuses to guess when several different sources are on the timeline', () => {
    const decision = decideExportSource([wholeClip('a'), { ...wholeClip('b'), startTime: 10 }], () => 10);
    expect(decision.kind).toBe('needs-rendering');
    if (decision.kind === 'needs-rendering') {
      expect(decision.blockers).toContain('multiple-sources');
      expect(decision.mediaIds).toEqual(['a', 'b']);
    }
  });

  it('REGRESSION: a transformed clip is not exported as if it were untouched', () => {
    const clip: ExportClip = { ...wholeClip('a'), transform: { ...IDENTITY, opacity: 0.5 } };
    const decision = decideExportSource([clip], () => 10);
    expect(decision.kind).toBe('needs-rendering');
    if (decision.kind === 'needs-rendering') expect(decision.blockers).toContain('transformed');
  });

  it('detects every transform field, not just opacity', () => {
    const fields = [
      { x: 5 }, { y: 5 }, { scaleX: 2 }, { scaleY: 2 }, { rotation: 90 }, { opacity: 0 },
    ];
    for (const patch of fields) {
      const clip: ExportClip = { ...wholeClip('a'), transform: { ...IDENTITY, ...patch } };
      expect(decideExportSource([clip], () => 10).kind).toBe('needs-rendering');
    }
  });

  it('flags a clip that does not start at the beginning of the timeline', () => {
    const decision = decideExportSource([{ ...wholeClip('a'), startTime: 4 }], () => 10);
    expect(decision.kind).toBe('needs-rendering');
    if (decision.kind === 'needs-rendering') expect(decision.blockers).toContain('offset');
  });

  it('lists every blocker at once (fixing one is not enough)', () => {
    const decision = decideExportSource(
      [{ mediaId: 'a', startTime: 2, duration: 5, mediaIn: 1, mediaOut: 6, transform: { ...IDENTITY, scaleX: 2 } }],
      () => 10,
    );
    expect(decision.kind).toBe('needs-rendering');
    if (decision.kind === 'needs-rendering') {
      // トリムは表現できるので妨げにならない。残りの2つだけが妨げ。
      expect(new Set(decision.blockers)).toEqual(new Set(['offset', 'transformed']));
    }
  });

  it('tolerates sub-millisecond float drift so untouched clips still export', () => {
    // 尺は浮動小数で持ち回るため、丸め誤差だけで「トリム済み」と誤判定してはならない。
    const drifted: ExportClip = {
      mediaId: 'a', startTime: 1e-9, duration: 10 - 1e-9, mediaIn: 1e-9, mediaOut: 10,
    };
    expect(decideExportSource([drifted], () => 10)).toEqual({ kind: 'ok', mediaId: 'a' });
  });

  it('ignores a non-finite source duration instead of refusing to export', () => {
    // <video> 由来の尺は Infinity になりうる (ストリーミング等)。判定材料にしない。
    expect(decideExportSource([wholeClip('a')], () => Number.POSITIVE_INFINITY))
      .toEqual({ kind: 'ok', mediaId: 'a' });
  });
});

describe('explainExportSourceFailure', () => {
  it('tells the user what to do when the timeline is empty', () => {
    const msg = explainExportSourceFailure({ kind: 'empty' });
    expect(msg).toMatch(/timeline is empty/i);
    expect(msg).toMatch(/import/i); // 次の行動が分かる
  });

  it('names each blocker and says why copying the source through would be wrong', () => {
    const msg = explainExportSourceFailure({
      kind: 'needs-rendering', blockers: ['transformed', 'multiple-clips'], mediaIds: ['a'],
    });
    expect(msg).toMatch(/transform/i);
    expect(msg).toMatch(/more than one clip/i);
    expect(msg).toMatch(/does not match your edit/i);
  });

  it('describes needs-rendering as a route, not a failure', () => {
    // 連結も合成も実装済みなので「未配線だから出せない」とは言わない
    // (app/main.ts はこの結果を失敗にせず描画経路へ回す)。
    const msg = explainExportSourceFailure({
      kind: 'needs-rendering', blockers: ['multiple-sources'], mediaIds: ['a', 'b', 'c'],
    });
    expect(msg).toMatch(/needs rendering/i);
    expect(msg).not.toMatch(/not wired/i);
    expect(msg).not.toMatch(/Export failed/i);
  });
});
