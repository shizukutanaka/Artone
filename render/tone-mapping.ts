/**
 * トーンマッピング演算子コレクション
 *
 * CPU 側純粋関数実装。WebGPU シェーダーの等価 WGSL 版は webgpu-engine.ts に対応。
 * 参考: Reinhard 2002, Hable 2010, Narkowicz 2015 ACES 近似, Uchimura 2017 GT.
 *
 * # AI generated (reviewed)
 */

// 256-entry sRGB EOTF LUT: exact lookup for 8-bit input bytes → linear
const _SRGB_EOTF_LUT = new Float32Array(256);
for (let v = 0; v < 256; v++) {
  const n = v / 255;
  _SRGB_EOTF_LUT[v] = n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

// 4097-entry sRGB OETF LUT: quantized linear [0,4096/4096] → output byte (0-255)
const _SRGB_OETF_BYTE_LUT = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) {
  const x = i / 4096;
  const v = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  _SRGB_OETF_BYTE_LUT[i] = Math.round(v > 1 ? 255 : v < 0 ? 0 : v * 255);
}

/** サポートするトーンマッピングアルゴリズム。 */
export type ToneMappingAlgo =
  | 'linear'
  | 'reinhard'
  | 'reinhard-extended'
  | 'hable'
  | 'aces-narkowicz'
  | 'uchimura';

/** createToneMapper オプション。 */
export interface ToneMappingOptions {
  /** トーンマッピング前の露出倍率。デフォルト 1.0。 */
  exposure?: number;
  /**
   * 'reinhard-extended' のホワイトポイント。
   * この輝度値が出力 1.0 に対応する。デフォルト 4.0。
   */
  whitePoint?: number;
  /**
   * 出力エンコーディング:
   * - 'srgb'   → sRGB OETF (デフォルト)
   * - 'linear' → 線形 [0,1] のまま出力
   * - number   → べき乗ガンマ: Math.pow(v, n) 例: 1/2.2
   */
  outputEncoding?: 'srgb' | 'linear' | number;
}

/** ToneMapper インターフェース。 */
export interface ToneMapper {
  /** シーン線形値 [0,∞) → ディスプレイ用 [0,1] へ変換。 */
  map(x: number): number;
  /**
   * Float32Array の R,G,B インターリーブバッファをインプレース変換。
   * 入力: シーン線形 [0,∞), 出力: エンコード済み [0,1]。
   */
  applyToFloatBuffer(buf: Float32Array): void;
  /**
   * Uint8ClampedArray の sRGB RGBA ピクセルバッファをインプレース変換。
   * α チャンネルは変更しない。
   */
  applyToUint8Buffer(buf: Uint8ClampedArray): void;
}

// ─── コア演算子 (スカラー) ────────────────────────────────────────────────

/**
 * Reinhard 2002 シンプル。[0,∞) → [0,1) の滑らかな写真的圧縮。
 * midtone で広いラチチュード。ホワイトポイント制御なし。
 */
export function reinhard(x: number): number {
  return x / (1 + x);
}

/**
 * Reinhard 2002 拡張版 — ホワイトポイント Lw を指定する。
 * x = Lw のとき出力が 1 になる。シンプル版より高コントラスト。
 *
 * @param x  - シーン線形輝度
 * @param Lw - ホワイトポイント (線形輝度値)
 */
export function reinhardExtended(x: number, Lw: number): number {
  return (x * (1 + x / (Lw * Lw))) / (1 + x);
}

/**
 * Hable 2010 "Uncharted 2" フィルミックオペレーター (露出バイアスなし版)。
 * ゲーム向けの豊かなシャドウと滑らかなハイライト圧縮。
 * W = 11.2 をホワイトポイントとして正規化。出力は [0,1] にクランプ。
 *
 * 注: オリジナルでは exposure_bias = 2.0 を乗じてから渡す慣習がある。
 * createToneMapper の exposure オプションで同等の設定が可能。
 */
export function hable(x: number): number {
  const A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
  const W = 11.2;

  function partial(v: number): number {
    return ((v * (A * v + C * B) + D * E) / (v * (A * v + B) + D * F)) - E / F;
  }

  const denom = partial(W);
  if (denom === 0) return 0;
  return Math.min(1, Math.max(0, partial(x) / denom));
}

/**
 * Narkowicz 2015 ACES フィルミック近似。
 * ACES RRT+ODT パイプラインの高速ペルチャンネル多項式フィット。
 * 出力は [0,1] にクランプ。
 */
export function acesNarkowicz(x: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const v = (x * (a * x + b)) / (x * (c * x + d) + e);
  return Math.min(1, Math.max(0, v));
}

