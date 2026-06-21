/**
 * EBU R128 / ITU-R BS.1770-4 Loudness Meter Tests
 *
 * Covers K-weighting coefficients/filter, measureLoudness() offline API,
 * and createLoudnessMeter() streaming API.
 */

import { describe, it, expect } from 'vitest';
import {
  kWeightingCoeffs,
  kWeightChannel,
  measureLoudness,
  createLoudnessMeter,
} from '../audio/loudness';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Generate a sine wave (mono). */
function sine(freq: number, durationS: number, amplitude: number, sr = 48000): Float32Array {
  const n = Math.round(sr * durationS);
  const data = new Float32Array(n);
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < n; i++) data[i] = amplitude * Math.sin(w * i);
  return data;
}

/** All-zero signal. */
function silence(samples: number): Float32Array {
  return new Float32Array(samples);
}

/** Constant value signal. */
function constant(value: number, samples: number): Float32Array {
  return new Float32Array(samples).fill(value);
}

// ─── kWeightingCoeffs ─────────────────────────────────────────────────────────

describe('kWeightingCoeffs', () => {
  it('returns stage1 (pre-filter) and stage2 (RLB) coefficient objects', () => {
    const { stage1: pre, stage2: rlb } = kWeightingCoeffs(48000);
    expect(typeof pre.b0).toBe('number');
    expect(typeof rlb.b0).toBe('number');
  });

  it('48kHz pre-filter b0 matches BS.1770 reference value', () => {
    const { stage1: pre } = kWeightingCoeffs(48000);
    expect(pre.b0).toBeCloseTo(1.53512485958697, 5);
  });

  it('48kHz pre-filter b1 matches BS.1770 reference value', () => {
    const { stage1: pre } = kWeightingCoeffs(48000);
    expect(pre.b1).toBeCloseTo(-2.69169618940638, 5);
  });

  it('48kHz RLB a1 matches BS.1770 reference value', () => {
    const { stage2: rlb } = kWeightingCoeffs(48000);
    expect(rlb.a1).toBeCloseTo(-1.99004745483398, 5);
  });

  it('48kHz RLB a2 matches BS.1770 reference value', () => {
    const { stage2: rlb } = kWeightingCoeffs(48000);
    expect(rlb.a2).toBeCloseTo(0.99007225036616, 5);
  });

  it('pre-filter poles are inside the unit circle (stable)', () => {
    const { stage1: pre } = kWeightingCoeffs(48000);
    // Check stability: |a1| < 2 and discriminant of characteristic polynomial
    // is a necessary (not sufficient) condition; exact criterion: |a2| < 1
    expect(Math.abs(pre.a2)).toBeLessThan(1);
  });

  it('RLB filter poles are inside the unit circle (stable)', () => {
    const { stage2: rlb } = kWeightingCoeffs(48000);
    expect(Math.abs(rlb.a2)).toBeLessThan(1);
  });

  it('coefficients differ between 44100 Hz and 48000 Hz', () => {
    const { stage1: pre44 } = kWeightingCoeffs(44100);
    const { stage1: pre48 } = kWeightingCoeffs(48000);
    expect(pre44.b0).not.toBeCloseTo(pre48.b0, 3);
  });

  it('K-weighting gain at DC is ~0 (high-pass blocks DC)', () => {
    // Evaluate combined K-weighting transfer function at DC (z = 1)
    // H(z=1) = (b0+b1+b2)/(1+a1+a2) for both stages combined numerically
    const { stage1: pre, stage2: rlb } = kWeightingCoeffs(48000);
    const preAtDC = (pre.b0 + pre.b1 + pre.b2) / (1 + pre.a1 + pre.a2);
    const rlbAtDC = (rlb.b0 + rlb.b1 + rlb.b2) / (1 + rlb.a1 + rlb.a2);
    expect(Math.abs(rlbAtDC)).toBeLessThan(0.01);  // RLB kills DC
    expect(Math.abs(preAtDC * rlbAtDC)).toBeLessThan(0.01);
  });

  it('K-weighting gain at Nyquist is ~+4 dB (pre-filter shelf)', () => {
    // At Nyquist: H(z=-1) = (b0-b1+b2)/(1-a1+a2)
    const { stage1: pre, stage2: rlb } = kWeightingCoeffs(48000);
    const preAtNy = Math.abs((pre.b0 - pre.b1 + pre.b2) / (1 - pre.a1 + pre.a2));
    const rlbAtNy = Math.abs((rlb.b0 - rlb.b1 + rlb.b2) / (1 - rlb.a1 + rlb.a2));
    const gainDb = 20 * Math.log10(preAtNy * rlbAtNy);
    expect(gainDb).toBeGreaterThan(3);   // shelf boost visible at Nyquist
    expect(gainDb).toBeLessThan(5);      // ~+4 dB
  });
});

