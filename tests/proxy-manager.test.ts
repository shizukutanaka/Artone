/**
 * Tests for media/proxy-manager.ts — ProxyManager
 *
 * Covers settings management, dimension calculation (incl. zero-height
 * guard), auto-generate threshold, empty-state queries, subscribe, and
 * async proxy generation via fake timers — including two regressions:
 *   1. calculateProxyDimensions with height=0 must not return Infinity.
 *   2. generateProxy must not create a duplicate job when one is already
 *      queued or processing for the same mediaId.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProxyManager, estimateProxySize, PROXY_FPS } from '../media/proxy-manager';

let mgr: ProxyManager;

beforeEach(() => {
  mgr = new ProxyManager();
});

// ─── estimateProxySize (pure bitrate model) ────────────────────────────────────

describe('estimateProxySize', () => {
  it('returns 0 for any non-positive input (invalid)', () => {
    expect(estimateProxySize(0, 1080, 60, 'medium', 'h264')).toBe(0);
    expect(estimateProxySize(1920, 0, 60, 'medium', 'h264')).toBe(0);
    expect(estimateProxySize(1920, 1080, 0, 'medium', 'h264')).toBe(0);
    expect(estimateProxySize(1920, 1080, -5, 'medium', 'h264')).toBe(0);
  });

  it('follows the bitrate model: size = w*h*fps*bpp*mult*dur/8', () => {
    // 480x270, medium (bpp=0.07), h264 (mult=1.0), 60s
    const expected = Math.round((480 * 270 * PROXY_FPS * 0.07 * 1.0 * 60) / 8);
    expect(estimateProxySize(480, 270, 60, 'medium', 'h264')).toBe(expected);
  });

  it('scales linearly with duration', () => {
    const a = estimateProxySize(960, 540, 30, 'medium', 'h264');
    const b = estimateProxySize(960, 540, 60, 'medium', 'h264');
    expect(b).toBeCloseTo(a * 2, 0);
  });

  it('scales with pixel count (4x area → 4x size)', () => {
    const small = estimateProxySize(480, 270, 60, 'medium', 'h264');
    const big = estimateProxySize(960, 540, 60, 'medium', 'h264'); // 2x each dim = 4x area
    expect(big).toBeCloseTo(small * 4, 0);
  });

  it('higher quality tier yields a larger file', () => {
    const low = estimateProxySize(960, 540, 60, 'low', 'h264');
    const med = estimateProxySize(960, 540, 60, 'medium', 'h264');
    const high = estimateProxySize(960, 540, 60, 'high', 'h264');
    expect(med).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(med);
  });

  it('codec ordering: vp9 < h264 < prores_proxy at equal settings', () => {
    const vp9 = estimateProxySize(960, 540, 60, 'medium', 'vp9');
    const h264 = estimateProxySize(960, 540, 60, 'medium', 'h264');
    const prores = estimateProxySize(960, 540, 60, 'medium', 'prores_proxy');
    expect(vp9).toBeLessThan(h264);
    expect(h264).toBeLessThan(prores);
  });

  it('returns an integer byte count', () => {
    const s = estimateProxySize(1280, 720, 12.5, 'high', 'prores_proxy');
    expect(Number.isInteger(s)).toBe(true);
  });

  it('produces a realistic size (1-min 480x270 medium h264 ≈ 1-3 MB)', () => {
    const bytes = estimateProxySize(480, 270, 60, 'medium', 'h264');
    expect(bytes).toBeGreaterThan(1_000_000);
    expect(bytes).toBeLessThan(3_000_000);
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

describe('settings', () => {
  it('getSettings() returns a copy — mutations do not affect the manager', () => {
    const s = mgr.getSettings();
    s.codec = 'vp9';
    expect(mgr.getSettings().codec).toBe('h264');
  });

  it('updateSettings() merges partial updates and retains others', () => {
    mgr.updateSettings({ codec: 'vp9', quality: 'high' });
    const s = mgr.getSettings();
    expect(s.codec).toBe('vp9');
    expect(s.quality).toBe('high');
    expect(s.resolution).toBe('1/4'); // default retained
  });

  it('setUseProxy() / isUsingProxy() round-trip', () => {
    expect(mgr.isUsingProxy()).toBe(true);
    mgr.setUseProxy(false);
    expect(mgr.isUsingProxy()).toBe(false);
    mgr.setUseProxy(true);
    expect(mgr.isUsingProxy()).toBe(true);
  });

  it('constructor accepts partial settings overrides', () => {
    const m = new ProxyManager({ codec: 'prores_proxy', quality: 'low' });
    expect(m.getSettings().codec).toBe('prores_proxy');
    expect(m.getSettings().quality).toBe('low');
    expect(m.getSettings().autoGenerate).toBe(true); // default retained
  });
});

// ─── calculateProxyDimensions ─────────────────────────────────────────────────

describe('calculateProxyDimensions', () => {
  it('1/2 halves both dimensions', () => {
    expect(mgr.calculateProxyDimensions(1920, 1080, '1/2')).toEqual({ width: 960, height: 540 });
  });

  it('1/4 quarters both dimensions', () => {
    expect(mgr.calculateProxyDimensions(1920, 1080, '1/4')).toEqual({ width: 480, height: 270 });
  });

  it('1/8 eighths both dimensions', () => {
    expect(mgr.calculateProxyDimensions(1920, 1080, '1/8')).toEqual({ width: 240, height: 135 });
  });

  it('480p sets height to 480 and preserves aspect ratio', () => {
    const { width, height } = mgr.calculateProxyDimensions(1920, 1080, '480p');
    expect(height).toBe(480);
    expect(width).toBe(Math.round(480 * (1920 / 1080)));
  });

  it('720p sets height to 720', () => {
    expect(mgr.calculateProxyDimensions(1280, 720, '720p').height).toBe(720);
  });

  it('540p sets height to 540', () => {
    expect(mgr.calculateProxyDimensions(1920, 1080, '540p').height).toBe(540);
  });

  it('REGRESSION: height=0 returns {0,0} instead of Infinity', () => {
    const dims = mgr.calculateProxyDimensions(1920, 0, '480p');
    expect(Number.isFinite(dims.width)).toBe(true);
    expect(Number.isFinite(dims.height)).toBe(true);
    expect(dims).toEqual({ width: 0, height: 0 });
  });

  it('zero width with fractional scale returns {0, 0}', () => {
    expect(mgr.calculateProxyDimensions(0, 1080, '1/4')).toEqual({ width: 0, height: 270 });
  });
});

// ─── shouldAutoGenerate ───────────────────────────────────────────────────────

describe('shouldAutoGenerate', () => {
  it('returns true when width meets the threshold (1920)', () => {
    expect(mgr.shouldAutoGenerate(1920)).toBe(true);
    expect(mgr.shouldAutoGenerate(3840)).toBe(true);
  });

  it('returns false when width is below the threshold', () => {
    expect(mgr.shouldAutoGenerate(1280)).toBe(false);
    expect(mgr.shouldAutoGenerate(0)).toBe(false);
  });

  it('returns false when autoGenerate is disabled regardless of width', () => {
    mgr.updateSettings({ autoGenerate: false });
    expect(mgr.shouldAutoGenerate(3840)).toBe(false);
  });

  it('respects a custom threshold', () => {
    mgr.updateSettings({ autoThreshold: 1280 });
    expect(mgr.shouldAutoGenerate(1280)).toBe(true);
    expect(mgr.shouldAutoGenerate(1279)).toBe(false);
  });
});

// ─── empty-state queries ──────────────────────────────────────────────────────

describe('empty state', () => {
  it('getStorageStats() returns all-zero counters', () => {
    expect(mgr.getStorageStats()).toEqual({
      totalProxies: 0,
      totalSize: 0,
      readyCount: 0,
      pendingCount: 0,
    });
  });

  it('getAllProxies / getAllJobs / getActiveJobs start empty', () => {
    expect(mgr.getAllProxies()).toEqual([]);
    expect(mgr.getAllJobs()).toEqual([]);
    expect(mgr.getActiveJobs()).toEqual([]);
  });

  it('getProxyForMedia returns null for unknown mediaId', () => {
    expect(mgr.getProxyForMedia('no-such-id')).toBeNull();
  });

  it('getProxy returns undefined for unknown proxyId', () => {
    expect(mgr.getProxy('no-such-id')).toBeUndefined();
  });
});

// ─── subscribe ────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('fires on updateSettings and stops after unsubscribe', () => {
    let calls = 0;
    const unsub = mgr.subscribe(() => { calls++; });
    mgr.updateSettings({ quality: 'low' });
    expect(calls).toBe(1);
    unsub();
    mgr.updateSettings({ quality: 'high' });
    expect(calls).toBe(1);
  });

  it('fires on setUseProxy', () => {
    let calls = 0;
    mgr.subscribe(() => { calls++; });
    mgr.setUseProxy(false);
    expect(calls).toBe(1);
  });
});

// ─── async generation (fake timers) ──────────────────────────────────────────

describe('generateProxy', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('creates a ready proxy after processing', async () => {
    const promise = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    const proxy = await promise;
    expect(proxy?.status).toBe('ready');
    expect(proxy?.originalId).toBe('media-1');
  });

  it('job transitions to complete with progress=1', async () => {
    const p = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    await p;
    const jobs = mgr.getAllJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('complete');
    expect(jobs[0].progress).toBe(1);
    expect(jobs[0].endTime).toBeDefined();
  });

  it('returns existing ready proxy without creating a new job', async () => {
    const p1 = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    await p1;
    const jobCountAfterFirst = mgr.getAllJobs().length;

    const p2 = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    const proxy2 = await p2;
    expect(proxy2?.status).toBe('ready');
    expect(mgr.getAllJobs()).toHaveLength(jobCountAfterFirst);
  });

  it('REGRESSION: does not create a duplicate job when one is already queued', async () => {
    const p1 = mgr.generateProxy('media-1', undefined!);
    // Second call before queue drains
    const p2 = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    const mediaJobs = mgr.getAllJobs().filter(j => j.mediaId === 'media-1');
    expect(mediaJobs).toHaveLength(1);
  });

  it('getStorageStats reflects ready proxies', async () => {
    const p = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    await p;
    const stats = mgr.getStorageStats();
    expect(stats.totalProxies).toBe(1);
    expect(stats.readyCount).toBe(1);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.pendingCount).toBe(0);
  });

  it('REGRESSION: ready proxy size is a real estimate, not the old fixed 10MB dummy', async () => {
    // Before: proxy.size was hardcoded to 1024*1024*10. Now it is derived from
    // the (default 1080p/60s) source via the bitrate model. The 1/4-scale 60s
    // medium h264 proxy must NOT equal exactly 10 MB.
    const p = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    const proxy = await p;
    expect(proxy!.size).toBeGreaterThan(0);
    expect(proxy!.size).not.toBe(1024 * 1024 * 10);
  });

  it('REGRESSION: proxy hash is deterministic for the same media+settings (was random UUID)', async () => {
    // First generation
    const p1 = await (async () => {
      const pr = mgr.generateProxy('media-x', undefined!);
      await vi.runAllTimersAsync();
      return pr;
    })();
    const hash1 = p1!.hash;

    // Remove it and regenerate with identical settings → identical hash
    mgr.deleteProxy(p1!.id);
    const p2 = await (async () => {
      const pr = mgr.generateProxy('media-x', undefined!);
      await vi.runAllTimersAsync();
      return pr;
    })();
    expect(p2!.hash).toBe(hash1);
    // Hash is a non-empty hex string, not a UUID with dashes
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  it('multiple different media each get a proxy', async () => {
    const p1 = mgr.generateProxy('media-1', undefined!);
    await vi.runAllTimersAsync();
    await p1;
    const p2 = mgr.generateProxy('media-2', undefined!);
    await vi.runAllTimersAsync();
    await p2;
    expect(mgr.getAllProxies()).toHaveLength(2);
    expect(mgr.getProxyForMedia('media-1')?.status).toBe('ready');
    expect(mgr.getProxyForMedia('media-2')?.status).toBe('ready');
  });
});

// ─── cancelJob ────────────────────────────────────────────────────────────────

describe('cancelJob', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('cancels a queued job and sets status cancelled', async () => {
    // Start two generations so the second stays queued long enough to cancel
    const p1 = mgr.generateProxy('media-1', undefined!);
    const p2 = mgr.generateProxy('media-2', undefined!);

    const job2 = mgr.getAllJobs().find(j => j.mediaId === 'media-2');
    expect(job2).toBeDefined();
    mgr.cancelJob(job2!.id);
    expect(mgr.getJob(job2!.id)?.status).toBe('cancelled');

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    expect(mgr.getJob(job2!.id)?.status).toBe('cancelled');
  });

  it('ignores cancelJob for unknown jobId', () => {
    expect(() => mgr.cancelJob('no-such-job')).not.toThrow();
  });

  it('REGRESSION: cancelling a processing job keeps status cancelled (not overwritten to complete)', async () => {
    // Start one job — it becomes 'processing' immediately.
    const p1 = mgr.generateProxy('media-1', undefined!);

    const job1 = mgr.getAllJobs().find(j => j.mediaId === 'media-1');
    expect(job1).toBeDefined();

    // Cancel while processJob is in-flight (before timers advance).
    mgr.cancelJob(job1!.id);
    expect(mgr.getJob(job1!.id)?.status).toBe('cancelled');

    // Let the fake async job finish — processQueue must not overwrite 'cancelled'.
    await vi.runAllTimersAsync();
    await p1;

    expect(mgr.getJob(job1!.id)?.status).toBe('cancelled');
  });
});

// ─── proxy lifecycle ──────────────────────────────────────────────────────────

describe('proxy lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  async function makeProxy(mediaId: string): Promise<string> {
    const p = mgr.generateProxy(mediaId, undefined!);
    await vi.runAllTimersAsync();
    const proxy = await p;
    return proxy!.id;
  }

  it('deleteProxy removes the proxy and severs the mediaId lookup', async () => {
    const id = await makeProxy('media-1');
    expect(mgr.getAllProxies()).toHaveLength(1);
    mgr.deleteProxy(id);
    expect(mgr.getAllProxies()).toHaveLength(0);
    expect(mgr.getProxyForMedia('media-1')).toBeNull();
  });

  it('clearAllProxies empties the store', async () => {
    await makeProxy('media-1');
    await makeProxy('media-2');
    mgr.clearAllProxies();
    expect(mgr.getAllProxies()).toHaveLength(0);
    expect(mgr.getStorageStats().totalProxies).toBe(0);
  });

  it('relinkProxy updates originalPath', async () => {
    const id = await makeProxy('media-1');
    mgr.relinkProxy(id, '/new/path/video.mp4');
    expect(mgr.getProxy(id)?.originalPath).toBe('/new/path/video.mp4');
  });

  it('markOutdated sets proxy status to outdated', async () => {
    const id = await makeProxy('media-1');
    mgr.markOutdated(id);
    expect(mgr.getProxy(id)?.status).toBe('outdated');
  });

  it('getActiveJobs excludes completed jobs', async () => {
    const p = mgr.generateProxy('media-1', undefined!);
    expect(mgr.getActiveJobs().length).toBeGreaterThan(0);
    await vi.runAllTimersAsync();
    await p;
    expect(mgr.getActiveJobs()).toHaveLength(0);
  });
});
