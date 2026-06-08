/**
 * Artone v3 — Harmonic-Percussive Source Separation (HPSS)
 *
 * Separates a mono audio signal into harmonic (sustained tones) and
 * percussive (drum / transient) components using median filtering on the
 * STFT magnitude spectrogram.
 *
 * Algorithm (Fitzgerald 2010 / Driedger 2014):
 *   1. Compute STFT → complex spectrogram.
 *   2. Horizontal median filter (time axis, kernel `harmonicLen`) → harmonic power H.
 *   3. Vertical median filter (frequency axis, kernel `percussiveLen`) → percussive power P.
 *   4. Wiener soft masks:  M_H = H² / (H² + P²),  M_P = P² / (H² + P²).
 *   5. Apply masks to complex STFT bins, ISTFT + overlap-add → separated signals.
 *
 * Pure TypeScript — no browser APIs, fully testable with Vitest.
 *
 * References:
 *   - Fitzgerald 2010: "Harmonic/Percussive Separation using Median Filtering"
 *   - Driedger 2014: "Extending Harmonic-Percussive Separation of Audio"
 *   - Ono 2008: "Separation by Complementary Diffusion on Spectrogram"
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for HPSS. */
export interface HPSSOptions {
  /** STFT window size (power of 2). Default: 2048. */
  windowSize?: number;
  /** Hop size in samples. Default: windowSize / 4 (75% overlap). */
  hopSize?: number;
  /** Horizontal (time-axis) median filter length in frames (must be odd). Default: 17. */
  harmonicFilterLen?: number;
  /** Vertical (frequency-axis) median filter length in bins (must be odd). Default: 17. */
  percussiveFilterLen?: number;
  /** Power exponent for Wiener mask (1 = magnitude, 2 = power). Default: 2. */
  maskPower?: number;
}

/** Result of HPSS separation. */
export interface HPSSResult {
  /** Harmonic component (sustained tones, melody, chords). */
  harmonic: Float32Array;
  /** Percussive component (drums, transients, attacks). */
  percussive: Float32Array;
  /** Residual: input − harmonic − percussive (numerical noise, near-zero). */
  residual: Float32Array;
}

// ─── FFT (Cooley-Tukey radix-2 in-place) ─────────────────────────────────────

/** In-place Cooley-Tukey FFT. `re` and `im` must have length that is power of 2. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < halfLen; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + halfLen] * curRe - im[i + k + halfLen] * curIm;
        const vIm = re[i + k + halfLen] * curIm + im[i + k + halfLen] * curRe;
        re[i + k]          = uRe + vRe;
        im[i + k]          = uIm + vIm;
        re[i + k + halfLen] = uRe - vRe;
        im[i + k + halfLen] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** In-place inverse FFT (conjugate + FFT + conjugate + scale). */
function ifft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}

// ─── Window ───────────────────────────────────────────────────────────────────

/** Build a periodic Hann window of length `n`. */
function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  return w;
}

// ─── STFT / ISTFT ─────────────────────────────────────────────────────────────

/** Complex spectrogram frame: [frames][bins] for real and imag parts. */
interface Spectrogram {
  re:    Float64Array[];   // [frames][bins]
  im:    Float64Array[];   // [frames][bins]
  mag:   Float64Array[];   // magnitude (for filtering)
  nFrames: number;
  nBins:   number;
}

/**
 * Compute the STFT of `signal`.
 *
 * @param signal    Mono audio samples.
 * @param winSize   Window/FFT size (power of 2).
 * @param hopSize   Hop between frames.
 * @param window    Pre-computed Hann window of length `winSize`.
 */
