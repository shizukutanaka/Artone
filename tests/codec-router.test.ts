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
  NATIVE_CONTAINERS,
  guessCodecFromExtension,
  resolveRoutingCodec,
  normalizeCodecString,
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

  it('mov is demuxable in-browser (Mediabunny QTFF)', () => {
    // 2026-08: デマルチプレクサ導入前は 'ffmpeg' だった。FFmpeg WASM は本
    // リポジトリに存在せず、iPhone 標準の .mov が実体のない経路へ振られていた。
    expect(classifyContainer('mov')).toBe('native');
  });

  it('mkv is demuxable in-browser (Mediabunny Matroska)', () => {
    expect(classifyContainer('mkv')).toBe('native');
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

  it('mov + H.264 no longer forces ffmpeg now that the container is demuxable', async () => {
    // iPhone が標準で生成する H.264 .mov。demux は Mediabunny、デコードは
    // WebCodecs で賄えるため FFmpeg 必須ではない。
    const plan = await planFileProcessing('clip.mov', 'avc1.640028');
    expect(plan.containerRoute).toBe('native');
  });

  it('REGRESSION: mov + ProRes still routes to transcode (demuxable != decodable)', async () => {
    // コンテナが demux 可能になっても、ProRes は WebCodecs でデコードできない。
    // コンテナ判定とコーデック判定が独立していることを固定する。
    const plan = await planFileProcessing('clip.mov', 'prores');
    expect(plan.containerRoute).toBe('native');
    expect(plan.route).toBe('ffmpeg-transcode');
  });

  it('mxf + DNxHR uses ffmpeg for both', async () => {
    const plan = await planFileProcessing('master.mxf', 'dnxhr');
    expect(plan.route).toBe('ffmpeg-transcode');
    expect(plan.containerRoute).toBe('ffmpeg');
  });
});

// ============================================================
// ルータとデマルチプレクサの同期 (ドリフト防止)
// ============================================================

describe('container routing stays in sync with the demuxer', () => {
  it('NATIVE_CONTAINERS matches the extensions media-metadata actually enables', async () => {
    // codec-router が「FFmpeg 無しで demux 可能」と宣言する集合は、
    // media/media-metadata.ts が実際に有効化しているコンテナ集合と一致して
    // いなければならない。片方だけ変更すると、ルータが実体と異なる処理経路を
    // 宣言する (今回まさにその乖離を修正した) ため、テストで固定する。
    const { DEMUXABLE_EXTENSIONS } = await import('../media/media-metadata');
    expect([...NATIVE_CONTAINERS].sort()).toEqual([...DEMUXABLE_EXTENSIONS].sort());
  });
});

// ============================================================
// 経路判定に使うコーデックの決定 (実コーデック優先)
// ============================================================

describe('resolveRoutingCodec', () => {
  it('REGRESSION: iPhone H.264 .mov routes natively when the REAL codec is known', async () => {
    // 拡張子推測では .mov → 'prores' となり classifyCodec が 'transcode' を返すため、
    // コンテナ判定を native に直しても、コーデック側の誤りだけで実体のない
    // FFmpeg 経路へ振られていた。デマクサが読んだ実コーデックを使えば解消する。
    expect(guessCodecFromExtension('IMG_1234.mov')).toBe('prores');
    const guessedPlan = await planFileProcessing('IMG_1234.mov', guessCodecFromExtension('IMG_1234.mov'));
    expect(guessedPlan.route).toBe('ffmpeg-transcode'); // 誤った旧挙動

    const codec = resolveRoutingCodec('avc1.640028', 'IMG_1234.mov');
    expect(codec).toBe('avc1.640028');
    const realPlan = await planFileProcessing('IMG_1234.mov', codec);
    expect(realPlan.containerRoute).toBe('native');
    expect(realPlan.route).not.toBe('ffmpeg-transcode');
  });

  it('prefers the real codec over the extension guess', () => {
    expect(resolveRoutingCodec('hvc1.1.6.L93.B0', 'clip.mp4')).toBe('hvc1.1.6.L93.B0');
  });

  it('falls back to the extension guess when the real codec is unavailable', () => {
    for (const missing of [null, undefined, '', '   ']) {
      expect(resolveRoutingCodec(missing, 'master.mxf')).toBe('dnxhr');
    }
  });

  it('still routes a genuine ProRes .mov to transcode when the real codec says so', async () => {
    const codec = resolveRoutingCodec('prores', 'studio.mov');
    const plan = await planFileProcessing('studio.mov', codec);
    expect(plan.route).toBe('ffmpeg-transcode');
  });
});

// ============================================================
// コーデックファミリ名の正規化
// ============================================================

describe('normalizeCodecString / bare codec families', () => {
  // デマルチプレクサ (Mediabunny) の track.codec は 'avc' 等のファミリ名を返すが、
  // WebCodecs の codec string はプロファイルまで含む必要があり、ファミリ名のままだと
  // classifyCodec が「未分類」と判定し、実ブラウザでも isConfigSupported が必ず
  // 失敗して不要な FFmpeg フォールバックへ落ちる。
  it('REGRESSION: bare families map to valid WebCodecs codec strings', () => {
    expect(normalizeCodecString('avc')).toBe('avc1.640028');
    expect(normalizeCodecString('hevc')).toBe('hvc1.1.6.L93.B0');
    expect(normalizeCodecString('vp9')).toBe('vp09.00.10.08');
    expect(normalizeCodecString('av1')).toBe('av01.0.04M.08');
    // vp8 は WebCodecs でもドット無しが正式な codec string。
    expect(normalizeCodecString('vp8')).toBe('vp8');
  });

  it('REGRESSION: a bare family is no longer classified as "未分類"', async () => {
    // 分類の差を見るため、ランタイム検出は「非対応」に固定する
    // (対応と答えると classifyCodec に到達する前に webcodecs 経路で返るため)。
    const prev = global.VideoDecoder;
    global.VideoDecoder = {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
    } as unknown as typeof VideoDecoder;
    try {
      // 正規化前: ファミリ名はプレフィックス表に載らず「未分類」扱い。
      const unnormalized = await planFileProcessing('clip.mp4', 'avc');
      expect(unnormalized.reason).toContain('未分類');

      // 正規化後: H.264 として認識され「未分類」ではなくなる。
      const normalized = await planFileProcessing('clip.mp4', resolveRoutingCodec('avc', 'clip.mp4'));
      expect(normalized.reason).not.toContain('未分類');
    } finally {
      global.VideoDecoder = prev;
    }
  });

  it('leaves an already-full codec string untouched', () => {
    expect(normalizeCodecString('avc1.640028')).toBe('avc1.640028');
    expect(normalizeCodecString('hvc1.1.6.L93.B0')).toBe('hvc1.1.6.L93.B0');
  });

  it('keeps prores as-is so it still routes to transcode', async () => {
    expect(normalizeCodecString('prores')).toBe('prores');
    const plan = await planFileProcessing('studio.mov', resolveRoutingCodec('prores', 'studio.mov'));
    expect(plan.route).toBe('ffmpeg-transcode');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeCodecString('  AVC  ')).toBe('avc1.640028');
  });
});
