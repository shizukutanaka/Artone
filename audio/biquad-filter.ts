/**
 * Parametric biquad filters — offline signal processing
 *
 * Implements all standard filter types from the Audio EQ Cookbook
 * (Robert Bristow-Johnson, 2005) in transposed direct-form II for
 * numerical stability. All processing is pure TypeScript with no
 * Web Audio API dependency — suitable for offline rendering, loudness
 * analysis, and unit testing.
 *
 * Usage:
 *   const f = makePeakEQ(1000, 48000, 1.0, 6);   // +6 dB at 1 kHz
 *   const out = applyFilter(f, inputSamples);
 *
 * References:
 *   - Audio EQ Cookbook, Robert Bristow-Johnson (https://ccrma.stanford.edu/~jos/filters/)
 *   - Transposed direct-form II: Smith (2007), "Introduction to Digital Filters"
 */

// ============================================================
// Types
// ============================================================

/** Second-order IIR filter coefficients (a0 = 1 normalised). */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number; // negated: output = b*x - a*y
  a2: number;
}

/** Mutable filter state for one channel (transposed direct-form II). */
export interface BiquadState {
  s1: number;
  s2: number;
}

export type FilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'allpass'
  | 'peakEQ'
  | 'lowShelf'
  | 'highShelf';

// ============================================================
// Coefficient calculators (Audio EQ Cookbook)
// ============================================================

function omega(freq: number, sampleRate: number): number {
  return (2 * Math.PI * freq) / sampleRate;
}

function alpha(w0: number, Q: number): number {
  return Math.sin(w0) / (2 * Q);
}

/** 2nd-order Butterworth-style lowpass. */
export function makeLowpass(freq: number, sampleRate: number, Q = 0.7071): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const cosW = Math.cos(w0);
  const a = alpha(w0, Q);
  const b0 = (1 - cosW) / 2;
  const norm = 1 + a;
  return {
    b0: b0 / norm,
    b1: (1 - cosW) / norm,
    b2: b0 / norm,
    a1: (-2 * cosW) / norm,
    a2: (1 - a) / norm,
  };
}

/** 2nd-order highpass. */
export function makeHighpass(freq: number, sampleRate: number, Q = 0.7071): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const cosW = Math.cos(w0);
  const a = alpha(w0, Q);
  const b0 = (1 + cosW) / 2;
  const norm = 1 + a;
  return {
    b0: b0 / norm,
    b1: (-(1 + cosW)) / norm,
    b2: b0 / norm,
    a1: (-2 * cosW) / norm,
    a2: (1 - a) / norm,
  };
}

/** Constant-0-dB peak bandpass. */
export function makeBandpass(freq: number, sampleRate: number, Q = 1): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const a = alpha(w0, Q);
  const norm = 1 + a;
  return {
    b0: a / norm,
    b1: 0,
    b2: -a / norm,
    a1: (-2 * Math.cos(w0)) / norm,
    a2: (1 - a) / norm,
  };
}

/** Notch (band-reject) filter. */
export function makeNotch(freq: number, sampleRate: number, Q = 1): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const cosW = Math.cos(w0);
  const a = alpha(w0, Q);
  const norm = 1 + a;
  return {
    b0: 1 / norm,
    b1: (-2 * cosW) / norm,
    b2: 1 / norm,
    a1: (-2 * cosW) / norm,
    a2: (1 - a) / norm,
  };
}

/**
 * Peaking EQ — boost/cut dBGain at frequency freq.
 * Q controls the bandwidth: Q = 1 is ~1 octave.
 */
export function makePeakEQ(freq: number, sampleRate: number, Q: number, dBGain: number): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const cosW = Math.cos(w0);
  const A = Math.pow(10, dBGain / 40); // sqrt of linear amplitude
  const a = alpha(w0, Q);
  const norm = 1 + a / A;
  return {
    b0: (1 + a * A) / norm,
    b1: (-2 * cosW) / norm,
    b2: (1 - a * A) / norm,
    a1: (-2 * cosW) / norm,
    a2: (1 - a / A) / norm,
  };
}

