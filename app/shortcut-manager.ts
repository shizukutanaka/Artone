/**
 * Artone v3 — Shortcut Manager
 *
 * キーボードショートカット管理
 * - カスタマイズ可能
 * - プリセット (Premiere/FCP/DaVinci)
 * - コンフリクト検出
 * - コンテキスト別ショートカット
 *
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

/** i18n key constants for shortcut categories. */
export const SHORTCUT_CATEGORY_KEYS = {
  playback: 'shortcut.category.playback',
  edit:     'shortcut.category.edit',
  timeline: 'shortcut.category.timeline',
  tools:    'shortcut.category.tools',
  file:     'shortcut.category.file',
  view:     'shortcut.category.view',
  multicam: 'shortcut.category.multicam',
} as const;

export type ShortcutCategoryKey = typeof SHORTCUT_CATEGORY_KEYS[keyof typeof SHORTCUT_CATEGORY_KEYS];

export interface Shortcut {
  id: string;
  action: string;
  key: string;
  modifiers: ShortcutModifiers;
  context: ShortcutContext;
  /** i18n key, e.g. `shortcut.action.play` — call `t(shortcut.description)` to display. */
  description: string;
  /** i18n key for category, e.g. `shortcut.category.playback` — call `t(shortcut.category)` to display. */
  category: ShortcutCategoryKey;
  customized: boolean;
}

export interface ShortcutModifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;  // Cmd on Mac
}

export type ShortcutContext = 
  | 'global' | 'timeline' | 'preview' | 'media' 
  | 'color' | 'audio' | 'effects' | 'text';

export interface ShortcutPreset {
  id: string;
  name: string;
  description: string;
  shortcuts: Map<string, Partial<Shortcut>>;
}

export interface ShortcutConflict {
  existing: Shortcut;
  new: Shortcut;
  resolution: 'replace' | 'keep' | 'none';
}

// ============================================================
// Default Shortcuts
// ============================================================

const C = SHORTCUT_CATEGORY_KEYS;

