/**
 * Artone v3 — EBU R128 / ITU-R BS.1770-4 Loudness Meter
 *
 * Computes programme loudness measurements per EBU R128:
 *   - Momentary loudness (M): 400 ms rectangular window, LUFS
 *   - Short-term loudness (S): 3 s rectangular window, LUFS
 *   - Integrated loudness (I): gated mean over the full programme, LUFS
 *   - Loudness Range (LRA): 10th–95th percentile of gated short-term values, LU
 *   - Sample Peak: maximum |sample| across all channels, dBFS
 *
 * K-weighting is applied as two cascaded biquad filters:
 *   - Stage 1: parametric high-shelf pre-filter (~+4 dB above ~1.7 kHz)
 *   - Stage 2: RLB high-pass filter (fc ≈ 38 Hz)
 * Coefficients are derived via bilinear transform for any sample rate.
 *
 * Note: True Peak (dBTP) per BS.1770-4 Annex 2 requires 4× oversampled
 * sinc interpolation. This module returns `samplePeak` instead. Inter-sample
 * peaks may be up to ~0.5 dBTP higher than the sample peak.
 *
 * References:
 *   - ITU-R BS.1770-4 (2015) "Algorithms to measure audio programme
 *     loudness and true-peak audio level"
 *   - EBU Tech 3341-2020 "Loudness Metering: R128"
 *   - Teboul (2011) libebur128 (bilinear transform implementation)
 *
 * # AI generated (reviewed)
 */

import {
  type BiquadCoeffs,
  type BiquadState,
  processSample,
  applyFilter,
  makeState,
} from './biquad-filter';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { BiquadCoeffs };

/** EBU R128 loudness measurement result. */
export interface LoudnessMeasurement {
  /** Momentary loudness (M): most recent 400 ms window, LUFS. */
  momentary: number;
  /** Short-term loudness (S): most recent 3 s window, LUFS. */
  shortTerm: number;
  /** Integrated (gated programme) loudness (I), LUFS. */
  integrated: number;
  /** Loudness Range (LRA), LU. */
  loudnessRange: number;
  /** Sample-peak level across all channels, dBFS. */
  samplePeak: number;
}

/** Streaming loudness meter. */
export interface LoudnessMeter {
  /** Feed a block of multi-channel samples (any block size). */
  process(channels: Float32Array[]): void;
  /** Return current measurements from accumulated data. */
  getMeasurement(): LoudnessMeasurement;
  /** Reset all accumulators and filter state. */
  reset(): void;
}

// ─── K-weighting filter coefficients ─────────────────────────────────────────

/** Channel gain weights per BS.1770-4 Table 1 (order: L R C Ls Rs). */
const CHANNEL_G = [1, 1, 1, 1.41, 1.41] as const;

/**
 * Compute K-weighting biquad coefficients for the given sample rate.
 *
 * Returns `[preFilter, rlbFilter]` per BS.1770-4 Annex 1:
 *   - `preFilter`: Stage 1 parametric high-shelf.
 *   - `rlbFilter`: Stage 2 RLB high-pass (2nd-order, fc ≈ 38 Hz).
 *
 * Algorithm: bilinear transform of the analog prototype (libebur128, Teboul 2011).
 */
export function kWeightingCoeffs(sampleRate: number): [BiquadCoeffs, BiquadCoeffs] {
  // Stage 1: parametric pre-filter (bilinear transform)
  const f1 = 1681.974450955533;
  const G  = 3.999843853973347;   // shelf gain, dB
  const Q1 = 0.7071752369554196;
  const K1 = Math.tan(Math.PI * f1 / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const d1 = 1 + K1 / Q1 + K1 * K1;
  const pre: BiquadCoeffs = {
    b0: (Vh + Vb * K1 / Q1 + K1 * K1) / d1,
    b1: 2 * (K1 * K1 - Vh) / d1,
    b2: (Vh - Vb * K1 / Q1 + K1 * K1) / d1,
    a1: 2 * (K1 * K1 - 1) / d1,
    a2: (1 - K1 / Q1 + K1 * K1) / d1,
  };

  // Stage 2: RLB high-pass
  const f2 = 38.13547087602444;
  const Q2 = 0.5003270373238773;
  const K2 = Math.tan(Math.PI * f2 / sampleRate);
  const d2 = 1 + K2 / Q2 + K2 * K2;
  const rlb: BiquadCoeffs = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: 2 * (K2 * K2 - 1) / d2,
    a2: (1 - K2 / Q2 + K2 * K2) / d2,
  };

  return [pre, rlb];
}

/**
 * Apply K-weighting (both filter stages) to a single-channel signal.
 *
 * @param data        Mono PCM samples (±1 normalised).
 * @param sampleRate  Sample rate in Hz.
 */
