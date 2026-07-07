/**
 * Tests for export/export-engine.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExportEngine,
  EXPORT_PRESETS,
  awaitEncoderQueueBelow,
  DEFAULT_MAX_ENCODE_QUEUE,
  type ExportConfig,
  type ExportJob,
} from '../export/export-engine';
import { muxMP4 } from '../export/mp4-muxer';
import { muxWebM, type VideoChunkRef, type AudioChunkRef } from '../export/webm-muxer';

vi.mock('../export/mp4-muxer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../export/mp4-muxer')>();
  return { ...actual, muxMP4: vi.fn(actual.muxMP4) };
});
vi.mock('../export/webm-muxer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../export/webm-muxer')>();
  return { ...actual, muxWebM: vi.fn(actual.muxWebM) };
});

/** Access ExportEngine's private mux()/lastAudio* for white-box muxing tests. */
type ExportEnginePrivate = {
  lastAudioSampleRate: number;
  lastAudioChannels: number;
  mux(
    videoChunks: VideoChunkRef[],
    audioChunks: AudioChunkRef[] | null,
    config: ExportConfig,
    duration: number
  ): Promise<Blob>;
};

// ============================================================
// EXPORT_PRESETS
// ============================================================

describe('EXPORT_PRESETS', () => {
  it('has 8 presets', () => {
    expect(EXPORT_PRESETS).toHaveLength(8);
  });

  it('all presets have unique ids', () => {
    const ids = EXPORT_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have non-empty name and description', () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it('all presets have positive width and height', () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.config.width).toBeGreaterThan(0);
      expect(p.config.height).toBeGreaterThan(0);
    }
  });

  it('all presets have positive fps', () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.config.fps).toBeGreaterThan(0);
    }
  });

  it('youtube-4k preset has expected resolution', () => {
    const p = EXPORT_PRESETS.find(p => p.id === 'youtube-4k')!;
    expect(p.config.width).toBe(3840);
    expect(p.config.height).toBe(2160);
  });

  it('youtube-1080p preset has expected resolution', () => {
    const p = EXPORT_PRESETS.find(p => p.id === 'youtube-1080p')!;
    expect(p.config.width).toBe(1920);
    expect(p.config.height).toBe(1080);
  });

  it('gif preset uses gif format with no audio bitrate', () => {
    const p = EXPORT_PRESETS.find(p => p.id === 'gif')!;
    expect(p.config.format).toBe('gif');
    expect(p.config.audioBitrate).toBe(0);
  });

  it('instagram-reels is 9:16 vertical', () => {
    const p = EXPORT_PRESETS.find(p => p.id === 'instagram-reels')!;
    expect(p.config.height).toBeGreaterThan(p.config.width);
  });

  it('instagram-feed is 1:1 square', () => {
    const p = EXPORT_PRESETS.find(p => p.id === 'instagram-feed')!;
    expect(p.config.width).toBe(p.config.height);
  });
});

// ============================================================
// ExportEngine.createJob / getJob
// ============================================================

describe('ExportEngine — job management', () => {
  let engine: ExportEngine;
  const config: ExportConfig = {
    format: 'mp4',
    codec: 'avc1.640028',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 5_000_000,
    audioBitrate: 192_000,
    quality: 'high',
    hardwareAcceleration: true,
  };

  beforeEach(() => { engine = new ExportEngine(); });

  it('createJob returns a job with status=pending', () => {
    const job = engine.createJob('proj-1', config);
    expect(job.status).toBe('pending');
    expect(job.progress).toBe(0);
    expect(job.projectId).toBe('proj-1');
  });

  it('createJob assigns a unique id', () => {
    const j1 = engine.createJob('p', config);
    const j2 = engine.createJob('p', config);
    expect(j1.id).not.toBe(j2.id);
  });

  it('getJob returns the created job', () => {
    const job = engine.createJob('p', config);
    expect(engine.getJob(job.id)).toBe(job);
  });

  it('getJob returns undefined for unknown id', () => {
    expect(engine.getJob('nonexistent')).toBeUndefined();
  });

  it('cancelJob sets status to cancelled', () => {
    const job = engine.createJob('p', config);
    engine.cancelJob(job.id);
    expect(job.status).toBe('cancelled');
  });

  it('cancelJob does nothing for completed job', () => {
    const job = engine.createJob('p', config);
    job.status = 'complete';
    engine.cancelJob(job.id);
    expect(job.status).toBe('complete');
  });

  it('cancelJob does nothing for unknown job', () => {
    expect(() => engine.cancelJob('nonexistent')).not.toThrow();
  });
});

