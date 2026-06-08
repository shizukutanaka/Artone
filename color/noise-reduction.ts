/**
 * Artone v3 — Spatial Noise Reduction
 *
 * CPU-side image denoising for proxy frames, thumbnails, and scope display.
 * Two complementary algorithms:
 *
 * 1. **Bilateral filter** (Tomasi & Manduchi 1998):
 *    Joint spatial × range Gaussian weighting. Preserves edges while smoothing
 *    flat regions. Per-pixel cost O(r²), practical for r ≤ 5.
 *
 * 2. **Non-Local Means** (Buades et al. 2005, CVPR):
 *    Patch-based denoising: similar patches (regardless of spatial distance)
 *    contribute to the estimate. Higher quality than bilateral at cost of O(n²).
 *    Practical for noise estimation with small search window.
 *
 * Both operate on RGBA `Uint8ClampedArray` (width × height × 4) in linear light.
 * Alpha channel is always passed through unchanged.
 *
 * References:
 *   - Tomasi & Manduchi 1998: "Bilateral Filtering for Gray and Color Images"
 *   - Buades, Coll & Morel 2005: "A Non-Local Algorithm for Image Denoising"
 *   - Paris & Durand 2009: "A Fast Approximation of the Bilateral Filter using a
 *     Signal Processing Approach"
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for the bilateral filter. */
export interface BilateralOptions {
  /** Spatial Gaussian sigma in pixels (neighbourhood spread). Default: 2.0. */
  sigmaS?: number;
  /** Range Gaussian sigma in [0, 255] units (edge threshold). Default: 25. */
  sigmaR?: number;
  /** Filter radius in pixels (kernel half-size). Default: ceil(2*sigmaS). */
  radius?: number;
}

/** Options for Non-Local Means. */
export interface NLMOptions {
  /**
   * Filter parameter h controlling smoothing strength (higher = more smooth).
   * Typically ≈ σ_noise (0..30 for 8-bit). Default: 10.
   */
  h?: number;
  /** Patch half-size (pixels). Default: 3 (7×7 patches). */
  patchRadius?: number;
  /** Search window half-size (pixels). Default: 7 (15×15 window). */
  searchRadius?: number;
}

