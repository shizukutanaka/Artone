'use strict';

(function registerTempFileManager(global) {
  // Advanced temporary file management system for Artone

  function setHTMLSafe(element, html) {
    if (!element) return;

    const sanitizer = global.domSanitizer;
    const normalized = typeof html === 'string' ? html : String(html ?? '');

    if (sanitizer) {
      if (typeof sanitizer.setInnerHTMLSafe === 'function') {
        sanitizer.setInnerHTMLSafe(element, normalized);
        return;
      }

      if (typeof sanitizer.sanitizeHTML === 'function') {
        element.innerHTML = sanitizer.sanitizeHTML(normalized);
        return;
      }
    }

    element.textContent = normalized;
  }

  function clearHTML(element) {
    setHTMLSafe(element, '');
  }
  const TEMP_FILE_CONFIG = {
    // Storage locations
    locations: {
      memory: 'memory', // Keep in memory
      indexeddb: 'indexeddb', // Use IndexedDB
      filesystem: 'filesystem', // Use temporary files
      hybrid: 'hybrid' // Adaptive approach
    },

    // File size thresholds (in bytes)
    thresholds: {
      small: 1024 * 1024, // 1MB
      medium: 50 * 1024 * 1024, // 50MB
      large: 200 * 1024 * 1024, // 200MB
      huge: 1024 * 1024 * 1024 // 1GB
    },

    // Cleanup intervals
    cleanup: {
      interval: 5 * 60 * 1000, // 5 minutes
      maxAge: 30 * 60 * 1000, // 30 minutes
      maxFiles: 100
    },

    // Storage quotas
    quotas: {
      memory: 100 * 1024 * 1024, // 100MB
      indexeddb: 500 * 1024 * 1024, // 500MB
      filesystem: 2 * 1024 * 1024 * 1024 // 2GB
    }
  };

  class TempFileManager {
    constructor() {
      this.tempFiles = new Map();
      this.storageUsed = {
        memory: 0,
        indexeddb: 0,
        filesystem: 0
      };
      this.cleanupTimer = null;
      this.isInitialized = false;
      this.onStorageFull = null;
      this.onFileMoved = null;
      this.onCleanup = null;

      this.initialize();
    }

    async initialize() {
      if (this.isInitialized) return;

      // Check available storage options
      await this.detectStorageCapabilities();

      // Start cleanup timer
      this.startCleanupTimer();

      this.isInitialized = true;
      console.log('Temp file manager initialized');
    }

    async detectStorageCapabilities() {
      // Check IndexedDB support
      this.indexedDBSupported = await this.testIndexedDB();

      // Check File System Access API support
      this.fileSystemSupported = 'storage' in navigator && 'estimate' in navigator.storage;

      // Check memory usage
      if (typeof performance !== 'undefined' && performance.memory) {
        this.memoryLimit = performance.memory.jsHeapSizeLimit;
      } else {
        this.memoryLimit = 1024 * 1024 * 1024; // Assume 1GB
      }

      console.log('Storage capabilities detected:', {
        indexedDB: this.indexedDBSupported,
        fileSystem: this.fileSystemSupported,
        memoryLimit: this.memoryLimit
      });
    }

    async testIndexedDB() {
      return new Promise((resolve) => {
        const request = indexedDB.open('test-db', 1);
        request.onsuccess = () => {
          indexedDB.deleteDatabase('test-db');
          resolve(true);
        };
        request.onerror = () => resolve(false);
      });
    }

    // Store data with automatic storage selection
    async store(data, options = {}) {
      const {
        id = this.generateId(),
        type = 'blob',
        metadata = {},
        preferredStorage = 'auto'
      } = options;

      const dataSize = data.size || data.byteLength || data.length;

      // Select optimal storage
      const storage = preferredStorage === 'auto' ?
        this.selectOptimalStorage(dataSize, type) : preferredStorage;

      try {
        const storedFile = await this.storeInLocation(data, id, storage, metadata);

        this.tempFiles.set(id, {
          ...storedFile,
          storage,
          accessCount: 0,
          lastAccess: Date.now(),
          created: Date.now()
        });

        this.updateStorageUsage(storage, dataSize);
        return id;
      } catch (error) {
        console.error('Failed to store data:', error);

        // Try fallback storage
        if (storage !== 'memory') {
          try {
            return this.storeInMemory(data, id, metadata);
          } catch (fallbackError) {
            throw new Error(`Failed to store data in any storage: ${fallbackError.message}`);
          }
        }

        throw error;
      }
    }

    selectOptimalStorage(dataSize, type) {
      // Always use memory for small files
      if (dataSize < TEMP_FILE_CONFIG.thresholds.small) {
        return 'memory';
      }

      // Use IndexedDB for medium files
      if (dataSize < TEMP_FILE_CONFIG.thresholds.large) {
        return this.indexedDBSupported ? 'indexeddb' : 'memory';
      }

      // Use file system for large files
      if (dataSize >= TEMP_FILE_CONFIG.thresholds.large) {
        return this.fileSystemSupported ? 'filesystem' : 'indexeddb';
      }

      return 'memory';
    }

    async storeInLocation(data, id, storage, metadata) {
      switch (storage) {
        case 'memory':
          return this.storeInMemory(data, id, metadata);
        case 'indexeddb':
          return this.storeInIndexedDB(data, id, metadata);
        case 'filesystem':
          return this.storeInFileSystem(data, id, metadata);
        default:
          throw new Error(`Unknown storage type: ${storage}`);
      }
    }

    async storeInMemory(data, id, metadata) {
      // For memory storage, we keep a reference to the data
      // In a real implementation, this might use a more sophisticated memory pool
      return {
        id,
        storage: 'memory',
        data: data,
        size: data.size || data.byteLength || data.length,
        metadata,
        retrieve: () => data
      };
    }

    async storeInIndexedDB(data, id, metadata) {
      const dbName = 'artone-temp-files';
      const storeName = 'files';

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };

        request.onsuccess = (e) => {
          const db = e.target.result;
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);

          const fileData = {
            id,
            data,
            metadata,
            stored: Date.now()
          };

          const putRequest = store.put(fileData, id);

          putRequest.onsuccess = () => {
            resolve({
              id,
              storage: 'indexeddb',
              size: data.size || data.byteLength || data.length,
              metadata,
              retrieve: () => this.retrieveFromIndexedDB(id, dbName, storeName)
            });
          };

          putRequest.onerror = () => reject(putRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    }

    async retrieveFromIndexedDB(id, dbName, storeName) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onsuccess = (e) => {
          const db = e.target.result;
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const getRequest = store.get(id);

          getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result) {
              resolve(result.data);
            } else {
              reject(new Error('File not found'));
            }
          };

          getRequest.onerror = () => reject(getRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    }

    async storeInFileSystem(data, id, metadata) {
      if (!this.fileSystemSupported) {
        throw new Error('File System Access API not supported');
      }

      try {
        // Request temporary file access
        const tempDir = await navigator.storage.getDirectory();

        // Create file handle
        const fileHandle = await tempDir.getFileHandle(`${id}.tmp`, { create: true });

        // Write data to file
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();

        return {
          id,
          storage: 'filesystem',
          handle: fileHandle,
          size: data.size || data.byteLength || data.length,
          metadata,
          retrieve: () => this.retrieveFromFileSystem(fileHandle)
        };
      } catch (error) {
        throw new Error(`File system storage failed: ${error.message}`);
      }
    }

    async retrieveFromFileSystem(fileHandle) {
      const file = await fileHandle.getFile();
      return file;
    }

    // Retrieve data from storage
    async retrieve(id) {
      const tempFile = this.tempFiles.get(id);
      if (!tempFile) {
        throw new Error('File not found');
      }

      // Update access statistics
      tempFile.accessCount++;
      tempFile.lastAccess = Date.now();

      try {
        const data = await tempFile.retrieve();

        if (this.onFileMoved) {
          this.onFileMoved(id, 'access');
        }

        return data;
      } catch (error) {
        console.error('Failed to retrieve file:', error);

        // Try to recover or move to different storage
        await this.handleRetrievalFailure(id, error);
        throw error;
      }
    }

    async handleRetrievalFailure(id, error) {
      const tempFile = this.tempFiles.get(id);
      if (!tempFile) return;

      // Try to move to different storage
      if (tempFile.storage === 'indexeddb') {
        try {
          await this.moveToFileSystem(id);
        } catch (moveError) {
          console.error('Failed to move file to file system:', moveError);
        }
      }
    }

    async moveToFileSystem(id) {
      const tempFile = this.tempFiles.get(id);
      if (!tempFile) return;

      try {
        // Retrieve data from current storage
        const data = await tempFile.retrieve();

        // Store in file system
        const fsFile = await this.storeInFileSystem(data, id, tempFile.metadata);

        // Update temp file record
        tempFile.storage = 'filesystem';
        tempFile.handle = fsFile.handle;
        tempFile.retrieve = fsFile.retrieve;

        this.updateStorageUsage('indexeddb', -tempFile.size);
        this.updateStorageUsage('filesystem', tempFile.size);

        if (this.onFileMoved) {
          this.onFileMoved(id, 'filesystem');
        }

        console.log(`Moved file ${id} to file system storage`);
      } catch (error) {
        throw new Error(`Failed to move file to file system: ${error.message}`);
      }
    }

    // Update storage usage statistics
    updateStorageUsage(storage, delta) {
      if (this.storageUsed[storage] !== undefined) {
        this.storageUsed[storage] += delta;

        // Check if storage is full
        const quota = TEMP_FILE_CONFIG.quotas[storage] || Infinity;
        if (this.storageUsed[storage] > quota) {
          if (this.onStorageFull) {
            this.onStorageFull(storage, this.storageUsed[storage], quota);
          }
        }
      }
    }

    // Cleanup old files
    async cleanup() {
      const now = Date.now();
      const toDelete = [];

      for (const [id, tempFile] of this.tempFiles) {
        // Delete if too old or too many files
        if (now - tempFile.created > TEMP_FILE_CONFIG.cleanup.maxAge ||
            this.tempFiles.size > TEMP_FILE_CONFIG.cleanup.maxFiles) {

          // Don't delete frequently accessed files
          if (tempFile.accessCount < 3) {
            toDelete.push(id);
          }
        }
      }

      for (const id of toDelete) {
        await this.delete(id);
      }

      if (this.onCleanup) {
        this.onCleanup(toDelete.length);
      }

      console.log(`Cleaned up ${toDelete.length} temporary files`);
    }

    async delete(id) {
      const tempFile = this.tempFiles.get(id);
      if (!tempFile) return;

      try {
        // Clean up storage-specific resources
        switch (tempFile.storage) {
          case 'indexeddb':
            await this.deleteFromIndexedDB(id);
            break;
          case 'filesystem':
            await this.deleteFromFileSystem(tempFile.handle);
            break;
          case 'memory':
            // Memory cleanup is automatic
            break;
        }

        this.updateStorageUsage(tempFile.storage, -tempFile.size);
        this.tempFiles.delete(id);

        console.log(`Deleted temporary file: ${id}`);
      } catch (error) {
        console.error(`Failed to delete temporary file ${id}:`, error);
      }
    }

    async deleteFromIndexedDB(id) {
      const dbName = 'artone-temp-files';
      const storeName = 'files';

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onsuccess = (e) => {
          const db = e.target.result;
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          const deleteRequest = store.delete(id);

          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    }

    async deleteFromFileSystem(fileHandle) {
      try {
        await fileHandle.remove();
      } catch (error) {
        console.warn('Failed to delete file from file system:', error);
      }
    }

    // Start cleanup timer
    startCleanupTimer() {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }

      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, TEMP_FILE_CONFIG.cleanup.interval);
    }

    // Stop cleanup timer
    stopCleanupTimer() {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }

    // Get file info
    getFileInfo(id) {
      return this.tempFiles.get(id);
    }

    // List all files
    listFiles() {
      return Array.from(this.tempFiles.entries()).map(([id, file]) => ({
        id,
        storage: file.storage,
        size: file.size,
        accessCount: file.accessCount,
        lastAccess: file.lastAccess,
        created: file.created
      }));
    }

    // Get storage statistics
    getStorageStats() {
      const totalFiles = this.tempFiles.size;
      const totalSize = Object.values(this.storageUsed).reduce((a, b) => a + b, 0);

      return {
        files: totalFiles,
        size: totalSize,
        byStorage: { ...this.storageUsed },
        quotas: TEMP_FILE_CONFIG.quotas,
        memoryLimit: this.memoryLimit
      };
    }

    // Generate unique ID
    generateId() {
      return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Handle storage full event
    async handleStorageFull(storage, used, quota) {
      console.warn(`Storage ${storage} is full: ${used}/${quota} bytes`);

      // Try to free up space
      await this.cleanup();

      // If still full, try to move files to different storage
      if (storage === 'memory') {
        await this.moveLargeFilesToStorage();
      }

      if (this.onStorageFull) {
        this.onStorageFull(storage, used, quota);
      }
    }

    async moveLargeFilesToStorage() {
      const largeFiles = [];

      for (const [id, tempFile] of this.tempFiles) {
        if (tempFile.storage === 'memory' && tempFile.size > TEMP_FILE_CONFIG.thresholds.medium) {
          largeFiles.push({ id, file: tempFile });
        }
      }

      for (const { id, file } of largeFiles) {
        try {
          await this.moveToFileSystem(id);
        } catch (error) {
          console.warn(`Failed to move large file ${id}:`, error);
        }
      }
    }

    // Export configuration
    exportConfig() {
      return {
        tempFiles: Array.from(this.tempFiles.entries()),
        storageUsed: this.storageUsed,
        settings: {
          cleanupInterval: TEMP_FILE_CONFIG.cleanup.interval,
          maxAge: TEMP_FILE_CONFIG.cleanup.maxAge,
          maxFiles: TEMP_FILE_CONFIG.cleanup.maxFiles
        },
        exportedAt: Date.now()
      };
    }

    // Import configuration
    importConfig(config) {
      try {
        this.tempFiles = new Map(config.tempFiles || []);
        this.storageUsed = config.storageUsed || { memory: 0, indexeddb: 0, filesystem: 0 };

        if (this.onFileMoved) {
          for (const [id, file] of this.tempFiles) {
            this.onFileMoved(id, 'imported');
          }
        }

        console.log('Temp file configuration imported');
        return true;
      } catch (error) {
        console.error('Failed to import temp file config:', error);
        throw error;
      }
    }

    // Event system
    on(event, callback) {
      if (!this.eventListeners) {
        this.eventListeners = new Map();
      }
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
      if (this.eventListeners && this.eventListeners.has(event)) {
        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }

    emit(event, data) {
      if (this.eventListeners && this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Temp file manager event handler error:', error);
          }
        });
      }
    }

    // Cleanup
    async destroy() {
      this.stopCleanupTimer();

      // Delete all temp files
      for (const [id] of this.tempFiles) {
        await this.delete(id);
      }

      this.tempFiles.clear();
      this.storageUsed = { memory: 0, indexeddb: 0, filesystem: 0 };
    }
  }

  class TempFileUI {
    constructor(container, tempFileManager) {
      this.container = container;
      this.manager = tempFileManager;
      this.selectedFiles = new Set();

      this.setupUI();
      this.setupEventListeners();
      this.updateStats();
    }

    setupUI() {
      setHTMLSafe(this.container, `
        <div class="temp-file-manager-ui">
          <div class="temp-file-toolbar">
            <div class="temp-file-info">
              <span class="total-files" id="total-files">Files: 0</span>
              <span class="total-size" id="total-size">Size: 0MB</span>
              <span class="memory-usage" id="memory-usage">Memory: 0MB</span>
            </div>
            <div class="temp-file-actions">
              <button id="cleanup-files" title="Cleanup Old Files">Cleanup</button>
              <button id="export-config" title="Export Configuration">Export</button>
              <button id="import-config" title="Import Configuration">Import</button>
              <button id="clear-all" title="Clear All Files">Clear All</button>
            </div>
          </div>

          <div class="temp-file-settings">
            <div class="setting-group">
              <label for="cleanup-interval">Cleanup Interval (minutes):</label>
              <input type="number" id="cleanup-interval" min="1" max="60" step="1">
            </div>
            <div class="setting-group">
              <label for="max-file-age">Max File Age (minutes):</label>
              <input type="number" id="max-file-age" min="5" max="120" step="5">
            </div>
            <div class="setting-group">
              <label for="max-files">Max Files:</label>
              <input type="number" id="max-files" min="10" max="1000" step="10">
            </div>
          </div>

          <div class="temp-file-list-container">
            <div class="temp-file-list" id="temp-file-list"></div>
          </div>

          <div class="storage-breakdown">
            <h4>Storage Usage</h4>
            <div class="storage-stats">
              <div class="storage-stat" id="memory-stat">
                <span class="storage-label">Memory:</span>
                <span class="storage-value">0MB / 0MB</span>
                <div class="storage-bar">
                  <div class="storage-fill memory-fill" style="width: 0%"></div>
                </div>
              </div>
              <div class="storage-stat" id="indexeddb-stat">
                <span class="storage-label">IndexedDB:</span>
                <span class="storage-value">0MB / 0MB</span>
                <div class="storage-bar">
                  <div class="storage-fill indexeddb-fill" style="width: 0%"></div>
                </div>
              </div>
              <div class="storage-stat" id="filesystem-stat">
                <span class="storage-label">File System:</span>
                <span class="storage-value">0MB / 0MB</span>
                <div class="storage-bar">
                  <div class="storage-fill filesystem-fill" style="width: 0%"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      this.totalFiles = this.container.querySelector('#total-files');
      this.totalSize = this.container.querySelector('#total-size');
      this.memoryUsage = this.container.querySelector('#memory-usage');
      this.tempFileList = this.container.querySelector('#temp-file-list');
    }

    setupEventListeners() {
      // Toolbar actions
      this.container.querySelector('#cleanup-files').addEventListener('click', () => {
        this.cleanupFiles();
      });

      this.container.querySelector('#export-config').addEventListener('click', () => {
        this.exportConfig();
      });

      this.container.querySelector('#import-config').addEventListener('click', () => {
        this.importConfig();
      });

      this.container.querySelector('#clear-all').addEventListener('click', () => {
        this.clearAllFiles();
      });

      // Settings
      this.container.querySelector('#cleanup-interval').addEventListener('change', (e) => {
        TEMP_FILE_CONFIG.cleanup.interval = e.target.value * 60 * 1000;
        this.manager.startCleanupTimer();
      });

      this.container.querySelector('#max-file-age').addEventListener('change', (e) => {
        TEMP_FILE_CONFIG.cleanup.maxAge = e.target.value * 60 * 1000;
      });

      this.container.querySelector('#max-files').addEventListener('change', (e) => {
        TEMP_FILE_CONFIG.cleanup.maxFiles = parseInt(e.target.value);
      });

      // Manager events
      this.manager.onStorageFull = (storage, used, quota) => {
        this.showNotification(`Storage ${storage} is full: ${this.formatBytes(used)} / ${this.formatBytes(quota)}`, 'warning');
      };

      this.manager.onFileMoved = (id, reason) => {
        this.updateFileList();
        this.updateStats();
        this.showNotification(`File ${id} moved (${reason})`, 'info');
      };

      this.manager.onCleanup = (deletedCount) => {
        this.updateFileList();
        this.updateStats();
        this.showNotification(`Cleaned up ${deletedCount} files`, 'info');
      };

      // Update stats periodically
      setInterval(() => {
        this.updateStats();
      }, 2000);
    }

    cleanupFiles() {
      this.manager.cleanup();
    }

    exportConfig() {
      try {
        const config = this.manager.exportConfig();
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'temp_file_config.json';
        a.click();

        URL.revokeObjectURL(url);
      } catch (error) {
        this.showNotification(`Export failed: ${error.message}`, 'error');
      }
    }

    importConfig() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              this.manager.importConfig(JSON.parse(e.target.result));
              this.updateFileList();
              this.updateStats();
              this.showNotification('Configuration imported successfully', 'success');
            } catch (error) {
              this.showNotification(`Import failed: ${error.message}`, 'error');
            }
          };
          reader.readAsText(file);
        }
      };

      input.click();
    }

    clearAllFiles() {
      if (confirm('Are you sure you want to delete all temporary files?')) {
        this.manager.destroy();
        this.updateFileList();
        this.updateStats();
        this.showNotification('All temporary files cleared', 'info');
      }
    }

    updateStats() {
      const stats = this.manager.getStorageStats();
      const files = this.manager.listFiles();

      this.totalFiles.textContent = `Files: ${stats.files}`;
      this.totalSize.textContent = `Size: ${this.formatBytes(stats.size)}`;

      if (typeof performance !== 'undefined' && performance.memory) {
        const memoryMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
        this.memoryUsage.textContent = `Memory: ${memoryMB}MB`;
      }

      // Update storage stats
      this.updateStorageStats(stats);
    }

    updateStorageStats(stats) {
      const updateStat = (id, used, quota) => {
        const element = this.container.querySelector(`#${id}-stat .storage-value`);
        const fill = this.container.querySelector(`#${id}-stat .storage-fill`);

        if (element && fill) {
          element.textContent = `${this.formatBytes(used)} / ${this.formatBytes(quota)}`;
          const percentage = quota > 0 ? (used / quota) * 100 : 0;
          fill.style.width = `${Math.min(percentage, 100)}%`;
        }
      };

      updateStat('memory', stats.byStorage.memory, TEMP_FILE_CONFIG.quotas.memory);
      updateStat('indexeddb', stats.byStorage.indexeddb, TEMP_FILE_CONFIG.quotas.indexeddb);
      updateStat('filesystem', stats.byStorage.filesystem, TEMP_FILE_CONFIG.quotas.filesystem);
    }

    updateFileList() {
      const files = this.manager.listFiles();

      setHTMLSafe(this.tempFileList, files.map(file => `
        <div class="temp-file-item" data-file-id="${file.id}">
          <div class="file-info">
            <div class="file-id">${file.id}</div>
            <div class="file-details">
              ${this.formatBytes(file.size)} •
              ${file.storage} •
              Accessed ${file.accessCount} times
            </div>
          </div>
          <div class="file-actions">
            <button class="retrieve-file" data-file-id="${file.id}" title="Retrieve">📂</button>
            <button class="delete-file" data-file-id="${file.id}" title="Delete">🗑</button>
          </div>
        </div>
      `).join(''));

      // Add event listeners
      this.tempFileList.querySelectorAll('.retrieve-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fileId = e.target.dataset.fileId;
          this.retrieveFile(fileId);
        });
      });

      this.tempFileList.querySelectorAll('.delete-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fileId = e.target.dataset.fileId;
          this.deleteFile(fileId);
        });
      });
    }

    retrieveFile(fileId) {
      this.manager.retrieve(fileId)
        .then(data => {
          this.showNotification(`File ${fileId} retrieved successfully`, 'success');
        })
        .catch(error => {
          this.showNotification(`Failed to retrieve file: ${error.message}`, 'error');
        });
    }

    deleteFile(fileId) {
      this.manager.delete(fileId);
      this.updateFileList();
      this.updateStats();
    }

    formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.textContent = message;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add('show');
      }, 100);

      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }

    refresh() {
      this.updateStats();
      this.updateFileList();
    }
  }

  // Export to global scope
  global.TempFileManager = TempFileManager;
  global.TempFileUI = TempFileUI;
  global.TEMP_FILE_CONFIG = TEMP_FILE_CONFIG;

})(typeof window !== 'undefined' ? window : globalThis);
