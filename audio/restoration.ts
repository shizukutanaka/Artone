/**
 * Artone v3 — Audio Restoration
 *
 * Classic audio repair primitives, all pure and offline-testable:
 *
 *   - **DC offset removal** — subtract the mean (or a one-pole high-pass) to
 *     re-center a waveform on zero. DC offset wastes headroom and causes clicks
 *     at clip boundaries.
 *   - **Declicking** — detect impulsive clicks/pops (large sample-to-sample
 *     jumps relative to a local envelope) and repair them by interpolation
 *     across the damaged span.
 *   - **Declipping** — detect flat-topped clipped regions (consecutive samples
 *     pinned at/near full scale) and reconstruct a smooth peak via cubic
 *     interpolation from the surrounding unclipped samples.
 *   - **Silence trimming** — remove leading/trailing silence below a dB floor.
 *
 * These operate on mono `Float32Array` (normalized −1..1). No browser APIs.
 *
 * References:
 *   - Godsill & Rayner 1998: "Digital Audio Restoration".
 *   - Vaseghi 2008: "Advanced Digital Signal Processing and Noise Reduction".
 *   - Zölzer 2011: "DAFX" (§ amplitude / dynamics).
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for declicking. */
export interface DeclickOptions {
  /**
   * Click detection threshold as a multiple of the local mean absolute
   * derivative. Higher = fewer detections. Default: 6.
   */
  threshold?: number;
  /** Window (samples) for estimating the local derivative envelope. Default: 64. */
  envelopeWindow?: number;
  /** Maximum span (samples) of a single click to repair. Default: 16. */
  maxClickWidth?: number;
}

/** Result of a declick pass. */
export interface DeclickResult {
  /** Repaired audio. */
  output: Float32Array;
  /** Sample indices where clicks were detected and repaired. */
  clickPositions: number[];
}

/** Options for declipping. */
export interface DeclipOptions {
  /** Amplitude threshold above which a sample is considered clipped. Default: 0.98. */
  clipThreshold?: number;
  /** Minimum run length (samples) to treat as a clipped region. Default: 2. */
  minRunLength?: number;
}

/** Result of a declip pass. */
export interface DeclipResult {
  /** Reconstructed audio. */
  output: Float32Array;
  /** Number of clipped regions repaired. */
  regionsRepaired: number;
}

// ─── DC offset removal ────────────────────────────────────────────────────────

/**
 * Compute the DC offset (mean sample value) of a signal.
 *
 * @param input  Mono audio.
 * @returns      The mean value (0 for an empty signal).
 */
export function measureDcOffset(input: Float32Array): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i];
  return sum / input.length;
}

/**
 * Remove DC offset by subtracting the global mean.
 *
 * Best for offline processing where the entire signal is available.
 *
 * @param input  Mono audio.
 * @returns      New Float32Array centered on zero.
 */
export function removeDcOffset(input: Float32Array): Float32Array {
  const dc = measureDcOffset(input);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] - dc;
  return out;
}

/**
 * Remove DC (and very low frequency rumble) with a one-pole high-pass filter.
 *
 * y[n] = x[n] − x[n−1] + R·y[n−1], where R = 1 − (2π·fc / sr).
 * Suitable for streaming because it adapts to drifting offset.
 *
 * @param input       Mono audio.
 * @param sampleRate  Sample rate in Hz.
 * @param cutoffHz    Cutoff frequency. Default: 20 Hz.
 * @returns           New high-passed Float32Array.
 */
export function highPassDcBlock(
  input:      Float32Array,
  sampleRate: number,
  cutoffHz =  20,
): Float32Array {
  const out = new Float32Array(input.length);
  if (input.length === 0) return out;
  // sampleRate=0 → r=1-Infinity=-Infinity → (-Infinity)*0=NaN on first sample.
  if (sampleRate <= 0) return Float32Array.from(input);
  const r = 1 - (2 * Math.PI * cutoffHz) / sampleRate;
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < input.length; i++) {
    const y = input[i] - prevIn + r * prevOut;
    out[i] = y;
    prevIn = input[i];
    prevOut = y;
  }
  return out;
}

// ─── Declicking ───────────────────────────────────────────────────────────────

/**
 * Detect and repair impulsive clicks in an audio signal.
 *
 * Clicks are detected where the absolute first difference |x[n] − x[n−1]|
 * exceeds `threshold` times the local mean absolute difference. Detected
 * spans (up to `maxClickWidth`) are repaired by linear interpolation between
 * the last-good sample before and the first-good sample after the click.
 *
 * @param input  Mono audio.
 * @param opts   Declick options.
 * @returns      A DeclickResult with repaired audio and click positions.
 */
export function declick(input: Float32Array, opts: DeclickOptions = {}): DeclickResult {
  const threshold      = opts.threshold      ?? 6;
  const envelopeWindow = opts.envelopeWindow ?? 64;
  const maxClickWidth  = opts.maxClickWidth  ?? 16;

  const n = input.length;
  const output = Float32Array.from(input);
  const clickPositions: number[] = [];
  if (n < 3) return { output, clickPositions };

  // First differences
  const diff = new Float32Array(n);
  for (let i = 1; i < n; i++) diff[i] = Math.abs(input[i] - input[i - 1]);

  // Local mean absolute difference (sliding window)
  const half = envelopeWindow >> 1;

  let i = 1;
  while (i < n) {
    // Estimate local envelope around i (excluding the candidate itself)
    let sum = 0, count = 0;
    const lo = Math.max(1, i - half);
    const hi = Math.min(n - 1, i + half);
    for (let k = lo; k <= hi; k++) { sum += diff[k]; count++; }
    const localMean = count > 0 ? sum / count : 0;
    const limit = threshold * localMean;

    if (localMean > 1e-9 && diff[i] > limit) {
      // Found a click start; find its end (consecutive over-threshold samples)
      let end = i;
      while (end < n - 1 && end - i < maxClickWidth && diff[end + 1] > limit) end++;

      // Repair span [i, end] by interpolating between input[i-1] and input[end+1]
      const a = i - 1;
      const b = Math.min(end + 1, n - 1);
      const va = output[a];
      const vb = output[b];
      const span = b - a;
      for (let k = a + 1; k < b; k++) {
        output[k] = va + (vb - va) * ((k - a) / span);
      }
      clickPositions.push(i);
      i = b + 1;
    } else {
      i++;
    }
  }

  return { output, clickPositions };
}

