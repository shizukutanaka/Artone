/**
 * Timeline Time Remap Tests
 *
 * Covers outputToSource, speedAt, sourceToOutput, validateKeyframes,
 * uniformSpeed, sourceTimeRange, insertFreeze, and reverseSegment.
 */

import { describe, it, expect } from 'vitest';
import {
  outputToSource,
  speedAt,
  sourceToOutput,
  validateKeyframes,
  uniformSpeed,
  sourceTimeRange,
  insertFreeze,
  reverseSegment,
  type RemapKeyframe,
} from '../timeline/time-remap';

// ─── helpers ─────────────────────────────────────────────────────────────────

function kfs(...pairs: [number, number][]): RemapKeyframe[] {
  return pairs.map(([outputTime, sourceTime]) => ({ outputTime, sourceTime }));
}

// ─── outputToSource ───────────────────────────────────────────────────────────

describe('outputToSource', () => {
  it('empty keyframes → identity (source = output)', () => {
    expect(outputToSource(3.5, [])).toBeCloseTo(3.5, 8);
  });

  it('single keyframe → always returns that source time', () => {
    const ks = kfs([0, 5]);
    expect(outputToSource(0, ks)).toBeCloseTo(5, 8);
    expect(outputToSource(10, ks)).toBeCloseTo(5, 8);
    expect(outputToSource(-3, ks)).toBeCloseTo(5, 8);
  });

  it('normal 1× speed: identity mapping', () => {
    const ks = kfs([0, 0], [10, 10]);
    expect(outputToSource(0, ks)).toBeCloseTo(0, 8);
    expect(outputToSource(5, ks)).toBeCloseTo(5, 8);
    expect(outputToSource(10, ks)).toBeCloseTo(10, 8);
  });

  it('2× speed: source advances twice as fast', () => {
    const ks = kfs([0, 0], [5, 10]);
    expect(outputToSource(2.5, ks)).toBeCloseTo(5, 8);
    expect(outputToSource(5, ks)).toBeCloseTo(10, 8);
  });

  it('0.5× speed: source advances half as fast', () => {
    const ks = kfs([0, 0], [10, 5]);
    expect(outputToSource(4, ks)).toBeCloseTo(2, 8);
    expect(outputToSource(10, ks)).toBeCloseTo(5, 8);
  });

  it('freeze frame: source stays constant over output interval', () => {
    const ks = kfs([0, 0], [3, 3], [6, 3], [9, 6]);
    // Segment [3, 6] is frozen at source = 3
    expect(outputToSource(3, ks)).toBeCloseTo(3, 8);
    expect(outputToSource(4.5, ks)).toBeCloseTo(3, 8);
    expect(outputToSource(6, ks)).toBeCloseTo(3, 8);
    // After freeze, normal progression resumes
    expect(outputToSource(7.5, ks)).toBeCloseTo(4.5, 8);
  });

  it('reverse segment: source decreases as output increases', () => {
    const ks = kfs([0, 10], [5, 0]);  // reverse: starts at src=10, ends at src=0
    expect(outputToSource(0, ks)).toBeCloseTo(10, 8);
    expect(outputToSource(2.5, ks)).toBeCloseTo(5, 8);
    expect(outputToSource(5, ks)).toBeCloseTo(0, 8);
  });

  it('extrapolates before first keyframe using first-segment slope', () => {
    const ks = kfs([2, 4], [4, 8]);   // speed = 2x
    // Before t=2, extrapolate with slope=2
    expect(outputToSource(1, ks)).toBeCloseTo(2, 8);  // 4 - 2*(2-1) = 2
    expect(outputToSource(0, ks)).toBeCloseTo(0, 8);  // 4 - 2*(2-0) = 0
  });

  it('extrapolates after last keyframe using last-segment slope', () => {
    const ks = kfs([0, 0], [4, 2]);   // speed = 0.5x
    // After t=4, extrapolate with slope=0.5
    expect(outputToSource(6, ks)).toBeCloseTo(3, 8);  // 2 + 0.5*(6-4) = 3
  });

  it('piecewise: multiple speed changes', () => {
    const ks = kfs([0, 0], [2, 4], [4, 6], [6, 6]);
    // Segment 0-2: speed=2  source at t=1: 2
    expect(outputToSource(1, ks)).toBeCloseTo(2, 8);
    // Segment 2-4: speed=1  source at t=3: 4+1=5
    expect(outputToSource(3, ks)).toBeCloseTo(5, 8);
    // Segment 4-6: freeze  source=6
    expect(outputToSource(5, ks)).toBeCloseTo(6, 8);
  });
});

