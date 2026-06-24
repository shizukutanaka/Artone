/**
 * Tests for app/command-palette.tsx — fuzzy search scoring and tier-filtered
 * ranking (the ⌘K palette's core matching logic, previously untested).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { fuzzyMatch, searchItems, type PaletteItem } from '../app/command-palette';

function item(over: Partial<PaletteItem> & { id: string; label: string }): PaletteItem {
  return {
    category: 'command',
    tier: 'essential',
    action: () => {},
    ...over,
  };
}

describe('fuzzyMatch', () => {
  it('empty query matches everything with score 0', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ match: true, score: 0 });
  });

  it('prefix match scores highest (100)', () => {
    expect(fuzzyMatch('exp', 'Export')).toEqual({ match: true, score: 100 });
  });

  it('substring (non-prefix) match scores 80', () => {
    expect(fuzzyMatch('port', 'Export')).toEqual({ match: true, score: 80 });
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('EXPORT', 'export').score).toBe(100);
    expect(fuzzyMatch('eXpO', 'Export').score).toBe(100);
  });

  it('subsequence (non-contiguous) match scores 40 + maxConsecutive*10', () => {
    // "axc": a..c subsequence of "abc"? a(0) then x not found → no. Use a real gap case.
    // "ac" in "abc": a(0), c(2) → subsequence, maxConsecutive run = 1 → 50.
    expect(fuzzyMatch('ac', 'abc')).toEqual({ match: true, score: 50 });
    // "ad" in "abcd": a(0), d(3) → run 1 → 50.
    expect(fuzzyMatch('ad', 'abcd')).toEqual({ match: true, score: 50 });
  });

  it('rewards longer consecutive runs in fuzzy matches', () => {
    // "abd" in "abcd": a,b consecutive (run 2), then d → maxConsecutive 2 → 60.
    expect(fuzzyMatch('abd', 'abcd')).toEqual({ match: true, score: 60 });
  });

  it('returns no match when the query is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'abc')).toEqual({ match: false, score: 0 });
    expect(fuzzyMatch('cba', 'abc')).toEqual({ match: false, score: 0 }); // wrong order
  });
});

describe('searchItems — tier filtering', () => {
  const items: PaletteItem[] = [
    item({ id: 'e', label: 'Essential thing', tier: 'essential' }),
    item({ id: 's', label: 'Standard thing', tier: 'standard' }),
    item({ id: 'p', label: 'Pro thing', tier: 'pro' }),
  ];

  it('essential tier sees only essential items', () => {
    const ids = searchItems(items, '', 'essential').map((i) => i.id);
    expect(ids).toEqual(['e']);
  });

  it('standard tier sees essential + standard', () => {
    const ids = searchItems(items, '', 'standard').map((i) => i.id).sort();
    expect(ids).toEqual(['e', 's']);
  });

  it('pro tier sees all', () => {
    expect(searchItems(items, '', 'pro')).toHaveLength(3);
  });
});

describe('searchItems — ranking and aliases', () => {
  it('ranks prefix above substring above fuzzy', () => {
    const items: PaletteItem[] = [
      item({ id: 'sub', label: 'reExport' }),       // substring of "export" → 80
      item({ id: 'pre', label: 'Export project' }), // prefix → 100
      item({ id: 'fz',  label: 'e_x_p_o_r_t' }),    // fuzzy subsequence → < 80
    ];
    const ids = searchItems(items, 'export', 'pro').map((i) => i.id);
    expect(ids[0]).toBe('pre');
    expect(ids[1]).toBe('sub');
    expect(ids[2]).toBe('fz');
  });

  it('matches via aliases (romaji/kana) and uses the best of label vs alias', () => {
    const items: PaletteItem[] = [
      item({ id: 'cut', label: '切り取り', aliases: ['cut', 'kiritori'] }),
    ];
    // Label has no latin "cut"; alias does (prefix → 100).
    const hit = searchItems(items, 'cut', 'essential');
    expect(hit.map((i) => i.id)).toEqual(['cut']);
  });

  it('excludes non-matching items', () => {
    const items: PaletteItem[] = [
      item({ id: 'a', label: 'Export' }),
      item({ id: 'b', label: 'Import' }),
    ];
    expect(searchItems(items, 'zzz', 'pro')).toHaveLength(0);
  });

  it('caps the result list at 12', () => {
    const items: PaletteItem[] = Array.from({ length: 30 }, (_, i) =>
      item({ id: `i${i}`, label: `Command ${i}` }),
    );
    expect(searchItems(items, 'command', 'pro')).toHaveLength(12);
  });

  it('empty query returns all in-tier items (capped at 12)', () => {
    const items: PaletteItem[] = Array.from({ length: 5 }, (_, i) =>
      item({ id: `i${i}`, label: `Thing ${i}` }),
    );
    expect(searchItems(items, '', 'essential')).toHaveLength(5);
  });
});
