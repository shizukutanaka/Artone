/**
 * Tests for core/frame-rate.ts
 *
 * Covers: constants, construction, queries, frame↔seconds, conversion,
 * pulldown insertion/removal, formatting, and edge cases.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  FR_23976, FR_24, FR_25, FR_2997, FR_2997DF,
  FR_30, FR_48, FR_50, FR_5994, FR_5994DF, FR_60, FR_120,
  KNOWN_FRAME_RATES,
  makeFrameRate,
  toFps,
  isIntegerRate,
  isNtscRate,
  findClosestFrameRate,
  isEquivalentRate,
  framesToSeconds,
  secondsToFrames,
  snapToFrame,
  convertFrameCount,
  remapFrame,
  insert32Pulldown,
  remove32Pulldown,
  insert22Pulldown,
  formatFrameDuration,
  isWholeSeconds,
} from '../core/frame-rate';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('frame rate constants', () => {
  it('FR_23976 is 24000/1001', () => {
    expect(FR_23976.num).toBe(24000);
    expect(FR_23976.den).toBe(1001);
    expect(FR_23976.dropFrame).toBe(false);
    expect(FR_23976.name).toBe('23.976');
  });

  it('FR_24 is 24/1', () => {
    expect(FR_24.num).toBe(24);
    expect(FR_24.den).toBe(1);
    expect(FR_24.dropFrame).toBe(false);
  });

  it('FR_2997DF has dropFrame=true', () => {
    expect(FR_2997DF.dropFrame).toBe(true);
    expect(FR_2997DF.num).toBe(30000);
    expect(FR_2997DF.den).toBe(1001);
  });

  it('FR_5994DF has dropFrame=true', () => {
    expect(FR_5994DF.dropFrame).toBe(true);
  });

  it('FR_120 is 120/1', () => {
    expect(FR_120.num).toBe(120);
    expect(FR_120.den).toBe(1);
  });

  it('KNOWN_FRAME_RATES contains 12 entries', () => {
    expect(KNOWN_FRAME_RATES.length).toBe(12);
  });

  it('KNOWN_FRAME_RATES contains FR_23976 through FR_120', () => {
    const names = KNOWN_FRAME_RATES.map(fr => fr.name);
    expect(names).toContain('23.976');
    expect(names).toContain('24');
    expect(names).toContain('120');
  });
});

// ─── makeFrameRate ────────────────────────────────────────────────────────────

describe('makeFrameRate', () => {
  it('creates integer rate from integer args', () => {
    const fr = makeFrameRate(30);
    expect(fr.num).toBe(30);
    expect(fr.den).toBe(1);
    expect(fr.dropFrame).toBe(false);
  });

  it('creates NTSC fractional rate', () => {
    const fr = makeFrameRate(30000, 1001);
    expect(fr.num).toBe(30000);
    expect(fr.den).toBe(1001);
  });

  it('reduces fraction by GCD', () => {
    const fr = makeFrameRate(48, 2); // = 24/1
    expect(fr.num).toBe(24);
    expect(fr.den).toBe(1);
  });

  it('sets dropFrame flag', () => {
    const fr = makeFrameRate(30000, 1001, true);
    expect(fr.dropFrame).toBe(true);
  });

  it('throws on non-positive denominator', () => {
    expect(() => makeFrameRate(30, 0)).toThrow(RangeError);
    expect(() => makeFrameRate(30, -1)).toThrow(RangeError);
  });

  it('generates name for integer rate', () => {
    const fr = makeFrameRate(25);
    expect(fr.name).toBe('25');
  });
});

// ─── toFps / isIntegerRate / isNtscRate ──────────────────────────────────────

describe('toFps', () => {
  it('returns exact float for integer rate', () => {
    expect(toFps(FR_24)).toBe(24);
    expect(toFps(FR_60)).toBe(60);
  });

  it('returns ~23.976 for FR_23976', () => {
    expect(toFps(FR_23976)).toBeCloseTo(23.976, 3);
  });

  it('returns ~29.97 for FR_2997', () => {
    expect(toFps(FR_2997)).toBeCloseTo(29.97, 3);
  });

  it('returns ~59.94 for FR_5994', () => {
    expect(toFps(FR_5994)).toBeCloseTo(59.94, 3);
  });
});

describe('isIntegerRate', () => {
  it('true for integer rates', () => {
    expect(isIntegerRate(FR_24)).toBe(true);
    expect(isIntegerRate(FR_25)).toBe(true);
    expect(isIntegerRate(FR_30)).toBe(true);
    expect(isIntegerRate(FR_120)).toBe(true);
  });

  it('false for NTSC fractional rates', () => {
    expect(isIntegerRate(FR_23976)).toBe(false);
    expect(isIntegerRate(FR_2997)).toBe(false);
    expect(isIntegerRate(FR_5994)).toBe(false);
  });
});

describe('isNtscRate', () => {
  it('true for NTSC (1001-denominator) rates', () => {
    expect(isNtscRate(FR_23976)).toBe(true);
    expect(isNtscRate(FR_2997)).toBe(true);
    expect(isNtscRate(FR_2997DF)).toBe(true);
    expect(isNtscRate(FR_5994)).toBe(true);
    expect(isNtscRate(FR_5994DF)).toBe(true);
  });

  it('false for integer rates', () => {
    expect(isNtscRate(FR_24)).toBe(false);
    expect(isNtscRate(FR_25)).toBe(false);
    expect(isNtscRate(FR_60)).toBe(false);
  });
});

// ─── findClosestFrameRate ─────────────────────────────────────────────────────

describe('findClosestFrameRate', () => {
  it('finds exact match for 24.0', () => {
    const fr = findClosestFrameRate(24.0);
    expect(fr).toBe(FR_24);
  });

  it('finds FR_23976 for 23.976', () => {
    const fr = findClosestFrameRate(23.976);
    expect(fr?.num).toBe(24000);
    expect(fr?.den).toBe(1001);
  });

  it('finds FR_25 for 25.0', () => {
    expect(findClosestFrameRate(25.0)).toBe(FR_25);
  });

  it('finds FR_30 for 30.0', () => {
    // 30.0 is closer to FR_30 than FR_2997 (diff ~0.03 vs 0)
    const fr = findClosestFrameRate(30.0);
    expect(fr?.den).toBe(1);
    expect(fr?.num).toBe(30);
  });

  it('returns undefined if nothing is within tolerance', () => {
    expect(findClosestFrameRate(15.0)).toBeUndefined();
    expect(findClosestFrameRate(0)).toBeUndefined();
  });

  it('respects custom tolerance', () => {
    // 29.97 is ~0.03 from 30; with tight tolerance of 0.02 should not match
    const fr = findClosestFrameRate(30.0, 0.02);
    expect(fr?.den).toBe(1); // should still find exact FR_30
  });
});

// ─── isEquivalentRate ─────────────────────────────────────────────────────────

describe('isEquivalentRate', () => {
  it('same rate is equivalent to itself', () => {
    expect(isEquivalentRate(FR_24, FR_24)).toBe(true);
    expect(isEquivalentRate(FR_2997, FR_2997)).toBe(true);
  });

  it('24/1 and 48/2 are equivalent', () => {
    const fr48_2 = makeFrameRate(48, 2); // reduced to 24/1
    expect(isEquivalentRate(FR_24, fr48_2)).toBe(true);
  });

  it('FR_2997 and FR_2997DF are equivalent (same num/den)', () => {
    expect(isEquivalentRate(FR_2997, FR_2997DF)).toBe(true);
  });

  it('FR_24 and FR_25 are not equivalent', () => {
    expect(isEquivalentRate(FR_24, FR_25)).toBe(false);
  });

  it('FR_23976 and FR_24 are not equivalent', () => {
    expect(isEquivalentRate(FR_23976, FR_24)).toBe(false);
  });
});

// ─── framesToSeconds / secondsToFrames ───────────────────────────────────────

describe('framesToSeconds', () => {
  it('frame 0 → 0 seconds', () => {
    expect(framesToSeconds(0, FR_24)).toBe(0);
  });

  it('24 frames at 24fps → 1 second exactly', () => {
    expect(framesToSeconds(24, FR_24)).toBe(1);
  });

  it('25 frames at 25fps → 1 second exactly', () => {
    expect(framesToSeconds(25, FR_25)).toBe(1);
  });

  it('30000 frames at 30000/1001fps → 1001/1 seconds', () => {
    // 30000 frames * 1001 / 30000 = 1001 seconds
    expect(framesToSeconds(30000, FR_2997)).toBe(1001);
  });

  it('1001 frames at FR_2997 → 1001*1001/30000 seconds', () => {
    const secs = framesToSeconds(1001, FR_2997);
    expect(secs).toBeCloseTo((1001 * 1001) / 30000, 10);
  });

  it('48 frames at 48fps → 1 second', () => {
    expect(framesToSeconds(48, FR_48)).toBe(1);
  });
});

describe('secondsToFrames', () => {
  it('0 seconds → 0 frames', () => {
    expect(secondsToFrames(0, FR_24)).toBe(0);
  });

  it('1 second at 24fps → 24 frames', () => {
    expect(secondsToFrames(1, FR_24)).toBe(24);
  });

  it('1 second at 25fps → 25 frames', () => {
    expect(secondsToFrames(1, FR_25)).toBe(25);
  });

  it('1 second at FR_2997 → floor(30000/1001) = 29 frames', () => {
    expect(secondsToFrames(1, FR_2997)).toBe(29);
  });

  it('floor behaviour on non-exact values', () => {
    // 0.5s at 24fps = 12 frames exactly
    expect(secondsToFrames(0.5, FR_24)).toBe(12);
    // 0.9999s at 24fps = floor(23.9976) = 23
    expect(secondsToFrames(0.9999, FR_24)).toBe(23);
  });

  it('round-trips: framesToSeconds → secondsToFrames recovers frame at whole-second boundaries', () => {
    // Use multiples of the rate so intermediate seconds value is an integer (exact in float64)
    for (const fr of [FR_24, FR_25, FR_30, FR_50, FR_60]) {
      for (const mult of [0, 1, 10, 60, 1000]) {
        const f = fr.num * mult; // whole number of seconds
        const secs = framesToSeconds(f, fr);
        expect(secondsToFrames(secs, fr)).toBe(f);
      }
    }
  });
});

// ─── snapToFrame ──────────────────────────────────────────────────────────────

describe('snapToFrame', () => {
  it('exact frame boundary snaps to itself', () => {
    expect(snapToFrame(1.0, FR_24)).toBeCloseTo(1.0, 10);
    expect(snapToFrame(2.0, FR_25)).toBeCloseTo(2.0, 10);
  });

  it('between frames snaps to nearest', () => {
    // midpoint between frame 0 and frame 1 at 24fps = 1/(2*24) = 0.020833...
    // below midpoint → snaps to frame 0
    expect(snapToFrame(0.01, FR_24)).toBeCloseTo(0.0, 10);
    // above midpoint → snaps to frame 1
    expect(snapToFrame(0.03, FR_24)).toBeCloseTo(1 / 24, 10);
  });

  it('returns seconds in exact rational form', () => {
    const s = snapToFrame(1.0001, FR_25); // should snap to frame 25 = 1.0s
    expect(s).toBeCloseTo(1.0, 8);
  });
});

// ─── convertFrameCount ───────────────────────────────────────────────────────

describe('convertFrameCount', () => {
  it('same rate → identity', () => {
    expect(convertFrameCount(100, FR_24, FR_24)).toBe(100);
    expect(convertFrameCount(0, FR_25, FR_25)).toBe(0);
  });

  it('24→48 doubles frame count', () => {
    expect(convertFrameCount(24, FR_24, FR_48)).toBe(48);
  });

  it('48→24 halves frame count', () => {
    expect(convertFrameCount(48, FR_48, FR_24)).toBe(24);
  });

  it('25→50 doubles frame count', () => {
    expect(convertFrameCount(25, FR_25, FR_50)).toBe(50);
  });

  it('24→25 correctly scales (24 @ 24fps = 1s = 25 @ 25fps)', () => {
    expect(convertFrameCount(24, FR_24, FR_25)).toBe(25);
  });

  it('30→25 scales 30 frames to 25', () => {
    // 30 frames at 30fps = 1s = 25 frames at 25fps
    expect(convertFrameCount(30, FR_30, FR_25)).toBe(25);
  });

  it('NTSC fractional: FR_23976 to FR_2997 (≈ 5/4 ratio)', () => {
    // 24000 frames at 23976 fps = 1001s; at 2997 fps = 1001*30000/1001 = 30000 frames
    expect(convertFrameCount(24000, FR_23976, FR_2997)).toBe(30000);
  });

  it('large frame count stays accurate', () => {
    // 1 hour at 24fps = 86400 frames; at 25fps = 90000 frames
    expect(convertFrameCount(86400, FR_24, FR_25)).toBe(90000);
  });

  it('REGRESSION: exact near the previous 2**50 fast-path boundary (no float precision loss)', () => {
    // Before fix: the code claimed "Use BigInt to avoid precision loss for
    // large counts" but was plain `number` arithmetic guarded by
    // `count < 2**50` -- a guard that doesn't actually bound the
    // intermediate product (count * sourceRate.den * targetRate.num) below
    // Number.MAX_SAFE_INTEGER (2**53). For this count (just under 2**50),
    // the float path returned 2814749767094073 -- one frame too many versus
    // the mathematically exact 2814749767094072 (verified independently via
    // BigInt: floor(1125899906837629 * 1001 * 60000 / (24000 * 1001))).
    expect(convertFrameCount(1_125_899_906_837_629, FR_23976, FR_5994)).toBe(2_814_749_767_094_072);
  });
});

// ─── remapFrame ───────────────────────────────────────────────────────────────

describe('remapFrame', () => {
  it('frame 0 → frame 0', () => {
    expect(remapFrame(0, FR_24, FR_25)).toBe(0);
  });

  it('frame 24 at 24fps → frame 25 at 25fps (both = 1s)', () => {
    expect(remapFrame(24, FR_24, FR_25)).toBe(25);
  });

  it('same rate → same frame', () => {
    expect(remapFrame(100, FR_30, FR_30)).toBe(100);
  });

  it('remaps NTSC to PAL correctly', () => {
    // 30000 frames at FR_2997 ≈ 1001s; at FR_25 = floor(1001*25) = 25025
    expect(remapFrame(30000, FR_2997, FR_25)).toBe(25025);
  });
});

// ─── insert32Pulldown ─────────────────────────────────────────────────────────

describe('insert32Pulldown', () => {
  it('0 source frames → 0 output frames', () => {
    const { sourceIndices, isRepeat } = insert32Pulldown(0);
    expect(sourceIndices.length).toBe(0);
    expect(isRepeat.length).toBe(0);
  });

  it('4 source frames → 5 output frames', () => {
    const { sourceIndices, isRepeat } = insert32Pulldown(4);
    expect(sourceIndices.length).toBe(5);
    expect(isRepeat.length).toBe(5);
  });

  it('8 source frames → 10 output frames', () => {
    const { sourceIndices } = insert32Pulldown(8);
    expect(sourceIndices.length).toBe(10);
  });

  it('source indices follow floor(o*4/5) pattern', () => {
    const { sourceIndices } = insert32Pulldown(4);
    // floor(0*4/5)=0, floor(1*4/5)=0, floor(2*4/5)=1, floor(3*4/5)=2, floor(4*4/5)=3
    expect(sourceIndices).toEqual([0, 0, 1, 2, 3]);
  });

  it('isRepeat marks duplicates correctly', () => {
    const { isRepeat } = insert32Pulldown(4);
    // frame 0→same as none (not repeat), frame 1→same as 0 (repeat), others unique
    expect(isRepeat[0]).toBe(false);
    expect(isRepeat[1]).toBe(true); // sourceIndices[1] === sourceIndices[0] === 0
    expect(isRepeat[2]).toBe(false);
    expect(isRepeat[3]).toBe(false);
    expect(isRepeat[4]).toBe(false);
  });

  it('source indices never exceed numSourceFrames-1', () => {
    const n = 7;
    const { sourceIndices } = insert32Pulldown(n);
    for (const idx of sourceIndices) {
      expect(idx).toBeLessThanOrEqual(n - 1);
    }
  });

  it('non-multiple of 4 source frames padded correctly', () => {
    const { sourceIndices } = insert32Pulldown(5);
    // ceil(5*5/4) = ceil(6.25) = 7 output frames
    expect(sourceIndices.length).toBe(7);
  });
});

// ─── remove32Pulldown ────────────────────────────────────────────────────────

describe('remove32Pulldown', () => {
  it('0 frames → empty result', () => {
    expect(remove32Pulldown(0)).toEqual([]);
  });

  it('5 output frames → 4 unique cinema frame indices', () => {
    const result = remove32Pulldown(5);
    expect(result.length).toBe(4);
  });

  it('10 output frames → 8 unique cinema frame indices', () => {
    const result = remove32Pulldown(10);
    expect(result.length).toBe(8);
  });

  it('returns output frame indices (not source indices)', () => {
    const result = remove32Pulldown(5);
    // Should be [0, 2, 3, 4] — non-repeat output frames
    expect(result.every(i => i >= 0 && i < 5)).toBe(true);
  });

  it('no duplicates in result', () => {
    const result = remove32Pulldown(20);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it('result is strictly increasing', () => {
    const result = remove32Pulldown(20);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });
});

// ─── insert22Pulldown ────────────────────────────────────────────────────────

describe('insert22Pulldown', () => {
  it('0 source frames → 0 output frames', () => {
    const { sourceIndices } = insert22Pulldown(0);
    expect(sourceIndices.length).toBe(0);
  });

  it('N source frames → 2N output frames', () => {
    const { sourceIndices, isRepeat } = insert22Pulldown(5);
    expect(sourceIndices.length).toBe(10);
    expect(isRepeat.length).toBe(10);
  });

  it('each source frame duplicated consecutively', () => {
    const { sourceIndices } = insert22Pulldown(3);
    expect(sourceIndices).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('odd output frames marked as repeats', () => {
    const { isRepeat } = insert22Pulldown(3);
    expect(isRepeat).toEqual([false, true, false, true, false, true]);
  });

  it('large count: 24→48fps simulation', () => {
    const { sourceIndices } = insert22Pulldown(24);
    expect(sourceIndices.length).toBe(48);
    for (let i = 0; i < 48; i++) {
      expect(sourceIndices[i]).toBe(Math.floor(i / 2));
    }
  });
});

// ─── formatFrameDuration ─────────────────────────────────────────────────────

describe('formatFrameDuration', () => {
  it('0 frames → "0:00:00.00"', () => {
    expect(formatFrameDuration(0, FR_24)).toBe('0:00:00.00');
  });

  it('24 frames at 24fps → "0:00:01.00"', () => {
    expect(formatFrameDuration(24, FR_24)).toBe('0:00:01.00');
  });

  it('25 frames at 25fps → "0:00:01.00"', () => {
    expect(formatFrameDuration(25, FR_25)).toBe('0:00:01.00');
  });

  it('1 frame at 24fps → "0:00:00.01"', () => {
    // 1 frame = 1/24 s = 0.04166… → subframe = floor(0.04166*24)=1
    expect(formatFrameDuration(1, FR_24)).toBe('0:00:00.01');
  });

  it('3600 seconds worth of frames at 24fps → "1:00:00.00"', () => {
    const frames = 3600 * 24; // 86400
    expect(formatFrameDuration(frames, FR_24)).toBe('1:00:00.00');
  });

  it('minutes are zero-padded to 2 digits', () => {
    const result = formatFrameDuration(60 * 24, FR_24); // 1 minute
    expect(result).toBe('0:01:00.00');
  });

  it('seconds are zero-padded to 2 digits', () => {
    const result = formatFrameDuration(5 * 24, FR_24); // 5 seconds
    expect(result).toBe('0:00:05.00');
  });

  it('subframe count at 25fps max is 24', () => {
    // 24/25 seconds = frame 24 → subframe=24, not wrapping
    const result = formatFrameDuration(24, FR_25);
    // 24 frames at 25fps = 0.96s → subframe = floor(0.96 * 25) = 24
    expect(result).toBe('0:00:00.24');
  });
});

// ─── isWholeSeconds ───────────────────────────────────────────────────────────

describe('isWholeSeconds', () => {
  it('0 frames → true (0 is whole seconds)', () => {
    expect(isWholeSeconds(0, FR_24)).toBe(true);
  });

  it('24 frames at 24fps → true (1 second)', () => {
    expect(isWholeSeconds(24, FR_24)).toBe(true);
  });

  it('25 frames at 25fps → true', () => {
    expect(isWholeSeconds(25, FR_25)).toBe(true);
  });

  it('1 frame at 24fps → false', () => {
    expect(isWholeSeconds(1, FR_24)).toBe(false);
  });

  it('1001 frames at FR_2997 → false', () => {
    // 1001 * 1001 = 1002001; mod 30000 ≠ 0
    expect(isWholeSeconds(1001, FR_2997)).toBe(false);
  });

  it('30000 frames at FR_2997 → true (exactly 1001 seconds)', () => {
    // 30000 * 1001 / 30000 = 1001 exactly
    expect(isWholeSeconds(30000, FR_2997)).toBe(true);
  });

  it('multiples of rate denominator frame count → true', () => {
    // At 25fps: multiples of 25 are whole seconds
    for (const n of [0, 25, 50, 100, 250]) {
      expect(isWholeSeconds(n, FR_25)).toBe(true);
    }
  });
});

// ─── Edge cases & invariants ──────────────────────────────────────────────────

describe('cross-rate invariants', () => {
  it('convertFrameCount is consistent with remapFrame', () => {
    // Both should give the same result for frame count conversion
    const count = 2400;
    expect(convertFrameCount(count, FR_24, FR_25)).toBe(remapFrame(count, FR_24, FR_25));
  });

  it('pulldown 24→30 then recover gives same number of cinema frames', () => {
    const numCinema = 24;
    const { sourceIndices } = insert32Pulldown(numCinema);
    const numOutput = sourceIndices.length; // 30 frames
    const recovered = remove32Pulldown(numOutput);
    expect(recovered.length).toBe(numCinema);
  });

  it('2:2 pulldown doubles count exactly', () => {
    for (const n of [1, 7, 24, 100]) {
      const { sourceIndices } = insert22Pulldown(n);
      expect(sourceIndices.length).toBe(n * 2);
    }
  });

  it('framesToSeconds and secondsToFrames are inverse at integer fps', () => {
    for (const fr of [FR_24, FR_25, FR_30, FR_48, FR_50, FR_60, FR_120]) {
      const frames = fr.num * 60; // 1 minute
      const secs = framesToSeconds(frames, fr);
      expect(secondsToFrames(secs, fr)).toBe(frames);
    }
  });
});
