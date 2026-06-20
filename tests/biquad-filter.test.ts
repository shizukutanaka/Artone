/**
 * Biquad filter テスト (Audio EQ Cookbook 準拠)
 *
 * 周波数応答の正しさを frequencyResponse() で数値検証。
 * 全処理 DOM・Web Audio 不要。
 */

import { describe, it, expect } from 'vitest';
import {
  makeLowpass,
  makeHighpass,
  makePeakEQ,
  makeLowShelf,
  makeHighShelf,
  makeNotch,
  makeBandpass,
  applyFilter,
  applyParametricEQ,
  frequencyResponse,
  makeState,
  processSample,
} from '../audio/biquad-filter';

const SR = 48000;

// ============================================================
// Helpers
// ============================================================

/** Evaluates magnitude response (dB) at a single frequency. */
function magAt(coeffs: Parameters<typeof frequencyResponse>[0], freq: number): number {
  const out = frequencyResponse(coeffs, new Float32Array([freq]), SR);
  return out[0];
}

/** Generates a cosine test signal at given frequency and length. */
function cosine(freq: number, length: number, amp = 1): Float32Array {
  const s = new Float32Array(length);
  for (let i = 0; i < length; i++) s[i] = amp * Math.cos((2 * Math.PI * freq * i) / SR);
  return s;
}

/** Measures RMS of a signal (skips the first `skip` samples for transient). */
function rms(s: Float32Array, skip = 0): number {
  let sum = 0;
  const n = s.length - skip;
  for (let i = skip; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / n);
}

