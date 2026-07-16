/**
 * Artone v3 — Scene Change Detector
 *
 * Detects hard cuts and scene transitions by comparing luminance histograms
 * across consecutive frames. Supports three histogram distance metrics:
 *
 *   - chi-square: Σ (h1[i]−h2[i])² / (h1[i]+h2[i]+ε)  — default, robust to noise
 *   - bhattacharyya: −ln(Σ √(h1[i]·h2[i]))             — sensitive to outliers
 *   - sad: Σ |h1[i]−h2[i]|                              — fastest, less precise
 *
 * All metrics return values in [0, 1] (0 = identical, 1 = maximally different).
 *
 * References:
 *   - Zabih & Woodfill (1994) "Non-parametric local transforms for computing
 *     visual correspondence" — histogram-based cut detection
 *   - OpenCV VideoCapture scene detection (HISTCMP_CHISQR_ALT)
 *   - FFmpeg select filter scdet (scene change detection)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Distance metric used to compare consecutive histograms. */
export type SceneDetectionMethod = 'chi-square' | 'bhattacharyya' | 'sad';

/** Configuration for scene cut detection. */
export interface SceneDetectorConfig {
  /**
   * Distance threshold above which a scene cut is declared.
   * Range [0, 1]. Default: 0.35 (works well for hard cuts).
   * Lower → more sensitive; higher → only very hard cuts.
   */
  threshold?: number;
  /**
   * Number of histogram bins per luminance channel. Must be 2–256.
   * Default: 16. Higher resolution improves accuracy at compute cost.
   */
  histogramBins?: number;
  /** Distance metric. Default: 'chi-square'. */
  method?: SceneDetectionMethod;
  /**
   * Minimum number of frames between successive scene cuts (debounce).
   * Prevents multiple detections during a slow fade/transition.
   * Default: 8.
   */
  minSceneDuration?: number;
}

/** A detected scene cut. */
export interface SceneCut {
  /** 0-based index of the first frame of the new scene. */
  frameIndex: number;
  /**
   * Normalized distance in [0, 1] (proportion of the maximum possible distance
   * for the chosen metric). Higher = stronger cut.
   */
  confidence: number;
  /** Raw (unnormalized) distance value. */
  distance: number;
}

/** Stateful scene detector for streaming frame-by-frame analysis. */
export interface SceneDetector {
  /**
   * Submit a frame as an sRGB RGBA Uint8ClampedArray (4 bytes/pixel, row-major).
   * Returns a SceneCut if the frame starts a new scene, otherwise null.
   */
  addFrame(data: Uint8ClampedArray, width: number, height: number): SceneCut | null;
  /** Reset accumulated state; forgets the previous frame. */
  reset(): void;
  /** Total number of frames submitted since creation or last reset. */
  readonly frameCount: number;
}

// ─── Histogram utilities ──────────────────────────────────────────────────────

/**
 * Compute a normalized luminance histogram from an sRGB RGBA buffer.
 *
 * Uses BT.601 luma approximation (no gamma conversion needed for
 * scene-change detection purposes).
 *
 * @param data  sRGB RGBA Uint8ClampedArray (4 bytes per pixel).
 * @param bins  Number of histogram bins (default 16).
 * @returns Float32Array of length `bins` that sums to 1.0 (normalized by pixel count).
 */
export function computeLuminanceHistogram(
  data: Uint8ClampedArray,
  bins = 16,
  out?: Float32Array, // optional pre-allocated buffer; caller must ensure length >= bins
): Float32Array {
  const hist = out ?? new Float32Array(bins);
  if (out) hist.fill(0); // zero reused buffer before accumulating
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount === 0) return hist;

  const scale = bins / 256;
  for (let i = 0; i + 3 < data.length; i += 4) {
    // BT.601 luma from non-linear sRGB: Y = 0.299R + 0.587G + 0.114B
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bin = Math.min(bins - 1, Math.floor(y * scale));
    hist[bin] += 1;
  }

  // Normalize
  for (let i = 0; i < bins; i++) hist[i] /= pixelCount;
  return hist;
}

/**
 * Symmetric chi-square distance between two normalized histograms.
 *
 * `d = Σ (h1[i]−h2[i])² / (h1[i]+h2[i]+ε)` , divided by `bins` to normalize to [0,1].
 *
 * @returns Value in [0, 1]. 0 = identical; approaches 1 for maximally different histograms.
 */
export function chiSquareDistance(h1: Float32Array, h2: Float32Array): number {
  const n = h1.length;
  if (n === 0 || n !== h2.length) return 0;
  const eps = 1e-10;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const diff = h1[i] - h2[i];
    sum += (diff * diff) / (h1[i] + h2[i] + eps);
  }
  // Maximum possible χ² for normalized histograms ≈ 2 (when one bin has all weight
  // in h1 and a different bin has all weight in h2). Divide by n to get [0,1] range.
  return Math.min(1, sum / 2);
}

