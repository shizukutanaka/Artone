/**
 * CRDT Collaborative Editing with Yjs
 * Conflict-free Replicated Data Type for real-time multi-user video editing
 * Supports offline editing with eventual consistency
 * Reference: https://docs.yjs.dev/
 */

import * as Y from 'yjs';

/**
 * Collaborative timeline state structure
 * Uses Yjs CRDT to maintain consistency across clients
 */
export interface CollaborativeTimeline {
  clips: Y.Map<CollaborativeClip>;
  effects: Y.Map<CollaborativeEffect>;
  layers: Y.Array<CollaborativeLayer>;
  undoStack: Y.Array<UndoOperation>;
  metadata: Y.Map<unknown>;
}

/**
 * Video clip in collaborative context
 */
export interface CollaborativeClip {
  id: string;
  source: string;
  startTime: number;
  duration: number;
  speed: number;
  opacity: number;
  position: {
    x: number;
    y: number;
  };
  properties: Record<string, unknown>;
  lastModifiedBy: string;
  lastModifiedAt: number;
}

/**
 * Effect applied to clip
 */
export interface CollaborativeEffect {
  id: string;
  type: string;
  clipId: string;
  params: Record<string, unknown>;
  enabled: boolean;
  order: number;
}

/**
 * Timeline layer for organizing clips
 */
export interface CollaborativeLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
}

/**
 * Undo operation for collaborative undo/redo
 * Stores operation metadata for proper rollback
 */
export interface UndoOperation {
  id: string;
  type: 'add' | 'remove' | 'modify';
  target: string; // 'clip' | 'effect' | 'layer'
  targetId: string;
  change: Record<string, unknown>;
  userId: string;
  timestamp: number;
  dependencies: string[]; // IDs of operations this depends on
}

/**
 * User presence information for real-time collaboration
 */
export interface UserPresence {
  userId: string;
  userName: string;
  color: string;
  cursor: {
    x: number;
    y: number;
  };
  selection: {
    clipIds: string[];
    layerId: string | null;
  };
  isActive: boolean;
  lastSeen: number;
}

/**
 * Collaborative document manager using Yjs
 */
export class CollaborativeDocument {
  private yDoc: Y.Doc;
  private yTimeline: CollaborativeTimeline;
  private presenceProvider: PresenceProvider;
  private undoManager: Y.UndoManager;
  private userId: string;
  private userName: string;

  constructor(userId: string, userName: string) {
    this.userId = userId;
    this.userName = userName;
    this.yDoc = new Y.Doc();

    // Initialize collaborative timeline structure
    this.yTimeline = {
      clips: this.yDoc.getMap('clips'),
      effects: this.yDoc.getMap('effects'),
      layers: this.yDoc.getArray('layers'),
      undoStack: this.yDoc.getArray('undoStack'),
      metadata: this.yDoc.getMap('metadata'),
    };

    // Initialize undo/redo manager
    // Tracks changes and enables undo/redo in collaborative context
    this.undoManager = new Y.UndoManager(
      [this.yTimeline.clips, this.yTimeline.effects, this.yTimeline.layers],
      {
        trackedOrigins: new Set([this.userId]),
      }
    );

    // Initialize presence provider
    this.presenceProvider = new PresenceProvider(this.yDoc, this.userId, this.userName);
  }

