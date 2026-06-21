/**
 * Tests for scopes/video-scopes.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WaveformScope,
  Vectorscope,
  HistogramScope,
  ScopesManager,
  type ScopeAnalysis,
} from '../scopes/video-scopes';

// ============================================================
// Helpers
// ============================================================

/** Build an ImageData with uniform pixel color. */
function solidImageData(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return new ImageData(data, w, h);
}

/** Returns true if OffscreenCanvas + transferToImageBitmap is available. */
function hasOffscreenCanvas(): boolean {
  try {
    const oc = new OffscreenCanvas(1, 1);
    oc.transferToImageBitmap();
    return true;
  } catch {
    return false;
  }
}

const canvasAvailable = hasOffscreenCanvas();

// ============================================================
// willReadFrequently — per-frame readback optimization (Qiita research)
// ============================================================

describe('willReadFrequently on the per-frame readback context', () => {
  it('extractImageData requests willReadFrequently:true for getImageData hot path', () => {
    // Record every getContext(type, options) the scope makes on its temp canvas.
    const calls: Array<[string, unknown]> = [];
    const RealOffscreen = globalThis.OffscreenCanvas;
    // Proxy returns a no-op function for any drawing call, and real data for
    // getImageData so analyze() can complete without a real canvas backend.
    const ctxStub = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'getImageData') {
          return (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4),
            width: w, height: h,
          });
        }
        return () => {};
      },
    }) as unknown as OffscreenCanvasRenderingContext2D;

    class RecordingCanvas {
      width: number; height: number;
      constructor(w: number, h: number) { this.width = w; this.height = h; }
      getContext(type: string, options?: unknown) { calls.push([type, options]); return ctxStub; }
      transferToImageBitmap() { return { width: this.width, height: this.height, close: () => {} }; }
    }
    globalThis.OffscreenCanvas = RecordingCanvas as unknown as typeof OffscreenCanvas;

    try {
      // setup.ts provides a no-arg FakeVideoFrame; the DOM lib types require
      // args, so construct via a cast.
      const FakeVF = globalThis.VideoFrame as unknown as { new (): VideoFrame };
      const frame = new FakeVF();
      const scope = new WaveformScope();
      scope.analyze(frame);

      // At least one 2d context must have been requested with willReadFrequently.
      const readContexts = calls.filter(
        ([type, opts]) => type === '2d' && (opts as { willReadFrequently?: boolean })?.willReadFrequently === true,
      );
      expect(readContexts.length).toBeGreaterThan(0);
    } finally {
      globalThis.OffscreenCanvas = RealOffscreen;
    }
  });
});

// ============================================================
// HistogramScope.getStats() — pure computation, no canvas
// ============================================================

