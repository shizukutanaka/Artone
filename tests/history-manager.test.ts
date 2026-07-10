/**
 * Tests for undo/history-manager.ts
 *
 * HistoryManager uses IndexedDB for persistence; these tests construct it with
 * autoPersist:false so the pure undo/redo logic runs in jsdom without IDB.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HistoryManager,
  CommandFactory,
  HistoryPanelUI,
  type Command,
  type ClipLike,
} from '../undo/history-manager';

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

  it('REGRESSION: merging after an undo clears the stale redo tail instead of leaving it reachable', () => {
    // Before fix: the merge branch replaced commands[position] in place but
    // never truncated commands beyond it (unlike the normal execute path).
    // A stale "future" command left over from a prior undo() stayed in the
    // array and canRedo() reported true for it -- redo() would then run
    // that stale command's redo() against the state the merge produced,
    // not the state it was actually designed for, corrupting data.
    const hm = makeManager();
    const cell = clipCell({ id: 'c1', trackId: 'track-A', startFrame: 0 });
    const other = { value: 0 };

    const cmd1 = CommandFactory.clipMove('c1', 'track-A', 'track-A', 0, 10, cell.get, cell.set);
    cmd1.timestamp = 1000;
    hm.execute(cmd1); // A: 0 -> 10

    const cmd2 = counterCmd(other); // unrelated command type, does not merge with cmd1
    hm.execute(cmd2);

    hm.undo(); // back to position 0 (cmd2 now sits as a stale "future" entry)

    const cmd3 = CommandFactory.clipMove('c1', 'track-A', 'track-A', 10, 30, cell.get, cell.set);
    cmd3.timestamp = 1100; // within cmd1's 500ms merge window -> merges with cmd1
    hm.execute(cmd3);

    expect(hm.getStats().count).toBe(1); // stale cmd2 must be gone, not just overwritten at index 0
    expect(hm.canRedo()).toBe(false);
    expect(cell.clip.startFrame).toBe(30);
  });
});

// ============================================================
// Branches
// ============================================================

describe('HistoryManager — branches', () => {
  it('REGRESSION: switchBranch() replays a branch\'s own edits when switching back into it', () => {
    // Before fix: HistoryBranch.commands was always [] (nothing ever pushed
    // into it), and even populated it couldn't help since CommandSnapshot
    // has no live redo() function. The "redo the new branch" half of
    // switchBranch() iterated that always-empty array and only bumped
    // `position` per element -- switching back into a branch never actually
    // replayed its edits; the live value stayed at whatever undoing the
    // branch left it at.
    const hm = makeManager();
    const cell = { value: 0 };

    hm.execute(counterCmd(cell, 1)); // main: 0 -> 1

    const branchId = hm.createBranch('feature');
    hm.execute(counterCmd(cell, 10)); // branch: 1 -> 11

    hm.switchBranch('main');
    expect(cell.value).toBe(1); // branch edit correctly undone

    hm.switchBranch(branchId);
    expect(cell.value).toBe(11); // branch edit must be reapplied, not lost
  });

  it('REGRESSION: switchBranch() does not double-undo commands already undone inside the branch', () => {
    // Before fix: switching away from a branch sliced
    // `this.commands.slice(parentPosition + 1)` -- to the END of the array,
    // not to the current position -- and undid every one of those commands.
    // If the user had already called undo() one or more times while still
    // inside the branch, the commands between position+1 and the array end
    // were already undone; switchBranch() undid them a SECOND time,
    // corrupting the live value.
    const hm = makeManager();
    const cell = { value: 0 };

    hm.execute(counterCmd(cell, 1)); // main: 0 -> 1

    hm.createBranch('feature');
    hm.execute(counterCmd(cell, 10)); // branch: 1 -> 11
    hm.execute(counterCmd(cell, 100)); // branch: 11 -> 111

    hm.undo(); // undo the +100 within the branch: 111 -> 11
    expect(cell.value).toBe(11);

    hm.switchBranch('main');
    // Only the still-applied +10 command should be undone here (111 -> 11
    // was already handled by the explicit undo() above). Before the fix,
    // the already-undone +100 command's undo() fired again on top of the
    // +10 command's undo(), landing on a doubly-corrupted value (-99)
    // instead of the correct 1.
    expect(cell.value).toBe(1);
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

  it('PERF: emits exactly one notification regardless of how many steps are jumped', () => {
    const hm = makeManager();
    const cell = { value: 0 };
    // Build a 10-entry history
    for (let i = 0; i < 10; i++) hm.execute(counterCmd(cell));
    expect(cell.value).toBe(10);

    const cb = vi.fn();
    hm.subscribe(cb);

    // Jump 10 positions back — must fire exactly one listener call, not 10
    hm.goToPosition(-1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cell.value).toBe(0);

    cb.mockClear();

    // Jump 10 positions forward — again exactly one call
    hm.goToPosition(9);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cell.value).toBe(10);
  });

  it('no notification when already at target position', () => {
    const hm = makeManager();
    const cell = { value: 0 };
    hm.execute(counterCmd(cell));

    const cb = vi.fn();
    hm.subscribe(cb);
    hm.goToPosition(0); // already there
    expect(cb).not.toHaveBeenCalled();
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
// CommandFactory.effectAdd / keyframeAdd — id collision on undo
// ============================================================

describe('CommandFactory.effectAdd', () => {
  it('REGRESSION: undo removes only the added effect, not every other id-less effect', () => {
    // Before fix: an id-less effect made undo's `e.id !== savedEffect.id`
    // filter match `undefined !== undefined` (false) for EVERY id-less
    // effect on the clip, deleting all of them instead of just the one added.
    const { get, set } = clipCell({ id: 'c1', effects: [{ type: 'blur' }] }); // pre-existing id-less effect
    const cmd = CommandFactory.effectAdd('c1', { type: 'sharpen' }, get, set);

    cmd.execute();
    expect(get().effects).toHaveLength(2);

    cmd.undo();
    expect(get().effects).toHaveLength(1);
    expect(get().effects![0].type).toBe('blur'); // the pre-existing effect survives
  });

  it('redo re-adds exactly the same effect', () => {
    const { get, set } = clipCell({ id: 'c1', effects: [] });
    const cmd = CommandFactory.effectAdd('c1', { type: 'vignette' }, get, set);
    cmd.execute();
    cmd.undo();
    cmd.redo();
    expect(get().effects).toHaveLength(1);
    expect(get().effects![0].type).toBe('vignette');
  });
});

describe('CommandFactory.keyframeAdd', () => {
  it('REGRESSION: undo removes only the added keyframe, not every other id-less keyframe', () => {
    const { get, set } = clipCell({
      id: 'c1',
      keyframes: { opacity: [{ frame: 0, value: 1 }] }, // pre-existing id-less keyframe
    });
    const cmd = CommandFactory.keyframeAdd('c1', 'opacity', { frame: 10, value: 0.5 }, get, set);

    cmd.execute();
    expect((get().keyframes as Record<string, unknown[]>).opacity).toHaveLength(2);

    cmd.undo();
    const remaining = (get().keyframes as Record<string, { frame: number }[]>).opacity;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].frame).toBe(0); // the pre-existing keyframe survives
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

// ============================================================
// HistoryPanelUI — XSS prevention
// ============================================================

describe('HistoryPanelUI — XSS prevention', () => {
  function makeHMWithCmd(description: string): HistoryManager {
    const hm = makeManager();
    const cell = { value: 0 };
    const cmd: Command = {
      ...counterCmd(cell),
      description,
    };
    hm.execute(cmd);
    return hm;
  }

  it('REGRESSION: description with HTML special chars is escaped to prevent XSS', () => {
    const hm = makeHMWithCmd('<script>alert(1)</script>');
    const html = HistoryPanelUI({ history: hm });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('REGRESSION: description with double-quote injection is escaped in HTML context', () => {
    const hm = makeHMWithCmd('"><img src=x onerror=alert(1)>');
    const html = HistoryPanelUI({ history: hm });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;');
  });
});

// ============================================================
// CommandFactory.structural — generic reversible command
// ============================================================

describe('CommandFactory.structural', () => {
  it('execute runs apply, undo runs revert, redo runs apply again', () => {
    const log: string[] = [];
    const cmd = CommandFactory.structural(
      'clip.lift',
      'Lift range',
      () => log.push('apply'),
      () => log.push('revert'),
    );
    cmd.execute();
    cmd.undo();
    cmd.redo();
    expect(log).toEqual(['apply', 'revert', 'apply']);
  });

  it('carries its type and description', () => {
    const cmd = CommandFactory.structural('clip.extract', 'Extract range', () => {}, () => {});
    expect(cmd.type).toBe('clip.extract');
    expect(cmd.description).toBe('Extract range');
  });

  it('is undoable through HistoryManager (state restored)', () => {
    const store = new Map<string, number>([['a', 1]]);
    const h = new HistoryManager({ autoPersist: false });
    const cmd = CommandFactory.structural(
      'clip.lift',
      'Lift',
      () => store.set('a', 2),
      () => store.set('a', 1),
    );
    h.execute(cmd);
    expect(store.get('a')).toBe(2);
    h.undo();
    expect(store.get('a')).toBe(1);
    h.redo();
    expect(store.get('a')).toBe(2);
  });

  it('exposes a default opaque delta keyed by type', () => {
    const cmd = CommandFactory.structural('clip.lift', 'Lift', () => {}, () => {});
    expect(cmd.getDelta().path).toEqual(['clip.lift']);
  });
});
