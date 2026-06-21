/**
 * Artone v3 — Parametric EQ Frequency Response
 *
 * Computes the combined magnitude response of a multi-band parametric
 * equalizer chain. Built on top of `audio/biquad-filter.ts`.
 *
 * The combined response at each frequency is the sum of per-band
 * magnitudes in dB, which equals the log of the product of transfer
 * functions — correct for cascaded (series) filter chains.
 *
 * Typical use cases:
 *   - Real-time EQ curve display in the audio editor UI
 *   - Comparing EQ settings between clips
 *   - Verifying that an EQ chain applies the intended correction
 *
 * References:
 *   - Audio EQ Cookbook (Bristow-Johnson 2005)
 *   - "Digital Audio Signal Processing" Zölzer (2nd ed., 2011)
 *
 * # AI generated (reviewed)
 */

import type {
  BiquadCoeffs} from './biquad-filter';
import {
  makeLowpass,
  makeHighpass,
  makeBandpass,
  makeNotch,
  makePeakEQ,
  makeLowShelf,
  makeHighShelf,
  frequencyResponse,
} from './biquad-filter';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Supported biquad filter shapes for an EQ band. */
export type EQBandType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'peak'
  | 'lowshelf'
  | 'highshelf';

/** A single parametric EQ band. */
export interface EQBand {
  /** Filter shape. */
  type: EQBandType;
  /** Centre / cut-off frequency in Hz. */
  frequency: number;
  /**
   * Gain in dB.
   * - Required and meaningful for `'peak'`, `'lowshelf'`, `'highshelf'`.
   * - Ignored for `'lowpass'`, `'highpass'`, `'bandpass'`, `'notch'`.
   * - Default: 0.
   */
  gain?: number;
  /**
   * Quality factor (bandwidth).
   * - For `'peak'`/`'bandpass'`/`'notch'`: higher Q → narrower bandwidth.
   * - Default: 1.
   */
  Q?: number;
  /**
   * Whether the band is active.
   * Disabled bands contribute 0 dB (pass-through) to the total response.
   * Default: true.
   */
  enabled?: boolean;
}

