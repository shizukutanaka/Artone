/**
 * Artone v3 — Spatial Image Resampler
 *
 * High-quality CPU-side pixel resampling for frame resize operations
 * (proxy generation, export scaling, thumbnail creation).
 *
 * Supported kernels:
 *   - `nearest`  — nearest-neighbour (fastest, pixelated)
 *   - `bilinear` — linear 2×2 sample interpolation (fast, mild blur)
 *   - `bicubic`  — Keys cubic 4×4 interpolation (Mitchell-Netravali a=−0.5)
 *   - `lanczos3` — Lanczos-3 sinc windowed kernel (best quality, 6×6 window)
 *
 * All functions operate on sRGB RGBA `Uint8ClampedArray` buffers (4 bytes/pixel,
 * row-major). Alpha is resampled identically to colour channels.
 *
 * References:
 *   - Keys (1989) "Cubic convolution interpolation for digital image processing"
 *   - Mitchell & Netravali (1988) "Reconstruction filters in computer graphics"
 *   - Lanczos resampling: https://en.wikipedia.org/wiki/Lanczos_resampling
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Resampling kernel identifier. */
export type ResampleKernel = 'nearest' | 'bilinear' | 'bicubic' | 'lanczos3';

/** Options for resampling. */
export interface ResampleOptions {
  /** Resampling kernel to use. Default: `'bilinear'`. */
  kernel?: ResampleKernel;
}

// ─── Nearest-neighbour ────────────────────────────────────────────────────────

/**
 * Nearest-neighbour resampling. O(W×H) — fastest, blocky at magnification.
 */
export function resampleNearest(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * yScale));
    for (let x = 0; x < dstW; x++) {
      const sx   = Math.min(srcW - 1, Math.floor(x * xScale));
      const srcOff = (sy * srcW + sx) * 4;
      const dstOff = (y  * dstW + x)  * 4;
      dst[dstOff]     = src[srcOff];
      dst[dstOff + 1] = src[srcOff + 1];
      dst[dstOff + 2] = src[srcOff + 2];
      dst[dstOff + 3] = src[srcOff + 3];
    }
  }
  return dst;
}

// ─── Bilinear resampling ──────────────────────────────────────────────────────

/**
 * Bilinear resampling with 2×2 weighted sample. O(4×W×H).
 * Good quality for moderate downscaling and upscaling.
 */
export function resampleBilinear(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const fy  = (y + 0.5) * yScale - 0.5;
    const y0  = Math.max(0, Math.min(srcH - 1, Math.floor(fy)));
    const y1  = Math.min(srcH - 1, y0 + 1);
    const ty  = fy - y0;

    for (let x = 0; x < dstW; x++) {
      const fx  = (x + 0.5) * xScale - 0.5;
      const x0  = Math.max(0, Math.min(srcW - 1, Math.floor(fx)));
      const x1  = Math.min(srcW - 1, x0 + 1);
      const tx  = fx - x0;

      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx       * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx       * ty;

      const off00 = (y0 * srcW + x0) * 4;
      const off10 = (y0 * srcW + x1) * 4;
      const off01 = (y1 * srcW + x0) * 4;
      const off11 = (y1 * srcW + x1) * 4;

      const dstOff = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        dst[dstOff + c] = Math.round(
          src[off00 + c] * w00 +
          src[off10 + c] * w10 +
          src[off01 + c] * w01 +
          src[off11 + c] * w11,
        );
      }
    }
  }
  return dst;
}

// ─── Keys cubic kernel ────────────────────────────────────────────────────────

/** Keys cubic weight function (a = −0.5 ≈ Catmull-Rom). */
function cubicWeight(t: number): number {
  const a = -0.5;
  const at = Math.abs(t);
  if (at < 1) return (a + 2) * at * at * at - (a + 3) * at * at + 1;
  if (at < 2) return a * at * at * at - 5 * a * at * at + 8 * a * at - 4 * a;
  return 0;
}

/**
 * Bicubic resampling using Keys cubic kernel (a=−0.5). O(16×W×H).
 * Produces sharper results than bilinear, especially at magnification.
 */
