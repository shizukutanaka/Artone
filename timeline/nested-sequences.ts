/**
 * Artone v3 — Nested Sequences
 * 
 * ネスト化シーケンス
 * - コンパウンドクリップ
 * - シーケンス内シーケンス
 * - 独立設定
 * - リンク編集
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface Sequence {
  id: string;
  name: string;
  settings: SequenceSettings;
  tracks: Track[];
  clips: Clip[];
  duration: number;
  markers: Marker[];
  nested: boolean;
  parentId?: string;
}

export interface SequenceSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  colorSpace: 'rec709' | 'rec2020' | 'dci_p3';
  fieldOrder: 'progressive' | 'upper' | 'lower';
  pixelAspect: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  height: number;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  visible: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  type: 'media' | 'nested' | 'compound' | 'adjustment';
  startTime: number;
  duration: number;
  mediaIn: number;
  mediaOut: number;
  speed: number;
  reversed: boolean;
  
  // Media clip specific
  mediaId?: string;
  
  // Nested/Compound specific
  sequenceId?: string;
  
  // Visual
  label: string;
  color: string;
  locked: boolean;
  disabled: boolean;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
  duration: number;
  type: 'standard' | 'chapter' | 'todo' | 'sync';
  notes: string;
}

export interface CompoundClipRef {
  id: string;
  originalClipIds: string[];
  sequenceId: string;
  instances: string[];
}

// ============================================================
// Default Settings
// ============================================================

const DEFAULT_SETTINGS: SequenceSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000,
  colorSpace: 'rec709',
  fieldOrder: 'progressive',
  pixelAspect: 1
};

// ============================================================
// Nested Sequence Manager
// ============================================================

export class NestedSequenceManager {
  private sequences: Map<string, Sequence> = new Map();
  private compoundRefs: Map<string, CompoundClipRef> = new Map();
  private activeSequenceId: string | null = null;
  private listeners: Set<() => void> = new Set();

  // ============================================================
  // Sequence Management
  // ============================================================

  createSequence(name: string, settings?: Partial<SequenceSettings>): Sequence {
    const sequence: Sequence = {
      id: crypto.randomUUID(),
      name,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      tracks: [
        this.createDefaultTrack('video', 'Video 1'),
        this.createDefaultTrack('video', 'Video 2'),
        this.createDefaultTrack('audio', 'Audio 1'),
        this.createDefaultTrack('audio', 'Audio 2')
      ],
      clips: [],
      duration: 0,
      markers: [],
      nested: false
    };

    this.sequences.set(sequence.id, sequence);
    
    if (!this.activeSequenceId) {
      this.activeSequenceId = sequence.id;
    }

    this.notify();
    return sequence;
  }

  private createDefaultTrack(type: 'video' | 'audio', name: string): Track {
    return {
      id: crypto.randomUUID(),
      name,
      type,
      height: type === 'video' ? 80 : 50,
      muted: false,
      locked: false,
      solo: false,
      visible: true
    };
  }

  deleteSequence(sequenceId: string): void {
    // Check if sequence is used as nested
    for (const seq of this.sequences.values()) {
      const hasNested = seq.clips.some(c => c.sequenceId === sequenceId);
      if (hasNested) {
        throw new Error('Cannot delete sequence: used as nested sequence');
      }
    }

    this.sequences.delete(sequenceId);
    
    if (this.activeSequenceId === sequenceId) {
      this.activeSequenceId = this.sequences.size > 0
        ? this.sequences.keys().next().value ?? null
        : null;
    }

    this.notify();
  }

  duplicateSequence(sequenceId: string): Sequence | null {
    const original = this.sequences.get(sequenceId);
    if (!original) return null;

    const duplicate: Sequence = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} Copy`,
      // Deep-copy settings so editing the duplicate's resolution/fps/etc. does
      // not mutate the original (the spread above only shares the reference).
      settings: { ...original.settings },
      tracks: original.tracks.map(t => ({ ...t, id: crypto.randomUUID() })),
      clips: original.clips.map(c => ({ ...c, id: crypto.randomUUID() })),
      markers: original.markers.map(m => ({ ...m, id: crypto.randomUUID() }))
    };

    // Remap track IDs
    const trackIdMap = new Map<string, string>();
    original.tracks.forEach((t, i) => {
      trackIdMap.set(t.id, duplicate.tracks[i].id);
    });

    for (const clip of duplicate.clips) {
      clip.trackId = trackIdMap.get(clip.trackId) || clip.trackId;
    }

    this.sequences.set(duplicate.id, duplicate);
    this.notify();
    return duplicate;
  }

  // ============================================================
  // Nested Sequences
  // ============================================================

  nestSequence(
    sourceSequenceId: string,
    clipIds: string[],
    name?: string
  ): Sequence | null {
    const source = this.sequences.get(sourceSequenceId);
    if (!source || clipIds.length === 0) return null;

    // Get selected clips
    const selectedClips = source.clips.filter(c => clipIds.includes(c.id));
    if (selectedClips.length === 0) return null;

    // Calculate bounds
    const minStart = Math.min(...selectedClips.map(c => c.startTime));
    const maxEnd = Math.max(...selectedClips.map(c => c.startTime + c.duration));
    const duration = maxEnd - minStart;

    // Create nested sequence
    const nested = this.createSequence(name || `Nested ${this.sequences.size}`, source.settings);
    nested.nested = true;
    nested.parentId = sourceSequenceId;
    nested.duration = duration;

    // Copy clips to nested sequence (adjusted times)
    for (const clip of selectedClips) {
      const nestedClip: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: clip.startTime - minStart
      };
      nested.clips.push(nestedClip);
    }

    // Remove original clips
    source.clips = source.clips.filter(c => !clipIds.includes(c.id));

    // Add nested sequence clip to source
    const firstClip = selectedClips[0];
    const nestedClipRef: Clip = {
      id: crypto.randomUUID(),
      trackId: firstClip.trackId,
      type: 'nested',
      startTime: minStart,
      duration,
      mediaIn: 0,
      mediaOut: duration,
      speed: 1,
      reversed: false,
      sequenceId: nested.id,
      label: nested.name,
      color: '#AF52DE',
      locked: false,
      disabled: false
    };

    source.clips.push(nestedClipRef);
    this.updateDuration(sourceSequenceId);
    this.notify();
    return nested;
  }

  unnestSequence(sequenceId: string, nestedClipId: string): boolean {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return false;

    const nestedClip = sequence.clips.find(c => c.id === nestedClipId);
    if (!nestedClip || nestedClip.type !== 'nested' || !nestedClip.sequenceId) return false;

    const nestedSequence = this.sequences.get(nestedClip.sequenceId);
    if (!nestedSequence) return false;

    // Remove nested clip
    sequence.clips = sequence.clips.filter(c => c.id !== nestedClipId);

    // Add clips from nested sequence (adjusted times)
    for (const clip of nestedSequence.clips) {
      const restoredClip: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        // Map a nested-internal start back to the parent timeline. The nested
        // clip may be trimmed (mediaIn > 0), so subtract that offset — mirroring
        // renderNestedFrame's nestedTime = (t - startTime) + mediaIn mapping.
        startTime: clip.startTime + nestedClip.startTime - nestedClip.mediaIn
      };
      sequence.clips.push(restoredClip);
    }

    // Delete nested sequence if no other references
    const hasOtherRefs = Array.from(this.sequences.values()).some(
      seq => seq.id !== sequenceId && 
             seq.clips.some(c => c.sequenceId === nestedSequence.id)
    );

    if (!hasOtherRefs) {
      this.sequences.delete(nestedSequence.id);
    }

    this.updateDuration(sequenceId);
    this.notify();
    return true;
  }

  // ============================================================
  // Compound Clips
  // ============================================================

  createCompoundClip(sequenceId: string, clipIds: string[], name?: string): CompoundClipRef | null {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence || clipIds.length === 0) return null;

    // Similar to nesting but tracks compound refs
    const nestedSeq = this.nestSequence(sequenceId, clipIds, name || 'Compound Clip');
    if (!nestedSeq) return null;

    const nestedClip = sequence.clips.find(c => c.sequenceId === nestedSeq.id);
    if (!nestedClip) return null;

    nestedClip.type = 'compound';

    const ref: CompoundClipRef = {
      id: crypto.randomUUID(),
      originalClipIds: clipIds,
      sequenceId: nestedSeq.id,
      instances: [nestedClip.id]
    };

    this.compoundRefs.set(ref.id, ref);
    this.notify();
    return ref;
  }

  duplicateCompoundInstance(sequenceId: string, compoundClipId: string): Clip | null {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return null;

    const compound = sequence.clips.find(c => c.id === compoundClipId);
    if (!compound || compound.type !== 'compound') return null;

    // Find ref
    let ref: CompoundClipRef | null = null;
    for (const r of this.compoundRefs.values()) {
      if (r.instances.includes(compoundClipId)) {
        ref = r;
        break;
      }
    }

    if (!ref) return null;

    // Create new instance
    const newClip: Clip = {
      ...compound,
      id: crypto.randomUUID(),
      startTime: compound.startTime + compound.duration + 0.1
    };

    sequence.clips.push(newClip);
    ref.instances.push(newClip.id);

    this.updateDuration(sequenceId);
    this.notify();
    return newClip;
  }

  // ============================================================
  // Open Nested for Editing
  // ============================================================

  openNested(nestedClipId: string): Sequence | null {
    for (const seq of this.sequences.values()) {
      const clip = seq.clips.find(c => c.id === nestedClipId);
      if (clip && (clip.type === 'nested' || clip.type === 'compound') && clip.sequenceId) {
        this.activeSequenceId = clip.sequenceId;
        this.notify();
        return this.sequences.get(clip.sequenceId) || null;
      }
    }
    return null;
  }

  closeNested(): void {
    const active = this.sequences.get(this.activeSequenceId || '');
    if (active?.parentId) {
      this.activeSequenceId = active.parentId;
      this.notify();
    }
  }

  getParentChain(sequenceId: string): Sequence[] {
    const chain: Sequence[] = [];
    const visited = new Set<string>();
    let current = this.sequences.get(sequenceId);

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current);
      current = current.parentId ? this.sequences.get(current.parentId) : undefined;
    }
    // A parentId cycle (e.g. from a corrupted/imported project) would otherwise
    // loop forever; the visited set stops at the first repeated sequence.

    return chain;
  }

  // ============================================================
  // Clip Operations
  // ============================================================

  addClip(sequenceId: string, clip: Omit<Clip, 'id'>): Clip | null {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return null;

    const newClip: Clip = {
      ...clip,
      id: crypto.randomUUID()
    };

    sequence.clips.push(newClip);
    this.updateDuration(sequenceId);
    this.notify();
    return newClip;
  }

  removeClip(sequenceId: string, clipId: string): void {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return;

    sequence.clips = sequence.clips.filter(c => c.id !== clipId);
    this.updateDuration(sequenceId);
    this.notify();
  }

  moveClip(sequenceId: string, clipId: string, newStartTime: number, newTrackId?: string): void {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return;

    const clip = sequence.clips.find(c => c.id === clipId);
    if (!clip) return;

    clip.startTime = Math.max(0, newStartTime);
    if (newTrackId) {
      clip.trackId = newTrackId;
    }

    this.updateDuration(sequenceId);
    this.notify();
  }

  // ============================================================
  // Track Operations
  // ============================================================

  addTrack(sequenceId: string, type: 'video' | 'audio', name?: string): Track | null {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return null;

    const count = sequence.tracks.filter(t => t.type === type).length;
    const track = this.createDefaultTrack(type, name || `${type === 'video' ? 'Video' : 'Audio'} ${count + 1}`);

    sequence.tracks.push(track);
    this.notify();
    return track;
  }

  removeTrack(sequenceId: string, trackId: string): void {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return;

    // Remove clips on track
    sequence.clips = sequence.clips.filter(c => c.trackId !== trackId);
    sequence.tracks = sequence.tracks.filter(t => t.id !== trackId);

    this.updateDuration(sequenceId);
    this.notify();
  }

  // ============================================================
  // Utilities
  // ============================================================

  private updateDuration(sequenceId: string): void {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return;

    if (sequence.clips.length === 0) {
      sequence.duration = 0;
    } else {
      sequence.duration = Math.max(
        ...sequence.clips.map(c => c.startTime + c.duration)
      );
    }
  }

  getSequence(id: string): Sequence | undefined {
    return this.sequences.get(id);
  }

  getActiveSequence(): Sequence | null {
    return this.activeSequenceId ? this.sequences.get(this.activeSequenceId) || null : null;
  }

  setActiveSequence(id: string): void {
    if (this.sequences.has(id)) {
      this.activeSequenceId = id;
      this.notify();
    }
  }

  getAllSequences(): Sequence[] {
    return Array.from(this.sequences.values());
  }

  getTopLevelSequences(): Sequence[] {
    return Array.from(this.sequences.values()).filter(s => !s.nested);
  }

  // ============================================================
  // Render Frame from Nested
  // ============================================================

  async renderNestedFrame(
    sequenceId: string,
    time: number,
    _ancestors: ReadonlySet<string> = new Set(),
  ): Promise<ImageData | null> {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return null;

    // Cycle guard: a nested clip whose sequenceId points back to an ancestor
    // (reachable via corrupted/imported project data) would recurse until the
    // call stack overflows. Track the active render path and bail on revisit.
    if (_ancestors.has(sequenceId)) return null;
    const path = new Set(_ancestors);
    path.add(sequenceId);

    // Create canvas for compositing
    const canvas = new OffscreenCanvas(sequence.settings.width, sequence.settings.height);
    // willReadFrequently: the composited frame is read back via getImageData.
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Get clips at time, sorted by track order
    const visibleClips = sequence.clips.filter(c => {
      return !c.disabled && time >= c.startTime && time < c.startTime + c.duration;
    });

    // Render each clip (simplified - would need actual media rendering)
    for (const clip of visibleClips) {
      if (clip.type === 'nested' || clip.type === 'compound') {
        // Recursively render nested sequence
        const nestedTime = (time - clip.startTime) * clip.speed + clip.mediaIn;
        const nestedFrame = await this.renderNestedFrame(clip.sequenceId!, nestedTime, path);
        if (nestedFrame) {
          ctx.putImageData(nestedFrame, 0, 0);
        }
      }
      // Other clip types would render their media here
    }

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export default NestedSequenceManager;
