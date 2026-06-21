/**
 * Artone v3 — Spatial Convolution & Sharpening
 *
 * Pure image convolution primitives used for sharpening, blurring, edge
 * detection, and embossing — effects every NLE ships (Premiere "Sharpen",
 * DaVinci "Sharpen"/"Unsharp Mask", CapCut "Enhance") that Artone lacked.
 *
 * Provides:
 *   - General NxN kernel convolution (`convolve`).
 *   - Separable convolution (`convolveSeparable`) — O(N) vs O(N²) for blur/
 *     Gaussian where the 2-D kernel is an outer product of 1-D kernels.
 *   - Unsharp masking (`unsharpMask`) — the standard sharpening method:
 *     sharp = original + amount·(original − blurred), with a threshold to avoid
 *     amplifying noise.
 *   - Convenience effects: `sharpen`, `boxBlur`, `gaussianBlur`, `edgeDetect`
 *     (Sobel magnitude), `emboss`.
 *
 * All functions take/return RGBA `Uint8ClampedArray`; alpha is preserved. Edge
 * pixels use clamped (replicate) boundary handling.
 *
 * References:
 *   - Gonzalez & Woods 2008: "Digital Image Processing" (§3 spatial filtering).
 *   - Sobel & Feldman 1968: 3×3 gradient operator.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A square convolution kernel. */
export interface Kernel {
  /** Flat row-major weights, length = size·size. */
  weights: number[] | Float64Array;
  /** Kernel side length (odd: 3, 5, 7…). */
  size: number;
  /** Optional divisor (normalization). Default: sum of weights or 1. */
  divisor?: number;
  /** Optional bias added after division. Default: 0. */
  bias?: number;
}

/** Options for unsharp masking. */
export interface UnsharpOptions {
  /** Sharpening strength multiplier. Default: 1.0. */
  amount?: number;
  /** Blur radius (Gaussian sigma proxy) in pixels. Default: 1.5. */
  radius?: number;
  /**
   * Threshold (0..255): minimum local contrast before sharpening is applied,
   * to avoid amplifying flat-region noise. Default: 0.
   */
  threshold?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp to 8-bit. */
function clamp8(x: number): number {
  const r = Math.round(x);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** Replicate-boundary index clamp. */
function clampIdx(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

// ─── General convolution ──────────────────────────────────────────────────────

/**
 * Convolve an RGBA image with a square kernel (replicate boundary).
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param kernel  Convolution kernel.
 * @returns       New convolved RGBA image (alpha preserved).
 */
export function convolve(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  kernel: Kernel,
): Uint8ClampedArray {
  const { weights, size } = kernel;
  const radius = size >> 1;
  let divisor = kernel.divisor;
  if (divisor === undefined) {
    let s = 0;
    for (let k = 0; k < weights.length; k++) s += weights[k];
    divisor = s === 0 ? 1 : s;
  }
  // An explicit divisor of 0 (e.g. a preset derived from a zero-sum kernel)
  // would make invDiv Infinity and blow out the whole image — guard it like
  // the auto-computed path above.
  if (divisor === 0) divisor = 1;
  const bias = kernel.bias ?? 0;
  const invDiv = 1 / divisor;

  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let accR = 0, accG = 0, accB = 0;
      for (let ky = 0; ky < size; ky++) {
        const sy = clampIdx(y + ky - radius, height);
        for (let kx = 0; kx < size; kx++) {
          const sx = clampIdx(x + kx - radius, width);
          const w = weights[ky * size + kx];
          const off = (sy * width + sx) * 4;
          accR += src[off]     * w;
          accG += src[off + 1] * w;
          accB += src[off + 2] * w;
        }
      }
      const outOff = (y * width + x) * 4;
      out[outOff]     = clamp8(accR * invDiv + bias);
      out[outOff + 1] = clamp8(accG * invDiv + bias);
      out[outOff + 2] = clamp8(accB * invDiv + bias);
      out[outOff + 3] = src[(y * width + x) * 4 + 3]; // alpha passthrough
    }
  }
  return out;
}

/**
 * Separable convolution: apply a 1-D kernel horizontally then vertically.
 *
 * Equivalent to convolving with the outer product kernel but O(N) per pixel
 * instead of O(N²). Use for box / Gaussian blur.
 *
 * @param src      Source RGBA data.
 * @param width    Image width.
 * @param height   Image height.
 * @param kernel1d 1-D kernel weights (odd length). Normalized internally.
 * @returns        New blurred RGBA image (alpha preserved).
 */
export function convolveSeparable(
  src:      Uint8ClampedArray | Uint8Array,
  width:    number,
  height:   number,
  kernel1d: number[] | Float64Array,
): Uint8ClampedArray {
  const size = kernel1d.length;
  const radius = size >> 1;
  let sum = 0;
  for (let k = 0; k < size; k++) sum += kernel1d[k];
  const invSum = sum === 0 ? 1 : 1 / sum;

  // Horizontal pass → float temp
  const tmp = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < size; k++) {
        const sx = clampIdx(x + k - radius, width);
        const off = (y * width + sx) * 4;
        const w = kernel1d[k];
        r += src[off] * w; g += src[off + 1] * w; b += src[off + 2] * w;
      }
      const t = (y * width + x) * 4;
      tmp[t] = r * invSum; tmp[t + 1] = g * invSum; tmp[t + 2] = b * invSum;
      tmp[t + 3] = src[t + 3];
    }
  }

  // Vertical pass → output
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < size; k++) {
        const sy = clampIdx(y + k - radius, height);
        const off = (sy * width + x) * 4;
        const w = kernel1d[k];
        r += tmp[off] * w; g += tmp[off + 1] * w; b += tmp[off + 2] * w;
      }
      const o = (y * width + x) * 4;
      out[o] = clamp8(r * invSum); out[o + 1] = clamp8(g * invSum);
      out[o + 2] = clamp8(b * invSum); out[o + 3] = src[o + 3];
    }
  }
  return out;
}

