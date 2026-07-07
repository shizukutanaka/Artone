/**
 * Tests for render/frame-cache.ts
 *
 * VideoFrame is stubbed by the global setup (a class with a close() spy).
 * Cached "frames" here are plain ImageBitmap-like objects with a close()
 * spy so the leak-related assertions can verify close() is called exactly
 * when the cache evicts/replaces a frame.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import { FrameCache } from '../render/frame-cache';

/** A fake ImageBitmap with a close() spy and a width/height. */
function fakeFrame(): ImageBitmap {
  return { width: 16, height: 16, close: vi.fn() } as unknown as ImageBitmap;
}

const SIZE = 1024;

// ============================================================
// get / put basics
// ============================================================

describe('FrameCache — get/put', () => {
  it('returns null on miss and counts the miss', () => {
    const cache = new FrameCache();
    expect(cache.get(5)).toBeNull();
    expect(cache.getStats().misses).toBe(1);
  });

  it('put then get returns the frame (hot hit)', () => {
    const cache = new FrameCache();
    const f = fakeFrame();
    cache.put(10, f, SIZE);
    expect(cache.get(10)).toBe(f);
    expect(cache.getStats().hits).toBe(1);
  });

  it('put adds byteSize to currentBytes', () => {
    const cache = new FrameCache();
    cache.put(1, fakeFrame(), SIZE);
    expect(cache.getStats().bytes).toBe(SIZE);
  });

  it('sink frames are stored in the sink tier, not hot', () => {
    const cache = new FrameCache({ sinkFrames: [0] });
    cache.put(0, fakeFrame(), SIZE);
    const stats = cache.getStats();
    expect(stats.sink).toBe(1);
    expect(stats.hot).toBe(0);
  });

  it('sink frames are not counted in currentBytes', () => {
    const cache = new FrameCache({ sinkFrames: [0] });
    cache.put(0, fakeFrame(), SIZE);
    expect(cache.getStats().bytes).toBe(0);
  });

  it('sink frames are retrievable via get', () => {
    const cache = new FrameCache({ sinkFrames: [0] });
    const f = fakeFrame();
    cache.put(0, f, SIZE);
    expect(cache.get(0)).toBe(f);
  });
});

// ============================================================
// REGRESSION: re-put of an existing index must not leak/double-count
// ============================================================

