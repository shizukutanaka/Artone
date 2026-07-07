/**
 * Artone v3 — Spectral Noise Gate / Spectral Subtraction
 *
 * Reduces stationary or slowly-varying noise from mono PCM audio using
 * the Weighted Overlap-Add (WOLA) spectral subtraction method.
 *
 * Algorithm:
 *   1. Segment input into overlapping frames (50 % overlap, Hann-windowed).
 *   2. Estimate a noise power spectrum from the quietest frames during a
 *      configurable "noise profiling" period (first N frames or explicit).
 *   3. In each frame: subtract α × noise estimate from the magnitude
 *      spectrum, floor remaining components at `floorDb` (prevents
 *      musical noise), and reconstruct with original phase.
 *   4. Overlap-add the reconstructed frames. A single Hann analysis window is
 *      applied; at 50 % overlap it satisfies the COLA property (∑ hann = 1),
 *      so the overlapped interior reconstructs at unity gain with no synthesis
 *      window. The leading/trailing frame tapers (standard STFT edge effect).
 *
 * This is a *purely statistical* approach — no neural model required.
 * Suitable for removing consistent HVAC, microphone hiss, and room tone.
 *
 * References:
 *   - Boll S. (1979) "Suppression of acoustic noise in speech using
 *     spectral subtraction" IEEE Trans. ASSP 27(2).
 *   - Martin R. (2001) "Noise power spectral density estimation based on
 *     optimal smoothing and minimum statistics" IEEE Trans. SAP.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Spectral gate / subtraction options. */
export interface SpectralGateOptions {
  /**
   * Sample rate of the input audio in Hz.
   * Default: 48000.
   */
  sampleRate?: number;
  /**
   * FFT frame size in samples (must be a power of two).
   * Default: 2048 (~42 ms at 48 kHz — good frequency resolution for noise).
   */
  fftSize?: number;
  /**
   * Number of initial frames used to estimate the noise profile.
   * Default: 10 (≈ 200 ms at 48 kHz, 50 % overlap, 2048-sample frames).
   */
  noiseFrames?: number;
  /**
   * Noise over-subtraction factor α (Boll 1979).
   * Higher values = more aggressive noise reduction.
   * Default: 2.0.  Typical range: 1.0–4.0.
   */
  alpha?: number;
  /**
   * Spectral floor in dB relative to the noise estimate.
   * Components that dip below this are clamped, preventing "musical noise".
   * Default: −20 dB.
   */
  floorDb?: number;
  /**
   * Martin noise-tracker smoothing coefficient (0–1).
   * Close to 1 = slow adaptation (stationary noise only).
   * Default: 0.98.
   */
  noiseSmoothing?: number;
}

/** Explicit noise power profile (one value per FFT bin, linear power). */
export type NoiseProfile = Float32Array;

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Compute the next power of two ≥ n.
 * Returns n unchanged if it is already a power of two.
 */
export function nextPow2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ─── Minimal real-only FFT ────────────────────────────────────────────────────
// Cooley-Tukey radix-2 FFT on real-valued input of length N (power of two).
// Returns interleaved complex bins [re0,im0, re1,im1, ..., re(N/2),im(N/2)].

function fft(reIn: Float32Array, work?: Float32Array): Float32Array {
  const N   = reIn.length;
  const buf = work ?? new Float32Array(N * 2);
  buf.fill(0); // zero imaginary parts and any stale data from prior reuse
  for (let i = 0; i < N; i++) buf[i * 2] = reIn[i];

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const ri = i * 2; const rj = j * 2;
      let t    = buf[ri];   buf[ri]   = buf[rj];   buf[rj]   = t;
      t        = buf[ri+1]; buf[ri+1] = buf[rj+1]; buf[rj+1] = t;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wR  = Math.cos(ang);
    const wI  = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let uR = 1; let uI = 0;
      for (let k = 0; k < len >> 1; k++) {
        const u  = (i + k)           * 2;
        const v  = (i + k + len / 2) * 2;
        const vR = buf[v]   * uR - buf[v+1] * uI;
        const vI = buf[v]   * uI + buf[v+1] * uR;
        buf[v]   = buf[u]   - vR;
        buf[v+1] = buf[u+1] - vI;
        buf[u]   += vR;
        buf[u+1] += vI;
        const nR = uR * wR - uI * wI;
        uI = uR * wI + uI * wR;
        uR = nR;
      }
    }
  }
  return buf.subarray(0, (N / 2 + 1) * 2);
}

