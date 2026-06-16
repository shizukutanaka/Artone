/**
 * Artone v3 — Project Manager
 * 
 * プロジェクトファイル管理
 * - IndexedDB永続化
 * - 自動保存
 * - バージョン履歴
 * - プロジェクト共有
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface Project {
  id: string;
  name: string;
  created: number;
  modified: number;
  /** Monotonic save counter (incremented on every save). NOT the file format version. */
  version: number;
  /**
   * On-disk schema/format version. Distinct from {@link version} (a save
   * counter): this identifies the *shape* of the file so old projects can be
   * migrated forward and files from a newer app can be refused rather than
   * silently misread. Optional in memory; always set on load/save.
   */
  schemaVersion?: number;

  settings: ProjectSettings;
  timeline: TimelineData;
  media: MediaReference[];
  markers: Marker[];

  metadata: {
    author: string;
    description: string;
    tags: string[];
    thumbnail?: string;
  };
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  colorSpace: 'rec709' | 'rec2020' | 'dci-p3';
  bitDepth: 8 | 10 | 12;
}

export interface TimelineData {
  tracks: TrackData[];
  clips: ClipData[];
  duration: number;
  playhead: number;
}

export interface TrackData {
  id: string;
  name: string;
  type: 'video' | 'audio';
  height: number;
  muted: boolean;
  locked: boolean;
}

export interface ClipData {
  id: string;
  trackId: string;
  mediaId: string;
  startTime: number;
  duration: number;
  mediaIn: number;
  mediaOut: number;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
  };
  effects: EffectData[];
}

export interface EffectData {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface MediaReference {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  path: string;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  size: number;
  hash: string;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
  type: 'standard' | 'chapter' | 'todo';
  notes: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  timestamp: number;
  name: string;
  data: string;
}

// ============================================================
// Default Project
// ============================================================

const DEFAULT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000,
  colorSpace: 'rec709',
  bitDepth: 8
};

/** Current project file schema version. Bump when the on-disk shape changes. */
export const PROJECT_SCHEMA_VERSION = 1;