describe('FrameCache — REGRESSION: re-put releases the stale frame', () => {
  it('closes the old frame when the same hot index is re-put', () => {
    const cache = new FrameCache();
    const oldF = fakeFrame();
    const newF = fakeFrame();
    cache.put(7, oldF, SIZE);
    cache.put(7, newF, SIZE);
    expect((oldF.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(cache.get(7)).toBe(newF);
  });

  it('does not double-count bytes on re-put', () => {
    const cache = new FrameCache();
    cache.put(7, fakeFrame(), SIZE);
    cache.put(7, fakeFrame(), SIZE);
    // Should be SIZE, not 2*SIZE
    expect(cache.getStats().bytes).toBe(SIZE);
  });

  it('re-put with a different byteSize updates bytes correctly', () => {
    const cache = new FrameCache();
    cache.put(7, fakeFrame(), SIZE);
    cache.put(7, fakeFrame(), SIZE * 2);
    expect(cache.getStats().bytes).toBe(SIZE * 2);
  });

  it('closes the old sink frame when re-put', () => {
    const cache = new FrameCache({ sinkFrames: [0] });
    const oldF = fakeFrame();
    const newF = fakeFrame();
    cache.put(0, oldF, SIZE);
    cache.put(0, newF, SIZE);
    expect((oldF.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(cache.get(0)).toBe(newF);
    expect(cache.getStats().sink).toBe(1); // not duplicated
  });

  it('hot index re-put as a warm-resident frame does not leave a duplicate', () => {
    // Force a frame into warm, then re-put the same index.
    const cache = new FrameCache({ maxHotFrames: 1 });
    cache.put(1, fakeFrame(), SIZE);
    cache.put(2, fakeFrame(), SIZE); // evicts 1 → warm
    expect(cache.getStats().warm).toBe(1);
    cache.put(1, fakeFrame(), SIZE); // re-put index 1 (currently in warm)
    // Index 1 must not exist in both hot and warm
    const stats = cache.getStats();
    expect(stats.hot + stats.warm).toBe(2); // index 2 (warm) + index 1 (hot)
  });
});

// ============================================================
// Tier 1 → Tier 2 demotion
// ============================================================

describe('FrameCache — hot→warm demotion', () => {
  it('demotes oldest hot frame to warm when hot is full', () => {
    const cache = new FrameCache({ maxHotFrames: 2 });
    cache.put(1, fakeFrame(), SIZE);
    cache.put(2, fakeFrame(), SIZE);
    cache.put(3, fakeFrame(), SIZE); // hot full → demote oldest (1) to warm
    const stats = cache.getStats();
    expect(stats.hot).toBe(2);
    expect(stats.warm).toBe(1);
  });

  it('demoted frame is NOT closed (still in warm)', () => {
    const cache = new FrameCache({ maxHotFrames: 1 });
    const f = fakeFrame();
    cache.put(1, f, SIZE);
    cache.put(2, fakeFrame(), SIZE); // demote 1 to warm
    expect((f.close as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('get on a warm frame promotes it back to hot', () => {
    const cache = new FrameCache({ maxHotFrames: 1 });
    const f = fakeFrame();
    cache.put(1, f, SIZE);
    cache.put(2, fakeFrame(), SIZE); // 1 → warm
    expect(cache.get(1)).toBe(f);    // promote 1 back to hot
    // After promotion, 1 is hot; 2 was demoted to warm by the promotion eviction
    expect(cache.getStats().hot).toBe(1);
  });
});

// ============================================================
// Tier 2 eviction (close)
// ============================================================

describe('FrameCache — warm eviction closes frames', () => {
  it('closes a frame evicted out of warm', () => {
    const cache = new FrameCache({ maxHotFrames: 1, maxWarmFrames: 1 });
    const f1 = fakeFrame();
    cache.put(1, f1, SIZE);          // hot: 1
    cache.put(2, fakeFrame(), SIZE); // hot:2, warm:1
    cache.put(3, fakeFrame(), SIZE); // hot:3, warm:2 → warm over cap → evict oldest warm (1) closed
    expect((f1.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('evicted warm frame byteSize is subtracted from currentBytes', () => {
    const cache = new FrameCache({ maxHotFrames: 1, maxWarmFrames: 1 });
    cache.put(1, fakeFrame(), SIZE);
    cache.put(2, fakeFrame(), SIZE);
    cache.put(3, fakeFrame(), SIZE); // one frame fully evicted
    // 3 puts, 1 evicted → 2 frames remain counted
    expect(cache.getStats().bytes).toBe(2 * SIZE);
  });
});

// ============================================================
// Byte-cap eviction
// ============================================================

describe('FrameCache — byte cap eviction', () => {
  it('evicts frames to honor maxBytes', () => {
    const cache = new FrameCache({ maxBytes: SIZE * 2, maxHotFrames: 100, maxWarmFrames: 100 });
    cache.put(1, fakeFrame(), SIZE);
    cache.put(2, fakeFrame(), SIZE);
    cache.put(3, fakeFrame(), SIZE); // 3*SIZE > 2*SIZE → evict down
    expect(cache.getStats().bytes).toBeLessThanOrEqual(SIZE * 2);
  });

  it('demotes hot to warm then evicts when warm is empty under byte pressure', () => {
    // All frames in hot, no warm; byte cap forces hot→warm→evict.
    const cache = new FrameCache({ maxBytes: SIZE, maxHotFrames: 100, maxWarmFrames: 100 });
    cache.put(1, fakeFrame(), SIZE);
    cache.put(2, fakeFrame(), SIZE); // 2*SIZE > SIZE → evict one
    expect(cache.getStats().bytes).toBeLessThanOrEqual(SIZE);
  });
});

// ============================================================
// prefetchHint
// ============================================================

describe('FrameCache — prefetchHint', () => {
  it('returns missing frame indices around the center', () => {
    const cache = new FrameCache();
    const hint = cache.prefetchHint(10, 2);
    expect(hint).toEqual([8, 9, 10, 11, 12]);
  });

  it('excludes already-cached frames', () => {
    const cache = new FrameCache();
    cache.put(10, fakeFrame(), SIZE);
    const hint = cache.prefetchHint(10, 1);
    expect(hint).toEqual([9, 11]);
  });

  it('never returns negative indices', () => {
    const cache = new FrameCache();
    const hint = cache.prefetchHint(1, 3);
    expect(hint.every(i => i >= 0)).toBe(true);
    expect(hint).toEqual([0, 1, 2, 3, 4]);
  });

  it('excludes sink and warm frames too', () => {
    const cache = new FrameCache({ sinkFrames: [0], maxHotFrames: 1 });
    cache.put(0, fakeFrame(), SIZE); // sink
    cache.put(5, fakeFrame(), SIZE); // hot
    cache.put(6, fakeFrame(), SIZE); // 5 → warm
    const hint = cache.prefetchHint(3, 3);
    expect(hint).not.toContain(0); // sink
    expect(hint).not.toContain(5); // warm
    expect(hint).not.toContain(6); // hot
  });
});

// ============================================================
// getStats
// ============================================================

describe('FrameCache — getStats', () => {
  it('hitRate is 0 with no accesses', () => {
    expect(new FrameCache().getStats().hitRate).toBe(0);
  });

  it('hitRate reflects hits/(hits+misses)', () => {
    const cache = new FrameCache();
    cache.put(1, fakeFrame(), SIZE);
    cache.get(1); // hit
    cache.get(2); // miss
    expect(cache.getStats().hitRate).toBeCloseTo(0.5);
  });
});

// ============================================================
// clear
// ============================================================

describe('FrameCache — clear', () => {
  it('closes all frames across all tiers', () => {
    const cache = new FrameCache({ sinkFrames: [0], maxHotFrames: 1 });
    const sinkF = fakeFrame();
    const hotF = fakeFrame();
    const warmF = fakeFrame();
    cache.put(0, sinkF, SIZE);  // sink
    cache.put(1, warmF, SIZE);  // hot
    cache.put(2, hotF, SIZE);   // 1 → warm, 2 hot
    cache.clear();
    expect((sinkF.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((warmF.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((hotF.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('resets all tiers and bytes to zero', () => {
    const cache = new FrameCache();
    cache.put(1, fakeFrame(), SIZE);
    cache.clear();
    const stats = cache.getStats();
    expect(stats.hot).toBe(0);
    expect(stats.warm).toBe(0);
    expect(stats.sink).toBe(0);
    expect(stats.bytes).toBe(0);
  });
});

// ============================================================
// Access-order LRU (O(1) findOldest via Map insertion order)
// ============================================================

describe('FrameCache — access-order eviction', () => {
  it('a re-accessed hot frame is NOT the one demoted (access order, not FIFO)', () => {
    // maxHot=2: put 1,2 then access 1 (now MRU), then put 3 → oldest is 2.
    const cache = new FrameCache({ maxHotFrames: 2 });
    cache.put(1, fakeFrame(), SIZE);
    cache.put(2, fakeFrame(), SIZE);

    expect(cache.get(1)).not.toBeNull(); // touch 1 → moves it to MRU end

    cache.put(3, fakeFrame(), SIZE);     // hot over cap → demote LRU == 2
    // 1 and 3 stay hot; 2 was demoted to warm.
    expect(cache.get(1)).not.toBeNull();
    expect(cache.get(3)).not.toBeNull();
    expect(cache.getStats().warm).toBe(1);
  });

  it('evicts strictly in least-recently-used order across many frames', () => {
    // maxHot=3, maxWarm=0 so demotion from hot immediately evicts (closes).
    // sinkFrames: [] so index 0 lives in hot (not the un-evictable sink tier).
    const cache = new FrameCache({ maxHotFrames: 3, maxWarmFrames: 0, sinkFrames: [] });
    const frames = new Map<number, ReturnType<typeof fakeFrame>>();
    for (let i = 0; i < 3; i++) { const f = fakeFrame(); frames.set(i, f); cache.put(i, f, SIZE); }

    // Access order now: 0,1,2 (LRU→MRU). Touch 0 so it becomes MRU: 1,2,0.
    cache.get(0);

    // Insert 3 → evicts LRU == 1. Insert 4 → evicts LRU == 2.
    cache.put(3, fakeFrame(), SIZE);
    cache.put(4, fakeFrame(), SIZE);

    expect((frames.get(1)!.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((frames.get(2)!.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    // 0 was re-accessed → survived; 3,4 are newest.
    expect((frames.get(0)!.close as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('eviction order is independent of how many frames must be scanned (O(1) oldest)', () => {
    // Correctness check that scales: fill far past the cap; the surviving hot set
    // must be exactly the most-recently-put indices.
    const cache = new FrameCache({ maxHotFrames: 5, maxWarmFrames: 0, sinkFrames: [] });
    for (let i = 0; i < 100; i++) cache.put(i, fakeFrame(), SIZE);
    // Only the last 5 puts (95..99) should remain reachable in hot.
    for (let i = 0; i < 95; i++) expect(cache.get(i)).toBeNull();
    for (let i = 95; i < 100; i++) expect(cache.get(i)).not.toBeNull();
  });
});
