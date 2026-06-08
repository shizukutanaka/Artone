/**
 * Artone v3 — Pitch Detection (YIN Algorithm)
 *
 * Fundamental frequency estimator for monophonic audio using the YIN
 * algorithm (de Cheveigné & Kawahara, 2002).
 *
 * YIN Steps:
 *   1. Difference function: d(τ) = Σ (x[t] − x[t+τ])²
 *   2. Cumulative mean normalised difference: d'(τ) = d(τ) · τ / Σ d(j) j=1..τ
 *   3. Absolute threshold: find first τ where d'(τ) < threshold
 *   4. Parabolic interpolation: sub-sample period refinement
 *   5. Period → frequency: f = sampleRate / τ_refined
 *
 * Suitable for speech, vocals, monophonic instruments. Not designed for
 * polyphonic or percussive content.
 *
 * References:
 *   - de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency estimator
 *     for speech and music", J. Acoust. Soc. Am. 111(4):1917–1930
 *   - Brent (2002) "Efficient Autocorrelation Pitch-Detection Algorithm"
 *   - Real-time YIN (aubio library): https://aubio.org/
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** YIN pitch detector configuration. */
export interface YINConfig {
  /** Audio sample rate in Hz. Default: 44100. */
  sampleRate?: number;
  /**
   * CMNDF threshold for pitch acceptance.
   * Lower values → stricter (fewer detections, less false positives).
   * Typical range: 0.05–0.2. Default: 0.15.
   */
  threshold?: number;
  /** Minimum detectable frequency in Hz. Default: 60 (below vocal bass). */
  minFrequency?: number;
  /** Maximum detectable frequency in Hz. Default: 1200 (above vocal soprano). */
  maxFrequency?: number;
}

/** Result of a single pitch analysis frame. */
export interface PitchResult {
  /**
   * Detected fundamental frequency in Hz, or null if no clear pitch was found
   * (silence, noise, or all frequencies below threshold).
   */
  frequency: number | null;
  /**
   * Confidence in [0, 1]. Computed as `1 − d'(τ)` at the estimated period.
   * Higher = cleaner pitch. Values above 0.85 are generally reliable.
   */
  clarity: number;
  /** Estimated period in fractional samples, or null when pitch is null. */
  periodSamples: number | null;
}

// ─── Core YIN steps ───────────────────────────────────────────────────────────

/**
 * Step 1: Compute the difference function for lags 0..maxLag-1.
 *
 * d(τ) = Σ_{j=0}^{N-τ-1} (x[j] − x[j+τ])²
 */
export function differenceFunction(
  signal: Float32Array,
  maxLag: number,
): Float32Array {
  const n = signal.length;
  const df = new Float32Array(maxLag);
  df[0] = 0;
  for (let tau = 1; tau < maxLag; tau++) {
    const limit = n - tau;
    for (let j = 0; j < limit; j++) {
      const d = signal[j] - signal[j + tau];
      df[tau] += d * d;
    }
  }
  return df;
}

/**
 * Step 2: Cumulative Mean Normalised Difference Function.
 *
 * d'(0) = 1
 * d'(τ) = d(τ) · τ / Σ_{j=1}^{τ} d(j)   for τ ≥ 1
 *
 * This normalisation ensures that a perfectly periodic signal gives
 * d'(τ) = 0 at the true period.
 */
export function cumulativeMeanNormalisedDifference(df: Float32Array): Float32Array {
  const cmndf = new Float32Array(df.length);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < df.length; tau++) {
    runningSum += df[tau];
    cmndf[tau] = runningSum > 0 ? df[tau] * tau / runningSum : 1;
  }
  return cmndf;
}

/**
 * Step 3: Absolute threshold search.
 *
 * Returns the first lag τ (starting at 2) where d'(τ) < threshold AND
 * τ is a local minimum (d'(τ+1) ≥ d'(τ)). Returns −1 if none found.
 *
 * @param cmndf   Cumulative mean normalised difference function.
 * @param threshold  Default: 0.15.
 * @param minLag  Minimum period lag to consider.
 * @param maxLag  Maximum period lag to consider.
 */
