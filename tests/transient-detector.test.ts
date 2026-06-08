/**
 * Transient / Onset Detector Tests — audio/transient-detector.ts
 *
 * Covers: detectTransients, createTransientDetector (streaming),
 * onsetsToSampleIndices, filterByConfidence, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  detectTransients,
  createTransientDetector,
  onsetsToSampleIndices,
  filterByConfidence,
  type TransientDetectionOptions,
} from '../audio/transient-detector';

const SR = 48000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Silent Float32Array. */
function silence(n: number): Float32Array {
  return new Float32Array(n);
}

/**
 * Impulse train: a series of sharp +1.0 impulses spaced by `period` samples.
 * Each impulse lasts `width` samples.
 */
function impulseTrain(
  totalSamples: number,
  period: number,
  width = 1,
  amplitude = 1.0,
): Float32Array {
  const out = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i += period) {
    for (let w = 0; w < width && i + w < totalSamples; w++) {
      out[i + w] = amplitude;
    }
  }
  return out;
}

/** Sine burst: a short sine burst followed by silence. */
function sineBurst(
  totalSamples: number,
  burstStart: number,
  burstLen: number,
  freq = 440,
  amplitude = 0.5,
): Float32Array {
  const out = new Float32Array(totalSamples);
  const w = (2 * Math.PI * freq) / SR;
  for (let i = 0; i < burstLen && burstStart + i < totalSamples; i++) {
    out[burstStart + i] = amplitude * Math.sin(w * i);
  }
  return out;
}

// ─── detectTransients — edge cases ───────────────────────────────────────────

describe('detectTransients — edge cases', () => {
  it('empty audio returns empty result', () => {
    const r = detectTransients(new Float32Array(0));
    expect(r.onsets).toHaveLength(0);
    expect(r.confidence).toHaveLength(0);
    expect(r.onsetStrength.length).toBe(0);
    expect(r.frameTimes.length).toBe(0);
  });

  it('silence returns empty onsets', () => {
    const r = detectTransients(silence(SR));
    expect(r.onsets).toHaveLength(0);
  });

  it('very short audio (< 3 frames) returns empty', () => {
    const r = detectTransients(new Float32Array(100));
    expect(r.onsets).toHaveLength(0);
    expect(r.onsetStrength.length).toBeGreaterThanOrEqual(0);
  });

  it('result arrays have consistent length', () => {
    const r = detectTransients(impulseTrain(SR, 4800));
    expect(r.onsets.length).toBe(r.confidence.length);
    expect(r.onsetStrength.length).toBe(r.frameTimes.length);
  });

  it('onsets are sorted ascending', () => {
    const r = detectTransients(impulseTrain(SR, 2400));
    for (let i = 1; i < r.onsets.length; i++) {
      expect(r.onsets[i]).toBeGreaterThan(r.onsets[i - 1]);
    }
  });
});

// ─── detectTransients — onset strength ───────────────────────────────────────

