/**
 * Artone v3 — Media Export (Mediabunny Conversion)
 *
 * 取り込んだメディアを**実ファイルとして書き出す**。コアループ最終段
 * 「取り込む → 見る → 編集 → プレビュー → **書き出す**」を成立させる。
 *
 * ## なぜ `<video>` seek 方式を使わないのか
 * `media/frame-source.ts` は `<video>` を seek してフレームを取り出すが、
 * これは**フレーム正確でない** (`currentTime` は非同期で、Chromium では時刻源が
 * オーディオクロック。`seeked` は目的フレームの合成を保証しない)。プレビューや
 * スコープなら best-effort で足りるが、**マスター書き出しに使うと誤フレームを
 * 無言で出力する**ことになり `export/CLAUDE.md`「データ損失は致命的」に反する。
 *
 * 本モジュールは Mediabunny の `Conversion` を使い、**エンコード済みパケット階層**
 * で変換する。デコード→再エンコードを伴わない transmux ならフレームは一切
 * 再構成されないため、**原理的にフレーム正確**である。
 *
 * ## 区間書き出し (trim) について
 * `trim` を渡すと素材の一部だけを書き出す。キーフレーム以外から始まる区間では
 * Mediabunny が**デコードと再エンコード**を行うため、そこは transmux と違って
 * WebCodecs が必要になる (非対応環境では `isValid === false` になり、下の検査が
 * 明示的なエラーへ変換する)。
 *
 * jsdom には WebCodecs が無いため単体テストでは検証できないが、**実ブラウザでは
 * 検証済み**である (`tests/export-trim.spec.ts`: GOP の途中から始まる区間を
 * 切り出し、フレーム数と先頭タイムスタンプが厳密に一致することを確認)。
 *
 * ## 失敗は必ず表に出す
 * `Conversion` は設定が不正なら `isValid === false` となり、`execute()` は throw
 * する。ここでは実行前に `isValid` を検査し、`discardedTracks` の理由を含めた
 * 明示的なエラーにする (無言で中身の欠けたファイルを出さない)。
 *
 * # AI generated (reviewed)
 *
 * @version 3.2.0
 */
import {
  Input, Output, Conversion, BlobSource, BufferTarget,
  Mp4OutputFormat, WebMOutputFormat,
  MP4, QTFF, MATROSKA, WEBM,
} from 'mediabunny';
import { createLogger } from '../app/logger';

const log = createLogger('MediaExport');

/** 読み込みを許可するコンテナ (media/media-metadata.ts と揃える)。 */
const SUPPORTED_INPUT_FORMATS = [MP4, QTFF, MATROSKA, WEBM];

import type { ExportContainer } from './export-container';
export type { ExportContainer };

export interface MediaExportOptions {
  /** 出力コンテナ。 */
  format: ExportContainer;
  /**
   * 書き出す区間 (素材内の秒数)。省略すると素材全体。
   * `start < end` でなければ無視する (不正な区間で空ファイルを出さないため)。
   */
  trim?: { start: number; end: number };
  /** 進捗コールバック (0..1)。 */
  onProgress?: (progress: number) => void;
}

export interface MediaExportResult {
  /** 書き出したファイル。 */
  blob: Blob;
  /** MIME タイプ。 */
  mimeType: string;
  /**
   * 出力に含められなかった入力トラックとその理由。
   * 空でなくても書き出し自体は成功しうる (例: 対応外の字幕トラックのみ欠落)。
   * 呼び出し側はユーザーへ知らせることが望ましい。
   */
  discardedTracks: Array<{ reason: string }>;
}

/**
 * 区間指定を `Conversion.init` のオプションへ変換する。
 *
 * 非有限値や `start >= end` は**無視**して素材全体を書き出す — 不正な区間を
 * そのまま渡すと Mediabunny が throw するか空に近いファイルを出すため、
 * 「壊れた指定なら全体」という予測可能な振る舞いに倒す。
 */
function trimOption(trim: { start: number; end: number } | undefined) {
  if (!trim) return {};
  const { start, end } = trim;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return {};
  if (!(end > start)) return {};
  return { trim: { start: Math.max(0, start), end } };
}

/** コンテナ指定から Mediabunny の出力フォーマットを作る。 */
function makeOutputFormat(format: ExportContainer) {
  return format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
}

/** 出力コンテナの MIME タイプ。 */
export function mimeTypeFor(format: ExportContainer): string {
  return format === 'webm' ? 'video/webm' : 'video/mp4';
}

/**
 * メディアファイルを指定コンテナへ書き出す。
 *
 * 同一コーデックのまま容器だけ変える場合はデコード/再エンコードが起きないため
 * フレーム正確かつ高速。コーデック変換が必要な場合 Mediabunny が WebCodecs を
 * 用いる (その環境で対応していなければ `isValid` が false になり throw する)。
 *
 * @param source 入力メディア (取り込み時の File/Blob)。
 * @param options 出力設定。
 * @throws 入力を解析できない/出力設定が不正な場合 (無言で壊れたファイルを出さない)。
 */
export async function exportMediaFile(
  source: Blob,
  options: MediaExportOptions
): Promise<MediaExportResult> {
  const input = new Input({ source: new BlobSource(source), formats: SUPPORTED_INPUT_FORMATS });
  const output = new Output({ format: makeOutputFormat(options.format), target: new BufferTarget() });

  const conversion = await Conversion.init({ input, output, ...trimOption(options.trim) });

  if (options.onProgress) {
    const report = options.onProgress;
    conversion.onProgress = (progress) => report(progress);
  }

  const discardedTracks = conversion.discardedTracks.map((d) => ({
    reason: String((d as { reason?: unknown }).reason ?? 'unknown'),
  }));

  // execute() は isValid が false なら throw するが、その例外は理由を含まない。
  // ここで先に検査して、破棄トラックの理由を添えた実用的なエラーにする。
  if (!conversion.isValid) {
    const reasons = discardedTracks.map((d) => d.reason).join(', ') || 'unknown';
    // 区間指定はデコードを伴うため、WebCodecs 非対応環境ではここで落ちる。
    // 何が原因かユーザーに分かるよう、区間指定の有無を添える。
    const scope = options.trim ? ' (trimmed range requires decoding)' : '';
    throw new Error(
      `Export failed — the requested output (${options.format}) is not valid for this source${scope}. Discarded: ${reasons}`
    );
  }

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error('Export failed — the muxer produced no output buffer');
  }

  if (discardedTracks.length > 0) {
    log.warn('Export completed with discarded tracks', { discardedTracks });
  }

  const mimeType = mimeTypeFor(options.format);
  return { blob: new Blob([buffer], { type: mimeType }), mimeType, discardedTracks };
}
