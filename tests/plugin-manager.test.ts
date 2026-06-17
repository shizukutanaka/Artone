/**
 * Tests for plugins/plugin-manager.ts
 *
 * Sandbox execution uses Worker, which jsdom does not implement, so those
 * paths are exercised only for their pre-Worker guards. The rest of the
 * surface (registry, queries, effect/transition processing) is pure.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PluginManager,
  lockdownSandboxGlobals,
  type PluginManifest,
} from '../plugins/plugin-manager';

function makeManager(): PluginManager {
  return new PluginManager();
}

const validManifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  author: 'Tester',
  description: 'A test plugin',
  type: 'effect',
  main: 'index.js',
};

// ============================================================
// Built-in plugins
// ============================================================

describe('PluginManager — built-in plugins', () => {
  let pm: PluginManager;
  beforeEach(() => { pm = makeManager(); });

  it('loads built-in effects', () => {
    expect(pm.getPlugin('blur')).toBeDefined();
    expect(pm.getPlugin('sharpen')).toBeDefined();
    expect(pm.getPlugin('vignette')).toBeDefined();
  });

  it('loads built-in transitions', () => {
    expect(pm.getPlugin('dissolve')).toBeDefined();
    expect(pm.getPlugin('wipe-left')).toBeDefined();
  });

  it('getEffects returns only effect plugins', () => {
    const effects = pm.getEffects();
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every(e => e.type === 'effect')).toBe(true);
  });

  it('getTransitions returns only transition plugins', () => {
    const transitions = pm.getTransitions();
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.every(t => t.type === 'transition')).toBe(true);
  });

  it('getEffectCategories returns sorted unique categories', () => {
    const cats = pm.getEffectCategories();
    const sorted = [...cats].sort();
    expect(cats).toEqual(sorted);
    expect(new Set(cats).size).toBe(cats.length);
  });
});

// ============================================================
// installPlugin / uninstallPlugin
// ============================================================

describe('installPlugin()', () => {
  let pm: PluginManager;
  beforeEach(() => { pm = makeManager(); });

  it('installs a valid plugin', async () => {
    const plugin = await pm.installPlugin(validManifest, 'return 1;');
    expect(plugin).not.toBeNull();
    expect(plugin!.id).toBe('my-plugin');
    expect(plugin!.installed).toBe(true);
  });

  it('rejects an invalid manifest', async () => {
    const bad = { ...validManifest, id: '' };
    expect(await pm.installPlugin(bad, 'code')).toBeNull();
  });

  it('rejects a manifest missing main', async () => {
    const bad = { ...validManifest, main: '' };
    expect(await pm.installPlugin(bad, 'code')).toBeNull();
  });

  it('rejects a duplicate plugin id', async () => {
    await pm.installPlugin(validManifest, 'code');
    expect(await pm.installPlugin(validManifest, 'code')).toBeNull();
  });

  it('rejects installing over a built-in id', async () => {
    const collide = { ...validManifest, id: 'blur' };
    expect(await pm.installPlugin(collide, 'code')).toBeNull();
  });

  it('notifies listeners on install', async () => {
    const fn = vi.fn();
    pm.subscribe(fn);
    await pm.installPlugin(validManifest, 'code');
    expect(fn).toHaveBeenCalled();
  });
});

describe('uninstallPlugin()', () => {
  let pm: PluginManager;
  beforeEach(() => { pm = makeManager(); });

  it('uninstalls an installed plugin', async () => {
    await pm.installPlugin(validManifest, 'code');
    expect(pm.uninstallPlugin('my-plugin')).toBe(true);
    expect(pm.getPlugin('my-plugin')).toBeUndefined();
  });

  it('returns false for unknown plugin', () => {
    expect(pm.uninstallPlugin('nonexistent')).toBe(false);
  });

  it('refuses to uninstall a built-in effect', () => {
    expect(pm.uninstallPlugin('blur')).toBe(false);
    expect(pm.getPlugin('blur')).toBeDefined();
  });

  it('refuses to uninstall a built-in transition', () => {
    expect(pm.uninstallPlugin('dissolve')).toBe(false);
  });
});

// ============================================================
// enablePlugin
// ============================================================

describe('enablePlugin()', () => {
  it('toggles the enabled flag', () => {
    const pm = makeManager();
    pm.enablePlugin('blur', false);
    expect(pm.getPlugin('blur')!.enabled).toBe(false);
    pm.enablePlugin('blur', true);
    expect(pm.getPlugin('blur')!.enabled).toBe(true);
  });

  it('disabled effects are excluded from getEffects', () => {
    const pm = makeManager();
    pm.enablePlugin('blur', false);
    expect(pm.getEffects().find(e => e.id === 'blur')).toBeUndefined();
  });
});

// ============================================================
// processEffect / processTransition
// ============================================================

describe('processEffect()', () => {
  it('returns the frame unchanged for unknown effect', () => {
    const pm = makeManager();
    const frame = new ImageData(2, 2);
    expect(pm.processEffect('nonexistent', frame, {})).toBe(frame);
  });

  it('returns frame when effect is disabled', () => {
    const pm = makeManager();
    pm.enablePlugin('blur', false);
    const frame = new ImageData(2, 2);
    expect(pm.processEffect('blur', frame, {})).toBe(frame);
  });

  it('calls the effect process function when enabled', () => {
    const pm = makeManager();
    const frame = new ImageData(2, 2);
    // Built-in blur returns the frame as-is
    expect(pm.processEffect('blur', frame, { radius: 5 })).toBe(frame);
  });
});

describe('processTransition()', () => {
  it('default dissolve blends two frames by progress', () => {
    const pm = makeManager();
    const a = new ImageData(1, 1);
    const b = new ImageData(1, 1);
    a.data[0] = 0; b.data[0] = 100;
    // Unknown transition id → default dissolve path
    const result = pm.processTransition('nonexistent', a, b, 0.5, {});
    expect(result.data[0]).toBeCloseTo(50, 0);
  });

  it('default dissolve at progress 0 equals frameA', () => {
    const pm = makeManager();
    const a = new ImageData(1, 1);
    const b = new ImageData(1, 1);
    a.data[0] = 30; b.data[0] = 200;
    const result = pm.processTransition('nonexistent', a, b, 0, {});
    expect(result.data[0]).toBeCloseTo(30, 0);
  });

  it('built-in transition path returns frameA (stub impl)', () => {
    const pm = makeManager();
    const a = new ImageData(1, 1);
    const b = new ImageData(1, 1);
    const result = pm.processTransition('dissolve', a, b, 0.5, {});
    expect(result).toBe(a);
  });
});

// ============================================================
// runPlugin guard
// ============================================================

describe('runPlugin()', () => {
  it('returns null when plugin code is not found', async () => {
    const pm = makeManager();
    expect(await pm.runPlugin('nonexistent', {})).toBeNull();
  });
});

// ============================================================
// dispose
// ============================================================

describe('dispose()', () => {
  it('clears all plugins and listeners', async () => {
    const pm = makeManager();
    await pm.installPlugin(validManifest, 'code');
    pm.dispose();
    expect(pm.getPlugins()).toHaveLength(0);
  });

  it('is safe to call when no sandbox is active', () => {
    const pm = makeManager();
    expect(() => pm.dispose()).not.toThrow();
  });
});

// ============================================================
// subscribe
// ============================================================

describe('subscribe()', () => {
  it('unsubscribe stops notifications', () => {
    const pm = makeManager();
    const fn = vi.fn();
    const unsub = pm.subscribe(fn);
    unsub();
    pm.enablePlugin('blur', false);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================
// executeSandboxed — Worker-based sandbox (security boundary)
// ============================================================
//
// jsdom has no Worker, so we inject a controllable fake to drive each
// resolution path. This is the sandbox the CLAUDE.md mandates: untrusted
// plugin code runs only inside a terminable Worker with a 5s timeout.

type SandboxPrivate = {
  executeSandboxed<T>(code: string, context: Record<string, unknown>): Promise<T>;
  sandboxes: Set<unknown>;
};

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  postMessage(msg: unknown): void { this.posted.push(msg); }
  terminate(): void { this.terminated = true; }
}

describe('PluginManager — executeSandboxed', () => {
  let workers: FakeWorker[];

  beforeEach(() => {
    workers = [];
    vi.stubGlobal('Worker', vi.fn(() => { const w = new FakeWorker(); workers.push(w); return w; }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('resolves with the worker result and clears the sandbox reference', async () => {
    const pm = makeManager() as unknown as SandboxPrivate;
    const p = pm.executeSandboxed<number>('return 1', { a: 1 });
    // Worker created synchronously; code/context forwarded
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([{ code: 'return 1', context: { a: 1 } }]);
    workers[0].onmessage!({ data: { success: true, result: 42 } });
    await expect(p).resolves.toBe(42);
    expect(workers[0].terminated).toBe(true);
    expect(pm.sandboxes.size).toBe(0);
  });

  it('rejects with the plugin error message on { success: false }', async () => {
    const pm = makeManager() as unknown as SandboxPrivate;
    const p = pm.executeSandboxed('boom', {});
    workers[0].onmessage!({ data: { success: false, error: 'plugin blew up' } });
    await expect(p).rejects.toThrow('plugin blew up');
    expect(workers[0].terminated).toBe(true);
    expect(pm.sandboxes.size).toBe(0);
  });

  it('rejects and clears the sandbox on worker onerror', async () => {
    const pm = makeManager() as unknown as SandboxPrivate;
    const p = pm.executeSandboxed('return 1', {});
    workers[0].onerror!({ message: 'worker crashed' });
    await expect(p).rejects.toThrow('worker crashed');
    expect(workers[0].terminated).toBe(true);
    expect(pm.sandboxes.size).toBe(0);
  });

  it('terminates the worker and rejects after the 5s timeout', async () => {
    vi.useFakeTimers();
    const pm = makeManager() as unknown as SandboxPrivate;
    const p = pm.executeSandboxed('while(true){}', {});
    const assertion = expect(p).rejects.toThrow('Plugin execution timeout');
    vi.advanceTimersByTime(5000);
    await assertion;
    expect(workers[0].terminated).toBe(true);
    expect(pm.sandboxes.size).toBe(0);
  });

  it('REGRESSION: dispose() terminates ALL concurrent sandbox workers (not just the last)', () => {
    // Bug: the old code stored a single `sandbox: Worker|null`. When two plugins
    // ran concurrently, the second `this.sandbox = worker` overwrote the first.
    // dispose() then only terminated the second worker — the first kept running,
    // leaking resources and leaving a potential security hole.
    const pm = makeManager() as unknown as SandboxPrivate;
    // Start two concurrent executions — both workers land in sandboxes Set.
    pm.executeSandboxed('a', {}).catch(() => {});
    pm.executeSandboxed('b', {}).catch(() => {});
    expect(workers).toHaveLength(2);
    expect(pm.sandboxes.size).toBe(2);

    // dispose() must terminate both.
    (pm as unknown as PluginManager).dispose();
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].terminated).toBe(true);
    expect(pm.sandboxes.size).toBe(0);
  });

  it('serialises the global lockdown into the worker bootstrap', () => {
    // The Blob source must call lockdownSandboxGlobals so ambient capabilities
    // are stripped before untrusted code runs. Capture the blob parts.
    let blobSource = '';
    vi.stubGlobal('Blob', class {
      constructor(parts: string[]) { blobSource = parts.join(''); }
    });
    const pm = makeManager() as unknown as SandboxPrivate;
    pm.executeSandboxed('return 1', {}).catch(() => { /* never resolved here */ });
    expect(blobSource).toContain('lockdownSandboxGlobals'); // function name survives toString()
    expect(blobSource).toContain('(self)');                  // invoked on the worker scope
    // Lockdown happens after compiling fn but before calling it.
    expect(blobSource.indexOf('new Function')).toBeLessThan(blobSource.indexOf('(self)'));
    expect(blobSource.indexOf('(self)')).toBeLessThan(blobSource.indexOf('fn(context)'));
  });
});

