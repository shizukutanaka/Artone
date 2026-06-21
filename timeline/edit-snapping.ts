/**
 * Artone v3 — Timeline Edit Snapping
 *
 * Pure snapping computation for the magnetic timeline. Extracted as standalone
 * functions so drag/trim interactions can be unit-tested without UI or the
 * stateful `MagneticTimeline` class.
 *
 * Snapping aligns a moving time value (clip edge, playhead, marker drag) to
 * nearby "snap targets" — clip edges, markers, the playhead, in/out points, or
 * a regular grid. Targets carry a priority so that, when two are equally close,
 * the more important one wins (e.g. playhead over grid line).
 *
 * Frame-accurate: callers pass times in seconds; grid/frame helpers use rational
 * frame durations to avoid float drift on long sequences.
 *
 * Design (CLAUDE.md):
 *   - Pure functions, immutable inputs, no side effects.
 *   - Snap thresholds are in TIME units (seconds); the UI converts pixels→time
 *     before calling (`pixelThreshold / zoom`).
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Category of a snap target. Determines default priority. */
export type SnapTargetType =
  | 'playhead'
  | 'clip-start'
  | 'clip-end'
  | 'marker'
  | 'in-point'
  | 'out-point'
  | 'grid'
  | 'sequence-start';

/** A single point on the timeline that a value can snap to. */
export interface SnapTarget {
  /** Time position in seconds. */
  readonly time: number;
  /** What kind of target this is (drives default priority). */
  readonly type: SnapTargetType;
  /** Optional owning clip id (so a clip can exclude snapping to itself). */
  readonly clipId?: string;
  /**
   * Optional explicit priority (higher = preferred on ties). When omitted a
   * sensible default per `type` is used.
   */
  readonly priority?: number;
}

/** Result of a snap query. */
export interface SnapResult {
  /** Whether a snap occurred within the threshold. */
  snapped: boolean;
  /** The snapped time (equals the query value when `snapped` is false). */
  time: number;
  /** The target that was snapped to, if any. */
  target?: SnapTarget;
  /** Signed distance (target.time − queryValue) of the chosen target. */
  delta: number;
}

/** Result of snapping a dragged clip (both edges considered). */
export interface ClipSnapResult {
  /** Whether either edge snapped. */
  snapped: boolean;
  /** Adjusted clip start time. */
  startTime: number;
  /** The time shift applied to the whole clip (snappedStart − originalStart). */
  shift: number;
  /** Which edge snapped: 'start', 'end', or null. */
  edge: 'start' | 'end' | null;
  /** The target snapped to, if any. */
  target?: SnapTarget;
}

// ─── Default priorities ───────────────────────────────────────────────────────

/** Default priority by target type (higher wins ties). */
const DEFAULT_PRIORITY: Record<SnapTargetType, number> = {
  'playhead':       100,
  'in-point':        90,
  'out-point':       90,
  'marker':          80,
  'clip-start':      70,
  'clip-end':        70,
  'sequence-start':  60,
  'grid':            10,
};

/**
 * Resolve the effective priority of a snap target (explicit, else type default).
 *
 * @param t  The snap target.
 */
export function targetPriority(t: SnapTarget): number {
  return t.priority ?? DEFAULT_PRIORITY[t.type] ?? 0;
}

// ─── Snap target generation ───────────────────────────────────────────────────

/** Minimal clip shape needed to derive snap targets. */
export interface SnapClip {
  readonly id: string;
  readonly startTime: number;
  readonly duration: number;
}

/**
 * Build snap targets for clip start/end edges.
 *
 * @param clips  Clips to derive edges from.
 * @returns      Two targets per clip (start + end).
 */
export function clipEdgeTargets(clips: readonly SnapClip[]): SnapTarget[] {
  const targets: SnapTarget[] = [];
  for (const c of clips) {
    targets.push({ time: c.startTime, type: 'clip-start', clipId: c.id });
    targets.push({ time: c.startTime + c.duration, type: 'clip-end', clipId: c.id });
  }
  return targets;
}

/**
 * Generate grid snap targets between `start` and `end` at a fixed `interval`.
 *
 * Grid lines are placed at multiples of `interval` from 0 that fall within
 * [start, end] (inclusive). Useful for beat grids and time rulers.
 *
 * @param start     Range start (seconds, ≥ 0).
 * @param end       Range end (seconds).
 * @param interval  Grid spacing (seconds, > 0).
 */
export function gridTargets(start: number, end: number, interval: number): SnapTarget[] {
  if (interval <= 0) throw new RangeError('interval must be > 0');
  if (end < start) return [];
  const targets: SnapTarget[] = [];
  const firstK = Math.ceil(start / interval);
  const lastK  = Math.floor(end / interval);
  for (let k = firstK; k <= lastK; k++) {
    targets.push({ time: k * interval, type: 'grid' });
  }
  return targets;
}

/**
 * Snap a single time value to the nearest grid line.
 *
 * @param time      Input time (seconds).
 * @param interval  Grid spacing (seconds, > 0).
 * @returns         The nearest multiple of `interval`.
 */
export function snapToGrid(time: number, interval: number): number {
  if (interval <= 0) throw new RangeError('interval must be > 0');
  return Math.round(time / interval) * interval;
}

// ─── Core snapping ────────────────────────────────────────────────────────────