// ─── kWeightChannel ──────────────────────────────────────────────────────────

describe('kWeightChannel', () => {
  it('silent input → silent output', () => {
    const out = kWeightChannel(silence(4800), 48000);
    for (const v of out) expect(Math.abs(v)).toBeLessThan(1e-10);
  });

  it('output length equals input length', () => {
    const out = kWeightChannel(sine(997, 1, 0.5), 48000);
    expect(out.length).toBe(sine(997, 1, 0.5).length);
  });

  it('K-weighting at ~1 kHz is close to 0 dB (+0.5 to +1.5 dB expected)', () => {
    // Measure gain via RMS ratio after filter settles (skip first 100 samples)
    const sr = 48000;
    const sig = sine(997, 0.5, 0.1, sr);
    const kw  = kWeightChannel(sig, sr);
    const skip = 100;
    let inRms = 0, outRms = 0;
    for (let i = skip; i < sig.length; i++) {
      inRms  += sig[i] * sig[i];
      outRms += kw[i]  * kw[i];
    }
    const gainDb = 10 * Math.log10(outRms / inRms);
    expect(gainDb).toBeGreaterThan(0.2);   // pre-filter slightly boosts at 1 kHz
    expect(gainDb).toBeLessThan(2);
  });

  it('K-weighting at 20 Hz (well below 38 Hz RLB cutoff) is strongly attenuated', () => {
    // 20 Hz is below fc=38 Hz of the RLB high-pass; expected attenuation ~−13 dB
    const sr = 48000;
    const sig = sine(20, 2, 0.5, sr);
    const kw  = kWeightChannel(sig, sr);
    const skip = 1000;  // allow filter transient to settle
    let inRms = 0, outRms = 0;
    for (let i = skip; i < sig.length; i++) {
      inRms  += sig[i] * sig[i];
      outRms += kw[i]  * kw[i];
    }
    const gainDb = 10 * Math.log10(outRms / inRms);
    expect(gainDb).toBeLessThan(-6);   // RLB high-pass strongly attenuates sub-cutoff content
  });
});

// ─── measureLoudness ─────────────────────────────────────────────────────────

