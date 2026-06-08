/**
 * Artone v3 — Stylize & Repair Effects
 *
 * A small family of per-frame effects every NLE ships that Artone was missing:
 *
 *   - **Vignette** — darken (or lighten) the frame toward the edges with a
 *     smooth radial falloff. Premiere/DaVinci/CapCut "Vignette".
 *   - **Deinterlace** — reconstruct progressive frames from interlaced footage
 *     by `bob` (line doubling) or `blend` (field averaging). DaVinci/Premiere
 *     "Deinterlace".
 *   - **Directional motion blur** — average samples along a direction vector to
 *     simulate camera/object motion. After Effects/Premiere "Directional Blur".
 *
 * All operate on RGBA `Uint8ClampedArray`; alpha is preserved unless noted.
 *
 * References:
 *   - de Haan & Bellers 1998: "Deinterlacing — an overview", Proc. IEEE.
 *   - Gonzalez & Woods 2008 (§ spatial filtering / motion blur model).
 *
 * # AI generated (reviewed)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp to 8-bit. */
function clamp8(x: number): number {
  const r = Math.round(x);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** Clamp to [0, 1]. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Replicate-boundary index clamp. */
function clampIdx(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** Smoothstep between edge0 and edge1. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  let t = (x - edge0) / (edge1 - edge0);
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

// ─── Vignette ─────────────────────────────────────────────────────────────────

/** Options for the vignette effect. */
export interface VignetteOptions {
  /**
   * Amount: −1..1. Negative darkens edges (classic vignette), positive
   * brightens edges. Default: −0.5.
   */
  amount?: number;
  /**
   * Inner radius (0..1, fraction of half-diagonal) where the effect begins.
   * Default: 0.5.
   */
  innerRadius?: number;
  /**
   * Outer radius (0..1) where the effect reaches full strength. Default: 1.0.
   */
  outerRadius?: number;
  /** Roundness 0..1: 1 = circular, 0 = matches frame aspect. Default: 1. */
  roundness?: number;
}

/**
 * Apply a radial vignette to an RGBA image.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param opts    Vignette options.
 * @returns       New RGBA image with the vignette applied (alpha preserved).
 */
export function vignette(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  opts:   VignetteOptions = {},
): Uint8ClampedArray {
  const amount      = Math.max(-1, Math.min(1, opts.amount ?? -0.5));
  const innerRadius = clamp01(opts.innerRadius ?? 0.5);
  const outerRadius = clamp01(opts.outerRadius ?? 1.0);
  const roundness   = clamp01(opts.roundness ?? 1);

  const out = new Uint8ClampedArray(src.length);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  // Aspect-corrected normalization: roundness=1 → circular (use half-diagonal),
  // roundness=0 → ellipse matching frame extents.
  const halfDiag = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalized distance from center
      const ndx = cx > 0 ? (x - cx) / cx : 0;
      const ndy = cy > 0 ? (y - cy) / cy : 0;
      // Blend between circular (half-diagonal) and elliptical (frame) metric
      const circular = Math.hypot(x - cx, y - cy) / halfDiag;
      const elliptical = Math.hypot(ndx, ndy) / Math.SQRT2 * Math.SQRT2; // = hypot(ndx,ndy)
      const dist = roundness * circular + (1 - roundness) * Math.min(1.5, elliptical);

      const falloff = smoothstep(innerRadius, outerRadius, dist);
      const factor = 1 + amount * falloff;

      const off = (y * width + x) * 4;
      out[off]     = clamp8(src[off]     * factor);
      out[off + 1] = clamp8(src[off + 1] * factor);
      out[off + 2] = clamp8(src[off + 2] * factor);
      out[off + 3] = src[off + 3];
    }
  }
  return out;
}

// ─── Deinterlace ──────────────────────────────────────────────────────────────

/** Field order for interlaced footage. */
export type FieldOrder = 'tff' | 'bff';
/** Deinterlace method. */
export type DeinterlaceMethod = 'bob' | 'blend';

/**
 * Deinterlace an interlaced RGBA frame to progressive.
 *
 * - `bob`: keep one field (per `order`) and interpolate the missing lines from
 *   their vertical neighbours (line-doubling with averaging). Preserves motion
 *   sharpness; halves vertical resolution.
 * - `blend`: average the two fields together. Removes combing artifacts but
 *   softens motion (ghosting).
 *
 * @param src     Interlaced RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param method  'bob' or 'blend'. Default: 'bob'.
 * @param order   Field order for 'bob'. Default: 'tff' (top field first).
 * @returns       New progressive RGBA image (alpha preserved).
 */
