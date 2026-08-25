/**
 * Tests for export/export-source.ts
 *
 * 「何を書き出すか」の決定。書き出しはデコードを伴わない**コンテナ変換**であり、
 * 入力ファイルの中身をそのまま出す。したがって素通しが編集と一致するのは、
 * 素材を丸ごと1回だけ無加工で置いた場合に限る。
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
  it('REGRESSION: a head-trimmed clip no longer exports the whole source', () => {
    // 先頭 3 秒を切った状態。素通しすると**切ったはずの 3 秒が入ったファイル**が出る。
    const trimmed: ExportClip = { mediaId: 'a', startTime: 0, duration: 7, mediaIn: 3, mediaOut: 10 };
    const decision = decideExportSource([trimmed]);
    expect(decision.kind).toBe('needs-rendering');
    if (decision.kind === 'needs-rendering') expect(decision.blockers).toContain('trimmed');
  });

  it('REGRESSION: a tail-trimmed clip is caught by comparing against the source duration', () => {
    // 末尾トリムはクリップ単体からは判別できない (mediaOut は常に mediaIn + duration)。
    const tailTrimmed = wholeClip('a', 7); // 素材は 10 秒、使っているのは 7 秒
    expect(decideExportSource([tailTrimmed], () => 10).kind).toBe('needs-rendering');
    // 使い切っているなら素通しできる。
    expect(decideExportSource([tailTrimmed], () => 7)).toEqual({ kind: 'ok', mediaId: 'a' });
    // 素材の尺を渡さないと検出できない — 既知の限界であり、呼び出し側
    // (app/main.ts) が必ずライブラリの尺を渡すことで成立している。
    expect(decideExportSource([tailTrimmed])).toEqual({ kind: 'ok', mediaId: 'a' });
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
      expect(new Set(decision.blockers)).toEqual(new Set(['trimmed', 'offset', 'transformed']));
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

  it('names each blocker and says why exporting anyway would be wrong', () => {
    const msg = explainExportSourceFailure({
      kind: 'needs-rendering', blockers: ['trimmed', 'multiple-clips'], mediaIds: ['a'],
    });
    expect(msg).toMatch(/trimmed/i);
    expect(msg).toMatch(/more than one clip/i);
    expect(msg).toMatch(/does not match your edit/i);
  });

  it('explains the multi-source case in terms of compositing', () => {
    const msg = explainExportSourceFailure({
      kind: 'needs-rendering', blockers: ['multiple-sources'], mediaIds: ['a', 'b', 'c'],
    });
    expect(msg).toMatch(/compositing/i);
  });
});
