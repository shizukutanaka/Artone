/**
 * Artone v3 — Canvas 2D コンテキストの取得ヘルパ
 *
 * `OffscreenCanvas` に 2D で描く箇所 (`core/` のエフェクト、`scopes/` の波形計算、
 * `ai/` の前処理) が同じ2つの誤りを繰り返していたため、1箇所へ集約する。
 *
 * 1. `getContext('2d')!` — **本当に null を返しうる**のに `!` で潰していた
 * 2. `let canvas / let ctx` を別々の `| null` に持ち、型が絞り込めないため
 *    使用箇所すべてを `!` で潰していた
 *
 * # AI generated (reviewed)
 *
 * @version 3.4.0
 */

/**
 * `OffscreenCanvas` の 2D コンテキストを取得する。取れなければ落とす。
 *
 * `getContext('2d')` は**本当に null を返しうる** (同時生成数の上限、
 * メモリ逼迫、別種のコンテキストを既に取得済み等)。`!` で潰すと、後段の
 * `ctx.drawImage(...)` が「null の drawImage を読めない」という**原因から
 * 遠い場所**で落ちる。ここで理由付きで落としたほうが調査が早い。
 */
export function require2dContext(
  canvas: OffscreenCanvas,
  options?: CanvasRenderingContext2DSettings,
): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) {
    throw new Error('OffscreenCanvas 2D context is unavailable (too many contexts or out of memory)');
  }
  return ctx;
}

/** 遅延生成する描画面 (キャンバスとその 2D コンテキストは常に対で扱う)。 */
export interface DrawSurface {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

/**
 * `w×h` の描画面を用意する。既存の面が同じ寸法ならそれを使い回す。
 *
 * キャンバスとコンテキストを**1つのオブジェクトに束ねる**のが要点で、
 * 別々の `let ... | null` に持つと型が絞り込めず、結果として全使用箇所が
 * `!` で潰される (実際そうなっていた)。束ねれば `!` は不要になる。
 */
export function ensureSurface(
  current: DrawSurface | null,
  w: number,
  h: number,
  options?: CanvasRenderingContext2DSettings,
): DrawSurface {
  if (current && current.canvas.width === w && current.canvas.height === h) return current;
  const canvas = new OffscreenCanvas(w, h);
  return { canvas, ctx: require2dContext(canvas, options) };
}
