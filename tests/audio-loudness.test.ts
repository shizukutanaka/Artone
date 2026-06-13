/**
 * Audio Loudness / LUFS 正規化テスト
 *
 * EBU R128 / プラットフォーム別ターゲットの正規化ロジックを検証。
 * AudioBuffer は setup.ts のモックを利用。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEngine, LOUDNESS_TARGETS, type LoudnessReading } from '../audio/audio-engine';
import { measureLoudness } from '../audio/loudness';

/** テスト用 AudioBuffer モック (正弦波 or 一定振幅) */
function makeBuffer(amplitude: number, samples = 48000, sampleRate = 48000): AudioBuffer {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  return {
    sampleRate,
    length: samples,
    numberOfChannels: 1,
    duration: samples / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('LOUDNESS_TARGETS', () => {
  it('YouTube/Spotify target -14 LUFS', () => {
    expect(LOUDNESS_TARGETS.youtube.lufs).toBe(-14);
    expect(LOUDNESS_TARGETS.spotify.lufs).toBe(-14);
  });

  it('Apple Music/Podcast target -16 LUFS', () => {
    expect(LOUDNESS_TARGETS.appleMusic.lufs).toBe(-16);
    expect(LOUDNESS_TARGETS.podcast.lufs).toBe(-16);
  });

  it('EBU R128 target -23 LUFS', () => {
    expect(LOUDNESS_TARGETS.ebuR128.lufs).toBe(-23);
  });

  it('all targets have -1 to -2 dBTP true peak ceiling', () => {
    for (const t of Object.values(LOUDNESS_TARGETS)) {
      expect(t.truePeak).toBeLessThanOrEqual(-1.0);
      expect(t.truePeak).toBeGreaterThanOrEqual(-2.0);
    }
  });
});

describe('AudioEngine.analyzeLoudness', () => {
  let ae: AudioEngine;
  beforeEach(() => { ae = new AudioEngine(); });

  it('returns deterministic values (no random)', async () => {
    const buf = makeBuffer(0.5);
    const r1 = await ae.analyzeLoudness(buf);
    const r2 = await ae.analyzeLoudness(buf);
    // 同じ入力 → 同じ出力 (random 除去の確認)
    expect(r1.integrated).toBe(r2.integrated);
    expect(r1.momentary).toBe(r2.momentary);
    expect(r1.shortTerm).toBe(r2.shortTerm);
    expect(r1.range).toBe(r2.range);
  });

  it('louder signal has higher integrated loudness', async () => {
    const quiet = await ae.analyzeLoudness(makeBuffer(0.1));
    const loud = await ae.analyzeLoudness(makeBuffer(0.8));
    expect(loud.integrated).toBeGreaterThan(quiet.integrated);
  });

  it('true peak reflects amplitude', async () => {
    const r = await ae.analyzeLoudness(makeBuffer(0.5));
    // 0.5 amplitude ≈ -6 dBFS peak
    expect(r.truePeak).toBeGreaterThan(-8);
    expect(r.truePeak).toBeLessThan(-4);
  });

  it('range is non-negative', async () => {
    const r = await ae.analyzeLoudness(makeBuffer(0.5));
    expect(r.range).toBeGreaterThanOrEqual(0);
  });
});

describe('measureLoudness — true peak (inter-sample)', () => {
  // A tone at fs/4 phased by π/4 lands every sample on ±0.707, so the sample
  // peak is ≈ -3 dBFS while the continuous waveform crests at 1.0 (0 dBFS)
  // exactly between samples. Linear oversampling (the old impl) is monotonic
  // and can never see this; band-limited oversampling must.
  function fsQuarterTone(n = 2048): Float32Array {
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((Math.PI / 2) * i + Math.PI / 4);
    return ch;
  }

  it('detects an inter-sample peak above the sample peak', () => {
    const m = measureLoudness([fsQuarterTone()], 48000);
    expect(m.samplePeak).toBeGreaterThan(-3.5);
    expect(m.samplePeak).toBeLessThan(-2.5);            // ≈ -3.01 dBFS
    expect(m.truePeak - m.samplePeak).toBeGreaterThan(2); // recovers the crest
    expect(m.truePeak).toBeGreaterThan(-1.0);           // near 0 dBFS
    expect(m.truePeak).toBeLessThan(0.5);               // without wild overshoot
  });

  it('true peak is never below the sample peak', () => {
    const m = measureLoudness([fsQuarterTone()], 48000);
    expect(m.truePeak).toBeGreaterThanOrEqual(m.samplePeak);
  });

  it('does not invent overshoot on a densely-sampled tone', () => {
    // 440 Hz at 48 kHz: ~109 samples/cycle, so samples sit near the crest and
    // there is little inter-sample peak to recover.
    const n = 48000;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = 0.9 * Math.sin((2 * Math.PI * 440 * i) / 48000);
    const m = measureLoudness([ch], 48000);
    expect(m.truePeak).toBeGreaterThanOrEqual(m.samplePeak);
    expect(m.truePeak - m.samplePeak).toBeLessThan(0.5);
  });

  it('returns -Infinity true peak for silence', () => {
    const m = measureLoudness([new Float32Array(1024)], 48000);
    expect(m.truePeak).toBe(-Infinity);
  });
});

describe('AudioEngine.computeNormalization', () => {
  let ae: AudioEngine;
  beforeEach(() => { ae = new AudioEngine(); });

  it('computes positive gain for quiet source to YouTube', () => {
    const reading: LoudnessReading = {
      integrated: -20, momentary: -18, shortTerm: -19, range: 6, truePeak: -6,
    };
    const result = ae.computeNormalization(reading, 'youtube');
    expect(result.targetLufs).toBe(-14);
    expect(result.gainDb).toBeCloseTo(6, 1); // -14 - (-20) = +6
  });

  it('computes negative gain for loud source to EBU R128', () => {
    const reading: LoudnessReading = {
      integrated: -16, momentary: -14, shortTerm: -15, range: 8, truePeak: -3,
    };
    const result = ae.computeNormalization(reading, 'ebuR128');
    expect(result.gainDb).toBeCloseTo(-7, 1); // -23 - (-16) = -7
  });

  it('flags clipping when gain pushes true peak over ceiling', () => {
    const reading: LoudnessReading = {
      integrated: -20, momentary: -18, shortTerm: -19, range: 6, truePeak: -2,
    };
    // +6 dB gain → -2 + 6 = +4 dBTP, exceeds -1 ceiling
    const result = ae.computeNormalization(reading, 'youtube');
    expect(result.willClip).toBe(true);
  });

  it('does not flag clipping when within ceiling', () => {
    const reading: LoudnessReading = {
      integrated: -14, momentary: -12, shortTerm: -13, range: 6, truePeak: -10,
    };
    const result = ae.computeNormalization(reading, 'youtube');
    expect(result.willClip).toBe(false);
  });
});
