/**
 * Loudness (BS.1770-4 / EBU R128) + Auto-Ducking テスト
 *
 * audio/loudness.ts の純関数を検証。K-weighting・ゲーティング・LRA・
 * True Peak・マルチチャンネル加算・ダッキング包絡。
 */

import { describe, it, expect } from 'vitest';
import {
  kWeightingCoeffs,
  applyKWeighting,
  measureLoudness,
  computeDuckingGain,
} from '../audio/loudness';

const SR = 48000;

/** 単一チャンネルの正弦波を生成。 */
function sine(freq: number, amp: number, durSec: number, sr = SR): Float32Array {
  const n = Math.round(durSec * sr);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return data;
}

function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/** 複数の Float32Array を連結 (spread は巨大配列でスタック超過するため使わない)。 */
function concat(...parts: Float32Array[]): Float32Array {
  const n = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe('kWeightingCoeffs', () => {
  it('48kHz stage2 high-pass has b0=1,b1=-2,b2=1 and finite poles', () => {
    const c = kWeightingCoeffs(48000);
    expect(c.stage2.b0).toBe(1);
    expect(c.stage2.b1).toBe(-2);
    expect(c.stage2.b2).toBe(1);
    expect(Number.isFinite(c.stage1.b0)).toBe(true);
    expect(Number.isFinite(c.stage1.a2)).toBe(true);
  });

  it('48kHz stage1 matches published BS.1770-4 high-shelf coefficients', () => {
    const c = kWeightingCoeffs(48000);
    // 既知の規格係数 (libebur128/pyloudnorm) と一致すること。
    expect(c.stage1.b0).toBeCloseTo(1.53512485958697, 5);
    expect(c.stage1.b1).toBeCloseTo(-2.69169618940638, 5);
    expect(c.stage1.b2).toBeCloseTo(1.19839281085285, 5);
    expect(c.stage1.a1).toBeCloseTo(-1.69065929318241, 5);
    expect(c.stage1.a2).toBeCloseTo(0.73248077421585, 5);
  });
});

describe('applyKWeighting', () => {
  it('attenuates sub-bass far more than mid (high-pass behavior)', () => {
    const lowAmp = rms(applyKWeighting(sine(20, 0.5, 1), SR)) / rms(sine(20, 0.5, 1));
    const midAmp = rms(applyKWeighting(sine(1000, 0.5, 1), SR)) / rms(sine(1000, 0.5, 1));
    expect(lowAmp).toBeLessThan(midAmp);
    expect(lowAmp).toBeLessThan(0.5); // 20Hz は大きく減衰
    expect(midAmp).toBeGreaterThan(0.7); // 1kHz はほぼ通過
  });
});

describe('measureLoudness', () => {
  it('silence yields -Infinity loudness and zero range', () => {
    const r = measureLoudness([new Float32Array(SR)], SR);
    expect(r.integrated).toBe(-Infinity);
    expect(r.momentary).toBe(-Infinity);
    expect(r.range).toBe(0);
    expect(r.truePeak).toBe(-Infinity);
  });

  it('empty input is handled gracefully', () => {
    const r = measureLoudness([], SR);
    expect(r.integrated).toBe(-Infinity);
    expect(r.range).toBe(0);
  });

  it('louder signal has higher integrated loudness (monotonic)', () => {
    const quiet = measureLoudness([sine(1000, 0.1, 2)], SR);
    const loud = measureLoudness([sine(1000, 0.8, 2)], SR);
    expect(loud.integrated).toBeGreaterThan(quiet.integrated);
    // 振幅 8x → 約 +18 dB
    expect(loud.integrated - quiet.integrated).toBeCloseTo(20 * Math.log10(8), 0);
  });

  it('true peak: full-scale sine ≈ 0 dBTP, half-scale ≈ -6 dBTP', () => {
    const full = measureLoudness([sine(997, 1.0, 1)], SR);
    const half = measureLoudness([sine(997, 0.5, 1)], SR);
    expect(full.truePeak).toBeGreaterThan(-0.6);
    expect(half.truePeak).toBeLessThan(-4);
    expect(half.truePeak).toBeGreaterThan(-8);
  });

  it('constant signal: momentary ≈ short-term ≈ integrated', () => {
    const r = measureLoudness([sine(1000, 0.5, 4)], SR);
    expect(Math.abs(r.momentary - r.integrated)).toBeLessThan(1.0);
    expect(Math.abs(r.shortTerm - r.integrated)).toBeLessThan(1.0);
  });

  it('gating: trailing silence does NOT lower integrated loudness', () => {
    const loudOnly = measureLoudness([sine(1000, 0.5, 4)], SR);
    const loudThenSilence = measureLoudness(
      [concat(sine(1000, 0.5, 2), new Float32Array(2 * SR))],
      SR
    );
    // ゲーティングで無音区間が除外されるため、4s loud とほぼ同じになる。
    expect(loudThenSilence.integrated).toBeGreaterThan(loudOnly.integrated - 1.5);
    expect(loudThenSilence.integrated).toBeLessThan(loudOnly.integrated + 0.5);
  });

  it('multichannel: identical stereo is ~+3 LU over mono (channel summation)', () => {
    const mono = measureLoudness([sine(1000, 0.5, 2)], SR);
    const stereo = measureLoudness([sine(1000, 0.5, 2), sine(1000, 0.5, 2)], SR);
    expect(stereo.integrated - mono.integrated).toBeCloseTo(10 * Math.log10(2), 1);
  });

  it('LRA: constant signal ~0, varying signal > 0', () => {
    const constant = measureLoudness([sine(1000, 0.5, 6)], SR);
    expect(constant.range).toBeLessThan(1.0);
    const varying = measureLoudness(
      [concat(sine(1000, 0.5, 4), sine(1000, 0.05, 4))],
      SR
    );
    expect(varying.range).toBeGreaterThan(1.0);
  });
});

describe('computeDuckingGain', () => {
  it('ducks music while sidechain is loud, recovers after', () => {
    const music = sine(220, 0.5, 2);
    // サイドチェーン: 0.3s〜0.7s のみ大音量
    const sidechain = new Float32Array(2 * SR);
    const loud = sine(1000, 0.6, 0.4);
    sidechain.set(loud, Math.round(0.3 * SR));

    const gain = computeDuckingGain(music, sidechain, {
      sampleRate: SR,
      thresholdDb: -30,
      duckDb: -12,
      attackMs: 50,
      releaseMs: 300,
    });

    const at = (sec: number): number => gain[Math.round(sec * SR)];
    expect(at(0.1)).toBeCloseTo(1, 1); // サイドチェーン前: 非ダッキング
    expect(at(0.65)).toBeLessThan(0.4); // 大音量中(attack 後): 大きく減衰 (-12dB→0.25)
    expect(at(1.9)).toBeGreaterThan(0.7); // release 後: ほぼ復帰
    // 全ゲインは (0,1]
    for (let i = 0; i < gain.length; i++) {
      expect(gain[i]).toBeGreaterThan(0);
      expect(gain[i]).toBeLessThanOrEqual(1.0001);
    }
  });

  it('does not duck when sidechain stays below threshold', () => {
    const music = sine(220, 0.5, 1);
    const quietSidechain = sine(1000, 0.005, 1); // ≈ -46 dB < -30
    const gain = computeDuckingGain(music, quietSidechain, { sampleRate: SR, thresholdDb: -30 });
    expect(gain[Math.round(0.5 * SR)]).toBeCloseTo(1, 2);
  });
});
