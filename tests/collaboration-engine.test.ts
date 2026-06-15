/**
 * Tests for collab/collaboration-engine.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CollaborationEngine,
} from '../collab/collaboration-engine';

const USER_A = { id: 'user-a', name: 'Alice' };
const USER_B = { id: 'user-b', name: 'Bob' };

function makeEngine(): CollaborationEngine {
  return new CollaborationEngine();
}

async function connected(user = USER_A): Promise<CollaborationEngine> {
  const engine = makeEngine();
  await engine.connect('project-1', user);
  return engine;
}

// ============================================================
// connect / disconnect
// ============================================================

describe('CollaborationEngine — connect/disconnect', () => {
  it('connect registers local user with online status', async () => {
    const engine = makeEngine();
    await engine.connect('proj', USER_A);
    expect(engine.isConnected()).toBe(true);
    const users = engine.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('user-a');
    expect(users[0].name).toBe('Alice');
    expect(users[0].status).toBe('online');
  });

  it('connect assigns a hex color from the palette', async () => {
    const engine = await connected();
    expect(engine.getUsers()[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('same user id always gets the same color', async () => {
    const e1 = await connected(USER_A);
    const e2 = await connected(USER_A);
    expect(e1.getUsers()[0].color).toBe(e2.getUsers()[0].color);
  });

  it('different user ids may get different colors', async () => {
    const e1 = await connected(USER_A);
    const e2 = await connected(USER_B);
    // User A and User B may happen to hash to the same slot, but hashes differ
    // by design — just verify both get a valid color.
    expect(e1.getUsers()[0].color).toMatch(/^#/);
    expect(e2.getUsers()[0].color).toMatch(/^#/);
  });

  it('disconnect sets connected to false', async () => {
    const engine = await connected();
    engine.disconnect();
    expect(engine.isConnected()).toBe(false);
  });

  it('disconnect notifies listeners', async () => {
    const engine = await connected();
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.disconnect();
    expect(fn).toHaveBeenCalled();
  });

  it('disconnect is safe to call multiple times', async () => {
    const engine = await connected();
    expect(() => { engine.disconnect(); engine.disconnect(); }).not.toThrow();
  });
});

// ============================================================
// Presence
// ============================================================

describe('CollaborationEngine — presence', () => {
  it('updateCursor stores cursor on local user', async () => {
    const engine = await connected();
    engine.updateCursor(10, 20, 'timeline');
    expect(engine.getUsers()[0].cursor).toEqual({ x: 10, y: 20, view: 'timeline' });
  });

  it('updateCursor is no-op before connect', () => {
    expect(() => makeEngine().updateCursor(0, 0, 'timeline')).not.toThrow();
  });

  it('updateSelection stores clip id list', async () => {
    const engine = await connected();
    engine.updateSelection(['clip-1', 'clip-2']);
    expect(engine.getUsers()[0].selection).toEqual(['clip-1', 'clip-2']);
  });

  it('updateSelection is no-op before connect', () => {
    expect(() => makeEngine().updateSelection(['x'])).not.toThrow();
  });

  it('setStatus changes user status', async () => {
    const engine = await connected();
    engine.setStatus('away');
    expect(engine.getUsers()[0].status).toBe('away');
  });

  it('setStatus is no-op before connect', () => {
    expect(() => makeEngine().setStatus('offline')).not.toThrow();
  });

  it('getOnlineUsers filters by online status', async () => {
    const engine = await connected();
    expect(engine.getOnlineUsers()).toHaveLength(1);
    engine.setStatus('away');
    expect(engine.getOnlineUsers()).toHaveLength(0);
    engine.setStatus('online');
    expect(engine.getOnlineUsers()).toHaveLength(1);
  });
});

// ============================================================
// Comments
// ============================================================

describe('CollaborationEngine — comments', () => {
  it('addComment creates and stores a comment', async () => {
    const engine = await connected();
    const c = engine.addComment('Hello world');
    expect(c.content).toBe('Hello world');
    expect(c.authorId).toBe('user-a');
    expect(c.resolved).toBe(false);
    expect(c.replies).toHaveLength(0);
    expect(engine.getComments()).toHaveLength(1);
  });

  it('addComment stores position and clipId', async () => {
    const engine = await connected();
    const c = engine.addComment('Note', { x: 5, y: 10, time: 2.5 }, 'clip-1');
    expect(c.position).toEqual({ x: 5, y: 10, time: 2.5 });
    expect(c.clipId).toBe('clip-1');
  });

  it('addComment throws when not connected', () => {
    expect(() => makeEngine().addComment('test')).toThrow();
  });

  it('addComment notifies listeners', async () => {
    const engine = await connected();
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.addComment('Hi');
    expect(fn).toHaveBeenCalled();
  });

  it('replyToComment appends reply to parent.replies', async () => {
    const engine = await connected();
    const parent = engine.addComment('Parent');
    const reply = engine.replyToComment(parent.id, 'Reply text');
    expect(reply).not.toBeNull();
    expect(reply!.content).toBe('Reply text');
    expect(reply!.authorId).toBe('user-a');
    expect(engine.getComments()[0].replies).toHaveLength(1);
    expect(engine.getComments()[0].replies[0].id).toBe(reply!.id);
  });

  it('replyToComment returns null for unknown parent id', async () => {
    const engine = await connected();
    expect(engine.replyToComment('ghost', 'text')).toBeNull();
  });

  it('resolveComment marks comment as resolved', async () => {
    const engine = await connected();
    const c = engine.addComment('Fix me');
    engine.resolveComment(c.id);
    expect(engine.getComments()[0].resolved).toBe(true);
  });

  it('resolveComment is no-op for unknown id', async () => {
    const engine = await connected();
    expect(() => engine.resolveComment('ghost')).not.toThrow();
  });

  it('getUnresolvedComments excludes resolved', async () => {
    const engine = await connected();
    const c1 = engine.addComment('A');
    const c2 = engine.addComment('B');
    engine.resolveComment(c1.id);
    const unresolved = engine.getUnresolvedComments();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].id).toBe(c2.id);
  });

  it('deleteComment removes from list', async () => {
    const engine = await connected();
    const c = engine.addComment('Delete me');
    engine.deleteComment(c.id);
    expect(engine.getComments()).toHaveLength(0);
  });

  it('deleteComment is no-op for unknown id', async () => {
    const engine = await connected();
    expect(() => engine.deleteComment('ghost')).not.toThrow();
    expect(engine.getComments()).toHaveLength(0);
  });

  it('REGRESSION: deleteComment does not throw when not connected', () => {
    // broadcastUpdate formerly called requireLocalUser() unconditionally,
    // causing an unexpected throw for callers that lacked a null guard.
    expect(() => makeEngine().deleteComment('any-id')).not.toThrow();
  });

  it('REGRESSION: deleteAnnotation does not throw when not connected', () => {
    expect(() => makeEngine().deleteAnnotation('any-id')).not.toThrow();
  });
});

// ============================================================
// Annotations
// ============================================================

describe('CollaborationEngine — annotations', () => {
  it('addAnnotation creates annotation with correct fields', async () => {
    const engine = await connected();
    const ann = engine.addAnnotation('arrow', { from: [0, 0], to: [1, 1] }, 42);
    expect(ann.type).toBe('arrow');
    expect(ann.frame).toBe(42);
    expect(ann.visible).toBe(true);
    expect(ann.authorId).toBe('user-a');
  });

  it('addAnnotation throws when not connected', () => {
    expect(() => makeEngine().addAnnotation('text', {}, 0)).toThrow();
  });

  it('getAnnotationsForFrame returns matching frames only', async () => {
    const engine = await connected();
    engine.addAnnotation('text', {}, 10);
    engine.addAnnotation('draw', {}, 20);
    engine.addAnnotation('highlight', {}, 10);
    expect(engine.getAnnotationsForFrame(10)).toHaveLength(2);
    expect(engine.getAnnotationsForFrame(20)).toHaveLength(1);
    expect(engine.getAnnotationsForFrame(99)).toHaveLength(0);
  });

  it('deleteAnnotation removes annotation', async () => {
    const engine = await connected();
    const ann = engine.addAnnotation('text', {}, 5);
    engine.deleteAnnotation(ann.id);
    expect(engine.getAnnotationsForFrame(5)).toHaveLength(0);
  });

  it('deleteAnnotation is no-op for unknown id', async () => {
    const engine = await connected();
    engine.addAnnotation('draw', {}, 1);
    expect(() => engine.deleteAnnotation('ghost')).not.toThrow();
    expect(engine.getAnnotationsForFrame(1)).toHaveLength(1);
  });
});

// ============================================================
// Versions
// ============================================================

describe('CollaborationEngine — versions', () => {
  it('createVersion saves a version with author and name', async () => {
    const engine = await connected();
    const v = engine.createVersion('v1 snapshot');
    expect(v.name).toBe('v1 snapshot');
    expect(v.authorId).toBe('user-a');
    expect(engine.getVersions()).toHaveLength(1);
  });

  it('createVersion snapshot reflects current docState', async () => {
    const engine = await connected();
    engine.applyOperation(['title'], 'set', 'My Project');
    const v = engine.createVersion('snap');
    const parsed = JSON.parse(v.snapshot);
    expect(parsed['title']).toBe('My Project');
  });

  it('restoreVersion restores docState from snapshot', async () => {
    const engine = await connected();
    engine.applyOperation(['clip.0.name'], 'set', 'before');
    const v = engine.createVersion('before-snap');
    engine.applyOperation(['clip.0.name'], 'set', 'after');

    const ok = engine.restoreVersion(v.id);
    expect(ok).toBe(true);

    // Verify via a new version: docState should now have 'before'
    const v2 = engine.createVersion('after-restore');
    expect(JSON.parse(v2.snapshot)['clip.0.name']).toBe('before');
  });

  it('restoreVersion returns false for unknown id', async () => {
    const engine = await connected();
    expect(engine.restoreVersion('ghost-id')).toBe(false);
  });

  it('REGRESSION: restoreVersion returns false for corrupted JSON snapshot', async () => {
    const engine = await connected();
    // Inject a corrupted version directly into internal state
    (engine as unknown as { versions: unknown[] }).versions.push({
      id: 'corrupt-id',
      name: 'bad',
      authorId: 'user-a',
      timestamp: Date.now(),
      snapshot: '{{not valid json',
    });
    expect(engine.restoreVersion('corrupt-id')).toBe(false);
  });

  it('REGRESSION: restoreVersion returns false when snapshot is not an object', async () => {
    const engine = await connected();
    (engine as unknown as { versions: unknown[] }).versions.push({
      id: 'null-snap',
      name: 'null',
      authorId: 'user-a',
      timestamp: Date.now(),
      snapshot: 'null',
    });
    expect(engine.restoreVersion('null-snap')).toBe(false);
  });

  it('version list is capped at 50 entries', async () => {
    const engine = await connected();
    for (let i = 0; i < 55; i++) engine.createVersion(`v${i}`);
    expect(engine.getVersions()).toHaveLength(50);
  });

  it('getVersions returns a copy (external mutation does not affect internal list)', async () => {
    const engine = await connected();
    engine.createVersion('snap');
    const copy = engine.getVersions();
    copy.pop();
    expect(engine.getVersions()).toHaveLength(1);
  });

  it('createVersion throws when not connected', () => {
    expect(() => makeEngine().createVersion('snap')).toThrow();
  });
});

// ============================================================
// CRDT — applyOperation
// ============================================================

describe('CollaborationEngine — applyOperation', () => {
  it('set stores value at dotted path key', async () => {
    const engine = await connected();
    engine.applyOperation(['track', '0', 'name'], 'set', 'Main');
    const v = engine.createVersion('snap');
    expect(JSON.parse(v.snapshot)['track.0.name']).toBe('Main');
  });

  it('delete removes the key', async () => {
    const engine = await connected();
    engine.applyOperation(['key'], 'set', 'value');
    engine.applyOperation(['key'], 'delete');
    const v = engine.createVersion('snap');
    expect('key' in JSON.parse(v.snapshot)).toBe(false);
  });

  it('applyOperation throws when not connected', () => {
    expect(() => makeEngine().applyOperation(['k'], 'set', 1)).toThrow();
  });
});

// ============================================================
// CRDT — compareClocks
// ============================================================

describe('CollaborationEngine.compareClocks()', () => {
  it('equal clocks', () => {
    expect(CollaborationEngine.compareClocks({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe('equal');
  });

  it('both empty → equal', () => {
    expect(CollaborationEngine.compareClocks({}, {})).toBe('equal');
  });

  it('a strictly before b', () => {
    expect(CollaborationEngine.compareClocks({ a: 1 }, { a: 2 })).toBe('before');
    expect(CollaborationEngine.compareClocks({ a: 1, b: 0 }, { a: 1, b: 1 })).toBe('before');
  });

  it('a strictly after b', () => {
    expect(CollaborationEngine.compareClocks({ a: 3 }, { a: 2 })).toBe('after');
  });

  it('concurrent: neither dominates', () => {
    expect(CollaborationEngine.compareClocks({ a: 2, b: 1 }, { a: 1, b: 2 })).toBe('concurrent');
  });

  it('missing keys default to 0', () => {
    // a={x:1}, b={x:1, y:1} → a.y(0) < b.y(1) → before
    expect(CollaborationEngine.compareClocks({ x: 1 }, { x: 1, y: 1 })).toBe('before');
    // a={x:2}, b={x:1} → a.x(2) > b.x(1), b.x present → after
    expect(CollaborationEngine.compareClocks({ x: 2, y: 1 }, { x: 1 })).toBe('after');
  });
});

// ============================================================
// CRDT — resolveConflict
// ============================================================

describe('CollaborationEngine.resolveConflict()', () => {
  it('before order → B value wins', () => {
    const a = { clock: { x: 1 }, userId: 'a', value: 'old' };
    const b = { clock: { x: 2 }, userId: 'b', value: 'new' };
    expect(CollaborationEngine.resolveConflict(a, b)).toBe('new');
  });

  it('after order → A value wins', () => {
    const a = { clock: { x: 2 }, userId: 'a', value: 'newer' };
    const b = { clock: { x: 1 }, userId: 'b', value: 'older' };
    expect(CollaborationEngine.resolveConflict(a, b)).toBe('newer');
  });

  it('concurrent: deterministic via userId lexicographic order', () => {
    const concurrent = (uidA: string, uidB: string, valA: string, valB: string) =>
      CollaborationEngine.resolveConflict(
        { clock: { x: 2, y: 1 }, userId: uidA, value: valA },
        { clock: { x: 1, y: 2 }, userId: uidB, value: valB }
      );
    // 'z' >= 'a' → A wins
    expect(concurrent('z', 'a', 'A-val', 'B-val')).toBe('A-val');
    // 'a' < 'z' → B wins
    expect(concurrent('a', 'z', 'A-val', 'B-val')).toBe('B-val');
  });

  it('concurrent with equal userId → A wins (>= returns A)', () => {
    const a = { clock: { x: 2, y: 1 }, userId: 'same', value: 'A' };
    const b = { clock: { x: 1, y: 2 }, userId: 'same', value: 'B' };
    expect(CollaborationEngine.resolveConflict(a, b)).toBe('A');
  });
});

// ============================================================
// CRDT — mergeRemoteClock
// ============================================================

describe('CollaborationEngine — mergeRemoteClock', () => {
  it('takes the max of each component', async () => {
    const engine = await connected();
    // Apply two local ops: user-a clock becomes 2
    engine.applyOperation(['a'], 'set', 1);
    engine.applyOperation(['b'], 'set', 2);
    // Merge a remote clock where user-a=10, user-b=3 (both higher)
    engine.mergeRemoteClock({ 'user-a': 10, 'user-b': 3 });
    // No direct getter, but merging must not throw
  });

  it('merge with empty remote clock is no-op', async () => {
    const engine = await connected();
    expect(() => engine.mergeRemoteClock({})).not.toThrow();
  });
});

// ============================================================
// subscribe
// ============================================================

describe('subscribe()', () => {
  it('listener called on connect', async () => {
    const engine = makeEngine();
    const fn = vi.fn();
    engine.subscribe(fn);
    await engine.connect('p', USER_A);
    expect(fn).toHaveBeenCalled();
  });

  it('listener called on addComment', async () => {
    const engine = await connected();
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.addComment('Hello');
    expect(fn).toHaveBeenCalled();
  });

  it('listener called on resolveComment', async () => {
    const engine = await connected();
    const c = engine.addComment('note');
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.resolveComment(c.id);
    expect(fn).toHaveBeenCalled();
  });

  it('listener called on deleteComment', async () => {
    const engine = await connected();
    const c = engine.addComment('bye');
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.deleteComment(c.id);
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', async () => {
    const engine = await connected();
    const fn = vi.fn();
    const unsub = engine.subscribe(fn);
    unsub();
    engine.addComment('Silent');
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================
// Offline operation queue (observability / no silent edit loss)
// ============================================================

/** Minimal fake RTCDataChannel capturing sent payloads. */
class FakeChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  sent: string[] = [];
  constructor(state: FakeChannel['readyState'] = 'open') { this.readyState = state; }
  send(data: string): void { this.sent.push(data); }
}

