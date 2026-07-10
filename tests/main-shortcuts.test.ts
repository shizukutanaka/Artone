/**
 * Tests for app/main.ts — ArtoneApp.initialize() keyboard shortcut wiring.
 *
 * The shipping React app boots exclusively through `initialize()` (via
 * engine-context.tsx), never the legacy DOM `init(container)` path. Both
 * construct a real `ShortcutManager` (whose constructor immediately attaches
 * a live `document` keydown listener), but only `init()` used to call
 * `setupKeyboardShortcuts()` to populate its callback map — leaving the
 * listener live but every registered action a no-op in the actual app.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import { ArtoneApp } from '../app/main';

type ShortcutManagerPrivate = { callbacks: Map<string, () => void> };

describe('ArtoneApp.initialize() — keyboard shortcut wiring (headless/React path)', () => {
  it('REGRESSION: initialize() registers shortcut callbacks, not just the constructor listener', async () => {
    const app = new ArtoneApp();
    await app.initialize();
    const callbacks = (app.shortcuts as unknown as ShortcutManagerPrivate).callbacks;
    expect(callbacks.size).toBeGreaterThan(0);
  });

  it('REGRESSION: undo/redo/play/split shortcuts are reachable after initialize()', async () => {
    const app = new ArtoneApp();
    await app.initialize();
    const callbacks = (app.shortcuts as unknown as ShortcutManagerPrivate).callbacks;
    for (const action of ['undo', 'redo', 'play', 'split', 'setInPoint', 'setOutPoint']) {
      expect(callbacks.has(action)).toBe(true);
    }
  });

  it('REGRESSION: a timeline-context shortcut (split) actually fires end-to-end, not just registered', async () => {
    // Before fix: ShortcutManager.activeContext defaults to 'global' and
    // nothing anywhere ever called setContext() -- so a keypress matching
    // a context:'timeline' shortcut (the large majority of non-global
    // shortcuts: split, in/out points, zoom, markers, tools, snap-toggle)
    // never invoked its callback, even though the callback WAS correctly
    // registered (the previous test above only checks registration, not
    // that the shortcut is actually reachable via a real keypress).
    const app = new ArtoneApp();
    await app.initialize();
    const cb = vi.fn();
    app.shortcuts.registerCallback('split', cb);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));

    expect(cb).toHaveBeenCalledOnce();
  });
});
