/**
 * Regression tests for I18nManager.init()'s browser-locale-detection
 * fallback resolution.
 *
 * navigator.language is almost always region-qualified (en-US, fr-FR,
 * de-DE, ...), but only base-language files exist on disk (i18n/*.json has
 * no en-US.json etc.). init() must resolve the detected tag down through
 * buildFallbackChain() (tag -> family -> base -> configured fallback) and
 * adopt whichever locale actually has a file, instead of collapsing
 * straight back to defaultLocale on the very first fetch failure.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { I18nManager } from '../i18n/i18n-manager';

/** Only these locale files "exist" — mirrors the real i18n/*.json listing. */
const AVAILABLE_LOCALES = new Set(['ja', 'en', 'fr', 'de', 'es', 'pt', 'ru', 'ko', 'ar', 'zh-Hans', 'zh-Hant']);

function stubFetchForAvailableLocales(): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const m = String(url).match(/\/i18n\/([^/]+)\.json$/);
    const locale = m?.[1];
    if (locale && AVAILABLE_LOCALES.has(locale)) {
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }
    return { ok: false } as unknown as Response;
  }));
}

function stubBrowserLocale(language: string): void {
  vi.stubGlobal('navigator', { ...navigator, language });
}

function makeManager(): I18nManager {
  return new I18nManager({
    defaultLocale: 'ja',
    fallbackLocale: 'en',
    loadPath: '/i18n/{locale}.json',
  });
}

describe('I18nManager.init() — browser locale detection resolves to an available file', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('REGRESSION: en-US resolves to the base language "en", not defaultLocale "ja"', () => {
    stubFetchForAvailableLocales();
    stubBrowserLocale('en-US');
    const mgr = makeManager();
    return mgr.init().then(() => {
      expect(mgr.getLocale()).toBe('en');
    });
  });

  it('REGRESSION: fr-FR resolves to the base language "fr" via LANGUAGE_FAMILY, not defaultLocale', () => {
    stubFetchForAvailableLocales();
    stubBrowserLocale('fr-FR');
    const mgr = makeManager();
    return mgr.init().then(() => {
      expect(mgr.getLocale()).toBe('fr');
    });
  });

  it('REGRESSION: de-DE resolves to the base language "de"', () => {
    stubFetchForAvailableLocales();
    stubBrowserLocale('de-DE');
    const mgr = makeManager();
    return mgr.init().then(() => {
      expect(mgr.getLocale()).toBe('de');
    });
  });

  it('a locale with no matching file anywhere in the chain falls back to the configured fallbackLocale, not defaultLocale', () => {
    stubFetchForAvailableLocales();
    stubBrowserLocale('sv-SE'); // no Swedish file, no family entry
    const mgr = makeManager();
    return mgr.init().then(() => {
      expect(mgr.getLocale()).toBe('en'); // fallbackLocale, resolved via buildFallbackChain
    });
  });

  it('a locale with absolutely nothing available (fallback also missing) settles on defaultLocale', () => {
    // defaultLocale itself must stay loadable: init()'s first loadLocale()
    // call is unguarded (not wrapped in a catch), so it isn't part of what
    // this test is verifying -- only the detected-locale resolution chain.
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      return String(url).endsWith('/ja.json')
        ? ({ ok: true, json: async () => ({}) } as unknown as Response)
        : ({ ok: false } as unknown as Response);
    }));
    stubBrowserLocale('sv-SE');
    const mgr = new I18nManager({
      defaultLocale: 'ja',
      fallbackLocale: 'xx', // deliberately unavailable
      loadPath: '/i18n/{locale}.json',
    });
    return mgr.init().then(() => {
      expect(mgr.getLocale()).toBe('ja');
    });
  });
});
