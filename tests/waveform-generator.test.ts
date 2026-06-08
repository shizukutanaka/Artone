/**
 * Waveform Generator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  computeWaveform,
  computeWaveformMultichannel,
  normalizeWaveform,
  downsampleWaveform,
  type WaveformOptions,
} from '../media/waveform-generator';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Constant-amplitude mono signal. */
function constant(value: number, length = 4410): Float32Array {
  return new Float32Array(length).fill(value);
}

/** Sine wave signal. */
function sine(freq: number, length = 44100, amp = 0.5, sr = 44100): Float32Array {
  const data = new Float32Array(length);
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < length; i++) data[i] = amp * Math.sin(w * i);
  return data;
}

/** Single impulse at position `pos`. */
function impulse(length = 1000, pos = 500, amp = 0.8): Float32Array {
  const data = new Float32Array(length);
  data[pos] = amp;
  return data;
}

// ─── computeWaveform ─────────────────────────────────────────────────────────

describe('computeWaveform', () => {
  it('returns the requested number of bins', () => {
    const w = computeWaveform(constant(0.5, 4410), { bins: 100 });
    expect(w.bins.length).toBe(100);
  });

  it('default bins = 1000', () => {
    const w = computeWaveform(constant(0.5, 44100));
    expect(w.bins.length).toBe(1000);
  });

  it('silent signal → all bins have min=max=rms=0', () => {
    const w = computeWaveform(new Float32Array(1000));
    for (const b of w.bins) {
      expect(b.min).toBe(0);
      expect(b.max).toBe(0);
      expect(b.rms).toBe(0);
    }
  });

  it('constant positive signal → min=max=amp for every bin', () => {
    const amp = 0.7;
    const w = computeWaveform(constant(amp, 4410), { bins: 10 });
    for (const b of w.bins) {
      expect(b.min).toBeCloseTo(amp, 5);
      expect(b.max).toBeCloseTo(amp, 5);
    }
  });

  it('constant negative signal → min=max=−amp', () => {
    const amp = -0.6;
    const w = computeWaveform(constant(amp, 4410), { bins: 10 });
    for (const b of w.bins) {
      expect(b.min).toBeCloseTo(amp, 5);
      expect(b.max).toBeCloseTo(amp, 5);
    }
  });

  it('totalSamples equals input length', () => {
    const n = 12345;
    const w = computeWaveform(new Float32Array(n), { bins: 100 });
    expect(w.totalSamples).toBe(n);
  });

  it('samplesPerBin = totalSamples / bins', () => {
    const n = 10000;
    const bins = 100;
    const w = computeWaveform(new Float32Array(n), { bins });
    expect(w.samplesPerBin).toBeCloseTo(n / bins, 5);
  });

  it('peakAmplitude = max(|min|, |max|) across all bins', () => {
    const data = new Float32Array(1000);
    data[200] =  0.8;
    data[700] = -0.9;
    const w = computeWaveform(data, { bins: 50 });
    expect(w.peakAmplitude).toBeCloseTo(0.9, 4);
  });

  it('RMS of constant signal equals its amplitude', () => {
    const amp = 0.5;
    const w = computeWaveform(constant(amp, 4410), { bins: 10 });
    for (const b of w.bins) expect(b.rms).toBeCloseTo(amp, 4);
  });

  it('computeRMS=false sets rms=0', () => {
    const w = computeWaveform(constant(0.5, 1000), { bins: 10, computeRMS: false });
    for (const b of w.bins) expect(b.rms).toBe(0);
  });

  it('impulse at known position is reflected in the correct bin', () => {
    // 1000 samples, impulse at 500, bins=10 → bin 5 (samples 500–599) should have max > 0
    const data = impulse(1000, 500, 1.0);
    const w = computeWaveform(data, { bins: 10 });
    expect(w.bins[5].max).toBeGreaterThan(0);
    // All other bins should be zero
    for (let i = 0; i < 10; i++) {
      if (i !== 5) expect(w.bins[i].max).toBe(0);
    }
  });

  it('empty signal with any bin count works without error', () => {
    const w = computeWaveform(new Float32Array(0), { bins: 100 });
    expect(w.bins.length).toBe(100);
    expect(w.peakAmplitude).toBe(0);
  });

  it('single sample works', () => {
    const data = new Float32Array([0.5]);
    const w = computeWaveform(data, { bins: 1 });
    expect(w.bins.length).toBe(1);
    expect(w.bins[0].max).toBeCloseTo(0.5, 5);
  });

  it('max is always ≥ min for every bin', () => {
    const w = computeWaveform(sine(440), { bins: 50 });
    for (const b of w.bins) expect(b.max).toBeGreaterThanOrEqual(b.min);
  });
});

