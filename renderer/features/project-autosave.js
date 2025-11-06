'use strict';
(function registerProjectAutoSave(global) {
  const DEFAULT_INTERVAL = 30000; // 30 seconds
  const MIN_INTERVAL = 5000; // 5 seconds
  const MAX_INTERVAL = 300000; // 5 minutes
  const JOURNAL_MAX_SIZE = 50; // Max journal entries
  const CONFLICT_RESOLUTION_TIMEOUT = 10000; // 10 seconds
  const MAX_CONCURRENT_SAVES = 1;
  const SAVE_DEBOUNCE_DELAY = 2000; // 2 seconds

  // Conflict resolution strategies
  const ConflictStrategy = {
    KEEP_LOCAL: 'keep_local',
    KEEP_REMOTE: 'keep_remote',
    MERGE: 'merge',
    PROMPT_USER: 'prompt_user'
  };

  // Enhanced journaling system with conflict resolution
  class ProjectJournal {
    constructor() {
      this.entries = [];
      this.lastCheckpoint = null;
      this.isDirty = false;
      this.version = 1;
      this.lastSyncTime = null;
      this.conflictState = null;
    }

    addEntry(type, data, options = {}) {
      const { skipJournal = false, forceVersion = false, metadata = {} } = options;

      if (this.conflictState) {
        throw new Error('Cannot add entries during conflict resolution');
      }

      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        data,
        timestamp: Date.now(),
        version: forceVersion ? this.version + 1 : this.version,
        user: this.getCurrentUser(),
        metadata
      };

      if (!skipJournal) {
        this.entries.push(entry);
        this.isDirty = true;
        this.version++;

        // Limit journal size and create checkpoints
        if (this.entries.length > JOURNAL_MAX_SIZE) {
          this.createCheckpoint();
        }
      }

      return entry;
    }

    createCheckpoint(options = {}) {
      const { force = false, includeMetadata = {} } = options;

      if (this.entries.length === 0 && !force) return null;

      const checkpoint = {
        id: `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        entries: [...this.entries],
        timestamp: Date.now(),
        version: this.version,
        user: this.getCurrentUser(),
        metadata: {
          ...includeMetadata,
          checkpointType: 'auto',
          projectState: this.getProjectStateSummary()
        }
      };

      this.lastCheckpoint = checkpoint;
      this.entries = [];
      this.isDirty = false;
{{ ... }}
    rollback(toEntry) {
      const index = this.entries.findIndex(e => e.id === toEntry.id);
      if (index >= 0) {
        this.entries = this.entries.slice(0, index);
        this.isDirty = true;
        this.version = Math.max(this.version, toEntry.version);
      }
    }

    detectConflicts(remoteJournal) {
      if (!remoteJournal || !remoteJournal.entries) return null;

      const localChanges = this.getChanges(this.lastSyncTime);
      const remoteChanges = remoteJournal.getChanges(remoteJournal.lastSyncTime);

      const conflicts = [];
      const localMap = new Map(localChanges.map(e => [e.id, e]));
      const remoteMap = new Map(remoteChanges.map(e => [e.id, e]));

      // Find conflicting entries
      for (const [id, localEntry] of localMap) {
        if (remoteMap.has(id)) {
          const remoteEntry = remoteMap.get(id);
          if (localEntry.timestamp !== remoteEntry.timestamp ||
              JSON.stringify(localEntry.data) !== JSON.stringify(remoteEntry.data)) {
            conflicts.push({ id, local: localEntry, remote: remoteEntry });
          }
        }
      }

      return conflicts.length > 0 ? conflicts : null;
    }

    resolveConflict(conflicts, strategy = ConflictStrategy.PROMPT_USER) {
      this.conflictState = { conflicts, strategy, resolved: false };

      switch (strategy) {
        case ConflictStrategy.KEEP_LOCAL:
          return this.keepLocalChanges(conflicts);
        case ConflictStrategy.KEEP_REMOTE:
          return this.keepRemoteChanges(conflicts);
        case ConflictStrategy.MERGE:
          return this.mergeChanges(conflicts);
        case ConflictStrategy.PROMPT_USER:
          return this.promptUserResolution(conflicts);
        default:
          throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
      }
    }

    keepLocalChanges(conflicts) {
      // Remove conflicting remote entries
      for (const conflict of conflicts) {
        this.entries = this.entries.filter(e => e.id !== conflict.remote.id);
      }
      this.conflictState.resolved = true;
      return this.entries;
    }

    keepRemoteChanges(conflicts) {
      // Replace local entries with remote ones
      for (const conflict of conflicts) {
        const index = this.entries.findIndex(e => e.id === conflict.local.id);
        if (index >= 0) {
          this.entries[index] = conflict.remote;
        }
      }
      this.conflictState.resolved = true;
      return this.entries;
    }

    mergeChanges(conflicts) {
      // Simple merge strategy - keep both versions with suffixes
      for (const conflict of conflicts) {
        const localIndex = this.entries.findIndex(e => e.id === conflict.local.id);
        if (localIndex >= 0) {
          this.entries[localIndex] = {
            ...conflict.local,
            id: `${conflict.local.id}_local`,
            metadata: { ...conflict.local.metadata, merged: true }
          };
        }
        this.entries.push({
          ...conflict.remote,
          id: `${conflict.remote.id}_remote`,
          metadata: { ...conflict.remote.metadata, merged: true }
        });
      }
      this.conflictState.resolved = true;
      return this.entries;
    }

    async promptUserResolution(conflicts) {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Default to keeping local changes if no response
          this.keepLocalChanges(conflicts);
          resolve(this.entries);
        }, CONFLICT_RESOLUTION_TIMEOUT);

        // In a real app, this would show a UI dialog
        // For now, we'll simulate user choice
        setTimeout(() => {
          clearTimeout(timeout);
          this.keepLocalChanges(conflicts);
          resolve(this.entries);
        }, 1000);
      });
    }

    getProjectStateSummary() {
      return {
        entryCount: this.entries.length,
        lastModified: this.entries.length > 0 ? Math.max(...this.entries.map(e => e.timestamp)) : null,
        types: [...new Set(this.entries.map(e => e.type))],
        version: this.version
      };
    }

    clear() {
      this.entries = [];
      this.lastCheckpoint = null;
      this.isDirty = false;
      this.version = 1;
      this.lastSyncTime = null;
      this.conflictState = null;
    }

    getCurrentUser() {
      // In a real app, this would get the actual user
      return 'user';
    }

    serialize() {
      return JSON.stringify({
        entries: this.entries,
        lastCheckpoint: this.lastCheckpoint,
        isDirty: this.isDirty,
        version: this.version,
        lastSyncTime: this.lastSyncTime,
        conflictState: this.conflictState
      });
    }

    static deserialize(json) {
      const data = JSON.parse(json);
      const journal = new ProjectJournal();
      journal.entries = data.entries || [];
      journal.lastCheckpoint = data.lastCheckpoint || null;
      journal.isDirty = data.isDirty || false;
      journal.version = data.version || 1;
      journal.lastSyncTime = data.lastSyncTime || null;
      journal.conflictState = data.conflictState || null;
      return journal;
    }
  } // Conflict resolution strategies
  class ConflictResolver {
    constructor() {
      this.strategies = new Map();
      this.registerDefaultStrategies();
    }
{{ ... }}

    registerDefaultStrategies() {
      // Last write wins
      this.strategies.set('last-write-wins', (local, remote) => {
        return local.timestamp > remote.timestamp ? local : remote;
      });

      // Merge changes
      this.strategies.set('merge', (local, remote) => {
        return this.mergeChanges(local, remote);
      });

      // Manual resolution
      this.strategies.set('manual', (local, remote) => {
        return { requiresManual: true, local, remote };
      });

      // Keep local
      this.strategies.set('keep-local', (local, remote) => local);

      // Keep remote
      this.strategies.set('keep-remote', (local, remote) => remote);
    }

    resolve(local, remote, strategy = 'merge') {
      const resolver = this.strategies.get(strategy);
      if (!resolver) {
        throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
      }

      return resolver(local, remote);
    }

    mergeChanges(local, remote) {
      // Complex merge logic
      const merged = {
        ...remote,
        ...local,
        timestamp: Math.max(local.timestamp, remote.timestamp),
        conflicts: []
      };

      // Check for property conflicts
      for (const key in local) {
        if (key in remote && local[key] !== remote[key]) {
          if (typeof local[key] === 'object' && typeof remote[key] === 'object') {
            // Recursive merge for objects
            merged[key] = this.mergeChanges(local[key], remote[key]);
          } else {
            // Track conflict for manual resolution
            merged.conflicts.push({
              property: key,
              localValue: local[key],
              remoteValue: remote[key]
            });
          }
        }
      }

      return merged;
    }

    detectConflicts(localJournal, remoteJournal) {
      const conflicts = [];
      const localChanges = localJournal.getChanges();
      const remoteChanges = remoteJournal.getChanges();

      // Find overlapping changes
      for (const localChange of localChanges) {
        for (const remoteChange of remoteChanges) {
          if (this.isConflicting(localChange, remoteChange)) {
            conflicts.push({
              local: localChange,
              remote: remoteChange,
              type: this.getConflictType(localChange, remoteChange)
            });
          }
        }
      }

      return conflicts;
    }

    isConflicting(local, remote) {
      // Same entity modified by both
      if (local.data.id === remote.data.id) {
        // Different operations on same entity
        if (local.type !== remote.type) {
          return true;
        }

        // Same operation but different values
        if (JSON.stringify(local.data) !== JSON.stringify(remote.data)) {
          return true;
        }
      }

      return false;
    }

    getConflictType(local, remote) {
      if (local.type === 'delete' && remote.type === 'update') {
        return 'delete-update';
      }
      if (local.type === 'update' && remote.type === 'delete') {
        return 'update-delete';
      }
      if (local.type === 'move' && remote.type === 'move') {
        return 'concurrent-move';
      }
      return 'concurrent-update';
    }
  }

  // Auto-save manager
  class AutoSaveManager {
    constructor(options = {}) {
      this.interval = options.interval || DEFAULT_INTERVAL;
      this.journal = new ProjectJournal();
      this.conflictResolver = new ConflictResolver();
      this.saveCallback = options.onSave || (() => {});
      this.errorCallback = options.onError || (() => {});
      this.conflictCallback = options.onConflict || (() => {});
      this.timer = null;
      this.isEnabled = options.enabled !== false;
      this.lastSaveTime = null;
      this.saveInProgress = false;
      this.retryCount = 0;
      this.maxRetries = options.maxRetries || 3;
    }

    start() {
      if (!this.isEnabled || this.timer) return;

      this.timer = setInterval(() => {
        this.performAutoSave();
      }, this.interval);
    }

    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    async performAutoSave() {
      if (!this.journal.isDirty || this.saveInProgress) {
        return;
      }

      this.saveInProgress = true;

      try {
        // Get current project state
        const projectState = await this.getProjectState();

        // Check for remote changes
        const remoteState = await this.fetchRemoteState();

        if (remoteState && this.hasRemoteChanges(remoteState)) {
          // Handle conflicts
          const conflicts = this.conflictResolver.detectConflicts(
            this.journal,
            remoteState.journal
          );

          if (conflicts.length > 0) {
            const resolution = await this.conflictCallback(conflicts);
            if (resolution === 'cancel') {
              this.saveInProgress = false;
              return;
            }

            // Apply conflict resolution
            projectState.merge(resolution);
          }
        }

        // Save the project
        await this.saveProject(projectState);

        // Create checkpoint after successful save
        this.journal.createCheckpoint();
        this.lastSaveTime = Date.now();
        this.retryCount = 0;

        this.saveCallback({
          timestamp: this.lastSaveTime,
          journal: this.journal
        });
      } catch (error) {
        this.handleSaveError(error);
      } finally {
        this.saveInProgress = false;
      }
    }

    async handleSaveError(error) {
      console.error('Auto-save error:', error);

      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`Retrying auto-save (${this.retryCount}/${this.maxRetries})...`);

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        setTimeout(() => {
          this.performAutoSave();
        }, delay);
      } else {
        this.errorCallback({
          error,
          retryCount: this.retryCount,
          journal: this.journal
        });
        this.retryCount = 0;
      }
    }

    async getProjectState() {
      // This would get the actual project state from the application
      return {
        version: '1.0.0',
        timestamp: Date.now(),
        journal: this.journal,
        data: {} // Actual project data would go here
      };
    }

    async fetchRemoteState() {
      // This would fetch the remote state from a server
      // For now, return null to indicate no remote state
      return null;
    }

    hasRemoteChanges(remoteState) {
      if (!remoteState || !this.lastSaveTime) {
        return false;
      }

      return remoteState.timestamp > this.lastSaveTime;
    }

    async saveProject(projectState) {
      // This would save the project to storage (local or remote)
      // For now, just simulate a save operation
      return new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    trackChange(type, data) {
      this.journal.addEntry(type, data);

      // Trigger immediate save for important changes
      if (type === JournalType.DELETE || type === JournalType.CREATE) {
        this.triggerSave();
      }
    }

    triggerSave() {
      if (!this.saveInProgress) {
        // Debounce immediate saves
        clearTimeout(this.immediateSaveTimer);
        this.immediateSaveTimer = setTimeout(() => {
          this.performAutoSave();
        }, 1000);
      }
    }

    setInterval(interval) {
      const clampedInterval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, interval));
      if (clampedInterval !== this.interval) {
        this.interval = clampedInterval;

        if (this.timer) {
          this.stop();
          this.start();
        }
      }
    }

    getStatus() {
      return {
        enabled: this.isEnabled,
        interval: this.interval,
        lastSaveTime: this.lastSaveTime,
        isDirty: this.journal.isDirty,
        saveInProgress: this.saveInProgress,
        journalSize: this.journal.entries.length,
        retryCount: this.retryCount
      };
    }

    enable() {
      this.isEnabled = true;
      this.start();
    }

    disable() {
      this.isEnabled = false;
      this.stop();
    }

    async forceCheckpoint() {
      const checkpoint = this.journal.createCheckpoint();
      if (checkpoint) {
        await this.performAutoSave();
      }
      return checkpoint;
    }
  }

  // Export the module
  const exports = Object.freeze({
    JournalType,
    ProjectJournal,
    ConflictResolver,
    AutoSaveManager,
    DEFAULT_INTERVAL,
    MIN_INTERVAL,
    MAX_INTERVAL
  });

  global.ProjectAutoSave = exports;
})(typeof window !== 'undefined' ? window : globalThis);