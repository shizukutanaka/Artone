/**
 * Audio Sample Rate Converter Tests — audio/resampler.ts
 *
 * Covers: resample() batch API, resampleMultichannel(), createResampler()
 * streaming API, outputSampleCount(), and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  resample,
  resampleMultichannel,
  createResampler,
  outputSampleCount,
  type ResampleOptions,
} from '../audio/resampler';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a sine wave at the given frequency and sample rate. */
function sine(freq: number, samples: number, sr: number, amplitude = 1.0): Float32Array {
  const out = new Float32Array(samples);
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < samples; i++) out[i] = amplitude * Math.sin(w * i);
  return out;
}

/** Compute RMS of a Float32Array. */
function rms(data: Float32Array): number {
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / data.length);
}

/** DC value (mean). */
function mean(data: Float32Array): number {
  let sum = 0;
  for (const v of data) sum += v;
  return sum / data.length;
}

// ─── outputSampleCount ────────────────────────────────────────────────────────

describe('outputSampleCount', () => {
  it('same rate → same count', () => {
    expect(outputSampleCount(48000, 48000, 48000)).toBe(48000);
  });

  it('44100 → 48000 upsampling gives more samples', () => {
    const n = outputSampleCount(44100, 44100, 48000);
    expect(n).toBe(48000);
  });

  it('48000 → 44100 downsampling gives fewer samples', () => {
    const n = outputSampleCount(48000, 48000, 44100);
    expect(n).toBe(44100);
  });

  it('96000 → 48000 halves the sample count', () => {
    const n = outputSampleCount(96000, 96000, 48000);
    expect(n).toBe(48000);
  });

  it('zero input → zero output', () => {
    expect(outputSampleCount(0, 44100, 48000)).toBe(0);
  });
});

// ─── resample — edge cases ────────────────────────────────────────────────────

describe('resample — edge cases', () => {
  const opts: ResampleOptions = { sourceSampleRate: 44100, targetSampleRate: 48000 };

  it('empty input → empty output', () => {
    const out = resample(new Float32Array(0), opts);
    expect(out.length).toBe(0);
  });

  it('same source and target → returns copy', () => {
    const input = sine(440, 100, 48000);
    const out = resample(input, { sourceSampleRate: 48000, targetSampleRate: 48000 });
    expect(out.length).toBe(input.length);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(input[i]);
  });

  it('output is a new array (not the same reference)', () => {
    const input = sine(440, 100, 48000);
    const out = resample(input, { sourceSampleRate: 48000, targetSampleRate: 48000 });
    expect(out).not.toBe(input);
  });

  it('very short signal (< 4 samples) does not throw', () => {
    const input = new Float32Array([1, -1, 0.5]);
    expect(() => resample(input, opts)).not.toThrow();
  });
});

// ─── resample — output length ─────────────────────────────────────────────────

describe('resample — output length', () => {
  it('44100 → 48000: output length ≈ input × (48000/44100)', () => {
    const input = sine(440, 44100, 44100);
    const out = resample(input, { sourceSampleRate: 44100, targetSampleRate: 48000 });
    const expected = outputSampleCount(input.length, 44100, 48000);
    expect(out.length).toBe(expected);
  });

  it('48000 → 44100: output length ≈ input × (44100/48000)', () => {
    const input = sine(440, 48000, 48000);
    const out = resample(input, { sourceSampleRate: 48000, targetSampleRate: 44100 });
    const expected = outputSampleCount(input.length, 48000, 44100);
    expect(out.length).toBe(expected);
  });

  it('48000 → 96000 doubling: output length ≈ 2× input', () => {
    const input = sine(440, 480, 48000);
    const out = resample(input, { sourceSampleRate: 48000, targetSampleRate: 96000 });
    expect(out.length).toBeGreaterThanOrEqual(960 - 2);
    expect(out.length).toBeLessThanOrEqual(960 + 2);
  });

  it('96000 → 48000 halving: output length ≈ ½ input', () => {
    const input = sine(440, 960, 96000);
    const out = resample(input, { sourceSampleRate: 96000, targetSampleRate: 48000 });
    expect(out.length).toBeGreaterThanOrEqual(478);
    expect(out.length).toBeLessThanOrEqual(482);
  });
});

// ─── resample — signal fidelity ───────────────────────────────────────────────