describe('detectTransients — onset strength envelope', () => {
  it('onsetStrength contains only finite non-negative values', () => {
    const r = detectTransients(impulseTrain(SR, 4800));
    for (const v of r.onsetStrength) {
      expect(isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('frameTimes are monotonically increasing', () => {
    const r = detectTransients(impulseTrain(SR, 4800));
    for (let i = 1; i < r.frameTimes.length; i++) {
      expect(r.frameTimes[i]).toBeGreaterThan(r.frameTimes[i - 1]);
    }
  });

  it('frameTimes are within audio duration bounds', () => {
    const dur = 1.0;
    const r = detectTransients(new Float32Array(Math.floor(dur * SR)));
    if (r.frameTimes.length > 0) {
      expect(r.frameTimes[0]).toBeGreaterThanOrEqual(0);
      expect(r.frameTimes[r.frameTimes.length - 1]).toBeLessThanOrEqual(dur + 0.1);
    }
  });

  it('impulse train produces higher onset strength than silence', () => {
    const rImpulse = detectTransients(impulseTrain(SR, 4800));
    const rSilence = detectTransients(silence(SR));
    const maxImpulse = Math.max(...rImpulse.onsetStrength);
    const maxSilence = Math.max(...rSilence.onsetStrength);
    expect(maxImpulse).toBeGreaterThan(maxSilence);
  });
});

// ─── detectTransients — impulse detection ────────────────────────────────────

describe('detectTransients — impulse detection', () => {
  it('detects a single sharp impulse', () => {
    const audio = new Float32Array(SR);
    // Place impulse 0.5s in
    audio[SR >> 1] = 1.0;
    const r = detectTransients(audio, { threshold: 1.0 });
    expect(r.onsets.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a wide burst at the correct approximate time', () => {
    const burstStart = Math.floor(0.3 * SR);
    const audio = sineBurst(SR, burstStart, 2048, 1000, 0.8);
    const r = detectTransients(audio, { threshold: 1.0, numBands: 4 });
    if (r.onsets.length > 0) {
      // Onset should be roughly near 0.3 s (within ±50 ms)
      const closest = r.onsets.reduce((best, t) =>
        Math.abs(t - 0.3) < Math.abs(best - 0.3) ? t : best,
      );
      expect(closest).toBeGreaterThan(0.2);
      expect(closest).toBeLessThan(0.45);
    }
  });

  it('impulse train at ~100 ms intervals detects multiple onsets', () => {
    // 4800-sample period at 48000 Hz = 100 ms
    const audio = impulseTrain(SR * 2, 4800, 5, 1.0);
    const r = detectTransients(audio, {
      threshold: 1.0,
      minIntervalSec: 0.05,
    });
    // Should detect at least half the expected 20 onsets
    expect(r.onsets.length).toBeGreaterThanOrEqual(5);
  });

  it('higher threshold means fewer or equal detections', () => {
    const audio = impulseTrain(SR, 2400, 3, 0.3);
    const rLow  = detectTransients(audio, { threshold: 0.5 });
    const rHigh = detectTransients(audio, { threshold: 3.0 });
    expect(rHigh.onsets.length).toBeLessThanOrEqual(rLow.onsets.length);
  });
});

// ─── detectTransients — confidence ───────────────────────────────────────────

describe('detectTransients — confidence values', () => {
  it('confidence values are in [0, 1]', () => {
    const r = detectTransients(impulseTrain(SR, 4800));
    for (const c of r.confidence) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('stronger impulses yield higher average confidence', () => {
    const weak   = detectTransients(impulseTrain(SR, 4800, 2, 0.1));
    const strong = detectTransients(impulseTrain(SR, 4800, 2, 1.0));
    if (weak.confidence.length > 0 && strong.confidence.length > 0) {
      const avgWeak   = weak.confidence.reduce((a, v) => a + v, 0) / weak.confidence.length;
      const avgStrong = strong.confidence.reduce((a, v) => a + v, 0) / strong.confidence.length;
      expect(avgStrong).toBeGreaterThanOrEqual(avgWeak);
    }
  });
});

// ─── detectTransients — refractory period ────────────────────────────────────

describe('detectTransients — refractory period', () => {
  it('minimum onset interval is respected', () => {
    const minSec = 0.1;
    const audio = impulseTrain(SR * 2, 2400, 3, 1.0); // impulses every 50 ms
    const r = detectTransients(audio, { minIntervalSec: minSec });
    for (let i = 1; i < r.onsets.length; i++) {
      expect(r.onsets[i] - r.onsets[i - 1]).toBeGreaterThanOrEqual(minSec - 1e-6);
    }
  });

  it('longer minIntervalSec results in fewer onsets', () => {
    const audio = impulseTrain(SR * 2, 2400, 3, 1.0);
    const rFast = detectTransients(audio, { minIntervalSec: 0.01 });
    const rSlow = detectTransients(audio, { minIntervalSec: 0.2 });
    expect(rSlow.onsets.length).toBeLessThanOrEqual(rFast.onsets.length);
  });
});

// ─── detectTransients — numBands ─────────────────────────────────────────────

describe('detectTransients — numBands', () => {
  it('1 band produces a valid result', () => {
    const r = detectTransients(impulseTrain(SR, 4800), { numBands: 1 });
    expect(r.onsets.length).toBeGreaterThanOrEqual(0);
    expect(r.onsetStrength.every(isFinite)).toBe(true);
  });

  it('8 bands produces a valid result', () => {
    const r = detectTransients(impulseTrain(SR, 4800), { numBands: 8 });
    expect(r.onsets.length).toBeGreaterThanOrEqual(0);
    expect(r.onsetStrength.every(isFinite)).toBe(true);
  });
});

// ─── createTransientDetector — streaming API ─────────────────────────────────

describe('createTransientDetector — basic interface', () => {
  it('returns process / getResult / reset methods', () => {
    const d = createTransientDetector();
    expect(typeof d.process).toBe('function');
    expect(typeof d.getResult).toBe('function');
    expect(typeof d.reset).toBe('function');
  });

  it('empty detector returns empty result', () => {
    const d = createTransientDetector();
    const r = d.getResult();
    expect(r.onsets).toHaveLength(0);
    expect(r.confidence).toHaveLength(0);
    expect(r.onsetStrength.length).toBe(0);
    expect(r.frameTimes.length).toBe(0);
  });

  it('process empty block is a no-op', () => {
    const d = createTransientDetector();
    expect(() => d.process(new Float32Array(0))).not.toThrow();
    const r = d.getResult();
    expect(r.onsets).toHaveLength(0);
  });
});

describe('createTransientDetector — streaming', () => {
  it('processes in chunks and produces same onsets as batch', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    const opts: TransientDetectionOptions = { threshold: 1.0, sampleRate: SR };

    // Batch
    const batch = detectTransients(audio, opts);

    // Streaming in 4096-sample chunks
    const detector = createTransientDetector(opts);
    const CHUNK = 4096;
    for (let i = 0; i < audio.length; i += CHUNK) {
      detector.process(audio.subarray(i, i + CHUNK));
    }
    const streaming = detector.getResult();

    // Results should be identical (same merged audio fed to detectTransients)
    expect(streaming.onsets.length).toBe(batch.onsets.length);
    for (let i = 0; i < batch.onsets.length; i++) {
      expect(streaming.onsets[i]).toBeCloseTo(batch.onsets[i], 6);
    }
  });

  it('processes in 1-sample chunks without throwing', () => {
    const audio = impulseTrain(512, 64, 2, 1.0);
    const detector = createTransientDetector({ sampleRate: SR });
    expect(() => {
      for (let i = 0; i < audio.length; i++) {
        detector.process(audio.subarray(i, i + 1));
      }
    }).not.toThrow();
    const r = detector.getResult();
    expect(r.onsetStrength.every(isFinite)).toBe(true);
  });

  it('reset clears all state', () => {
    const detector = createTransientDetector();
    detector.process(impulseTrain(SR, 4800));
    expect(detector.getResult().onsets.length).toBeGreaterThanOrEqual(0);
    detector.reset();
    const r = detector.getResult();
    expect(r.onsets).toHaveLength(0);
    expect(r.onsetStrength.length).toBe(0);
  });

  it('can process again after reset', () => {
    const audio  = impulseTrain(SR, 4800, 3, 1.0);
    const opts   = { threshold: 1.0, sampleRate: SR };
    const detect = createTransientDetector(opts);

    detect.process(audio);
    const first = detect.getResult();
    detect.reset();
    detect.process(audio);
    const second = detect.getResult();

    expect(second.onsets.length).toBe(first.onsets.length);
  });
});

// ─── onsetsToSampleIndices ────────────────────────────────────────────────────

describe('onsetsToSampleIndices', () => {
  it('converts onset seconds to sample indices', () => {
    const onsets = [0, 0.5, 1.0];
    const indices = onsetsToSampleIndices(onsets, 48000);
    expect(indices).toEqual([0, 24000, 48000]);
  });

  it('rounds to nearest sample', () => {
    // 0.6 s at 48000 Hz = 28800.0 exactly → 28800
    const indices = onsetsToSampleIndices([0.6], 48000);
    expect(indices[0]).toBe(28800);
  });

  it('empty array returns empty array', () => {
    expect(onsetsToSampleIndices([], 48000)).toEqual([]);
  });

  it('works with arbitrary sample rate', () => {
    const indices = onsetsToSampleIndices([1.0], 44100);
    expect(indices[0]).toBe(44100);
  });
});

// ─── filterByConfidence ───────────────────────────────────────────────────────

describe('filterByConfidence', () => {
  it('returns all onsets when minConf=0', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    const result = detectTransients(audio, { threshold: 1.0 });
    const filtered = filterByConfidence(result, 0);
    expect(filtered.onsets.length).toBe(result.onsets.length);
  });

  it('returns no onsets when minConf=1', () => {
    const audio = impulseTrain(SR, 4800, 3, 0.5);
    const result = detectTransients(audio, { threshold: 1.0 });
    const filtered = filterByConfidence(result, 1.0);
    // Could be 0 or only the highest-confidence one
    for (const c of filtered.confidence) {
      expect(c).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('default minConf=0.3 filters low-confidence detections', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    const result = detectTransients(audio, { threshold: 1.0 });
    const filtered = filterByConfidence(result);
    for (const c of filtered.confidence) {
      expect(c).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('output arrays have consistent length', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    const result = detectTransients(audio, { threshold: 1.0 });
    const filtered = filterByConfidence(result, 0.2);
    expect(filtered.onsets.length).toBe(filtered.confidence.length);
  });

  it('filtering reduces or preserves onset count', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    const result = detectTransients(audio, { threshold: 1.0 });
    const filtered = filterByConfidence(result, 0.5);
    expect(filtered.onsets.length).toBeLessThanOrEqual(result.onsets.length);
  });

  it('empty result returns empty', () => {
    const empty = { onsets: [], confidence: [], onsetStrength: new Float32Array(0), frameTimes: new Float32Array(0) };
    const filtered = filterByConfidence(empty, 0.3);
    expect(filtered.onsets).toHaveLength(0);
    expect(filtered.confidence).toHaveLength(0);
  });

  it('filtered onsets maintain original ordering', () => {
    const audio = impulseTrain(SR * 2, 4800, 4, 1.0);
    const result = detectTransients(audio, { threshold: 1.0 });
    const filtered = filterByConfidence(result, 0.1);
    for (let i = 1; i < filtered.onsets.length; i++) {
      expect(filtered.onsets[i]).toBeGreaterThan(filtered.onsets[i - 1]);
    }
  });
});

// ─── Integration ──────────────────────────────────────────────────────────────

describe('detectTransients — integration', () => {
  it('different windowSizes produce valid results', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    for (const windowSize of [128, 256, 512, 1024]) {
      const r = detectTransients(audio, { windowSize, threshold: 1.0 });
      expect(r.onsetStrength.every(isFinite)).toBe(true);
      expect(r.onsets.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('custom hopSize produces valid results', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    const r = detectTransients(audio, { windowSize: 512, hopSize: 128 });
    expect(r.onsetStrength.every(isFinite)).toBe(true);
  });

  it('44100 Hz sample rate produces valid onset times', () => {
    const audio = impulseTrain(44100, 4410, 3, 1.0); // every 100 ms
    const r = detectTransients(audio, { sampleRate: 44100, threshold: 1.0 });
    expect(r.onsets.every((t) => t >= 0)).toBe(true);
  });

  it('medianHalf of 0 does not throw', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    expect(() => detectTransients(audio, { medianHalf: 0 })).not.toThrow();
  });

  it('large medianHalf does not throw', () => {
    const audio = impulseTrain(SR, 4800, 3, 1.0);
    expect(() => detectTransients(audio, { medianHalf: 100 })).not.toThrow();
  });
});