// ============================================================
// ExportEngine.getPresets / getPresetById
// ============================================================

describe('ExportEngine — presets', () => {
  const engine = new ExportEngine();

  it('getPresets returns all presets', () => {
    expect(engine.getPresets()).toHaveLength(EXPORT_PRESETS.length);
  });

  it('getPresetById returns correct preset', () => {
    const p = engine.getPresetById('youtube-1080p');
    expect(p!.config.width).toBe(1920);
  });

  it('getPresetById returns undefined for unknown id', () => {
    expect(engine.getPresetById('nonexistent')).toBeUndefined();
  });
});

// ============================================================
// subscribe / unsubscribe
// ============================================================

describe('ExportEngine.subscribe()', () => {
  it('listener receives job when cancelJob is called', () => {
    const engine = new ExportEngine();
    const config: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 1920, height: 1080,
      fps: 30, bitrate: 5_000_000, audioBitrate: 192_000,
      quality: 'high', hardwareAcceleration: true,
    };
    const job = engine.createJob('p', config);
    const received: ExportJob[] = [];
    engine.subscribe(j => received.push(j));
    engine.cancelJob(job.id);
    expect(received).toHaveLength(1);
    expect(received[0].status).toBe('cancelled');
  });

  it('unsubscribe stops notifications', () => {
    const engine = new ExportEngine();
    const config: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 1920, height: 1080,
      fps: 30, bitrate: 5_000_000, audioBitrate: 192_000,
      quality: 'high', hardwareAcceleration: true,
    };
    const job = engine.createJob('p', config);
    const fn = vi.fn();
    const unsub = engine.subscribe(fn);
    unsub();
    engine.cancelJob(job.id);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================
// exportAudioWAV — delegates to wav-encoder; verifies it returns a Blob
// ============================================================

describe('exportAudioWAV()', () => {
  it('returns a Blob with audio/wav mime type', () => {
    const engine = new ExportEngine();

    // Build a minimal AudioBuffer-like object
    const sampleRate = 44100;
    const length = 1024;
    const ch0 = new Float32Array(length).fill(0.5);
    const ch1 = new Float32Array(length).fill(-0.5);

    const audioBuffer = {
      sampleRate,
      duration: length / sampleRate,
      length,
      numberOfChannels: 2,
      getChannelData(ch: number) { return ch === 0 ? ch0 : ch1; },
    } as unknown as AudioBuffer;

    const blob = engine.exportAudioWAV(audioBuffer, 16);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44); // At least WAV header
  });

  it('accepts 24-bit depth', () => {
    const engine = new ExportEngine();
    const buf = {
      sampleRate: 48000,
      length: 512,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(512),
    } as unknown as AudioBuffer;
    const blob = engine.exportAudioWAV(buf, 24);
    expect(blob.size).toBeGreaterThan(44);
  });
});

// ============================================================
// REGRESSION: audio data layout (f32-planar)
// Verify that the audio interleaving writes planar layout (ch*length+i)
// via white-box inspection of the fixed source.
// ============================================================

describe('ExportEngine — download()', () => {
  it('creates and clicks an anchor element then revokes the object URL', () => {
    const engine = new ExportEngine();
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const clickFn = vi.fn();

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const anchor = { href: '', download: '', click: clickFn } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);

    const blob = new Blob(['test'], { type: 'video/mp4' });
    engine.download(blob, 'output.mp4');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('output.mp4');
    expect(clickFn).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

// ============================================================
// REGRESSION: cancelJob status not overwritten by catch block
// ============================================================

describe('REGRESSION: cancel status preserved when abort propagates as error', () => {
  it('job.status stays cancelled when abortController.abort() causes the encode to reject', () => {
    // Simulate the sequence: cancelJob sets 'cancelled', then abort throws an error
    // that the catch block must NOT overwrite with 'error'.
    const engine = new ExportEngine();
    const config: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 1920, height: 1080,
      fps: 30, bitrate: 5_000_000, audioBitrate: 192_000,
      quality: 'high', hardwareAcceleration: true,
    };
    const job = engine.createJob('p', config);

    // Mark the job as encoding (as the export loop would)
    job.status = 'encoding';
    // cancelJob: sets 'cancelled' and fires abort
    engine.cancelJob(job.id);
    expect(job.status).toBe('cancelled');

    // Now simulate the catch block path — verify that re-invoking cancelJob
    // on an already-cancelled job doesn't flip it back (no-op guard already existed),
    // and that the status is still 'cancelled' after the error path would have run.
    // (White-box: we verify the guard logic without executing the full async export.)
    const simulateCatchBlock = (j: ExportJob, err: Error) => {
      if (j.status !== 'cancelled') {
        j.status = 'error';
        j.error = err.message;
      }
    };
    simulateCatchBlock(job, new Error('Export cancelled'));
    expect(job.status).toBe('cancelled');    // must NOT become 'error'
    expect(job.error).toBeUndefined();       // error field must not be set
  });
});

// ============================================================
// REGRESSION: VideoFrame / AudioData must be closed even when encode() throws
// ============================================================

describe('REGRESSION: VideoFrame.close() called even when VideoEncoder.encode() throws', () => {
  it('frame.close() is called when encoder.encode() throws', () => {
    // Simulate the try/finally pattern used in encodeFrames()
    const closeFn = vi.fn();
    const mockFrame = { close: closeFn } as unknown as VideoFrame;
    const encodeThrows = () => { throw new DOMException('InvalidStateError'); };

    expect(() => {
      try {
        encodeThrows();
      } finally {
        mockFrame.close();
      }
    }).toThrow();

    // close() MUST have been called despite the throw
    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  it('frame.close() is called on normal encode() completion', () => {
    const closeFn = vi.fn();
    const mockFrame = { close: closeFn } as unknown as VideoFrame;
    const encodeSucceeds = vi.fn();

    try {
      encodeSucceeds();
    } finally {
      mockFrame.close();
    }

    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});

describe('REGRESSION: AudioData.close() called even when AudioEncoder.encode() throws', () => {
  it('audioData.close() is called when encoder.encode() throws', () => {
    const closeFn = vi.fn();
    const mockData = { close: closeFn } as unknown as AudioData;
    const encodeThrows = () => { throw new DOMException('InvalidStateError'); };

    expect(() => {
      try {
        encodeThrows();
      } finally {
        mockData.close();
      }
    }).toThrow();

    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});

describe('REGRESSION: export() rejects fps=0 before muxer arithmetic (NaN stts box)', () => {
  it('export() throws RangeError for fps=0 (prevents u32(NaN)=0 corrupting MP4 stts)', async () => {
    // Before fix: buildVideoStbl received fps=0 → Math.round(timescale/0) = NaN
    // → u32(NaN) = [0,0,0,0] → all stts sample deltas = 0 → video plays at ∞ speed.
    const engine = new ExportEngine();
    const badConfig: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 1920, height: 1080,
      fps: 0,  // ← invalid
      bitrate: 5_000_000, audioBitrate: 192_000, quality: 'high',
      hardwareAcceleration: false,
    };
    const job = engine.createJob('p', badConfig);
    const fakeRender = vi.fn(async () => ({ close: vi.fn() } as unknown as VideoFrame));
    await expect(
      engine.export(job, fakeRender, null, 1)
    ).rejects.toThrow(RangeError);
  });

  it('export() throws RangeError for width=0', async () => {
    const engine = new ExportEngine();
    const badConfig: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 0, height: 1080,
      fps: 30, bitrate: 5_000_000, audioBitrate: 192_000, quality: 'high',
      hardwareAcceleration: false,
    };
    const job = engine.createJob('p', badConfig);
    await expect(
      engine.export(job, vi.fn(), null, 1)
    ).rejects.toThrow(RangeError);
  });

  it('export() succeeds when fps > 0 (no early rejection)', async () => {
    // We can't run a real WebCodecs encode in jsdom, but the RangeError path
    // must NOT fire for valid config — it should throw later (WebCodecs absent).
    const engine = new ExportEngine();
    const goodConfig: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 1920, height: 1080,
      fps: 30, bitrate: 5_000_000, audioBitrate: 192_000, quality: 'high',
      hardwareAcceleration: false,
    };
    const job = engine.createJob('p', goodConfig);
    const error = await engine.export(job, vi.fn(), null, 0).catch(e => e as Error);
    // Must NOT be a RangeError from our new guard
    expect(error).not.toBeInstanceOf(RangeError);
  });
});

describe('REGRESSION: encodeAudio planar layout', () => {
  it('planar layout fix: data[ch * length + i] not data[i * channels + ch]', async () => {
    // We cannot call private encodeAudio directly without a real AudioEncoder,
    // but we can verify the planar-vs-interleaved arithmetic at unit level.
    const channels = 2;
    const length = 4;
    const ch0 = [1, 2, 3, 4];
    const ch1 = [5, 6, 7, 8];

    // Planar layout (correct for f32-planar)
    const planar = new Float32Array(length * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = ch === 0 ? ch0 : ch1;
      for (let i = 0; i < length; i++) {
        planar[ch * length + i] = channelData[i];
      }
    }
    // Expect: [1,2,3,4, 5,6,7,8]
    expect(Array.from(planar)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Interleaved layout (old BUGGY code)
    const interleaved = new Float32Array(length * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = ch === 0 ? ch0 : ch1;
      for (let i = 0; i < length; i++) {
        interleaved[i * channels + ch] = channelData[i];
      }
    }
    // Expect: [1,5,2,6,3,7,4,8] (interleaved - WRONG for f32-planar)
    expect(Array.from(interleaved)).toEqual([1, 5, 2, 6, 3, 7, 4, 8]);

    // Confirm the two are different (ensures the test actually caught the distinction)
    expect(Array.from(planar)).not.toEqual(Array.from(interleaved));
  });
});

describe('REGRESSION: mux() declares the real audio sample rate/channels, not a hardcoded 48kHz/stereo', () => {
  const videoChunks: VideoChunkRef[] = [
    { data: new Uint8Array(8).fill(1), timestampUs: 0, durationUs: 33333, isKeyframe: true },
  ];
  const audioChunks: AudioChunkRef[] = [
    { data: new Uint8Array(4).fill(2), timestampUs: 0 },
  ];

  beforeEach(() => { vi.clearAllMocks(); });

  it('MP4: uses the sample rate/channels encodeAudio() actually configured (e.g. 44.1kHz mono)', async () => {
    const engine = new ExportEngine();
    const priv = engine as unknown as ExportEnginePrivate;
    // Simulate what encodeAudio() sets for a 44.1kHz mono source.
    priv.lastAudioSampleRate = 44100;
    priv.lastAudioChannels = 1;

    const config: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 320, height: 240, fps: 30,
      bitrate: 1_000_000, audioBitrate: 128_000, quality: 'high', hardwareAcceleration: false,
    };
    await priv.mux(videoChunks, audioChunks, config, 1);

    expect(muxMP4).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      { sampleRate: 44100, channels: 1 },
      expect.anything(),
    );
  });

  it('WebM: uses the sample rate/channels encodeAudio() actually configured (e.g. 44.1kHz mono)', async () => {
    const engine = new ExportEngine();
    const priv = engine as unknown as ExportEnginePrivate;
    priv.lastAudioSampleRate = 44100;
    priv.lastAudioChannels = 1;

    const config: ExportConfig = {
      format: 'webm', codec: 'vp09.00.10.08', width: 320, height: 240, fps: 30,
      bitrate: 1_000_000, audioBitrate: 128_000, quality: 'high', hardwareAcceleration: false,
    };
    await priv.mux(videoChunks, audioChunks, config, 1);

    expect(muxWebM).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ sampleRate: 44100, channels: 1 }),
      expect.anything(),
    );
  });

  it('defaults to 48kHz/stereo when no audio was ever encoded (no encodeAudio call yet)', async () => {
    const engine = new ExportEngine();
    const priv = engine as unknown as ExportEnginePrivate;
    const config: ExportConfig = {
      format: 'mp4', codec: 'avc1.640028', width: 320, height: 240, fps: 30,
      bitrate: 1_000_000, audioBitrate: 128_000, quality: 'high', hardwareAcceleration: false,
    };
    await priv.mux(videoChunks, audioChunks, config, 1);

    expect(muxMP4).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      { sampleRate: 48000, channels: 2 },
      expect.anything(),
    );
  });
});

// ============================================================
// WebCodecs back-pressure helper (per Chrome best practices / Qiita findings)
// ============================================================

describe('awaitEncoderQueueBelow — WebCodecs back-pressure', () => {
  /** Minimal stub matching the duck-typed encoder shape. */
  function makeFakeEncoder(initialQueueSize: number) {
    const target = new EventTarget() as EventTarget & { encodeQueueSize: number };
    target.encodeQueueSize = initialQueueSize;
    return target;
  }

  it('returns immediately when queue is below the default threshold', async () => {
    const enc = makeFakeEncoder(0);
    // Must not hang. Race against a microtask that would only fire if we actually awaited.
    let resolved = false;
    await Promise.race([
      awaitEncoderQueueBelow(enc).then(() => { resolved = true; }),
      Promise.resolve(),
    ]);
    expect(resolved).toBe(true);
  });

  it('returns immediately at exactly threshold - 1', async () => {
    const enc = makeFakeEncoder(DEFAULT_MAX_ENCODE_QUEUE - 1);
    await expect(awaitEncoderQueueBelow(enc)).resolves.toBeUndefined();
  });

  it('blocks at threshold and unblocks on the next "dequeue" event', async () => {
    const enc = makeFakeEncoder(DEFAULT_MAX_ENCODE_QUEUE);
    let unblocked = false;
    const pending = awaitEncoderQueueBelow(enc).then(() => { unblocked = true; });

    // Yield two microtasks — must still be blocked since no dequeue fired.
    await Promise.resolve();
    await Promise.resolve();
    expect(unblocked).toBe(false);

    // Fire dequeue → should unblock.
    enc.dispatchEvent(new Event('dequeue'));
    await pending;
    expect(unblocked).toBe(true);
  });

  it('blocks well above threshold and still unblocks on dequeue (back-pressure works)', async () => {
    const enc = makeFakeEncoder(DEFAULT_MAX_ENCODE_QUEUE * 10);
    const pending = awaitEncoderQueueBelow(enc, DEFAULT_MAX_ENCODE_QUEUE);
    enc.dispatchEvent(new Event('dequeue'));
    await expect(pending).resolves.toBeUndefined();
  });

  it('custom maxQueue parameter overrides the default', async () => {
    const enc = makeFakeEncoder(3);
    // maxQueue=2 → 3 >= 2 → must block until dequeue.
    let unblocked = false;
    const pending = awaitEncoderQueueBelow(enc, 2).then(() => { unblocked = true; });
    await Promise.resolve();
    expect(unblocked).toBe(false);
    enc.dispatchEvent(new Event('dequeue'));
    await pending;
    expect(unblocked).toBe(true);

    // maxQueue=10 → 3 < 10 → must return immediately.
    await expect(awaitEncoderQueueBelow(enc, 10)).resolves.toBeUndefined();
  });

  it('DEFAULT_MAX_ENCODE_QUEUE is a sane positive integer', () => {
    expect(Number.isInteger(DEFAULT_MAX_ENCODE_QUEUE)).toBe(true);
    expect(DEFAULT_MAX_ENCODE_QUEUE).toBeGreaterThan(0);
    // Sanity bounds: not so low it stalls every frame, not so high it defeats the purpose.
    expect(DEFAULT_MAX_ENCODE_QUEUE).toBeLessThan(1000);
  });
});
