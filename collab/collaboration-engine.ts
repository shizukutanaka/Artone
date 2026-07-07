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
  /** Set on replies only, so resolveComment/deleteComment can locate and
   *  splice them out of their parent's `replies` array by id. */
  parentId?: string;
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
  // Secondary index: frame number → annotation IDs for O(1) lookup.
  // Kept in sync by addAnnotation()/deleteAnnotation() to avoid O(N)
  // full-scan in getAnnotationsForFrame() which is called at 60fps during scrubbing.
  private _annotationFrameIndex: Map<number, Set<string>> = new Map();
  private versions: Version[] = [];
  private localUser: CollabUser | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private channels: Map<string, RTCDataChannel> = new Map();
  private vectorClock: Map<string, number> = new Map();
  private docState: Map<string, unknown> = new Map();
  private listeners: Set<() => void> = new Set();
  private connected = false;
  /**
   * Operations produced while no peer channel is open. CLAUDE.md requires
   * "オフライン時はローカル操作を蓄積": without this, an edit made offline is
   * applied locally but silently never propagated, so collaborators diverge
   * permanently. Flushed by {@link flushPendingOperations} on reconnect.
   */
  private outgoing: SyncMessage[] = [];
  /** Cap so a long offline session cannot grow the queue without bound. */
  private readonly maxQueue = 1000;

  // Cursor (awareness) broadcast coalescing. mousemove can fire 60-120×/s;
  // sending a full JSON message to every peer per move floods the channel.
  // We store the latest position synchronously (instant local UI) and emit at
  // most one broadcast per `cursorThrottleMs` window with the newest value
  // (trailing-edge throttle). Pattern from the Qiita Yjs throttling article.
  /** Throttle window for cursor awareness broadcasts (ms). 50ms ≈ 20fps. */
  private readonly cursorThrottleMs = 50;
  private pendingCursor: { x: number; y: number; view: string } | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;

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
    // Flush any pending cursor move before tearing down channels so the final
    // position is not lost, then clear the throttle timer to avoid a leak.
    this.flushCursor();
    for (const pc of this.peers.values()) {
      pc.close();
    }
    this.peers.clear();
    this.channels.clear();
    // Clear per-session state so re-connecting starts clean. comments/annotations
    // are project content and survive disconnect; they are NOT cleared here.
    this.users.clear();
    this.localUser = null;
    this.vectorClock.clear();
    this.docState.clear();
    this.outgoing = [];
    this.connected = false;
    this.notify();
  }

  // ============================================================
  // Presence
  // ============================================================

  updateCursor(x: number, y: number, view: string): void {
    if (!this.localUser) return;

    // Store immediately so local UI and getUsers() reflect the latest position.
    this.localUser.cursor = { x, y, view };
    this.localUser.lastActive = Date.now();

    // Coalesce the network broadcast: remember the newest position and emit at
    // most once per throttle window (trailing edge keeps the final position).
    this.pendingCursor = { x, y, view };
    if (this.cursorTimer === null) {
      this.cursorTimer = setTimeout(() => this.flushCursor(), this.cursorThrottleMs);
    }
  }

  /**
   * Broadcast the latest pending cursor position, if any, and clear the timer.
   * Called on the throttle timer and on disconnect (to flush the final move).
   */
  private flushCursor(): void {
    if (this.cursorTimer !== null) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }
    if (!this.pendingCursor || !this.localUser) {
      this.pendingCursor = null;
      return;
    }
    const cursor = this.pendingCursor;
    this.pendingCursor = null;
    this.broadcast({ type: 'awareness', userId: this.localUser.id, data: { cursor }, timestamp: Date.now() });
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
      resolved: false,
      parentId
    };

    parent.replies.push(reply);
    // Register the reply under its own id too — otherwise resolveComment/
    // deleteComment (both plain `this.comments.get(id)` lookups) can never
    // find it and silently no-op when a caller resolves/deletes a reply.
    // The same object reference is held by both `parent.replies` and this
    // map entry, so mutating one (e.g. `.resolved = true`) is visible via
    // either path — no data duplication.
    this.comments.set(reply.id, reply);
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
    const comment = this.comments.get(commentId);
    if (comment?.parentId) {
      const parent = this.comments.get(comment.parentId);
      if (parent) {
        parent.replies = parent.replies.filter(r => r.id !== commentId);
      }
    } else {
      // Deleting a top-level comment must also drop its replies' own map
      // entries, or they'd linger as orphaned, independently resolvable/
      // deletable entries with no parent.
      comment?.replies.forEach(r => this.comments.delete(r.id));
    }
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
    // Update secondary frame index
    let frameSet = this._annotationFrameIndex.get(frame);
    if (!frameSet) { frameSet = new Set(); this._annotationFrameIndex.set(frame, frameSet); }
    frameSet.add(annotation.id);
    this.broadcastUpdate('annotation-add', annotation);
    this.notify();
    return annotation;
  }

  deleteAnnotation(annotationId: string): void {
    const annotation = this.annotations.get(annotationId);
    if (annotation) {
      const frameSet = this._annotationFrameIndex.get(annotation.frame);
      if (frameSet) {
        frameSet.delete(annotationId);
        // Remove the empty Set so the index doesn't accumulate stale keys.
        if (frameSet.size === 0) this._annotationFrameIndex.delete(annotation.frame);
      }
    }
    this.annotations.delete(annotationId);
    this.broadcastUpdate('annotation-delete', { annotationId });
    this.notify();
  }

  getAnnotationsForFrame(frame: number): Annotation[] {
    // O(1) frame lookup via secondary index; was O(N) full scan at 60fps during scrubbing.
    const ids = this._annotationFrameIndex.get(frame);
    if (!ids || ids.size === 0) return [];
    const result: Annotation[] = [];
    for (const id of ids) {
      const a = this.annotations.get(id);
      if (a) result.push(a);
    }
    return result;
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

    // A corrupted/truncated snapshot must not crash the editor — fail safely
    // so the caller can fall back to the current state or another version.
    let parsed: unknown;
    try {
      parsed = JSON.parse(version.snapshot);
    } catch {
      return false;
    }
    if (typeof parsed !== 'object' || parsed === null) return false;

    this.docState = new Map(Object.entries(parsed as Record<string, unknown>));
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
   *
   * 入力値をバリデーションする: NaN / Infinity / 負値 を持つエントリは
   * 無視する。これらが混入すると Math.max(..., NaN) = NaN となり、
   * compareClocks の全比較が false → 'equal' を誤返却してしまう。
   * (攻撃者が改ざんした SyncMessage で conflict resolution が崩壊するのを防ぐ)
   */
  mergeRemoteClock(remote: Record<string, number>): void {
    for (const [k, v] of Object.entries(remote)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      this.vectorClock.set(k, Math.max(this.vectorClock.get(k) ?? 0, Math.floor(v)));
    }
  }

  // ============================================================
  // Messaging
  // ============================================================

  private broadcast(message: SyncMessage): void {
    let delivered = false;
    for (const dc of this.channels.values()) {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify(message));
        delivered = true;
      }
    }
    // No open peer (offline / transient drop): buffer instead of silently
    // dropping the edit, so it can be replayed on reconnect.
    if (!delivered) {
      this.outgoing.push(message);
      if (this.outgoing.length > this.maxQueue) {
        this.outgoing.splice(0, this.outgoing.length - this.maxQueue);
      }
    }
  }

  /**
   * Re-send operations buffered while offline to all currently-open channels.
   * Call after a peer (re)connects. No-op when nothing is queued or no channel
   * is open (so the queue is preserved until a peer is actually available).
   *
   * @returns number of buffered operations flushed.
   */
  flushPendingOperations(): number {
    if (this.outgoing.length === 0) return 0;
    const open = Array.from(this.channels.values()).filter((dc) => dc.readyState === 'open');
    if (open.length === 0) return 0;

    const pending = this.outgoing;
    this.outgoing = [];
    for (const message of pending) {
      const json = JSON.stringify(message);
      for (const dc of open) dc.send(json);
    }
    this.notify();
    return pending.length;
  }

  /** Number of operations buffered while offline (observability / UI badge). */
  getPendingOperationCount(): number {
    return this.outgoing.length;
  }

  private broadcastUpdate(type: string, data: unknown): void {
    if (!this.localUser) return;
    this.broadcast({
      type: 'update',
      userId: this.localUser.id,
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
    // Replies are also registered in `this.comments` (so resolveComment/
    // deleteComment can find them by id) but must not surface here as
    // top-level threads — they're already nested under their parent's
    // `replies` array.
    return Array.from(this.comments.values()).filter(c => !c.parentId);
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