/** Combined frequency response of an EQ chain. */
export interface EQResponse {
  /**
   * Frequency points in Hz (same array that was passed to `computeEQResponse`,
   * or the auto-generated log-spaced scale if none was provided).
   */
  frequencies: Float32Array;
  /**
   * Combined magnitude response in dB at each frequency.
   * Positive = boost, negative = cut, 0 = no change.
   */
  magnitudeDb: Float32Array;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default number of frequency points for a standard EQ display. */
export const EQ_DISPLAY_POINTS = 512;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a logarithmically-spaced frequency array from 20 Hz to Nyquist.
 *
 * @param n          Number of frequency points. Default: {@link EQ_DISPLAY_POINTS}.
 * @param sampleRate Sample rate in Hz.
 */
export function makeLogFrequencies(n = EQ_DISPLAY_POINTS, sampleRate = 48000): Float32Array {
  const freqs = new Float32Array(n);
  const fMin     = 20;
  const fMax     = sampleRate / 2;
  // When Nyquist ≤ fMin (sampleRate ≤ 40 Hz, incl. 0), log10(fMax/fMin) is
  // ≤ 0 or −Infinity; the i=0 term becomes 0·−Infinity = NaN. Degenerate but
  // guard so the array stays finite (flat at fMin).
  if (!(fMax > fMin)) {
    freqs.fill(fMin);
    return freqs;
  }
  const logRange = Math.log10(fMax / fMin);
  for (let i = 0; i < n; i++) {
    freqs[i] = fMin * Math.pow(10, (i / Math.max(1, n - 1)) * logRange);
  }
  return freqs;
}

/**
 * Return the index of the frequency closest to `targetHz` in a frequency array.
 *
 * @param freqs     Log-spaced or linear frequency array.
 * @param targetHz  Target frequency in Hz.
 */
export function nearestFrequencyIndex(freqs: Float32Array, targetHz: number): number {
  let best = 0;
  let bestDist = Math.abs(freqs[0] - targetHz);
  for (let i = 1; i < freqs.length; i++) {
    const d = Math.abs(freqs[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Create BiquadCoeffs from an EQBand descriptor. */
function bandToCoeffs(band: EQBand, sampleRate: number): BiquadCoeffs {
  const { type, frequency, Q = 1, gain = 0 } = band;
  switch (type) {
    case 'lowpass':   return makeLowpass(frequency, sampleRate, Q);
    case 'highpass':  return makeHighpass(frequency, sampleRate, Q);
    case 'bandpass':  return makeBandpass(frequency, sampleRate, Q);
    case 'notch':     return makeNotch(frequency, sampleRate, Q);
    case 'peak':      return makePeakEQ(frequency, sampleRate, Q, gain);
    case 'lowshelf':  return makeLowShelf(frequency, sampleRate, gain);
    case 'highshelf': return makeHighShelf(frequency, sampleRate, gain);
    // Unknown types are treated as pass-through
    default:          return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Compute the combined magnitude response (dB) of a multi-band EQ chain.
 *
 * Bands are treated as cascaded biquad filters. The combined response at
 * each frequency is the algebraic sum of per-band magnitudes in dB.
 *
 * @param bands      Array of EQ band descriptors. Disabled bands are skipped.
 * @param sampleRate Sample rate in Hz. Default: 48000.
 * @param freqs      Frequency array in Hz at which to evaluate the response.
 *                   If omitted, a {@link EQ_DISPLAY_POINTS}-point log-spaced
 *                   scale from 20 Hz to Nyquist is used.
 */
export function computeEQResponse(
  bands: EQBand[],
  sampleRate = 48000,
  freqs?: Float32Array,
): EQResponse {
  const frequencies  = freqs ?? makeLogFrequencies(EQ_DISPLAY_POINTS, sampleRate);
  const magnitudeDb  = new Float32Array(frequencies.length); // default-0 = pass-through

  for (const band of bands) {
    if (band.enabled === false) continue;
    const coeffs   = bandToCoeffs(band, sampleRate);
    const bandResp = frequencyResponse(coeffs, frequencies, sampleRate);
    for (let i = 0; i < magnitudeDb.length; i++) {
      // Sum in dB = product of linear gains (valid for cascaded series filters)
      if (Number.isFinite(bandResp[i])) magnitudeDb[i] += bandResp[i];
    }
  }

  return { frequencies, magnitudeDb };
}

/**
 * Return `true` if the response is flat within `toleranceDb` across all
 * frequency points. Useful for testing bypass paths.
 *
 * @param response    Result of `computeEQResponse`.
 * @param toleranceDb Maximum allowed deviation from 0 dB. Default: 0.01.
 */
export function isFlat(response: EQResponse, toleranceDb = 0.01): boolean {
  for (let i = 0; i < response.magnitudeDb.length; i++) {
    if (Math.abs(response.magnitudeDb[i]) > toleranceDb) return false;
  }
  return true;
}

/**
 * Return the peak (maximum) magnitude in dB and its frequency.
 * Useful for verifying that a boost band applies the correct gain.
 */
export function peakMagnitude(response: EQResponse): { magnitudeDb: number; frequencyHz: number } {
  let best = -Infinity;
  let bestIdx = 0;
  for (let i = 0; i < response.magnitudeDb.length; i++) {
    if (response.magnitudeDb[i] > best) { best = response.magnitudeDb[i]; bestIdx = i; }
  }
  return { magnitudeDb: best, frequencyHz: response.frequencies[bestIdx] };
}

/**
 * Return the minimum magnitude in dB and its frequency.
 * Useful for verifying that a cut band or notch applies the correct attenuation.
 */
export function minMagnitude(response: EQResponse): { magnitudeDb: number; frequencyHz: number } {
  let best = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < response.magnitudeDb.length; i++) {
    if (response.magnitudeDb[i] < best) { best = response.magnitudeDb[i]; bestIdx = i; }
  }
  return { magnitudeDb: best, frequencyHz: response.frequencies[bestIdx] };
}