  /**
   * Add a video clip to the timeline
   */
  addClip(clip: CollaborativeClip): void {
    const yClip = new Y.Map();
    Object.entries(clip).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        const yMap = new Y.Map();
        Object.entries(value).forEach(([k, v]) => yMap.set(k, v));
        yClip.set(key, yMap);
      } else {
        yClip.set(key, value);
      }
    });

    yClip.set('lastModifiedBy', this.userId);
    yClip.set('lastModifiedAt', Date.now());

    this.yTimeline.clips.set(clip.id, yClip);

    // Record undo operation
    this.recordUndoOperation({
      id: `clip-add-${clip.id}`,
      type: 'add',
      target: 'clip',
      targetId: clip.id,
      change: clip,
      userId: this.userId,
      timestamp: Date.now(),
      dependencies: [],
    });
  }

  /**
   * Remove a clip from the timeline
   */
  removeClip(clipId: string): void {
    const clip = this.yTimeline.clips.get(clipId);
    if (!clip) {
      console.warn(`Clip not found: ${clipId}`);
      return;
    }

    // Record undo operation before removal
    const clipData = clip.toJSON();
    this.recordUndoOperation({
      id: `clip-remove-${clipId}`,
      type: 'remove',
      target: 'clip',
      targetId: clipId,
      change: clipData,
      userId: this.userId,
      timestamp: Date.now(),
      dependencies: [],
    });

    // Remove clip and associated effects
    this.yTimeline.clips.delete(clipId);
    this.yTimeline.effects.forEach((effect, effectId) => {
      if ((effect as any).get?.('clipId') === clipId) {
        this.yTimeline.effects.delete(effectId);
      }
    });
  }

  /**
   * Modify clip properties
   */
  updateClip(clipId: string, updates: Partial<CollaborativeClip>): void {
    const yClip = this.yTimeline.clips.get(clipId);
    if (!yClip) {
      console.warn(`Clip not found: ${clipId}`);
      return;
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const yMap = yClip.get(key) || new Y.Map();
        Object.entries(value).forEach(([k, v]) => yMap.set(k, v));
        yClip.set(key, yMap);
      } else {
        yClip.set(key, value);
      }
    });

    yClip.set('lastModifiedBy', this.userId);
    yClip.set('lastModifiedAt', Date.now());

    this.recordUndoOperation({
      id: `clip-modify-${clipId}-${Date.now()}`,
      type: 'modify',
      target: 'clip',
      targetId: clipId,
      change: updates,
      userId: this.userId,
      timestamp: Date.now(),
      dependencies: [],
    });
  }

  /**
   * Add an effect to a clip
   */
  addEffect(effect: CollaborativeEffect): void {
    const yEffect = new Y.Map();
    Object.entries(effect).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        const yMap = new Y.Map();
        Object.entries(value).forEach(([k, v]) => yMap.set(k, v));
        yEffect.set(key, yMap);
      } else {
        yEffect.set(key, value);
      }
    });

    this.yTimeline.effects.set(effect.id, yEffect);

    this.recordUndoOperation({
      id: `effect-add-${effect.id}`,
      type: 'add',
      target: 'effect',
      targetId: effect.id,
      change: effect,
      userId: this.userId,
      timestamp: Date.now(),
      dependencies: [`clip-add-${effect.clipId}`],
    });
  }

  /**
   * Get all clips
   */
  getClips(): CollaborativeClip[] {
    const clips: CollaborativeClip[] = [];
    this.yTimeline.clips.forEach((yClip, id) => {
      clips.push({
        id,
        ...(yClip.toJSON() as any),
      });
    });
    return clips;
  }

  /**
   * Get all effects for a clip
   */
  getEffects(clipId: string): CollaborativeEffect[] {
    const effects: CollaborativeEffect[] = [];
    this.yTimeline.effects.forEach((yEffect, id) => {
      const effect = yEffect.toJSON() as any;
      if (effect.clipId === clipId) {
        effects.push({
          id,
          ...effect,
        });
      }
    });
    return effects;
  }

  /**
   * Record an operation for undo/redo
   */
  private recordUndoOperation(operation: UndoOperation): void {
    const yOp = new Y.Map();
    Object.entries(operation).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        const yArray = new Y.Array();
        value.forEach((v) => yArray.push([v]));
        yOp.set(key, yArray);
      } else if (typeof value === 'object' && value !== null) {
        const yMap = new Y.Map();
        Object.entries(value).forEach(([k, v]) => yMap.set(k, v));
        yOp.set(key, yMap);
      } else {
        yOp.set(key, value);
      }
    });

    this.yTimeline.undoStack.push([yOp]);
  }

  /**
   * Undo last operation
   */
  undo(): void {
    this.undoManager.undo();
  }

  /**
   * Redo last undone operation
   */
  redo(): void {
    this.undoManager.redo();
  }

  /**
   * Clear undo stack (e.g., after save)
   */
  clearUndoStack(): void {
    this.undoManager.destroy();
  }

  /**
   * Get presence provider for real-time user awareness
   */
  getPresenceProvider(): PresenceProvider {
    return this.presenceProvider;
  }

  /**
   * Export document state for persistence
   */
  exportState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.yDoc);
  }

  /**
   * Import document state (for loading saved docs or syncing)
   */
  importState(state: Uint8Array): void {
    Y.applyUpdate(this.yDoc, state);
  }

  /**
   * Observe changes on the document
   */
  onUpdate(callback: (update: Uint8Array, origin: any) => void): () => void {
    const observer = (update: Uint8Array, origin: any) => {
      callback(update, origin);
    };
    this.yDoc.on('update', observer);
    return () => this.yDoc.off('update', observer);
  }

  /**
   * Get the underlying Yjs document
   */
  getYDoc(): Y.Doc {
    return this.yDoc;
  }

  /**
   * Destroy the document and clean up resources
   */
  destroy(): void {
    this.undoManager.destroy();
    this.presenceProvider.destroy();
    this.yDoc.destroy();
  }
}

