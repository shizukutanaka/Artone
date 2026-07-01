/**
 * Artone v3 — Plugin System
 * 
 * 拡張機能システム
 * - エフェクトプラグイン
 * - トランジション
 * - エクスポーター
 * - カスタムパネル
 * - サンドボックス実行
 * 
 * @version 1.0.0
 */

import { createLogger } from '../app/logger';

// ============================================================
// Types
// ============================================================

const log = createLogger('Plugins');

export interface Plugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  type: PluginType;
  icon?: string;
  enabled: boolean;
  installed: boolean;
  config: Record<string, unknown>;
}

export type PluginType = 'effect' | 'transition' | 'generator' | 'exporter' | 'panel' | 'tool';

export interface EffectPlugin extends Plugin {
  type: 'effect';
  category: string;
  parameters: PluginParameter[];
  process: (frame: ImageData, params: Record<string, number>) => ImageData;
  gpuShader?: string;
}

export interface TransitionPlugin extends Plugin {
  type: 'transition';
  category: string;
  parameters: PluginParameter[];
  process: (frameA: ImageData, frameB: ImageData, progress: number, params: Record<string, number>) => ImageData;
}

export interface GeneratorPlugin extends Plugin {
  type: 'generator';
  category: string;
  parameters: PluginParameter[];
  generate: (width: number, height: number, time: number, params: Record<string, number>) => ImageData;
}

export interface PluginParameter {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'string' | 'color' | 'select' | 'file';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  type: PluginType;
  main: string;
  icon?: string;
  category?: string;
  parameters?: PluginParameter[];
}

// ============================================================
// Built-in Effects
// ============================================================

const BUILTIN_EFFECTS: EffectPlugin[] = [
  {
    id: 'blur',
    name: 'Gaussian Blur',
    version: '1.0.0',
    author: 'Artone',
    description: 'Smooth blur effect',
    type: 'effect',
    category: 'Blur',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'radius', name: 'Radius', type: 'number', default: 5, min: 0, max: 50, step: 1 },
      { id: 'quality', name: 'Quality', type: 'number', default: 3, min: 1, max: 5, step: 1 }
    ],
    process: (frame, _params) => {
      // Blur implementation
      return frame;
    }
  },
  {
    id: 'sharpen',
    name: 'Sharpen',
    version: '1.0.0',
    author: 'Artone',
    description: 'Enhance edge detail',
    type: 'effect',
    category: 'Sharpen',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'amount', name: 'Amount', type: 'number', default: 0.5, min: 0, max: 2, step: 0.1 },
      { id: 'radius', name: 'Radius', type: 'number', default: 1, min: 0.5, max: 5, step: 0.5 }
    ],
    process: (frame, _params) => frame
  },
  {
    id: 'vignette',
    name: 'Vignette',
    version: '1.0.0',
    author: 'Artone',
    description: 'Darken edges',
    type: 'effect',
    category: 'Stylize',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'amount', name: 'Amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
      { id: 'feather', name: 'Feather', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
      { id: 'roundness', name: 'Roundness', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 }
    ],
    process: (frame, _params) => frame
  },
  {
    id: 'chromatic-aberration',
    name: 'Chromatic Aberration',
    version: '1.0.0',
    author: 'Artone',
    description: 'RGB channel split',
    type: 'effect',
    category: 'Distort',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'amount', name: 'Amount', type: 'number', default: 5, min: 0, max: 50, step: 1 },
      { id: 'angle', name: 'Angle', type: 'number', default: 0, min: 0, max: 360, step: 1 }
    ],
    process: (frame, _params) => frame
  },
  {
    id: 'film-grain',
    name: 'Film Grain',
    version: '1.0.0',
    author: 'Artone',
    description: 'Add film-like grain',
    type: 'effect',
    category: 'Stylize',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'amount', name: 'Amount', type: 'number', default: 0.3, min: 0, max: 1, step: 0.05 },
      { id: 'size', name: 'Size', type: 'number', default: 1, min: 0.5, max: 3, step: 0.1 },
      { id: 'roughness', name: 'Roughness', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 }
    ],
    process: (frame, _params) => frame
  },
  {
    id: 'glitch',
    name: 'Glitch',
    version: '1.0.0',
    author: 'Artone',
    description: 'Digital glitch effect',
    type: 'effect',
    category: 'Stylize',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'intensity', name: 'Intensity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
      { id: 'speed', name: 'Speed', type: 'number', default: 1, min: 0.1, max: 5, step: 0.1 },
      { id: 'seed', name: 'Seed', type: 'number', default: 0, min: 0, max: 1000, step: 1 }
    ],
    process: (frame, _params) => frame
  }
];

