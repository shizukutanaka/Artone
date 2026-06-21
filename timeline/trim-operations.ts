/**
 * Artone v3 — Pure Timeline Trim Operations
 *
 * Immutable implementations of the four fundamental NLE trim operations.
 * These functions take a clip array and return a new array — they perform no
 * mutation, making them suitable for use with the Command Pattern (undo/redo).
 *
 * The four operations:
 *   - **Ripple**  Move an edit point; subsequent clips shift to fill or close
 *                 the gap. Total sequence duration changes.
 *   - **Roll**    Move the edit point between two adjacent clips: one extends,
 *                 the other shortens. No change in total duration or clip positions
 *                 beyond the edit point.
 *   - **Slip**    Change which media frames a clip shows without altering its
 *                 timeline position or duration. Adjusts `mediaIn`/`mediaOut`.
 *   - **Slide**   Shift a clip left or right by extending/shrinking the adjacent
 *                 clips. No change in total sequence duration.
 *
 * All frame measurements are in seconds (float). Callers are responsible for
 * snapping to frame boundaries when needed.
 *
 * References:
 *   - Apple Final Cut Pro User Guide — Magnetic Timeline trim operations
 *   - Adobe Premiere Pro Help — Trim clips in a Timeline
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal clip representation for trim operations. */
export interface TrimClip {
  readonly id: string;
  /** Start time on the timeline, in seconds. */
  readonly startTime: number;
  /** Duration on the timeline, in seconds. */
  readonly duration: number;
  /** Timecode of the first frame used from the source media, in seconds. */
  readonly mediaIn: number;
  /** Timecode of the last frame used from the source media, in seconds. */
  readonly mediaOut: number;
  /** Whether this clip is locked (locked clips are skipped by ripple). */
  readonly locked?: boolean;
}

/** A clip with all fields writable (used to build result arrays). */
export type MutableClip = {
  -readonly [K in keyof TrimClip]: TrimClip[K];
};