function stft(
  signal:  Float32Array,
  winSize: number,
  hopSize: number,
  window:  Float64Array,
): Spectrogram {
  const nBins   = winSize / 2 + 1; // positive frequencies only
  const nFrames = Math.floor((signal.length - winSize) / hopSize) + 1;
  const re: Float64Array[]  = [];
  const im: Float64Array[]  = [];
  const mag: Float64Array[] = [];

  const fRe = new Float64Array(winSize);
  const fIm = new Float64Array(winSize);

  for (let f = 0; f < nFrames; f++) {
    const start = f * hopSize;
    for (let k = 0; k < winSize; k++) {
      fRe[k] = (start + k < signal.length ? signal[start + k] : 0) * window[k];
      fIm[k] = 0;
    }
    fft(fRe, fIm);
    const frameRe  = new Float64Array(nBins);
    const frameIm  = new Float64Array(nBins);
    const frameMag = new Float64Array(nBins);
    for (let b = 0; b < nBins; b++) {
      frameRe[b]  = fRe[b];
      frameIm[b]  = fIm[b];
      frameMag[b] = Math.sqrt(fRe[b] * fRe[b] + fIm[b] * fIm[b]);
    }
    re.push(frameRe);
    im.push(frameIm);
    mag.push(frameMag);
  }
  return { re, im, mag, nFrames, nBins };
}

/**
 * Overlap-add inverse STFT.
 *
 * @param maskedRe  Masked real part [frames][bins].
 * @param maskedIm  Masked imag part [frames][bins].
 * @param nSamples  Output length (= input signal length).
 * @param winSize   Window/FFT size.
 * @param hopSize   Hop size.
 * @param window    Hann window (synthesis).
 */
function istft(
  maskedRe: Float64Array[],
  maskedIm: Float64Array[],
  nSamples: number,
  winSize:  number,
  hopSize:  number,
  window:   Float64Array,
): Float32Array {
  const nFrames = maskedRe.length;
  const output  = new Float64Array(nSamples + winSize);
  const normSum = new Float64Array(nSamples + winSize);

  const fRe = new Float64Array(winSize);
  const fIm = new Float64Array(winSize);

  for (let f = 0; f < nFrames; f++) {
    const nBins = maskedRe[f].length;
    // Mirror negative frequencies for real output
    for (let b = 0; b < winSize; b++) fRe[b] = 0;
    for (let b = 0; b < winSize; b++) fIm[b] = 0;
    for (let b = 0; b < nBins; b++) {
      fRe[b] = maskedRe[f][b];
      fIm[b] = maskedIm[f][b];
    }
    // Mirror: bin k → bin winSize-k (conjugate)
    for (let b = 1; b < nBins - 1; b++) {
      fRe[winSize - b] =  maskedRe[f][b];
      fIm[winSize - b] = -maskedIm[f][b];
    }
    ifft(fRe, fIm);
    const start = f * hopSize;
    for (let k = 0; k < winSize; k++) {
      if (start + k < output.length) {
        output[start + k]  += fRe[k] * window[k];
        normSum[start + k] += window[k] * window[k];
      }
    }
  }

  const result = new Float32Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    result[i] = normSum[i] > 1e-10 ? output[i] / normSum[i] : 0;
  }
  return result;
}

// ─── Median filter ────────────────────────────────────────────────────────────

/** In-place copy of `arr` for median work. */
function medianOfSlice(buf: Float64Array, len: number): number {
  // Partial selection sort for small kernels (kernel ≤ 31 typical)
  const half = len >> 1;
  // Simple insertion-based partial sort for correctness & simplicity
  const scratch = buf.slice(0, len);
  scratch.sort(); // Float64Array.prototype.sort is numeric
  return scratch[half];
}

/**
 * Apply 1-D median filter along axis 1 (time axis = horizontal).
 *
 * @param mag       Magnitude spectrogram [nFrames][nBins].
 * @param kernLen   Kernel length (odd).
 * @returns         Filtered spectrogram (same shape, new arrays).
 */
function medianFilterTime(mag: Float64Array[], kernLen: number): Float64Array[] {
  const nFrames = mag.length;
  const nBins   = nFrames > 0 ? mag[0].length : 0;
  const half    = kernLen >> 1;
  const result: Float64Array[] = [];
  const scratch = new Float64Array(kernLen);

  for (let f = 0; f < nFrames; f++) {
    const row = new Float64Array(nBins);
    for (let b = 0; b < nBins; b++) {
      for (let k = 0; k < kernLen; k++) {
        const fi = Math.max(0, Math.min(nFrames - 1, f - half + k));
        scratch[k] = mag[fi][b];
      }
      row[b] = medianOfSlice(scratch, kernLen);
    }
    result.push(row);
  }
  return result;
}

