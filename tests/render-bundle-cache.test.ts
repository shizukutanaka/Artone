/**
 * RenderBundleCache テスト
 *
 * Render Bundle の再記録判定ロジックを検証。
 * 同一シグネチャの再利用、変更時の再記録、無効化を確認。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RenderBundleCache, type BatchSignature } from '../render/render-bundle-cache';

const sig = (pipeline: string, count: number, layout = 'quad'): BatchSignature => ({
  pipelineKey: pipeline,
  layerCount: count,
  bufferLayoutKey: layout,
});

describe('RenderBundleCache — signatureKey', () => {
  it('produces deterministic key', () => {
    const a = RenderBundleCache.signatureKey(sig('normal', 3));
    const b = RenderBundleCache.signatureKey(sig('normal', 3));
    expect(a).toBe(b);
  });

  it('different signatures produce different keys', () => {
    const a = RenderBundleCache.signatureKey(sig('normal', 3));
    const b = RenderBundleCache.signatureKey(sig('multiply', 3));
    expect(a).not.toBe(b);
  });
});

describe('RenderBundleCache — needsRerecord', () => {
  let cache: RenderBundleCache;
  beforeEach(() => { cache = new RenderBundleCache(); });

  it('first call always needs recording', () => {
    expect(cache.needsRerecord(sig('normal', 3))).toBe(true);
  });

  it('same signature reuses (no rerecord)', () => {
    cache.needsRerecord(sig('normal', 3)); // first: record
    expect(cache.needsRerecord(sig('normal', 3))).toBe(false); // reuse
    expect(cache.needsRerecord(sig('normal', 3))).toBe(false); // reuse
  });

  it('changed signature triggers rerecord', () => {
    cache.needsRerecord(sig('normal', 3));
    expect(cache.needsRerecord(sig('multiply', 3))).toBe(true); // changed pipeline
  });

  it('changed layer count triggers rerecord', () => {
    cache.needsRerecord(sig('normal', 3));
    expect(cache.needsRerecord(sig('normal', 5))).toBe(true);
  });
});

describe('RenderBundleCache — invalidate', () => {
  it('invalidate forces next rerecord', () => {
    const cache = new RenderBundleCache();
    cache.needsRerecord(sig('normal', 3)); // record
    expect(cache.needsRerecord(sig('normal', 3))).toBe(false); // reuse
    cache.invalidate();
    expect(cache.needsRerecord(sig('normal', 3))).toBe(true); // forced rerecord
  });
});

describe('RenderBundleCache — stats', () => {
  it('tracks reuse rate', () => {
    const cache = new RenderBundleCache();
    cache.needsRerecord(sig('normal', 3)); // record (1 record)
    cache.needsRerecord(sig('normal', 3)); // reuse (1 reuse)
    cache.needsRerecord(sig('normal', 3)); // reuse (2 reuse)
    const stats = cache.getStats();
    expect(stats.recordCount).toBe(1);
    expect(stats.reuseCount).toBe(2);
    expect(stats.reuseRate).toBeCloseTo(2 / 3, 2);
  });

  it('reset clears stats', () => {
    const cache = new RenderBundleCache();
    cache.needsRerecord(sig('normal', 3));
    cache.reset();
    const stats = cache.getStats();
    expect(stats.recordCount).toBe(0);
    expect(stats.reuseCount).toBe(0);
    expect(stats.reuseRate).toBe(0);
  });

  it('high reuse rate for static scene', () => {
    const cache = new RenderBundleCache();
    // 1回記録 + 99回再利用 (静的シーン)
    for (let i = 0; i < 100; i++) cache.needsRerecord(sig('normal', 3));
    const stats = cache.getStats();
    expect(stats.reuseRate).toBeCloseTo(0.99, 2);
  });
});
