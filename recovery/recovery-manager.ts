/**
 * Artone v3 — Error Recovery System
 * 
 * クラッシュリカバリ・自動バックアップ
 * - 定期自動保存
 * - クラッシュ検出
 * - 状態復元
 * - バージョン履歴
 * 
 * Carmack: 堅牢性、データ損失防止
 * Martin: 単一責務、明確なAPI
 * Pike: シンプルな回復フロー
 */
import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../app/utils';
import { createLogger } from '../app/logger';

// ============================================================
// Types
// ============================================================

const log = createLogger('Recovery');

export interface RecoverySnapshot {
  id: string;
  timestamp: number;
  type: 'auto' | 'manual' | 'crash';
  projectId: string;
  projectName: string;
  data: RecoveryData;
  checksum: string;
}

export interface RecoveryData {
  timeline: unknown;
  clips: unknown[];
  tracks: unknown[];
  effects: unknown[];
  markers: unknown[];
  playhead: number;
  selection: string[];
  historyPosition: number;
  settings: unknown;
}

export interface RecoveryConfig {
  autoSaveInterval: number; // ms
  maxSnapshots: number;
  maxAge: number; // ms
  dbName: string;
  storeName: string;
}

export type RecoveryStatus = 
  | 'idle'
  | 'saving'
  | 'restoring'
  | 'error';

// ============================================================
// Checksum
// ============================================================

async function computeChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Recovery Manager
// ============================================================

export class RecoveryManager {
  private config: RecoveryConfig;
  private db: IDBDatabase | null = null;
  private status: RecoveryStatus = 'idle';
  private autoSaveTimer: number | null = null;
  private lastSaveTime = 0;
  private listeners: Set<(status: RecoveryStatus) => void> = new Set();
  private crashFlag = 'artone_crash_flag';
  /** Guards against attaching crash-detection listeners more than once. */
  private crashDetectionSetup = false;

  constructor(config: Partial<RecoveryConfig> = {}) {
    this.config = {
      autoSaveInterval: 30000, // 30 seconds
      maxSnapshots: 50,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      dbName: 'ArtoneRecovery',
      storeName: 'snapshots',
      ...config
    };
  }

  // ----- 初期化 -----

  /** DB が null なら例外。init() 前の操作を防ぐ。 */
  private requireDB(): IDBDatabase {
    if (!this.db) throw new Error('Database not initialized.');
    return this.db;
  }

  async init(): Promise<void> {
    await this.openDB();
    this.setupCrashDetection();
    await this.cleanup();
  }

