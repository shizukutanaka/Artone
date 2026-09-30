/**
 * Artone v3 — 画素バッファの形
 *
 * 「データ + 寸法」と「寸法だけ」という、モジュールをまたいで何度も現れる組。
 *
 * ## なぜ型にするのか
 * これらを位置引数 `(data, srcW, srcH, dstW, dstH)` で渡すと、**4つとも
 * `number` なのでコンパイラが取り違えを検出できない**。縦横の入れ替えや
 * src/dst の取り違えは例外にならず、**歪んだ絵**という形で出力にだけ現れる —
 * 最も見つけにくい種類の誤りである。
 *
 * `render/` と `ai/` の双方が同じ形を必要とするため、どちらかに置くと
 * もう一方が依存するか複製することになる。共有の土台である `core/` に置く。
 *
 * # AI generated (reviewed)
 *
 * @version 3.0.0
 */

/** 画素の寸法。 */
export interface PixelSize {
  width: number;
  height: number;
}

/**
 * RGBA 画素バッファ。`data.length === width * height * 4` を満たす。
 *
 * 単チャンネル (マスク等) は {@link PlaneBuffer} を使う。
 */
export interface PixelBuffer extends PixelSize {
  data: Uint8ClampedArray;
}

/**
 * **読み取り用**の RGBA 画素バッファ。
 *
 * 入力は `Uint8ClampedArray` と `Uint8Array` のどちらも来るため、受け口は
 * 両方を許す。{@link PixelBuffer} はこれに代入できる (出力側は書き込みで
 * 自動クランプが要るので `Uint8ClampedArray` に固定する)。
 */
export interface PixelSource extends PixelSize {
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * 単チャンネルの平面バッファ (マスク・輝度など)。
 * `data.length === width * height` を満たす。
 */
export interface PlaneBuffer extends PixelSize {
  data: Uint8Array;
}
