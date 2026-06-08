/**
 * Artone v3 — Timeline Variable Speed / Time Remapping
 *
 * Piecewise-linear source↔output time mapping for clip speed manipulation:
 *   - Constant speed (0.25×, 0.5×, 1×, 2×, …)
 *   - Speed ramps (linear transition between speeds)
 *   - Freeze frames (speed = 0 over an output interval)
 *   - Reverse playback (negative speed / decreasing source time)
 *
 * Model: a sorted sequence of (outputTime, sourceTime) keyframes.
 * Between adjacent keyframes the mapping is linear; the segment speed is:
 *
 *   speed = ΔsourceTime / ΔoutputTime
 *
 * Segments with ΔoutputTime ≈ 0 are degenerate (treated as freezes).
 *
 * This module is pure TypeScript with no browser API dependencies.
 *
 * References:
 *   - SMPTE ST 2067-3 (Interoperable Master Format — Composition Playlist)
 *   - OpenTimelineIO LinearTimeWarp.1 (ASWF)
 *   - FCP/Premiere/DaVinci time-remap curve design
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single keyframe mapping an output (playback) time to a source (media) time. */
export interface RemapKeyframe {
  /**
   * Output (playback) position in seconds.
   * Must be strictly increasing across all keyframes in a valid sequence.
   */
  outputTime: number;
  /** Corresponding source (media) time in seconds. May be any real number. */
  sourceTime: number;
}

/** Validation error returned by {@link validateKeyframes}. */
export interface RemapValidationError {
  /** Index of the offending keyframe. */
  index: number;
  /** Human-readable description (in English; translate at the call site). */
  message: string;
}

// ─── Core mapping ─────────────────────────────────────────────────────────────

/**
 * Map an output time to the corresponding source time.
 *
 * Uses linear interpolation between adjacent keyframes. Extrapolates using
 * the first/last segment slope outside the keyframe range.
 *
 * @param outputTime  Playback position in seconds.
 * @param keyframes   Ordered (ascending outputTime) remap keyframes.
 *                    Pass `[]` for identity mapping (source = output).
 */
export function outputToSource(outputTime: number, keyframes: RemapKeyframe[]): number {
  if (keyframes.length === 0) return outputTime;
  if (keyframes.length === 1) return keyframes[0].sourceTime;

  const first = keyframes[0];
  const last  = keyframes[keyframes.length - 1];

  // Extrapolate before first keyframe using first-segment slope
  if (outputTime <= first.outputTime) {
    const speed = segmentSpeed(keyframes, 0);
    return first.sourceTime + speed * (outputTime - first.outputTime);
  }

  // Extrapolate after last keyframe using last-segment slope
  if (outputTime >= last.outputTime) {
    const speed = segmentSpeed(keyframes, keyframes.length - 2);
    return last.sourceTime + speed * (outputTime - last.outputTime);
  }

  // Binary search for the enclosing segment
  let lo = 0, hi = keyframes.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid + 1].outputTime < outputTime) lo = mid + 1;
    else hi = mid;
  }

  return interpolate(keyframes[lo], keyframes[lo + 1], outputTime, 'output');
}

/**
 * Return the instantaneous playback speed at an output time.
 *
 * Speed is piecewise constant within each segment (the slope of the
 * source-time curve). Returns `1` for an empty keyframe array.
 * Returns `0` for freeze-frame segments where ΔoutputTime ≈ 0.
 *
 * @param outputTime  Playback position in seconds.
 * @param keyframes   Ordered remap keyframes.
 */
export function speedAt(outputTime: number, keyframes: RemapKeyframe[]): number {
  if (keyframes.length < 2) return 1;

  const last = keyframes[keyframes.length - 1];

  if (outputTime <= keyframes[0].outputTime) return segmentSpeed(keyframes, 0);
  if (outputTime >= last.outputTime)          return segmentSpeed(keyframes, keyframes.length - 2);

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (outputTime >= keyframes[i].outputTime && outputTime < keyframes[i + 1].outputTime) {
      return segmentSpeed(keyframes, i);
    }
  }
  return segmentSpeed(keyframes, keyframes.length - 2);
}