describe('HistogramScope.getStats()', () => {
  let scope: HistogramScope;

  beforeEach(() => {
    scope = new HistogramScope();
  });

  it('all-white image: max R/G/B/Y = 255, min = 255', () => {
    const img = solidImageData(4, 4, 255, 255, 255);
    const stats = scope.getStats(img);
    expect(stats.max.r).toBe(255);
    expect(stats.max.g).toBe(255);
    expect(stats.max.b).toBe(255);
    expect(stats.min.r).toBe(255);
    expect(stats.min.g).toBe(255);
    expect(stats.min.b).toBe(255);
  });

  it('all-black image: min R/G/B = 0, max = 0', () => {
    const img = solidImageData(4, 4, 0, 0, 0);
    const stats = scope.getStats(img);
    expect(stats.min.r).toBe(0);
    expect(stats.min.g).toBe(0);
    expect(stats.min.b).toBe(0);
    expect(stats.max.r).toBe(0);
    expect(stats.max.g).toBe(0);
    expect(stats.max.b).toBe(0);
  });

  it('average is correct for uniform color', () => {
    const img = solidImageData(4, 4, 100, 150, 200);
    const stats = scope.getStats(img);
    expect(stats.average.r).toBeCloseTo(100);
    expect(stats.average.g).toBeCloseTo(150);
    expect(stats.average.b).toBeCloseTo(200);
  });

  it('luma (y) average matches BT.709 formula', () => {
    const r = 100, g = 150, b = 200;
    const img = solidImageData(4, 4, r, g, b);
    const stats = scope.getStats(img);
    const expected = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(stats.average.y).toBeCloseTo(expected, 1);
  });

  it('clipping.highlights detected for near-255 values', () => {
    const img = solidImageData(4, 4, 255, 255, 255);
    const stats = scope.getStats(img);
    expect(stats.clipping.highlights).toBeGreaterThan(0);
  });

  it('clipping.shadows detected for near-0 values', () => {
    const img = solidImageData(4, 4, 0, 0, 0);
    const stats = scope.getStats(img);
    expect(stats.clipping.shadows).toBeGreaterThan(0);
  });

  it('clipping percentages are in [0, 100]', () => {
    const img = solidImageData(4, 4, 128, 128, 128);
    const stats = scope.getStats(img);
    expect(stats.clipping.highlights).toBeGreaterThanOrEqual(0);
    expect(stats.clipping.highlights).toBeLessThanOrEqual(100);
    expect(stats.clipping.shadows).toBeGreaterThanOrEqual(0);
    expect(stats.clipping.shadows).toBeLessThanOrEqual(100);
  });

  it('skinTonePercentage is 0 for mid-gray image', () => {
    const img = solidImageData(4, 4, 128, 128, 128);
    const stats = scope.getStats(img);
    // Gray has u≈0 v≈0 → angle near 0 or undefined; 15-35 deg skin range not hit
    expect(stats.skinTonePercentage).toBe(0);
  });

  it('skinTonePercentage is in [0, 100]', () => {
    const img = solidImageData(4, 4, 200, 150, 100);
    const stats = scope.getStats(img);
    expect(stats.skinTonePercentage).toBeGreaterThanOrEqual(0);
    expect(stats.skinTonePercentage).toBeLessThanOrEqual(100);
  });

  it('returns finite neutral stats for an empty frame (no NaN from 0/0)', () => {
    // A zero-dimension/decode-glitch frame would make every "/ pixelCount"
    // a 0/0 = NaN, poisoning the realtime scope and any auto-grade.
    const empty = { data: new Uint8ClampedArray(0), width: 0, height: 0 } as unknown as ImageData;
    const stats = scope.getStats(empty);
    for (const v of [stats.average.r, stats.average.g, stats.average.b, stats.average.y,
      stats.clipping.shadows, stats.clipping.highlights, stats.skinTonePercentage]) {
      expect(Number.isNaN(v)).toBe(false);
    }
    expect(stats.average.y).toBe(0);
    expect(stats.skinTonePercentage).toBe(0);
  });

  it('ScopeAnalysis has all required fields', () => {
    const img = solidImageData(2, 2, 100, 120, 140);
    const stats: ScopeAnalysis = scope.getStats(img);
    expect(stats).toHaveProperty('min');
    expect(stats).toHaveProperty('max');
    expect(stats).toHaveProperty('average');
    expect(stats).toHaveProperty('clipping');
    expect(stats).toHaveProperty('skinTonePercentage');
  });
});

// ============================================================
// ScopesManager — pure enable/disable/toggle logic
// ============================================================

describe('ScopesManager enable/disable/toggle', () => {
  let manager: ScopesManager;

  beforeEach(() => {
    manager = new ScopesManager();
  });

  it('nothing enabled by default', () => {
    expect(manager.isEnabled('waveform')).toBe(false);
    expect(manager.isEnabled('vectorscope')).toBe(false);
    expect(manager.isEnabled('histogram')).toBe(false);
    expect(manager.isEnabled('parade')).toBe(false);
  });

  it('enable() makes scope enabled', () => {
    manager.enable('waveform');
    expect(manager.isEnabled('waveform')).toBe(true);
  });

  it('disable() after enable() makes scope not enabled', () => {
    manager.enable('histogram');
    manager.disable('histogram');
    expect(manager.isEnabled('histogram')).toBe(false);
  });

  it('toggle() returns true on first enable', () => {
    const result = manager.toggle('vectorscope');
    expect(result).toBe(true);
    expect(manager.isEnabled('vectorscope')).toBe(true);
  });

  it('toggle() returns false on second call (disable)', () => {
    manager.toggle('vectorscope');
    const result = manager.toggle('vectorscope');
    expect(result).toBe(false);
    expect(manager.isEnabled('vectorscope')).toBe(false);
  });

  it('multiple scope types can be enabled simultaneously', () => {
    manager.enable('waveform');
    manager.enable('histogram');
    manager.enable('vectorscope');
    expect(manager.isEnabled('waveform')).toBe(true);
    expect(manager.isEnabled('histogram')).toBe(true);
    expect(manager.isEnabled('vectorscope')).toBe(true);
  });
});

// ============================================================
// ScopesManager.analyze() — REGRESSION: parade mode persistence
// Canvas-dependent: skipped in non-canvas environments.
// ============================================================

