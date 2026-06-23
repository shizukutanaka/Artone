/**
 * Artone v3 — History Manager (Undo/Redo)
 * 
 * Command Pattern実装
 * - 無制限履歴
 * - グループ化 (複合操作)
 * - ブランチ履歴
 * - IndexedDB永続化
 * 
 * Carmack: メモリ効率、差分保存
 * Martin: Command Pattern, SOLID
 * Pike: シンプルなAPI
 */
import { color } from '../app/design-system';

// ============================================================
// Types
// ============================================================

/** CommandFactory が扱うクリップの最小型 (循環依存回避) */
export interface ClipLike {
  id?: string;
  trackId?: string;
  startFrame?: number;
  duration?: number;
  sourceStart?: number;
  effects?: EffectLike[];
  [key: string]: unknown;
}

/** CommandFactory が扱うエフェクトの最小型 */
export interface EffectLike {
  id?: string;
  type?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/** CommandFactory が扱うグレーディング値 */
/** カラーグレーディングの設定値。ColorGradingEngine の ColorWheels と整合する。 */
export interface GradeLike {
  contrast?: number;
  saturation?: number;
  hue?: number;
  pivot?: number;
  lift?: { r: number; g: number; b: number; a: number };
  gamma?: { r: number; g: number; b: number; a: number };
  gain?: { r: number; g: number; b: number; a: number };
  offset?: { r: number; g: number; b: number; a: number };
  [key: string]: unknown;
}

export interface Command {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  execute(): void;
  undo(): void;
  redo(): void;
  // 差分データ (メモリ効率)
  getDelta(): CommandDelta;
  // マージ可能性
  canMergeWith?(other: Command): boolean;
  merge?(other: Command): Command;
}

export interface CommandDelta {
  before: unknown;
  after: unknown;
  path: string[];
}

export interface HistoryState {
  position: number;
  commands: CommandSnapshot[];
  branches: HistoryBranch[];
  currentBranch: string;
}

export interface CommandSnapshot {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  delta: CommandDelta;
}

export interface HistoryBranch {
  id: string;
  name: string;
  parentPosition: number;
  commands: CommandSnapshot[];
}

export interface HistoryConfig {
  maxCommands: number;
  mergeWindow: number; // ms
  autoPersist: boolean;
  persistKey: string;
}

// ============================================================
// Command Factory
// ============================================================

export class CommandFactory {
  static clipMove(
    clipId: string,
    fromTrack: string,
    toTrack: string,
    fromFrame: number,
    toFrame: number,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    let savedClip: ClipLike;
    
    return {
      id: `clip_move_${Date.now()}`,
      type: 'clip.move',
      timestamp: Date.now(),
      description: `Move clip ${clipId}`,
      
      execute() {
        savedClip = getClip();
        setClip({ ...savedClip, trackId: toTrack, startFrame: toFrame });
      },
      
      undo() {
        setClip({ ...savedClip, trackId: fromTrack, startFrame: fromFrame });
      },
      
      redo() {
        setClip({ ...savedClip, trackId: toTrack, startFrame: toFrame });
      },
      
      getDelta() {
        return {
          before: { trackId: fromTrack, startFrame: fromFrame },
          after: { trackId: toTrack, startFrame: toFrame },
          path: ['clips', clipId]
        };
      },
      
      canMergeWith(other: Command) {
        // Compare by delta path (['clips', clipId]) as the other mergeable
        // commands do. The previous check read `other.clipId`, a field the
        // command never sets, so it was always undefined !== clipId → moves
        // never merged and a drag bloated history with one entry per sub-move.
        return other.type === 'clip.move' &&
               other.getDelta().path.join('.') === this.getDelta().path.join('.') &&
               other.timestamp - this.timestamp < 500;
      },
      
      merge(other: Command) {
        const otherDelta = other.getDelta();
        const after = otherDelta.after as { trackId: string; startFrame: number };
        return CommandFactory.clipMove(
          clipId,
          fromTrack,
          after.trackId,
          fromFrame,
          after.startFrame,
          getClip,
          setClip
        );
      }
    };
  }

