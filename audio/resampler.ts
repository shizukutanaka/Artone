/**
 * Artone v3 — Audio Sample Rate Converter
 *
 * High-quality sample rate conversion for mono or multi-channel PCM audio.
 * Supports arbitrary rational ratios (e.g. 44100↔48000, 96000↔48000).
 *
 * Three quality tiers:
 *   - 'linear'  — first-order linear interpolation. Fast; adequate for
 *                 proxy/preview. Moderate aliasing above fc.
 *   - 'sinc4'   — 4-point windowed sinc (Hann window). Good quality with
 *                 only 4 taps; suitable for real-time processing.
 *   - 'sinc16'  — 16-point windowed sinc (Hann window). Near-transparent
 *                 quality, recommended for final export.
 *
 * All operations are pure functions on Float32Array; no Web APIs required.
 *
 * The streaming API (`createResampler`) tracks global sample position so
 * chunked output is bit-exact with batch output up to kernel boundary effects.
 *
 * Reference:
 *   - Smith J.O. (2011) "Spectral Audio Signal Processing" ch. 4
 *   - Zölzer U. (2011) "Digital Audio Signal Processing" ch. 2
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Resampling quality tier. */
export type ResampleQuality = 'linear' | 'sinc4' | 'sinc16';

/** Options for `resample` / `createResampler`. */
export interface ResampleOptions {
  /** Source sample rate in Hz. */
  sourceSampleRate: number;
  /** Target sample rate in Hz. */
  targetSampleRate: number;
  /**
   * Interpolation quality.
   * Default: `'sinc4'`.
   */
  quality?: ResampleQuality;
}

