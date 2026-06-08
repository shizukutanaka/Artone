/**
 * Parametric EQ Frequency Response Tests — audio/eq-response.ts
 *
 * Covers: makeLogFrequencies, nearestFrequencyIndex, computeEQResponse,
 * isFlat, peakMagnitude, minMagnitude — across all EQ band types.
 */

import { describe, it, expect } from 'vitest';
import {
  makeLogFrequencies,
  nearestFrequencyIndex,
  computeEQResponse,
  isFlat,
  peakMagnitude,
  minMagnitude,
  EQ_DISPLAY_POINTS,
  type EQBand,
  type EQResponse,
} from '../audio/eq-response';

const SR = 48000;

// ─── makeLogFrequencies ───────────────────────────────────────────────────────

describe('makeLogFrequencies', () => {
  it('returns a Float32Array of the requested length', () => {
    const f = makeLogFrequencies(256, SR);
    expect(f).toBeInstanceOf(Float32Array);
    expect(f.length).toBe(256);
  });

  it('default length equals EQ_DISPLAY_POINTS', () => {
    const f = makeLogFrequencies(undefined, SR);
    expect(f.length).toBe(EQ_DISPLAY_POINTS);
  });

  it('first frequency is ~20 Hz', () => {
    const f = makeLogFrequencies(EQ_DISPLAY_POINTS, SR);
    expect(f[0]).toBeCloseTo(20, 0);
  });

  it('last frequency is ~Nyquist (sampleRate/2)', () => {
    const f = makeLogFrequencies(EQ_DISPLAY_POINTS, SR);
    expect(f[f.length - 1]).toBeCloseTo(SR / 2, -1);
  });

  it('frequencies are strictly monotonically increasing', () => {
    const f = makeLogFrequencies(64, SR);
    for (let i = 1; i < f.length; i++) {
      expect(f[i]).toBeGreaterThan(f[i - 1]);
    }
  });

  it('spacing is logarithmic (equal ratios between adjacent points)', () => {
    const f = makeLogFrequencies(64, SR);
    const ratios: number[] = [];
    for (let i = 1; i < Math.min(f.length, 10); i++) {
      ratios.push(f[i] / f[i - 1]);
    }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    for (const r of ratios) {
      expect(Math.abs(r - mean)).toBeLessThan(0.01 * mean);
    }
  });

  it('n=1 returns a single-element array', () => {
    const f = makeLogFrequencies(1, SR);
    expect(f.length).toBe(1);
    expect(f[0]).toBeGreaterThan(0);
  });

  it('44100 Hz sample rate sets Nyquist to 22050', () => {
    const f = makeLogFrequencies(EQ_DISPLAY_POINTS, 44100);
    expect(f[f.length - 1]).toBeCloseTo(22050, -1);
  });
});

// ─── nearestFrequencyIndex ────────────────────────────────────────────────────

describe('nearestFrequencyIndex', () => {
  it('returns 0 for a target below the first frequency', () => {
    const f = makeLogFrequencies(64, SR);
    expect(nearestFrequencyIndex(f, 1)).toBe(0);
  });

  it('returns last index for a target above the last frequency', () => {
    const f = makeLogFrequencies(64, SR);
    expect(nearestFrequencyIndex(f, 100000)).toBe(f.length - 1);
  });

  it('finds the exact frequency when present', () => {
    const f = new Float32Array([100, 200, 500, 1000, 2000]);
    expect(nearestFrequencyIndex(f, 500)).toBe(2);
  });

  it('returns closest index for midpoint target', () => {
    const f = new Float32Array([100, 200, 400]);
    // 300 Hz is equidistant between 200 and 400; either [1] or [2] is acceptable
    const idx = nearestFrequencyIndex(f, 300);
    expect(idx === 1 || idx === 2).toBe(true);
  });

  it('1 kHz is found near the expected log-scale position', () => {
    const f = makeLogFrequencies(EQ_DISPLAY_POINTS, SR);
    const idx = nearestFrequencyIndex(f, 1000);
    expect(f[idx]).toBeGreaterThan(900);
    expect(f[idx]).toBeLessThan(1100);
  });
});

// ─── computeEQResponse — empty / disabled ────────────────────────────────────

