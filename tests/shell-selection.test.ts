/**
 * Tests for app/shell.tsx — applyClipSelectionEdit (Inspector -> timeline wiring).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { applyClipSelectionEdit, filterImportedFiles, dispatchAppCommand } from '../app/shell';
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