export function resampleBicubic(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const fy  = (y + 0.5) * yScale - 0.5;
    const iy  = Math.floor(fy);
    const dy  = fy - iy;

    for (let x = 0; x < dstW; x++) {
      const fx  = (x + 0.5) * xScale - 0.5;
      const ix  = Math.floor(fx);
      const dx  = fx - ix;

      const dstOff = (y * dstW + x) * 4;
      let or = 0, og = 0, ob = 0, oa = 0;

      for (let m = -1; m <= 2; m++) {
        const wy = cubicWeight(dy - m);
        const sy = Math.max(0, Math.min(srcH - 1, iy + m));

        for (let n = -1; n <= 2; n++) {
          const wx   = cubicWeight(dx - n);
          const sx   = Math.max(0, Math.min(srcW - 1, ix + n));
          const w    = wy * wx;
          const sOff = (sy * srcW + sx) * 4;
          or += src[sOff]     * w;
          og += src[sOff + 1] * w;
          ob += src[sOff + 2] * w;
          oa += src[sOff + 3] * w;
        }
      }

      dst[dstOff]     = Math.max(0, Math.min(255, Math.round(or)));
      dst[dstOff + 1] = Math.max(0, Math.min(255, Math.round(og)));
      dst[dstOff + 2] = Math.max(0, Math.min(255, Math.round(ob)));
      dst[dstOff + 3] = Math.max(0, Math.min(255, Math.round(oa)));
    }
  }
  return dst;
}

// ─── Lanczos-3 kernel ─────────────────────────────────────────────────────────

const LANCZOS_A = 3;

function sinc(x: number): number {
  if (Math.abs(x) < 1e-10) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczosWeight(t: number): number {
  if (Math.abs(t) >= LANCZOS_A) return 0;
  return sinc(t) * sinc(t / LANCZOS_A);
}

/**
 * Lanczos-3 resampling. O(36×W×H) — best quality, slowest.
 * Preserves high-frequency detail at downscaling and minimises ringing.
 */
export function resampleLanczos3(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const fy  = (y + 0.5) * yScale - 0.5;
    const iy  = Math.floor(fy);

    for (let x = 0; x < dstW; x++) {
      const fx  = (x + 0.5) * xScale - 0.5;
      const ix  = Math.floor(fx);

      const dstOff = (y * dstW + x) * 4;
      let r = 0, g = 0, b = 0, a = 0, wSum = 0;

      for (let m = -(LANCZOS_A - 1); m <= LANCZOS_A; m++) {
        const wy = lanczosWeight(fy - (iy + m));
        const sy = Math.max(0, Math.min(srcH - 1, iy + m));

        for (let n = -(LANCZOS_A - 1); n <= LANCZOS_A; n++) {
          const wx   = lanczosWeight(fx - (ix + n));
          const w    = wy * wx;
          const sx   = Math.max(0, Math.min(srcW - 1, ix + n));
          const sOff = (sy * srcW + sx) * 4;
          r += src[sOff]     * w;
          g += src[sOff + 1] * w;
          b += src[sOff + 2] * w;
          a += src[sOff + 3] * w;
          wSum += w;
        }
      }

      if (Math.abs(wSum) > 1e-10) {
        r /= wSum; g /= wSum; b /= wSum; a /= wSum;
      }

      dst[dstOff]     = Math.max(0, Math.min(255, Math.round(r)));
      dst[dstOff + 1] = Math.max(0, Math.min(255, Math.round(g)));
      dst[dstOff + 2] = Math.max(0, Math.min(255, Math.round(b)));
      dst[dstOff + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }
  return dst;
}

// ─── Unified API ─────────────────────────────────────────────────────────────

/**
 * Resample a RGBA pixel buffer to new dimensions.
 *
 * @param src     Source sRGB RGBA buffer (4 bytes/pixel, row-major).
 * @param srcW    Source width in pixels.
 * @param srcH    Source height in pixels.
 * @param dstW    Target width in pixels.
 * @param dstH    Target height in pixels.
 * @param options Resampling options (kernel). Default: `'bilinear'`.
 *
 * @example
 * ```ts
 * const thumb = resample(frameData, 1920, 1080, 320, 180, { kernel: 'lanczos3' });
 * ```
 */
export function resample(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  options: ResampleOptions = {},
): Uint8ClampedArray {
  const kernel = options.kernel ?? 'bilinear';
  switch (kernel) {
    case 'nearest':  return resampleNearest(src, srcW, srcH, dstW, dstH);
    case 'bilinear': return resampleBilinear(src, srcW, srcH, dstW, dstH);
    case 'bicubic':  return resampleBicubic(src, srcW, srcH, dstW, dstH);
    case 'lanczos3': return resampleLanczos3(src, srcW, srcH, dstW, dstH);
  }
}
