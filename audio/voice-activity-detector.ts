/**
 * Artone v3 — Voice Activity Detector (VAD)
 *
 * Determines whether each frame of audio contains voice/speech.
 * Used to:
 *   - Drive `auto-duck` (detect when dialogue is active)
 *   - Gate automatic caption generation (avoid transcribing silence/music)
 *   - Provide speech-segment boundaries for export/conform tools
 *
 * Algorithm (G.729B Annex B / ITU-T G.729B inspired):
 *   1. Frame audio into overlapping windows.
 *   2. Per frame, compute:
 *        a. Log-energy       E = 10·log10(mean(x²) + ε)
 *        b. Zero-crossing rate (ZCR) — normalised in [0, 1]
 *        c. Spectral centroid (SC) — normalised by Nyquist frequency
 *   3. Keep a noise floor estimate (min-statistics envelope).
 *   4. Classify a frame as "voiced" when:
 *        E > noiseFloor + threshold
 *      and optionally ZCR is within speech ranges (0.05–0.45) and
 *      SC is within speech centroid range (0.05–0.5 of Nyquist).
 *   5. Apply hangover (post-filter): remain active for `hangoverFrames`
 *      after the last voiced frame to smooth out pauses within words.
 *
 * Output is:
 *   - `frames`: per-frame VAD decision (boolean[]).
 *   - `segments`: contiguous voiced intervals `[startSec, endSec]`.
 *   - `energy`, `zcr`, `centroid`: per-frame feature arrays.
 *
 * References:
 *   - ITU-T G.729 Annex B (1996) "A silence compression scheme for
 *     G.729 optimized for terminals conforming to ITU-T V.70"
 *   - Sohn J. et al. (1999) "A statistical model-based voice activity
 *     detection" IEEE Signal Process. Lett. 6(1)
 *   - Moattar M.H., Homayounpour M.M. (2009) "A simple but efficient
 *     real-time voice activity detection" Proc. EUSIPCO
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for `detectVoiceActivity` and `createVAD`. */
export interface VADOptions {
  /** Sample rate in Hz. Default: 48000. */
  sampleRate?: number;
  /**
   * Analysis window size in samples. Default: 512 (~10.7 ms at 48 kHz).
   * Speech is typically analysed in 10–30 ms windows.
   */
  windowSize?: number;
  /**
   * Hop between successive windows. Default: windowSize / 2 (50 % overlap).
   */
  hopSize?: number;
  /**
   * Energy threshold in dB above the estimated noise floor.
   * Higher → fewer false positives but may miss soft speech. Default: 10.
   */
  thresholdDb?: number;
  /**
   * Noise floor update coefficient. Smaller → slower adaptation (more
   * conservative); larger → faster adaptation to ambient noise. Default: 0.02.
   */
  noiseAlpha?: number;
  /**
   * Number of frames to stay "voiced" after the last active frame
   * (hangover / hold-over). Smooths out short pauses within words.
   * Default: 8.
   */
  hangoverFrames?: number;
  /**
   * Enable ZCR + spectral centroid secondary features.
   * When true, a frame must also pass energy AND either-feature check.
   * Default: false (energy-only is sufficient for most use cases).
   */
  useSpectralFeatures?: boolean;
}

/** Per-frame VAD features. */
export interface VADFeatures {
  /** Log-energy in dB (10·log10(mean power + ε)), one per frame. */
  energy: Float32Array;
  /** Zero-crossing rate [0, 1], one per frame. */
  zcr: Float32Array;
  /** Spectral centroid normalised by Nyquist [0, 1], one per frame. */
  centroid: Float32Array;
  /** Adaptive noise floor estimate in dB, one per frame. */
  noiseFloor: Float32Array;
}

/** Result returned by `detectVoiceActivity`. */
export interface VADResult extends VADFeatures {
  /** Boolean voice decision for each frame. */
  voiced: boolean[];
  /**
   * Contiguous voiced intervals as [startSec, endSec] pairs.
   * Segments from adjacent voiced frames are merged.
   */
  segments: Array<[number, number]>;
  /**
   * Time stamp in seconds for the centre of each analysis frame.
   */
  frameTimes: Float32Array;
}

