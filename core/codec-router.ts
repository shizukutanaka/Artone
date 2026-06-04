/**
 * Artone v3 — Codec Router
 *
 * WebCodecs (ハードウェア) と FFmpeg WASM (ソフトウェア) を適切に振り分ける。
 *
 * 設計根拠 (Dayverse / Remotion / frameflow):
 * - WebCodecs はブラウザネイティブで OS コーデック API (VA-API/VideoToolbox/Media Foundation)
 *   を呼ぶため 10-50倍速。ただし対応コーデックが限定的。
 * - ProRes / DNxHR / エキゾチックコンテナは WebCodecs 未対応 → FFmpeg WASM で transcode。
 * - Firefox は WebCodecs が部分対応のため FFmpeg WASM フォールバックが必要。
 * - WebCodecs と WebAssembly は無関係 (WebCodecs はネイティブ実装)。
 *
 * 戦略:
 *   1. コーデックを分類 (native / transcode-required / unsupported)
 *   2. native → WebCodecs 直接
 *   3. transcode-required → FFmpeg WASM で中間コーデック (H.264) に変換してから WebCodecs
 */

import { createLogger } from '../app/logger';
import { checkCodecSupport } from './webcodecs-pipeline';

const log = createLogger('CodecRouter');

export type CodecRoute = 'webcodecs' | 'ffmpeg-transcode' | 'unsupported';

export interface CodecPlan {
  route: CodecRoute;
  /** transcode が必要な場合、変換先の中間コーデック */
  intermediateCodec?: string;
  /** ハードウェアアクセラレーション可否 */
  hardwareAccelerated: boolean;
  reason: string;
}

/**
 * WebCodecs がネイティブ対応するコーデックのプレフィックス。
 * これら以外は FFmpeg WASM 経由を検討する。
 */
const WEBCODECS_NATIVE_PREFIXES = [
  'avc1',  // H.264
  'hev1', 'hvc1', // H.265/HEVC
  'vp08', 'vp8',  // VP8
  'vp09', 'vp9',  // VP9
  'av01',  // AV1
];

/**
 * WebCodecs が扱えないプロ向けコーデック。FFmpeg WASM で transcode 必須。
 * (Dayverse: ProRes/DNxHD は WebCodecs 未対応)
 */
const TRANSCODE_REQUIRED_CODECS = [
  'prores', 'apch', 'apcn', 'apcs', 'apco', 'ap4h', // Apple ProRes variants
  'dnxhd', 'dnxhr', 'AVdn', // Avid DNxHD/DNxHR
  'cfhd', // Cineform
  'mjpeg', // Motion JPEG (一部ブラウザ未対応)
];

function classifyCodec(codec: string): 'native' | 'transcode' | 'unknown' {
  const lower = codec.toLowerCase();
  if (WEBCODECS_NATIVE_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()))) {
    return 'native';
  }
  if (TRANSCODE_REQUIRED_CODECS.some((c) => lower.includes(c.toLowerCase()))) {
    return 'transcode';
  }
  return 'unknown';
}

/**
 * コーデックに最適な処理経路を決定する。
 * WebCodecs のランタイム検出と静的分類を組み合わせる。
 */
export async function planCodecRoute(
  codec: string,
  type: 'decode' | 'encode' = 'decode'
): Promise<CodecPlan> {
  const classification = classifyCodec(codec);

  // プロコーデックは即 transcode へ
  if (classification === 'transcode') {
    return {
      route: 'ffmpeg-transcode',
      intermediateCodec: 'avc1.640028', // H.264 High
      hardwareAccelerated: false,
      reason: `${codec} はプロ向けコーデック。FFmpeg WASM で H.264 に変換`,
    };
  }

  // ネイティブ候補は WebCodecs のランタイム検出
  const supported = await checkCodecSupport(codec, type);
  if (supported) {
    return {
      route: 'webcodecs',
      hardwareAccelerated: true,
      reason: `${codec} は WebCodecs ネイティブ対応 (ハードウェア)`,
    };
  }

  // ネイティブ候補だがこのブラウザでは非対応 (例: Firefox の HEVC)
  if (classification === 'native') {
    return {
      route: 'ffmpeg-transcode',
      intermediateCodec: 'avc1.640028',
      hardwareAccelerated: false,
      reason: `${codec} はこのブラウザの WebCodecs 非対応。FFmpeg WASM フォールバック`,
    };
  }

  // 未知のコーデック — FFmpeg WASM で試行
  return {
    route: 'ffmpeg-transcode',
    intermediateCodec: 'avc1.640028',
    hardwareAccelerated: false,
    reason: `${codec} は未分類。FFmpeg WASM で transcode を試行`,
  };
}

/**
 * FFmpeg WASM のロードが必要かを事前判定 (遅延ロード最適化)。
 * native ルートのみなら FFmpeg WASM (大きい) をロードしない。
 */
export function needsFFmpegWasm(codecs: string[]): boolean {
  return codecs.some((c) => classifyCodec(c) !== 'native');
}

/**
 * コンテナ形式から FFmpeg WASM が必要かを判定。
 * MP4/WebM は WebCodecs で demux 可能だが、MOV/MKV/MXF 等は FFmpeg が必要。
 */
const NATIVE_CONTAINERS = ['mp4', 'webm', 'm4v'];
const FFMPEG_CONTAINERS = ['mov', 'mkv', 'mxf', 'avi', 'flv', 'ts', 'm2ts'];

export function classifyContainer(extension: string): 'native' | 'ffmpeg' | 'unknown' {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (NATIVE_CONTAINERS.includes(ext)) return 'native';
  if (FFMPEG_CONTAINERS.includes(ext)) return 'ffmpeg';
  return 'unknown';
}

/**
 * ファイル全体の処理計画。コーデック + コンテナを統合判断。
 */
export async function planFileProcessing(
  filename: string,
  codec: string
): Promise<CodecPlan & { containerRoute: 'native' | 'ffmpeg' | 'unknown' }> {
  const ext = filename.split('.').pop() ?? '';
  const containerRoute = classifyContainer(ext);
  const codecPlan = await planCodecRoute(codec);

  // コンテナが FFmpeg 必須なら、コーデックが native でも FFmpeg 経由
  if (containerRoute === 'ffmpeg' && codecPlan.route === 'webcodecs') {
    log.info(`Container .${ext} requires FFmpeg demux despite native codec`);
    return {
      ...codecPlan,
      route: 'ffmpeg-transcode',
      hardwareAccelerated: false,
      reason: `コンテナ .${ext} は FFmpeg WASM で demux 必須`,
      containerRoute,
    };
  }

  return { ...codecPlan, containerRoute };
}