/** Options for noise estimation. */
export interface NoiseEstimateResult {
  /** Estimated noise standard deviation in [0, 255]. */
  sigma: number;
  /** Per-channel sigma: [R, G, B]. */
  channelSigma: [number, number, number];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp x to [lo, hi].
 */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Mirror boundary index: out-of-bounds indices are reflected at edges.
 * e.g. index -1 → 1, index width → width-2. Robust for radii larger than the
 * image (repeated reflection): the result is always clamped to [0, n-1].
 */
function mirrorIdx(i: number, n: number): number {
  if (n <= 1) return 0;
  let r = i;
  if (r < 0) r = -r;
  if (r >= n) r = 2 * n - 2 - r;
  // Final safety clamp for very small images where a single reflection
  // is insufficient to bring the index back into range.
  return r < 0 ? 0 : r >= n ? n - 1 : r;
}

/**
 * Build a precomputed Gaussian weight LUT for bilateral filter.
 * `lut[d2]` = exp(-d2 / (2*sigma²)) for d2 = squared distance (integer, max 4*r²+4).
 */
function buildGaussianLUT(sigma: number, maxD2: number): Float64Array {
  const inv2sig2 = 1 / (2 * sigma * sigma);
  const lut = new Float64Array(maxD2 + 1);
  for (let i = 0; i <= maxD2; i++) lut[i] = Math.exp(-i * inv2sig2);
  return lut;
}

/** Per-pixel offset in the RGBA buffer. */
function pixelOffset(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

// ─── Bilateral Filter ─────────────────────────────────────────────────────────

/**
 * Apply a bilateral filter to an RGBA image.
 *
 * Input and output buffers must be of the same dimensions. The alpha channel
 * is copied from the input unchanged.
 *
 * @param src     Source RGBA data (Uint8ClampedArray or similar Uint8 array).
 * @param width   Image width in pixels.
 * @param height  Image height in pixels.
 * @param opts    Bilateral filter parameters.
 * @returns       A new `Uint8ClampedArray` with the filtered image.
 */
export function bilateralFilter(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  opts:   BilateralOptions = {},
): Uint8ClampedArray {
  const sigmaS = opts.sigmaS ?? 2.0;
  const sigmaR = opts.sigmaR ?? 25;
  const radius = opts.radius ?? Math.ceil(2 * sigmaS);

  const dst = new Uint8ClampedArray(src.length);

  // Precompute Gaussian LUTs to avoid exp() per iteration
  const maxSpatialD2 = 2 * radius * radius;
  const spatialLUT   = buildGaussianLUT(sigmaS, maxSpatialD2);
  const maxRangeD2   = 3 * 255 * 255;  // max squared color distance (R+G+B)
  const rangeLUT     = buildGaussianLUT(sigmaR, maxRangeD2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerOff = pixelOffset(x, y, width);
      const cR = src[centerOff];
      const cG = src[centerOff + 1];
      const cB = src[centerOff + 2];

      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = mirrorIdx(y + dy, height);
        const spatialD2part = dy * dy;

        for (let dx = -radius; dx <= radius; dx++) {
          const nx = mirrorIdx(x + dx, width);
          const spatialD2 = spatialD2part + dx * dx;
          if (spatialD2 > maxSpatialD2) continue; // outside circular kernel

          const neighOff = pixelOffset(nx, ny, width);
          const nR = src[neighOff];
          const nG = src[neighOff + 1];
          const nB = src[neighOff + 2];

          // Range distance: squared Euclidean color distance
          const rangeD2 = (nR - cR) * (nR - cR)
                        + (nG - cG) * (nG - cG)
                        + (nB - cB) * (nB - cB);

          const w = spatialLUT[Math.min(spatialD2, maxSpatialD2)]
                  * rangeLUT[Math.min(rangeD2, maxRangeD2)];

          sumR += w * nR;
          sumG += w * nG;
          sumB += w * nB;
          sumW += w;
        }
      }

      dst[centerOff]     = clamp(Math.round(sumR / sumW), 0, 255);
      dst[centerOff + 1] = clamp(Math.round(sumG / sumW), 0, 255);
      dst[centerOff + 2] = clamp(Math.round(sumB / sumW), 0, 255);
      dst[centerOff + 3] = src[centerOff + 3]; // pass-through alpha
    }
  }

  return dst;
}

// ─── Gaussian Blur (box-filter approximation) ─────────────────────────────────

/**
 * Fast Gaussian blur using three-pass box filter approximation.
 *
 * Three consecutive box filters of the same radius closely approximate
 * a Gaussian (Wells 1986). Runs in O(N) regardless of kernel size.
 *
 * @param src     Source RGBA data.
 * @param width   Width in pixels.
 * @param height  Height in pixels.
 * @param sigma   Gaussian sigma (approximate). Default: 1.5.
 * @returns       Blurred RGBA image.
 */
export function gaussianBlur(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  sigma = 1.5,
): Uint8ClampedArray {
  // Ideal box widths for Gaussian approximation (Kovesi 1999)
  const boxWidth = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma / 3) + 1)));
  const r = (boxWidth - 1) >> 1; // half-width

  let buf = new Float32Array(src);
  for (let pass = 0; pass < 3; pass++) {
    buf = boxBlurH(buf, width, height, r);
    buf = boxBlurV(buf, width, height, r);
  }
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = i % 4 === 3 ? src[i] : clamp(Math.round(buf[i]), 0, 255);
  }
  return out;
}

/** Horizontal 1-D box blur (separable). */
function boxBlurH(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const dst = new Float32Array(src.length);
  const scale = 1 / (2 * r + 1);
  for (let y = 0; y < height; y++) {
    for (let ch = 0; ch < 3; ch++) { // skip alpha (ch=3)
      // Initialize sliding sum
      let sum = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = mirrorIdx(dx, width);
        sum += src[(y * width + nx) * 4 + ch];
      }
      for (let x = 0; x < width; x++) {
        dst[(y * width + x) * 4 + ch] = sum * scale;
        // Slide: remove left, add right
        const removeIdx = mirrorIdx(x - r, width);
        const addIdx    = mirrorIdx(x + r + 1, width);
        sum -= src[(y * width + removeIdx) * 4 + ch];
        sum += src[(y * width + addIdx)    * 4 + ch];
      }
    }
    // Pass alpha through
    for (let x = 0; x < width; x++) {
      dst[(y * width + x) * 4 + 3] = src[(y * width + x) * 4 + 3];
    }
  }
  return dst;
}