/** Outcome of a trim operation. */
export interface TrimResult {
  /** Updated clip array (new references for modified clips). */
  clips: TrimClip[];
  /** Whether the operation succeeded without violating any constraint. */
  ok: boolean;
  /** Human-readable reason if `ok` is false. */
  reason?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return a shallow copy of the array with the clip at `index` replaced. */
function replaceAt(clips: TrimClip[], index: number, updated: TrimClip): TrimClip[] {
  return clips.map((c, i) => (i === index ? updated : c));
}

/** Return a shallow copy of the array with multiple indices replaced. */
function replaceMany(
  clips: TrimClip[],
  updates: ReadonlyMap<number, TrimClip>,
): TrimClip[] {
  return clips.map((c, i) => updates.get(i) ?? c);
}

/** Find the index of a clip by id, or −1. */
function findById(clips: TrimClip[], id: string): number {
  return clips.findIndex((c) => c.id === id);
}

/** Return a failed TrimResult with a reason. */
function fail(reason: string): TrimResult {
  return { clips: [], ok: false, reason };
}

// ─── Ripple trim ─────────────────────────────────────────────────────────────

/**
 * Ripple-trim the **start** of a clip.
 *
 * Moves the in-point of `clipId` by `delta` seconds.
 * - Positive delta → clip shrinks from the left; media in-point advances.
 * - Negative delta → clip extends to the left; media in-point recedes.
 *
 * All clips whose `startTime` is ≥ the original start of the trimmed clip
 * (except the trimmed clip itself) are shifted by `delta` to maintain contact.
 *
 * @param clips   Current clip array.
 * @param clipId  ID of the clip to trim.
 * @param delta   Change in seconds (positive = shrink from left).
 */
export function rippleTrimStart(
  clips:  TrimClip[],
  clipId: string,
  delta:  number,
): TrimResult {
  const idx = findById(clips, clipId);
  if (idx < 0) return fail(`Clip '${clipId}' not found`);

  const clip = clips[idx];
  if (clip.locked) return fail(`Clip '${clipId}' is locked`);

  const newMediaIn = clip.mediaIn  + delta;
  const newDuration = clip.duration - delta;
  const newStart   = clip.startTime + delta;

  if (newDuration <= 0)       return fail('Clip duration would reach zero');
  if (newMediaIn  <  0)       return fail('mediaIn would go negative');
  if (newMediaIn  >= clip.mediaOut) return fail('mediaIn would cross mediaOut');

  const trimmedClip: TrimClip = {
    ...clip,
    startTime: newStart,
    duration:  newDuration,
    mediaIn:   newMediaIn,
  };

  // Shift downstream clips by `delta`
  const updated = clips.map((c, i) => {
    if (i === idx) return trimmedClip;
    if (!c.locked && c.startTime >= clip.startTime - 1e-9 && i !== idx) {
      return { ...c, startTime: c.startTime + delta };
    }
    return c;
  });

  return { clips: updated, ok: true };
}

/**
 * Ripple-trim the **end** of a clip.
 *
 * Moves the out-point of `clipId` by `delta` seconds.
 * - Positive delta → clip extends to the right; media out-point advances.
 * - Negative delta → clip shrinks from the right; media out-point recedes.
 *
 * All clips whose `startTime` is > the original end of the trimmed clip
 * are shifted by `delta`.
 *
 * @param clips   Current clip array.
 * @param clipId  ID of the clip to trim.
 * @param delta   Change in seconds (positive = extend).
 */
export function rippleTrimEnd(
  clips:  TrimClip[],
  clipId: string,
  delta:  number,
): TrimResult {
  const idx = findById(clips, clipId);
  if (idx < 0) return fail(`Clip '${clipId}' not found`);

  const clip    = clips[idx];
  if (clip.locked) return fail(`Clip '${clipId}' is locked`);

  const newDuration  = clip.duration  + delta;
  const newMediaOut  = clip.mediaOut  + delta;
  const clipEnd      = clip.startTime + clip.duration;

  if (newDuration <= 0)        return fail('Clip duration would reach zero');
  if (newMediaOut <= clip.mediaIn)  return fail('mediaOut would cross mediaIn');

  const trimmedClip: TrimClip = {
    ...clip,
    duration:  newDuration,
    mediaOut:  newMediaOut,
  };

  // Shift clips that start at or after the original end
  const updated = clips.map((c, i) => {
    if (i === idx) return trimmedClip;
    if (!c.locked && c.startTime >= clipEnd - 1e-9) {
      return { ...c, startTime: c.startTime + delta };
    }
    return c;
  });

  return { clips: updated, ok: true };
}

// ─── Roll trim ───────────────────────────────────────────────────────────────

/**
 * Roll the edit point between `clipAId` (left clip) and `clipBId` (right clip).
 *
 * Clip A's out-point moves by `delta`; Clip B's in-point moves by the same
 * amount. Neither clip changes its timeline start beyond A, nor do clips after
 * B move. Total sequence duration is unchanged.
 *
 * @param clips   Current clip array.
 * @param clipAId ID of the left clip (its end is rolled).
 * @param clipBId ID of the right clip (its start is rolled).
 * @param delta   Change in seconds. Positive = A extends / B shortens.
 */
export function rollTrim(
  clips:   TrimClip[],
  clipAId: string,
  clipBId: string,
  delta:   number,
): TrimResult {
  const iA = findById(clips, clipAId);
  const iB = findById(clips, clipBId);
  if (iA < 0) return fail(`Clip '${clipAId}' not found`);
  if (iB < 0) return fail(`Clip '${clipBId}' not found`);

  const clipA = clips[iA];
  const clipB = clips[iB];

  if (clipA.locked || clipB.locked) return fail('One or both clips are locked');

  // Validate A
  const newADuration  = clipA.duration  + delta;
  const newAMediaOut  = clipA.mediaOut  + delta;
  if (newADuration <= 0)          return fail('Clip A duration would reach zero');
  if (newAMediaOut <= clipA.mediaIn) return fail('Clip A mediaOut would cross mediaIn');

  // Validate B (its start shifts by delta, its duration shrinks by delta)
  const newBDuration  = clipB.duration  - delta;
  const newBMediaIn   = clipB.mediaIn   + delta;
  const newBStart     = clipB.startTime + delta;
  if (newBDuration <= 0)          return fail('Clip B duration would reach zero');
  if (newBMediaIn  >= clipB.mediaOut) return fail('Clip B mediaIn would cross mediaOut');

  const updatedA: TrimClip = { ...clipA, duration: newADuration, mediaOut: newAMediaOut };
  const updatedB: TrimClip = {
    ...clipB,
    startTime: newBStart,
    duration:  newBDuration,
    mediaIn:   newBMediaIn,
  };

  const map = new Map<number, TrimClip>([[iA, updatedA], [iB, updatedB]]);
  return { clips: replaceMany(clips, map), ok: true };
}

// ─── Slip ─────────────────────────────────────────────────────────────────────

/**
 * Slip the media content of a clip without moving it on the timeline.
 *
 * Shifts `mediaIn` and `mediaOut` by `delta` seconds. The clip's timeline
 * position and duration remain unchanged. Other clips are not affected.
 *
 * @param clips   Current clip array.
 * @param clipId  ID of the clip to slip.
 * @param delta   Change in source time (seconds). Positive = show later frames.
 * @param mediaDurationSec  Total source media duration in seconds (used to clamp
 *                           the slip so mediaOut does not exceed the source).
 *                           Pass `Infinity` to skip clamping. Default: Infinity.
 */
export function slipClip(
  clips:           TrimClip[],
  clipId:          string,
  delta:           number,
  mediaDurationSec = Infinity,
): TrimResult {
  const idx = findById(clips, clipId);
  if (idx < 0) return fail(`Clip '${clipId}' not found`);

  const clip = clips[idx];
  if (clip.locked) return fail(`Clip '${clipId}' is locked`);

  const newMediaIn  = clip.mediaIn  + delta;
  const newMediaOut = clip.mediaOut + delta;

  if (newMediaIn  < 0)                 return fail('mediaIn would go negative');
  if (newMediaOut > mediaDurationSec)  return fail('mediaOut would exceed source duration');
  if (newMediaIn  >= newMediaOut)      return fail('mediaIn would cross mediaOut');

  const slipped: TrimClip = { ...clip, mediaIn: newMediaIn, mediaOut: newMediaOut };
  return { clips: replaceAt(clips, idx, slipped), ok: true };
}

// ─── Slide ───────────────────────────────────────────────────────────────────

/**
 * Slide a clip left or right on the timeline by adjusting the adjacent clips.
 *
 * Moving `clipId` by `delta` seconds:
 *   - The clip to the **left** (if any) has its out-point extended/shortened.
 *   - The clip to the **right** (if any) has its in-point shortened/extended.
 *   - The slid clip's own media content is unchanged.
 *
 * For the operation to succeed both adjacent clips must exist (or be absent
 * on one side) and have enough duration to absorb the change.
 *
 * @param clips   Current clip array.
 * @param clipId  ID of the clip to slide.
 * @param delta   Seconds to shift right (positive) or left (negative).
 */
export function slideClip(
  clips:  TrimClip[],
  clipId: string,
  delta:  number,
): TrimResult {
  const idx = findById(clips, clipId);
  if (idx < 0) return fail(`Clip '${clipId}' not found`);

  const clip = clips[idx];
  if (clip.locked) return fail(`Clip '${clipId}' is locked`);
  if (delta === 0) return { clips, ok: true };

  // Find left neighbour: clip whose end is closest to this clip's start
  const clipStart = clip.startTime;
  let   iLeft     = -1;
  for (let i = 0; i < clips.length; i++) {
    if (i === idx || clips[i].locked) continue;
    const cEnd = clips[i].startTime + clips[i].duration;
    if (cEnd <= clipStart + 1e-9) {
      if (iLeft === -1 || cEnd > clips[iLeft].startTime + clips[iLeft].duration) {
        iLeft = i;
      }
    }
  }

  // Find right neighbour: clip whose start is closest to this clip's end
  const clipEnd = clip.startTime + clip.duration;
  let   iRight  = -1;
  for (let i = 0; i < clips.length; i++) {
    if (i === idx || clips[i].locked) continue;
    if (clips[i].startTime >= clipEnd - 1e-9) {
      if (iRight === -1 || clips[i].startTime < clips[iRight].startTime) {
        iRight = i;
      }
    }
  }

  const map = new Map<number, TrimClip>();
  // Slid clip itself moves
  map.set(idx, { ...clip, startTime: clip.startTime + delta });

  // Left neighbour absorbs delta on its right edge
  if (iLeft >= 0) {
    const L = clips[iLeft];
    const newDuration = L.duration + delta;
    const newMediaOut = L.mediaOut + delta;
    if (newDuration <= 0)        return fail('Left clip duration would reach zero');
    if (newMediaOut <= L.mediaIn) return fail('Left clip mediaOut would cross mediaIn');
    map.set(iLeft, { ...L, duration: newDuration, mediaOut: newMediaOut });
  }

  // Right neighbour absorbs -delta on its left edge (in-point shifts)
  if (iRight >= 0) {
    const R = clips[iRight];
    const newDuration = R.duration - delta;
    const newMediaIn  = R.mediaIn  + delta;
    const newStart    = R.startTime + delta;
    if (newDuration <= 0)        return fail('Right clip duration would reach zero');
    if (newMediaIn  >= R.mediaOut) return fail('Right clip mediaIn would cross mediaOut');
    map.set(iRight, { ...R, startTime: newStart, duration: newDuration, mediaIn: newMediaIn });
  }

  return { clips: replaceMany(clips, map), ok: true };
}

// ─── Gap operations ───────────────────────────────────────────────────────────

/**
 * Close a gap in the timeline by ripple-shifting all clips after `gapStartSec`.
 *
 * @param clips       Current clip array.
 * @param gapStartSec Start of the gap (seconds).
 * @param gapDuration Duration of the gap to close (seconds, > 0).
 */
export function closeGap(
  clips:       TrimClip[],
  gapStartSec: number,
  gapDuration: number,
): TrimResult {
  if (gapDuration <= 0) return fail('Gap duration must be positive');
  const updated = clips.map((c) => {
    if (!c.locked && c.startTime >= gapStartSec - 1e-9) {
      return { ...c, startTime: c.startTime - gapDuration };
    }
    return c;
  });
  return { clips: updated, ok: true };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Sort clips by `startTime` ascending and return a new array.
 * Does not mutate the input.
 */
export function sortByStartTime(clips: TrimClip[]): TrimClip[] {
  return clips.slice().sort((a, b) => a.startTime - b.startTime);
}

/**
 * Compute the total sequence duration: end of the last clip.
 */
export function sequenceDuration(clips: TrimClip[]): number {
  let max = 0;
  for (const c of clips) {
    const end = c.startTime + c.duration;
    if (end > max) max = end;
  }
  return max;
}

/**
 * Detect gaps between clips.
 *
 * Returns `[gapStart, gapEnd]` intervals where no clip is present.
 *
 * @param clips       Clip array (any order, will be sorted internally).
 * @param minGapSec   Minimum gap size to report (default: 1 ms).
 */
export function detectGaps(
  clips:      TrimClip[],
  minGapSec = 0.001,
): Array<[number, number]> {
  const sorted  = sortByStartTime(clips);
  const gaps:   Array<[number, number]> = [];
  let   cursor  = 0;

  for (const clip of sorted) {
    if (clip.startTime > cursor + minGapSec) {
      gaps.push([cursor, clip.startTime]);
    }
    const end = clip.startTime + clip.duration;
    if (end > cursor) cursor = end;
  }
  return gaps;
}
