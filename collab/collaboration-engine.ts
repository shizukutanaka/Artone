/**
 * Artone v3 — Real-time Collaboration Engine
 * 
 * Figma風リアルタイムコラボレーション
 * - CRDT同期 (Yjs互換)
 * - WebRTC P2P
 * - カーソル共有
 * - コメント/アノテーション
 * - バージョン履歴
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface CollabUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  status: 'online' | 'away' | 'offline';
  cursor?: { x: number; y: number; view: string };
  selection?: string[];
  lastActive: number;
}

export type UserRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface Comment {
  id: string;
  authorId: string;
  content: string;
  timestamp: number;
  position?: { x: number; y: number; time?: number };
  replies: Comment[];
  resolved: boolean;
  clipId?: string;
}

export interface Annotation {
  id: string;
  authorId: string;
  type: 'draw' | 'arrow' | 'text' | 'highlight';
  data: unknown;
  frame: number;
  visible: boolean;
}

export interface Version {
  id: string;
  name: string;
  authorId: string;
  timestamp: number;
  snapshot: string;
}

export interface SyncMessage {
  type: 'update' | 'awareness' | 'sync';
  userId: string;
  data: unknown;
  timestamp: number;
}

// ============================================================
// User Colors
// ============================================================

const USER_COLORS = [
  // Figma 公式コラボレーションカラー (ユーザーアイデンティティ用 — design-system 外)
  '#F24E1E', '#FF7262', '#A259FF', '#1ABCFE',
  '#0ACF83', '#FFCD29', '#FF8C00', '#E91E63'
];

// ============================================================
// Collaboration Engine
// ============================================================

export class CollaborationEngine {
  private users: Map<string, CollabUser> = new Map();
  private comments: Map<string, Comment> = new Map();
  private annotations: Map<string, Annotation> = new Map();
  private versions: Version[] = [];
  private localUser: CollabUser | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private channels: Map<string, RTCDataChannel> = new Map();
  private vectorClock: Map<string, number> = new Map();
  private docState: Map<string, unknown> = new Map();
  private listeners: Set<() => void> = new Set();
  private connected = false;

  // ============================================================
  // Connection
  // ============================================================


  /** localUser が null の場合は例外をスロー。connect() 前の操作を防ぐ。 */
  private requireLocalUser(): CollabUser {
    if (!this.localUser) throw new Error('Not connected. Call connect() first.');
    return this.localUser;
  }

  async connect(_projectId: string, user: { id: string; name: string; avatar?: string }): Promise<void> {
    const colorIdx = this.hash(user.id) % USER_COLORS.length;
    
    this.localUser = {
      ...user,
      color: USER_COLORS[colorIdx],
      status: 'online',
      lastActive: Date.now()
    };

    this.users.set(user.id, this.localUser);
    this.connected = true;
    this.notify();
  }

  disconnect(): void {
    for (const pc of this.peers.values()) {
      pc.close();
    }
    this.peers.clear();
    this.channels.clear();
    this.connected = false;
    this.notify();
  }

  // ============================================================
  // Presence
  // ============================================================

  updateCursor(x: number, y: number, view: string): void {
    if (!this.localUser) return;
    
    this.localUser.cursor = { x, y, view };
    this.localUser.lastActive = Date.now();
    this.broadcast({ type: 'awareness', userId: this.localUser.id, data: { cursor: { x, y, view } }, timestamp: Date.now() });
  }

  updateSelection(clipIds: string[]): void {
    if (!this.localUser) return;
    
    this.localUser.selection = clipIds;
    this.broadcast({ type: 'awareness', userId: this.localUser.id, data: { selection: clipIds }, timestamp: Date.now() });
    this.notify();
  }

  setStatus(status: 'online' | 'away' | 'offline'): void {
    if (!this.localUser) return;
    
    this.localUser.status = status;
    this.broadcast({ type: 'awareness', userId: this.localUser.id, data: { status }, timestamp: Date.now() });
    this.notify();
  }

  // ============================================================
  // Comments
  // ============================================================

  addComment(content: string, position?: Comment['position'], clipId?: string): Comment {
    const comment: Comment = {
      id: crypto.randomUUID(),
      authorId: this.requireLocalUser().id,
      content,
      timestamp: Date.now(),
      position,
      replies: [],
      resolved: false,
      clipId
    };

    this.comments.set(comment.id, comment);
    this.broadcastUpdate('comment-add', comment);
    this.notify();
    return comment;
  }

  replyToComment(parentId: string, content: string): Comment | null {
    const parent = this.comments.get(parentId);
    if (!parent) return null;

    const reply: Comment = {
      id: crypto.randomUUID(),
      authorId: this.requireLocalUser().id,
      content,
      timestamp: Date.now(),
      replies: [],
      resolved: false
    };

    parent.replies.push(reply);
    this.broadcastUpdate('comment-reply', { parentId, reply });
    this.notify();
    return reply;
  }

  resolveComment(commentId: string): void {
    const comment = this.comments.get(commentId);
    if (comment) {
      comment.resolved = true;
      this.broadcastUpdate('comment-resolve', { commentId });
      this.notify();
    }
  }

  deleteComment(commentId: string): void {
    this.comments.delete(commentId);
    this.broadcastUpdate('comment-delete', { commentId });
    this.notify();
  }

  // ============================================================
  // Annotations
  // ============================================================

  addAnnotation(type: Annotation['type'], data: unknown, frame: number): Annotation {
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      authorId: this.requireLocalUser().id,
      type,
      data,
      frame,
      visible: true
    };

    this.annotations.set(annotation.id, annotation);
    this.broadcastUpdate('annotation-add', annotation);
    this.notify();
    return annotation;
  }

  deleteAnnotation(annotationId: string): void {
    this.annotations.delete(annotationId);
    this.broadcastUpdate('annotation-delete', { annotationId });
    this.notify();
  }

  getAnnotationsForFrame(frame: number): Annotation[] {
    return Array.from(this.annotations.values()).filter(a => a.frame === frame);
  }

  // ============================================================
  // Versions
  // ============================================================

  createVersion(name: string): Version {
    const version: Version = {
      id: crypto.randomUUID(),
      name,
      authorId: this.requireLocalUser().id,
      timestamp: Date.now(),
      snapshot: JSON.stringify(Object.fromEntries(this.docState))
    };

    this.versions.push(version);
    if (this.versions.length > 50) {
      this.versions = this.versions.slice(-50);
    }

    this.broadcastUpdate('version-create', version);
    this.notify();
    return version;
  }

  restoreVersion(versionId: string): boolean {
    const version = this.versions.find(v => v.id === versionId);
    if (!version) return false;

    this.docState = new Map(Object.entries(JSON.parse(version.snapshot)));
    this.broadcastUpdate('version-restore', { versionId });
    this.notify();
    return true;
  }

  // ============================================================
  // CRDT Operations
  // ============================================================

  applyOperation(path: string[], op: 'set' | 'delete', value?: unknown): void {
    const userId = this.requireLocalUser().id;
    this.vectorClock.set(userId, (this.vectorClock.get(userId) || 0) + 1);

    const key = path.join('.');
    
    if (op === 'set') {
      this.docState.set(key, value);
    } else {
      this.docState.delete(key);
    }

    this.broadcastUpdate('operation', {
      path, op, value,
      clock: Object.fromEntries(this.vectorClock)
    });
  }

  /**
   * Vector Clock の因果順序を比較する (CRDT happens-before 関係)。
   * 出典: Shapiro et al. 2011 (CRDT), Lamport 1978 (causal ordering)。
   *
   * @returns 'before' (a→b), 'after' (b→a), 'concurrent' (並行), 'equal'
   */
  static compareClocks(
    a: Record<string, number>,
    b: Record<string, number>
  ): 'before' | 'after' | 'concurrent' | 'equal' {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let aLess = false; // a に b より小さい要素がある
    let aGreater = false; // a に b より大きい要素がある

    for (const k of keys) {
      const av = a[k] ?? 0;
      const bv = b[k] ?? 0;
      if (av < bv) aLess = true;
      else if (av > bv) aGreater = true;
    }

    if (!aLess && !aGreater) return 'equal';
    if (aLess && !aGreater) return 'before';   // a は b の因果的過去
    if (aGreater && !aLess) return 'after';    // a は b の因果的未来
    return 'concurrent';                        // 並行 — 競合解決が必要
  }

  /**
   * 並行操作の競合を Last-Write-Wins で解決する。
   * タイブレークは userId の辞書順 (決定的)。
   * 出典: CRDT LWW-Register (Shapiro et al.)。
   */
  static resolveConflict(
    opA: { clock: Record<string, number>; userId: string; value: unknown },
    opB: { clock: Record<string, number>; userId: string; value: unknown }
  ): unknown {
    const order = CollaborationEngine.compareClocks(opA.clock, opB.clock);
    if (order === 'before') return opB.value;  // B が新しい
    if (order === 'after') return opA.value;   // A が新しい
    // concurrent / equal → userId 辞書順でタイブレーク (決定的)
    return opA.userId >= opB.userId ? opA.value : opB.value;
  }

  /**
   * リモートの Vector Clock をローカルにマージ (各要素の最大値)。
   * 受信操作の適用時に呼ぶ。
   */
  mergeRemoteClock(remote: Record<string, number>): void {
    for (const [k, v] of Object.entries(remote)) {
      this.vectorClock.set(k, Math.max(this.vectorClock.get(k) ?? 0, v));
    }
  }

  // ============================================================
  // Messaging
  // ============================================================

  private broadcast(message: SyncMessage): void {
    for (const dc of this.channels.values()) {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify(message));
      }
    }
  }

  private broadcastUpdate(type: string, data: unknown): void {
    this.broadcast({
      type: 'update',
      userId: this.requireLocalUser().id,
      data: { type, data },
      timestamp: Date.now()
    });
  }

  // ============================================================
  // State Access
  // ============================================================

  getUsers(): CollabUser[] {
    return Array.from(this.users.values());
  }

  getOnlineUsers(): CollabUser[] {
    return this.getUsers().filter(u => u.status === 'online');
  }

  getComments(): Comment[] {
    return Array.from(this.comments.values());
  }

  getUnresolvedComments(): Comment[] {
    return this.getComments().filter(c => !c.resolved);
  }

  getVersions(): Version[] {
    return [...this.versions];
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

