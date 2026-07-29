/**
 * Tests for app/shell.tsx — applyClipSelectionEdit (Inspector -> timeline wiring).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  applyClipSelectionEdit,
  filterImportedFiles,
  dispatchAppCommand,
  mergeEngineMetadata,
  findEngineMetadata,
  type EngineMediaMetadata,
} from '../app/shell';
import type { MediaItem } from '../app/MediaBrowser';
import type { TimelineClip } from '../app/TimelineView';
import type { Selection } from '../app/Inspector';
import { setupI18n } from '../i18n/i18n-manager';
import en from '../i18n/en.json';

// dispatchAppCommand's init:partial/recoveryError cases call t(), which
// requires setupI18n() to have run; loadLocale() fetches over the network,
// so stub fetch just long enough to seed real translations for this file.
beforeAll(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => en })) as unknown as typeof fetch;
  const mgr = setupI18n({ defaultLocale: 'en', fallbackLocale: 'en', loadPath: '/i18n/{locale}.json' });
  await mgr.init();
  globalThis.fetch = originalFetch;
});

function makeClips(): TimelineClip[] {
  return [
    { id: 'c1', trackId: 'v1', start: 0, duration: 5, name: 'Clip One' },
    { id: 'c2', trackId: 'v1', start: 5, duration: 3, name: 'Clip Two' },
  ];
}

function clipSelection(over: Partial<Selection & { type: 'clip' }> = {}): Selection {
  return {
    type: 'clip',
    id: 'c1',
    name: 'Clip One',
    duration: 5,
    startTime: 0,
    speed: 1,
    opacity: 1,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    ...over,
  };
}

describe('applyClipSelectionEdit', () => {
  it('REGRESSION: propagates a renamed clip back onto the timeline', () => {
    // Before fix: Inspector onChange only updated the local `selection`
    // object; the actual TimelineClip was never touched, so renaming a clip
    // in the Inspector had no visible effect on the timeline.
    const clips = makeClips();
    const next = clipSelection({ name: 'Renamed Clip' });
    const updated = applyClipSelectionEdit(clips, next);
    expect(updated.find((c) => c.id === 'c1')!.name).toBe('Renamed Clip');
  });

  it('propagates startTime and duration edits', () => {
    const clips = makeClips();
    const next = clipSelection({ startTime: 2, duration: 8 });
    const updated = applyClipSelectionEdit(clips, next);
    const c1 = updated.find((c) => c.id === 'c1')!;
    expect(c1.start).toBe(2);
    expect(c1.duration).toBe(8);
  });

  it('leaves other clips untouched', () => {
    const clips = makeClips();
    const next = clipSelection({ name: 'Renamed Clip' });
    const updated = applyClipSelectionEdit(clips, next);
    const c2 = updated.find((c) => c.id === 'c2')!;
    expect(c2).toEqual(clips[1]);
  });

  it('returns the same array reference for a non-clip selection (no-op)', () => {
    const clips = makeClips();
    const updated = applyClipSelectionEdit(clips, { type: 'none' });
    expect(updated).toBe(clips);
  });

  it('is a no-op when the selected id no longer matches any clip', () => {
    const clips = makeClips();
    const next = clipSelection({ id: 'ghost', name: 'Ghost' });
    const updated = applyClipSelectionEdit(clips, next);
    expect(updated).toEqual(clips);
  });
});

describe('filterImportedFiles', () => {
  function makeFile(name: string): File {
    return new File(['x'], name);
  }

  it('REGRESSION: excludes files the engine failed to import', () => {
    // Before fix: handleImport() unconditionally added every file to the
    // Media Browser/timeline regardless of whether the engine import
    // actually succeeded -- a file with e.g. an unsupported codec would
    // show up as a normal, selectable clip with no real backing media.
    const good = makeFile('clip.mp4');
    const bad = makeFile('corrupt.mp4');
    const result = filterImportedFiles([good, bad], new Set([bad]));
    expect(result).toEqual([good]);
  });

  it('returns all files unchanged when none failed', () => {
    const a = makeFile('a.mp4');
    const b = makeFile('b.mp4');
    expect(filterImportedFiles([a, b], new Set())).toEqual([a, b]);
  });

  it('returns an empty array when every file failed', () => {
    const a = makeFile('a.mp4');
    const b = makeFile('b.mp4');
    expect(filterImportedFiles([a, b], new Set([a, b]))).toEqual([]);
  });
});

describe('dispatchAppCommand — togglePanel', () => {
  function callTogglePanel(payload: unknown) {
    const setActivePanel = vi.fn();
    const importFiles = vi.fn();
    const setError = vi.fn();
    dispatchAppCommand('togglePanel', payload, { setActivePanel, importFiles, setError });
    return setActivePanel;
  }

  it('REGRESSION: does not open the right sidebar for "timeline" (F5) or "media" (F6) -- neither has a panel body', () => {
    // Before fix: setActivePanel was called unconditionally for any
    // payload, so pressing F5/F6 opened a titled right-sidebar panel whose
    // body switch has no case for 'timeline'/'media' -- a confusing,
    // completely empty panel (those are always-visible sections of their
    // own: the main TimelineView and the left-side MediaBrowser).
    expect(callTogglePanel('timeline')).not.toHaveBeenCalled();
    expect(callTogglePanel('media')).not.toHaveBeenCalled();
  });

  it('still opens the sidebar for a panel with real body content (e.g. "effects")', () => {
    const setActivePanel = callTogglePanel('effects');
    expect(setActivePanel).toHaveBeenCalledOnce();
    const updater = setActivePanel.mock.calls[0][0] as (prev: string | null) => string | null;
    expect(updater(null)).toBe('effects');
    expect(updater('effects')).toBe(null); // toggling the same panel again closes it
  });
});

describe('dispatchAppCommand — init:partial / recoveryError', () => {
  // REGRESSION: before this fix, ArtoneApp.initialize()'s 'init:partial'
  // event (emitted when e.g. recovery.init() or setupAutoSave() throws) and
  // a RecoveryManager 'error' status transition had no case in this switch
  // -- they silently fell into `default` and the user got zero indication
  // that their session was not being crash-protected.
  function call(name: string, payload: unknown) {
    const setActivePanel = vi.fn();
    const importFiles = vi.fn();
    const setError = vi.fn();
    dispatchAppCommand(name, payload, { setActivePanel, importFiles, setError });
    return setError;
  }

  it('REGRESSION: init:partial surfaces the collected errors via setError', () => {
    const setError = call('init:partial', { errors: ['recovery.init failed: quota exceeded'] });
    expect(setError).toHaveBeenCalledOnce();
    expect(setError.mock.calls[0][0]).toContain('quota exceeded');
  });

  it('init:partial is a no-op when the errors array is empty', () => {
    const setError = call('init:partial', { errors: [] });
    expect(setError).not.toHaveBeenCalled();
  });

  it('REGRESSION: recoveryError surfaces a user-facing message via setError', () => {
    const setError = call('recoveryError', undefined);
    expect(setError).toHaveBeenCalledOnce();
    expect(setError.mock.calls[0][0]).toEqual(expect.any(String));
    expect((setError.mock.calls[0][0] as string).length).toBeGreaterThan(0);
  });
});

// ============================================================
// mergeEngineMetadata / findEngineMetadata
// (engine が生成したサムネイル等を UI へ反映する配線)
// ============================================================

function makeUIItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media_1', name: 'clip.mp4', type: 'video', size: 1234,
    url: 'blob:fake', duration: 30, proxyStatus: 'none', ...over,
  };
}

describe('mergeEngineMetadata', () => {
  it('REGRESSION: applies the engine-generated thumbnail to the UI item', () => {
    // media/media-browser.ts renders a real frame to a data URL on import, but
    // shell.tsx built its UI MediaItem straight from the File and never read it
    // back — so thumbnailUrl was always undefined and MediaBrowser.tsx fell
    // through to the 🎬 emoji forever. The user could never see their footage.
    const merged = mergeEngineMetadata(makeUIItem(), {
      name: 'clip.mp4', size: 1234, thumbnail: 'data:image/jpeg;base64,AAAA',
    });
    expect(merged.thumbnailUrl).toBe('data:image/jpeg;base64,AAAA');
  });

  it('applies engine resolution and measured duration over UI estimates', () => {
    const merged = mergeEngineMetadata(makeUIItem({ duration: 30 }), {
      name: 'clip.mp4', size: 1234, width: 1920, height: 1080, duration: 12.5,
    });
    expect(merged.width).toBe(1920);
    expect(merged.height).toBe(1080);
    // 30 was probeFileDuration's fallback guess; the engine measured 12.5.
    expect(merged.duration).toBe(12.5);
  });

  it('keeps the base item when there is no engine metadata', () => {
    const base = makeUIItem();
    expect(mergeEngineMetadata(base, undefined)).toEqual(base);
  });

  it('does not let an empty/zero engine value clobber a good base value', () => {
    const merged = mergeEngineMetadata(makeUIItem({ duration: 30 }), {
      name: 'clip.mp4', size: 1234, thumbnail: '', duration: 0,
    });
    expect(merged.duration).toBe(30);      // 0 = engine could not measure
    expect(merged.thumbnailUrl).toBeUndefined(); // '' = no thumbnail generated
  });

  it('preserves unrelated fields', () => {
    const merged = mergeEngineMetadata(makeUIItem(), {
      name: 'clip.mp4', size: 1234, thumbnail: 'data:x',
    });
    expect(merged.id).toBe('media_1');
    expect(merged.url).toBe('blob:fake');
    expect(merged.proxyStatus).toBe('none');
  });
});

describe('findEngineMetadata', () => {
  const items: EngineMediaMetadata[] = [
    { name: 'a.mp4', size: 10, thumbnail: 'data:a' },
    { name: 'b.mp4', size: 20, thumbnail: 'data:b' },
  ];
  const asFile = (name: string, size: number) =>
    ({ name, size }) as unknown as File;

  it('matches on name AND size', () => {
    expect(findEngineMetadata(items, asFile('b.mp4', 20))?.thumbnail).toBe('data:b');
  });

  it('returns undefined when the size differs (same name, different file)', () => {
    expect(findEngineMetadata(items, asFile('b.mp4', 99))).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(findEngineMetadata(items, asFile('zzz.mp4', 1))).toBeUndefined();
  });
});
