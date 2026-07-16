/**
 * 標準ベンチマークスイート
 *
 * 計測対象: パフォーマンスクリティカルなホットパス。
 * リスクゾーン (audio/render/decode/encode) を重点カバー。
 */

import type { BenchmarkSpec } from './regression-detector';

// ベンチマーク間の状態共有 (globalThis as any の代替)
const store = new Map<string, unknown>();
function put<T>(key: string, value: T): void { store.set(key, value); }
function get<T>(key: string): T | undefined { return store.get(key) as T | undefined; }

// === レンダリング系 ===

const renderBenchmarks: BenchmarkSpec[] = [
  {
    name: 'render.fill_1080p',
    category: 'render',
    budget: 16, // 60fps 予算
    setup: () => {
      put('fill1080p', new Uint8ClampedArray(1920 * 1080 * 4));
    },
    run: () => {
      // 単純な ImageData 塗りつぶし (CPU フォールバック計測)
      const buf = get<Uint8ClampedArray>('fill1080p')!;
      for (let i = 0; i < buf.length; i += 4) {
        buf[i] = 255;
        buf[i + 1] = 128;
        buf[i + 2] = 64;
        buf[i + 3] = 255;
      }
    },
  },
  {
    name: 'render.matrix_compose_4k',
    category: 'render',
    budget: 8,
    setup: () => {
      const a = new Float32Array(16);
      const b = new Float32Array(16);
      const r = new Float32Array(16);
      for (let i = 0; i < 16; i++) { a[i] = i + 1; b[i] = (i + 1) * 0.5; }
      put('matA', a); put('matB', b); put('matR', r);
    },
    run: () => {
      // 4x4 行列合成 (アフィン変換)
      const a = get<Float32Array>('matA')!;
      const b = get<Float32Array>('matB')!;
      const r = get<Float32Array>('matR')!;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += a[i * 4 + k] * b[k * 4 + j];
          r[i * 4 + j] = sum;
        }
      }
    },
  },
];

// === エフェクト系 ===

const effectBenchmarks: BenchmarkSpec[] = [
  {
    name: 'effect.color_lut_apply_1080p',
    category: 'effect',
    budget: 12,
    setup: () => {
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.min(255, i * 1.2);
      put('lutData', new Uint8ClampedArray(1920 * 1080 * 4));
      put('lut256', lut);
    },
    run: () => {
      // 簡易 LUT 適用
      const data = get<Uint8ClampedArray>('lutData')!;
      const lut = get<Uint8ClampedArray>('lut256')!;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
    },
  },
  {
    name: 'effect.gaussian_blur_720p',
    category: 'effect',
    budget: 20,
    setup: () => {
      put('blurSrc', new Float32Array(1280 * 720));
      put('blurDst', new Float32Array(1280 * 720));
      put('blurK', new Float32Array([0.06136, 0.24477, 0.38774, 0.24477, 0.06136]));
    },
    run: () => {
      const w = 1280;
      const h = 720;
      const data = get<Float32Array>('blurSrc')!;
      const out = get<Float32Array>('blurDst')!;
      const k = get<Float32Array>('blurK')!;
      for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
          let s = 0;
          for (let i = -2; i <= 2; i++) s += data[y * w + x + i] * k[i + 2];
          out[y * w + x] = s;
        }
      }
    },
  },
];

// === デコード/エンコード系 ===

const codecBenchmarks: BenchmarkSpec[] = [
  {
    name: 'decode.parse_box_atom',
    category: 'decode',
    budget: 1,
    setup: () => { put('boxBuf', new Uint8Array(8192)); },
    run: () => {
      // MP4 box parsing シミュレーション
      const buf = get<Uint8Array>('boxBuf')!;
      for (let i = 0; i < 1000; i++) {
        const size = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
        const type = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
        if (size === 0 || type === '') break;
      }
    },
  },
  {
    name: 'encode.h264_frame_estimate',
    category: 'encode',
    budget: 5,
    setup: () => {
      const block = new Float32Array(64);
      for (let i = 0; i < 64; i++) block[i] = Math.sin(i);
      put('dctBlock', block);
      put('dctOut', new Float32Array(64));
    },
    run: () => {
      // フレームサイズ予測 (DCT 簡易計算)
      const block = get<Float32Array>('dctBlock')!;
      const out = get<Float32Array>('dctOut')!;
      for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
          let s = 0;
          for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
              s +=
                block[y * 8 + x] *
                Math.cos(((2 * x + 1) * u * Math.PI) / 16) *
                Math.cos(((2 * y + 1) * v * Math.PI) / 16);
            }
          }
          out[v * 8 + u] = s;
        }
      }
    },
  },
];

// === エクスポート系 ===

