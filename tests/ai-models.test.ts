/**
 * AI Effects Engine — モデルメタデータテスト
 *
 * 量子化形式 (Q8/FP16/Q4) とバックエンド (WebGPU/WASM) の整合性を検証。
 * Transformers.js + ONNX Runtime Web のローカル推論前提。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIEffectsEngine } from '../ai/ai-effects-engine';

describe('AIEffectsEngine — モデルカタログ', () => {
  let ai: AIEffectsEngine;
  beforeEach(() => { ai = new AIEffectsEngine(); });

  it('includes SAM2 video segmentation model', () => {
    const sam2 = ai.getModels().find((m) => m.id === 'sam2-tiny');
    expect(sam2).toBeTruthy();
    expect(sam2?.type).toBe('segmentation');
  });

  it('includes Whisper Large V3', () => {
    const whisper = ai.getModels().find((m) => m.id === 'whisper-large-v3');
    expect(whisper).toBeTruthy();
    expect(whisper?.type).toBe('speech-recognition');
  });

  it('all models have quantization metadata', () => {
    for (const m of ai.getModels()) {
      expect(m.quantization).toBeTruthy();
      expect(['fp32', 'fp16', 'q8', 'q4']).toContain(m.quantization);
    }
  });

  it('all models specify a backend', () => {
    for (const m of ai.getModels()) {
      expect(['webgpu', 'wasm']).toContain(m.backend);
    }
  });

  it('larger models use more aggressive quantization', () => {
    // Whisper Large V3 (1550MB) は q4 で圧縮
    const large = ai.getModels().find((m) => m.id === 'whisper-large-v3');
    expect(large?.quantization).toBe('q4');
  });

  it('models start unloaded', () => {
    for (const m of ai.getModels()) {
      expect(m.loaded).toBe(false);
      expect(m.progress).toBe(0);
    }
  });

  it('speech-recognition models cover tiny/base/large tiers', () => {
    const speech = ai.getModels().filter((m) => m.type === 'speech-recognition');
    const ids = speech.map((m) => m.id);
    expect(ids).toContain('whisper-tiny');
    expect(ids).toContain('whisper-base');
    expect(ids).toContain('whisper-large-v3');
    // サイズが tiny < base < large の順
    const tiny = speech.find((m) => m.id === 'whisper-tiny')!;
    const base = speech.find((m) => m.id === 'whisper-base')!;
    const large = speech.find((m) => m.id === 'whisper-large-v3')!;
    expect(tiny.size).toBeLessThan(base.size);
    expect(base.size).toBeLessThan(large.size);
  });
});
