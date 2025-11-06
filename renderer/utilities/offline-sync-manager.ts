import { getSafeStorage } from './safe-storage';

interface OfflineSyncConfig {
  enableBackgroundSync: boolean;
  enablePeriodicSync: boolean;
  enableImmediateSync: boolean;
  syncInterval: number; // seconds
  maxSyncAttempts: number;
  syncTimeout: number; // seconds
  enableConflictResolution: boolean;
  enableDataCompression: boolean;
  enableProgressTracking: boolean;
  enableRetryOnFailure: boolean;
}

interface SyncItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  data: any;
  timestamp: number;
  retryCount: number;
  lastAttempt: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  checksum: string;
  metadata: Record<string, any>;
}

interface SyncConflict {
  id: string;
  localData: any;
  serverData: any;
  resolution: 'local' | 'server' | 'merge' | 'manual';
  timestamp: number;
}

class OfflineSyncManager {
  private config: OfflineSyncConfig;
  private syncQueue: SyncItem[] = [];
  private conflicts: SyncConflict[] = [];
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncInProgress: boolean = false;
  private lastSyncTime: number = 0;
  private storage = typeof window !== 'undefined' ? getSafeStorage('local') : null;

  private readonly defaultConfig: OfflineSyncConfig = {
    enableBackgroundSync: true,
    enablePeriodicSync: true,
    enableImmediateSync: true,
    syncInterval: 300, // 5 minutes
    maxSyncAttempts: 3,
    syncTimeout: 30, // 30 seconds
    enableConflictResolution: true,
    enableDataCompression: true,
    enableProgressTracking: true,
    enableRetryOnFailure: true
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeOfflineSync();
  }

  private initializeOfflineSync(): void {
    this.loadSyncQueue();
    this.setupOnlineDetection();
    this.setupBackgroundSync();
    this.setupPeriodicSync();
    this.startSyncProcessor();
  }