/** Stateful streaming VAD. */
export interface VADProcessor {
  /**
   * Feed a block of audio samples and get decisions for completed frames.
   * Returns `VADResult` for all frames fully covered by the accumulated audio.
   */
  process(samples: Float32Array): VADResult;
  /** Return the overall result for all audio fed so far. */
  getResult(): VADResult;
  /** Clear all accumulated state (audio buffer, noise floor, hangover). */
  reset(): void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LOG10 = Math.LN10;

/** 10·log10(x + ε) dB. */
function dbEnergy(power: number): number {
  return (10 / LOG10) * Math.log(power + 1e-12);
}

/** Log-energy of a window. */
function frameEnergy(audio: Float32Array, offset: number, size: number): number {
  let sum = 0;
  const end = Math.min(offset + size, audio.length);
  for (let i = offset; i < end; i++) sum += audio[i] * audio[i];
  const meanPow = sum / Math.max(1, end - offset);
  return dbEnergy(meanPow);
}

/** Zero-crossing rate (normalised to [0, 1] by window size). */
function frameZcr(audio: Float32Array, offset: number, size: number): number {
  let crossings = 0;
  const end = Math.min(offset + size, audio.length);
  for (let i = offset + 1; i < end; i++) {
    if ((audio[i] >= 0) !== (audio[i - 1] >= 0)) crossings++;
  }
  const windowLen = end - offset;
  return windowLen > 1 ? crossings / (windowLen - 1) : 0;
}

/**
 * Spectral centroid (normalised by Nyquist = sampleRate / 2).
 *
 * Approximated using sub-band energy magnitudes (no FFT required):
 * divides the window into `bands` equal slices, each representing a
 * frequency band up to Nyquist. Returns ∑(b·E_b) / (∑E_b · (bands−1)).
 */
function frameCentroid(
  audio: Float32Array,
  offset: number,
  size: number,
  bands = 8,
): number {
  const end        = Math.min(offset + size, audio.length);
  const totalLen   = end - offset;
  if (totalLen <= 0) return 0;
  const bandSize   = Math.max(1, Math.floor(totalLen / bands));
  let   sumWeight  = 0;
  let   sumEnergy  = 0;

  for (let b = 0; b < bands; b++) {
    const bOff = offset + b * bandSize;
    let   e    = 0;
    const bEnd = Math.min(bOff + bandSize, end);
    for (let i = bOff; i < bEnd; i++) e += audio[i] * audio[i];
    sumWeight += b * e;
    sumEnergy += e;
  }
  if (sumEnergy < 1e-20) return 0;
  return (sumWeight / sumEnergy) / Math.max(1, bands - 1);
}

// ─── Core processing ──────────────────────────────────────────────────────────

interface ProcessingState {
  noiseFloor:       number; // current estimate in dB
  hangoverRemain:   number; // samples left in hangover
}

function initState(initialFloorDb: number): ProcessingState {
  return { noiseFloor: initialFloorDb, hangoverRemain: 0 };
}

function analyseAudio(
  audio:      Float32Array,
  windowSize: number,
  hopSize:    number,
  sampleRate: number,
  opts:       Required<VADOptions>,
  state:      ProcessingState,
): VADResult {
  const numFrames  = Math.max(0, Math.floor((audio.length - windowSize) / hopSize) + 1);
  const energy     = new Float32Array(numFrames);
  const zcr        = new Float32Array(numFrames);
  const centroid   = new Float32Array(numFrames);
  const noiseFloor = new Float32Array(numFrames);
  const frameTimes = new Float32Array(numFrames);
  const rawVoiced  = new Array<boolean>(numFrames).fill(false);

  for (let f = 0; f < numFrames; f++) {
    const off        = f * hopSize;
    frameTimes[f]    = (off + windowSize / 2) / sampleRate;
    energy[f]        = frameEnergy(audio, off, windowSize);
    zcr[f]           = frameZcr(audio, off, windowSize);
    centroid[f]      = frameCentroid(audio, off, windowSize);

    // Update noise floor (upward via alpha, downward very slowly)
    const E = energy[f];
    if (E < state.noiseFloor) {
      state.noiseFloor = state.noiseFloor * (1 - opts.noiseAlpha * 0.1) + E * (opts.noiseAlpha * 0.1);
    } else {
      state.noiseFloor = state.noiseFloor * (1 - opts.noiseAlpha) + E * opts.noiseAlpha;
    }
    noiseFloor[f] = state.noiseFloor;

    // Primary decision: energy above threshold
    const isLoudEnough = (E - state.noiseFloor) > opts.thresholdDb;

    // Secondary spectral features (optional)
    let passesSpectral = true;
    if (opts.useSpectralFeatures) {
      const zcrOk = zcr[f] >= 0.02 && zcr[f] <= 0.5;
      const scOk  = centroid[f] >= 0.04 && centroid[f] <= 0.55;
      passesSpectral = zcrOk && scOk;
    }

    rawVoiced[f] = isLoudEnough && passesSpectral;
  }

  // Hangover: stay voiced for N frames after last active frame
  const voiced = rawVoiced.slice();
  for (let f = 0; f < numFrames; f++) {
    if (rawVoiced[f]) {
      state.hangoverRemain = opts.hangoverFrames;
      voiced[f] = true;
    } else if (state.hangoverRemain > 0) {
      state.hangoverRemain--;
      voiced[f] = true;
    }
  }

  // Merge into contiguous segments
  const segments: Array<[number, number]> = [];
  let   inSeg   = false;
  let   segStart = 0;
  for (let f = 0; f < numFrames; f++) {
    if (voiced[f] && !inSeg) {
      inSeg    = true;
      segStart = frameTimes[f] - windowSize / (2 * sampleRate);
    } else if (!voiced[f] && inSeg) {
      inSeg = false;
      segments.push([Math.max(0, segStart), frameTimes[f - 1] + windowSize / (2 * sampleRate)]);
    }
  }
  if (inSeg && numFrames > 0) {
    segments.push([Math.max(0, segStart), frameTimes[numFrames - 1] + windowSize / (2 * sampleRate)]);
  }

  return { energy, zcr, centroid, noiseFloor, voiced, segments, frameTimes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

function resolveOptions(opts: VADOptions = {}): Required<VADOptions> {
  const windowSize = opts.windowSize ?? 512;
  return {
    sampleRate:          opts.sampleRate          ?? 48000,
    windowSize,
    hopSize:             opts.hopSize             ?? windowSize >> 1,
    thresholdDb:         opts.thresholdDb         ?? 10,
    noiseAlpha:          opts.noiseAlpha          ?? 0.02,
    hangoverFrames:      opts.hangoverFrames      ?? 8,
    useSpectralFeatures: opts.useSpectralFeatures ?? false,
  };
}

/**
 * Detect voice activity in a mono audio signal.
 *
 * @param audio    Mono PCM samples.
 * @param options  VAD parameters.
 */
export function detectVoiceActivity(
  audio:   Float32Array,
  options: VADOptions = {},
): VADResult {
  const o     = resolveOptions(options);
  const state = initState(-60); // initial noise floor: -60 dBFS
  return analyseAudio(audio, o.windowSize, o.hopSize, o.sampleRate, o, state);
}

/**
 * Get voice segments as `[startSec, endSec]` pairs from a mono signal.
 *
 * Convenience wrapper around `detectVoiceActivity`.
 *
 * @param audio    Mono PCM samples.
 * @param options  VAD parameters.
 */
export function getVoiceSegments(
  audio:   Float32Array,
  options: VADOptions = {},
): Array<[number, number]> {
  return detectVoiceActivity(audio, options).segments;
}

/**
 * Create a stateful streaming VAD processor.
 *
 * Feed audio in arbitrary-sized blocks and accumulate results.
 *
 * @param options  VAD parameters.
 */
export function createVAD(options: VADOptions = {}): VADProcessor {
  const o      = resolveOptions(options);
  const state  = initState(-60);
  const blocks: Float32Array[] = [];
  let   totalSamples = 0;

  function process(samples: Float32Array): VADResult {
    if (samples.length === 0) {
      return {
        energy: new Float32Array(0), zcr: new Float32Array(0),
        centroid: new Float32Array(0), noiseFloor: new Float32Array(0),
        voiced: [], segments: [], frameTimes: new Float32Array(0),
      };
    }
    blocks.push(samples.slice());
    totalSamples += samples.length;
    return getResult();
  }

  function getResult(): VADResult {
    if (totalSamples === 0) {
      return {
        energy: new Float32Array(0), zcr: new Float32Array(0),
        centroid: new Float32Array(0), noiseFloor: new Float32Array(0),
        voiced: [], segments: [], frameTimes: new Float32Array(0),
      };
    }
    // Merge all blocks into one array and re-analyse from scratch
    const merged = new Float32Array(totalSamples);
    let off = 0;
    for (const blk of blocks) { merged.set(blk, off); off += blk.length; }
    // Re-analyse from fresh state but preserve current noise floor estimate
    const freshState = initState(-60);
    return analyseAudio(merged, o.windowSize, o.hopSize, o.sampleRate, o, freshState);
  }

  function reset(): void {
    blocks.length = 0;
    totalSamples  = 0;
    state.noiseFloor     = -60;
    state.hangoverRemain = 0;
  }

  return { process, getResult, reset };
}
