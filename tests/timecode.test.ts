/**
 * SMPTE Timecode Tests
 *
 * Covers toFrames, fromFrames, add, subtract, compare, toSeconds,
 * fromSeconds, parse, format, isValid, and framesPerDay.
 */

import { describe, it, expect } from 'vitest';
import {
  toFrames,
  fromFrames,
  add,
  subtract,
  compare,
  toSeconds,
  fromSeconds,
  parse,
  format,
  isValid,
  framesPerDay,
  type Timecode,
  type FrameRate,
} from '../core/timecode';

// ─── helpers ─────────────────────────────────────────────────────────────────

function tc(hh: number, mm: number, ss: number, ff: number): Timecode {
  return { hours: hh, minutes: mm, seconds: ss, frames: ff };
}

// ─── parse ────────────────────────────────────────────────────────────────────

describe('parse', () => {
  it('parses non-drop "HH:MM:SS:FF"', () => {
    const p = parse('01:02:03:04');
    expect(p).not.toBeNull();
    expect(p!.timecode).toEqual({ hours: 1, minutes: 2, seconds: 3, frames: 4 });
    expect(p!.drop).toBe(false);
  });

  it('parses drop-frame "HH:MM:SS;FF"', () => {
    const p = parse('00:01:00;02');
    expect(p).not.toBeNull();
    expect(p!.drop).toBe(true);
    expect(p!.timecode).toEqual({ hours: 0, minutes: 1, seconds: 0, frames: 2 });
  });

  it('returns null for invalid formats', () => {
    expect(parse('1:2:3:4')).toBeNull();      // too short
    expect(parse('00:00:00')).toBeNull();      // missing frames
    expect(parse('00:00:00:00:00')).toBeNull(); // too many fields
    expect(parse('')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parse('  00:00:01:05  ')).not.toBeNull();
  });
});

// ─── format ───────────────────────────────────────────────────────────────────

describe('format', () => {
  it('non-drop uses colon separator', () => {
    expect(format(tc(1, 2, 3, 4), false)).toBe('01:02:03:04');
  });

  it('drop-frame uses semicolon separator', () => {
    expect(format(tc(0, 1, 0, 2), true)).toBe('00:01:00;02');
  });

  it('pads single-digit components', () => {
    expect(format(tc(0, 0, 0, 0), false)).toBe('00:00:00:00');
  });
});

// ─── toFrames / fromFrames — non-drop ─────────────────────────────────────────

describe('toFrames / fromFrames — non-drop', () => {
  it('00:00:00:00 = frame 0', () => {
    expect(toFrames(tc(0, 0, 0, 0), '30')).toBe(0);
  });

  it('00:00:00:01 = frame 1', () => {
    expect(toFrames(tc(0, 0, 0, 1), '30')).toBe(1);
  });

  it('00:00:01:00 at 30fps = frame 30', () => {
    expect(toFrames(tc(0, 0, 1, 0), '30')).toBe(30);
  });

  it('00:01:00:00 at 30fps = frame 1800', () => {
    expect(toFrames(tc(0, 1, 0, 0), '30')).toBe(1800);
  });

  it('01:00:00:00 at 30fps = frame 108000', () => {
    expect(toFrames(tc(1, 0, 0, 0), '30')).toBe(108000);
  });

  it('00:00:00:00 at 25fps = frame 0', () => {
    expect(toFrames(tc(0, 0, 0, 0), '25')).toBe(0);
  });

  it('00:01:00:00 at 25fps = frame 1500', () => {
    expect(toFrames(tc(0, 1, 0, 0), '25')).toBe(1500);
  });

  it('fromFrames(toFrames(tc)) round-trips', () => {
    for (const fr of ['24', '25', '30', '50', '60'] as FrameRate[]) {
      const original = tc(1, 23, 45, 10);
      const n = toFrames(original, fr);
      const rt = fromFrames(n, fr);
      expect(rt).toEqual(original);
    }
  });
});

// ─── toFrames / fromFrames — drop-frame ──────────────────────────────────────

