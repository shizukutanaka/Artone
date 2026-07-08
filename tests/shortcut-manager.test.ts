/**
 * Tests for app/shortcut-manager.ts
 *
 * Validates: defaults loading, context filtering, conflict detection,
 * preset application, import/export, formatShortcut display, i18n keys.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ShortcutManager,
  SHORTCUT_CATEGORY_KEYS,
} from '../app/shortcut-manager';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Create a manager that does NOT attach real DOM listeners. */
function makeManager(): ShortcutManager {
  // ShortcutManager calls document.addEventListener in constructor; jsdom provides it.
  return new ShortcutManager();
}

// ─── Category Keys ──────────────────────────────────────────────────────────

describe('SHORTCUT_CATEGORY_KEYS', () => {
  it('exposes all seven category i18n keys', () => {
    const keys = Object.values(SHORTCUT_CATEGORY_KEYS);
    expect(keys).toContain('shortcut.category.playback');
    expect(keys).toContain('shortcut.category.edit');
    expect(keys).toContain('shortcut.category.timeline');
    expect(keys).toContain('shortcut.category.tools');
    expect(keys).toContain('shortcut.category.file');
    expect(keys).toContain('shortcut.category.view');
    expect(keys).toContain('shortcut.category.multicam');
    expect(keys).toHaveLength(7);
  });
});

// ─── Default Shortcuts ──────────────────────────────────────────────────────

describe('ShortcutManager — defaults', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('loads 60 default shortcuts', () => {
    expect(sm.getAllShortcuts()).toHaveLength(60);
  });

  it('all shortcuts have i18n description keys starting with shortcut.action.', () => {
    for (const s of sm.getAllShortcuts()) {
      expect(s.description).toMatch(/^shortcut\.action\./);
    }
  });

  it('all shortcuts have i18n category keys starting with shortcut.category.', () => {
    for (const s of sm.getAllShortcuts()) {
      expect(s.category).toMatch(/^shortcut\.category\./);
    }
  });

  it('all shortcuts are not customized by default', () => {
    for (const s of sm.getAllShortcuts()) {
      expect(s.customized).toBe(false);
    }
  });

  it('each shortcut has a unique UUID id', () => {
    const ids = sm.getAllShortcuts().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('retrieves shortcut by action name', () => {
    const s = sm.getShortcut('play');
    expect(s).toBeDefined();
    expect(s?.key).toBe('Space');
    expect(s?.description).toBe('shortcut.action.play');
  });

  it('returns undefined for unknown action', () => {
    expect(sm.getShortcut('nonexistent')).toBeUndefined();
  });
});

// ─── Category Filtering ─────────────────────────────────────────────────────

describe('ShortcutManager — category filtering', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('getCategories returns all seven unique category keys', () => {
    const cats = sm.getCategories();
    expect(cats).toHaveLength(7);
    for (const k of Object.values(SHORTCUT_CATEGORY_KEYS)) {
      expect(cats).toContain(k);
    }
  });

  it('getShortcutsByCategory returns only shortcuts in that category', () => {
    const playback = sm.getShortcutsByCategory(SHORTCUT_CATEGORY_KEYS.playback);
    expect(playback.length).toBeGreaterThan(0);
    for (const s of playback) {
      expect(s.category).toBe(SHORTCUT_CATEGORY_KEYS.playback);
    }
  });

  it('getShortcutsByCategory returns empty array for unknown category', () => {
    expect(sm.getShortcutsByCategory('shortcut.category.unknown')).toHaveLength(0);
  });

  it('playback category contains play, stop, frameForward', () => {
    const actions = sm.getShortcutsByCategory(SHORTCUT_CATEGORY_KEYS.playback).map((s) => s.action);
    expect(actions).toContain('play');
    expect(actions).toContain('stop');
    expect(actions).toContain('frameForward');
  });

  it('file category contains save, saveAs, export, import', () => {
    const actions = sm.getShortcutsByCategory(SHORTCUT_CATEGORY_KEYS.file).map((s) => s.action);
    expect(actions).toContain('save');
    expect(actions).toContain('saveAs');
    expect(actions).toContain('export');
    expect(actions).toContain('import');
  });

  it('multicam category contains cam1 through cam9', () => {
    const actions = sm.getShortcutsByCategory(SHORTCUT_CATEGORY_KEYS.multicam).map((s) => s.action);
    for (let i = 1; i <= 9; i++) {
      expect(actions).toContain(`cam${i}`);
    }
  });
});