/**
 * Apply 1-D median filter along axis 0 (frequency axis = vertical).
 *
 * @param mag       Magnitude spectrogram [nFrames][nBins].
 * @param kernLen   Kernel length (odd).
 */
function medianFilterFreq(mag: Float64Array[], kernLen: number): Float64Array[] {
  const nFrames = mag.length;
  const nBins   = nFrames > 0 ? mag[0].length : 0;
  const half    = kernLen >> 1;
  const result: Float64Array[] = [];
  const scratch = new Float64Array(kernLen);

  for (let f = 0; f < nFrames; f++) {
    const row = new Float64Array(nBins);
    for (let b = 0; b < nBins; b++) {
      for (let k = 0; k < kernLen; k++) {
        const bi = Math.max(0, Math.min(nBins - 1, b - half + k));
        scratch[k] = mag[f][bi];
      }
      row[b] = medianOfSlice(scratch, kernLen);
    }
    result.push(row);
  }
  return result;
}

// ─── Wiener mask application ──────────────────────────────────────────────────

/**
 * Compute Wiener soft masks and return masked complex spectrograms.
 *
 * M_H[f,b] = H[f,b]^p / (H[f,b]^p + P[f,b]^p + ε)
 * M_P[f,b] = P[f,b]^p / (H[f,b]^p + P[f,b]^p + ε)
 */
function wienerMasks(
  H:   Float64Array[],
  P:   Float64Array[],
  re:  Float64Array[],
  im:  Float64Array[],
  p:   number,
): { hRe: Float64Array[]; hIm: Float64Array[]; pRe: Float64Array[]; pIm: Float64Array[] } {
  const nFrames = H.length;
  const nBins   = nFrames > 0 ? H[0].length : 0;
  const hRe: Float64Array[] = [];
  const hIm: Float64Array[] = [];
  const pRe: Float64Array[] = [];
  const pIm: Float64Array[] = [];
  const EPS = 1e-10;

  for (let f = 0; f < nFrames; f++) {
    const hrRow = new Float64Array(nBins);
    const hiRow = new Float64Array(nBins);
    const prRow = new Float64Array(nBins);
    const piRow = new Float64Array(nBins);
    for (let b = 0; b < nBins; b++) {
      const hp = Math.pow(H[f][b], p);
      const pp = Math.pow(P[f][b], p);
      const denom = hp + pp + EPS;
      const mH = hp / denom;
      const mP = pp / denom;
      hrRow[b] = mH * re[f][b];
      hiRow[b] = mH * im[f][b];
      prRow[b] = mP * re[f][b];
      piRow[b] = mP * im[f][b];
    }
    hRe.push(hrRow); hIm.push(hiRow);
    pRe.push(prRow); pIm.push(piRow);
  }
  return { hRe, hIm, pRe, pIm };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Separate a mono audio signal into harmonic and percussive components.
 *
 * @param signal   Mono audio samples (any sample rate).
 * @param opts     HPSS options.
 * @returns        `{ harmonic, percussive, residual }` — all Float32Array of same length as `signal`.
 *
 * @example
 * ```ts
 * const { harmonic, percussive } = separateHPSS(audio, { windowSize: 2048 });
 * ```
 */
export function separateHPSS(signal: Float32Array, opts: HPSSOptions = {}): HPSSResult {
  const winSize       = opts.windowSize        ?? 2048;
  const hopSize       = opts.hopSize           ?? winSize >> 2;
  const harmFilterLen = opts.harmonicFilterLen  ?? 17;
  const percFilterLen = opts.percussiveFilterLen ?? 17;
  const maskPower     = opts.maskPower          ?? 2;

  if (signal.length === 0) {
    const empty = new Float32Array(0);
    return { harmonic: empty, percussive: empty, residual: empty };
  }

  const window = hannWindow(winSize);

  // 1. STFT
  const spec = stft(signal, winSize, hopSize, window);

  // 2. Median filters
  const H = medianFilterTime(spec.mag, harmFilterLen);   // horizontal → harmonic
  const P = medianFilterFreq(spec.mag, percFilterLen);   // vertical   → percussive

  // 3. Wiener masks → masked spectrograms
  const { hRe, hIm, pRe, pIm } = wienerMasks(H, P, spec.re, spec.im, maskPower);

  // 4. ISTFT
  const harmonic   = istft(hRe, hIm, signal.length, winSize, hopSize, window);
  const percussive = istft(pRe, pIm, signal.length, winSize, hopSize, window);

  // 5. Residual
  const residual = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    residual[i] = signal[i] - harmonic[i] - percussive[i];
  }

  return { harmonic, percussive, residual };
}

