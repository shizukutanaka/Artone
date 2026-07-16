/**
 * False Color 露出モニタリング
 *
 * 線形輝度値をカラーコードにマッピングしてオーバー/アンダー露出を可視化。
 * ARRI Alexa / RED / DaVinci Resolve に準じた業界標準の露出ゾーン設定を提供。
 *
 * 参考: ARRI Alexa False Color ガイド、CameraControlled.com False Color 解説。
 *
 * # AI generated (reviewed)
 */

// ─── 型定義 ─────────────────────────────────────────────────────────────────

/** False color の色停留点。threshold より大きく次の停留点以下の範囲に適用。 */
export interface FalseColorStop {
  /** この停留点が始まる線形輝度値 [0, ∞)。 */
  threshold: number;
  /** sRGB 赤 [0, 255]。 */
  r: number;
  /** sRGB 緑 [0, 255]。 */
  g: number;
  /** sRGB 青 [0, 255]。 */
  b: number;
}

/** サポートするプリセット名。 */
export type FalseColorPreset = 'arri' | 'red' | 'simple';

/** createFalseColorMapper が返すマッパー。 */
export interface FalseColorMapper {
  /**
   * 線形輝度値 [0, ∞) を false color の sRGB トリプレット [0,255] に変換。
   * 隣接する停留点間は線形補間。最後の停留点以降はその色をそのまま返す。
   */
  map(luminance: number): readonly [number, number, number];

  /**
   * sRGB RGBA Uint8ClampedArray (4 bytes/pixel) を in-place で false color 化。
   * 各ピクセルの輝度 (BT.709 luma) を計算し、RGB を false color に置き換える。
   * α チャンネルは変更しない。
   */
  applyToBuffer(data: Uint8ClampedArray): void;

  /** このマッパーが使用する停留点のコピーを返す。 */
  getStops(): FalseColorStop[];
}

// ─── 組み込みプリセット ──────────────────────────────────────────────────────

/**
 * ARRI Alexa スタイル false color プリセット。
 * 18% グレー (linear 0.18) をブライトグリーンで強調。
 * スキントーン帯 (0.18–0.38) をピンク系で表示。
 */
export const ARRI_FALSE_COLOR_STOPS: readonly FalseColorStop[] = Object.freeze([
  { threshold: 0.000, r: 0,   g: 0,   b: 0   },  // クリップシャドウ (黒)
  { threshold: 0.008, r: 0,   g: 0,   b: 128 },  // ディープシャドウ (濃青)
  { threshold: 0.035, r: 0,   g: 64,  b: 220 },  // シャドウ (青)
  { threshold: 0.080, r: 0,   g: 190, b: 200 },  // ローミッドトーン (シアン)
  { threshold: 0.145, r: 0,   g: 160, b: 40  },  // グリーン帯 (-0.3EV ~ 0EV)
  { threshold: 0.165, r: 0,   g: 240, b: 0   },  // 18% グレー直下
  { threshold: 0.195, r: 0,   g: 255, b: 0   },  // 18% グレー帯 (明緑 = 指標)
  { threshold: 0.230, r: 240, g: 190, b: 190 },  // スキントーン下限
  { threshold: 0.380, r: 255, g: 255, b: 80  },  // ハイライト (黄)
  { threshold: 0.700, r: 255, g: 150, b: 0   },  // ニアクリップ (橙)
  { threshold: 0.900, r: 255, g: 40,  b: 80  },  // クリップ直前 (赤ピンク)
  { threshold: 1.000, r: 255, g: 0,   b: 0   },  // クリップ (赤)
  { threshold: 1.200, r: 255, g: 255, b: 255 },  // スペキュラー/飽和 (白)
]);

/**
 * RED カメラスタイル false color プリセット。
 * シンプルな青-緑-黄-赤のグラデーション。
 */
export const RED_FALSE_COLOR_STOPS: readonly FalseColorStop[] = Object.freeze([
  { threshold: 0.000, r: 0,   g: 0,   b: 0   },  // ブラッククリップ
  { threshold: 0.018, r: 0,   g: 0,   b: 200 },  // 深シャドウ (青)
  { threshold: 0.070, r: 100, g: 0,   b: 200 },  // シャドウ (紫)
  { threshold: 0.140, r: 0,   g: 180, b: 0   },  // ロウミッドトーン (緑)
  { threshold: 0.180, r: 0,   g: 255, b: 0   },  // 18% グレー (明緑)
  { threshold: 0.280, r: 255, g: 255, b: 0   },  // ハイミッドトーン (黄)
  { threshold: 0.600, r: 255, g: 120, b: 0   },  // ニアクリップ (橙)
  { threshold: 0.900, r: 255, g: 0,   b: 0   },  // クリップ (赤)
  { threshold: 1.100, r: 255, g: 255, b: 255 },  // 飽和 (白)
]);

