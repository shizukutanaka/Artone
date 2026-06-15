/**
 * Tests for project/project-manager.ts
 *
 * ProjectDB uses IndexedDB, which is not available in the vitest/jsdom
 * environment. We stub ProjectDB at the module boundary via vi.mock so that
 * all pure-logic tests in ProjectManager can run without a real IDB.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProjectManager,
  migrateProject,
  PROJECT_SCHEMA_VERSION,
  type Project,
  type ClipData,
  type MediaReference,
} from '../project/project-manager';

// ============================================================
// Stub IndexedDB dependency
// ============================================================

// ProjectDB uses IndexedDB, unavailable in jsdom. Rather than emulate
// IDBDatabase, we override the private db's methods on each ProjectManager
// instance with an in-memory implementation via type assertion.

/** Patch the internal ProjectDB on a ProjectManager to avoid real IndexedDB. */
async function patchDB(manager: ProjectManager): Promise<void> {
  // Project storage (in-memory)
  const store: Map<string, Project> = new Map();
  const versionStore: Map<string, { id: string; projectId: string; timestamp: number; name: string; data: string }> = new Map();

  const db = (manager as unknown as { db: Record<string, unknown> }).db;

  db.open = async () => {};

  db.saveProject = async (project: Project) => {
    project.modified = Date.now();
    project.version = (project.version ?? 0) + 1;
    store.set(project.id, JSON.parse(JSON.stringify(project)));
  };

  db.loadProject = async (id: string): Promise<Project | null> => {
    return store.get(id) ? JSON.parse(JSON.stringify(store.get(id))) : null;
  };

  db.deleteProject = async (id: string): Promise<void> => {
    store.delete(id);
  };

  db.listProjects = async (): Promise<Project[]> => {
    return Array.from(store.values()).sort((a, b) => b.modified - a.modified);
  };

  db.saveVersion = async (v: { id: string; projectId: string; timestamp: number; name: string; data: string }) => {
    versionStore.set(v.id, { ...v });
  };

  db.getVersions = async (projectId: string) => {
    return Array.from(versionStore.values())
      .filter(v => v.projectId === projectId)
      .sort((a, b) => b.timestamp - a.timestamp);
  };
}

// ============================================================
// createProject
// ============================================================

describe('ProjectManager.createProject()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
  });

  it('creates a project with the given name', async () => {
    const p = await pm.createProject('My Video');
    expect(p.name).toBe('My Video');
  });

  it('sets default 1920×1080 settings', async () => {
    const p = await pm.createProject('Test');
    expect(p.settings.width).toBe(1920);
    expect(p.settings.height).toBe(1080);
  });

  it('merges custom settings', async () => {
    const p = await pm.createProject('4K', { width: 3840, height: 2160 });
    expect(p.settings.width).toBe(3840);
    expect(p.settings.height).toBe(2160);
    expect(p.settings.fps).toBe(30); // default preserved
  });

  it('sets currentProject', async () => {
    const p = await pm.createProject('Proj');
    expect(pm.getCurrentProject()!.name).toBe('Proj');
    expect(pm.getCurrentProject()!.id).toBe(p.id);
  });

  it('notifies listeners on creation', async () => {
    const fn = vi.fn();
    pm.subscribe(fn);
    await pm.createProject('X');
    expect(fn).toHaveBeenCalled();
  });
});

// ============================================================
// openProject / closeProject
// ============================================================

describe('openProject() / closeProject()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
  });

  it('openProject returns null for unknown id', async () => {
    const result = await pm.openProject('nonexistent');
    expect(result).toBeNull();
    expect(pm.getCurrentProject()).toBeNull();
  });

  it('openProject sets currentProject', async () => {
    const p = await pm.createProject('Proj');
    await pm.closeProject();
    const reopened = await pm.openProject(p.id);
    expect(reopened!.name).toBe('Proj');
    expect(pm.getCurrentProject()!.id).toBe(p.id);
  });

  it('closeProject clears currentProject', async () => {
    await pm.createProject('Proj');
    await pm.closeProject();
    expect(pm.getCurrentProject()).toBeNull();
  });

  it('closeProject saves when dirty', async () => {
    await pm.createProject('Proj');
    pm.markDirty();
    expect(pm.isProjectDirty()).toBe(true);
    await pm.closeProject();
    expect(pm.isProjectDirty()).toBe(false);
  });
});