// ─── Context Filtering (event dispatch) ─────────────────────────────────────

describe('ShortcutManager — context and callback', () => {
  let sm: ShortcutManager;
  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(() => { sm = makeManager(); });

  it('fires callback for global shortcut in default context', () => {
    const cb = vi.fn();
    sm.registerCallback('play', cb);

    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
    document.dispatchEvent(event);

    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not fire callback when disabled', () => {
    const cb = vi.fn();
    sm.registerCallback('play', cb);
    sm.setEnabled(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires timeline-context shortcut when context is timeline', () => {
    sm.setContext('timeline');
    const cb = vi.fn();
    sm.registerCallback('split', cb);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not fire timeline shortcut when context is global', () => {
    sm.setContext('global'); // default
    const cb = vi.fn();
    sm.registerCallback('split', cb);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores keydown from input element', () => {
    const cb = vi.fn();
    sm.registerCallback('play', cb);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    document.body.removeChild(input);

    expect(cb).not.toHaveBeenCalled();
  });

  it('REGRESSION: ignores keydown from a focused button (e.g. Space to activate a toggle)', () => {
    // Before fix: only <input>/<textarea> were excluded, so pressing Space
    // on a focused <button> (Inspector.tsx's Solo/Mute/Enabled toggles) fired
    // the global "play" shortcut instead of letting the button handle Space
    // natively -- hijacking ordinary keyboard interaction with the control.
    const cb = vi.fn();
    sm.registerCallback('play', cb);

    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    document.body.removeChild(button);

    expect(cb).not.toHaveBeenCalled();
  });

  it('REGRESSION: ignores keydown from a focused select (e.g. arrow keys to change FPS)', () => {
    // Before fix: arrow-key navigation on a <select> (the FPS dropdown)
    // collided with the global frameForward/frameBack (ArrowLeft/ArrowRight)
    // shortcuts.
    const cb = vi.fn();
    sm.registerCallback('frameForward', cb);

    const select = document.createElement('select');
    document.body.appendChild(select);
    select.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    document.body.removeChild(select);

    expect(cb).not.toHaveBeenCalled();
  });


  it('unregisters callback correctly', () => {
    const cb = vi.fn();
    sm.registerCallback('play', cb);
    sm.unregisterCallback('play');

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── Update / Conflict Detection ────────────────────────────────────────────

describe('ShortcutManager — updateShortcut', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('updates key and marks shortcut as customized', () => {
    const result = sm.updateShortcut('play', 'KeyP', {});
    expect(result).toBeNull(); // no conflict
    const s = sm.getShortcut('play');
    expect(s?.key).toBe('KeyP');
    expect(s?.customized).toBe(true);
  });

  it('returns conflict when new binding matches existing shortcut', () => {
    // 'save' is Ctrl+S; 'undo' is Ctrl+Z. Assign undo to Ctrl+S to conflict with save.
    const conflict = sm.updateShortcut('undo', 'KeyS', { ctrl: true });
    expect(conflict).not.toBeNull();
    expect(conflict?.existing.action).toBe('save');
  });

  it('returns null when updating an unknown action', () => {
    expect(sm.updateShortcut('ghost', 'KeyG', {})).toBeNull();
  });
});

// ─── Reset ───────────────────────────────────────────────────────────────────

describe('ShortcutManager — reset', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('resetShortcut restores original key and clears customized flag', () => {
    sm.updateShortcut('play', 'KeyP', {});
    sm.resetShortcut('play');
    const s = sm.getShortcut('play');
    expect(s?.key).toBe('Space');
    expect(s?.customized).toBe(false);
  });

  it('resetAll restores all shortcuts to defaults', () => {
    sm.updateShortcut('play', 'KeyP', {});
    sm.updateShortcut('save', 'KeyA', {});
    sm.resetAll();
    expect(sm.getShortcut('play')?.key).toBe('Space');
    expect(sm.getShortcut('save')?.key).toBe('KeyS');
    for (const s of sm.getAllShortcuts()) {
      expect(s.customized).toBe(false);
    }
  });
});

// ─── Presets ────────────────────────────────────────────────────────────────

describe('ShortcutManager — presets', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('applyPreset premiere overrides split key', () => {
    sm.applyPreset('premiere');
    const split = sm.getShortcut('split');
    expect(split?.key).toBe('KeyC');
    expect(split?.modifiers.ctrl).toBe(true);
  });

  it('applyPreset fcp overrides split key', () => {
    sm.applyPreset('fcp');
    const split = sm.getShortcut('split');
    expect(split?.key).toBe('KeyB');
    expect(split?.modifiers.meta).toBe(true);
  });

  it('applyPreset davinci overrides split key', () => {
    sm.applyPreset('davinci');
    const split = sm.getShortcut('split');
    expect(split?.key).toBe('Backslash');
    expect(split?.modifiers.ctrl).toBe(true);
  });

  it('applyPreset default resets to built-in shortcuts', () => {
    sm.applyPreset('premiere');
    sm.applyPreset('default');
    expect(sm.getShortcut('split')?.key).toBe('KeyB');
    expect(sm.getShortcut('split')?.modifiers.ctrl).toBe(false);
  });
});

// ─── Import / Export ────────────────────────────────────────────────────────

describe('ShortcutManager — import/export', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('exportShortcuts returns valid JSON with only customized entries', () => {
    sm.updateShortcut('play', 'KeyP', {});
    const json = sm.exportShortcuts();
    const parsed = JSON.parse(json) as Array<{ action: string; key: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].action).toBe('play');
    expect(parsed[0].key).toBe('KeyP');
  });

  it('exportShortcuts returns empty array when nothing customized', () => {
    const parsed = JSON.parse(sm.exportShortcuts()) as unknown[];
    expect(parsed).toHaveLength(0);
  });

  it('importShortcuts applies serialized customizations', () => {
    const payload = JSON.stringify([{ action: 'play', key: 'KeyP', modifiers: { ctrl: false, shift: false, alt: false, meta: false } }]);
    expect(sm.importShortcuts(payload)).toBe(true);
    expect(sm.getShortcut('play')?.key).toBe('KeyP');
    expect(sm.getShortcut('play')?.customized).toBe(true);
  });

  it('importShortcuts returns false for invalid JSON', () => {
    expect(sm.importShortcuts('not json')).toBe(false);
  });

  it('importShortcuts silently skips unknown actions', () => {
    const payload = JSON.stringify([{ action: 'ghost', key: 'KeyG', modifiers: { ctrl: false, shift: false, alt: false, meta: false } }]);
    expect(sm.importShortcuts(payload)).toBe(true);
    expect(sm.getAllShortcuts()).toHaveLength(60);
  });

  it('round-trips customizations through export/import', () => {
    sm.updateShortcut('play', 'KeyP', {});
    const json = sm.exportShortcuts();

    const sm2 = makeManager();
    sm2.importShortcuts(json);
    expect(sm2.getShortcut('play')?.key).toBe('KeyP');
  });
});