/**
 * Presence awareness provider
 * Tracks which users are actively editing and their cursor positions
 */
export class PresenceProvider {
  private awareness: Y.Awareness;
  private userId: string;
  private userName: string;
  private presenceUpdates: Map<string, UserPresence> = new Map();

  constructor(yDoc: Y.Doc, userId: string, userName: string) {
    this.userId = userId;
    this.userName = userName;
    this.awareness = yDoc.awareness;

    // Set local user presence
    this.awareness.setLocalState({
      userId,
      userName,
      color: this.generateUserColor(),
      cursor: { x: 0, y: 0 },
      selection: { clipIds: [], layerId: null },
      isActive: true,
      lastSeen: Date.now(),
    });

    // Listen for presence changes
    this.awareness.on('change', (changes) => {
      changes.added.forEach((clientId) => this.onPresenceAdded(clientId));
      changes.updated.forEach((clientId) => this.onPresenceUpdated(clientId));
      changes.removed.forEach((clientId) => this.onPresenceRemoved(clientId));
    });
  }

  /**
   * Update local presence (cursor, selection, etc.)
   */
  updatePresence(updates: Partial<UserPresence>): void {
    const current = this.awareness.getLocalState();
    this.awareness.setLocalState({
      ...current,
      ...updates,
      lastSeen: Date.now(),
    });
  }

  /**
   * Get all active users
   */
  getActiveUsers(): UserPresence[] {
    const users: UserPresence[] = [];
    this.awareness.getStates().forEach((state: any) => {
      if (state && state.isActive) {
        users.push(state);
      }
    });
    return users;
  }

  /**
   * Get specific user's presence
   */
  getUserPresence(userId: string): UserPresence | null {
    for (const state of this.awareness.getStates().values()) {
      if ((state as any).userId === userId) {
        return state as UserPresence;
      }
    }
    return null;
  }

  /**
   * Handle user presence added
   */
  private onPresenceAdded(clientId: number): void {
    const state = this.awareness.getStates().get(clientId);
    if (state) {
      this.presenceUpdates.set(`${clientId}`, state as UserPresence);
    }
  }

  /**
   * Handle user presence updated
   */
  private onPresenceUpdated(clientId: number): void {
    const state = this.awareness.getStates().get(clientId);
    if (state) {
      this.presenceUpdates.set(`${clientId}`, state as UserPresence);
    }
  }

  /**
   * Handle user presence removed
   */
  private onPresenceRemoved(clientId: number): void {
    this.presenceUpdates.delete(`${clientId}`);
  }

  /**
   * Generate unique color for user (for cursor/selection visualization)
   */
  private generateUserColor(): string {
    const colors = [
      '#e74c3c', // Red
      '#3498db', // Blue
      '#2ecc71', // Green
      '#f39c12', // Orange
      '#9b59b6', // Purple
      '#1abc9c', // Teal
      '#e67e22', // Dark Orange
      '#34495e', // Dark Gray
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Clean up presence provider
   */
  destroy(): void {
    this.awareness.setLocalState(null);
  }
}

export default {
  CollaborativeDocument,
  PresenceProvider,
};