  static clipTrim(
    clipId: string,
    edge: 'start' | 'end',
    fromFrame: number,
    toFrame: number,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    // Snapshot captured in execute() and used for undo — same pattern as
    // clipMove. Delta-based undo on live state was wrong when another command
    // modified the same clip between execute and undo.
    let snapshot: ClipLike;

    return {
      id: `clip_trim_${Date.now()}`,
      type: 'clip.trim',
      timestamp: Date.now(),
      description: `Trim clip ${clipId} ${edge}`,

      execute() {
        snapshot = { ...getClip() };
        // Default source offsets to 0: ClipLike marks them optional, and
        // `undefined + n` would silently corrupt the clip to NaN.
        if (edge === 'start') {
          const sourceIn = ((snapshot.sourceIn as number | undefined) ?? 0) + (toFrame - fromFrame);
          setClip({ ...snapshot, startFrame: toFrame, sourceIn });
        } else {
          const sourceOut = ((snapshot.sourceOut as number | undefined) ?? 0) + (toFrame - fromFrame);
          setClip({ ...snapshot, endFrame: toFrame, sourceOut });
        }
      },

      undo() {
        setClip({ ...snapshot });
      },

      redo() {
        this.execute();
      },
      
      getDelta() {
        return {
          before: { frame: fromFrame },
          after: { frame: toFrame },
          path: ['clips', clipId, edge]
        };
      }
    };
  }

  static clipDelete(
    clip: ClipLike,
    addClip: (clip: ClipLike) => void,
    removeClip: (id: string) => void
  ): Command {
    const savedClip = { ...clip };
    
    return {
      id: `clip_delete_${Date.now()}`,
      type: 'clip.delete',
      timestamp: Date.now(),
      description: `Delete clip ${clip.id}`,
      
      execute() {
        removeClip(savedClip.id!);
      },

      undo() {
        addClip(savedClip);
      },

      redo() {
        removeClip(savedClip.id!);
      },

      getDelta(): CommandDelta {
        return {
          before: savedClip,
          after: null,
          path: ['clips', savedClip.id!]
        };
      }
    };
  }

  static clipAdd(
    clip: ClipLike,
    addClip: (clip: ClipLike) => void,
    removeClip: (id: string) => void
  ): Command {
    const savedClip = { ...clip };
    
    return {
      id: `clip_add_${Date.now()}`,
      type: 'clip.add',
      timestamp: Date.now(),
      description: `Add clip ${clip.id}`,
      
      execute() {
        addClip(savedClip);
      },
      
      undo() {
        removeClip(savedClip.id!);
      },

      redo() {
        addClip(savedClip);
      },

      getDelta(): CommandDelta {
        return {
          before: null,
          after: savedClip,
          path: ['clips', savedClip.id!]
        };
      }
    };
  }

  static effectAdd(
    clipId: string,
    effect: EffectLike,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    const savedEffect = { ...effect };
    
    return {
      id: `effect_add_${Date.now()}`,
      type: 'effect.add',
      timestamp: Date.now(),
      description: `Add effect ${effect.type}`,
      
      execute() {
        const clip = getClip();
        setClip({ ...clip, effects: [...(clip.effects || []), savedEffect] });
      },
      
      undo() {
        const clip = getClip();
        setClip({ ...clip, effects: (clip.effects ?? []).filter(( e: EffectLike) => e.id !== savedEffect.id) });
      },

      redo() {
        this.execute();
      },

      getDelta(): CommandDelta {
        return {
          before: null,
          after: savedEffect,
          path: ['clips', clipId, 'effects', savedEffect.id!]
        };
      }
    };
  }

  static effectUpdate(
    clipId: string,
    effectId: string,
    paramName: string,
    fromValue: unknown,
    toValue: unknown,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    return {
      id: `effect_update_${Date.now()}`,
      type: 'effect.update',
      timestamp: Date.now(),
      description: `Update ${paramName}`,
      
      execute() {
        const clip = getClip();
        const effects = (clip.effects ?? []).map(( e: EffectLike) =>
          e.id === effectId ? { ...e, params: { ...e.params, [paramName]: toValue } } : e
        );
        setClip({ ...clip, effects });
      },

      undo() {
        const clip = getClip();
        const effects = (clip.effects ?? []).map(( e: EffectLike) =>
          e.id === effectId ? { ...e, params: { ...e.params, [paramName]: fromValue } } : e
        );
        setClip({ ...clip, effects });
      },
      
      redo() {
        this.execute();
      },
      
      getDelta() {
        return {
          before: fromValue,
          after: toValue,
          path: ['clips', clipId, 'effects', effectId, 'params', paramName]
        };
      },
      
      canMergeWith(other: Command) {
        return other.type === 'effect.update' &&
               other.getDelta().path.join('.') === this.getDelta().path.join('.') &&
               other.timestamp - this.timestamp < 300;
      },
      
      merge(other: Command) {
        return CommandFactory.effectUpdate(
          clipId, effectId, paramName,
          fromValue, other.getDelta().after,
          getClip, setClip
        );
      }
    };
  }

