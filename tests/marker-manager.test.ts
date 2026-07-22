/**
 * Tests for timeline/marker-manager.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import MarkerManager from '../timeline/marker-manager';

// ============================================================
// Helpers
// ============================================================

function makeManager(): MarkerManager {
  return new MarkerManager();
}

// ============================================================
// addMarker
// ============================================================

describe('MarkerManager.addMarker()', () => {
  let mm: MarkerManager;
  beforeEach(() => { mm = makeManager(); });

  it('returns a marker with an id and the given time', () => {
    const m = mm.addMarker(10);
    expect(m.id).toBeTruthy();
    expect(m.time).toBe(10);
  });

  it('defaults to type "standard"', () => {
    const m = mm.addMarker(0);
    expect(m.type).toBe('standard');
  });

  it('uses provided type', () => {
    const m = mm.addMarker(5, 'chapter');
    expect(m.type).toBe('chapter');
  });

  it('todo marker initialises completed=false and priority=normal', () => {
    const m = mm.addMarker(0, 'todo');
    expect(m.completed).toBe(false);
    expect(m.priority).toBe('normal');
  });

  it('non-todo marker has completed=undefined', () => {
    const m = mm.addMarker(0, 'standard');
    expect(m.completed).toBeUndefined();
  });

  it('applies custom options', () => {
    const m = mm.addMarker(3, 'comment', {
      name: 'My Note',
      notes: 'details',
      tags: ['review'],
    });
    expect(m.name).toBe('My Note');
    expect(m.notes).toBe('details');
    expect(m.tags).toContain('review');
  });

  it('assigns a default name with incrementing count', () => {
    const m1 = mm.addMarker(0, 'chapter');
    const m2 = mm.addMarker(1, 'chapter');
    expect(m1.name).toBe('Chapter 1');
    expect(m2.name).toBe('Chapter 2');
  });

  it('notifies listeners on add', () => {
    const fn = vi.fn();
    mm.subscribe(fn);
    mm.addMarker(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// updateMarker / deleteMarker
// ============================================================

describe('updateMarker / deleteMarker', () => {
  let mm: MarkerManager;
  beforeEach(() => { mm = makeManager(); });

  it('updateMarker changes fields', () => {
    const m = mm.addMarker(5);
    mm.updateMarker(m.id, { name: 'Updated' });
    expect(mm.getMarker(m.id)!.name).toBe('Updated');
  });

  it('updateMarker on unknown id does nothing', () => {
    expect(() => mm.updateMarker('nonexistent', { name: 'X' })).not.toThrow();
  });

  it('deleteMarker removes the marker', () => {
    const m = mm.addMarker(0);
    mm.deleteMarker(m.id);
    expect(mm.getMarker(m.id)).toBeUndefined();
  });

  it('deleteMarkersInRange removes only markers in range', () => {
    mm.addMarker(5);
    mm.addMarker(15);
    mm.addMarker(25);
    const removed = mm.deleteMarkersInRange(10, 20);
    expect(removed).toBe(1);
    expect(mm.getAllMarkers()).toHaveLength(2);
  });

  it('deleteMarkersInRange includes boundary markers', () => {
    mm.addMarker(10);
    mm.addMarker(20);
    const removed = mm.deleteMarkersInRange(10, 20);
    expect(removed).toBe(2);
  });

  it('deleteMarkersInRange returns 0 when no match', () => {
    mm.addMarker(50);
    expect(mm.deleteMarkersInRange(0, 10)).toBe(0);
  });
});

// ============================================================
// Queries
// ============================================================

describe('getAllMarkers() sorted by time', () => {
  it('returns markers in ascending time order', () => {
    const mm = makeManager();
    mm.addMarker(30);
    mm.addMarker(10);
    mm.addMarker(20);
    const times = mm.getAllMarkers().map(m => m.time);
    expect(times).toEqual([10, 20, 30]);
  });
});

describe('getMarkersAtTime()', () => {
  let mm: MarkerManager;
  beforeEach(() => { mm = makeManager(); });

  it('finds marker within default tolerance', () => {
    mm.addMarker(10);
    expect(mm.getMarkersAtTime(10.05)).toHaveLength(1);
  });

  it('does not find marker outside tolerance', () => {
    mm.addMarker(10);
    expect(mm.getMarkersAtTime(10.5)).toHaveLength(0);
  });

  it('finds marker spanning a duration range', () => {
    mm.addMarker(5, 'standard', { duration: 10 });
    expect(mm.getMarkersAtTime(10)).toHaveLength(1);
  });
});

describe('getMarkersByTag()', () => {
  it('returns only markers with the given tag', () => {
    const mm = makeManager();
    const m1 = mm.addMarker(0, 'standard', { tags: ['vfx'] });
    const m2 = mm.addMarker(1, 'standard', { tags: ['sfx'] });
    const result = mm.getMarkersByTag('vfx');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(m1.id);
    void m2; // unused but added to test above
  });
});

describe('Navigation', () => {
  let mm: MarkerManager;
  beforeEach(() => {
    mm = makeManager();
    mm.addMarker(10);
    mm.addMarker(20);
    mm.addMarker(30);
  });

  it('getNextMarker returns closest marker after given time', () => {
    const m = mm.getNextMarker(15);
    expect(m!.time).toBe(20);
  });

  it('getNextMarker returns null when past all markers', () => {
    expect(mm.getNextMarker(50)).toBeNull();
  });

  it('getPrevMarker returns closest marker before given time', () => {
    const m = mm.getPrevMarker(25);
    expect(m!.time).toBe(20);
  });

  it('getPrevMarker returns null when before all markers', () => {
    expect(mm.getPrevMarker(5)).toBeNull();
  });

  it('getNearestMarker finds closest', () => {
    const m = mm.getNearestMarker(22);
    expect(m!.time).toBe(20);
  });

  it('getNearestMarker returns null on empty manager', () => {
    expect(makeManager().getNearestMarker(0)).toBeNull();
  });
});

// ============================================================
// Tags
// ============================================================

describe('Tag operations', () => {
  let mm: MarkerManager;
  beforeEach(() => { mm = makeManager(); });

  it('addTag appends tag without duplicates', () => {
    const m = mm.addMarker(0);
    mm.addTag(m.id, 'review');
    mm.addTag(m.id, 'review'); // duplicate
    expect(mm.getMarker(m.id)!.tags).toHaveLength(1);
  });

  it('removeTag removes existing tag', () => {
    const m = mm.addMarker(0, 'standard', { tags: ['review', 'vfx'] });
    mm.removeTag(m.id, 'review');
    expect(mm.getMarker(m.id)!.tags).not.toContain('review');
    expect(mm.getMarker(m.id)!.tags).toContain('vfx');
  });

  it('getAllTags returns sorted unique tags', () => {
    const m1 = mm.addMarker(0, 'standard', { tags: ['b', 'a'] });
    const m2 = mm.addMarker(1, 'standard', { tags: ['a', 'c'] });
    void m1; void m2;
    expect(mm.getAllTags()).toEqual(['a', 'b', 'c']);
  });
});

// ============================================================
// Todo operations
// ============================================================

describe('Todo operations', () => {
  let mm: MarkerManager;
  beforeEach(() => { mm = makeManager(); });

  it('getTodos() returns all todos by default', () => {
    mm.addMarker(0, 'todo');
    mm.addMarker(1, 'todo');
    mm.addMarker(2, 'chapter');
    expect(mm.getTodos()).toHaveLength(2);
  });

  it('getTodos(false) returns incomplete todos', () => {
    const m1 = mm.addMarker(0, 'todo');
    mm.addMarker(1, 'todo');
    mm.toggleTodoComplete(m1.id);
    expect(mm.getTodos(false)).toHaveLength(1);
  });

  it('getTodos(true) returns completed todos', () => {
    const m1 = mm.addMarker(0, 'todo');
    mm.addMarker(1, 'todo');
    mm.toggleTodoComplete(m1.id);
    expect(mm.getTodos(true)).toHaveLength(1);
  });

  it('toggleTodoComplete flips the completed flag', () => {
    const m = mm.addMarker(0, 'todo');
    expect(mm.getMarker(m.id)!.completed).toBe(false);
    mm.toggleTodoComplete(m.id);
    expect(mm.getMarker(m.id)!.completed).toBe(true);
    mm.toggleTodoComplete(m.id);
    expect(mm.getMarker(m.id)!.completed).toBe(false);
  });

  it('toggleTodoComplete ignores non-todo markers', () => {
    const m = mm.addMarker(0, 'chapter');
    mm.toggleTodoComplete(m.id); // should not throw or change anything
    expect(mm.getMarker(m.id)!.completed).toBeUndefined();
  });
});

// ============================================================
// Bulk operations
// ============================================================

describe('moveMarkers()', () => {
  it('shifts marker times by offset', () => {
    const mm = makeManager();
    const m1 = mm.addMarker(10);
    const m2 = mm.addMarker(20);
    mm.moveMarkers([m1.id, m2.id], 5);
    expect(mm.getMarker(m1.id)!.time).toBe(15);
    expect(mm.getMarker(m2.id)!.time).toBe(25);
  });

  it('clamps time to 0 minimum', () => {
    const mm = makeManager();
    const m = mm.addMarker(3);
    mm.moveMarkers([m.id], -10);
    expect(mm.getMarker(m.id)!.time).toBe(0);
  });
});

describe('copyMarkers()', () => {
  it('creates new markers at original.time + offset', () => {
    const mm = makeManager();
    const orig = mm.addMarker(10, 'chapter', { name: 'Intro' });
    const copies = mm.copyMarkers([orig.id], 5);
    expect(copies).toHaveLength(1);
    expect(copies[0].time).toBe(15);
    expect(copies[0].name).toBe('Intro (Copy)');
    expect(copies[0].id).not.toBe(orig.id);
  });

  it('REGRESSION: copyMarkers deep-copies tags array', () => {
    const mm = makeManager();
    const orig = mm.addMarker(10, 'standard', { tags: ['review'] });
    const copies = mm.copyMarkers([orig.id], 5);
    const copy = copies[0];
    // Adding a tag to the copy should NOT affect the original
    mm.addTag(copy.id, 'new-tag');
    expect(mm.getMarker(orig.id)!.tags).not.toContain('new-tag');
  });

  it('REGRESSION: copyMarkers deep-copies metadata object', () => {
    const mm = makeManager();
    const orig = mm.addMarker(10, 'standard', { metadata: { key: 'value' } });
    const copies = mm.copyMarkers([orig.id], 5);
    const copy = copies[0];
    // Mutating copy metadata should NOT affect original
    mm.updateMarker(copy.id, { metadata: { key: 'changed' } });
    expect(mm.getMarker(orig.id)!.metadata).toEqual({ key: 'value' });
  });

  it('does nothing for unknown ids', () => {
    const mm = makeManager();
    const copies = mm.copyMarkers(['does-not-exist'], 5);
    expect(copies).toHaveLength(0);
  });
});

describe('setMarkerType()', () => {
  it('changes type and updates color', () => {
    const mm = makeManager();
    const m = mm.addMarker(0, 'standard');
    mm.setMarkerType([m.id], 'chapter');
    const updated = mm.getMarker(m.id)!;
    expect(updated.type).toBe('chapter');
    expect(updated.color).toBeTruthy();
  });

  it('initialises todo fields when changing to todo', () => {
    const mm = makeManager();
    const m = mm.addMarker(0, 'comment');
    expect(m.completed).toBeUndefined();
    mm.setMarkerType([m.id], 'todo');
    const updated = mm.getMarker(m.id)!;
    expect(updated.completed).toBe(false);
    expect(updated.priority).toBe('normal');
  });
});

// ============================================================
// Chapter Export
// ============================================================

describe('exportYouTubeChapters()', () => {
  it('returns empty string when no chapters', () => {
    const mm = makeManager();
    expect(mm.exportYouTubeChapters()).toBe('');
  });

  it('formats sub-hour times as M:SS', () => {
    const mm = makeManager();
    mm.addMarker(90, 'chapter', { name: 'Intro' }); // 1:30
    const out = mm.exportYouTubeChapters();
    expect(out).toContain('1:30 Intro');
  });

  it('formats hour-plus times as H:MM:SS', () => {
    const mm = makeManager();
    mm.addMarker(3720, 'chapter', { name: 'Second Hour' }); // 1:02:00
    const out = mm.exportYouTubeChapters();
    expect(out).toContain('1:02:00 Second Hour');
  });
});

describe('exportWebVTTChapters()', () => {
  it('returns empty string when no chapters', () => {
    expect(makeManager().exportWebVTTChapters()).toBe('');
  });

  it('starts with WEBVTT header', () => {
    const mm = makeManager();
    mm.addMarker(0, 'chapter', { name: 'Intro' });
    expect(mm.exportWebVTTChapters()).toMatch(/^WEBVTT/);
  });

  it('contains chapter name', () => {
    const mm = makeManager();
    mm.addMarker(0, 'chapter', { name: 'My Chapter' });
    expect(mm.exportWebVTTChapters()).toContain('My Chapter');
  });

  it('REGRESSION: WebVTT chapter millisecond field is not truncated-down by float error', () => {
    // formatTimeVTT used `Math.floor((seconds % 1) * 1000)`, truncating the ms
    // field DOWN by float error (3.456s -> ".455"). Same root-cause bug as the
    // one fixed in captions/caption-manager.ts. Rounded integer ms is exact.
    const mm = makeManager();
    mm.addMarker(3.456, 'chapter', { name: 'Ch' });
    expect(mm.exportWebVTTChapters()).toContain('00:00:03.456');
  });
});

describe('exportFFmpegChapters()', () => {
  it('returns empty string when no chapters', () => {
    expect(makeManager().exportFFmpegChapters()).toBe('');
  });

  it('starts with FFMETADATA1', () => {
    const mm = makeManager();
    mm.addMarker(0, 'chapter', { name: 'Intro' });
    expect(mm.exportFFmpegChapters()).toContain(';FFMETADATA1');
  });
});

// ============================================================
// JSON Import/Export round-trip
// ============================================================

describe('exportJSON / importJSON', () => {
  it('round-trips all markers', () => {
    const mm = makeManager();
    mm.addMarker(10, 'chapter', { name: 'Ch1', tags: ['a'] });
    mm.addMarker(20, 'todo', { name: 'Task' });
    const json = mm.exportJSON();

    const mm2 = makeManager();
    const count = mm2.importJSON(json);
    expect(count).toBe(2);
    const markers = mm2.getAllMarkers();
    expect(markers.map(m => m.name)).toContain('Ch1');
    expect(markers.map(m => m.name)).toContain('Task');
  });

  it('importJSON returns 0 on invalid JSON', () => {
    const mm = makeManager();
    expect(mm.importJSON('{not valid json')).toBe(0);
  });

  it('importJSON assigns new ids (no id collision with source)', () => {
    const mm1 = makeManager();
    const orig = mm1.addMarker(5, 'standard');
    const json = mm1.exportJSON();

    const mm2 = makeManager();
    mm2.importJSON(json);
    const imported = mm2.getAllMarkers()[0];
    expect(imported.id).not.toBe(orig.id);
  });

  it('REGRESSION: importJSON of a valid-JSON string does not create per-character markers', () => {
    const mm = makeManager();
    // JSON.parse('"abc"') === 'abc' — a string is iterable, so the old for...of
    // spread each char into a bogus marker. Must import 0, not 3.
    expect(mm.importJSON('"abc"')).toBe(0);
    expect(mm.getAllMarkers()).toHaveLength(0);
  });

  it('REGRESSION: importJSON of a numeric array creates no markers (no id-only garbage)', () => {
    const mm = makeManager();
    // [1,2,3] previously spread numbers (no-op) into markers with only an id.
    expect(mm.importJSON('[1, 2, 3]')).toBe(0);
    expect(mm.getAllMarkers()).toHaveLength(0);
  });

  it('REGRESSION: importJSON skips entries lacking a finite numeric time', () => {
    const mm = makeManager();
    // One valid marker, one missing time, one with non-finite time.
    const payload = JSON.stringify([
      { time: 12, name: 'Valid', type: 'standard', duration: 0, notes: '', color: '#fff', tags: [], metadata: {} },
      { name: 'NoTime' },
      { time: null, name: 'NullTime' },
    ]);
    expect(mm.importJSON(payload)).toBe(1);
    expect(mm.getAllMarkers().map(m => m.name)).toEqual(['Valid']);
  });

  it('importJSON of a non-array object returns 0', () => {
    const mm = makeManager();
    expect(mm.importJSON('{"time":5}')).toBe(0);
  });

  it('REGRESSION: importJSON normalises non-array tags to [] so addTag() does not crash', () => {
    const mm = makeManager();
    const payload = JSON.stringify([
      { time: 5, type: 'standard', name: 'Bad', duration: 0, notes: '', color: '#fff',
        tags: 'not-an-array', metadata: {} },
    ]);
    expect(mm.importJSON(payload)).toBe(1);
    const m = mm.getAllMarkers()[0];
    // Without the fix, addTag() throws TypeError: marker.tags.push is not a function
    expect(() => mm.addTag(m.id, 'new')).not.toThrow();
    expect(mm.getMarker(m.id)!.tags).toContain('new');
  });

  it('REGRESSION: importJSON normalises non-object metadata to {} to prevent aliasing crash', () => {
    const mm = makeManager();
    const payload = JSON.stringify([
      { time: 5, type: 'standard', name: 'BadMeta', duration: 0, notes: '', color: '#fff',
        tags: [], metadata: ['not', 'an', 'object'] },
    ]);
    expect(mm.importJSON(payload)).toBe(1);
    const m = mm.getAllMarkers()[0];
    expect(m.metadata).toEqual({});
  });
});

// ============================================================
// EDL Export
// ============================================================

describe('exportEDL()', () => {
  it('returns TITLE header', () => {
    const mm = makeManager();
    mm.addMarker(60, 'standard', { name: 'CutPoint' });
    const edl = mm.exportEDL();
    expect(edl).toContain('TITLE: Artone Markers');
  });

  it('contains marker name in FROM CLIP NAME line', () => {
    const mm = makeManager();
    mm.addMarker(90, 'standard', { name: 'Scene2' });
    const edl = mm.exportEDL();
    expect(edl).toContain('FROM CLIP NAME: Scene2');
  });

  it('REGRESSION: EDL frame field is not truncated-down by float error', () => {
    // formatTimecodeEDL used `Math.floor((seconds % 1) * fps)`, truncating the
    // frame field DOWN by float error: 3 + 1/30 s is frame 1 of second 3 at
    // 30fps, but (frac * 30) computes 0.9999… and floored to frame 0. Quantising
    // to the nearest integer frame first (per timeline/CLAUDE.md's integer-frame
    // rule) is exact.
    const mm = makeManager();
    mm.addMarker(3 + 1 / 30, 'standard', { name: 'F' });
    expect(mm.exportEDL()).toContain('00:00:03:01');
  });
});

// ============================================================
// Stats
// ============================================================

describe('getStats()', () => {
  it('reports correct totals', () => {
    const mm = makeManager();
    mm.addMarker(0, 'todo');
    mm.addMarker(1, 'todo');
    const m = mm.addMarker(2, 'todo');
    mm.toggleTodoComplete(m.id);
    mm.addMarker(3, 'chapter');

    const stats = mm.getStats();
    expect(stats.total).toBe(4);
    expect(stats.todoComplete).toBe(1);
    expect(stats.todoIncomplete).toBe(2);
    expect(stats.byType.todo).toBe(3);
    expect(stats.byType.chapter).toBe(1);
  });
});

// ============================================================
// Subscribe / unsubscribe
// ============================================================

describe('subscribe()', () => {
  it('listener called on every mutation', () => {
    const mm = makeManager();
    const fn = vi.fn();
    mm.subscribe(fn);
    const m = mm.addMarker(0);
    mm.updateMarker(m.id, { name: 'X' });
    mm.deleteMarker(m.id);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('unsubscribe stops notifications', () => {
    const mm = makeManager();
    const fn = vi.fn();
    const unsub = mm.subscribe(fn);
    unsub();
    mm.addMarker(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
