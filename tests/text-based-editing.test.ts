/**
 * Tests for timeline/text-based-editing.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextBasedEditor } from '../timeline/text-based-editing';

// ============================================================
// Helpers
// ============================================================

type WordSpec = { text: string; start: number; end: number; confidence?: number; speaker?: string };

function words(...specs: WordSpec[]): WordSpec[] {
  return specs;
}

function makeEditor(): TextBasedEditor {
  return new TextBasedEditor();
}

function importSimple(editor: TextBasedEditor, wordSpecs: WordSpec[]): string {
  const t = editor.importTranscript('clip-1', wordSpecs);
  return t.id;
}

// ============================================================
// importTranscript
// ============================================================

describe('importTranscript()', () => {
  let editor: TextBasedEditor;
  beforeEach(() => { editor = makeEditor(); });

  it('creates a transcript with the correct number of words', () => {
    const id = importSimple(editor, words(
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'world', start: 0.6, end: 1.0 }
    ));
    const t = editor.getTranscript(id)!;
    const all = t.paragraphs.flatMap(p => p.words);
    expect(all).toHaveLength(2);
  });

  it('detects filler words', () => {
    const id = importSimple(editor, words(
      { text: 'um', start: 0, end: 0.2 },
      { text: 'hello', start: 0.3, end: 0.8 }
    ));
    const t = editor.getTranscript(id)!;
    const all = t.paragraphs.flatMap(p => p.words);
    const um = all.find(w => w.text === 'um')!;
    const hello = all.find(w => w.text === 'hello')!;
    expect(um.isFiller).toBe(true);
    expect(hello.isFiller).toBe(false);
  });

  it('splits words into paragraphs on speaker change', () => {
    const id = importSimple(editor, words(
      { text: 'Hello', start: 0, end: 0.5, speaker: 'spk1' },
      { text: 'world', start: 0.6, end: 1.0, speaker: 'spk2' },
      { text: 'test',  start: 1.1, end: 1.5, speaker: 'spk1' }
    ));
    const t = editor.getTranscript(id)!;
    expect(t.paragraphs).toHaveLength(3);
  });

  it('assigns speaker color from palette', () => {
    const id = importSimple(editor, words(
      { text: 'Hello', start: 0, end: 0.5, speaker: 'spk1' }
    ));
    const t = editor.getTranscript(id)!;
    const spk = t.speakers.get('spk1')!;
    expect(spk.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('computes duration from last word end', () => {
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 1 },
      { text: 'b', start: 2, end: 3 }
    ));
    expect(editor.getTranscript(id)!.duration).toBe(3);
  });

  it('empty words array creates transcript with duration 0', () => {
    const id = importSimple(editor, []);
    expect(editor.getTranscript(id)!.duration).toBe(0);
    expect(editor.getTranscript(id)!.paragraphs).toHaveLength(0);
  });
});

// ============================================================
// deleteWord / restoreWord
// ============================================================

describe('deleteWord() / restoreWord()', () => {
  let editor: TextBasedEditor;
  let transcriptId: string;
  let wordId: string;

  beforeEach(() => {
    editor = makeEditor();
    transcriptId = importSimple(editor, words(
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'world', start: 0.6, end: 1.0 }
    ));
    wordId = editor.getTranscript(transcriptId)!.paragraphs[0].words[0].id;
  });

  it('marks word as deleted', () => {
    editor.deleteWord(transcriptId, wordId);
    const word = editor.getTranscript(transcriptId)!.paragraphs[0].words[0];
    expect(word.deleted).toBe(true);
  });

  it('restoreWord undeletes a deleted word', () => {
    editor.deleteWord(transcriptId, wordId);
    editor.restoreWord(transcriptId, wordId);
    const word = editor.getTranscript(transcriptId)!.paragraphs[0].words[0];
    expect(word.deleted).toBe(false);
  });

  it('deleteWord on unknown id does nothing', () => {
    expect(() => editor.deleteWord(transcriptId, 'nonexistent')).not.toThrow();
  });
});

// ============================================================
// deleteWords — REGRESSION: already-deleted words not re-recorded
// ============================================================

describe('deleteWords() — REGRESSION: undo does not resurrect pre-deleted words', () => {
  it('does not add already-deleted words to history', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 0.6, end: 1.0 },
    ));
    const ws = editor.getTranscript(id)!.paragraphs[0].words;
    const [a, b] = ws;

    // Delete word 'a' via direct deleteWord (owned by history op 1)
    editor.deleteWord(id, a.id);
    expect(a.deleted).toBe(true);

    // Now deleteWords includes already-deleted 'a' and live 'b'
    editor.deleteWords(id, [a.id, b.id]);
    expect(b.deleted).toBe(true);

    // Undo the deleteWords — should only restore 'b', NOT 'a'
    editor.undo();
    expect(b.deleted).toBe(false);
    expect(a.deleted).toBe(true); // 'a' must stay deleted (owned by earlier op)
  });

  it('deleteWords with no changed ids does not add history entry', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'x', start: 0, end: 0.5 }
    ));
    const wordId = editor.getTranscript(id)!.paragraphs[0].words[0].id;
    editor.deleteWord(id, wordId); // already deleted

    // Second deleteWords on already-deleted word
    const histBefore = (editor as unknown as { historyIndex: number }).historyIndex;
    editor.deleteWords(id, [wordId]);
    const histAfter = (editor as unknown as { historyIndex: number }).historyIndex;
    expect(histAfter).toBe(histBefore); // no new history entry
  });
});

// ============================================================
// removeFillerWords
// ============================================================

describe('removeFillerWords()', () => {
  it('marks all filler words as deleted', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'um',    start: 0,   end: 0.2 },
      { text: 'hello', start: 0.3, end: 0.8 },
      { text: 'uh',    start: 0.9, end: 1.0 }
    ));
    const removed = editor.removeFillerWords(id);
    expect(removed).toBe(2);
    const all = editor.getTranscript(id)!.paragraphs.flatMap(p => p.words);
    expect(all.find(w => w.text === 'um')!.deleted).toBe(true);
    expect(all.find(w => w.text === 'uh')!.deleted).toBe(true);
    expect(all.find(w => w.text === 'hello')!.deleted).toBe(false);
  });

  it('returns 0 when no filler words present', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 }
    ));
    expect(editor.removeFillerWords(id)).toBe(0);
  });

  it('does not count already-deleted fillers', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'um', start: 0, end: 0.2 }
    ));
    const wid = editor.getTranscript(id)!.paragraphs[0].words[0].id;
    editor.deleteWord(id, wid); // already deleted
    expect(editor.removeFillerWords(id)).toBe(0);
  });
});

// ============================================================
// detectSilences
// ============================================================

describe('detectSilences()', () => {
  it('detects gap between words', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 1.5, end: 2.0 }
    ));
    const silences = editor.detectSilences(id, 0.5);
    expect(silences.some(s => s.start === 0.5 && s.end === 1.5)).toBe(true);
  });

  it('does not detect gap smaller than minDuration', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 0.6, end: 1.0 }
    ));
    expect(editor.detectSilences(id, 0.5)).toHaveLength(0);
  });

  it('detects trailing silence', () => {
    const editor = makeEditor();
    const id = editor.importTranscript('clip', words(
      { text: 'a', start: 0, end: 1.0 }
    ));
    // Manually set duration to 3 so there's 2s of trailing silence
    (editor.getTranscript(id.id) as unknown as { duration: number }).duration = 3;
    const silences = editor.detectSilences(id.id, 0.5);
    expect(silences.some(s => s.start === 1.0 && s.end === 3.0)).toBe(true);
  });

  it('returns empty for unknown transcript', () => {
    const editor = makeEditor();
    expect(editor.detectSilences('does-not-exist')).toEqual([]);
  });
});

// ============================================================
// generateEDL
// ============================================================

describe('generateEDL()', () => {
  it('returns single segment for continuous words', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 0.55, end: 1.0 } // gap < 0.1s → merged
    ));
    const edl = editor.generateEDL(id);
    expect(edl).toHaveLength(1);
    expect(edl[0]).toEqual({ start: 0, end: 1.0 });
  });

  it('splits on large gaps (>= 0.1s)', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 1.0, end: 1.5 }  // gap = 0.5s
    ));
    const edl = editor.generateEDL(id);
    expect(edl).toHaveLength(2);
  });

  it('excludes deleted words from EDL', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 1.0, end: 1.5 },
      { text: 'c', start: 2.0, end: 2.5 }
    ));
    const t = editor.getTranscript(id)!;
    const bId = t.paragraphs[0].words[1].id;
    editor.deleteWord(id, bId);
    const edl = editor.generateEDL(id);
    // a-gap-c, both gaps are 0.5s → 2 segments
    expect(edl.some(s => s.start === 1.0)).toBe(false); // b is excluded
  });

  it('returns empty for empty transcript', () => {
    const editor = makeEditor();
    const id = importSimple(editor, []);
    expect(editor.generateEDL(id)).toEqual([]);
  });
});

// ============================================================
// Undo / Redo
// ============================================================

describe('undo() / redo()', () => {
  let editor: TextBasedEditor;
  let transcriptId: string;
  let wid: string;

  beforeEach(() => {
    editor = makeEditor();
    transcriptId = importSimple(editor, words(
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'world', start: 0.6, end: 1.0 }
    ));
    wid = editor.getTranscript(transcriptId)!.paragraphs[0].words[0].id;
  });

  it('undo() restores a deleted word', () => {
    editor.deleteWord(transcriptId, wid);
    editor.undo();
    const word = editor.getTranscript(transcriptId)!.paragraphs[0].words[0];
    expect(word.deleted).toBe(false);
  });

  it('undo() on empty history does nothing', () => {
    expect(() => editor.undo()).not.toThrow();
  });

  it('redo() after undo re-applies the delete', () => {
    editor.deleteWord(transcriptId, wid);
    editor.undo();
    editor.redo();
    const word = editor.getTranscript(transcriptId)!.paragraphs[0].words[0];
    expect(word.deleted).toBe(true);
  });

  it('redo() on exhausted history does nothing', () => {
    editor.deleteWord(transcriptId, wid);
    editor.redo(); // no future history
    expect(() => editor.redo()).not.toThrow();
  });

  it('new edit clears redo history', () => {
    editor.deleteWord(transcriptId, wid);
    editor.undo(); // now redo is available

    const w2id = editor.getTranscript(transcriptId)!.paragraphs[0].words[1].id;
    editor.deleteWord(transcriptId, w2id); // new edit discards redo

    editor.redo(); // should be a no-op (no future history)
    const w2 = editor.getTranscript(transcriptId)!.paragraphs[0].words[1];
    expect(w2.deleted).toBe(true); // still deleted; redo did nothing
  });

  it('undoing a restoreWord re-deletes the word', () => {
    editor.deleteWord(transcriptId, wid);
    editor.restoreWord(transcriptId, wid);
    editor.undo(); // undo the restore → re-delete
    const word = editor.getTranscript(transcriptId)!.paragraphs[0].words[0];
    expect(word.deleted).toBe(true);
  });
});

// ============================================================
// Search
// ============================================================

describe('search()', () => {
  it('finds words matching query (case-insensitive)', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'WORLD', start: 0.6, end: 1.0 },
      { text: 'foo',   start: 1.1, end: 1.5 }
    ));
    const result = editor.search(id, 'world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('WORLD');
  });

  it('returns empty array for no matches', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 }
    ));
    expect(editor.search(id, 'xyz')).toHaveLength(0);
  });

  it('returns empty for unknown transcript', () => {
    const editor = makeEditor();
    expect(editor.search('nonexistent', 'test')).toEqual([]);
  });
});

// ============================================================
// Speaker operations
// ============================================================

describe('renameSpeaker() / mergeSpeakers()', () => {
  it('renameSpeaker updates speaker name', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hi', start: 0, end: 0.5, speaker: 'spk1' }
    ));
    editor.renameSpeaker(id, 'spk1', 'Alice');
    expect(editor.getTranscript(id)!.speakers.get('spk1')!.name).toBe('Alice');
  });

  it('mergeSpeakers reassigns words and removes source speaker', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hi',    start: 0, end: 0.5, speaker: 'spk1' },
      { text: 'there', start: 0.6, end: 1.0, speaker: 'spk2' }
    ));
    editor.mergeSpeakers(id, 'spk2', 'spk1');
    const t = editor.getTranscript(id)!;
    expect(t.speakers.has('spk2')).toBe(false);
    const all = t.paragraphs.flatMap(p => p.words);
    for (const w of all) {
      expect(w.speaker).toBe('spk1');
    }
  });
});

// ============================================================
// Export: SRT / VTT / Plain text
// ============================================================

describe('exportSRT()', () => {
  it('returns empty string for unknown transcript', () => {
    expect(makeEditor().exportSRT('nonexistent')).toBe('');
  });

  it('omits deleted words', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 },
      { text: 'world', start: 0.6, end: 1.0 }
    ));
    const wid = editor.getTranscript(id)!.paragraphs[0].words[0].id;
    editor.deleteWord(id, wid);
    const srt = editor.exportSRT(id);
    expect(srt).not.toContain('hello');
    expect(srt).toContain('world');
  });

  it('produces SRT index and arrow', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 }
    ));
    const srt = editor.exportSRT(id);
    expect(srt).toContain('1');
    expect(srt).toContain('-->');
  });

  it('REGRESSION: SRT millisecond field is not truncated-down by float error', () => {
    // formatSRTTime used `Math.floor((seconds % 1) * 1000)`, which truncated the
    // ms field DOWN by IEEE-754 error for common values (3.456s -> ",455") --
    // the same bug already fixed in captions/caption-manager.ts but left live in
    // this Descript-style exporter. Deriving from rounded integer ms is exact.
    const editor = makeEditor();
    const id = importSimple(editor, words({ text: 'hi', start: 0, end: 3.456 }));
    expect(editor.exportSRT(id)).toContain('--> 00:00:03,456');
  });
});

describe('exportVTT()', () => {
  it('starts with WEBVTT', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 }
    ));
    expect(editor.exportVTT(id)).toMatch(/^WEBVTT/);
  });

  it('REGRESSION: VTT millisecond field is not truncated-down by float error', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words({ text: 'hi', start: 0, end: 3.456 }));
    expect(editor.exportVTT(id)).toContain('--> 00:00:03.456');
  });
});

describe('exportPlainText()', () => {
  it('returns only non-deleted words', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 },
      { text: 'world', start: 0.6, end: 1.0 }
    ));
    editor.deleteWord(id, editor.getTranscript(id)!.paragraphs[0].words[1].id);
    const txt = editor.exportPlainText(id);
    expect(txt).toContain('hello');
    expect(txt).not.toContain('world');
  });

  it('includes speaker name when includeSpeakers=true', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5, speaker: 'spk1' }
    ));
    editor.renameSpeaker(id, 'spk1', 'Alice');
    const txt = editor.exportPlainText(id, true);
    expect(txt).toContain('Alice:');
  });
});

// ============================================================
// Playback sync
// ============================================================

describe('getCurrentWord() / getWordAtTime()', () => {
  it('getCurrentWord returns word at current time', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 },
      { text: 'world', start: 0.6, end: 1.0 }
    ));
    editor.setCurrentTime(0.3);
    const w = editor.getCurrentWord(id);
    expect(w!.text).toBe('hello');
  });

  it('getCurrentWord returns null when no word at time', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 0, end: 0.5 }
    ));
    editor.setCurrentTime(2.0);
    expect(editor.getCurrentWord(id)).toBeNull();
  });

  it('getWordAtTime finds word at given time', () => {
    const editor = makeEditor();
    const id = importSimple(editor, words(
      { text: 'hello', start: 1.0, end: 1.5 }
    ));
    expect(editor.getWordAtTime(id, 1.2)!.text).toBe('hello');
  });
});

// ============================================================
// Subscribe
// ============================================================

describe('subscribe()', () => {
  it('listener is called on import', () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.subscribe(fn);
    importSimple(editor, words({ text: 'hi', start: 0, end: 0.5 }));
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const editor = makeEditor();
    const fn = vi.fn();
    const unsub = editor.subscribe(fn);
    unsub();
    importSimple(editor, words({ text: 'hi', start: 0, end: 0.5 }));
    expect(fn).not.toHaveBeenCalled();
  });
});