// ─── speedAt ─────────────────────────────────────────────────────────────────

describe('speedAt', () => {
  it('empty keyframes → 1 (normal speed)', () => {
    expect(speedAt(5, [])).toBe(1);
  });

  it('single keyframe → 1', () => {
    expect(speedAt(5, kfs([0, 0]))).toBe(1);
  });

  it('2× speed segment', () => {
    const ks = kfs([0, 0], [5, 10]);
    expect(speedAt(2.5, ks)).toBeCloseTo(2, 8);
  });

  it('0.5× speed segment', () => {
    const ks = kfs([0, 0], [10, 5]);
    expect(speedAt(5, ks)).toBeCloseTo(0.5, 8);
  });

  it('freeze frame segment → speed = 0', () => {
    const ks = kfs([0, 0], [3, 3], [6, 3], [9, 6]);
    expect(speedAt(4.5, ks)).toBeCloseTo(0, 8);
  });

  it('reverse segment → negative speed', () => {
    const ks = kfs([0, 10], [5, 0]);
    expect(speedAt(2, ks)).toBeCloseTo(-2, 8);
  });

  it('speed before first keyframe equals first-segment speed', () => {
    const ks = kfs([2, 0], [4, 6]);   // speed = 3
    expect(speedAt(0, ks)).toBeCloseTo(3, 8);
  });

  it('speed after last keyframe equals last-segment speed', () => {
    const ks = kfs([0, 0], [4, 2]);   // speed = 0.5
    expect(speedAt(10, ks)).toBeCloseTo(0.5, 8);
  });

  it('piecewise speeds are reported per segment', () => {
    const ks = kfs([0, 0], [2, 4], [4, 6]);
    expect(speedAt(1, ks)).toBeCloseTo(2, 8);    // segment 0-2: speed=2
    expect(speedAt(3, ks)).toBeCloseTo(1, 8);    // segment 2-4: speed=1
  });
});

// ─── sourceToOutput ───────────────────────────────────────────────────────────

describe('sourceToOutput', () => {
  it('empty keyframes → identity', () => {
    expect(sourceToOutput(4, [])).toBeCloseTo(4, 8);
  });

  it('single keyframe → returns outputTime if source matches', () => {
    const ks = kfs([5, 2]);
    expect(sourceToOutput(2, ks)).toBeCloseTo(5, 8);
    expect(sourceToOutput(3, ks)).toBeNull();
  });

  it('1× speed: inverse is identity', () => {
    const ks = kfs([0, 0], [10, 10]);
    expect(sourceToOutput(5, ks)).toBeCloseTo(5, 8);
    expect(sourceToOutput(0, ks)).toBeCloseTo(0, 8);
    expect(sourceToOutput(10, ks)).toBeCloseTo(10, 8);
  });

  it('2× speed: output = source / 2', () => {
    const ks = kfs([0, 0], [5, 10]);
    expect(sourceToOutput(4, ks)).toBeCloseTo(2, 8);
    expect(sourceToOutput(10, ks)).toBeCloseTo(5, 8);
  });

  it('reverse segment: source 0–10 maps to output 0–5 in reverse', () => {
    const ks = kfs([0, 10], [5, 0]);
    expect(sourceToOutput(5, ks)).toBeCloseTo(2.5, 8);
    expect(sourceToOutput(0, ks)).toBeCloseTo(5, 8);
    expect(sourceToOutput(10, ks)).toBeCloseTo(0, 8);
  });

  it('source outside range → null', () => {
    const ks = kfs([0, 2], [5, 7]);
    expect(sourceToOutput(0, ks)).toBeNull();   // before range
    expect(sourceToOutput(10, ks)).toBeNull();  // after range
  });

  it('freeze segment: frozen source time returns output time of first occurrence', () => {
    // source=3 first appears at the end of segment [0,3] → output=3
    const ks = kfs([0, 0], [3, 3], [6, 3], [9, 6]);
    expect(sourceToOutput(3, ks)).toBeCloseTo(3, 8);
  });

  it('round-trip: sourceToOutput(outputToSource(t)) ≈ t', () => {
    const ks = kfs([0, 0], [3, 6], [6, 9], [10, 9]);  // 2×, 1×, freeze
    for (const t of [0, 0.5, 1, 2, 3, 4, 5]) {
      const src = outputToSource(t, ks);
      const out = sourceToOutput(src, ks);
      if (out !== null) {
        expect(out).toBeCloseTo(t, 5);
      }
    }
  });
});