/**
 * Streaming HPSS processor.
 *
 * Accumulates input blocks, separates when a full STFT can be computed,
 * and flushes output in blocks matching the hop size.
 *
 * @param opts  HPSS options (fixed for the lifetime of this processor).
 */
export function createHPSSProcessor(opts: HPSSOptions = {}): {
  /** Push a block of input samples. Returns separated output for any completed hops. */
  push(block: Float32Array): HPSSResult | null;
  /** Flush remaining buffered samples. */
  flush(): HPSSResult;
  /** Reset processor state. */
  reset(): void;
} {
  const winSize       = opts.windowSize        ?? 2048;
  const hopSize       = opts.hopSize           ?? winSize >> 2;
  const harmFilterLen = opts.harmonicFilterLen  ?? 17;
  const percFilterLen = opts.percussiveFilterLen ?? 17;
  const maskPower     = opts.maskPower          ?? 2;

  let buffer: number[] = [];

  function processBuffer(): HPSSResult | null {
    if (buffer.length < winSize) return null;
    // Process all complete hops
    const totalFrames = Math.floor((buffer.length - winSize) / hopSize) + 1;
    const usedSamples = (totalFrames - 1) * hopSize + winSize;
    const chunk = new Float32Array(buffer.slice(0, usedSamples));
    const result = separateHPSS(chunk, { windowSize: winSize, hopSize, harmonicFilterLen: harmFilterLen, percussiveFilterLen: percFilterLen, maskPower });
    // Keep leftover
    buffer = buffer.slice(usedSamples - (winSize - hopSize));
    return result;
  }

  return {
    push(block: Float32Array): HPSSResult | null {
      for (let i = 0; i < block.length; i++) buffer.push(block[i]);
      return processBuffer();
    },
    flush(): HPSSResult {
      if (buffer.length === 0) {
        const empty = new Float32Array(0);
        return { harmonic: empty, percussive: empty, residual: empty };
      }
      const chunk = new Float32Array(buffer);
      buffer = [];
      return separateHPSS(chunk, { windowSize: winSize, hopSize, harmonicFilterLen: harmFilterLen, percussiveFilterLen: percFilterLen, maskPower });
    },
    reset(): void {
      buffer = [];
    },
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Compute the energy ratio of the percussive component to the total.
 *
 * Values near 1.0 indicate drum-heavy content; near 0.0 indicate sustained tones.
 *
 * @param result  Output of `separateHPSS`.
 */
export function percussivenessRatio(result: HPSSResult): number {
  let totalEnergy = 0;
  let percEnergy  = 0;
  for (let i = 0; i < result.harmonic.length; i++) {
    const h = result.harmonic[i];
    const p = result.percussive[i];
    totalEnergy += h * h + p * p;
    percEnergy  += p * p;
  }
  return totalEnergy < 1e-20 ? 0 : percEnergy / totalEnergy;
}

/**
 * Compute the peak signal-to-noise ratio between two signals (for quality assessment).
 *
 * @param reference  Reference signal.
 * @param test       Signal under test.
 */
export function signalPsnr(reference: Float32Array, test: Float32Array): number {
  const len = Math.min(reference.length, test.length);
  if (len === 0) return 0;
  let peakSq = 0;
  let mseSq  = 0;
  for (let i = 0; i < len; i++) {
    peakSq = Math.max(peakSq, reference[i] * reference[i]);
    const e = reference[i] - test[i];
    mseSq += e * e;
  }
  const mse = mseSq / len;
  if (mse < 1e-30) return 100;
  return 10 * Math.log10(peakSq / mse);
}