const exportBenchmarks: BenchmarkSpec[] = [
  {
    name: 'export.muxer_chunk_write',
    category: 'export',
    budget: 2,
    setup: () => {
      const chunk = new Uint8Array(65536);
      for (let i = 0; i < chunk.length; i++) chunk[i] = i & 0xff;
      put('muxChunk', chunk);
    },
    run: () => {
      const chunk = get<Uint8Array>('muxChunk')!;
      let crc = 0xffffffff;
      for (let i = 0; i < chunk.length; i++) {
        crc ^= chunk[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    },
  },
];

// === 起動系 ===

const startupBenchmarks: BenchmarkSpec[] = [
  {
    name: 'startup.json_parse_5kb',
    category: 'startup',
    budget: 1,
    setup: () => {
      const obj = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item${i}` })) };
      put('jsonStr', JSON.stringify(obj));
    },
    run: () => {
      JSON.parse(get<string>('jsonStr')!);
    },
  },
];

// === 実環境ホットパス (実プロダクトの代表的な処理) ===

const realisticBenchmarks: BenchmarkSpec[] = [
  {
    name: 'render.canvas_putImageData_1080p',
    category: 'render',
    budget: 16,
    setup: () => {
      // OffscreenCanvas が使えない環境ではスキップ用フラグ
      if (typeof OffscreenCanvas === 'undefined') {
        put('skipCanvas', true);
        return;
      }
      const canvas = new OffscreenCanvas(1920, 1080);
      const ctx = canvas.getContext('2d');
      const data = new Uint8ClampedArray(1920 * 1080 * 4);
      put('canvas', { ctx, data, imageData: new ImageData(data, 1920, 1080) });
    },
    run: () => {
      if (get<boolean>('skipCanvas')) return;
      const b = get<{ ctx: OffscreenCanvasRenderingContext2D; data: Uint8ClampedArray; imageData: ImageData }>('canvas');
      if (!b) return;
      b.ctx.putImageData(b.imageData, 0, 0);
    },
  },
  {
    name: 'render.typed_array_copy_8mb',
    category: 'render',
    budget: 4,
    setup: () => {
      put('benchSrc', new Uint8Array(8 * 1024 * 1024));
      put('benchDst', new Uint8Array(8 * 1024 * 1024));
    },
    run: () => {
      get<Uint8Array>('benchDst')!.set(get<Uint8Array>('benchSrc')!);
    },
  },
  {
    name: 'audio.float32_mix_44100',
    category: 'effect',
    budget: 2,
    setup: () => {
      const n = 44100;
      const a = new Float32Array(n);
      const b = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        a[i] = Math.sin(i * 0.01);
        b[i] = Math.cos(i * 0.01);
      }
      put('audioA', a);
      put('audioB', b);
      put('audioOut', new Float32Array(n));
    },
    run: () => {
      const a = get<Float32Array>('audioA')!;
      const b = get<Float32Array>('audioB')!;
      const out = get<Float32Array>('audioOut')!;
      // 2ch ミックス + ゲイン
      for (let i = 0; i < a.length; i++) {
        out[i] = a[i] * 0.7 + b[i] * 0.3;
      }
    },
  },
  {
    name: 'effect.alpha_composite_1080p',
    category: 'effect',
    budget: 18,
    setup: () => {
      const n = 1920 * 1080 * 4;
      put('fg', new Uint8ClampedArray(n));
      put('bg', new Uint8ClampedArray(n));
      put('out', new Uint8ClampedArray(n));
    },
    run: () => {
      const fg = get<Uint8ClampedArray>('fg')!;
      const bg = get<Uint8ClampedArray>('bg')!;
      const out = get<Uint8ClampedArray>('out')!;
      // src-over alpha composite
      for (let i = 0; i < fg.length; i += 4) {
        const a = fg[i + 3] / 255;
        const inv = 1 - a;
        out[i] = fg[i] * a + bg[i] * inv;
        out[i + 1] = fg[i + 1] * a + bg[i + 1] * inv;
        out[i + 2] = fg[i + 2] * a + bg[i + 2] * inv;
        out[i + 3] = 255;
      }
    },
  },
  {
    name: 'export.crc32_streaming_64k',
    category: 'export',
    budget: 1,
    setup: () => {
      const buf = new Uint8Array(65536);
      for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
      put('crcBuf', buf);
      // CRC32 テーブル事前計算
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
      put('crcTable', table);
    },
    run: () => {
      const buf = get<Uint8Array>('crcBuf')!;
      const table = get<Uint32Array>('crcTable')!;
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
      }
    },
  },
];

export const standardBenchmarks: BenchmarkSpec[] = [
  ...renderBenchmarks,
  ...effectBenchmarks,
  ...codecBenchmarks,
  ...exportBenchmarks,
  ...startupBenchmarks,
  ...realisticBenchmarks,
];