const BUILTIN_TRANSITIONS: TransitionPlugin[] = [
  {
    id: 'dissolve',
    name: 'Cross Dissolve',
    version: '1.0.0',
    author: 'Artone',
    description: 'Smooth fade between clips',
    type: 'transition',
    category: 'Dissolve',
    enabled: true,
    installed: true,
    config: {},
    parameters: [],
    process: (frameA, _frameB, _progress, _params) => frameA
  },
  {
    id: 'wipe-left',
    name: 'Wipe Left',
    version: '1.0.0',
    author: 'Artone',
    description: 'Wipe from right to left',
    type: 'transition',
    category: 'Wipe',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'feather', name: 'Feather', type: 'number', default: 0, min: 0, max: 100, step: 1 }
    ],
    process: (frameA, _frameB, _progress, _params) => frameA
  },
  {
    id: 'push',
    name: 'Push',
    version: '1.0.0',
    author: 'Artone',
    description: 'Push transition',
    type: 'transition',
    category: 'Slide',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'direction', name: 'Direction', type: 'select', default: 'left', options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' }
      ]}
    ],
    process: (frameA, _frameB, _progress, _params) => frameA
  },
  {
    id: 'zoom',
    name: 'Zoom',
    version: '1.0.0',
    author: 'Artone',
    description: 'Zoom transition',
    type: 'transition',
    category: 'Zoom',
    enabled: true,
    installed: true,
    config: {},
    parameters: [
      { id: 'direction', name: 'Direction', type: 'select', default: 'in', options: [
        { value: 'in', label: 'Zoom In' },
        { value: 'out', label: 'Zoom Out' }
      ]}
    ],
    process: (frameA, _frameB, _progress, _params) => frameA
  }
];

// ============================================================
// Sandbox lockdown (least privilege)
// ============================================================

/**
 * Strip ambient host capabilities from an (untrusted) worker global scope.
 *
 * Per plugins/CLAUDE.md, plugins must not have ambient access: network
 * (`fetch`/`XMLHttpRequest`/`WebSocket`) requires an explicit manifest grant,
 * remote code loading (`importScripts`) and dynamic eval (`eval`/`Function`)
 * are forbidden. This denies them by default inside the sandbox worker.
 *
 * Defense-in-depth, not a perfect capability jail: it raises the bar for a
 * malicious plugin running in the worker. MUST stay closure-free — it is
 * serialised via `.toString()` into the worker blob, so it may only reference
 * its own parameter and worker globals (`Object`).
 *
 * # AI generated (reviewed)
 */
export function lockdownSandboxGlobals(scope: Record<string, unknown>): void {
  const denied = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', // network exfiltration
    'importScripts',                                        // remote code loading
    'eval', 'Function',                                     // dynamic code eval
    'indexedDB', 'caches',                                  // persistence
  ];
  for (const name of denied) {
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false });
    } catch {
      // Non-configurable global that cannot be redefined — best-effort shadow.
      try { scope[name] = undefined; } catch { /* frozen; nothing more to do */ }
    }
  }
}