describe('computeEQResponse — empty / disabled bands', () => {
  it('empty bands array → flat (all zeros) response', () => {
    const r = computeEQResponse([], SR);
    expect(isFlat(r)).toBe(true);
  });

  it('single disabled band → flat response', () => {
    const band: EQBand = { type: 'peak', frequency: 1000, gain: 12, Q: 2, enabled: false };
    const r = computeEQResponse([band], SR);
    expect(isFlat(r)).toBe(true);
  });

  it('all disabled bands → flat response', () => {
    const bands: EQBand[] = [
      { type: 'peak', frequency: 1000, gain: 6, enabled: false },
      { type: 'lowshelf', frequency: 200, gain: -3, enabled: false },
    ];
    const r = computeEQResponse(bands, SR);
    expect(isFlat(r)).toBe(true);
  });

  it('returns correct array lengths', () => {
    const r = computeEQResponse([], SR);
    expect(r.frequencies.length).toBe(EQ_DISPLAY_POINTS);
    expect(r.magnitudeDb.length).toBe(EQ_DISPLAY_POINTS);
  });

  it('custom freq array is returned as-is', () => {
    const freqs = makeLogFrequencies(128, SR);
    const r = computeEQResponse([], SR, freqs);
    expect(r.frequencies).toBe(freqs);
    expect(r.magnitudeDb.length).toBe(128);
  });
});

// ─── computeEQResponse — peak EQ ─────────────────────────────────────────────

describe('computeEQResponse — peak EQ', () => {
  it('+6 dB peak at 1 kHz → peakMagnitude ≈ 6 dB', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 1000, gain: 6, Q: 2 }], SR);
    const p = peakMagnitude(r);
    expect(p.magnitudeDb).toBeCloseTo(6, 0);
  });

  it('+12 dB peak at 1 kHz → peakMagnitude ≈ 12 dB', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 1000, gain: 12, Q: 4 }], SR);
    const p = peakMagnitude(r);
    expect(p.magnitudeDb).toBeCloseTo(12, 0);
  });

  it('-6 dB peak (cut) at 1 kHz → minMagnitude ≈ −6 dB', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 1000, gain: -6, Q: 2 }], SR);
    const m = minMagnitude(r);
    expect(m.magnitudeDb).toBeCloseTo(-6, 0);
  });

  it('peak center frequency is close to specified frequency', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 1000, gain: 9, Q: 4 }], SR);
    const p = peakMagnitude(r);
    expect(p.frequencyHz).toBeGreaterThan(800);
    expect(p.frequencyHz).toBeLessThan(1200);
  });

  it('0 dB peak band → flat response', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 1000, gain: 0, Q: 2 }], SR);
    expect(isFlat(r, 0.1)).toBe(true);
  });

  it('two additive peaks sum correctly', () => {
    const r1 = computeEQResponse([{ type: 'peak', frequency: 500, gain: 6, Q: 3 }], SR);
    const r2 = computeEQResponse([{ type: 'peak', frequency: 4000, gain: 6, Q: 3 }], SR);
    const rBoth = computeEQResponse([
      { type: 'peak', frequency: 500, gain: 6, Q: 3 },
      { type: 'peak', frequency: 4000, gain: 6, Q: 3 },
    ], SR);
    // Peak of combined should be ≥ either individual peak
    expect(peakMagnitude(rBoth).magnitudeDb).toBeGreaterThanOrEqual(
      Math.max(peakMagnitude(r1).magnitudeDb, peakMagnitude(r2).magnitudeDb) - 0.5,
    );
  });
});

// ─── computeEQResponse — shelving filters ────────────────────────────────────

describe('computeEQResponse — shelf filters', () => {
  it('+6 dB low shelf at 200 Hz boosts low end', () => {
    const r = computeEQResponse([{ type: 'lowshelf', frequency: 200, gain: 6 }], SR);
    const idx20 = nearestFrequencyIndex(r.frequencies, 20);
    // Low shelf should apply gain well below 200 Hz
    expect(r.magnitudeDb[idx20]).toBeGreaterThan(4);
  });

  it('-6 dB low shelf at 200 Hz cuts low end', () => {
    const r = computeEQResponse([{ type: 'lowshelf', frequency: 200, gain: -6 }], SR);
    const idx20 = nearestFrequencyIndex(r.frequencies, 20);
    expect(r.magnitudeDb[idx20]).toBeLessThan(-4);
  });

  it('+6 dB high shelf at 8 kHz boosts high end', () => {
    const r = computeEQResponse([{ type: 'highshelf', frequency: 8000, gain: 6 }], SR);
    const idxNy = r.frequencies.length - 1;
    expect(r.magnitudeDb[idxNy]).toBeGreaterThan(4);
  });

  it('-6 dB high shelf at 8 kHz cuts high end', () => {
    const r = computeEQResponse([{ type: 'highshelf', frequency: 8000, gain: -6 }], SR);
    const idxNy = r.frequencies.length - 1;
    expect(r.magnitudeDb[idxNy]).toBeLessThan(-4);
  });

  it('0 dB low shelf → flat response', () => {
    const r = computeEQResponse([{ type: 'lowshelf', frequency: 300, gain: 0 }], SR);
    expect(isFlat(r, 0.1)).toBe(true);
  });
});

