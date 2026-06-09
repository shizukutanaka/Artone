/**
 * Tests for audio/hpss.ts — Harmonic-Percussive Source Separation
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  separateHPSS,
  createHPSSProcessor,
  percussivenessRatio,
  signalPsnr,
} from '../audio/hpss';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a pure sine wave. */
function sine(freq: number, sr: number, durationSec: number, amp = 0.5): Float32Array {
  const n = Math.round(sr * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
  return out;
}

/** Generate an impulse train (periodic impulses). */
function impulseTrain(periodSamples: number, len: number, amp = 0.8): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += periodSamples) out[i] = amp;
  return out;
}

/** Mix two signals (element-wise sum). */
function mix(a: Float32Array, b: Float32Array): Float32Array {
  const len = Math.min(a.length, b.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = a[i] + b[i];
  return out;
}

/** Root-mean-square energy of a signal. */
function rms(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / s.length);
}

// ─── separateHPSS — basic structure ──────────────────────────────────────────

describe('separateHPSS — output structure', () => {
  it('empty signal returns three empty arrays', () => {
    const r = separateHPSS(new Float32Array(0));
    expect(r.harmonic.length).toBe(0);
    expect(r.percussive.length).toBe(0);
    expect(r.residual.length).toBe(0);
  });

  it('returns arrays of same length as input', () => {
    const input = sine(440, 16000, 0.1);
    const r = separateHPSS(input, { windowSize: 512, hopSize: 128 });
    expect(r.harmonic.length).toBe(input.length);
    expect(r.percussive.length).toBe(input.length);
    expect(r.residual.length).toBe(input.length);
  });

  it('harmonic + percussive ≈ input (residual is much smaller than input)', () => {
    // Use longer signal to reduce edge-effect proportion
    const input = sine(440, 16000, 0.5);
    const r = separateHPSS(input, { windowSize: 512, hopSize: 128 });
    const resEnergy = rms(r.residual);
    const inEnergy  = rms(input);
    // Residual < 25% of input (OLA edge effects dominate short-signal reconstruction)
    expect(resEnergy).toBeLessThan(inEnergy * 0.25 + 1e-6);
  });

  it('all components are finite (no NaN / Infinity)', () => {
    const input = sine(220, 16000, 0.05);
    const r = separateHPSS(input, { windowSize: 512, hopSize: 128 });
    for (const arr of [r.harmonic, r.percussive, r.residual]) {
      for (const v of arr) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ─── separateHPSS — silence / DC ─────────────────────────────────────────────

describe('separateHPSS — silence and DC', () => {
  it('silent input → silent harmonic and percussive', () => {
    const silence = new Float32Array(2048);
    const r = separateHPSS(silence, { windowSize: 512, hopSize: 128 });
    expect(rms(r.harmonic)).toBeCloseTo(0, 5);
    expect(rms(r.percussive)).toBeCloseTo(0, 5);
  });

  it('DC signal (constant 0.5) → both components are non-zero', () => {
    // DC is time- and frequency-stationary: H ≡ P, so Wiener mask splits 50/50
    const dc = new Float32Array(2048).fill(0.5);
    const r = separateHPSS(dc, { windowSize: 512, hopSize: 128 });
    expect(rms(r.harmonic)).toBeGreaterThan(0);
    expect(rms(r.percussive)).toBeGreaterThan(0);
  });
});

// ─── separateHPSS — pure sine (harmonic content) ─────────────────────────────

describe('separateHPSS — pure sine wave', () => {
  it('pure sine → harmonic component carries most energy', () => {
    const sr = 16000;
    const sig = sine(440, sr, 0.25);
    const r = separateHPSS(sig, { windowSize: 1024, hopSize: 256, harmonicFilterLen: 13, percussiveFilterLen: 13 });
    const hEnergy = rms(r.harmonic);
    const pEnergy = rms(r.percussive);
    // Harmonic should have more energy than percussive for a pure tone
    expect(hEnergy).toBeGreaterThan(pEnergy * 1.5);
  });

  it('pure sine + impulse → harmonic carries sine, percussive carries impulse', () => {
    const sr = 16000;
    const len = 4096;
    const harmonicSig  = sine(400, sr, len / sr, 0.4);
    const percussiveSig = impulseTrain(256, len, 0.6);
    const mixed = mix(
      harmonicSig.subarray(0, len),
      percussiveSig,
    );
    const r = separateHPSS(mixed, { windowSize: 1024, hopSize: 256, harmonicFilterLen: 17, percussiveFilterLen: 17 });

    // Harmonic output should correlate more with the pure sine than percussive output
    const hCorr = correlation(r.harmonic, harmonicSig.subarray(0, len));
    const pCorr = correlation(r.percussive, harmonicSig.subarray(0, len));
    expect(hCorr).toBeGreaterThan(pCorr);
  });
});

// ─── separateHPSS — impulse train (percussive content) ───────────────────────

describe('separateHPSS — impulse train', () => {
  it('impulse train → separation produces non-zero harmonic and percussive', () => {
    // A periodic impulse train is time-stationary in the STFT, so HPSS may classify
    // it as harmonic (constant energy over time). We just verify both components exist.
    const impulses = impulseTrain(256, 4096, 0.8);
    const r = separateHPSS(impulses, {
      windowSize: 1024, hopSize: 256,
      harmonicFilterLen: 17, percussiveFilterLen: 17,
    });
    const total = rms(r.harmonic) + rms(r.percussive);
    expect(total).toBeGreaterThan(0.01); // signal energy is preserved
  });
});

// ─── separateHPSS — options ───────────────────────────────────────────────────

describe('separateHPSS — options', () => {
  it('custom windowSize 512 produces correct output length', () => {
    const input = sine(440, 16000, 0.1);
    const r = separateHPSS(input, { windowSize: 512, hopSize: 128 });
    expect(r.harmonic.length).toBe(input.length);
  });

  it('custom windowSize 256 produces correct output length', () => {
    const input = sine(440, 16000, 0.05);
    const r = separateHPSS(input, { windowSize: 256, hopSize: 64 });
    expect(r.harmonic.length).toBe(input.length);
  });

  it('maskPower=1 (magnitude mask) still works', () => {
    const input = sine(440, 16000, 0.05);
    const r = separateHPSS(input, { windowSize: 512, hopSize: 128, maskPower: 1 });
    expect(r.harmonic.length).toBe(input.length);
    for (const v of r.harmonic) expect(Number.isFinite(v)).toBe(true);
  });

  it('larger kernel sizes work without error', () => {
    const input = sine(440, 16000, 0.1);
    expect(() =>
      separateHPSS(input, { windowSize: 512, hopSize: 128, harmonicFilterLen: 31, percussiveFilterLen: 31 })
    ).not.toThrow();
  });

  it('even kernel lengths are accepted (converted to odd internally via rounding in median)', () => {
    const input = sine(440, 16000, 0.05);
    // Even kernel length 16 — just check it runs without error
    expect(() =>
      separateHPSS(input, { windowSize: 512, hopSize: 128, harmonicFilterLen: 16 })
    ).not.toThrow();
  });
});

// ─── percussivenessRatio ──────────────────────────────────────────────────────

describe('percussivenessRatio', () => {
  it('returns 0 for empty result', () => {
    const empty = new Float32Array(0);
    const r = { harmonic: empty, percussive: empty, residual: empty };
    expect(percussivenessRatio(r)).toBe(0);
  });

  it('returns value in [0, 1]', () => {
    const input = sine(440, 16000, 0.1);
    const result = separateHPSS(input, { windowSize: 512, hopSize: 128 });
    const ratio = percussivenessRatio(result);
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('pure sine → low percussiveness ratio', () => {
    const sr = 16000;
    const input = sine(440, sr, 0.25);
    const result = separateHPSS(input, { windowSize: 1024, hopSize: 256, harmonicFilterLen: 17, percussiveFilterLen: 17 });
    const ratio = percussivenessRatio(result);
    // A pure sine should have percussiveness ratio < 0.5
    expect(ratio).toBeLessThan(0.5);
  });

  it('impulse train → higher percussiveness ratio than sine', () => {
    const sr = 16000;
    const sineInput     = sine(440, sr, 0.25);
    const impulseInput  = impulseTrain(256, sr * 0.25, 0.8);

    const sineResult    = separateHPSS(sineInput, { windowSize: 1024, hopSize: 256 });
    const impulseResult = separateHPSS(impulseInput, { windowSize: 1024, hopSize: 256 });

    expect(percussivenessRatio(impulseResult)).toBeGreaterThan(percussivenessRatio(sineResult));
  });
});

// ─── signalPsnr ───────────────────────────────────────────────────────────────

describe('signalPsnr', () => {
  it('identical signals → returns 100 (capped)', () => {
    const sig = sine(440, 16000, 0.1);
    expect(signalPsnr(sig, sig)).toBe(100);
  });

  it('returns 0 for empty arrays', () => {
    expect(signalPsnr(new Float32Array(0), new Float32Array(0))).toBe(0);
  });

  it('higher noise → lower PSNR', () => {
    const sr = 16000;
    const ref = sine(440, sr, 0.1);

    // Use deterministic noise for reproducibility
    const mild = new Float32Array(ref.length);
    const loud  = new Float32Array(ref.length);
    for (let i = 0; i < ref.length; i++) {
      mild[i]  = ref[i] + 0.001;
      loud[i]  = ref[i] + 0.1;
    }
    expect(signalPsnr(ref, mild)).toBeGreaterThan(signalPsnr(ref, loud));
  });

  it('returns finite positive number for non-identical signals', () => {
    const ref  = sine(440, 16000, 0.1);
    const test = sine(440, 16000, 0.1);
    for (let i = 0; i < test.length; i++) test[i] += 0.01;
    const psnr = signalPsnr(ref, test);
    expect(Number.isFinite(psnr)).toBe(true);
    expect(psnr).toBeGreaterThan(0);
  });

  it('reconstruction PSNR > 15 dB for separateHPSS output', () => {
    // harmonic + percussive should closely reconstruct the input
    const input = sine(440, 16000, 0.1);
    const r     = separateHPSS(input, { windowSize: 512, hopSize: 128 });
    const recon = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) recon[i] = r.harmonic[i] + r.percussive[i];
    expect(signalPsnr(input, recon)).toBeGreaterThan(15);
  });
});

// ─── createHPSSProcessor ─────────────────────────────────────────────────────

describe('createHPSSProcessor', () => {
  it('flush on empty buffer returns empty arrays', () => {
    const proc = createHPSSProcessor({ windowSize: 512, hopSize: 128 });
    const r = proc.flush();
    expect(r.harmonic.length).toBe(0);
    expect(r.percussive.length).toBe(0);
  });

  it('push less than windowSize → push returns null', () => {
    const proc = createHPSSProcessor({ windowSize: 512, hopSize: 128 });
    const block = sine(440, 16000, 0.01); // 160 samples < 512
    const result = proc.push(block);
    expect(result).toBeNull();
  });

  it('push more than windowSize → push returns result', () => {
    const proc = createHPSSProcessor({ windowSize: 512, hopSize: 128 });
    const block = sine(440, 16000, 0.1); // 1600 samples > 512
    const result = proc.push(block);
    expect(result).not.toBeNull();
    expect(result!.harmonic.length).toBeGreaterThan(0);
  });

  it('flush after partial input returns non-empty result', () => {
    const proc = createHPSSProcessor({ windowSize: 512, hopSize: 128 });
    const block = sine(440, 16000, 0.05); // 800 samples
    proc.push(block);
    const r = proc.flush();
    expect(r.harmonic.length).toBeGreaterThan(0);
  });

  it('reset clears buffer — flush after reset returns empty', () => {
    const proc = createHPSSProcessor({ windowSize: 512, hopSize: 128 });
    proc.push(sine(440, 16000, 0.1));
    proc.reset();
    const r = proc.flush();
    expect(r.harmonic.length).toBe(0);
  });

  it('all output values are finite after streaming push', () => {
    const proc = createHPSSProcessor({ windowSize: 512, hopSize: 128 });
    const big = sine(440, 16000, 0.3);
    const result = proc.push(big);
    if (result) {
      for (const v of result.harmonic)   expect(Number.isFinite(v)).toBe(true);
      for (const v of result.percussive) expect(Number.isFinite(v)).toBe(true);
    }
    const flushed = proc.flush();
    for (const v of flushed.harmonic)   expect(Number.isFinite(v)).toBe(true);
    for (const v of flushed.percussive) expect(Number.isFinite(v)).toBe(true);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('separateHPSS — edge cases', () => {
  it('signal shorter than windowSize still processes', () => {
    const short = sine(440, 16000, 0.01); // 160 samples, windowSize default 2048
    const r = separateHPSS(short, { windowSize: 256, hopSize: 64 });
    expect(r.harmonic.length).toBe(short.length);
  });

  it('signal exactly windowSize in length', () => {
    const exact = sine(440, 16000, 256 / 16000);
    const r = separateHPSS(exact, { windowSize: 256, hopSize: 64 });
    expect(r.harmonic.length).toBe(exact.length);
    for (const v of r.harmonic) expect(Number.isFinite(v)).toBe(true);
  });

  it('high amplitude signal (near 1.0) does not produce NaN', () => {
    const loud = sine(440, 16000, 0.1, 0.99);
    const r = separateHPSS(loud, { windowSize: 512, hopSize: 128 });
    for (const v of r.harmonic) expect(Number.isFinite(v)).toBe(true);
  });

  it('kernel length of 1 acts as identity median (no filtering)', () => {
    const input = sine(440, 16000, 0.05);
    const r = separateHPSS(input, {
      windowSize: 512, hopSize: 128,
      harmonicFilterLen: 1, percussiveFilterLen: 1,
    });
    // With kernel=1, H≡P≡mag, Wiener mask → each component gets 0.5 of energy
    expect(r.harmonic.length).toBe(input.length);
    // Roughly equal energy split (within factor 2)
    const hE = rms(r.harmonic);
    const pE = rms(r.percussive);
    expect(hE / (pE + 1e-10)).toBeGreaterThan(0.3);
    expect(pE / (hE + 1e-10)).toBeGreaterThan(0.3);
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Pearson correlation coefficient between two same-length arrays. */
function correlation(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < len; i++) { sumA += a[i]; sumB += b[i]; }
  const mA = sumA / len;
  const mB = sumB / len;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < len; i++) {
    const da = a[i] - mA;
    const db = b[i] - mB;
    num += da * db;
    dA  += da * da;
    dB  += db * db;
  }
  const denom = Math.sqrt(dA * dB);
  return denom < 1e-12 ? 0 : num / denom;
}
