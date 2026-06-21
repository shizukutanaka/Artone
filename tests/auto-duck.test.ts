/**
 * Auto-Duck Tests — audio/auto-duck.ts
 *
 * Covers: autoDuck (batch), computeDuckGain, applyDuckGain,
 * createAutoDucker (streaming), rmsDb, and envelope timing.
 */

import { describe, it, expect } from 'vitest';
import {
  autoDuck,
  computeDuckGain,
  applyDuckGain,
  createAutoDucker,
  rmsDb,
  type AutoDuckOptions,
} from '../audio/auto-duck';

const SR = 48000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** DC signal at a fixed amplitude. */
function dc(n: number, amplitude: number): Float32Array {
  const out = new Float32Array(n);
  out.fill(amplitude);
  return out;
}

/** Sine wave. */
function sine(n: number, freq = 440, amp = 0.5): Float32Array {
  const out = new Float32Array(n);
  const w   = (2 * Math.PI * freq) / SR;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

/** RMS of a Float32Array. */
function rms(a: Float32Array, start = 0, end?: number): number {
  const to  = end ?? a.length;
  let sum   = 0;
  for (let i = start; i < to; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, to - start));
}

// ─── rmsDb ────────────────────────────────────────────────────────────────────

describe('rmsDb', () => {
  it('silence → -144 dBFS', () => {
    expect(rmsDb(new Float32Array(1024))).toBe(-144);
  });

  it('full-scale DC → 0 dBFS', () => {
    expect(rmsDb(dc(1024, 1.0))).toBeCloseTo(0, 2);
  });

  it('-6 dBFS signal → ~-6 dBFS', () => {
    // 0.5 linear = -6.02 dBFS
    expect(rmsDb(dc(1024, 0.5))).toBeCloseTo(-6.02, 1);
  });

  it('uses start/end range', () => {
    const a = new Float32Array(1024);
    a.fill(0.5, 512); // second half is 0.5, first half is silence
    expect(rmsDb(a, 512)).toBeCloseTo(-6.02, 1);
    expect(rmsDb(a, 0, 512)).toBe(-144);
  });

  it('empty range returns -144', () => {
    expect(rmsDb(new Float32Array(0))).toBe(-144);
  });
});

// ─── computeDuckGain / applyDuckGain ─────────────────────────────────────────

describe('computeDuckGain', () => {
  it('silence side-chain → all-zero gain dB', () => {
    const gainDb = computeDuckGain(new Float32Array(SR));
    expect(gainDb.every((v) => v === 0)).toBe(true);
  });

  it('loud side-chain → gain dB converges toward duckDb', () => {
    const opts: AutoDuckOptions = {
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.01, holdSec: 0, releaseSec: 0.5,
    };
    // Side-chain well above threshold
    const sc     = dc(SR, 0.3); // ~-10 dBFS
    const gainDb = computeDuckGain(sc, opts);
    // After a second of loud input, gain should be close to duckDb
    const last   = gainDb[gainDb.length - 1];
    expect(last).toBeLessThan(-10);
  });

  it('gain is always ≤ 0 dB', () => {
    const sc = dc(SR, 0.5);
    const gainDb = computeDuckGain(sc);
    expect(gainDb.every((v) => v <= 0.001)).toBe(true);
  });

  it('output length equals input length', () => {
    const sc     = sine(4096);
    const gainDb = computeDuckGain(sc);
    expect(gainDb.length).toBe(sc.length);
  });

  it('all values finite', () => {
    const gainDb = computeDuckGain(sine(SR));
    expect(gainDb.every(isFinite)).toBe(true);
  });
});