// ─── Gaussian / box kernels ───────────────────────────────────────────────────

/**
 * Build a 1-D Gaussian kernel for separable blur.
 *
 * @param sigma  Standard deviation in pixels (> 0).
 * @param radius Kernel radius. Default: ceil(3·sigma).
 */
export function gaussianKernel1d(sigma: number, radius?: number): Float64Array {
  const r = radius ?? Math.max(1, Math.ceil(3 * sigma));
  const size = 2 * r + 1;
  const k = new Float64Array(size);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / s2);
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

/**
 * Gaussian blur via separable convolution.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param sigma   Gaussian sigma. Default: 1.5.
 * @returns       New blurred RGBA image.
 */
export function gaussianBlur(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  sigma = 1.5,
): Uint8ClampedArray {
  return convolveSeparable(src, width, height, gaussianKernel1d(sigma));
}

/**
 * Box blur via separable convolution.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param radius  Box radius (≥ 1). Default: 1.
 * @returns       New blurred RGBA image.
 */
export function boxBlur(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  radius = 1,
): Uint8ClampedArray {
  const size = 2 * Math.max(1, radius) + 1;
  return convolveSeparable(src, width, height, new Float64Array(size).fill(1));
}

// ─── Unsharp mask / sharpen ───────────────────────────────────────────────────

/**
 * Unsharp masking — the standard high-quality sharpening method.
 *
 * For each pixel: `out = src + amount·(src − blur)` when local contrast
 * `|src − blur|` exceeds `threshold`, else `out = src`.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param opts    Unsharp options.
 * @returns       New sharpened RGBA image (alpha preserved).
 */
export function unsharpMask(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  opts:   UnsharpOptions = {},
): Uint8ClampedArray {
  const amount    = opts.amount    ?? 1.0;
  const radius    = opts.radius    ?? 1.5;
  const threshold = opts.threshold ?? 0;

  const blur = gaussianBlur(src, width, height, radius);
  const out = new Uint8ClampedArray(src.length);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    for (let c = 0; c < 3; c++) {
      const s = src[off + c];
      const b = blur[off + c];
      const diff = s - b;
      out[off + c] = Math.abs(diff) < threshold ? s : clamp8(s + amount * diff);
    }
    out[off + 3] = src[off + 3];
  }
  return out;
}

/**
 * Simple 3×3 sharpen convolution (center-weighted high-pass).
 *
 * Kernel:  0 −1  0 ; −1  5 −1 ; 0 −1  0  (strength scales the off-center taps).
 *
 * @param src       Source RGBA data.
 * @param width     Image width.
 * @param height    Image height.
 * @param strength  Sharpen strength (≥ 0). Default: 1.
 * @returns         New sharpened RGBA image.
 */
export function sharpen(
  src:      Uint8ClampedArray | Uint8Array,
  width:    number,
  height:   number,
  strength = 1,
): Uint8ClampedArray {
  const s = strength;
  const weights = [
    0,    -s,     0,
    -s,    1 + 4 * s, -s,
    0,    -s,     0,
  ];
  return convolve(src, width, height, { weights, size: 3, divisor: 1 });
}

// ─── Edge detection & emboss ──────────────────────────────────────────────────

/**
 * Sobel edge-detection magnitude (grayscale output in RGB, alpha preserved).
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @returns       New RGBA image where each channel = gradient magnitude.
 */
export function edgeDetect(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): Uint8ClampedArray {
  // Work on luma for stability
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    luma[i] = 0.299 * src[off] + 0.587 * src[off + 1] + 0.114 * src[off + 2];
  }

  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = 0, sy = 0;
      for (let ky = 0; ky < 3; ky++) {
        const yy = clampIdx(y + ky - 1, height);
        for (let kx = 0; kx < 3; kx++) {
          const xx = clampIdx(x + kx - 1, width);
          const l = luma[yy * width + xx];
          sx += l * gx[ky * 3 + kx];
          sy += l * gy[ky * 3 + kx];
        }
      }
      const mag = clamp8(Math.hypot(sx, sy));
      const off = (y * width + x) * 4;
      out[off] = out[off + 1] = out[off + 2] = mag;
      out[off + 3] = src[off + 3];
    }
  }
  return out;
}

/**
 * Emboss effect via a directional gradient kernel.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @returns       New embossed RGBA image (gray, alpha preserved).
 */
export function emboss(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): Uint8ClampedArray {
  const weights = [
    -2, -1, 0,
    -1,  1, 1,
     0,  1, 2,
  ];
  return convolve(src, width, height, { weights, size: 3, divisor: 1, bias: 128 });
}