export function absoluteThreshold(
  cmndf: Float32Array,
  threshold: number,
  minLag: number,
  maxLag: number,
): number {
  const limit = Math.min(maxLag, cmndf.length - 1);
  let tau = Math.max(2, minLag);

  while (tau <= limit) {
    if (cmndf[tau] < threshold) {
      // Walk to local minimum
      while (tau + 1 <= limit && cmndf[tau + 1] < cmndf[tau]) tau++;
      return tau;
    }
    tau++;
  }
  return -1;
}

/**
 * Step 4: Parabolic interpolation for sub-sample period refinement.
 *
 * Fits a parabola through (τ−1, d'(τ−1)), (τ, d'(τ)), (τ+1, d'(τ+1))
 * and returns the fractional lag at the parabola's minimum.
 */
export function parabolicInterpolation(cmndf: Float32Array, tau: number): number {
  if (tau <= 0 || tau >= cmndf.length - 1) return tau;
  const x0 = cmndf[tau - 1];
  const x1 = cmndf[tau];
  const x2 = cmndf[tau + 1];
  const denom = x0 - 2 * x1 + x2;
  if (Math.abs(denom) < 1e-12) return tau;
  return tau + (x0 - x2) / (2 * denom);
}

// ─── Public API ───────────────────────────────────────────────────────────────

const DEFAULT_SR   = 44100;
const DEFAULT_TH   = 0.15;
const DEFAULT_FMIN = 60;
const DEFAULT_FMAX = 1200;

/**
 * Detect the fundamental frequency of a single audio frame using YIN.
 *
 * @param frame  Mono float audio samples (typically 1024–4096 samples).
 * @param config YIN configuration.
 * @returns Pitch analysis result.
 *
 * @example
 * ```ts
 * const result = detectPitch(monoFrame, { sampleRate: 44100 });
 * if (result.frequency) console.log(`${result.frequency.toFixed(1)} Hz`);
 * ```
 */
export function detectPitch(
  frame: Float32Array,
  config: YINConfig = {},
): PitchResult {
  const sr        = config.sampleRate   ?? DEFAULT_SR;
  const threshold = config.threshold    ?? DEFAULT_TH;
  const fMin      = config.minFrequency ?? DEFAULT_FMIN;
  const fMax      = config.maxFrequency ?? DEFAULT_FMAX;

  const minLag = Math.floor(sr / fMax);
  const maxLag = Math.min(Math.ceil(sr / fMin), Math.floor(frame.length / 2));

  if (maxLag <= minLag || frame.length < 4) {
    return { frequency: null, clarity: 0, periodSamples: null };
  }

  const df    = differenceFunction(frame, maxLag + 1);
  const cmndf = cumulativeMeanNormalisedDifference(df);
  const tau   = absoluteThreshold(cmndf, threshold, minLag, maxLag);

  if (tau === -1) {
    return { frequency: null, clarity: 0, periodSamples: null };
  }

  const tauRefined = parabolicInterpolation(cmndf, tau);
  const freq       = sr / tauRefined;
  // Clamp clarity to [0,1] — d'(τ) should be in (0,1) but guard edge cases
  const clarity    = Math.max(0, Math.min(1, 1 - cmndf[tau]));

  return {
    frequency:     freq,
    clarity,
    periodSamples: tauRefined,
  };
}

/** Stateful pitch detector that accepts a continuous audio stream. */
export interface PitchDetector {
  /** Process a frame of mono samples. Returns a PitchResult. */
  processFrame(samples: Float32Array): PitchResult;
  /** Sample rate this detector was created with. */
  readonly sampleRate: number;
}

/**
 * Create a stateful YIN pitch detector.
 *
 * @param config YIN configuration. `sampleRate` is required.
 *
 * @example
 * ```ts
 * const detector = createPitchDetector({ sampleRate: 44100 });
 * for (const frame of audioFrames) {
 *   const { frequency, clarity } = detector.processFrame(frame);
 * }
 * ```
 */
export function createPitchDetector(config: YINConfig = {}): PitchDetector {
  const sr = config.sampleRate ?? DEFAULT_SR;
  return {
    processFrame: (samples: Float32Array): PitchResult => detectPitch(samples, config),
    get sampleRate() { return sr; },
  };
}