// ============================================================
// lockdownSandboxGlobals — ambient-capability denial (least privilege)
// ============================================================

describe('lockdownSandboxGlobals', () => {
  it('denies network, remote-code-loading and eval capabilities', () => {
    const scope: Record<string, unknown> = {
      fetch: () => 'net', XMLHttpRequest: function () {}, WebSocket: function () {},
      EventSource: function () {}, importScripts: () => 'remote',
      eval: () => 'evil', Function: function () {}, indexedDB: {}, caches: {},
      // a benign capability the plugin is allowed to keep
      postMessage: () => 'ok',
    };
    lockdownSandboxGlobals(scope);
    for (const denied of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
      'importScripts', 'eval', 'Function', 'indexedDB', 'caches']) {
      expect(scope[denied]).toBeUndefined();
    }
    expect(scope.postMessage).toBeTypeOf('function'); // unrelated capability untouched
  });

  it('makes denied globals non-writable (cannot be restored by the plugin)', () => {
    const scope: Record<string, unknown> = { fetch: () => 'net' };
    lockdownSandboxGlobals(scope);
    // A malicious plugin trying to re-assign fetch must not succeed.
    try { scope.fetch = () => 'restored'; } catch { /* strict-mode throw is fine */ }
    expect(scope.fetch).toBeUndefined();
  });

  it('is closure-free so it survives .toString() serialisation', () => {
    const src = lockdownSandboxGlobals.toString();
    // Reconstruct from source (as the worker blob does) and run it.
    const rebuilt = new Function(`return (${src})`)() as typeof lockdownSandboxGlobals;
    const scope: Record<string, unknown> = { fetch: () => 'net' };
    rebuilt(scope);
    expect(scope.fetch).toBeUndefined();
  });
});
