/**
 * Tests for core/webcodecs-pipeline.ts
 *
 * VideoDecoder/VideoEncoder are not implemented in jsdom. The static
 * isConfigSupported methods are stubbed for codec-detection and config
 * tests; instance decode/encode paths (which need a working codec) are
 * out of scope. VideoFrame + OffscreenCanvas come from the global setup.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VideoPipeline,
  FrameProcessors,
  SUPPORTED_CODECS,
  checkCodecSupport,
  getBestCodec,
} from '../core/webcodecs-pipeline';

function fakeFrame(w = 64, h = 48, timestamp = 1000): VideoFrame {
  return {
    displayWidth: w,
    displayHeight: h,
    timestamp,
    duration: 33000,
    close: vi.fn(),
  } as unknown as VideoFrame;
}

// ============================================================
// SUPPORTED_CODECS
// ============================================================

describe('SUPPORTED_CODECS', () => {
  it('includes h264/h265/vp9/av1', () => {
    expect(SUPPORTED_CODECS.h264).toBeDefined();
    expect(SUPPORTED_CODECS.h265).toBeDefined();
    expect(SUPPORTED_CODECS.vp9).toBeDefined();
    expect(SUPPORTED_CODECS.av1).toBeDefined();
  });

  it('each codec defines decode and encode lists', () => {
    for (const set of Object.values(SUPPORTED_CODECS)) {
      expect(Array.isArray(set.decode)).toBe(true);
      expect(Array.isArray(set.encode)).toBe(true);
      expect(set.decode.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// checkCodecSupport / getBestCodec
// ============================================================

describe('checkCodecSupport()', () => {

  it('returns true when decoder reports supported', async () => {
    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({ supported: true })) });
    expect(await checkCodecSupport('avc1.42001E', 'decode')).toBe(true);
  });

  it('returns false when decoder reports unsupported', async () => {
    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({ supported: false })) });
    expect(await checkCodecSupport('avc1.42001E', 'decode')).toBe(false);
  });

  it('returns true when encoder reports supported', async () => {
    vi.stubGlobal('VideoEncoder', { isConfigSupported: vi.fn(async () => ({ supported: true })) });
    expect(await checkCodecSupport('avc1.42001E', 'encode')).toBe(true);
  });

  it('returns false when isConfigSupported throws', async () => {
    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => { throw new Error('boom'); }) });
    expect(await checkCodecSupport('bad', 'decode')).toBe(false);
  });

  it('treats missing supported field as false', async () => {
    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({})) });
    expect(await checkCodecSupport('x', 'decode')).toBe(false);
  });
});

describe('getBestCodec()', () => {

  it('returns the first supported codec from the preference', async () => {
    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({ supported: true })) });
    const codec = await getBestCodec('decode', 'h264');
    expect(SUPPORTED_CODECS.h264.decode).toContain(codec);
  });

  it('returns null when nothing is supported', async () => {
    vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn(async () => ({ supported: false })) });
    expect(await getBestCodec('decode', 'h264')).toBeNull();
  });

  it('falls back to another codec family when preference unsupported', async () => {
    // Only av1 decode codecs are supported
    const av1 = SUPPORTED_CODECS.av1.decode as readonly string[];
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(async (cfg: { codec: string }) => ({ supported: av1.includes(cfg.codec) })),
    });
    const codec = await getBestCodec('decode', 'h264');
    expect(av1).toContain(codec);
  });
});

// ============================================================
// VideoPipeline — configuration
// ============================================================

describe('VideoPipeline — configure', () => {
  let pipeline: VideoPipeline;
  beforeEach(() => { pipeline = new VideoPipeline(); });

  it('configureDecoder returns true when supported', async () => {
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(async (cfg: unknown) => ({ supported: true, config: cfg })),
    });
    expect(await pipeline.configureDecoder({ codec: 'avc1.42001E' })).toBe(true);
  });

  it('configureDecoder returns false when unsupported', async () => {
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(async () => ({ supported: false })),
    });
    expect(await pipeline.configureDecoder({ codec: 'bad' })).toBe(false);
  });

  it('configureEncoder returns true when supported', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn(async (cfg: unknown) => ({ supported: true, config: cfg })),
    });
    expect(await pipeline.configureEncoder({ codec: 'avc1.42001E', width: 1280, height: 720 })).toBe(true);
  });

  it('configureEncoder returns false when unsupported', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn(async () => ({ supported: false })),
    });
    expect(await pipeline.configureEncoder({ codec: 'bad' })).toBe(false);
  });
});

// ============================================================
// VideoPipeline — guards
// ============================================================

describe('VideoPipeline — config guards', () => {
  let pipeline: VideoPipeline;
  beforeEach(() => { pipeline = new VideoPipeline(); });

  it('decodeFrame throws without decoder config', async () => {
    await expect(pipeline.decodeFrame({} as EncodedVideoChunk)).rejects.toThrow('Decoder not configured');
  });

  it('decodeFrames throws without decoder config', async () => {
    await expect(pipeline.decodeFrames([])).rejects.toThrow('Decoder not configured');
  });

  it('encodeFrame throws without encoder config', async () => {
    await expect(pipeline.encodeFrame(fakeFrame())).rejects.toThrow('Encoder not configured');
  });

  it('encodeFrames throws without encoder config', async () => {
    await expect(pipeline.encodeFrames([])).rejects.toThrow('Encoder not configured');
  });

  it('transcode throws when not fully configured', async () => {
    await expect(pipeline.transcode([])).rejects.toThrow('not fully configured');
  });

  it('extractFrameAtTime throws without decoder config', async () => {
    await expect(pipeline.extractFrameAtTime([], 0)).rejects.toThrow('Decoder not configured');
  });

  it('generateThumbnails throws without decoder config', async () => {
    await expect(pipeline.generateThumbnails([], 3)).rejects.toThrow('Decoder not configured');
  });
});

// ============================================================
// REGRESSION: generateThumbnails on empty chunks
// ============================================================

describe('VideoPipeline — REGRESSION: generateThumbnails edge cases', () => {
  function configured(): VideoPipeline {
    const p = new VideoPipeline();
    (p as unknown as { decoderConfig: unknown }).decoderConfig = { codec: 'avc1.42001E' };
    return p;
  }

  it('returns [] for empty chunks instead of crashing on chunks[-1]', async () => {
    const p = configured();
    await expect(p.generateThumbnails([], 3)).resolves.toEqual([]);
  });

  it('returns [] when count is 0', async () => {
    const p = configured();
    const chunks = [{ type: 'key', timestamp: 0 }] as unknown as EncodedVideoChunk[];
    await expect(p.generateThumbnails(chunks, 0)).resolves.toEqual([]);
  });
});

// ============================================================
// VideoPipeline — batch decode/encode completion & cleanup
//
// VideoDecoder/VideoEncoder don't exist in jsdom, so we install faithful
// fakes of the WebCodecs contract: output() is delivered per the configured
// script, flush() resolves once all queued work is drained (or rejects on
// error), and close() transitions state to 'closed'. These verify OUR
// completion/cleanup logic — not the codec — and would hang (timeout) under
// the previous count-gated implementation.
// ============================================================

interface FakeInit {
  output: (item: unknown) => void;
  error: (e: Error) => void;
}

/**
 * Build a fake VideoDecoder/VideoEncoder class that emits `emit` outputs on
 * flush(). Set `flushError` to model a codec that fails during flush.
 * Created instances are pushed to `instances` so tests can assert cleanup.
 */
