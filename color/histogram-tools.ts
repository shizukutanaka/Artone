/**
 * Artone v3 — Histogram Analysis & Tone Operations
 *
 * Pure image-analysis utilities for color grading and auto-correction.
 * Complements `grading-engine.ts` (GPU wheels/curves/3D-LUT) and
 * `scopes/video-scopes.ts` (display) with standalone, testable tone math:
 *
 *   - Per-channel and luma histograms (256 bins).
 *   - Cumulative distribution (CDF) and statistics (min/max/mean/median/percentile).
 *   - Histogram equalization (CDF remap) for contrast enhancement.
 *   - Levels adjustment (input black/white, gamma, output black/white).
 *   - Auto-contrast (percentile-clipped stretch).
 *   - 8-bit LUT construction & application.
 *
 * Operates on RGBA `Uint8ClampedArray` (width × height × 4). The alpha channel
 * is always preserved. Luma uses Rec. 709 coefficients.
 *
 * References:
 *   - Gonzalez & Woods 2008: "Digital Image Processing" (§3 histogram processing).
 *   - ITU-R BT.709: luma coefficients (0.2126, 0.7152, 0.0722).
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A set of 256-bin histograms for an RGBA image. */
export interface Histogram {
  /** Red channel counts (length 256). */
  r: Uint32Array;
  /** Green channel counts (length 256). */
  g: Uint32Array;
  /** Blue channel counts (length 256). */
  b: Uint32Array;
  /** Rec. 709 luma counts (length 256). */
  luma: Uint32Array;
  /** Number of pixels counted. */
  pixelCount: number;
}

/** Per-channel statistical summary. */
export interface ChannelStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

/** Levels adjustment parameters (each in [0, 255] except gamma). */
export interface LevelsParams {
  /** Input black point (values ≤ this map to output black). Default: 0. */
  inBlack?: number;
  /** Input white point (values ≥ this map to output white). Default: 255. */
  inWhite?: number;
  /** Midtone gamma (>1 brightens, <1 darkens). Default: 1.0. */
  gamma?: number;
  /** Output black point. Default: 0. */
  outBlack?: number;
  /** Output white point. Default: 255. */
  outWhite?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Rec. 709 luma coefficients. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp to the 8-bit range and round. */
function clamp8(x: number): number {
  const r = Math.round(x);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** Rec. 709 luma of an 8-bit RGB triple (rounded to 0..255). */
export function luma709(r: number, g: number, b: number): number {
  return clamp8(LUMA_R * r + LUMA_G * g + LUMA_B * b);
}

// ─── Histogram computation ────────────────────────────────────────────────────

/**
 * Compute per-channel and luma histograms for an RGBA image.
 *
 * @param src     RGBA pixel data.
 * @param width   Image width (unused for counting but validates length).
 * @param height  Image height.
 * @returns       A Histogram with 256-bin arrays per channel.
 */
export function computeHistogram(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): Histogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const rr = src[off];
    const gg = src[off + 1];
    const bb = src[off + 2];
    r[rr]++;
    g[gg]++;
    b[bb]++;
    luma[luma709(rr, gg, bb)]++;
  }

  return { r, g, b, luma, pixelCount };
}

/**
 * Compute the cumulative distribution (CDF) of a 256-bin histogram channel.
 *
 * @param channel  A 256-element count array.
 * @returns        A 256-element cumulative array (monotonically non-decreasing).
 */
export function cumulativeHistogram(channel: Uint32Array): Uint32Array {
  const cdf = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += channel[i];
    cdf[i] = sum;
  }
  return cdf;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

/**
 * Compute statistics (min, max, mean, median) of a single histogram channel.
 *
 * @param channel  256-bin count array.
 * @returns        ChannelStats. For an empty channel all fields are 0.
 */