describe('toFrames / fromFrames — drop-frame 29.97', () => {
  it('00:00:00;00 = frame 0', () => {
    expect(toFrames(tc(0, 0, 0, 0), '29.97', true)).toBe(0);
  });

  it('00:00:59;29 = frame 1799', () => {
    expect(toFrames(tc(0, 0, 59, 29), '29.97', true)).toBe(1799);
  });

  it('00:01:00;02 = frame 1800 (first valid frame after drop)', () => {
    expect(toFrames(tc(0, 1, 0, 2), '29.97', true)).toBe(1800);
  });

  it('00:01:00;00 is an invalid DF timecode (dropped frame)', () => {
    expect(isValid(tc(0, 1, 0, 0), '29.97', true)).toBe(false);
  });

  it('00:01:00;01 is an invalid DF timecode (dropped frame)', () => {
    expect(isValid(tc(0, 1, 0, 1), '29.97', true)).toBe(false);
  });

  it('00:10:00;00 = frame 17982 (10-minute boundary, NOT dropped)', () => {
    expect(toFrames(tc(0, 10, 0, 0), '29.97', true)).toBe(17982);
  });

  it('00:10:00;00 is a valid DF timecode (10-min boundary)', () => {
    expect(isValid(tc(0, 10, 0, 0), '29.97', true)).toBe(true);
  });

  it('fromFrames(1800, 29.97, drop) = 00:01:00;02', () => {
    expect(fromFrames(1800, '29.97', true)).toEqual(tc(0, 1, 0, 2));
  });

  it('fromFrames(17982, 29.97, drop) = 00:10:00;00', () => {
    expect(fromFrames(17982, '29.97', true)).toEqual(tc(0, 10, 0, 0));
  });

  it('round-trip: fromFrames(toFrames(tc)) for various DF timecodes', () => {
    const testCases: Timecode[] = [
      tc(0, 0, 0, 0),
      tc(0, 0, 59, 29),
      tc(0, 1, 0, 2),
      tc(0, 9, 59, 29),
      tc(0, 10, 0, 0),
      tc(1, 0, 0, 0),
    ];
    for (const original of testCases) {
      const n  = toFrames(original, '29.97', true);
      const rt = fromFrames(n, '29.97', true);
      expect(rt).toEqual(original);
    }
  });

  it('01:00:00;00 = frames_per_hour (108000 - 108 = 107892)', () => {
    // 1 hour: 60 minutes, 54 non-10-minute marks, each drops 2 frames = 108 dropped
    expect(toFrames(tc(1, 0, 0, 0), '29.97', true)).toBe(107892);
  });
});

// ─── drop-frame 59.94 ────────────────────────────────────────────────────────

describe('toFrames / fromFrames — drop-frame 59.94', () => {
  it('00:01:00;04 is the first valid frame after the drop at 1 minute', () => {
    const n = toFrames(tc(0, 1, 0, 4), '59.94', true);
    // First minute has 60*60=3600 frames; ;00..;03 are skipped at minute 1
    // so frame 3600 = 00:01:00;04 (not 3596)
    expect(n).toBe(3600);
  });

  it('00:01:00;00 through 00:01:00;03 are invalid DF timecodes', () => {
    for (let f = 0; f < 4; f++) {
      expect(isValid(tc(0, 1, 0, f), '59.94', true)).toBe(false);
    }
  });

  it('round-trip for 59.94 DF', () => {
    const samples = [tc(0, 0, 0, 0), tc(0, 0, 59, 59), tc(0, 1, 0, 4), tc(0, 10, 0, 0)];
    for (const original of samples) {
      const rt = fromFrames(toFrames(original, '59.94', true), '59.94', true);
      expect(rt).toEqual(original);
    }
  });
});

// ─── add / subtract / compare ────────────────────────────────────────────────

describe('add', () => {
  it('adding durations: 00:00:01:00 + 00:00:01:00 = 00:00:02:00 at 30fps', () => {
    expect(add(tc(0, 0, 1, 0), tc(0, 0, 1, 0), '30')).toEqual(tc(0, 0, 2, 0));
  });

  it('carry across seconds boundary', () => {
    expect(add(tc(0, 0, 59, 29), tc(0, 0, 0, 1), '30')).toEqual(tc(0, 1, 0, 0));
  });

  it('carry across minutes boundary', () => {
    expect(add(tc(0, 59, 59, 29), tc(0, 0, 0, 1), '30')).toEqual(tc(1, 0, 0, 0));
  });

  it('DF add: carries correctly past the drop-frame boundary', () => {
    // 00:00:59;29 + 1 frame = 00:01:00;02 (skipping ;00 and ;01)
    const result = add(tc(0, 0, 59, 29), tc(0, 0, 0, 1), '29.97', true);
    expect(result).toEqual(tc(0, 1, 0, 2));
  });
});

describe('subtract', () => {
  it('00:00:02:00 − 00:00:01:00 = 00:00:01:00', () => {
    expect(subtract(tc(0, 0, 2, 0), tc(0, 0, 1, 0), '30')).toEqual(tc(0, 0, 1, 0));
  });

  it('clamps to 0 when result is negative', () => {
    expect(subtract(tc(0, 0, 0, 0), tc(0, 0, 1, 0), '30')).toEqual(tc(0, 0, 0, 0));
  });
});

describe('compare', () => {
  it('equal timecodes → 0', () => {
    expect(compare(tc(0, 1, 0, 0), tc(0, 1, 0, 0), '30')).toBe(0);
  });

  it('earlier < later → negative', () => {
    expect(compare(tc(0, 0, 0, 0), tc(0, 0, 0, 1), '30')).toBeLessThan(0);
  });

  it('later > earlier → positive', () => {
    expect(compare(tc(1, 0, 0, 0), tc(0, 59, 59, 29), '30')).toBeGreaterThan(0);
  });
});

