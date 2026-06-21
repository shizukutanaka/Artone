/**
 * WAV Encoder テスト (SPEC G5 — 実フォーマット音声書き出し)
 *
 * export/wav-encoder.ts の RIFF/WAVE 出力の正しさ (ヘッダ・サイズ・サンプル往復)。
 */

import { describe, it, expect } from 'vitest';
import { encodeWAV, encodeWAVBlob } from '../export/wav-encoder';

function str(view: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe('encodeWAV header', () => {
  it('writes a valid 16-bit PCM RIFF/WAVE header', () => {
    const frames = 100;
    const buf = encodeWAV([new Float32Array(frames), new Float32Array(frames)], {
      sampleRate: 48000,
      bitDepth: 16,
    });
    const v = new DataView(buf);
    expect(str(v, 0, 4)).toBe('RIFF');
    expect(str(v, 8, 4)).toBe('WAVE');
    expect(str(v, 12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(48000); // sampleRate
    expect(v.getUint16(34, true)).toBe(16); // bitsPerSample
    const blockAlign = 2 * 2;
    expect(v.getUint16(32, true)).toBe(blockAlign);
    expect(v.getUint32(28, true)).toBe(48000 * blockAlign); // byteRate
    expect(str(v, 36, 4)).toBe('data');
    const dataSize = frames * blockAlign;
    expect(v.getUint32(40, true)).toBe(dataSize);
    expect(v.getUint32(4, true)).toBe(36 + dataSize); // RIFF size
    expect(buf.byteLength).toBe(44 + dataSize);
  });

  it('uses IEEE float format code (3) for 32-bit', () => {
    const v = new DataView(encodeWAV([new Float32Array(10)], { sampleRate: 44100, bitDepth: 32 }));
    expect(v.getUint16(20, true)).toBe(3);
    expect(v.getUint16(34, true)).toBe(32);
  });
});

describe('encodeWAV samples', () => {
  it('16-bit round-trips sample values within quantization error', () => {
    const src = Float32Array.of(0, 0.5, -0.5, 1, -1);
    const v = new DataView(encodeWAV([src], { sampleRate: 48000, bitDepth: 16 }));
    const decoded: number[] = [];
    for (let i = 0; i < src.length; i++) decoded.push(v.getInt16(44 + i * 2, true) / 32768);
    expect(decoded[0]).toBeCloseTo(0, 4);
    expect(decoded[1]).toBeCloseTo(0.5, 3);
    expect(decoded[2]).toBeCloseTo(-0.5, 3);
    expect(decoded[3]).toBeCloseTo(1, 3); // 32767/32768
    expect(decoded[4]).toBeCloseTo(-1, 4); // -32768/32768
  });

  it('clamps out-of-range samples to [-1,1]', () => {
    const v = new DataView(encodeWAV([Float32Array.of(2, -2)], { sampleRate: 48000, bitDepth: 16 }));
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });

  it('interleaves channels in L,R order', () => {
    const left = Float32Array.of(0.25, 0.25);
    const right = Float32Array.of(-0.25, -0.25);
    const v = new DataView(encodeWAV([left, right], { sampleRate: 48000, bitDepth: 16 }));
    // frame 0: L then R
    expect(v.getInt16(44, true)).toBeGreaterThan(0); // L
    expect(v.getInt16(46, true)).toBeLessThan(0); // R
  });

  it('32-bit float stores exact sample values', () => {
    const src = Float32Array.of(0.123456, -0.654321);
    const v = new DataView(encodeWAV([src], { sampleRate: 48000, bitDepth: 32 }));
    expect(v.getFloat32(44, true)).toBeCloseTo(0.123456, 5);
    expect(v.getFloat32(48, true)).toBeCloseTo(-0.654321, 5);
  });

  it('encodeWAVBlob returns an audio/wav Blob of the right size', () => {
    const blob = encodeWAVBlob([new Float32Array(50)], { sampleRate: 48000, bitDepth: 16 });
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 50 * 2);
  });
});
