/**
 * Artone v3 — Side-Chain Auto-Ducker
 *
 * Attenuates a background signal (BGM / ambience) whenever a primary signal
 * (dialogue / narration / vocals) is active. This is the "auto-ducking"
 * feature found in every professional NLE (DaVinci, Premiere, Final Cut Pro).
 *
 * Algorithm:
 *   1. Rolling RMS detection on the side-chain signal (dialogue track).
 *   2. Soft-knee mapping from RMS level to a target gain-reduction in dB.
 *   3. Attack / Hold / Release envelope smoothing:
 *      - Attack  : exponential approach to full duck while signal is active.
 *      - Hold    : sustain full duck for `holdSec` after signal falls silent.
 *      - Release : exponential recovery to 0 dB after hold expires.
 *   4. Apply per-sample linear gain to the main signal.
 *
 * All operations are O(N) in audio length, zero heap allocation per sample.
 *
 * References:
 *   - Zölzer U. (2011) "DAFX: Digital Audio Effects" — Dynamics Processing
 *   - Giannoulis D. et al. (2012) "Digital Dynamic Range Compressor Design"
 *     AES J., 60(6)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for `autoDuck` and `createAutoDucker`. */
export interface AutoDuckOptions {
  /** Sample rate in Hz. Default: 48000. */
  sampleRate?: number;
  /**
   * Side-chain RMS threshold in dBFS. When the dialogue level exceeds this,
   * ducking activates. Default: -40 dB.
   */
  thresholdDb?: number;
  /**
   * Maximum gain reduction applied to the main signal in dB (negative value).
   * Default: -12 dB.
   */
  duckDb?: number;
  /**
   * Attack time constant in seconds: how quickly the duck ramps down.
   * Default: 0.01 s (10 ms).
   */
  attackSec?: number;
  /**
   * Hold time in seconds: how long to sustain the duck after the side-chain
   * falls below threshold before releasing. Default: 0.3 s.
   */
  holdSec?: number;
  /**
   * Release time constant in seconds: how quickly the gain recovers.
   * Default: 0.5 s.
   */
  releaseSec?: number;
  /**
   * Side-chain RMS analysis window in seconds. Default: 0.03 s (30 ms).
   */
  windowSec?: number;
  /**
   * Soft-knee width in dB around the threshold. Default: 6 dB.
   */
  kneeDb?: number;
}

/** Result returned by `autoDuck`. */
export interface AutoDuckResult {
  /** Attenuated main signal (same length as input). */
  mainOut: Float32Array;
  /**
   * Per-sample gain applied to mainOut, in dB (always ≤ 0).
   * Useful for waveform visualisation or further processing.
   */
  gainDb: Float32Array;
}

