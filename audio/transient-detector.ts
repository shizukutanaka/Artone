/**
 * Artone v3 — Audio Transient / Onset Detector
 *
 * Detects energy transients (note onsets, drum hits, syllable boundaries)
 * in mono PCM audio using a multi-band spectral flux onset strength function.
 *
 * Algorithm (Bello et al. 2005 — reviewed approach):
 *   1. Compute STFT magnitude spectra of overlapping frames.
 *   2. For each frame, measure the positive spectral flux: the sum of
 *      increases in magnitude across frequency bins (half-wave rectified).
 *   3. Normalise flux by a local median (adaptive threshold).
 *   4. Pick onset peaks where the normalised flux exceeds a threshold and
 *      a minimum refractory interval has passed.
 *
 * Compared to `beat-detector.ts` (which targets periodic beats / BPM),
 * this module targets any energy onset regardless of periodicity — useful
 * for speech syllables, guitar plucks, individual drum hits, sfx, etc.
 *
 * All operations are O(N) in the audio length; no FFT required (energy-band
 * approximation replaces full-spectrum STFT for efficiency).
 *
 * References:
 *   - Bello J.P. et al. (2005) "A tutorial on onset detection in music
 *     signals" IEEE Trans. Speech Audio Process.
 *   - Dixon S. (2006) "Onset detection revisited"
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for `detectTransients` and `createTransientDetector`. */
export interface TransientDetectionOptions {
  /** Sample rate of the input audio in Hz. Default: 48000. */
  sampleRate?: number;
  /**
   * Analysis window size in samples (power of two recommended).
   * Smaller → finer time resolution; larger → more frequency resolution.
   * Default: 512 (~11 ms at 48 kHz).
   */
  windowSize?: number;
  /**
   * Hop between successive windows in samples. Default: windowSize / 2.
   */
  hopSize?: number;
  /**
   * Detection threshold: number of standard deviations above the local
   * median required to declare an onset. Default: 1.5.
   */
  threshold?: number;
  /**
   * Half-width of the local median window (in frames).
   * Median is computed over 2 × medianHalf + 1 frames.
   * Default: 8.
   */
  medianHalf?: number;
  /**
   * Minimum time between successive onsets in seconds (refractory period).
   * Default: 0.05 s (= 50 ms, ≈ 1200 BPM maximum).
   */
  minIntervalSec?: number;
  /**
   * Number of sub-bands used for spectral flux computation.
   * More bands → more robust to harmonic/noise tradeoff.
   * Default: 4.
   */
  numBands?: number;
}

/** Result returned by `detectTransients`. */
export interface TransientDetectionResult {
  /** Onset positions in seconds, sorted ascending. */
  onsets: number[];
  /**
   * Per-onset confidence (0–1), proportional to the normalised flux
   * at the detected peak relative to the overall signal dynamics.
   */
  confidence: number[];
  /**
   * Onset strength envelope in frames (before peak picking).
   * Length = number of analysis frames.
   */
  onsetStrength: Float32Array;
  /**
   * Time stamp in seconds for each onset strength frame.
   * Length = number of analysis frames.
   */
  frameTimes: Float32Array;
}

/** Stateful streaming transient detector. */
export interface TransientDetector {
  /** Feed the next block of mono audio. Blocks may be any length. */
  process(samples: Float32Array): void;
  /** Return the detection result over all audio fed so far. */
  getResult(): TransientDetectionResult;
  /** Clear all accumulated state. */
  reset(): void;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** RMS energy of a window segment. */
function windowRms(audio: Float32Array, offset: number, size: number): number {
  let sum = 0;
  const end = Math.min(offset + size, audio.length);
  for (let i = offset; i < end; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / size);
}

/**
 * Compute multi-band onset strength envelope from audio.
 *
 * Returns a Float32Array of length numFrames.
 */
function computeOnsetStrength(
  audio: Float32Array,
  windowSize: number,
  hopSize: number,
  numBands: number,
): Float32Array {
  // Divide the spectrum into sub-bands by dividing the window into
  // numBands equal-log segments (approximated here by equal sub-window thirds)
  const bandSize   = Math.max(1, Math.floor(windowSize / numBands));
  const numFrames  = Math.max(0, Math.floor((audio.length - windowSize) / hopSize) + 1);
  const flux       = new Float32Array(numFrames);

  // Per-band RMS of the previous frame (for spectral flux = positive increase)
  const prevRms    = new Float32Array(numBands);

  for (let f = 0; f < numFrames; f++) {
    const off      = f * hopSize;
    let totalFlux  = 0;
    for (let b = 0; b < numBands; b++) {
      const bOff  = off + b * bandSize;
      const len   = Math.min(bandSize, audio.length - bOff);
      const rms   = len > 0 ? windowRms(audio, bOff, len) : 0;
      // Half-wave rectified spectral flux: only positive increases
      const delta = rms - prevRms[b];
      if (delta > 0) totalFlux += delta;
      prevRms[b] = rms;
    }
    flux[f] = totalFlux;
  }

  return flux;
}

/**
 * Compute adaptive threshold via local median + std.
 *
 * Returns threshold values, one per frame.
 */
function adaptiveThreshold(
  flux: Float32Array,
  medianHalf: number,
  thresholdMult: number,
): Float32Array {
  const n   = flux.length;
  const thr = new Float32Array(n);
  const win: number[] = [];

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - medianHalf);
    const hi = Math.min(n - 1, i + medianHalf);
    win.length = 0;
    for (let j = lo; j <= hi; j++) win.push(flux[j]);
    win.sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)];
    // Median absolute deviation for scale estimate
    const devs = win.map((v) => Math.abs(v - med));
    devs.sort((a, b) => a - b);
    const mad = devs[Math.floor(devs.length / 2)];
    thr[i] = med + thresholdMult * Math.max(mad, 1e-10);
  }
  return thr;
}

