/**
 * Artone v3 — Media Metadata Extraction (Mediabunny)
 *
 * コンテナを直接パースして正確なメタデータ (尺・解像度・**回転**・**実コーデック**・
 * フレームレート) を取り出す。
 *
 * ## なぜ必要か (First Principles 監査で判明した2つの実バグ)
 * 1. **回転メタデータが完全に無視されていた** — 取り込み経路に rotation の扱いが
 *    皆無で、スマホの縦動画 (コンテナに回転情報を持つ) が横向きに表示されていた。
 * 2. **コーデックを拡張子から決め打ちしていた** — `mov→prores` `mp4→avc1...` と
 *    推測しており、H.264 の .mov や HEVC の .mp4 等で実体と食い違っていた。
 *    この推測値が `codec-router` の処理経路判定に流れ込んでいた。
 *
 * ## 検証可能性
 * Mediabunny のコンテナ解析は **純 TypeScript (WebCodecs 不要)** で、jsdom 上で
 * 実 MP4 バイト列を解析できることを確認済み (write→read ラウンドトリップで検証)。
 * デコード (VideoDecoder) とは別レイヤなので、本モジュールはテスト可能。
 *
 * @version 3.1.0
 * # AI generated (reviewed)
 */
import { Input, BlobSource, MP4, QTFF, MATROSKA, WEBM } from 'mediabunny';
import { createLogger } from '../app/logger';

const log = createLogger('MediaMetadata');

/**
 * サポートするコンテナ形式。`ALL_FORMATS` は全デマクサ (MP3/Ogg/FLAC/ADTS/
 * MPEG-TS 等) を引き込みバンドルを肥大化させるため、映像インポートで扱う
 * 形式に絞る (MP4 / MOV[QTFF] / MKV[Matroska] / WebM)。tree-shaking が効く。
 */
const SUPPORTED_FORMATS = [MP4, QTFF, MATROSKA, WEBM];

/**
 * 上記 `SUPPORTED_FORMATS` に対応するファイル拡張子。
 *
 * `core/codec-router.ts` の `NATIVE_CONTAINERS` (= FFmpeg 無しで demux 可能な
 * コンテナ) と一致していなければならない。両者がずれるとルータが実体と異なる
 * 処理経路を宣言するため、`tests/codec-router.test.ts` で同期を固定している。
 */
export const DEMUXABLE_EXTENSIONS = ['mp4', 'm4v', 'mov', 'mkv', 'webm'] as const;

/** コンテナから抽出した映像メタデータ。 */
export interface ExtractedVideoMetadata {
  /** 回転適用後の表示幅 (px)。UI/サムネイルはこちらを使う。 */
  width: number;
  /** 回転適用後の表示高さ (px)。 */
  height: number;
  /** 回転前の符号化解像度の幅 (px)。 */
  codedWidth: number;
  /** 回転前の符号化解像度の高さ (px)。 */
  codedHeight: number;
  /** 尺 (秒)。 */
  duration: number;
  /** 平均フレームレート (Hz)。取得不能なら 0。 */
  fps: number;
  /** 時計回りの回転角 (度)。0/90/180/270。 */
  rotation: number;
  /** コーデックファミリ (例: 'avc' / 'hevc' / 'vp9')。不明なら ''。 */
  codec: string;
  /** WebCodecs コーデック文字列 (例: 'avc1.640028')。取得不能なら ''。 */
  codecString: string;
}

/**
 * ファイルの映像メタデータをコンテナから直接抽出する。
 *
 * 解析できない (対応外コンテナ・映像トラック無し・破損等) 場合は **null** を返し、
 * 呼び出し側が従来の `<video>` 経路へフォールバックできるようにする
 * (取り込み自体を失敗させない)。
 *
 * @param file 解析対象 (blob:URL の元 File を想定)。
 */
export async function extractVideoMetadataViaMediabunny(
  file: Blob
): Promise<ExtractedVideoMetadata | null> {
  // 本番は BlobSource でストリーミング読み (4K/8K マスターを丸ごとメモリに載せず
  // moov 等の必要範囲だけ遅延読み)。実際の解析ロジックは extractMetadataFromInput
  // に切り出してテスト可能にしている (jsdom は Blob.slice().arrayBuffer() 未実装で
  // BlobSource を動かせないため、テストは BufferSource で同じ core を検証する)。
  const input = new Input({ source: new BlobSource(file), formats: SUPPORTED_FORMATS });
  return extractMetadataFromInput(input);
}

/**
 * パース済み/未パースの `Input` から映像メタデータを取り出す core (テスト可能)。
 * 解析失敗・映像トラック無しは null を返す。
 */
export async function extractMetadataFromInput(
  input: Input
): Promise<ExtractedVideoMetadata | null> {
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null; // 音声のみ等 — 呼び出し側でフォールバック

    const [codedWidth, codedHeight, displayWidth, displayHeight, rotation, codecString] =
      await Promise.all([
        track.getCodedWidth(),
        track.getCodedHeight(),
        track.getDisplayWidth(),
        track.getDisplayHeight(),
        track.getRotation(),
        track.getCodecParameterString().catch(() => ''),
      ]);

    const duration = await input.computeDuration();
    const fps = await computeFps(track);

    return {
      width: displayWidth,
      height: displayHeight,
      codedWidth,
      codedHeight,
      duration,
      fps,
      rotation: normalizeRotation(rotation),
      codec: track.codec ?? '',
      codecString: codecString ?? '',
    };
  } catch (e) {
    // 解析失敗はフォールバック可能な想定内ケース。握りつぶさずログのみ。
    log.debug('Mediabunny metadata extraction failed; caller should fall back', {
      error: (e as Error).message,
    });
    return null;
  }
}

/** 平均フレームレートを推定する。取得不能なら 0 を返す (呼び出し側が既定値を使う)。 */
async function computeFps(track: {
  computeFrameRateMetrics?: () => Promise<{ bestGuessFrameRate: number }>;
  computePacketStats: (n?: number) => Promise<{ averagePacketRate: number }>;
}): Promise<number> {
  // `computeFrameRateMetrics()` はフレーム間隔の分布から外れ値を除いて分数に
  // フィットさせる専用ヒューリスティックで、**フレーム落ちがあっても安定**し、
  // 一般的なフレームレートへスナップする。単純な平均パケットレートより大幅に
  // 正確なので優先する。
  //
  // 実測 (jsdom, 合成 MP4):
  //   30fps 一様            : averagePacketRate 30.0000 / bestGuess 30
  //   30fps + フレーム落ち  : averagePacketRate 20.0000 / bestGuess 30  ← 33%の誤差
  //   29.97 (30000/1001)    : averagePacketRate 29.9709 / bestGuess 29.97002997…
  //
  // fps はタイムラインのフレーム計算に流れるため (timeline/CLAUDE.md
  // 「フレーム計算は整数のみ」)、誤った値は全フレームの位置をずらす。
  try {
    if (typeof track.computeFrameRateMetrics === 'function') {
      const metrics = await track.computeFrameRateMetrics();
      const best = metrics.bestGuessFrameRate;
      if (Number.isFinite(best) && best > 0) return best;
    }
  } catch {
    // 専用 API が使えない場合は下のパケットレートへフォールバックする。
  }

  try {
    const stats = await track.computePacketStats(120);
    const rate = stats.averagePacketRate;
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

/** 回転角を 0/90/180/270 の範囲へ正規化する。 */
function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
}
