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
  VideoEncoderStream,
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
  output: (item: unknown, meta?: unknown) => void;
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
      // Outputs are delivered before the error, mirroring a real codec that
      // successfully produces some frames/chunks and only fails partway
      // through the batch (e.g. a later corrupted chunk).
      for (const item of emit()) this.init.output(item);
      if (flushError) {
        this.init.error(flushError);
        throw flushError;
      }
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

  it('REGRESSION: decodeFrames closes already-produced frames when flush rejects after some output', async () => {
    // Before fix: frames emitted via output() before flush() rejects were
    // simply discarded on the throw path — never closed, leaking their
    // GPU/media resources.
    const instances: Array<{ state: string }> = [];
    const early1 = fakeFrame();
    const early2 = fakeFrame();
    vi.stubGlobal('VideoDecoder', makeFakeCodec(() => [early1, early2], instances, new Error('decode fail')));
    const p = configuredDecoder();
    await expect(p.decodeFrames([chunk(), chunk()])).rejects.toThrow('decode fail');
    expect(early1.close).toHaveBeenCalled();
    expect(early2.close).toHaveBeenCalled();
  });

  it('REGRESSION: decodeFrame closes an already-produced frame when flush rejects after output', async () => {
    const instances: Array<{ state: string }> = [];
    const early = fakeFrame();
    vi.stubGlobal('VideoDecoder', makeFakeCodec(() => [early], instances, new Error('decode fail')));
    const p = configuredDecoder();
    await expect(p.decodeFrame(chunk())).rejects.toThrow('decode fail');
    expect(early.close).toHaveBeenCalled();
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
// VideoEncoderStream — transform() frame lifecycle
// ============================================================

describe('VideoEncoderStream — transform() frame lifecycle', () => {
  it('REGRESSION: closes the frame even when encoder.encode() throws synchronously', async () => {
    class ThrowingEncoder {
      constructor(_init: { output: (c: unknown) => void; error: (e: Error) => void }) {}
      configure(): void {}
      encode(): void { throw new Error('encode failed'); }
      async flush(): Promise<void> {}
      close(): void {}
    }
    vi.stubGlobal('VideoEncoder', ThrowingEncoder);

    const stream = new VideoEncoderStream({
      codec: 'avc1.42001E', width: 64, height: 48, bitrate: 1_000_000,
    } as unknown as VideoEncoderConfig);
    // A TransformStream's readable side has highWaterMark 0 by default, so
    // writable-side backpressure never clears — and transform() never even
    // runs — unless something reads from stream.readable.
    stream.readable.getReader().read().catch(() => { /* expected to reject too */ });
    const writer = stream.writable.getWriter();
    const frame = fakeFrame();

    await expect(writer.write(frame)).rejects.toThrow('encode failed');
    // Without the try/finally fix, encode() throwing skips frame.close()
    // entirely and the VideoFrame leaks.
    expect(frame.close).toHaveBeenCalled();
  });
});

// ============================================================
// VideoPipeline — extractFrameAtTime (timestamp-based seeking)
//
// A fake decoder emits one frame per decoded chunk (optionally reordered to
// model B-frame decode≠presentation order). These verify seeking is correct
// for ranges that the previous frame-ordinal implementation got wrong:
// sub-range clips not starting at frame 0, between-frame targets, and
// reordered output.
// ============================================================

describe('VideoPipeline — extractFrameAtTime (timestamp seeking)', () => {
  function configuredDecoder(): VideoPipeline {
    const p = new VideoPipeline();
    (p as unknown as { decoderConfig: unknown }).decoderConfig = { codec: 'avc1.42001E' };
    return p;
  }

  const ck = (timestamp: number, type: 'key' | 'delta' = 'delta') =>
    ({ type, timestamp }) as unknown as EncodedVideoChunk;

  /** Fake decoder that emits a frame (timestamp + close spy) per decoded chunk. */
  function makeSeekDecoder(instances: Array<{ state: string }>, reorder = false) {
    return class {
      state = 'unconfigured';
      private init: FakeInit;
      private decoded: Array<{ timestamp: number }> = [];
      constructor(init: FakeInit) { this.init = init; instances.push(this); }
      configure(): void { this.state = 'configured'; }
      decode(chunk: { timestamp: number }): void { this.decoded.push(chunk); }
      async flush(): Promise<void> {
        const order = reorder ? [...this.decoded].reverse() : this.decoded;
        for (const c of order) this.init.output({ timestamp: c.timestamp, close: vi.fn() });
      }
      close(): void { this.state = 'closed'; }
    };
  }

  // A 2-second clip starting at t=10s — a sub-range NOT beginning at frame 0,
  // the exact case the old frame-ordinal math returned null for.
  const clip = () => [
    ck(10_000_000, 'key'),
    ck(10_033_000),
    ck(10_066_000),
    ck(10_100_000),
  ];

  it('returns the exact frame at the target timestamp on a sub-range clip', async () => {
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoDecoder', makeSeekDecoder(instances));
    const p = configuredDecoder();
    const frame = await p.extractFrameAtTime(clip(), 10_066_000);
    expect(frame?.timestamp).toBe(10_066_000);
    expect(instances[0].state).toBe('closed'); // decoder released
  });

  it('returns the frame on screen (greatest ts <= target) for a between-frame target', async () => {
    vi.stubGlobal('VideoDecoder', makeSeekDecoder([]));
    const p = configuredDecoder();
    const frame = await p.extractFrameAtTime(clip(), 10_080_000);
    expect(frame?.timestamp).toBe(10_066_000);
  });

  it('selects correctly even when decode output is reordered (B-frames)', async () => {
    vi.stubGlobal('VideoDecoder', makeSeekDecoder([], /* reorder */ true));
    const p = configuredDecoder();
    const frame = await p.extractFrameAtTime(clip(), 10_066_000);
    expect(frame?.timestamp).toBe(10_066_000);
  });

  it('returns null when the target precedes all frames', async () => {
    const instances: Array<{ state: string }> = [];
    vi.stubGlobal('VideoDecoder', makeSeekDecoder(instances));
    const p = configuredDecoder();
    const frame = await p.extractFrameAtTime(clip(), 5_000_000);
    expect(frame).toBeNull();
    expect(instances[0].state).toBe('closed'); // still released, no leak
  });

  it('returns the last frame when target is at/after the end', async () => {
    vi.stubGlobal('VideoDecoder', makeSeekDecoder([]));
    const p = configuredDecoder();
    const frame = await p.extractFrameAtTime(clip(), 999_000_000);
    expect(frame?.timestamp).toBe(10_100_000);
  });

  it('REGRESSION: closes the selected frame when flush rejects after it was already chosen', async () => {
    // Before fix: the output callback already closes every non-selected
    // frame immediately, so at most one frame (`best`) is ever unclosed at a
    // time -- but if flush() rejected after `best` was set, the function
    // re-threw without closing it, leaking that one frame.
    const selected = { timestamp: 10_066_000, close: vi.fn() };
    class FailingSeekDecoder {
      state = 'unconfigured';
      private init: FakeInit;
      constructor(init: FakeInit) { this.init = init; }
      configure(): void { this.state = 'configured'; }
      decode(): void { /* no-op */ }
      async flush(): Promise<void> {
        this.init.output(selected);
        const err = new Error('decode fail');
        this.init.error(err);
        throw err;
      }
      close(): void { this.state = 'closed'; }
    }
    vi.stubGlobal('VideoDecoder', FailingSeekDecoder);
    const p = configuredDecoder();
    await expect(p.extractFrameAtTime(clip(), 10_066_000)).rejects.toThrow('decode fail');
    expect(selected.close).toHaveBeenCalled();
  });
});

// ============================================================
// VideoPipeline — transcode (processor chain wiring)
//
// Streaming fakes: the decoder emits one frame per decoded chunk, the encoder
// emits one chunk per frame. These verify that configured processors are
// actually applied — the previous wiring built the processor chain off a
// stale decoder.readable reference, so processors were dropped and any
// configured processor double-locked the stream and threw.
// ============================================================

describe('VideoPipeline — transcode processor wiring', () => {
  function fullyConfigured(): VideoPipeline {
    const p = new VideoPipeline();
    (p as unknown as { decoderConfig: unknown }).decoderConfig = { codec: 'avc1.42001E' };
    (p as unknown as { encoderConfig: unknown }).encoderConfig = { codec: 'avc1.42001E' };
    return p;
  }

  class FakeStreamDecoder {
    state = 'unconfigured';
    // Read by awaitDecodeQueueBelow before every decode() call; 0 keeps it
    // under the default threshold so these simple synchronous fakes never
    // need to exercise the addEventListener('dequeue', ...) wait path.
    decodeQueueSize = 0;
    private init: FakeInit;
    constructor(init: FakeInit) { this.init = init; }
    configure(): void { this.state = 'configured'; }
    decode(chunk: { timestamp: number }): void {
      this.init.output({ timestamp: chunk.timestamp, duration: 1000, close: vi.fn() });
    }
    async flush(): Promise<void> {}
    close(): void { this.state = 'closed'; }
  }

  class FakeStreamEncoder {
    state = 'unconfigured';
    private init: FakeInit;
    constructor(init: FakeInit) { this.init = init; }
    configure(): void { this.state = 'configured'; }
    encode(frame: { timestamp: number }, opts: { keyFrame: boolean }): void {
      this.init.output({ timestamp: frame.timestamp, type: opts.keyFrame ? 'key' : 'delta' }, {});
    }
    async flush(): Promise<void> {}
    close(): void { this.state = 'closed'; }
  }

  beforeEach(() => {
    vi.stubGlobal('VideoDecoder', FakeStreamDecoder);
    vi.stubGlobal('VideoEncoder', FakeStreamEncoder);
  });

  const chunks = () => ([
    { type: 'key', timestamp: 0 },
    { type: 'delta', timestamp: 1000 },
    { type: 'delta', timestamp: 2000 },
  ]) as unknown as EncodedVideoChunk[];

  it('transcodes every input chunk with no processors', async () => {
    const p = fullyConfigured();
    const out = await p.transcode(chunks());
    expect(out).toHaveLength(3);
  });

  it('applies a configured processor to every frame (previously dropped)', async () => {
    const p = fullyConfigured();
    const seen: number[] = [];
    p.addProcessor(async (frame) => { seen.push(frame.timestamp); return frame; });
    const out = await p.transcode(chunks());
    expect(seen).toEqual([0, 1000, 2000]); // processor ran on each frame
    expect(out).toHaveLength(3);
  });

  it('threads multiple processors in order without locking the stream', async () => {
    const p = fullyConfigured();
    const order: string[] = [];
    p.addProcessor(async (f) => { order.push('a'); return f; });
    p.addProcessor(async (f) => { order.push('b'); return f; });
    const out = await p.transcode(chunks());
    expect(out).toHaveLength(3);
    // Each frame passes a before b.
    expect(order).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
  });

  it('reports progress for an array input', async () => {
    const p = fullyConfigured();
    const progress: number[] = [];
    await p.transcode(chunks(), (x) => progress.push(x));
    expect(progress.at(-1)).toBeCloseTo(1);
    expect(progress).toHaveLength(3);
  });

  it('REGRESSION: does not deadlock when a decoder buffers multiple inputs before any output (B-frame reordering)', async () => {
    // Before fix: VideoDecoderStream.transform() returned a Promise that only
    // resolved on the NEXT output frame, assuming exactly one output per
    // input chunk. TransformStream calls transform() strictly sequentially,
    // so a decoder that consumes 2+ chunks before emitting its first output
    // (as any B-frame-reordering decoder can) deadlocked: transform(chunk 1)
    // never resolved, so chunk 2/3 were never fed, so the buffered output
    // that chunk 2/3 would have unblocked never arrived either.
    class BufferingFakeDecoder {
      state = 'unconfigured';
      decodeQueueSize = 0;
      private init: FakeInit;
      private pending: Array<{ timestamp: number }> = [];
      constructor(init: FakeInit) { this.init = init; }
      configure(): void { this.state = 'configured'; }
      decode(chunk: { timestamp: number }): void {
        this.pending.push(chunk);
        // Only emit once at least 2 chunks have been fed — models a decoder
        // that needs a lookahead buffer before it can output anything.
        if (this.pending.length >= 2) {
          for (const c of this.pending.splice(0)) {
            this.init.output({ timestamp: c.timestamp, duration: 1000, close: vi.fn() });
          }
        }
      }
      async flush(): Promise<void> {
        for (const c of this.pending.splice(0)) {
          this.init.output({ timestamp: c.timestamp, duration: 1000, close: vi.fn() });
        }
      }
      close(): void { this.state = 'closed'; }
    }
    vi.stubGlobal('VideoDecoder', BufferingFakeDecoder);

    const p = fullyConfigured();
    const out = await p.transcode(chunks());
    expect(out).toHaveLength(3);
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
    const out = await FrameProcessors.grayscale()(fakeFrame());
    expect(out).toBeInstanceOf(VideoFrame);
  });

  it('REGRESSION: each grayscale() factory call owns an independent canvas, not a shared module-level one', async () => {
    // Before fix: grayscale was a single shared FrameProcessor backed by a
    // MODULE-LEVEL canvas/ctx -- the only processor here not following the
    // lazy-init-per-closure pattern every other processor uses. Two
    // concurrent pipelines calling it in parallel would race on the same
    // canvas (one's drawImage()/getImageData() clobbered by the other's
    // drawImage() before pixels were read back). Each factory call must now
    // create and own its own OffscreenCanvas.
    const ctorSpy = globalThis.OffscreenCanvas as unknown as { mock: { calls: unknown[] } };
    const callsBefore = ctorSpy.mock.calls.length;

    const a = FrameProcessors.grayscale();
    const b = FrameProcessors.grayscale();
    await a(fakeFrame(64, 48));
    await b(fakeFrame(64, 48));

    // Two independent factory instances, each processing one frame, must
    // each construct their own canvas -- a shared module-level canvas would
    // only construct once in total (reused across both calls).
    expect(ctorSpy.mock.calls.length - callsBefore).toBe(2);
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
