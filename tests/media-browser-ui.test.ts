/**
 * Tests for app/MediaBrowser.tsx (the React UI component; not to be
 * confused with media/media-browser.ts, the item-management engine covered
 * by tests/media-browser.test.ts).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/i18n-manager', () => ({
  t: (key: string) => key,
}));

import { MediaBrowser, type MediaItem } from '../app/MediaBrowser';

function makeItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    name: 'clip.mp4',
    type: 'video',
    size: 2048,
    url: 'blob:fake',
    ...over,
  };
}

describe('MediaBrowser UI — REGRESSION: numeric && rendering glitch', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  function render(items: MediaItem[]) {
    act(() => {
      root.render(
        React.createElement(MediaBrowser, {
          items,
          onImport: vi.fn(),
          onSelect: vi.fn(),
          onDelete: vi.fn(),
        })
      );
    });
  }

  it('a zero-duration clip does not render a stray "0" glitch character', () => {
    render([makeItem({ duration: 0, size: 2048 })]);
    // Before fix: `{item.duration && ' · '}` evaluated to the falsy number
    // 0 (not `false`), which React renders as the literal text "0".
    const metaLine = container.querySelector('div[title="clip.mp4"]')?.nextElementSibling;
    expect(metaLine?.textContent).not.toMatch(/(?:^|[^.\d])0(?:[^.\d]|$)/);
    expect(metaLine?.textContent).toBe('2.0 KB');
  });

  it('a clip with width set but height 0 does not render a stray "0"', () => {
    // Before fix: `item.width && item.height && ...` short-circuited on the
    // falsy `item.height` (0), so the WHOLE expression evaluated to 0 and
    // rendered as literal text, even though width alone was non-zero.
    render([makeItem({ width: 1920, height: 0, duration: 0, size: 500 })]);
    const metaLine = container.querySelector('div[title="clip.mp4"]')?.nextElementSibling;
    expect(metaLine?.textContent).toBe('500 B');
  });

  it('a normal clip with real width/height/duration still renders them', () => {
    render([makeItem({ width: 1920, height: 1080, duration: 65, size: 500 })]);
    const metaLine = container.querySelector('div[title="clip.mp4"]')?.nextElementSibling;
    expect(metaLine?.textContent).toBe('1920×1080 · 1:05 · 500 B');
  });
});

describe('MediaBrowser UI — REGRESSION: drag-over highlight does not flicker on nested elements', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('a dragleave bubbling from a nested child (still inside the container) does not clear the highlight', () => {
    act(() => {
      root.render(
        React.createElement(MediaBrowser, {
          items: [makeItem()],
          onImport: vi.fn(),
          onSelect: vi.fn(),
          onDelete: vi.fn(),
        })
      );
    });

    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.querySelector('div[title="clip.mp4"]') as HTMLElement;

    act(() => {
      outer.dispatchEvent(new Event('dragenter', { bubbles: true }));
    });
    expect(outer.style.border).not.toBe('');

    act(() => {
      // Simulate the pointer moving from the container background onto a
      // nested child: dragleave fires on the outer container (bubbling
      // target), immediately followed by a dragenter on the same outer
      // container as the child's own dragenter bubbles up.
      inner.dispatchEvent(new Event('dragleave', { bubbles: true }));
      inner.dispatchEvent(new Event('dragenter', { bubbles: true }));
    });
    // Before fix: onDragLeave unconditionally cleared dragOver, causing a
    // one-frame flicker of the highlight even though the drag never left
    // the outer container.
    expect(outer.style.border).not.toBe('');
  });

  it('leaving the container entirely clears the highlight', () => {
    act(() => {
      root.render(
        React.createElement(MediaBrowser, {
          items: [makeItem()],
          onImport: vi.fn(),
          onSelect: vi.fn(),
          onDelete: vi.fn(),
        })
      );
    });
    const outer = container.firstElementChild as HTMLElement;

    act(() => {
      outer.dispatchEvent(new Event('dragenter', { bubbles: true }));
    });
    expect(outer.style.border).not.toBe('');

    act(() => {
      outer.dispatchEvent(new Event('dragleave', { bubbles: true }));
    });
    // jsdom normalizes the `border: 'none'` shorthand to an empty string.
    expect(outer.style.border).toBe('');
  });
});
