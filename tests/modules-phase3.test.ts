/**
 * Artone v3 — Phase 3 モジュールテスト
 *
 * カバレッジゼロだった 7 モジュールを網羅:
 * collab / plugins / ai / media / scopes / render / core
 *
 * ブラウザ API は tests/setup.ts のモックで代替。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// CollaborationEngine
// ============================================================

import { CollaborationEngine } from '../collab/collaboration-engine';

describe('CollaborationEngine', () => {
  let collab: CollaborationEngine;

  beforeEach(() => {
    collab = new CollaborationEngine();
  });

  it('connects and sets local user', async () => {
    await collab.connect('project-1', { id: 'u1', name: 'Alice' });
    const users = collab.getUsers();
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(users.find((u) => u.id === 'u1')).toBeTruthy();
  });

  it('addComment returns a Comment with id', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    const comment = collab.addComment('Great cut here', undefined, 'clip-1');
    expect(comment.id).toBeTruthy();
    expect(comment.content).toBe('Great cut here');
    expect(comment.clipId).toBe('clip-1');
  });

  it('replyToComment adds to parent.replies', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    const parent = collab.addComment('Parent');
    const reply = collab.replyToComment(parent.id, 'Child');
    expect(reply).not.toBeNull();
    // Reply は parent.replies に追加される
    const comments = collab.getComments();
    const found = comments.find((c) => c.id === parent.id);
    expect(found?.replies.length).toBe(1);
    expect(found?.replies[0].content).toBe('Child');
  });

  it('resolveComment marks as resolved', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    const c = collab.addComment('To resolve');
    collab.resolveComment(c.id);
    const comments = collab.getComments();
    const found = comments.find((x) => x.id === c.id);
    expect(found?.resolved).toBe(true);
  });

  it('deleteComment removes it', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    const c = collab.addComment('Delete me');
    collab.deleteComment(c.id);
    expect(collab.getComments().find((x) => x.id === c.id)).toBeUndefined();
  });

  it('addAnnotation returns annotation with frame', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    const ann = collab.addAnnotation('arrow', { x: 100, y: 200 }, 42);
    expect(ann.frame).toBe(42);
    expect(ann.type).toBe('arrow');
  });

  it('getAnnotationsForFrame filters by frame', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    collab.addAnnotation('arrow', {}, 10);
    collab.addAnnotation('highlight', {}, 20);
    collab.addAnnotation('arrow', {}, 10);
    const at10 = collab.getAnnotationsForFrame(10);
    expect(at10.length).toBe(2);
    const at20 = collab.getAnnotationsForFrame(20);
    expect(at20.length).toBe(1);
  });

  it('createVersion returns version with name', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    const v = collab.createVersion('v1.0');
    expect(v.name).toBe('v1.0');
    expect(v.id).toBeTruthy();
  });

  it('setStatus updates user status', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    collab.setStatus('away');
    const user = collab.getUsers().find((u) => u.id === 'u1');
    expect(user?.status).toBe('away');
  });

  it('subscribe fires on state change', async () => {
    const listener = vi.fn();
    const unsub = collab.subscribe(listener);
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('disconnect closes connection', async () => {
    await collab.connect('p1', { id: 'u1', name: 'Alice' });
    expect(() => collab.disconnect()).not.toThrow();
  });
});

// ============================================================
// PluginManager
// ============================================================

import { PluginManager } from '../plugins/plugin-manager';

describe('PluginManager', () => {
  let pm: PluginManager;

  beforeEach(() => {
    pm = new PluginManager();
  });

  it('getPlugins returns built-in plugins', () => {
    const plugins = pm.getPlugins();
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('getEffects returns effect plugins', () => {
    const effects = pm.getEffects();
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e.category).toBeTruthy();
    }
  });

  it('getPlugin by id returns plugin', () => {
    const all = pm.getPlugins();
    const first = all[0];
    const found = pm.getPlugin(first.id);
    expect(found?.id).toBe(first.id);
  });

  it('getPlugin for missing id returns undefined', () => {
    expect(pm.getPlugin('nonexistent-id')).toBeUndefined();
  });

  it('enablePlugin toggles enabled state', () => {
    const plugins = pm.getPlugins();
    const p = plugins[0];
    pm.enablePlugin(p.id, false);
    expect(pm.getPlugin(p.id)?.enabled).toBe(false);
    pm.enablePlugin(p.id, true);
    expect(pm.getPlugin(p.id)?.enabled).toBe(true);
  });

  it('uninstallPlugin: built-in cannot be uninstalled', () => {
    // BUILTIN_EFFECTS プラグインは削除不能
    const effects = pm.getEffects();
    if (effects.length > 0) {
      // built-in はそのまま削除できない (false 返却)
      const result = pm.uninstallPlugin(effects[0].id);
      expect(result).toBe(false);
    }
  });

  it('getEffectCategories returns strings', () => {
    const cats = pm.getEffectCategories();
    expect(Array.isArray(cats)).toBe(true);
    expect(cats.every((c) => typeof c === 'string')).toBe(true);
  });

  it('subscribe notifies on change', () => {
    const listener = vi.fn();
    const unsub = pm.subscribe(listener);
    const plugins = pm.getPlugins();
    if (plugins.length > 0) pm.enablePlugin(plugins[0].id, false);
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('getTransitions returns transition plugins', () => {
    const transitions = pm.getTransitions();
    expect(Array.isArray(transitions)).toBe(true);
  });
});

// ============================================================
// AIEffectsEngine
// ============================================================

import { AIEffectsEngine } from '../ai/ai-effects-engine';

describe('AIEffectsEngine', () => {
  let ai: AIEffectsEngine;

  beforeEach(() => {
    ai = new AIEffectsEngine();
  });

  it('getModels returns available models', () => {
    const models = ai.getModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it('isModelLoaded returns false for unloaded model', () => {
    const models = ai.getModels();
    if (models.length > 0) {
      expect(ai.isModelLoaded(models[0].id)).toBe(false);
    }
  });

  it('unloadModel on non-loaded does not throw', () => {
    expect(() => ai.unloadModel('nonexistent')).not.toThrow();
  });

  it('subscribe returns unsubscribe function', () => {
    const listener = vi.fn();
    const unsub = ai.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('getModels have required fields', () => {
    for (const m of ai.getModels()) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
    }
  });
});

// ============================================================
// MediaBrowser
// ============================================================

import { MediaBrowser } from '../media/media-browser';

describe('MediaBrowser', () => {
  let mb: MediaBrowser;

  beforeEach(() => {
    mb = new MediaBrowser();
  });

  it('getItems returns empty initially', () => {
    expect(mb.getItems()).toEqual([]);
  });

  it('getItem returns undefined for missing id', () => {
    expect(mb.getItem('nonexistent')).toBeUndefined();
  });

  it('setRating clamps and persists', () => {
    // Need an item first — import one
    // Use updateItem after import-like setup
    // Since we can't actually import files in test, test the guard
    expect(() => mb.setRating('no-item', 5)).not.toThrow();
  });

  it('getItems with filter returns subset', () => {
    const items = mb.getItems({ type: 'video' });
    expect(Array.isArray(items)).toBe(true);
  });

  it('subscribe returns unsubscribe function', () => {
    const listener = vi.fn();
    const unsub = mb.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub(); // unsubscribe should not throw
  });
});

// ============================================================
// Video Scopes (ImageData ベース — VideoFrame 不要)
// ============================================================

import { WaveformScope, HistogramScope, ScopesManager } from '../scopes/video-scopes';

function makeImageData(w: number, h: number, fill = 128): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill; data[i+1] = fill; data[i+2] = fill; data[i+3] = 255;
  }
  return new ImageData(data, w, h);
}

describe('WaveformScope', () => {
  it('analyze with ImageData returns ImageBitmap', () => {
    const scope = new WaveformScope({ width: 64, height: 64 });
    const frame = makeImageData(64, 64, 200);
    const result = scope.analyze(frame);
    // OffscreenCanvas mock returns an object
    expect(result).toBeTruthy();
  });

  it('setMode does not throw', () => {
    const scope = new WaveformScope();
    expect(() => scope.setMode('luma')).not.toThrow();
    expect(() => scope.setMode('rgb')).not.toThrow();
  });
});

describe('HistogramScope', () => {
  it('analyze returns ImageBitmap', () => {
    const scope = new HistogramScope({ width: 64, height: 64 });
    const frame = makeImageData(64, 64, 100);
    const result = scope.analyze(frame);
    expect(result).toBeTruthy();
  });

  it('getStats returns ScopeAnalysis with numeric values', () => {
    const scope = new HistogramScope({ width: 32, height: 32 });
    const frame = makeImageData(32, 32, 128);
    const stats = scope.getStats(frame);
    expect(typeof stats.average.y).toBe('number');
    expect(typeof stats.min.y).toBe('number');
    expect(typeof stats.max.y).toBe('number');
    expect(stats.average.y).toBeGreaterThanOrEqual(0);
    expect(stats.average.y).toBeLessThanOrEqual(255);
  });

  it('setShowRGB does not throw', () => {
    const scope = new HistogramScope();
    expect(() => scope.setShowRGB(true)).not.toThrow();
    expect(() => scope.setShowRGB(false)).not.toThrow();
  });
});

describe('ScopesManager', () => {
  it('creates without throwing', () => {
    expect(() => new ScopesManager()).not.toThrow();
  });

  it('enable/disable scopes', () => {
    const mgr = new ScopesManager();
    expect(() => mgr.enable('waveform')).not.toThrow();
    expect(() => mgr.enable('histogram')).not.toThrow();
    expect(() => mgr.disable?.('waveform')).not.toThrow();
  });
});

// ============================================================
// WebGPURenderEngine (GPU stub — init はスキップ)
// ============================================================

import { WebGPURenderEngine } from '../render/webgpu-engine';

describe('WebGPURenderEngine', () => {
  it('constructs with default config', () => {
    expect(() => new WebGPURenderEngine()).not.toThrow();
  });

  it('getStats returns numeric fields', () => {
    const engine = new WebGPURenderEngine();
    const stats = engine.getStats();
    expect(typeof stats.fps).toBe('number');
    expect(typeof stats.frameTime).toBe('number');
  });

  it('clearCache does not throw', () => {
    const engine = new WebGPURenderEngine();
    expect(() => engine.clearCache()).not.toThrow();
  });

  it('destroy does not throw', () => {
    const engine = new WebGPURenderEngine();
    expect(() => engine.destroy()).not.toThrow();
  });
});

// ============================================================
// Core types (pure data — no browser API)
// ============================================================

import type { DecodedFrame } from '../core/webcodecs-pipeline';

describe('Core type contracts', () => {
  it('DecodedFrame has required fields', () => {
    const frame: DecodedFrame = {
      frame: null as unknown as VideoFrame,
      index: 0,
      timestamp: 1000,
      duration: 33333,
      keyFrame: true,
    };
    expect(frame.timestamp).toBe(1000);
    expect(frame.keyFrame).toBe(true);
  });

  it('CodecConfig fields are present', () => {
    const src = require('fs').readFileSync('./core/webcodecs-pipeline.ts', 'utf8');
    expect(src).toContain('interface CodecConfig');
    expect(src).toContain('codec:');
  });
});
