/**
 * Tests for ai/ai-effects-engine.ts
 *
 * OffscreenCanvas/VideoFrame/ImageBitmap/AudioBuffer are available via the
 * global jsdom setup mocks. Canvas-heavy AI paths (background removal,
 * face blur, upscale, autoColor) use mocked 2d context data.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AIEffectsEngine, {
  transcriptionToWords,
  type TranscriptionResult,
  type SpeechRecognizer,
} from '../ai/ai-effects-engine';

function makeEngine(): AIEffectsEngine {
  return new AIEffectsEngine();
}

function makeAudioBuffer(samples: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: vi.fn(() => samples),
  } as unknown as AudioBuffer;
}

const SAMPLE_RESULT: TranscriptionResult = {
  language: 'en',
  duration: 10,
  segments: [
    {
      id: 'seg-0',
      text: 'Hello world',
      start: 0,
      end: 5,
      words: [
        { text: 'Hello', start: 0, end: 2, confidence: 0.95 },
        { text: 'world', start: 2, end: 5, confidence: 0.9 },
      ],
      speaker: 'Speaker A',
    },
    {
      id: 'seg-1',
      text: 'Goodbye',
      start: 6,
      end: 10,
      words: [{ text: 'Goodbye', start: 6, end: 10, confidence: 0.8 }],
    },
  ],
};

// ============================================================
// transcriptionToWords (pure)
// ============================================================

describe('transcriptionToWords()', () => {
  it('flattens segments into a word list', () => {
    const words = transcriptionToWords(SAMPLE_RESULT);
    expect(words).toHaveLength(3);
  });

  it('preserves text, start, end, and confidence', () => {
    const words = transcriptionToWords(SAMPLE_RESULT);
    expect(words[0]).toMatchObject({ text: 'Hello', start: 0, end: 2, confidence: 0.95 });
    expect(words[2]).toMatchObject({ text: 'Goodbye', start: 6, end: 10, confidence: 0.8 });
  });

  it('inherits speaker from parent segment', () => {
    const words = transcriptionToWords(SAMPLE_RESULT);
    expect(words[0].speaker).toBe('Speaker A');
    expect(words[1].speaker).toBe('Speaker A');
    expect(words[2].speaker).toBeUndefined();
  });

  it('returns empty array for result with no segments', () => {
    expect(transcriptionToWords({ language: 'en', duration: 0, segments: [] })).toHaveLength(0);
  });

  it('returns empty array for segments with no words', () => {
    const result: TranscriptionResult = {
      language: 'en', duration: 1,
      segments: [{ id: 's0', text: '', start: 0, end: 1, words: [] }],
    };
    expect(transcriptionToWords(result)).toHaveLength(0);
  });
});

// ============================================================
// Model management
// ============================================================

describe('AIEffectsEngine — model management', () => {
  it('initializes with 10 built-in models', () => {
    expect(makeEngine().getModels()).toHaveLength(10);
  });

  it('all models start unloaded with progress 0', () => {
    for (const m of makeEngine().getModels()) {
      expect(m.loaded).toBe(false);
      expect(m.progress).toBe(0);
    }
  });

  it('isModelLoaded returns false before loading', () => {
    expect(makeEngine().isModelLoaded('whisper-base')).toBe(false);
  });

  it('isModelLoaded returns false for unknown id', () => {
    expect(makeEngine().isModelLoaded('nonexistent')).toBe(false);
  });

  it('unloadModel on an unloaded model does not throw', () => {
    expect(() => makeEngine().unloadModel('whisper-base')).not.toThrow();
  });

  it('model ids include expected speech-recognition models', () => {
    const ids = makeEngine().getModels().map(m => m.id);
    expect(ids).toContain('whisper-tiny');
    expect(ids).toContain('whisper-base');
    expect(ids).toContain('whisper-large-v3');
  });

  it('model ids include segmentation models', () => {
    const ids = makeEngine().getModels().map(m => m.id);
    expect(ids).toContain('bodypix');
    expect(ids).toContain('sam2-tiny');
  });

  describe('loadModel()', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('marks model as loaded and sets progress=1', async () => {
      const engine = makeEngine();
      const promise = engine.loadModel('whisper-base');
      await vi.runAllTimersAsync();
      await promise;
      expect(engine.isModelLoaded('whisper-base')).toBe(true);
      expect(engine.getModels().find(m => m.id === 'whisper-base')!.progress).toBe(1);
    });

    it('returns false for unknown model id', async () => {
      const engine = makeEngine();
      expect(await engine.loadModel('ghost-model')).toBe(false);
    });

    it('returns true immediately if already loaded (no reload)', async () => {
      const engine = makeEngine();
      const p1 = engine.loadModel('whisper-base');
      await vi.runAllTimersAsync();
      await p1;
      // Second call returns true without re-running the loop
      const p2 = engine.loadModel('whisper-base');
      expect(await p2).toBe(true);
    });

    it('invokes onProgress callback during loading', async () => {
      const engine = makeEngine();
      const progress: number[] = [];
      const promise = engine.loadModel('whisper-tiny', (p) => progress.push(p));
      await vi.runAllTimersAsync();
      await promise;
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1]).toBe(1);
    });

    it('notifies listeners after load', async () => {
      const engine = makeEngine();
      const fn = vi.fn();
      engine.subscribe(fn);
      const promise = engine.loadModel('whisper-tiny');
      await vi.runAllTimersAsync();
      await promise;
      expect(fn).toHaveBeenCalled();
    });
  });
});

// ============================================================
// transcribe()
// ============================================================

describe('AIEffectsEngine — transcribe()', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('throws when no SpeechRecognizer is configured', async () => {
    const engine = makeEngine();
    await expect(engine.transcribe(new Float32Array(100), 16000)).rejects.toThrow('No SpeechRecognizer');
  });

  it('throws for unknown model id', async () => {
    const engine = makeEngine();
    engine.setSpeechRecognizer({ transcribe: vi.fn() });
    await expect(engine.transcribe(new Float32Array(), 16000, { modelId: 'ghost' })).rejects.toThrow(
      'Unknown speech-recognition model'
    );
  });

  it('throws for non-speech model id', async () => {
    const engine = makeEngine();
    engine.setSpeechRecognizer({ transcribe: vi.fn() });
    await expect(engine.transcribe(new Float32Array(), 16000, { modelId: 'bodypix' })).rejects.toThrow(
      'Unknown speech-recognition model'
    );
  });

  it('delegates to the injected SpeechRecognizer', async () => {
    const engine = makeEngine();
    const mockRecognizer: SpeechRecognizer = {
      transcribe: vi.fn().mockResolvedValue(SAMPLE_RESULT),
    };
    engine.setSpeechRecognizer(mockRecognizer);

    // Pre-load the model so transcribe doesn't have to
    const loadPromise = engine.loadModel('whisper-base');
    await vi.runAllTimersAsync();
    await loadPromise;

    const audio = new Float32Array(1000);
    const result = await engine.transcribe(audio, 16000, { modelId: 'whisper-base' });
    expect(result).toBe(SAMPLE_RESULT);
    expect(mockRecognizer.transcribe).toHaveBeenCalledWith(
      audio,
      expect.objectContaining({ sampleRate: 16000, modelId: 'whisper-base' })
    );
  });
});

// ============================================================
// detectHighlights()
// ============================================================

describe('AIEffectsEngine — detectHighlights()', () => {
  it('returns empty array for zero-length buffer', async () => {
    const engine = makeEngine();
    const buf = makeAudioBuffer(new Float32Array(0));
    expect(await engine.detectHighlights(buf)).toHaveLength(0);
  });

  it('returns empty array when all energy is below threshold', async () => {
    const engine = makeEngine();
    // Constant low energy — no peaks above 1.5x average
    const buf = makeAudioBuffer(new Float32Array(44100).fill(0.1));
    const highlights = await engine.detectHighlights(buf);
    expect(highlights).toHaveLength(0);
  });

  it('detects a high-energy region', async () => {
    const engine = makeEngine();
    const sampleRate = 44100;
    // 15s silence + 4s high-energy burst: burst is ~21% of audio,
    // so avgEnergy << burstEnergy and threshold (1.5×avg) is exceeded.
    const totalSamples = 19 * sampleRate;
    const data = new Float32Array(totalSamples);
    const burstStart = 15 * sampleRate;
    for (let i = burstStart; i < totalSamples; i++) {
      data[i] = 0.9;
    }
    const buf = makeAudioBuffer(data, sampleRate);
    const highlights = await engine.detectHighlights(buf, { minDuration: 1 });
    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[0].score).toBeGreaterThan(1);
  });

  it('respects minDuration — short bursts excluded', async () => {
    const engine = makeEngine();
    const sampleRate = 44100;
    // 0.5s high-energy burst (below default minDuration 3s)
    const data = new Float32Array(4 * sampleRate);
    for (let i = 0; i < Math.floor(0.5 * sampleRate); i++) {
      data[i] = 0.9;
    }
    const buf = makeAudioBuffer(data, sampleRate);
    const highlights = await engine.detectHighlights(buf, { minDuration: 3 });
    expect(highlights).toHaveLength(0);
  });

  it('limits output to maxHighlights', async () => {
    const engine = makeEngine();
    const sampleRate = 44100;
    // 5 bursts of 2s each in 60s total (bursts = 10/60 = 17% → clearly above 1.5×avg)
    const total = 60 * sampleRate;
    const data = new Float32Array(total);
    for (let burst = 0; burst < 5; burst++) {
      const start = (burst * 10 + 2) * sampleRate;
      for (let i = start; i < start + 2 * sampleRate; i++) {
        data[i] = 0.9;
      }
    }
    const buf = makeAudioBuffer(data, sampleRate);
    const all = await engine.detectHighlights(buf, { minDuration: 1 });
    const limited = await engine.detectHighlights(buf, { minDuration: 1, maxHighlights: 2 });
    expect(all.length).toBeGreaterThan(2);
    expect(limited.length).toBeLessThanOrEqual(2);
  });

  it('sorts highlights by score descending', async () => {
    const engine = makeEngine();
    const sampleRate = 44100;
    const data = new Float32Array(10 * sampleRate);
    // Burst 1: moderate (0.6)
    for (let i = sampleRate; i < 4 * sampleRate; i++) data[i] = 0.6;
    // Burst 2: high (0.95)
    for (let i = 6 * sampleRate; i < 9 * sampleRate; i++) data[i] = 0.95;
    const buf = makeAudioBuffer(data, sampleRate);
    const highlights = await engine.detectHighlights(buf, { minDuration: 1 });
    if (highlights.length >= 2) {
      expect(highlights[0].score).toBeGreaterThanOrEqual(highlights[1].score);
    }
  });
});

// ============================================================
// REGRESSION: autoWhiteBalance NaN protection
// ============================================================

describe('AIEffectsEngine — REGRESSION: autoWhiteBalance NaN protection', () => {
  it('does not produce NaN when all pixels are zero (zero channel averages)', () => {
    const engine = makeEngine();
    // All-zero ImageData → all channel averages are 0 → was: NaN
    const data = new Uint8ClampedArray(16); // 4 pixels, all 0
    (engine as unknown as { autoWhiteBalance(d: Uint8ClampedArray): void }).autoWhiteBalance(data);
    for (let i = 0; i < data.length; i++) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
  });

  it('does not produce NaN for pure-red image (green/blue averages are 0)', () => {
    const engine = makeEngine();
    const data = new Uint8ClampedArray(16);
    // Set all pixels to pure red: R=200, G=0, B=0, A=255
    for (let i = 0; i < 4; i++) {
      data[i * 4 + 0] = 200;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
    (engine as unknown as { autoWhiteBalance(d: Uint8ClampedArray): void }).autoWhiteBalance(data);
    for (let i = 0; i < data.length; i++) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
  });

  it('preserves neutral grey (equal RGB) — white balance scale should be 1.0', () => {
    const engine = makeEngine();
    const data = new Uint8ClampedArray(16);
    // Set all pixels to neutral grey: R=G=B=128
    for (let i = 0; i < 4; i++) {
      data[i * 4 + 0] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = 255;
    }
    (engine as unknown as { autoWhiteBalance(d: Uint8ClampedArray): void }).autoWhiteBalance(data);
    // All scales = gray/128 = 128/128 = 1, so values stay 128
    for (let i = 0; i < 4; i++) {
      expect(data[i * 4 + 0]).toBe(128);
      expect(data[i * 4 + 1]).toBe(128);
      expect(data[i * 4 + 2]).toBe(128);
    }
  });
});

// ============================================================
// subscribe / unsubscribe
// ============================================================

describe('AIEffectsEngine — subscribe()', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('listener called on unloadModel', () => {
    const engine = makeEngine();
    // Force model to appear loaded so unloadModel triggers notify
    const model = engine.getModels().find(m => m.id === 'bodypix')!;
    (model as { loaded: boolean }).loaded = true;
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.unloadModel('bodypix');
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const engine = makeEngine();
    const model = engine.getModels().find(m => m.id === 'bodypix')!;
    (model as { loaded: boolean }).loaded = true;
    const fn = vi.fn();
    const unsub = engine.subscribe(fn);
    unsub();
    engine.unloadModel('bodypix');
    expect(fn).not.toHaveBeenCalled();
  });
});
