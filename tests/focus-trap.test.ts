/**
 * Tests for app/focus-trap.ts — modal focus-trap primitives (WCAG AAA).
 *
 * jsdom provides DOM + element.focus()/document.activeElement, so the trap
 * logic is fully exercisable.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFocusableElements, trapTabKey, captureFocus } from '../app/focus-trap';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  root.remove();
});

/** Fake keyboard event capturing preventDefault calls. */
function key(k: string, shift = false) {
  let prevented = false;
  return { key: k, shiftKey: shift, preventDefault: () => { prevented = true; }, get prevented() { return prevented; } };
}

describe('getFocusableElements', () => {
  it('returns focusable controls in DOM order', () => {
    root.innerHTML = `
      <button id="a">A</button>
      <input id="b" />
      <a id="c" href="#">link</a>
    `;
    const ids = getFocusableElements(root).map((e) => e.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('excludes disabled controls', () => {
    root.innerHTML = `<button id="a">A</button><button id="b" disabled>B</button>`;
    expect(getFocusableElements(root).map((e) => e.id)).toEqual(['a']);
  });

  it('excludes tabindex="-1" and aria-hidden', () => {
    root.innerHTML = `
      <button id="a">A</button>
      <div id="b" tabindex="-1">no</div>
      <button id="c" aria-hidden="true">C</button>
    `;
    expect(getFocusableElements(root).map((e) => e.id)).toEqual(['a']);
  });

  it('includes positive/zero tabindex elements', () => {
    root.innerHTML = `<div id="a" tabindex="0">A</div><div id="b" tabindex="2">B</div>`;
    expect(getFocusableElements(root).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns empty array when nothing is focusable', () => {
    root.innerHTML = `<div>text</div><span>more</span>`;
    expect(getFocusableElements(root)).toEqual([]);
  });
});

describe('trapTabKey', () => {
  it('ignores non-Tab keys', () => {
    root.innerHTML = `<button id="a">A</button>`;
    const e = key('Enter');
    expect(trapTabKey(root, e, document.activeElement)).toBe(false);
    expect(e.prevented).toBe(false);
  });

  it('Tab on the last element wraps to the first', () => {
    root.innerHTML = `<button id="a">A</button><button id="b">B</button>`;
    const [a, b] = getFocusableElements(root);
    b.focus();
    const e = key('Tab');
    const moved = trapTabKey(root, e, document.activeElement);
    expect(moved).toBe(true);
    expect(e.prevented).toBe(true);
    expect(document.activeElement).toBe(a);
  });

  it('Shift+Tab on the first element wraps to the last', () => {
    root.innerHTML = `<button id="a">A</button><button id="b">B</button>`;
    const [a, b] = getFocusableElements(root);
    a.focus();
    const e = key('Tab', true);
    const moved = trapTabKey(root, e, document.activeElement);
    expect(moved).toBe(true);
    expect(document.activeElement).toBe(b);
  });

  it('Tab in the middle does not move focus (native behavior)', () => {
    root.innerHTML = `<button id="a">A</button><button id="b">B</button><button id="c">C</button>`;
    const [a] = getFocusableElements(root);
    a.focus();
    const e = key('Tab');
    expect(trapTabKey(root, e, document.activeElement)).toBe(false);
    expect(e.prevented).toBe(false);
  });

  it('Tab while focus is outside the container pulls it to the first element', () => {
    root.innerHTML = `<button id="a">A</button>`;
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const e = key('Tab');
    const moved = trapTabKey(root, e, document.activeElement);
    expect(moved).toBe(true);
    expect(document.activeElement).toBe(getFocusableElements(root)[0]);
    outside.remove();
  });

  it('prevents default but does not move when nothing is focusable', () => {
    root.innerHTML = `<div>text only</div>`;
    const e = key('Tab');
    expect(trapTabKey(root, e, document.activeElement)).toBe(false);
    expect(e.prevented).toBe(true); // focus pinned to container
  });
});

describe('captureFocus', () => {
  it('restores focus to the element active at capture time', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const restore = captureFocus();

    // Simulate a modal stealing focus.
    const modalInput = document.createElement('input');
    document.body.appendChild(modalInput);
    modalInput.focus();
    expect(document.activeElement).toBe(modalInput);

    restore();
    expect(document.activeElement).toBe(opener);

    opener.remove();
    modalInput.remove();
  });

  it('does not throw when the previously focused element was removed', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const restore = captureFocus();
    opener.remove(); // gone before restore
    expect(() => restore()).not.toThrow();
  });
});
