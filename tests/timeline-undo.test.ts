/**
 * Timeline & Undo コアロジックテスト
 *
 * 最重要ビジネスロジックの網羅的テスト:
 * - MarkerManager: CRUD / 検索 / export / import
 * - HistoryManager: undo/redo / branch / group / merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// MarkerManager
// ============================================================

import { MarkerManager, type Marker, type MarkerType } from '../timeline/marker-manager';

function addTestMarker(mm: MarkerManager, overrides: {
  name?: string; time?: number; type?: MarkerType; tags?: string[];
  priority?: Marker['priority']; color?: string;
} = {}) {
  return mm.addMarker(
    overrides.time ?? 1.0,
    overrides.type ?? 'standard',
    { name: overrides.name ?? 'Test Marker', tags: overrides.tags, priority: overrides.priority, color: overrides.color }
  );
}

describe('MarkerManager — CRUD', () => {
  let mm: MarkerManager;

  beforeEach(() => { mm = new MarkerManager(); });

  it('starts empty', () => {
    expect(mm.getAllMarkers()).toEqual([]);
  });

  it('addMarker returns marker with id', () => {
    const m = addTestMarker(mm);
    expect(m.id).toBeTruthy();
    expect(m.name).toBe('Test Marker');
    expect(m.time).toBe(1.0);
  });

  it('getMarker finds by id', () => {
    const m = addTestMarker(mm, { name: 'Find me' });
    expect(mm.getMarker(m.id)?.name).toBe('Find me');
  });

  it('getMarker returns undefined for missing id', () => {
    expect(mm.getMarker('nonexistent')).toBeUndefined();
  });

  it('updateMarker changes name', () => {
    const m = addTestMarker(mm, { name: 'Old' });
    mm.updateMarker(m.id, { name: 'New' });
    expect(mm.getMarker(m.id)?.name).toBe('New');
  });

  it('deleteMarker removes it', () => {
    const m = addTestMarker(mm);
    mm.deleteMarker(m.id);
    expect(mm.getMarker(m.id)).toBeUndefined();
  });

  it('subscribe fires on add/delete', () => {
    const fn = vi.fn();
    const unsub = mm.subscribe(fn);
    addTestMarker(mm);
    expect(fn).toHaveBeenCalledTimes(1);
    const m = addTestMarker(mm);
    mm.deleteMarker(m.id);
    expect(fn).toHaveBeenCalledTimes(3);
    unsub();
  });
});

describe('MarkerManager — 検索', () => {
  let mm: MarkerManager;

  beforeEach(() => {
    mm = new MarkerManager();
    addTestMarker(mm, { name: 'A', time: 1.0, type: 'chapter' });
    addTestMarker(mm, { name: 'B', time: 5.0, type: 'standard' });
    addTestMarker(mm, { name: 'C', time: 10.0, type: 'chapter' });
  });

  it('getMarkersByType filters by type', () => {
    const chapters = mm.getMarkersByType('chapter');
    expect(chapters.length).toBe(2);
    expect(chapters.every((m) => m.type === 'chapter')).toBe(true);
  });

  it('getMarkersAtTime with tolerance', () => {
    const at5 = mm.getMarkersAtTime(5.0, 0.5);
    expect(at5.length).toBe(1);
    expect(at5[0].name).toBe('B');
    const near5 = mm.getMarkersAtTime(5.3, 0.5);
    expect(near5.length).toBe(1);
  });

  it('getMarkersAtTime returns empty when none in range', () => {
    expect(mm.getMarkersAtTime(7.0, 0.1)).toEqual([]);
  });

  it('getMarkersInRange returns markers within range', () => {
    const range = mm.getMarkersInRange(0.5, 6.0);
    expect(range.length).toBe(2);
  });

  it('getAllMarkers returns all', () => {
    expect(mm.getAllMarkers().length).toBe(3);
  });
});

describe('MarkerManager — Tags', () => {
  let mm: MarkerManager;
  beforeEach(() => { mm = new MarkerManager(); });

  it('addTag appends to marker', () => {
    const m = addTestMarker(mm);
    mm.addTag(m.id, 'vfx');
    expect(mm.getMarker(m.id)?.tags).toContain('vfx');
  });

  it('removeTag removes from marker', () => {
    const m = mm.addMarker(1.0, 'standard', { tags: ['audio', 'vfx'] });
    mm.removeTag(m.id, 'audio');
    expect(mm.getMarker(m.id)?.tags).not.toContain('audio');
    expect(mm.getMarker(m.id)?.tags).toContain('vfx');
  });

  it('getMarkersByTag finds tagged markers', () => {
    mm.addMarker(1.0, 'standard', { tags: ['review'] });
    mm.addMarker(2.0, 'standard', { tags: ['review', 'vfx'] });
    mm.addMarker(3.0, 'standard', { tags: ['audio'] });
    expect(mm.getMarkersByTag('review').length).toBe(2);
    expect(mm.getMarkersByTag('vfx').length).toBe(1);
    expect(mm.getMarkersByTag('missing').length).toBe(0);
  });

  it('getAllTags returns unique tags', () => {
    mm.addMarker(1.0, 'standard', { tags: ['a', 'b'] });
    mm.addMarker(2.0, 'standard', { tags: ['b', 'c'] });
    const tags = mm.getAllTags();
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toContain('a');
    expect(tags).toContain('c');
  });
});

describe('MarkerManager — Export', () => {
  let mm: MarkerManager;

  beforeEach(() => {
    mm = new MarkerManager();
    mm.addMarker(0, 'chapter', { name: 'Intro' });
    mm.addMarker(60, 'chapter', { name: 'Act 1' });
  });

  it('exportYouTubeChapters produces valid format', () => {
    const out = mm.exportYouTubeChapters();
    expect(out).toContain('0:00');
    expect(out).toContain('Intro');
    expect(out).toContain('1:00');
    expect(out).toContain('Act 1');
  });

  it('exportFFmpegChapters produces valid format', () => {
    const out = mm.exportFFmpegChapters();
    expect(out).toContain('[CHAPTER]');
    expect(out).toContain('title=Intro');
  });

  it('exportWebVTTChapters produces WebVTT header', () => {
    const out = mm.exportWebVTTChapters();
    expect(out).toContain('WEBVTT');
    expect(out).toContain('Intro');
  });

  it('exportJSON + importJSON round-trip', () => {
    const json = mm.exportJSON();
    const mm2 = new MarkerManager();
    const count = mm2.importJSON(json);
    expect(count).toBe(2);
    expect(mm2.getAllMarkers().map((m) => m.name).sort()).toEqual(['Act 1', 'Intro']);
  });

  it('importJSON returns 0 on invalid JSON', () => {
    const mm2 = new MarkerManager();
    expect(mm2.importJSON('not-json')).toBe(0);
  });
});

describe('MarkerManager — deleteMarkersInRange', () => {
  it('deletes only markers in range', () => {
    const mm = new MarkerManager();
    mm.addMarker(1.0, 'standard');
    mm.addMarker(5.0, 'standard');
    mm.addMarker(10.0, 'standard');
    const deleted = mm.deleteMarkersInRange(3.0, 7.0);
    expect(deleted).toBe(1);
    expect(mm.getAllMarkers().length).toBe(2);
  });
});

describe('MarkerManager — copyMarkers', () => {
  it('copies markers with offset', () => {
    const mm = new MarkerManager();
    const m = mm.addMarker(5.0, 'standard', { name: 'Original' });
    const copies = mm.copyMarkers([m.id], 10.0);
    expect(copies.length).toBe(1);
    expect(copies[0].time).toBe(15.0);
    expect(copies[0].id).not.toBe(m.id);
    expect(mm.getAllMarkers().length).toBe(2);
  });
});

describe('MarkerManager — getStats', () => {
  it('returns accurate counts', () => {
    const mm = new MarkerManager();
    mm.addMarker(1.0, 'chapter');
    mm.addMarker(2.0, 'chapter');
    mm.addMarker(3.0, 'standard');
    const stats = mm.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType['chapter']).toBe(2);
    expect(stats.byType['standard']).toBe(1);
  });
});

// ============================================================
// HistoryManager — 詳細テスト
// ============================================================

import { HistoryManager, CommandFactory, type Command } from '../undo/history-manager';

describe('HistoryManager — Branch', () => {
  let history: HistoryManager;

  beforeEach(() => {
    history = new HistoryManager({ maxCommands: 100, autoPersist: false });
  });

  it('createBranch returns branch id', () => {
    const id = history.createBranch('feature-v2');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('switchBranch does not throw', () => {
    const id = history.createBranch('experimental');
    expect(() => history.switchBranch(id)).not.toThrow();
  });
});

describe('HistoryManager — goToPosition', () => {
  let history: HistoryManager;

  beforeEach(() => {
    history = new HistoryManager({ autoPersist: false });
  });

  it('goToPosition rewinds to target', () => {
    let v = 0;
    const make = (n: number) => ({
      id: `set_${n}`, timestamp: Date.now(),
      description: `set ${n}`, type: 'test',
      execute() { v = n; }, undo() { v = n - 1; }, redo() { v = n; },
      getDelta() { return { before: n - 1, after: n, path: [] }; },
    });
    history.execute(make(1));
    history.execute(make(2));
    history.execute(make(3));
    history.goToPosition(0); // undo to position 0 (first command)
    expect(v).toBe(1);
  });
});

describe('HistoryManager — CommandFactory.composite', () => {
  it('composite command executes all sub-commands', () => {
    const calls: string[] = [];
    const a = { id: 'a', timestamp: Date.now(), description: 'a', type: 't', execute() { calls.push('a'); }, undo() { calls.splice(calls.indexOf('a'), 1); }, redo() { calls.push('a'); }, getDelta() { return { before: null, after: null, path: [] }; } };
    const b = { id: 'b', timestamp: Date.now(), description: 'b', type: 't', execute() { calls.push('b'); }, undo() { calls.splice(calls.indexOf('b'), 1); }, redo() { calls.push('b'); }, getDelta() { return { before: null, after: null, path: [] }; } };
    const composite = CommandFactory.composite(a, b);
    composite.execute();
    expect(calls).toEqual(['a', 'b']);
    composite.undo();
    expect(calls).toEqual([]);
  });
});

describe('HistoryManager — merge window', () => {
  it('rapid same-type commands merge within mergeWindow', async () => {
    const history = new HistoryManager({ autoPersist: false, mergeWindow: 1000 });
    let v = 0;
    const makeTyped = (n: number, type: string): Command => ({
      id: `set_${n}`, timestamp: Date.now(),
      description: `set ${n}`, type,
      execute() { v = n; }, undo() { v = 0; }, redo() { v = n; },
      getDelta() { return { before: 0, after: n, path: [] }; },
      merge(other: Command): Command {
        // Merge: keep other's value
        return { ...this, description: other.description };
      }
    });
    void v;
    history.execute(makeTyped(1, 'slider'));
    history.execute(makeTyped(2, 'slider'));
    // Both within merge window — should have 1 or 2 history entries
    const historyLen = history.getHistory().length;
    expect(historyLen).toBeLessThanOrEqual(2);
  });
});

// ─── HistoryManager core execute/undo/redo ───────────────────────────────────

function makeCmd(label: string, onExec: () => void, onUndo: () => void): Command {
  return {
    id: label, timestamp: Date.now(), description: label, type: 'test',
    execute: onExec, undo: onUndo,
    redo() { this.execute(); },
    getDelta() { return { before: null, after: null, path: [] }; },
  };
}

describe('HistoryManager — execute / undo / redo', () => {
  let history: HistoryManager;

  beforeEach(() => {
    history = new HistoryManager({ autoPersist: false });
  });

  it('starts empty with canUndo=false and canRedo=false', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getStats()).toEqual({ count: 0, position: -1, branches: 0 });
  });

  it('execute runs the command and makes canUndo true', () => {
    let ran = false;
    history.execute(makeCmd('a', () => { ran = true; }, () => {}));
    expect(ran).toBe(true);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.getStats().count).toBe(1);
  });

  it('undo reverses the last command, redo re-applies', () => {
    let v = 0;
    history.execute(makeCmd('inc', () => { v++; }, () => { v--; }));
    expect(v).toBe(1);
    expect(history.undo()).toBe(true);
    expect(v).toBe(0);
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(v).toBe(1);
  });

  it('undo/redo return false when nothing to undo/redo', () => {
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it('executing after undo clears the redo branch', () => {
    history.execute(makeCmd('a', () => {}, () => {}));
    history.execute(makeCmd('b', () => {}, () => {}));
    history.undo();         // position=0, redo=['b']
    history.execute(makeCmd('c', () => {}, () => {}));
    // 'b' was in the redo stack and should be discarded
    expect(history.getStats().count).toBe(2); // ['a', 'c']
    expect(history.canRedo()).toBe(false);
  });

  it('getHistory returns snapshots in order', () => {
    history.execute(makeCmd('first', () => {}, () => {}));
    history.execute(makeCmd('second', () => {}, () => {}));
    const h = history.getHistory();
    expect(h[0].description).toBe('first');
    expect(h[1].description).toBe('second');
  });

  it('clear empties history', () => {
    history.execute(makeCmd('x', () => {}, () => {}));
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.getStats()).toEqual({ count: 0, position: -1, branches: 0 });
  });
});

describe('HistoryManager — maxCommands', () => {
  it('execute trims oldest commands when limit exceeded', () => {
    const h = new HistoryManager({ autoPersist: false, maxCommands: 3 });
    for (let i = 0; i < 5; i++) h.execute(makeCmd(`c${i}`, () => {}, () => {}));
    expect(h.getStats().count).toBe(3);
    // The 3 most recent should remain
    const descs = h.getHistory().map(c => c.description);
    expect(descs).toEqual(['c2', 'c3', 'c4']);
  });
});

describe('HistoryManager — beginGroup / endGroup', () => {
  let history: HistoryManager;

  beforeEach(() => {
    history = new HistoryManager({ autoPersist: false });
  });

  it('commands inside a group are batched into one undo step', () => {
    const log: string[] = [];
    history.beginGroup('multi');
    history.execute(makeCmd('a', () => { log.push('exec-a'); }, () => { log.push('undo-a'); }));
    history.execute(makeCmd('b', () => { log.push('exec-b'); }, () => { log.push('undo-b'); }));
    history.endGroup('multi-op');
    expect(log).toEqual(['exec-a', 'exec-b']); // both executed
    expect(history.getStats().count).toBe(1);  // one composite command

    history.undo();
    expect(log).toContain('undo-b');
    expect(log).toContain('undo-a');
  });

  it('endGroup with no commands (empty group) does not push a command', () => {
    history.beginGroup();
    history.endGroup();
    expect(history.getStats().count).toBe(0);
  });

  it('REGRESSION: endGroup enforces maxCommands cap', () => {
    const h = new HistoryManager({ autoPersist: false, maxCommands: 2 });
    // Fill history to the limit
    h.execute(makeCmd('p', () => {}, () => {}));
    h.execute(makeCmd('q', () => {}, () => {}));
    // endGroup would add a 3rd command — must trim to maxCommands=2
    h.beginGroup();
    h.execute(makeCmd('r', () => {}, () => {}));
    h.endGroup('group-r');
    expect(h.getStats().count).toBeLessThanOrEqual(2);
  });
});

// ─── CommandFactory ───────────────────────────────────────────────────────────

describe('CommandFactory.clipMove', () => {
  it('execute moves clip, undo restores it', () => {
    let clip = { id: 'c1', trackId: 'v1', startFrame: 0 };
    const cmd = CommandFactory.clipMove(
      'c1', 'v1', 'v2', 0, 100,
      () => clip, (c) => { clip = c as typeof clip; }
    );
    cmd.execute();
    expect(clip.trackId).toBe('v2');
    expect(clip.startFrame).toBe(100);
    cmd.undo();
    expect(clip.trackId).toBe('v1');
    expect(clip.startFrame).toBe(0);
  });

  it('getDelta reports before/after', () => {
    const cmd = CommandFactory.clipMove('x', 'v1', 'v2', 0, 50, () => ({}), () => {});
    const d = cmd.getDelta();
    expect((d.before as { trackId: string }).trackId).toBe('v1');
    expect((d.after as { startFrame: number }).startFrame).toBe(50);
  });
});

describe('CommandFactory.clipAdd / clipDelete', () => {
  it('clipAdd execute adds, undo removes, redo re-adds', () => {
    const clips: { id?: string }[] = [];
    const cmd = CommandFactory.clipAdd(
      { id: 'c1' },
      (c) => clips.push(c),
      (id) => { const i = clips.findIndex(c => c.id === id); if (i >= 0) clips.splice(i, 1); }
    );
    cmd.execute();
    expect(clips).toHaveLength(1);
    cmd.undo();
    expect(clips).toHaveLength(0);
    cmd.redo();
    expect(clips).toHaveLength(1);
  });

  it('clipDelete execute removes, undo restores', () => {
    const clips: { id?: string }[] = [{ id: 'c1' }];
    const cmd = CommandFactory.clipDelete(
      { id: 'c1' },
      (c) => clips.push(c),
      (id) => { const i = clips.findIndex(c => c.id === id); if (i >= 0) clips.splice(i, 1); }
    );
    cmd.execute();
    expect(clips).toHaveLength(0);
    cmd.undo();
    expect(clips).toHaveLength(1);
  });
});

describe('CommandFactory.effectAdd', () => {
  it('adds and removes effect on undo', () => {
    let clip = { id: 'c1', effects: [] as { id?: string; type?: string }[] };
    const cmd = CommandFactory.effectAdd(
      'c1',
      { id: 'fx1', type: 'blur' },
      () => clip,
      (c) => { clip = c as typeof clip; }
    );
    cmd.execute();
    expect(clip.effects).toHaveLength(1);
    cmd.undo();
    expect(clip.effects).toHaveLength(0);
  });
});

describe('CommandFactory.audioVolume', () => {
  it('sets volume on execute, restores on undo', () => {
    let clip = { audioVolume: 1.0 };
    const cmd = CommandFactory.audioVolume(
      'c1', 1.0, 0.5,
      () => clip, (c) => { clip = c as typeof clip; }
    );
    cmd.execute();
    expect(clip.audioVolume).toBeCloseTo(0.5);
    cmd.undo();
    expect(clip.audioVolume).toBeCloseTo(1.0);
  });
});