/**
 * Map a source time to the first corresponding output time.
 *
 * Scans segments in order and returns the output time for the first segment
 * in which `sourceTime` falls. For freeze-frame segments the start of the
 * frozen interval is returned.
 *
 * Returns `null` if the source time lies entirely outside the mapped range.
 *
 * @param sourceTime  Media time in seconds.
 * @param keyframes   Ordered remap keyframes.
 */
export function sourceToOutput(sourceTime: number, keyframes: RemapKeyframe[]): number | null {
  if (keyframes.length === 0) return sourceTime;
  if (keyframes.length === 1) {
    return Math.abs(sourceTime - keyframes[0].sourceTime) < 1e-9
      ? keyframes[0].outputTime
      : null;
  }

  for (let i = 0; i < keyframes.length - 1; i++) {
    const k0 = keyframes[i];
    const k1 = keyframes[i + 1];
    const dSrc = k1.sourceTime - k0.sourceTime;

    if (Math.abs(dSrc) < 1e-9) {
      // Freeze segment: any source time in the frozen range → output start
      if (Math.abs(sourceTime - k0.sourceTime) < 1e-6) return k0.outputTime;
      continue;
    }

    const srcMin = Math.min(k0.sourceTime, k1.sourceTime);
    const srcMax = Math.max(k0.sourceTime, k1.sourceTime);
    if (sourceTime >= srcMin - 1e-9 && sourceTime <= srcMax + 1e-9) {
      return interpolate(k0, k1, sourceTime, 'source');
    }
  }

  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a keyframe sequence and return any errors found.
 * An empty array means the keyframes are valid.
 *
 * Rules:
 *   - All outputTime values must be non-negative.
 *   - outputTime values must be strictly increasing.
 */
export function validateKeyframes(keyframes: RemapKeyframe[]): RemapValidationError[] {
  const errors: RemapValidationError[] = [];

  for (let i = 0; i < keyframes.length; i++) {
    if (keyframes[i].outputTime < 0) {
      errors.push({ index: i, message: 'outputTime must be ≥ 0' });
    }
    if (i > 0 && keyframes[i].outputTime <= keyframes[i - 1].outputTime) {
      errors.push({ index: i, message: 'outputTime must be strictly greater than the previous keyframe' });
    }
  }

  return errors;
}

// ─── Convenience constructors ─────────────────────────────────────────────────

/**
 * Create two keyframes representing a constant playback speed over a clip.
 *
 * @param speed          Playback speed (1 = normal, 2 = double, 0.5 = half, −1 = reverse).
 * @param outputDuration Duration of the output clip in seconds.
 * @param sourceStart    First source frame time in seconds. Default: 0.
 */
export function uniformSpeed(
  speed: number,
  outputDuration: number,
  sourceStart = 0,
): RemapKeyframe[] {
  return [
    { outputTime: 0, sourceTime: sourceStart },
    { outputTime: outputDuration, sourceTime: sourceStart + speed * outputDuration },
  ];
}

/**
 * Compute the range of source times required to render an output time range.
 *
 * @returns `{ min, max }` bounding the source times needed. For reverse
 *          segments `min` may be greater than `max` in the raw per-segment
 *          sense; this helper always returns `min ≤ max`.
 */
export function sourceTimeRange(
  outputStart: number,
  outputEnd: number,
  keyframes: RemapKeyframe[],
): { min: number; max: number } {
  const srcStart = outputToSource(outputStart, keyframes);
  const srcEnd   = outputToSource(outputEnd, keyframes);
  let min = Math.min(srcStart, srcEnd);
  let max = Math.max(srcStart, srcEnd);

  // Also check all keyframe source times within the output range
  for (const kf of keyframes) {
    if (kf.outputTime > outputStart && kf.outputTime < outputEnd) {
      if (kf.sourceTime < min) min = kf.sourceTime;
      if (kf.sourceTime > max) max = kf.sourceTime;
    }
  }

  return { min, max };
}

// ─── Editing helpers ──────────────────────────────────────────────────────────

/**
 * Insert a freeze frame at `outputTime` lasting `freezeDuration` seconds.
 *
 * The source frame at `outputTime` is held for the freeze duration; all
 * subsequent keyframes have their `outputTime` shifted forward by
 * `freezeDuration` while keeping the same `sourceTime`.
 *
 * @param outputTime     Output time at which to begin the freeze.
 * @param freezeDuration Duration of the freeze in seconds. Must be > 0.
 * @param keyframes      Original keyframe array (not mutated).
 * @returns              New sorted keyframe array with the freeze inserted.
 */
export function insertFreeze(
  outputTime: number,
  freezeDuration: number,
  keyframes: RemapKeyframe[],
): RemapKeyframe[] {
  if (freezeDuration <= 0) return keyframes.slice();

  const frozenSrc = outputToSource(outputTime, keyframes);

  // Shift all keyframes that come after the freeze point
  const shifted: RemapKeyframe[] = keyframes.map((kf) =>
    kf.outputTime <= outputTime
      ? { ...kf }
      : { outputTime: kf.outputTime + freezeDuration, sourceTime: kf.sourceTime },
  );

  // Remove any existing keyframe exactly at the freeze start/end to avoid duplicates
  const cleanedBefore = shifted.filter(
    (kf) => Math.abs(kf.outputTime - outputTime) > 1e-9 &&
             Math.abs(kf.outputTime - (outputTime + freezeDuration)) > 1e-9,
  );

  cleanedBefore.push(
    { outputTime,                     sourceTime: frozenSrc },
    { outputTime: outputTime + freezeDuration, sourceTime: frozenSrc },
  );

  return cleanedBefore.sort((a, b) => a.outputTime - b.outputTime);
}

/**
 * Reverse the playback direction for a contiguous output time range.
 *
 * The source content that would have played from `outputStart` to `outputEnd`
 * is reversed: the source frame at `outputEnd` plays first, and the source
 * frame at `outputStart` plays last.
 *
 * Keyframes strictly inside the range are discarded (the segment is replaced
 * with a single two-keyframe linear reverse mapping).
 *
 * @param outputStart  Start of the range to reverse (seconds).
 * @param outputEnd    End of the range to reverse (seconds).
 * @param keyframes    Original keyframe array (not mutated).
 */
export function reverseSegment(
  outputStart: number,
  outputEnd: number,
  keyframes: RemapKeyframe[],
): RemapKeyframe[] {
  const srcAtStart = outputToSource(outputStart, keyframes);
  const srcAtEnd   = outputToSource(outputEnd,   keyframes);

  const outside = keyframes.filter(
    (kf) => kf.outputTime < outputStart || kf.outputTime > outputEnd,
  );

  outside.push(
    { outputTime: outputStart, sourceTime: srcAtEnd },
    { outputTime: outputEnd,   sourceTime: srcAtStart },
  );

  return outside.sort((a, b) => a.outputTime - b.outputTime);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Return the constant speed for segment i → i+1. */
function segmentSpeed(keyframes: RemapKeyframe[], i: number): number {
  const dt = keyframes[i + 1].outputTime - keyframes[i].outputTime;
  if (Math.abs(dt) < 1e-10) return 0;
  return (keyframes[i + 1].sourceTime - keyframes[i].sourceTime) / dt;
}

/**
 * Linearly interpolate between two keyframes.
 * @param by  `'output'` to find sourceTime given outputTime; `'source'` for the inverse.
 */
function interpolate(
  k0: RemapKeyframe,
  k1: RemapKeyframe,
  value: number,
  by: 'output' | 'source',
): number {
  if (by === 'output') {
    const dt = k1.outputTime - k0.outputTime;
    if (Math.abs(dt) < 1e-10) return k0.sourceTime;
    const t = (value - k0.outputTime) / dt;
    return k0.sourceTime + t * (k1.sourceTime - k0.sourceTime);
  } else {
    const ds = k1.sourceTime - k0.sourceTime;
    if (Math.abs(ds) < 1e-10) return k0.outputTime;
    const t = (value - k0.sourceTime) / ds;
    return k0.outputTime + t * (k1.outputTime - k0.outputTime);
  }
}
