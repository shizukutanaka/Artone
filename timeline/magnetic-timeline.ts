/**
 * Artone v3 — Magnetic Timeline
 * 
 * Final Cut Pro風マグネティックタイムライン
 * - 自動リップル編集
 * - ギャップ自動クローズ
 * - スナップポイント
 * - Text-based editing
 * - JKL再生制御
 * 
 * @version 1.0.0
 */

import { IntervalIndex } from './interval-index';
import { liftRange, extractRange, captureRangeEditUndo, type RangeEditResult } from './range-edit';
import { CommandFactory, type Command } from '../undo/history-manager';

// ============================================================
// Types
// ============================================================

export interface Clip {
  id: string;
  trackId: string;
  mediaId: string;
  name: string;
  
  // Timeline position
  startTime: number;
  duration: number;
  
  // Media reference
  mediaIn: number;
  mediaOut: number;
  
  // Transform
  transform: ClipTransform;
  
  // Metadata
  type: 'video' | 'audio' | 'image' | 'title';
  locked: boolean;
  selected: boolean;
}

export interface ClipTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  height: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
}

export interface SnapPoint {
  time: number;
  type: 'clip-start' | 'clip-end' | 'playhead' | 'marker';
  clipId?: string;
}

export interface TimelineState {
  tracks: Map<string, Track>;
  clips: Map<string, Clip>;
  playhead: number;
  inPoint: number | null;
  outPoint: number | null;
  zoom: number;
  scrollX: number;
  selection: Set<string>;
}

// ============================================================
// Serialization (JSON-safe round-trip for recovery / persistence)
// ============================================================
//
// TimelineState holds Maps (tracks, clips) and a Set (selection). JSON.stringify
// turns a Map/Set into "{}", so naively persisting getState() SILENTLY DROPS all
// tracks, clips and selection. These helpers convert to/from a JSON-safe shape.

/** JSON-safe representation of {@link TimelineState} (Map→entries, Set→array). */
export interface SerializedTimelineState {
  tracks: Array<[string, Track]>;
  clips: Array<[string, Clip]>;
  playhead: number;
  inPoint: number | null;
  outPoint: number | null;
  zoom: number;
  scrollX: number;
  selection: string[];
}

/** Convert a {@link TimelineState} into a JSON-serializable object. */
export function serializeTimelineState(state: TimelineState): SerializedTimelineState {
  return {
    tracks: Array.from(state.tracks.entries()),
    clips: Array.from(state.clips.entries()),
    playhead: state.playhead,
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    zoom: state.zoom,
    scrollX: state.scrollX,
    selection: Array.from(state.selection),
  };
}

/**
 * Rebuild a {@link TimelineState} from its serialized form. Defensive against
 * missing / partial fields (old or corrupt snapshots are a trust boundary):
 * absent maps/sets become empty, scalars fall back to sane defaults.
 */
export function deserializeTimelineState(
  data: Partial<SerializedTimelineState> | null | undefined,
): TimelineState {
  const d = data ?? {};
  return {
    tracks: new Map(Array.isArray(d.tracks) ? d.tracks : []),
    clips: new Map(Array.isArray(d.clips) ? d.clips : []),
    playhead: typeof d.playhead === 'number' ? d.playhead : 0,
    inPoint: typeof d.inPoint === 'number' ? d.inPoint : null,
    outPoint: typeof d.outPoint === 'number' ? d.outPoint : null,
    zoom: typeof d.zoom === 'number' ? d.zoom : 1,
    scrollX: typeof d.scrollX === 'number' ? d.scrollX : 0,
    selection: new Set(Array.isArray(d.selection) ? d.selection : []),
  };
}

// ============================================================
// Magnetic Timeline Engine
// ============================================================

export class MagneticTimeline {
  private state: TimelineState;
  private snapThreshold = 10; // pixels
  private listeners: Set<(state: TimelineState) => void> = new Set();

  constructor() {
    this.state = {
      tracks: new Map(),
      clips: new Map(),
      playhead: 0,
      inPoint: null,
      outPoint: null,
      zoom: 100,
      scrollX: 0,
      selection: new Set()
    };

    // Create default tracks
    this.createTrack('V1', 'video');
    this.createTrack('A1', 'audio');
    this.createTrack('A2', 'audio');
  }

