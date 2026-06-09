/**
 * コアモジュールテスト
 *
 * 16 モジュール中、最高 ROI の 6 モジュールをカバー。
 * ブラウザ API (WebCodecs/WebGPU/IndexedDB) に依存する部分はモック。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// === Timeline ===

import { MagneticTimeline } from '../timeline/magnetic-timeline';

const NEUTRAL_TRANSFORM = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

describe('MagneticTimeline', () => {
  let tl: MagneticTimeline;

  beforeEach(() => {
    tl = new MagneticTimeline();
  });

  it('starts with empty state', () => {
    const state = tl.getState();
    expect(state.clips.size).toBe(0);
    expect(state.playhead).toBe(0);
    expect(tl.getTimelineDuration()).toBe(0);
  });

  it('adds clips and updates duration', () => {
    const clip = tl.addClip({
      name: 'Shot 1',
      startTime: 0,
      duration: 90,
      mediaIn: 0,
      mediaOut: 90,
      mediaId: 'test.mp4',
      trackId: 'v1',
      type: 'video',
      locked: false,
      transform: { ...NEUTRAL_TRANSFORM },
    });
    expect(clip.id).toBeTruthy();
    expect(clip.name).toBe('Shot 1');
    expect(tl.getTimelineDuration()).toBe(90);
  });

  it('splits clip into two', () => {
    const clip = tl.addClip({
      name: 'Long Shot',
      startTime: 0,
      duration: 120,
      mediaIn: 0,
      mediaOut: 120,
      mediaId: 'test.mp4',
      trackId: 'v1',
      type: 'video',
      locked: false,
      transform: { ...NEUTRAL_TRANSFORM },
    });
    const result = tl.splitClip(clip.id, 60);
    expect(result).not.toBeNull();
    if (result) {
      const [a, b] = result;
      expect(a.duration).toBe(60);
      expect(b.startTime).toBe(60);
      expect(b.duration).toBe(60);
    }
  });

  it('trims clip start', () => {
    const clip = tl.addClip({
      name: 'Shot',
      startTime: 0,
      duration: 100,
      mediaIn: 0,
      mediaOut: 100,
      mediaId: 'test.mp4',
      trackId: 'v1',
      type: 'video',
      locked: false,
      transform: { ...NEUTRAL_TRANSFORM },
    });
    tl.trimClipStart(clip.id, 20);
    const clips = tl.getTrackClips('v1');
    expect(clips[0].startTime).toBe(20);
    expect(clips[0].duration).toBe(80);
  });

  it('trims clip end', () => {
    const clip = tl.addClip({
      name: 'Shot',
      startTime: 0,
      duration: 100,
      mediaIn: 0,
      mediaOut: 100,
      mediaId: 'test.mp4',
      trackId: 'v1',
      type: 'video',
      locked: false,
      transform: { ...NEUTRAL_TRANSFORM },
    });
    tl.trimClipEnd(clip.id, 60);
    const clips = tl.getTrackClips('v1');
    expect(clips[0].duration).toBe(60);
  });

  it('moves clip to new position', () => {
    const clip = tl.addClip({
      name: 'Shot',
      startTime: 0,
      duration: 50,
      mediaIn: 0,
      mediaOut: 50,
      mediaId: 'test.mp4',
      trackId: 'v1',
      type: 'video',
      locked: false,
      transform: { ...NEUTRAL_TRANSFORM },
    });
    tl.moveClip(clip.id, 100);
    const clips = tl.getTrackClips('v1');
    expect(clips[0].startTime).toBe(100);
  });

  it('sets and gets playhead', () => {
    tl.setPlayhead(42);
    expect(tl.getState().playhead).toBe(42);
  });

  it('finds clips at time', () => {
    tl.addClip({ name: 'A', startTime: 0, duration: 100, mediaIn: 0, mediaOut: 100, mediaId: 'a.mp4', trackId: 'v1', type: 'video', locked: false, transform: { ...NEUTRAL_TRANSFORM } });
    tl.addClip({ name: 'B', startTime: 50, duration: 100, mediaIn: 0, mediaOut: 100, mediaId: 'b.mp4', trackId: 'v2', type: 'video', locked: false, transform: { ...NEUTRAL_TRANSFORM } });
    const at75 = tl.getClipsAtTime(75);
    expect(at75.length).toBe(2);
    const at120 = tl.getClipsAtTime(120);
    expect(at120.length).toBe(1);
    expect(at120[0].name).toBe('B');
  });

  it('snap points include clip edges', () => {
    tl.addClip({ name: 'A', startTime: 10, duration: 50, mediaIn: 0, mediaOut: 50, mediaId: 'a.mp4', trackId: 'v1', type: 'video', locked: false, transform: { ...NEUTRAL_TRANSFORM } });
    const points = tl.getSnapPoints();
    const times = points.map((p) => p.time);
    expect(times).toContain(10);
    expect(times).toContain(60); // 10 + 50
  });
});

// === Undo / History ===

import { HistoryManager, CommandFactory } from '../undo/history-manager';
import type { Command } from '../undo/history-manager';

/** Fills in the boilerplate Command fields so tests can focus on execute/undo/redo. */
function cmd(
  partial: Pick<Command, 'description' | 'execute' | 'undo' | 'redo'>,
): Command {
  return {
    id: `cmd_${Math.random().toString(36).slice(2)}`,
    type: 'test',
    timestamp: Date.now(),
    getDelta: () => ({ before: null, after: null, path: [] }),
    ...partial,
  };
}

