/**
 * Artone v3 — Chroma Key (Green / Blue Screen)
 *
 * Pure per-pixel chroma keying with edge feathering and spill suppression.
 * A staple of every NLE (CapCut, Premiere, DaVinci, OpenReel) that Artone was
 * missing. Operates on RGBA `Uint8ClampedArray`; writes a computed alpha so the
 * keyed footage can be composited over a background.
 *
 * Algorithm:
 *   1. Convert the key color and each pixel to YCbCr (Rec. 601). Keying in the
 *      chroma (Cb,Cr) plane is far more robust to luminance variation than RGB
 *      distance — shadows on a green screen still key out cleanly.
 *   2. Distance d = ‖(Cb,Cr)pixel − (Cb,Cr)key‖ in the chroma plane.
 *   3. Soft matte via two thresholds (similarity → fully keyed, similarity+
 *      smoothness → fully opaque) with a smoothstep transition between them.
 *   4. Spill suppression: pixels near the key hue have their key-color cast
 *      reduced (e.g. green fringe on hair) by clamping the key channel toward
 *      the average of the other two.
 *
 * References:
 *   - Smith & Blinn 1996: "Blue Screen Matting" (SIGGRAPH).
 *   - Rec. ITU-R BT.601 luma/chroma coefficients.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for chroma keying. */
export interface ChromaKeyOptions {
  /** Key color as 8-bit RGB. Default: pure green [0, 255, 0]. */
  keyColor?: [number, number, number];
  /**
   * Similarity: chroma distance (0..1, normalized) below which a pixel is fully
   * keyed out (alpha → 0). Higher removes more. Default: 0.4.
   */
  similarity?: number;
  /**
   * Smoothness: width of the soft transition band beyond `similarity`
   * (0..1). Larger = softer edges. Default: 0.1.
   */
  smoothness?: number;
  /**
   * Spill suppression strength (0..1). 0 = off, 1 = full key-channel
   * desaturation on near-key pixels. Default: 0.5.
   */
  spill?: number;
}

/** Result of a chroma key pass. */
export interface ChromaKeyResult {
  /** Keyed RGBA image (alpha computed, spill optionally suppressed). */
  output: Uint8ClampedArray;
  /** Fraction of pixels that became fully transparent (alpha === 0). */
  keyedFraction: number;
}

// ─── YCbCr conversion (Rec. 601) ──────────────────────────────────────────────

/** Cb,Cr chroma pair centered on 0 (range roughly −0.5..0.5). */
interface Chroma {
  cb: number;
  cr: number;
}

/** Convert 8-bit RGB to normalized (Cb, Cr) chroma, Rec. 601. */
function rgbToChroma(r: number, g: number, b: number): Chroma {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const y = 0.299 * rn + 0.587 * gn + 0.114 * bn;
  return {
    cb: (bn - y) * 0.564, // scaled to ~[-0.5, 0.5]
    cr: (rn - y) * 0.713,
  };
}

