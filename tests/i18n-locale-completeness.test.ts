/**
 * Locale completeness regression test.
 *
 * Ensures all locale files export exactly the same key set as en.json.
 * Fails on missing keys (incomplete translation) or extra keys (typos in
 * locale files that would never be reachable).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const I18N_DIR = resolve(__dirname, '../i18n');

/** Flatten nested object to dot-separated keys, e.g. { a: { b: 1 } } → ['a.b'] */
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatKeys(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function loadLocale(locale: string): Record<string, unknown> {
  const path = resolve(I18N_DIR, `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

const REFERENCE_LOCALE = 'en';
const ALL_LOCALES = ['ja', 'ar', 'de', 'es', 'fr', 'ko', 'pt', 'ru', 'zh-Hans', 'zh-Hant'];

describe('i18n locale completeness', () => {
  const refKeys = flatKeys(loadLocale(REFERENCE_LOCALE)).sort();

  for (const locale of ALL_LOCALES) {
    it(`${locale}.json has no missing or extra keys vs en.json`, () => {
      const localeKeys = flatKeys(loadLocale(locale)).sort();
      const missing = refKeys.filter((k) => !localeKeys.includes(k));
      const extra = localeKeys.filter((k) => !refKeys.includes(k));

      expect(missing, `Keys missing from ${locale}.json`).toHaveLength(0);
      expect(extra, `Extra keys in ${locale}.json not in en.json`).toHaveLength(0);
    });
  }

  it('en.json has no duplicate flat keys (nested key collision)', () => {
    const allKeys = flatKeys(loadLocale(REFERENCE_LOCALE));
    const uniqueKeys = new Set(allKeys);
    expect(allKeys).toHaveLength(uniqueKeys.size);
  });

  it('all locale JSON files parse without error', () => {
    for (const locale of [REFERENCE_LOCALE, ...ALL_LOCALES]) {
      expect(() => loadLocale(locale), `${locale}.json should be valid JSON`).not.toThrow();
    }
  });
});
