/**
 * Tests for captions/readability.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  wrapWords,
  countPrintableChars,
  cps,
  normalizeCues,
  auditCues,
  type RawCue,
  type NormalizedCue,
} from '../captions/readability';

// ============================================================
// wrapWords
// ============================================================

describe('wrapWords()', () => {
  it('returns empty array for empty string', () => {
    expect(wrapWords('', 42)).toEqual([]);
  });

  it('returns single line for short text', () => {
    expect(wrapWords('Hello world', 42)).toEqual(['Hello world']);
  });

  it('wraps at maxChars boundary (word-level)', () => {
    // "Hello" (5) + " world" (6) = 11, fits in 12
    // "Hello world and more" = 20, exceeds 12 → wrap after "Hello world"
    const result = wrapWords('Hello world and more', 12);
    expect(result).toEqual(['Hello world', 'and more']);
  });

  it('handles text that fits exactly on one line', () => {
    const text = '12345678901234567890'; // 20 chars
    expect(wrapWords(text, 20)).toEqual([text]);
  });

  it('hard-breaks a single word longer than maxChars', () => {
    const result = wrapWords('abcdefghij', 5);
    expect(result).toEqual(['abcde', 'fghij']);
  });

  it('hard-breaks at maxChars within long word', () => {
    const result = wrapWords('abcdefghijklmno', 5);
    expect(result).toEqual(['abcde', 'fghij', 'klmno']);
  });

  it('does not insert empty lines for whitespace-only input', () => {
    expect(wrapWords('   ', 42)).toEqual([]);
  });

  it('collapses multiple spaces between words', () => {
    const result = wrapWords('hello   world', 42);
    expect(result).toEqual(['hello   world'.replace(/\s+/, ' ')]);
  });

  it('produces multiple lines for long multi-word text', () => {
    const words = Array(10).fill('word').join(' '); // "word word word..." x10 = 49 chars
    const result = wrapWords(words, 20);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it('single word exactly at limit stays on its own line', () => {
    expect(wrapWords('hello', 5)).toEqual(['hello']);
  });
});

// ============================================================
// countPrintableChars
// ============================================================

describe('countPrintableChars()', () => {
  it('counts characters in plain text', () => {
    expect(countPrintableChars('Hello world')).toBe(11);
  });

  it('replaces newlines with space then collapses', () => {
    expect(countPrintableChars('Hello\nworld')).toBe(11);
  });

  it('trims leading/trailing whitespace', () => {
    expect(countPrintableChars('  hello  ')).toBe(5);
  });

  it('returns 0 for empty string', () => {
    expect(countPrintableChars('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countPrintableChars('   \n   ')).toBe(0);
  });

  it('multi-line cue counts all words', () => {
    expect(countPrintableChars('Hello\nbeautiful\nworld')).toBe('Hello beautiful world'.length);
  });
});

// ============================================================
// cps
// ============================================================

describe('cps()', () => {
  it('returns 0 for zero-duration cue', () => {
    expect(cps('hello world', 0)).toBe(0);
  });

  it('returns 0 for negative-duration cue', () => {
    expect(cps('hello world', -1)).toBe(0);
  });

  it('computes correct CPS for simple cue', () => {
    // 11 chars / 1.0 s = 11.0
    expect(cps('Hello world', 1.0)).toBeCloseTo(11);
  });

  it('cps increases with shorter duration', () => {
    expect(cps('Hello world', 0.5)).toBeGreaterThan(cps('Hello world', 1.0));
  });
});

// ============================================================
// normalizeCues — single-cue path
// ============================================================

describe('normalizeCues() — single cue', () => {
  it('drops empty cues', () => {
    const result = normalizeCues([{ start: 0, end: 2, text: '   ' }]);
    expect(result).toHaveLength(0);
  });

  it('preserves timing for short cue within maxCps', () => {
    const result = normalizeCues([{ start: 1, end: 4, text: 'Hello world' }]);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(1);
  });

  it('extends duration when CPS would exceed maxCps', () => {
    // 100 chars in 1s = 100 CPS >> 17 CPS limit
    const long = 'a'.repeat(100);
    const result = normalizeCues([{ start: 0, end: 1, text: long }], { maxCps: 17 });
    const actualCps = result[0].cps;
    expect(actualCps).toBeLessThanOrEqual(17 + 0.01);
  });

  it('enforces minDurationSec floor', () => {
    const result = normalizeCues(
      [{ start: 0, end: 0.1, text: 'Hi' }],
      { minDurationSec: 1.0 }
    );
    expect(result[0].end - result[0].start).toBeGreaterThanOrEqual(1.0);
  });

  it('wraps long text into multiple lines', () => {
    const text = 'The quick brown fox jumps over the lazy dog and then some more words here';
    const result = normalizeCues([{ start: 0, end: 5, text }], { maxCharsPerLine: 42, maxLines: 2 });
    // Should produce multiple cues due to more than 2 lines of wrapped text
    for (const cue of result) {
      const lines = cue.text.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
    }
  });

  it('cps field in result matches actual CPS', () => {
    const result = normalizeCues([{ start: 0, end: 3, text: 'Hello world' }]);
    const c = result[0];
    const expected = cps(c.text, c.end - c.start);
    expect(c.cps).toBeCloseTo(expected, 3);
  });

  it('handles negative-duration raw cue gracefully', () => {
    // end < start → treated as zero duration → extended by minDurationSec
    const result = normalizeCues([{ start: 5, end: 3, text: 'Hello world' }]);
    expect(result[0].end - result[0].start).toBeGreaterThanOrEqual(1.0);
  });
});

// ============================================================
// normalizeCues — splitting path (multiple cue groups)
// ============================================================

describe('normalizeCues() — splitting path', () => {
  it('splits a very long cue into multiple sub-cues', () => {
    // 6 lines of 40 chars each → 3 cues with maxLines=2
    const line = 'word '.repeat(8).trim(); // ~39 chars
    const text = Array(6).fill(line).join(' ');
    const result = normalizeCues([{ start: 0, end: 20, text }], {
      maxCharsPerLine: 42,
      maxLines: 2,
    });
    expect(result.length).toBeGreaterThan(1);
  });

  it('sub-cues are sequential in time', () => {
    const text = Array(8).fill('word word word word word word word word').join(' ');
    const result = normalizeCues([{ start: 0, end: 30, text }], {
      maxCharsPerLine: 42,
      maxLines: 2,
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end);
    }
  });

  it('enforces minGapSec between split cues', () => {
    const text = Array(8).fill('word word word word word word word word').join(' ');
    const minGapSec = 0.04;
    const result = normalizeCues([{ start: 0, end: 30, text }], {
      maxCharsPerLine: 42,
      maxLines: 2,
      minGapSec,
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start - result[i - 1].end).toBeGreaterThanOrEqual(minGapSec - 1e-9);
    }
  });

  it('each sub-cue respects maxCps', () => {
    const text = Array(6).fill('word '.repeat(8).trim()).join(' ');
    const result = normalizeCues([{ start: 0, end: 20, text }], {
      maxCharsPerLine: 42,
      maxLines: 2,
      maxCps: 17,
    });
    for (const cue of result) {
      expect(cue.cps).toBeLessThanOrEqual(17 + 0.01);
    }
  });
});

// ============================================================
// normalizeCues — profiles
// ============================================================

describe('normalizeCues() — profiles', () => {
  it('netflix profile: maxCharsPerLine=42', () => {
    const long = 'word '.repeat(20); // ~100 chars
    const result = normalizeCues([{ start: 0, end: 10, text: long }], { profile: 'netflix' });
    for (const cue of result) {
      for (const line of cue.text.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(42);
      }
    }
  });

  it('bbc profile: maxCharsPerLine=37', () => {
    const long = 'word '.repeat(20);
    const result = normalizeCues([{ start: 0, end: 10, text: long }], { profile: 'bbc' });
    for (const cue of result) {
      for (const line of cue.text.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(37);
      }
    }
  });

  it('custom field overrides profile default', () => {
    const long = 'word '.repeat(20);
    const result = normalizeCues(
      [{ start: 0, end: 10, text: long }],
      { profile: 'netflix', maxCharsPerLine: 20 }
    );
    for (const cue of result) {
      for (const line of cue.text.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(20);
      }
    }
  });
});

// ============================================================
// auditCues
// ============================================================

describe('auditCues()', () => {
  function makeCue(text: string, start: number, end: number): NormalizedCue {
    return { start, end, text, cps: cps(text, end - start) };
  }

  it('returns empty array for compliant cues', () => {
    const cues = normalizeCues([{ start: 0, end: 5, text: 'Short caption.' }]);
    const violations = auditCues(cues);
    expect(violations).toHaveLength(0);
  });

  it('reports cps violation for fast cue', () => {
    // 42 chars in 1s = 42 CPS >> 17
    const cues = [makeCue('The quick brown fox jumps over the lazy dog!', 0, 1)];
    const violations = auditCues(cues, { maxCps: 17 });
    const cpsvio = violations.filter(v => v.type === 'cps');
    expect(cpsvio.length).toBeGreaterThan(0);
  });

  it('reports line_length violation', () => {
    const longLine = 'a'.repeat(50); // > 42 chars
    const cues = [makeCue(longLine, 0, 10)];
    const violations = auditCues(cues, { maxCharsPerLine: 42 });
    const llvio = violations.filter(v => v.type === 'line_length');
    expect(llvio.length).toBeGreaterThan(0);
  });

  it('reports line_count violation for 3-line cue with maxLines=2', () => {
    const cues = [makeCue('line1\nline2\nline3', 0, 10)];
    const violations = auditCues(cues, { maxLines: 2 });
    const lcvio = violations.filter(v => v.type === 'line_count');
    expect(lcvio.length).toBeGreaterThan(0);
  });

  it('violation detail includes meaningful text', () => {
    const cues = [makeCue('a'.repeat(50), 0, 10)];
    const violations = auditCues(cues, { maxCharsPerLine: 42 });
    expect(violations[0].detail).toContain('50');
  });

  it('returns index matching cue position', () => {
    const compliant = makeCue('Short', 0, 5);
    const violating = makeCue('a'.repeat(60), 5, 15);
    const violations = auditCues([compliant, violating], { maxCharsPerLine: 42 });
    expect(violations.some(v => v.index === 1)).toBe(true);
  });

  it('empty cues array returns no violations', () => {
    expect(auditCues([])).toHaveLength(0);
  });
});

// ============================================================
// End-to-end: normalizeCues then auditCues produces no violations
// ============================================================

describe('normalizeCues → auditCues round-trip', () => {
  it('normalized output passes audit for typical speech', () => {
    const raw: RawCue[] = [
      { start: 0, end: 2, text: 'Welcome to the show.' },
      { start: 2.5, end: 6, text: 'Today we are going to be talking about a very important topic that affects many people.' },
      { start: 7, end: 8, text: 'Let us begin.' },
    ];
    const normalized = normalizeCues(raw, { profile: 'netflix' });
    const violations = auditCues(normalized, { profile: 'netflix' });
    expect(violations).toHaveLength(0);
  });

  it('normalized output from EBU profile passes EBU audit', () => {
    const raw: RawCue[] = [
      { start: 0, end: 3, text: 'This is a test of the EBU STL standard for broadcast subtitles.' },
    ];
    const normalized = normalizeCues(raw, { profile: 'ebu' });
    const violations = auditCues(normalized, { profile: 'ebu' });
    expect(violations).toHaveLength(0);
  });
});