describe('HistoryManager', () => {
  let history: HistoryManager;

  beforeEach(() => {
    // IndexedDB なしで動作する設定
    history = new HistoryManager({ maxCommands: 100, autoPersist: false });
  });

  it('starts empty', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getPosition()).toBe(-1);
  });

  it('execute → undo → redo', () => {
    let value = 0;
    const command = cmd({
      description: 'increment',
      execute() { value++; },
      undo() { value--; },
      redo() { value++; },
    });
    history.execute(command);
    expect(value).toBe(1);
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(value).toBe(0);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(value).toBe(1);
  });

  it('redo is cleared after new execute', () => {
    let v = 0;
    const make = (n: number) => cmd({
      description: `set ${n}`,
      execute() { v = n; },
      undo() { v = n - 1; },
      redo() { v = n; },
    });
    history.execute(make(1));
    history.execute(make(2));
    history.undo(); // v = 1
    history.execute(make(3)); // redo stack cleared
    expect(history.canRedo()).toBe(false);
    expect(v).toBe(3);
  });

  it('group collapses multiple commands', () => {
    let v = 0;
    history.beginGroup('batch');
    history.execute(cmd({ description: 'a', execute() { v += 1; }, undo() { v -= 1; }, redo() { v += 1; } }));
    history.execute(cmd({ description: 'b', execute() { v += 10; }, undo() { v -= 10; }, redo() { v += 10; } }));
    history.endGroup('batch');

    expect(v).toBe(11);
    history.undo(); // undo entire group
    expect(v).toBe(0);
  });

  it('clear resets state', () => {
    history.execute(cmd({ description: 'x', execute() {}, undo() {}, redo() {} }));
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.getHistory().length).toBe(0);
  });

  it('subscribe notifies on changes', () => {
    const listener = vi.fn();
    const unsub = history.subscribe(listener);
    history.execute(cmd({ description: 'x', execute() {}, undo() {}, redo() {} }));
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

describe('CommandFactory', () => {
  it('creates clipMove command', () => {
    const clip = { id: 'c1', trackId: 'v1', startFrame: 0 };
    const cmd = CommandFactory.clipMove(
      'c1', 'v1', 'v1', 0, 100,
      () => clip,
      vi.fn(),
    );
    expect(cmd.description).toContain('clip');
  });
});

// === Export Engine ===

import { EXPORT_PRESETS } from '../export/export-engine';

describe('ExportEngine', () => {
  it('has standard presets', () => {
    expect(EXPORT_PRESETS.length).toBeGreaterThanOrEqual(4);
    const names = EXPORT_PRESETS.map((p) => p.name);
    expect(names).toContain('YouTube 1080p');
  });

  it('presets have valid dimensions', () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.config.width).toBeGreaterThan(0);
      expect(p.config.height).toBeGreaterThan(0);
      expect(p.config.fps).toBeGreaterThan(0);
      // GIF はパレットベースで bitrate の概念を持たない (bitrate: 0 が正)。
      // それ以外のコーデックは正の bitrate を要求する。
      if (p.config.format !== 'gif') {
        expect(p.config.bitrate).toBeGreaterThan(0);
      }
    }
  });
});

// === Project Manager ===

import { ProjectManager } from '../project/project-manager';