describe('measureLoudness', () => {
  it('empty channels array → all -Infinity', () => {
    const m = measureLoudness([]);
    expect(m.momentary).toBe(-Infinity);
    expect(m.integrated).toBe(-Infinity);
    expect(m.samplePeak).toBe(-Infinity);
  });

  it('zero-length channel → all -Infinity', () => {
    const m = measureLoudness([new Float32Array(0)]);
    expect(m.momentary).toBe(-Infinity);
  });

  it('silent signal → integrated = -Infinity (absolute gate −70 LUFS)', () => {
    const m = measureLoudness([silence(144000)], 48000);
    expect(m.integrated).toBe(-Infinity);
  });

  it('silent signal → samplePeak = -Infinity', () => {
    const m = measureLoudness([silence(4800)], 48000);
    expect(m.samplePeak).toBe(-Infinity);
  });

  it('997 Hz sine at amplitude 0.1, 3 s → integrated ≈ −23 LUFS (±1)', () => {
    // At 997 Hz, K-weighting ≈ +0.6 dB; calibrated to EBU R128 reference level
    const ch = sine(997, 3, 0.1);
    const m  = measureLoudness([ch]);
    expect(m.integrated).toBeGreaterThan(-24.5);
    expect(m.integrated).toBeLessThan(-21.5);
  });

  it('louder signal measures higher integrated loudness', () => {
    const quiet = measureLoudness([sine(997, 3, 0.1)]);
    const loud  = measureLoudness([sine(997, 3, 0.5)]);
    expect(loud.integrated).toBeGreaterThan(quiet.integrated);
  });

  it('amplitude × 10 → integrated loudness +20 dB', () => {
    const m1 = measureLoudness([sine(997, 3, 0.01)]);
    const m2 = measureLoudness([sine(997, 3, 0.1)]);
    expect(Math.abs((m2.integrated - m1.integrated) - 20)).toBeLessThan(1);
  });

  it('sample peak of ±0.5 constant signal ≈ −6 dBFS', () => {
    const m = measureLoudness([constant(0.5, 48000)]);
    expect(m.samplePeak).toBeCloseTo(-6.02, 1);
  });

  it('sample peak of ±1.0 signal = 0 dBFS', () => {
    const m = measureLoudness([constant(1.0, 48000)]);
    expect(m.samplePeak).toBeCloseTo(0, 2);
  });

  it('momentary is finite for a sufficiently long signal', () => {
    const m = measureLoudness([sine(1000, 1, 0.1)]);
    expect(isFinite(m.momentary)).toBe(true);
  });

  it('short-term is finite for a 3+ second signal', () => {
    const m = measureLoudness([sine(1000, 4, 0.1)]);
    expect(isFinite(m.shortTerm)).toBe(true);
  });

  it('loudnessRange is non-negative', () => {
    const m = measureLoudness([sine(1000, 10, 0.1)]);
    expect(m.loudnessRange).toBeGreaterThanOrEqual(0);
  });

  it('uniform signal has LRA close to 0', () => {
    // Constant amplitude sine → very low short-term variation
    const m = measureLoudness([sine(1000, 30, 0.1)], 48000);
    expect(m.loudnessRange).toBeLessThan(1);
  });

  it('stereo equal channels → ~3 dB louder than same mono signal', () => {
    const ch = sine(997, 3, 0.1);
    const mono   = measureLoudness([ch]);
    const stereo = measureLoudness([ch, ch]);
    expect(stereo.integrated - mono.integrated).toBeCloseTo(3, 0);
  });

  it('sample peak uses maximum across all channels', () => {
    const left  = constant(0.3, 48000);
    const right = constant(0.8, 48000);
    const m = measureLoudness([left, right]);
    expect(m.samplePeak).toBeCloseTo(20 * Math.log10(0.8), 1);
  });
});

// ─── createLoudnessMeter (streaming) ─────────────────────────────────────────