/** 内部用 smoothstep。[0,1] にクランプ。 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Uchimura 2017 "Gran Turismo" トーンマッパー (CEDEC 2017)。
 * トー・線形・ショルダーの 3 領域をパラメータで制御。
 * デフォルトパラメータは GT Sport のプリセットに相当。
 *
 * @param x - シーン線形輝度
 * @param P - 最大ディスプレイ輝度 (デフォルト 1.0)
 * @param a - コントラスト (デフォルト 1.0)
 * @param m - 線形セクション開始点 (デフォルト 0.22)
 * @param l - 線形セクション長比率 (デフォルト 0.4)
 * @param c - トー強度 (デフォルト 1.33)
 * @param b - ペデスタル (デフォルト 0.0)
 */
export function uchimura(
  x: number,
  P = 1.0, a = 1.0, m = 0.22, l = 0.4, c = 1.33, b = 0.0,
): number {
  const l0 = ((P - m) * l) / a;
  const S0 = m + l0;
  const S1 = m + a * l0;
  const C2 = (a * P) / (P - S1);
  const CP = -C2 / P;

  const w0 = 1 - smoothstep(0, m, x);
  const w2 = x < S0 ? 0 : 1;
  const w1 = 1 - w0 - w2;

  // トー: x=0 での pow(0/m, c) を保護
  const T = x > 0 ? m * Math.pow(x / m, c) + b : b;
  const L = m + a * (x - m);                           // 線形
  const S = P - (P - S1) * Math.exp(CP * (x - S0));   // ショルダー

  return Math.min(P, Math.max(0, T * w0 + L * w1 + S * w2));
}

// ─── エンコーディングヘルパー ──────────────────────────────────────────────

function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }

/** sRGB OETF: 線形 [0,1] → エンコード済み [0,1] */
function srgbOETF(v: number): number {
  const x = clamp01(v);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

// ─── ファクトリ ──────────────────────────────────────────────────────────────

/**
 * 指定したアルゴリズムとオプションで ToneMapper を生成する。
 *
 * @example
 * // Hable + 露出 2x + sRGB 出力
 * const tm = createToneMapper('hable', { exposure: 2.0 });
 * const displayVal = tm.map(0.18); // シーン線形 → sRGB 表示値
 *
 * @example
 * // 画像バッファへの一括適用
 * const tm = createToneMapper('aces-narkowicz', { outputEncoding: 'linear' });
 * tm.applyToFloatBuffer(floatPixels);
 */
export function createToneMapper(algo: ToneMappingAlgo, opts?: ToneMappingOptions): ToneMapper {
  const exposure = opts?.exposure ?? 1.0;
  const Lw = opts?.whitePoint ?? 4.0;
  const enc = opts?.outputEncoding ?? 'srgb';

  function applyOp(v: number): number {
    switch (algo) {
      case 'linear':            return clamp01(v);
      case 'reinhard':          return reinhard(v);
      case 'reinhard-extended': return reinhardExtended(v, Lw);
      case 'hable':             return hable(v);
      case 'aces-narkowicz':    return acesNarkowicz(v);
      case 'uchimura':          return uchimura(v);
    }
  }

  function encode(displayLinear: number): number {
    const v = clamp01(displayLinear); // clamp before encoding so operators can naturally exceed 1
    if (enc === 'linear') return v;
    if (enc === 'srgb') return srgbOETF(v);
    return Math.pow(v, enc as number);
  }

  function map(x: number): number {
    return encode(applyOp(x * exposure));
  }

  function applyToFloatBuffer(buf: Float32Array): void {
    // Process complete R,G,B triplets only
    for (let i = 0; i + 3 <= buf.length; i += 3) {
      buf[i]     = map(buf[i]    );
      buf[i + 1] = map(buf[i + 1]);
      buf[i + 2] = map(buf[i + 2]);
    }
  }

  function applyToUint8Buffer(buf: Uint8ClampedArray): void {
    // Process complete RGBA quads; always re-encode as sRGB regardless of enc option.
    // Uses module-level LUTs to avoid Math.pow per pixel:
    //   _SRGB_EOTF_LUT: exact 256-entry byte→linear table
    //   _SRGB_OETF_BYTE_LUT: 4097-entry quantized linear→output-byte table
    for (let i = 0; i + 4 <= buf.length; i += 4) {
      const r = _SRGB_EOTF_LUT[buf[i]];
      const g = _SRGB_EOTF_LUT[buf[i + 1]];
      const b = _SRGB_EOTF_LUT[buf[i + 2]];
      buf[i]     = _SRGB_OETF_BYTE_LUT[(clamp01(applyOp(r * exposure)) * 4096 + 0.5) | 0];
      buf[i + 1] = _SRGB_OETF_BYTE_LUT[(clamp01(applyOp(g * exposure)) * 4096 + 0.5) | 0];
      buf[i + 2] = _SRGB_OETF_BYTE_LUT[(clamp01(applyOp(b * exposure)) * 4096 + 0.5) | 0];
      // buf[i + 3] alpha is intentionally preserved
    }
  }

  return { map, applyToFloatBuffer, applyToUint8Buffer };
}