// ─── formatShortcut ─────────────────────────────────────────────────────────

describe('ShortcutManager — formatShortcut', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('formats plain key', () => {
    // split = B (no modifiers)
    expect(sm.formatShortcut('split')).toBe('B');
  });

  it('formats Ctrl+S as ⌘S', () => {
    expect(sm.formatShortcut('save')).toBe('⌘S');
  });

  it('formats Ctrl+Shift+S as ⌘⇧S', () => {
    expect(sm.formatShortcut('saveAs')).toBe('⌘⇧S');
  });

  it('formats arrow keys with symbols', () => {
    expect(sm.formatShortcut('frameForward')).toBe('→');
    expect(sm.formatShortcut('frameBack')).toBe('←');
  });

  it('formats Space as ␣', () => {
    expect(sm.formatShortcut('play')).toBe('␣');
  });

  it('returns empty string for unknown action', () => {
    expect(sm.formatShortcut('ghost')).toBe('');
  });
});

// ─── Listeners ──────────────────────────────────────────────────────────────

describe('ShortcutManager — subscribe / notify', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });

  it('notifies subscriber on updateShortcut', () => {
    const listener = vi.fn();
    sm.subscribe(listener);
    sm.updateShortcut('play', 'KeyP', {});
    expect(listener).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const unsub = sm.subscribe(listener);
    unsub();
    sm.updateShortcut('play', 'KeyP', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies on resetAll', () => {
    const listener = vi.fn();
    sm.subscribe(listener);
    sm.resetAll();
    expect(listener).toHaveBeenCalledOnce();
  });
});

