/**
 * Delay Line Tests — audio/delay-line.ts
 *
 * Covers: applyEcho, applyPingPong, applyChorus, applyFlanger,
 * createEchoProcessor, createFlangerProcessor, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  applyEcho,
  applyPingPong,
  applyChorus,
  applyFlanger,
  createEchoProcessor,
  createFlangerProcessor,
} from '../audio/delay-line';

const SR = 48000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** RMS of a Float32Array. */
function rms(a: Float32Array, start = 0, end?: number): number {
  const to = end ?? a.length;
  let sum  = 0;
  for (let i = start; i < to; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, to - start));
}

/** Sine wave. */
function sine(n: number, freq = 440, amp = 0.5): Float32Array {
  const out = new Float32Array(n);
  const w   = (2 * Math.PI * freq) / SR;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

/** Single impulse at sample `pos`. */
function impulse(n: number, pos = 0, amp = 1.0): Float32Array {
  const out = new Float32Array(n);
  out[pos]  = amp;
  return out;
}

// ─── applyEcho ───────────────────────────────────────────────────────────────

describe('applyEcho — output shape', () => {
  it('output length equals input length', () => {
    const out = applyEcho(sine(SR));
    expect(out.length).toBe(SR);
  });

  it('all values are finite', () => {
    const out = applyEcho(sine(SR));
    expect(out.every(isFinite)).toBe(true);
  });
});

describe('applyEcho — silence', () => {
  it('silence input → silence output', () => {
    const out = applyEcho(new Float32Array(SR));
    expect(rms(out)).toBeLessThan(1e-10);
  });
});

describe('applyEcho — impulse response', () => {
  it('impulse produces echo near configured delay', () => {
    const delayMs  = 100;
    const delaySamp = Math.round(delayMs * SR / 1000); // 4800
    const n = delaySamp * 3;
    const out = applyEcho(impulse(n, 0), { sampleRate: SR, delayMs, feedback: 0, wetDry: 1.0 });
    // Echo appears at delaySamp+1 (read-before-write convention adds 1 sample)
    expect(Math.abs(out[delaySamp + 1])).toBeGreaterThan(0.5);
    // Well before the echo: near zero
    expect(Math.abs(out[delaySamp - 10])).toBeLessThan(0.01);
  });

  it('feedback=0, wet=1 → single echo, no further echoes', () => {
    const delayMs   = 50;
    const delaySamp = Math.round(delayMs * SR / 1000);
    const n         = delaySamp * 5;
    const out = applyEcho(impulse(n, 0), {
      sampleRate: SR, delayMs, feedback: 0, wetDry: 1.0,
    });
    // Echo at delaySamp+1 (read-before-write offset)
    expect(Math.abs(out[delaySamp + 1])).toBeGreaterThan(0.5);
    // No second echo (no feedback)
    expect(Math.abs(out[delaySamp * 2 + 1])).toBeLessThan(0.01);
  });

  it('with feedback, second echo appears', () => {
    const delayMs   = 50;
    const delaySamp = Math.round(delayMs * SR / 1000);
    const fb        = 0.5;
    const n         = delaySamp * 5;
    const out = applyEcho(impulse(n, 0), {
      sampleRate: SR, delayMs, feedback: fb, wetDry: 1.0,
    });
    // Echo n is at n*(delaySamp+1) due to read-before-write convention
    expect(Math.abs(out[delaySamp + 1])).toBeGreaterThan(0.4);
    expect(Math.abs(out[(delaySamp + 1) * 2])).toBeGreaterThan(0.1);
    // Second echo smaller than first
    expect(Math.abs(out[(delaySamp + 1) * 2])).toBeLessThan(Math.abs(out[delaySamp + 1]) + 0.01);
  });

  it('wetDry=0 → pure dry signal', () => {
    const input = sine(SR, 440, 0.5);
    const out   = applyEcho(input, { wetDry: 0 });
    for (let i = 0; i < input.length; i++) {
      expect(out[i]).toBeCloseTo(input[i], 5);
    }
  });

  it('higher feedback → higher sustained RMS', () => {
    const opts = (fb: number) => ({
      sampleRate: SR, delayMs: 50, feedback: fb, wetDry: 0.5,
    });
    const sig    = sine(SR, 440, 0.5);
    const rmsLow = rms(applyEcho(sig, opts(0.1)));
    const rmsHigh = rms(applyEcho(sig, opts(0.6)));
    expect(rmsHigh).toBeGreaterThan(rmsLow);
  });
});

// ─── applyPingPong ────────────────────────────────────────────────────────────

describe('applyPingPong — shape', () => {
  it('returns left and right of same length as input', () => {
    const { left, right } = applyPingPong(sine(SR));
    expect(left.length).toBe(SR);
    expect(right.length).toBe(SR);
  });

  it('all values are finite', () => {
    const { left, right } = applyPingPong(sine(SR));
    expect(left.every(isFinite)).toBe(true);
    expect(right.every(isFinite)).toBe(true);
  });
});

describe('applyPingPong — stereo independence', () => {
  it('left and right channels are different', () => {
    const { left, right } = applyPingPong(sine(SR, 440, 0.5), {
      sampleRate: SR, delayMs: 50, feedback: 0.5, wetDry: 0.5,
    });
    let same = 0;
    for (let i = 0; i < left.length; i++) {
      if (Math.abs(left[i] - right[i]) < 1e-6) same++;
    }
    // They should be different for most samples
    expect(same).toBeLessThan(left.length * 0.9);
  });

  it('silence → silence on both channels', () => {
    const { left, right } = applyPingPong(new Float32Array(SR));
    expect(rms(left)).toBeLessThan(1e-10);
    expect(rms(right)).toBeLessThan(1e-10);
  });
});

// ─── applyChorus ─────────────────────────────────────────────────────────────

describe('applyChorus — shape', () => {
  it('returns stereo pair of same length as input', () => {
    const { left, right } = applyChorus(sine(SR));
    expect(left.length).toBe(SR);
    expect(right.length).toBe(SR);
  });

  it('all values are finite', () => {
    const { left, right } = applyChorus(sine(SR));
    expect(left.every(isFinite)).toBe(true);
    expect(right.every(isFinite)).toBe(true);
  });
});

describe('applyChorus — behavior', () => {
  it('silence → silence on both channels', () => {
    const { left, right } = applyChorus(new Float32Array(SR));
    expect(rms(left)).toBeLessThan(1e-10);
    expect(rms(right)).toBeLessThan(1e-10);
  });

  it('wet=0 → L and R equal input', () => {
    const input = sine(1024, 440, 0.5);
    const { left, right } = applyChorus(input, { wetDry: 0 });
    for (let i = 0; i < input.length; i++) {
      expect(left[i]).toBeCloseTo(input[i], 5);
      expect(right[i]).toBeCloseTo(input[i], 5);
    }
  });

  it('left and right channels differ (quadrature LFOs create stereo spread)', () => {
    const { left, right } = applyChorus(sine(SR, 440, 0.5), {
      sampleRate: SR, centerDelayMs: 10, modRateHz: 0.5, modDepthMs: 5, wetDry: 1.0,
    });
    // After LFO has moved, channels should differ
    const skip = Math.floor(SR * 0.1);
    let diffEnergy = 0;
    for (let i = skip; i < left.length; i++) {
      const d = left[i] - right[i];
      diffEnergy += d * d;
    }
    expect(diffEnergy).toBeGreaterThan(0.01);
  });

  it('output RMS is in a reasonable range of input RMS', () => {
    const input   = sine(SR, 440, 0.5);
    const { left, right } = applyChorus(input, { wetDry: 0.5 });
    const inRms   = rms(input);
    const outRms  = (rms(left) + rms(right)) / 2;
    // Should be within ±50% of input RMS
    expect(outRms).toBeGreaterThan(inRms * 0.3);
    expect(outRms).toBeLessThan(inRms * 1.8);
  });
});

// ─── applyFlanger ────────────────────────────────────────────────────────────

describe('applyFlanger — shape', () => {
  it('output length equals input length', () => {
    const out = applyFlanger(sine(SR));
    expect(out.length).toBe(SR);
  });

  it('all values finite', () => {
    const out = applyFlanger(sine(SR));
    expect(out.every(isFinite)).toBe(true);
  });
});

describe('applyFlanger — behavior', () => {
  it('silence → silence', () => {
    const out = applyFlanger(new Float32Array(SR));
    expect(rms(out)).toBeLessThan(1e-10);
  });

  it('wet=0 → output equals input', () => {
    const input = sine(1024, 440, 0.5);
    const out   = applyFlanger(input, { wetDry: 0 });
    for (let i = 0; i < input.length; i++) {
      expect(out[i]).toBeCloseTo(input[i], 5);
    }
  });

  it('produces comb-filtering effect (output spectrum differs from input)', () => {
    const n     = SR;
    const input = sine(n, 440, 0.5);
    const out   = applyFlanger(input, {
      sampleRate: SR, centerDelayMs: 2, modRateHz: 1.0, modDepthMs: 1.5,
      feedback: 0.7, wetDry: 1.0,
    });
    // With full wet, output has additional delay+feedback content
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(out[i] - input[i]);
    expect(diff).toBeGreaterThan(1);
  });

  it('negative feedback accepted without throw', () => {
    expect(() =>
      applyFlanger(sine(1024), { feedback: -0.7, sampleRate: SR }),
    ).not.toThrow();
  });
});

// ─── createEchoProcessor — streaming ────────────────────────────────────────

describe('createEchoProcessor — interface', () => {
  it('returns process / reset', () => {
    const p = createEchoProcessor();
    expect(typeof p.process).toBe('function');
    expect(typeof p.reset).toBe('function');
  });

  it('empty block returns empty output', () => {
    const p   = createEchoProcessor();
    const out = p.process(new Float32Array(0));
    expect(out.length).toBe(0);
  });
});

describe('createEchoProcessor — streaming matches batch', () => {
  it('streaming in 512-sample chunks produces same output as batch', () => {
    const opts  = { sampleRate: SR, delayMs: 100, feedback: 0.4, wetDry: 0.4 };
    const input = sine(SR, 440, 0.5);

    // Batch
    const batchOut = applyEcho(input, opts);

    // Streaming
    const proc   = createEchoProcessor(opts);
    const CHUNK  = 512;
    const parts: Float32Array[] = [];
    for (let i = 0; i < input.length; i += CHUNK) {
      parts.push(proc.process(input.subarray(i, i + CHUNK)));
    }
    const streamLen = parts.reduce((s, p) => s + p.length, 0);
    expect(streamLen).toBe(batchOut.length);

    // Reconstruct and compare
    let offset = 0;
    for (const part of parts) {
      for (let k = 0; k < part.length; k++) {
        expect(part[k]).toBeCloseTo(batchOut[offset + k], 5);
      }
      offset += part.length;
    }
  });

  it('reset clears state: silence after reset', () => {
    const proc = createEchoProcessor({ sampleRate: SR, delayMs: 100, feedback: 0.5, wetDry: 0.5 });
    // Build up echo state
    proc.process(sine(SR, 440, 0.5));
    proc.reset();
    // After reset, silence input should give silence
    const out = proc.process(new Float32Array(512));
    expect(rms(out)).toBeLessThan(1e-10);
  });

  it('processes in 1-sample blocks without throwing', () => {
    const proc  = createEchoProcessor({ sampleRate: SR, delayMs: 50, feedback: 0.3 });
    const input = sine(512);
    expect(() => {
      for (let i = 0; i < input.length; i++) {
        proc.process(input.subarray(i, i + 1));
      }
    }).not.toThrow();
  });
});

// ─── createFlangerProcessor — streaming ──────────────────────────────────────

describe('createFlangerProcessor — streaming matches batch', () => {
  it('streaming in 256-sample chunks matches batch', () => {
    const opts  = { sampleRate: SR, centerDelayMs: 2, modRateHz: 1.0, feedback: 0.7, wetDry: 0.5 };
    const input = sine(SR, 440, 0.5);

    const batchOut = applyFlanger(input, opts);

    const proc   = createFlangerProcessor(opts);
    const CHUNK  = 256;
    const parts: Float32Array[] = [];
    for (let i = 0; i < input.length; i += CHUNK) {
      parts.push(proc.process(input.subarray(i, i + CHUNK)));
    }

    let offset = 0;
    for (const part of parts) {
      for (let k = 0; k < part.length; k++) {
        expect(part[k]).toBeCloseTo(batchOut[offset + k], 5);
      }
      offset += part.length;
    }
  });

  it('reset clears state and LFO phase', () => {
    const proc = createFlangerProcessor({ sampleRate: SR });
    proc.process(sine(SR));
    proc.reset();
    // After reset, two processors started fresh should produce same output
    const fresh = createFlangerProcessor({ sampleRate: SR });
    const input = sine(512, 440, 0.5);
    const r1    = proc.process(input.slice());
    const r2    = fresh.process(input.slice());
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i]).toBeCloseTo(r2[i], 5);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('delay effects — edge cases', () => {
  it('very short input (< delay time) does not throw', () => {
    expect(() => applyEcho(new Float32Array(10), { delayMs: 100, sampleRate: SR })).not.toThrow();
    expect(() => applyChorus(new Float32Array(10))).not.toThrow();
    expect(() => applyFlanger(new Float32Array(10))).not.toThrow();
  });

  it('single sample does not throw', () => {
    expect(() => applyEcho(new Float32Array([0.5]))).not.toThrow();
    expect(() => applyFlanger(new Float32Array([0.5]))).not.toThrow();
  });

  it('feedback clamped: large feedback value does not cause instability', () => {
    const out = applyFlanger(sine(SR, 440, 0.1), {
      sampleRate: SR, feedback: 2.0, // should be clamped to 0.99
    });
    expect(out.every(isFinite)).toBe(true);
    expect(out.every((v) => Math.abs(v) < 1000)).toBe(true);
  });
});
