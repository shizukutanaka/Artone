/**
 * Collaboration System - Real-time Sharing, Comments, and Version Control
 * Comprehensive collaboration features for Artone Video Editor
 */

(function initializeCollaborationSystem(global) {
  'use strict';

  // Collaboration Event Types
  const CollaborationEventType = {
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    CURSOR_MOVED: 'cursor_moved',
    SELECTION_CHANGED: 'selection_changed',
    CLIP_MODIFIED: 'clip_modified',
    COMMENT_ADDED: 'comment_added',
    COMMENT_RESOLVED: 'comment_resolved',
    VERSION_CREATED: 'version_created',
    PROJECT_SHARED: 'project_shared',
    PERMISSION_CHANGED: 'permission_changed'
  };

  // User Permission Levels
  const UserPermission = {
    OWNER: 'owner',
    EDITOR: 'editor',
    VIEWER: 'viewer',
    COMMENTER: 'commenter'
  };

  // Collaboration Session State
  class CollaborationSession {
    constructor(sessionId, ownerId) {
      this.id = sessionId;
      this.ownerId = ownerId;
      this.users = new Map();
      this.isActive = false;
      this.createdAt = new Date();
      this.lastActivity = new Date();
      this.settings = {
        allowAnonymous: false,
        maxUsers: 10,
        autoSave: true,
        realTimeSync: true
      };
    }

    addUser(user) {
      this.users.set(user.id, user);
      this.lastActivity = new Date();
    }

    removeUser(userId) {
      return this.users.delete(userId);
    }

    getUser(userId) {
      return this.users.get(userId);
    }

    getActiveUsers() {
      return Array.from(this.users.values()).filter(user => user.isActive);
    }

    updateUserActivity(userId) {
      const user = this.users.get(userId);
      if (user) {
        user.lastActivity = new Date();
        this.lastActivity = new Date();
      }
    }

    hasPermission(userId, permission) {
      const user = this.users.get(userId);
      if (!user) return false;

      const permissionHierarchy = {
        [UserPermission.OWNER]: 4,
        [UserPermission.EDITOR]: 3,
        [UserPermission.COMMENTER]: 2,
        [UserPermission.VIEWER]: 1
      };

      const requiredLevel = permissionHierarchy[permission] || 0;
      const userLevel = permissionHierarchy[user.permission] || 0;

      return userLevel >= requiredLevel;
    }
  }

  // Real-time Synchronization Manager
  class RealTimeSyncManager {
    constructor() {
      this.socket = null;
      this.isConnected = false;
      this.session = null;
      this.pendingChanges = [];
      this.conflictResolver = new ConflictResolver();
      this.changeBuffer = new ChangeBuffer();
      this.listeners = new Set();
    }

    async connect(sessionId, userId, userName) {
      try {
        // Initialize WebSocket connection (simplified for demo)
        this.socket = new WebSocket(`ws://localhost:8080/collaboration/${sessionId}`);

        return new Promise((resolve, reject) => {
          this.socket.onopen = () => {
            this.isConnected = true;
            this.session = new CollaborationSession(sessionId, userId);

            // Join session
            this.sendMessage({
              type: 'join_session',
              userId,
              userName,
              timestamp: Date.now()
            });

            resolve(this.session);
          };

          this.socket.onmessage = (event) => {
            this.handleMessage(JSON.parse(event.data));
          };

          this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            reject(error);
          };

          this.socket.onclose = () => {
            this.isConnected = false;
            this.emit('disconnected');
          };
        });
      } catch (error) {
        console.error('Failed to connect to collaboration server:', error);
        throw error;
      }
    }

    sendMessage(message) {
      if (this.socket && this.isConnected) {
        this.socket.send(JSON.stringify(message));
      }
    }

    handleMessage(message) {
      switch (message.type) {
        case 'user_joined':
          this.handleUserJoined(message);
          break;
        case 'user_left':
          this.handleUserLeft(message);
          break;
        case 'state_change':
          this.handleStateChange(message);
          break;
        case 'comment_added':
          this.handleCommentAdded(message);
          break;
        case 'version_created':
          this.handleVersionCreated(message);
          break;
        default:
          this.emit('message_received', message);
      }
    }

    handleUserJoined(message) {
      const user = {
        id: message.userId,
        name: message.userName,
        color: this.generateUserColor(message.userId),
        cursor: { x: 0, y: 0 },
        selection: null,
        permission: message.permission || UserPermission.VIEWER,
        isActive: true,
        lastActivity: new Date()
      };

      this.session.addUser(user);
      this.emit(CollaborationEventType.USER_JOINED, user);
    }

    handleUserLeft(message) {
      const user = this.session.getUser(message.userId);
      if (user) {
        this.session.removeUser(message.userId);
        this.emit(CollaborationEventType.USER_LEFT, user);
      }
    }

    handleStateChange(message) {
      // Handle incoming state changes from other users
      const change = message.change;
      const conflicts = this.conflictResolver.detectConflicts(change);

      if (conflicts.length === 0) {
        // Apply change
        this.applyRemoteChange(change);
        this.emit('change_applied', change);
      } else {
        // Handle conflicts
        const resolution = this.conflictResolver.resolveConflicts(conflicts, change);
        this.emit('conflict_detected', { conflicts, resolution });
      }
    }

    handleCommentAdded(message) {
      this.emit(CollaborationEventType.COMMENT_ADDED, message.comment);
    }

    handleVersionCreated(message) {
      this.emit(CollaborationEventType.VERSION_CREATED, message.version);
    }

    broadcastChange(change) {
      this.pendingChanges.push(change);
      this.flushPendingChanges();
    }

    flushPendingChanges() {
      if (this.pendingChanges.length > 0) {
        this.sendMessage({
          type: 'state_change',
          changes: this.pendingChanges.splice(0),
          timestamp: Date.now()
        });
      }
    }

    updateCursor(userId, position) {
      const user = this.session.getUser(userId);
      if (user) {
        user.cursor = position;
        this.sendMessage({
          type: 'cursor_update',
          userId,
          position,
          timestamp: Date.now()
        });
      }
    }

    updateSelection(userId, selection) {
      const user = this.session.getUser(userId);
      if (user) {
        user.selection = selection;
        this.sendMessage({
          type: 'selection_update',
          userId,
          selection,
          timestamp: Date.now()
        });
      }
    }

    generateUserColor(userId) {
      // Generate consistent color based on user ID
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
      ];
      const hash = userId.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      return colors[Math.abs(hash) % colors.length];
    }

    applyRemoteChange(change) {
      // Apply change to local state (implementation depends on state management)
      this.emit('remote_change_applied', change);
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(eventType, data) {
      this.listeners.forEach(listener => {
        try {
          listener(eventType, data);
        } catch (error) {
          console.error('Collaboration listener error:', error);
        }
      });
    }

    disconnect() {
      if (this.socket) {
        this.socket.close();
      }
      this.isConnected = false;
      this.session = null;
    }
  }

  // Conflict Resolution System
  class ConflictResolver {
    constructor() {
      this.resolutionStrategies = {
        last_write_wins: (conflicts, newChange) => newChange,
        merge: (conflicts, newChange) => this.mergeChanges(conflicts, newChange),
        manual: (conflicts, newChange) => ({ conflicts, newChange, needsManualResolution: true })
      };
    }

    detectConflicts(newChange) {
      // Simplified conflict detection
      // In a real implementation, this would check for overlapping changes
      return [];
    }

    resolveConflicts(conflicts, newChange, strategy = 'merge') {
      const resolver = this.resolutionStrategies[strategy];
      return resolver ? resolver(conflicts, newChange) : newChange;
    }

    mergeChanges(conflicts, newChange) {
      // Simple merge strategy
      let merged = { ...newChange };

      conflicts.forEach(conflict => {
        // Merge properties (new change takes precedence for conflicts)
        merged = { ...conflict, ...merged };
      });

      return merged;
    }
  }

  // Change Buffer for Batch Operations
  class ChangeBuffer {
    constructor() {
      this.buffer = [];
      this.maxBufferSize = 50;
      this.flushInterval = 100; // ms
      this.flushTimer = null;
    }

    addChange(change) {
      this.buffer.push(change);

      if (this.buffer.length >= this.maxBufferSize) {
        this.flush();
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
      }
    }

    flush() {
      if (this.buffer.length > 0) {
        // Send batched changes
        global.CollaborationManager?.broadcastBatch(this.buffer.splice(0));
      }

      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    }

    getPendingChanges() {
      return [...this.buffer];
    }

    clear() {
      this.buffer = [];
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    }
  }

  // Comment System
  class CommentManager {
    constructor() {
      this.comments = new Map();
      this.commentThreads = new Map();
      this.listeners = new Set();
    }

    addComment(threadId, comment) {
      const fullComment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        threadId,
        authorId: comment.authorId,
        authorName: comment.authorName,
        content: comment.content,
        timestamp: new Date(),
        position: comment.position, // { x, y } or { time, trackId }
        resolved: false,
        replies: [],
        ...comment
      };

      if (!this.commentThreads.has(threadId)) {
        this.commentThreads.set(threadId, []);
      }

      this.commentThreads.get(threadId).push(fullComment);
      this.comments.set(fullComment.id, fullComment);

      // Broadcast to collaborators
      global.CollaborationManager?.broadcastComment(fullComment);

      this.emit('comment_added', fullComment);
      return fullComment.id;
    }

    resolveComment(commentId) {
      const comment = this.comments.get(commentId);
      if (comment) {
        comment.resolved = true;
        this.emit('comment_resolved', comment);

        // Broadcast to collaborators
        global.CollaborationManager?.broadcastCommentResolution(commentId);
      }
    }

    getCommentsForPosition(position) {
      // Find comments near the given position
      const nearbyComments = [];

      for (const [threadId, comments] of this.commentThreads) {
        for (const comment of comments) {
          if (this.isNearPosition(comment.position, position)) {
            nearbyComments.push(comment);
          }
        }
      }

      return nearbyComments;
    }

    isNearPosition(pos1, pos2, threshold = 10) {
      if (pos1.x !== undefined && pos2.x !== undefined) {
        // Canvas position
        const distance = Math.sqrt(
          Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
        );
        return distance <= threshold;
      } else if (pos1.time !== undefined && pos2.time !== undefined) {
        // Timeline position
        return Math.abs(pos1.time - pos2.time) <= threshold / 100; // Convert pixels to time
      }
      return false;
    }

    getCommentThreads() {
      return Array.from(this.commentThreads.entries()).map(([threadId, comments]) => ({
        threadId,
        comments,
        unresolvedCount: comments.filter(c => !c.resolved).length
      }));
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(eventType, data) {
      this.listeners.forEach(listener => {
        try {
          listener(eventType, data);
        } catch (error) {
          console.error('Comment manager listener error:', error);
        }
      });
    }
  }

  // Version Control System
  class VersionControlManager {
    constructor() {
      this.versions = new Map();
      this.currentVersion = null;
      this.branches = new Map();
      this.listeners = new Set();
    }

    createVersion(projectState, metadata = {}) {
      const version = {
        id: `version_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: metadata.name || `Version ${this.versions.size + 1}`,
        description: metadata.description || '',
        authorId: metadata.authorId,
        authorName: metadata.authorName,
        timestamp: new Date(),
        projectState: JSON.stringify(projectState), // Store as JSON
        parentVersion: this.currentVersion,
        tags: metadata.tags || [],
        isPublished: metadata.isPublished || false,
        thumbnail: metadata.thumbnail
      };

      this.versions.set(version.id, version);
      this.currentVersion = version.id;

      // Create branch if specified
      if (metadata.branchName) {
        this.createBranch(metadata.branchName, version.id);
      }

      this.emit('version_created', version);
      return version.id;
    }

    restoreVersion(versionId) {
      const version = this.versions.get(versionId);
      if (!version) {
        throw new Error(`Version ${versionId} not found`);
      }

      try {
        const projectState = JSON.parse(version.projectState);
        this.currentVersion = versionId;

        this.emit('version_restored', { versionId, projectState });
        return projectState;
      } catch (error) {
        throw new Error(`Failed to restore version: ${error.message}`);
      }
    }

    createBranch(name, fromVersionId) {
      const fromVersion = this.versions.get(fromVersionId);
      if (!fromVersion) {
        throw new Error(`Source version ${fromVersionId} not found`);
      }

      const branch = {
        id: `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        createdFrom: fromVersionId,
        createdAt: new Date(),
        headVersion: fromVersionId,
        versions: [fromVersionId]
      };

      this.branches.set(branch.id, branch);
      this.emit('branch_created', branch);
      return branch.id;
    }

    mergeBranches(sourceBranchId, targetBranchId, strategy = 'fast-forward') {
      const sourceBranch = this.branches.get(sourceBranchId);
      const targetBranch = this.branches.get(targetBranchId);

      if (!sourceBranch || !targetBranch) {
        throw new Error('Branch not found');
      }

      // Simplified merge logic
      const mergeResult = {
        sourceBranchId,
        targetBranchId,
        strategy,
        conflicts: [],
        mergedVersion: sourceBranch.headVersion
      };

      this.emit('branches_merged', mergeResult);
      return mergeResult;
    }

    getVersionHistory(limit = 50) {
      const versions = Array.from(this.versions.values())
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);

      return versions;
    }

    getBranches() {
      return Array.from(this.branches.values());
    }

    tagVersion(versionId, tag) {
      const version = this.versions.get(versionId);
      if (version && !version.tags.includes(tag)) {
        version.tags.push(tag);
        this.emit('version_tagged', { versionId, tag });
      }
    }

    exportVersion(versionId) {
      const version = this.versions.get(versionId);
      if (!version) {
        throw new Error(`Version ${versionId} not found`);
      }

      return {
        ...version,
        projectState: JSON.parse(version.projectState)
      };
    }

    importVersion(versionData) {
      const version = {
        ...versionData,
        id: versionData.id || `imported_${Date.now()}`,
        timestamp: new Date(versionData.timestamp),
        projectState: JSON.stringify(versionData.projectState)
      };

      this.versions.set(version.id, version);
      this.emit('version_imported', version);
      return version.id;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(eventType, data) {
      this.listeners.forEach(listener => {
        try {
          listener(eventType, data);
        } catch (error) {
          console.error('Version control listener error:', error);
        }
      });
    }
  }

  // Permission Management System
  class PermissionManager {
    constructor() {
      this.permissions = new Map();
      this.roleDefinitions = {
        [UserPermission.OWNER]: {
          canEdit: true,
          canDelete: true,
          canShare: true,
          canInvite: true,
          canManagePermissions: true,
          canComment: true,
          canView: true
        },
        [UserPermission.EDITOR]: {
          canEdit: true,
          canDelete: false,
          canShare: false,
          canInvite: false,
          canManagePermissions: false,
          canComment: true,
          canView: true
        },
        [UserPermission.COMMENTER]: {
          canEdit: false,
          canDelete: false,
          canShare: false,
          canInvite: false,
          canManagePermissions: false,
          canComment: true,
          canView: true
        },
        [UserPermission.VIEWER]: {
          canEdit: false,
          canDelete: false,
          canShare: false,
          canInvite: false,
          canManagePermissions: false,
          canComment: false,
          canView: true
        }
      };
    }

    setUserPermission(sessionId, userId, permission) {
      const key = `${sessionId}:${userId}`;
      this.permissions.set(key, permission);
      this.emit('permission_changed', { sessionId, userId, permission });
    }

    getUserPermission(sessionId, userId) {
      const key = `${sessionId}:${userId}`;
      return this.permissions.get(key) || UserPermission.VIEWER;
    }

    checkPermission(sessionId, userId, action) {
      const permission = this.getUserPermission(sessionId, userId);
      const roleDef = this.roleDefinitions[permission];

      if (!roleDef) return false;

      switch (action) {
        case 'edit':
          return roleDef.canEdit;
        case 'delete':
          return roleDef.canDelete;
        case 'share':
          return roleDef.canShare;
        case 'invite':
          return roleDef.canInvite;
        case 'manage_permissions':
          return roleDef.canManagePermissions;
        case 'comment':
          return roleDef.canComment;
        case 'view':
          return roleDef.canView;
        default:
          return false;
      }
    }

    getRoleCapabilities(role) {
      return this.roleDefinitions[role] || {};
    }

    getAllRoles() {
      return Object.keys(this.roleDefinitions);
    }

    subscribe(listener) {
      // Implementation for event subscription
      return () => {};
    }

    emit(eventType, data) {
      // Implementation for event emission
    }
  }

  // Main Collaboration Manager
  class CollaborationManager {
    constructor() {
      this.syncManager = new RealTimeSyncManager();
      this.commentManager = new CommentManager();
      this.versionManager = new VersionControlManager();
      this.permissionManager = new PermissionManager();
      this.isInitialized = false;
      this.listeners = new Set();
    }

    async initialize() {
      if (this.isInitialized) return;

      // Initialize subsystems
      this.setupEventForwarding();
      this.isInitialized = true;

      this.emit('initialized');
    }

    setupEventForwarding() {
      // Forward events from subsystems
      this.syncManager.subscribe((eventType, data) => {
        this.emit(eventType, data);
      });

      this.commentManager.subscribe((eventType, data) => {
        this.emit(eventType, data);
      });

      this.versionManager.subscribe((eventType, data) => {
        this.emit(eventType, data);
      });
    }

    // Session Management
    async createSession(ownerId, ownerName, settings = {}) {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      try {
        const session = await this.syncManager.connect(sessionId, ownerId, ownerName);

        // Set owner permissions
        this.permissionManager.setUserPermission(sessionId, ownerId, UserPermission.OWNER);

        this.emit('session_created', { sessionId, session });
        return sessionId;
      } catch (error) {
        throw new Error(`Failed to create session: ${error.message}`);
      }
    }

    async joinSession(sessionId, userId, userName) {
      try {
        const session = await this.syncManager.connect(sessionId, userId, userName);
        this.emit('session_joined', { sessionId, session });
        return session;
      } catch (error) {
        throw new Error(`Failed to join session: ${error.message}`);
      }
    }

    leaveSession() {
      this.syncManager.disconnect();
      this.emit('session_left');
    }

    // Real-time Collaboration
    broadcastChange(change) {
      this.syncManager.broadcastChange(change);
    }

    broadcastBatch(changes) {
      // Send multiple changes at once
      this.syncManager.sendMessage({
        type: 'batch_changes',
        changes,
        timestamp: Date.now()
      });
    }

    updateCursor(position) {
      // Implementation depends on current user context
      this.emit('cursor_updated', position);
    }

    updateSelection(selection) {
      this.emit('selection_updated', selection);
    }

    // Comments
    addComment(threadId, comment) {
      return this.commentManager.addComment(threadId, comment);
    }

    resolveComment(commentId) {
      this.commentManager.resolveComment(commentId);
    }

    getCommentsForPosition(position) {
      return this.commentManager.getCommentsForPosition(position);
    }

    // Version Control
    createVersion(projectState, metadata) {
      return this.versionManager.createVersion(projectState, metadata);
    }

    restoreVersion(versionId) {
      return this.versionManager.restoreVersion(versionId);
    }

    createBranch(name, fromVersionId) {
      return this.versionManager.createBranch(name, fromVersionId);
    }

    mergeBranches(sourceBranchId, targetBranchId) {
      return this.versionManager.mergeBranches(sourceBranchId, targetBranchId);
    }

    // Permissions
    setUserPermission(sessionId, userId, permission) {
      this.permissionManager.setUserPermission(sessionId, userId, permission);
    }

    checkPermission(sessionId, userId, action) {
      return this.permissionManager.checkPermission(sessionId, userId, action);
    }

    // Broadcasting helpers
    broadcastComment(comment) {
      this.syncManager.sendMessage({
        type: 'comment_broadcast',
        comment,
        timestamp: Date.now()
      });
    }

    broadcastCommentResolution(commentId) {
      this.syncManager.sendMessage({
        type: 'comment_resolution',
        commentId,
        timestamp: Date.now()
      });
    }

    // Utility methods
    getActiveUsers() {
      return this.syncManager.session?.getActiveUsers() || [];
    }

    getSessionInfo() {
      return {
        session: this.syncManager.session,
        userCount: this.getActiveUsers().length,
        commentsCount: this.commentManager.comments.size,
        versionsCount: this.versionManager.versions.size
      };
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(eventType, data) {
      this.listeners.forEach(listener => {
        try {
          listener(eventType, data);
        } catch (error) {
          console.error('Collaboration manager listener error:', error);
        }
      });
    }
  }

  // Global collaboration manager instance
  const collaborationManager = new CollaborationManager();

  // Initialize on load
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => {
        collaborationManager.initialize();
      });
    } else {
      collaborationManager.initialize();
    }
  }

  // Export collaboration functionality
  global.CollaborationEventType = CollaborationEventType;
  global.UserPermission = UserPermission;
  global.CollaborationManager = collaborationManager;
  global.RealTimeSyncManager = RealTimeSyncManager;
  global.CommentManager = CommentManager;
  global.VersionControlManager = VersionControlManager;
  global.PermissionManager = PermissionManager;

})(typeof window !== 'undefined' ? window : globalThis);