export function deinterlace(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  method: DeinterlaceMethod = 'bob',
  order:  FieldOrder = 'tff',
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);

  if (method === 'blend') {
    // Average each line with the line below (collapses field comb)
    for (let y = 0; y < height; y++) {
      const y1 = clampIdx(y - 1, height);
      const y2 = clampIdx(y + 1, height);
      for (let x = 0; x < width; x++) {
        const o  = (y  * width + x) * 4;
        const oa = (y1 * width + x) * 4;
        const ob = (y2 * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          out[o + c] = clamp8((src[oa + c] + 2 * src[o + c] + src[ob + c]) / 4);
        }
        out[o + 3] = src[o + 3];
      }
    }
    return out;
  }

  // bob: keep the field given by `order`, interpolate the other lines
  const keepEven = order === 'tff'; // tff → keep lines 0,2,4… ; bff → keep 1,3,5…
  for (let y = 0; y < height; y++) {
    const isKept = (y % 2 === 0) === keepEven;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (isKept) {
        out[o] = src[o]; out[o + 1] = src[o + 1];
        out[o + 2] = src[o + 2]; out[o + 3] = src[o + 3];
      } else {
        const ya = (clampIdx(y - 1, height) * width + x) * 4;
        const yb = (clampIdx(y + 1, height) * width + x) * 4;
        for (let c = 0; c < 3; c++) out[o + c] = clamp8((src[ya + c] + src[yb + c]) / 2);
        out[o + 3] = src[o + 3];
      }
    }
  }
  return out;
}

/**
 * Detect combing (interlacing) artifacts via a vertical comb metric.
 *
 * Returns a score in [0, 1]: higher means more likely interlaced. Computed as
 * the fraction of pixels where the line alternation pattern
 * `(top − mid)·(bot − mid) > threshold²` indicates a comb.
 *
 * @param src        RGBA data.
 * @param width      Image width.
 * @param height     Image height.
 * @param threshold  Per-channel comb threshold (0..255). Default: 16.
 * @returns          Comb score in [0, 1].
 */
export function detectCombing(
  src:       Uint8ClampedArray | Uint8Array,
  width:     number,
  height:    number,
  threshold = 16,
): number {
  if (height < 3) return 0;
  let combed = 0;
  let total = 0;
  const th2 = threshold * threshold;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const mid = (y * width + x) * 4;
      const top = ((y - 1) * width + x) * 4;
      const bot = ((y + 1) * width + x) * 4;
      // Use luma-ish green channel for speed
      const dT = src[top + 1] - src[mid + 1];
      const dB = src[bot + 1] - src[mid + 1];
      if (dT * dB > th2) combed++;
      total++;
    }
  }
  return total > 0 ? combed / total : 0;
}

// ─── Directional motion blur ──────────────────────────────────────────────────

/** Options for directional motion blur. */
export interface MotionBlurOptions {
  /** Blur angle in degrees (0 = horizontal, 90 = vertical). Default: 0. */
  angle?: number;
  /** Blur length in pixels. Default: 8. */
  length?: number;
  /** Number of samples along the blur line. Default: max(2, length). */
  samples?: number;
}

/**
 * Apply directional (linear) motion blur.
 *
 * Each output pixel is the average of `samples` taps along a line of the given
 * `angle` and `length`, centered on the pixel. Replicate boundary handling.
 *
 * @param src     Source RGBA data.
 * @param width   Image width.
 * @param height  Image height.
 * @param opts    Motion blur options.
 * @returns       New blurred RGBA image (alpha preserved).
 */
export function motionBlur(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  opts:   MotionBlurOptions = {},
): Uint8ClampedArray {
  const angle  = ((opts.angle ?? 0) * Math.PI) / 180;
  const length = Math.max(0, opts.length ?? 8);
  const samples = Math.max(2, opts.samples ?? Math.max(2, Math.round(length)));

  const out = new Uint8ClampedArray(src.length);
  if (length === 0) { out.set(src); return out; }

  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const half = length / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let s = 0; s < samples; s++) {
        // Parameter from −half to +half
        const tpar = samples > 1 ? (s / (samples - 1)) * length - half : 0;
        const sx = clampIdx(Math.round(x + dirX * tpar), width);
        const sy = clampIdx(Math.round(y + dirY * tpar), height);
        const off = (sy * width + sx) * 4;
        r += src[off]; g += src[off + 1]; b += src[off + 2];
      }
      const o = (y * width + x) * 4;
      out[o]     = clamp8(r / samples);
      out[o + 1] = clamp8(g / samples);
      out[o + 2] = clamp8(b / samples);
      out[o + 3] = src[o + 3];
    }
  }
  return out;
}