  // ============================================================
  // Track Operations
  // ============================================================

  createTrack(name: string, type: 'video' | 'audio'): Track {
    const id = crypto.randomUUID();
    const track: Track = {
      id,
      name,
      type,
      height: type === 'video' ? 80 : 50,
      muted: false,
      locked: false,
      visible: true
    };
    this.state.tracks.set(id, track);
    this.notify();
    return track;
  }

  deleteTrack(trackId: string): void {
    // Delete all clips on track
    for (const [clipId, clip] of this.state.clips) {
      if (clip.trackId === trackId) {
        this.state.clips.delete(clipId);
      }
    }
    this.state.tracks.delete(trackId);
    this.notify();
  }

  // ============================================================
  // Clip Operations (Magnetic)
  // ============================================================

  addClip(clip: Omit<Clip, 'id' | 'selected'>): Clip {
    const id = crypto.randomUUID();
    const newClip: Clip = { ...clip, id, selected: false };
    
    // Find insertion point (magnetic behavior)
    const trackClips = this.getTrackClips(clip.trackId);
    let insertTime = clip.startTime;

    // Snap to existing clips
    for (const existing of trackClips) {
      if (Math.abs(existing.startTime + existing.duration - insertTime) < 0.1) {
        insertTime = existing.startTime + existing.duration;
        break;
      }
    }

    newClip.startTime = insertTime;

    // Push subsequent clips (ripple)
    this.shiftClipsAfter(clip.trackId, insertTime, clip.duration);

    this.state.clips.set(id, newClip);
    this.notify();
    return newClip;
  }

  insertClip(clip: Omit<Clip, 'id' | 'selected'>, insertTime: number): Clip {
    // addClip handles the ripple internally; calling shiftClipsAfter here too
    // would double-shift all subsequent clips by clip.duration.
    return this.addClip({ ...clip, startTime: insertTime });
  }

  deleteClip(clipId: string): void {
    const clip = this.state.clips.get(clipId);
    if (!clip) return;

    // Close gap (magnetic behavior)
    this.shiftClipsAfter(clip.trackId, clip.startTime + clip.duration, -clip.duration);

    this.state.clips.delete(clipId);
    this.state.selection.delete(clipId);
    this.notify();
  }

  moveClip(clipId: string, newStart: number, newTrackId?: string): void {
    const clip = this.state.clips.get(clipId);
    if (!clip) return;

    const oldTrackId = clip.trackId;
    const oldStart = clip.startTime;

    // Remove from old position (移動するクリップ自身は ripple 対象外)
    this.shiftClipsAfter(oldTrackId, oldStart + clip.duration, -clip.duration, clip.id);

    // Update clip
    clip.startTime = Math.max(0, newStart);
    if (newTrackId) {
      clip.trackId = newTrackId;
    }

    // Insert at new position (移動するクリップ自身は ripple 対象外)
    this.shiftClipsAfter(clip.trackId, clip.startTime, clip.duration, clip.id);

    this.notify();
  }

  trimClipStart(clipId: string, newStart: number): void {
    const clip = this.state.clips.get(clipId);
    if (!clip) return;

    const delta = newStart - clip.startTime;
    const newDuration = clip.duration - delta;

    if (newDuration <= 0) return;

    clip.startTime = newStart;
    clip.duration = newDuration;
    clip.mediaIn += delta;

    // No ripple: trimming the start moves only the clip's head — its END
    // position (startTime + duration) is unchanged — so subsequent clips must
    // not move. The previous shiftClipsAfter rippled them left by delta, which
    // overlapped this clip's tail (e.g. trimming A[0,10]→[3,10] pulled the
    // following B[10,20] to [7,17], overlapping [7,10]).

    this.notify();
  }

  trimClipEnd(clipId: string, newEnd: number): void {
    const clip = this.state.clips.get(clipId);
    if (!clip) return;

    const newDuration = newEnd - clip.startTime;
    if (newDuration <= 0) return;

    // Capture the OLD end before mutating duration — the ripple boundary is the
    // position subsequent clips currently sit after, not the new end.
    const oldEnd = clip.startTime + clip.duration;
    const delta = newDuration - clip.duration;
    clip.duration = newDuration;
    clip.mediaOut = clip.mediaIn + newDuration;

    // Ripple subsequent clips from the OLD end. Using newEnd skipped clips in
    // [oldEnd, newEnd) when extending → overlap (e.g. extending A[0,10]→[0,15]
    // left the following B[10,20] untouched, overlapping [10,15]).
    this.shiftClipsAfter(clip.trackId, oldEnd, delta);

    this.notify();
  }

