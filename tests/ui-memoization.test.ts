/**
 * Regression guard for React render-performance memoization.
 *
 * The list/panel components below re-render on every engine tick (e.g. the
 * playhead advancing each frame during playback) unless wrapped in React.memo.
 * These checks fail if the memo wrapper is ever removed, which would silently
 * reintroduce per-frame re-renders of the media list / inspector.
 *
 * Behavioural render-skip testing would need React Testing Library (not a
 * project dependency), so this asserts the memoization is applied structurally.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { MediaBrowser } from '../app/MediaBrowser';
import { Inspector } from '../app/Inspector';

const MEMO = Symbol.for('react.memo');

describe('UI components are wrapped in React.memo', () => {
  it('MediaBrowser is memoized', () => {
    expect((MediaBrowser as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
  });

  it('Inspector is memoized', () => {
    expect((Inspector as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
  });

  it('memoized components keep a displayName for devtools/debugging', () => {
    expect((MediaBrowser as unknown as { displayName?: string }).displayName).toBe('MediaBrowser');
    expect((Inspector as unknown as { displayName?: string }).displayName).toBe('Inspector');
  });
});
