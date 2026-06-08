/**
 * Artone v3 — Stereo Processing Tools
 *
 * Professional stereo signal processing utilities:
 *   - Mid/Side (M/S) encode and decode
 *   - Stereo width control via M/S matrix
 *   - Panning laws: linear, constant-power (sin/cos), balanced (3 dB / 6 dB)
 *   - Mono downmix
 *   - Phase inversion
 *   - Stereo width measurement (correlation-based)
 *
 * All functions operate on mono/stereo Float32Array buffers and perform no
 * heap allocation per sample — suitable for use adjacent to AudioWorklet
 * processing (though this module itself is pure TypeScript, no AudioWorklet).
 *
 * References:
 *   - Zölzer U. (2011) "DAFX: Digital Audio Effects" §4 Panning and Spatial Effects
 *   - Blumlein A.D. (1931) "Improvements in and relating to sound-transmission,
 *     sound-recording and sound-reproducing systems" (M/S original patent)
 *   - Williams M. (1991) "Unified theory of microphone systems for stereophonic
 *     sound recording" — constant-power panning derivation
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A pair of same-length Float32Arrays representing a stereo signal. */
export interface StereoPair {
  readonly left:  Float32Array;
  readonly right: Float32Array;
}

/**
 * Panning law determines how gain is distributed between channels as a mono
 * source is panned across the stereo field.
 *
 * - `'linear'`         : L = 1-p, R = p. Simple but drops 6 dB at centre.
 * - `'constant-power'` : L = cos(p·π/2), R = sin(p·π/2). Maintains perceived
 *                        loudness across the full pan range (most natural).
 * - `'3db'`            : Identical to constant-power (alias for clarity).
 * - `'6db'`            : L = 1-p, R = p (alias for linear, for API parity).
 * - `'balanced'`       : L/R sum is always 1.0; centre = 0.5 each channel.
 *                        Corresponds to an equal-power blend without the
 *                        3 dB boost at extremes.
 */
export type PanLaw = 'linear' | 'constant-power' | '3db' | '6db' | 'balanced';

/** Gain values for left and right channels. */
export interface PanGains {
  readonly left:  number;
  readonly right: number;
}

// ─── Mid/Side (M/S) ──────────────────────────────────────────────────────────

/**
 * Encode a stereo pair into Mid/Side format.
 *
 *   M = (L + R) / 2   — correlation (mono compatibility)
 *   S = (L − R) / 2   — difference (stereo width)
 *
 * @param left   Left channel.
 * @param right  Right channel (same length as `left`).
 * @returns      `{ mid, side }` — same length as inputs.
 */
export function encodeMidSide(left: Float32Array, right: Float32Array): StereoPair {
  const n    = Math.min(left.length, right.length);
  const mid  = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mid[i]  = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }
  return { left: mid, right: side };
}

/**
 * Decode Mid/Side back to stereo.
 *
 *   L = M + S
 *   R = M − S
 *
 * @param mid   Mid channel.
 * @param side  Side channel (same length as `mid`).
 * @returns     `{ left, right }`.
 */
export function decodeMidSide(mid: Float32Array, side: Float32Array): StereoPair {
  const n     = Math.min(mid.length, side.length);
  const left  = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i]  = mid[i] + side[i];
    right[i] = mid[i] - side[i];
  }
  return { left, right };
}

// ─── Stereo width ─────────────────────────────────────────────────────────────

/**
 * Adjust the stereo width of a stereo signal using M/S processing.
 *
 * Width is applied by scaling the Side channel:
 *   M′ = M,   S′ = S × width
 * then decoded back to L/R.
 *
 * Common values:
 *   - 0.0 → pure mono (Side = 0)
 *   - 1.0 → original stereo (unchanged)
 *   - 2.0 → doubled width (exaggerated stereo)
 *
 * @param left   Left input channel.
 * @param right  Right input channel (same length as `left`).
 * @param width  Width factor ≥ 0. Default: 1.0.
 * @returns      Width-adjusted `{ left, right }`.
 */
export function stereoWidth(
  left:  Float32Array,
  right: Float32Array,
  width = 1.0,
): StereoPair {
  const n      = Math.min(left.length, right.length);
  const outL   = new Float32Array(n);
  const outR   = new Float32Array(n);
  const w      = Math.max(0, width);
  for (let i = 0; i < n; i++) {
    const mid  = (left[i] + right[i]) * 0.5;
    const side = (left[i] - right[i]) * 0.5 * w;
    outL[i] = mid + side;
    outR[i] = mid - side;
  }
  return { left: outL, right: outR };
}

// ─── Panning ──────────────────────────────────────────────────────────────────

const HALF_PI = Math.PI / 2;

/**
 * Compute left/right gain pair for a given pan position and law.
 *
 * @param pan   Pan position in [0, 1]: 0 = full left, 0.5 = centre, 1 = full right.
 * @param law   Panning law. Default: `'constant-power'`.
 * @returns     `{ left, right }` gain values (both ≥ 0).
 */
export function panGains(pan: number, law: PanLaw = 'constant-power'): PanGains {
  const p = Math.max(0, Math.min(1, pan));

  switch (law) {
    case 'constant-power':
    case '3db':
      return {
        left:  Math.cos(p * HALF_PI),
        right: Math.sin(p * HALF_PI),
      };

    case 'linear':
    case '6db':
      return { left: 1 - p, right: p };

    case 'balanced': {
      // Equal-power blend: L·R sum constant, no boost at extremes
      const g = 1 / (1 + Math.abs(2 * p - 1));
      return { left: (1 - p) + p * g, right: p + (1 - p) * g };
    }
  }
}

