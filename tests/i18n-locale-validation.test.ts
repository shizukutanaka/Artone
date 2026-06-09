/**
 * Regression tests for i18n-manager locale validation.
 *
 * loadLocale() interpolates the locale into a fetch path, so a crafted value
 * must be rejected before the request to prevent path traversal.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { I18nManager } from '../i18n/i18n-manager';

function makeManager(): I18nManager {
  return new I18nManager({
    defaultLocale: 'en',
    fallbackLocale: 'en',
    loadPath: '/i18n/{locale}.json',
  });
}

describe('i18n loadLocale — locale validation', () => {
  it('rejects path-traversal locales', async () => {
    const mgr = makeManager();
    await expect(mgr.loadLocale('../../../etc/passwd')).rejects.toThrow(/Invalid locale/);
  });

  it('rejects locales containing slashes', async () => {
    const mgr = makeManager();
    await expect(mgr.loadLocale('en/../../secret')).rejects.toThrow(/Invalid locale/);
  });

  it('rejects locales containing dots', async () => {
    const mgr = makeManager();
    await expect(mgr.loadLocale('..')).rejects.toThrow(/Invalid locale/);
  });

  it('rejects empty and whitespace locales', async () => {
    const mgr = makeManager();
    await expect(mgr.loadLocale('')).rejects.toThrow(/Invalid locale/);
    await expect(mgr.loadLocale('  ')).rejects.toThrow(/Invalid locale/);
  });

  it('rejects backslash and protocol-like values', async () => {
    const mgr = makeManager();
    await expect(mgr.loadLocale('a\\b')).rejects.toThrow(/Invalid locale/);
    await expect(mgr.loadLocale('http://evil')).rejects.toThrow(/Invalid locale/);
  });

  it('accepts well-formed BCP 47 codes (does not reject on validation)', async () => {
    const mgr = makeManager();
    // These are valid shapes; loadLocale will proceed to fetch (which fails in
    // the test environment) — the point is the rejection must NOT be the
    // "Invalid locale" validation error.
    for (const loc of ['ja', 'en-US', 'zh-Hans', 'zh-Hant-HK']) {
      const err = await mgr.loadLocale(loc).then(() => null, (e: Error) => e);
      if (err) expect(err.message).not.toMatch(/Invalid locale/);
    }
  });
});