describe('applyDuckGain', () => {
  it('0 dB gain → output equals input', () => {
    const main   = sine(1024, 440, 0.5);
    const gainDb = new Float32Array(1024); // all zeros
    const out    = applyDuckGain(main, gainDb);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(main[i], 5);
    }
  });

  it('-6 dB gain → output ≈ half amplitude', () => {
    const main   = dc(1024, 1.0);
    const gainDb = new Float32Array(1024).fill(-6.0206); // ≈ 0.5 linear
    const out    = applyDuckGain(main, gainDb);
    // Every sample should be ~0.5
    for (const v of out) expect(v).toBeCloseTo(0.5, 2);
  });

  it('-144 dB gain → output near zero', () => {
    const main   = dc(1024, 1.0);
    const gainDb = new Float32Array(1024).fill(-144);
    const out    = applyDuckGain(main, gainDb);
    expect(rms(out)).toBeLessThan(1e-6);
  });

  it('output length equals min(main, gainDb)', () => {
    const out = applyDuckGain(new Float32Array(100), new Float32Array(60));
    expect(out.length).toBe(60);
  });
});

// ─── autoDuck — batch ────────────────────────────────────────────────────────

describe('autoDuck — output shape', () => {
  it('output length equals input length', () => {
    const main = sine(SR);
    const sc   = sine(SR, 800, 0.3);
    const r    = autoDuck(main, sc);
    expect(r.mainOut.length).toBe(main.length);
    expect(r.gainDb.length).toBe(main.length);
  });

  it('all output values are finite', () => {
    const r = autoDuck(sine(SR), sine(SR, 800, 0.3));
    expect(r.mainOut.every(isFinite)).toBe(true);
    expect(r.gainDb.every(isFinite)).toBe(true);
  });

  it('gain dB is always ≤ 0', () => {
    const r = autoDuck(sine(SR), dc(SR, 0.5));
    expect(r.gainDb.every((v) => v <= 0.001)).toBe(true);
  });
});

describe('autoDuck — silent side-chain', () => {
  it('silence side-chain → mainOut equals main', () => {
    const main = sine(SR, 440, 0.5);
    const r    = autoDuck(main, new Float32Array(SR));
    for (let i = 0; i < main.length; i++) {
      expect(r.mainOut[i]).toBeCloseTo(main[i], 5);
    }
  });

  it('silence side-chain → gainDb all zero', () => {
    const r = autoDuck(sine(SR), new Float32Array(SR));
    expect(r.gainDb.every((v) => v === 0)).toBe(true);
  });
});

describe('autoDuck — ducking behaviour', () => {
  it('loud side-chain reduces main output RMS', () => {
    const opts: AutoDuckOptions = {
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.01, holdSec: 0, releaseSec: 0.1,
    };
    const main = dc(SR, 1.0);
    const sc   = dc(SR, 0.1); // -20 dBFS — well above -40 threshold
    const r    = autoDuck(main, sc, opts);

    const skip = Math.floor(0.1 * SR); // allow attack to complete
    const inRms  = rms(main, skip);
    const outRms = rms(r.mainOut, skip);
    expect(outRms).toBeLessThan(inRms * 0.9);
  });

  it('duckDb limits maximum reduction', () => {
    const duckDb = -6;
    const opts: AutoDuckOptions = {
      sampleRate: SR, thresholdDb: -60, duckDb, // threshold below noise
      attackSec: 0.001, holdSec: 0, releaseSec: 0.001,
    };
    const main = dc(SR, 1.0);
    const sc   = dc(SR, 0.5); // very loud side-chain
    const r    = autoDuck(main, sc, opts);

    const skip = Math.floor(0.05 * SR);
    const minGain = Math.min(...r.gainDb.slice(skip));
    // Gain should not exceed duckDb
    expect(minGain).toBeGreaterThanOrEqual(duckDb - 1.5);
  });

  it('threshold controls activation point', () => {
    const mainSig = dc(SR, 1.0);
    const sc      = dc(SR, 0.03); // ~-30 dBFS

    // High threshold: no ducking
    const rHigh = autoDuck(mainSig, sc, {
      sampleRate: SR, thresholdDb: -20, duckDb: -12,
      attackSec: 0.01, holdSec: 0, releaseSec: 0.1,
    });
    // Low threshold: ducking
    const rLow = autoDuck(mainSig, sc, {
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.01, holdSec: 0, releaseSec: 0.1,
    });

    const skip = Math.floor(0.1 * SR);
    const rmsHigh = rms(rHigh.mainOut, skip);
    const rmsLow  = rms(rLow.mainOut, skip);
    expect(rmsHigh).toBeGreaterThan(rmsLow);
  });
});