export function channelStats(channel: Uint32Array): ChannelStats {
  let total = 0;
  let weighted = 0;
  let min = -1;
  let max = 0;
  for (let v = 0; v < 256; v++) {
    const c = channel[v];
    if (c === 0) continue;
    if (min < 0) min = v;
    max = v;
    total += c;
    weighted += v * c;
  }
  if (total === 0) return { min: 0, max: 0, mean: 0, median: 0 };

  // Median: value at cumulative half-count
  const half = total / 2;
  let acc = 0;
  let median = min;
  for (let v = 0; v < 256; v++) {
    acc += channel[v];
    if (acc >= half) { median = v; break; }
  }

  return { min, max, mean: weighted / total, median };
}

/**
 * Find the value at a given percentile of a histogram channel.
 *
 * @param channel     256-bin count array.
 * @param percentile  Percentile in [0, 100].
 * @returns           The 8-bit value at that percentile (0 for empty channel).
 */
export function histogramPercentile(channel: Uint32Array, percentile: number): number {
  const p = Math.max(0, Math.min(100, percentile));
  let total = 0;
  for (let v = 0; v < 256; v++) total += channel[v];
  if (total === 0) return 0;

  // 0th percentile → the minimum populated value (first non-zero bin).
  if (p <= 0) {
    for (let v = 0; v < 256; v++) if (channel[v] > 0) return v;
    return 0;
  }

  const target = (p / 100) * total;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += channel[v];
    if (acc >= target) return v;
  }
  return 255;
}

// ─── LUT construction & application ──────────────────────────────────────────

/**
 * Build a levels-adjustment LUT (256 entries) from parameters.
 *
 * For each input value:
 *   1. Normalize against [inBlack, inWhite].
 *   2. Apply gamma: n^(1/gamma).
 *   3. Map to [outBlack, outWhite].
 *
 * @param params  Levels parameters.
 * @returns       256-entry Uint8ClampedArray LUT.
 */
export function buildLevelsLUT(params: LevelsParams = {}): Uint8ClampedArray {
  const inBlack  = params.inBlack  ?? 0;
  const inWhite  = params.inWhite  ?? 255;
  const gamma    = params.gamma    ?? 1.0;
  const outBlack = params.outBlack ?? 0;
  const outWhite = params.outWhite ?? 255;

  const lut = new Uint8ClampedArray(256);
  const inRange = inWhite - inBlack;
  const invGamma = gamma === 0 ? 1 : 1 / gamma;

  for (let v = 0; v < 256; v++) {
    let n = inRange === 0 ? (v >= inWhite ? 1 : 0) : (v - inBlack) / inRange;
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    if (invGamma !== 1) n = Math.pow(n, invGamma);
    lut[v] = clamp8(outBlack + n * (outWhite - outBlack));
  }
  return lut;
}

/**
 * Apply per-channel 256-entry LUTs to an RGBA image.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param lutR    Red channel LUT (256 entries).
 * @param lutG    Green channel LUT. Defaults to `lutR`.
 * @param lutB    Blue channel LUT. Defaults to `lutR`.
 * @returns       New RGBA image with LUTs applied (alpha preserved).
 */
export function applyChannelLUT(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  lutR:   Uint8ClampedArray | number[],
  lutG?:  Uint8ClampedArray | number[],
  lutB?:  Uint8ClampedArray | number[],
): Uint8ClampedArray {
  const gLut = lutG ?? lutR;
  const bLut = lutB ?? lutR;
  const out = new Uint8ClampedArray(src.length);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    out[off]     = lutR[src[off]];
    out[off + 1] = gLut[src[off + 1]];
    out[off + 2] = bLut[src[off + 2]];
    out[off + 3] = src[off + 3];
  }
  return out;
}

// ─── Levels adjustment ────────────────────────────────────────────────────────

/**
 * Apply a levels adjustment to an RGBA image (same params for all channels).
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param params  Levels parameters.
 * @returns       New adjusted RGBA image.
 */
export function applyLevels(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  params: LevelsParams,
): Uint8ClampedArray {
  const lut = buildLevelsLUT(params);
  return applyChannelLUT(src, width, height, lut);
}

