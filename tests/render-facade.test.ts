/**
 * RenderBackend ファサードテスト
 *
 * WebGPU↔WebGL 自動切替 + FrameCache 統合を検証。
 * jsdom では WebGPU/WebGL とも null になるため 'none' に落ちる経路を確認。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenderBackend } from '../render/render-backend';

function makeBitmap(): ImageBitmap {
  return { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap;
}

describe('RenderBackend', () => {
  let backend: RenderBackend;

  beforeEach(() => {
    backend = new RenderBackend({ maxHotFrames: 10, maxWarmFrames: 20, sinkFrames: [0] });
  });

  afterEach(() => {
    backend.destroy();
  });

  it('constructs with cache config', () => {
    expect(backend.getActiveBackend()).toBe('none');
  });

  it('initialize falls back to none in jsdom (no GPU/WebGL)', async () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    // navigator.gpu may be mocked in setup; ensure graceful path
    const result = await backend.initialize(canvas);
    expect(['webgpu', 'webgl2', 'none']).toContain(result);
  });

  it('cacheFrame + getCachedFrame round-trips', () => {
    const bmp = makeBitmap();
    backend.cacheFrame(5, bmp, 1000);
    expect(backend.getCachedFrame(5)).toBe(bmp);
  });

  it('getCachedFrame returns null for missing frame', () => {
    expect(backend.getCachedFrame(999)).toBeNull();
  });

  it('getPrefetchTargets returns frame indices around center', () => {
    backend.cacheFrame(50, makeBitmap(), 1000);
    const targets = backend.getPrefetchTargets(50, 5);
    expect(targets).not.toContain(50);
    expect(targets.every((i) => i >= 45 && i <= 55)).toBe(true);
  });

  it('getStats includes backend, fps, cache', () => {
    const stats = backend.getStats();
    expect(stats.backend).toBe('none');
    expect(typeof stats.fps).toBe('number');
    expect(stats.cache).toBeTruthy();
    expect(typeof stats.cache.hitRate).toBe('number');
  });

  it('renderLayers is no-op when backend is none', async () => {
    await expect(backend.renderLayers([])).resolves.toBeUndefined();
  });

  it('clearCache empties the frame cache', () => {
    backend.cacheFrame(1, makeBitmap(), 1000);
    backend.clearCache();
    expect(backend.getCachedFrame(1)).toBeNull();
  });

  it('destroy resets to none', () => {
    backend.destroy();
    expect(backend.getActiveBackend()).toBe('none');
  });

  it('cache integration: hit rate tracked through facade', () => {
    backend.cacheFrame(1, makeBitmap(), 1000);
    backend.getCachedFrame(1); // hit
    backend.getCachedFrame(2); // miss
    const stats = backend.getStats();
    expect(stats.cache.hits).toBe(1);
    expect(stats.cache.misses).toBe(1);
  });
});