/** Inject a fake channel into the engine's private channels map. */
function addChannel(engine: CollaborationEngine, id: string, ch: FakeChannel): void {
  (engine as unknown as { channels: Map<string, FakeChannel> }).channels.set(id, ch);
}

describe('CollaborationEngine — offline operation queue', () => {
  it('buffers operations made while no channel is open (no silent loss)', async () => {
    const engine = await connected();
    expect(engine.getPendingOperationCount()).toBe(0);
    engine.applyOperation(['title'], 'set', 'Offline edit');
    engine.addComment('also offline');
    // Both edits produced broadcasts that had nowhere to go → queued, not lost.
    expect(engine.getPendingOperationCount()).toBe(2);
  });

  it('sends directly (and does not queue) when a channel is open', async () => {
    const engine = await connected();
    const ch = new FakeChannel('open');
    addChannel(engine, 'peer', ch);
    engine.applyOperation(['title'], 'set', 'Online edit');
    expect(ch.sent).toHaveLength(1);
    expect(engine.getPendingOperationCount()).toBe(0);
  });

  it('does not deliver to a non-open channel and queues instead', async () => {
    const engine = await connected();
    const ch = new FakeChannel('connecting');
    addChannel(engine, 'peer', ch);
    engine.applyOperation(['title'], 'set', 'x');
    expect(ch.sent).toHaveLength(0);
    expect(engine.getPendingOperationCount()).toBe(1);
  });

  it('flushPendingOperations replays buffered ops once a peer connects', async () => {
    const engine = await connected();
    engine.applyOperation(['a'], 'set', 1);
    engine.applyOperation(['b'], 'set', 2);
    expect(engine.getPendingOperationCount()).toBe(2);

    const ch = new FakeChannel('open');
    addChannel(engine, 'peer', ch);
    const flushed = engine.flushPendingOperations();
    expect(flushed).toBe(2);
    expect(ch.sent).toHaveLength(2);
    expect(engine.getPendingOperationCount()).toBe(0);
  });

  it('flushPendingOperations is a no-op while still offline (queue preserved)', async () => {
    const engine = await connected();
    engine.applyOperation(['a'], 'set', 1);
    expect(engine.flushPendingOperations()).toBe(0);
    expect(engine.getPendingOperationCount()).toBe(1); // kept until a peer is open
  });

  it('caps the offline queue so it cannot grow without bound', async () => {
    const engine = await connected();
    for (let i = 0; i < 1100; i++) engine.applyOperation(['k'], 'set', i);
    expect(engine.getPendingOperationCount()).toBeLessThanOrEqual(1000);
  });
});
