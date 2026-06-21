/**
 * Artone v3 — Persistent Storage Manager
 *
 * 10年ローカルファースト・データ主権ユーザー側を掲げる Artone にとって、
 * IndexedDB に保存されるプロジェクト/リカバリ/プロキシは**絶対に失われては
 * ならない**。しかしブラウザのデフォルトは "best-effort" ストレージで、
 * ディスク逼迫時に**ユーザーに無断で退避 (eviction)** されうる。
 *
 * `navigator.storage.persist()` で "persistent" バケットを要求すると、退避
 * 対象から外れる (ユーザーが明示的に削除しない限り保持)。これは local-first
 * アプリの必須初期化であり、本モジュールはその要求と容量見積もりを提供する。
 *
 * 参考 (Zenn/Qiita リサーチ):
 * - https://zenn.dev/peter_norio/articles/e0620bfd7feb8f (storage.estimate)
 * - https://zenn.dev/tosa/articles/0f1f82afd9a8aa (容量超過時の動作)
 * - MDN: StorageManager.persist()
 *
 * すべての関数は throw せず、API 非対応環境 (非セキュアコンテキスト・古い
 * ブラウザ・SSR) では安全なフォールバック値を返す。
 *
 * # AI generated (reviewed)
 */

import { createLogger } from './logger';

const log = createLogger('StoragePersistence');

/** ストレージ永続化要求の結果。 */
export interface PersistResult {
  /** ブラウザが `navigator.storage` をサポートするか。 */
  supported: boolean;
  /** 永続化が許可されているか (要求後の最終状態)。 */
  persisted: boolean;
  /** 今回の呼び出しで実際に `persist()` を要求したか (既に許可済みなら false)。 */
  requested: boolean;
}

/** ストレージ使用量の見積もり (バイト)。 */
export interface StorageEstimate {
  /** `navigator.storage.estimate()` が利用可能か。 */
  supported: boolean;
  /** 使用中バイト数。 */
  usageBytes: number;
  /** 割当上限バイト数。 */
  quotaBytes: number;
  /** 使用率 [0, 1]。quota が 0 のときは 0。 */
  percentUsed: number;
  /** 残り利用可能バイト数 (max(0, quota − usage))。 */
  availableBytes: number;
}

/**
 * `navigator.storage` (StorageManager) を安全に取得する。
 * 非対応環境では null。
 */
function getStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  const sm = (navigator as Navigator & { storage?: StorageManager }).storage;
  if (!sm || typeof sm.persist !== 'function') return null;
  return sm;
}

/**
 * 現在ストレージが永続化されているかを返す。
 * 非対応環境・エラー時は false。
 */
export async function isStoragePersisted(): Promise<boolean> {
  const sm = getStorageManager();
  if (!sm || typeof sm.persisted !== 'function') return false;
  try {
    return await sm.persisted();
  } catch (e) {
    log.warn('navigator.storage.persisted() failed', e);
    return false;
  }
}

/**
 * 永続ストレージを要求する (冪等)。既に許可済みなら `persist()` を呼ばず
 * その旨を返す。アプリ起動時に一度呼ぶことを想定。
 *
 * @returns 要求結果 (supported / persisted / requested)
 */
export async function requestPersistentStorage(): Promise<PersistResult> {
  const sm = getStorageManager();
  if (!sm) {
    return { supported: false, persisted: false, requested: false };
  }

  // 既に許可済みなら再要求しない (一部ブラウザは再要求でプロンプトを出す)。
  const already = await isStoragePersisted();
  if (already) {
    return { supported: true, persisted: true, requested: false };
  }

  try {
    const granted = await sm.persist();
    if (granted) {
      log.info('Persistent storage granted — IndexedDB protected from eviction');
    } else {
      log.warn('Persistent storage denied — data may be evicted under storage pressure');
    }
    return { supported: true, persisted: granted, requested: true };
  } catch (e) {
    log.warn('navigator.storage.persist() failed', e);
    return { supported: true, persisted: false, requested: true };
  }
}

/**
 * ストレージ使用量を見積もる。非対応環境・エラー時は supported:false の
 * ゼロ値を返す (throw しない)。
 */
export async function getStorageEstimate(): Promise<StorageEstimate> {
  const sm = getStorageManager();
  if (!sm || typeof sm.estimate !== 'function') {
    return { supported: false, usageBytes: 0, quotaBytes: 0, percentUsed: 0, availableBytes: 0 };
  }
  try {
    const { usage = 0, quota = 0 } = await sm.estimate();
    const percentUsed = quota > 0 ? usage / quota : 0;
    const availableBytes = Math.max(0, quota - usage);
    return { supported: true, usageBytes: usage, quotaBytes: quota, percentUsed, availableBytes };
  } catch (e) {
    log.warn('navigator.storage.estimate() failed', e);
    return { supported: false, usageBytes: 0, quotaBytes: 0, percentUsed: 0, availableBytes: 0 };
  }
}

/**
 * 使用率が `threshold` (デフォルト 0.9 = 90%) を超えているか。
 * UI でストレージ逼迫警告を出すための判定に使う。非対応時は false。
 */
export async function isStorageNearFull(threshold = 0.9): Promise<boolean> {
  const est = await getStorageEstimate();
  if (!est.supported || est.quotaBytes === 0) return false;
  return est.percentUsed >= threshold;
}