export function kWeightChannel(data: Float32Array, sampleRate: number): Float32Array {
  const [pre, rlb] = kWeightingCoeffs(sampleRate);
  const { output: stage1 } = applyFilter(pre, data);
  const { output: stage2 } = applyFilter(rlb, stage1);
  return stage2;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert a channel-weighted mean square to LUFS.
 * Returns -Infinity for silence.
 */
function toL(z: number): number {
  return z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity;
}

/**
 * Compute per-hop mean squares from a K-weighted mono signal.
 * Each element corresponds to one `hopSamples`-long block.
 */
function computeHopBlocks(kw: Float32Array, hopSamples: number): Float32Array {
  const n = Math.floor(kw.length / hopSamples);
  const out = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let sum = 0;
    const start = b * hopSamples;
    const end   = start + hopSamples;
    for (let i = start; i < end; i++) sum += kw[i] * kw[i];
    out[b] = sum / hopSamples;
  }
  return out;
}

/**
 * Compute LUFS from an array of overlapping window Z values using EBU gating.
 * Applies absolute gate (−70 LUFS) then relative gate (ungated mean − 10 LU).
 */
function gatedLufs(windowZ: Float32Array): number {
  if (windowZ.length === 0) return -Infinity;

  const wL = Array.from(windowZ, toL);
  const ABS_GATE = -70;

  const aboveAbs: number[] = [];
  for (let i = 0; i < windowZ.length; i++) {
    if (wL[i] > ABS_GATE) aboveAbs.push(windowZ[i]);
  }
  if (aboveAbs.length === 0) return -Infinity;

  const ungated = aboveAbs.reduce((s, v) => s + v, 0) / aboveAbs.length;
  const relGate = toL(ungated) - 10;

  const aboveRel: number[] = [];
  for (let i = 0; i < windowZ.length; i++) {
    if (wL[i] > ABS_GATE && wL[i] > relGate) aboveRel.push(windowZ[i]);
  }
  if (aboveRel.length === 0) return -Infinity;

  return toL(aboveRel.reduce((s, v) => s + v, 0) / aboveRel.length);
}

// ─── Offline measurement ──────────────────────────────────────────────────────

/**
 * Measure EBU R128 loudness of a complete multi-channel programme.
 *
 * @param channels    Per-channel PCM data (Float32Array, ±1 normalised).
 *                    Channel order: L R C Ls Rs. LFE (index ≥ 5) is excluded.
 *                    At least one channel required; mono accepted.
 * @param sampleRate  Sample rate in Hz. Default: 48000.
 */
export function measureLoudness(
  channels: Float32Array[],
  sampleRate = 48000,
): LoudnessMeasurement {
  const silence = (): LoudnessMeasurement => ({
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    loudnessRange: 0,
    samplePeak: -Infinity,
  });

  if (channels.length === 0 || channels[0].length === 0) return silence();

  const hop   = Math.max(1, Math.round(sampleRate * 0.1));  // 100 ms
  const M_WIN = 4;   // 4 hops = 400 ms momentary window
  const S_WIN = 30;  // 30 hops = 3 s short-term window
  const numCh = Math.min(channels.length, 5);

  // K-weight each channel and compute hop-block mean squares
  const chBlocks: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) {
    chBlocks.push(computeHopBlocks(kWeightChannel(channels[ch], sampleRate), hop));
  }

  const N = chBlocks[0].length;
  if (N === 0) return silence();

  // Channel-weighted combined block Z (one value per 100 ms hop)
  const blockZ = new Float32Array(N);
  for (let b = 0; b < N; b++) {
    let z = 0;
    for (let ch = 0; ch < numCh; ch++) z += CHANNEL_G[ch] * chBlocks[ch][b];
    blockZ[b] = z;
  }

  // Momentary: mean of last min(M_WIN, N) blocks
  const mStart = Math.max(0, N - M_WIN);
  let mSum = 0;
  for (let i = mStart; i < N; i++) mSum += blockZ[i];
  const momentary = toL(mSum / (N - mStart));

  // Short-term: mean of last min(S_WIN, N) blocks
  const sStart = Math.max(0, N - S_WIN);
  let sSum = 0;
  for (let i = sStart; i < N; i++) sSum += blockZ[i];
  const shortTerm = toL(sSum / (N - sStart));

  // Integrated: overlapping 400 ms windows (hop = 100 ms), then EBU gating
  const windowCount = Math.max(0, N - M_WIN + 1);
  const windowZ = new Float32Array(windowCount);
  for (let b = 0; b < windowCount; b++) {
    let z = 0;
    for (let j = b; j < b + M_WIN; j++) z += blockZ[j];
    windowZ[b] = z / M_WIN;
  }
  const integrated = gatedLufs(windowZ);

  // LRA: sliding 3 s windows, gate at −20 LUFS, 10th–95th percentile
  const stCount = Math.max(0, N - S_WIN + 1);
  const stLufs: number[] = [];
  for (let b = 0; b < stCount; b++) {
    let z = 0;
    for (let j = b; j < b + S_WIN; j++) z += blockZ[j];
    stLufs.push(toL(z / S_WIN));
  }

  let loudnessRange = 0;
  const gatedST = stLufs.filter(l => l > -20 && isFinite(l)).sort((a, b) => a - b);
  if (gatedST.length >= 2) {
    const p10 = gatedST[Math.floor(gatedST.length * 0.10)];
    const p95 = gatedST[Math.floor(gatedST.length * 0.95)];
    loudnessRange = Math.max(0, p95 - p10);
  }

  // Sample peak
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const abs = Math.abs(ch[i]);
      if (abs > peak) peak = abs;
    }
  }
  const samplePeak = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

  return { momentary, shortTerm, integrated, loudnessRange, samplePeak };
}