// ─── validateKeyframes ────────────────────────────────────────────────────────

describe('validateKeyframes', () => {
  it('valid keyframes → empty error array', () => {
    expect(validateKeyframes(kfs([0, 0], [5, 5], [10, 10]))).toHaveLength(0);
  });

  it('empty array → valid', () => {
    expect(validateKeyframes([])).toHaveLength(0);
  });

  it('negative outputTime → error', () => {
    const errors = validateKeyframes(kfs([-1, 0], [5, 5]));
    expect(errors.some(e => e.index === 0)).toBe(true);
  });

  it('non-strictly-increasing outputTime → error', () => {
    const errors = validateKeyframes(kfs([0, 0], [5, 5], [5, 10]));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('decreasing outputTime → error', () => {
    const errors = validateKeyframes(kfs([0, 0], [10, 5], [5, 8]));
    expect(errors.some(e => e.index === 2)).toBe(true);
  });

  it('sourceTime can be any value (no restriction)', () => {
    // Negative and decreasing sourceTime is valid (reverse playback)
    expect(validateKeyframes(kfs([0, 10], [5, 0], [10, -5]))).toHaveLength(0);
  });
});

// ─── uniformSpeed ────────────────────────────────────────────────────────────

describe('uniformSpeed', () => {
  it('1× speed produces identity over duration', () => {
    const ks = uniformSpeed(1, 10);
    expect(ks.length).toBe(2);
    expect(outputToSource(5, ks)).toBeCloseTo(5, 8);
  });

  it('2× speed: source_end = 2 × output_duration', () => {
    const ks = uniformSpeed(2, 10);
    expect(ks[1].sourceTime).toBeCloseTo(20, 8);
  });

  it('0.5× speed: source_end = 0.5 × output_duration', () => {
    const ks = uniformSpeed(0.5, 10);
    expect(ks[1].sourceTime).toBeCloseTo(5, 8);
  });

  it('custom sourceStart offset', () => {
    const ks = uniformSpeed(1, 5, 10);
    expect(ks[0].sourceTime).toBeCloseTo(10, 8);
    expect(ks[1].sourceTime).toBeCloseTo(15, 8);
  });

  it('validates as correct keyframes', () => {
    expect(validateKeyframes(uniformSpeed(2, 10))).toHaveLength(0);
  });
});

// ─── sourceTimeRange ─────────────────────────────────────────────────────────

describe('sourceTimeRange', () => {
  it('identity mapping: range equals output range', () => {
    const ks = kfs([0, 0], [10, 10]);
    const r = sourceTimeRange(2, 8, ks);
    expect(r.min).toBeCloseTo(2, 8);
    expect(r.max).toBeCloseTo(8, 8);
  });

  it('2× speed: source range is double the output range', () => {
    const ks = kfs([0, 0], [5, 10]);
    const r = sourceTimeRange(0, 5, ks);
    expect(r.min).toBeCloseTo(0, 8);
    expect(r.max).toBeCloseTo(10, 8);
  });

  it('reverse: min and max are correctly ordered', () => {
    const ks = kfs([0, 10], [5, 0]);
    const r = sourceTimeRange(0, 5, ks);
    expect(r.min).toBeCloseTo(0, 8);
    expect(r.max).toBeCloseTo(10, 8);
  });

  it('always returns min ≤ max', () => {
    const ks = kfs([0, 20], [10, 0]);
    const r = sourceTimeRange(2, 8, ks);
    expect(r.min).toBeLessThanOrEqual(r.max);
  });
});

// ─── insertFreeze ─────────────────────────────────────────────────────────────

describe('insertFreeze', () => {
  it('inserts two keyframes at freeze start and end', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = insertFreeze(5, 2, ks);
    // Should have original 2 + 2 freeze keyframes = 4 (de-duped)
    expect(out.length).toBe(4);
  });

  it('freeze source time stays constant during freeze', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = insertFreeze(5, 2, ks);
    // Find freeze keyframes (at output=5 and output=7)
    const kfAt5 = out.find(k => Math.abs(k.outputTime - 5) < 1e-9)!;
    const kfAt7 = out.find(k => Math.abs(k.outputTime - 7) < 1e-9)!;
    expect(kfAt5).toBeDefined();
    expect(kfAt7).toBeDefined();
    expect(kfAt5.sourceTime).toBeCloseTo(kfAt7.sourceTime, 8);
  });

  it('playback resumes after freeze from the same source position', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = insertFreeze(5, 2, ks);
    // Before freeze: t=4 → src=4
    expect(outputToSource(4, out)).toBeCloseTo(4, 5);
    // During freeze: t=6 → src=5
    expect(outputToSource(6, out)).toBeCloseTo(5, 5);
    // After freeze: t=9 → src=7 (5 + (9-7) = 7)
    expect(outputToSource(9, out)).toBeCloseTo(7, 5);
  });

  it('keyframes are sorted after insertion', () => {
    const ks = kfs([0, 0], [3, 3], [6, 6], [9, 9]);
    const out = insertFreeze(4, 2, ks);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].outputTime).toBeGreaterThan(out[i - 1].outputTime);
    }
  });

  it('zero duration → no-op (returns copy)', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = insertFreeze(5, 0, ks);
    expect(out.length).toBe(ks.length);
  });

  it('freeze at edge of clip: t=0', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = insertFreeze(0, 3, ks);
    // Freeze at t=0 means play src=0 for 3 seconds
    expect(outputToSource(1.5, out)).toBeCloseTo(0, 5);
    // After freeze, normal playback
    expect(outputToSource(4, out)).toBeCloseTo(1, 5);
  });
});