/** Clamp to 8-bit. */
function clamp8(x: number): number {
  const r = Math.round(x);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** Smoothstep between edge0 and edge1. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  let t = (x - edge0) / (edge1 - edge0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

// ─── Core keying ──────────────────────────────────────────────────────────────

/**
 * Apply chroma keying to an RGBA image.
 *
 * The output alpha is `255` for foreground, `0` for fully-keyed background, and
 * a smoothstep value in between for edge pixels. Existing alpha is multiplied in
 * (premultiplied semantics are NOT assumed — straight alpha).
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param opts    Chroma key options.
 * @returns       A ChromaKeyResult with the keyed image and keyed fraction.
 */
export function chromaKey(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  opts:   ChromaKeyOptions = {},
): ChromaKeyResult {
  const keyColor   = opts.keyColor   ?? [0, 255, 0];
  const similarity = clamp01(opts.similarity ?? 0.4);
  const smoothness = clamp01(opts.smoothness ?? 0.1);
  const spill      = clamp01(opts.spill      ?? 0.5);

  const keyChroma = rgbToChroma(keyColor[0], keyColor[1], keyColor[2]);
  // Which channel is dominant in the key (for spill suppression)
  const keyChannel = dominantChannel(keyColor);

  const out = new Uint8ClampedArray(src.length);
  const pixelCount = width * height;
  let keyedCount = 0;

  const edge0 = similarity;
  const edge1 = similarity + smoothness;

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = src[off], g = src[off + 1], b = src[off + 2];
    const srcA = src[off + 3];

    const c = rgbToChroma(r, g, b);
    const d = Math.hypot(c.cb - keyChroma.cb, c.cr - keyChroma.cr);

    // alpha: 0 when d <= edge0 (matches key), 1 when d >= edge1
    const matte = smoothstep(edge0, edge1, d);
    const alpha = clamp8(matte * srcA);

    let rr = r, gg = g, bb = b;

    // Spill suppression on partially-keyed / near-key pixels
    if (spill > 0 && matte < 1) {
      const suppressed = suppressSpill(rr, gg, bb, keyChannel, spill * (1 - matte));
      rr = suppressed[0]; gg = suppressed[1]; bb = suppressed[2];
    }

    out[off]     = rr;
    out[off + 1] = gg;
    out[off + 2] = bb;
    out[off + 3] = alpha;
    if (alpha === 0) keyedCount++;
  }

  return { output: out, keyedFraction: pixelCount > 0 ? keyedCount / pixelCount : 0 };
}

// ─── Spill suppression ────────────────────────────────────────────────────────

/** Identify the dominant channel of the key color: 0=R, 1=G, 2=B. */
function dominantChannel(key: [number, number, number]): 0 | 1 | 2 {
  if (key[1] >= key[0] && key[1] >= key[2]) return 1; // green
  if (key[2] >= key[0] && key[2] >= key[1]) return 2; // blue
  return 0; // red
}

/**
 * Reduce key-color spill by clamping the dominant key channel toward the mean
 * of the other two channels, weighted by `amount`.
 *
 * For a green screen, green fringe on edges is pulled down to (r+b)/2.
 */
function suppressSpill(
  r: number, g: number, b: number,
  keyChannel: 0 | 1 | 2,
  amount: number,
): [number, number, number] {
  let nr = r, ng = g, nb = b;
  if (keyChannel === 1) {
    const limit = (r + b) / 2;
    if (g > limit) ng = clamp8(g + (limit - g) * amount);
  } else if (keyChannel === 2) {
    const limit = (r + g) / 2;
    if (b > limit) nb = clamp8(b + (limit - b) * amount);
  } else {
    const limit = (g + b) / 2;
    if (r > limit) nr = clamp8(r + (limit - r) * amount);
  }
  return [nr, ng, nb];
}

// ─── Standalone spill suppression (no keying) ────────────────────────────────

/**
 * Apply spill suppression to an entire image without changing alpha.
 *
 * Useful as a cleanup pass after an external matte, or to remove a color cast.
 *
 * @param src         Source RGBA data.
 * @param width       Image width.
 * @param height      Image height.
 * @param keyColor    Key color whose spill to remove. Default: green.
 * @param amount      Suppression strength (0..1). Default: 1.
 * @returns           New RGBA image with spill reduced (alpha preserved).
 */
export function suppressSpillImage(
  src:      Uint8ClampedArray | Uint8Array,
  width:    number,
  height:   number,
  keyColor: [number, number, number] = [0, 255, 0],
  amount =  1,
): Uint8ClampedArray {
  const a = clamp01(amount);
  const keyChannel = dominantChannel(keyColor);
  const out = new Uint8ClampedArray(src.length);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const [r, g, b] = suppressSpill(src[off], src[off + 1], src[off + 2], keyChannel, a);
    out[off] = r; out[off + 1] = g; out[off + 2] = b; out[off + 3] = src[off + 3];
  }
  return out;
}

// ─── Composite ────────────────────────────────────────────────────────────────

/**
 * Composite a (keyed) foreground over a background using straight alpha.
 *
 * `out = fg·α + bg·(1−α)` per channel; output alpha = 255 (opaque result).
 * Both images must share dimensions.
 *
 * @param fg      Foreground RGBA (with computed alpha).
 * @param bg      Background RGBA.
 * @param width   Image width.
 * @param height  Image height.
 * @returns       New composited RGBA image (opaque).
 */
export function compositeOver(
  fg:     Uint8ClampedArray | Uint8Array,
  bg:     Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const a = fg[off + 3] / 255;
    const ia = 1 - a;
    out[off]     = clamp8(fg[off]     * a + bg[off]     * ia);
    out[off + 1] = clamp8(fg[off + 1] * a + bg[off + 1] * ia);
    out[off + 2] = clamp8(fg[off + 2] * a + bg[off + 2] * ia);
    out[off + 3] = 255;
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp to [0, 1]. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Estimate a key color automatically from the image border (the most common
 * border color is assumed to be the screen). Samples the 1-pixel frame.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @returns       Estimated key color [r, g, b].
 */
export function estimateKeyColor(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): [number, number, number] {
  let sr = 0, sg = 0, sb = 0, n = 0;
  const sample = (x: number, y: number): void => {
    const off = (y * width + x) * 4;
    sr += src[off]; sg += src[off + 1]; sb += src[off + 2]; n++;
  };
  for (let x = 0; x < width; x++) { sample(x, 0); sample(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { sample(0, y); sample(width - 1, y); }
  if (n === 0) return [0, 255, 0];
  return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
}