function makeFakeCodec(
  emit: () => unknown[],
  instances: Array<{ state: string }>,
  flushError?: Error,
) {
  return class FakeCodec {
    state = 'unconfigured';
    private init: FakeInit;
    constructor(init: FakeInit) {
      this.init = init;
      instances.push(this);
    }
    configure(): void { this.state = 'configured'; }
    decode(): void { /* output is delivered on flush */ }
    encode(): void { /* output is delivered on flush */ }
    async flush(): Promise<void> {
      if (flushError) {
        this.init.error(flushError);
        throw flushError;
      }
      for (const item of emit()) this.init.output(item);
    }
    close(): void { this.state = 'closed'; }
  };
}

describe('VideoPipeline — batch decode/encode completion & cleanup', () => {
  function configuredDecoder(): VideoPipeline {
    const p = new VideoPipeline();
    (p as unknown as { decoderConfig: unknown }).decoderConfig = { codec: 'avc1.42001E' };
    return p;
  }
  function configuredEncoder(): VideoPipeline {
    const p = new VideoPipeline();
    (p as unknown as { encoderConfig: unknown }).encoderConfig = { codec: 'avc1.42001E' };
    return p;
  }
  const chunk = () => ({ type: 'key', timestamp: 0 }) as unknown as EncodedVideoChunk;

  it('decodeFrames resolves with fewer outputs than inputs (no hang)', async () => {
    const instances: Array<{ state: string }> = [];
    // 3 chunks in, only 2 frames out — the old count-gated code would hang.
    vi.stubGlobal('VideoDecoder', makeFakeCodec(() => [fakeFrame(), fakeFrame()], instances));
    const p = configuredDecoder();
    const frames = await p.decodeFrames([chunk(), chunk(), chunk()]);
    expect(frames).toHaveLength(2);
    expect(instances[0].state).toBe('closed'); // decoder released, no leak
    expect(p.getStats().decodedFrames).toBe(2);
  });

  it('decodeFrames closes the decoder even when flush rejects', async () => {
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoDecoder', makeFakeCodec(() => [], instances, new Error('decode fail')));
    const p = configuredDecoder();
    await expect(p.decodeFrames([chunk()])).rejects.toThrow('decode fail');
    expect(instances[0].state).toBe('closed');
  });

  it('decodeFrame returns the first frame and closes extras', async () => {
    const extra = fakeFrame();
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoDecoder', makeFakeCodec(() => [fakeFrame(), extra], instances));
    const p = configuredDecoder();
    const frame = await p.decodeFrame(chunk());
    expect(frame).toBeDefined();
    expect(extra.close).toHaveBeenCalled(); // surplus frame not leaked
    expect(instances[0].state).toBe('closed');
  });

  it('decodeFrame throws when the decoder produces no frame', async () => {
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoDecoder', makeFakeCodec(() => [], instances));
    const p = configuredDecoder();
    await expect(p.decodeFrame(chunk())).rejects.toThrow('no frame');
    expect(instances[0].state).toBe('closed'); // still released
  });

  it('encodeFrames resolves with a differing chunk count (no hang)', async () => {
    const instances: Array<{ state: string }> = [];
    const out = () => ({ type: 'key', timestamp: 0 });
    vi.stubGlobal('VideoEncoder', makeFakeCodec(() => [out()], instances)); // 2 in, 1 out
    const p = configuredEncoder();
    const chunks = await p.encodeFrames([fakeFrame(), fakeFrame()]);
    expect(chunks).toHaveLength(1);
    expect(instances[0].state).toBe('closed');
    expect(p.getStats().encodedFrames).toBe(1);
  });

  it('encodeFrame throws when the encoder produces no chunk', async () => {
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoEncoder', makeFakeCodec(() => [], instances));
    const p = configuredEncoder();
    await expect(p.encodeFrame(fakeFrame())).rejects.toThrow('no chunk');
    expect(instances[0].state).toBe('closed');
  });

  it('encodeFrames closes the encoder even when flush rejects', async () => {
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoEncoder', makeFakeCodec(() => [], instances, new Error('encode fail')));
    const p = configuredEncoder();
    await expect(p.encodeFrames([fakeFrame()])).rejects.toThrow('encode fail');
    expect(instances[0].state).toBe('closed');
  });
});

