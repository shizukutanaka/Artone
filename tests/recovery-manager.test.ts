/**
 * Tests for recovery/recovery-manager.ts
 *
 * Data-loss risk zone (95% coverage target). Uses the in-memory IndexedDB
 * fake from the global setup; each manager gets a unique dbName for isolation.
 * crypto.subtle.digest (checksum) runs on the real WebCrypto in the test env.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecoveryManager,
  RecoveryDialogUI,
  type RecoveryData,
  type RecoverySnapshot,
} from '../recovery/recovery-manager';

let dbCounter = 0;
function makeManager(over: Partial<{ maxSnapshots: number; maxAge: number; autoSaveInterval: number }> = {}): RecoveryManager {
  dbCounter++;
  return new RecoveryManager({ dbName: `TestRecovery_${dbCounter}_${Date.now()}`, ...over });
}

function makeData(over: Partial<RecoveryData> = {}): RecoveryData {
  return {
    timeline: { id: 't1' },
    clips: [],
    tracks: [],
    effects: [],
    markers: [],
    playhead: 0,
    selection: [],
    historyPosition: 0,
    settings: { fps: 30 },
    ...over,
  };
}

// ============================================================
// init
// ============================================================

describe('RecoveryManager — init', () => {
  it('initializes without throwing', async () => {
    const mgr = makeManager();
    await expect(mgr.init()).resolves.toBeUndefined();
  });

  it('starts in idle status', () => {
    expect(makeManager().getStatus()).toBe('idle');
  });
});

// ============================================================
// saveSnapshot
// ============================================================

describe('RecoveryManager — saveSnapshot', () => {
  let mgr: RecoveryManager;
  beforeEach(async () => { mgr = makeManager(); await mgr.init(); });

  it('returns null when no data given', async () => {
    expect(await mgr.saveSnapshot('manual', 'p1', 'Project')).toBeNull();
  });

  it('returns null before init (no db)', async () => {
    const fresh = makeManager();
    expect(await fresh.saveSnapshot('manual', 'p1', 'Project', makeData())).toBeNull();
  });

  it('saves a manual snapshot and returns its id', async () => {
    const id = await mgr.saveSnapshot('manual', 'p1', 'Project', makeData());
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('saved snapshot is retrievable with correct fields', async () => {
    await mgr.saveSnapshot('manual', 'proj-1', 'My Project', makeData({ playhead: 42 }));
    const snaps = await mgr.getSnapshots('proj-1');
    expect(snaps).toHaveLength(1);
    expect(snaps[0].projectId).toBe('proj-1');
    expect(snaps[0].projectName).toBe('My Project');
    expect(snaps[0].type).toBe('manual');
    expect((snaps[0].data as RecoveryData).playhead).toBe(42);
  });

  it('uses fallback project id/name when omitted', async () => {
    await mgr.saveSnapshot('manual', undefined, undefined, makeData());
    const snaps = await mgr.getSnapshots();
    expect(snaps[0].projectId).toBe('unknown');
    expect(snaps[0].projectName).toBe('Untitled');
  });

  it('throttles rapid auto saves (second within 5s returns null)', async () => {
    const first = await mgr.saveSnapshot('auto', 'p', 'P', makeData());
    const second = await mgr.saveSnapshot('auto', 'p', 'P', makeData());
    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  it('does not throttle manual saves', async () => {
    const a = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    const b = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('computes a checksum for the snapshot', async () => {
    await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    const snaps = await mgr.getSnapshots('p');
    expect(snaps[0].checksum).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ============================================================
// getSnapshots / getLatestSnapshot
// ============================================================

describe('RecoveryManager — getSnapshots', () => {
  let mgr: RecoveryManager;
  beforeEach(async () => { mgr = makeManager(); await mgr.init(); });

  it('returns [] before init', async () => {
    expect(await makeManager().getSnapshots()).toEqual([]);
  });

  it('filters by project id', async () => {
    await mgr.saveSnapshot('manual', 'a', 'A', makeData());
    await mgr.saveSnapshot('manual', 'b', 'B', makeData());
    expect(await mgr.getSnapshots('a')).toHaveLength(1);
    expect(await mgr.getSnapshots('b')).toHaveLength(1);
    expect(await mgr.getSnapshots()).toHaveLength(2);
  });

  it('sorts snapshots by timestamp descending', async () => {
    const s1 = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    await new Promise(r => setTimeout(r, 5));
    const s2 = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    const snaps = await mgr.getSnapshots('p');
    expect(snaps[0].id).toBe(s2); // newest first
    expect(snaps[1].id).toBe(s1);
  });

  it('getLatestSnapshot returns the most recent', async () => {
    await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 1 }));
    await new Promise(r => setTimeout(r, 5));
    await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 2 }));
    const latest = await mgr.getLatestSnapshot('p');
    expect((latest!.data as RecoveryData).playhead).toBe(2);
  });

  it('getLatestSnapshot returns null when empty', async () => {
    expect(await mgr.getLatestSnapshot('nonexistent')).toBeNull();
  });
});

// ============================================================
// restoreSnapshot
// ============================================================

describe('RecoveryManager — restoreSnapshot', () => {
  let mgr: RecoveryManager;
  beforeEach(async () => { mgr = makeManager(); await mgr.init(); });

  it('restores data for a valid snapshot', async () => {
    const id = await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 99 }));
    const data = await mgr.restoreSnapshot(id!);
    expect(data).not.toBeNull();
    expect(data!.playhead).toBe(99);
    expect(mgr.getStatus()).toBe('idle');
  });

  it('returns null for unknown snapshot id', async () => {
    expect(await mgr.restoreSnapshot('ghost')).toBeNull();
    expect(mgr.getStatus()).toBe('error');
  });

  it('returns null before init', async () => {
    expect(await makeManager().restoreSnapshot('x')).toBeNull();
  });

  it('returns null on checksum mismatch (tampered data)', async () => {
    const id = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    // Tamper with the stored snapshot's data so checksum no longer matches
    const snaps = await mgr.getSnapshots('p');
    const tampered = { ...snaps[0], data: makeData({ playhead: 12345 }) } as RecoverySnapshot;
    const internal = mgr as unknown as { writeSnapshot(s: RecoverySnapshot): Promise<void> };
    await internal.writeSnapshot(tampered);
    expect(await mgr.restoreSnapshot(id!)).toBeNull();
    expect(mgr.getStatus()).toBe('error');
  });
});

// ============================================================
// delete / clear
// ============================================================

describe('RecoveryManager — delete and clear', () => {
  let mgr: RecoveryManager;
  beforeEach(async () => { mgr = makeManager(); await mgr.init(); });

  it('deleteSnapshot removes a snapshot', async () => {
    const id = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    expect(await mgr.deleteSnapshot(id!)).toBe(true);
    expect(await mgr.getSnapshots('p')).toHaveLength(0);
  });

  it('deleteSnapshot returns false before init', async () => {
    expect(await makeManager().deleteSnapshot('x')).toBe(false);
  });

  it('clearProject removes only that project snapshots', async () => {
    await mgr.saveSnapshot('manual', 'a', 'A', makeData());
    await mgr.saveSnapshot('manual', 'b', 'B', makeData());
    await mgr.clearProject('a');
    expect(await mgr.getSnapshots('a')).toHaveLength(0);
    expect(await mgr.getSnapshots('b')).toHaveLength(1);
  });

  it('clearAll removes everything', async () => {
    await mgr.saveSnapshot('manual', 'a', 'A', makeData());
    await mgr.saveSnapshot('manual', 'b', 'B', makeData());
    await mgr.clearAll();
    expect(await mgr.getSnapshots()).toHaveLength(0);
  });
});

// ============================================================
// enforceLimit
// ============================================================

describe('RecoveryManager — enforceLimit', () => {
  it('caps the number of snapshots at maxSnapshots', async () => {
    const mgr = makeManager({ maxSnapshots: 3 });
    await mgr.init();
    for (let i = 0; i < 6; i++) {
      await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: i }));
    }
    const snaps = await mgr.getSnapshots();
    expect(snaps.length).toBeLessThanOrEqual(3);
  });

  it('keeps the most recent snapshots when over the limit', async () => {
    const mgr = makeManager({ maxSnapshots: 2 });
    await mgr.init();
    for (let i = 0; i < 4; i++) {
      await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: i }));
      await new Promise(r => setTimeout(r, 3));
    }
    const snaps = await mgr.getSnapshots();
    // Newest (playhead 3) must be retained
    expect((snaps[0].data as RecoveryData).playhead).toBe(3);
  });
});

// ============================================================
// getStats
// ============================================================

describe('RecoveryManager — getStats', () => {
  let mgr: RecoveryManager;
  beforeEach(async () => { mgr = makeManager(); await mgr.init(); });

  it('reports zero for an empty store', async () => {
    const stats = await mgr.getStats();
    expect(stats.totalSnapshots).toBe(0);
    expect(stats.totalSize).toBe(0);
    expect(stats.oldestSnapshot).toBeNull();
    expect(stats.newestSnapshot).toBeNull();
  });

  it('reports counts and timestamps', async () => {
    await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    await new Promise(r => setTimeout(r, 5));
    await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    const stats = await mgr.getStats();
    expect(stats.totalSnapshots).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.newestSnapshot!).toBeGreaterThanOrEqual(stats.oldestSnapshot!);
  });
});

// ============================================================
// status / subscribe
// ============================================================

describe('RecoveryManager — status and subscribe', () => {
  it('subscribe is notified of status transitions on save', async () => {
    const mgr = makeManager();
    await mgr.init();
    const seen: string[] = [];
    mgr.subscribe(s => seen.push(s));
    await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    expect(seen).toContain('saving');
    expect(seen).toContain('idle');
  });

  it('unsubscribe stops notifications', async () => {
    const mgr = makeManager();
    await mgr.init();
    const fn = vi.fn();
    const unsub = mgr.subscribe(fn);
    unsub();
    await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================
// autoSave / dispose
// ============================================================

describe('RecoveryManager — autoSave and dispose', () => {
  it('startAutoSave saves immediately', async () => {
    const mgr = makeManager();
    await mgr.init();
    mgr.startAutoSave(() => makeData({ playhead: 7 }), 'p', 'P');
    await new Promise(r => setTimeout(r, 10));
    const snaps = await mgr.getSnapshots('p');
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    mgr.stopAutoSave();
  });

  it('stopAutoSave is safe when no timer is running', () => {
    expect(() => makeManager().stopAutoSave()).not.toThrow();
  });

  it('dispose stops autosave and is safe', async () => {
    const mgr = makeManager();
    await mgr.init();
    mgr.startAutoSave(() => makeData(), 'p', 'P');
    expect(() => mgr.dispose()).not.toThrow();
  });
});

// ============================================================
// RecoveryDialogUI
// ============================================================

describe('RecoveryDialogUI', () => {
  function snap(over: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
    return {
      id: 'snap-1',
      timestamp: Date.now(),
      type: 'auto',
      projectId: 'p',
      projectName: 'My Project',
      data: makeData(),
      checksum: 'abcd1234',
      ...over,
    };
  }

  it('renders a dialog containing the project name', () => {
    const html = RecoveryDialogUI({ snapshots: [snap()], onRestore: () => {}, onDiscard: () => {} });
    expect(html).toContain('My Project');
    expect(html).toContain('recovery-dialog');
  });

  it('renders each snapshot id as a data attribute', () => {
    const html = RecoveryDialogUI({ snapshots: [snap({ id: 'xyz' })], onRestore: () => {}, onDiscard: () => {} });
    expect(html).toContain('data-id="xyz"');
  });

  it('shows the crash icon for crash snapshots', () => {
    const html = RecoveryDialogUI({ snapshots: [snap({ type: 'crash' })], onRestore: () => {}, onDiscard: () => {} });
    expect(html).toContain('⚠️');
  });

  it('limits the rendered list to 10 snapshots', () => {
    const many = Array.from({ length: 20 }, (_, i) => snap({ id: `s${i}` }));
    const html = RecoveryDialogUI({ snapshots: many, onRestore: () => {}, onDiscard: () => {} });
    const count = (html.match(/data-id=/g) || []).length;
    expect(count).toBe(10);
  });
});