describe('ScopesManager.analyze() — waveform mode persistence', () => {
  it.skipIf(!canvasAvailable)(
    'REGRESSION: enabling parade does not permanently set waveform mode to parade',
    () => {
      const manager = new ScopesManager();
      manager.setWaveformMode('rgb');
      manager.enable('waveform');
      manager.enable('parade');

      const img = solidImageData(10, 10, 128, 128, 128);

      // First analysis with both waveform and parade active
      const results1 = manager.analyze(img as unknown as VideoFrame);
      expect(results1.has('waveform')).toBe(true);
      expect(results1.has('parade')).toBe(true);

      // Disable parade; waveform should still work (and mode should be rgb, not parade)
      manager.disable('parade');
      const results2 = manager.analyze(img as unknown as VideoFrame);
      expect(results2.has('waveform')).toBe(true);
      expect(results2.has('parade')).toBe(false);

      // The internal waveformMode field should be 'rgb', not 'parade'
      const internal = manager as unknown as { waveformMode: string };
      expect(internal.waveformMode).toBe('rgb');
    }
  );

  it.skipIf(!canvasAvailable)(
    'setWaveformMode stores and applies the mode',
    () => {
      const manager = new ScopesManager();
      manager.setWaveformMode('parade');
      const internal = manager as unknown as { waveformMode: string };
      expect(internal.waveformMode).toBe('parade');
    }
  );

  it.skipIf(!canvasAvailable)(
    'analyze() with no scopes enabled returns empty map',
    () => {
      const manager = new ScopesManager();
      const img = solidImageData(4, 4, 100, 100, 100);
      const results = manager.analyze(img as unknown as VideoFrame);
      expect(results.size).toBe(0);
    }
  );

  it.skipIf(!canvasAvailable)(
    'analyze() returns bitmap for each enabled scope',
    () => {
      const manager = new ScopesManager();
      manager.enable('waveform');
      manager.enable('histogram');
      const img = solidImageData(8, 8, 200, 150, 100);
      const results = manager.analyze(img as unknown as VideoFrame);
      expect(results.has('waveform')).toBe(true);
      expect(results.has('histogram')).toBe(true);
      expect(results.has('vectorscope')).toBe(false);
    }
  );
});

// ============================================================
// WaveformScope / Vectorscope / HistogramScope analyze()
// ============================================================

describe('WaveformScope.analyze()', () => {
  it.skipIf(!canvasAvailable)('returns ImageBitmap for luma mode', () => {
    const scope = new WaveformScope({ width: 64, height: 64 });
    scope.setMode('luma');
    const img = solidImageData(8, 8, 128, 64, 32);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });

  it.skipIf(!canvasAvailable)('returns ImageBitmap for rgb mode', () => {
    const scope = new WaveformScope({ width: 64, height: 64 });
    scope.setMode('rgb');
    const img = solidImageData(8, 8, 100, 150, 200);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });

  it.skipIf(!canvasAvailable)('returns ImageBitmap for parade mode', () => {
    const scope = new WaveformScope({ width: 64, height: 64 });
    scope.setMode('parade');
    const img = solidImageData(8, 8, 200, 100, 50);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });
});

describe('Vectorscope.analyze()', () => {
  it.skipIf(!canvasAvailable)('returns ImageBitmap for standard mode', () => {
    const scope = new Vectorscope({ width: 64, height: 64 });
    scope.setMode('standard');
    const img = solidImageData(4, 4, 100, 150, 200);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });

  it.skipIf(!canvasAvailable)('returns ImageBitmap for skin-tone mode', () => {
    const scope = new Vectorscope({ width: 64, height: 64 });
    scope.setMode('skin-tone');
    const img = solidImageData(4, 4, 200, 150, 100);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });
});

describe('HistogramScope.analyze()', () => {
  it.skipIf(!canvasAvailable)('returns ImageBitmap for RGB mode', () => {
    const scope = new HistogramScope({ width: 64, height: 64 });
    scope.setShowRGB(true);
    const img = solidImageData(4, 4, 100, 150, 200);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });

  it.skipIf(!canvasAvailable)('returns ImageBitmap for luma mode', () => {
    const scope = new HistogramScope({ width: 64, height: 64 });
    scope.setShowRGB(false);
    const img = solidImageData(4, 4, 128, 128, 128);
    const bitmap = scope.analyze(img);
    expect(bitmap).toBeDefined();
  });
});