// ─── Histogram equalization ───────────────────────────────────────────────────

/**
 * Build a histogram-equalization LUT from a channel's CDF.
 *
 * Maps input value v → round(255 · (cdf[v] − cdfMin) / (total − cdfMin)).
 *
 * @param channel  256-bin count array.
 * @returns        256-entry equalization LUT.
 */
export function buildEqualizationLUT(channel: Uint32Array): Uint8ClampedArray {
  const cdf = cumulativeHistogram(channel);
  const total = cdf[255];
  const lut = new Uint8ClampedArray(256);
  if (total === 0) {
    for (let v = 0; v < 256; v++) lut[v] = v;
    return lut;
  }
  // First non-zero CDF value
  let cdfMin = 0;
  for (let v = 0; v < 256; v++) {
    if (cdf[v] > 0) { cdfMin = cdf[v]; break; }
  }
  const denom = total - cdfMin;
  for (let v = 0; v < 256; v++) {
    lut[v] = denom <= 0 ? v : clamp8(((cdf[v] - cdfMin) / denom) * 255);
  }
  return lut;
}

/**
 * Apply histogram equalization to an RGBA image.
 *
 * When `perChannel` is false (default) the luma histogram drives a single LUT
 * applied to all channels (preserves color balance). When true, each channel
 * is equalized independently (stronger but can shift hue).
 *
 * @param src         Source RGBA data.
 * @param width       Image width.
 * @param height      Image height.
 * @param perChannel  Equalize R/G/B independently. Default: false (luma-based).
 * @returns           New equalized RGBA image.
 */
export function equalizeHistogram(
  src:        Uint8ClampedArray | Uint8Array,
  width:      number,
  height:     number,
  perChannel = false,
): Uint8ClampedArray {
  const hist = computeHistogram(src, width, height);
  if (perChannel) {
    const lutR = buildEqualizationLUT(hist.r);
    const lutG = buildEqualizationLUT(hist.g);
    const lutB = buildEqualizationLUT(hist.b);
    return applyChannelLUT(src, width, height, lutR, lutG, lutB);
  }
  const lumaLut = buildEqualizationLUT(hist.luma);
  return applyChannelLUT(src, width, height, lumaLut);
}

// ─── Auto contrast ────────────────────────────────────────────────────────────

/**
 * Apply auto-contrast by stretching the tonal range between percentile clips.
 *
 * Finds the `clipPercent`th and `(100 − clipPercent)`th percentiles of the luma
 * histogram and stretches that range to full [0, 255]. Robust to outliers.
 *
 * @param src          Source RGBA data.
 * @param width        Image width.
 * @param height       Image height.
 * @param clipPercent  Percent of pixels to clip at each end. Default: 0.5.
 * @returns            New contrast-stretched RGBA image.
 */
export function autoContrast(
  src:         Uint8ClampedArray | Uint8Array,
  width:       number,
  height:      number,
  clipPercent = 0.5,
): Uint8ClampedArray {
  const hist = computeHistogram(src, width, height);
  const lo = histogramPercentile(hist.luma, clipPercent);
  const hi = histogramPercentile(hist.luma, 100 - clipPercent);
  if (hi <= lo) {
    // Degenerate (flat) image — return a copy
    return new Uint8ClampedArray(src);
  }
  return applyLevels(src, width, height, { inBlack: lo, inWhite: hi });
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Compute the mean luminance (Rec. 709) of an RGBA image in [0, 255].
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 */
export function meanLuminance(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): number {
  const pixelCount = width * height;
  if (pixelCount === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    sum += LUMA_R * src[off] + LUMA_G * src[off + 1] + LUMA_B * src[off + 2];
  }
  return sum / pixelCount;
}

/**
 * Identity LUT (256 entries where lut[v] = v). Useful as a base for editing.
 */
export function identityLUT(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = v;
  return lut;
}