  static colorGrade(
    clipId: string,
    gradeType: string,
    fromGrade: GradeLike,
    toGrade: GradeLike,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    return {
      id: `color_grade_${Date.now()}`,
      type: 'color.grade',
      timestamp: Date.now(),
      description: `Adjust ${gradeType}`,
      
      execute() {
        const clip = getClip();
        const colorGrade = (typeof clip.colorGrade === 'object' && clip.colorGrade !== null) ? clip.colorGrade : {};
        setClip({ ...clip, colorGrade: { ...colorGrade, [gradeType]: toGrade } });
      },

      undo() {
        const clip = getClip();
        const colorGrade = (typeof clip.colorGrade === 'object' && clip.colorGrade !== null) ? clip.colorGrade : {};
        setClip({ ...clip, colorGrade: { ...colorGrade, [gradeType]: fromGrade } });
      },
      
      redo() {
        this.execute();
      },
      
      getDelta() {
        return {
          before: fromGrade,
          after: toGrade,
          path: ['clips', clipId, 'colorGrade', gradeType]
        };
      },
      
      canMergeWith(other: Command) {
        return other.type === 'color.grade' &&
               other.getDelta().path.join('.') === this.getDelta().path.join('.') &&
               other.timestamp - this.timestamp < 200;
      },

      merge(other: Command): Command {
        return CommandFactory.colorGrade(
          clipId, gradeType,
          fromGrade, other.getDelta().after as GradeLike,
          getClip, setClip,
        );
      }
    };
  }

  static keyframeAdd(
    clipId: string,
    property: string,
    keyframe: Record<string, unknown>,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    const savedKf = { ...keyframe };
    
    return {
      id: `keyframe_add_${Date.now()}`,
      type: 'keyframe.add',
      timestamp: Date.now(),
      description: `Add keyframe at ${keyframe.frame}`,
      
      execute() {
        const clip = getClip();
        const clipKeyframes = (clip.keyframes ?? {}) as Record<string, Array<{ frame: number; id?: string; [key: string]: unknown }>>;
        const keyframes = [...(clipKeyframes[property] || []), savedKf as { frame: number; id?: string; [key: string]: unknown }]
          .sort((a, b) => a.frame - b.frame);
        setClip({ ...clip, keyframes: { ...clipKeyframes, [property]: keyframes } });
      },

      undo() {
        const clip = getClip();
        const clipKeyframes = (clip.keyframes ?? {}) as Record<string, Array<{ id?: string; [key: string]: unknown }>>;
        const keyframes = (clipKeyframes[property] || [])
          .filter((k: { id?: string; [key: string]: unknown }) => k.id !== savedKf.id);
        setClip({ ...clip, keyframes: { ...clipKeyframes, [property]: keyframes } });
      },

      redo() {
        this.execute();
      },

      getDelta(): CommandDelta {
        return {
          before: null,
          after: savedKf,
          path: ['clips', clipId, 'keyframes', property, String(savedKf.id)]
        };
      }
    };
  }

  static audioVolume(
    clipId: string,
    fromVolume: number,
    toVolume: number,
    getClip: () => ClipLike,
    setClip: (clip: ClipLike) => void
  ): Command {
    return {
      id: `audio_volume_${Date.now()}`,
      type: 'audio.volume',
      timestamp: Date.now(),
      description: `Adjust volume`,
      
      execute() {
        const clip = getClip();
        setClip({ ...clip, audioVolume: toVolume });
      },
      
      undo() {
        const clip = getClip();
        setClip({ ...clip, audioVolume: fromVolume });
      },
      
      redo() {
        this.execute();
      },
      
      getDelta() {
        return {
          before: fromVolume,
          after: toVolume,
          path: ['clips', clipId, 'audioVolume']
        };
      },
      
      canMergeWith(other: Command) {
        return other.type === 'audio.volume' &&
               other.getDelta().path[1] === clipId &&
               other.timestamp - this.timestamp < 200;
      },

      merge(other: Command): Command {
        return CommandFactory.audioVolume(
          clipId,
          fromVolume, other.getDelta().after as number,
          getClip, setClip,
        );
      }
    };
  }

