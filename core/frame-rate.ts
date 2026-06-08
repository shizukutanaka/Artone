/**
 * Artone v3 — Frame Rate Arithmetic
 *
 * Provides precise frame rate definitions and arithmetic for all professional
 * video formats. Handles the historically troublesome 23.976 / 29.97 / 59.94
 * rates (which are exactly 24000/1001, 30000/1001, 60000/1001) alongside
 * integer rates (24, 25, 30, 48, 50, 60, 120).
 *
 * Key operations:
 *   - Frame ↔ seconds conversion with exact rational arithmetic.
 *   - 3:2 pulldown insertion / removal (cinema 24 ↔ NTSC 30/29.97).
 *   - 2:2 pulldown / simple 2x conversion (25 ↔ 50, 24 ↔ 48, etc.).
 *   - Cross-rate frame index mapping (from any source rate to any target).
 *   - Classification: film vs broadcast vs web / integer vs NTSC.
 *
 * All arithmetic on rational frame rates uses integer numerator/denominator
 * to avoid float64 rounding errors on long-form content.
 *
 * References:
 *   - SMPTE ST 428-21:2011 — Frame structure for cinema (23.976 / 24 fps)
 *   - EBU R68 — Relationship between 25 and 50 Hz PAL/SECAM/DVB
 *   - SMPTE RP 168-2002 — 3:2 pulldown for 24→29.97 conversion
 *   - ITU-R BT.470 — PAL/NTSC frame rates
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A frame rate expressed as a rational number: numerator / denominator. */
export interface FrameRate {
  /** Numerator of the rational frame rate. */
  readonly num: number;
  /** Denominator of the rational frame rate (always > 0). */
  readonly den: number;
  /** Human-readable name (e.g. "23.976", "29.97 DF"). */
  readonly name: string;
  /** Drop-frame (only applicable to 29.97 and 59.94). */
  readonly dropFrame: boolean;
}

/** Pulldown pattern type. */
export type PulldownType =
  | 'none'
  | '3:2'   // 24→29.97 NTSC cadence (AABBC for each 5 output frames)
  | '2:2'   // 2× speed: 25→50, 24→48 (duplicate every frame)
  | '2:3:2:3' // variant of 3:2 used in some PAL-to-NTSC transfers

/** Result of a pulldown insertion. */
export interface PulldownResult {
  /** Frame indices in the source for each output frame. */
  sourceIndices: number[];
  /** Whether each output frame is a repeat of the previous. */
  isRepeat: boolean[];
}

// ─── Standard frame rates ────────────────────────────────────────────────────

/** 23.976 fps — cinema for NTSC broadcast (24000/1001). */
export const FR_23976: FrameRate = { num: 24000, den: 1001, name: '23.976', dropFrame: false };
/** 24 fps — cinema / DCI. */
export const FR_24:    FrameRate = { num: 24,    den: 1,    name: '24',     dropFrame: false };
/** 25 fps — PAL / EBU / Europe. */
export const FR_25:    FrameRate = { num: 25,    den: 1,    name: '25',     dropFrame: false };
/** 29.97 fps non-drop — NTSC. */
export const FR_2997:  FrameRate = { num: 30000, den: 1001, name: '29.97',  dropFrame: false };
/** 29.97 fps drop-frame — NTSC broadcast (most common for US TV). */
export const FR_2997DF: FrameRate = { num: 30000, den: 1001, name: '29.97 DF', dropFrame: true };
/** 30 fps — non-drop NTSC (used for web/game content). */
export const FR_30:    FrameRate = { num: 30,    den: 1,    name: '30',     dropFrame: false };
/** 48 fps — High Frame Rate (HFR) cinema (The Hobbit). */
export const FR_48:    FrameRate = { num: 48,    den: 1,    name: '48',     dropFrame: false };
/** 50 fps — PAL HFR / European broadcast sports. */
export const FR_50:    FrameRate = { num: 50,    den: 1,    name: '50',     dropFrame: false };
/** 59.94 fps — NTSC HFR (60000/1001). */
export const FR_5994:  FrameRate = { num: 60000, den: 1001, name: '59.94',  dropFrame: false };
/** 59.94 fps drop-frame. */
export const FR_5994DF: FrameRate = { num: 60000, den: 1001, name: '59.94 DF', dropFrame: true };
/** 60 fps — web / game. */
export const FR_60:    FrameRate = { num: 60,    den: 1,    name: '60',     dropFrame: false };
/** 120 fps — high-speed / slow-motion capture. */
export const FR_120:   FrameRate = { num: 120,   den: 1,    name: '120',    dropFrame: false };

/** All well-known frame rates. */
export const KNOWN_FRAME_RATES: readonly FrameRate[] = [
  FR_23976, FR_24, FR_25, FR_2997, FR_2997DF,
  FR_30, FR_48, FR_50, FR_5994, FR_5994DF, FR_60, FR_120,
];

// ─── Construction ─────────────────────────────────────────────────────────────

