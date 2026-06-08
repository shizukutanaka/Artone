/**
 * Artone v3 — Beat Detection
 *
 * Energy-based onset/beat detection for music-synchronized video editing.
 * Detects rhythmic beats in mono PCM audio and estimates the tempo (BPM).
 *
 * Algorithm (Brossier 2004 / Scheirer 1998 sub-band energy approach):
 *   1. Compute windowed energy of overlapping analysis windows.
 *   2. Compare each window's energy to the local average of the preceding
 *      ~1 second of windows (robust against gradually rising energy).
 *   3. An onset is declared when energy > localAverage × threshold.
 *   4. Enforce a minimum inter-beat refractory period (default 0.25 s = 240 BPM cap).
 *   5. Estimate tempo from the median inter-beat interval; express confidence
 *      as the fraction of intervals within ±15 % of that median.
 *
 * Input requirement: mono Float32Array (mix to mono before calling if needed).
 * All operations are O(N) in the audio length.
 *
 * References:
 *   - Brossier P. et al. (2004) "Fast labelling of notes in music signals"
 *   - Scheirer E. (1998) "Tempo and beat analysis of acoustic musical signals"
 *   - Dixon S. (2006) "Onset Detection Revisited"
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for `detectBeats` and `createBeatDetector`. */
export interface BeatDetectionOptions {
  /** Sample rate of the input audio in Hz. Default: 48000. */
  sampleRate?: number;
  /**
   * Analysis window size in samples.
   * Smaller values improve time resolution; larger values give smoother energy.
   * Default: 1024 (~21 ms at 48 kHz).
   */
  windowSize?: number;
  /**
   * Hop between successive windows in samples.
   * Must be ≤ windowSize. Default: 512 (~11 ms at 48 kHz).
   */
  hopSize?: number;
  /**
   * Beat detection threshold: ratio of current energy to local average.
   * Higher values = fewer, more confident detections. Default: 1.5.
   */
  threshold?: number;
  /**
   * Number of past windows used to compute the local energy average.
   * Defaults to ⌈sampleRate / hopSize⌉ ≈ one second of audio.
   */
  historySize?: number;
  /**
   * Minimum time between successive beat detections in seconds.
   * Prevents double-detections on a single beat transient.
   * Default: 0.25 s (≙ 240 BPM maximum).
   */
  minIntervalSec?: number;
}

/** Result returned by `detectBeats` and `BeatDetector.getResult`. */
export interface BeatDetectionResult {
  /** Beat positions in seconds, sorted ascending. */
  beats: number[];
  /**
   * Estimated tempo in BPM, derived from the median inter-beat interval.
   * Returns 0 when fewer than 2 beats are detected.
   */
  bpm: number;
  /**
   * Confidence in the BPM estimate (0–1).
   * Fraction of inter-beat intervals within ±15 % of the median interval.
   */
  confidence: number;
}

/** Stateful streaming beat detector (see `createBeatDetector`). */
export interface BeatDetector {
  /** Feed the next block of mono audio. Blocks may be any length. */
  process(samples: Float32Array): void;
  /** Return the beat detection result over all audio fed so far. */
  getResult(): BeatDetectionResult;
  /** Clear all accumulated audio and state. */
  reset(): void;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Mean-square energy of `audio[offset … offset+size-1]`. */
function windowEnergy(audio: Float32Array, offset: number, size: number): number {
  let sum = 0;
  const end = Math.min(offset + size, audio.length);
  const actual = end - offset;
  for (let i = offset; i < end; i++) sum += audio[i] * audio[i];
  return actual > 0 ? sum / size : 0;
}

/**
 * Estimate tempo and confidence from a list of beat positions in seconds.
 * Uses the median inter-beat interval (robust to outliers).
 */
function estimateBpm(beats: number[]): { bpm: number; confidence: number } {
  if (beats.length < 2) return { bpm: 0, confidence: 0 };

  const ibi: number[] = [];
  for (let i = 1; i < beats.length; i++) ibi.push(beats[i] - beats[i - 1]);

  const sorted = ibi.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return { bpm: 0, confidence: 0 };

  const bpm = Math.round((60 / median) * 10) / 10;

  // Confidence = fraction of intervals within ±15 % of the median
  const tol = median * 0.15;
  const consistent = ibi.filter((x) => Math.abs(x - median) <= tol).length;
  const confidence = consistent / ibi.length;

  return { bpm, confidence };
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Detect beats in a mono audio signal and estimate the tempo.
 *
 * @param audio    Mono PCM samples (any length).
 * @param options  Detection parameters.
 * @returns        Beat positions, estimated BPM, and confidence.
 */
export function detectBeats(
  audio: Float32Array,
  options: BeatDetectionOptions = {},
): BeatDetectionResult {
  const sampleRate  = options.sampleRate   ?? 48000;
  const windowSize  = options.windowSize   ?? 1024;
  const hopSize     = Math.min(options.hopSize ?? 512, windowSize);
  const threshold   = options.threshold    ?? 1.5;
  const historySize = options.historySize  ?? Math.max(4, Math.ceil(sampleRate / hopSize));
  const minIntervalSec = options.minIntervalSec ?? 0.25;
  const minWinGap   = Math.ceil(minIntervalSec * sampleRate / hopSize);

  if (audio.length < windowSize) return { beats: [], bpm: 0, confidence: 0 };

  // ── Step 1: per-window energy ──
  const energies: number[] = [];
  for (let off = 0; off + windowSize <= audio.length; off += hopSize) {
    energies.push(windowEnergy(audio, off, windowSize));
  }

  if (energies.length <= historySize) return { beats: [], bpm: 0, confidence: 0 };

  // ── Step 2: onset detection with local energy comparison ──
  const beats: number[] = [];
  let lastBeatWin = -(minWinGap + 1);

  // Running sum for an O(N) sliding window average
  let histSum = 0;
  for (let j = 0; j < historySize; j++) histSum += energies[j];

  for (let i = historySize; i < energies.length; i++) {
    const localAvg = histSum / historySize;

    if (localAvg > 0 && energies[i] >= localAvg * threshold) {
      if (i - lastBeatWin >= minWinGap) {
        // Time at the center of this analysis window
        const timeSec = (i * hopSize + windowSize / 2) / sampleRate;
        beats.push(timeSec);
        lastBeatWin = i;
      }
    }

    // Slide the history window
    histSum += energies[i] - energies[i - historySize];
  }

  return { beats, ...estimateBpm(beats) };
}

// ─── Streaming API ────────────────────────────────────────────────────────────

/**
 * Create a stateful streaming beat detector.
 *
 * Process audio in arbitrary-size blocks by calling `process()` repeatedly,
 * then call `getResult()` to obtain the current estimate over all audio fed
 * since the last `reset()`.
 *
 * @param options  Detection parameters (same as `detectBeats`).
 */
export function createBeatDetector(options?: BeatDetectionOptions): BeatDetector {
  const blocks: Float32Array[] = [];
  let totalSamples = 0;

  function process(samples: Float32Array): void {
    if (samples.length === 0) return;
    blocks.push(samples.slice());
    totalSamples += samples.length;
  }

  function getResult(): BeatDetectionResult {
    if (totalSamples === 0) return { beats: [], bpm: 0, confidence: 0 };

    const merged = new Float32Array(totalSamples);
    let off = 0;
    for (const blk of blocks) { merged.set(blk, off); off += blk.length; }

    return detectBeats(merged, options);
  }

  function reset(): void {
    blocks.length = 0;
    totalSamples  = 0;
  }

  return { process, getResult, reset };
}