/** Stateful streaming resampler (handles fractional-sample state across calls). */
export interface Resampler {
  /**
   * Resample the next block of input samples.
   * Call repeatedly with successive input blocks; fractional-sample state
   * is preserved between calls for gapless output.
   */
  process(input: Float32Array): Float32Array;
  /** Reset all accumulated state (useful when seeking). */
  reset(): void;
  /** Exact output length for a given input length (rounded down). */
  outputLength(inputLength: number): number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kernel half-widths (number of input samples each side of the centre tap). */
const HALF_WIDTH: Record<ResampleQuality, number> = {
  linear: 1,
  sinc4:  2,
  sinc16: 8,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Hann window value at fractional position t ∈ [−1, 1]. */
function hann(t: number): number {
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

/** Normalised sinc: sin(π·x) / (π·x), sinc(0) = 1. */
function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/**
 * Evaluate a single resampled sample using windowed sinc interpolation.
 *
 * @param buf     Source sample buffer (may extend before offset 0 via `tail` pre-pended).
 * @param pos     Fractional read position in `buf`.
 * @param halfW   Kernel half-width in samples.
 * @param cutoff  Normalised cutoff (1.0 = srcSR/2; < 1.0 for downsampling).
 */
function interpolateSinc(buf: Float32Array, pos: number, halfW: number, cutoff: number): number {
  const centre = Math.floor(pos);
  const frac   = pos - centre;
  let acc = 0;
  let sum = 0;
  for (let k = -halfW + 1; k <= halfW; k++) {
    const idx = centre + k;
    const s   = idx >= 0 && idx < buf.length ? buf[idx] : 0;
    const x   = k - frac;
    const w   = sinc(x * cutoff) * hann(x / halfW);
    acc += s * w;
    sum += w;
  }
  return sum !== 0 ? acc / sum : 0;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Resample a mono signal from `sourceSampleRate` to `targetSampleRate`.
 *
 * @param input   Mono PCM samples at the source sample rate.
 * @param options Resampling parameters.
 * @returns       Resampled mono PCM at the target sample rate.
 */
export function resample(input: Float32Array, options: ResampleOptions): Float32Array {
  const { sourceSampleRate: srcSR, targetSampleRate: dstSR, quality = 'sinc4' } = options;

  if (srcSR === dstSR) return input.slice();
  if (input.length === 0) return new Float32Array(0);
  // Non-positive / non-finite rates make outputSampleCount divide by zero
  // → Infinity → `new Float32Array(Infinity)` throws RangeError. Pass through.
  if (!(srcSR > 0) || !(dstSR > 0)) return input.slice();

  const outLen = outputSampleCount(input.length, srcSR, dstSR);
  if (outLen === 0) return new Float32Array(0);

  const ratio  = srcSR / dstSR;   // source samples per output sample
  const cutoff = Math.min(1, dstSR / srcSR);
  const halfW  = HALF_WIDTH[quality];
  const out    = new Float32Array(outLen);

  if (quality === 'linear') {
    for (let i = 0; i < outLen; i++) {
      const pos  = i * ratio;
      const idx  = Math.floor(pos);
      const frac = pos - idx;
      const a = input[idx] ?? 0;
      const b = idx + 1 < input.length ? input[idx + 1] : a;
      out[i] = a + frac * (b - a);
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      out[i] = interpolateSinc(input, i * ratio, halfW, cutoff);
    }
  }

  return out;
}

/**
 * Resample multi-channel audio.
 *
 * @param channels  Array of mono Float32Arrays, one per channel.
 * @param options   Resampling parameters.
 * @returns         Resampled channels (same channel count).
 */
export function resampleMultichannel(
  channels: Float32Array[],
  options: ResampleOptions,
): Float32Array[] {
  return channels.map((ch) => resample(ch, options));
}

// ─── Streaming API ────────────────────────────────────────────────────────────

/**
 * Create a stateful streaming resampler for a single channel.
 *
 * Tracks global input/output sample counts so chunked output is exactly
 * consistent with the batch `resample()` function (same total output length).
 *
 * @param options Resampling parameters (fixed for the lifetime of this object).
 */
export function createResampler(options: ResampleOptions): Resampler {
  const { sourceSampleRate: srcSR, targetSampleRate: dstSR, quality = 'sinc4' } = options;
  const ratio  = srcSR / dstSR;
  const cutoff = Math.min(1, dstSR / srcSR);
  const halfW  = HALF_WIDTH[quality];

  // Global counters (in source-sample domain and output-sample domain).
  let totalIn  = 0;  // total source samples received so far
  let totalOut = 0;  // total output samples emitted so far

  // Ring of the most recent `halfW` input samples (needed for inter-block kernel).
  let history: Float32Array = new Float32Array(halfW);

  function process(input: Float32Array): Float32Array {
    if (srcSR === dstSR) {
      totalIn  += input.length;
      totalOut += input.length;
      return input.slice();
    }
    if (input.length === 0) return new Float32Array(0);
    // Invalid rates → outputSampleCount Infinity → Float32Array(Infinity) throws.
    if (!(srcSR > 0) || !(dstSR > 0)) {
      totalIn  += input.length;
      totalOut += input.length;
      return input.slice();
    }

    // How many output samples should we have emitted after consuming all new input?
    const newTotalOut = outputSampleCount(totalIn + input.length, srcSR, dstSR);
    const outLen      = newTotalOut - totalOut;

    const out = new Float32Array(outLen);

    // Build a padded view: history ++ input
    // history[halfW-1] = the source sample just before input[0]
    const padded = new Float32Array(halfW + input.length);
    padded.set(history);
    padded.set(input, halfW);

    if (quality === 'linear') {
      for (let i = 0; i < outLen; i++) {
        // Global position of this output sample in source-sample units
        const globalPos = (totalOut + i) * ratio;
        // Local position within padded: offset by halfW (history prefix) and subtract totalIn
        const localPos  = globalPos - totalIn + halfW;
        const idx  = Math.floor(localPos);
        const frac = localPos - idx;
        const a = idx >= 0 && idx < padded.length ? padded[idx] : 0;
        const b = idx + 1 < padded.length ? padded[idx + 1] : a;
        out[i] = a + frac * (b - a);
      }
    } else {
      for (let i = 0; i < outLen; i++) {
        const globalPos = (totalOut + i) * ratio;
        const localPos  = globalPos - totalIn + halfW;
        out[i] = interpolateSinc(padded, localPos, halfW, cutoff);
      }
    }

    // Advance counters and update history
    totalIn  += input.length;
    totalOut  = newTotalOut;

    // Save the last `halfW` input samples as history for the next block
    const copyStart = Math.max(0, input.length - halfW);
    const newHistory = new Float32Array(halfW);
    const srcSlice   = input.subarray(copyStart);
    newHistory.set(srcSlice, halfW - srcSlice.length);
    history = newHistory;

    return out;
  }

  function reset(): void {
    totalIn  = 0;
    totalOut = 0;
    history  = new Float32Array(halfW);
  }

  function outputLength(inputLength: number): number {
    return outputSampleCount(inputLength, srcSR, dstSR);
  }

  return { process, reset, outputLength };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Compute the exact output sample count for a given input length and ratio.
 *
 * Uses integer multiplication before division to maximise precision.
 *
 * @param inputLength     Number of source samples.
 * @param sourceSampleRate Source sample rate in Hz.
 * @param targetSampleRate Target sample rate in Hz.
 */
export function outputSampleCount(
  inputLength: number,
  sourceSampleRate: number,
  targetSampleRate: number,
): number {
  if (sourceSampleRate === targetSampleRate) return inputLength;
  return Math.floor(inputLength * targetSampleRate / sourceSampleRate);
}