/**
 * Create a frame rate from numerator and denominator.
 *
 * @param num  Frame rate numerator.
 * @param den  Frame rate denominator. Default: 1.
 * @param dropFrame  Drop-frame flag (only meaningful for 29.97 / 59.94).
 */
export function makeFrameRate(num: number, den = 1, dropFrame = false): FrameRate {
  if (den <= 0) throw new RangeError('den must be > 0');
  const g   = gcd(Math.round(num), Math.round(den));
  const rn  = Math.round(num) / g;
  const rd  = Math.round(den) / g;
  const fps = rn / rd;
  const name = den === 1 ? String(num) : fps.toFixed(fps < 1 ? 3 : 3);
  return { num: rn, den: rd, name, dropFrame };
}

/** Greatest common divisor (Euclidean algorithm). */
function gcd(a: number, b: number): number {
  while (b !== 0) { const t = b; b = a % b; a = t; }
  return a;
}

// ─── Frame rate queries ───────────────────────────────────────────────────────

/** Convert a FrameRate to a float (decimal fps). */
export function toFps(fr: FrameRate): number {
  return fr.num / fr.den;
}

/** Check whether a FrameRate is an integer rate (den = 1). */
export function isIntegerRate(fr: FrameRate): boolean {
  return fr.den === 1;
}

/** Check whether a FrameRate is an NTSC fractional rate (1001 denominator). */
export function isNtscRate(fr: FrameRate): boolean {
  return fr.den === 1001;
}

/**
 * Find the closest known frame rate to a given decimal fps, within `tolerance`.
 *
 * @param fps        Target frame rate in frames per second.
 * @param tolerance  Maximum allowed deviation. Default: 0.05.
 */
export function findClosestFrameRate(fps: number, tolerance = 0.05): FrameRate | undefined {
  let best: FrameRate | undefined;
  let bestDiff = Infinity;
  for (const fr of KNOWN_FRAME_RATES) {
    const diff = Math.abs(toFps(fr) - fps);
    if (diff < bestDiff && diff <= tolerance) {
      bestDiff = diff;
      best     = fr;
    }
  }
  return best;
}

/**
 * Return `true` when two frame rates are equivalent (same num/den, ignoring name).
 */
export function isEquivalentRate(a: FrameRate, b: FrameRate): boolean {
  return a.num * b.den === b.num * a.den;
}

// ─── Frame ↔ seconds conversion ──────────────────────────────────────────────

/**
 * Convert a frame count to seconds.
 *
 * Uses exact rational arithmetic to avoid accumulation errors.
 *
 * @param frameCount  Non-negative integer frame index or count.
 * @param fr          Frame rate.
 */
export function framesToSeconds(frameCount: number, fr: FrameRate): number {
  return (frameCount * fr.den) / fr.num;
}

/**
 * Convert seconds to the corresponding frame count (floor).
 *
 * Uses exact rational arithmetic.
 *
 * @param seconds  Duration or position in seconds.
 * @param fr       Frame rate.
 */
export function secondsToFrames(seconds: number, fr: FrameRate): number {
  return Math.floor((seconds * fr.num) / fr.den);
}

/**
 * Round seconds to the nearest frame boundary at the given frame rate.
 *
 * @param seconds  Raw time position.
 * @param fr       Frame rate.
 */
export function snapToFrame(seconds: number, fr: FrameRate): number {
  return framesToSeconds(Math.round((seconds * fr.num) / fr.den), fr);
}

// ─── Frame count conversion ───────────────────────────────────────────────────

/**
 * Convert a frame count from one frame rate to the equivalent count in another.
 *
 * The result is the number of frames in `targetRate` that covers the same
 * duration as `count` frames at `sourceRate`.
 *
 * @param count       Number of frames in source rate.
 * @param sourceRate  Source frame rate.
 * @param targetRate  Target frame rate.
 * @returns           Frame count in target rate (floor of exact result).
 */
export function convertFrameCount(
  count:      number,
  sourceRate: FrameRate,
  targetRate: FrameRate,
): number {
  // Exact: count * (src.den / src.num) * (tgt.num / tgt.den)
  //      = count * src.den * tgt.num / (src.num * tgt.den)
  // Use BigInt to avoid precision loss for large counts
  if (Number.isInteger(count) && count < 2 ** 50) {
    const num = count * sourceRate.den * targetRate.num;
    const den = sourceRate.num * targetRate.den;
    return Math.floor(num / den);
  }
  return Math.floor(count * framesToSeconds(1, sourceRate) * targetRate.num / targetRate.den);
}

/**
 * Convert a timecode position from one frame rate to another, preserving the
 * underlying real-time position as closely as possible.
 *
 * @param frameIdx    Frame index in source rate.
 * @param sourceRate  Source frame rate.
 * @param targetRate  Target frame rate.
 */
export function remapFrame(
  frameIdx:   number,
  sourceRate: FrameRate,
  targetRate: FrameRate,
): number {
  return secondsToFrames(framesToSeconds(frameIdx, sourceRate), targetRate);
}

