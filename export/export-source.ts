/**
 * Artone v3 — Export Source Selection
 *
 * 「何を書き出すか」を**タイムラインから**決める。
 *
 * ## なぜ必要か
 * タイムラインがエンジンへ統合される前、書き出しは「最初に取り込んだ映像」を
 * 無条件に選んでいた。素材 A を取り込んだ後に B を取り込み、タイムラインには B
 * だけを置いた場合でも **A が書き出される** — ユーザーの編集内容と異なるファイルが
 * 無言で出る、という誤出力だった。
 *
 * 書き出しはユーザーがタイムラインに置いたものを反映しなければならない。
 * 合成が必要なケース (異なる素材が複数) は**明示的に失敗**させる — 勝手に1つ選ぶと
 * 再び「頼んだものと違うファイル」を出すことになる (`export/CLAUDE.md`
 * 「データ損失は致命的」)。
 *
 * 依存ゼロの純関数のみ。
 *
 * # AI generated (reviewed)
 *
 * @version 3.1.0
 */

/** 書き出し元の決定結果。 */
export type ExportSourceDecision =
  /** 単一素材として書き出せる。 */
  | { kind: 'ok'; mediaId: string }
  /** タイムラインが空 — 書き出すものが無い。 */
  | { kind: 'empty' }
  /** 異なる素材が複数ある — 合成が必要だが未配線。 */
  | { kind: 'needs-compositing'; mediaIds: string[] };

/**
 * タイムライン上のクリップから書き出し元を決める。
 *
 * 同一素材のクリップが複数あっても、参照している素材が1つなら書き出せる
 * (例: 同じ動画を2箇所に置いただけ)。**異なる素材が混在する場合のみ**合成が
 * 必要と判断して失敗させる。
 *
 * @param clips タイムライン上のクリップ (素材 ID のみ参照)。
 */
export function decideExportSource(
  clips: ReadonlyArray<{ mediaId: string }>
): ExportSourceDecision {
  const mediaIds: string[] = [];
  for (const clip of clips) {
    if (!clip.mediaId) continue; // 素材を持たないクリップ (タイトル等) は無視
    if (!mediaIds.includes(clip.mediaId)) mediaIds.push(clip.mediaId);
  }
  if (mediaIds.length === 0) return { kind: 'empty' };
  if (mediaIds.length === 1) return { kind: 'ok', mediaId: mediaIds[0] };
  return { kind: 'needs-compositing', mediaIds };
}

/**
 * 決定結果を、ユーザーに出す説明文へ変換する (失敗時のみ)。
 * 何が起きていて次に何をすればよいかが分かる文言にする。
 */
export function explainExportSourceFailure(
  decision: Exclude<ExportSourceDecision, { kind: 'ok' }>
): string {
  if (decision.kind === 'empty') {
    return 'Export failed — the timeline is empty. Import a clip and add it to the timeline first.';
  }
  return (
    `Export failed — the timeline references ${decision.mediaIds.length} different media files, ` +
    'and compositing multiple sources is not wired yet. Export a timeline with a single source.'
  );
}