describe('resample — signal fidelity', () => {
  it('DC signal resamples to DC with gain ≈ 1', () => {
    const dc = new Float32Array(4800).fill(1.0);
    for (const quality of ['linear', 'sinc4', 'sinc16'] as const) {
      const out = resample(dc, { sourceSampleRate: 44100, targetSampleRate: 48000, quality });
      // Skip initial/final transients
      const skip = 16;
      const interior = out.slice(skip, out.length - skip);
      const m = mean(interior);
      expect(Math.abs(m - 1.0)).toBeLessThan(0.02);
    }
  });

  it('440 Hz sine RMS is preserved within 3 dB after 44100→48000', () => {
    const inputSig = sine(440, 44100, 44100);
    for (const quality of ['linear', 'sinc4', 'sinc16'] as const) {
      const out = resample(inputSig, {
        sourceSampleRate: 44100,
        targetSampleRate: 48000,
        quality,
      });
      const skip = 32;
      const inRms  = rms(inputSig.slice(skip, inputSig.length - skip));
      const outRms = rms(out.slice(skip, out.length - skip));
      // Within 3 dB = ratio ~= 0.71..1.41
      expect(outRms / inRms).toBeGreaterThan(0.7);
      expect(outRms / inRms).toBeLessThan(1.45);
    }
  });

  it('sinc16 preserves 1 kHz sine RMS within 0.5 dB after 48000→44100', () => {
    const inputSig = sine(1000, 48000, 48000);
    const out = resample(inputSig, {
      sourceSampleRate: 48000,
      targetSampleRate: 44100,
      quality: 'sinc16',
    });
    const skip = 64;
    const inRms  = rms(inputSig.slice(skip, inputSig.length - skip));
    const outRms = rms(out.slice(skip, out.length - skip));
    const dbDiff = 20 * Math.log10(outRms / inRms);
    expect(Math.abs(dbDiff)).toBeLessThan(0.5);
  });

  it('silence resamples to silence', () => {
    const input = new Float32Array(4800);
    for (const quality of ['linear', 'sinc4', 'sinc16'] as const) {
      const out = resample(input, { sourceSampleRate: 44100, targetSampleRate: 48000, quality });
      for (const v of out) expect(Math.abs(v)).toBeLessThan(1e-10);
    }
  });

  it('sinc16 has lower aliasing than linear for downsampled signal', () => {
    // Generate a tone at 10 kHz, then downsample 48000→22050 (below Nyquist=11025)
    const inputSig = sine(10000, 48000 * 2, 48000);
    const linear = resample(inputSig, {
      sourceSampleRate: 48000,
      targetSampleRate: 22050,
      quality: 'linear',
    });
    const sinc16 = resample(inputSig, {
      sourceSampleRate: 48000,
      targetSampleRate: 22050,
      quality: 'sinc16',
    });
    // sinc16 should attenuate 10 kHz more (it's above Nyquist of 11025 Hz)
    // i.e., its RMS should be lower than linear's (which passes aliased energy)
    const rmsLinear = rms(linear.slice(64));
    const rmsSinc16 = rms(sinc16.slice(64));
    // sinc16 anti-aliasing filter should reduce energy above Nyquist
    expect(rmsSinc16).toBeLessThanOrEqual(rmsLinear + 0.01);
  });
});

// ─── resampleMultichannel ─────────────────────────────────────────────────────

describe('resampleMultichannel', () => {
  it('returns the same number of channels', () => {
    const channels = [sine(440, 4410, 44100), sine(880, 4410, 44100)];
    const out = resampleMultichannel(channels, { sourceSampleRate: 44100, targetSampleRate: 48000 });
    expect(out.length).toBe(2);
  });

  it('each channel has the correct output length', () => {
    const channels = [sine(440, 4410, 44100), sine(880, 4410, 44100)];
    const out = resampleMultichannel(channels, { sourceSampleRate: 44100, targetSampleRate: 48000 });
    const expected = outputSampleCount(4410, 44100, 48000);
    for (const ch of out) expect(ch.length).toBe(expected);
  });

  it('channels are resampled independently', () => {
    const ch1 = new Float32Array(4410).fill(0.5);
    const ch2 = new Float32Array(4410).fill(-0.5);
    const out = resampleMultichannel([ch1, ch2], {
      sourceSampleRate: 44100,
      targetSampleRate: 48000,
      quality: 'sinc4',
    });
    const skip = 16;
    expect(mean(out[0].slice(skip, out[0].length - skip))).toBeGreaterThan(0.4);
    expect(mean(out[1].slice(skip, out[1].length - skip))).toBeLessThan(-0.4);
  });

  it('empty channels array → empty output', () => {
    const out = resampleMultichannel([], { sourceSampleRate: 44100, targetSampleRate: 48000 });
    expect(out.length).toBe(0);
  });

  it('empty channel → empty resampled channel', () => {
    const out = resampleMultichannel(
      [new Float32Array(0)],
      { sourceSampleRate: 44100, targetSampleRate: 48000 },
    );
    expect(out[0].length).toBe(0);
  });
});

// ─── createResampler — interface ─────────────────────────────────────────────

describe('createResampler — interface', () => {
  it('returns correct interface', () => {
    const r = createResampler({ sourceSampleRate: 44100, targetSampleRate: 48000 });
    expect(typeof r.process).toBe('function');
    expect(typeof r.reset).toBe('function');
    expect(typeof r.outputLength).toBe('function');
  });

  it('outputLength matches batch output length', () => {
    const r = createResampler({ sourceSampleRate: 44100, targetSampleRate: 48000 });
    const input = sine(440, 44100, 44100);
    expect(r.outputLength(input.length)).toBe(outputSampleCount(input.length, 44100, 48000));
  });
});

// ─── createResampler — streaming ─────────────────────────────────────────────