// ─── computeWaveformMultichannel ──────────────────────────────────────────────

describe('computeWaveformMultichannel', () => {
  it('empty channels array returns zero waveform', () => {
    const w = computeWaveformMultichannel([], { bins: 100 });
    expect(w.totalSamples).toBe(0);
    expect(w.bins.length).toBe(100);
  });

  it('single channel gives same result as computeWaveform', () => {
    const ch = sine(440, 4410);
    const w1 = computeWaveform(ch, { bins: 50 });
    const w2 = computeWaveformMultichannel([ch], { bins: 50 });
    expect(w1.peakAmplitude).toBeCloseTo(w2.peakAmplitude, 4);
    for (let i = 0; i < 50; i++) {
      expect(w1.bins[i].max).toBeCloseTo(w2.bins[i].max, 4);
    }
  });

  it('stereo mono-mix: equal channels give same result as mono', () => {
    const ch = sine(440, 4410, 0.5);
    const w = computeWaveformMultichannel([ch, ch], { bins: 50, channel: 'mono' });
    const wMono = computeWaveform(ch, { bins: 50 });
    expect(w.peakAmplitude).toBeCloseTo(wMono.peakAmplitude, 4);
  });

  it('channel=0 analyses only first channel', () => {
    const left  = constant(0.8, 4410);
    const right = constant(0.2, 4410);
    const w = computeWaveformMultichannel([left, right], { bins: 10, channel: 0 });
    for (const b of w.bins) expect(b.min).toBeCloseTo(0.8, 4);
  });

  it('channel=1 analyses only second channel', () => {
    const left  = constant(0.8, 4410);
    const right = constant(0.3, 4410);
    const w = computeWaveformMultichannel([left, right], { bins: 10, channel: 1 });
    for (const b of w.bins) expect(b.min).toBeCloseTo(0.3, 4);
  });
});

// ─── normalizeWaveform ────────────────────────────────────────────────────────

describe('normalizeWaveform', () => {
  it('normalised peakAmplitude = 1', () => {
    const w = computeWaveform(sine(440), { bins: 50 });
    const norm = normalizeWaveform(w);
    expect(norm.peakAmplitude).toBeCloseTo(1, 5);
  });

  it('max(|bin.min|, |bin.max|) ≤ 1 for all bins after normalisation', () => {
    const w = computeWaveform(sine(440), { bins: 50 });
    const norm = normalizeWaveform(w);
    for (const b of norm.bins) {
      expect(Math.abs(b.min)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(b.max)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('silent signal normalises to itself (no-op)', () => {
    const w = computeWaveform(new Float32Array(1000), { bins: 10 });
    const norm = normalizeWaveform(w);
    expect(norm.peakAmplitude).toBe(0);
  });

  it('does not mutate original data', () => {
    const w = computeWaveform(sine(440), { bins: 10 });
    const originalPeak = w.peakAmplitude;
    normalizeWaveform(w);
    expect(w.peakAmplitude).toBe(originalPeak);
  });

  it('bin ratios are preserved after normalisation', () => {
    const w = computeWaveform(sine(440), { bins: 10 });
    const norm = normalizeWaveform(w);
    const inv = 1 / w.peakAmplitude;
    for (let i = 0; i < 10; i++) {
      expect(norm.bins[i].max).toBeCloseTo(w.bins[i].max * inv, 5);
    }
  });
});

// ─── downsampleWaveform ───────────────────────────────────────────────────────

describe('downsampleWaveform', () => {
  it('returns targetBins bins', () => {
    const w = computeWaveform(sine(440), { bins: 200 });
    const d = downsampleWaveform(w, 50);
    expect(d.bins.length).toBe(50);
  });

  it('same bins count returns same waveform', () => {
    const w = computeWaveform(sine(440), { bins: 100 });
    const d = downsampleWaveform(w, 100);
    expect(d.bins.length).toBe(100);
    expect(d.peakAmplitude).toBeCloseTo(w.peakAmplitude, 5);
  });

  it('preserves totalSamples', () => {
    const n = 44100;
    const w = computeWaveform(new Float32Array(n), { bins: 1000 });
    const d = downsampleWaveform(w, 200);
    expect(d.totalSamples).toBe(n);
  });

  it('downsampled peak ≤ original peak', () => {
    const w = computeWaveform(sine(440), { bins: 200 });
    const d = downsampleWaveform(w, 50);
    // Downsampling shouldn't increase the peak
    expect(d.peakAmplitude).toBeLessThanOrEqual(w.peakAmplitude + 1e-9);
  });
});