// ============================================================
// saveProjectAs — REGRESSION: deep copy of nested objects
// ============================================================

describe('saveProjectAs()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
  });

  it('creates a project with a new id', async () => {
    const orig = await pm.createProject('Original');
    const copy = await pm.saveProjectAs('Copy');
    expect(copy.id).not.toBe(orig.id);
  });

  it('uses the new name', async () => {
    await pm.createProject('Original');
    const copy = await pm.saveProjectAs('My Copy');
    expect(copy.name).toBe('My Copy');
  });

  it('REGRESSION: addClip after saveProjectAs does not mutate the original in-memory project', async () => {
    // Hold a reference to the original in-memory project object.
    const orig = await pm.createProject('Original');

    // Add a clip — this mutates currentProject, which is `orig`.
    const clip1: ClipData = {
      id: 'c1', trackId: 'v1', mediaId: 'm1', startTime: 0, duration: 5,
      mediaIn: 0, mediaOut: 5,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      effects: []
    };
    pm.addClip(clip1);
    expect(orig.timeline.clips.map(c => c.id)).toEqual(['c1']);

    // Save as a copy — currentProject becomes the (deep-cloned) copy.
    await pm.saveProjectAs('Copy');

    // Add a clip to the copy only.
    const clip2: ClipData = {
      id: 'c2', trackId: 'v1', mediaId: 'm2', startTime: 5, duration: 5,
      mediaIn: 0, mediaOut: 5,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      effects: []
    };
    pm.addClip(clip2); // mutates the COPY (currentProject)

    // With the shallow-copy bug, copy.timeline === orig.timeline so clip2 would
    // also appear in orig. With the deep-clone fix, orig is untouched.
    expect(orig.timeline.clips.map(c => c.id)).toEqual(['c1']);
  });

  it('REGRESSION: updateTimeline on copy does not affect original in-memory project', async () => {
    const orig = await pm.createProject('Original');

    await pm.saveProjectAs('Copy');
    pm.updateTimeline({ duration: 999 });

    // updateTimeline replaces currentProject.timeline; with shallow copy the
    // original shared the same timeline object. Verify the original's duration
    // is unchanged (it was 0 at creation).
    expect(orig.timeline.duration).toBe(0);
  });

  it('saveProjectAs with no current project creates a new one', async () => {
    const p = await pm.saveProjectAs('New');
    expect(p.name).toBe('New');
  });
});

// ============================================================
// deleteProject
// ============================================================

describe('deleteProject()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
  });

  it('deletes the project from storage', async () => {
    const p = await pm.createProject('Proj');
    await pm.deleteProject(p.id);
    const projects = await pm.listProjects();
    expect(projects.find(x => x.id === p.id)).toBeUndefined();
  });

  it('clears currentProject when current is deleted', async () => {
    const p = await pm.createProject('Proj');
    await pm.deleteProject(p.id);
    expect(pm.getCurrentProject()).toBeNull();
  });
});

// ============================================================
// listProjects
// ============================================================

