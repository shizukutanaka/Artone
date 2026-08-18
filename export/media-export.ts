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
 * ## 区間書き出し (trim) を今は持たない理由
 * Mediabunny の `trim` はキーフレーム以外から始まる区間で**デコードを伴う**ため、
 * WebCodecs 非対応環境では `isValid === false` (`undecodable_source_codec`) になる。
 * 本リポジトリのテストは jsdom (WebCodecs 無し) で走るため**検証できない**。
 * 検証できないコードは出さない方針に従い、まずは全体書き出しに絞る。
 * 区間書き出しは実ブラウザでの検証手段が用意できた段階で追加する。
 *
 * ## 失敗は必ず表に出す
 * `Conversion` は設定が不正なら `isValid === false` となり、`execute()` は throw
 * する。ここでは実行前に `isValid` を検査し、`discardedTracks` の理由を含めた
 * 明示的なエラーにする (無言で中身の欠けたファイルを出さない)。
 *
 * # AI generated (reviewed)
 *
 * @version 3.1.0
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

  const conversion = await Conversion.init({ input, output });

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
    throw new Error(
      `Export failed — the requested output (${options.format}) is not valid for this source. Discarded: ${reasons}`
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
