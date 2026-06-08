/**
 * Artone v3 — SMPTE Timecode Arithmetic
 *
 * Parses, formats, and converts SMPTE timecode (ANSI/SMPTE 12M-1-2008,
 * SMPTE RP 188-2008) for the frame rates used in professional video.
 *
 * Supported frame rates: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60 fps.
 * Drop-frame mode is supported for 29.97 and 59.94 fps.
 *
 * Drop-frame timecode skips frame numbers at minute boundaries (but not
 * every 10th minute) so the timecode tracks wall-clock time.  The number
 * of frame numbers dropped per minute is:
 *   - 29.97 DF: 2 per non-10-minute boundary
 *   - 59.94 DF: 4 per non-10-minute boundary
 *
 * Notation:
 *   - Non-drop:  "HH:MM:SS:FF"  (colons)
 *   - Drop-frame: "HH:MM:SS;FF"  (semicolon before frames)
 *
 * References:
 *   - SMPTE ST 12-1:2014 "Time and Control Code"
 *   - SMPTE RP 188-2008 "Timecode Definitions"
 *   - EBU R68-2000 (25fps PAL/SECAM timecodes)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** HH:MM:SS:FF timecode components. All values are non-negative integers. */
export interface Timecode {
  hours:   number;
  minutes: number;
  seconds: number;
  frames:  number;
}

/**
 * Nominal frame rate identifier.
 * 23.976 = 24000/1001, 29.97 = 30000/1001, 59.94 = 60000/1001.
 */
export type FrameRate = '23.976' | '24' | '25' | '29.97' | '30' | '50' | '59.94' | '60';

/** Parsed timecode together with its drop-frame flag. */
export interface ParsedTimecode {
  timecode: Timecode;
  /** True if the string used a semicolon separator (drop-frame notation). */
  drop: boolean;
}

// ─── Frame rate metadata ──────────────────────────────────────────────────────

interface FRSpec {
  /** Nominal (integer) frames per second used in timecode arithmetic. */
  nominal: number;
  /** Actual playback rate in frames/second. */
  exact: number;
  /** Frames dropped per non-10-minute boundary (0 for non-drop rates). */
  dropFrames: number;
}