// ─── computeEQResponse — highpass / lowpass ───────────────────────────────────

describe('computeEQResponse — highpass / lowpass', () => {
  it('lowpass at 1 kHz attenuates content above 10 kHz by >20 dB', () => {
    const r = computeEQResponse([{ type: 'lowpass', frequency: 1000, Q: 0.707 }], SR);
    const idx10k = nearestFrequencyIndex(r.frequencies, 10000);
    expect(r.magnitudeDb[idx10k]).toBeLessThan(-20);
  });

  it('highpass at 1 kHz attenuates content below 100 Hz by >20 dB', () => {
    const r = computeEQResponse([{ type: 'highpass', frequency: 1000, Q: 0.707 }], SR);
    const idx100 = nearestFrequencyIndex(r.frequencies, 100);
    expect(r.magnitudeDb[idx100]).toBeLessThan(-20);
  });

  it('lowpass passband (below fc) is near 0 dB', () => {
    const r = computeEQResponse([{ type: 'lowpass', frequency: 5000, Q: 0.707 }], SR);
    const idx100 = nearestFrequencyIndex(r.frequencies, 100);
    expect(Math.abs(r.magnitudeDb[idx100])).toBeLessThan(3);
  });

  it('highpass passband (above fc) is near 0 dB', () => {
    const r = computeEQResponse([{ type: 'highpass', frequency: 100, Q: 0.707 }], SR);
    const idx10k = nearestFrequencyIndex(r.frequencies, 10000);
    expect(Math.abs(r.magnitudeDb[idx10k])).toBeLessThan(3);
  });
});

// ─── computeEQResponse — bandpass / notch ─────────────────────────────────────

describe('computeEQResponse — bandpass / notch', () => {
  it('notch at 1 kHz causes strong attenuation near 1 kHz', () => {
    const r = computeEQResponse([{ type: 'notch', frequency: 1000, Q: 10 }], SR);
    const m = minMagnitude(r);
    expect(m.magnitudeDb).toBeLessThan(-20);
    expect(m.frequencyHz).toBeGreaterThan(800);
    expect(m.frequencyHz).toBeLessThan(1200);
  });

  it('notch passband (far from fc) is near 0 dB', () => {
    const r = computeEQResponse([{ type: 'notch', frequency: 1000, Q: 10 }], SR);
    const idx100 = nearestFrequencyIndex(r.frequencies, 100);
    expect(Math.abs(r.magnitudeDb[idx100])).toBeLessThan(3);
  });

  it('bandpass at 1 kHz attenuates both low and high extremes', () => {
    const r = computeEQResponse([{ type: 'bandpass', frequency: 1000, Q: 5 }], SR);
    const idx40 = nearestFrequencyIndex(r.frequencies, 40);
    const idx15k = nearestFrequencyIndex(r.frequencies, 15000);
    expect(r.magnitudeDb[idx40]).toBeLessThan(-10);
    expect(r.magnitudeDb[idx15k]).toBeLessThan(-10);
  });
});

// ─── isFlat ───────────────────────────────────────────────────────────────────

describe('isFlat', () => {
  it('zero-filled response is flat', () => {
    const r: EQResponse = {
      frequencies: makeLogFrequencies(64, SR),
      magnitudeDb: new Float32Array(64),
    };
    expect(isFlat(r)).toBe(true);
  });

  it('response with one nonzero sample exceeding tolerance is not flat', () => {
    const mag = new Float32Array(64);
    mag[32] = 0.1;
    const r: EQResponse = { frequencies: makeLogFrequencies(64, SR), magnitudeDb: mag };
    expect(isFlat(r, 0.01)).toBe(false);
  });

  it('default tolerance is 0.01 dB', () => {
    const mag = new Float32Array(64).fill(0.009);
    const r: EQResponse = { frequencies: makeLogFrequencies(64, SR), magnitudeDb: mag };
    expect(isFlat(r)).toBe(true);

    const mag2 = new Float32Array(64).fill(0.02);
    const r2: EQResponse = { frequencies: makeLogFrequencies(64, SR), magnitudeDb: mag2 };
    expect(isFlat(r2)).toBe(false);
  });

  it('custom tolerance is respected', () => {
    const mag = new Float32Array(64).fill(0.5);
    const r: EQResponse = { frequencies: makeLogFrequencies(64, SR), magnitudeDb: mag };
    expect(isFlat(r, 1.0)).toBe(true);
    expect(isFlat(r, 0.1)).toBe(false);
  });

  it('empty magnitudeDb array is considered flat', () => {
    const r: EQResponse = { frequencies: new Float32Array(0), magnitudeDb: new Float32Array(0) };
    expect(isFlat(r)).toBe(true);
  });
});