  private loadSyncQueue(): void {
    if (!this.storage) {
      this.syncQueue = [];
      this.conflicts = [];
      return;
    }

    try {
      const storedQueue = this.storage.getItem('artone_sync_queue');
      if (storedQueue) {
        const parsedQueue = JSON.parse(storedQueue);
        this.syncQueue = Array.isArray(parsedQueue) ? parsedQueue : [];
      }

      const storedConflicts = this.storage.getItem('artone_sync_conflicts');
      if (storedConflicts) {
        const parsedConflicts = JSON.parse(storedConflicts);
        this.conflicts = Array.isArray(parsedConflicts) ? parsedConflicts : [];
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      this.syncQueue = [];
      this.conflicts = [];
    }
  }

  private setupOnlineDetection(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('Back online, starting sync...');
      this.syncAll();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('Gone offline, queuing changes...');
    });
  }

  private setupBackgroundSync(): void {
    if (!this.config.enableBackgroundSync) return;

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'offline-sync') {
          this.handleBackgroundSync(event.data);
        }
      });
    }
  }

  private setupPeriodicSync(): void {
    if (!this.config.enablePeriodicSync) return;

    setInterval(() => {
      if (this.isOnline && this.syncQueue.length > 0) {
        this.syncAll();
      }
    }, this.config.syncInterval * 1000);
  }

  private startSyncProcessor(): void {
    setInterval(() => {
      this.processSyncQueue();
    }, 5000); // Process every 5 seconds
  }

  private handleBackgroundSync(data: any): void {
    console.log('Background sync triggered:', data);

    if (data.action === 'sync') {
      this.syncAll();
    }
  }

  public async queueForSync(type: 'create' | 'update' | 'delete', collection: string, data: any): Promise<string> {
    const syncItem: SyncItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      collection,
      data: this.config.enableDataCompression ? await this.compressData(data) : data,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: 0,
      status: 'pending',
      checksum: await this.calculateChecksum(data),
      metadata: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        timestamp: new Date().toISOString()
      }
    };

    this.syncQueue.push(syncItem);
    this.saveSyncQueue();

    console.log('Queued for sync:', syncItem.id, type, collection);

    // Try immediate sync if online
    if (this.isOnline && this.config.enableImmediateSync) {
      this.syncItem(syncItem);
    }

    // Register background sync if offline
    if (!this.isOnline && this.config.enableBackgroundSync) {
      this.registerBackgroundSync();
    }

    return syncItem.id;
  }

  private async syncAll(): Promise<void> {
    if (this.syncInProgress || this.syncQueue.length === 0) return;

    this.syncInProgress = true;
    console.log('Starting sync process...');

    const pendingItems = this.syncQueue.filter(item => item.status === 'pending' || item.status === 'failed');

    for (const item of pendingItems) {
      await this.syncItem(item);
    }

    this.syncInProgress = false;
    this.lastSyncTime = Date.now();
    this.saveSyncQueue();

    console.log('Sync process completed');
  }

  private async syncItem(item: SyncItem): Promise<void> {
    if (!this.isOnline) {
      console.log('Skipping sync - offline');
      return;
    }

    item.status = 'syncing';
    item.lastAttempt = Date.now();
    this.saveSyncQueue();

    try {
      const response = await this.sendToServer(item);

      if (response.success) {
        item.status = 'completed';
        console.log('Sync successful:', item.id);
      } else {
        throw new Error(response.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Sync failed:', item.id, error);

      item.retryCount++;
      item.status = item.retryCount >= this.config.maxSyncAttempts ? 'failed' : 'pending';

      if (this.config.enableRetryOnFailure && item.retryCount < this.config.maxSyncAttempts) {
        console.log(`Retrying sync (${item.retryCount}/${this.config.maxSyncAttempts}):`, item.id);
        // Retry after delay
        setTimeout(() => this.syncItem(item), 5000 * item.retryCount);
      }
    }

    this.saveSyncQueue();
  }

  private async sendToServer(item: SyncItem): Promise<any> {
    const endpoint = this.getEndpointForCollection(item.collection);

    const supportsAbort = typeof AbortController !== 'undefined';
    const controller = supportsAbort ? new AbortController() : null;
    const shouldScheduleTimeout = controller && typeof window !== 'undefined' && typeof window.setTimeout === 'function';
    const timeoutId = shouldScheduleTimeout ? window.setTimeout(() => controller?.abort(), this.config.syncTimeout * 1000) : null;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-ID': item.id,
          'X-Sync-Type': item.type
        },
        body: JSON.stringify({
          type: item.type,
          collection: item.collection,
          data: this.config.enableDataCompression ? await this.decompressData(item.data) : item.data,
          checksum: item.checksum,
          metadata: item.metadata
        }),
        signal: controller ? controller.signal : undefined
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.message || response.statusText };
      }

      return { success: true, data: await response.json() };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Sync request timed out' };
      }
      throw error;
    } finally {
      if (timeoutId !== null && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private getEndpointForCollection(collection: string): string {
    const endpoints: Record<string, string> = {
      'projects': '/api/projects/sync',
      'timeline': '/api/timeline/sync',
      'settings': '/api/settings/sync',
      'user': '/api/user/sync'
    };

    return endpoints[collection] || '/api/sync';
  }

  private async registerBackgroundSync(): Promise<void> {
    if (!(typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const registrationAny = registration as ServiceWorkerRegistration & { sync?: { register?: (tag: string) => Promise<void> } };
      if (registrationAny.sync && typeof registrationAny.sync.register === 'function') {
        await registrationAny.sync.register('offline-sync');
        console.log('Background sync registered');
      } else {
        console.warn('Background sync not supported on this registration');
      }
    } catch (error) {
      console.error('Failed to register background sync:', error);
    }
  }

  private async processSyncQueue(): void {
    if (this.syncQueue.length === 0) return;

    const pendingItems = this.syncQueue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    // Process items in priority order
    const priorityOrder = ['delete', 'update', 'create'];
    const sortedItems = pendingItems.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.type);
      const bIndex = priorityOrder.indexOf(b.type);
      return aIndex - bIndex;
    });

    for (const item of sortedItems.slice(0, 5)) { // Process max 5 items at a time
      if (this.isOnline) {
        await this.syncItem(item);
      }
    }
  }

  public async getPendingChanges(): Promise<SyncItem[]> {
    return this.syncQueue.filter(item => item.status === 'pending');
  }

  public async getSyncHistory(): Promise<SyncItem[]> {
    return this.syncQueue.filter(item => item.status === 'completed');
  }

  public async clearSyncQueue(): Promise<void> {
    this.syncQueue = [];
    this.saveSyncQueue();
    console.log('Sync queue cleared');
  }
  public async resolveConflict(conflict: SyncConflict): Promise<void> {
    if (!this.config.enableConflictResolution) return;

    const supportsAbort = typeof AbortController !== 'undefined';
    const controller = supportsAbort ? new AbortController() : null;
    const shouldScheduleTimeout = controller && typeof window !== 'undefined' && typeof window.setTimeout === 'function';
    const timeoutId = shouldScheduleTimeout ? window.setTimeout(() => controller?.abort(), this.config.syncTimeout * 1000) : null;

    try {
      const response = await fetch('/api/sync/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(conflict),
        signal: controller ? controller.signal : undefined
      });

      if (response.ok) {
        this.conflicts = this.conflicts.filter(c => c.id !== conflict.id);
        this.saveConflicts();
        console.log('Conflict resolved:', conflict.id);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.warn('Conflict resolution request timed out');
      } else {
        console.error('Failed to resolve conflict:', error);
      }
    } finally {
      if (timeoutId !== null && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private async compressData(data: any): Promise<any> {
    if (!this.config.enableDataCompression) return data;

    if (data && typeof data === 'object') {
      try {
        return JSON.stringify(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  private async decompressData(data: any): Promise<any> {
    if (!this.config.enableDataCompression) return data;

    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  private async calculateChecksum(data: any): Promise<string> {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private saveSyncQueue(): void {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem('artone_sync_queue', JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  private saveConflicts(): void {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem('artone_sync_conflicts', JSON.stringify(this.conflicts));
    } catch (error) {
      console.error('Failed to save conflicts:', error);
    }
  }

  public getSyncStats(): any {
    const pending = this.syncQueue.filter(item => item.status === 'pending').length;
    const completed = this.syncQueue.filter(item => item.status === 'completed').length;
    const failed = this.syncQueue.filter(item => item.status === 'failed').length;

    return {
      totalItems: this.syncQueue.length,
      pending,
      completed,
      failed,
      conflicts: this.conflicts.length,
      lastSyncTime: this.lastSyncTime,
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress
    };
  }

  public getConfig(): OfflineSyncConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<OfflineSyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      stats: this.getSyncStats(),
      recentItems: this.syncQueue.slice(-10),
      conflicts: this.conflicts,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public destroy(): void {
    this.syncQueue = [];
    this.conflicts = [];
    this.syncInProgress = false;
  }
}

// Global instance
let offlineSyncManager: OfflineSyncManager | null = null;

export function initializeOfflineSyncManager(): void {
  if (typeof window === 'undefined') return;

  offlineSyncManager = new OfflineSyncManager();
}

export function getOfflineSyncManager(): OfflineSyncManager | null {
  return offlineSyncManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeOfflineSyncManager();
}
