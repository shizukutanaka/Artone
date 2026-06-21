/**
 * Dynamics processing テスト — コンプレッサー / リミッター / ゲート
 *
 * audio/dynamics.ts の純粋 TypeScript 実装を DOM なしで検証。
 */

import { describe, it, expect } from 'vitest';
import {
  applyCompressor,
  applyLimiter,
  applyGate,
  applyCompressorMultichannel,
  gainComputeCompressor,
  dbToLin,
  linToDb,
} from '../audio/dynamics';

const SR = 48000;

// ============================================================
// Utilities
// ============================================================

function rmsDb(signal: Float32Array, skip = 0): number {
  let sum = 0;
  const n = signal.length - skip;
  for (let i = skip; i < signal.length; i++) sum += signal[i] * signal[i];
  const rms = Math.sqrt(sum / n);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** Creates a constant-amplitude sine tone (avoids float precision issues). */
function tone(ampLin: number, length: number): Float32Array {
  const s = new Float32Array(length);
  for (let i = 0; i < length; i++) s[i] = ampLin * Math.sin((2 * Math.PI * 1000 * i) / SR);
  return s;
}

// ============================================================
// dbToLin / linToDb
// ============================================================

describe('dbToLin / linToDb', () => {
  it('0 dB → 1.0', () => expect(dbToLin(0)).toBe(1));
  it('-20 dB → 0.1', () => expect(dbToLin(-20)).toBeCloseTo(0.1, 6));
  it('+6 dB → ~2.0', () => expect(dbToLin(6)).toBeCloseTo(1.995, 2));
  it('1.0 → 0 dB', () => expect(linToDb(1)).toBe(0));
  it('0.1 → −20 dB', () => expect(linToDb(0.1)).toBeCloseTo(-20, 4));
  it('round-trip', () => expect(linToDb(dbToLin(-14))).toBeCloseTo(-14, 6));
});

// ============================================================
// gainComputeCompressor — static gain curve
// ============================================================

describe('gainComputeCompressor', () => {
  it('returns 0 below threshold (hard knee)', () => {
    expect(gainComputeCompressor(-30, -24, 4, 0)).toBe(0);
  });

  it('applies ratio above threshold (hard knee)', () => {
    // Input 6 dB above −24 = −18 dBFS. Ratio 4:1. GR = (T − x)(1 − 1/R) = -6 × 0.75 = -4.5 dB
    expect(gainComputeCompressor(-18, -24, 4, 0)).toBeCloseTo(-4.5, 4);
  });

  it('unity gain at threshold (hard knee)', () => {
    expect(gainComputeCompressor(-24, -24, 4, 0)).toBe(0);
  });

  it('soft knee: 0 dB gain well below knee', () => {
    expect(gainComputeCompressor(-40, -24, 4, 6)).toBe(0); // -40 < -24 - 3
  });

  it('soft knee: transitions smoothly through knee zone', () => {
    // Knee zone = [-27, -21] (centre at threshold -24, half-width 3 dB).
    // At -27 (boundary) reduction = 0; strictly inside → some reduction.
    const gcAtBoundary = gainComputeCompressor(-27, -24, 4, 6); // knee lower edge → 0
    const gcMidKnee    = gainComputeCompressor(-26, -24, 4, 6); // 1 dB inside → > 0
    const gcAt         = gainComputeCompressor(-24, -24, 4, 6); // at threshold
    const gcAbove      = gainComputeCompressor(-21, -24, 4, 6); // above knee
    expect(gcAtBoundary).toBeCloseTo(0, 10);   // no reduction at very bottom of knee
    expect(gcMidKnee).toBeLessThan(0);         // inside knee → some reduction
    // Above knee has MORE reduction (more negative dB) than at threshold
    expect(gcAbove).toBeLessThan(gcAt);        // -2.25 < -0.56: greater magnitude reduction above
  });

  it('approaches limiting at high ratio', () => {
    // Ratio 1000:1 ≈ limiter. 12 dB above threshold → GR ≈ -12 × (1 − 1/1000) ≈ -12
    expect(gainComputeCompressor(-12, -24, 1000, 0)).toBeCloseTo(-12, 0);
  });
});

// ============================================================
// applyCompressor — signal-level tests
// ============================================================

describe('applyCompressor', () => {
  it('passes through signal below threshold unchanged', () => {
    // -40 dBFS tone → well below -24 dB threshold
    const sig = tone(dbToLin(-40), SR);
    const { output } = applyCompressor(sig, SR, { threshold: -24, ratio: 4 });
    const inRms  = rmsDb(sig,    SR / 4);
    const outRms = rmsDb(output, SR / 4);
    expect(outRms - inRms).toBeCloseTo(0, 0); // < 1 dB difference
  });

  it('reduces gain when signal exceeds threshold', () => {
    // −10 dBFS tone, −24 dB threshold, ratio 4:1
    const sig = tone(dbToLin(-10), SR);
    const { output } = applyCompressor(sig, SR, { threshold: -24, ratio: 4 });
    const inRms  = rmsDb(sig,    SR / 4);
    const outRms = rmsDb(output, SR / 4);
    expect(outRms).toBeLessThan(inRms); // output quieter than input
  });

  it('gain reduction envelope never exceeds 0 dB', () => {
    const sig = tone(0.8, SR / 2);
    const { gainReductionDb } = applyCompressor(sig, SR, { threshold: -24, ratio: 4 });
    for (let i = 0; i < gainReductionDb.length; i++) {
      expect(gainReductionDb[i]).toBeLessThanOrEqual(0.001); // tolerance for float
    }
  });

  it('bypass (ratio = 1) passes signal unchanged', () => {
    const sig = tone(0.5, 1024);
    const { output } = applyCompressor(sig, SR, { ratio: 1 });
    for (let i = 0; i < sig.length; i++) {
      expect(output[i]).toBeCloseTo(sig[i], 6);
    }
  });

  it('make-up gain amplifies output', () => {
    const sig = tone(dbToLin(-10), SR);
    const { output: noMakeup } = applyCompressor(sig, SR, { threshold: -24, ratio: 4, makeupDb: 0 });
    const { output: withMakeup } = applyCompressor(sig, SR, { threshold: -24, ratio: 4, makeupDb: 6 });
    const rmsNoMakeup   = rmsDb(noMakeup,   SR / 4);
    const rmsWithMakeup = rmsDb(withMakeup, SR / 4);
    expect(rmsWithMakeup - rmsNoMakeup).toBeCloseTo(6, 0); // +6 dB make-up
  });

  it('returns output of same length as input', () => {
    const sig = tone(0.5, 4096);
    const { output } = applyCompressor(sig, SR);
    expect(output.length).toBe(4096);
  });
});

// ============================================================
// applyLimiter
// ============================================================

describe('applyLimiter', () => {
  it('hard-clips peaks above threshold', () => {
    // 0 dBFS sine → limiter at -1 dBFS
    const sig = tone(1.0, SR);
    const { output } = applyLimiter(sig, SR, { threshold: -1 });
    // Max absolute value should be reduced significantly
    let maxAbs = 0;
    for (let i = SR / 4; i < sig.length; i++) maxAbs = Math.max(maxAbs, Math.abs(output[i]));
    expect(maxAbs).toBeLessThan(dbToLin(-1) * 1.1); // some tolerance for attack
  });

  it('does not amplify signal already below threshold', () => {
    const sig = tone(dbToLin(-20), SR);
    const inRms = rmsDb(sig, SR / 4);
    const { output } = applyLimiter(sig, SR, { threshold: -6 });
    const outRms = rmsDb(output, SR / 4);
    expect(outRms - inRms).toBeCloseTo(0, 0);
  });
});

// ============================================================
// applyGate
// ============================================================

describe('applyGate', () => {
  it('mutes signal below threshold when fully closed (ratio=0)', () => {
    // Very quiet signal: -60 dBFS, threshold = -40 dBFS
    const quiet = tone(dbToLin(-60), SR);
    const { output } = applyGate(quiet, SR, { threshold: -40, ratio: 0, attackMs: 1, releaseMs: 10 });
    const rmsOut = rmsDb(output, SR / 2); // skip transient
    expect(rmsOut).toBeLessThan(-60); // severely attenuated
  });

  it('passes loud signal above threshold (ratio=0, open)', () => {
    // −10 dBFS tone, threshold = −40 dBFS → gate stays open
    const loud = tone(dbToLin(-10), SR);
    const { output } = applyGate(loud, SR, { threshold: -40, ratio: 0, attackMs: 1, releaseMs: 10 });
    const inRms  = rmsDb(loud, SR / 4);
    const outRms = rmsDb(output, SR / 4);
    expect(Math.abs(outRms - inRms)).toBeLessThan(2); // < 2 dB loss when open
  });

  it('gain reduction never exceeds 0 dB', () => {
    const sig = tone(0.3, SR / 2);
    const { gainReductionDb } = applyGate(sig, SR, { threshold: -20 });
    for (let i = 0; i < gainReductionDb.length; i++) {
      expect(gainReductionDb[i]).toBeLessThanOrEqual(0.001);
    }
  });

  it('returns output of same length as input', () => {
    const sig = tone(0.5, 2048);
    const { output } = applyGate(sig, SR);
    expect(output.length).toBe(2048);
  });
});

// ============================================================
// applyCompressorMultichannel
// ============================================================

describe('applyCompressorMultichannel', () => {
  it('returns correct number of channels', () => {
    const channels = [tone(0.5, 1024), tone(0.3, 1024), tone(0.4, 1024)];
    const { channels: out } = applyCompressorMultichannel(channels, SR, { threshold: -24 });
    expect(out.length).toBe(3);
  });

  it('handles empty channel array', () => {
    const { channels: out } = applyCompressorMultichannel([], SR);
    expect(out.length).toBe(0);
  });

  it('each channel has the correct length', () => {
    const channels = [tone(0.5, 4096), tone(0.3, 4096)];
    const { channels: out } = applyCompressorMultichannel(channels, SR);
    expect(out[0].length).toBe(4096);
    expect(out[1].length).toBe(4096);
  });
});
