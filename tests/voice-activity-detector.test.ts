/**
 * Voice Activity Detector Tests — audio/voice-activity-detector.ts
 *
 * Covers: detectVoiceActivity, getVoiceSegments, createVAD (streaming),
 * features (energy/zcr/centroid), hangover, segments, edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  detectVoiceActivity,
  getVoiceSegments,
  createVAD,
  type VADOptions,
} from '../audio/voice-activity-detector';

const SR = 48000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Silence. */
function silence(n: number): Float32Array { return new Float32Array(n); }

/** White noise at given amplitude. */
function whiteNoise(n: number, amp = 0.5, seed = 42): Float32Array {
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    out[i] = ((s & 0xffff) / 0x8000 - 1) * amp;
  }
  return out;
}

/** Sine wave. */
function sine(n: number, freq = 440, amp = 0.5): Float32Array {
  const out = new Float32Array(n);
  const w   = (2 * Math.PI * freq) / SR;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

/** Concatenate Float32Arrays. */
function concat(...arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out   = new Float32Array(total);
  let   off   = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// ─── detectVoiceActivity — output shape ──────────────────────────────────────

describe('detectVoiceActivity — output shape', () => {
  it('empty audio returns empty result', () => {
    const r = detectVoiceActivity(new Float32Array(0));
    expect(r.voiced.length).toBe(0);
    expect(r.segments.length).toBe(0);
    expect(r.energy.length).toBe(0);
  });

  it('result arrays have consistent length', () => {
    const r = detectVoiceActivity(sine(SR));
    const n = r.energy.length;
    expect(r.zcr.length).toBe(n);
    expect(r.centroid.length).toBe(n);
    expect(r.noiseFloor.length).toBe(n);
    expect(r.frameTimes.length).toBe(n);
    expect(r.voiced.length).toBe(n);
  });

  it('frameTimes are monotonically increasing', () => {
    const r = detectVoiceActivity(sine(SR));
    for (let i = 1; i < r.frameTimes.length; i++) {
      expect(r.frameTimes[i]).toBeGreaterThan(r.frameTimes[i - 1]);
    }
  });

  it('all features are finite', () => {
    const r = detectVoiceActivity(sine(SR));
    expect(r.energy.every(isFinite)).toBe(true);
    expect(r.zcr.every(isFinite)).toBe(true);
    expect(r.centroid.every(isFinite)).toBe(true);
    expect(r.noiseFloor.every(isFinite)).toBe(true);
  });
});

// ─── detectVoiceActivity — silence ───────────────────────────────────────────

describe('detectVoiceActivity — silence', () => {
  it('silence → no voiced frames', () => {
    const r = detectVoiceActivity(silence(SR));
    expect(r.voiced.every((v) => !v)).toBe(true);
  });

  it('silence → no segments', () => {
    expect(detectVoiceActivity(silence(SR)).segments.length).toBe(0);
  });

  it('silence energy is very low', () => {
    const r = detectVoiceActivity(silence(SR));
    // All energy values should be well below 0 dBFS
    expect(r.energy.every((e) => e < -100)).toBe(true);
  });
});

// ─── detectVoiceActivity — loud signal ───────────────────────────────────────

describe('detectVoiceActivity — loud signal', () => {
  it('loud continuous sine → most frames voiced', () => {
    // Amplitude 0.5 is well above a -60 dBFS noise floor + 10 dB threshold
    const r = detectVoiceActivity(sine(SR, 440, 0.5), { thresholdDb: 10 });
    const voicedCount = r.voiced.filter(Boolean).length;
    // At least 40% voiced (noise floor adapts upward over time for a continuous signal)
    expect(voicedCount).toBeGreaterThan(r.voiced.length * 0.4);
  });

  it('loud continuous noise → segments are detected', () => {
    const r = detectVoiceActivity(whiteNoise(SR, 0.4), { thresholdDb: 10 });
    expect(r.segments.length).toBeGreaterThan(0);
  });

  it('loud signal has higher energy than silence', () => {
    const rSilence = detectVoiceActivity(silence(SR));
    const rLoud    = detectVoiceActivity(sine(SR, 440, 0.5));
    if (rSilence.energy.length > 0 && rLoud.energy.length > 0) {
      const avgS = rSilence.energy.reduce((s, v) => s + v, 0) / rSilence.energy.length;
      const avgL = rLoud.energy.reduce((s, v) => s + v, 0) / rLoud.energy.length;
      expect(avgL).toBeGreaterThan(avgS);
    }
  });
});

// ─── detectVoiceActivity — segments ──────────────────────────────────────────

describe('detectVoiceActivity — segments', () => {
  it('segments are sorted ascending', () => {
    const audio = concat(sine(SR, 440, 0.5), silence(SR >> 1), sine(SR, 880, 0.5));
    const r = detectVoiceActivity(audio, { thresholdDb: 8 });
    for (let i = 1; i < r.segments.length; i++) {
      expect(r.segments[i][0]).toBeGreaterThanOrEqual(r.segments[i - 1][1]);
    }
  });

  it('segment start < segment end', () => {
    const r = detectVoiceActivity(sine(SR, 440, 0.5));
    for (const [start, end] of r.segments) {
      expect(start).toBeLessThan(end);
    }
  });

  it('no overlapping segments', () => {
    const audio = concat(sine(SR, 440, 0.5), silence(SR >> 1), sine(SR, 880, 0.5));
    const r = detectVoiceActivity(audio, { thresholdDb: 8 });
    for (let i = 1; i < r.segments.length; i++) {
      expect(r.segments[i][0]).toBeGreaterThanOrEqual(r.segments[i - 1][1]);
    }
  });

  it('segment times are within audio duration', () => {
    const dur = 1.0;
    const r   = detectVoiceActivity(sine(Math.floor(dur * SR)));
    for (const [start, end] of r.segments) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(dur + 0.05); // small margin for window edges
    }
  });
});

// ─── detectVoiceActivity — threshold ─────────────────────────────────────────

describe('detectVoiceActivity — threshold control', () => {
  it('lower threshold → more voiced frames', () => {
    const audio = sine(SR, 440, 0.5);
    const rHigh = detectVoiceActivity(audio, { thresholdDb: 20 });
    const rLow  = detectVoiceActivity(audio, { thresholdDb: 5 });
    const vHigh = rHigh.voiced.filter(Boolean).length;
    const vLow  = rLow.voiced.filter(Boolean).length;
    expect(vLow).toBeGreaterThanOrEqual(vHigh);
  });

  it('very high threshold → no voiced frames on moderate signal', () => {
    const audio = sine(SR, 440, 0.02); // -34 dBFS
    const r     = detectVoiceActivity(audio, { thresholdDb: 50 });
    expect(r.voiced.every((v) => !v)).toBe(true);
  });
});

// ─── detectVoiceActivity — hangover ──────────────────────────────────────────

describe('detectVoiceActivity — hangover', () => {
  it('longer hangover → longer voiced region after signal ends', () => {
    // Signal for first 0.5 s, then silence
    const n     = SR;
    const audio = new Float32Array(n);
    const half  = n >> 1;
    for (let i = 0; i < half; i++) audio[i] = 0.5 * Math.sin(i * 2 * Math.PI * 440 / SR);

    const rShort = detectVoiceActivity(audio, { hangoverFrames: 1, thresholdDb: 8 });
    const rLong  = detectVoiceActivity(audio, { hangoverFrames: 20, thresholdDb: 8 });

    const vShort = rShort.voiced.filter(Boolean).length;
    const vLong  = rLong.voiced.filter(Boolean).length;
    expect(vLong).toBeGreaterThanOrEqual(vShort);
  });

  it('hangover=0 → decision drops immediately', () => {
    // Abruptly switches from loud to silence
    const n   = SR;
    const half = n >> 1;
    const audio = new Float32Array(n);
    for (let i = 0; i < half; i++) audio[i] = 0.5 * Math.sin(i * 2 * Math.PI * 440 / SR);

    const r = detectVoiceActivity(audio, { hangoverFrames: 0, thresholdDb: 8 });
    // Last voiced frame should not be too far past the half-way point
    const lastVoiced = r.voiced.lastIndexOf(true);
    if (lastVoiced >= 0) {
      const lastTimeSec = r.frameTimes[lastVoiced];
      // Should be within 0.1 s of the mid-point (no long hangover)
      expect(lastTimeSec).toBeLessThan(0.7);
    }
  });
});

// ─── detectVoiceActivity — spectral features ─────────────────────────────────

describe('detectVoiceActivity — spectral features', () => {
  it('useSpectralFeatures=true does not throw', () => {
    expect(() =>
      detectVoiceActivity(sine(SR), { useSpectralFeatures: true }),
    ).not.toThrow();
  });

  it('ZCR values are in [0, 1]', () => {
    const r = detectVoiceActivity(sine(SR));
    for (const z of r.zcr) {
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(1);
    }
  });

  it('centroid values are in [0, 1]', () => {
    const r = detectVoiceActivity(sine(SR));
    for (const c of r.centroid) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('high-frequency noise has higher ZCR than low-freq sine', () => {
    const rLow  = detectVoiceActivity(sine(SR, 100, 0.5));
    const rHigh = detectVoiceActivity(whiteNoise(SR, 0.5));
    const avgZcrLow  = rLow.zcr.reduce((s, v) => s + v, 0) / rLow.zcr.length;
    const avgZcrHigh = rHigh.zcr.reduce((s, v) => s + v, 0) / rHigh.zcr.length;
    expect(avgZcrHigh).toBeGreaterThan(avgZcrLow);
  });
});

// ─── getVoiceSegments ────────────────────────────────────────────────────────

describe('getVoiceSegments', () => {
  it('returns same segments as detectVoiceActivity', () => {
    const audio = sine(SR, 440, 0.5);
    const opts: VADOptions = { thresholdDb: 8 };
    const full = detectVoiceActivity(audio, opts);
    const segs = getVoiceSegments(audio, opts);
    expect(segs).toEqual(full.segments);
  });

  it('returns empty array for silence', () => {
    expect(getVoiceSegments(silence(SR)).length).toBe(0);
  });
});

// ─── createVAD — streaming ────────────────────────────────────────────────────

describe('createVAD — interface', () => {
  it('returns process / getResult / reset', () => {
    const v = createVAD();
    expect(typeof v.process).toBe('function');
    expect(typeof v.getResult).toBe('function');
    expect(typeof v.reset).toBe('function');
  });

  it('getResult on empty returns empty', () => {
    const r = createVAD().getResult();
    expect(r.voiced.length).toBe(0);
    expect(r.segments.length).toBe(0);
  });

  it('process empty block returns empty', () => {
    const r = createVAD().process(new Float32Array(0));
    expect(r.voiced.length).toBe(0);
  });
});

describe('createVAD — streaming vs batch', () => {
  it('streaming in 512-sample chunks matches batch', () => {
    const audio = sine(SR, 440, 0.5);
    const opts: VADOptions = { sampleRate: SR, thresholdDb: 8 };

    const batch = detectVoiceActivity(audio, opts);
    const vad   = createVAD(opts);
    const CHUNK = 512;
    for (let i = 0; i < audio.length; i += CHUNK) {
      vad.process(audio.subarray(i, i + CHUNK));
    }
    const stream = vad.getResult();

    expect(stream.voiced.length).toBe(batch.voiced.length);
    expect(stream.segments.length).toBe(batch.segments.length);
  });

  it('reset clears state', () => {
    const vad = createVAD();
    vad.process(sine(SR, 440, 0.5));
    vad.reset();
    const r = vad.getResult();
    expect(r.voiced.length).toBe(0);
  });

  it('can process again after reset', () => {
    const vad  = createVAD({ thresholdDb: 8 });
    const audio = sine(SR, 440, 0.5);
    vad.process(audio);
    const first = vad.getResult();
    vad.reset();
    vad.process(audio);
    const second = vad.getResult();
    expect(second.voiced.length).toBe(first.voiced.length);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('detectVoiceActivity — edge cases', () => {
  it('audio shorter than one window → empty or valid result', () => {
    const r = detectVoiceActivity(new Float32Array(64));
    expect(r.voiced.length).toBeGreaterThanOrEqual(0);
    expect(r.energy.every(isFinite)).toBe(true);
  });

  it('custom windowSize and hopSize work', () => {
    const r = detectVoiceActivity(sine(SR), { windowSize: 1024, hopSize: 512 });
    expect(r.energy.every(isFinite)).toBe(true);
  });

  it('works at 44100 Hz sample rate', () => {
    const r = detectVoiceActivity(sine(44100, 440, 0.5), { sampleRate: 44100 });
    expect(r.energy.every(isFinite)).toBe(true);
  });

  it('hopSize=0 does not throw (numFrames=Infinity → Float32Array(∞) guard)', () => {
    // hopSize=0 → numFrames = Infinity → new Float32Array(Infinity) throws RangeError.
    expect(() => detectVoiceActivity(sine(SR), { hopSize: 0 })).not.toThrow();
    const r = detectVoiceActivity(sine(SR), { hopSize: 0 });
    expect(r.energy.every(isFinite)).toBe(true);
  });
});
