/**
 * Tests for undo/history-manager.ts
 *
 * HistoryManager uses IndexedDB for persistence; we mock indexedDB globally
 * so pure-logic tests can run in jsdom without a real IDB implementation.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HistoryManager,
  CommandFactory,
  type Command,
  type ClipLike,
} from '../undo/history-manager';

// ============================================================
// Minimal IndexedDB stub
// ============================================================

function makeIDBStub() {
  const store: Map<string, unknown> = new Map();
  const makeRequest = <T>(result: T) => {
    const req = {
      result,
      error: null as DOMException | null,
      onsuccess: null as ((e: Event) => void) | null,
      onerror: null as ((e: Event) => void) | null,
    };
    // Fire asynchronously so tests that await runAllTimersAsync() can catch it.
    setTimeout(() => req.onsuccess?.({} as Event), 0);
    return req;
  };

  const objectStore = {
    put: (record: { id: string; state: unknown }) => {
      store.set(record.id, record.state);
      return makeRequest(undefined);
    },
    get: (key: string) => makeRequest(store.has(key) ? { state: store.get(key) } : undefined),
    delete: (key: string) => { store.delete(key); return makeRequest(undefined); },
  };

  const tx = { objectStore: () => objectStore };
  const db = {
    transaction: () => tx,
    createObjectStore: () => objectStore,
    objectStoreNames: { contains: () => false },
  };

  const openReq = {
    result: db,
    error: null as DOMException | null,
    onsuccess: null as ((e: Event) => void) | null,
    onerror: null as ((e: Event) => void) | null,
    onupgradeneeded: null as ((e: IDBVersionChangeEvent) => void) | null,
  };

  setTimeout(() => {
    openReq.onupgradeneeded?.({ target: { result: db } } as unknown as IDBVersionChangeEvent);
    openReq.onsuccess?.({} as Event);
  }, 0);

  return { open: () => openReq };
}

// ============================================================
// Helpers
// ============================================================

function makeManager(opts?: { maxCommands?: number; autoPersist?: boolean }): HistoryManager {
  return new HistoryManager({ autoPersist: false, ...opts });
}

/** Returns a simple counter command that increments/decrements a shared cell. */
function counterCmd(cell: { value: number }, delta = 1): Command {
  return {
    id: `counter_${Math.random()}`,
    type: 'test.counter',
    timestamp: Date.now(),
    description: `+${delta}`,
    execute() { cell.value += delta; },
    undo()    { cell.value -= delta; },
    redo()    { cell.value += delta; },
    getDelta() { return { before: cell.value - delta, after: cell.value, path: ['cell'] }; },
  };
}

/** Returns a ClipLike + getter/setter pair that share a mutable ref. */
function clipCell(initial: ClipLike): { clip: ClipLike; get: () => ClipLike; set: (c: ClipLike) => void } {
  let clip = { ...initial };
  return {
    get clip() { return clip; },
    get: () => clip,
    set: (c: ClipLike) => { clip = c; },
  };
}

// ============================================================
// Basic undo / redo
// ============================================================

describe('HistoryManager — basic undo/redo', () => {
  let hm: HistoryManager;
  let cell: { value: number };

  beforeEach(() => {
    hm = makeManager();
    cell = { value: 0 };
  });

  it('executes a command immediately', () => {
    hm.execute(counterCmd(cell));
    expect(cell.value).toBe(1);
  });

  it('canUndo is true after an execute', () => {
    hm.execute(counterCmd(cell));
    expect(hm.canUndo()).toBe(true);
  });

  it('canRedo is false initially and after an execute', () => {
    expect(hm.canRedo()).toBe(false);
    hm.execute(counterCmd(cell));
    expect(hm.canRedo()).toBe(false);
  });

  it('undo reverses the last command', () => {
    hm.execute(counterCmd(cell));
    hm.undo();
    expect(cell.value).toBe(0);
    expect(hm.canUndo()).toBe(false);
  });

  it('undo returns false when nothing to undo', () => {
    expect(hm.undo()).toBe(false);
  });

  it('redo re-applies an undone command', () => {
    hm.execute(counterCmd(cell));
    hm.undo();
    hm.redo();
    expect(cell.value).toBe(1);
    expect(hm.canRedo()).toBe(false);
  });

  it('redo returns false when nothing to redo', () => {
    expect(hm.redo()).toBe(false);
  });

  it('new execute clears the redo stack', () => {
    hm.execute(counterCmd(cell));
    hm.undo();
    hm.execute(counterCmd(cell, 5));
    expect(hm.canRedo()).toBe(false);
    expect(cell.value).toBe(5);
  });

  it('multiple undo/redo cycles', () => {
    hm.execute(counterCmd(cell));   // value = 1
    hm.execute(counterCmd(cell));   // value = 2
    hm.execute(counterCmd(cell));   // value = 3
    hm.undo();                       // value = 2
    hm.undo();                       // value = 1
    expect(cell.value).toBe(1);
    hm.redo();                       // value = 2
    expect(cell.value).toBe(2);
  });
});

