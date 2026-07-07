/**
 * Tests for captions/caption-manager.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import CaptionManager, {
  CAPTION_PRESETS,
  wrapCaptionLines,
  segmentForWrap,
} from '../captions/caption-manager';

// ============================================================
// Helpers
// ============================================================

function makeManager(): CaptionManager {
  return new CaptionManager();
}

// ============================================================
// Track management
// ============================================================

describe('CaptionManager — track management', () => {
  let cm: CaptionManager;
  beforeEach(() => { cm = makeManager(); });

  it('createTrack returns a track with the given name', () => {
    const t = cm.createTrack('English', 'en');
    expect(t.name).toBe('English');
    expect(t.language).toBe('en');
  });

  it('first track is default', () => {
    const t = cm.createTrack('First');
    expect(t.default).toBe(true);
  });

  it('second track is not default', () => {
    cm.createTrack('First');
    const t2 = cm.createTrack('Second');
    expect(t2.default).toBe(false);
  });

  it('first track becomes the active track', () => {
    const t = cm.createTrack('First');
    expect(cm.getActiveTrack()!.id).toBe(t.id);
  });

  it('setActiveTrack changes the active track', () => {
    cm.createTrack('First');
    const t2 = cm.createTrack('Second');
    cm.setActiveTrack(t2.id);
    expect(cm.getActiveTrack()!.id).toBe(t2.id);
  });

  it('setActiveTrack ignores unknown id', () => {
    const t1 = cm.createTrack('First');
    cm.setActiveTrack('nonexistent');
    expect(cm.getActiveTrack()!.id).toBe(t1.id);
  });

  it('deleteTrack removes track', () => {
    const t = cm.createTrack('First');
    cm.deleteTrack(t.id);
    expect(cm.getAllTracks()).toHaveLength(0);
  });

  it('deleting the active track reassigns active to another', () => {
    const t1 = cm.createTrack('First');
    const t2 = cm.createTrack('Second');
    cm.deleteTrack(t1.id);
    expect(cm.getActiveTrack()!.id).toBe(t2.id);
  });

  it('deleting the only track sets active to null', () => {
    const t = cm.createTrack('Only');
    cm.deleteTrack(t.id);
    expect(cm.getActiveTrack()).toBeNull();
  });

  it('getAllTracks lists all tracks', () => {
    cm.createTrack('A');
    cm.createTrack('B');
    expect(cm.getAllTracks()).toHaveLength(2);
  });
});

// ============================================================
// Caption operations
// ============================================================

describe('CaptionManager — caption operations', () => {
  let cm: CaptionManager;
  let trackId: string;

  beforeEach(() => {
    cm = makeManager();
    trackId = cm.createTrack('T').id;
  });

  it('addCaption returns a caption with merged default style', () => {
    const c = cm.addCaption(trackId, 0, 2, 'Hello')!;
    expect(c.text).toBe('Hello');
    expect(c.style.fontFamily).toBe('Arial'); // from DEFAULT_STYLE
    expect(c.startTime).toBe(0);
    expect(c.endTime).toBe(2);
  });

  it('addCaption merges partial style overrides', () => {
    const c = cm.addCaption(trackId, 0, 2, 'Hi', { fontSize: 72, color: '#ff0000' })!;
    expect(c.style.fontSize).toBe(72);
    expect(c.style.color).toBe('#ff0000');
    expect(c.style.fontFamily).toBe('Arial'); // default preserved
  });

  it('addCaption returns null for unknown track', () => {
    expect(cm.addCaption('nonexistent', 0, 2, 'x')).toBeNull();
  });

  it('REGRESSION: addCaption rejects endTime <= startTime (invisible/corrupt captions)', () => {
    // Before fix: zero/negative-duration captions were stored silently.
    // getCaptionsAtTime() would never return them (since time >= start && time < end
    // is unsatisfiable), and renderer code computing endTime-startTime could
    // produce NaN/Infinity in animated transitions.
    expect(cm.addCaption(trackId, 2, 2, 'zero-dur')).toBeNull();   // endTime == startTime
    expect(cm.addCaption(trackId, 3, 1, 'negative')).toBeNull();   // endTime < startTime
    expect(cm.getActiveTrack()!.captions).toHaveLength(0);          // none stored
  });

  it('addCaption accepts endTime just above startTime', () => {
    expect(cm.addCaption(trackId, 1, 1.001, 'short')).not.toBeNull();
  });

  it('captions are kept sorted by startTime', () => {
    cm.addCaption(trackId, 5, 6, 'C');
    cm.addCaption(trackId, 0, 1, 'A');
    cm.addCaption(trackId, 2, 3, 'B');
    const texts = cm.getActiveTrack()!.captions.map(c => c.text);
    expect(texts).toEqual(['A', 'B', 'C']);
  });

  it('REGRESSION: addCaption does not mutate DEFAULT_STYLE across captions', () => {
    const c1 = cm.addCaption(trackId, 0, 1, 'first', { fontSize: 99 })!;
    const c2 = cm.addCaption(trackId, 1, 2, 'second')!;
    // c2 must have the default font size, not c1's override
    expect(c1.style.fontSize).toBe(99);
    expect(c2.style.fontSize).toBe(48); // DEFAULT_STYLE.fontSize
  });

  it('updateCaption modifies a caption', () => {
    const c = cm.addCaption(trackId, 0, 2, 'old')!;
    cm.updateCaption(trackId, c.id, { text: 'new' });
    expect(cm.getActiveTrack()!.captions[0].text).toBe('new');
  });

  it('updateCaption re-sorts when startTime changes', () => {
    const a = cm.addCaption(trackId, 0, 1, 'A')!;
    cm.addCaption(trackId, 5, 6, 'B');
    cm.updateCaption(trackId, a.id, { startTime: 10 });
    const texts = cm.getActiveTrack()!.captions.map(c => c.text);
    expect(texts).toEqual(['B', 'A']);
  });

  it('deleteCaption removes a caption', () => {
    const c = cm.addCaption(trackId, 0, 2, 'x')!;
    cm.deleteCaption(trackId, c.id);
    expect(cm.getActiveTrack()!.captions).toHaveLength(0);
  });

  it('getCaptionsAtTime returns captions active at a time', () => {
    cm.addCaption(trackId, 0, 5, 'A');
    cm.addCaption(trackId, 10, 15, 'B');
    const at = cm.getCaptionsAtTime(trackId, 2);
    expect(at).toHaveLength(1);
    expect(at[0].text).toBe('A');
  });

  it('getCaptionsAtTime uses exclusive end boundary', () => {
    cm.addCaption(trackId, 0, 5, 'A');
    expect(cm.getCaptionsAtTime(trackId, 5)).toHaveLength(0); // 5 is end → excluded
    expect(cm.getCaptionsAtTime(trackId, 4.999)).toHaveLength(1);
  });
});

// ============================================================
// CAPTION_PRESETS — REGRESSION: default preset independence
// ============================================================

describe('CAPTION_PRESETS', () => {
  it('has 5 presets', () => {
    expect(CAPTION_PRESETS).toHaveLength(5);
  });

  it('all presets have unique ids', () => {
    const ids = CAPTION_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('REGRESSION: default preset style is a copy, not a shared reference', () => {
    const defaultPreset = CAPTION_PRESETS.find(p => p.id === 'default')!;
    // Mutating the default preset must not leak into newly-added captions.
    const cm = makeManager();
    const trackId = cm.createTrack('T').id;
    const before = cm.addCaption(trackId, 0, 1, 'before')!.style.fontSize;

    defaultPreset.style.fontSize = 200; // mutate the preset

    const after = cm.addCaption(trackId, 1, 2, 'after')!.style.fontSize;
    expect(after).toBe(before); // unaffected by preset mutation

    // Restore for other tests
    defaultPreset.style.fontSize = before;
  });

  it('REGRESSION: netflix preset position is a copy, not a shared reference to DEFAULT_POSITION', () => {
    const netflixPreset = CAPTION_PRESETS.find(p => p.id === 'netflix')!;
    const cm = makeManager();
    const trackId = cm.createTrack('T').id;
    const before = cm.addCaption(trackId, 0, 1, 'before')!.position.y;

    netflixPreset.position.y = 999; // mutate the preset

    const after = cm.addCaption(trackId, 1, 2, 'after')!.position.y;
    expect(after).toBe(before); // unaffected by preset mutation

    // Restore for other tests
    netflixPreset.position.y = before;
  });
});

// ============================================================
// SRT import/export round-trip
// ============================================================

describe('SRT import/export', () => {
  let cm: CaptionManager;
  beforeEach(() => { cm = makeManager(); });

  const srt = [
    '1',
    '00:00:01,000 --> 00:00:04,000',
    'First caption',
    '',
    '2',
    '00:00:05,500 --> 00:00:08,000',
    'Second caption',
    '',
  ].join('\n');

  it('importSRT parses captions with correct timing', () => {
    const track = cm.importSRT(srt);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].startTime).toBeCloseTo(1);
    expect(track.captions[0].endTime).toBeCloseTo(4);
    expect(track.captions[0].text).toBe('First caption');
  });

  it('importSRT parses millisecond fraction', () => {
    const track = cm.importSRT(srt);
    expect(track.captions[1].startTime).toBeCloseTo(5.5);
  });

  it('importSRT skips malformed blocks', () => {
    const bad = '1\nnot a timecode\nText\n\n2\n00:00:01,000 --> 00:00:02,000\nGood';
    const track = cm.importSRT(bad);
    expect(track.captions).toHaveLength(1);
    expect(track.captions[0].text).toBe('Good');
  });

  it('exportSRT produces parseable output', () => {
    const track = cm.importSRT(srt);
    const out = cm.exportSRT(track.id);
    expect(out).toContain('00:00:01,000 --> 00:00:04,000');
    expect(out).toContain('First caption');
  });

  it('SRT round-trip preserves caption count and text', () => {
    const t1 = cm.importSRT(srt);
    const exported = cm.exportSRT(t1.id);
    const cm2 = makeManager();
    const t2 = cm2.importSRT(exported);
    expect(t2.captions.map(c => c.text)).toEqual(t1.captions.map(c => c.text));
  });

  it('exportSRT returns empty string for unknown track', () => {
    expect(cm.exportSRT('nonexistent')).toBe('');
  });

  it('REGRESSION: importSRT handles Windows CRLF line endings', () => {
    // Standard SRT files use \r\n. Blocks separated by \r\n\r\n must still split
    // into individual cues (the /\n\n+/ splitter never matches inside \r\n\r\n).
    const crlf = [
      '1', '00:00:01,000 --> 00:00:04,000', 'First caption', '',
      '2', '00:00:05,500 --> 00:00:08,000', 'Second caption', '',
    ].join('\r\n');
    const track = cm.importSRT(crlf);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].text).toBe('First caption');
    expect(track.captions[1].text).toBe('Second caption');
    // No stray carriage returns leaked into the parsed text.
    expect(track.captions[0].text).not.toContain('\r');
  });
});

// ============================================================
// VTT import/export
// ============================================================

describe('VTT import/export', () => {
  let cm: CaptionManager;
  beforeEach(() => { cm = makeManager(); });

  const vtt = [
    'WEBVTT',
    '',
    '00:00:01.000 --> 00:00:04.000',
    'Hello world',
    '',
    '00:00:05.000 --> 00:00:07.000',
    'Second line',
    '',
  ].join('\n');

  it('importVTT parses captions', () => {
    const track = cm.importVTT(vtt);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].text).toBe('Hello world');
  });

  it('importVTT strips inline tags', () => {
    const tagged = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Alice>Hi there</v>';
    const track = cm.importVTT(tagged);
    expect(track.captions[0].text).not.toContain('<v');
    expect(track.captions[0].text).toContain('Hi there');
  });

  it('exportVTT starts with WEBVTT', () => {
    const track = cm.importVTT(vtt);
    expect(cm.exportVTT(track.id)).toMatch(/^WEBVTT/);
  });

  it('exportVTT uses dot millisecond separator', () => {
    const track = cm.importVTT(vtt);
    expect(cm.exportVTT(track.id)).toContain('00:00:01.000');
  });

  it('REGRESSION: importVTT handles Windows CRLF line endings', () => {
    const crlf = [
      'WEBVTT', '',
      '00:00:01.000 --> 00:00:04.000', 'Hello world', '',
      '00:00:05.000 --> 00:00:07.000', 'Second line', '',
    ].join('\r\n');
    const track = cm.importVTT(crlf);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].text).toBe('Hello world');
    expect(track.captions[0].text).not.toContain('\r');
  });

  it('REGRESSION: importVTT parses spec-compliant mm:ss.ttt timestamps (optional hours)', () => {
    // WebVTT allows omitting the hours component for cues under one hour —
    // the form browsers and YouTube commonly emit. The old hh:mm:ss-only
    // regex silently dropped every such cue.
    const shortForm = [
      'WEBVTT', '',
      '00:01.000 --> 00:04.000', 'Hello world', '',
      '01:05.500 --> 01:07.000', 'Second line', '',
    ].join('\n');
    const track = cm.importVTT(shortForm);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].startTime).toBeCloseTo(1, 3);
    expect(track.captions[0].endTime).toBeCloseTo(4, 3);
    expect(track.captions[1].startTime).toBeCloseTo(65.5, 3);
  });

  it('REGRESSION: importVTT ignores trailing cue settings after the end timestamp', () => {
    const withSettings = [
      'WEBVTT', '',
      '00:00:01.000 --> 00:00:04.000 align:start position:10%', 'Hello', '',
    ].join('\n');
    const track = cm.importVTT(withSettings);
    expect(track.captions).toHaveLength(1);
    expect(track.captions[0].startTime).toBeCloseTo(1, 3);
    expect(track.captions[0].endTime).toBeCloseTo(4, 3);
    expect(track.captions[0].text).toBe('Hello');
  });
});

// ============================================================
// ASS import/export
// ============================================================

describe('ASS import/export', () => {
  let cm: CaptionManager;
  beforeEach(() => { cm = makeManager(); });

  const ass = [
    '[Script Info]',
    'Title: Test',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,First line',
    'Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,Second line',
  ].join('\n');

  it('importASS parses dialogue events', () => {
    const track = cm.importASS(ass);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].text).toBe('First line');
  });

  it('importASS parses ASS timecodes (centiseconds)', () => {
    const track = cm.importASS(ass);
    expect(track.captions[0].startTime).toBeCloseTo(1);
    expect(track.captions[0].endTime).toBeCloseTo(4);
  });

  it('importASS converts \\N to newline and strips override tags', () => {
    const withTags = [
      '[Events]',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\b1}Line1\\NLine2',
    ].join('\n');
    const track = cm.importASS(withTags);
    expect(track.captions[0].text).toBe('Line1\nLine2');
  });

  it('importASS preserves commas in text', () => {
    const withComma = [
      '[Events]',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello, world, again',
    ].join('\n');
    const track = cm.importASS(withComma);
    expect(track.captions[0].text).toBe('Hello, world, again');
  });

  it('exportASS includes Script Info header and Dialogue lines', () => {
    const track = cm.importASS(ass);
    const out = cm.exportASS(track.id);
    expect(out).toContain('[Script Info]');
    expect(out).toContain('Dialogue:');
    expect(out).toContain('First line');
  });
});

// ============================================================
// importFromTranscription
// ============================================================

describe('importFromTranscription()', () => {
  it('creates captions from raw ASR cues', () => {
    const cm = makeManager();
    const track = cm.importFromTranscription([
      { start: 0, end: 2, text: 'Hello there.' },
      { start: 2.5, end: 4, text: 'How are you?' },
    ]);
    expect(track.captions.length).toBeGreaterThanOrEqual(2);
  });

  it('appends to existing track when trackId given', () => {
    const cm = makeManager();
    const existing = cm.createTrack('Existing');
    const track = cm.importFromTranscription(
      [{ start: 0, end: 2, text: 'Test' }],
      existing.id
    );
    expect(track.id).toBe(existing.id);
  });

  it('captions are sorted by startTime', () => {
    const cm = makeManager();
    const track = cm.importFromTranscription([
      { start: 0, end: 1, text: 'First.' },
      { start: 3, end: 4, text: 'Third.' },
      { start: 1.5, end: 2, text: 'Second.' },
    ]);
    const starts = track.captions.map(c => c.startTime);
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
  });
});

// ============================================================
// Subscribe
// ============================================================

describe('subscribe()', () => {
  it('listener notified on track creation', () => {
    const cm = makeManager();
    const fn = vi.fn();
    cm.subscribe(fn);
    cm.createTrack('T');
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const cm = makeManager();
    const fn = vi.fn();
    const unsub = cm.subscribe(fn);
    unsub();
    cm.createTrack('T');
    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── wrapText (private) ───────────────────────────────────────────────────────

describe('CaptionManager — wrapText (private)', () => {
  type CMPrivate = { wrapText(ctx: { measureText(t: string): { width: number } }, text: string, maxWidth: number): string[] };

  function mockCtx(charWidth = 10): { measureText(t: string): { width: number } } {
    return { measureText: (t: string) => ({ width: t.length * charWidth }) };
  }

  function makePrivate(): CMPrivate {
    return makeManager() as unknown as CMPrivate;
  }

  it('returns single line when text fits', () => {
    const result = makePrivate().wrapText(mockCtx(5), 'Hello', 100);
    expect(result).toEqual(['Hello']);
  });

  it('wraps long text into multiple lines', () => {
    // Each char = 10px, maxWidth = 50 → 5 chars per line
    const result = makePrivate().wrapText(mockCtx(10), 'one two three', 50);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join(' ')).toContain('one');
    expect(result.join(' ')).toContain('two');
  });

  it('splits on newlines into separate paragraphs', () => {
    const result = makePrivate().wrapText(mockCtx(5), 'line one\nline two', 500);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('line one');
    expect(result[1]).toBe('line two');
  });

  it('handles empty string', () => {
    const result = makePrivate().wrapText(mockCtx(5), '', 100);
    expect(result).toEqual([]);
  });

  it('REGRESSION: wraps Japanese (no spaces) instead of overflowing one line', () => {
    // Each char = 10px, maxWidth = 50 → ~5 chars/line. Old space-split logic left
    // the whole 9-char string on ONE 90px line (overflow); CJK segmentation wraps it.
    const result = makePrivate().wrapText(mockCtx(10), 'こんにちは世界です', 50);
    expect(result.length).toBeGreaterThan(1);
    // No line exceeds the width budget (5 chars).
    for (const line of result) expect(line.length).toBeLessThanOrEqual(5);
    // Content is preserved (concatenation equals the input, no spaces inserted).
    expect(result.join('')).toBe('こんにちは世界です');
  });
});

// ─── CJK-aware line wrapping (pure) ───────────────────────────────────────────

describe('segmentForWrap', () => {
  it('splits Japanese into multiple break tokens', () => {
    const tokens = segmentForWrap('こんにちは世界です');
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.join('')).toBe('こんにちは世界です');
  });

  it('keeps Latin words intact', () => {
    expect(segmentForWrap('one two').filter((t) => t.trim() !== '')).toEqual(['one', 'two']);
  });
});

describe('wrapCaptionLines (pure)', () => {
  const measure = (charWidth: number) => (s: string) => s.length * charWidth;

  it('matches greedy word wrap for Latin', () => {
    expect(wrapCaptionLines('one two three', 50, measure(10))).toEqual(['one', 'two', 'three']);
  });

  it('respects hard newlines', () => {
    expect(wrapCaptionLines('a\nb', 500, measure(5))).toEqual(['a', 'b']);
  });

  it('keeps an over-wide unbreakable token on its own line (not dropped)', () => {
    // Single Latin word wider than maxWidth: emitted as one overflowing line.
    expect(wrapCaptionLines('supercalifragilistic', 50, measure(10))).toEqual(['supercalifragilistic']);
  });

  it('wraps CJK with the default segmenter', () => {
    const lines = wrapCaptionLines('今日はいい天気ですね', 40, measure(10));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('今日はいい天気ですね');
  });
});

// ─── REGRESSION: renderCaption with empty text ────────────────────────────────
describe('REGRESSION: renderCaption() with empty text does not call fillRect(-Infinity)', () => {
  it('returns early without drawing when wrapText produces no lines', () => {
    const manager = new CaptionManager();
    const track = manager.createTrack('t', 'en');
    // Add a caption with empty text — valid in SRT (blank cue)
    const caption = manager.addCaption(track.id, 0, 1, '')!;
    expect(caption).not.toBeNull();

    const fillRectCalls: unknown[][] = [];
    const mockCtx = {
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: 'miter',
      fillStyle: '',
      globalAlpha: 1,
      measureText: () => ({ width: 0 }),
      fillRect: (...args: unknown[]) => { fillRectCalls.push(args); },
      strokeText: () => undefined,
      fillText: () => undefined,
    };

    // Must not throw and must not call fillRect with -Infinity width
    expect(() =>
      (manager as unknown as { renderCaption: (...a: unknown[]) => void }).renderCaption(
        mockCtx as unknown as CanvasRenderingContext2D,
        caption,
        1920,
        1080
      )
    ).not.toThrow();

    // fillRect should not have been called (early return before background draw)
    for (const call of fillRectCalls) {
      // If somehow called, width must not be -Infinity
      expect(call[2]).not.toBe(-Infinity);
    }
  });
});
