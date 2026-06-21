/**
 * Codec Router テスト
 *
 * WebCodecs / FFmpeg WASM の振り分けロジックを検証。
 * checkCodecSupport は WebCodecs API モック (setup.ts) に依存。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  planCodecRoute,
  needsFFmpegWasm,
  classifyContainer,
  planFileProcessing,
} from '../core/codec-router';

describe('classifyContainer', () => {
  it('mp4 is native', () => {
    expect(classifyContainer('mp4')).toBe('native');
    expect(classifyContainer('.mp4')).toBe('native');
    expect(classifyContainer('MP4')).toBe('native');
  });

  it('webm is native', () => {
    expect(classifyContainer('webm')).toBe('native');
  });

  it('mov requires ffmpeg', () => {
    expect(classifyContainer('mov')).toBe('ffmpeg');
  });

  it('mkv requires ffmpeg', () => {
    expect(classifyContainer('mkv')).toBe('ffmpeg');
  });

  it('mxf requires ffmpeg', () => {
    expect(classifyContainer('mxf')).toBe('ffmpeg');
  });

  it('unknown extension is unknown', () => {
    expect(classifyContainer('xyz')).toBe('unknown');
  });
});

describe('needsFFmpegWasm', () => {
  it('returns false for all-native codecs', () => {
    expect(needsFFmpegWasm(['avc1.640028', 'vp09.00.10.08'])).toBe(false);
  });

  it('returns true when ProRes present', () => {
    expect(needsFFmpegWasm(['avc1.640028', 'prores'])).toBe(true);
  });

  it('returns true for DNxHR', () => {
    expect(needsFFmpegWasm(['dnxhr'])).toBe(true);
  });

  it('returns true for unknown codec', () => {
    expect(needsFFmpegWasm(['weird-codec'])).toBe(true);
  });
});

describe('planCodecRoute — プロコーデック', () => {
  it('ProRes routes to ffmpeg-transcode', async () => {
    const plan = await planCodecRoute('prores');
    expect(plan.route).toBe('ffmpeg-transcode');
    expect(plan.hardwareAccelerated).toBe(false);
    expect(plan.intermediateCodec).toContain('avc1');
  });

  it('DNxHR routes to ffmpeg-transcode', async () => {
    const plan = await planCodecRoute('dnxhr');
    expect(plan.route).toBe('ffmpeg-transcode');
  });

  it('Apple ProRes fourcc apch routes to transcode', async () => {
    const plan = await planCodecRoute('apch');
    expect(plan.route).toBe('ffmpeg-transcode');
  });
});

describe('planCodecRoute — ネイティブコーデック', () => {
  beforeEach(() => {
    // WebCodecs サポートを true にモック
    global.VideoDecoder = {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    } as unknown as typeof VideoDecoder;
  });

  it('H.264 routes to webcodecs when supported', async () => {
    const plan = await planCodecRoute('avc1.640028');
    expect(plan.route).toBe('webcodecs');
    expect(plan.hardwareAccelerated).toBe(true);
  });

  it('falls back to ffmpeg when WebCodecs reports unsupported', async () => {
    global.VideoDecoder = {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
    } as unknown as typeof VideoDecoder;
    const plan = await planCodecRoute('hev1.1.6.L93.B0'); // HEVC
    expect(plan.route).toBe('ffmpeg-transcode');
    expect(plan.hardwareAccelerated).toBe(false);
  });
});

describe('planFileProcessing — コンテナ + コーデック統合', () => {
  beforeEach(() => {
    global.VideoDecoder = {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    } as unknown as typeof VideoDecoder;
  });

  it('mp4 + H.264 stays on webcodecs', async () => {
    const plan = await planFileProcessing('clip.mp4', 'avc1.640028');
    expect(plan.route).toBe('webcodecs');
    expect(plan.containerRoute).toBe('native');
  });

  it('mov + H.264 forces ffmpeg (container demux)', async () => {
    const plan = await planFileProcessing('clip.mov', 'avc1.640028');
    expect(plan.route).toBe('ffmpeg-transcode');
    expect(plan.containerRoute).toBe('ffmpeg');
  });

  it('mxf + DNxHR uses ffmpeg for both', async () => {
    const plan = await planFileProcessing('master.mxf', 'dnxhr');
    expect(plan.route).toBe('ffmpeg-transcode');
    expect(plan.containerRoute).toBe('ffmpeg');
  });
});
