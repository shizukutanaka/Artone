/**
 * Tests for audio/restoration.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  measureDcOffset,
  removeDcOffset,
  highPassDcBlock,
  declick,
  declip,
  ampToDbfs,
  trimSilence,
  countClippedSamples,
  peakAmplitude,
} from '../audio/restoration';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sine(freq: number, sr: number, durSec: number, amp = 0.5): Float32Array {
  const n = Math.round(sr * durSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
  return out;
}

function rms(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / s.length);
}

// ─── measureDcOffset ──────────────────────────────────────────────────────────

describe('measureDcOffset', () => {
  it('zero-mean sine has ~0 offset', () => {
    const s = sine(440, 48000, 0.1);
    expect(Math.abs(measureDcOffset(s))).toBeLessThan(0.01);
  });

  it('constant signal offset equals the constant', () => {
    const s = new Float32Array(100).fill(0.3);
    expect(measureDcOffset(s)).toBeCloseTo(0.3, 6);
  });

  it('empty signal → 0', () => {
    expect(measureDcOffset(new Float32Array(0))).toBe(0);
  });

  it('detects added offset', () => {
    const s = sine(440, 48000, 0.1);
    for (let i = 0; i < s.length; i++) s[i] += 0.2;
    expect(measureDcOffset(s)).toBeCloseTo(0.2, 2);
  });
});

// ─── removeDcOffset ───────────────────────────────────────────────────────────

describe('removeDcOffset', () => {
  it('centers an offset signal on zero', () => {
    const s = sine(440, 48000, 0.1);
    for (let i = 0; i < s.length; i++) s[i] += 0.25;
    const out = removeDcOffset(s);
    expect(Math.abs(measureDcOffset(out))).toBeLessThan(1e-6);
  });

  it('preserves length', () => {
    const s = sine(440, 48000, 0.05);
    expect(removeDcOffset(s).length).toBe(s.length);
  });

  it('does not mutate input', () => {
    const s = new Float32Array([1, 2, 3]);
    const copy = Float32Array.from(s);
    removeDcOffset(s);
    expect(Array.from(s)).toEqual(Array.from(copy));
  });

  it('preserves AC content (RMS of zero-mean part unchanged)', () => {
    const s = sine(440, 48000, 0.1, 0.5);
    const rmsBefore = rms(s);
    for (let i = 0; i < s.length; i++) s[i] += 0.3;
    const out = removeDcOffset(s);
    expect(rms(out)).toBeCloseTo(rmsBefore, 3);
  });
});

// ─── highPassDcBlock ──────────────────────────────────────────────────────────

describe('highPassDcBlock', () => {
  it('removes a constant DC offset over time', () => {
    const s = new Float32Array(48000).fill(0.5);
    const out = highPassDcBlock(s, 48000, 20);
    // After settling, output should approach 0
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.05);
  });

  it('passes high frequencies largely intact', () => {
    const s = sine(2000, 48000, 0.2, 0.5);
    const out = highPassDcBlock(s, 48000, 20);
    // High frequency well above cutoff → RMS roughly preserved
    expect(rms(out)).toBeGreaterThan(rms(s) * 0.8);
  });

  it('empty signal → empty output', () => {
    expect(highPassDcBlock(new Float32Array(0), 48000).length).toBe(0);
  });

  it('preserves length', () => {
    const s = sine(440, 48000, 0.05);
    expect(highPassDcBlock(s, 48000).length).toBe(s.length);
  });
});

// ─── declick ──────────────────────────────────────────────────────────────────

describe('declick', () => {
  it('clean signal yields no clicks', () => {
    const s = sine(440, 48000, 0.1, 0.5);
    const r = declick(s);
    expect(r.clickPositions.length).toBe(0);
  });

  it('detects and repairs an injected click', () => {
    const s = sine(440, 48000, 0.1, 0.3);
    const clickIdx = 1000;
    s[clickIdx] = 0.99; // sharp impulse
    const r = declick(s);
    expect(r.clickPositions.length).toBeGreaterThan(0);
    // Repaired value should be much closer to neighbours than the spike
    expect(Math.abs(r.output[clickIdx])).toBeLessThan(0.9);
  });

  it('repair reduces the spike magnitude', () => {
    const s = sine(200, 48000, 0.1, 0.2);
    s[500] = 1.0;
    const before = Math.abs(s[500]);
    const r = declick(s);
    expect(Math.abs(r.output[500])).toBeLessThan(before);
  });

  it('preserves length', () => {
    const s = sine(440, 48000, 0.05);
    expect(declick(s).output.length).toBe(s.length);
  });

  it('does not mutate input', () => {
    const s = sine(440, 48000, 0.02, 0.2);
    s[100] = 1.0;
    const copy = Float32Array.from(s);
    declick(s);
    expect(Array.from(s)).toEqual(Array.from(copy));
  });

  it('handles very short signals without error', () => {
    expect(declick(new Float32Array([0.1, 0.2])).output.length).toBe(2);
    expect(declick(new Float32Array(0)).output.length).toBe(0);
  });
});

// ─── declip ───────────────────────────────────────────────────────────────────

describe('declip', () => {
  it('clean signal yields no repairs', () => {
    const s = sine(440, 48000, 0.1, 0.5);
    const r = declip(s);
    expect(r.regionsRepaired).toBe(0);
  });

  it('detects and repairs a clipped region', () => {
    // Build a signal whose peak is clipped flat
    const sr = 48000;
    const s = sine(100, sr, 0.05, 1.5); // amplitude 1.5 → will clip
    for (let i = 0; i < s.length; i++) s[i] = Math.max(-1, Math.min(1, s[i]));
    const clippedBefore = countClippedSamples(s, 0.98);
    const r = declip(s, { clipThreshold: 0.98, minRunLength: 2 });
    expect(r.regionsRepaired).toBeGreaterThan(0);
    // After repair, fewer samples should be pinned exactly at ceiling
    const flatAfter = countClippedSamples(r.output, 0.999);
    expect(flatAfter).toBeLessThan(clippedBefore);
  });

  it('restored peak reaches at least the clip ceiling', () => {
    const sr = 48000;
    const s = sine(100, sr, 0.05, 1.5);
    for (let i = 0; i < s.length; i++) s[i] = Math.max(-1, Math.min(1, s[i]));
    const r = declip(s, { clipThreshold: 0.98 });
    expect(peakAmplitude(r.output)).toBeGreaterThanOrEqual(0.98);
  });

  it('preserves length', () => {
    const s = sine(440, 48000, 0.05);
    expect(declip(s).output.length).toBe(s.length);
  });

  it('does not mutate input', () => {
    const s = sine(100, 48000, 0.02, 1.5);
    for (let i = 0; i < s.length; i++) s[i] = Math.max(-1, Math.min(1, s[i]));
    const copy = Float32Array.from(s);
    declip(s);
    expect(Array.from(s)).toEqual(Array.from(copy));
  });

  it('handles very short signals without error', () => {
    expect(declip(new Float32Array([1, 1, 1])).output.length).toBe(3);
  });

  it('does not repair runs shorter than minRunLength', () => {
    const s = sine(440, 48000, 0.05, 0.3);
    s[200] = 1.0; // single clipped sample
    const r = declip(s, { clipThreshold: 0.98, minRunLength: 3 });
    expect(r.regionsRepaired).toBe(0);
  });
});

// ─── ampToDbfs ────────────────────────────────────────────────────────────────

describe('ampToDbfs', () => {
  it('full scale → 0 dB', () => {
    expect(ampToDbfs(1)).toBeCloseTo(0, 6);
  });

  it('half scale → ~−6 dB', () => {
    expect(ampToDbfs(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('zero → −Infinity', () => {
    expect(ampToDbfs(0)).toBe(-Infinity);
  });
});

// ─── trimSilence ──────────────────────────────────────────────────────────────

describe('trimSilence', () => {
  it('removes leading and trailing silence', () => {
    const sr = 48000;
    const tone = sine(440, sr, 0.05, 0.5);
    const lead = new Float32Array(1000); // silence
    const tail = new Float32Array(1000); // silence
    const full = new Float32Array(lead.length + tone.length + tail.length);
    full.set(lead, 0);
    full.set(tone, lead.length);
    full.set(tail, lead.length + tone.length);

    const r = trimSilence(full, -60);
    expect(r.startSample).toBeGreaterThanOrEqual(900);
    expect(r.startSample).toBeLessThanOrEqual(1100);
    expect(r.output.length).toBeLessThan(full.length);
    expect(r.output.length).toBeGreaterThan(tone.length * 0.8);
  });

  it('entirely silent signal → empty output', () => {
    const r = trimSilence(new Float32Array(1000), -60);
    expect(r.output.length).toBe(0);
    expect(r.startSample).toBe(0);
    expect(r.endSample).toBe(0);
  });

  it('signal with no silence is unchanged in length', () => {
    // Constant loud signal — no sample falls below the silence floor
    const loud = new Float32Array(2400).fill(0.8);
    const r = trimSilence(loud, -60);
    expect(r.output.length).toBe(loud.length);
    expect(r.startSample).toBe(0);
  });

  it('startSample and endSample bound the output length', () => {
    const sr = 48000;
    const tone = sine(440, sr, 0.05, 0.5);
    const full = new Float32Array(500 + tone.length + 500);
    full.set(tone, 500);
    const r = trimSilence(full, -60);
    expect(r.endSample - r.startSample).toBe(r.output.length);
  });
});

// ─── countClippedSamples / peakAmplitude ─────────────────────────────────────

describe('countClippedSamples', () => {
  it('counts samples at/above threshold', () => {
    const s = new Float32Array([0.1, 0.99, 1.0, -1.0, 0.5]);
    expect(countClippedSamples(s, 0.98)).toBe(3);
  });

  it('clean signal → 0', () => {
    const s = sine(440, 48000, 0.05, 0.5);
    expect(countClippedSamples(s, 0.98)).toBe(0);
  });
});

describe('peakAmplitude', () => {
  it('returns max absolute value', () => {
    expect(peakAmplitude(new Float32Array([0.2, -0.8, 0.5]))).toBeCloseTo(0.8, 6);
  });

  it('empty signal → 0', () => {
    expect(peakAmplitude(new Float32Array(0))).toBe(0);
  });

  it('matches sine amplitude', () => {
    const s = sine(440, 48000, 0.1, 0.7);
    expect(peakAmplitude(s)).toBeGreaterThan(0.6);
    expect(peakAmplitude(s)).toBeLessThanOrEqual(0.7 + 1e-6);
  });
});