// ============================================================
// maxCommands limit
// ============================================================

describe('HistoryManager — maxCommands', () => {
  it('trims oldest commands when limit is exceeded', () => {
    const hm = makeManager({ maxCommands: 3 });
    const cell = { value: 0 };

    for (let i = 0; i < 5; i++) hm.execute(counterCmd(cell));
    // After 5 executes with limit 3, only the last 3 should remain.
    expect(hm.getStats().count).toBe(3);
    expect(hm.getPosition()).toBe(2);
  });

  it('position stays non-negative after trim', () => {
    const hm = makeManager({ maxCommands: 2 });
    const cell = { value: 0 };
    for (let i = 0; i < 4; i++) hm.execute(counterCmd(cell));
    expect(hm.getPosition()).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Command merging
// ============================================================

describe('HistoryManager — command merging', () => {
  it('merges two clip.move commands within the merge window', () => {
    const hm = makeManager();
    const cell = clipCell({ id: 'c1', trackId: 'track-A', startFrame: 0 });

    const cmd1 = CommandFactory.clipMove('c1', 'track-A', 'track-A', 0, 10, cell.get, cell.set);
    cmd1.timestamp = 1000;
    const cmd2 = CommandFactory.clipMove('c1', 'track-A', 'track-A', 10, 20, cell.get, cell.set);
    cmd2.timestamp = 1100; // within 500 ms window

    hm.execute(cmd1); // A→10
    hm.execute(cmd2); // should merge → A→20

    // Only one history entry
    expect(hm.getStats().count).toBe(1);
    expect(cell.clip.startFrame).toBe(20);

    hm.undo();
    expect(cell.clip.startFrame).toBe(0); // undoes back to original
  });

  it('does not merge clip.move commands outside the merge window', () => {
    const hm = makeManager();
    const cell = clipCell({ id: 'c1', trackId: 'track-A', startFrame: 0 });

    const cmd1 = CommandFactory.clipMove('c1', 'track-A', 'track-A', 0, 10, cell.get, cell.set);
    cmd1.timestamp = 1000;
    const cmd2 = CommandFactory.clipMove('c1', 'track-A', 'track-A', 10, 20, cell.get, cell.set);
    cmd2.timestamp = 2000; // > 500 ms window

    hm.execute(cmd1);
    hm.execute(cmd2);

    expect(hm.getStats().count).toBe(2);
  });
});

// ============================================================
// Group operations
// ============================================================

describe('HistoryManager — group operations', () => {
  let hm: HistoryManager;
  let cell: { value: number };

  beforeEach(() => {
    hm = makeManager();
    cell = { value: 0 };
  });

  it('groups commands into a single undo step', () => {
    hm.beginGroup('atomic');
    hm.execute(counterCmd(cell, 1)); // value = 1
    hm.execute(counterCmd(cell, 2)); // value = 3
    hm.endGroup('two ops');

    expect(cell.value).toBe(3);
    expect(hm.getStats().count).toBe(1); // single composite entry

    hm.undo();
    expect(cell.value).toBe(0); // both reversed together
    expect(hm.canUndo()).toBe(false);
  });

  it('empty group is ignored (no history entry)', () => {
    hm.beginGroup();
    hm.endGroup();
    expect(hm.getStats().count).toBe(0);
    expect(hm.canUndo()).toBe(false);
  });

  it('group redo re-applies all sub-commands', () => {
    hm.beginGroup();
    hm.execute(counterCmd(cell, 3));
    hm.execute(counterCmd(cell, 4));
    hm.endGroup('g');

    hm.undo();
    expect(cell.value).toBe(0);
    hm.redo();
    expect(cell.value).toBe(7);
  });

  it('REGRESSION: nested beginGroup/endGroup treats inner composite as part of outer group', () => {
    // Bug: endGroup pushed the inner composite directly into this.commands even
    // when an outer group was still active in groupStack.  After the fix the
    // inner composite becomes a sub-command of the outer group, yielding one
    // history entry that undoes everything in one step.
    hm.beginGroup('outer');
      hm.execute(counterCmd(cell, 1)); // value = 1
      hm.beginGroup('inner');
        hm.execute(counterCmd(cell, 2)); // value = 3
        hm.execute(counterCmd(cell, 3)); // value = 6
      hm.endGroup('inner');              // inner composite → into outer group
      hm.execute(counterCmd(cell, 4)); // value = 10
    hm.endGroup('outer');

    expect(cell.value).toBe(10);
    // Everything is a single outer composite — one history entry.
    expect(hm.getStats().count).toBe(1);

    hm.undo();
    expect(cell.value).toBe(0);
    expect(hm.canUndo()).toBe(false);
  });
});

// ============================================================
// goToPosition
// ============================================================

describe('HistoryManager — goToPosition', () => {
  it('jumps back to an earlier position', () => {
    const hm = makeManager();
    const cell = { value: 0 };
    hm.execute(counterCmd(cell)); // pos 0, value=1
    hm.execute(counterCmd(cell)); // pos 1, value=2
    hm.execute(counterCmd(cell)); // pos 2, value=3

    hm.goToPosition(0);
    expect(cell.value).toBe(1);
    expect(hm.getPosition()).toBe(0);
  });

  it('jumps forward to a later position', () => {
    const hm = makeManager();
    const cell = { value: 0 };
    hm.execute(counterCmd(cell));
    hm.execute(counterCmd(cell));
    hm.undo();
    hm.undo();

    hm.goToPosition(1);
    expect(cell.value).toBe(2);
  });

  it('ignores out-of-range positions', () => {
    const hm = makeManager();
    const cell = { value: 0 };
    hm.execute(counterCmd(cell));

    const before = cell.value;
    hm.goToPosition(99);
    expect(cell.value).toBe(before);
  });
});

// ============================================================
// Listeners
// ============================================================

describe('HistoryManager — listeners', () => {
  it('notifies subscriber after each execute', () => {
    const hm = makeManager();
    const cb = vi.fn();
    hm.subscribe(cb);
    hm.execute(counterCmd({ value: 0 }));
    expect(cb).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops notifications', () => {
    const hm = makeManager();
    const cb = vi.fn();
    const unsub = hm.subscribe(cb);
    unsub();
    hm.execute(counterCmd({ value: 0 }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('notifies subscriber after undo and redo', () => {
    const hm = makeManager();
    const cb = vi.fn();
    hm.execute(counterCmd({ value: 0 }));
    hm.subscribe(cb);
    hm.undo();
    hm.redo();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// clear
// ============================================================

describe('HistoryManager — clear', () => {
  it('resets position and command list', () => {
    const hm = makeManager();
    const cell = { value: 0 };
    hm.execute(counterCmd(cell));
    hm.execute(counterCmd(cell));
    hm.clear();

    expect(hm.getStats().count).toBe(0);
    expect(hm.getPosition()).toBe(-1);
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(false);
  });
});

// ============================================================
// CommandFactory — clipMove
// ============================================================

describe('CommandFactory.clipMove', () => {
  it('execute moves the clip', () => {
    const cell = clipCell({ id: 'c1', trackId: 'A', startFrame: 0 });
    const cmd = CommandFactory.clipMove('c1', 'A', 'B', 0, 10, cell.get, cell.set);
    cmd.execute();
    expect(cell.clip.trackId).toBe('B');
    expect(cell.clip.startFrame).toBe(10);
  });

  it('undo restores original position', () => {
    const cell = clipCell({ id: 'c1', trackId: 'A', startFrame: 0 });
    const cmd = CommandFactory.clipMove('c1', 'A', 'B', 0, 10, cell.get, cell.set);
    cmd.execute();
    cmd.undo();
    expect(cell.clip.trackId).toBe('A');
    expect(cell.clip.startFrame).toBe(0);
  });
});

// ============================================================
// CommandFactory — clipDelete / clipAdd
// ============================================================

describe('CommandFactory.clipDelete', () => {
  it('execute removes the clip; undo restores it', () => {
    const clips: ClipLike[] = [{ id: 'c1' }];
    const cmd = CommandFactory.clipDelete(
      clips[0],
      (c) => clips.push(c),
      (id) => { const i = clips.findIndex(c => c.id === id); if (i !== -1) clips.splice(i, 1); }
    );

    cmd.execute();
    expect(clips).toHaveLength(0);

    cmd.undo();
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe('c1');
  });
});

// ============================================================
// CommandFactory — composite
// ============================================================

describe('CommandFactory.composite', () => {
  it('undo reverses sub-commands in reverse order', () => {
    const log: string[] = [];
    const makeCmd = (label: string): Command => ({
      id: label,
      type: 'test',
      timestamp: 0,
      description: label,
      execute() { log.push(`exec:${label}`); },
      undo()    { log.push(`undo:${label}`); },
      redo()    { log.push(`redo:${label}`); },
      getDelta() { return { before: null, after: null, path: [] }; },
    });

    const composite = CommandFactory.composite(makeCmd('A'), makeCmd('B'), makeCmd('C'));
    composite.execute();
    composite.undo();

    expect(log).toEqual(['exec:A', 'exec:B', 'exec:C', 'undo:C', 'undo:B', 'undo:A']);
  });
});