// ─── Streaming meter ─────────────────────────────────────────────────────────

/**
 * Create a streaming EBU R128 loudness meter.
 *
 * Feed audio blocks of any length using `process()`. The meter maintains
 * K-weighting filter state across calls for correct continuous measurement.
 *
 * @param sampleRate  Sample rate in Hz. Default: 48000.
 */
export function createLoudnessMeter(sampleRate = 48000): LoudnessMeter {
  const hop     = Math.max(1, Math.round(sampleRate * 0.1));
  const MAX_N   = 300;  // 30 s history (300 × 100 ms hops)
  const M_WIN   = 4;
  const S_WIN   = 30;
  const [pre, rlb] = kWeightingCoeffs(sampleRate);

  // Per-channel biquad states (pre-filter + RLB, one BiquadState each)
  let preStates: BiquadState[]  = [];
  let rlbStates: BiquadState[]  = [];

  // Ring buffer of combined block Z values
  const blockZ: number[] = [];

  // Current 100 ms hop accumulator
  let hopSum   = 0;
  let hopCount = 0;

  // Sample peak across all processed samples
  let peak = 0;

  function ensureChannels(n: number): void {
    while (preStates.length < n) { preStates.push(makeState()); rlbStates.push(makeState()); }
  }

  return {
    process(channels: Float32Array[]): void {
      if (channels.length === 0 || channels[0].length === 0) return;
      const numCh = Math.min(channels.length, 5);
      ensureChannels(numCh);

      const L = channels[0].length;
      for (let i = 0; i < L; i++) {
        let z = 0;
        for (let ch = 0; ch < numCh; ch++) {
          const x = channels[ch][i];
          const abs = Math.abs(x);
          if (abs > peak) peak = abs;
          const y1 = processSample(pre, preStates[ch], x);
          const y2 = processSample(rlb, rlbStates[ch], y1);
          z += CHANNEL_G[ch] * y2 * y2;
        }
        hopSum += z;
        hopCount++;
        if (hopCount >= hop) {
          blockZ.push(hopSum / hop);
          if (blockZ.length > MAX_N) blockZ.shift();
          hopSum   = 0;
          hopCount = 0;
        }
      }
    },

    getMeasurement(): LoudnessMeasurement {
      const N = blockZ.length;
      if (N === 0) {
        return {
          momentary: -Infinity,
          shortTerm: -Infinity,
          integrated: -Infinity,
          loudnessRange: 0,
          samplePeak: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
        };
      }

      const mStart = Math.max(0, N - M_WIN);
      let mSum = 0;
      for (let i = mStart; i < N; i++) mSum += blockZ[i];
      const momentary = toL(mSum / (N - mStart));

      const sStart = Math.max(0, N - S_WIN);
      let sSum = 0;
      for (let i = sStart; i < N; i++) sSum += blockZ[i];
      const shortTerm = toL(sSum / (N - sStart));

      const windowCount = Math.max(0, N - M_WIN + 1);
      const windowZ = new Float32Array(windowCount);
      for (let b = 0; b < windowCount; b++) {
        let z = 0;
        for (let j = b; j < b + M_WIN; j++) z += blockZ[j];
        windowZ[b] = z / M_WIN;
      }
      const integrated = gatedLufs(windowZ);

      const stCount = Math.max(0, N - S_WIN + 1);
      const stLufs: number[] = [];
      for (let b = 0; b < stCount; b++) {
        let z = 0;
        for (let j = b; j < b + S_WIN; j++) z += blockZ[j];
        stLufs.push(toL(z / S_WIN));
      }

      let loudnessRange = 0;
      const gatedST = stLufs.filter(l => l > -20 && isFinite(l)).sort((a, b) => a - b);
      if (gatedST.length >= 2) {
        const p10 = gatedST[Math.floor(gatedST.length * 0.10)];
        const p95 = gatedST[Math.floor(gatedST.length * 0.95)];
        loudnessRange = Math.max(0, p95 - p10);
      }

      return {
        momentary,
        shortTerm,
        integrated,
        loudnessRange,
        samplePeak: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      };
    },

    reset(): void {
      preStates  = [];
      rlbStates  = [];
      blockZ.length = 0;
      hopSum   = 0;
      hopCount = 0;
      peak     = 0;
    },
  };
}
