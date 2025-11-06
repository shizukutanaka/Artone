interface OfflineStorageConfig {
  databaseName: string;
  version: number;
  enableAutoSync: boolean;
  maxStorageSize: number; // in bytes
}

interface ProjectData {
  id: string;
  name: string;
  data: any;
  lastModified: number;
  version: string;
}

class OfflineStorageManager {
  private config: OfflineStorageConfig;
  private db: IDBDatabase | null = null;
  private readonly defaultConfig: OfflineStorageConfig = {
    databaseName: 'ArtoneOfflineDB',
    version: 1,
    enableAutoSync: true,
    maxStorageSize: 100 * 1024 * 1024 // 100MB
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.db = await this.openDatabase();
      this.setupEventListeners();
      this.performMaintenance();
    } catch (error) {
      console.error('Failed to initialize offline database:', error);
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.databaseName, this.config.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  private createObjectStores(db: IDBDatabase): void {
    // Projects store
    if (!db.objectStoreNames.contains('projects')) {
      const projectsStore = db.createObjectStore('projects', { keyPath: 'id' });
      projectsStore.createIndex('lastModified', 'lastModified', { unique: false });
      projectsStore.createIndex('name', 'name', { unique: false });
    }

    // Settings store
    if (!db.objectStoreNames.contains('settings')) {
      const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
    }

    // Cache store for offline assets
    if (!db.objectStoreNames.contains('cache')) {
      const cacheStore = db.createObjectStore('cache', { keyPath: 'url' });
      cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Sync queue for pending operations
    if (!db.objectStoreNames.contains('syncQueue')) {
      const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      syncStore.createIndex('type', 'type', { unique: false });
    }
  }

  private setupEventListeners(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnlineStatus(true));
    window.addEventListener('offline', () => this.handleOnlineStatus(false));

    // Listen for storage quota exceeded
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage && estimate.quota && estimate.usage > estimate.quota * 0.9) {
          this.handleStorageQuotaExceeded();
        }
      });
    }
  }

  private handleOnlineStatus(isOnline: boolean): void {
    if (isOnline && this.config.enableAutoSync) {
      this.syncPendingChanges();
    }
  }

  private async syncPendingChanges(): Promise<void> {
    try {
      const syncQueue = await this.getAllFromStore('syncQueue');
      for (const item of syncQueue) {
        await this.processSyncItem(item);
      }
      await this.clearStore('syncQueue');
    } catch (error) {
      console.error('Failed to sync pending changes:', error);
    }
  }

  private async processSyncItem(item: any): Promise<void> {
    // Implement sync logic based on item type
    console.log('Processing sync item:', item);
  }

  private performMaintenance(): void {
    // Clean up old cached items
    this.cleanupOldCache();

    // Check storage quota
    this.checkStorageQuota();
  }

  private async cleanupOldCache(): Promise<void> {
    try {
      const cacheItems = await this.getAllFromStore('cache');
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (const item of cacheItems) {
        if (item.timestamp < oneWeekAgo) {
          await this.deleteFromStore('cache', item.url);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old cache:', error);
    }
  }

  private async checkStorageQuota(): Promise<void> {
    if (!('storage' in navigator && 'estimate' in navigator.storage)) return;

    try {
      const estimate = await navigator.storage.estimate();
      const usagePercent = (estimate.usage || 0) / (estimate.quota || 1);

      if (usagePercent > 0.8) {
        console.warn('Storage quota is running low');
        this.handleStorageQuotaExceeded();
      }
    } catch (error) {
      console.error('Failed to check storage quota:', error);
    }
  }

  private handleStorageQuotaExceeded(): void {
    console.warn('Storage quota exceeded, cleaning up old data');

    // Remove oldest projects if storage is full
    this.cleanupOldProjects();
  }

  private async cleanupOldProjects(): Promise<void> {
    try {
      const projects = await this.getAllFromStore('projects');
      const sortedByDate = projects.sort((a, b) => a.lastModified - b.lastModified);

      // Remove oldest 20% of projects
      const toRemove = Math.ceil(sortedByDate.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        await this.deleteFromStore('projects', sortedByDate[i].id);
      }
    } catch (error) {
      console.error('Failed to cleanup old projects:', error);
    }
  }

  // Project operations
  public async saveProject(projectData: ProjectData): Promise<void> {
    try {
      await this.putToStore('projects', {
        ...projectData,
        lastModified: Date.now()
      });

      // Add to sync queue if offline
      if (!navigator.onLine) {
        await this.addToSyncQueue({
          type: 'project_save',
          projectId: projectData.id,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  public async loadProject(projectId: string): Promise<ProjectData | null> {
    try {
      return await this.getFromStore('projects', projectId);
    } catch (error) {
      console.error('Failed to load project:', error);
      return null;
    }
  }

  public async deleteProject(projectId: string): Promise<void> {
    try {
      await this.deleteFromStore('projects', projectId);

      if (!navigator.onLine) {
        await this.addToSyncQueue({
          type: 'project_delete',
          projectId,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  }

  public async listProjects(): Promise<ProjectData[]> {
    try {
      return await this.getAllFromStore('projects');
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
    }
  }

  // Settings operations
  public async saveSetting(key: string, value: any): Promise<void> {
    try {
      await this.putToStore('settings', { key, value, timestamp: Date.now() });
    } catch (error) {
      console.error('Failed to save setting:', error);
      throw error;
    }
  }

  public async loadSetting(key: string): Promise<any> {
    try {
      const setting = await this.getFromStore('settings', key);
      return setting ? setting.value : null;
    } catch (error) {
      console.error('Failed to load setting:', error);
      return null;
    }
  }

  // Cache operations
  public async cacheResource(url: string, data: Blob): Promise<void> {
    try {
      await this.putToStore('cache', {
        url,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to cache resource:', error);
    }
  }

  public async getCachedResource(url: string): Promise<Blob | null> {
    try {
      const cached = await this.getFromStore('cache', url);
      return cached ? cached.data : null;
    } catch (error) {
      console.error('Failed to get cached resource:', error);
      return null;
    }
  }

  // Sync queue operations
  private async addToSyncQueue(item: any): Promise<void> {
    try {
      await this.putToStore('syncQueue', item);
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
    }
  }

  // Low-level database operations
  private async putToStore(storeName: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getFromStore(storeName: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromStore(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getAllFromStore(storeName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async clearStore(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async exportData(): Promise<Blob> {
    try {
      const data = {
        projects: await this.getAllFromStore('projects'),
        settings: await this.getAllFromStore('settings'),
        exportDate: new Date().toISOString()
      };

      return new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  public async importData(blob: Blob): Promise<void> {
    try {
      const data = JSON.parse(await blob.text());

      if (data.projects) {
        for (const project of data.projects) {
          await this.putToStore('projects', project);
        }
      }

      if (data.settings) {
        for (const setting of data.settings) {
          await this.putToStore('settings', setting);
        }
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  public getConfig(): OfflineStorageConfig {
    return { ...this.config };
  }
}

// Global instance
let offlineStorageManager: OfflineStorageManager | null = null;

export function initializeOfflineStorage(): void {
  if (typeof window === 'undefined') return;

  offlineStorageManager = new OfflineStorageManager();
}

export function getOfflineStorageManager(): OfflineStorageManager | null {
  return offlineStorageManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeOfflineStorage();
}
