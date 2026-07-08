/**
 * Tests for app/first-run.tsx — @keyframes availability across all 3 steps.
 *
 * containerStyle references `artone-fade-in ${motion.appear}` on every step,
 * but the <style> tag defining the @keyframes used to be rendered only in
 * Step 2's JSX branch. Steps 0 (Welcome, the very first screen a user ever
 * sees) and 1 (template picker) referenced a nonexistent animation name and
 * silently never faded in.
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

import { FirstRunExperience } from '../app/first-run';

function hasFadeInKeyframes(container: HTMLElement): boolean {
  return Array.from(container.querySelectorAll('style')).some((s) =>
    s.textContent?.includes('@keyframes artone-fade-in')
  );
}

describe('FirstRunExperience — REGRESSION: fade-in keyframes on every step', () => {
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

  it('Step 0 (Welcome, the first screen shown) defines @keyframes artone-fade-in', () => {
    act(() => {
      root.render(React.createElement(FirstRunExperience, { onComplete: vi.fn() }));
    });
    expect(hasFadeInKeyframes(container)).toBe(true);
  });

  it('Step 1 (template picker) defines @keyframes artone-fade-in', () => {
    act(() => {
      root.render(React.createElement(FirstRunExperience, { onComplete: vi.fn() }));
    });
    act(() => {
      // Advance past Step 0 by picking an experience level.
      const buttons = container.querySelectorAll('button');
      const levelButton = Array.from(buttons).find((b) => b.textContent?.includes('firstRun.levelIntermediate'));
      levelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Sanity check: confirm we actually advanced to Step 1's content.
    expect(container.textContent).toContain('firstRun.step2Title');
    expect(hasFadeInKeyframes(container)).toBe(true);
  });

  it('Step 2 (media drop) defines @keyframes artone-fade-in', () => {
    act(() => {
      root.render(React.createElement(FirstRunExperience, { onComplete: vi.fn() }));
    });
    act(() => {
      const levelButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('firstRun.levelIntermediate')
      );
      levelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      const templateButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('YouTube')
      );
      templateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Sanity check: confirm we actually advanced to Step 2's content, not
    // still sitting on Step 1 (whose own <style> presence would otherwise
    // make this assertion pass for the wrong reason).
    expect(container.textContent).toContain('firstRun.step3Title');
    expect(hasFadeInKeyframes(container)).toBe(true);
  });
});
