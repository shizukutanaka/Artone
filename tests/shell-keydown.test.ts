/**
 * Tests for app/shell.tsx — buildKeydownHandler (global keyboard dispatcher).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import { buildKeydownHandler } from '../app/shell';

type ActionsMock = {
  togglePlayPause: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
  redo: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

function makeActions(): ActionsMock {
  return {
    togglePlayPause: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
  };
}

function keyEvent(over: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const target = document.createElement('div');
  return {
    key: 'z',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    target,
    preventDefault: vi.fn(),
    ...over,
  } as unknown as KeyboardEvent;
}

describe('buildKeydownHandler — undo/redo', () => {
  it('Cmd/Ctrl+Z (no shift) triggers undo', () => {
    const actions = makeActions();
    const handler = buildKeydownHandler(actions as unknown as Parameters<typeof buildKeydownHandler>[0], vi.fn());
    handler(keyEvent({ key: 'z', metaKey: true, shiftKey: false }));
    expect(actions.undo).toHaveBeenCalledOnce();
    expect(actions.redo).not.toHaveBeenCalled();
  });

  it('REGRESSION: Cmd/Ctrl+Shift+Z triggers redo (e.key is the shifted "Z", not "z")', () => {
    // Before fix: the redo branch compared `e.key === 'z'`, but with Shift
    // held, KeyboardEvent.key is the shifted character 'Z' — the branch was
    // unreachable and redo never fired via keyboard.
    const actions = makeActions();
    const handler = buildKeydownHandler(actions as unknown as Parameters<typeof buildKeydownHandler>[0], vi.fn());
    handler(keyEvent({ key: 'Z', metaKey: true, shiftKey: true }));
    expect(actions.redo).toHaveBeenCalledOnce();
    expect(actions.undo).not.toHaveBeenCalled();
  });

  it('ctrlKey alone (non-Mac) also triggers undo/redo', () => {
    const actions = makeActions();
    const handler = buildKeydownHandler(actions as unknown as Parameters<typeof buildKeydownHandler>[0], vi.fn());
    handler(keyEvent({ key: 'z', ctrlKey: true, shiftKey: false }));
    handler(keyEvent({ key: 'Z', ctrlKey: true, shiftKey: true }));
    expect(actions.undo).toHaveBeenCalledOnce();
    expect(actions.redo).toHaveBeenCalledOnce();
  });

  it('ignores z without a modifier key', () => {
    const actions = makeActions();
    const handler = buildKeydownHandler(actions as unknown as Parameters<typeof buildKeydownHandler>[0], vi.fn());
    handler(keyEvent({ key: 'z', metaKey: false, ctrlKey: false }));
    expect(actions.undo).not.toHaveBeenCalled();
    expect(actions.redo).not.toHaveBeenCalled();
  });

  it('ignores keydown events originating from an input/textarea', () => {
    const actions = makeActions();
    const handler = buildKeydownHandler(actions as unknown as Parameters<typeof buildKeydownHandler>[0], vi.fn());
    const input = document.createElement('input');
    handler(keyEvent({ key: 'z', metaKey: true, target: input }));
    expect(actions.undo).not.toHaveBeenCalled();
  });
});
