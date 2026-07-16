/**
 * Dynamics processing — compressor / limiter / gate / expander
 *
 * Pure TypeScript, no Web Audio API. Implements a standard feed-forward
 * peak-detection compressor architecture (full-wave rectify — faster,
 * more transient-sensitive ballistics than RMS detection; see
 * applyCompressor's detector comment) used in professional audio tools.
 * All parameters match Web Audio API DynamicsCompressorNode conventions
 * for interoperability.
 *
 * References:
 *   - Zölzer, "DAFX" (2nd ed.) §2.2 Dynamics
 *   - Giannoulis et al. (2012) "Digital Dynamic Range Compressor Design"
 *   - JUCE AudioProcessorValueTreeState conventions
 *
 * Usage:
 *   const comp = makeCompressor({ threshold: -20, ratio: 4, attack: 10, release: 100, knee: 6 });
 *   const { output, gainReductionDb } = applyDynamics(comp, monoSignal, 48000);
 */

// ============================================================
// Types
// ============================================================

export interface CompressorParams {
  /** Threshold in dBFS (default −24). */
  threshold?: number;
  /** Compression ratio (1 = bypass, ∞ = limiter, default 4). */
  ratio?: number;
  /** Attack time in milliseconds (default 10). */
  attackMs?: number;
  /** Release time in milliseconds (default 100). */
  releaseMs?: number;
  /** Soft-knee width in dB — 0 = hard knee (default 6). */
  kneeDb?: number;
  /** Output make-up gain in dB (default 0). */
  makeupDb?: number;
}

export interface GateParams {
  /** Open threshold in dBFS (default −40). */
  threshold?: number;
  /** Gate ratio below threshold (0 = closed, 1 = open, default 0). */
  ratio?: number;
  /** Attack in milliseconds (default 1). */
  attackMs?: number;
  /** Release in milliseconds (default 50). */
  releaseMs?: number;
  /** Hold in milliseconds — keeps gate open after signal drops below threshold (default 0). */
  holdMs?: number;
}

/** Returned per-sample gain-reduction envelope (0 dB = no reduction). */
export interface DynamicsResult {
  output: Float32Array;
  /** Gain reduction in dB per sample (always ≤ 0). */
  gainReductionDb: Float32Array;
}

// ============================================================
// Compressor / Limiter
// ============================================================

/**
 * Processes a mono Float32Array through an analog-style compressor.
 * Uses feed-forward peak (full-wave rectified) level detection with smooth
 * attack/release (Giannoulis 2012 — the "smooth branching" gain computer).
 * Peak detection reacts to instantaneous level rather than average energy,
 * so ballistics are faster/more transient-sensitive than an RMS detector.
 */
export function applyCompressor(
  input: Float32Array,
  sampleRate: number,
  params: CompressorParams = {}
): DynamicsResult {
  const T   = params.threshold  ?? -24;   // dBFS
  const R   = Math.max(1, params.ratio ?? 4);
  const aMs = Math.max(0, params.attackMs  ?? 10);
  const rMs = Math.max(0, params.releaseMs ?? 100);
  const W   = Math.max(0, params.kneeDb   ?? 6);
  const makeupLin = dbToLin(params.makeupDb ?? 0);

  // Time constants for first-order IIR smoother
  const alphaA = aMs > 0 ? Math.exp(-1 / (sampleRate * aMs * 0.001)) : 0;
  const alphaR = rMs > 0 ? Math.exp(-1 / (sampleRate * rMs * 0.001)) : 0;

  const output        = new Float32Array(input.length);
  const gainReduction = new Float32Array(input.length);
  let envLin = 0; // smoothed level envelope (linear)

  for (let i = 0; i < input.length; i++) {
    const x = input[i];

    // Detector: full-wave rectify (peak mode)
    const xAbs = Math.abs(x);

    // Smooth envelope with branching attack/release
    if (xAbs > envLin) {
      envLin = alphaA * envLin + (1 - alphaA) * xAbs;
    } else {
      envLin = alphaR * envLin + (1 - alphaR) * xAbs;
    }

    // Gain computer in log domain
    const xDb = linToDb(Math.max(envLin, 1e-30));
    const gcDb = gainComputeCompressor(xDb, T, R, W);

    gainReduction[i] = gcDb; // ≤ 0
    output[i] = x * dbToLin(gcDb) * makeupLin;
  }

  return { output, gainReductionDb: gainReduction };
}

/**
 * Processes a mono signal through a brick-wall limiter (ratio = ∞).
 * Uses lookahead-free peak limiting for simplicity.
 */
