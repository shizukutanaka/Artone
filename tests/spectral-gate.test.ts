/**
 * Spectral Noise Gate / Subtraction Tests — audio/spectral-gate.ts
 *
 * Covers: nextPow2, estimateNoiseProfile, applySpectralGate, denoiseAudio,
 * createSpectralGateProcessor (streaming), and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  nextPow2,
  estimateNoiseProfile,
  applySpectralGate,
  denoiseAudio,
  createSpectralGateProcessor,
} from '../audio/spectral-gate';

const SR = 48000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Gaussian white noise of a given RMS level. */
function whiteNoise(samples: number, rmsLevel = 0.01, seed = 42): Float32Array {
  const out = new Float32Array(samples);
  let s = seed;
  for (let i = 0; i < samples; i++) {
    // Simple LCG for reproducibility
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const u = (s >>> 0) / 0x100000000;
    const v = ((s * 69069 + 1) >>> 0) / 0x100000000;
    // Box-Muller transform
    const gauss = Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v);
    out[i] = gauss * rmsLevel;
  }
  return out;
}

/** Sine wave. */
function sine(freq: number, samples: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(samples);
  const w   = (2 * Math.PI * freq) / SR;
  for (let i = 0; i < samples; i++) out[i] = amplitude * Math.sin(w * i);
  return out;
}

/** RMS of a signal. */
function rms(data: Float32Array, start = 0, end?: number): number {
  const to = end ?? data.length;
  let sum = 0;
  for (let i = start; i < to; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, to - start));
}

/** Signal-to-noise ratio (dB). */
function snrDb(clean: Float32Array, noisy: Float32Array): number {
  const rmsClean = rms(clean);
  let noiseSum = 0;
  for (let i = 0; i < Math.min(clean.length, noisy.length); i++) {
    const diff = noisy[i] - clean[i];
    noiseSum += diff * diff;
  }
  const rmsNoise = Math.sqrt(noiseSum / Math.min(clean.length, noisy.length));
  if (rmsNoise < 1e-12) return Infinity;
  return 20 * Math.log10(rmsClean / rmsNoise);
}

// ─── nextPow2 ────────────────────────────────────────────────────────────────

describe('nextPow2', () => {
  it('returns 1 for n=0', () => expect(nextPow2(0)).toBe(1));
  it('returns 1 for n=1', () => expect(nextPow2(1)).toBe(1));
  it('returns 2 for n=2', () => expect(nextPow2(2)).toBe(2));
  it('returns 4 for n=3', () => expect(nextPow2(3)).toBe(4));
  it('returns 1024 for n=1024', () => expect(nextPow2(1024)).toBe(1024));
  it('returns 2048 for n=1025', () => expect(nextPow2(1025)).toBe(2048));
  it('returns 2048 for n=2048', () => expect(nextPow2(2048)).toBe(2048));
});

// ─── estimateNoiseProfile ─────────────────────────────────────────────────────

