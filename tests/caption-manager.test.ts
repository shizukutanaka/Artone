/**
 * Tests for captions/caption-manager.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import CaptionManager, { CAPTION_PRESETS } from '../captions/caption-manager';

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
});
