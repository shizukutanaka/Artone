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
 * ## 素通し (passthrough) が成立する条件
 * 現在の書き出しはデコードを伴わない**コンテナ変換**であり、入力ファイルの中身を
 * そのまま書き出す。したがって書き出し結果がユーザーの編集と一致するのは、
 * タイムラインが素材を**丸ごと1回だけ、無加工で**置いている場合に限る。
 *
 * トリム・変形・複数配置・開始位置のオフセットはいずれもコンテナ変換では
 * 表現できない。それらを無視して素通しすると、**ユーザーが指示した編集とは違う
 * ファイルが無言で出る** — 空ファイルを出すのと同じ「silent data loss」であり、
 * `export/CLAUDE.md`「データ損失は致命的」に反する。よって素通しできない編集は
 * **何が妨げているかを名指しして明示的に失敗**させる。
 *
 * 依存ゼロの純関数のみ。
 *
 * # AI generated (reviewed)
 *
 * @version 3.2.0
 */

/** 変形 (エンジンの `ClipTransform` と同形。依存を持たないためここで再宣言)。 */
export interface ExportClipTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

/** 書き出し判定に必要なクリップ情報。 */
export interface ExportClip {
  mediaId: string;
  /** タイムライン上の開始位置 (秒)。 */
  startTime: number;
  /** タイムライン上の尺 (秒)。 */
  duration: number;
  /** 素材内の使用開始位置 (秒)。先頭をトリムすると 0 より大きくなる。 */
  mediaIn: number;
  /** 素材内の使用終了位置 (秒)。 */
  mediaOut: number;
  transform?: Readonly<ExportClipTransform>;
}

/** 素通しを妨げている要因。 */
export type PassthroughBlocker =
  /** 異なる素材が複数ある — 合成が必要。 */
  | 'multiple-sources'
  /** 同じ素材でもクリップが複数ある — 連結が必要。 */
  | 'multiple-clips'
  /** 素材の一部だけを使っている — 区間の切り出しが必要。 */
  | 'trimmed'
  /** 位置・拡大・回転・不透明度が既定値でない — 再レンダリングが必要。 */
  | 'transformed'
  /** タイムライン先頭から始まっていない — 前方の空白を作る必要がある。 */
  | 'offset';

/** 書き出し元の決定結果。 */
export type ExportSourceDecision =
  /** 素材を丸ごと素通しできる。 */
  | { kind: 'ok'; mediaId: string }
  /** タイムラインが空 — 書き出すものが無い。 */
  | { kind: 'empty' }
  /** 素通しでは編集を再現できない — 何が妨げているかを列挙する。 */
  | { kind: 'needs-rendering'; blockers: PassthroughBlocker[]; mediaIds: string[] };

/**
 * 秒の比較許容誤差 (1ms)。
 *
 * 尺は浮動小数で持ち回るため厳密比較すると、無加工のクリップが丸め誤差だけで
 * 「トリム済み」と誤判定されて書き出せなくなる。1ms は 240fps でも1フレーム未満で、
 * 意図的なトリムがこれ以下になることはない。
 */
const EPSILON_SEC = 1e-3;

/** 変形が既定値 (等倍・不透明・無回転・無移動) か。 */
function isIdentityTransform(t: Readonly<ExportClipTransform> | undefined): boolean {
  if (!t) return true;
  return t.x === 0 && t.y === 0 && t.scaleX === 1 && t.scaleY === 1
    && t.rotation === 0 && t.opacity === 1;
}

/**
 * タイムライン上のクリップから書き出し元を決める。
 *
 * 素通しできるのは「単一素材・単一クリップ・無トリム・無変形・先頭から」の場合のみ。
 * それ以外は妨げている要因を全て列挙して失敗させる (1つ直せば通る、という誤解を
 * 与えないよう部分的には報告しない)。
 *
 * @param clips タイムライン上のクリップ。
 * @param sourceDuration 素材 ID から素材の尺 (秒) を引く関数。末尾のトリムは
 *   クリップ単体からは判別できない (`mediaOut` は常に `mediaIn + duration`) ため、
 *   素材の尺と突き合わせて初めて検出できる。省略時は末尾トリムを検出しない。
 */
export function decideExportSource(
  clips: ReadonlyArray<ExportClip>,
  sourceDuration?: (mediaId: string) => number | undefined,
): ExportSourceDecision {
  const placed = clips.filter((clip) => clip.mediaId); // 素材を持たないクリップ (タイトル等) は無視
  const mediaIds: string[] = [];
  for (const clip of placed) {
    if (!mediaIds.includes(clip.mediaId)) mediaIds.push(clip.mediaId);
  }
  if (mediaIds.length === 0) return { kind: 'empty' };

  const blockers: PassthroughBlocker[] = [];
  if (mediaIds.length > 1) blockers.push('multiple-sources');
  if (placed.length > 1) blockers.push('multiple-clips');

  for (const clip of placed) {
    if (clip.mediaIn > EPSILON_SEC && !blockers.includes('trimmed')) blockers.push('trimmed');
    if (Math.abs(clip.startTime) > EPSILON_SEC && !blockers.includes('offset')) blockers.push('offset');
    if (!isIdentityTransform(clip.transform) && !blockers.includes('transformed')) {
      blockers.push('transformed');
    }
    const full = sourceDuration?.(clip.mediaId);
    if (full !== undefined && Number.isFinite(full)
      && full - clip.duration > EPSILON_SEC && !blockers.includes('trimmed')) {
      blockers.push('trimmed');
    }
  }

  if (blockers.length > 0) return { kind: 'needs-rendering', blockers, mediaIds };
  return { kind: 'ok', mediaId: mediaIds[0] };
}

/** 要因ごとの説明文 (何が起きていて、なぜ今は出せないのか)。 */
const BLOCKER_TEXT: Record<PassthroughBlocker, string> = {
  'multiple-sources': 'the timeline mixes several media files (compositing is not wired yet)',
  'multiple-clips': 'the timeline holds more than one clip (joining clips is not wired yet)',
  trimmed: 'the clip is trimmed — exporting the whole source would include footage you cut',
  transformed: 'the clip has a non-default transform (position / scale / rotation / opacity)',
  offset: 'the clip does not start at the beginning of the timeline',
};

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
  const reasons = decision.blockers.map((b) => BLOCKER_TEXT[b]).join('; ');
  return (
    `Export failed — this edit cannot be exported without rendering: ${reasons}. ` +
    'Exporting anyway would produce a file that does not match your edit. ' +
    'Export a timeline with a single untrimmed clip, or wait for rendered export.'
  );
}