// ─── autoDuck — envelope timing ──────────────────────────────────────────────

describe('autoDuck — envelope timing', () => {
  it('slower release → higher RMS shortly after side-chain goes silent', () => {
    const opts = (releaseSec: number): AutoDuckOptions => ({
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.001, holdSec: 0, releaseSec,
    });
    const n    = SR * 2;
    const main = dc(n, 1.0);
    // Side-chain active for first second, silent for second second
    const sc   = new Float32Array(n);
    sc.fill(0.1, 0, SR); // active for 1 s

    const rFast = autoDuck(main, sc, opts(0.05));
    const rSlow = autoDuck(main, sc, opts(1.0));

    // At 1.1 s: slow release still ducking, fast release recovering faster
    const evalStart = Math.floor(1.1 * SR);
    const evalEnd   = Math.floor(1.3 * SR);
    const rmsFast = rms(rFast.mainOut, evalStart, evalEnd);
    const rmsSlow = rms(rSlow.mainOut, evalStart, evalEnd);
    expect(rmsFast).toBeGreaterThan(rmsSlow);
  });

  it('hold time delays release', () => {
    const n    = SR * 2;
    const main = dc(n, 1.0);
    const sc   = new Float32Array(n);
    sc.fill(0.1, 0, SR); // active for 1 s

    const noHold   = autoDuck(main, sc, {
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.001, holdSec: 0, releaseSec: 0.1,
    });
    const withHold = autoDuck(main, sc, {
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.001, holdSec: 0.3, releaseSec: 0.1,
    });

    // At 1.15 s: with hold should still be ducked more
    const evalStart = Math.floor(1.15 * SR);
    const evalEnd   = Math.floor(1.2 * SR);
    const rmsNoHold   = rms(noHold.mainOut, evalStart, evalEnd);
    const rmsWithHold = rms(withHold.mainOut, evalStart, evalEnd);
    expect(rmsNoHold).toBeGreaterThan(rmsWithHold);
  });
});

// ─── createAutoDucker — streaming ────────────────────────────────────────────

describe('createAutoDucker — interface', () => {
  it('returns process / reset', () => {
    const d = createAutoDucker();
    expect(typeof d.process).toBe('function');
    expect(typeof d.reset).toBe('function');
  });

  it('empty block returns empty output', () => {
    const d = createAutoDucker();
    const r = d.process(new Float32Array(0), new Float32Array(0));
    expect(r.mainOut.length).toBe(0);
    expect(r.gainDb.length).toBe(0);
  });
});

