/**
 * Tests for app/storage-persistence.ts
 *
 * navigator.storage (StorageManager) をモックして、永続化要求・容量見積もり・
 * 非対応環境フォールバックを検証する。すべての関数は throw しない契約。
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  requestPersistentStorage,
  isStoragePersisted,
  getStorageEstimate,
  isStorageNearFull,
} from '../app/storage-persistence';

/** Install a fake navigator.storage with the given method stubs. */
function stubStorage(storage: Partial<StorageManager> | undefined): void {
  vi.stubGlobal('navigator', storage === undefined ? {} : { storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── requestPersistentStorage ───────────────────────────────────────────────────

describe('requestPersistentStorage', () => {
  it('returns supported:false when navigator.storage is absent', async () => {
    stubStorage(undefined);
    const r = await requestPersistentStorage();
    expect(r).toEqual({ supported: false, persisted: false, requested: false });
  });

  it('returns supported:false when persist is not a function', async () => {
    stubStorage({ persisted: vi.fn() } as unknown as StorageManager);
    const r = await requestPersistentStorage();
    expect(r.supported).toBe(false);
  });

  it('does NOT re-request when already persisted (idempotent)', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(true);
    stubStorage({ persist, persisted } as unknown as StorageManager);

    const r = await requestPersistentStorage();
    expect(r).toEqual({ supported: true, persisted: true, requested: false });
    expect(persist).not.toHaveBeenCalled(); // already granted → no re-request
  });

  it('requests and reports granted when persist() resolves true', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    stubStorage({ persist, persisted } as unknown as StorageManager);

    const r = await requestPersistentStorage();
    expect(r).toEqual({ supported: true, persisted: true, requested: true });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('requests and reports denied when persist() resolves false', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    const persisted = vi.fn().mockResolvedValue(false);
    stubStorage({ persist, persisted } as unknown as StorageManager);

    const r = await requestPersistentStorage();
    expect(r).toEqual({ supported: true, persisted: false, requested: true });
  });

  it('never throws when persist() rejects', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('SecurityError'));
    const persisted = vi.fn().mockResolvedValue(false);
    stubStorage({ persist, persisted } as unknown as StorageManager);

    const r = await requestPersistentStorage();
    expect(r).toEqual({ supported: true, persisted: false, requested: true });
  });
});

// ─── isStoragePersisted ─────────────────────────────────────────────────────────

describe('isStoragePersisted', () => {
  it('returns false when navigator.storage is absent', async () => {
    stubStorage(undefined);
    expect(await isStoragePersisted()).toBe(false);
  });

  it('returns false when persisted is not a function', async () => {
    stubStorage({ persist: vi.fn() } as unknown as StorageManager);
    expect(await isStoragePersisted()).toBe(false);
  });

  it('reflects persisted() result', async () => {
    stubStorage({ persist: vi.fn(), persisted: vi.fn().mockResolvedValue(true) } as unknown as StorageManager);
    expect(await isStoragePersisted()).toBe(true);
  });

  it('returns false (not throw) when persisted() rejects', async () => {
    stubStorage({
      persist: vi.fn(),
      persisted: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as StorageManager);
    expect(await isStoragePersisted()).toBe(false);
  });
});

// ─── getStorageEstimate ─────────────────────────────────────────────────────────

describe('getStorageEstimate', () => {
  it('returns supported:false zero-values when estimate is unavailable', async () => {
    stubStorage({ persist: vi.fn() } as unknown as StorageManager);
    const e = await getStorageEstimate();
    expect(e).toEqual({ supported: false, usageBytes: 0, quotaBytes: 0, percentUsed: 0, availableBytes: 0 });
  });

  it('computes percentUsed and availableBytes from estimate()', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 250, quota: 1000 }),
    } as unknown as StorageManager);
    const e = await getStorageEstimate();
    expect(e.supported).toBe(true);
    expect(e.usageBytes).toBe(250);
    expect(e.quotaBytes).toBe(1000);
    expect(e.percentUsed).toBeCloseTo(0.25, 5);
    expect(e.availableBytes).toBe(750);
  });

  it('handles missing usage/quota fields as 0', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({}),
    } as unknown as StorageManager);
    const e = await getStorageEstimate();
    expect(e.usageBytes).toBe(0);
    expect(e.quotaBytes).toBe(0);
    expect(e.percentUsed).toBe(0); // no divide-by-zero
  });

  it('quota=0 does not produce NaN/Infinity percentUsed', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 0 }),
    } as unknown as StorageManager);
    const e = await getStorageEstimate();
    expect(Number.isFinite(e.percentUsed)).toBe(true);
    expect(e.percentUsed).toBe(0);
  });

  it('availableBytes never goes negative when usage exceeds quota', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 1500, quota: 1000 }),
    } as unknown as StorageManager);
    const e = await getStorageEstimate();
    expect(e.availableBytes).toBe(0);
  });

  it('returns supported:false (not throw) when estimate() rejects', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockRejectedValue(new Error('quota error')),
    } as unknown as StorageManager);
    const e = await getStorageEstimate();
    expect(e.supported).toBe(false);
  });
});

// ─── isStorageNearFull ──────────────────────────────────────────────────────────

describe('isStorageNearFull', () => {
  it('returns false when storage API unavailable', async () => {
    stubStorage(undefined);
    expect(await isStorageNearFull()).toBe(false);
  });

  it('true when usage ≥ 90% (default threshold)', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 950, quota: 1000 }),
    } as unknown as StorageManager);
    expect(await isStorageNearFull()).toBe(true);
  });

  it('false when usage below threshold', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 500, quota: 1000 }),
    } as unknown as StorageManager);
    expect(await isStorageNearFull()).toBe(false);
  });

  it('respects a custom threshold', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 600, quota: 1000 }),
    } as unknown as StorageManager);
    expect(await isStorageNearFull(0.5)).toBe(true);
    expect(await isStorageNearFull(0.7)).toBe(false);
  });

  it('false when quota is 0 (avoids false alarm)', async () => {
    stubStorage({
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 0 }),
    } as unknown as StorageManager);
    expect(await isStorageNearFull()).toBe(false);
  });
});