/** Stateful streaming auto-ducker. */
export interface AutoDucker {
  /**
   * Process one block of audio. Both arrays must have the same length.
   * @param main       Background track (BGM / ambience) to duck.
   * @param sideChain  Dialogue / narration track driving the gate.
   * @returns          `AutoDuckResult` for this block.
   */
  process(main: Float32Array, sideChain: Float32Array): AutoDuckResult;
  /** Reset all accumulated state (gain envelope, hold counter, RMS window). */
  reset(): void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LN10_20 = Math.LN10 / 20; // factor to convert dB → neper for exp

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Convert dB to linear amplitude. */
function dbToLin(db: number): number {
  return Math.exp(db * LN10_20);
}

/** Convert linear amplitude to dBFS, floored at -144 dBFS. */
function linToDb(lin: number): number {
  if (lin <= 1e-7) return -144;
  return Math.log(lin) / LN10_20;
}

/**
 * Compute a one-pole smoothing coefficient for a given time constant.
 * alpha = exp(-1 / (timeSec * sampleRate))
 * When applied as: state = alpha * state + (1 - alpha) * target
 * the state reaches ~63 % of target in `timeSec` seconds.
 */
function smoothCoeff(timeSec: number, sampleRate: number): number {
  if (timeSec <= 0) return 0; // instantaneous
  return Math.exp(-1 / (timeSec * sampleRate));
}

/**
 * Soft-knee target gain mapping.
 *
 * Returns the target gain reduction in dB (≤ 0) given an instantaneous
 * level estimate and the configured threshold, duckDb, and knee width.
 */
function softKneeGainDb(
  levelDb: number,
  thresholdDb: number,
  duckDb: number,
  kneeDb: number,
): number {
  const halfKnee = kneeDb / 2;
  const lo = thresholdDb - halfKnee;
  const hi = thresholdDb + halfKnee;

  if (levelDb <= lo) return 0;           // below knee → no duck
  if (levelDb >= hi) return duckDb;      // above knee → full duck

  // Inside knee: quadratic interpolation
  const t = (levelDb - lo) / kneeDb;    // 0 → 1
  return duckDb * t * t;
}

// ─── Core processor (shared by batch and streaming) ──────────────────────────

/**
 * Internal per-sample processor that maintains all mutable state.
 */
interface DuckState {
  // RMS window
  windowSamples: number;
  sumSq: number;
  ringBuf: Float32Array;
  ringPos: number;
  // Gain envelope
  currentGainDb: number;
  holdSamplesLeft: number;
  // Config (pre-computed)
  thresholdDb: number;
  duckDb: number;
  kneeDb: number;
  alphaAttack: number;
  alphaRelease: number;
  holdSamples: number;
}

function makeDuckState(
  sampleRate: number,
  opts: Required<AutoDuckOptions>,
): DuckState {
  const windowSamples = Math.max(1, Math.round(opts.windowSec * sampleRate));
  return {
    windowSamples,
    sumSq:     0,
    ringBuf:   new Float32Array(windowSamples),
    ringPos:   0,
    currentGainDb: 0,
    holdSamplesLeft: 0,
    thresholdDb: opts.thresholdDb,
    duckDb:       opts.duckDb,
    kneeDb:       opts.kneeDb,
    alphaAttack:  smoothCoeff(opts.attackSec,  sampleRate),
    alphaRelease: smoothCoeff(opts.releaseSec, sampleRate),
    holdSamples:  Math.max(0, Math.round(opts.holdSec * sampleRate)),
  };
}

function resetDuckState(st: DuckState): void {
  st.sumSq  = 0;
  st.ringBuf.fill(0);
  st.ringPos = 0;
  st.currentGainDb = 0;
  st.holdSamplesLeft = 0;
}

/**
 * Process a single sample through the ducker.
 *
 * @param scSample   One sample from the side-chain signal.
 * @param st         Mutable processor state (mutated in place).
 * @returns          Gain in dB to apply to the corresponding main sample.
 */
function processSample(scSample: number, st: DuckState): number {
  // 1. Update rolling RMS sum (ring buffer)
  const outgoing  = st.ringBuf[st.ringPos];
  const incoming  = scSample * scSample;
  st.sumSq = Math.max(0, st.sumSq - outgoing + incoming);
  st.ringBuf[st.ringPos] = incoming;
  st.ringPos = (st.ringPos + 1) % st.windowSamples;

  const rms     = Math.sqrt(st.sumSq / st.windowSamples);
  const levelDb = linToDb(rms);

  // 2. Compute target gain
  const targetDb = softKneeGainDb(
    levelDb, st.thresholdDb, st.duckDb, st.kneeDb,
  );
  const isActive = targetDb < -0.001; // side-chain is driving a duck

  // 3. Attack / Hold / Release envelope
  if (isActive) {
    // Attack phase: ramp toward full duck
    st.currentGainDb = st.alphaAttack * st.currentGainDb + (1 - st.alphaAttack) * targetDb;
    st.holdSamplesLeft = st.holdSamples;
  } else if (st.holdSamplesLeft > 0) {
    // Hold phase: sustain current gain
    st.holdSamplesLeft--;
  } else {
    // Release phase: ramp back to 0 dB
    st.currentGainDb = st.alphaRelease * st.currentGainDb;
    // Clamp to avoid negative floating-point artefacts when nearly zero
    if (st.currentGainDb > -1e-6) st.currentGainDb = 0;
  }

  return st.currentGainDb;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve options, filling in defaults.
 */
function resolveOptions(opts: AutoDuckOptions = {}): Required<AutoDuckOptions> {
  return {
    sampleRate:   opts.sampleRate   ?? 48000,
    thresholdDb:  opts.thresholdDb  ?? -40,
    duckDb:       opts.duckDb       ?? -12,
    attackSec:    opts.attackSec    ?? 0.01,
    holdSec:      opts.holdSec      ?? 0.3,
    releaseSec:   opts.releaseSec   ?? 0.5,
    windowSec:    opts.windowSec    ?? 0.03,
    kneeDb:       opts.kneeDb       ?? 6,
  };
}

/**
 * Compute the auto-duck gain envelope for a side-chain signal.
 *
 * Returns a Float32Array of per-sample gain in dB (≤ 0).
 *
 * @param sideChain  Dialogue / narration signal.
 * @param options    Detection and envelope parameters.
 */
export function computeDuckGain(
  sideChain: Float32Array,
  options: AutoDuckOptions = {},
): Float32Array {
  const o  = resolveOptions(options);
  const st = makeDuckState(o.sampleRate, o);
  const gainDb = new Float32Array(sideChain.length);
  for (let i = 0; i < sideChain.length; i++) {
    gainDb[i] = processSample(sideChain[i], st);
  }
  return gainDb;
}

/**
 * Apply a pre-computed gain envelope (in dB) to a main signal.
 *
 * @param main    Background track to attenuate.
 * @param gainDb  Per-sample gain in dB (same length as `main`).
 * @returns       Attenuated copy of `main`.
 */
export function applyDuckGain(main: Float32Array, gainDb: Float32Array): Float32Array {
  const n   = Math.min(main.length, gainDb.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = main[i] * dbToLin(gainDb[i]);
  }
  return out;
}

/**
 * Perform auto-ducking in a single batch call.
 *
 * @param main       Background track (BGM / ambience).
 * @param sideChain  Dialogue / narration driving the gate (same length as `main`).
 * @param options    Detection and envelope parameters.
 */
export function autoDuck(
  main: Float32Array,
  sideChain: Float32Array,
  options: AutoDuckOptions = {},
): AutoDuckResult {
  const gainDb = computeDuckGain(sideChain, options);
  const mainOut = applyDuckGain(main, gainDb);
  return { mainOut, gainDb };
}

/**
 * Create a stateful streaming auto-ducker.
 *
 * Process audio in arbitrary-sized blocks by calling `process()` per block.
 * The gain envelope state (attack/hold/release) persists across blocks.
 *
 * @param options  Detection and envelope parameters.
 */
export function createAutoDucker(options: AutoDuckOptions = {}): AutoDucker {
  const o  = resolveOptions(options);
  const st = makeDuckState(o.sampleRate, o);

  function process(main: Float32Array, sideChain: Float32Array): AutoDuckResult {
    const n      = Math.min(main.length, sideChain.length);
    const gainDb = new Float32Array(n);
    const mainOut = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const g = processSample(sideChain[i], st);
      gainDb[i]  = g;
      mainOut[i] = main[i] * dbToLin(g);
    }
    return { mainOut, gainDb };
  }

  function reset(): void {
    resetDuckState(st);
  }

  return { process, reset };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Compute the RMS level of a signal in dBFS.
 *
 * @param audio   Input signal.
 * @param start   Start sample index. Default: 0.
 * @param end     End sample index (exclusive). Default: audio.length.
 */
export function rmsDb(audio: Float32Array, start = 0, end?: number): number {
  const to = end ?? audio.length;
  let sum  = 0;
  for (let i = start; i < to; i++) sum += audio[i] * audio[i];
  const rms = Math.sqrt(sum / Math.max(1, to - start));
  return linToDb(rms);
}
