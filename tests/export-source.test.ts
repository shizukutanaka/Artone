/**
 * Tests for export/export-source.ts
 *
 * 「何を書き出すか」の決定。タイムラインがエンジンへ統合される前は
 * 「最初に取り込んだ映像」を無条件に選んでおり、ユーザーの編集内容と異なる
 * ファイルが無言で出ていた。その誤出力を再発させないための検証。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { decideExportSource, explainExportSourceFailure } from '../export/export-source';

describe('decideExportSource', () => {
  it('REGRESSION: exports what the timeline references, not the first imported media', () => {
    // 素材 A を取り込んだ後 B を取り込み、タイムラインには B だけを置いた状況。
    // 従来はライブラリ先頭の A が書き出されていた (ユーザーの編集と違うファイル)。
    const decision = decideExportSource([{ mediaId: 'media-B' }]);
    expect(decision).toEqual({ kind: 'ok', mediaId: 'media-B' });
  });

  it('allows the same source placed multiple times (no compositing needed)', () => {
    // 同じ動画を2箇所に置いただけなら、参照素材は1つなので書き出せる。
    const decision = decideExportSource([
      { mediaId: 'media-A' }, { mediaId: 'media-A' }, { mediaId: 'media-A' },
    ]);
    expect(decision).toEqual({ kind: 'ok', mediaId: 'media-A' });
  });

  it('reports an empty timeline rather than silently picking something', () => {
    expect(decideExportSource([])).toEqual({ kind: 'empty' });
  });

  it('refuses to guess when several different sources are on the timeline', () => {
    // 勝手に1つ選ぶと再び「頼んだものと違うファイル」を出すことになる。
    const decision = decideExportSource([{ mediaId: 'a' }, { mediaId: 'b' }]);
    expect(decision.kind).toBe('needs-compositing');
    if (decision.kind === 'needs-compositing') {
      expect(decision.mediaIds).toEqual(['a', 'b']);
    }
  });

  it('ignores clips with no backing media (e.g. titles)', () => {
    const decision = decideExportSource([{ mediaId: '' }, { mediaId: 'real' }]);
    expect(decision).toEqual({ kind: 'ok', mediaId: 'real' });
  });

  it('treats a timeline of only media-less clips as empty', () => {
    expect(decideExportSource([{ mediaId: '' }])).toEqual({ kind: 'empty' });
  });
});

describe('explainExportSourceFailure', () => {
  it('tells the user what to do when the timeline is empty', () => {
    const msg = explainExportSourceFailure({ kind: 'empty' });
    expect(msg).toMatch(/timeline is empty/i);
    expect(msg).toMatch(/import/i); // 次の行動が分かる
  });

  it('says how many sources conflict and why it stopped', () => {
    const msg = explainExportSourceFailure({ kind: 'needs-compositing', mediaIds: ['a', 'b', 'c'] });
    expect(msg).toContain('3');
    expect(msg).toMatch(/compositing/i);
  });
});
