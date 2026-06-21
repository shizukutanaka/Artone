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

  // ── crash-safety: critical saves must not be dropped by an in-flight save ──

  it('drops an auto save while another save is in flight (status=saving)', async () => {
    (mgr as unknown as { status: string }).status = 'saving';
    const id = await mgr.saveSnapshot('auto', 'p', 'P', makeData());
    expect(id).toBeNull();
  });

  it('persists a CRASH snapshot even while a save is in flight', async () => {
    // Simulate an uncaught error firing mid-autosave: the crash snapshot must
    // still be written — losing it here defeats the whole recovery system.
    (mgr as unknown as { status: string }).status = 'saving';
    const id = await mgr.saveSnapshot('crash', 'p', 'P', makeData({ playhead: 7 }));
    expect(id).toBeTruthy();
    const snaps = await mgr.getSnapshots('p');
    expect(snaps.some((s) => s.type === 'crash')).toBe(true);
  });

  it('persists a MANUAL snapshot even while a save is in flight', async () => {
    (mgr as unknown as { status: string }).status = 'saving';
    const id = await mgr.saveSnapshot('manual', 'p', 'P', makeData());
    expect(id).toBeTruthy();
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

  it('deletes snapshots older than maxAge (data-loss-critical purge path)', async () => {
    // maxAge must straddle the two saves: larger than one enforceLimit() cycle
    // (so the just-saved snapshot survives) yet smaller than the gap between
    // saves (so the first ages out and is purged via deleteSnapshot()).
    const mgr = makeManager({ maxAge: 40, maxSnapshots: 100 });
    await mgr.init();
    const first = await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 1 }));
    expect(first).not.toBeNull();
    await new Promise(r => setTimeout(r, 150)); // age the first past maxAge
    await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 2 }));

    const snaps = await mgr.getSnapshots();
    // The aged-out first snapshot must be gone; the fresh one remains.
    expect(snaps.some(s => s.id === first)).toBe(false);
    expect(snaps.some(s => (s.data as RecoveryData).playhead === 2)).toBe(true);
  });

  it('retains snapshots within maxAge (no premature purge)', async () => {
    const mgr = makeManager({ maxAge: 60_000, maxSnapshots: 100 });
    await mgr.init();
    const first = await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 1 }));
    await new Promise(r => setTimeout(r, 5));
    await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 2 }));
    const snaps = await mgr.getSnapshots();
    // Both are well within maxAge → first must survive.
    expect(snaps.some(s => s.id === first)).toBe(true);
  });

  it('REGRESSION: maxSnapshots=0 does not delete all snapshots (data-loss bug)', async () => {
    // Bug: enforceLimit checks `kept >= maxSnapshots`. With maxSnapshots=0 that is
    // `kept >= 0` which is always true, so every snapshot (including the just-saved
    // one) was added to toDelete. The constructor now clamps to min 1.
    const mgr = makeManager({ maxSnapshots: 0 });
    await mgr.init();
    const id = await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 42 }));
    expect(id).toBeTruthy();
    // At least the latest snapshot must survive after enforceLimit.
    const snaps = await mgr.getSnapshots('p');
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    expect(snaps.some(s => s.id === id)).toBe(true);
  });

  it('deletes many excess snapshots in a single transaction (atomic prune)', async () => {
    // recovery/CLAUDE.md mandates transactional deletion. Build up 6 snapshots
    // under a high cap, then tighten the cap so the next save must prune 5 at
    // once — and verify that prune is ONE readwrite tx, not one per deletion.
    const mgr = makeManager({ maxSnapshots: 100 });
    await mgr.init();
    for (let i = 0; i < 6; i++) await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: i }));
    (mgr as unknown as { config: { maxSnapshots: number } }).config.maxSnapshots = 1;

    const db = (mgr as unknown as { db: IDBDatabase }).db;
    const realTx = db.transaction.bind(db);
    let rwTx = 0;
    vi.spyOn(db, 'transaction').mockImplementation((...args: Parameters<IDBDatabase['transaction']>) => {
      if (args[1] === 'readwrite') rwTx++;
      return realTx(...args);
    });
    await mgr.saveSnapshot('manual', 'p', 'P', makeData({ playhead: 99 }));
    vi.restoreAllMocks();

    const snaps = await mgr.getSnapshots();
    expect(snaps.length).toBe(1); // pruned 6 down to the newest
    // 1 write tx + exactly 1 batched delete tx. The old per-delete code would
    // open one readwrite tx per pruned snapshot (7 total).
    expect(rwTx).toBe(2);
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

  it('REGRESSION: totalSize counts UTF-8 bytes (not UTF-16 code units) for unicode data', async () => {
    // Bug: JSON.stringify(...).length returns UTF-16 code units — a 3-byte UTF-8
    // character (e.g. Japanese) counts as 1, not 3. For ASCII data both are equal,
    // but for multi-byte content the old code underreported size by up to 3×.
    const unicodeData = makeData({ timeline: { name: '日本語プロジェクト' } });
    await mgr.saveSnapshot('manual', 'p', 'P', unicodeData);
    const stats = await mgr.getStats();
    const jsonStr = JSON.stringify(unicodeData);
    // UTF-8 byte count must be ≥ JS .length (equal for ASCII, > for multi-byte)
    expect(stats.totalSize).toBeGreaterThanOrEqual(jsonStr.length);
    // The specific string contains multi-byte chars so byte count > code-unit count
    const enc = new TextEncoder();
    expect(enc.encode(jsonStr).byteLength).toBeGreaterThan(jsonStr.length);
    expect(stats.totalSize).toBe(enc.encode(jsonStr).byteLength);
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

  it('formatAge renders "min ago" for snapshots minutes old', () => {
    const html = RecoveryDialogUI({
      snapshots: [snap({ timestamp: Date.now() - 5 * 60_000 })],
      onRestore: () => {}, onDiscard: () => {},
    });
    expect(html).toContain('min ago');
  });

  it('formatAge renders "hr ago" for snapshots hours old', () => {
    const html = RecoveryDialogUI({
      snapshots: [snap({ timestamp: Date.now() - 3 * 3_600_000 })],
      onRestore: () => {}, onDiscard: () => {},
    });
    expect(html).toContain('hr ago');
  });

  it('formatAge renders "days ago" for snapshots days old', () => {
    const html = RecoveryDialogUI({
      snapshots: [snap({ timestamp: Date.now() - 2 * 86_400_000 })],
      onRestore: () => {}, onDiscard: () => {},
    });
    expect(html).toContain('days ago');
  });

  it('formatAge renders "just now" for fresh snapshots', () => {
    const html = RecoveryDialogUI({
      snapshots: [snap({ timestamp: Date.now() })],
      onRestore: () => {}, onDiscard: () => {},
    });
    expect(html).toContain('just now');
  });

  it('REGRESSION: projectName with HTML special chars is escaped to prevent XSS', () => {
    const html = RecoveryDialogUI({
      snapshots: [snap({ projectName: '<script>alert(1)</script>' })],
      onRestore: () => {}, onDiscard: () => {},
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('REGRESSION: snapshot id with HTML special chars is escaped in data-id attribute', () => {
    const html = RecoveryDialogUI({
      snapshots: [snap({ id: '"><img src=x onerror=alert(1)>' })],
      onRestore: () => {}, onDiscard: () => {},
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
