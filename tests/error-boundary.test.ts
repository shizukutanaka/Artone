/**
 * Tests for app/error-boundary.tsx and its mounting via app/shell.tsx's AppRoot.
 *
 * The ErrorBoundary was fully implemented but never mounted anywhere — entry.tsx
 * rendered <ArtoneShell /> directly, so any uncaught render error still produced
 * the blank white screen the component exists to prevent. AppRoot now wraps
 * ArtoneShell in the boundary, and entry.tsx renders AppRoot.
 *
 * (Uses React.createElement rather than JSX so the file is a .test.ts, matching
 * this repo's vitest include glob `tests/** /*.test.ts` and the existing
 * createRoot-based component tests like first-run-fade-in.test.ts.)
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/i18n-manager', () => ({ t: (key: string) => key }));

import { ErrorBoundary } from '../app/error-boundary';

const h = React.createElement;

const Boom: React.FC = () => {
  throw new Error('kaboom');
};

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // React logs caught boundary errors to console.error; silence the noise.
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    consoleErr.mockRestore();
  });

  it('renders children unchanged when no error is thrown', () => {
    act(() => {
      root.render(h(ErrorBoundary, { children: h('span', null, 'healthy content') }));
    });
    expect(container.textContent).toContain('healthy content');
    // The fallback title must NOT be present.
    expect(container.textContent).not.toContain('error.unexpected.title');
  });

  it('REGRESSION: catches a throwing child and renders the recovery UI instead of a blank screen', () => {
    act(() => {
      root.render(h(ErrorBoundary, { children: h(Boom) }));
    });
    // The fallback surfaces the unexpected-error title + retry/restart actions.
    expect(container.textContent).toContain('error.unexpected.title');
    expect(container.textContent).toContain('common.retry');
    expect(container.textContent).toContain('error.restart');
    // The offending message is surfaced in the details block.
    expect(container.textContent).toContain('kaboom');
  });

  it('invokes the onError callback with the thrown error', () => {
    const onError = vi.fn();
    act(() => {
      root.render(h(ErrorBoundary, { onError, children: h(Boom) }));
    });
    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0][0] as Error).message).toBe('kaboom');
  });

  it('Retry resets the boundary so a now-healthy subtree renders again', () => {
    // A child that throws only on its first render, then succeeds.
    let shouldThrow = true;
    const Flaky: React.FC = () => {
      if (shouldThrow) throw new Error('transient');
      return h('span', null, 'recovered');
    };
    act(() => {
      root.render(h(ErrorBoundary, { children: h(Flaky) }));
    });
    expect(container.textContent).toContain('error.unexpected.title');

    shouldThrow = false;
    // Click "Retry" (the secondary button = handleReset).
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('common.retry')
    );
    act(() => {
      retryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('recovered');
    expect(container.textContent).not.toContain('error.unexpected.title');
  });
});

describe('AppRoot — mounts ArtoneShell inside the ErrorBoundary', () => {
  it('REGRESSION: AppRoot wraps ArtoneShell in an ErrorBoundary (was rendered bare in entry.tsx)', async () => {
    // Structural check via element inspection — no render, so ArtoneShell's
    // heavy engine subtree never mounts. Before the fix AppRoot did not exist
    // and entry.tsx rendered <ArtoneShell /> with no boundary at all.
    const { AppRoot, ArtoneShell } = await import('../app/shell');
    const el = (AppRoot as unknown as () => React.ReactElement)();
    expect(el.type).toBe(ErrorBoundary);
    const child = (el.props as { children: React.ReactElement }).children;
    expect(child.type).toBe(ArtoneShell);
  });
});