// ============================================================
// VideoPipeline — processors & stats
// ============================================================

describe('VideoPipeline — processors and stats', () => {
  let pipeline: VideoPipeline;
  beforeEach(() => { pipeline = new VideoPipeline(); });

  it('addProcessor/clearProcessors manage the chain', () => {
    const internal = pipeline as unknown as { processors: unknown[] };
    pipeline.addProcessor(async (f) => f);
    pipeline.addProcessor(async (f) => f);
    expect(internal.processors).toHaveLength(2);
    pipeline.clearProcessors();
    expect(internal.processors).toHaveLength(0);
  });

  it('getStats returns a copy', () => {
    const s = pipeline.getStats();
    s.decodedFrames = 999;
    expect(pipeline.getStats().decodedFrames).toBe(0);
  });

  it('getStats has all expected keys', () => {
    const s = pipeline.getStats();
    expect(s).toHaveProperty('decodedFrames');
    expect(s).toHaveProperty('encodedFrames');
    expect(s).toHaveProperty('droppedFrames');
    expect(s).toHaveProperty('queueSize');
  });

  it('resetStats zeroes the counters', () => {
    const internal = pipeline as unknown as { stats: { decodedFrames: number } };
    internal.stats.decodedFrames = 42;
    pipeline.resetStats();
    expect(pipeline.getStats().decodedFrames).toBe(0);
  });
});

// ============================================================
// FrameProcessors
// ============================================================

describe('FrameProcessors', () => {
  it('grayscale returns a VideoFrame', async () => {
    const out = await FrameProcessors.grayscale(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('brightnessContrast returns a processor that yields a VideoFrame', async () => {
    const proc = FrameProcessors.brightnessContrast(0.2, 0.1);
    const out = await proc(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('resize returns a VideoFrame', async () => {
    const out = await FrameProcessors.resize(320, 240)(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('crop returns a VideoFrame', async () => {
    const out = await FrameProcessors.crop(0, 0, 32, 24)(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('rotate returns a VideoFrame', async () => {
    const out = await FrameProcessors.rotate(90)(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('flip returns a VideoFrame', async () => {
    const out = await FrameProcessors.flip(true, false)(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('watermark returns a VideoFrame for each corner position', async () => {
    for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      const out = await FrameProcessors.watermark('© Artone', pos)(fakeFrame());
      expect(out).toBeInstanceOf(VideoFrame);
    }
  });
});