/**
 * Bhattacharyya distance between two normalized histograms.
 *
 * `BD = −ln(Σ √(h1[i]·h2[i]))` , scaled to [0, 1] via `1 − e^(−BD)`.
 *
 * @returns Value in [0, 1]. 0 = identical; approaches 1 for maximally different histograms.
 */
export function bhattacharyyaDistance(h1: Float32Array, h2: Float32Array): number {
  const n = h1.length;
  if (n === 0 || n !== h2.length) return 0;
  let bc = 0;
  for (let i = 0; i < n; i++) bc += Math.sqrt(h1[i] * h2[i]);
  // BC in [0, 1]; BD = -ln(BC) in [0, ∞)
  bc = Math.max(bc, 1e-10);
  const bd = -Math.log(bc);
  // Map to [0, 1] using 1 - e^(-BD)
  return 1 - Math.exp(-bd);
}

/**
 * Sum of Absolute Differences between two normalized histograms.
 *
 * `SAD = Σ |h1[i]−h2[i]|` , divided by 2 to normalize to [0, 1].
 *
 * @returns Value in [0, 1]. 0 = identical; 1 = maximally different.
 */
export function sadDistance(h1: Float32Array, h2: Float32Array): number {
  const n = h1.length;
  if (n === 0 || n !== h2.length) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(h1[i] - h2[i]);
  // For normalized histograms, max SAD = 2 (two non-overlapping unit distributions)
  return Math.min(1, sum / 2);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolvedDistance(
  h1: Float32Array,
  h2: Float32Array,
  method: SceneDetectionMethod,
): number {
  switch (method) {
    case 'bhattacharyya': return bhattacharyyaDistance(h1, h2);
    case 'sad':           return sadDistance(h1, h2);
    default:              return chiSquareDistance(h1, h2);
  }
}

// ─── Streaming scene detector ─────────────────────────────────────────────────

/**
 * Create a stateful scene detector for frame-by-frame streaming analysis.
 *
 * @example
 * ```ts
 * const detector = createSceneDetector({ threshold: 0.4 });
 * for (const { data, width, height } of frames) {
 *   const cut = detector.addFrame(data, width, height);
 *   if (cut) markCut(cut.frameIndex);
 * }
 * ```
 */
export function createSceneDetector(config: SceneDetectorConfig = {}): SceneDetector {
  const threshold       = config.threshold       ?? 0.35;
  const bins            = config.histogramBins   ?? 16;
  const method          = config.method          ?? 'chi-square';
  const minDuration     = config.minSceneDuration ?? 8;

  // Pre-allocated histogram buffers swapped each frame to avoid per-frame allocation.
  let currBuf = new Float32Array(bins);
  let prevBuf = new Float32Array(bins);
  let hasPrev = false;
  let count = 0;
  let lastCutFrame = -minDuration;   // so first cut is always eligible

  function addFrame(data: Uint8ClampedArray, _width: number, _height: number): SceneCut | null {
    computeLuminanceHistogram(data, bins, currBuf);
    const frameIndex = count++;

    if (!hasPrev) {
      // Swap so currBuf becomes prevBuf for the next frame.
      const tmp = currBuf; currBuf = prevBuf; prevBuf = tmp;
      hasPrev = true;
      return null;
    }

    const distance = resolvedDistance(prevBuf, currBuf, method);
    // Swap buffers: current becomes previous for next frame.
    const tmp = currBuf; currBuf = prevBuf; prevBuf = tmp;

    const isCut = distance >= threshold && (frameIndex - lastCutFrame) >= minDuration;
    if (isCut) {
      lastCutFrame = frameIndex;
      return {
        frameIndex,
        confidence: Math.min(1, distance),
        distance,
      };
    }
    return null;
  }

  function reset(): void {
    hasPrev = false;
    count = 0;
    lastCutFrame = -minDuration;
  }

  return {
    addFrame,
    reset,
    get frameCount() { return count; },
  };
}

// ─── Batch analysis helper ────────────────────────────────────────────────────

/**
 * Detect all scene cuts in a sequence of pre-loaded RGBA frame buffers.
 *
 * @param frames  Array of sRGB RGBA Uint8ClampedArrays, one per frame.
 * @param width   Frame width in pixels (used for documentation, not computation).
 * @param height  Frame height in pixels (used for documentation, not computation).
 * @param config  Scene detector options.
 * @returns Sorted array of detected SceneCuts (may be empty).
 */
export function detectSceneCuts(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  config?: SceneDetectorConfig,
): SceneCut[] {
  const detector = createSceneDetector(config);
  const cuts: SceneCut[] = [];
  for (const frame of frames) {
    const cut = detector.addFrame(frame, width, height);
    if (cut) cuts.push(cut);
  }
  return cuts;
}