// ─── toSeconds / fromSeconds ──────────────────────────────────────────────────

describe('toSeconds', () => {
  it('00:00:01:00 at 30fps ND = 1.0 s', () => {
    expect(toSeconds(tc(0, 0, 1, 0), '30')).toBeCloseTo(1, 9);
  });

  it('00:01:00:00 at 25fps ND = 60.0 s', () => {
    expect(toSeconds(tc(0, 1, 0, 0), '25')).toBeCloseTo(60, 9);
  });

  it('00:01:00;02 at 29.97 DF ≈ 60.0 s (DF tracks wall clock)', () => {
    // frame 1800 at 30000/1001 fps = 1800 × 1001/30000 = 60.06 s
    // No — 29.97DF is designed so 00:01:00;00 ≈ 60s elapsed.
    // Actually: 1800 frames × (1001/30000) = 1800.0 × 0.033367 ≈ 60.06s
    // The drop-frame timecode is not perfectly exact, but 00:01:00;02 is 60.06s
    const s = toSeconds(tc(0, 1, 0, 2), '29.97', true);
    expect(s).toBeGreaterThan(59.9);
    expect(s).toBeLessThan(60.1);
  });

  it('00:00:00;00 at 29.97 DF = 0.0 s', () => {
    expect(toSeconds(tc(0, 0, 0, 0), '29.97', true)).toBe(0);
  });
});

describe('fromSeconds', () => {
  it('round-trip: fromSeconds(toSeconds(tc)) for ND 30fps', () => {
    const original = tc(0, 5, 30, 15);
    const s  = toSeconds(original, '30');
    const rt = fromSeconds(s, '30');
    expect(rt).toEqual(original);
  });

  it('0.0 s → 00:00:00:00', () => {
    expect(fromSeconds(0, '25')).toEqual(tc(0, 0, 0, 0));
  });

  it('60.0 s at 25fps → 00:01:00:00', () => {
    expect(fromSeconds(60, '25')).toEqual(tc(0, 1, 0, 0));
  });
});

// ─── isValid ──────────────────────────────────────────────────────────────────

describe('isValid', () => {
  it('valid non-drop timecode', () => {
    expect(isValid(tc(0, 0, 0, 0), '30')).toBe(true);
    expect(isValid(tc(23, 59, 59, 29), '30')).toBe(true);
  });

  it('frame out of range → false', () => {
    expect(isValid(tc(0, 0, 0, 30), '30')).toBe(false);  // 30 ≥ nominal=30
    expect(isValid(tc(0, 0, 0, 25), '25')).toBe(false);  // 25 ≥ nominal=25
  });

  it('hours out of range → false', () => {
    expect(isValid(tc(24, 0, 0, 0), '30')).toBe(false);
  });

  it('minutes out of range → false', () => {
    expect(isValid(tc(0, 60, 0, 0), '30')).toBe(false);
  });

  it('seconds out of range → false', () => {
    expect(isValid(tc(0, 0, 60, 0), '30')).toBe(false);
  });

  it('negative values → false', () => {
    expect(isValid(tc(-1, 0, 0, 0), '30')).toBe(false);
  });

  it('DF: dropped frames (;00, ;01 at non-10-minute mark) → false', () => {
    expect(isValid(tc(0, 1, 0, 0), '29.97', true)).toBe(false);
    expect(isValid(tc(0, 1, 0, 1), '29.97', true)).toBe(false);
  });

  it('DF: frame ;02 at non-10-minute mark → valid', () => {
    expect(isValid(tc(0, 1, 0, 2), '29.97', true)).toBe(true);
  });

  it('DF: frame ;00 at 10-minute mark → valid', () => {
    expect(isValid(tc(0, 10, 0, 0), '29.97', true)).toBe(true);
    expect(isValid(tc(0, 20, 0, 0), '29.97', true)).toBe(true);
  });
});

// ─── framesPerDay ─────────────────────────────────────────────────────────────

describe('framesPerDay', () => {
  it('30fps ND = 24 × 3600 × 30 = 2,592,000', () => {
    expect(framesPerDay('30')).toBe(2_592_000);
  });

  it('25fps ND = 24 × 3600 × 25 = 2,160,000', () => {
    expect(framesPerDay('25')).toBe(2_160_000);
  });

  it('29.97 DF = 2,589,408', () => {
    // 2,592,000 - 2*(1440 - 144) = 2,592,000 - 2*1296 = 2,592,000 - 2592 = 2,589,408
    expect(framesPerDay('29.97', true)).toBe(2_589_408);
  });

  it('29.97 ND = 2,592,000 (same as 30 ND)', () => {
    expect(framesPerDay('29.97', false)).toBe(2_592_000);
  });

  it('59.94 DF = 5,178,816', () => {
    // 24*3600*60 - 4*(1440 - 144) = 5,184,000 - 4*1296 = 5,184,000 - 5184 = 5,178,816
    expect(framesPerDay('59.94', true)).toBe(5_178_816);
  });
});