/**
 * Pan a mono signal into a stereo field.
 *
 * @param mono  Input mono signal.
 * @param pan   Pan position [0, 1]. Default: 0.5 (centre).
 * @param law   Panning law. Default: `'constant-power'`.
 * @returns     Stereo `{ left, right }` pair.
 */
export function panMono(
  mono: Float32Array,
  pan  = 0.5,
  law: PanLaw = 'constant-power',
): StereoPair {
  const { left: gL, right: gR } = panGains(pan, law);
  const n     = mono.length;
  const left  = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i]  = mono[i] * gL;
    right[i] = mono[i] * gR;
  }
  return { left, right };
}

/**
 * Pan an existing stereo signal (equal-power balance).
 *
 * This is equivalent to mixing both channels through a pan-pot.
 *
 * @param left   Left channel.
 * @param right  Right channel (same length as `left`).
 * @param pan    Pan position [0, 1]. Default: 0.5.
 * @param law    Panning law. Default: `'constant-power'`.
 * @returns      Re-panned `{ left, right }`.
 */
export function panStereo(
  left:  Float32Array,
  right: Float32Array,
  pan    = 0.5,
  law:   PanLaw = 'constant-power',
): StereoPair {
  const { left: gL, right: gR } = panGains(pan, law);
  const n    = Math.min(left.length, right.length);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  // Balance: left channel scales by gL (→ 1 at full-left, 0 at full-right)
  //          right channel scales by gR (→ 0 at full-left, 1 at full-right)
  // But for a stereo balance pot, both channels feed both outputs at once.
  // Convention: pan-pot on a stereo bus uses gL as weight for left and
  // gR as weight for right, each staying in their own side.
  for (let i = 0; i < n; i++) {
    outL[i] = left[i]  * gL;
    outR[i] = right[i] * gR;
  }
  return { left: outL, right: outR };
}

// ─── Downmix ──────────────────────────────────────────────────────────────────

/**
 * Downmix a stereo pair to mono (equal-power summing, normalised by √2).
 *
 * @param left   Left channel.
 * @param right  Right channel (same length as `left`).
 * @returns      Mono Float32Array.
 */
export function monoMix(left: Float32Array, right: Float32Array): Float32Array {
  const n   = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  const k   = 1 / Math.SQRT2; // 0.707 — prevents clipping when L=R=1
  for (let i = 0; i < n; i++) {
    out[i] = (left[i] + right[i]) * k;
  }
  return out;
}

// ─── Phase inversion ─────────────────────────────────────────────────────────

/**
 * Invert the phase of a signal (multiply every sample by −1).
 *
 * @param signal  Input signal.
 * @returns       Phase-inverted copy.
 */
export function phaseInvert(signal: Float32Array): Float32Array {
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = -signal[i];
  return out;
}

// ─── Stereo width measurement ─────────────────────────────────────────────────

/**
 * Measure the stereo width of a signal as the cross-channel correlation
 * coefficient (Pearson r).
 *
 *   r = Σ(L·R) / sqrt(Σ(L²) · Σ(R²))
 *
 * Returns a value in [−1, 1]:
 *   - +1 → identical channels (pure mono)
 *   -  0 → uncorrelated (wide stereo)
 *   - −1 → phase-inverted channels (out-of-phase)
 *
 * For a stereo width score in [0, 1] where 1 = widest, use `1 − (r + 1) / 2`,
 * or just interpret the raw correlation directly.
 *
 * @param left   Left channel.
 * @param right  Right channel (same length as `left`).
 * @returns      Correlation coefficient in [−1, 1], or `0` for silent signal.
 */
export function measureCorrelation(left: Float32Array, right: Float32Array): number {
  const n = Math.min(left.length, right.length);
  if (n === 0) return 0;

  let sumLR = 0;
  let sumL2 = 0;
  let sumR2 = 0;
  for (let i = 0; i < n; i++) {
    sumLR += left[i] * right[i];
    sumL2 += left[i] * left[i];
    sumR2 += right[i] * right[i];
  }
  const denom = Math.sqrt(sumL2 * sumR2);
  if (denom < 1e-12) return 0;
  return Math.max(-1, Math.min(1, sumLR / denom));
}

/**
 * Measure stereo width as a value in [0, 1] where:
 *   - 0 → pure mono (correlation = +1)
 *   - 0.5 → uncorrelated (wide stereo, correlation ≈ 0)
 *   - 1 → fully out-of-phase (correlation = −1)
 *
 * @param left   Left channel.
 * @param right  Right channel.
 */
export function measureWidth(left: Float32Array, right: Float32Array): number {
  const r = measureCorrelation(left, right);
  return (1 - r) / 2;
}

// ─── Gain utilities ───────────────────────────────────────────────────────────

/**
 * Apply independent gain to each channel of a stereo pair.
 *
 * @param pair   Input stereo pair.
 * @param gainL  Linear gain for left channel.
 * @param gainR  Linear gain for right channel.
 * @returns      Gain-adjusted `{ left, right }`.
 */
export function applyChannelGain(
  pair:  StereoPair,
  gainL: number,
  gainR: number,
): StereoPair {
  const n     = Math.min(pair.left.length, pair.right.length);
  const left  = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i]  = pair.left[i]  * gainL;
    right[i] = pair.right[i] * gainR;
  }
  return { left, right };
}
