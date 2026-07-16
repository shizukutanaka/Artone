import { color } from '../app/design-system';
import { alignAnglesByAudio, type AudioSamples } from './audio-sync';
/**
 * Artone v3 — Multi-Cam Editor
 * 
 * 複数カメラ同期・スイッチング
 * - 自動同期 (audio waveform)
 * - マルチビュー
 * - リアルタイムスイッチング
 * - カット編集生成
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface CameraAngle {
  id: string;
  name: string;
  clipId: string;
  offset: number;       // Sync offset in seconds
  active: boolean;
  color: string;
}

export interface MultiCamClip {
  id: string;
  name: string;
  angles: CameraAngle[];
  duration: number;
  syncMethod: 'audio' | 'timecode' | 'marker' | 'manual';
  activeAngle: string;  // Current active angle ID
}

export interface SwitchPoint {
  time: number;
  angleId: string;
  transition: 'cut' | 'dissolve';
  transitionDuration: number;
}

export interface MultiCamState {
  clips: Map<string, MultiCamClip>;
  currentClipId: string | null;
  switchPoints: SwitchPoint[];
  isRecording: boolean;
  playhead: number;
}

// ============================================================
// Camera Colors
// ============================================================

const ANGLE_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#00C7BE', color.brand, '#5856D6', '#AF52DE'
];

// ============================================================
// Multi-Cam Editor
// ============================================================

export class MultiCamEditor {
  private state: MultiCamState = {
    clips: new Map(),
    currentClipId: null,
    switchPoints: [],
    isRecording: false,
    playhead: 0
  };
  private listeners: Set<() => void> = new Set();

  // ============================================================
  // Clip Management
  // ============================================================

  createMultiCamClip(name: string): MultiCamClip {
    const id = crypto.randomUUID();
    
    const clip: MultiCamClip = {
      id,
      name,
      angles: [],
      duration: 0,
      syncMethod: 'audio',
      activeAngle: ''
    };

    this.state.clips.set(id, clip);
    this.state.currentClipId = id;
    this.notify();
    return clip;
  }

  addAngle(clipId: string, clipSourceId: string, name?: string): CameraAngle | null {
    const mcClip = this.state.clips.get(clipId);
    if (!mcClip) return null;

    const angleIndex = mcClip.angles.length;
    const angle: CameraAngle = {
      id: crypto.randomUUID(),
      name: name || `Angle ${angleIndex + 1}`,
      clipId: clipSourceId,
      offset: 0,
      active: angleIndex === 0,
      color: ANGLE_COLORS[angleIndex % ANGLE_COLORS.length]
    };

    mcClip.angles.push(angle);
    
    if (mcClip.angles.length === 1) {
      mcClip.activeAngle = angle.id;
    }

    this.notify();
    return angle;
  }

  removeAngle(clipId: string, angleId: string): void {
    const mcClip = this.state.clips.get(clipId);
    if (!mcClip) return;

    mcClip.angles = mcClip.angles.filter(a => a.id !== angleId);
    
    // Guard: when the last angle is removed mcClip.angles.length is 0; the
    // original condition skipped the update, leaving a stale angle ID.
    if (mcClip.activeAngle === angleId) {
      mcClip.activeAngle = mcClip.angles.length > 0 ? mcClip.angles[0].id : '';
    }

    // Remove switch points for this angle
    this.state.switchPoints = this.state.switchPoints.filter(
      sp => sp.angleId !== angleId
    );

    this.notify();
  }

  // ============================================================
  // Synchronization
  // ============================================================

  /**
   * 各アングルの音声を相互相関で整列し、offset(秒) を実測する。
   * @param audioByAngle - angleId → 音声サンプル。基準アングルの音声は必須。
   * @returns 基準アングルの音声が無い場合 false。
   */
  async syncByAudio(
    clipId: string,
    referenceAngleId: string,
    audioByAngle: Map<string, AudioSamples>
  ): Promise<boolean> {
    const mcClip = this.state.clips.get(clipId);
    if (!mcClip) return false;

    const refAngle = mcClip.angles.find(a => a.id === referenceAngleId);
    if (!refAngle) return false;

    const referenceAudio = audioByAngle.get(referenceAngleId);
    if (!referenceAudio) return false;

    // 正規化相互相関で基準に対する各アングルのラグを実測 (audio-sync.ts)。
    const offsets = alignAnglesByAudio(
      referenceAudio,
      mcClip.angles.map(a => ({ id: a.id, audio: audioByAngle.get(a.id) })),
      referenceAngleId
    );
    for (const angle of mcClip.angles) {
      angle.offset = offsets.get(angle.id) ?? 0;
    }

    this.notify();
    return true;
  }

  async syncByTimecode(clipId: string): Promise<boolean> {
    const mcClip = this.state.clips.get(clipId);
    if (!mcClip) return false;

    // In production, would read embedded timecode
    // Set all offsets to 0 (assuming matching timecode)
    for (const angle of mcClip.angles) {
      angle.offset = 0;
    }

    this.notify();
    return true;
  }

  setAngleOffset(clipId: string, angleId: string, offset: number): void {
    const mcClip = this.state.clips.get(clipId);
    if (!mcClip) return;

    const angle = mcClip.angles.find(a => a.id === angleId);
    if (angle) {
      angle.offset = offset;
      this.notify();
    }
  }

  // ============================================================
  // Switching
  // ============================================================

  switchToAngle(angleId: string): void {
    if (!this.state.currentClipId) return;

    const mcClip = this.state.clips.get(this.state.currentClipId);
    if (!mcClip) return;

    const angle = mcClip.angles.find(a => a.id === angleId);
    if (!angle) return;

    // Update active states
    for (const a of mcClip.angles) {
      a.active = a.id === angleId;
    }
    mcClip.activeAngle = angleId;

    // If recording, add switch point
    if (this.state.isRecording) {
      this.addSwitchPoint(this.state.playhead, angleId);
    }

    this.notify();
  }

  addSwitchPoint(time: number, angleId: string, transition: 'cut' | 'dissolve' = 'cut'): void {
    // Remove existing switch at same time
    this.state.switchPoints = this.state.switchPoints.filter(
      sp => Math.abs(sp.time - time) > 0.016
    );

    this.state.switchPoints.push({
      time,
      angleId,
      transition,
      transitionDuration: transition === 'dissolve' ? 0.5 : 0
    });

    // Sort by time
    this.state.switchPoints.sort((a, b) => a.time - b.time);
    this.notify();
  }

  removeSwitchPoint(time: number): void {
    this.state.switchPoints = this.state.switchPoints.filter(
      sp => Math.abs(sp.time - time) > 0.016
    );
    this.notify();
  }

  clearSwitchPoints(): void {
    this.state.switchPoints = [];
    this.notify();
  }

  // ============================================================
  // Recording Mode
  // ============================================================

  startRecording(): void {
    this.state.isRecording = true;
    this.notify();
  }

  stopRecording(): void {
    this.state.isRecording = false;
    this.notify();
  }

  setPlayhead(time: number): void {
    this.state.playhead = time;

    // Update active angle based on switch points
    if (!this.state.isRecording && this.state.currentClipId) {
      const activeSwitch = this.getActiveSwitch(time);
      if (activeSwitch) {
        const mcClip = this.state.clips.get(this.state.currentClipId);
        if (mcClip && mcClip.activeAngle !== activeSwitch.angleId) {
          for (const angle of mcClip.angles) {
            angle.active = angle.id === activeSwitch.angleId;
          }
          mcClip.activeAngle = activeSwitch.angleId;
        }
      }
    }

    this.notify();
  }

  private getActiveSwitch(time: number): SwitchPoint | null {
    // Binary search: find the rightmost switch point with sp.time <= time.
    // switchPoints is kept sorted by addSwitchPoint(). O(log N) vs O(N) —
    // matters at 60fps since setPlayhead() calls this on every playhead tick.
    const points = this.state.switchPoints;
    let lo = 0, hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid].time <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? points[lo - 1] : null;
  }

  // ============================================================
  // Keyboard Shortcuts
  // ============================================================

  handleKeyDown(key: string): void {
    const num = parseInt(key);
    if (num >= 1 && num <= 9) {
      const mcClip = this.state.currentClipId 
        ? this.state.clips.get(this.state.currentClipId) 
        : null;
      
      if (mcClip && mcClip.angles[num - 1]) {
        this.switchToAngle(mcClip.angles[num - 1].id);
      }
    }
  }

  // ============================================================
  // Generate Flat Edit
  // ============================================================

  generateFlatEdit(clipId: string): Array<{ clipId: string; start: number; end: number; offset: number }> {
    const mcClip = this.state.clips.get(clipId);
    if (!mcClip || this.state.switchPoints.length === 0) return [];

    const edits: Array<{ clipId: string; start: number; end: number; offset: number }> = [];
    const duration = mcClip.duration;

    for (let i = 0; i < this.state.switchPoints.length; i++) {
      const sp = this.state.switchPoints[i];
      const nextSp = this.state.switchPoints[i + 1];
      
      const angle = mcClip.angles.find(a => a.id === sp.angleId);
      if (!angle) continue;

      const start = sp.time;
      const end = nextSp ? nextSp.time : duration;

      edits.push({
        clipId: angle.clipId,
        start,
        end,
        offset: angle.offset
      });
    }

    return edits;
  }

  // ============================================================
  // Multi-View Layout
  // ============================================================

  getMultiViewLayout(angleCount: number): { cols: number; rows: number } {
    if (angleCount <= 1) return { cols: 1, rows: 1 };
    if (angleCount <= 2) return { cols: 2, rows: 1 };
    if (angleCount <= 4) return { cols: 2, rows: 2 };
    if (angleCount <= 6) return { cols: 3, rows: 2 };
    if (angleCount <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(angleCount / 4) };
  }

  // ============================================================
  // State Access
  // ============================================================

  getCurrentClip(): MultiCamClip | null {
    return this.state.currentClipId 
      ? this.state.clips.get(this.state.currentClipId) || null 
      : null;
  }

  getSwitchPoints(): SwitchPoint[] {
    return [...this.state.switchPoints];
  }

  isRecording(): boolean {
    return this.state.isRecording;
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
}