/**
 * シンプルな 3 ゾーン false color (テスト・カスタム用のベースライン)。
 */
export const SIMPLE_FALSE_COLOR_STOPS: readonly FalseColorStop[] = Object.freeze([
  { threshold: 0.000, r: 0,   g: 0,   b: 255 },  // アンダー (青)
  { threshold: 0.100, r: 0,   g: 255, b: 0   },  // ミッドトーン (緑)
  { threshold: 0.720, r: 255, g: 0,   b: 0   },  // オーバー (赤)
]);

// ─── ヘルパー ────────────────────────────────────────────────────────────────

// Pre-computed sRGB EOTF for each 8-bit byte value (0-255). applyToBuffer()
// always receives Uint8ClampedArray, so input is always an integer in [0,255].
// 256 table lookups replace 3 Math.pow() calls per pixel.
const _SRGB_LUT = new Float32Array(256);
for (let v = 0; v < 256; v++) {
  const n = v / 255;
  _SRGB_LUT[v] = n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

/** BT.709 luma: 線形 RGB [0,1] → luma Y [0,1] */
function bt709Luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 停留点配列の validates: threshold は昇順である必要がある。
 * @throws {Error} 順序が違う場合
 */
function validateStops(stops: FalseColorStop[]): void {
  if (stops.length < 2) throw new Error('false color stops must have at least 2 entries');
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].threshold <= stops[i - 1].threshold) {
      throw new Error(
        `false color stops must be strictly ascending; stops[${i}].threshold (${stops[i].threshold}) <= stops[${i - 1}].threshold (${stops[i - 1].threshold})`,
      );
    }
  }
}

// ─── ファクトリ ──────────────────────────────────────────────────────────────

/**
 * False color マッパーを生成する。
 *
 * @param preset - 組み込みプリセット名、または 'custom' の場合 stops を指定
 * @param customStops - preset = 'custom' 時に使用する停留点配列 (threshold 昇順)
 *
 * @example
 * const mapper = createFalseColorMapper('arri');
 * const [r, g, b] = mapper.map(0.18); // 18% grey → bright green
 *
 * @example
 * const fc = createFalseColorMapper('arri');
 * fc.applyToBuffer(imageData.data); // sRGB RGBA buffer → false color in-place
 */
export function createFalseColorMapper(
  preset: FalseColorPreset | 'custom' = 'arri',
  customStops?: FalseColorStop[],
): FalseColorMapper {
  let rawStops: FalseColorStop[];
  if (preset === 'custom') {
    if (!customStops || customStops.length < 2) {
      throw new Error('customStops must have at least 2 stops when preset is "custom"');
    }
    rawStops = [...customStops];
  } else {
    const presetMap: Record<FalseColorPreset, readonly FalseColorStop[]> = {
      arri: ARRI_FALSE_COLOR_STOPS,
      red: RED_FALSE_COLOR_STOPS,
      simple: SIMPLE_FALSE_COLOR_STOPS,
    };
    rawStops = [...presetMap[preset]];
  }
  validateStops(rawStops);
  const stops = rawStops;

  function map(luminance: number): readonly [number, number, number] {
    // Below first stop: return first stop color
    if (luminance <= stops[0].threshold) {
      return [stops[0].r, stops[0].g, stops[0].b] as const;
    }
    // Above last stop: return last stop color
    if (luminance >= stops[stops.length - 1].threshold) {
      const last = stops[stops.length - 1];
      return [last.r, last.g, last.b] as const;
    }

    // Find enclosing segment and lerp
    for (let i = 1; i < stops.length; i++) {
      if (luminance <= stops[i].threshold) {
        const a = stops[i - 1];
        const b = stops[i];
        const t = (luminance - a.threshold) / (b.threshold - a.threshold);
        return [
          Math.round(a.r + t * (b.r - a.r)),
          Math.round(a.g + t * (b.g - a.g)),
          Math.round(a.b + t * (b.b - a.b)),
        ] as const;
      }
    }
    // Should never reach here
    const last = stops[stops.length - 1];
    return [last.r, last.g, last.b] as const;
  }

  function applyToBuffer(data: Uint8ClampedArray): void {
    for (let i = 0; i + 4 <= data.length; i += 4) {
      const luma = bt709Luma(_SRGB_LUT[data[i]], _SRGB_LUT[data[i + 1]], _SRGB_LUT[data[i + 2]]);
      const [fr, fg, fb] = map(luma);
      data[i]     = fr;
      data[i + 1] = fg;
      data[i + 2] = fb;
      // data[i + 3] alpha preserved
    }
  }

  function getStops(): FalseColorStop[] {
    return [...stops];
  }

  return { map, applyToBuffer, getStops };
}
