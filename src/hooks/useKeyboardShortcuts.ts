import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts management hook
 * Provides unified keyboard shortcut handling with modifier support
 */
interface ShortcutConfig {
  [key: string]: (e: KeyboardEvent) => void;
}

interface ShortcutOptions {
  enabled?: boolean;
  preventDefault?: boolean;
  allowInInputs?: boolean;
}

const DEFAULT_OPTIONS: ShortcutOptions = {
  enabled: true,
  preventDefault: true,
  allowInInputs: false,
};

function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;

  const element = target as HTMLElement;
  const tagName = element.tagName?.toUpperCase();

  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    element.contentEditable === 'true'
  );
}

function getShortcutKey(e: KeyboardEvent): string {
  const keys: string[] = [];

  if (e.ctrlKey || e.metaKey) {
    keys.push(e.metaKey && !e.ctrlKey ? 'meta' : 'ctrl');
  }
  if (e.shiftKey) keys.push('shift');
  if (e.altKey) keys.push('alt');

  keys.push(e.key.toLowerCase());

  return keys.join('+');
}

export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig,
  options: ShortcutOptions = DEFAULT_OPTIONS
): void {
  const shortcutsRef = useRef(shortcuts);
  const optionsRef = useRef({ ...DEFAULT_OPTIONS, ...options });

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    optionsRef.current = { ...DEFAULT_OPTIONS, ...options };
  }, [options]);

  useEffect(() => {
    if (!optionsRef.current.enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input field and allowInInputs is false
      if (!optionsRef.current.allowInInputs && isInputElement(e.target)) {
        return;
      }

      const shortcutKey = getShortcutKey(e);
      const handler = shortcutsRef.current[shortcutKey];

      if (handler) {
        if (optionsRef.current.preventDefault) {
          e.preventDefault();
        }
        handler(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

/**
 * Helper function to display shortcuts in human-readable format
 */
export function formatShortcut(shortcut: string, platform: 'mac' | 'windows' = 'windows'): string {
  const parts = shortcut.split('+');

  return parts
    .map((part) => {
      if (platform === 'mac') {
        const macMap: Record<string, string> = {
          ctrl: '⌃',
          meta: '⌘',
          shift: '⇧',
          alt: '⌥',
        };
        return macMap[part] || part.charAt(0).toUpperCase() + part.slice(1);
      } else {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
    })
    .join(platform === 'mac' ? '' : '+');
}
