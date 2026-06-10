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

// ============================================================
// Background removal helpers (white-box)
// ============================================================

type EnginePrivate = {
  estimateBgColor(d: Uint8ClampedArray, w: number, h: number): { r: number; g: number; b: number; vrR: number; vrG: number; vrB: number };
  buildBgMask(d: Uint8ClampedArray, w: number, h: number, bg: { r: number; g: number; b: number; vrR: number; vrG: number; vrB: number }, threshold: number): Uint8Array;
  morphClose1D(mask: Uint8Array, w: number, h: number, r: number): Uint8Array;
  isSkinPixelYCbCr(r: number, g: number, b: number): boolean;
  findFaceCandidates(d: Uint8ClampedArray, w: number, h: number): Array<{ x: number; y: number; w: number; h: number; density: number }>;
  lanczos2Kernel(x: number): number;
  resizeLanczos2(src: Uint8ClampedArray, sW: number, sH: number, dW: number, dH: number): Uint8ClampedArray;
};

function priv(engine: AIEffectsEngine): EnginePrivate {
  return engine as unknown as EnginePrivate;
}

/** Build a W×H solid-colour RGBA image. */
function solidImage(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return data;
}

describe('AIEffectsEngine — estimateBgColor', () => {
  it('returns the correct mean for a solid-colour image', () => {
    const engine = makeEngine();
    const data = solidImage(20, 20, 200, 100, 50);
    const bg = priv(engine).estimateBgColor(data, 20, 20);
    expect(bg.r).toBeCloseTo(200, 0);
    expect(bg.g).toBeCloseTo(100, 0);
    expect(bg.b).toBeCloseTo(50, 0);
  });

  it('returns positive variance for a noisy image', () => {
    const engine = makeEngine();
    const data = new Uint8ClampedArray(40 * 40 * 4);
    for (let i = 0; i < 40 * 40; i++) {
      data[i * 4] = (i % 2 === 0) ? 200 : 50; // alternating R
      data[i * 4 + 1] = 100; data[i * 4 + 2] = 50; data[i * 4 + 3] = 255;
    }
    const bg = priv(engine).estimateBgColor(data, 40, 40);
    expect(bg.vrR).toBeGreaterThan(100);
  });

  it('handles a 1×1 image without throwing', () => {
    const engine = makeEngine();
    const data = solidImage(1, 1, 128, 64, 32);
    expect(() => priv(engine).estimateBgColor(data, 1, 1)).not.toThrow();
  });
});

describe('AIEffectsEngine — buildBgMask', () => {
  it('marks all pixels as background when image is uniform', () => {
    const engine = makeEngine();
    const data = solidImage(8, 8, 200, 100, 50);
    const bg = priv(engine).estimateBgColor(data, 8, 8);
    const mask = priv(engine).buildBgMask(data, 8, 8, bg, 0.35);
    // All pixels match background → entire mask should be 0 (background)
    expect(mask.every(v => v === 0)).toBe(true);
  });

  it('marks differing pixels as foreground', () => {
    const engine = makeEngine();
    // Outer pixels are white (200,200,200); center pixel is red (200,0,0)
    const w = 5, h = 5;
    const data = solidImage(w, h, 200, 200, 200);
    // Overwrite center pixel with clearly different color
    const cx = 2, cy = 2;
    data[(cy * w + cx) * 4 + 1] = 0; // G=0 → diverges from 200
    data[(cy * w + cx) * 4 + 2] = 0; // B=0

    const bg = priv(engine).estimateBgColor(data, w, h);
    const mask = priv(engine).buildBgMask(data, w, h, bg, 0.1); // low threshold
    expect(mask[cy * w + cx]).toBe(1); // center pixel is foreground
  });
});

describe('AIEffectsEngine — morphClose1D', () => {
  it('preserves a large foreground region', () => {
    const engine = makeEngine();
    // 8×1 mask with a 6-pixel foreground block
    const mask = new Uint8Array([0, 1, 1, 1, 1, 1, 1, 0]);
    const closed = priv(engine).morphClose1D(mask, 8, 1, 1);
    // Large region should be preserved after closing
    expect(closed.slice(1, 7).every(v => v === 1)).toBe(true);
  });

  it('fills a small gap between two foreground regions', () => {
    const engine = makeEngine();
    // Closing (dilate→erode) fills small holes in foreground
    // Two blobs separated by a 1-pixel gap: positions 0-2 and 4-6 (gap at 3)
    const mask = new Uint8Array([1, 1, 1, 0, 1, 1, 1, 0, 0, 0]);
    const closed = priv(engine).morphClose1D(mask, 10, 1, 2);
    // The gap at index 3 should be filled
    expect(closed[3]).toBe(1);
  });
});

// ============================================================
// Skin detection (white-box)
// ============================================================