// ─── reverseSegment ───────────────────────────────────────────────────────────

describe('reverseSegment', () => {
  it('reverses source direction in the given range', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = reverseSegment(2, 8, ks);
    // At output=2, should play src=8 (was srcAtEnd)
    // At output=8, should play src=2 (was srcAtStart)
    expect(outputToSource(2, out)).toBeCloseTo(8, 5);
    expect(outputToSource(8, out)).toBeCloseTo(2, 5);
  });

  it('midpoint of reversed range maps to midpoint of original range', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = reverseSegment(0, 10, ks);
    expect(outputToSource(5, out)).toBeCloseTo(5, 5);  // mirror of midpoint
  });

  it('endpoints outside the reversed range keep their source values', () => {
    // The absolute endpoints of the keyframe array (output=0/10) are preserved.
    // Adjacent segments change slope because the boundary keyframe source values change.
    const ks = kfs([0, 0], [10, 10]);
    const out = reverseSegment(4, 6, ks);
    // Extreme endpoints are preserved
    expect(outputToSource(0, out)).toBeCloseTo(0, 5);
    expect(outputToSource(10, out)).toBeCloseTo(10, 5);
    // Reversed region: output=4 maps to src=6, output=6 maps to src=4
    expect(outputToSource(4, out)).toBeCloseTo(6, 5);
    expect(outputToSource(6, out)).toBeCloseTo(4, 5);
  });

  it('speedAt the reversed segment is negative', () => {
    const ks = kfs([0, 0], [10, 10]);
    const out = reverseSegment(2, 8, ks);
    expect(speedAt(5, out)).toBeLessThan(0);
  });

  it('returns a valid, sorted keyframe array', () => {
    const ks = kfs([0, 0], [5, 5], [10, 10]);
    const out = reverseSegment(2, 8, ks);
    expect(validateKeyframes(out)).toHaveLength(0);
  });

  it('reverseSegment of reverseSegment restores original mapping', () => {
    const ks = kfs([0, 0], [10, 10]);
    const reversed = reverseSegment(0, 10, ks);
    const restored = reverseSegment(0, 10, reversed);
    for (const t of [0, 2.5, 5, 7.5, 10]) {
      expect(outputToSource(t, restored)).toBeCloseTo(outputToSource(t, ks), 5);
    }
  });
});