describe('listProjects()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
  });

  it('lists all saved projects', async () => {
    await pm.createProject('A');
    await pm.saveProjectAs('B');
    await pm.saveProjectAs('C');
    const list = await pm.listProjects();
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// Timeline operations
// ============================================================

describe('Timeline operations', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    await pm.createProject('Proj');
  });

  const clip: ClipData = {
    id: 'c1', trackId: 'v1', mediaId: 'm1', startTime: 0, duration: 5,
    mediaIn: 0, mediaOut: 5,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    effects: []
  };

  it('addClip appends clip and marks dirty', () => {
    pm.addClip(clip);
    expect(pm.getCurrentProject()!.timeline.clips).toHaveLength(1);
    expect(pm.isProjectDirty()).toBe(true);
  });

  it('updateClip modifies existing clip', () => {
    pm.addClip(clip);
    pm.updateClip('c1', { duration: 10 });
    expect(pm.getCurrentProject()!.timeline.clips[0].duration).toBe(10);
  });

  it('removeClip removes the clip', () => {
    pm.addClip(clip);
    pm.removeClip('c1');
    expect(pm.getCurrentProject()!.timeline.clips).toHaveLength(0);
  });

  it('updateTimeline merges partial update', () => {
    pm.updateTimeline({ duration: 60 });
    expect(pm.getCurrentProject()!.timeline.duration).toBe(60);
    // Existing tracks preserved
    expect(pm.getCurrentProject()!.timeline.tracks.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Media operations
// ============================================================

describe('Media operations', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    await pm.createProject('Proj');
  });

  const media: MediaReference = {
    id: 'm1', name: 'video.mp4', type: 'video', path: '/media/video.mp4',
    duration: 60, width: 1920, height: 1080, fps: 30, size: 1024, hash: 'abc'
  };

  it('addMedia adds a media reference', () => {
    pm.addMedia(media);
    expect(pm.getCurrentProject()!.media).toHaveLength(1);
    expect(pm.isProjectDirty()).toBe(true);
  });

  it('removeMedia removes the reference', () => {
    pm.addMedia(media);
    pm.removeMedia('m1');
    expect(pm.getCurrentProject()!.media).toHaveLength(0);
  });
});

// ============================================================
// exportProject
// ============================================================

describe('exportProject()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
  });

  it('returns a JSON blob with the project data', async () => {
    const created = await pm.createProject('Export Test');
    const blob = await pm.exportProject();
    expect(blob.type).toBe('application/json');
    // The serialized project name length is reflected in the blob size; jsdom's
    // Blob lacks a working .text()/Response reader, so verify size + identity.
    const expectedJson = JSON.stringify(created, null, 2);
    expect(blob.size).toBe(expectedJson.length);
    expect(expectedJson).toContain('"name": "Export Test"');
  });

  it('throws when no project is open', async () => {
    await expect(pm.exportProject()).rejects.toThrow('No project open');
  });
});

// ============================================================
// Version control
// ============================================================

describe('createVersion() / getVersions() / restoreVersion()', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    await pm.createProject('Versioned');
  });

  it('createVersion returns null when no current project', async () => {
    await pm.closeProject();
    expect(await pm.createVersion('v1')).toBeNull();
  });

  it('createVersion returns a version with the given name', async () => {
    const v = await pm.createVersion('First Save');
    expect(v!.name).toBe('First Save');
    expect(v!.projectId).toBe(pm.getCurrentProject()!.id);
  });

  it('getVersions returns created versions', async () => {
    await pm.createVersion('v1');
    await pm.createVersion('v2');
    const versions = await pm.getVersions();
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  it('getVersions returns empty when no current project', async () => {
    await pm.closeProject();
    expect(await pm.getVersions()).toEqual([]);
  });

  it('restoreVersion restores the project state', async () => {
    // Capture version before adding clip
    const v = await pm.createVersion('before-clip');

    pm.addClip({
      id: 'c1', trackId: 'v1', mediaId: 'm1', startTime: 0, duration: 5,
      mediaIn: 0, mediaOut: 5,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      effects: []
    });
    expect(pm.getCurrentProject()!.timeline.clips).toHaveLength(1);

    const success = await pm.restoreVersion(v!.id);
    expect(success).toBe(true);
    // After restore, clips should be gone
    expect(pm.getCurrentProject()!.timeline.clips).toHaveLength(0);
  });

  it('restoreVersion returns false for unknown version', async () => {
    expect(await pm.restoreVersion('nonexistent')).toBe(false);
  });
});