describe('createLoudnessMeter', () => {
  it('returns an object with process, getMeasurement, reset', () => {
    const meter = createLoudnessMeter(48000);
    expect(typeof meter.process).toBe('function');
    expect(typeof meter.getMeasurement).toBe('function');
    expect(typeof meter.reset).toBe('function');
  });

  it('before processing: getMeasurement returns all -Infinity', () => {
    const meter = createLoudnessMeter();
    const m = meter.getMeasurement();
    expect(m.momentary).toBe(-Infinity);
    expect(m.integrated).toBe(-Infinity);
  });

  it('streaming same signal as offline gives same integrated loudness', () => {
    const ch = sine(997, 3, 0.1);
    const offline = measureLoudness([ch]);

    const meter = createLoudnessMeter();
    meter.process([ch]);
    const streaming = meter.getMeasurement();

    expect(Math.abs(streaming.integrated - offline.integrated)).toBeLessThan(0.5);
  });

  it('processing in 1024-sample chunks gives same result as one block', () => {
    const ch    = sine(997, 3, 0.1);
    const full  = createLoudnessMeter();
    const chunk = createLoudnessMeter();

    full.process([ch]);

    const BLOCK = 1024;
    for (let i = 0; i < ch.length; i += BLOCK) {
      chunk.process([ch.subarray(i, i + BLOCK)]);
    }

    const mFull  = full.getMeasurement();
    const mChunk = chunk.getMeasurement();
    expect(Math.abs(mFull.integrated - mChunk.integrated)).toBeLessThan(0.5);
  });

  it('reset clears all state', () => {
    const meter = createLoudnessMeter();
    meter.process([sine(997, 3, 0.1)]);
    meter.reset();
    const m = meter.getMeasurement();
    expect(m.momentary).toBe(-Infinity);
    expect(m.integrated).toBe(-Infinity);
    expect(m.samplePeak).toBe(-Infinity);
  });

  it('streaming sample peak tracks maximum sample value', () => {
    const meter = createLoudnessMeter();
    meter.process([constant(0.5, 4800)]);
    meter.process([constant(0.9, 4800)]);
    const m = meter.getMeasurement();
    expect(m.samplePeak).toBeCloseTo(20 * Math.log10(0.9), 1);
  });

  it('empty process() call is a no-op', () => {
    const meter = createLoudnessMeter();
    meter.process([]);
    expect(meter.getMeasurement().momentary).toBe(-Infinity);
  });

  it('momentary loudness is finite after processing ≥ 400 ms', () => {
    const meter = createLoudnessMeter();
    meter.process([sine(1000, 0.5, 0.1)]);   // 500 ms → 5 hops ≥ 4
    expect(isFinite(meter.getMeasurement().momentary)).toBe(true);
  });

  it('streaming loudnessRange is non-negative', () => {
    const meter = createLoudnessMeter();
    meter.process([sine(1000, 10, 0.1)]);
    expect(meter.getMeasurement().loudnessRange).toBeGreaterThanOrEqual(0);
  });

  // ── lifecycle / bounded-state guarantees (24h continuous metering) ──

  it('tiny-chunk streaming matches offline within tight tolerance (integrated/LRA)', () => {
    // Persistent K-weighting state ⇒ chunked filtering == filtering the whole
    // signal, so the bounded incremental meter should match offline closely.
    const ch = sine(1000, 5, 0.25);
    const offline = measureLoudness([ch]);
    const meter = createLoudnessMeter();
    const STEP = 137; // deliberately awkward chunk size, crosses 100 ms blocks
    for (let i = 0; i < ch.length; i += STEP) meter.process([ch.subarray(i, i + STEP)]);
    const m = meter.getMeasurement();
    expect(Math.abs(m.integrated - offline.integrated)).toBeLessThan(0.1);
    expect(Math.abs(m.loudnessRange - offline.loudnessRange)).toBeLessThan(0.1);
    expect(Math.abs(m.momentary - offline.momentary)).toBeLessThan(0.1);
  });

  it('streaming recovers an inter-sample true peak fed in chunks', () => {
    // fs/4 tone phased by π/4: samples sit on ±0.707 (sample peak ≈ -3 dBFS)
    // while the waveform crests at 1.0 (0 dBFS) between samples.
    const N = 4096;
    const ch = new Float32Array(N);
    for (let i = 0; i < N; i++) ch[i] = Math.sin((Math.PI / 2) * i + Math.PI / 4);
    const meter = createLoudnessMeter(48000);
    for (let i = 0; i < N; i += 100) meter.process([ch.subarray(i, i + 100)]);
    const m = meter.getMeasurement();
    expect(m.samplePeak).toBeLessThan(-2.5);
    expect(m.samplePeak).toBeGreaterThan(-3.5);
    expect(m.truePeak - m.samplePeak).toBeGreaterThan(2); // inter-sample crest recovered
    expect(m.truePeak).toBeGreaterThanOrEqual(m.samplePeak);
  });

  it('result is independent of chunking granularity (1 vs 1000-sample chunks)', () => {
    const ch = sine(440, 4, 0.3);
    const big = createLoudnessMeter();
    big.process([ch]);
    const small = createLoudnessMeter();
    for (let i = 0; i < ch.length; i += 1000) small.process([ch.subarray(i, i + 1000)]);
    const a = big.getMeasurement();
    const b = small.getMeasurement();
    expect(Math.abs(a.integrated - b.integrated)).toBeLessThan(1e-6);
    expect(Math.abs(a.truePeak - b.truePeak)).toBeLessThan(1e-6);
  });
});
