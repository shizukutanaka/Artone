/**
 * Artone v3 — White Balance
 *
 * Automatic white balance analysis and gain correction for sRGB pixel buffers.
 *
 * Supported algorithms:
 *   - `gray-world`   — assumes scene average is neutral grey (von Kries diagonal)
 *   - `white-patch`  — assumes brightest pixels are specular white (Max RGB)
 *   - `percentile`   — uses a high percentile (default 98th) as the white reference
 *   - `illuminant`   — explicit white point given as {r, g, b} tristimulus
 *
 * All algorithms return per-channel gain multipliers {r, g, b} that map the
 * estimated illuminant to achromatic white. Applying the gains neutralises
 * the colour cast.
 *
 * References:
 *   - Buchsbaum (1980) "A spatial processor model for object colour perception"
 *     (Gray World)
 *   - Land & McCann (1971) "Lightness and Retinex theory" (White Patch / Retinex)
 *   - Finlayson & Trezzi (2004) "Shades of Gray and Colour Constancy"
 *     (percentile generalisation)
 *   - von Kries (1902) chromatic adaptation (diagonal gain model)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-channel RGB gain multipliers for white balance correction. */
export interface WBGains {
  /** Red channel gain (multiply each R pixel by this). */
  r: number;
  /** Green channel gain. */
  g: number;
  /** Blue channel gain. */
  b: number;
}

/** Algorithm for estimating the scene illuminant from pixel data. */
export type WBAlgorithm = 'gray-world' | 'white-patch' | 'percentile';

/** Options for white balance estimation. */
export interface WBOptions {
  /** Algorithm to use. Default: `'gray-world'`. */
  algorithm?: WBAlgorithm;
  /**
   * For `'percentile'`: the percentile to use as white reference (0–100).
   * Default: 98. At 100 this is equivalent to `'white-patch'`.
   */
  percentile?: number;
  /**
   * Skip pixels with luma below this threshold (0–255) to exclude blacks.
   * Default: 20.
   */
  minLuma?: number;
  /**
   * Skip pixels with luma above this threshold (0–255) to exclude specular highlights
   * in `'gray-world'` and `'percentile'` modes. Default: 235 (broadcast safe).
   */
  maxLuma?: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** BT.601 luma approximation for sRGB bytes. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Compute gains that map illuminant (r,g,b) to achromatic (g,g,g). */
function gainsFromIlluminant(rEst: number, gEst: number, bEst: number): WBGains {
  if (gEst < 1e-6) return { r: 1, g: 1, b: 1 };
  // Normalise so green gain = 1 (green is the reference channel)
  return {
    r: gEst / Math.max(rEst, 1e-6),
    g: 1,
    b: gEst / Math.max(bEst, 1e-6),
  };
}

// ─── Public analysis functions ────────────────────────────────────────────────

/**
 * Compute Gray World white balance gains from an sRGB RGBA buffer.
 *
 * Estimates the illuminant as the mean of each channel over all eligible pixels.
 *
 * @param data    sRGB RGBA Uint8ClampedArray.
 * @param minLuma Minimum luma to include (default 20).
 * @param maxLuma Maximum luma to include (default 235).
 */
export function grayWorldGains(
  data: Uint8ClampedArray,
  minLuma = 20,
  maxLuma = 235,
): WBGains {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = luma(r, g, b);
    if (y < minLuma || y > maxLuma) continue;
    sumR += r; sumG += g; sumB += b; count++;
  }
  if (count === 0) return { r: 1, g: 1, b: 1 };
  return gainsFromIlluminant(sumR / count, sumG / count, sumB / count);
}

/**
 * Compute White Patch white balance gains from an sRGB RGBA buffer.
 *
 * Estimates the illuminant as the maximum value of each channel across
 * all eligible pixels (assumes the brightest patch is a specular highlight).
 */
export function whitePatchGains(
  data: Uint8ClampedArray,
  minLuma = 20,
): WBGains {
  let maxR = 0, maxG = 0, maxB = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (luma(r, g, b) < minLuma) continue;
    if (r > maxR) maxR = r;
    if (g > maxG) maxG = g;
    if (b > maxB) maxB = b;
  }
  return gainsFromIlluminant(maxR, maxG, maxB);
}

