/**
 * Regression tests for i18n-manager locale validation.
 *
 * loadLocale() interpolates the locale into a fetch path, so a crafted value
 * must be rejected before the request to prevent path traversal.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { I18nManager, setupI18n, i18n, t } from '../i18n/i18n-manager';
import { TIER1_LOCALES, TIER2_LOCALES, ALL_TIER1_TIER2, TIER3_LOCALES_META } from '../i18n/locales';

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

// ─── setupI18n / i18n() / t() global helpers ─────────────────────────────────

describe('setupI18n / i18n() / t() global helpers', () => {
  beforeEach(() => {
    // Reset module-level singleton by calling setupI18n with a fresh config
    // (we cannot import the private variable, but setupI18n always overwrites it)
    setupI18n({
      defaultLocale: 'en',
      fallbackLocale: 'en',
      loadPath: '/i18n/{locale}.json',
    });
  });

  it('setupI18n returns the new I18nManager instance', () => {
    const mgr = setupI18n({
      defaultLocale: 'ja',
      fallbackLocale: 'en',
      loadPath: '/i18n/{locale}.json',
    });
    expect(mgr).toBeInstanceOf(I18nManager);
  });

  it('i18n() returns the instance set by setupI18n', () => {
    const mgr = setupI18n({
      defaultLocale: 'en',
      fallbackLocale: 'en',
      loadPath: '/i18n/{locale}.json',
    });
    expect(i18n()).toBe(mgr);
  });

  it('t() shorthand delegates to the global i18n instance', () => {
    // Load the English strings manually so t() can resolve something
    const mgr = i18n();
    // Inject a minimal translation to verify delegation
    (mgr as unknown as { translations: Map<string, unknown> }).translations.set('en', { test: { key: 'Hello' } });
    (mgr as unknown as { currentLocale: string }).currentLocale = 'en';
    expect(t('test.key')).toBe('Hello');
  });
});

describe('locales — TIER1_LOCALES', () => {
  it('contains at least 10 locales', () => {
    expect(TIER1_LOCALES.length).toBeGreaterThanOrEqual(10);
  });

  it('every locale has required BCP 47 code', () => {
    for (const locale of TIER1_LOCALES) {
      expect(locale.code).toBeTruthy();
      expect(locale.name).toBeTruthy();
      expect(locale.tier).toBe(1);
    }
  });

  it('Arabic is RTL', () => {
    const ar = TIER1_LOCALES.find((l) => l.code === 'ar');
    expect(ar?.rtl).toBe(true);
  });

  it('English is not RTL', () => {
    const en = TIER1_LOCALES.find((l) => l.code === 'en');
    expect(en?.rtl).toBe(false);
  });
});

describe('locales — TIER2_LOCALES', () => {
  it('contains more than 10 locales', () => {
    expect(TIER2_LOCALES.length).toBeGreaterThan(10);
  });

  it('all are tier 2', () => {
    for (const locale of TIER2_LOCALES) {
      expect(locale.tier).toBe(2);
    }
  });
});

describe('locales — ALL_TIER1_TIER2', () => {
  it('is the union of TIER1 + TIER2', () => {
    expect(ALL_TIER1_TIER2.length).toBe(TIER1_LOCALES.length + TIER2_LOCALES.length);
  });
});

describe('locales — TIER3_LOCALES_META', () => {
  it('has count and loadPath', () => {
    expect(TIER3_LOCALES_META.count).toBeGreaterThan(100);
    expect(TIER3_LOCALES_META.loadPath).toBeTruthy();
  });
});
