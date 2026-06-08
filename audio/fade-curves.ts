/**
 * Artone v3 — Audio Fade & Crossfade Curves
 *
 * Fade-in / fade-out envelope generation and clip crossfading for the audio
 * timeline. Every NLE offers a family of fade shapes; this module implements
 * the standard set with correct gain mathematics:
 *
 *   - `linear`         — straight ramp (constant amplitude slope).
 *   - `equal-power`    — cos/sin law, preserves perceived loudness across a
 *                        crossfade of UNcorrelated signals (−3 dB at midpoint).
 *   - `equal-gain`     — linear crossfade, preserves amplitude for CORRELATED
 *                        signals (−6 dB at midpoint for uncorrelated).
 *   - `logarithmic`    — fast initial change, slow tail (natural for fade-out).
 *   - `exponential`    — slow initial change, fast tail (natural for fade-in).
 *   - `s-curve`        — smooth ease-in-out (raised cosine), no slope discontinuity.
 *
 * A fade curve maps normalized progress p ∈ [0, 1] to a gain g ∈ [0, 1].
 * For fade-IN the curve runs 0→1; for fade-OUT it runs 1→0 (1 − shape).
 *
 * All functions are pure and operate on / return `Float32Array`. No browser APIs.
 *
 * References:
 *   - Zölzer 2011: "DAFX: Digital Audio Effects" (2nd ed.), §2 amplitude.
 *   - Reiss & McPherson 2014: "Audio Effects: Theory, Implementation, Application".
 *   - ITU-R BS.775 / equal-power panning law.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Fade shape family. */
export type FadeShape =
  | 'linear'
  | 'equal-power'
  | 'equal-gain'
  | 'logarithmic'
  | 'exponential'
  | 's-curve';

/** Direction of a single-sided fade. */
export type FadeDirection = 'in' | 'out';

/** Options for crossfade between two clips. */
export interface CrossfadeOptions {
  /** Fade shape applied to both sides. Default: 'equal-power'. */
  shape?: FadeShape;
  /** Number of overlapping samples to crossfade. */
  lengthSamples: number;
}

// ─── Shape functions ──────────────────────────────────────────────────────────

/** Steepness constant for the log/exp curves (higher = more pronounced). */
const LOG_CURVE_BASE = 50;

/**
 * Evaluate a fade-IN gain (0 → 1) for a given shape at progress p ∈ [0, 1].
 *
 * @param shape  Fade shape.
 * @param p      Normalized progress in [0, 1].
 * @returns      Gain in [0, 1].
 */
export function fadeInGain(shape: FadeShape, p: number): number {
  const t = p < 0 ? 0 : p > 1 ? 1 : p;
  switch (shape) {
    case 'linear':
    case 'equal-gain':
      return t;
    case 'equal-power':
      // sin law: g(0)=0, g(1)=1, g(0.5)=√0.5 ≈ 0.707 (−3 dB)
      return Math.sin(t * Math.PI * 0.5);
    case 'logarithmic':
      // Fast rise then plateau: 1 - base^(-t) normalized
      return (1 - Math.pow(LOG_CURVE_BASE, -t)) / (1 - 1 / LOG_CURVE_BASE);
    case 'exponential':
      // Slow rise then fast: (base^t - 1) normalized
      return (Math.pow(LOG_CURVE_BASE, t) - 1) / (LOG_CURVE_BASE - 1);
    case 's-curve':
      // Raised cosine: smooth ease-in-out
      return 0.5 - 0.5 * Math.cos(t * Math.PI);
    default:
      return t;
  }
}

/**
 * Evaluate a fade-OUT gain (1 → 0) for a given shape at progress p ∈ [0, 1].
 *
 * For an equal-power crossfade, the fade-out is the cos law so that
 * fadeIn² + fadeOut² = 1 (constant power). For other shapes the fade-out is
 * the mirror `fadeInGain(shape, 1 − p)`.
 *
 * @param shape  Fade shape.
 * @param p      Normalized progress in [0, 1].
 * @returns      Gain in [0, 1].
 */
export function fadeOutGain(shape: FadeShape, p: number): number {
  const t = p < 0 ? 0 : p > 1 ? 1 : p;
  if (shape === 'equal-power') {
    // cos law: g(0)=1, g(1)=0, g(0.5)=√0.5
    return Math.cos(t * Math.PI * 0.5);
  }
  // Mirror the fade-in shape
  return fadeInGain(shape, 1 - t);
}

// ─── Curve generation ─────────────────────────────────────────────────────────

/**
 * Generate a gain envelope of `length` samples for a single-sided fade.
 *
 * @param shape      Fade shape.
 * @param direction  'in' (0→1) or 'out' (1→0).
 * @param length     Number of samples in the envelope (≥ 1).
 * @returns          Float32Array of gain values in [0, 1].
 */
export function generateFadeCurve(
  shape:     FadeShape,
  direction: FadeDirection,
  length:    number,
): Float32Array {
  if (length < 1) throw new RangeError('length must be ≥ 1');
  const curve = new Float32Array(length);
  const fn = direction === 'in' ? fadeInGain : fadeOutGain;
  if (length === 1) {
    curve[0] = fn(shape, direction === 'in' ? 1 : 0);
    return curve;
  }
  const denom = length - 1;
  for (let i = 0; i < length; i++) {
    curve[i] = fn(shape, i / denom);
  }
  return curve;
}

// ─── Single-sided fade application ───────────────────────────────────────────

/**
 * Apply a fade-IN to the start of an audio buffer (in place is avoided —
 * returns a new buffer).
 *
 * @param input        Mono audio samples.
 * @param fadeSamples  Number of samples over which to fade in.
 * @param shape        Fade shape. Default: 'equal-power'.
 * @returns            New Float32Array with the fade applied.
 */
