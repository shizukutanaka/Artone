/**
 * Auto-Caption パイプライン テスト (SPEC G3)
 *
 * ASR(注入 recognizer) → transcribe → captions 自動字幕 / text-based 編集 の結線を検証。
 * 実 Whisper を使わず mock recognizer で plumbing をテストする。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIEffectsEngine,
  transcriptionToWords,
  type SpeechRecognizer,
  type TranscriptionResult,
} from '../ai/ai-effects-engine';
import { CaptionManager } from '../captions/caption-manager';
import { TextBasedEditor } from '../timeline/text-based-editing';

/** 決定論的な mock ASR バックエンド。 */
const mockRecognizer: SpeechRecognizer = {
  async transcribe(audio, options): Promise<TranscriptionResult> {
    return {
      language: options.language ?? 'en',
      duration: audio.length / options.sampleRate,
      segments: [
        {
          id: 's1',
          text: 'hello world',
          start: 0,
          end: 1,
          speaker: 'A',
          words: [
            { text: 'hello', start: 0, end: 0.5, confidence: 0.9 },
            { text: 'world', start: 0.5, end: 1, confidence: 0.95 },
          ],
        },
        {
          id: 's2',
          text: 'second line',
          start: 1.2,
          end: 2.2,
          speaker: 'A',
          words: [
            { text: 'second', start: 1.2, end: 1.7, confidence: 0.8 },
            { text: 'line', start: 1.7, end: 2.2, confidence: 0.85 },
          ],
        },
      ],
    };
  },
};

describe('AIEffectsEngine.transcribe', () => {
  let ai: AIEffectsEngine;
  beforeEach(() => {
    ai = new AIEffectsEngine();
  });

  it('throws when no recognizer is configured', async () => {
    await expect(ai.transcribe(new Float32Array(48000), 48000)).rejects.toThrow(/SpeechRecognizer/);
  });

  it('delegates to the injected recognizer and returns segments', async () => {
    ai.setSpeechRecognizer(mockRecognizer);
    const result = await ai.transcribe(new Float32Array(96000), 48000, { language: 'en' });
    expect(result.segments).toHaveLength(2);
    expect(result.language).toBe('en');
    expect(result.duration).toBeCloseTo(2, 5);
    // モデルが自動ロードされる
    expect(ai.isModelLoaded('whisper-base')).toBe(true);
  });

  it('throws for an unknown speech-recognition model', async () => {
    ai.setSpeechRecognizer(mockRecognizer);
    await expect(ai.transcribe(new Float32Array(48000), 48000, { modelId: 'bogus' })).rejects.toThrow(
      /Unknown speech-recognition model/
    );
  });
});

describe('transcriptionToWords', () => {
  it('flattens segments into timestamped words with speaker', async () => {
    const result = await mockRecognizer.transcribe(new Float32Array(96000), { sampleRate: 48000 });
    const words = transcriptionToWords(result);
    expect(words).toHaveLength(4);
    expect(words[0]).toMatchObject({ text: 'hello', start: 0, end: 0.5, speaker: 'A' });
    expect(words[3].text).toBe('line');
  });
});

describe('CaptionManager.importFromTranscription', () => {
  it('creates a caption cue per segment, skipping empty text', () => {
    const cm = new CaptionManager();
    const track = cm.importFromTranscription([
      { start: 0, end: 1, text: 'hello world' },
      { start: 1, end: 2, text: '   ' }, // 空 → スキップ
      { start: 2, end: 3, text: 'third' },
    ]);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].text).toBe('hello world');
    expect(track.captions[1].startTime).toBe(2);
  });
});

describe('end-to-end: ASR → captions + text-based editing', () => {
  it('produces a caption track and an editable transcript from one ASR result', async () => {
    const ai = new AIEffectsEngine();
    ai.setSpeechRecognizer(mockRecognizer);
    const result = await ai.transcribe(new Float32Array(96000), 48000);

    // 自動字幕トラック (セグメント単位)
    const cm = new CaptionManager();
    const track = cm.importFromTranscription(result.segments);
    expect(track.captions).toHaveLength(2);
    expect(track.captions[0].text).toBe('hello world');

    // テキストベース編集用トランスクリプト (単語単位)
    const editor = new TextBasedEditor();
    const transcript = editor.importTranscript('clip-1', transcriptionToWords(result));
    const wordCount = transcript.paragraphs.reduce((n, p) => n + p.words.length, 0);
    expect(wordCount).toBe(4);
  });
});