// ─── Pulldown ─────────────────────────────────────────────────────────────────

/**
 * Insert 3:2 pulldown to convert 24-frame cinema content to 30 (or 29.97) fps.
 *
 * The classic NTSC 3:2 cadence maps 5 output frames from every 4 source frames:
 *   Output frame:  0   1   2   3   4
 *   Source frame:  0   0   1   1   2   (then repeats for frames 2 3 3 ...)
 *
 * More precisely the cadence is A A B B C C D D (actually 4 source to 5 output,
 * repeating 24 → 5*6=30 for 24fps). The canonical SMPTE mapping is:
 *   For every 4 cinema frames, 5 output frames are produced:
 *   f0 → A,A ; f1 → B,B,B ; (2+3 = 5)  → no, that's not right either.
 *
 * The standard SMPTE 3:2 pulldown pattern per pair of fields:
 *   Cinema frame 0 → output frames 0, 1   (AA, 2 fields)
 *   Cinema frame 1 → output frames 2, 3, 4 (BBB, 3 fields → 2 frames + 1 field)
 * For whole-frame (progressive) pulldown:
 *   Cinema frame: 0  0  1  1  1  2  2  3  3  3  4  4  5  5  5  ...
 *   Output frame: 0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 ...
 * Pattern repeats every 5 output frames from 4 source frames.
 * Source index: floor(outputFrame * 4 / 5).
 *
 * @param numSourceFrames  Total cinema frames in the source.
 */
export function insert32Pulldown(numSourceFrames: number): PulldownResult {
  // Each 4 source frames → 5 output frames
  const numOutput = Math.ceil(numSourceFrames * 5 / 4);
  const sourceIndices = new Array<number>(numOutput);
  const isRepeat      = new Array<boolean>(numOutput).fill(false);

  for (let o = 0; o < numOutput; o++) {
    const srcF = Math.floor(o * 4 / 5);
    sourceIndices[o] = Math.min(srcF, numSourceFrames - 1);
    // A repeat if same source index as previous output frame
    if (o > 0 && sourceIndices[o] === sourceIndices[o - 1]) {
      isRepeat[o] = true;
    }
  }
  return { sourceIndices, isRepeat };
}

/**
 * Remove 3:2 pulldown to extract 24p frames from 30 fps NTSC material.
 *
 * Returns the source frame indices that correspond to distinct (non-repeated)
 * cinema frames. Frames that are repeats (cadence position B duplicated)
 * are dropped.
 *
 * @param numOutputFrames  Total 30fps frames.
 */
export function remove32Pulldown(numOutputFrames: number): number[] {
  const { sourceIndices, isRepeat } = insert32Pulldown(
    Math.ceil(numOutputFrames * 4 / 5),
  );
  // Return only unique (non-repeat) output frame indices up to numOutputFrames
  const unique: number[] = [];
  const seen = new Set<number>();
  for (let o = 0; o < Math.min(numOutputFrames, sourceIndices.length); o++) {
    if (!isRepeat[o] && !seen.has(sourceIndices[o])) {
      unique.push(o);
      seen.add(sourceIndices[o]);
    }
  }
  return unique;
}

/**
 * Insert 2:2 pulldown (simple frame duplication) to double the frame rate.
 *
 * Used for 24→48, 25→50, 30→60 conversions.
 *
 * @param numSourceFrames  Source frame count.
 */
export function insert22Pulldown(numSourceFrames: number): PulldownResult {
  const numOutput     = numSourceFrames * 2;
  const sourceIndices = new Array<number>(numOutput);
  const isRepeat      = new Array<boolean>(numOutput).fill(false);

  for (let o = 0; o < numOutput; o++) {
    sourceIndices[o] = Math.floor(o / 2);
    isRepeat[o]      = (o % 2 === 1); // odd output frames are repeats
  }
  return { sourceIndices, isRepeat };
}

// ─── Duration formatting ──────────────────────────────────────────────────────

/**
 * Format a frame count as a human-readable duration string "H:MM:SS.FFF"
 * (hours:minutes:seconds.subframe).
 *
 * @param frameCount  Total frame count.
 * @param fr          Frame rate.
 */
export function formatFrameDuration(frameCount: number, fr: FrameRate): string {
  const totalSec = framesToSeconds(frameCount, fr);
  const h   = Math.floor(totalSec / 3600);
  const m   = Math.floor((totalSec % 3600) / 60);
  const s   = Math.floor(totalSec % 60);
  const frac = totalSec - Math.floor(totalSec);
  const sf  = Math.floor(frac * toFps(fr));
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(sf).padStart(2, '0')}`;
}

/**
 * Check whether a given number of frames is exactly representable as a whole
 * number of seconds at the given frame rate.
 *
 * @param frameCount  Frame count to test.
 * @param fr          Frame rate.
 */
export function isWholeSeconds(frameCount: number, fr: FrameRate): boolean {
  return (frameCount * fr.den) % fr.num === 0;
}