const DEFAULT_SHORTCUTS: Omit<Shortcut, 'id' | 'customized'>[] = [
  // Playback
  { action: 'play',         key: 'Space',      modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.play',          category: C.playback },
  { action: 'stop',         key: 'KeyK',       modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.stop',          category: C.playback },
  { action: 'frameForward', key: 'ArrowRight', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.frameForward',  category: C.playback },
  { action: 'frameBack',    key: 'ArrowLeft',  modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.frameBack',     category: C.playback },
  { action: 'forward10',    key: 'ArrowRight', modifiers: { ctrl: false, shift: true,  alt: false, meta: false }, context: 'global',   description: 'shortcut.action.forward10',     category: C.playback },
  { action: 'back10',       key: 'ArrowLeft',  modifiers: { ctrl: false, shift: true,  alt: false, meta: false }, context: 'global',   description: 'shortcut.action.back10',        category: C.playback },
  { action: 'jklJ',         key: 'KeyJ',       modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.jklJ',          category: C.playback },
  { action: 'jklK',         key: 'KeyK',       modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.jklK',          category: C.playback },
  { action: 'jklL',         key: 'KeyL',       modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.jklL',          category: C.playback },
  { action: 'goToStart',    key: 'Home',       modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.goToStart',     category: C.playback },
  { action: 'goToEnd',      key: 'End',        modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.goToEnd',       category: C.playback },

  // Editing
  { action: 'cut',          key: 'KeyX',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.cut',          category: C.edit },
  { action: 'copy',         key: 'KeyC',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.copy',         category: C.edit },
  { action: 'paste',        key: 'KeyV',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.paste',        category: C.edit },
  { action: 'delete',       key: 'Delete', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.delete',       category: C.edit },
  { action: 'rippleDelete', key: 'Delete', modifiers: { ctrl: false, shift: true,  alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.rippleDelete', category: C.edit },
  { action: 'undo',         key: 'KeyZ',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.undo',         category: C.edit },
  { action: 'redo',         key: 'KeyZ',   modifiers: { ctrl: true,  shift: true,  alt: false, meta: false }, context: 'global',   description: 'shortcut.action.redo',         category: C.edit },
  { action: 'selectAll',    key: 'KeyA',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.selectAll',    category: C.edit },
  { action: 'deselect',     key: 'Escape', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.deselect',     category: C.edit },
  { action: 'split',        key: 'KeyB',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.split',        category: C.edit },
  { action: 'lift',         key: 'Semicolon', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.lift',      category: C.edit },
  { action: 'extract',      key: 'Quote',  modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.extract',      category: C.edit },
  { action: 'duplicate',    key: 'KeyD',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'global',   description: 'shortcut.action.duplicate',    category: C.edit },

  // Timeline
  { action: 'setInPoint',  key: 'KeyI',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.setInPoint',  category: C.timeline },
  { action: 'setOutPoint', key: 'KeyO',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.setOutPoint', category: C.timeline },
  { action: 'clearInOut',  key: 'KeyG',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.clearInOut',  category: C.timeline },
  { action: 'zoomIn',      key: 'Equal',  modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.zoomIn',      category: C.timeline },
  { action: 'zoomOut',     key: 'Minus',  modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.zoomOut',     category: C.timeline },
  { action: 'zoomFit',     key: 'Digit0', modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.zoomFit',     category: C.timeline },
  { action: 'addMarker',   key: 'KeyM',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.addMarker',   category: C.timeline },
  { action: 'nextMarker',  key: 'KeyM',   modifiers: { ctrl: false, shift: true,  alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.nextMarker',  category: C.timeline },
  { action: 'prevMarker',  key: 'KeyM',   modifiers: { ctrl: true,  shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.prevMarker',  category: C.timeline },
  { action: 'snapToggle',  key: 'KeyS',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.snapToggle',  category: C.timeline },

  // Tools
  { action: 'toolSelect', key: 'KeyV', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.toolSelect', category: C.tools },
  { action: 'toolRazor',  key: 'KeyC', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.toolRazor',  category: C.tools },
  { action: 'toolSlip',   key: 'KeyY', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.toolSlip',   category: C.tools },
  { action: 'toolSlide',  key: 'KeyU', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.toolSlide',  category: C.tools },
  { action: 'toolRoll',   key: 'KeyN', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.toolRoll',   category: C.tools },
  { action: 'toolRipple', key: 'KeyB', modifiers: { ctrl: false, shift: true,  alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.toolRipple', category: C.tools },

  // File
  { action: 'newProject', key: 'KeyN', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'shortcut.action.newProject', category: C.file },
  { action: 'open',       key: 'KeyO', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'shortcut.action.open',       category: C.file },
  { action: 'save',       key: 'KeyS', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'shortcut.action.save',       category: C.file },
  { action: 'saveAs',     key: 'KeyS', modifiers: { ctrl: true, shift: true,  alt: false, meta: false }, context: 'global', description: 'shortcut.action.saveAs',     category: C.file },
  { action: 'import',     key: 'KeyI', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'shortcut.action.import',     category: C.file },
  { action: 'export',     key: 'KeyE', modifiers: { ctrl: true, shift: true,  alt: false, meta: false }, context: 'global', description: 'shortcut.action.export',     category: C.file },

  // View
  { action: 'fullscreen',      key: 'KeyF', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'preview', description: 'shortcut.action.fullscreen',      category: C.view },
  { action: 'toggleTimeline',  key: 'F5',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',  description: 'shortcut.action.toggleTimeline',  category: C.view },
  { action: 'toggleMedia',     key: 'F6',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',  description: 'shortcut.action.toggleMedia',     category: C.view },
  { action: 'toggleInspector', key: 'F7',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',  description: 'shortcut.action.toggleInspector', category: C.view },
  { action: 'toggleEffects',   key: 'F8',   modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global',  description: 'shortcut.action.toggleEffects',   category: C.view },

  // Multi-cam
  { action: 'cam1', key: 'Digit1', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam1', category: C.multicam },
  { action: 'cam2', key: 'Digit2', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam2', category: C.multicam },
  { action: 'cam3', key: 'Digit3', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam3', category: C.multicam },
  { action: 'cam4', key: 'Digit4', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam4', category: C.multicam },
  { action: 'cam5', key: 'Digit5', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam5', category: C.multicam },
  { action: 'cam6', key: 'Digit6', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam6', category: C.multicam },
  { action: 'cam7', key: 'Digit7', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam7', category: C.multicam },
  { action: 'cam8', key: 'Digit8', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam8', category: C.multicam },
  { action: 'cam9', key: 'Digit9', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'shortcut.action.cam9', category: C.multicam },
];

// ============================================================
// Presets
// ============================================================

const PREMIERE_OVERRIDES: Array<[string, Partial<Shortcut>]> = [
  ['split', { key: 'KeyC', modifiers: { ctrl: true, shift: false, alt: false, meta: false } }],
  ['rippleDelete', { key: 'Delete', modifiers: { ctrl: false, shift: false, alt: true, meta: false } }],
];

const FCP_OVERRIDES: Array<[string, Partial<Shortcut>]> = [
  ['split', { key: 'KeyB', modifiers: { ctrl: false, shift: false, alt: false, meta: true } }],
  ['setInPoint', { key: 'KeyI', modifiers: { ctrl: false, shift: false, alt: false, meta: false } }],
  ['setOutPoint', { key: 'KeyO', modifiers: { ctrl: false, shift: false, alt: false, meta: false } }],
];

const DAVINCI_OVERRIDES: Array<[string, Partial<Shortcut>]> = [
  ['split', { key: 'Backslash', modifiers: { ctrl: true, shift: false, alt: false, meta: false } }],
  ['rippleDelete', { key: 'Backspace', modifiers: { ctrl: false, shift: true, alt: false, meta: false } }],
];

// ============================================================
// Shortcut Manager
// ============================================================

export class ShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private activeContext: ShortcutContext = 'global';
  private callbacks: Map<string, () => void> = new Map();
  private listeners: Set<() => void> = new Set();
  private enabled = true;
  /** Stored so the same reference can be passed to removeEventListener(). */
  private readonly _boundKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this._boundKeyDown = this.handleKeyDown.bind(this);
    this.loadDefaults();
    this.setupEventListener();
  }

  /** Remove the document keydown listener and clear all registered callbacks. */
  dispose(): void {
    document.removeEventListener('keydown', this._boundKeyDown);
    this.callbacks.clear();
    this.listeners.clear();
  }

  private loadDefaults(): void {
    for (const shortcut of DEFAULT_SHORTCUTS) {
      const full: Shortcut = {
        ...shortcut,
        id: crypto.randomUUID(),
        customized: false
      };
      this.shortcuts.set(shortcut.action, full);
    }
  }

  private setupEventListener(): void {
    document.addEventListener('keydown', this._boundKeyDown);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;
    
    // Ignore if in input field
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const shortcut = this.findMatchingShortcut(event);
    if (shortcut) {
      const callback = this.callbacks.get(shortcut.action);
      if (callback) {
        event.preventDefault();
        callback();
      }
    }
  }

  private findMatchingShortcut(event: KeyboardEvent): Shortcut | null {
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.context !== 'global' && shortcut.context !== this.activeContext) {
        continue;
      }

      if (shortcut.key !== event.code && shortcut.key !== event.key) {
        continue;
      }

      const mods = shortcut.modifiers;
      if (mods.ctrl !== (event.ctrlKey || event.metaKey)) continue;
      if (mods.shift !== event.shiftKey) continue;
      if (mods.alt !== event.altKey) continue;

      return shortcut;
    }
    return null;
  }

  // ============================================================
  // Public API
  // ============================================================

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setContext(context: ShortcutContext): void {
    this.activeContext = context;
  }

  registerCallback(action: string, callback: () => void): void {
    this.callbacks.set(action, callback);
  }

  unregisterCallback(action: string): void {
    this.callbacks.delete(action);
  }

  // ============================================================
  // Shortcut Management
  // ============================================================

  getShortcut(action: string): Shortcut | undefined {
    return this.shortcuts.get(action);
  }

  getAllShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  getShortcutsByCategory(category: string): Shortcut[] {
    return Array.from(this.shortcuts.values()).filter(s => s.category === category);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const shortcut of this.shortcuts.values()) {
      categories.add(shortcut.category);
    }
    return Array.from(categories).sort();
  }

  updateShortcut(action: string, key: string, modifiers: Partial<ShortcutModifiers>): ShortcutConflict | null {
    const shortcut = this.shortcuts.get(action);
    if (!shortcut) return null;

    const newMods: ShortcutModifiers = {
      ctrl: modifiers.ctrl ?? false,
      shift: modifiers.shift ?? false,
      alt: modifiers.alt ?? false,
      meta: modifiers.meta ?? false
    };

    // Check for conflicts
    const conflict = this.findConflict(key, newMods, shortcut.context, action);
    if (conflict) {
      return {
        existing: conflict,
        new: { ...shortcut, key, modifiers: newMods },
        resolution: 'none'
      };
    }

    shortcut.key = key;
    shortcut.modifiers = newMods;
    shortcut.customized = true;
    this.notify();

    return null;
  }

  private findConflict(
    key: string, 
    modifiers: ShortcutModifiers, 
    context: ShortcutContext,
    excludeAction?: string
  ): Shortcut | null {
    for (const shortcut of this.shortcuts.values()) {
      if (excludeAction && shortcut.action === excludeAction) continue;
      if (shortcut.context !== 'global' && shortcut.context !== context && context !== 'global') continue;

      if (shortcut.key === key &&
          shortcut.modifiers.ctrl === modifiers.ctrl &&
          shortcut.modifiers.shift === modifiers.shift &&
          shortcut.modifiers.alt === modifiers.alt &&
          shortcut.modifiers.meta === modifiers.meta) {
        return shortcut;
      }
    }
    return null;
  }

  resetShortcut(action: string): void {
    const defaultShortcut = DEFAULT_SHORTCUTS.find(s => s.action === action);
    if (!defaultShortcut) return;

    const shortcut = this.shortcuts.get(action);
    if (shortcut) {
      shortcut.key = defaultShortcut.key;
      shortcut.modifiers = { ...defaultShortcut.modifiers };
      shortcut.customized = false;
      this.notify();
    }
  }

  resetAll(): void {
    this.shortcuts.clear();
    this.loadDefaults();
    this.notify();
  }

  // ============================================================
  // Presets
  // ============================================================

  applyPreset(presetId: 'premiere' | 'fcp' | 'davinci' | 'default'): void {
    this.resetAll();

    let overrides: Array<[string, Partial<Shortcut>]> = [];
    switch (presetId) {
      case 'premiere':
        overrides = PREMIERE_OVERRIDES;
        break;
      case 'fcp':
        overrides = FCP_OVERRIDES;
        break;
      case 'davinci':
        overrides = DAVINCI_OVERRIDES;
        break;
    }

    for (const [action, override] of overrides) {
      const shortcut = this.shortcuts.get(action);
      if (shortcut && override.key && override.modifiers) {
        shortcut.key = override.key;
        shortcut.modifiers = { ...shortcut.modifiers, ...override.modifiers };
        shortcut.customized = true;
      }
    }

    this.notify();
  }

  // ============================================================
  // Import/Export
  // ============================================================

  exportShortcuts(): string {
    const data: Array<{ action: string; key: string; modifiers: ShortcutModifiers }> = [];
    
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.customized) {
        data.push({
          action: shortcut.action,
          key: shortcut.key,
          modifiers: shortcut.modifiers
        });
      }
    }

    return JSON.stringify(data, null, 2);
  }

  importShortcuts(json: string): boolean {
    try {
      const data = JSON.parse(json) as Array<{ action: string; key: string; modifiers: ShortcutModifiers }>;
      
      for (const item of data) {
        const shortcut = this.shortcuts.get(item.action);
        if (shortcut) {
          shortcut.key = item.key;
          shortcut.modifiers = item.modifiers;
          shortcut.customized = true;
        }
      }

      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Display Helpers
  // ============================================================

  formatShortcut(action: string): string {
    const shortcut = this.shortcuts.get(action);
    if (!shortcut) return '';

    const parts: string[] = [];
    const mods = shortcut.modifiers;

    if (mods.ctrl || mods.meta) parts.push('⌘');
    if (mods.shift) parts.push('⇧');
    if (mods.alt) parts.push('⌥');

    // Format key
    let keyDisplay = shortcut.key;
    if (keyDisplay.startsWith('Key')) keyDisplay = keyDisplay.slice(3);
    if (keyDisplay.startsWith('Digit')) keyDisplay = keyDisplay.slice(5);
    if (keyDisplay === 'ArrowLeft') keyDisplay = '←';
    if (keyDisplay === 'ArrowRight') keyDisplay = '→';
    if (keyDisplay === 'ArrowUp') keyDisplay = '↑';
    if (keyDisplay === 'ArrowDown') keyDisplay = '↓';
    if (keyDisplay === 'Space') keyDisplay = '␣';

    parts.push(keyDisplay);

    return parts.join('');
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

export default ShortcutManager;