export function applyLimiter(
  input: Float32Array,
  sampleRate: number,
  params: { threshold?: number; releaseMs?: number } = {}
): DynamicsResult {
  return applyCompressor(input, sampleRate, {
    threshold:  params.threshold  ?? -1,
    ratio:      1000, // effectively ∞
    attackMs:   0,    // instantaneous (brick-wall)
    releaseMs:  params.releaseMs ?? 100,
    kneeDb:     0,    // hard knee
    makeupDb:   0,
  });
}

// ============================================================
// Gate / Expander
// ============================================================

/**
 * Processes a mono signal through a noise gate.
 * Gate opens when the signal exceeds `threshold` dBFS.
 */
export function applyGate(
  input: Float32Array,
  sampleRate: number,
  params: GateParams = {}
): DynamicsResult {
  const T   = params.threshold ?? -40;
  const R   = Math.max(0, Math.min(1, params.ratio ?? 0));
  const aMs = params.attackMs  ?? 1;
  const rMs = params.releaseMs ?? 50;
  const hMs = params.holdMs    ?? 0;

  const alphaA = aMs > 0 ? Math.exp(-1 / (sampleRate * aMs * 0.001)) : 0;
  const alphaR = rMs > 0 ? Math.exp(-1 / (sampleRate * rMs * 0.001)) : 0;
  const holdSamples = Math.round(sampleRate * hMs * 0.001);

  const output        = new Float32Array(input.length);
  const gainReduction = new Float32Array(input.length);

  let envLin  = 0;
  let gateGain = R;  // starts closed
  let holdCounter = 0;

  for (let i = 0; i < input.length; i++) {
    const xAbs = Math.abs(input[i]);

    // Level detection
    if (xAbs > envLin) {
      envLin = alphaA * envLin + (1 - alphaA) * xAbs;
    } else {
      envLin = alphaR * envLin + (1 - alphaR) * xAbs;
    }

    const xDb = linToDb(Math.max(envLin, 1e-30));
    const isOpen = xDb >= T;

    if (isOpen) {
      holdCounter = holdSamples;
      gateGain = alphaA * gateGain + (1 - alphaA) * 1;
    } else if (holdCounter > 0) {
      holdCounter--;
      // Keep current gain during hold
    } else {
      gateGain = alphaR * gateGain + (1 - alphaR) * R;
    }

    const grDb = 20 * Math.log10(Math.max(1e-30, gateGain));
    gainReduction[i] = Math.min(0, grDb);
    output[i] = input[i] * gateGain;
  }

  return { output, gainReductionDb: gainReduction };
}

// ============================================================
// Multi-band helpers
// ============================================================

/**
 * Applies the same compressor to all channels of a multi-channel signal.
 * Each channel is processed independently (standard stereo/surround behavior).
 */
export function applyCompressorMultichannel(
  channels: Float32Array[],
  sampleRate: number,
  params: CompressorParams = {}
): { channels: Float32Array[]; gainReductionDb: Float32Array } {
  if (channels.length === 0) {
    return { channels: [], gainReductionDb: new Float32Array(0) };
  }

  const results = channels.map((ch) => applyCompressor(ch, sampleRate, params));
  return {
    channels: results.map((r) => r.output),
    gainReductionDb: results[0].gainReductionDb, // return first channel's GR for metering
  };
}

// ============================================================
// Gain computer (static gain curve)
// ============================================================

/**
 * Computes the gain change in dB for a given input level using
 * a soft-knee compressor curve (Giannoulis 2012 Eq. 1).
 * Returns a value ≤ 0.
 */
export function gainComputeCompressor(
  xDb: number,
  threshold: number,
  ratio: number,
  kneeDb: number
): number {
  if (kneeDb > 0) {
    // Soft knee zone: [threshold - knee/2, threshold + knee/2]
    const kneeHalf = kneeDb / 2;
    const below = xDb - threshold + kneeHalf;
    if (below < 0) return 0;
    if (below < kneeDb) {
      // Interpolate within the knee using Giannoulis quadratic blend
      const slope = (1 / ratio - 1) / (2 * kneeDb);
      return slope * below * below;
    }
  } else {
    // Hard knee
    if (xDb <= threshold) return 0;
  }

  // Above threshold (or past knee)
  return (threshold - xDb) * (1 - 1 / ratio);
}

// ============================================================
// Utilities
// ============================================================

// Precomputed multiplier for dB→linear conversion: ln(10)/20.
// Math.exp is ~5-10× faster than Math.pow in V8 (native exp() fast path vs
// general pow()), which matters here because dbToLin() is called per sample
// inside applyCompressor()'s tight loop.
const _DB_TO_LIN_MUL = Math.LN10 / 20;

export function dbToLin(db: number): number {
  return Math.exp(db * _DB_TO_LIN_MUL);
}

export function linToDb(lin: number): number {
  return lin > 0 ? 20 * Math.log10(lin) : -Infinity;
}