/**
 * Snap a single time value to the best target within `threshold` seconds.
 *
 * "Best" = smallest absolute distance; ties broken by higher priority, then by
 * earlier time (deterministic). Targets whose `clipId` is in `excludeClipIds`
 * are ignored (so a clip never snaps to its own edges).
 *
 * @param value           Time value to snap (seconds).
 * @param targets         Candidate snap targets.
 * @param threshold       Maximum snap distance (seconds, ≥ 0).
 * @param excludeClipIds  Optional set/array of clip ids to ignore.
 * @returns               A SnapResult describing the outcome.
 */
export function snapValue(
  value:          number,
  targets:        readonly SnapTarget[],
  threshold:      number,
  excludeClipIds?: ReadonlySet<string> | readonly string[],
): SnapResult {
  const excluded = toSet(excludeClipIds);
  let best: SnapTarget | undefined;
  let bestDist = Infinity;

  for (const t of targets) {
    if (t.clipId !== undefined && excluded.has(t.clipId)) continue;
    const dist = Math.abs(t.time - value);
    if (dist > threshold) continue;

    if (
      dist < bestDist - 1e-12 ||
      (Math.abs(dist - bestDist) <= 1e-12 && best !== undefined && betterTiebreak(t, best))
    ) {
      best = t;
      bestDist = dist;
    } else if (best === undefined) {
      best = t;
      bestDist = dist;
    }
  }

  if (best === undefined) {
    return { snapped: false, time: value, delta: 0 };
  }
  return { snapped: true, time: best.time, target: best, delta: best.time - value };
}

/**
 * Tiebreak comparison: returns true when `candidate` should beat `current`
 * at equal distance (higher priority, then earlier time).
 */
function betterTiebreak(candidate: SnapTarget, current: SnapTarget): boolean {
  const pc = targetPriority(candidate);
  const pp = targetPriority(current);
  if (pc !== pp) return pc > pp;
  return candidate.time < current.time;
}

/** Normalize an optional id collection to a Set. */
function toSet(ids?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  if (!ids) return EMPTY_SET;
  if (ids instanceof Set) return ids;
  return new Set(ids as readonly string[]);
}
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

// ─── Clip drag snapping (both edges) ─────────────────────────────────────────

/**
 * Snap a dragged clip by considering BOTH its leading and trailing edges.
 *
 * The clip is being moved to `proposedStart`. Both the new start edge and the
 * new end edge (`proposedStart + duration`) are tested against the targets; the
 * edge that yields the smallest snap distance wins, and the whole clip is
 * shifted so that edge lands exactly on the target.
 *
 * The clip's own edges are excluded automatically via `clipId`.
 *
 * @param clipId         Id of the dragged clip (excluded from targets).
 * @param proposedStart  Proposed new start time (seconds).
 * @param duration       Clip duration (seconds).
 * @param targets        Candidate snap targets.
 * @param threshold      Maximum snap distance (seconds, ≥ 0).
 * @returns              A ClipSnapResult with the adjusted start and shift.
 */
export function snapClipDrag(
  clipId:        string,
  proposedStart: number,
  duration:      number,
  targets:       readonly SnapTarget[],
  threshold:     number,
): ClipSnapResult {
  const exclude = new Set<string>([clipId]);
  const startSnap = snapValue(proposedStart, targets, threshold, exclude);
  const endSnap   = snapValue(proposedStart + duration, targets, threshold, exclude);

  // Neither edge snaps
  if (!startSnap.snapped && !endSnap.snapped) {
    return { snapped: false, startTime: proposedStart, shift: 0, edge: null };
  }

  // Choose the edge with the smaller absolute delta; tie → prefer start edge.
  const useStart =
    startSnap.snapped &&
    (!endSnap.snapped || Math.abs(startSnap.delta) <= Math.abs(endSnap.delta));

  if (useStart) {
    return {
      snapped: true,
      startTime: startSnap.time,
      shift: startSnap.delta,
      edge: 'start',
      target: startSnap.target,
    };
  }
  // Snap the end edge → shift clip so end lands on target
  return {
    snapped: true,
    startTime: proposedStart + endSnap.delta,
    shift: endSnap.delta,
    edge: 'end',
    target: endSnap.target,
  };
}

// ─── Target utilities ─────────────────────────────────────────────────────────

/**
 * Merge multiple target lists and remove duplicates that share the same time
 * (within `epsilon`). When duplicates exist, the highest-priority one is kept.
 *
 * @param lists    Arrays of snap targets to merge.
 * @param epsilon  Time tolerance for considering two targets identical. Default: 1e-6.
 */
export function mergeTargets(
  lists:   readonly (readonly SnapTarget[])[],
  epsilon = 1e-6,
): SnapTarget[] {
  const all: SnapTarget[] = [];
  for (const list of lists) for (const t of list) all.push(t);
  all.sort((a, b) => a.time - b.time);

  const result: SnapTarget[] = [];
  for (const t of all) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.time - t.time) <= epsilon) {
      // Keep the higher-priority one
      if (targetPriority(t) > targetPriority(last)) {
        result[result.length - 1] = t;
      }
    } else {
      result.push(t);
    }
  }
  return result;
}

/**
 * Filter targets to those within a visible time range (with margin), to avoid
 * testing off-screen targets during interactive drags.
 *
 * @param targets  All candidate targets.
 * @param start    Visible range start (seconds).
 * @param end      Visible range end (seconds).
 * @param margin   Extra margin added to each side (seconds). Default: 0.
 */
export function targetsInRange(
  targets: readonly SnapTarget[],
  start:   number,
  end:     number,
  margin = 0,
): SnapTarget[] {
  const lo = start - margin;
  const hi = end + margin;
  return targets.filter(t => t.time >= lo && t.time <= hi);
}