const FR_SPEC: Readonly<Record<FrameRate, FRSpec>> = {
  '23.976': { nominal: 24,  exact: 24000/1001,  dropFrames: 0 },
  '24':     { nominal: 24,  exact: 24,           dropFrames: 0 },
  '25':     { nominal: 25,  exact: 25,           dropFrames: 0 },
  '29.97':  { nominal: 30,  exact: 30000/1001,   dropFrames: 2 },
  '30':     { nominal: 30,  exact: 30,           dropFrames: 0 },
  '50':     { nominal: 50,  exact: 50,           dropFrames: 0 },
  '59.94':  { nominal: 60,  exact: 60000/1001,   dropFrames: 4 },
  '60':     { nominal: 60,  exact: 60,           dropFrames: 0 },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function spec(fr: FrameRate): FRSpec {
  return FR_SPEC[fr];
}

/**
 * Resolve whether to use drop-frame mode.
 *
 * If `drop` is explicitly provided, that value is used.
 * Otherwise defaults to `false` (non-drop frame).
 * Note: calling code should default to `true` for 29.97/59.94 in broadcast
 * contexts; this function does not enforce that policy.
 */
function resolveDF(drop: boolean | undefined): boolean {
  return drop === true;
}

// ─── Core conversion ─────────────────────────────────────────────────────────

/**
 * Convert a timecode to an absolute frame number.
 *
 * For drop-frame timecodes:
 *   frame = nominal*3600*hh + nominal*60*mm + nominal*ss + ff
 *           − d × (totalMinutes − ⌊totalMinutes/10⌋)
 * where d is the number of frames dropped per non-10-minute boundary.
 *
 * @param tc    Timecode components.
 * @param fr    Frame rate.
 * @param drop  Whether to apply drop-frame arithmetic. Default: false.
 */
export function toFrames(tc: Timecode, fr: FrameRate, drop?: boolean): number {
  const { nominal, dropFrames } = spec(fr);
  const { hours: hh, minutes: mm, seconds: ss, frames: ff } = tc;
  const base = nominal * 3600 * hh + nominal * 60 * mm + nominal * ss + ff;
  if (!resolveDF(drop) || dropFrames === 0) return base;

  const totalMinutes = 60 * hh + mm;
  return base - dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
}

/**
 * Convert an absolute frame number to a timecode.
 *
 * Uses the inverse of the drop-frame formula when `drop` is true.
 *
 * @param frameNumber  Non-negative absolute frame count.
 * @param fr           Frame rate.
 * @param drop         Whether to produce drop-frame timecode. Default: false.
 */
export function fromFrames(frameNumber: number, fr: FrameRate, drop?: boolean): Timecode {
  const { nominal, dropFrames } = spec(fr);
  const n = Math.max(0, Math.floor(frameNumber));

  if (!resolveDF(drop) || dropFrames === 0) {
    // Non-drop-frame: straightforward division
    return {
      hours:   Math.floor(n / (nominal * 3600)) % 24,
      minutes: Math.floor(n / (nominal * 60)) % 60,
      seconds: Math.floor(n / nominal) % 60,
      frames:  n % nominal,
    };
  }

  // Drop-frame algorithm (supports d=2 for 29.97 and d=4 for 59.94)
  const d   = dropFrames;
  const D10 = nominal * 60 * 10 - d * 9;   // frames per 10-minute block
  const D1  = nominal * 60 - d;             // frames per non-first minute
  const D_first = nominal * 60;             // frames in first minute of 10-min block

  const ten_min = Math.floor(n / D10);
  let rem = n % D10;

  let single_min: number;
  let ff_in_min: number;

  if (rem < D_first) {
    single_min = 0;
    ff_in_min  = rem;
  } else {
    rem -= D_first;
    single_min = Math.min(Math.floor(rem / D1) + 1, 9);
    ff_in_min  = (rem % D1) + d;   // restore the d dropped frame-number slots
  }

  const totalMinutes = ten_min * 10 + single_min;
  return {
    hours:   Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
    seconds: Math.floor(ff_in_min / nominal),
    frames:  ff_in_min % nominal,
  };
}

// ─── Arithmetic ───────────────────────────────────────────────────────────────

/**
 * Add two timecodes (treating both as a duration counted in frames).
 *
 * @param a     First timecode.
 * @param b     Second timecode (added as frame count).
 * @param fr    Frame rate for arithmetic.
 * @param drop  Drop-frame mode. Default: false.
 */
export function add(a: Timecode, b: Timecode, fr: FrameRate, drop?: boolean): Timecode {
  const df = resolveDF(drop);
  return fromFrames(toFrames(a, fr, df) + toFrames(b, fr, df), fr, df);
}

/**
 * Subtract timecode `b` from `a`.
 * If the result is negative the return value is clamped to frame 0.
 *
 * @param a     Minuend timecode.
 * @param b     Subtrahend timecode.
 * @param fr    Frame rate.
 * @param drop  Drop-frame mode. Default: false.
 */
export function subtract(a: Timecode, b: Timecode, fr: FrameRate, drop?: boolean): Timecode {
  const df = resolveDF(drop);
  const diff = toFrames(a, fr, df) - toFrames(b, fr, df);
  return fromFrames(Math.max(0, diff), fr, df);
}

/**
 * Compare two timecodes.
 * @returns Negative if `a < b`, zero if equal, positive if `a > b`.
 */
export function compare(a: Timecode, b: Timecode, fr: FrameRate, drop?: boolean): number {
  const df = resolveDF(drop);
  return toFrames(a, fr, df) - toFrames(b, fr, df);
}

// ─── Time conversion ──────────────────────────────────────────────────────────

/**
 * Convert a timecode to elapsed seconds.
 *
 * For drop-frame timecodes the elapsed time uses the actual frame rate
 * (30000/1001 for 29.97, 60000/1001 for 59.94), so the result tracks
 * wall-clock time.  For non-drop timecodes the nominal integer frame rate
 * is used.
 *
 * @param tc    Timecode components.
 * @param fr    Frame rate.
 * @param drop  Drop-frame mode. Default: false.
 */
export function toSeconds(tc: Timecode, fr: FrameRate, drop?: boolean): number {
  const { exact, nominal } = spec(fr);
  const df = resolveDF(drop);
  const n  = toFrames(tc, fr, df);
  return df ? n / exact : n / nominal;
}

/**
 * Convert elapsed seconds to a timecode.
 *
 * @param seconds  Elapsed time in seconds (non-negative).
 * @param fr       Frame rate.
 * @param drop     Drop-frame mode. Default: false.
 */
export function fromSeconds(seconds: number, fr: FrameRate, drop?: boolean): Timecode {
  const { exact, nominal } = spec(fr);
  const df = resolveDF(drop);
  const n  = Math.round(Math.max(0, seconds) * (df ? exact : nominal));
  return fromFrames(n, fr, df);
}

// ─── Parsing and formatting ───────────────────────────────────────────────────

/** Regular expression for "HH:MM:SS:FF" (non-drop) or "HH:MM:SS;FF" (drop). */
const TC_RE = /^(\d{2}):(\d{2}):(\d{2})([;:])(\d{2})$/;

/**
 * Parse a timecode string into its components.
 *
 * Accepts both drop-frame notation ("HH:MM:SS;FF") and non-drop
 * notation ("HH:MM:SS:FF").
 *
 * @returns `ParsedTimecode` if the string is well-formed, `null` otherwise.
 */
export function parse(tc: string): ParsedTimecode | null {
  const m = TC_RE.exec(tc.trim());
  if (!m) return null;
  return {
    timecode: {
      hours:   parseInt(m[1], 10),
      minutes: parseInt(m[2], 10),
      seconds: parseInt(m[3], 10),
      frames:  parseInt(m[5], 10),
    },
    drop: m[4] === ';',
  };
}

/**
 * Format a timecode as a string.
 *
 * @param tc    Timecode components.
 * @param drop  If true, uses semicolon separator "HH:MM:SS;FF".
 *              If false, uses colon notation "HH:MM:SS:FF".
 */
export function format(tc: Timecode, drop: boolean): string {
  const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
  const sep = drop ? ';' : ':';
  return `${pad(tc.hours)}:${pad(tc.minutes)}:${pad(tc.seconds)}${sep}${pad(tc.frames)}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Return true if the timecode components are in range for the given frame rate.
 *
 * Checks that:
 *   - hours ∈ [0, 23], minutes ∈ [0, 59], seconds ∈ [0, 59]
 *   - frames ∈ [0, nominal_fps − 1]
 *   - For drop-frame: the frame numbers 0…d−1 at non-10-minute boundaries
 *     are rejected (they are reserved by the DF standard).
 *
 * @param tc    Timecode components.
 * @param fr    Frame rate.
 * @param drop  Drop-frame mode. Default: false.
 */
export function isValid(tc: Timecode, fr: FrameRate, drop?: boolean): boolean {
  const { nominal, dropFrames } = spec(fr);
  const { hours, minutes, seconds, frames } = tc;

  if (hours < 0 || hours > 23) return false;
  if (minutes < 0 || minutes > 59) return false;
  if (seconds < 0 || seconds > 59) return false;
  if (frames < 0 || frames >= nominal) return false;

  if (resolveDF(drop) && dropFrames > 0) {
    // Reject dropped frame numbers at non-10-minute boundaries
    if (seconds === 0 && minutes % 10 !== 0 && frames < dropFrames) return false;
  }

  return true;
}

/**
 * Return the total number of frames in a 24-hour day for the given rate.
 * Useful for wrapping timecodes at the day boundary.
 *
 * @param fr    Frame rate.
 * @param drop  Drop-frame mode. Default: false.
 */
export function framesPerDay(fr: FrameRate, drop?: boolean): number {
  const { nominal, dropFrames } = spec(fr);
  const base = nominal * 3600 * 24;  // 24 × 3600 × fps frames
  if (!resolveDF(drop) || dropFrames === 0) return base;

  // Total minutes in a day: 1440
  // Non-10-minute boundaries: 1440 - 144 = 1296
  const nonTenMin = 1440 - Math.floor(1440 / 10);
  return base - dropFrames * nonTenMin;
}
