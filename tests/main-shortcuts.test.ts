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
import type { RecoverySnapshot } from '../recovery/recovery-manager';

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

describe('ArtoneApp.initialize() — init failure / recovery status visibility', () => {
  // REGRESSION: initialize() collected sub-module init failures into an
  // `errors` array and called `this.emit?.('init:partial', { errors })`, but
  // (a) the caller (engine-context.tsx) used to assign `app.emit` only in
  // its onReady callback, which runs strictly after this await resolves --
  // so the emit fired while `this.emit` was still undefined, a silent
  // no-op; and (b) `errors` was an array of `{module, error}` objects, not
  // the `string[]` the (also-fixed) shell.tsx consumer expects. This test
  // exercises main.ts's half of the contract: if a listener is attached
  // before initialize() is awaited (the corrected order), it must receive a
  // readable, string-formatted error list.
  it('REGRESSION: emits a formatted init:partial event when a sub-module fails to init', async () => {
    const app = new ArtoneApp();
    app.project.init = async () => { throw new Error('boom'); };
    const emitSpy = vi.fn();
    app.emit = emitSpy; // assigned BEFORE initialize(), mirroring the fixed engine-context.tsx order

    await app.initialize();

    expect(emitSpy).toHaveBeenCalledWith('init:partial', expect.objectContaining({
      errors: expect.arrayContaining([expect.stringContaining('project: boom')]),
    }));
  });

  it('REGRESSION: a RecoveryManager status change to "error" is surfaced as a recoveryError event', async () => {
    const app = new ArtoneApp();
    await app.initialize();
    const emitSpy = vi.fn();
    app.emit = emitSpy;

    // Force writeSnapshot's JSON.stringify to throw, driving RecoveryManager's
    // internal status to 'error' via the same path a real quota/serialization
    // failure would take.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await app.recovery.saveSnapshot('manual', 'proj1', 'Test', circular as never);

    expect(emitSpy).toHaveBeenCalledWith('recoveryError');
  });
});

describe('ArtoneApp.checkRecovery() — retention-window cutoff', () => {
  // REGRESSION: checkRecovery() used to hardcode a 1-hour cutoff for
  // offering crash recovery, independent of RecoveryManager's actual
  // retention window (config.maxAge, 7 days by default). A snapshot 3 hours
  // old is still very much alive in IndexedDB (enforceLimit() only purges
  // past maxAge) but the old check silently stopped offering it long before
  // it was ever deleted -- valid, restorable data the user could still
  // recover was never surfaced.
  function makeSnapshot(ageMs: number): RecoverySnapshot {
    return {
      id: 'snap1',
      timestamp: Date.now() - ageMs,
      type: 'crash',
      projectId: 'p1',
      projectName: 'P',
      data: {} as RecoverySnapshot['data'],
      checksum: 'x',
    };
  }

  it('REGRESSION: offers recovery for a snapshot older than 1hr but within the 7-day default maxAge', async () => {
    const app = new ArtoneApp();
    vi.spyOn(app.recovery, 'getLatestSnapshot').mockResolvedValue(makeSnapshot(3 * 60 * 60 * 1000));
    const dialogSpy = vi
      .spyOn(app as unknown as { showRecoveryDialog: (t: number) => Promise<boolean> }, 'showRecoveryDialog')
      .mockResolvedValue(false);

    await (app as unknown as { checkRecovery: () => Promise<void> }).checkRecovery();

    expect(dialogSpy).toHaveBeenCalled();
  });

  it('does not offer recovery for a snapshot older than the configured maxAge', async () => {
    const app = new ArtoneApp();
    vi.spyOn(app.recovery, 'getLatestSnapshot').mockResolvedValue(makeSnapshot(app.recovery.getMaxAge() + 1000));
    const dialogSpy = vi
      .spyOn(app as unknown as { showRecoveryDialog: (t: number) => Promise<boolean> }, 'showRecoveryDialog')
      .mockResolvedValue(false);

    await (app as unknown as { checkRecovery: () => Promise<void> }).checkRecovery();

    expect(dialogSpy).not.toHaveBeenCalled();
  });
});
