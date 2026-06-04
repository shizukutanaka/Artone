import { color } from '../app/design-system';
/**
 * Artone v3 — Marker System
 * 
 * タイムラインマーカー
 * - 標準マーカー
 * - チャプター
 * - タスクマーカー
 * - 同期ポイント
 * - ナビゲーション
 * - インポート/エクスポート
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface Marker {
  id: string;
  time: number;
  duration: number;
  name: string;
  notes: string;
  type: MarkerType;
  color: string;
  completed?: boolean;
  priority?: MarkerPriority;
  tags: string[];
  clipId?: string;
  metadata: Record<string, unknown>;
}

export type MarkerType = 
  | 'standard' | 'chapter' | 'todo' | 'sync' 
  | 'comment' | 'edit' | 'vfx' | 'sfx' | 'music';

export type MarkerPriority = 'low' | 'normal' | 'high' | 'critical';

export interface MarkerRange {
  start: number;
  end: number;
  markers: Marker[];
}

export interface ChapterExport {
  title: string;
  startTime: number;
  endTime?: number;
}

// ============================================================
// Default Colors
// ============================================================

// マーカー種別の識別色 (Apple HIG systemColors ベース — ドメイン定数)
const MARKER_COLORS: Record<MarkerType, string> = {
  standard: color.brand,
  chapter: '#34C759', // marker-color
  todo: '#FF9500', // marker-color
  sync: '#FF3B30', // marker-color
  comment: '#AF52DE', // marker-color
  edit: '#00C7BE', // marker-color
  vfx: '#FF2D55', // marker-color
  sfx: '#5856D6', // marker-color
  music: '#FF9500' // marker-color
};

// ============================================================
// Marker Manager
// ============================================================

export class MarkerManager {
  private markers: Map<string, Marker> = new Map();
  private listeners: Set<() => void> = new Set();

  // ============================================================
  // Marker CRUD
  // ============================================================

  addMarker(
    time: number,
    type: MarkerType = 'standard',
    options: Partial<Omit<Marker, 'id' | 'time' | 'type'>> = {}
  ): Marker {
    const marker: Marker = {
      id: crypto.randomUUID(),
      time,
      duration: options.duration ?? 0,
      name: options.name ?? this.generateDefaultName(type),
      notes: options.notes ?? '',
      type,
      color: options.color ?? MARKER_COLORS[type],
      completed: type === 'todo' ? false : undefined,
      priority: type === 'todo' ? (options.priority ?? 'normal') : undefined,
      tags: options.tags ?? [],
      clipId: options.clipId,
      metadata: options.metadata ?? {}
    };

    this.markers.set(marker.id, marker);
    this.notify();
    return marker;
  }

  private generateDefaultName(type: MarkerType): string {
    const count = Array.from(this.markers.values()).filter(m => m.type === type).length + 1;
    const typeNames: Record<MarkerType, string> = {
      standard: 'Marker',
      chapter: 'Chapter',
      todo: 'Task',
      sync: 'Sync Point',
      comment: 'Comment',
      edit: 'Edit Note',
      vfx: 'VFX',
      sfx: 'SFX',
      music: 'Music Cue'
    };
    return `${typeNames[type]} ${count}`;
  }

  updateMarker(id: string, updates: Partial<Marker>): void {
    const marker = this.markers.get(id);
    if (marker) {
      Object.assign(marker, updates);
      this.notify();
    }
  }

  deleteMarker(id: string): void {
    this.markers.delete(id);
    this.notify();
  }

  deleteMarkersInRange(start: number, end: number): number {
    let count = 0;
    for (const [id, marker] of this.markers) {
      if (marker.time >= start && marker.time <= end) {
        this.markers.delete(id);
        count++;
      }
    }
    if (count > 0) this.notify();
    return count;
  }

  // ============================================================
  // Queries
  // ============================================================

  getMarker(id: string): Marker | undefined {
    return this.markers.get(id);
  }

  getAllMarkers(): Marker[] {
    return Array.from(this.markers.values()).sort((a, b) => a.time - b.time);
  }

  getMarkersByType(type: MarkerType): Marker[] {
    return this.getAllMarkers().filter(m => m.type === type);
  }

  getMarkersAtTime(time: number, tolerance = 0.1): Marker[] {
    return this.getAllMarkers().filter(m => 
      Math.abs(m.time - time) <= tolerance ||
      (m.duration > 0 && time >= m.time && time <= m.time + m.duration)
    );
  }

  getMarkersInRange(start: number, end: number): Marker[] {
    return this.getAllMarkers().filter(m =>
      m.time >= start && m.time <= end
    );
  }

  getMarkersByTag(tag: string): Marker[] {
    return this.getAllMarkers().filter(m => m.tags.includes(tag));
  }

  getMarkersByClip(clipId: string): Marker[] {
    return this.getAllMarkers().filter(m => m.clipId === clipId);
  }

  getTodos(completed?: boolean): Marker[] {
    return this.getMarkersByType('todo').filter(m => 
      completed === undefined || m.completed === completed
    );
  }

  getChapters(): Marker[] {
    return this.getMarkersByType('chapter');
  }

  // ============================================================
  // Navigation
  // ============================================================

  getNextMarker(time: number, type?: MarkerType): Marker | null {
    const markers = type ? this.getMarkersByType(type) : this.getAllMarkers();
    return markers.find(m => m.time > time) || null;
  }

  getPrevMarker(time: number, type?: MarkerType): Marker | null {
    const markers = type ? this.getMarkersByType(type) : this.getAllMarkers();
    const reversed = [...markers].reverse();
    return reversed.find(m => m.time < time) || null;
  }

  getNearestMarker(time: number, type?: MarkerType): Marker | null {
    const markers = type ? this.getMarkersByType(type) : this.getAllMarkers();
    if (markers.length === 0) return null;

    let nearest = markers[0];
    let minDistance = Math.abs(markers[0].time - time);

    for (const marker of markers) {
      const distance = Math.abs(marker.time - time);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = marker;
      }
    }

    return nearest;
  }

  getMarkersBetween(marker1Id: string, marker2Id: string): Marker[] {
    const m1 = this.markers.get(marker1Id);
    const m2 = this.markers.get(marker2Id);
    if (!m1 || !m2) return [];

    const start = Math.min(m1.time, m2.time);
    const end = Math.max(m1.time, m2.time);

    return this.getMarkersInRange(start, end);
  }

  // ============================================================
  // Bulk Operations
  // ============================================================

  moveMarkers(markerIds: string[], offset: number): void {
    for (const id of markerIds) {
      const marker = this.markers.get(id);
      if (marker) {
        marker.time = Math.max(0, marker.time + offset);
      }
    }
    this.notify();
  }

  copyMarkers(markerIds: string[], offset: number): Marker[] {
    const newMarkers: Marker[] = [];
    
    for (const id of markerIds) {
      const original = this.markers.get(id);
      if (original) {
        const copy: Marker = {
          ...original,
          id: crypto.randomUUID(),
          time: original.time + offset,
          name: `${original.name} (Copy)`
        };
        this.markers.set(copy.id, copy);
        newMarkers.push(copy);
      }
    }

    if (newMarkers.length > 0) this.notify();
    return newMarkers;
  }

  setMarkerType(markerIds: string[], type: MarkerType): void {
    for (const id of markerIds) {
      const marker = this.markers.get(id);
      if (marker) {
        marker.type = type;
        marker.color = MARKER_COLORS[type];
        if (type === 'todo' && marker.completed === undefined) {
          marker.completed = false;
          marker.priority = 'normal';
        }
      }
    }
    this.notify();
  }

  toggleTodoComplete(id: string): void {
    const marker = this.markers.get(id);
    if (marker && marker.type === 'todo') {
      marker.completed = !marker.completed;
      this.notify();
    }
  }

  // ============================================================
  // Tags
  // ============================================================

  addTag(markerId: string, tag: string): void {
    const marker = this.markers.get(markerId);
    if (marker && !marker.tags.includes(tag)) {
      marker.tags.push(tag);
      this.notify();
    }
  }

  removeTag(markerId: string, tag: string): void {
    const marker = this.markers.get(markerId);
    if (marker) {
      marker.tags = marker.tags.filter(t => t !== tag);
      this.notify();
    }
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const marker of this.markers.values()) {
      for (const tag of marker.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  // ============================================================
  // Chapter Export
  // ============================================================

  exportYouTubeChapters(): string {
    const chapters = this.getChapters();
    if (chapters.length === 0) return '';

    const lines: string[] = [];
    for (const chapter of chapters) {
      const time = this.formatTimeYouTube(chapter.time);
      lines.push(`${time} ${chapter.name}`);
    }

    return lines.join('\n');
  }

  exportFFmpegChapters(): string {
    const chapters = this.getChapters();
    if (chapters.length === 0) return '';

    const lines: string[] = [';FFMETADATA1'];
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const nextChapter = chapters[i + 1];
      
      lines.push('[CHAPTER]');
      lines.push('TIMEBASE=1/1000');
      lines.push(`START=${Math.round(chapter.time * 1000)}`);
      lines.push(`END=${Math.round((nextChapter?.time ?? chapter.time + 60) * 1000)}`);
      lines.push(`title=${chapter.name}`);
    }

    return lines.join('\n');
  }

  exportWebVTTChapters(): string {
    const chapters = this.getChapters();
    if (chapters.length === 0) return '';

    const lines: string[] = ['WEBVTT', ''];
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const nextChapter = chapters[i + 1];
      
      const start = this.formatTimeVTT(chapter.time);
      const end = this.formatTimeVTT(nextChapter?.time ?? chapter.time + 60);
      
      lines.push(`${start} --> ${end}`);
      lines.push(chapter.name);
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatTimeYouTube(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private formatTimeVTT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  // ============================================================
  // Import/Export
  // ============================================================

  exportJSON(): string {
    return JSON.stringify(this.getAllMarkers(), null, 2);
  }

  importJSON(json: string): number {
    try {
      const data = JSON.parse(json) as Marker[];
      let count = 0;
      
      for (const marker of data) {
        const newMarker: Marker = {
          ...marker,
          id: crypto.randomUUID()
        };
        this.markers.set(newMarker.id, newMarker);
        count++;
      }

      if (count > 0) this.notify();
      return count;
    } catch {
      // Parsing failed — return 0 imported captions
      return 0;
    }
  }

  exportEDL(): string {
    const markers = this.getAllMarkers();
    const lines: string[] = [
      'TITLE: Artone Markers',
      'FCM: NON-DROP FRAME',
      ''
    ];

    let eventNum = 1;
    for (const marker of markers) {
      const tc = this.formatTimecodeEDL(marker.time);
      lines.push(`${eventNum.toString().padStart(3, '0')}  001      V     C        ${tc} ${tc} ${tc} ${tc}`);
      lines.push(`* FROM CLIP NAME: ${marker.name}`);
      lines.push('');
      eventNum++;
    }

    return lines.join('\n');
  }

  private formatTimecodeEDL(seconds: number, fps = 30): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * fps);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  }

  // ============================================================
  // Statistics
  // ============================================================

  getStats(): {
    total: number;
    byType: Record<MarkerType, number>;
    todoComplete: number;
    todoIncomplete: number;
    tags: number;
  } {
    const markers = this.getAllMarkers();
    const byType: Partial<Record<MarkerType, number>> = {};
    let todoComplete = 0;
    let todoIncomplete = 0;

    for (const marker of markers) {
      byType[marker.type] = (byType[marker.type] || 0) + 1;
      if (marker.type === 'todo') {
        if (marker.completed) todoComplete++;
        else todoIncomplete++;
      }
    }

    return {
      total: markers.length,
      byType: byType as Record<MarkerType, number>,
      todoComplete,
      todoIncomplete,
      tags: this.getAllTags().length
    };
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

export default MarkerManager;