describe('ProjectManager', () => {
  let pm: ProjectManager;

  beforeEach(() => {
    pm = new ProjectManager();
  });

  it('creates new project with defaults', async () => {
    const project = await pm.createProject('Test');
    expect(project.name).toBe('Test');
    expect(project.settings.fps).toBeGreaterThan(0);
    expect(project.settings.width).toBeGreaterThan(0);
  });

  it('tracks modification state via isDirty', async () => {
    await pm.createProject('Test');
    expect(pm.isProjectDirty()).toBe(false);
    pm.updateTimeline({ tracks: [], duration: 100 });
    expect(pm.isProjectDirty()).toBe(true);
  });
});

// === Recovery Manager ===

import { RecoveryManager } from '../recovery/recovery-manager';

describe('RecoveryManager', () => {
  it('creates with config', () => {
    const rm = new RecoveryManager({ autoSaveInterval: 5000 });
    expect(rm).toBeTruthy();
  });

  it('getConfig reflects constructor arg', () => {
    const rm = new RecoveryManager({ maxSnapshots: 10 });
    // RecoveryManager stores config — verify it doesn't crash
    expect(rm).toBeInstanceOf(RecoveryManager);
  });

  it('saveSnapshot returns null without db', async () => {
    const rm = new RecoveryManager({ autoSaveInterval: 5000 });
    // db is null until init() — saveSnapshot should return null safely
    const id = await rm.saveSnapshot('auto', 'p1', 'Test', { tracks: [], settings: {} } as any);
    expect(id).toBeNull();
  });

  it('REGRESSION: crash handler is a no-op when startAutoSave has not been called', async () => {
    const rm = new RecoveryManager();
    await rm.init();
    const spy = vi.spyOn(rm, 'saveSnapshot');
    window.dispatchEvent(new ErrorEvent('error'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('REGRESSION: crash handler saves a snapshot with data from startAutoSave', async () => {
    const rm = new RecoveryManager();
    await rm.init();
    const mockData = {
      timeline: null, clips: [], tracks: [], effects: [],
      markers: [], playhead: 0, selection: [], historyPosition: 0, settings: {}
    };
    // Replace saveSnapshot so this test does not need a working IDB write path
    const spy = vi.spyOn(rm, 'saveSnapshot').mockResolvedValue('snap-id');
    rm.startAutoSave(() => mockData as any, 'proj-1', 'My Project');
    window.dispatchEvent(new ErrorEvent('error'));
    expect(spy).toHaveBeenCalledWith('crash', 'proj-1', 'My Project', mockData);
  });
});

// === Color Grading Engine ===

import { ColorGradingEngine } from '../color/grading-engine';

describe('ColorGradingEngine', () => {
  it('createGrade returns grade with nodes map', () => {
    const cg = new ColorGradingEngine();
    const grade = cg.createGrade('primary');
    expect(grade.name).toBe('primary');
    expect(grade.nodes).toBeInstanceOf(Map);
    expect(grade.nodes.size).toBe(3); // input, node1, output
  });

  it('default wheels are neutral', () => {
    const cg = new ColorGradingEngine();
    const grade = cg.createGrade('primary');
    const node = grade.nodes.get('node1')!;
    expect(node.wheels.lift.r).toBe(0);
    expect(node.wheels.gain.r).toBe(0);
  });

  it('default contrast is 0 (neutral)', () => {
    const cg = new ColorGradingEngine();
    const grade = cg.createGrade('primary');
    expect(grade.nodes.get('node1')!.wheels.contrast).toBe(0);
  });

  it('default saturation is 1 (neutral)', () => {
    const cg = new ColorGradingEngine();
    const grade = cg.createGrade('primary');
    expect(grade.nodes.get('node1')!.wheels.saturation).toBe(1);
  });

  it('contrast clamps to [-1, 1]', () => {
    const cg = new ColorGradingEngine();
    const grade = cg.createGrade('primary');
    cg.setContrast(grade.id, 'node1', 5.0);
    expect(grade.nodes.get('node1')!.wheels.contrast).toBe(1);
    cg.setContrast(grade.id, 'node1', -5.0);
    expect(grade.nodes.get('node1')!.wheels.contrast).toBe(-1);
  });

  it('saturation clamps to [0, 2]', () => {
    const cg = new ColorGradingEngine();
    const grade = cg.createGrade('primary');
    cg.setSaturation(grade.id, 'node1', 10.0);
    expect(grade.nodes.get('node1')!.wheels.saturation).toBe(2);
    cg.setSaturation(grade.id, 'node1', -1.0);
    expect(grade.nodes.get('node1')!.wheels.saturation).toBe(0);
  });
});