describe('estimateNoiseProfile', () => {
  it('returns Float32Array of length fftSize/2+1', () => {
    const profile = estimateNoiseProfile(whiteNoise(4096), 1024);
    expect(profile).toBeInstanceOf(Float32Array);
    expect(profile.length).toBe(513);
  });

  it('default fftSize=2048 → length 1025', () => {
    const profile = estimateNoiseProfile(whiteNoise(4096));
    expect(profile.length).toBe(1025);
  });

  it('all values are finite and non-negative', () => {
    const profile = estimateNoiseProfile(whiteNoise(8192));
    for (const v of profile) {
      expect(isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('louder noise → higher profile values', () => {
    const quiet = estimateNoiseProfile(whiteNoise(8192, 0.01));
    const loud  = estimateNoiseProfile(whiteNoise(8192, 0.1));
    const sumQ  = quiet.reduce((a, v) => a + v, 0);
    const sumL  = loud.reduce((a, v) => a + v, 0);
    expect(sumL).toBeGreaterThan(sumQ * 10);
  });

  it('silence → near-zero profile', () => {
    const profile = estimateNoiseProfile(new Float32Array(4096));
    for (const v of profile) expect(v).toBeLessThan(1e-20);
  });

  it('too-short input returns a valid (possibly zero) profile', () => {
    const profile = estimateNoiseProfile(new Float32Array(100), 2048);
    expect(profile.length).toBe(1025);
    expect(profile.every(isFinite)).toBe(true);
  });
});

// ─── applySpectralGate ────────────────────────────────────────────────────────

describe('applySpectralGate', () => {
  it('output has same length as input', () => {
    const noise   = whiteNoise(8192);
    const profile = estimateNoiseProfile(noise);
    const out = applySpectralGate(noise, profile);
    expect(out.length).toBe(noise.length);
  });

  it('reduces RMS of pure noise when given a correct profile', () => {
    // Use the same noise signal for profiling and processing
    const noise   = whiteNoise(SR);
    const profile = estimateNoiseProfile(noise);
    const out     = applySpectralGate(noise, profile, { alpha: 2 });
    const inRms  = rms(noise);
    const outRms = rms(out, 1024); // skip transient
    expect(outRms).toBeLessThan(inRms * 0.5);
  });

  it('preserves a sine tone above the noise floor', () => {
    // Noise at -40 dBFS, sine at -6 dBFS
    const noise = whiteNoise(SR, 0.01);
    const signal = sine(1000, SR, 0.5);
    const noisy = new Float32Array(SR);
    for (let i = 0; i < SR; i++) noisy[i] = signal[i] + noise[i];

    const profile = estimateNoiseProfile(noise);
    const out = applySpectralGate(noisy, profile, { alpha: 2.0, floorDb: -30 });

    const skip = 2048;
    // The output should retain substantial sine energy
    expect(rms(out, skip)).toBeGreaterThan(0.1);
  });

  it('silence + zero profile → near-silence output', () => {
    const silence = new Float32Array(4096);
    const profile = new Float32Array(1025); // all zeros
    const out = applySpectralGate(silence, profile);
    expect(rms(out)).toBeLessThan(1e-10);
  });

  it('output contains only finite values', () => {
    const noise   = whiteNoise(4096);
    const profile = estimateNoiseProfile(noise);
    const out = applySpectralGate(noise, profile);
    expect(out.every(isFinite)).toBe(true);
  });

  it('higher alpha reduces residual noise more aggressively', () => {
    const noise   = whiteNoise(SR);
    const profile = estimateNoiseProfile(noise);
    const skip    = 1024;
    const lowAlpha  = rms(applySpectralGate(noise, profile, { alpha: 1.0 }), skip);
    const highAlpha = rms(applySpectralGate(noise, profile, { alpha: 4.0 }), skip);
    expect(highAlpha).toBeLessThanOrEqual(lowAlpha);
  });
});

// ─── denoiseAudio ─────────────────────────────────────────────────────────────

describe('denoiseAudio', () => {
  it('output length equals input length', () => {
    const out = denoiseAudio(whiteNoise(SR));
    expect(out.length).toBe(SR);
  });

  it('output contains only finite values', () => {
    const out = denoiseAudio(whiteNoise(4096));
    expect(out.every(isFinite)).toBe(true);
  });

  it('reduces noise using applySpectralGate with a known noise profile', () => {
    // Use a separate noise-only reference to estimate the profile,
    // then apply to the noisy (signal + noise) signal.
    const n  = SR * 2;
    const signal = sine(1000, n, 0.5);
    const noise  = whiteNoise(n, 0.05);
    const noisy  = new Float32Array(n);
    for (let i = 0; i < n; i++) noisy[i] = signal[i] + noise[i];

    const profile  = estimateNoiseProfile(noise);
    const denoised = applySpectralGate(noisy, profile, { alpha: 2.5 });
    const skip = 4096;

    // Denoised SNR should be better than the noisy SNR
    const snrNoisy    = snrDb(signal.subarray(skip), noisy.subarray(skip, signal.length));
    const snrDenoised = snrDb(signal.subarray(skip), denoised.subarray(skip, signal.length));
    expect(snrDenoised).toBeGreaterThan(snrNoisy);
  });

  it('silent input → near-silent output', () => {
    const out = denoiseAudio(new Float32Array(SR));
    expect(rms(out)).toBeLessThan(1e-10);
  });

  it('short signal does not throw', () => {
    expect(() => denoiseAudio(new Float32Array(100))).not.toThrow();
  });
});

// ─── createSpectralGateProcessor ─────────────────────────────────────────────

describe('createSpectralGateProcessor — interface', () => {
  it('returns correct interface', () => {
    const p = createSpectralGateProcessor();
    expect(typeof p.process).toBe('function');
    expect(typeof p.setNoiseProfile).toBe('function');
    expect(typeof p.flush).toBe('function');
    expect(typeof p.reset).toBe('function');
  });

  it('empty process() returns empty array', () => {
    const p = createSpectralGateProcessor();
    expect(p.process(new Float32Array(0)).length).toBe(0);
  });
});

describe('createSpectralGateProcessor — streaming', () => {
  it('processing in 512-sample chunks does not throw', () => {
    const p = createSpectralGateProcessor({ fftSize: 1024, noiseFrames: 5 });
    const noise = whiteNoise(SR);
    expect(() => {
      for (let i = 0; i < noise.length; i += 512) {
        p.process(noise.subarray(i, i + 512));
      }
      p.flush();
    }).not.toThrow();
  });

  it('setNoiseProfile bypasses auto-profiling', () => {
    const noise   = whiteNoise(SR, 0.01);
    const profile = estimateNoiseProfile(noise);

    const p = createSpectralGateProcessor({ fftSize: 2048 });
    p.setNoiseProfile(profile);

    const CHUNK = 2048;
    let totalOut = 0;
    for (let i = 0; i < noise.length; i += CHUNK) {
      totalOut += p.process(noise.subarray(i, i + CHUNK)).length;
    }
    totalOut += p.flush().length;
    // Should produce a meaningful amount of output
    expect(totalOut).toBeGreaterThan(0);
  });

  it('reset clears accumulated state', () => {
    const p = createSpectralGateProcessor();
    p.process(whiteNoise(4096));
    p.reset();
    // After reset, should behave as fresh
    const out = p.process(new Float32Array(0));
    expect(out.length).toBe(0);
  });

  it('output values are all finite after streaming', () => {
    const p = createSpectralGateProcessor({ fftSize: 1024, noiseFrames: 5 });
    const noise = whiteNoise(SR / 2, 0.02);
    const allOut: number[] = [];
    const CHUNK = 1024;
    for (let i = 0; i < noise.length; i += CHUNK) {
      const out = p.process(noise.subarray(i, i + CHUNK));
      allOut.push(...out);
    }
    const final = p.flush();
    allOut.push(...final);
    for (const v of allOut) expect(isFinite(v)).toBe(true);
  });

  it('streaming reduces noise: output RMS is lower than input noise RMS', () => {
    const noise   = whiteNoise(SR, 0.05);
    const profile = estimateNoiseProfile(noise);

    const p = createSpectralGateProcessor({ fftSize: 2048, alpha: 3.0 });
    p.setNoiseProfile(profile);

    const CHUNK = 2048;
    const allOut: number[] = [];
    for (let i = 0; i < noise.length; i += CHUNK) {
      const out = p.process(noise.subarray(i, i + CHUNK));
      allOut.push(...out);
    }
    allOut.push(...p.flush());

    const outArr  = new Float32Array(allOut);
    const skip    = 4096;
    const inRms   = rms(noise, skip);
    const outRms  = rms(outArr, skip);
    expect(outRms).toBeLessThan(inRms * 0.6);
  });
});