/** Vertical 1-D box blur (separable). */
function boxBlurV(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const dst = new Float32Array(src.length);
  const scale = 1 / (2 * r + 1);
  for (let x = 0; x < width; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = mirrorIdx(dy, height);
        sum += src[(ny * width + x) * 4 + ch];
      }
      for (let y = 0; y < height; y++) {
        dst[(y * width + x) * 4 + ch] = sum * scale;
        const removeIdx = mirrorIdx(y - r, height);
        const addIdx    = mirrorIdx(y + r + 1, height);
        sum -= src[(removeIdx * width + x) * 4 + ch];
        sum += src[(addIdx    * width + x) * 4 + ch];
      }
    }
    for (let y = 0; y < height; y++) {
      dst[(y * width + x) * 4 + 3] = src[(y * width + x) * 4 + 3];
    }
  }
  return dst;
}

// ─── Non-Local Means ──────────────────────────────────────────────────────────

/**
 * Apply Non-Local Means denoising to an RGBA image.
 *
 * For each pixel, a weighted average is computed over all pixels in the search
 * window, where weights depend on patch similarity rather than spatial distance.
 * This preserves texture and fine detail better than bilateral filtering.
 *
 * Practical for small images or when called on sub-regions.
 *
 * @param src          Source RGBA data.
 * @param width        Image width.
 * @param height       Image height.
 * @param opts         NLM options.
 * @returns            Denoised RGBA image.
 */
export function nonLocalMeans(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  opts:   NLMOptions = {},
): Uint8ClampedArray {
  const h            = opts.h            ?? 10;
  const patchRadius  = opts.patchRadius  ?? 3;
  const searchRadius = opts.searchRadius ?? 7;

  const h2 = h * h;
  const patchSize = 2 * patchRadius + 1;
  const patchArea = patchSize * patchSize * 3; // 3 channels (R,G,B)
  const dst = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;

      for (let sy = y - searchRadius; sy <= y + searchRadius; sy++) {
        for (let sx = x - searchRadius; sx <= x + searchRadius; sx++) {
          // Compute squared patch distance between (x,y) and (sx,sy)
          let patchDist2 = 0;
          for (let py = -patchRadius; py <= patchRadius; py++) {
            for (let px = -patchRadius; px <= patchRadius; px++) {
              const ayIdx = mirrorIdx(y  + py, height);
              const axIdx = mirrorIdx(x  + px, width);
              const byIdx = mirrorIdx(sy + py, height);
              const bxIdx = mirrorIdx(sx + px, width);
              const aOff = (ayIdx * width + axIdx) * 4;
              const bOff = (byIdx * width + bxIdx) * 4;
              for (let ch = 0; ch < 3; ch++) {
                const diff = src[aOff + ch] - src[bOff + ch];
                patchDist2 += diff * diff;
              }
            }
          }

          const w = Math.exp(-patchDist2 / (patchArea * h2));
          const neighOff = pixelOffset(
            mirrorIdx(sx, width),
            mirrorIdx(sy, height),
            width,
          );
          sumR += w * src[neighOff];
          sumG += w * src[neighOff + 1];
          sumB += w * src[neighOff + 2];
          sumW += w;
        }
      }

      const off = pixelOffset(x, y, width);
      dst[off]     = clamp(Math.round(sumR / sumW), 0, 255);
      dst[off + 1] = clamp(Math.round(sumG / sumW), 0, 255);
      dst[off + 2] = clamp(Math.round(sumB / sumW), 0, 255);
      dst[off + 3] = src[off + 3]; // alpha pass-through
    }
  }

  return dst;
}

// ─── Noise estimation ─────────────────────────────────────────────────────────

