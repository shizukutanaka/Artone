/**
 * Render backend テスト — FrameCache (3層) + WebGLFallbackRenderer + RenderBackend
 *
 * arXiv/業界知見ベースの新規モジュールを検証:
 * - FrameCache: 3層昇降格, LRU eviction, sink 保持, hit rate
 * - WebGLFallbackRenderer: 初期化, テクスチャ管理
 * - RenderBackend: facade (webgl2 stats, cache, renderLayers)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrameCache } from '../render/frame-cache';

// ImageBitmap のモック (close メソッド付き)
function makeBitmap(): ImageBitmap {
  return { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap;
}

describe('FrameCache — 基本動作', () => {
  let cache: FrameCache;

  beforeEach(() => {
    cache = new FrameCache({ maxHotFrames: 5, maxWarmFrames: 10, sinkFrames: [0], maxBytes: 1_000_000 });
  });

  it('put then get returns frame (hot hit)', () => {
    const bmp = makeBitmap();
    cache.put(1, bmp, 1000);
    expect(cache.get(1)).toBe(bmp);
  });

  it('get miss returns null', () => {
    expect(cache.get(999)).toBeNull();
  });

  it('tracks hit/miss rate', () => {
    const bmp = makeBitmap();
    cache.put(1, bmp, 1000);
    cache.get(1); // hit
    cache.get(2); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });
});

describe('FrameCache — sink (Tier 3)', () => {
  it('sink frame is stored separately and never evicted', () => {
    const cache = new FrameCache({ maxHotFrames: 2, maxWarmFrames: 2, sinkFrames: [0], maxBytes: 1e9 });
    const sinkBmp = makeBitmap();
    cache.put(0, sinkBmp, 1000); // sink frame

    // hot を溢れさせる
    for (let i = 1; i <= 10; i++) cache.put(i, makeBitmap(), 1000);

    // sink は残る
    expect(cache.get(0)).toBe(sinkBmp);
    const stats = cache.getStats();
    expect(stats.sink).toBe(1);
  });
});

describe('FrameCache — eviction (Tier 1 → Tier 2 → 破棄)', () => {
  it('overflow demotes hot to warm', () => {
    const cache = new FrameCache({ maxHotFrames: 3, maxWarmFrames: 10, sinkFrames: [], maxBytes: 1e9 });
    for (let i = 1; i <= 5; i++) cache.put(i, makeBitmap(), 1000);
    const stats = cache.getStats();
    expect(stats.hot).toBeLessThanOrEqual(3);
    expect(stats.warm).toBeGreaterThan(0);
  });

  it('warm overflow releases frames (close called)', () => {
    const cache = new FrameCache({ maxHotFrames: 2, maxWarmFrames: 2, sinkFrames: [], maxBytes: 1e9 });
    const bitmaps = Array.from({ length: 10 }, makeBitmap);
    bitmaps.forEach((b, i) => cache.put(i + 1, b, 1000));
    // 最古のものは close されているはず
    const closedCount = bitmaps.filter((b) => (b.close as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0).length;
    expect(closedCount).toBeGreaterThan(0);
  });

  it('byte limit triggers eviction', () => {
    const cache = new FrameCache({ maxHotFrames: 100, maxWarmFrames: 100, sinkFrames: [], maxBytes: 5000 });
    for (let i = 1; i <= 10; i++) cache.put(i, makeBitmap(), 1000);
    const stats = cache.getStats();
    expect(stats.bytes).toBeLessThanOrEqual(5000 + 1000); // 多少の余裕
  });
});

describe('FrameCache — warm → hot 昇格', () => {
  it('accessing warm frame promotes it to hot', () => {
    const cache = new FrameCache({ maxHotFrames: 2, maxWarmFrames: 10, sinkFrames: [], maxBytes: 1e9 });
    const target = makeBitmap();
    cache.put(1, target, 1000);
    // hot を溢れさせて 1 を warm に降格
    cache.put(2, makeBitmap(), 1000);
    cache.put(3, makeBitmap(), 1000);
    // 1 にアクセス → hot に昇格
    expect(cache.get(1)).toBe(target);
  });
});

describe('FrameCache — prefetchHint', () => {
  it('returns missing frames around center', () => {
    const cache = new FrameCache({ maxHotFrames: 100, maxWarmFrames: 100, sinkFrames: [], maxBytes: 1e9 });
    cache.put(50, makeBitmap(), 1000);
    const needed = cache.prefetchHint(50, 5);
    // 50 はキャッシュ済みなので除外、45-55 の残りが返る
    expect(needed).not.toContain(50);
    expect(needed).toContain(48);
    expect(needed.every((i) => i >= 45 && i <= 55)).toBe(true);
  });

  it('does not return negative frame indices', () => {
    const cache = new FrameCache({ maxHotFrames: 100, maxWarmFrames: 100, sinkFrames: [], maxBytes: 1e9 });
    const needed = cache.prefetchHint(2, 5);
    expect(needed.every((i) => i >= 0)).toBe(true);
  });
});

describe('FrameCache — clear', () => {
  it('clear empties all tiers and releases frames', () => {
    const cache = new FrameCache({ maxHotFrames: 10, maxWarmFrames: 10, sinkFrames: [0], maxBytes: 1e9 });
    const bmps = [makeBitmap(), makeBitmap(), makeBitmap()];
    cache.put(0, bmps[0], 1000); // sink
    cache.put(1, bmps[1], 1000);
    cache.put(2, bmps[2], 1000);
    cache.clear();
    const stats = cache.getStats();
    expect(stats.hot).toBe(0);
    expect(stats.warm).toBe(0);
    expect(stats.sink).toBe(0);
    expect(stats.bytes).toBe(0);
    // 全フレーム close される
    bmps.forEach((b) => expect(b.close).toHaveBeenCalled());
  });
});

// ============================================================
// WebGLFallbackRenderer (jsdom では WebGL コンテキストが null になるため
// グレースフルな失敗を検証)
// ============================================================

import { WebGLFallbackRenderer } from '../render/webgl-fallback';

describe('WebGLFallbackRenderer', () => {
  it('constructs without throwing', () => {
    expect(() => new WebGLFallbackRenderer()).not.toThrow();
  });

  it('initialize returns false when WebGL unavailable (jsdom)', () => {
    const renderer = new WebGLFallbackRenderer();
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(renderer.initialize(canvas)).toBe(false);
  });

  it('getStats returns webgl2 backend identifier', () => {
    const renderer = new WebGLFallbackRenderer();
    const stats = renderer.getStats();
    expect(stats.backend).toBe('webgl2');
    expect(typeof stats.fps).toBe('number');
  });

  it('destroy does not throw when uninitialized', () => {
    const renderer = new WebGLFallbackRenderer();
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('clearCache does not throw when uninitialized', () => {
    const renderer = new WebGLFallbackRenderer();
    expect(() => renderer.clearCache()).not.toThrow();
  });
});

// ============================================================
// RenderBackend — facade (WebGPU → WebGL2 フォールバック)
// ============================================================

import { RenderBackend, type ActiveBackend } from '../render/render-backend';

type RBPrivate = {
  webgl: WebGLFallbackRenderer | null;
  webgpu: null;
  active: ActiveBackend;
};

describe('RenderBackend — construction', () => {
  it('constructs without throwing', () => {
    expect(() => new RenderBackend()).not.toThrow();
  });

  it('initial backend is none', () => {
    const rb = new RenderBackend();
    expect(rb.getActiveBackend()).toBe('none');
  });
});

describe('RenderBackend — getStats (none backend)', () => {
  it('fps and frameTime are 0 when no renderer is active', () => {
    const rb = new RenderBackend();
    const stats = rb.getStats();
    expect(stats.backend).toBe('none');
    expect(stats.fps).toBe(0);
    expect(stats.frameTime).toBe(0);
    expect(stats.cache).toBeDefined();
  });
});

describe('RenderBackend — getStats (webgl2 branch)', () => {
  it('delegates to WebGLFallbackRenderer.getStats() when active=webgl2', () => {
    const rb = new RenderBackend();
    const priv = rb as unknown as RBPrivate;
    const renderer = new WebGLFallbackRenderer();
    priv.webgl = renderer;
    priv.active = 'webgl2';

    const stats = rb.getStats();
    expect(stats.backend).toBe('webgl2');
    expect(typeof stats.fps).toBe('number');
    expect(typeof stats.frameTime).toBe('number');
  });
});

describe('RenderBackend — frame cache', () => {
  let rb: RenderBackend;
  beforeEach(() => { rb = new RenderBackend(); });

  it('getCachedFrame returns null for uncached frame', () => {
    expect(rb.getCachedFrame(99)).toBeNull();
  });

  it('cacheFrame / getCachedFrame round-trip', () => {
    const bmp = makeBitmap();
    rb.cacheFrame(7, bmp, 512);
    expect(rb.getCachedFrame(7)).toBe(bmp);
  });

  it('getPrefetchTargets returns non-negative frame indices', () => {
    const targets = rb.getPrefetchTargets(10, 5);
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.every((t) => t >= 0)).toBe(true);
  });

  it('clearCache empties the frame cache', () => {
    const bmp = makeBitmap();
    rb.cacheFrame(3, bmp, 512);
    rb.clearCache();
    expect(rb.getCachedFrame(3)).toBeNull();
  });
});

describe('RenderBackend — clearCache calls webgl.clearCache()', () => {
  it('calls webgl.clearCache() when webgl renderer is set', () => {
    const rb = new RenderBackend();
    const priv = rb as unknown as RBPrivate;
    const renderer = new WebGLFallbackRenderer();
    const spy = vi.spyOn(renderer, 'clearCache');
    priv.webgl = renderer;
    rb.clearCache();
    expect(spy).toHaveBeenCalled();
  });
});

describe('RenderBackend — renderLayers', () => {
  it('resolves without error in none mode', async () => {
    const rb = new RenderBackend();
    await expect(rb.renderLayers([])).resolves.toBeUndefined();
  });

  it('calls webgl.renderFrame() when active=webgl2', async () => {
    const rb = new RenderBackend();
    const priv = rb as unknown as RBPrivate;
    const renderer = new WebGLFallbackRenderer();
    const spy = vi.spyOn(renderer, 'renderFrame').mockImplementation(() => {});
    priv.webgl = renderer;
    priv.active = 'webgl2';
    await rb.renderLayers([]);
    expect(spy).toHaveBeenCalled();
  });
});

describe('RenderBackend — bundleCache', () => {
  it('getBundleStats returns an object', () => {
    const rb = new RenderBackend();
    expect(rb.getBundleStats()).toBeDefined();
  });

  it('invalidateBundles does not throw', () => {
    const rb = new RenderBackend();
    expect(() => rb.invalidateBundles()).not.toThrow();
  });
});

describe('RenderBackend — destroy', () => {
  it('resets active to none', () => {
    const rb = new RenderBackend();
    const priv = rb as unknown as RBPrivate;
    priv.active = 'webgl2';
    rb.destroy();
    expect(rb.getActiveBackend()).toBe('none');
  });

  it('calls webgl.destroy() when webgl renderer is set', () => {
    const rb = new RenderBackend();
    const priv = rb as unknown as RBPrivate;
    const renderer = new WebGLFallbackRenderer();
    const spy = vi.spyOn(renderer, 'destroy');
    priv.webgl = renderer;
    rb.destroy();
    expect(spy).toHaveBeenCalled();
  });
});