  splitClip(clipId: string, splitTime: number): [Clip, Clip] | null {
    const clip = this.state.clips.get(clipId);
    if (!clip) return null;

    if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
      return null;
    }

    const splitOffset = splitTime - clip.startTime;
    const originalDuration = clip.duration;
    const originalMediaOut = clip.mediaOut;

    // First part
    const firstDuration = splitOffset;

    // Second part (元の duration / mediaOut から算出してから first を縮める)
    const secondClip: Clip = {
      id: crypto.randomUUID(),
      trackId: clip.trackId,
      mediaId: clip.mediaId,
      name: clip.name + ' (2)',
      startTime: splitTime,
      duration: originalDuration - firstDuration,
      mediaIn: clip.mediaIn + splitOffset,
      mediaOut: originalMediaOut,
      transform: { ...clip.transform },
      type: clip.type,
      locked: clip.locked,
      selected: false
    };

    // Fix first clip duration / mediaOut
    clip.duration = firstDuration;
    clip.mediaOut = clip.mediaIn + firstDuration;

    this.state.clips.set(secondClip.id, secondClip);
    this.notify();

    return [clip, secondClip];
  }

  // ============================================================
  // Ripple Operations
  // ============================================================

  private shiftClipsAfter(trackId: string, afterTime: number, delta: number, excludeClipId?: string): void {
    for (const clip of this.state.clips.values()) {
      if (clip.id === excludeClipId) continue;
      if (clip.trackId === trackId && clip.startTime >= afterTime) {
        clip.startTime = Math.max(0, clip.startTime + delta);
      }
    }
  }

  closeGaps(trackId: string): void {
    const clips = this.getTrackClips(trackId).sort((a, b) => a.startTime - b.startTime);

    let currentTime = 0;
    for (const clip of clips) {
      if (clip.startTime > currentTime) {
        clip.startTime = currentTime;
      }
      currentTime = clip.startTime + clip.duration;
    }

    this.notify();
  }

  // ============================================================
  // Three-point editing (Lift / Extract over the in→out range)
  // ============================================================

  /**
   * Lift: remove the marked in→out range, leaving a gap. Subsequent clips do
   * not move. Pass `trackId` to limit the edit to one track (default: all).
   *
   * @returns true if an edit was applied (valid in/out range), false otherwise.
   */
  lift(trackId?: string): boolean {
    return this.applyRangeEdit(liftRange, trackId);
  }

  /**
   * Extract: remove the marked in→out range and ripple subsequent clips left to
   * close the gap (sequence shortens). Pass `trackId` to limit to one track.
   *
   * @returns true if an edit was applied (valid in/out range), false otherwise.
   */
  extract(trackId?: string): boolean {
    return this.applyRangeEdit(extractRange, trackId);
  }

  /**
   * Build an **undoable** Lift command over the current in→out range, or null if
   * no range is set or the edit is a no-op. Run it via `HistoryManager.execute`.
   */
  liftCommand(trackId?: string): Command | null {
    return this.rangeEditCommand(liftRange, 'clip.lift', 'Lift range', trackId);
  }

  /** Build an **undoable** Extract command over the current in→out range, or null. */
  extractCommand(trackId?: string): Command | null {
    return this.rangeEditCommand(extractRange, 'clip.extract', 'Extract range', trackId);
  }

  /** Shared apply path for lift/extract. Requires both in and out points set. */
  private applyRangeEdit(
    op: typeof liftRange,
    trackId: string | undefined,
  ): boolean {
    const result = this.computeRangeEdit(op, trackId);
    if (!result) return false;
    this.applyRangeEditResult(result);
    this.notify();
    return true;
  }

  /** Validate the in→out range and compute the (non-applied) edit result. */
  private computeRangeEdit(
    op: typeof liftRange,
    trackId: string | undefined,
  ): RangeEditResult | null {
    const { inPoint, outPoint } = this.state;
    if (inPoint === null || outPoint === null) return null;
    const start = Math.min(inPoint, outPoint);
    const end = Math.max(inPoint, outPoint);
    if (!(end > start)) return null;

    const result = op([...this.state.clips.values()], { start, end }, { trackId });
    if (result.clips.length === 0 && result.removedIds.length === 0) return null;
    return result;
  }

  /** Apply a computed range-edit result to the clip store (no notify). */
  private applyRangeEditResult(result: RangeEditResult): void {
    for (const id of result.removedIds) this.state.clips.delete(id);
    for (const clip of result.clips) {
      this.state.clips.set(clip.id, { ...clip, transform: { ...clip.transform } });
    }
  }

  /** Build a reversible structural command for a lift/extract edit. */
  private rangeEditCommand(
    op: typeof liftRange,
    type: string,
    description: string,
    trackId: string | undefined,
  ): Command | null {
    const before = [...this.state.clips.values()].map((c) => ({ ...c, transform: { ...c.transform } }));
    const result = this.computeRangeEdit(op, trackId);
    if (!result) return null;
    const undo = captureRangeEditUndo(before, result);

    const apply = (): void => {
      this.applyRangeEditResult(result);
      this.notify();
    };
    const revert = (): void => {
      for (const id of undo.addedIds) this.state.clips.delete(id);
      for (const c of undo.removed) this.state.clips.set(c.id, { ...c, transform: { ...c.transform } });
      for (const c of undo.modifiedBefore) this.state.clips.set(c.id, { ...c, transform: { ...c.transform } });
      this.notify();
    };
    return CommandFactory.structural(type, description, apply, revert);
  }

  // ============================================================
  // Structural Commands — split / add / delete / closeGaps
  // ============================================================

  /** Shallow-clone all clips for snapshot-based undo. */
  private snapshotClips(): Clip[] {
    return [...this.state.clips.values()].map((c) => ({ ...c, transform: { ...c.transform } }));
  }

  /** Restore clip store from a snapshot; triggers notify(). */
  private restoreClips(snapshot: Clip[]): void {
    this.state.clips.clear();
    for (const c of snapshot) this.state.clips.set(c.id, { ...c, transform: { ...c.transform } });
    this.notify();
  }

  /**
   * Build an **undoable** command that splits `clipId` at `splitTime`.
   * Returns null when splitTime is outside the clip bounds (no-op).
   *
   * Pass the returned command to `HistoryManager.execute()` so undo/redo work.
   */
  splitClipCommand(clipId: string, splitTime: number): Command | null {
    const clip = this.state.clips.get(clipId);
    if (!clip) return null;
    if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return null;

    const before = this.snapshotClips();
    let after: Clip[] | null = null;

    const apply = (): void => {
      if (after) {
        this.restoreClips(after);
      } else {
        this.splitClip(clipId, splitTime);
        after = this.snapshotClips();
      }
    };
    return CommandFactory.structural('clip.split', 'Split clip', apply, () => this.restoreClips(before));
  }

  /**
   * Build an **undoable** command that adds `clip` to the timeline (with
   * magnetic ripple). The returned command is always non-null; pass it to
   * `HistoryManager.execute()`.
   */
  addClipCommand(clip: Omit<Clip, 'id' | 'selected'>): Command {
    const before = this.snapshotClips();
    let after: Clip[] | null = null;

    const apply = (): void => {
      if (after) {
        this.restoreClips(after);
      } else {
        this.addClip(clip);
        after = this.snapshotClips();
      }
    };
    return CommandFactory.structural('clip.add', 'Add clip', apply, () => this.restoreClips(before));
  }

  /**
   * Build an **undoable** command that deletes the clip with `clipId`
   * (magnetic ripple closes the gap). Returns null if the clip doesn't exist
   * or is locked.
   */
  deleteClipCommand(clipId: string): Command | null {
    const clip = this.state.clips.get(clipId);
    if (!clip || clip.locked) return null;

    const before = this.snapshotClips();
    let after: Clip[] | null = null;

    const apply = (): void => {
      if (after) {
        this.restoreClips(after);
      } else {
        this.deleteClip(clipId);
        after = this.snapshotClips();
      }
    };
    return CommandFactory.structural('clip.delete', 'Delete clip', apply, () => this.restoreClips(before));
  }

  /**
   * Build an **undoable** command that deletes all currently-selected
   * non-locked clips (magnetic ripple per clip, leftmost last so positions
   * remain consistent during the forward pass). Returns null if nothing
   * actionable is selected.
   */
  deleteSelectedCommand(): Command | null {
    const selected = [...this.state.selection]
      .map((id) => this.state.clips.get(id))
      .filter((c): c is Clip => c !== undefined && !c.locked);
    if (selected.length === 0) return null;

    // Sort right-to-left so earlier deletions don't shift the startTimes we
    // rely on when checking subsequent clips during the same batch.
    selected.sort((a, b) => b.startTime - a.startTime);
    const ids = selected.map((c) => c.id);

    const before = this.snapshotClips();
    let after: Clip[] | null = null;

    const apply = (): void => {
      if (after) {
        this.restoreClips(after);
      } else {
        for (const id of ids) this.deleteClip(id);
        after = this.snapshotClips();
      }
    };
    return CommandFactory.structural(
      'clip.deleteSelected',
      'Delete selected clips',
      apply,
      () => this.restoreClips(before),
    );
  }

  /**
   * Build an **undoable** command that closes gaps on `trackId`. Returns null
   * when the track has no clips or they are already contiguous (no-op).
   */
  closeGapsCommand(trackId: string): Command | null {
    const clips = this.getTrackClips(trackId).sort((a, b) => a.startTime - b.startTime);
    // Quick no-op check: already gap-free?
    let cursor = 0;
    let hasGap = false;
    for (const c of clips) {
      if (c.startTime > cursor + 0.001) { hasGap = true; break; }
      cursor = c.startTime + c.duration;
    }
    if (!hasGap) return null;

    const before = this.snapshotClips();
    let after: Clip[] | null = null;

    const apply = (): void => {
      if (after) {
        this.restoreClips(after);
      } else {
        this.closeGaps(trackId);
        after = this.snapshotClips();
      }
    };
    return CommandFactory.structural('clip.closeGaps', 'Close gaps', apply, () => this.restoreClips(before));
  }

  // ============================================================
  // Snap Points
  // ============================================================

  getSnapPoints(): SnapPoint[] {
    const points: SnapPoint[] = [];

    // Playhead
    points.push({ time: this.state.playhead, type: 'playhead' });

    // Clip edges
    for (const clip of this.state.clips.values()) {
      points.push({ time: clip.startTime, type: 'clip-start', clipId: clip.id });
      points.push({ time: clip.startTime + clip.duration, type: 'clip-end', clipId: clip.id });
    }

    // In/Out points
    if (this.state.inPoint !== null) {
      points.push({ time: this.state.inPoint, type: 'marker' });
    }
    if (this.state.outPoint !== null) {
      points.push({ time: this.state.outPoint, type: 'marker' });
    }

    return points;
  }

  findNearestSnapPoint(time: number, excludeClipId?: string): number | null {
    const points = this.getSnapPoints().filter(p => p.clipId !== excludeClipId);
    
    let nearest: SnapPoint | null = null;
    let minDist = Infinity;

    for (const point of points) {
      const dist = Math.abs(point.time - time);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    // Convert pixel threshold to time threshold
    const timeThreshold = this.snapThreshold / this.state.zoom;
    
    if (nearest && minDist <= timeThreshold) {
      return nearest.time;
    }

    return null;
  }

  // ============================================================
  // Selection
  // ============================================================

  selectClip(clipId: string, addToSelection = false): void {
    if (!addToSelection) {
      // Reset clip.selected on all previously-selected clips so the flag stays
      // consistent with the selection Set. Clearing only the Set left stale
      // clip.selected = true values on deselected clips.
      for (const id of this.state.selection) {
        const c = this.state.clips.get(id);
        if (c) c.selected = false;
      }
      this.state.selection.clear();
    }
    this.state.selection.add(clipId);
    
    const clip = this.state.clips.get(clipId);
    if (clip) {
      clip.selected = true;
    }
    
    this.notify();
  }

  deselectAll(): void {
    for (const clipId of this.state.selection) {
      const clip = this.state.clips.get(clipId);
      if (clip) {
        clip.selected = false;
      }
    }
    this.state.selection.clear();
    this.notify();
  }

  selectRange(startTime: number, endTime: number, trackId?: string): void {
    this.deselectAll();
    
    for (const clip of this.state.clips.values()) {
      if (trackId && clip.trackId !== trackId) continue;
      
      const clipEnd = clip.startTime + clip.duration;
      if (clip.startTime < endTime && clipEnd > startTime) {
        this.state.selection.add(clip.id);
        clip.selected = true;
      }
    }
    
    this.notify();
  }

  // ============================================================
  // Playhead & In/Out
  // ============================================================

  setPlayhead(time: number): void {
    this.state.playhead = Math.max(0, time);
    this.notify();
  }

  setInPoint(time: number | null = null): void {
    this.state.inPoint = time ?? this.state.playhead;
    this.notify();
  }

  setOutPoint(time: number | null = null): void {
    this.state.outPoint = time ?? this.state.playhead;
    this.notify();
  }

  clearInOutPoints(): void {
    this.state.inPoint = null;
    this.state.outPoint = null;
    this.notify();
  }

  // ============================================================
  // JKL Control
  // ============================================================

  private playbackRate = 0;
  private playbackInterval: number | null = null;

  play(): void {
    this.playbackRate = 1;
    this.startPlayback();
  }

  pause(): void {
    this.playbackRate = 0;
    this.stopPlayback();
  }

  togglePlayPause(): void {
    if (this.playbackRate === 0) {
      this.play();
    } else {
      this.pause();
    }
  }

  // J = reverse, K = pause, L = forward
  jklControl(key: 'j' | 'k' | 'l'): void {
    switch (key) {
      case 'j':
        if (this.playbackRate > 0) {
          this.playbackRate = -1;
        } else if (this.playbackRate === 0) {
          this.playbackRate = -1;
        } else {
          this.playbackRate = Math.max(-8, this.playbackRate * 2);
        }
        this.startPlayback();
        break;
        
      case 'k':
        this.pause();
        break;
        
      case 'l':
        if (this.playbackRate < 0) {
          this.playbackRate = 1;
        } else if (this.playbackRate === 0) {
          this.playbackRate = 1;
        } else {
          this.playbackRate = Math.min(8, this.playbackRate * 2);
        }
        this.startPlayback();
        break;
    }
  }

  private startPlayback(): void {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
    }

    const fps = 30;
    this.playbackInterval = window.setInterval(() => {
      this.state.playhead += this.playbackRate / fps;
      this.state.playhead = Math.max(0, this.state.playhead);
      this.notify();
    }, 1000 / fps);
  }

  private stopPlayback(): void {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  // Frame stepping
  stepFrame(forward: boolean): void {
    const fps = 30;
    this.state.playhead += (forward ? 1 : -1) / fps;
    this.state.playhead = Math.max(0, this.state.playhead);
    this.notify();
  }

  // ============================================================
  // Queries
  // ============================================================

  getTrackClips(trackId: string): Clip[] {
    return Array.from(this.state.clips.values())
      .filter(c => c.trackId === trackId);
  }

  getClipsAtTime(time: number): Clip[] {
    // IntervalIndex で O(log n + k) 検索 (大量クリップ時の最適化)
    const index = this.buildIntervalIndex();
    const hits = index.queryPoint(time);
    const byId = this.state.clips;
    return hits.map((h) => byId.get(h.id)!).filter(Boolean);
  }

  /** クリップ群から区間インデックスを構築 (時間範囲クエリ用) */
  private buildIntervalIndex(): IntervalIndex<{ id: string; start: number; end: number }> {
    const index = new IntervalIndex<{ id: string; start: number; end: number }>();
    for (const c of this.state.clips.values()) {
      index.insert({ id: c.id, start: c.startTime, end: c.startTime + c.duration });
    }
    return index;
  }

  getTimelineDuration(): number {
    let maxEnd = 0;
    for (const clip of this.state.clips.values()) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  }

  // ============================================================
  // State
  // ============================================================

  getState(): TimelineState {
    return { ...this.state };
  }

  subscribe(listener: (state: TimelineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export default MagneticTimeline;