// ─── Declipping ───────────────────────────────────────────────────────────────

/**
 * Cubic Hermite interpolation between p1 and p2 with neighbours p0, p3.
 * Catmull-Rom tangents. t ∈ [0, 1].
 */
function cubicHermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1 = 0.5 * (p2 - p0);
  const m2 = 0.5 * (p3 - p1);
  return (
    (2 * t3 - 3 * t2 + 1) * p1 +
    (t3 - 2 * t2 + t)     * m1 +
    (-2 * t3 + 3 * t2)    * p2 +
    (t3 - t2)             * m2
  );
}

/**
 * Detect and reconstruct clipped (flat-topped) regions of a signal.
 *
 * A region is considered clipped when `minRunLength` or more consecutive
 * samples have |amplitude| ≥ `clipThreshold`. Each region is reconstructed by
 * cubic Hermite interpolation through the surrounding unclipped samples, with a
 * small overshoot so the restored peak rises above the clip ceiling (more
 * natural than a flat top).
 *
 * @param input  Mono audio.
 * @param opts   Declip options.
 * @returns      A DeclipResult with reconstructed audio and region count.
 */
export function declip(input: Float32Array, opts: DeclipOptions = {}): DeclipResult {
  const clipThreshold = opts.clipThreshold ?? 0.98;
  const minRunLength  = opts.minRunLength  ?? 2;

  const n = input.length;
  const output = Float32Array.from(input);
  let regionsRepaired = 0;
  if (n < 4) return { output, regionsRepaired };

  let i = 0;
  while (i < n) {
    if (Math.abs(input[i]) >= clipThreshold) {
      // Find run extent
      const sign = input[i] >= 0 ? 1 : -1;
      let end = i;
      while (end < n - 1 && Math.abs(input[end + 1]) >= clipThreshold
             && (input[end + 1] >= 0 ? 1 : -1) === sign) {
        end++;
      }
      const runLen = end - i + 1;

      if (runLen >= minRunLength) {
        // Anchors: two good samples before and after
        const a = i - 1;       // last good sample before
        const b = end + 1;     // first good sample after
        if (a >= 1 && b <= n - 2) {
          const p0 = output[a - 1];
          const p1 = output[a];
          const p2 = output[b];
          const p3 = output[b + 1];
          const span = b - a;
          for (let k = a + 1; k < b; k++) {
            const t = (k - a) / span;
            let v = cubicHermite(p0, p1, p2, p3, t);
            // Ensure the restored peak at least reaches the clip ceiling
            if (sign > 0) v = Math.max(v, clipThreshold);
            else          v = Math.min(v, -clipThreshold);
            output[k] = v;
          }
          regionsRepaired++;
        }
      }
      i = end + 1;
    } else {
      i++;
    }
  }

  return { output, regionsRepaired };
}

// ─── Silence trimming ─────────────────────────────────────────────────────────

/**
 * Convert a linear amplitude to dBFS (0 dB = full scale).
 *
 * @param amp  Absolute amplitude (≥ 0).
 */
export function ampToDbfs(amp: number): number {
  return amp <= 0 ? -Infinity : 20 * Math.log10(amp);
}

/**
 * Trim leading and trailing silence below a dB floor.
 *
 * A sample is "silent" when its absolute value is below `10^(floorDb/20)`.
 * Returns a subarray view region as a NEW Float32Array (copy).
 *
 * @param input    Mono audio.
 * @param floorDb  Silence floor in dBFS. Default: −60.
 * @returns        `{ output, startSample, endSample }`. If the whole signal is
 *                 silent, `output` is empty and start === end === 0.
 */
export function trimSilence(
  input:   Float32Array,
  floorDb = -60,
): { output: Float32Array; startSample: number; endSample: number } {
  const floor = Math.pow(10, floorDb / 20);
  const n = input.length;

  let start = 0;
  while (start < n && Math.abs(input[start]) < floor) start++;

  if (start === n) {
    // Entirely silent
    return { output: new Float32Array(0), startSample: 0, endSample: 0 };
  }

  let end = n - 1;
  while (end > start && Math.abs(input[end]) < floor) end--;

  const output = input.slice(start, end + 1);
  return { output, startSample: start, endSample: end + 1 };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Count the number of samples at/above a clipping threshold.
 *
 * Useful for reporting how much of a signal is clipped before repair.
 *
 * @param input          Mono audio.
 * @param clipThreshold  Amplitude threshold. Default: 0.98.
 */
export function countClippedSamples(input: Float32Array, clipThreshold = 0.98): number {
  let count = 0;
  for (let i = 0; i < input.length; i++) {
    if (Math.abs(input[i]) >= clipThreshold) count++;
  }
  return count;
}

/**
 * Peak absolute amplitude of a signal.
 *
 * @param input  Mono audio.
 */
export function peakAmplitude(input: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    if (a > peak) peak = a;
  }
  return peak;
}