  static composite(...commands: Command[]): Command {
    return {
      id: `composite_${Date.now()}`,
      type: 'composite',
      timestamp: Date.now(),
      description: `${commands.length} operations`,

      execute() {
        commands.forEach(cmd => cmd.execute());
      },

      undo() {
        [...commands].reverse().forEach(cmd => cmd.undo());
      },

      redo() {
        commands.forEach(cmd => cmd.redo());
      },

      getDelta() {
        return {
          before: commands.map(c => c.getDelta().before),
          after: commands.map(c => c.getDelta().after),
          path: ['composite']
        };
      }
    };
  }

  /**
   * Generic reversible command for structural edits (e.g. Lift / Extract) that
   * add, remove and split multiple clips at once and cannot be expressed as a
   * single-field delta. The caller supplies idempotent `apply` and `revert`
   * closures; `execute`/`redo` run `apply`, `undo` runs `revert`.
   *
   * `delta` is an opaque description for inspection/persistence (the edit is not
   * a simple before/after field change).
   */
  static structural(
    type: string,
    description: string,
    apply: () => void,
    revert: () => void,
    delta: CommandDelta = { before: null, after: null, path: [type] }
  ): Command {
    return {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: Date.now(),
      description,
      execute() { apply(); },
      undo() { revert(); },
      redo() { apply(); },
      getDelta() { return delta; },
    };
  }
}

// ============================================================
// History Manager
// ============================================================

export class HistoryManager {
  private commands: Command[] = [];
  private position = -1;
  private branches: Map<string, HistoryBranch> = new Map();
  private currentBranch = 'main';
  private config: HistoryConfig;
  private groupStack: Command[][] = [];
  private listeners: Set<(state: HistoryState) => void> = new Set();
  private db: IDBDatabase | null = null;

  constructor(config: Partial<HistoryConfig> = {}) {
    this.config = {
      maxCommands: 1000,
      mergeWindow: 500,
      autoPersist: true,
      persistKey: 'artone_history',
      ...config
    };
    
    if (this.config.autoPersist) {
      this.initDB();
    }
  }

  // ----- DB 初期化 -----