function dB(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

// ============================================================
// frequencyResponse — lowpass
// ============================================================

describe('makeLowpass — frequency response', () => {
  const lp = makeLowpass(1000, SR, 0.7071);

  it('passes DC (0 Hz) at ~0 dB', () => {
    expect(magAt(lp, 1)).toBeCloseTo(0, 0);
  });

  it('attenuates at fc: response ≈ −3 dB at cutoff (Butterworth)', () => {
    const m = magAt(lp, 1000);
    expect(m).toBeCloseTo(-3, 0);
  });

  it('strongly attenuates above fc (10× — 20 dB/decade)', () => {
    expect(magAt(lp, 10000)).toBeLessThan(-30);
  });
});

// ============================================================
// frequencyResponse — highpass
// ============================================================

describe('makeHighpass — frequency response', () => {
  const hp = makeHighpass(1000, SR, 0.7071);

  it('blocks DC (very low freq)', () => {
    expect(magAt(hp, 10)).toBeLessThan(-30);
  });

  it('passes well above fc at ~0 dB', () => {
    expect(magAt(hp, 20000)).toBeCloseTo(0, 0);
  });

  it('attenuates at fc: ~−3 dB', () => {
    expect(magAt(hp, 1000)).toBeCloseTo(-3, 0);
  });
});

// ============================================================
// frequencyResponse — peak EQ
// ============================================================

describe('makePeakEQ — frequency response', () => {
  it('+6 dB peak at 1 kHz', () => {
    const pk = makePeakEQ(1000, SR, 1, 6);
    expect(magAt(pk, 1000)).toBeCloseTo(6, 0);
  });

  it('−6 dB cut at 1 kHz', () => {
    const pk = makePeakEQ(1000, SR, 1, -6);
    expect(magAt(pk, 1000)).toBeCloseTo(-6, 0);
  });

  it('0 dB away from centre frequency (both sides)', () => {
    const pk = makePeakEQ(1000, SR, 1, 12);
    expect(magAt(pk, 100)).toBeCloseTo(0, 0);
    expect(magAt(pk, 10000)).toBeCloseTo(0, 0);
  });

  it('0 dB gain → unity', () => {
    const pk = makePeakEQ(1000, SR, 1, 0);
    expect(magAt(pk, 500)).toBeCloseTo(0, 3);
    expect(magAt(pk, 1000)).toBeCloseTo(0, 3);
    expect(magAt(pk, 5000)).toBeCloseTo(0, 3);
  });
});

// ============================================================
// frequencyResponse — shelves
// ============================================================

describe('makeLowShelf', () => {
  it('+6 dB shelf below 200 Hz', () => {
    const ls = makeLowShelf(200, SR, 6);
    // Well below shelf freq → full boost
    expect(magAt(ls, 20)).toBeCloseTo(6, 0);
    // Well above → unity
    expect(magAt(ls, 5000)).toBeCloseTo(0, 0);
  });

  it('−6 dB shelf cut below 200 Hz', () => {
    const ls = makeLowShelf(200, SR, -6);
    expect(magAt(ls, 20)).toBeCloseTo(-6, 0);
    expect(magAt(ls, 5000)).toBeCloseTo(0, 0);
  });
});

describe('makeHighShelf', () => {
  it('+6 dB shelf above 8 kHz', () => {
    const hs = makeHighShelf(8000, SR, 6);
    expect(magAt(hs, 20000)).toBeCloseTo(6, 0);
    expect(magAt(hs, 200)).toBeCloseTo(0, 0);
  });
});

// ============================================================
// frequencyResponse — notch
// ============================================================

describe('makeNotch', () => {
  it('strongly attenuates at notch frequency', () => {
    const n = makeNotch(1000, SR, 10); // very narrow
    expect(magAt(n, 1000)).toBeLessThan(-20);
  });

  it('passes well away from notch at ~0 dB', () => {
    const n = makeNotch(1000, SR, 10);
    expect(magAt(n, 100)).toBeCloseTo(0, 0);
    expect(magAt(n, 10000)).toBeCloseTo(0, 0);
  });
});

// ============================================================
// frequencyResponse — bandpass
// ============================================================

describe('makeBandpass', () => {
  it('passes at centre frequency (0 dB constant-0-dB variant)', () => {
    const bp = makeBandpass(1000, SR, 1);
    // Constant-0-dB bandpass: gain at centre ≈ 0 dB
    expect(magAt(bp, 1000)).toBeCloseTo(0, 0);
  });

  it('attenuates DC and Nyquist', () => {
    const bp = makeBandpass(1000, SR, 1);
    expect(magAt(bp, 10)).toBeLessThan(-20);
    expect(magAt(bp, 20000)).toBeLessThan(-20);
  });
});

// ============================================================
// Signal-level processing tests (applyFilter / processSample)
// ============================================================

describe('applyFilter — processing', () => {
  it('filters a 1 kHz tone with lowpass at 500 Hz', () => {
    const lp = makeLowpass(500, SR, 0.7071);
    const tone = cosine(1000, SR); // 1 s of 1 kHz
    const { output } = applyFilter(lp, tone);
    // 2nd-order Butterworth at 1 octave above fc: ~-12 dB (frequency response confirms -11.5 dB)
    const rmsOut = rms(output, SR / 4); // skip 250 ms transient
    expect(dB(rmsOut)).toBeLessThan(-10); // significantly attenuated
    expect(dB(rmsOut)).toBeGreaterThan(-25); // but not more than 4th-order roll-off
  });

  it('passes a 100 Hz tone with lowpass at 1 kHz', () => {
    const lp = makeLowpass(1000, SR, 0.7071);
    const tone = cosine(100, SR);
    const { output } = applyFilter(lp, tone);
    const rmsIn = rms(tone, SR / 4);
    const rmsOut = rms(output, SR / 4);
    expect(dB(rmsOut / rmsIn)).toBeGreaterThan(-1); // < 1 dB loss
  });

  it('streams correctly via state across two buffers', () => {
    const lp = makeLowpass(1000, SR, 0.7071);
    const fullTone = cosine(100, 4096);

    // Process as one chunk
    const { output: onePass } = applyFilter(lp, fullTone);

    // Process as two chunks with shared state
    const { output: part1, state } = applyFilter(lp, fullTone.slice(0, 2048));
    const { output: part2 } = applyFilter(lp, fullTone.slice(2048), state);

    const twoPass = new Float32Array([...part1, ...part2]);

    for (let i = 0; i < onePass.length; i++) {
      expect(twoPass[i]).toBeCloseTo(onePass[i], 10);
    }
  });

  it('returns a fresh state on each call without state argument', () => {
    const lp = makeLowpass(1000, SR);
    const { state: s1 } = applyFilter(lp, cosine(100, 16));
    const { state: s2 } = applyFilter(lp, cosine(100, 16));
    // Independent states: s1 and s2 are different objects
    expect(s1).not.toBe(s2);
  });
});

describe('processSample — direct', () => {
  it('impulse response of LPF decays to near-zero after full ring-down', () => {
    const lp = makeLowpass(1000, SR);
    const state = makeState();
    processSample(lp, state, 1); // impulse at n=0
    // 1 kHz LPF at 48 kHz: pole radius ≈ 0.912, impulse response peaks ~n=9
    // then decays. At n=200 (≈3 periods past the peak) envelope is 0.912^191 ≈ 7e-9.
    // Feed silence; read the last sample only.
    let y = 0;
    for (let i = 0; i < 200; i++) {
      y = processSample(lp, state, 0);
    }
    expect(Math.abs(y)).toBeLessThan(1e-4);
  });

  it('impulse response peak is bounded (filter is stable)', () => {
    const lp = makeLowpass(1000, SR);
    const state = makeState();
    processSample(lp, state, 1);
    let maxAbs = 0;
    for (let i = 0; i < 1024; i++) {
      const y = processSample(lp, state, 0);
      maxAbs = Math.max(maxAbs, Math.abs(y));
    }
    // The impulse response magnitude must stay finite (stable filter)
    expect(maxAbs).toBeLessThan(1);
  });
});

// ============================================================
// applyParametricEQ — multi-band
// ============================================================

describe('applyParametricEQ', () => {
  it('applies a 3-band EQ: lowpass + peak + highpass in series', () => {
    const bands = [
      { type: 'highpass' as const, freq: 80 },
      { type: 'peakEQ'  as const, freq: 3000, Q: 1, dBGain: 6 },
      { type: 'lowpass' as const, freq: 10000 },
    ];
    const signal = cosine(3000, SR / 2);
    const out = applyParametricEQ(signal, SR, bands);
    // 3 kHz tone should be boosted
    const inRms  = dB(rms(signal, SR / 8));
    const outRms = dB(rms(out, SR / 8));
    expect(outRms - inRms).toBeGreaterThan(3); // noticeable boost
  });

  it('skips disabled bands', () => {
    const bands = [
      { type: 'peakEQ' as const, freq: 1000, Q: 1, dBGain: 12, enabled: false },
    ];
    const signal = cosine(1000, 4096);
    const out = applyParametricEQ(signal, SR, bands);
    // Disabled band → output equals input
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(signal[i], 10);
    }
  });

  it('passes signal unchanged with empty band list', () => {
    const signal = cosine(440, 1024);
    const out = applyParametricEQ(signal, SR, []);
    expect(out).toBe(signal); // same reference (no copy)
  });

  it('REGRESSION: Q=0 does not produce NaN output (alpha clamps Q)', () => {
    // sin(w0)/(2·0) = Infinity → NaN coefficients → NaN poisons filter state.
    const signal = cosine(1000, 1024);
    for (const type of ['lowpass', 'highpass', 'bandpass', 'notch'] as const) {
      const out = applyParametricEQ(signal, SR, [{ type, freq: 1000, Q: 0 }]);
      expect(Array.from(out).some(Number.isNaN)).toBe(false);
    }
  });

  it('REGRESSION: negative Q does not produce NaN output', () => {
    const signal = cosine(1000, 1024);
    const out = applyParametricEQ(signal, SR, [{ type: 'peakEQ', freq: 1000, Q: -2, dBGain: 6 }]);
    expect(Array.from(out).some(Number.isNaN)).toBe(false);
  });
});

describe('makePeakEQ — REGRESSION: degenerate Q', () => {
  it('Q=0 yields finite coefficients (no NaN)', () => {
    const pk = makePeakEQ(1000, SR, 0, 6);
    for (const c of [pk.b0, pk.b1, pk.b2, pk.a1, pk.a2]) {
      expect(Number.isFinite(c)).toBe(true);
    }
  });
});