export function applyFadeIn(
  input:       Float32Array,
  fadeSamples: number,
  shape:       FadeShape = 'equal-power',
): Float32Array {
  const out = new Float32Array(input);
  const n = Math.min(fadeSamples, input.length);
  if (n <= 0) return out;
  const denom = n > 1 ? n - 1 : 1;
  for (let i = 0; i < n; i++) {
    out[i] = input[i] * fadeInGain(shape, i / denom);
  }
  return out;
}

/**
 * Apply a fade-OUT to the end of an audio buffer.
 *
 * @param input        Mono audio samples.
 * @param fadeSamples  Number of samples over which to fade out.
 * @param shape        Fade shape. Default: 'equal-power'.
 * @returns            New Float32Array with the fade applied.
 */
export function applyFadeOut(
  input:       Float32Array,
  fadeSamples: number,
  shape:       FadeShape = 'equal-power',
): Float32Array {
  const out = new Float32Array(input);
  const n = Math.min(fadeSamples, input.length);
  if (n <= 0) return out;
  const start = input.length - n;
  const denom = n > 1 ? n - 1 : 1;
  for (let i = 0; i < n; i++) {
    // progress goes 0→1 across the fade region
    out[start + i] = input[start + i] * fadeOutGain(shape, i / denom);
  }
  return out;
}

// ─── Crossfade ────────────────────────────────────────────────────────────────

/**
 * Crossfade two clips into a single continuous buffer.
 *
 * The tail of `clipA` overlaps the head of `clipB` for `lengthSamples` samples.
 * During the overlap, A fades out and B fades in. Output length is
 * `clipA.length + clipB.length − lengthSamples`.
 *
 * @param clipA  First clip (its tail is faded out).
 * @param clipB  Second clip (its head is faded in).
 * @param opts   Crossfade options (length + shape).
 * @returns      New Float32Array containing the crossfaded result.
 */
export function crossfade(
  clipA: Float32Array,
  clipB: Float32Array,
  opts:  CrossfadeOptions,
): Float32Array {
  const shape = opts.shape ?? 'equal-power';
  const xf = Math.max(0, Math.min(opts.lengthSamples, clipA.length, clipB.length));

  if (xf === 0) {
    // Simple concatenation
    const out = new Float32Array(clipA.length + clipB.length);
    out.set(clipA, 0);
    out.set(clipB, clipA.length);
    return out;
  }

  const outLen = clipA.length + clipB.length - xf;
  const out = new Float32Array(outLen);

  // Part 1: clipA before the overlap (copied as-is)
  const aHead = clipA.length - xf;
  for (let i = 0; i < aHead; i++) out[i] = clipA[i];

  // Part 2: the overlap region (A fades out, B fades in)
  const denom = xf > 1 ? xf - 1 : 1;
  for (let i = 0; i < xf; i++) {
    const p = i / denom;
    const gA = fadeOutGain(shape, p);
    const gB = fadeInGain(shape, p);
    out[aHead + i] = clipA[aHead + i] * gA + clipB[i] * gB;
  }

  // Part 3: clipB after the overlap (copied as-is)
  for (let i = xf; i < clipB.length; i++) {
    out[aHead + i] = clipB[i];
  }

  return out;
}

// ─── Gain ramp utility ────────────────────────────────────────────────────────

/**
 * Apply a linear gain ramp from `startGain` to `endGain` across an entire buffer.
 *
 * Useful for volume automation between two keyframes.
 *
 * @param input      Mono audio samples.
 * @param startGain  Gain at the first sample.
 * @param endGain    Gain at the last sample.
 * @returns          New Float32Array with the ramp applied.
 */
export function applyGainRamp(
  input:     Float32Array,
  startGain: number,
  endGain:   number,
): Float32Array {
  const out = new Float32Array(input.length);
  const n = input.length;
  if (n === 0) return out;
  if (n === 1) {
    out[0] = input[0] * endGain;
    return out;
  }
  const denom = n - 1;
  for (let i = 0; i < n; i++) {
    const g = startGain + (endGain - startGain) * (i / denom);
    out[i] = input[i] * g;
  }
  return out;
}

// ─── dB helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a linear gain to decibels (20·log10).
 *
 * @param gain  Linear gain (≥ 0). Values ≤ 0 map to −Infinity.
 */
export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

/**
 * Convert decibels to a linear gain (10^(dB/20)).
 *
 * @param db  Level in decibels.
 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Measure the RMS gain at the midpoint of a crossfade for a given shape.
 *
 * For two equal-amplitude UNcorrelated signals the combined power is
 * `gA² + gB²`. Returns the combined amplitude `sqrt(gA² + gB²)` at p=0.5.
 *
 * - equal-power → 1.0 (constant power, no dip).
 * - equal-gain / linear → √0.5 ≈ 0.707 (−3 dB power dip for uncorrelated).
 *
 * @param shape  Fade shape.
 */
export function crossfadeMidpointPower(shape: FadeShape): number {
  const gA = fadeOutGain(shape, 0.5);
  const gB = fadeInGain(shape, 0.5);
  return Math.sqrt(gA * gA + gB * gB);
}

/**
 * Measure the summed amplitude at the midpoint of a crossfade.
 *
 * For two equal-amplitude CORRELATED (identical) signals the combined
 * amplitude is `gA + gB`.
 *
 * - equal-gain / linear → 1.0 (constant amplitude, no bump for correlated).
 * - equal-power → √2 ≈ 1.414 (+3 dB bump for correlated).
 *
 * @param shape  Fade shape.
 */
export function crossfadeMidpointAmplitude(shape: FadeShape): number {
  return fadeOutGain(shape, 0.5) + fadeInGain(shape, 0.5);
}
