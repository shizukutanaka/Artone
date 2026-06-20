/**
 * engine-context.tsx — configFromFirstRun 単体テスト
 *
 * engine-context.tsx のモジュールレベルコードが t() を呼ぶため、
 * vi.mock で i18n を差し替えてから import する。
 */

import { vi } from 'vitest';

vi.mock('../i18n/i18n-manager', () => ({
  t: (key: string) => key,
  setupI18n: vi.fn(),
  i18n: vi.fn(),
}));

import { describe, it, expect } from 'vitest';
import { configFromFirstRun } from '../app/engine-context';

describe('configFromFirstRun — autoSaveInterval unit regression', () => {
  it('REGRESSION: autoSaveInterval is milliseconds not seconds (60ms fires 16x/s thrashing localStorage)', () => {
    // Before fix: returned 60 / 120 (seconds-as-integers).
    // window.setInterval() takes milliseconds, so 60ms fired ~16 times/second,
    // JSON-serialising the entire timeline state to localStorage on every other frame.
    const beginner = configFromFirstRun('beginner');
    const pro      = configFromFirstRun('pro');
    expect(beginner.autoSaveInterval).toBeGreaterThanOrEqual(1000);
    expect(pro.autoSaveInterval).toBeGreaterThanOrEqual(1000);
  });

  it('pro=120 000 ms (2 min), non-pro=60 000 ms (1 min)', () => {
    expect(configFromFirstRun('pro').autoSaveInterval).toBe(120_000);
    expect(configFromFirstRun('beginner').autoSaveInterval).toBe(60_000);
    expect(configFromFirstRun('intermediate').autoSaveInterval).toBe(60_000);
  });

  it('pro interval is longer than non-pro', () => {
    expect(configFromFirstRun('pro').autoSaveInterval!).toBeGreaterThanOrEqual(
      configFromFirstRun('beginner').autoSaveInterval!
    );
  });
});
