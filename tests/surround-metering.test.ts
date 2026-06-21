/**
 * Surround channel metering テスト
 *
 * audio/surround-audio.ts の getChannelLevels が実 RMS を返すことを検証。
 * 旧実装は Math.random を返していた (SPEC G2)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SurroundAudioEngine } from '../audio/surround-audio';

const SR = 48000;

/** 指定振幅の正弦波を持つマルチチャンネル AudioBuffer モック。 */
function makeBuffer(amps: number[], samples = 4800): AudioBuffer {
  const chans = amps.map((a) => {
    const d = new Float32Array(samples);
    for (let i = 0; i < samples; i++) d[i] = a * Math.sin((2 * Math.PI * 440 * i) / SR);
    return d;
  });
  return {
    sampleRate: SR,
    length: samples,
    numberOfChannels: chans.length,
    duration: samples / SR,
    getChannelData: (i: number) => chans[i],
  } as unknown as AudioBuffer;
}

describe('SurroundAudioEngine.getChannelLevels', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => {
    engine = new SurroundAudioEngine(new AudioContext());
  });

  it('returns real per-channel RMS (5.1 order L,R,C,LFE,Ls,Rs)', () => {
    // sine RMS = amp / sqrt(2)
    const amps = [0.5, 0.4, 0.3, 0.2, 0.1, 0.05];
    const levels = engine.getChannelLevels(makeBuffer(amps));
    expect(levels.get('L')!).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(levels.get('R')!).toBeCloseTo(0.4 / Math.SQRT2, 2);
    expect(levels.get('C')!).toBeCloseTo(0.3 / Math.SQRT2, 2);
    expect(levels.get('LFE')!).toBeCloseTo(0.2 / Math.SQRT2, 2);
    expect(levels.get('Ls')!).toBeCloseTo(0.1 / Math.SQRT2, 2);
    expect(levels.get('Rs')!).toBeCloseTo(0.05 / Math.SQRT2, 2);
  });

  it('is deterministic (no random)', () => {
    const buf = makeBuffer([0.5, 0.4, 0.3, 0.2, 0.1, 0.05]);
    const a = engine.getChannelLevels(buf);
    const b = engine.getChannelLevels(buf);
    for (const [label, v] of a) expect(b.get(label)).toBe(v);
  });

  it('returns 0 for all channels when no buffer is given', () => {
    const levels = engine.getChannelLevels();
    expect(levels.size).toBe(6);
    for (const v of levels.values()) expect(v).toBe(0);
  });

  it('returns 0 for channels beyond the buffer channel count', () => {
    const levels = engine.getChannelLevels(makeBuffer([0.5, 0.4])); // 2ch のみ
    expect(levels.get('L')!).toBeGreaterThan(0);
    expect(levels.get('R')!).toBeGreaterThan(0);
    expect(levels.get('C')!).toBe(0);
    expect(levels.get('Rs')!).toBe(0);
  });
});