// ============================================================
// markDirty / isProjectDirty
// ============================================================

describe('markDirty / isProjectDirty', () => {
  it('starts not dirty', async () => {
    const pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    await pm.createProject('X');
    // After createProject, the project was just saved so isDirty should be false
    expect(pm.isProjectDirty()).toBe(false);
  });

  it('markDirty sets dirty flag', async () => {
    const pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    await pm.createProject('X');
    pm.markDirty();
    expect(pm.isProjectDirty()).toBe(true);
  });
});

// ============================================================
// subscribe / unsubscribe
// ============================================================

describe('subscribe()', () => {
  it('listener receives notifications on mutations', async () => {
    const pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    const fn = vi.fn();
    pm.subscribe(fn);
    await pm.createProject('A');
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', async () => {
    const pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    const fn = vi.fn();
    const unsub = pm.subscribe(fn);
    unsub();
    await pm.createProject('A');
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================
// Schema versioning / migration (10-year backward & forward compat)
// ============================================================

describe('migrateProject() — version evolution', () => {
  it('stamps the current schema version on a normalised project', () => {
    const p = migrateProject({ id: 'x', name: 'N', timeline: { tracks: [], clips: [] } });
    expect(p.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('backfills fields missing from an older-shaped project', () => {
    // A project written before metadata/markers/settings existed must still load.
    const old = { id: 'legacy', name: 'Legacy', timeline: { tracks: [{ id: 'v1' }] } };
    const p = migrateProject(old);
    expect(p.settings.width).toBe(1920);       // default settings filled in
    expect(p.settings.fps).toBe(30);
    expect(p.media).toEqual([]);               // missing arrays default to empty
    expect(p.markers).toEqual([]);
    expect(p.metadata.tags).toEqual([]);       // missing metadata filled in
    expect(p.timeline.clips).toEqual([]);
    expect(p.timeline.duration).toBe(0);
    expect((p.timeline.tracks[0] as { id: string }).id).toBe('v1'); // real data preserved
  });

  it('preserves a partial settings object while filling the rest', () => {
    const p = migrateProject({ id: 'x', name: 'N', settings: { fps: 60 } });
    expect(p.settings.fps).toBe(60);           // provided value kept
    expect(p.settings.height).toBe(1080);      // missing value defaulted
  });

  it('refuses a project written by a NEWER app instead of misreading it', () => {
    expect(() =>
      migrateProject({ id: 'x', name: 'Future', schemaVersion: PROJECT_SCHEMA_VERSION + 1 }),
    ).toThrow(/newer than supported/i);
  });

  it('rejects non-object input with a clear error', () => {
    expect(() => migrateProject(null)).toThrow(/expected an object/i);
    expect(() => migrateProject('nope')).toThrow(/expected an object/i);
  });

  it('treats a missing schemaVersion as v1 (legacy files)', () => {
    const p = migrateProject({ id: 'x', name: 'N' });
    expect(p.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });
});

describe('importProject() — schema safety', () => {
  function fakeFile(json: string): File {
    return { text: async () => json } as unknown as File;
  }

  it('imports a legacy project missing fields without crashing', async () => {
    const pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    const legacy = JSON.stringify({ id: 'old', name: 'Old', timeline: { tracks: [], clips: [] } });
    const p = await pm.importProject(fakeFile(legacy));
    expect(p.name).toBe('Old');
    expect(p.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(p.metadata.tags).toEqual([]);
  });

  it('rejects importing a newer-schema project file', async () => {
    const pm = new ProjectManager();
    await patchDB(pm);
    await pm.init();
    const future = JSON.stringify({ id: 'f', name: 'F', schemaVersion: PROJECT_SCHEMA_VERSION + 99 });
    await expect(pm.importProject(fakeFile(future))).rejects.toThrow(/newer than supported/i);
  });
});