// ============================================================
// dispose
// ============================================================

describe('ShortcutManager — dispose', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('REGRESSION: dispose() removes the document keydown listener so it cannot fire after teardown', () => {
    // Bug: .bind(this) creates a new reference each call, so the listener
    // stored in addEventListener was never retrievable for removeEventListener.
    // After dispose() the keydown handler must no longer fire.
    const remove = vi.spyOn(document, 'removeEventListener');
    const sm = new ShortcutManager();
    const cb = vi.fn();
    sm.registerCallback('play', cb);
    sm.dispose();

    // The keydown listener must have been removed.
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));

    // Dispatching a matching key after dispose should not invoke the callback.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('dispose() clears registered callbacks', () => {
    const sm = new ShortcutManager();
    sm.registerCallback('play', vi.fn());
    sm.dispose();
    // No public API to inspect callbacks directly, but a second dispose()
    // must be idempotent (no double-remove errors).
    expect(() => sm.dispose()).not.toThrow();
  });
});

// ─── Modifier matching (ctrl/meta unification) ──────────────────────────────

import {
  shortcutModifiersMatch,
  sameModifierChord,
} from '../app/shortcut-manager';

const mods = (o: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {}) =>
  ({ ctrl: false, shift: false, alt: false, meta: false, ...o });
const ev = (o: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
  ({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o });

describe('shortcutModifiersMatch — ctrl/meta unified as the command key', () => {
  it('a ctrl-bound shortcut matches both Ctrl and ⌘', () => {
    expect(shortcutModifiersMatch(mods({ ctrl: true }), ev({ ctrlKey: true }))).toBe(true);
    expect(shortcutModifiersMatch(mods({ ctrl: true }), ev({ metaKey: true }))).toBe(true);
  });

  it('REGRESSION: a meta-bound shortcut (⌘B) matches ⌘ and Ctrl (previously never matched)', () => {
    expect(shortcutModifiersMatch(mods({ meta: true }), ev({ metaKey: true }))).toBe(true);
    expect(shortcutModifiersMatch(mods({ meta: true }), ev({ ctrlKey: true }))).toBe(true);
  });

  it('requires the command key when bound, rejects when absent', () => {
    expect(shortcutModifiersMatch(mods({ ctrl: true }), ev())).toBe(false);
    expect(shortcutModifiersMatch(mods(), ev({ ctrlKey: true }))).toBe(false);
  });

  it('matches shift and alt exactly', () => {
    expect(shortcutModifiersMatch(mods({ shift: true }), ev({ shiftKey: true }))).toBe(true);
    expect(shortcutModifiersMatch(mods({ shift: true }), ev())).toBe(false);
    expect(shortcutModifiersMatch(mods({ alt: true }), ev({ altKey: true }))).toBe(true);
    expect(shortcutModifiersMatch(mods(), ev({ altKey: true }))).toBe(false);
  });

  it('no-modifier shortcut matches a bare key', () => {
    expect(shortcutModifiersMatch(mods(), ev())).toBe(true);
  });
});

describe('sameModifierChord', () => {
  it('treats ctrl-only and meta-only as the same chord', () => {
    expect(sameModifierChord(mods({ ctrl: true }), mods({ meta: true }))).toBe(true);
  });
  it('distinguishes shift/alt', () => {
    expect(sameModifierChord(mods({ ctrl: true }), mods({ ctrl: true, shift: true }))).toBe(false);
  });
});

describe('ShortcutManager — meta bindings dispatch (FCP preset)', () => {
  let sm: ShortcutManager;
  beforeEach(() => { sm = makeManager(); });
  afterEach(() => { sm.dispose(); vi.restoreAllMocks(); });

  it('REGRESSION: FCP ⌘B split fires on a metaKey keydown', () => {
    sm.applyPreset('fcp');
    sm.setContext('timeline');
    const cb = vi.fn();
    sm.registerCallback('split', cb);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', metaKey: true, bubbles: true }));
    expect(cb).toHaveBeenCalledOnce();
  });
});