describe('createAutoDucker — streaming vs batch', () => {
  it('streaming in 512-sample chunks matches batch for silence SC', () => {
    const opts: AutoDuckOptions = { sampleRate: SR };
    const n    = SR;
    const main = sine(n, 440, 0.5);
    const sc   = new Float32Array(n); // silence → no duck

    // Streaming
    const ducker  = createAutoDucker(opts);
    const CHUNK   = 512;
    const outBufs: Float32Array[] = [];
    for (let i = 0; i < n; i += CHUNK) {
      const r = ducker.process(
        main.subarray(i, i + CHUNK),
        sc.subarray(i, i + CHUNK),
      );
      outBufs.push(r.mainOut);
    }
    const outLen = outBufs.reduce((s, b) => s + b.length, 0);
    expect(outLen).toBe(n);

    // With silence SC, gain is zero so mainOut must equal main exactly
    let sampleOffset = 0;
    for (const buf of outBufs) {
      for (let k = 0; k < buf.length; k++) {
        expect(buf[k]).toBeCloseTo(main[sampleOffset + k], 5);
      }
      sampleOffset += buf.length;
    }
  });

  it('streaming produces same total output length as batch', () => {
    const n    = 4096;
    const main = sine(n, 440, 0.5);
    const sc   = dc(n, 0.1);
    const opts: AutoDuckOptions = { sampleRate: SR, attackSec: 0.001 };

    const batch = autoDuck(main, sc, opts);
    const ducker = createAutoDucker(opts);
    const CHUNK  = 256;
    let totalOut = 0;
    for (let i = 0; i < n; i += CHUNK) {
      totalOut += ducker.process(
        main.subarray(i, i + CHUNK),
        sc.subarray(i, i + CHUNK),
      ).mainOut.length;
    }
    expect(totalOut).toBe(batch.mainOut.length);
  });

  it('reset clears envelope state', () => {
    const opts: AutoDuckOptions = {
      sampleRate: SR, thresholdDb: -40, duckDb: -12,
      attackSec: 0.001, holdSec: 0.5, releaseSec: 0.5,
    };
    const ducker = createAutoDucker(opts);

    // Build up a strong duck
    ducker.process(dc(SR, 1.0), dc(SR, 0.3));

    // Reset and process silence — should immediately have zero gain
    ducker.reset();
    const r = ducker.process(dc(512, 1.0), new Float32Array(512));
    expect(r.gainDb.every((v) => v === 0)).toBe(true);
  });

  it('streaming all-zero gain on silence SC after reset', () => {
    const ducker = createAutoDucker({ sampleRate: SR });
    const r = ducker.process(dc(4096, 0.8), new Float32Array(4096));
    expect(r.gainDb.every((v) => v === 0)).toBe(true);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('autoDuck — edge cases', () => {
  it('very short signals (< 1 window) do not throw', () => {
    expect(() => autoDuck(new Float32Array(10), new Float32Array(10))).not.toThrow();
  });

  it('duckDb = 0 → no ducking even with loud SC', () => {
    const main = dc(SR, 1.0);
    const sc   = dc(SR, 1.0);
    const r    = autoDuck(main, sc, { duckDb: 0, thresholdDb: -60, sampleRate: SR });
    expect(rms(r.mainOut)).toBeCloseTo(1.0, 3);
  });

  it('single sample does not throw', () => {
    expect(() =>
      autoDuck(new Float32Array([0.5]), new Float32Array([0.5])),
    ).not.toThrow();
  });

  it('negative duckDb produces attenuation', () => {
    const main = dc(2 * SR, 1.0);
    const sc   = dc(2 * SR, 0.3);
    const r    = autoDuck(main, sc, {
      sampleRate: SR, thresholdDb: -40, duckDb: -20,
      attackSec: 0.001, holdSec: 0, releaseSec: 0.01,
    });
    const skip = Math.floor(0.05 * SR);
    expect(rms(r.mainOut, skip)).toBeLessThan(0.95);
  });

  it('harder duck reduces output more than softer duck', () => {
    const n    = SR;
    const main = dc(n, 1.0);
    const sc   = dc(n, 0.3);

    const rSoft = autoDuck(main, sc, {
      sampleRate: SR, thresholdDb: -40, duckDb: -6,
      attackSec: 0.001, holdSec: 0, releaseSec: 0.01,
    });
    const rHard = autoDuck(main, sc, {
      sampleRate: SR, thresholdDb: -40, duckDb: -18,
      attackSec: 0.001, holdSec: 0, releaseSec: 0.01,
    });

    const skip = Math.floor(0.05 * SR);
    expect(rms(rHard.mainOut, skip)).toBeLessThan(rms(rSoft.mainOut, skip));
  });
});