/**
 * Normalise a loaded/imported project to the current schema.
 *
 * Serves the "10年読める / スキーマバージョニングで後方互換" requirement:
 * - Files written by an OLDER app (missing fields) are backfilled with safe
 *   defaults so they stay loadable.
 * - Files written by a NEWER app (schemaVersion ahead of this build) are
 *   refused with a clear error instead of being silently misread.
 * - Forward-only migrations (v1→v2…) slot in as the schema evolves.
 *
 * @param raw  Parsed project data of unknown vintage/shape.
 * @returns    A project conforming to the current schema.
 */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid project file: expected an object');
  }
  const p = raw as Partial<Project> & { schemaVersion?: number };
  const fileSchema = typeof p.schemaVersion === 'number' ? p.schemaVersion : 1;
  if (fileSchema > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema v${fileSchema} is newer than supported v${PROJECT_SCHEMA_VERSION}; please update Artone to open it.`,
    );
  }

  // Backfill structure so a project from an older build stays usable. As the
  // schema grows, forward-only migration steps keyed on fileSchema go here.
  const t = p.timeline ?? ({} as Partial<TimelineData>);
  const m = p.metadata ?? ({} as Project['metadata']);
  return {
    id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
    name: typeof p.name === 'string' ? p.name : 'Untitled',
    created: typeof p.created === 'number' ? p.created : Date.now(),
    modified: typeof p.modified === 'number' ? p.modified : Date.now(),
    version: typeof p.version === 'number' ? p.version : 1,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    timeline: {
      tracks: Array.isArray(t.tracks) ? t.tracks : [],
      clips: Array.isArray(t.clips) ? t.clips : [],
      duration: typeof t.duration === 'number' ? t.duration : 0,
      playhead: typeof t.playhead === 'number' ? t.playhead : 0,
    },
    media: Array.isArray(p.media) ? p.media : [],
    markers: Array.isArray(p.markers) ? p.markers : [],
    metadata: {
      author: typeof m.author === 'string' ? m.author : '',
      description: typeof m.description === 'string' ? m.description : '',
      tags: Array.isArray(m.tags) ? m.tags : [],
      thumbnail: m.thumbnail,
    },
  };
}

function createDefaultProject(name: string): Project {
  return {
    id: crypto.randomUUID(),
    name,
    created: Date.now(),
    modified: Date.now(),
    version: 1,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    timeline: {
      tracks: [
        { id: 'v1', name: 'Video 1', type: 'video', height: 80, muted: false, locked: false },
        { id: 'a1', name: 'Audio 1', type: 'audio', height: 50, muted: false, locked: false },
        { id: 'a2', name: 'Audio 2', type: 'audio', height: 50, muted: false, locked: false }
      ],
      clips: [],
      duration: 0,
      playhead: 0
    },
    media: [],
    markers: [],
    metadata: {
      author: '',
      description: '',
      tags: []
    }
  };
}

// ============================================================
// IndexedDB Storage
// ============================================================

const DB_NAME = 'artone-projects';
const DB_VERSION = 1;

class ProjectDB {
  private db: IDBDatabase | null = null;
  /**
   * In-flight open() promise. Methods open lazily via `if (!this.db) await
   * this.open()`, so concurrent first calls would otherwise each fire a
   * separate indexedDB.open() — opening multiple connections, running
   * onupgradeneeded more than once, and leaking all but the last IDBDatabase.
   * Memoising the promise makes open() idempotent under concurrency.
   */
  private opening: Promise<void> | null = null;

  /** this.db が null なら例外。open() 前のDB操作を防ぐ。 */
  private requireDB(): IDBDatabase {
    if (!this.db) throw new Error('Database not initialized. Call open() first.');
    return this.db;
  }

  async open(): Promise<void> {
    if (this.db) return;
    if (this.opening) return this.opening; // a concurrent open is already running

    this.opening = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.opening = null; // allow a later retry after a failed open
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('modified', 'modified', { unique: false });
        }

        // Versions store
        if (!db.objectStoreNames.contains('versions')) {
          const versionStore = db.createObjectStore('versions', { keyPath: 'id' });
          versionStore.createIndex('projectId', 'projectId', { unique: false });
          versionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Media store (for offline caching)
        if (!db.objectStoreNames.contains('media')) {
          const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
          mediaStore.createIndex('projectId', 'projectId', { unique: false });
        }
      };
    });

    return this.opening;
  }

  async saveProject(project: Project): Promise<void> {
    if (!this.db) await this.open();
    
    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      
      project.modified = Date.now();
      project.version++;
      
      const request = store.put(project);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async loadProject(id: string): Promise<Project | null> {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async listProjects(): Promise<Project[]> {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const index = store.index('modified');
      const request = index.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const projects = request.result as Project[];
        // Sort by modified descending
        projects.sort((a, b) => b.modified - a.modified);
        resolve(projects);
      };
    });
  }

  async saveVersion(version: ProjectVersion): Promise<void> {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction('versions', 'readwrite');
      const store = tx.objectStore('versions');
      const request = store.put(version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getVersions(projectId: string): Promise<ProjectVersion[]> {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.requireDB().transaction('versions', 'readonly');
      const store = tx.objectStore('versions');
      const index = store.index('projectId');
      const request = index.getAll(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const versions = request.result as ProjectVersion[];
        versions.sort((a, b) => b.timestamp - a.timestamp);
        resolve(versions);
      };
    });
  }
}

// ============================================================
// Project Manager
// ============================================================

export class ProjectManager {
  private db: ProjectDB;
  private currentProject: Project | null = null;
  private autosaveInterval: number | null = null;
  private isDirty = false;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.db = new ProjectDB();
  }

  async init(): Promise<void> {
    await this.db.open();
  }

  // ============================================================
  // Project Operations
  // ============================================================

  async createProject(name: string, settings?: Partial<ProjectSettings>): Promise<Project> {
    const project = createDefaultProject(name);
    
    if (settings) {
      project.settings = { ...project.settings, ...settings };
    }

    await this.db.saveProject(project);
    this.currentProject = project;
    this.startAutosave();
    this.notify();
    
    return project;
  }

  async openProject(id: string): Promise<Project | null> {
    const loaded = await this.db.loadProject(id);
    if (!loaded) return null;

    // Migrate forward: a project stored by an older build must still open.
    const project = migrateProject(loaded);
    this.currentProject = project;
    this.isDirty = false;
    this.startAutosave();
    this.notify();

    return project;
  }

  async saveProject(): Promise<void> {
    if (!this.currentProject) return;

    await this.db.saveProject(this.currentProject);
    this.isDirty = false;
    this.notify();
  }

  async saveProjectAs(name: string): Promise<Project> {
    if (!this.currentProject) {
      return this.createProject(name);
    }

    // Deep clone via JSON round-trip to prevent nested objects (timeline.clips,
    // media, markers, settings) being shared between the original and the copy.
    // Shallow spread would cause addClip/addMedia to mutate both projects.
    const newProject: Project = {
      ...(JSON.parse(JSON.stringify(this.currentProject)) as Project),
      id: crypto.randomUUID(),
      name,
      created: Date.now(),
      modified: Date.now(),
      version: 1,
    };

    await this.db.saveProject(newProject);
    this.currentProject = newProject;
    this.isDirty = false;
    this.notify();

    return newProject;
  }

  async closeProject(): Promise<void> {
    if (this.isDirty && this.currentProject) {
      await this.saveProject();
    }

    this.stopAutosave();
    this.currentProject = null;
    this.isDirty = false;
    this.notify();
  }

  async deleteProject(id: string): Promise<void> {
    await this.db.deleteProject(id);
    
    if (this.currentProject?.id === id) {
      this.currentProject = null;
      this.stopAutosave();
    }
    
    this.notify();
  }

  async listProjects(): Promise<Project[]> {
    return this.db.listProjects();
  }

  // ============================================================
  // Version Control
  // ============================================================

  async createVersion(name: string): Promise<ProjectVersion | null> {
    if (!this.currentProject) return null;

    const version: ProjectVersion = {
      id: crypto.randomUUID(),
      projectId: this.currentProject.id,
      timestamp: Date.now(),
      name,
      data: JSON.stringify(this.currentProject)
    };

    await this.db.saveVersion(version);
    return version;
  }

  async restoreVersion(versionId: string): Promise<boolean> {
    const versions = await this.getVersions();
    const version = versions.find(v => v.id === versionId);
    
    if (!version) return false;

    try {
      const project = migrateProject(JSON.parse(version.data));
      project.modified = Date.now();
      project.version++;

      this.currentProject = project;
      await this.db.saveProject(project);
      this.notify();

      return true;
    } catch {
      return false;
    }
  }

  async getVersions(): Promise<ProjectVersion[]> {
    if (!this.currentProject) return [];
    return this.db.getVersions(this.currentProject.id);
  }

  // ============================================================
  // Autosave
  // ============================================================

  private startAutosave(): void {
    this.stopAutosave();
    
    // Autosave every 30 seconds
    this.autosaveInterval = window.setInterval(async () => {
      if (this.isDirty && this.currentProject) {
        await this.saveProject();
        // Autosave complete — silent by design
      }
    }, 30000);
  }

  private stopAutosave(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  markDirty(): void {
    this.isDirty = true;
  }

  // ============================================================
  // Export/Import
  // ============================================================

  async exportProject(): Promise<Blob> {
    if (!this.currentProject) {
      throw new Error('No project open');
    }

    const data = JSON.stringify(this.currentProject, null, 2);
    return new Blob([data], { type: 'application/json' });
  }

  async importProject(file: File): Promise<Project> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid project file: ${(err as Error).message}`);
    }
    // Migrate/validate untrusted external project data; refuses newer-schema
    // files and backfills older ones instead of casting blindly.
    const data = migrateProject(parsed);

    // Generate new ID to avoid conflicts
    data.id = crypto.randomUUID();
    data.created = Date.now();
    data.modified = Date.now();

    await this.db.saveProject(data);
    this.currentProject = data;
    this.startAutosave();
    this.notify();

    return data;
  }

  // ============================================================
  // State Access
  // ============================================================

  getCurrentProject(): Project | null {
    return this.currentProject;
  }

  isProjectDirty(): boolean {
    return this.isDirty;
  }

  // ============================================================
  // Timeline Operations
  // ============================================================

  updateTimeline(timeline: Partial<TimelineData>): void {
    if (!this.currentProject) return;

    this.currentProject.timeline = {
      ...this.currentProject.timeline,
      ...timeline
    };
    this.isDirty = true;
    this.notify();
  }

  addClip(clip: ClipData): void {
    if (!this.currentProject) return;

    this.currentProject.timeline.clips.push(clip);
    this.isDirty = true;
    this.notify();
  }

  updateClip(clipId: string, updates: Partial<ClipData>): void {
    if (!this.currentProject) return;

    const clip = this.currentProject.timeline.clips.find(c => c.id === clipId);
    if (clip) {
      Object.assign(clip, updates);
      this.isDirty = true;
      this.notify();
    }
  }

  removeClip(clipId: string): void {
    if (!this.currentProject) return;

    this.currentProject.timeline.clips = this.currentProject.timeline.clips.filter(
      c => c.id !== clipId
    );
    this.isDirty = true;
    this.notify();
  }

  // ============================================================
  // Media Operations
  // ============================================================

  addMedia(media: MediaReference): void {
    if (!this.currentProject) return;

    this.currentProject.media.push(media);
    this.isDirty = true;
    this.notify();
  }

  removeMedia(mediaId: string): void {
    if (!this.currentProject) return;

    this.currentProject.media = this.currentProject.media.filter(m => m.id !== mediaId);
    this.isDirty = true;
    this.notify();
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

export default ProjectManager;
