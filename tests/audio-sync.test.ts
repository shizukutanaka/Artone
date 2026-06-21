/**
 * Audio Sync (相互相関) + MultiCam syncByAudio テスト
 *
 * timeline/audio-sync.ts の純関数と、multicam-editor の実同期を検証。
 * 旧実装は Math.random で offset を捏造していた (SPEC G1)。
 */

import { describe, it, expect } from 'vitest';
import {
  crossCorrelationOffset,
  alignAnglesByAudio,
  type AudioSamples,
} from '../timeline/audio-sync';
import { MultiCamEditor } from '../timeline/multicam-editor';

const SR = 48000;

/** 決定論的な擬似ノイズ (鋭い自己相関ピークを持つ)。 */
function noise(n: number, seed = 1): Float32Array {
  let s = seed >>> 0;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return d;
}

/** target[i] = src[i - D] (target を D サンプル遅延)。 */
function delayBy(src: Float32Array, d: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = d; i < src.length; i++) out[i] = src[i - d];
  return out;
}

/** target[i] = src[i + D] (target を D サンプル前進 = src 側が遅延)。 */
function advanceBy(src: Float32Array, d: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length - d; i++) out[i] = src[i + d];
  return out;
}

describe('crossCorrelationOffset', () => {
  it('identical signals → zero offset, confidence ≈ 1', () => {
    const ref = noise(9600);
    const r = crossCorrelationOffset(ref, ref, { sampleRate: SR, maxLagSec: 0.05 });
    expect(r.offsetSamples).toBe(0);
    expect(r.confidence).toBeGreaterThan(0.99);
  });

  it('recovers a known positive delay (target lags reference)', () => {
    const ref = noise(9600);
    const target = delayBy(ref, 480); // 10ms 遅延
    const r = crossCorrelationOffset(ref, target, { sampleRate: SR, maxLagSec: 0.05 });
    expect(r.offsetSamples).toBe(480);
    expect(r.offsetSec).toBeCloseTo(0.01, 4);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('recovers a known negative offset (target leads reference)', () => {
    const ref = noise(9600);
    const target = advanceBy(ref, 480);
    const r = crossCorrelationOffset(ref, target, { sampleRate: SR, maxLagSec: 0.05 });
    expect(r.offsetSamples).toBe(-480);
  });

  it('uncorrelated signals → low confidence', () => {
    const a = noise(9600, 1);
    const b = noise(9600, 999);
    const r = crossCorrelationOffset(a, b, { sampleRate: SR, maxLagSec: 0.05 });
    expect(r.confidence).toBeLessThan(0.3);
  });

  it('downsample option still recovers the (quantized) delay', () => {
    const ref = noise(19200);
    const target = delayBy(ref, 960);
    const r = crossCorrelationOffset(ref, target, { sampleRate: SR, maxLagSec: 0.1, downsample: 4 });
    // 間引き係数 4 → 分解能 4 サンプル。960 はその倍数なので一致。
    expect(r.offsetSamples).toBe(960);
  });
});

describe('alignAnglesByAudio', () => {
  it('reference is 0, delayed angle gets measured offset, missing/rate-mismatch → 0', () => {
    const ref = noise(9600);
    const refAudio: AudioSamples = { samples: ref, sampleRate: SR };
    const offsets = alignAnglesByAudio(
      refAudio,
      [
        { id: 'ref', audio: refAudio },
        { id: 'delayed', audio: { samples: delayBy(ref, 480), sampleRate: SR } },
        { id: 'noaudio' },
        { id: 'badrate', audio: { samples: delayBy(ref, 480), sampleRate: 44100 } },
      ],
      'ref'
    );
    expect(offsets.get('ref')).toBe(0);
    expect(offsets.get('delayed')).toBeCloseTo(0.01, 4);
    expect(offsets.get('noaudio')).toBe(0);
    expect(offsets.get('badrate')).toBe(0);
  });
});

describe('MultiCamEditor.syncByAudio', () => {
  it('sets real offsets from cross-correlation (no random)', async () => {
    const ed = new MultiCamEditor();
    const clip = ed.createMultiCamClip('test');
    const a1 = ed.addAngle(clip.id, 'src1', 'A1');
    const a2 = ed.addAngle(clip.id, 'src2', 'A2');
    expect(a1 && a2).toBeTruthy();

    const ref = noise(9600);
    const audio = new Map<string, AudioSamples>([
      [a1!.id, { samples: ref, sampleRate: SR }],
      [a2!.id, { samples: delayBy(ref, 480), sampleRate: SR }],
    ]);

    const ok = await ed.syncByAudio(clip.id, a1!.id, audio);
    expect(ok).toBe(true);
    expect(a1!.offset).toBe(0);
    expect(a2!.offset).toBeCloseTo(0.01, 4);
  });

  it('returns false when reference audio is absent', async () => {
    const ed = new MultiCamEditor();
    const clip = ed.createMultiCamClip('test');
    const a1 = ed.addAngle(clip.id, 'src1', 'A1');
    const ok = await ed.syncByAudio(clip.id, a1!.id, new Map());
    expect(ok).toBe(false);
  });
});