/** Low-shelf filter — boost/cut all frequencies below freq. */
export function makeLowShelf(freq: number, sampleRate: number, dBGain: number, S = 1): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const cosW = Math.cos(w0);
  const A = Math.pow(10, dBGain / 40);
  const aCoeff = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
  const norm = (A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * aCoeff;
  return {
    b0: (A * ((A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * aCoeff)) / norm,
    b1: (2 * A * ((A - 1) - (A + 1) * cosW)) / norm,
    b2: (A * ((A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * aCoeff)) / norm,
    a1: (-2 * ((A - 1) + (A + 1) * cosW)) / norm,
    a2: ((A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * aCoeff) / norm,
  };
}

/** High-shelf filter — boost/cut all frequencies above freq. */
export function makeHighShelf(freq: number, sampleRate: number, dBGain: number, S = 1): BiquadCoeffs {
  const w0 = omega(freq, sampleRate);
  const cosW = Math.cos(w0);
  const A = Math.pow(10, dBGain / 40);
  const aCoeff = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
  const norm = (A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * aCoeff;
  return {
    b0: (A * ((A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * aCoeff)) / norm,
    b1: (-2 * A * ((A - 1) + (A + 1) * cosW)) / norm,
    b2: (A * ((A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * aCoeff)) / norm,
    a1: (2 * ((A - 1) - (A + 1) * cosW)) / norm,
    a2: ((A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * aCoeff) / norm,
  };
}

// ============================================================
// Processing
// ============================================================

/** Returns a fresh zeroed state (one per channel). */
export function makeState(): BiquadState {
  return { s1: 0, s2: 0 };
}

/**
 * Processes one sample through the biquad (transposed direct-form II).
 * State is updated in-place for continuous streaming.
 */
export function processSample(coeffs: BiquadCoeffs, state: BiquadState, x: number): number {
  const y = coeffs.b0 * x + state.s1;
  state.s1 = coeffs.b1 * x - coeffs.a1 * y + state.s2;
  state.s2 = coeffs.b2 * x - coeffs.a2 * y;
  return y;
}

/**
 * Applies a biquad filter to a Float32Array (in-place or new buffer).
 * Reuses or creates fresh state; returns the state for streaming.
 */
export function applyFilter(
  coeffs: BiquadCoeffs,
  input: Float32Array,
  state?: BiquadState
): { output: Float32Array; state: BiquadState } {
  const s = state ?? makeState();
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    output[i] = processSample(coeffs, s, input[i]);
  }
  return { output, state: s };
}

// ============================================================
// Multi-band parametric EQ
// ============================================================

export interface EQBandConfig {
  type: FilterType;
  freq: number;
  /** Q / bandwidth (ignored for shelf types). */
  Q?: number;
  /** Gain in dB (for peak and shelf types). */
  dBGain?: number;
  enabled?: boolean;
}

/**
 * Applies a parametric EQ band chain to a mono signal.
 * Each band runs in series: input → band1 → band2 → … → output.
 */
export function applyParametricEQ(
  input: Float32Array,
  sampleRate: number,
  bands: EQBandConfig[]
): Float32Array {
  let signal = input;
  for (const band of bands) {
    if (band.enabled === false) continue;
    const coeffs = bandToCoeffs(band, sampleRate);
    if (!coeffs) continue;
    const { output } = applyFilter(coeffs, signal);
    signal = output;
  }
  return signal;
}

function bandToCoeffs(band: EQBandConfig, sampleRate: number): BiquadCoeffs | null {
  const { freq, Q = 1, dBGain = 0 } = band;
  switch (band.type) {
    case 'lowpass':    return makeLowpass(freq, sampleRate, Q);
    case 'highpass':   return makeHighpass(freq, sampleRate, Q);
    case 'bandpass':   return makeBandpass(freq, sampleRate, Q);
    case 'notch':      return makeNotch(freq, sampleRate, Q);
    case 'peakEQ':     return makePeakEQ(freq, sampleRate, Q, dBGain);
    case 'lowShelf':   return makeLowShelf(freq, sampleRate, dBGain);
    case 'highShelf':  return makeHighShelf(freq, sampleRate, dBGain);
    default:           return null;
  }
}

// ============================================================
// Frequency response (for UI display)
// ============================================================

/**
 * Computes the magnitude response of a biquad at discrete frequencies.
 * Returns an array of magnitude values in dB for each frequency in `freqs`.
 */
export function frequencyResponse(coeffs: BiquadCoeffs, freqs: Float32Array, sampleRate: number): Float32Array {
  const out = new Float32Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const w = (2 * Math.PI * freqs[i]) / sampleRate;
    // H(z) = (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)
    // z = e^{jw}, z⁻¹ = cos(w) - j·sin(w)
    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    const cos2W = Math.cos(2 * w);
    const sin2W = Math.sin(2 * w);

    const bRe = coeffs.b0 + coeffs.b1 * cosW + coeffs.b2 * cos2W;
    const bIm = -(coeffs.b1 * sinW + coeffs.b2 * sin2W);
    const aRe = 1 + coeffs.a1 * cosW + coeffs.a2 * cos2W;
    const aIm = -(coeffs.a1 * sinW + coeffs.a2 * sin2W);

    const aMag2 = aRe * aRe + aIm * aIm;
    if (aMag2 < 1e-30) { out[i] = 0; continue; }

    const hRe = (bRe * aRe + bIm * aIm) / aMag2;
    const hIm = (bIm * aRe - bRe * aIm) / aMag2;
    const mag = Math.sqrt(hRe * hRe + hIm * hIm);
    out[i] = mag > 0 ? 20 * Math.log10(mag) : -Infinity;
  }
  return out;
}