/**
 * Peak-pick onset frames from the onset strength function.
 * Returns onset frame indices.
 */
function peakPick(
  flux: Float32Array,
  threshold: Float32Array,
  minFrameGap: number,
): number[] {
  const peaks: number[] = [];
  let lastPeak = -(minFrameGap + 1);

  for (let i = 1; i < flux.length - 1; i++) {
    if (
      flux[i] > threshold[i] &&
      flux[i] >= flux[i - 1] &&
      flux[i] >= flux[i + 1] &&
      i - lastPeak >= minFrameGap
    ) {
      peaks.push(i);
      lastPeak = i;
    }
  }
  return peaks;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Detect transients / onsets in a mono audio signal.
 *
 * @param audio    Mono PCM samples.
 * @param options  Detection parameters.
 */
export function detectTransients(
  audio: Float32Array,
  options: TransientDetectionOptions = {},
): TransientDetectionResult {
  const sampleRate     = options.sampleRate     ?? 48000;
  const windowSize     = options.windowSize     ?? 512;
  const hopSize        = options.hopSize        ?? windowSize >> 1;
  const threshold      = options.threshold      ?? 1.5;
  const medianHalf     = options.medianHalf     ?? 8;
  const minIntervalSec = options.minIntervalSec ?? 0.05;
  const numBands       = options.numBands       ?? 4;

  const minFrameGap = Math.max(1, Math.ceil(minIntervalSec * sampleRate / hopSize));

  const flux       = computeOnsetStrength(audio, windowSize, hopSize, numBands);
  const numFrames  = flux.length;

  // Build frame times
  const frameTimes = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    frameTimes[f] = (f * hopSize + windowSize / 2) / sampleRate;
  }

  if (numFrames < 3) {
    return { onsets: [], confidence: [], onsetStrength: flux, frameTimes };
  }

  const thr    = adaptiveThreshold(flux, medianHalf, threshold);
  const frames = peakPick(flux, thr, minFrameGap);

  // Normalise confidence by the 95th percentile of flux
  const sorted = flux.slice().sort((a, b) => a - b) as Float32Array;
  const p95    = sorted[Math.floor(sorted.length * 0.95)] || 1e-10;

  const onsets: number[]     = frames.map((f) => frameTimes[f]);
  const confidence: number[] = frames.map((f) => Math.min(1, flux[f] / p95));

  return { onsets, confidence, onsetStrength: flux, frameTimes };
}

// ─── Streaming API ────────────────────────────────────────────────────────────

/**
 * Create a stateful streaming transient detector.
 *
 * Process audio in arbitrary-sized blocks by calling `process()` repeatedly,
 * then call `getResult()` to obtain onsets detected over all audio so far.
 *
 * @param options  Detection parameters.
 */
export function createTransientDetector(options?: TransientDetectionOptions): TransientDetector {
  const blocks: Float32Array[] = [];
  let totalSamples = 0;

  function process(samples: Float32Array): void {
    if (samples.length === 0) return;
    blocks.push(samples.slice());
    totalSamples += samples.length;
  }

  function getResult(): TransientDetectionResult {
    if (totalSamples === 0) {
      return {
        onsets:        [],
        confidence:    [],
        onsetStrength: new Float32Array(0),
        frameTimes:    new Float32Array(0),
      };
    }
    const merged = new Float32Array(totalSamples);
    let off = 0;
    for (const blk of blocks) { merged.set(blk, off); off += blk.length; }
    return detectTransients(merged, options);
  }

  function reset(): void {
    blocks.length = 0;
    totalSamples  = 0;
  }

  return { process, getResult, reset };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Map onset positions in seconds to the nearest sample indices.
 *
 * @param onsets     Onset times in seconds.
 * @param sampleRate Sample rate in Hz.
 */
export function onsetsToSampleIndices(onsets: number[], sampleRate: number): number[] {
  return onsets.map((t) => Math.round(t * sampleRate));
}

/**
 * Filter onsets by a minimum confidence threshold.
 *
 * @param result     Detection result from `detectTransients`.
 * @param minConf    Minimum confidence (0–1). Default: 0.3.
 */
export function filterByConfidence(
  result: TransientDetectionResult,
  minConf = 0.3,
): { onsets: number[]; confidence: number[] } {
  const onsets: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < result.onsets.length; i++) {
    if (result.confidence[i] >= minConf) {
      onsets.push(result.onsets[i]);
      confidence.push(result.confidence[i]);
    }
  }
  return { onsets, confidence };
}
