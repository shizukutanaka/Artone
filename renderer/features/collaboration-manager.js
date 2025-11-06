'use strict';

/**
 * Cloud Collaboration Manager for Artone Video Editor
 * Provides real-time collaborative editing capabilities
 */
(function registerCollaborationSystem(global) {
  'use strict';

  class CollaborationManager {
    constructor(options = {}) {
      this.options = {
        serverUrl: options.serverUrl || 'wss://api.artone.com/collaboration',
        projectId: options.projectId || null,
        userId: options.userId || this.generateUserId(),
        userName: options.userName || 'Anonymous User',
        autoReconnect: options.autoReconnect !== false,
        reconnectInterval: options.reconnectInterval || 5000,
        ...options
      };

      this.ws = null;
      this.isConnected = false;
      this.reconnectTimer = null;
      this.participants = new Map();
      this.pendingOperations = [];
      this.operationHistory = [];
      this.conflictResolver = new ConflictResolver();
      this.syncManager = new SyncManager();

      // Event callbacks
      this.onParticipantJoined = null;
      this.onParticipantLeft = null;
      this.onOperationReceived = null;
      this.onConnectionStatusChanged = null;
      this.onProjectSynced = null;

      this.initialize();
    }

    async initialize() {
      if (this.options.projectId) {
        await this.connect();
      }
    }

    generateUserId() {
      return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async connect() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const wsUrl = `${this.options.serverUrl}?projectId=${this.options.projectId}&userId=${this.options.userId}&userName=${encodeURIComponent(this.options.userName)}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = (event) => {
          console.log('Collaboration connection established');
          this.isConnected = true;
          this.notifyConnectionStatus(true);
          this.sendPendingOperations();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onclose = (event) => {
          console.log('Collaboration connection closed');
          this.isConnected = false;
          this.notifyConnectionStatus(false);

          if (this.options.autoReconnect && !event.wasClean) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('Collaboration connection error:', error);
          this.isConnected = false;
          this.notifyConnectionStatus(false);
        };

      } catch (error) {
        console.error('Failed to connect to collaboration server:', error);
        this.scheduleReconnect();
      }
    }

    disconnect() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.ws) {
        this.ws.close(1000, 'User disconnected');
        this.ws = null;
      }

      this.isConnected = false;
      this.notifyConnectionStatus(false);
    }

    scheduleReconnect() {
      if (!this.options.autoReconnect) return;

      this.reconnectTimer = setTimeout(() => {
        console.log('Attempting to reconnect to collaboration server...');
        this.connect();
      }, this.options.reconnectInterval);
    }

    handleMessage(message) {
      switch (message.type) {
        case 'participant_joined':
          this.handleParticipantJoined(message.data);
          break;
        case 'participant_left':
          this.handleParticipantLeft(message.data);
          break;
        case 'operation':
          this.handleOperation(message.data);
          break;
        case 'project_sync':
          this.handleProjectSync(message.data);
          break;
        case 'conflict_resolution':
          this.handleConflictResolution(message.data);
          break;
        case 'cursor_update':
          this.handleCursorUpdate(message.data);
          break;
        default:
          console.warn('Unknown message type:', message.type);
      }
    }

    handleParticipantJoined(participant) {
      this.participants.set(participant.userId, participant);
      if (this.onParticipantJoined) {
        this.onParticipantJoined(participant);
      }
    }

    handleParticipantLeft(participant) {
      this.participants.delete(participant.userId);
      if (this.onParticipantLeft) {
        this.onParticipantLeft(participant);
      }
    }

    handleOperation(operation) {
      // Add to operation history
      this.operationHistory.push(operation);

      // Resolve potential conflicts
      const resolvedOperation = this.conflictResolver.resolve(operation, this.operationHistory);

      // Apply the operation
      this.applyOperation(resolvedOperation);

      if (this.onOperationReceived) {
        this.onOperationReceived(resolvedOperation);
      }
    }

    handleProjectSync(syncData) {
      // Synchronize project state
      this.syncManager.applySync(syncData);

      if (this.onProjectSynced) {
        this.onProjectSynced(syncData);
      }
    }

    handleConflictResolution(resolution) {
      this.conflictResolver.applyResolution(resolution);
    }

    handleCursorUpdate(cursorData) {
      // Update participant cursor positions
      const participant = this.participants.get(cursorData.userId);
      if (participant) {
        participant.cursor = cursorData.cursor;
        // Notify UI to update cursor display
        this.notifyCursorUpdate(participant);
      }
    }

    // Send operations to other participants
    sendOperation(operation) {
      const message = {
        type: 'operation',
        data: {
          ...operation,
          userId: this.options.userId,
          timestamp: Date.now(),
          sequenceId: this.generateSequenceId()
        }
      };

      if (this.isConnected) {
        this.sendMessage(message);
      } else {
        // Queue operation for when connection is restored
        this.pendingOperations.push(message);
      }

      // Apply operation locally immediately for responsiveness
      this.applyOperation(operation);
    }

    sendCursorUpdate(cursorPosition) {
      if (!this.isConnected) return;

      const message = {
        type: 'cursor_update',
        data: {
          userId: this.options.userId,
          cursor: cursorPosition,
          timestamp: Date.now()
        }
      };

      this.sendMessage(message);
    }

    sendMessage(message) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    }

    sendPendingOperations() {
      while (this.pendingOperations.length > 0 && this.isConnected) {
        const operation = this.pendingOperations.shift();
        this.sendMessage(operation);
      }
    }

    applyOperation(operation) {
      // Apply operation to local project state
      // This would integrate with the main editor's operation system
      switch (operation.type) {
        case 'clip_move':
          this.applyClipMove(operation);
          break;
        case 'clip_trim':
          this.applyClipTrim(operation);
          break;
        case 'effect_add':
          this.applyEffectAdd(operation);
          break;
        case 'effect_remove':
          this.applyEffectRemove(operation);
          break;
        case 'text_edit':
          this.applyTextEdit(operation);
          break;
        default:
          console.warn('Unknown operation type:', operation.type);
      }
    }

    applyClipMove(operation) {
      // Apply clip movement to timeline
      console.log('Applying clip move:', operation);
    }

    applyClipTrim(operation) {
      // Apply clip trimming
      console.log('Applying clip trim:', operation);
    }

    applyEffectAdd(operation) {
      // Apply effect addition
      console.log('Applying effect add:', operation);
    }

    applyEffectRemove(operation) {
      // Apply effect removal
      console.log('Applying effect remove:', operation);
    }

    applyTextEdit(operation) {
      // Apply text editing
      console.log('Applying text edit:', operation);
    }

    generateSequenceId() {
      return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    notifyConnectionStatus(connected) {
      if (this.onConnectionStatusChanged) {
        this.onConnectionStatusChanged(connected);
      }
    }

    notifyCursorUpdate(participant) {
      // Notify UI components about cursor updates
      const event = new CustomEvent('participantCursorUpdate', {
        detail: { participant }
      });
      document.dispatchEvent(event);
    }

    // Get current participants
    getParticipants() {
      return Array.from(this.participants.values());
    }

    // Get connection status
    getConnectionStatus() {
      return {
        isConnected: this.isConnected,
        participantCount: this.participants.size,
        pendingOperations: this.pendingOperations.length
      };
    }

    // Set project ID and reconnect if needed
    setProject(projectId) {
      this.options.projectId = projectId;
      if (this.isConnected) {
        this.disconnect();
      }
      this.connect();
    }

    // Update user information
    updateUser(userName, userColor) {
      this.options.userName = userName;
      this.options.userColor = userColor;

      // Send update to server
      if (this.isConnected) {
        this.sendMessage({
          type: 'user_update',
          data: {
            userId: this.options.userId,
            userName: this.options.userName,
            userColor: this.options.userColor
          }
        });
      }
    }

    // Cleanup
    destroy() {
      this.disconnect();
      this.participants.clear();
      this.pendingOperations.length = 0;
      this.operationHistory.length = 0;
    }
  }

  class ConflictResolver {
    constructor() {
      this.resolutions = new Map();
    }

    resolve(operation, history) {
      // Check for conflicts with recent operations
      const recentOps = history.slice(-10); // Check last 10 operations
      const conflicts = this.detectConflicts(operation, recentOps);

      if (conflicts.length > 0) {
        return this.resolveConflicts(operation, conflicts);
      }

      return operation;
    }

    detectConflicts(operation, recentOps) {
      const conflicts = [];

      for (const recentOp of recentOps) {
        if (this.operationsConflict(operation, recentOp)) {
          conflicts.push(recentOp);
        }
      }

      return conflicts;
    }

    operationsConflict(op1, op2) {
      // Check if operations affect the same elements
      if (op1.targetId === op2.targetId && op1.type === op2.type) {
        // Same target and operation type - potential conflict
        return Math.abs(op1.timestamp - op2.timestamp) < 1000; // Within 1 second
      }
      return false;
    }

    resolveConflicts(operation, conflicts) {
      // Apply operational transformation or last-writer-wins strategy
      const latestConflict = conflicts.reduce((latest, current) =>
        current.timestamp > latest.timestamp ? current : latest
      );

      if (operation.timestamp > latestConflict.timestamp) {
        // Current operation is newer, apply it
        return operation;
      } else {
        // Conflict operation is newer, discard current operation
        console.warn('Operation discarded due to conflict:', operation);
        return null;
      }
    }

    applyResolution(resolution) {
      this.resolutions.set(resolution.operationId, resolution);
    }
  }

  class SyncManager {
    constructor() {
      this.lastSyncTimestamp = 0;
      this.syncQueue = [];
    }

    applySync(syncData) {
      // Apply synchronized project state
      this.lastSyncTimestamp = syncData.timestamp;

      // Update local state with sync data
      if (syncData.projectState) {
        this.applyProjectState(syncData.projectState);
      }

      if (syncData.timelineState) {
        this.applyTimelineState(syncData.timelineState);
      }

      if (syncData.effectStates) {
        this.applyEffectStates(syncData.effectStates);
      }
    }

    applyProjectState(state) {
      console.log('Applying project state sync:', state);
      // Integrate with main project manager
    }

    applyTimelineState(state) {
      console.log('Applying timeline state sync:', state);
      // Integrate with timeline system
    }

    applyEffectStates(states) {
      console.log('Applying effect states sync:', states);
      // Integrate with effects system
    }

    queueSync(operation) {
      this.syncQueue.push(operation);
    }

    getPendingSync() {
      return this.syncQueue.splice(0);
    }
  }

  // Register globally
  global.CollaborationManager = CollaborationManager;

  console.log('Collaboration system registered');

})(typeof window !== 'undefined' ? window : global);