// ─── peakMagnitude / minMagnitude ─────────────────────────────────────────────

describe('peakMagnitude', () => {
  it('flat response → peak = 0 dB', () => {
    const r = computeEQResponse([], SR);
    expect(peakMagnitude(r).magnitudeDb).toBe(0);
  });

  it('returns correct peak value and frequency', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 2000, gain: 8, Q: 4 }], SR);
    const p = peakMagnitude(r);
    expect(p.magnitudeDb).toBeCloseTo(8, 0);
    expect(p.frequencyHz).toBeGreaterThan(1500);
    expect(p.frequencyHz).toBeLessThan(2500);
  });
});

describe('minMagnitude', () => {
  it('flat response → min = 0 dB', () => {
    const r = computeEQResponse([], SR);
    expect(minMagnitude(r).magnitudeDb).toBe(0);
  });

  it('returns correct minimum value and frequency', () => {
    const r = computeEQResponse([{ type: 'peak', frequency: 2000, gain: -8, Q: 4 }], SR);
    const m = minMagnitude(r);
    expect(m.magnitudeDb).toBeCloseTo(-8, 0);
    expect(m.frequencyHz).toBeGreaterThan(1500);
    expect(m.frequencyHz).toBeLessThan(2500);
  });

  it('notch produces deep minimum', () => {
    const r = computeEQResponse([{ type: 'notch', frequency: 1000, Q: 20 }], SR);
    // Log-spaced grid may not land exactly on fc; -25 dB is a safe lower bound
    expect(minMagnitude(r).magnitudeDb).toBeLessThan(-25);
  });
});

// ─── Combined multi-band response ─────────────────────────────────────────────

describe('computeEQResponse — multi-band chain', () => {
  it('highpass + lowpass (bandpass region) leaves midrange near 0 dB', () => {
    const r = computeEQResponse([
      { type: 'highpass', frequency: 80, Q: 0.707 },
      { type: 'lowpass', frequency: 12000, Q: 0.707 },
    ], SR);
    const idx1k = nearestFrequencyIndex(r.frequencies, 1000);
    expect(Math.abs(r.magnitudeDb[idx1k])).toBeLessThan(3);
  });

  it('peak + low shelf combine additively at non-overlapping regions', () => {
    const rCombined = computeEQResponse([
      { type: 'lowshelf', frequency: 100, gain: 6 },
      { type: 'peak', frequency: 8000, gain: 6, Q: 2 },
    ], SR);
    // Low region should see shelf boost
    const idx40 = nearestFrequencyIndex(rCombined.frequencies, 40);
    expect(rCombined.magnitudeDb[idx40]).toBeGreaterThan(4);
    // High region peak should see peak boost
    const idx8k = nearestFrequencyIndex(rCombined.frequencies, 8000);
    expect(rCombined.magnitudeDb[idx8k]).toBeGreaterThan(4);
  });

  it('fully cancelling boost + cut at same frequency → near 0 dB', () => {
    const r = computeEQResponse([
      { type: 'peak', frequency: 1000, gain: 6, Q: 3 },
      { type: 'peak', frequency: 1000, gain: -6, Q: 3 },
    ], SR);
    expect(isFlat(r, 0.5)).toBe(true);
  });

  it('mix of enabled and disabled bands — only enabled bands contribute', () => {
    const rEnabled = computeEQResponse([
      { type: 'peak', frequency: 1000, gain: 9, Q: 3, enabled: true },
    ], SR);
    const rMixed = computeEQResponse([
      { type: 'peak', frequency: 1000, gain: 9, Q: 3, enabled: true },
      { type: 'peak', frequency: 500, gain: 12, Q: 3, enabled: false },
    ], SR);
    const idx1k = nearestFrequencyIndex(rEnabled.frequencies, 1000);
    expect(Math.abs(rMixed.magnitudeDb[idx1k] - rEnabled.magnitudeDb[idx1k])).toBeLessThan(0.1);
  });
});
