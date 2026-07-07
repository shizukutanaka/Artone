/**
 * Tests for media/proxy-workflow.ts
 *
 * WebCodecs VideoEncoder and IndexedDB are not available in jsdom, so the
 * encode/enqueue paths are exercised via private-field injection. All pure
 * logic (shouldGenerate, recommendedPreset, cancel, listener management) is
 * tested without mocks.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ProxyWorkflow,
  PROXY_PRESETS,
  type ProxyJob,
} from '../media/proxy-workflow';

function makeJob(overrides: Partial<ProxyJob> = {}): ProxyJob {
  return {
    id: crypto.randomUUID(),
    sourceId: 'src-1',
    sourceUrl: 'blob:fake',
    sourceWidth: 3840,
    sourceHeight: 2160,
    preset: PROXY_PRESETS['quarter'],
    status: 'queued',
    progress: 0,
    ...overrides,
  };
}

type InternalPW = {
  queue: ProxyJob[];
  active: Map<string, ProxyJob>;
  initialized: boolean;
  storage: Record<string, unknown>;
  encoder: Record<string, unknown>;
  notifyListeners(job: ProxyJob): void;
  runJob(job: ProxyJob): Promise<void>;
};

function internals(pw: ProxyWorkflow): InternalPW {
  return pw as unknown as InternalPW;
}

// ============================================================
// PROXY_PRESETS
// ============================================================

describe('PROXY_PRESETS', () => {
  it('full scale is 1.0', () => {
    expect(PROXY_PRESETS.full.scale).toBe(1.0);
  });

  it('half scale is 0.5', () => {
    expect(PROXY_PRESETS.half.scale).toBe(0.5);
  });

  it('quarter scale is 0.25', () => {
    expect(PROXY_PRESETS.quarter.scale).toBe(0.25);
  });

  it('eighth scale is 0.125', () => {
    expect(PROXY_PRESETS.eighth.scale).toBe(0.125);
  });

  it('bitrates decrease from full → eighth', () => {
    expect(PROXY_PRESETS.full.bitrate).toBeGreaterThan(PROXY_PRESETS.half.bitrate);
    expect(PROXY_PRESETS.half.bitrate).toBeGreaterThan(PROXY_PRESETS.quarter.bitrate);
    expect(PROXY_PRESETS.quarter.bitrate).toBeGreaterThan(PROXY_PRESETS.eighth.bitrate);
  });

  it('all presets use avc codec', () => {
    for (const preset of Object.values(PROXY_PRESETS)) {
      expect(preset.codec).toBe('avc');
    }
  });
});

// ============================================================
// shouldGenerate
// ============================================================

describe('ProxyWorkflow — shouldGenerate()', () => {
  const pw = new ProxyWorkflow();

  it('returns true for 4K width (3840)', () => {
    expect(pw.shouldGenerate(3840, 2160)).toBe(true);
  });

  it('returns false for full HD (1920×1080)', () => {
    expect(pw.shouldGenerate(1920, 1080)).toBe(false);
  });

  it('uses max dimension — tall portrait 4K', () => {
    expect(pw.shouldGenerate(2160, 3840)).toBe(true);
  });

  it('threshold is inclusive: 3840 passes, 3839 does not', () => {
    expect(pw.shouldGenerate(3840, 1)).toBe(true);
    expect(pw.shouldGenerate(3839, 1)).toBe(false);
  });

  it('respects custom autoGenerateThreshold', () => {
    const custom = new ProxyWorkflow({ autoGenerateThreshold: 1920 });
    expect(custom.shouldGenerate(1920, 1080)).toBe(true);
    expect(custom.shouldGenerate(1280, 720)).toBe(false);
  });
});

// ============================================================
// recommendedPreset
// ============================================================

describe('ProxyWorkflow — recommendedPreset()', () => {
  const pw = new ProxyWorkflow();

  it('8K (7680×4320) → eighth', () => {
    expect(pw.recommendedPreset(7680, 4320)).toBe('eighth');
  });

  it('4K (3840×2160) → quarter', () => {
    expect(pw.recommendedPreset(3840, 2160)).toBe('quarter');
  });

  it('FHD (1920×1080) → half', () => {
    expect(pw.recommendedPreset(1920, 1080)).toBe('half');
  });

  it('below FHD (1280×720) → full', () => {
    expect(pw.recommendedPreset(1280, 720)).toBe('full');
  });

  it('uses max dimension — portrait 4K', () => {
    expect(pw.recommendedPreset(2160, 3840)).toBe('quarter');
  });

  it('exactly at 1920 → half (not full)', () => {
    expect(pw.recommendedPreset(1920, 1)).toBe('half');
    expect(pw.recommendedPreset(1919, 1)).toBe('full');
  });
});

// ============================================================
// cancel — queued jobs
// ============================================================

describe('ProxyWorkflow — cancel() — queued jobs', () => {
  it('removes job from queue and sets status to cancelled', () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();
    internals(pw).queue.push(job);
    expect(pw.cancel(job.id)).toBe(true);
    expect(pw.getQueue()).toHaveLength(0);
    expect(job.status).toBe('cancelled');
  });

  it('returns false for unknown job id', () => {
    expect(new ProxyWorkflow().cancel('ghost-id')).toBe(false);
  });

  it('notifies listeners with cancelled status', () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();
    internals(pw).queue.push(job);
    const fn = vi.fn();
    pw.onJobUpdate(fn);
    pw.cancel(job.id);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ id: job.id, status: 'cancelled' }));
  });

  it('only removes the targeted job, leaving others', () => {
    const pw = new ProxyWorkflow();
    const a = makeJob();
    const b = makeJob();
    internals(pw).queue.push(a, b);
    pw.cancel(a.id);
    expect(pw.getQueue()).toHaveLength(1);
    expect(pw.getQueue()[0].id).toBe(b.id);
  });
});

// ============================================================
// cancel — active jobs
// ============================================================

describe('ProxyWorkflow — cancel() — active jobs', () => {
  it('removes job from active map and sets status to cancelled', () => {
    const pw = new ProxyWorkflow();
    const job = makeJob({ status: 'processing' });
    internals(pw).active.set(job.id, job);
    expect(pw.cancel(job.id)).toBe(true);
    expect(pw.getActive()).toHaveLength(0);
    expect(job.status).toBe('cancelled');
  });
});

// ============================================================
// REGRESSION: cancel during async encode must not be overwritten
// ============================================================

describe('ProxyWorkflow — REGRESSION: runJob respects cancelled status', () => {
  // cancel() removes the job from this.active. The guard !this.active.has(job.id)
  // detects this and bails out without overwriting 'processing' with 'completed'/'failed'.

  it('does not write completed/outputBlob when job was removed from active (cancel race)', async () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();

    const fakeBlob = new Blob(['bytes'], { type: 'video/mp4' });
    internals(pw).storage = {
      init: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      findBySourceId: vi.fn().mockResolvedValue([]),
    };
    internals(pw).encoder = {
      encode: vi.fn().mockImplementation(
        async (opts: { onProgress: (n: number) => void }) => {
          opts.onProgress(1);
          return fakeBlob;
        }
      ),
    };
    internals(pw).initialized = true;
    // Do NOT add job to active — simulates cancel() having fired during encode

    await internals(pw).runJob(job);

    expect(job.outputBlob).toBeUndefined();
    expect(job.outputUrl).toBeUndefined();
    expect(job.status).not.toBe('completed');
  });

  it('does not write error when job was removed from active on encode failure', async () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();

    internals(pw).storage = { init: vi.fn(), save: vi.fn(), findBySourceId: vi.fn().mockResolvedValue([]) };
    internals(pw).encoder = {
      encode: vi.fn().mockRejectedValue(new Error('WebCodecs error')),
    };
    internals(pw).initialized = true;
    // Not in active → simulates cancel()

    await internals(pw).runJob(job);

    expect(job.error).toBeUndefined();
    expect(job.status).not.toBe('failed');
  });

  it('completes normally when job stays in active', async () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();

    const fakeBlob = new Blob(['bytes'], { type: 'video/mp4' });
    internals(pw).storage = {
      init: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      findBySourceId: vi.fn().mockResolvedValue([]),
    };
    internals(pw).encoder = { encode: vi.fn().mockResolvedValue(fakeBlob) };
    internals(pw).initialized = true;
    internals(pw).active.set(job.id, job);

    await internals(pw).runJob(job);

    expect(job.status).toBe('completed');
    expect(job.progress).toBe(1);
    expect(job.outputBlob).toBe(fakeBlob);
  });

  it('sets failed status on encode error when job stays in active', async () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();

    internals(pw).storage = { init: vi.fn(), save: vi.fn(), findBySourceId: vi.fn().mockResolvedValue([]) };
    internals(pw).encoder = { encode: vi.fn().mockRejectedValue(new Error('GPU error')) };
    internals(pw).initialized = true;
    internals(pw).active.set(job.id, job);

    await internals(pw).runJob(job);

    expect(job.status).toBe('failed');
    expect(job.error).toBe('GPU error');
  });
});

// ============================================================
// REGRESSION: cancel() actually aborts the in-flight encode
// ============================================================

type InternalPWWithControllers = InternalPW & { controllers: Map<string, AbortController> };

describe('ProxyWorkflow — REGRESSION: cancel() aborts the in-flight encode signal', () => {
  it('aborts the AbortSignal passed to encoder.encode() for an active job', async () => {
    // Before fix: cancel() only removed the job from `active` — the encoder's
    // per-frame loop had no cancellation signal at all and kept running to
    // completion in the background regardless.
    const pw = new ProxyWorkflow();
    const job = makeJob();

    let capturedSignal: AbortSignal | undefined;
    let resolveEncode!: (blob: Blob) => void;
    const encodePromise = new Promise<Blob>((resolve) => { resolveEncode = resolve; });

    internals(pw).storage = {
      init: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      findBySourceId: vi.fn().mockResolvedValue([]),
    };
    internals(pw).encoder = {
      encode: vi.fn().mockImplementation(async (opts: { signal?: AbortSignal }) => {
        capturedSignal = opts.signal;
        return encodePromise;
      }),
    };
    internals(pw).initialized = true;
    internals(pw).active.set(job.id, job);

    const runPromise = internals(pw).runJob(job);
    // Let runJob reach the `await this.encoder.encode(...)` point so the
    // AbortController is created and its signal captured.
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    expect(pw.cancel(job.id)).toBe(true);
    expect(capturedSignal!.aborted).toBe(true);

    resolveEncode(new Blob(['bytes'], { type: 'video/mp4' }));
    await runPromise;

    // cancel() already removed the job from active — runJob's existing
    // cancel-race guard must still keep 'cancelled', not overwrite it.
    expect(job.status).toBe('cancelled');
  });

  it('does not leak an AbortController for the job once it settles', async () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();

    internals(pw).storage = { init: vi.fn(), save: vi.fn().mockResolvedValue(undefined), findBySourceId: vi.fn().mockResolvedValue([]) };
    internals(pw).encoder = { encode: vi.fn().mockResolvedValue(new Blob(['b'], { type: 'video/mp4' })) };
    internals(pw).initialized = true;
    internals(pw).active.set(job.id, job);

    await internals(pw).runJob(job);

    expect((pw as unknown as InternalPWWithControllers).controllers.has(job.id)).toBe(false);
  });
});

// ============================================================
// onJobUpdate (subscribe / unsubscribe)
// ============================================================

describe('ProxyWorkflow — onJobUpdate()', () => {
  it('receives job updates via notifyListeners', () => {
    const pw = new ProxyWorkflow();
    const fn = vi.fn();
    pw.onJobUpdate(fn);
    const job = makeJob();
    internals(pw).notifyListeners(job);
    expect(fn).toHaveBeenCalledWith(job);
  });

  it('unsubscribe stops future notifications', () => {
    const pw = new ProxyWorkflow();
    const fn = vi.fn();
    const unsub = pw.onJobUpdate(fn);
    unsub();
    internals(pw).notifyListeners(makeJob());
    expect(fn).not.toHaveBeenCalled();
  });

  it('listener errors are isolated — other listeners still fire', () => {
    const pw = new ProxyWorkflow();
    const bad = vi.fn().mockImplementation(() => { throw new Error('boom'); });
    const good = vi.fn();
    pw.onJobUpdate(bad);
    pw.onJobUpdate(good);
    expect(() => internals(pw).notifyListeners(makeJob())).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('multiple listeners each receive the job', () => {
    const pw = new ProxyWorkflow();
    const a = vi.fn();
    const b = vi.fn();
    pw.onJobUpdate(a);
    pw.onJobUpdate(b);
    internals(pw).notifyListeners(makeJob());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// getQueue / getActive
// ============================================================

describe('ProxyWorkflow — getQueue / getActive', () => {
  it('getQueue returns a snapshot copy (external mutations do not affect internal queue)', () => {
    const pw = new ProxyWorkflow();
    const job = makeJob();
    internals(pw).queue.push(job);
    const q = pw.getQueue();
    q.pop();
    expect(pw.getQueue()).toHaveLength(1);
  });

  it('getActive returns all active jobs', () => {
    const pw = new ProxyWorkflow();
    const job = makeJob({ status: 'processing' });
    internals(pw).active.set(job.id, job);
    const a = pw.getActive();
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe(job.id);
  });

  it('getQueue is empty by default', () => {
    expect(new ProxyWorkflow().getQueue()).toHaveLength(0);
  });

  it('getActive is empty by default', () => {
    expect(new ProxyWorkflow().getActive()).toHaveLength(0);
  });
});

// ============================================================
// Blob URL leak regressions
// ============================================================

describe('ProxyWorkflow — Blob URL caching (regression)', () => {
  it('REGRESSION: resolveUrl returns the same Blob URL on repeated calls (no duplicates)', async () => {
    // Before fix: every resolveUrl() call for a cached proxy called
    // URL.createObjectURL() unconditionally, leaking one URL per call.
    const pw = new ProxyWorkflow();
    const urls: string[] = [];
    const createdUrls: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const u = `blob:fake/${createdUrls.length}`;
      createdUrls.push(u);
      return u;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const fakeBlob = new Blob(['proxy'], { type: 'video/mp4' });
    const pw2 = pw as unknown as {
      storage: { get(id: string): Promise<{ blob: Blob } | null>; findBySourceId(id: string): Promise<Array<{ sourceId: string; proxyId: string; preset: string; createdAt: number; sizeBytes: number }>>; };
      mappingCache: Map<string, unknown>;
      blobUrlCache: Map<string, string>;
      config: { useEditing: boolean; useExporting: boolean };
    };

    // Simulate a cached mapping
    const mapping = { sourceId: 'src-1', proxyId: 'proxy-1', preset: 'quarter', createdAt: Date.now(), sizeBytes: 100 };
    pw2.mappingCache.set('src-1', mapping);
    pw2.storage.get = vi.fn().mockResolvedValue({ blob: fakeBlob });

    const url1 = await pw.resolveUrl('src-1', 'original://');
    const url2 = await pw.resolveUrl('src-1', 'original://');
    const url3 = await pw.resolveUrl('src-1', 'original://');

    // After fix: only one Blob URL was ever created
    expect(createdUrls).toHaveLength(1);
    expect(url1).toBe(url2);
    expect(url1).toBe(url3);
    urls.push(url1);

    vi.restoreAllMocks();
  });

  it('REGRESSION: getStorageInfo returns 0 percent when storageQuotaMB is 0', async () => {
    // Before fix: (usedMB / 0) * 100 = Infinity, corrupting the storage badge.
    const pw = new ProxyWorkflow({ storageQuotaMB: 0 });
    const pw2 = pw as unknown as {
      storage: { getTotalSize(): Promise<number> };
    };
    pw2.storage.getTotalSize = vi.fn().mockResolvedValue(1024 * 1024); // 1 MB
    const info = await pw.getStorageInfo();
    expect(Number.isFinite(info.percent)).toBe(true);
    expect(info.percent).toBe(0);
  });
});
