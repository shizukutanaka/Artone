/**
 * Tests for media/media-browser.ts
 *
 * Query/filter/sort and item operations are synchronous and tested by
 * injecting MediaItems into the private map. The async import path is
 * exercised with mocked DOM media elements + URL object-URL spies.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaBrowser, type MediaItem } from '../media/media-browser';

let idCounter = 0;
function makeItem(over: Partial<MediaItem> = {}): MediaItem {
  idCounter++;
  return {
    id: `item-${idCounter}`,
    name: `clip-${idCounter}`,
    type: 'video',
    file: null,
    url: `blob:${idCounter}`,
    thumbnail: '',
    duration: 10,
    size: 1000,
    created: 0,
    imported: idCounter,
    tags: [],
    rating: 0,
    favorite: false,
    usageCount: 0,
    ...over,
  };
}

function inject(browser: MediaBrowser, item: MediaItem): MediaItem {
  (browser as unknown as { items: Map<string, MediaItem> }).items.set(item.id, item);
  return item;
}

// ============================================================
// getItems — filtering
// ============================================================

describe('MediaBrowser — getItems filtering', () => {
  let browser: MediaBrowser;
  beforeEach(() => { browser = new MediaBrowser(); });

  it('returns all items with no filter', () => {
    inject(browser, makeItem());
    inject(browser, makeItem());
    expect(browser.getItems()).toHaveLength(2);
  });

  it('filters by type', () => {
    inject(browser, makeItem({ type: 'video' }));
    inject(browser, makeItem({ type: 'audio' }));
    inject(browser, makeItem({ type: 'image' }));
    expect(browser.getItems({ type: 'audio' })).toHaveLength(1);
    expect(browser.getItems({ type: 'audio' })[0].type).toBe('audio');
  });

  it('filters by search in name', () => {
    inject(browser, makeItem({ name: 'sunset beach.mp4' }));
    inject(browser, makeItem({ name: 'city night.mp4' }));
    const r = browser.getItems({ search: 'beach' });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('sunset beach.mp4');
  });

  it('search matches tags too', () => {
    inject(browser, makeItem({ name: 'a.mp4', tags: ['nature'] }));
    inject(browser, makeItem({ name: 'b.mp4', tags: ['urban'] }));
    expect(browser.getItems({ search: 'nature' })).toHaveLength(1);
  });

  it('search is case-insensitive', () => {
    inject(browser, makeItem({ name: 'BEACH.mp4' }));
    expect(browser.getItems({ search: 'beach' })).toHaveLength(1);
  });

  it('filters by tags (all must match)', () => {
    inject(browser, makeItem({ tags: ['a', 'b'] }));
    inject(browser, makeItem({ tags: ['a'] }));
    expect(browser.getItems({ tags: ['a', 'b'] })).toHaveLength(1);
    expect(browser.getItems({ tags: ['a'] })).toHaveLength(2);
  });

  it('filters by favorite', () => {
    inject(browser, makeItem({ favorite: true }));
    inject(browser, makeItem({ favorite: false }));
    expect(browser.getItems({ favorite: true })).toHaveLength(1);
    expect(browser.getItems({ favorite: false })).toHaveLength(1);
  });

  it('filters by min/max duration', () => {
    inject(browser, makeItem({ duration: 5 }));
    inject(browser, makeItem({ duration: 15 }));
    inject(browser, makeItem({ duration: 25 }));
    expect(browser.getItems({ minDuration: 10 })).toHaveLength(2);
    expect(browser.getItems({ maxDuration: 20 })).toHaveLength(2);
    expect(browser.getItems({ minDuration: 10, maxDuration: 20 })).toHaveLength(1);
  });

  it('filters by minRating', () => {
    inject(browser, makeItem({ rating: 2 }));
    inject(browser, makeItem({ rating: 4 }));
    expect(browser.getItems({ minRating: 3 })).toHaveLength(1);
  });
});

// ============================================================
// getItems — sorting
// ============================================================

describe('MediaBrowser — getItems sorting', () => {
  let browser: MediaBrowser;
  beforeEach(() => { browser = new MediaBrowser(); });

  it('sorts by name ascending', () => {
    inject(browser, makeItem({ name: 'Charlie' }));
    inject(browser, makeItem({ name: 'Alpha' }));
    inject(browser, makeItem({ name: 'Bravo' }));
    const names = browser.getItems({ sortBy: 'name', sortOrder: 'asc' }).map(i => i.name);
    expect(names).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('REGRESSION: name sort is natural order ("Take 2" before "Take 10")', () => {
    // Lexicographic localeCompare put "Take 10" before "Take 2" because '1' < '2'.
    // Media is routinely named Take 1/2/.../10/100, shot_001, etc.
    inject(browser, makeItem({ name: 'Take 10.mp4' }));
    inject(browser, makeItem({ name: 'Take 2.mp4' }));
    inject(browser, makeItem({ name: 'Take 1.mp4' }));
    inject(browser, makeItem({ name: 'Take 100.mp4' }));
    const names = browser.getItems({ sortBy: 'name', sortOrder: 'asc' }).map(i => i.name);
    expect(names).toEqual(['Take 1.mp4', 'Take 2.mp4', 'Take 10.mp4', 'Take 100.mp4']);
  });

  it('name sort descending reverses natural order', () => {
    inject(browser, makeItem({ name: 'clip2' }));
    inject(browser, makeItem({ name: 'clip10' }));
    inject(browser, makeItem({ name: 'clip1' }));
    const names = browser.getItems({ sortBy: 'name', sortOrder: 'desc' }).map(i => i.name);
    expect(names).toEqual(['clip10', 'clip2', 'clip1']);
  });

  it('sorts by duration descending', () => {
    inject(browser, makeItem({ duration: 5 }));
    inject(browser, makeItem({ duration: 30 }));
    inject(browser, makeItem({ duration: 15 }));
    const durs = browser.getItems({ sortBy: 'duration', sortOrder: 'desc' }).map(i => i.duration);
    expect(durs).toEqual([30, 15, 5]);
  });

  it('sorts by size ascending', () => {
    inject(browser, makeItem({ size: 300 }));
    inject(browser, makeItem({ size: 100 }));
    const sizes = browser.getItems({ sortBy: 'size', sortOrder: 'asc' }).map(i => i.size);
    expect(sizes).toEqual([100, 300]);
  });

  it('sorts by rating descending', () => {
    inject(browser, makeItem({ rating: 1 }));
    inject(browser, makeItem({ rating: 5 }));
    inject(browser, makeItem({ rating: 3 }));
    const ratings = browser.getItems({ sortBy: 'rating', sortOrder: 'desc' }).map(i => i.rating);
    expect(ratings).toEqual([5, 3, 1]);
  });

  it('default sort is date descending', () => {
    const a = inject(browser, makeItem({ imported: 1 }));
    const b = inject(browser, makeItem({ imported: 3 }));
    const c = inject(browser, makeItem({ imported: 2 }));
    const order = browser.getItems({}).map(i => i.id);
    expect(order).toEqual([b.id, c.id, a.id]);
  });
});

// ============================================================
// Item operations
// ============================================================

describe('MediaBrowser — item operations', () => {
  let browser: MediaBrowser;
  beforeEach(() => { browser = new MediaBrowser(); });

  it('getItem returns by id', () => {
    const item = inject(browser, makeItem());
    expect(browser.getItem(item.id)).toBe(item);
    expect(browser.getItem('ghost')).toBeUndefined();
  });

  it('setRating clamps to [0, 5]', () => {
    const item = inject(browser, makeItem());
    browser.setRating(item.id, 9);
    expect(browser.getItem(item.id)!.rating).toBe(5);
    browser.setRating(item.id, -3);
    expect(browser.getItem(item.id)!.rating).toBe(0);
  });

  it('toggleFavorite flips the flag', () => {
    const item = inject(browser, makeItem({ favorite: false }));
    browser.toggleFavorite(item.id);
    expect(browser.getItem(item.id)!.favorite).toBe(true);
    browser.toggleFavorite(item.id);
    expect(browser.getItem(item.id)!.favorite).toBe(false);
  });

  it('addTag appends a unique tag', () => {
    const item = inject(browser, makeItem());
    browser.addTag(item.id, 'cinematic');
    expect(browser.getItem(item.id)!.tags).toEqual(['cinematic']);
  });

  it('addTag does not duplicate existing tags', () => {
    const item = inject(browser, makeItem({ tags: ['x'] }));
    browser.addTag(item.id, 'x');
    expect(browser.getItem(item.id)!.tags).toEqual(['x']);
  });

  it('removeTag removes a tag', () => {
    const item = inject(browser, makeItem({ tags: ['a', 'b'] }));
    browser.removeTag(item.id, 'a');
    expect(browser.getItem(item.id)!.tags).toEqual(['b']);
  });

  it('incrementUsage increments the count', () => {
    const item = inject(browser, makeItem({ usageCount: 2 }));
    browser.incrementUsage(item.id);
    expect(browser.getItem(item.id)!.usageCount).toBe(3);
  });

  it('updateItem ignores unknown id', () => {
    expect(() => browser.updateItem('ghost', { rating: 3 })).not.toThrow();
  });

  it('operations notify listeners', () => {
    const item = inject(browser, makeItem());
    const fn = vi.fn();
    browser.subscribe(fn);
    browser.setRating(item.id, 3);
    expect(fn).toHaveBeenCalled();
  });
});

// ============================================================
// removeItem
// ============================================================

describe('MediaBrowser — removeItem', () => {
  let browser: MediaBrowser;
  beforeEach(() => { browser = new MediaBrowser(); });

  it('removes the item and revokes its object URL', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const item = inject(browser, makeItem({ url: 'blob:abc' }));
    browser.removeItem(item.id);
    expect(browser.getItem(item.id)).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith('blob:abc');
    revoke.mockRestore();
  });

  it('is a no-op for unknown id', () => {
    expect(() => browser.removeItem('ghost')).not.toThrow();
  });

  it('notifies listeners on removal', () => {
    const item = inject(browser, makeItem());
    const fn = vi.fn();
    browser.subscribe(fn);
    browser.removeItem(item.id);
    expect(fn).toHaveBeenCalled();
  });
});

// ============================================================
// Stats & tags
// ============================================================

describe('MediaBrowser — stats and tags', () => {
  let browser: MediaBrowser;
  beforeEach(() => { browser = new MediaBrowser(); });

  it('getStats counts by type and totals', () => {
    inject(browser, makeItem({ type: 'video', size: 100, duration: 10 }));
    inject(browser, makeItem({ type: 'video', size: 200, duration: 20 }));
    inject(browser, makeItem({ type: 'audio', size: 50, duration: 5 }));
    inject(browser, makeItem({ type: 'image', size: 10, duration: 0 }));
    const stats = browser.getStats();
    expect(stats.totalItems).toBe(4);
    expect(stats.videos).toBe(2);
    expect(stats.audios).toBe(1);
    expect(stats.images).toBe(1);
    expect(stats.totalSize).toBe(360);
    expect(stats.totalDuration).toBe(35);
  });

  it('getStats is zeroed for an empty library', () => {
    const stats = browser.getStats();
    expect(stats.totalItems).toBe(0);
    expect(stats.totalSize).toBe(0);
  });

  it('getAllTags returns sorted unique tags', () => {
    inject(browser, makeItem({ tags: ['zebra', 'apple'] }));
    inject(browser, makeItem({ tags: ['apple', 'mango'] }));
    expect(browser.getAllTags()).toEqual(['apple', 'mango', 'zebra']);
  });
});

// ============================================================
// subscribe
// ============================================================

describe('MediaBrowser — subscribe', () => {
  it('unsubscribe stops notifications', () => {
    const browser = new MediaBrowser();
    const item = inject(browser, makeItem());
    const fn = vi.fn();
    const unsub = browser.subscribe(fn);
    unsub();
    browser.setRating(item.id, 1);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================
// Import path
// ============================================================

describe('MediaBrowser — importFiles', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeFile(name: string): File {
    return { name, size: 123, lastModified: 0 } as unknown as File;
  }

  it('skips files with unsupported extensions', async () => {
    const browser = new MediaBrowser();
    const result = await browser.importFiles([fakeFile('notes.txt'), fakeFile('data.bin')]);
    expect(result).toHaveLength(0);
    expect(vi.mocked(URL.createObjectURL)).not.toHaveBeenCalled();
  });

  it('reports error status and REGRESSION: revokes URL when metadata load fails', async () => {
    const browser = new MediaBrowser();
    // Mock a video element that fails to load
    vi.spyOn(document, 'createElement').mockImplementation((() => {
      const el: Record<string, unknown> = { preload: '', muted: false };
      Object.defineProperty(el, 'src', {
        set() { Promise.resolve().then(() => (el.onerror as (() => void) | undefined)?.()); },
        configurable: true,
      });
      return el as unknown as HTMLElement;
    }) as typeof document.createElement);

    const progress: string[] = [];
    const result = await browser.importFiles([fakeFile('clip.mp4')], (p) => progress.push(p.status));

    expect(result).toHaveLength(0);
    expect(progress).toContain('error');
    // The object URL created at import start must be revoked on failure.
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith('blob:fake');
  });

  it('notifies listeners after an import batch', async () => {
    const browser = new MediaBrowser();
    const fn = vi.fn();
    browser.subscribe(fn);
    await browser.importFiles([fakeFile('notes.txt')]);
    expect(fn).toHaveBeenCalled();
  });

  it('REGRESSION: a video that never fires onloadedmetadata/onerror times out instead of hanging the whole batch forever', async () => {
    // Before fix: extractVideoMetadata()'s Promise had no timeout, so a
    // malformed container / blob-timing edge case that never fires either
    // event left the `await` in importFile() pending forever. Since
    // importFiles() processes files sequentially, that one stuck file
    // permanently blocked every subsequent file in the same batch.
    vi.useFakeTimers();
    try {
      vi.spyOn(document, 'createElement').mockImplementation((() => {
        // A video element whose src setter never invokes any handler —
        // simulates the "neither event ever fires" failure mode.
        const el: Record<string, unknown> = { preload: '', muted: false };
        Object.defineProperty(el, 'src', { set() {}, configurable: true });
        return el as unknown as HTMLElement;
      }) as typeof document.createElement);

      const browser = new MediaBrowser();
      const progress: string[] = [];
      const resultPromise = browser.importFiles(
        [fakeFile('clip.mp4'), fakeFile('clip2.mp4')],
        (p) => progress.push(`${p.file}:${p.status}`)
      );

      // Two files are processed sequentially, each with its own 30s timeout
      // that only starts once the previous file's promise settles.
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await resultPromise;

      expect(result).toHaveLength(0);
      expect(progress).toContain('clip.mp4:error');
      // The timeout on file 1 must not block file 2 from being attempted.
      expect(progress.some((p) => p.startsWith('clip2.mp4'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================
// Thumbnail generation — zero-dimension guards
// ============================================================

describe('MediaBrowser — thumbnail zero-dimension guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('REGRESSION: generateImageThumbnail returns empty string for a 0×0 image (no Infinity scale)', async () => {
    const browser = new MediaBrowser();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,FAKE');
    // Image fires onload with zero intrinsic dimensions (broken image).
    vi.stubGlobal('Image', class {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { Promise.resolve().then(() => this.onload?.()); }
    });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return { getContext: () => ({ drawImage: () => {} }), toDataURL } as unknown as HTMLElement;
      }
      return {} as HTMLElement;
    }) as typeof document.createElement);

    const result = await (browser as unknown as {
      generateImageThumbnail(url: string): Promise<string>;
    }).generateImageThumbnail('blob:fake');

    expect(result).toBe('');
    expect(toDataURL).not.toHaveBeenCalled(); // returned before NaN canvas
  });

  it('REGRESSION: generateVideoThumbnail returns empty string for 0×0 dimensions', async () => {
    const browser = new MediaBrowser();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,FAKE');
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'video') {
        const v: Record<string, unknown> = { preload: '', muted: false, duration: 10, currentTime: 0 };
        Object.defineProperty(v, 'src', {
          set() {
            Promise.resolve().then(() => {
              (v.onloadeddata as (() => void) | undefined)?.();
              (v.onseeked as (() => void) | undefined)?.();
            });
          },
          configurable: true,
        });
        return v as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return { getContext: () => ({ drawImage: () => {} }), toDataURL } as unknown as HTMLElement;
      }
      return {} as HTMLElement;
    }) as typeof document.createElement);

    const result = await (browser as unknown as {
      generateVideoThumbnail(url: string, w: number, h: number): Promise<string>;
    }).generateVideoThumbnail('blob:fake', 0, 0);

    expect(result).toBe('');
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