  private async openDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
    });
  }

  // ----- クラッシュ検出 -----
  private setupCrashDetection(): void {
    // Idempotent: window listeners below are anonymous and cannot be removed,
    // so attaching them more than once would stack duplicate handlers (a memory
    // leak that also fires saveSnapshot multiple times per error).
    if (this.crashDetectionSetup) return;
    this.crashDetectionSetup = true;

    // Set crash flag on load
    const hadCrash = safeStorageGet(this.crashFlag) === 'true';
    safeStorageSet(this.crashFlag, 'true');

    // Clear flag on clean exit
    window.addEventListener('beforeunload', () => {
      safeStorageRemove(this.crashFlag);
    });

    // Handle errors
    window.addEventListener('error', () => {
      this.saveSnapshot('crash');
    });

    window.addEventListener('unhandledrejection', () => {
      this.saveSnapshot('crash');
    });

    // Check for previous crash
    if (hadCrash) {
      log.warn('Previous session crashed. Recovery data may be available.');
    }
  }

  // ----- 自動保存 -----
  startAutoSave(getData: () => RecoveryData, projectId: string, projectName: string): void {
    this.stopAutoSave();

    this.autoSaveTimer = window.setInterval(async () => {
      const data = getData();
      await this.saveSnapshot('auto', projectId, projectName, data);
    }, this.config.autoSaveInterval);

    // Save immediately on start
    const data = getData();
    this.saveSnapshot('auto', projectId, projectName, data);
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ----- スナップショット保存 -----
  async saveSnapshot(
    type: RecoverySnapshot['type'],
    projectId?: string,
    projectName?: string,
    data?: RecoveryData
  ): Promise<string | null> {
    if (!this.db || !data) return null;
    if (this.status === 'saving') return null;

    // Throttle saves
    const now = Date.now();
    if (type === 'auto' && now - this.lastSaveTime < 5000) {
      return null;
    }

    this.setStatus('saving');
    this.lastSaveTime = now;

    try {
      const dataStr = JSON.stringify(data);
      const checksum = await computeChecksum(dataStr);

      const snapshot: RecoverySnapshot = {
        id: generateId(),
        timestamp: now,
        type,
        projectId: projectId || 'unknown',
        projectName: projectName || 'Untitled',
        data,
        checksum
      };

      await this.writeSnapshot(snapshot);
      
      // Enforce limits
      await this.enforceLimit();

      this.setStatus('idle');
      return snapshot.id;
    } catch (e) {
      log.error('Failed to save snapshot:', e);
      this.setStatus('error');
      return null;
    }
  }

  private async writeSnapshot(snapshot: RecoverySnapshot): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction(this.config.storeName, 'readwrite');
      const store = tx.objectStore(this.config.storeName);
      const request = store.put(snapshot);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ----- スナップショット取得 -----
  async getSnapshots(projectId?: string): Promise<RecoverySnapshot[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction(this.config.storeName, 'readonly');
      const store = tx.objectStore(this.config.storeName);
      
      let request: IDBRequest;
      if (projectId) {
        const index = store.index('projectId');
        request = index.getAll(projectId);
      } else {
        request = store.getAll();
      }
      
      request.onsuccess = () => {
        const snapshots = request.result as RecoverySnapshot[];
        // Sort by timestamp descending
        snapshots.sort((a, b) => b.timestamp - a.timestamp);
        resolve(snapshots);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async getLatestSnapshot(projectId?: string): Promise<RecoverySnapshot | null> {
    const snapshots = await this.getSnapshots(projectId);
    return snapshots[0] || null;
  }

  // ----- 復元 -----
  async restoreSnapshot(snapshotId: string): Promise<RecoveryData | null> {
    if (!this.db) return null;

    this.setStatus('restoring');

    try {
      const snapshot = await this.readSnapshot(snapshotId);
      if (!snapshot) {
        this.setStatus('error');
        return null;
      }

      // Verify checksum
      const dataStr = JSON.stringify(snapshot.data);
      const checksum = await computeChecksum(dataStr);
      
      if (checksum !== snapshot.checksum) {
        log.error('Snapshot checksum mismatch');
        this.setStatus('error');
        return null;
      }

      this.setStatus('idle');
      return snapshot.data;
    } catch (e) {
      log.error('Failed to restore snapshot:', e);
      this.setStatus('error');
      return null;
    }
  }

  private async readSnapshot(id: string): Promise<RecoverySnapshot | null> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction(this.config.storeName, 'readonly');
      const store = tx.objectStore(this.config.storeName);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ----- 削除 -----
  async deleteSnapshot(id: string): Promise<boolean> {
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.requireDB().transaction(this.config.storeName, 'readwrite');
      const store = tx.objectStore(this.config.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }

  async clearProject(projectId: string): Promise<void> {
    const snapshots = await this.getSnapshots(projectId);
    for (const snapshot of snapshots) {
      await this.deleteSnapshot(snapshot.id);
    }
  }

  async clearAll(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.requireDB().transaction(this.config.storeName, 'readwrite');
      const store = tx.objectStore(this.config.storeName);
      store.clear();
      tx.oncomplete = () => resolve();
    });
  }

  // ----- 制限適用 -----
  private async enforceLimit(): Promise<void> {
    const snapshots = await this.getSnapshots();
    const now = Date.now();

    // Remove old snapshots
    for (const snapshot of snapshots) {
      if (now - snapshot.timestamp > this.config.maxAge) {
        await this.deleteSnapshot(snapshot.id);
      }
    }

    // Remove excess snapshots (keep most recent)
    const remaining = await this.getSnapshots();
    if (remaining.length > this.config.maxSnapshots) {
      const toRemove = remaining.slice(this.config.maxSnapshots);
      for (const snapshot of toRemove) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
  }

  private async cleanup(): Promise<void> {
    await this.enforceLimit();
  }

  // ----- 状態管理 -----
  getStatus(): RecoveryStatus {
    return this.status;
  }

  private setStatus(status: RecoveryStatus): void {
    this.status = status;
    this.listeners.forEach(listener => listener(status));
  }

  subscribe(listener: (status: RecoveryStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ----- 統計 -----
  async getStats(): Promise<{
    totalSnapshots: number;
    totalSize: number;
    oldestSnapshot: number | null;
    newestSnapshot: number | null;
  }> {
    const snapshots = await this.getSnapshots();
    
    let totalSize = 0;
    for (const snapshot of snapshots) {
      totalSize += JSON.stringify(snapshot.data).length;
    }

    return {
      totalSnapshots: snapshots.length,
      totalSize,
      oldestSnapshot: snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : null,
      newestSnapshot: snapshots.length > 0 ? snapshots[0].timestamp : null
    };
  }

  // ----- 廃棄 -----
  dispose(): void {
    this.stopAutoSave();
    this.db?.close();
    safeStorageRemove(this.crashFlag);
  }
}

// ============================================================
// Recovery Dialog UI
// ============================================================

export function RecoveryDialogUI(props: {
  snapshots: RecoverySnapshot[];
  onRestore: (id: string) => void;
  onDiscard: () => void;
}): string {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  const formatAge = (ts: number) => {
    const age = Date.now() - ts;
    if (age < 60000) return 'just now';
    if (age < 3600000) return `${Math.floor(age / 60000)} min ago`;
    if (age < 86400000) return `${Math.floor(age / 3600000)} hr ago`;
    return `${Math.floor(age / 86400000)} days ago`;
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'auto': return '⏱';
      case 'manual': return '💾';
      case 'crash': return '⚠️';
      default: return '📄';
    }
  };

  return `
    <div class="recovery-dialog" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    ">
      <div class="recovery-content" style="
        background: #1a1a1a;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <h2 style="
          margin: 0 0 16px 0;
          color: #fff;
          font-size: 18px;
          font-weight: 600;
        ">
          Recover Previous Work
        </h2>
        
        <p style="
          color: #888;
          font-size: 13px;
          margin: 0 0 16px 0;
        ">
          Select a version to restore:
        </p>
        
        <div class="snapshot-list" style="
          flex: 1;
          overflow-y: auto;
          margin-bottom: 16px;
        ">
          ${props.snapshots.slice(0, 10).map(snap => `
            <div class="snapshot-item" 
              data-id="${snap.id}"
              style="
                padding: 12px;
                margin-bottom: 8px;
                background: #252525;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.15s;
              "
              onmouseover="this.style.background='#333'"
              onmouseout="this.style.background='#252525'"
            >
              <div style="
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
              ">
                <span>${typeIcon(snap.type)}</span>
                <span style="color: #fff; font-weight: 500;">
                  ${snap.projectName}
                </span>
                <span style="
                  color: ${snap.type === 'crash' ? '#ef4444' : '#888'};
                  font-size: 11px;
                  text-transform: uppercase;
                ">
                  ${snap.type}
                </span>
              </div>
              <div style="
                color: #666;
                font-size: 12px;
              ">
                ${formatTime(snap.timestamp)} · ${formatAge(snap.timestamp)}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="dialog-actions" style="
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        ">
          <button onclick="discardRecovery()" style="
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            background: #333;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
          ">
            Start Fresh
          </button>
          <button onclick="restoreSelected()" style="
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            background: #007AFF;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">
            Restore Selected
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// Singleton Export
// ============================================================

export const recoveryManager = new RecoveryManager();