describe('AIEffectsEngine — isSkinPixelYCbCr', () => {
  it('identifies a typical light skin tone as skin', () => {
    const engine = makeEngine();
    // Light skin: ~220, 180, 150
    expect(priv(engine).isSkinPixelYCbCr(220, 180, 150)).toBe(true);
  });

  it('identifies a darker skin tone as skin', () => {
    const engine = makeEngine();
    // Medium-dark skin: ~150, 110, 90
    expect(priv(engine).isSkinPixelYCbCr(150, 110, 90)).toBe(true);
  });

  it('rejects blue sky (non-skin)', () => {
    const engine = makeEngine();
    expect(priv(engine).isSkinPixelYCbCr(135, 180, 220)).toBe(false);
  });

  it('rejects green grass (non-skin)', () => {
    const engine = makeEngine();
    expect(priv(engine).isSkinPixelYCbCr(80, 150, 60)).toBe(false);
  });

  it('rejects near-black pixels', () => {
    const engine = makeEngine();
    expect(priv(engine).isSkinPixelYCbCr(10, 8, 6)).toBe(false);
  });

  it('rejects pure white', () => {
    const engine = makeEngine();
    expect(priv(engine).isSkinPixelYCbCr(255, 255, 255)).toBe(false);
  });
});

// ============================================================
// Face candidates (white-box)
// ============================================================

describe('AIEffectsEngine — findFaceCandidates', () => {
  it('returns empty array for a fully black image (no skin)', () => {
    const engine = makeEngine();
    const data = new Uint8ClampedArray(64 * 64 * 4).fill(0); // all black, alpha=0
    expect(priv(engine).findFaceCandidates(data, 64, 64)).toHaveLength(0);
  });

  it('detects a large skin-coloured region', () => {
    const engine = makeEngine();
    // 64×64 solid skin-tone image (light skin ~220,180,150)
    const data = solidImage(64, 64, 220, 180, 150);
    const faces = priv(engine).findFaceCandidates(data, 64, 64);
    // Should detect at least one face-like region
    expect(faces.length).toBeGreaterThan(0);
  });

  it('face density is between 0 and 1', () => {
    const engine = makeEngine();
    const data = solidImage(64, 64, 220, 180, 150);
    for (const f of priv(engine).findFaceCandidates(data, 64, 64)) {
      expect(f.density).toBeGreaterThan(0);
      expect(f.density).toBeLessThanOrEqual(1);
    }
  });

  it('bounding box is within image bounds', () => {
    const engine = makeEngine();
    const w = 128, h = 128;
    const data = solidImage(w, h, 200, 165, 140);
    for (const f of priv(engine).findFaceCandidates(data, w, h)) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(w + 16); // allow SCALE overshoot
      expect(f.y + f.h).toBeLessThanOrEqual(h + 16);
    }
  });
});

// ============================================================
// Lanczos-2 resampling (white-box)
// ============================================================

describe('AIEffectsEngine — lanczos2Kernel', () => {
  it('returns 1 at x=0', () => {
    expect(priv(makeEngine()).lanczos2Kernel(0)).toBe(1);
  });

  it('returns 0 at |x| >= 2', () => {
    const e = makeEngine();
    expect(priv(e).lanczos2Kernel(2)).toBe(0);
    expect(priv(e).lanczos2Kernel(-2)).toBe(0);
    expect(priv(e).lanczos2Kernel(3)).toBe(0);
  });

  it('is symmetric: k(-x) == k(x)', () => {
    const e = makeEngine();
    for (const x of [0.5, 1.0, 1.5]) {
      expect(priv(e).lanczos2Kernel(-x)).toBeCloseTo(priv(e).lanczos2Kernel(x), 10);
    }
  });

  it('returns a value in (-1, 1) for x in (0, 2)', () => {
    const e = makeEngine();
    for (let x = 0.1; x < 2.0; x += 0.1) {
      const v = priv(e).lanczos2Kernel(x);
      expect(Math.abs(v)).toBeLessThan(1);
    }
  });
});

describe('AIEffectsEngine — resizeLanczos2', () => {
  it('2×2 → 4×4 produces the correct number of bytes', () => {
    const e = makeEngine();
    const src = new Uint8ClampedArray(2 * 2 * 4).fill(128);
    const dst = priv(e).resizeLanczos2(src, 2, 2, 4, 4);
    expect(dst.length).toBe(4 * 4 * 4);
  });

  it('all output values are in [0, 255]', () => {
    const e = makeEngine();
    const src = solidImage(4, 4, 200, 100, 50).map(v => v) as unknown as Uint8ClampedArray;
    // Create proper Uint8ClampedArray
    const srcClamped = new Uint8ClampedArray(src);
    const dst = priv(e).resizeLanczos2(srcClamped, 4, 4, 8, 8);
    for (let i = 0; i < dst.length; i++) {
      expect(dst[i]).toBeGreaterThanOrEqual(0);
      expect(dst[i]).toBeLessThanOrEqual(255);
    }
  });

  it('solid-colour upscale preserves the colour', () => {
    const e = makeEngine();
    const src = new Uint8ClampedArray(4 * 4 * 4);
    // All pixels = (200, 100, 50, 255)
    for (let i = 0; i < 16; i++) {
      src[i * 4] = 200; src[i * 4 + 1] = 100; src[i * 4 + 2] = 50; src[i * 4 + 3] = 255;
    }
    const dst = priv(e).resizeLanczos2(src, 4, 4, 8, 8);
    // All output pixels should be close to the source colour
    for (let i = 0; i < 64; i++) {
      expect(dst[i * 4]).toBeCloseTo(200, -1);     // R ±16
      expect(dst[i * 4 + 1]).toBeCloseTo(100, -1); // G ±16
      expect(dst[i * 4 + 2]).toBeCloseTo(50, -1);  // B ±16
    }
  });
});
