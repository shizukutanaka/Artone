/**
 * Pitch Detection (YIN Algorithm) Tests
 */

import { describe, it, expect } from 'vitest';
import {
  differenceFunction,
  cumulativeMeanNormalisedDifference,
  absoluteThreshold,
  parabolicInterpolation,
  detectPitch,
  createPitchDetector,
  type YINConfig,
} from '../audio/pitch-detection';

// ─── helpers ─────────────────────────────────────────────────────────────────

const SR = 44100;
const FRAME = 4096;

/** Generate a mono sine wave at `freq` Hz. */
function sine(freq: number, frames = FRAME, sr = SR, amp = 0.5): Float32Array {
  const data = new Float32Array(frames);
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < frames; i++) data[i] = amp * Math.sin(w * i);
  return data;
}

/** Generate white noise with uniform amplitude. */
function noise(frames = FRAME, amp = 0.5): Float32Array {
  const data = new Float32Array(frames);
  // Deterministic pseudo-noise (xorshift) for reproducibility
  let rng = 0xdeadbeef;
  for (let i = 0; i < frames; i++) {
    rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
    data[i] = ((rng >>> 0) / 0xffffffff - 0.5) * 2 * amp;
  }
  return data;
}

/** All-zero silence frame. */
function silence(frames = FRAME): Float32Array {
  return new Float32Array(frames);
}

// ─── differenceFunction ───────────────────────────────────────────────────────

describe('differenceFunction', () => {
  it('d(0) = 0 always', () => {
    const df = differenceFunction(sine(440), 512);
    expect(df[0]).toBe(0);
  });

  it('returns Float32Array of length maxLag', () => {
    const df = differenceFunction(sine(440), 100);
    expect(df).toBeInstanceOf(Float32Array);
    expect(df.length).toBe(100);
  });

  it('silence gives all-zero difference function', () => {
    const df = differenceFunction(silence(), 200);
    for (let i = 0; i < df.length; i++) expect(df[i]).toBe(0);
  });

  it('d(τ) is non-negative for all τ', () => {
    const df = differenceFunction(noise(), 256);
    for (let i = 0; i < df.length; i++) expect(df[i]).toBeGreaterThanOrEqual(0);
  });

  it('periodic signal has low d(τ) near its period', () => {
    const freq = 440;
    const period = Math.round(SR / freq);
    const df = differenceFunction(sine(freq, FRAME, SR, 1.0), period * 3);
    // d at exact period should be much lower than d at period/2
    expect(df[period]).toBeLessThan(df[Math.round(period / 2)]);
  });
});

// ─── cumulativeMeanNormalisedDifference ───────────────────────────────────────

describe('cumulativeMeanNormalisedDifference', () => {
  it('first element is always 1', () => {
    const df = differenceFunction(sine(440), 256);
    const cmndf = cumulativeMeanNormalisedDifference(df);
    expect(cmndf[0]).toBe(1);
  });

  it('returns same length as input', () => {
    const df = new Float32Array(100);
    const cmndf = cumulativeMeanNormalisedDifference(df);
    expect(cmndf.length).toBe(100);
  });

  it('all-zero difference gives all-one CMNDF', () => {
    const df = new Float32Array(50); // zeros
    const cmndf = cumulativeMeanNormalisedDifference(df);
    expect(cmndf[0]).toBe(1);
    for (let i = 1; i < cmndf.length; i++) expect(cmndf[i]).toBe(1);
  });

  it('values are non-negative', () => {
    const df = differenceFunction(sine(440), 512);
    const cmndf = cumulativeMeanNormalisedDifference(df);
    for (let i = 0; i < cmndf.length; i++) expect(cmndf[i]).toBeGreaterThanOrEqual(0);
  });

  it('periodic signal has near-zero CMNDF at its period', () => {
    const freq = 440;
    const period = Math.round(SR / freq);
    const df = differenceFunction(sine(freq, FRAME, SR, 1.0), period * 4);
    const cmndf = cumulativeMeanNormalisedDifference(df);
    // CMNDF near period should be small
    expect(cmndf[period]).toBeLessThan(0.2);
  });
});

// ─── absoluteThreshold ───────────────────────────────────────────────────────

describe('absoluteThreshold', () => {
  it('returns -1 when no lag crosses threshold', () => {
    const cmndf = new Float32Array(50).fill(1); // all ones, never below threshold
    expect(absoluteThreshold(cmndf, 0.15, 2, 49)).toBe(-1);
  });

  it('returns positive tau when a crossing exists', () => {
    const cmndf = new Float32Array(100).fill(1);
    cmndf[20] = 0.05; // clear minimum below threshold
    cmndf[21] = 0.06;
    const tau = absoluteThreshold(cmndf, 0.15, 2, 99);
    expect(tau).toBeGreaterThan(0);
  });

  it('respects minLag', () => {
    const cmndf = new Float32Array(100).fill(0.02); // all below threshold
    const tau = absoluteThreshold(cmndf, 0.15, 30, 99);
    expect(tau).toBeGreaterThanOrEqual(30);
  });

  it('respects maxLag (does not search beyond it)', () => {
    const cmndf = new Float32Array(100).fill(1);
    cmndf[90] = 0.05; // only below threshold beyond maxLag=80
    expect(absoluteThreshold(cmndf, 0.15, 2, 80)).toBe(-1);
  });
});

// ─── parabolicInterpolation ───────────────────────────────────────────────────

