/**
 * Scene Change Detector Tests
 *
 * Tests histogram computation, distance metrics, streaming detector,
 * and batch cut detection.
 */

import { describe, it, expect } from 'vitest';
import {
  computeLuminanceHistogram,
  chiSquareDistance,
  bhattacharyyaDistance,
  sadDistance,
  createSceneDetector,
  detectSceneCuts,
  type SceneDetectorConfig,
} from '../timeline/scene-detector';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a uniform RGBA frame (all pixels = same RGB value). */
function solidFrame(r: number, g: number, b: number, pixelCount = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Build a gradient RGBA frame (luma 0–255 across pixelCount pixels). */
function gradientFrame(pixelCount = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const v = Math.round((i / (pixelCount - 1)) * 255);
    data[i * 4]     = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Array of N identical frames. */
function identicalFrames(count: number, r = 100, g = 100, b = 100): Uint8ClampedArray[] {
  return Array.from({ length: count }, () => solidFrame(r, g, b));
}

// ─── computeLuminanceHistogram ────────────────────────────────────────────────

describe('computeLuminanceHistogram', () => {
  it('returns Float32Array of requested bin count', () => {
    const hist = computeLuminanceHistogram(solidFrame(128, 128, 128), 16);
    expect(hist).toBeInstanceOf(Float32Array);
    expect(hist.length).toBe(16);
  });

  it('sums to 1.0 for any non-empty frame', () => {
    const hist = computeLuminanceHistogram(gradientFrame(256), 16);
    const sum = hist.reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('all-black frame puts all weight in bin 0', () => {
    const hist = computeLuminanceHistogram(solidFrame(0, 0, 0), 16);
    expect(hist[0]).toBeCloseTo(1.0, 5);
    for (let i = 1; i < 16; i++) expect(hist[i]).toBe(0);
  });

  it('all-white frame puts all weight in last bin', () => {
    const hist = computeLuminanceHistogram(solidFrame(255, 255, 255), 16);
    expect(hist[15]).toBeCloseTo(1.0, 5);
    for (let i = 0; i < 15; i++) expect(hist[i]).toBe(0);
  });

  it('gradient frame distributes weight across bins', () => {
    const hist = computeLuminanceHistogram(gradientFrame(256), 16);
    const nonZero = hist.filter((v) => v > 0).length;
    expect(nonZero).toBeGreaterThan(8);
  });

  it('returns zero histogram for empty buffer', () => {
    const hist = computeLuminanceHistogram(new Uint8ClampedArray(0), 16);
    expect(hist.every((v) => v === 0)).toBe(true);
  });

  it('uses default 16 bins when omitted', () => {
    const hist = computeLuminanceHistogram(solidFrame(100, 100, 100));
    expect(hist.length).toBe(16);
  });

  it('supports custom bin count (32 bins)', () => {
    const hist = computeLuminanceHistogram(gradientFrame(128), 32);
    expect(hist.length).toBe(32);
    const sum = hist.reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

// ─── chiSquareDistance ────────────────────────────────────────────────────────

describe('chiSquareDistance', () => {
  it('returns 0 for identical histograms', () => {
    const h = computeLuminanceHistogram(solidFrame(120, 120, 120));
    expect(chiSquareDistance(h, h)).toBe(0);
  });

  it('returns value in [0, 1]', () => {
    const h1 = computeLuminanceHistogram(solidFrame(0, 0, 0));
    const h2 = computeLuminanceHistogram(solidFrame(255, 255, 255));
    const d = chiSquareDistance(h1, h2);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('is symmetric', () => {
    const h1 = computeLuminanceHistogram(solidFrame(50, 50, 50));
    const h2 = computeLuminanceHistogram(solidFrame(200, 200, 200));
    expect(chiSquareDistance(h1, h2)).toBeCloseTo(chiSquareDistance(h2, h1), 10);
  });

  it('black vs white produces high distance', () => {
    const h1 = computeLuminanceHistogram(solidFrame(0, 0, 0));
    const h2 = computeLuminanceHistogram(solidFrame(255, 255, 255));
    expect(chiSquareDistance(h1, h2)).toBeCloseTo(1, 5);
  });

  it('identical-colour frames produce distance near 0', () => {
    const h1 = computeLuminanceHistogram(solidFrame(128, 128, 128));
    const h2 = computeLuminanceHistogram(solidFrame(128, 128, 128));
    expect(chiSquareDistance(h1, h2)).toBeCloseTo(0, 5);
  });

  it('returns 0 for empty histograms', () => {
    const h = new Float32Array(0);
    expect(chiSquareDistance(h, h)).toBe(0);
  });
});

// ─── bhattacharyyaDistance ────────────────────────────────────────────────────

describe('bhattacharyyaDistance', () => {
  it('returns 0 for identical histograms', () => {
    const h = computeLuminanceHistogram(solidFrame(80, 80, 80));
    expect(bhattacharyyaDistance(h, h)).toBeCloseTo(0, 5);
  });

  it('returns value in [0, 1]', () => {
    const h1 = computeLuminanceHistogram(solidFrame(0, 0, 0));
    const h2 = computeLuminanceHistogram(solidFrame(255, 255, 255));
    const d = bhattacharyyaDistance(h1, h2);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('is symmetric', () => {
    const h1 = computeLuminanceHistogram(solidFrame(30, 30, 30));
    const h2 = computeLuminanceHistogram(solidFrame(220, 220, 220));
    expect(bhattacharyyaDistance(h1, h2)).toBeCloseTo(bhattacharyyaDistance(h2, h1), 10);
  });

  it('non-overlapping histograms produce high distance', () => {
    const h1 = computeLuminanceHistogram(solidFrame(0, 0, 0));
    const h2 = computeLuminanceHistogram(solidFrame(255, 255, 255));
    expect(bhattacharyyaDistance(h1, h2)).toBeGreaterThan(0.9);
  });
});

// ─── sadDistance ─────────────────────────────────────────────────────────────

describe('sadDistance', () => {
  it('returns 0 for identical histograms', () => {
    const h = computeLuminanceHistogram(solidFrame(100, 100, 100));
    expect(sadDistance(h, h)).toBe(0);
  });

  it('returns value in [0, 1]', () => {
    const h1 = computeLuminanceHistogram(solidFrame(0, 0, 0));
    const h2 = computeLuminanceHistogram(solidFrame(255, 255, 255));
    const d = sadDistance(h1, h2);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('is symmetric', () => {
    const h1 = computeLuminanceHistogram(solidFrame(40, 40, 40));
    const h2 = computeLuminanceHistogram(solidFrame(210, 210, 210));
    expect(sadDistance(h1, h2)).toBeCloseTo(sadDistance(h2, h1), 10);
  });

  it('non-overlapping histograms produce distance = 1', () => {
    const h1 = computeLuminanceHistogram(solidFrame(0, 0, 0));
    const h2 = computeLuminanceHistogram(solidFrame(255, 255, 255));
    expect(sadDistance(h1, h2)).toBeCloseTo(1, 5);
  });
});

// ─── createSceneDetector — basic ─────────────────────────────────────────────

describe('createSceneDetector — basic', () => {
  it('frameCount starts at 0', () => {
    const d = createSceneDetector();
    expect(d.frameCount).toBe(0);
  });

  it('increments frameCount on each addFrame call', () => {
    const d = createSceneDetector();
    d.addFrame(solidFrame(100, 100, 100), 8, 8);
    d.addFrame(solidFrame(100, 100, 100), 8, 8);
    expect(d.frameCount).toBe(2);
  });

  it('returns null for the very first frame (no previous frame)', () => {
    const d = createSceneDetector();
    expect(d.addFrame(solidFrame(100, 100, 100), 8, 8)).toBeNull();
  });

  it('returns null when consecutive frames are identical', () => {
    const d = createSceneDetector();
    d.addFrame(solidFrame(100, 100, 100), 8, 8);
    expect(d.addFrame(solidFrame(100, 100, 100), 8, 8)).toBeNull();
    expect(d.addFrame(solidFrame(100, 100, 100), 8, 8)).toBeNull();
  });

  it('returns SceneCut for dramatically different consecutive frames', () => {
    const d = createSceneDetector({ threshold: 0.3 });
    d.addFrame(solidFrame(0, 0, 0), 8, 8);
    const cut = d.addFrame(solidFrame(255, 255, 255), 8, 8);
    expect(cut).not.toBeNull();
    expect(cut!.frameIndex).toBe(1);
  });

  it('cut confidence is in [0, 1]', () => {
    const d = createSceneDetector({ threshold: 0.1 });
    d.addFrame(solidFrame(0, 0, 0), 8, 8);
    const cut = d.addFrame(solidFrame(255, 255, 255), 8, 8);
    expect(cut!.confidence).toBeGreaterThan(0);
    expect(cut!.confidence).toBeLessThanOrEqual(1);
  });
});

// ─── minSceneDuration debounce ────────────────────────────────────────────────

describe('minSceneDuration debounce', () => {
  it('suppresses cuts within minSceneDuration frames', () => {
    const d = createSceneDetector({ threshold: 0.1, minSceneDuration: 5 });
    // Alternate black-white every frame
    const cuts: number[] = [];
    for (let i = 0; i < 12; i++) {
      const frame = i % 2 === 0 ? solidFrame(0, 0, 0) : solidFrame(255, 255, 255);
      const cut = d.addFrame(frame, 8, 8);
      if (cut) cuts.push(cut.frameIndex);
    }
    // With minSceneDuration=5, cuts should be spaced ≥ 5 frames apart
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i] - cuts[i - 1]).toBeGreaterThanOrEqual(5);
    }
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset()', () => {
  it('resets frameCount to 0', () => {
    const d = createSceneDetector();
    d.addFrame(solidFrame(100, 100, 100), 8, 8);
    d.addFrame(solidFrame(100, 100, 100), 8, 8);
    d.reset();
    expect(d.frameCount).toBe(0);
  });

  it('after reset, first frame returns null (no previous)', () => {
    const d = createSceneDetector({ threshold: 0.1 });
    d.addFrame(solidFrame(0, 0, 0), 8, 8);
    d.addFrame(solidFrame(255, 255, 255), 8, 8);
    d.reset();
    const result = d.addFrame(solidFrame(255, 255, 255), 8, 8);
    expect(result).toBeNull();
  });
});

// ─── method selection ─────────────────────────────────────────────────────────

describe('method selection', () => {
  it.each(['chi-square', 'bhattacharyya', 'sad'] as const)(
    '%s detects hard cut between black and white',
    (method) => {
      const d = createSceneDetector({ method, threshold: 0.5 });
      d.addFrame(solidFrame(0, 0, 0), 8, 8);
      const cut = d.addFrame(solidFrame(255, 255, 255), 8, 8);
      expect(cut).not.toBeNull();
    }
  );
});

// ─── detectSceneCuts batch ────────────────────────────────────────────────────

describe('detectSceneCuts', () => {
  it('returns empty array for a single frame', () => {
    const frames = [solidFrame(100, 100, 100)];
    expect(detectSceneCuts(frames, 8, 8)).toEqual([]);
  });

  it('returns empty array when all frames are identical', () => {
    const cuts = detectSceneCuts(identicalFrames(10), 8, 8);
    expect(cuts).toEqual([]);
  });

  it('detects a single hard cut mid-sequence', () => {
    // 5 dark frames, then 5 bright frames
    const frames = [
      ...identicalFrames(5, 10, 10, 10),
      ...identicalFrames(5, 245, 245, 245),
    ];
    const cuts = detectSceneCuts(frames, 8, 8, { threshold: 0.5 });
    expect(cuts.length).toBe(1);
    expect(cuts[0].frameIndex).toBe(5);
  });

  it('detects multiple hard cuts', () => {
    const config: SceneDetectorConfig = { threshold: 0.5, minSceneDuration: 3 };
    const frames = [
      ...identicalFrames(4, 10, 10, 10),
      ...identicalFrames(4, 245, 245, 245),
      ...identicalFrames(4, 10, 10, 10),
    ];
    const cuts = detectSceneCuts(frames, 8, 8, config);
    expect(cuts.length).toBe(2);
    expect(cuts[0].frameIndex).toBe(4);
    expect(cuts[1].frameIndex).toBe(8);
  });

  it('cut confidence is non-zero for hard cuts', () => {
    const frames = [solidFrame(0, 0, 0), solidFrame(255, 255, 255)];
    const cuts = detectSceneCuts(frames, 8, 8, { threshold: 0.3 });
    expect(cuts.length).toBe(1);
    expect(cuts[0].confidence).toBeGreaterThan(0);
  });
});