  /** DB が null なら例外。init() 前の操作を防ぐ。 */
  private requireDB(): IDBDatabase {
    if (!this.db) throw new Error('Database not initialized.');
    return this.db;
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ArtoneHistory', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.loadFromDB();
        resolve();
      };
    });
  }

  // ----- 永続化 -----
  private async saveToDB(): Promise<void> {
    if (!this.db) return;
    
    const state: HistoryState = {
      position: this.position,
      commands: this.commands.map(cmd => ({
        id: cmd.id,
        type: cmd.type,
        timestamp: cmd.timestamp,
        description: cmd.description,
        delta: cmd.getDelta()
      })),
      branches: Array.from(this.branches.values()),
      currentBranch: this.currentBranch
    };
    
    const tx = this.db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    store.put({ id: this.config.persistKey, state });
  }

  private async loadFromDB(): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve) => {
      const tx = this.requireDB().transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const request = store.get(this.config.persistKey);
      
      request.onsuccess = () => {
        if (request.result?.state) {
          const state = request.result.state as HistoryState;
          this.position = state.position;
          this.currentBranch = state.currentBranch;
          state.branches.forEach(b => this.branches.set(b.id, b));
          // Note: Commands need reconstruction with actual functions
        }
        resolve();
      };
      
      request.onerror = () => resolve();
    });
  }

  // ----- コマンド実行 -----
  execute(command: Command): void {
    // グループ中
    if (this.groupStack.length > 0) {
      this.groupStack[this.groupStack.length - 1].push(command);
      command.execute();
      return;
    }
    
    // マージ可能チェック
    if (this.position >= 0) {
      const lastCmd = this.commands[this.position];
      if (lastCmd.canMergeWith?.(command)) {
        const merged = lastCmd.merge!(command);
        this.commands[this.position] = merged;
        merged.execute();
        this.notifyListeners();
        return;
      }
    }
    
    // 通常実行
    command.execute();
    
    // Redo履歴クリア
    this.commands = this.commands.slice(0, this.position + 1);
    this.commands.push(command);
    this.position++;
    
    // 最大数制限
    if (this.commands.length > this.config.maxCommands) {
      const excess = this.commands.length - this.config.maxCommands;
      this.commands = this.commands.slice(excess);
      this.position -= excess;
    }
    
    this.notifyListeners();
    
    if (this.config.autoPersist) {
      this.saveToDB();
    }
  }

  // ----- Undo -----
  undo(): boolean {
    if (!this.canUndo()) return false;
    
    const command = this.commands[this.position];
    command.undo();
    this.position--;
    
    this.notifyListeners();
    return true;
  }

  canUndo(): boolean {
    return this.position >= 0;
  }

  // ----- Redo -----
  redo(): boolean {
    if (!this.canRedo()) return false;
    
    this.position++;
    const command = this.commands[this.position];
    command.redo();
    
    this.notifyListeners();
    return true;
  }

  canRedo(): boolean {
    return this.position < this.commands.length - 1;
  }

  // ----- グループ操作 -----
  beginGroup(_description?: string): void {
    this.groupStack.push([]);
  }

  endGroup(description?: string): void {
    const group = this.groupStack.pop();
    if (!group || group.length === 0) return;

    const composite = CommandFactory.composite(...group);
    if (description) {
      (composite as Command & { description: string }).description = description;
    }

    // Nested group: push the composite into the parent group rather than
    // directly into the history stack.  Without this check, the inner
    // composite escaped its parent group and became an independent history
    // entry, making nested beginGroup/endGroup pairs behave incorrectly.
    if (this.groupStack.length > 0) {
      this.groupStack[this.groupStack.length - 1].push(composite);
      return;
    }

    // グループをスタックの上に置く
    this.commands = this.commands.slice(0, this.position + 1);
    this.commands.push(composite);
    this.position++;

    // Apply the same maxCommands cap as execute() — endGroup was omitting this,
    // allowing the history to grow beyond config.maxCommands when groups were used.
    if (this.commands.length > this.config.maxCommands) {
      const excess = this.commands.length - this.config.maxCommands;
      this.commands = this.commands.slice(excess);
      this.position -= excess;
    }

    this.notifyListeners();

    if (this.config.autoPersist) {
      this.saveToDB();
    }
  }

  // ----- ブランチ -----
  createBranch(name: string): string {
    const branchId = `branch_${Date.now()}`;
    const branch: HistoryBranch = {
      id: branchId,
      name,
      parentPosition: this.position,
      commands: []
    };
    this.branches.set(branchId, branch);
    this.currentBranch = branchId;
    return branchId;
  }

  switchBranch(branchId: string): void {
    if (!this.branches.has(branchId) && branchId !== 'main') return;
    
    // 現在のブランチをUndoで戻す
    if (this.currentBranch !== 'main') {
      const currentBranch = this.branches.get(this.currentBranch);
      if (currentBranch) {
        // Undo branch commands
        const branchCommands = this.commands.slice(currentBranch.parentPosition + 1);
        branchCommands.reverse().forEach(cmd => cmd.undo());
        this.position = currentBranch.parentPosition;
      }
    }
    
    // 新しいブランチをRedo
    if (branchId !== 'main') {
      const newBranch = this.branches.get(branchId)!;
      newBranch.commands.forEach(() => {
        // Note: Would need to reconstruct commands from snapshots
        this.position++;
      });
    }
    
    this.currentBranch = branchId;
    this.notifyListeners();
  }

  // ----- 履歴取得 -----
  getHistory(): CommandSnapshot[] {
    return this.commands.map(cmd => ({
      id: cmd.id,
      type: cmd.type,
      timestamp: cmd.timestamp,
      description: cmd.description,
      delta: cmd.getDelta()
    }));
  }

  getPosition(): number {
    return this.position;
  }

  // ----- 特定位置へジャンプ -----
  /**
   * Jump to an arbitrary history position in O(n) time.
   *
   * Prior implementation delegated to `undo()`/`redo()` in a loop, each of
   * which called `notifyListeners()` (O(k) work) → O(n·k) total for an n-step
   * jump with k listeners.  We now call the command callbacks directly and
   * emit a single notification after all mutations are done.
   */
  goToPosition(targetPosition: number): void {
    if (targetPosition < -1 || targetPosition >= this.commands.length) return;
    if (targetPosition === this.position) return;

    while (this.position > targetPosition) {
      this.commands[this.position].undo();
      this.position--;
    }
    while (this.position < targetPosition) {
      this.position++;
      this.commands[this.position].redo();
    }

    this.notifyListeners();
  }

  // ----- クリア -----
  clear(): void {
    this.commands = [];
    this.position = -1;
    this.branches.clear();
    this.currentBranch = 'main';
    this.notifyListeners();
    
    if (this.db) {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      store.delete(this.config.persistKey);
    }
  }

  // ----- リスナー -----
  subscribe(listener: (state: HistoryState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const state: HistoryState = {
      position: this.position,
      commands: this.getHistory(),
      branches: Array.from(this.branches.values()),
      currentBranch: this.currentBranch
    };
    this.listeners.forEach(listener => listener(state));
  }

  // ----- 統計 -----
  getStats(): { count: number; position: number; branches: number } {
    return {
      count: this.commands.length,
      position: this.position,
      branches: this.branches.size
    };
  }
}

