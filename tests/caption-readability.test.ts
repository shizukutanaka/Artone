/**
 * Caption Readability テスト (broadcast-spec normalization)
 *
 * normalizeCues / wrapWords / auditCues の決定論的出力を検証。
 * DOM 不要 — 純粋 TypeScript モジュール。
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCues,
  wrapWords,
  cps,
  countPrintableChars,
  auditCues,
  type RawCue,
  type ReadabilityOptions,
} from '../captions/readability';

// ============================================================
// wrapWords
// ============================================================

describe('wrapWords', () => {
  it('passes short text through as a single line', () => {
    expect(wrapWords('Hello world', 42)).toEqual(['Hello world']);
  });

  it('wraps at word boundary when line exceeds maxChars', () => {
    const lines = wrapWords('The quick brown fox jumps over the lazy dog', 20);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
    // All words must be present
    expect(lines.join(' ')).toContain('quick brown fox');
  });

  it('hard-breaks a single word wider than maxChars', () => {
    const lines = wrapWords('Supercalifragilistic', 8);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(8);
    expect(lines.join('')).toBe('Supercal' + 'ifragi' + 'listic');
  });

  it('handles empty string', () => {
    expect(wrapWords('', 42)).toEqual([]);
  });

  it('collapses multiple spaces', () => {
    const lines = wrapWords('foo   bar', 42);
    expect(lines).toEqual(['foo bar']);
  });
});

// ============================================================
// countPrintableChars / cps
// ============================================================

describe('countPrintableChars', () => {
  it('strips newlines when counting', () => {
    expect(countPrintableChars('Hello\nworld')).toBe(11);
  });

  it('trims leading/trailing whitespace', () => {
    expect(countPrintableChars('  hi  ')).toBe(2);
  });
});

describe('cps', () => {
  it('returns 0 for zero-duration cue', () => {
    expect(cps('hello', 0)).toBe(0);
  });

  it('calculates correctly', () => {
    expect(cps('aaaaaaaaaa', 2)).toBeCloseTo(5, 5); // 10 chars / 2 s = 5 CPS
  });
});

// ============================================================
// normalizeCues — single-cue (no splitting)
// ============================================================

describe('normalizeCues — short cue, no split', () => {
  const seg: RawCue = { start: 0, end: 3, text: 'Hello world' };

  it('preserves timing when cue fits within constraints', () => {
    const [c] = normalizeCues([seg]);
    expect(c.start).toBeCloseTo(0);
    expect(c.end).toBeGreaterThanOrEqual(seg.end);
    expect(c.text).toBe('Hello world');
  });

  it('extends duration when CPS would be too fast', () => {
    // 17-char cue in 0.5 s = 34 CPS — must extend to 17/17 = 1.0 s
    const fast: RawCue = { start: 0, end: 0.5, text: 'Hello, world! Hm.' };
    const [c] = normalizeCues([fast], { maxCps: 17, minDurationSec: 0 });
    expect(c.end - c.start).toBeGreaterThanOrEqual(1.0);
    expect(c.cps).toBeLessThanOrEqual(17 + 0.01);
  });

  it('respects minDurationSec floor', () => {
    const short: RawCue = { start: 0, end: 0.1, text: 'Hi' };
    const [c] = normalizeCues([short], { minDurationSec: 1.0, maxCps: 200 });
    expect(c.end - c.start).toBeGreaterThanOrEqual(1.0);
  });

  it('drops empty cues', () => {
    const cues = normalizeCues([
      { start: 0, end: 1, text: '   ' },
      { start: 1, end: 2, text: 'hello' },
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('hello');
  });
});

// ============================================================
// normalizeCues — line wrapping
// ============================================================

describe('normalizeCues — line wrapping', () => {
  it('wraps long line at word boundary', () => {
    const seg: RawCue = {
      start: 0,
      end: 5,
      text: 'The quick brown fox jumps over the lazy dog right now please',
    };
    const [c] = normalizeCues([seg], { maxCharsPerLine: 30, maxLines: 2 });
    const lines = c.text.split('\n');
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(30);
  });

  it('splits into multiple cues when lines exceed maxLines', () => {
    // Text that needs 4 lines at 20 chars → with maxLines=2, should become 2 cues
    const longText = 'one two three four five six seven eight nine ten';
    const seg: RawCue = { start: 0, end: 4, text: longText };
    const cues = normalizeCues([seg], { maxCharsPerLine: 20, maxLines: 2 });
    expect(cues.length).toBeGreaterThanOrEqual(2);
    for (const c of cues) {
      const lines = c.text.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
    }
  });

  it('split cues are temporally ordered and non-overlapping', () => {
    const seg: RawCue = {
      start: 1,
      end: 5,
      text: 'alpha beta gamma delta epsilon zeta eta theta',
    };
    const cues = normalizeCues([seg], { maxCharsPerLine: 15, maxLines: 2 });
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end);
    }
  });

  it('split cues start at the original segment start', () => {
    const seg: RawCue = {
      start: 10,
      end: 20,
      text: 'a b c d e f g h i j k l m n o p q r s t',
    };
    const cues = normalizeCues([seg], { maxCharsPerLine: 10, maxLines: 2 });
    expect(cues[0].start).toBeCloseTo(10);
  });
});

// ============================================================
// normalizeCues — profile presets
// ============================================================

describe('normalizeCues — profiles', () => {
  const tightSeg: RawCue = { start: 0, end: 0.5, text: 'Very fast spoken text here' };

  it('netflix profile enforces 17 CPS', () => {
    const cues = normalizeCues([tightSeg], { profile: 'netflix' });
    for (const c of cues) expect(c.cps).toBeLessThanOrEqual(17.1);
  });

  it('youtube profile allows up to 20 CPS', () => {
    // 20-char text in 1 s = 20 CPS — should pass youtube but fail netflix
    const seg: RawCue = { start: 0, end: 1.0, text: 'Hello world 20chars!' };
    const cues = normalizeCues([seg], { profile: 'youtube', minDurationSec: 0 });
    for (const c of cues) expect(c.cps).toBeLessThanOrEqual(20.1);
  });

  it('ebu profile uses 40-char line limit', () => {
    const seg: RawCue = {
      start: 0,
      end: 5,
      text: 'This line should wrap because it is forty one characters long exactly here',
    };
    const [c] = normalizeCues([seg], { profile: 'ebu' });
    for (const l of c.text.split('\n')) expect(l.length).toBeLessThanOrEqual(40);
  });

  it('bbc profile uses 37-char line limit', () => {
    const seg: RawCue = {
      start: 0,
      end: 5,
      text: 'The quick brown fox jumps over the lazy dog quickly now',
    };
    const cues = normalizeCues([seg], { profile: 'bbc' });
    for (const c of cues) {
      for (const l of c.text.split('\n')) expect(l.length).toBeLessThanOrEqual(37);
    }
  });
});

// ============================================================
// auditCues
// ============================================================

describe('auditCues', () => {
  it('returns empty array for compliant cues', () => {
    const cues = normalizeCues(
      [{ start: 0, end: 5, text: 'Short compliant line' }],
      { profile: 'netflix' }
    );
    expect(auditCues(cues, { profile: 'netflix' })).toHaveLength(0);
  });

  it('detects CPS violation', () => {
    const violations = auditCues(
      [{ start: 0, end: 0.1, text: 'This is way too fast to read', cps: 280 }],
      { maxCps: 17 }
    );
    const cpsvs = violations.filter((v) => v.type === 'cps');
    expect(cpsvs.length).toBeGreaterThan(0);
  });

  it('detects line_length violation', () => {
    const violations = auditCues(
      [{ start: 0, end: 5, text: 'This line is definitely longer than forty-two characters right here!', cps: 5 }],
      { maxCharsPerLine: 42 }
    );
    const llvs = violations.filter((v) => v.type === 'line_length');
    expect(llvs.length).toBeGreaterThan(0);
  });

  it('detects line_count violation', () => {
    const violations = auditCues(
      [{ start: 0, end: 5, text: 'line one\nline two\nline three', cps: 5 }],
      { maxLines: 2 }
    );
    const lcvs = violations.filter((v) => v.type === 'line_count');
    expect(lcvs.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Round-trip: normalizeCues output passes auditCues
// ============================================================

describe('normalizeCues → auditCues round-trip', () => {
  const opts: ReadabilityOptions = { profile: 'netflix' };

  const inputs: RawCue[] = [
    { start: 0, end: 0.3, text: 'Too fast' },
    { start: 1, end: 6, text: 'The quick brown fox jumps over the lazy dog and then runs away into the forest' },
    { start: 7, end: 12, text: 'Normal text that fits easily within the line limit' },
    { start: 13, end: 13.5, text: 'Short but fast subtitle here now' },
  ];

  it('produces zero violations after normalization', () => {
    const cues = normalizeCues(inputs, opts);
    const violations = auditCues(cues, opts);
    expect(violations).toHaveLength(0);
  });
});