/** IFFT: takes N/2+1 complex bins, returns N real samples. */
function ifft(bins: Float32Array, N: number, work?: Float32Array, out?: Float32Array): Float32Array {
  const buf = work ?? new Float32Array(N * 2);
  const half = N / 2;
  for (let k = 0; k <= half; k++) {
    buf[k * 2]     = bins[k * 2];
    buf[k * 2 + 1] = bins[k * 2 + 1];
  }
  // Conjugate symmetry for real output
  for (let k = 1; k < half; k++) {
    buf[(N - k) * 2]     =  bins[k * 2];
    buf[(N - k) * 2 + 1] = -bins[k * 2 + 1];
  }

  // Conjugate before forward FFT
  for (let i = 0; i < N * 2; i += 2) buf[i + 1] = -buf[i + 1];

  // Bit-reversal
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const ri = i * 2; const rj = j * 2;
      let t    = buf[ri];   buf[ri]   = buf[rj];   buf[rj]   = t;
      t        = buf[ri+1]; buf[ri+1] = buf[rj+1]; buf[rj+1] = t;
    }
  }

  // Butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wR  = Math.cos(ang);
    const wI  = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let uR = 1; let uI = 0;
      for (let k = 0; k < len >> 1; k++) {
        const u  = (i + k)           * 2;
        const v  = (i + k + len / 2) * 2;
        const vR = buf[v]   * uR - buf[v+1] * uI;
        const vI = buf[v]   * uI + buf[v+1] * uR;
        buf[v]   = buf[u]   - vR;
        buf[v+1] = buf[u+1] - vI;
        buf[u]   += vR;
        buf[u+1] += vI;
        const nR = uR * wR - uI * wI;
        uI = uR * wI + uI * wR;
        uR = nR;
      }
    }
  }

  // Conjugate + scale → real part
  const result = out ?? new Float32Array(N);
  for (let i = 0; i < N; i++) result[i] = buf[i * 2] / N;
  return result;
}

// ─── Hann window ─────────────────────────────────────────────────────────────

function makeHannWindow(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
  return w;
}

// ─── Spectral processing on a single frame ────────────────────────────────────

/**
 * Apply spectral subtraction to a single windowed FFT spectrum.
 * Returns modified bins [re0,im0, ...] of the same length.
 */
