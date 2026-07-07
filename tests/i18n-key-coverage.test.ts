/**
 * i18n key-coverage regression test (code → locale).
 *
 * The sibling locale-completeness test proves every locale agrees with en.json.
 * This one closes the other half of the gap: every STATIC `t('a.b.c')` key used
 * in source must actually exist in en.json. A missing key renders as raw text /
 * a fallback at runtime — broken UI in a project whose #1 rule is "no hardcoded
 * strings, only via t()". Dynamic keys (`t(variable)` / template literals) can't
 * be checked statically and are skipped.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const ROOT = resolve(__dirname, '..');

/** Source directories that use t(). `future/` is excluded (isolated, unwired). */
const SOURCE_DIRS = [
  'app', 'core', 'render', 'timeline', 'color', 'audio', 'ai', 'export',
  'animation', 'captions', 'collab', 'plugins', 'undo', 'scopes', 'perf',
  'recovery', 'media', 'project', 'interchange', 'i18n', 'security', 'install', 'bench',
];

function flatKeys(obj: Record<string, unknown>, prefix = '', out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatKeys(v as Record<string, unknown>, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.includes('.test.')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Remove block and line comments so doc examples like `t('key.path')` don't count. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const STATIC_T_KEY = /\bt\(\s*['"`]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"`]/g;

describe('i18n key coverage (every static t() key exists in en.json)', () => {
  const enKeys = flatKeys(JSON.parse(readFileSync(resolve(ROOT, 'i18n/en.json'), 'utf-8')));

  const files = SOURCE_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

  const missing: Array<{ key: string; file: string }> = [];
  let scanned = 0;
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf-8'));
    let m: RegExpExecArray | null;
    while ((m = STATIC_T_KEY.exec(src)) !== null) {
      scanned++;
      if (!enKeys.has(m[1])) missing.push({ key: m[1], file: file.slice(ROOT.length + 1) });
    }
  }

  it('scans a meaningful number of static keys (guard against a broken regex)', () => {
    expect(scanned).toBeGreaterThan(50);
  });

  it('every static t() key is defined in en.json', () => {
    expect(
      missing,
      `Undefined i18n keys used in source:\n${missing.map((x) => `  ${x.key}  (${x.file})`).join('\n')}`,
    ).toEqual([]);
  });
});