describe('createResampler — streaming', () => {
  it('single-block process gives same result as batch resample', () => {
    const input = sine(440, 44100, 44100);
    const opts: ResampleOptions = {
      sourceSampleRate: 44100,
      targetSampleRate: 48000,
      quality: 'sinc4',
    };
    const batch = resample(input, opts);
    const r = createResampler(opts);
    const streaming = r.process(input);
    // Same length
    expect(streaming.length).toBe(batch.length);
    // RMS should be very close
    const skip = 32;
    const rmsBatch     = rms(batch.slice(skip));
    const rmsStreaming = rms(streaming.slice(skip));
    expect(Math.abs(rmsBatch - rmsStreaming) / (rmsBatch + 1e-9)).toBeLessThan(0.05);
  });

  it('empty process call returns empty array', () => {
    const r = createResampler({ sourceSampleRate: 44100, targetSampleRate: 48000 });
    expect(r.process(new Float32Array(0)).length).toBe(0);
  });

  it('chunked processing total length ≈ batch output length', () => {
    const input = sine(440, 44100, 44100);
    const opts: ResampleOptions = { sourceSampleRate: 44100, targetSampleRate: 48000, quality: 'sinc4' };
    const batchOut = resample(input, opts);

    const CHUNK = 1024;
    const r = createResampler(opts);
    let totalOut = 0;
    for (let i = 0; i < input.length; i += CHUNK) {
      const chunk = input.subarray(i, i + CHUNK);
      totalOut += r.process(chunk).length;
    }
    // Allow ±2 samples tolerance for fractional accumulation
    expect(Math.abs(totalOut - batchOut.length)).toBeLessThanOrEqual(2);
  });

  it('reset clears state — second pass matches fresh object', () => {
    const input = sine(440, 4410, 44100);
    const opts: ResampleOptions = { sourceSampleRate: 44100, targetSampleRate: 48000 };
    const r = createResampler(opts);

    const first = r.process(input);
    r.reset();
    const second = r.process(input);

    // Should give identical result after reset
    expect(second.length).toBe(first.length);
    for (let i = 0; i < second.length; i++) {
      expect(second[i]).toBeCloseTo(first[i], 5);
    }
  });

  it('same-rate streaming is lossless passthrough', () => {
    const input = sine(440, 480, 48000);
    const r = createResampler({ sourceSampleRate: 48000, targetSampleRate: 48000 });
    const out = r.process(input);
    expect(out.length).toBe(input.length);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(input[i]);
  });

  it('DC signal is preserved across multiple chunks', () => {
    const CHUNK = 512;
    const opts: ResampleOptions = {
      sourceSampleRate: 44100,
      targetSampleRate: 48000,
      quality: 'sinc4',
    };
    const r = createResampler(opts);
    const allOut: number[] = [];
    for (let pass = 0; pass < 8; pass++) {
      const chunk = new Float32Array(CHUNK).fill(0.5);
      const out = r.process(chunk);
      allOut.push(...out);
    }
    // Skip initial transient
    const skip = 32;
    const interior = new Float32Array(allOut.slice(skip));
    expect(mean(interior)).toBeGreaterThan(0.45);
    expect(mean(interior)).toBeLessThan(0.55);
  });

  it('upsampling (48000→96000) preserves RMS across streaming chunks', () => {
    const CHUNK = 1024;
    const opts: ResampleOptions = {
      sourceSampleRate: 48000,
      targetSampleRate: 96000,
      quality: 'sinc4',
    };
    const r = createResampler(opts);
    const allIn: number[] = [];
    const allOut: number[] = [];
    for (let pass = 0; pass < 4; pass++) {
      const chunk = sine(440, CHUNK, 48000, 0.7);
      allIn.push(...chunk);
      const out = r.process(chunk);
      allOut.push(...out);
    }
    const skip = 64;
    const inRms  = rms(new Float32Array(allIn.slice(skip)));
    const outRms = rms(new Float32Array(allOut.slice(skip)));
    expect(outRms / inRms).toBeGreaterThan(0.7);
    expect(outRms / inRms).toBeLessThan(1.4);
  });
});

// ─── Quality comparison ───────────────────────────────────────────────────────

describe('Quality comparison', () => {
  it('all quality modes return valid output for 44100→48000', () => {
    const input = sine(440, 4410, 44100, 0.5);
    for (const quality of ['linear', 'sinc4', 'sinc16'] as const) {
      const out = resample(input, { sourceSampleRate: 44100, targetSampleRate: 48000, quality });
      expect(out.length).toBeGreaterThan(0);
      expect(out.every(isFinite)).toBe(true);
    }
  });

  it('sinc16 RMS matches sinc4 within 1 dB for 440 Hz at 44100→48000', () => {
    const input = sine(440, 44100, 44100);
    const s4  = resample(input, { sourceSampleRate: 44100, targetSampleRate: 48000, quality: 'sinc4' });
    const s16 = resample(input, { sourceSampleRate: 44100, targetSampleRate: 48000, quality: 'sinc16' });
    const skip = 64;
    const r4  = rms(s4.slice(skip));
    const r16 = rms(s16.slice(skip));
    expect(Math.abs(20 * Math.log10(r16 / r4))).toBeLessThan(1);
  });
});