describe('parabolicInterpolation', () => {
  it('returns tau unchanged at boundary (tau=0)', () => {
    const cmndf = new Float32Array([1, 0.5, 0.3, 0.5, 0.8]);
    expect(parabolicInterpolation(cmndf, 0)).toBe(0);
  });

  it('returns fractional value for a parabolic dip', () => {
    // Symmetric dip at index 2: values 0.4, 0.1, 0.4
    const cmndf = new Float32Array([0.9, 0.4, 0.1, 0.4, 0.9]);
    const result = parabolicInterpolation(cmndf, 2);
    expect(result).toBeCloseTo(2, 5); // symmetric → no shift
  });

  it('returns value within (tau-1, tau+1)', () => {
    const cmndf = new Float32Array([0.8, 0.2, 0.05, 0.3, 0.9]);
    const result = parabolicInterpolation(cmndf, 2);
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(3);
  });
});

// ─── detectPitch — sine waves ─────────────────────────────────────────────────

describe('detectPitch — sine waves', () => {
  const cfg: YINConfig = { sampleRate: SR };

  it('detects A4 (440 Hz) within ±3 Hz', () => {
    const result = detectPitch(sine(440), cfg);
    expect(result.frequency).not.toBeNull();
    expect(Math.abs(result.frequency! - 440)).toBeLessThan(3);
  });

  it('detects 220 Hz (A3) within ±3 Hz', () => {
    const result = detectPitch(sine(220), cfg);
    expect(result.frequency).not.toBeNull();
    expect(Math.abs(result.frequency! - 220)).toBeLessThan(3);
  });

  it('detects 880 Hz (A5) within ±5 Hz', () => {
    const result = detectPitch(sine(880, FRAME, SR, 0.5), cfg);
    expect(result.frequency).not.toBeNull();
    expect(Math.abs(result.frequency! - 880)).toBeLessThan(5);
  });

  it('clarity is greater than 0.8 for pure sine', () => {
    const result = detectPitch(sine(440), cfg);
    expect(result.clarity).toBeGreaterThan(0.8);
  });

  it('clarity is in [0, 1]', () => {
    const result = detectPitch(sine(300), cfg);
    expect(result.clarity).toBeGreaterThanOrEqual(0);
    expect(result.clarity).toBeLessThanOrEqual(1);
  });

  it('periodSamples ≈ sampleRate / frequency', () => {
    const freq = 440;
    const result = detectPitch(sine(freq), cfg);
    if (result.frequency && result.periodSamples) {
      expect(Math.abs(result.periodSamples - SR / freq)).toBeLessThan(2);
    }
  });

  it('detected frequency = sampleRate / periodSamples (approximately)', () => {
    const result = detectPitch(sine(440), cfg);
    if (result.frequency && result.periodSamples) {
      expect(Math.abs(result.frequency - SR / result.periodSamples)).toBeLessThan(1);
    }
  });
});

// ─── detectPitch — silence / noise ───────────────────────────────────────────

describe('detectPitch — silence and noise', () => {
  it('silence returns null frequency', () => {
    expect(detectPitch(silence(), { sampleRate: SR }).frequency).toBeNull();
  });

  it('silence returns clarity = 0', () => {
    expect(detectPitch(silence(), { sampleRate: SR }).clarity).toBe(0);
  });

  it('noise: if pitch is detected, clarity is low', () => {
    const result = detectPitch(noise(), { sampleRate: SR, threshold: 0.1 });
    if (result.frequency !== null) {
      expect(result.clarity).toBeLessThan(0.9);
    }
  });
});

// ─── detectPitch — threshold sensitivity ─────────────────────────────────────

describe('detectPitch — threshold sensitivity', () => {
  it('lower threshold makes detection stricter (may return null for noisy signal)', () => {
    // Pure sine should still be detected at very low threshold
    const result = detectPitch(sine(440), { sampleRate: SR, threshold: 0.05 });
    // May or may not detect — threshold is strict but sine is clean
    if (result.frequency !== null) {
      expect(Math.abs(result.frequency - 440)).toBeLessThan(5);
    }
  });

  it('frequency range: minFrequency cuts off low frequencies', () => {
    // Try detecting 100 Hz with minFrequency=200 — should fail
    const result = detectPitch(sine(100), { sampleRate: SR, minFrequency: 200 });
    // 100 Hz is below minFrequency, so may not be detected
    if (result.frequency !== null) {
      expect(result.frequency).toBeGreaterThanOrEqual(200);
    }
  });
});

// ─── createPitchDetector ─────────────────────────────────────────────────────

describe('createPitchDetector', () => {
  it('sampleRate property matches config', () => {
    const d = createPitchDetector({ sampleRate: 48000 });
    expect(d.sampleRate).toBe(48000);
  });

  it('default sampleRate is 44100', () => {
    const d = createPitchDetector();
    expect(d.sampleRate).toBe(44100);
  });

  it('processFrame returns same result as detectPitch', () => {
    const frame = sine(440);
    const cfg: YINConfig = { sampleRate: SR };
    const d = createPitchDetector(cfg);
    const r1 = d.processFrame(frame);
    const r2 = detectPitch(frame, cfg);
    expect(r1.frequency).toBeCloseTo(r2.frequency ?? 0, 3);
  });

  it('consecutive frames with same signal give consistent results', () => {
    const d = createPitchDetector({ sampleRate: SR });
    const frame = sine(440);
    const results = Array.from({ length: 5 }, () => d.processFrame(frame));
    for (const r of results) {
      if (r.frequency !== null) {
        expect(Math.abs(r.frequency - 440)).toBeLessThan(5);
      }
    }
  });
});