function subtractNoise(
  bins: Float32Array,
  noisePow: Float32Array,
  alpha: number,
  floorLinear: number,
  out?: Float32Array,
): Float32Array {
  const buf   = out ?? new Float32Array(bins.length);
  const bins2 = bins.length >> 1; // N/2 + 1 complex bins
  for (let k = 0; k < bins2; k++) {
    const re      = bins[k * 2];
    const im      = bins[k * 2 + 1];
    const mag2    = re * re + im * im;
    const mag     = Math.sqrt(mag2);
    const phase   = Math.atan2(im, re);

    const noiseFloorMag = Math.sqrt(noisePow[k] * floorLinear);
    const outMag        = Math.max(mag - alpha * Math.sqrt(noisePow[k]), noiseFloorMag);

    buf[k * 2]     = outMag * Math.cos(phase);
    buf[k * 2 + 1] = outMag * Math.sin(phase);
  }
  return buf;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Estimate a noise power spectral density profile from a segment of audio
 * assumed to contain (only) noise.
 *
 * @param noise      Mono noise-only PCM (e.g. a room-tone recording).
 * @param fftSize    FFT frame size (power of two). Default: 2048.
 * @returns          Per-bin noise power profile (Float32Array, length fftSize/2+1).
 */
export function estimateNoiseProfile(noise: Float32Array, fftSize = 2048): NoiseProfile {
  const N    = nextPow2(fftSize);
  const hop  = N >> 1;
  const bins = N / 2 + 1;
  const hann = makeHannWindow(N);
  const acc  = new Float32Array(bins);
  let frames = 0;

  const frame = new Float32Array(N);
  for (let off = 0; off + N <= noise.length; off += hop) {
    for (let i = 0; i < N; i++) frame[i] = noise[off + i] * hann[i];
    const spec = fft(frame);
    for (let k = 0; k < bins; k++) {
      const re = spec[k * 2];
      const im = spec[k * 2 + 1];
      acc[k] += re * re + im * im;
    }
    frames++;
  }
  if (frames > 0) for (let k = 0; k < bins; k++) acc[k] /= frames;
  return acc;
}

/**
 * Apply spectral subtraction noise reduction to a mono audio signal.
 *
 * Uses a Hann analysis window with overlap-add at 50 % overlap. The window's
 * COLA property (∑ hann = 1) gives unity-gain reconstruction across the
 * overlapped interior without a synthesis window; the first and last frames
 * taper (the usual STFT edge effect).
 *
 * @param input          Mono PCM to denoise.
 * @param noiseProfile   Pre-computed noise profile from `estimateNoiseProfile`.
 * @param options        Processing options.
 * @returns              Denoised mono PCM (same length as input).
 */
export function applySpectralGate(
  input: Float32Array,
  noiseProfile: NoiseProfile,
  options: SpectralGateOptions = {},
): Float32Array {
  const N        = nextPow2(options.fftSize ?? 2048);
  const hop      = N >> 1;
  const alpha    = options.alpha ?? 2.0;
  const floorLin = Math.pow(10, (options.floorDb ?? -20) / 10);
  const hann     = makeHannWindow(N);

  const output   = new Float32Array(input.length);
  const frame    = new Float32Array(N);
  // Static copy: batch processing uses the provided profile unchanged.
  // Use createSpectralGateProcessor for adaptive noise tracking.
  const noisePow = noiseProfile.slice();

  for (let off = 0; off < input.length - N + 1; off += hop) {
    // Analysis window
    for (let i = 0; i < N; i++) frame[i] = input[off + i] * hann[i];

    const spec     = fft(frame);
    const modified = subtractNoise(spec, noisePow, alpha, floorLin);

    // OLA: add IFFT output directly (no synthesis window).
    // For periodic Hann with 50 % overlap, ∑_k hann[n − k·hop] = 1 ∀ n,
    // so the sum of all contributions equals the input sample (passthrough).
    const recon = ifft(modified, N);
    for (let i = 0; off + i < input.length && i < N; i++) {
      output[off + i] += recon[i];
    }
  }

  return output;
}

// ─── High-level API ──────────────────────────────────────────────────────────

/**
 * Denoise a mono audio signal.
 *
 * Estimates the noise profile from the first `noiseFrames` analysis frames
 * (default ~200 ms), then applies spectral subtraction to the entire signal.
 *
 * @param input    Mono PCM to denoise.
 * @param options  Processing options.
 * @returns        Denoised mono PCM (same length as input).
 */
export function denoiseAudio(input: Float32Array, options: SpectralGateOptions = {}): Float32Array {
  const N  = nextPow2(options.fftSize ?? 2048);
  const nf = options.noiseFrames ?? 10;
  const hop = N >> 1;

  // Estimate noise from the initial portion of the signal
  const noiseEnd     = Math.min(input.length, hop * nf + N);
  const noiseProfile = estimateNoiseProfile(input.subarray(0, noiseEnd), N);

  return applySpectralGate(input, noiseProfile, options);
}

// ─── Streaming API ───────────────────────────────────────────────────────────

/** Stateful streaming noise gate. */
export interface SpectralGateProcessor {
  /**
   * Feed the next block of mono audio.
   * Returns denoised output samples accumulated so far (may be fewer than input).
   */
  process(input: Float32Array): Float32Array;
  /**
   * Provide an explicit noise profile instead of estimating from audio.
   * Call this before processing starts to bypass the auto-profiling phase.
   */
  setNoiseProfile(profile: NoiseProfile): void;
  /**
   * Flush the internal buffer, processing any remaining partial frame with
   * zero-padding. Returns remaining output samples.
   */
  flush(): Float32Array;
  /** Reset all accumulated state. */
  reset(): void;
}

/**
 * Create a stateful streaming spectral noise gate.
 *
 * During the first `noiseFrames` frames the processor accumulates a noise
 * profile. After that, it applies spectral subtraction.
 *
 * @param options  Processing options.
 */
export function createSpectralGateProcessor(options: SpectralGateOptions = {}): SpectralGateProcessor {
  const N     = nextPow2(options.fftSize ?? 2048);
  const hop   = N >> 1;
  const nf    = options.noiseFrames ?? 10;
  const bins  = N / 2 + 1;
  const alpha = options.alpha ?? 2.0;
  const floorLin = Math.pow(10, (options.floorDb ?? -20) / 10);
  const ns    = options.noiseSmoothing ?? 0.98;
  const hann  = makeHannWindow(N);

  let noisePow: Float32Array = new Float32Array(bins);
  let noiseAcc: Float32Array = new Float32Array(bins);
  let frameCount = 0;
  let noiseReady = false;

  // Ring buffer for incoming samples
  let ringBuf = new Float32Array(N * 2);
  let ringLen  = 0;

  // OLA accumulator for the next N output samples (no synthesis window needed —
  // for periodic Hann with 50 % overlap, ∑_k hann[n−k·hop] = 1 exactly).
  const outAccum = new Float32Array(N);

  // Pre-allocated analysis frame — reused every hop to avoid per-hop Float32Array
  // allocation inside the process() while-loop.
  const frame = new Float32Array(N);

  // Ready-output buffer: pre-allocated Float32Array replaces the number[] + splice()
  // pattern that created one number[] and one Float32Array per process() call.
  // 64 hops × hop samples = conservative max before a single process() would overflow;
  // typical input blocks are ≪ this.
  const readyBuf = new Float32Array(hop * 64);
  let readyLen = 0;

  // Pre-allocated FFT/IFFT/subtraction work buffers — reused every processFrame()
  // call to eliminate per-frame Float32Array allocations in the audio hot path.
  const fftWorkBuf  = new Float32Array(N * 2);
  const ifftWorkBuf = new Float32Array(N * 2);
  const ifftOutBuf  = new Float32Array(N);
  const subtractBuf = new Float32Array((N / 2 + 1) * 2);

  function processFrame(frame: Float32Array): void {
    const spec = fft(frame, fftWorkBuf);

    // Phase 1: noise profiling
    for (let k = 0; k < bins; k++) {
      const re = spec[k * 2];
      const im = spec[k * 2 + 1];
      if (!noiseReady) noiseAcc[k] += re * re + im * im;
      else noisePow[k] = ns * noisePow[k] + (1 - ns) * (re * re + im * im);
    }
    frameCount++;
    if (!noiseReady && frameCount >= nf) {
      for (let k = 0; k < bins; k++) noisePow[k] = noiseAcc[k] / frameCount;
      noiseReady = true;
    }

    const modified = noiseReady
      ? subtractNoise(spec, noisePow, alpha, floorLin, subtractBuf)
      : spec; // passthrough during profiling

    const recon = ifft(modified, N, ifftWorkBuf, ifftOutBuf);

    // OLA: add IFFT output directly (no synthesis window)
    for (let i = 0; i < N; i++) outAccum[i] += recon[i];

    // Emit the first `hop` samples (they will not be updated further)
    for (let i = 0; i < hop; i++) readyBuf[readyLen++] = outAccum[i];

    // Shift accumulator by hop
    for (let i = 0; i < N - hop; i++) outAccum[i] = outAccum[i + hop];
    for (let i = N - hop; i < N; i++) outAccum[i] = 0;
  }

  function process(input: Float32Array): Float32Array {
    if (input.length === 0) return new Float32Array(0);

    // Append to ring buffer
    if (ringLen + input.length > ringBuf.length) {
      const nb = new Float32Array(Math.max(ringBuf.length * 2, ringLen + input.length));
      nb.set(ringBuf.subarray(0, ringLen));
      ringBuf = nb;
    }
    ringBuf.set(input, ringLen);
    ringLen += input.length;

    // Process complete frames — reuse pre-allocated `frame` to avoid per-hop alloc
    while (ringLen >= N) {
      for (let i = 0; i < N; i++) frame[i] = ringBuf[i] * hann[i];
      processFrame(frame);
      // Shift ring buffer by hop
      ringBuf.copyWithin(0, hop, ringLen);
      ringLen -= hop;
    }

    // Slice the ready buffer: one allocation (the output the caller owns).
    const out = readyBuf.slice(0, readyLen);
    readyLen = 0;
    return out;
  }

  function setNoiseProfile(profile: NoiseProfile): void {
    for (let k = 0; k < Math.min(bins, profile.length); k++) noisePow[k] = profile[k];
    noiseReady = true;
  }

  function flush(): Float32Array {
    if (ringLen > 0) {
      // Reuse the pre-allocated `frame` buffer — zero-pad tail, apply window.
      frame.fill(0);
      frame.set(ringBuf.subarray(0, ringLen));
      for (let i = 0; i < N; i++) frame[i] *= hann[i];
      processFrame(frame);
      ringLen = 0;
    }
    const out = readyBuf.slice(0, readyLen);
    readyLen = 0;
    return out;
  }

  function reset(): void {
    frameCount = 0;
    noiseReady = false;
    noisePow   = new Float32Array(bins);
    noiseAcc   = new Float32Array(bins);
    ringBuf    = new Float32Array(N * 2);
    ringLen    = 0;
    outAccum.fill(0);
    frame.fill(0);
    readyLen = 0;
  }

  return { process, setNoiseProfile, flush, reset };
}
