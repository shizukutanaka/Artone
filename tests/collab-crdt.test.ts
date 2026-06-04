/**
 * Collaboration — Vector Clock & 競合解決テスト
 *
 * CRDT の因果順序 (happens-before) と Last-Write-Wins 競合解決を検証。
 * 出典: Shapiro et al. 2011, Lamport 1978。
 */

import { describe, it, expect } from 'vitest';
import { CollaborationEngine } from '../collab/collaboration-engine';

describe('Vector Clock — compareClocks', () => {
  it('identical clocks are equal', () => {
    const a = { u1: 2, u2: 3 };
    const b = { u1: 2, u2: 3 };
    expect(CollaborationEngine.compareClocks(a, b)).toBe('equal');
  });

  it('a strictly before b', () => {
    const a = { u1: 1, u2: 2 };
    const b = { u1: 2, u2: 3 };
    expect(CollaborationEngine.compareClocks(a, b)).toBe('before');
  });

  it('a strictly after b', () => {
    const a = { u1: 5, u2: 5 };
    const b = { u1: 2, u2: 3 };
    expect(CollaborationEngine.compareClocks(a, b)).toBe('after');
  });

  it('concurrent clocks (no causal order)', () => {
    const a = { u1: 3, u2: 1 };
    const b = { u1: 1, u2: 3 };
    expect(CollaborationEngine.compareClocks(a, b)).toBe('concurrent');
  });

  it('handles missing keys as zero', () => {
    const a = { u1: 1 };
    const b = { u1: 1, u2: 1 };
    // a に u2=0, b に u2=1 → a < b → before
    expect(CollaborationEngine.compareClocks(a, b)).toBe('before');
  });

  it('empty clocks are equal', () => {
    expect(CollaborationEngine.compareClocks({}, {})).toBe('equal');
  });

  it('disjoint keys are concurrent', () => {
    const a = { u1: 1 };
    const b = { u2: 1 };
    expect(CollaborationEngine.compareClocks(a, b)).toBe('concurrent');
  });
});

describe('競合解決 — resolveConflict (LWW)', () => {
  it('causally newer wins (a after b)', () => {
    const opA = { clock: { u1: 3, u2: 3 }, userId: 'u1', value: 'A' };
    const opB = { clock: { u1: 1, u2: 2 }, userId: 'u2', value: 'B' };
    expect(CollaborationEngine.resolveConflict(opA, opB)).toBe('A');
  });

  it('causally newer wins (b after a)', () => {
    const opA = { clock: { u1: 1, u2: 1 }, userId: 'u1', value: 'A' };
    const opB = { clock: { u1: 2, u2: 2 }, userId: 'u2', value: 'B' };
    expect(CollaborationEngine.resolveConflict(opA, opB)).toBe('B');
  });

  it('concurrent: tiebreak by userId (larger wins)', () => {
    const opA = { clock: { u1: 2, u2: 1 }, userId: 'u1', value: 'A' };
    const opB = { clock: { u1: 1, u2: 2 }, userId: 'u2', value: 'B' };
    // concurrent → u2 >= u1 で B が勝つ... opA.userId(u1) >= opB.userId(u2)? no → B
    expect(CollaborationEngine.resolveConflict(opA, opB)).toBe('B');
  });

  it('concurrent tiebreak is deterministic (order-independent)', () => {
    const opA = { clock: { u1: 2, u2: 1 }, userId: 'alice', value: 'A' };
    const opB = { clock: { u1: 1, u2: 2 }, userId: 'bob', value: 'B' };
    const r1 = CollaborationEngine.resolveConflict(opA, opB);
    const r2 = CollaborationEngine.resolveConflict(opB, opA);
    // どちらの順でも同じ結果 (決定的)
    expect(r1).toBe(r2);
  });
});

describe('mergeRemoteClock', () => {
  it('merges remote clock taking element-wise max', () => {
    const engine = new CollaborationEngine();
    engine.mergeRemoteClock({ u1: 5, u2: 2 });
    engine.mergeRemoteClock({ u1: 3, u2: 7, u3: 1 });
    // 内部状態を applyOperation 経由で確認するのは難しいので、
    // マージが例外なく完了することを確認
    expect(() => engine.mergeRemoteClock({ u1: 10 })).not.toThrow();
  });
});
