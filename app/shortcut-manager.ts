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

export interface Shortcut {
  id: string;
  action: string;
  key: string;
  modifiers: ShortcutModifiers;
  context: ShortcutContext;
  description: string;
  category: string;
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

const DEFAULT_SHORTCUTS: Omit<Shortcut, 'id' | 'customized'>[] = [
  // Playback
  { action: 'play', key: 'Space', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Play/Pause', category: 'Playback' },
  { action: 'stop', key: 'KeyK', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Stop', category: 'Playback' },
  { action: 'frameForward', key: 'ArrowRight', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Forward 1 Frame', category: 'Playback' },
  { action: 'frameBack', key: 'ArrowLeft', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Back 1 Frame', category: 'Playback' },
  { action: 'forward10', key: 'ArrowRight', modifiers: { ctrl: false, shift: true, alt: false, meta: false }, context: 'global', description: 'Forward 10 Frames', category: 'Playback' },
  { action: 'back10', key: 'ArrowLeft', modifiers: { ctrl: false, shift: true, alt: false, meta: false }, context: 'global', description: 'Back 10 Frames', category: 'Playback' },
  { action: 'jklJ', key: 'KeyJ', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Reverse Play', category: 'Playback' },
  { action: 'jklK', key: 'KeyK', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Pause', category: 'Playback' },
  { action: 'jklL', key: 'KeyL', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Forward Play', category: 'Playback' },
  { action: 'goToStart', key: 'Home', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Go to Start', category: 'Playback' },
  { action: 'goToEnd', key: 'End', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Go to End', category: 'Playback' },

  // Editing
  { action: 'cut', key: 'KeyX', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Cut', category: 'Edit' },
  { action: 'copy', key: 'KeyC', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Copy', category: 'Edit' },
  { action: 'paste', key: 'KeyV', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Paste', category: 'Edit' },
  { action: 'delete', key: 'Delete', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Delete', category: 'Edit' },
  { action: 'rippleDelete', key: 'Delete', modifiers: { ctrl: false, shift: true, alt: false, meta: false }, context: 'timeline', description: 'Ripple Delete', category: 'Edit' },
  { action: 'undo', key: 'KeyZ', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Undo', category: 'Edit' },
  { action: 'redo', key: 'KeyZ', modifiers: { ctrl: true, shift: true, alt: false, meta: false }, context: 'global', description: 'Redo', category: 'Edit' },
  { action: 'selectAll', key: 'KeyA', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Select All', category: 'Edit' },
  { action: 'deselect', key: 'Escape', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Deselect All', category: 'Edit' },
  { action: 'split', key: 'KeyB', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Split Clip', category: 'Edit' },
  { action: 'duplicate', key: 'KeyD', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Duplicate', category: 'Edit' },

  // Timeline
  { action: 'setInPoint', key: 'KeyI', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Set In Point', category: 'Timeline' },
  { action: 'setOutPoint', key: 'KeyO', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Set Out Point', category: 'Timeline' },
  { action: 'clearInOut', key: 'KeyG', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Clear In/Out', category: 'Timeline' },
  { action: 'zoomIn', key: 'Equal', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Zoom In', category: 'Timeline' },
  { action: 'zoomOut', key: 'Minus', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Zoom Out', category: 'Timeline' },
  { action: 'zoomFit', key: 'Digit0', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Zoom to Fit', category: 'Timeline' },
  { action: 'addMarker', key: 'KeyM', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Add Marker', category: 'Timeline' },
  { action: 'nextMarker', key: 'KeyM', modifiers: { ctrl: false, shift: true, alt: false, meta: false }, context: 'timeline', description: 'Next Marker', category: 'Timeline' },
  { action: 'prevMarker', key: 'KeyM', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Previous Marker', category: 'Timeline' },
  { action: 'snapToggle', key: 'KeyS', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Toggle Snap', category: 'Timeline' },

  // Tools
  { action: 'toolSelect', key: 'KeyV', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Selection Tool', category: 'Tools' },
  { action: 'toolRazor', key: 'KeyC', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Razor Tool', category: 'Tools' },
  { action: 'toolSlip', key: 'KeyY', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Slip Tool', category: 'Tools' },
  { action: 'toolSlide', key: 'KeyU', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Slide Tool', category: 'Tools' },
  { action: 'toolRoll', key: 'KeyN', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Roll Tool', category: 'Tools' },
  { action: 'toolRipple', key: 'KeyB', modifiers: { ctrl: false, shift: true, alt: false, meta: false }, context: 'timeline', description: 'Ripple Tool', category: 'Tools' },

  // File
  { action: 'newProject', key: 'KeyN', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'New Project', category: 'File' },
  { action: 'open', key: 'KeyO', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Open', category: 'File' },
  { action: 'save', key: 'KeyS', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Save', category: 'File' },
  { action: 'saveAs', key: 'KeyS', modifiers: { ctrl: true, shift: true, alt: false, meta: false }, context: 'global', description: 'Save As', category: 'File' },
  { action: 'import', key: 'KeyI', modifiers: { ctrl: true, shift: false, alt: false, meta: false }, context: 'global', description: 'Import Media', category: 'File' },
  { action: 'export', key: 'KeyE', modifiers: { ctrl: true, shift: true, alt: false, meta: false }, context: 'global', description: 'Export', category: 'File' },

  // View
  { action: 'fullscreen', key: 'KeyF', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'preview', description: 'Fullscreen Preview', category: 'View' },
  { action: 'toggleTimeline', key: 'F5', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Toggle Timeline', category: 'View' },
  { action: 'toggleMedia', key: 'F6', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Toggle Media Browser', category: 'View' },
  { action: 'toggleInspector', key: 'F7', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Toggle Inspector', category: 'View' },
  { action: 'toggleEffects', key: 'F8', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'global', description: 'Toggle Effects', category: 'View' },

  // Multi-cam
  { action: 'cam1', key: 'Digit1', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 1', category: 'Multi-cam' },
  { action: 'cam2', key: 'Digit2', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 2', category: 'Multi-cam' },
  { action: 'cam3', key: 'Digit3', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 3', category: 'Multi-cam' },
  { action: 'cam4', key: 'Digit4', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 4', category: 'Multi-cam' },
  { action: 'cam5', key: 'Digit5', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 5', category: 'Multi-cam' },
  { action: 'cam6', key: 'Digit6', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 6', category: 'Multi-cam' },
  { action: 'cam7', key: 'Digit7', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 7', category: 'Multi-cam' },
  { action: 'cam8', key: 'Digit8', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 8', category: 'Multi-cam' },
  { action: 'cam9', key: 'Digit9', modifiers: { ctrl: false, shift: false, alt: false, meta: false }, context: 'timeline', description: 'Camera 9', category: 'Multi-cam' },
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

  constructor() {
    this.loadDefaults();
    this.setupEventListener();
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
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
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
