/**
 * Artone v3 — Text-Based Editing
 * 
 * Descript風テキストベース編集
 * - 文字起こし同期
 * - テキスト削除→動画カット
 * - フィラーワード自動削除
 * - 無音区間削除
 * - 話者分離
 * - SRT/VTT エクスポート
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface Word {
  id: string;
  text: string;
  start: number;      // seconds
  end: number;
  confidence: number;
  speaker?: string;
  deleted: boolean;
  isFiller: boolean;
  isSilence: boolean;
}

export interface Paragraph {
  id: string;
  speakerId: string;
  words: Word[];
  start: number;
  end: number;
}

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface Transcript {
  id: string;
  clipId: string;
  language: string;
  paragraphs: Paragraph[];
  speakers: Map<string, Speaker>;
  duration: number;
}

export interface TextEdit {
  type: 'delete' | 'restore' | 'split' | 'merge';
  wordIds: string[];
  timestamp: number;
}

export interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}

// ============================================================
// Filler Words (日英対応)
// ============================================================

const FILLER_WORDS_EN = [
  'um', 'uh', 'er', 'ah', 'like', 'you know', 'basically',
  'actually', 'literally', 'so', 'well', 'i mean', 'right',
  'okay', 'yeah'
];

const FILLER_WORDS_JA = [
  'えーと', 'えー', 'あー', 'あのー', 'その', 'まあ',
  'なんか', 'ちょっと', 'えっと', 'うーん', 'そのー',
  'あのね', 'ですね', 'なんていうか'
];

const SPEAKER_COLORS = [
  '#F24E1E' /* collab-color */, '#A259FF' /* collab-color */, '#1ABCFE' /* collab-color */, '#0ACF83' /* collab-color */,
  '#FFCD29', '#FF7262', '#E91E63', '#9C27B0' // collab-color palette
];

// ============================================================
// Text-Based Editor
// ============================================================

export class TextBasedEditor {
  private transcripts: Map<string, Transcript> = new Map();
  private editHistory: TextEdit[] = [];
  private historyIndex = -1;
  private listeners: Set<() => void> = new Set();
  private currentTime = 0;

  // ============================================================
  // Transcript Management
  // ============================================================

  async createTranscript(
    clipId: string,
    audioBuffer: AudioBuffer,
    language = 'ja'
  ): Promise<Transcript> {
    // In production, use Whisper or similar
    // Here we create a mock transcript structure
    const id = crypto.randomUUID();
    
    const transcript: Transcript = {
      id,
      clipId,
      language,
      paragraphs: [],
      speakers: new Map(),
      duration: audioBuffer.duration
    };

    // Create default speaker
    const speakerId = 'speaker-1';
    transcript.speakers.set(speakerId, {
      id: speakerId,
      name: 'Speaker 1',
      color: SPEAKER_COLORS[0]
    });

    this.transcripts.set(id, transcript);
    this.notify();
    return transcript;
  }

  importTranscript(
    clipId: string,
    words: Array<{ text: string; start: number; end: number; confidence?: number; speaker?: string }>
  ): Transcript {
    const id = crypto.randomUUID();
    const speakers = new Map<string, Speaker>();
    const paragraphs: Paragraph[] = [];
    
    let currentParagraph: Paragraph | null = null;
    let currentSpeaker = '';
    let speakerIndex = 0;

    for (const w of words) {
      const speakerId = w.speaker || 'speaker-1';
      
      // Create speaker if new
      if (!speakers.has(speakerId)) {
        speakers.set(speakerId, {
          id: speakerId,
          name: `Speaker ${speakerIndex + 1}`,
          color: SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length]
        });
        speakerIndex++;
      }

      // Start new paragraph on speaker change
      if (speakerId !== currentSpeaker) {
        if (currentParagraph) {
          paragraphs.push(currentParagraph);
        }
        currentParagraph = {
          id: crypto.randomUUID(),
          speakerId,
          words: [],
          start: w.start,
          end: w.end
        };
        currentSpeaker = speakerId;
      }

      const word: Word = {
        id: crypto.randomUUID(),
        text: w.text,
        start: w.start,
        end: w.end,
        confidence: w.confidence ?? 1,
        speaker: speakerId,
        deleted: false,
        isFiller: this.isFillerWord(w.text),
        isSilence: false
      };

      currentParagraph!.words.push(word);
      currentParagraph!.end = w.end;
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }

    const duration = paragraphs.length > 0 
      ? paragraphs[paragraphs.length - 1].end 
      : 0;

    const transcript: Transcript = {
      id,
      clipId,
      language: 'auto',
      paragraphs,
      speakers,
      duration
    };

    this.transcripts.set(id, transcript);
    this.notify();
    return transcript;
  }

  // ============================================================
  // Word Operations
  // ============================================================

  deleteWord(transcriptId: string, wordId: string): void {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return;

    for (const para of transcript.paragraphs) {
      const word = para.words.find(w => w.id === wordId);
      if (word) {
        word.deleted = true;
        this.addToHistory({ type: 'delete', wordIds: [wordId], timestamp: Date.now() });
        this.notify();
        return;
      }
    }
  }

  deleteWords(transcriptId: string, wordIds: string[]): void {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return;

    // Only record actually-changed words in history; including already-deleted
    // words would cause undo() to incorrectly restore them even though a prior
    // delete operation owns that state.
    const changedIds: string[] = [];
    for (const para of transcript.paragraphs) {
      for (const word of para.words) {
        if (wordIds.includes(word.id) && !word.deleted) {
          word.deleted = true;
          changedIds.push(word.id);
        }
      }
    }

    if (changedIds.length > 0) {
      this.addToHistory({ type: 'delete', wordIds: changedIds, timestamp: Date.now() });
      this.notify();
    }
  }

  restoreWord(transcriptId: string, wordId: string): void {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return;

    for (const para of transcript.paragraphs) {
      const word = para.words.find(w => w.id === wordId);
      if (word) {
        word.deleted = false;
        this.addToHistory({ type: 'restore', wordIds: [wordId], timestamp: Date.now() });
        this.notify();
        return;
      }
    }
  }

  // ============================================================
  // Filler Word Removal
  // ============================================================

  private isFillerWord(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return FILLER_WORDS_EN.includes(lower) || FILLER_WORDS_JA.includes(lower);
  }

  removeFillerWords(transcriptId: string): number {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return 0;

    const removedIds: string[] = [];

    for (const para of transcript.paragraphs) {
      for (const word of para.words) {
        if (word.isFiller && !word.deleted) {
          word.deleted = true;
          removedIds.push(word.id);
        }
      }
    }

    if (removedIds.length > 0) {
      this.addToHistory({ type: 'delete', wordIds: removedIds, timestamp: Date.now() });
      this.notify();
    }

    return removedIds.length;
  }

  // ============================================================
  // Silence Detection & Removal
  // ============================================================

  detectSilences(transcriptId: string, minDuration = 0.5): SilenceRegion[] {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return [];

    const silences: SilenceRegion[] = [];
    const allWords = this.getAllWords(transcript).filter(w => !w.deleted);
    
    if (allWords.length === 0) return [];

    // Check silence at start
    if (allWords[0].start > minDuration) {
      silences.push({
        start: 0,
        end: allWords[0].start,
        duration: allWords[0].start
      });
    }

    // Check gaps between words
    for (let i = 0; i < allWords.length - 1; i++) {
      const gap = allWords[i + 1].start - allWords[i].end;
      if (gap >= minDuration) {
        silences.push({
          start: allWords[i].end,
          end: allWords[i + 1].start,
          duration: gap
        });
      }
    }

    // Check silence at end
    const lastWord = allWords[allWords.length - 1];
    if (transcript.duration - lastWord.end > minDuration) {
      silences.push({
        start: lastWord.end,
        end: transcript.duration,
        duration: transcript.duration - lastWord.end
      });
    }

    return silences;
  }

  removeSilences(transcriptId: string, minDuration = 0.5): number {
    const silences = this.detectSilences(transcriptId, minDuration);
    // Mark silence regions (would generate cut points)
    return silences.length;
  }

  // ============================================================
  // Speaker Management
  // ============================================================

  renameSpeaker(transcriptId: string, speakerId: string, newName: string): void {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return;

    const speaker = transcript.speakers.get(speakerId);
    if (speaker) {
      speaker.name = newName;
      this.notify();
    }
  }

  mergeSpeakers(transcriptId: string, sourceId: string, targetId: string): void {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return;

    for (const para of transcript.paragraphs) {
      if (para.speakerId === sourceId) {
        para.speakerId = targetId;
      }
      for (const word of para.words) {
        if (word.speaker === sourceId) {
          word.speaker = targetId;
        }
      }
    }

    transcript.speakers.delete(sourceId);
    this.notify();
  }

  // ============================================================
  // Search & Replace
  // ============================================================

  search(transcriptId: string, query: string): Word[] {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return [];

    const results: Word[] = [];
    const lower = query.toLowerCase();

    for (const para of transcript.paragraphs) {
      for (const word of para.words) {
        if (word.text.toLowerCase().includes(lower)) {
          results.push(word);
        }
      }
    }

    return results;
  }

  // ============================================================
  // Export
  // ============================================================

  exportSRT(transcriptId: string): string {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return '';

    const lines: string[] = [];
    let index = 1;

    for (const para of transcript.paragraphs) {
      const activeWords = para.words.filter(w => !w.deleted);
      if (activeWords.length === 0) continue;

      const text = activeWords.map(w => w.text).join(' ');
      const start = this.formatSRTTime(activeWords[0].start);
      const end = this.formatSRTTime(activeWords[activeWords.length - 1].end);

      lines.push(`${index}`);
      lines.push(`${start} --> ${end}`);
      lines.push(text);
      lines.push('');
      index++;
    }

    return lines.join('\n');
  }

  exportVTT(transcriptId: string): string {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return '';

    const lines: string[] = ['WEBVTT', ''];

    for (const para of transcript.paragraphs) {
      const activeWords = para.words.filter(w => !w.deleted);
      if (activeWords.length === 0) continue;

      const text = activeWords.map(w => w.text).join(' ');
      const start = this.formatVTTTime(activeWords[0].start);
      const end = this.formatVTTTime(activeWords[activeWords.length - 1].end);
      const speaker = transcript.speakers.get(para.speakerId);

      lines.push(`${start} --> ${end}`);
      if (speaker) {
        lines.push(`<v ${speaker.name}>${text}`);
      } else {
        lines.push(text);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  exportPlainText(transcriptId: string, includeSpeakers = false): string {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return '';

    const lines: string[] = [];

    for (const para of transcript.paragraphs) {
      const activeWords = para.words.filter(w => !w.deleted);
      if (activeWords.length === 0) continue;

      const text = activeWords.map(w => w.text).join(' ');
      
      if (includeSpeakers) {
        const speaker = transcript.speakers.get(para.speakerId);
        lines.push(`${speaker?.name || 'Unknown'}: ${text}`);
      } else {
        lines.push(text);
      }
    }

    return lines.join('\n\n');
  }

  private formatSRTTime(seconds: number): string {
    const { h, m, s, ms } = this.splitMs(seconds);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  private formatVTTTime(seconds: number): string {
    const { h, m, s, ms } = this.splitMs(seconds);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * 秒を h/m/s/ms 整数フィールドへ分解する。継続時間を整数ミリ秒へ **1度だけ
   * 丸めて** から純整数演算で導出する — 以前は `Math.floor((seconds % 1) * 1000)`
   * が浮動小数点表現誤差でミリ秒を1つ切り捨てており (例: 3.456s → ",455")、
   * captions/caption-manager.ts で修正済みの同じバグがこちらに残っていた。
   * 丸めによる桁上がり (例: 59.9996s → 00:01:00,000) も正しく処理する。
   */
  private splitMs(seconds: number): { h: number; m: number; s: number; ms: number } {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const ms = totalMs % 1000;
    const totalS = (totalMs - ms) / 1000;
    const s = totalS % 60;
    const totalM = (totalS - s) / 60;
    const m = totalM % 60;
    const h = (totalM - m) / 60;
    return { h, m, s, ms };
  }

  // ============================================================
  // Generate Edit Decision List
  // ============================================================

  generateEDL(transcriptId: string): Array<{ start: number; end: number }> {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return [];

    const segments: Array<{ start: number; end: number }> = [];
    const activeWords = this.getAllWords(transcript).filter(w => !w.deleted);

    if (activeWords.length === 0) return [];

    let currentSegment = { start: activeWords[0].start, end: activeWords[0].end };

    for (let i = 1; i < activeWords.length; i++) {
      const word = activeWords[i];
      const gap = word.start - currentSegment.end;

      // Merge if gap is small (< 0.1s)
      if (gap < 0.1) {
        currentSegment.end = word.end;
      } else {
        segments.push(currentSegment);
        currentSegment = { start: word.start, end: word.end };
      }
    }

    segments.push(currentSegment);
    return segments;
  }

  // ============================================================
  // Playback Sync
  // ============================================================

  setCurrentTime(time: number): void {
    this.currentTime = time;
    this.notify();
  }

  getCurrentWord(transcriptId: string): Word | null {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return null;

    for (const para of transcript.paragraphs) {
      for (const word of para.words) {
        if (!word.deleted && this.currentTime >= word.start && this.currentTime <= word.end) {
          return word;
        }
      }
    }

    return null;
  }

  getWordAtTime(transcriptId: string, time: number): Word | null {
    const transcript = this.transcripts.get(transcriptId);
    if (!transcript) return null;

    for (const para of transcript.paragraphs) {
      for (const word of para.words) {
        if (time >= word.start && time <= word.end) {
          return word;
        }
      }
    }

    return null;
  }

  // ============================================================
  // Undo/Redo
  // ============================================================

  private addToHistory(edit: TextEdit): void {
    // Remove any future history if we're not at the end
    this.editHistory = this.editHistory.slice(0, this.historyIndex + 1);
    this.editHistory.push(edit);
    this.historyIndex = this.editHistory.length - 1;
  }

  undo(): void {
    if (this.historyIndex < 0) return;

    const edit = this.editHistory[this.historyIndex];
    this.applyInverseEdit(edit);
    this.historyIndex--;
    this.notify();
  }

  redo(): void {
    if (this.historyIndex >= this.editHistory.length - 1) return;

    this.historyIndex++;
    const edit = this.editHistory[this.historyIndex];
    this.applyEdit(edit);
    this.notify();
  }

  private applyEdit(edit: TextEdit): void {
    // Apply edit forward
    for (const [, transcript] of this.transcripts) {
      for (const para of transcript.paragraphs) {
        for (const word of para.words) {
          if (edit.wordIds.includes(word.id)) {
            word.deleted = edit.type === 'delete';
          }
        }
      }
    }
  }

  private applyInverseEdit(edit: TextEdit): void {
    // Apply edit in reverse
    for (const [, transcript] of this.transcripts) {
      for (const para of transcript.paragraphs) {
        for (const word of para.words) {
          if (edit.wordIds.includes(word.id)) {
            word.deleted = edit.type !== 'delete';
          }
        }
      }
    }
  }

  // ============================================================
  // Utilities
  // ============================================================

  private getAllWords(transcript: Transcript): Word[] {
    const words: Word[] = [];
    for (const para of transcript.paragraphs) {
      words.push(...para.words);
    }
    return words.sort((a, b) => a.start - b.start);
  }

  getTranscript(id: string): Transcript | undefined {
    return this.transcripts.get(id);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