/**
 * Estimate the noise level (σ) of an RGBA image using the Laplacian residual
 * method (Immerkaer 1996).
 *
 * Applies a 3×3 Laplacian kernel to each color channel. The standard deviation
 * of the residual is proportional to the noise standard deviation:
 *
 *   σ_noise ≈ σ_laplacian * sqrt(π/2) / sqrt(36) / sqrt(0.5)  (exact scale factor)
 *
 * The constant `0.36368` is derived from the Laplacian kernel normalization.
 *
 * @param src    Source RGBA data.
 * @param width  Image width.
 * @param height Image height.
 * @returns      Estimated noise sigma per channel and combined.
 */
export function estimateNoise(
  src:    Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
): NoiseEstimateResult {
  // Laplacian kernel (normalized): center=4, neighbours=-1
  // ∇²I = 4*I(x,y) - I(x-1,y) - I(x+1,y) - I(x,y-1) - I(x,y+1)
  // Scale factor from Immerkaer 1996 formula
  const scaleFactor = Math.sqrt(Math.PI / 2) / (6 * (width - 2) * (height - 2));

  const channelSums: [number, number, number] = [0, 0, 0];
  const N = (width - 2) * (height - 2);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const c  = src[( y    * width + x)     * 4 + ch];
        const l  = src[( y    * width + x - 1) * 4 + ch];
        const r  = src[( y    * width + x + 1) * 4 + ch];
        const u  = src[((y-1) * width + x)     * 4 + ch];
        const d  = src[((y+1) * width + x)     * 4 + ch];
        const lap = Math.abs(4 * c - l - r - u - d);
        channelSums[ch] += lap;
      }
    }
  }

  const channelSigma: [number, number, number] = [
    channelSums[0] * scaleFactor / Math.max(N, 1),
    channelSums[1] * scaleFactor / Math.max(N, 1),
    channelSums[2] * scaleFactor / Math.max(N, 1),
  ];

  const sigma = (channelSigma[0] + channelSigma[1] + channelSigma[2]) / 3;
  return { sigma, channelSigma };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Create a synthetic RGBA image filled with Gaussian white noise
 * for testing purposes.
 *
 * Uses a deterministic LCG pseudo-random number generator.
 *
 * @param width     Image width.
 * @param height    Image height.
 * @param baseColor Base RGBA color. Default: gray (128,128,128,255).
 * @param sigma     Noise standard deviation (0–255). Default: 15.
 * @param seed      LCG seed. Default: 42.
 */
export function makeSyntheticNoisyImage(
  width:  number,
  height: number,
  baseColor: [number, number, number, number] = [128, 128, 128, 255],
  sigma  = 15,
  seed   = 42,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  let s = seed;

  /** Box-Muller LCG-based normal sample. */
  function nextNormal(): number {
    // LCG: modulus 2^31-1, a=1664525, c=1013904223
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const u1 = (s >>> 0) / 4294967296;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const u2 = (s >>> 0) / 4294967296;
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  }

  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    buf[off]     = clamp(Math.round(baseColor[0] + sigma * nextNormal()), 0, 255);
    buf[off + 1] = clamp(Math.round(baseColor[1] + sigma * nextNormal()), 0, 255);
    buf[off + 2] = clamp(Math.round(baseColor[2] + sigma * nextNormal()), 0, 255);
    buf[off + 3] = baseColor[3];
  }
  return buf;
}

/**
 * Compute the peak signal-to-noise ratio (PSNR) between two RGBA images.
 *
 * @param reference  Clean reference image.
 * @param test       Processed/noisy image.
 * @returns          PSNR in dB (infinity if identical).
 */
export function imagePsnr(
  reference: Uint8ClampedArray | Uint8Array,
  test:      Uint8ClampedArray | Uint8Array,
): number {
  const len = Math.min(reference.length, test.length);
  let mse = 0;
  let count = 0;
  for (let i = 0; i < len; i++) {
    if (i % 4 === 3) continue; // skip alpha
    const diff = reference[i] - test[i];
    mse += diff * diff;
    count++;
  }
  if (count === 0) return Infinity;
  const mseAvg = mse / count;
  if (mseAvg < 1e-10) return Infinity;
  return 10 * Math.log10(255 * 255 / mseAvg);
}