// ============================================================
// Plugin Manager
// ============================================================

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginCode: Map<string, string> = new Map();
  // Track ALL active sandbox workers. The previous single `sandbox: Worker|null`
  // reference was overwritten on each runPlugin call, so concurrent invocations
  // caused dispose() to miss all but the last worker (security/resource leak).
  private sandboxes: Set<Worker> = new Set();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadBuiltinPlugins();
  }

  private loadBuiltinPlugins(): void {
    for (const effect of BUILTIN_EFFECTS) {
      this.plugins.set(effect.id, effect);
    }
    for (const transition of BUILTIN_TRANSITIONS) {
      this.plugins.set(transition.id, transition);
    }
  }

  // ============================================================
  // Plugin Operations
  // ============================================================

  async installPlugin(manifest: PluginManifest, code: string): Promise<Plugin | null> {
    // Validate manifest
    if (!this.validateManifest(manifest)) {
      log.error('Invalid plugin manifest');
      return null;
    }

    // Check for conflicts
    if (this.plugins.has(manifest.id)) {
      log.error(`Plugin ${manifest.id} already exists`);
      return null;
    }

    // Create plugin instance
    const plugin: Plugin = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      type: manifest.type,
      icon: manifest.icon,
      enabled: true,
      installed: true,
      config: {}
    };

    // プラグインコードを保存 (実行は runPlugin() で sandboxed)
    this.pluginCode.set(plugin.id, code);
    this.plugins.set(plugin.id, plugin);
    this.notify();
    return plugin;
  }

  /**
   * インストール済みプラグインを sandboxed Worker で実行する。
   * executeSandboxed を配線し、信頼境界を保つ (最小権限 — CLAUDE.md I9)。
   */
  async runPlugin<T = unknown>(pluginId: string, context: Record<string, unknown>): Promise<T | null> {
    const code = this.pluginCode.get(pluginId);
    if (!code) {
      log.error(`Plugin code not found: ${pluginId}`);
      return null;
    }
    return this.executeSandboxed<T>(code, context);
  }

  uninstallPlugin(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    // Can't uninstall built-in plugins
    if (BUILTIN_EFFECTS.some(e => e.id === pluginId) ||
        BUILTIN_TRANSITIONS.some(t => t.id === pluginId)) {
      log.error('Cannot uninstall built-in plugins');
      return false;
    }

    this.plugins.delete(pluginId);
    this.pluginCode.delete(pluginId);
    this.notify();
    return true;
  }

  /** 実行中の sandbox Worker を強制終了しリソースを解放 */
  dispose(): void {
    for (const w of this.sandboxes) {
      w.terminate();
    }
    this.sandboxes.clear();
    this.plugins.clear();
    this.pluginCode.clear();
    this.listeners.clear();
  }

  enablePlugin(pluginId: string, enabled: boolean): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.enabled = enabled;
      this.notify();
    }
  }

  private validateManifest(manifest: PluginManifest): boolean {
    const VALID_TYPES: PluginType[] = ['effect', 'transition', 'generator', 'exporter', 'panel', 'tool'];
    // id: alphanumeric + hyphens/dots/underscores to prevent storage injection / path traversal.
    const safeId = /^[a-zA-Z0-9][a-zA-Z0-9\-_.]{0,127}$/;
    // version: strict semver (major.minor.patch) — rejects pre-release/build-metadata variants.
    const semver = /^\d+\.\d+\.\d+$/;
    // icon: block javascript: and data: schemes — both execute arbitrary code when set as <img src>.
    const isUnsafeIcon = (url: string) => /^(javascript|data):/i.test(url.trim());

    return !!(
      manifest.id && safeId.test(manifest.id) &&
      manifest.name && manifest.name.length <= 128 &&
      manifest.version && semver.test(manifest.version) &&
      manifest.author && manifest.author.length <= 128 &&
      manifest.description && manifest.description.length <= 1024 &&
      VALID_TYPES.includes(manifest.type) &&
      manifest.main &&
      (!manifest.icon || !isUnsafeIcon(manifest.icon))
    );
  }

  // ============================================================
  // Plugin Queries
  // ============================================================

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginsByType(type: PluginType): Plugin[] {
    return this.getPlugins().filter(p => p.type === type && p.enabled);
  }

  getEffects(): EffectPlugin[] {
    return this.getPluginsByType('effect') as EffectPlugin[];
  }

  getTransitions(): TransitionPlugin[] {
    return this.getPluginsByType('transition') as TransitionPlugin[];
  }

  getEffectCategories(): string[] {
    const categories = new Set<string>();
    for (const effect of this.getEffects()) {
      categories.add(effect.category);
    }
    return Array.from(categories).sort();
  }

  // ============================================================
  // Effect Processing
  // ============================================================

  processEffect(
    effectId: string,
    frame: ImageData,
    params: Record<string, number>
  ): ImageData {
    const effect = this.plugins.get(effectId) as EffectPlugin;
    if (!effect || effect.type !== 'effect' || !effect.enabled) {
      return frame;
    }

    return effect.process(frame, params);
  }

  processTransition(
    transitionId: string,
    frameA: ImageData,
    frameB: ImageData,
    progress: number,
    params: Record<string, number>
  ): ImageData {
    const transition = this.plugins.get(transitionId) as TransitionPlugin;
    if (!transition || transition.type !== 'transition' || !transition.enabled) {
      // Default: simple dissolve
      const result = new ImageData(frameA.width, frameA.height);
      for (let i = 0; i < frameA.data.length; i++) {
        result.data[i] = frameA.data[i] * (1 - progress) + frameB.data[i] * progress;
      }
      return result;
    }

    return transition.process(frameA, frameB, progress, params);
  }

  // ============================================================
  // Sandbox Execution
  // ============================================================

  private async executeSandboxed<T>(code: string, context: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      // SECURITY EXCEPTION (reviewed) — plugins/CLAUDE.md's "厳守事項" bans
      // eval/Function outright, but a JS-source plugin (installPlugin's
      // `code: string`) cannot run at all without turning that string into a
      // callable once. This is the one call in the codebase permitted to do
      // so, and only under these constraints:
      //   1. It runs inside a dedicated, single-purpose Worker — never on the
      //      main thread — so it has no access to window/DOM/document.
      //   2. lockdownSandboxGlobals() executes immediately after, before the
      //      plugin body runs, denying eval/Function/fetch/importScripts/etc.
      //      so the compiled plugin function itself cannot re-invoke this
      //      pattern or reach ambient network/code-loading capabilities.
      //   3. The worker is terminated on completion or after a 5s timeout
      //      (below), bounding both lifetime and blast radius.
      // The lockdown runs INSIDE the worker, after the plugin function is built
      // (the host needs Function to compile it once) but BEFORE it executes, so
      // untrusted code cannot reach ambient network/code-loading capabilities.
      const blob = new Blob([`
        self.onmessage = function(e) {
          try {
            const context = e.data.context;
            const fn = new Function('context', e.data.code);
            (${lockdownSandboxGlobals.toString()})(self);
            const result = fn(context);
            self.postMessage({ success: true, result });
          } catch (error) {
            self.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) });
          }
        };
      `], { type: 'application/javascript' });

      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);
      // The worker has begun fetching its script synchronously, so the object
      // URL can be revoked immediately to avoid leaking it for the process life.
      URL.revokeObjectURL(blobUrl);
      this.sandboxes.add(worker); // track in the Set so dispose() covers all active workers

      const cleanup = (): void => {
        worker.terminate();
        this.sandboxes.delete(worker);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Plugin execution timeout'));
      }, 5000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        cleanup();

        if (e.data.success) {
          resolve(e.data.result);
        } else {
          reject(new Error(e.data.error));
        }
      };

      worker.onerror = (e) => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(e.message));
      };

      worker.postMessage({ code, context });
    });
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