// ============================================================
// History Panel UI Component
// ============================================================

export function HistoryPanelUI(props: { history: HistoryManager }): string {
  const stats = props.history.getStats();
  const historyList = props.history.getHistory();
  const currentPos = props.history.getPosition();
  
  return `
    <div class="history-panel" style="
      background: #1a1a1a;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      color: #e0e0e0;
      max-height: 400px;
      overflow-y: auto;
    ">
      <div class="history-header" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #333;
      ">
        <span style="font-weight: 600;">履歴</span>
        <span style="color: #888; font-size: 11px;">
          ${currentPos + 1} / ${stats.count}
        </span>
      </div>
      
      <div class="history-actions" style="
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      ">
        <button onclick="history.undo()" ${!props.history.canUndo() ? 'disabled' : ''} style="
          flex: 1;
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          background: ${props.history.canUndo() ? color.surface4 : color.surface1};
          color: ${props.history.canUndo() ? color.textPrimary : color.textTertiary};
          cursor: ${props.history.canUndo() ? 'pointer' : 'not-allowed'};
        ">
          ← Undo
        </button>
        <button onclick="history.redo()" ${!props.history.canRedo() ? 'disabled' : ''} style="
          flex: 1;
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          background: ${props.history.canRedo() ? color.surface4 : color.surface1};
          color: ${props.history.canRedo() ? color.textPrimary : color.textTertiary};
          cursor: ${props.history.canRedo() ? 'pointer' : 'not-allowed'};
        ">
          Redo →
        </button>
      </div>
      
      <div class="history-list">
        ${historyList.map((item, index) => `
          <div 
            class="history-item" 
            data-position="${index}"
            style="
              padding: 8px 10px;
              margin: 2px 0;
              border-radius: 4px;
              background: ${index === currentPos ? color.brand : index <= currentPos ? color.surface4 : color.surface1};
              opacity: ${index <= currentPos ? 1 : 0.5};
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
            "
          >
            <span style="
              width: 20px;
              height: 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: ${getTypeColor(item.type)};
              border-radius: 4px;
              font-size: 10px;
            ">
              ${getTypeIcon(item.type)}
            </span>
            <div style="flex: 1; overflow: hidden;">
              <div style="
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">${escapeHtml(item.description)}</div>
              <div style="font-size: 10px; color: #666;">
                ${formatTime(item.timestamp)}
              </div>
            </div>
          </div>
        `).reverse().join('')}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    // design-system の semantic color を使用
    'clip.move':     color.positive,      // positive/green
    'clip.trim':     color.caution,       // caution/amber
    'clip.add':      color.brand, // brand/teal
    'clip.delete':   color.destructive,  // destructive/red
    'effect.add':    '#a371f7', // purple (pro tier)
    'effect.update': color.brand, // brand
    'color.grade':   '#f0883e', // orange
    'keyframe.add':  '#58a6ff', // blue
    'audio.volume':  color.positive,      // green
    'composite':     color.textTertiary,  // muted
  };
  return colors[type] || color.surface4;
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    'clip.move': '↔',
    'clip.trim': '✂',
    'clip.add': '+',
    'clip.delete': '×',
    'effect.add': 'fx',
    'effect.update': '◎',
    'color.grade': '◐',
    'keyframe.add': '◆',
    'audio.volume': '🔊',
    'composite': '⧉'
  };
  return icons[type] || '•';
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return new Date(timestamp).toLocaleTimeString();
}

// ============================================================
// Singleton Export
// ============================================================

export const historyManager = new HistoryManager();