/**
 * Compute percentile-based white balance gains from an sRGB RGBA buffer.
 *
 * Uses a high percentile of each channel's histogram as the white reference.
 * At `p=100` this is equivalent to White Patch; lower values are more robust
 * to specular noise.
 *
 * @param data        sRGB RGBA Uint8ClampedArray.
 * @param percentile  Percentile to use as white reference (0–100). Default: 98.
 * @param minLuma     Minimum luma to include. Default: 20.
 */
export function percentileGains(
  data: Uint8ClampedArray,
  percentile = 98,
  minLuma = 20,
): WBGains {
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  let count = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (luma(r, g, b) < minLuma) continue;
    histR[r]++; histG[g]++; histB[b]++;
    count++;
  }

  if (count === 0) return { r: 1, g: 1, b: 1 };

  // Find the value at the given percentile for each channel
  const targetCount = Math.ceil(count * percentile / 100);

  function percentileValue(hist: Uint32Array): number {
    let cum = 0;
    for (let v = 255; v >= 0; v--) {
      cum += hist[v];
      if (cum >= count - targetCount + 1) return v;
    }
    return 0;
  }

  const pR = percentileValue(histR);
  const pG = percentileValue(histG);
  const pB = percentileValue(histB);

  return gainsFromIlluminant(pR, pG, pB);
}

/**
 * Compute white balance gains from an explicit illuminant colour.
 *
 * Use this when the user clicks a neutral grey/white area: pass the
 * sampled (r, g, b) value as the illuminant.
 *
 * @param r  Red channel value of the neutral point (0–255).
 * @param g  Green channel value of the neutral point.
 * @param b  Blue channel value of the neutral point.
 */
export function illuminantGains(r: number, g: number, b: number): WBGains {
  return gainsFromIlluminant(r, g, b);
}

/**
 * Unified white balance gain estimation.
 *
 * @param data    sRGB RGBA Uint8ClampedArray.
 * @param options Estimation options.
 */
export function estimateWhiteBalance(
  data: Uint8ClampedArray,
  options: WBOptions = {},
): WBGains {
  const algorithm = options.algorithm ?? 'gray-world';
  const minLuma   = options.minLuma ?? 20;
  const maxLuma   = options.maxLuma ?? 235;

  switch (algorithm) {
    case 'white-patch':
      return whitePatchGains(data, minLuma);
    case 'percentile':
      return percentileGains(data, options.percentile ?? 98, minLuma);
    default:
      return grayWorldGains(data, minLuma, maxLuma);
  }
}

// ─── Gain application ─────────────────────────────────────────────────────────

/**
 * Apply white balance gains to an sRGB RGBA buffer **in-place**.
 *
 * Each pixel's R, G, B channels are multiplied by the respective gain
 * and clamped to [0, 255]. Alpha is unchanged.
 *
 * @param data  sRGB RGBA Uint8ClampedArray (modified in-place).
 * @param gains WBGains to apply.
 */
export function applyWhiteBalance(data: Uint8ClampedArray, gains: WBGains): void {
  for (let i = 0; i + 3 < data.length; i += 4) {
    data[i]     = Math.max(0, Math.min(255, Math.round(data[i]     * gains.r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * gains.g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * gains.b)));
    // alpha [i+3] unchanged
  }
}

/**
 * Compose two sets of gains: apply `a` first then `b`.
 *
 * Useful for chaining a camera native white balance with a creative LUT correction.
 */
export function composeGains(a: WBGains, b: WBGains): WBGains {
  return { r: a.r * b.r, g: a.g * b.g, b: a.b * b.b };
}

/**
 * Invert a set of gains: the inverse undoes the correction.
 *
 * `applyWhiteBalance(frame, invertGains(gains))` restores the original colour cast.
 */
export function invertGains(gains: WBGains): WBGains {
  return {
    r: 1 / Math.max(gains.r, 1e-10),
    g: 1 / Math.max(gains.g, 1e-10),
    b: 1 / Math.max(gains.b, 1e-10),
  };
}
