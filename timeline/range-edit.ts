/**
 * Artone v3 — Range Edit (three-point editing: Lift / Extract)
 *
 * プロ NLE (Premiere / FCP / DaVinci) の中核操作。マーク した in→out 範囲に対し:
 *   - Lift    : 範囲を取り除き **隙間を残す** (後続クリップは動かない)
 *   - Extract : 範囲を取り除き **後続を左へ詰める** (ripple、尺が縮む)
 *
 * 範囲にかかるクリップの扱い:
 *   - 完全に範囲内       → 削除
 *   - 左端だけ範囲にかかる → 末尾をトリム (頭を残す)
 *   - 右端だけ範囲にかかる → 先頭をトリム (尻を残す)
 *   - 範囲がクリップ内部   → 2分割し中央を除去 (頭 + 尻)
 *
 * メディア参照 (mediaIn/mediaOut) は splitClip と同じ線形 1:1 マッピングで保つ:
 * タイムライン時刻 t のソース位置 = mediaIn + (t − startTime)。
 *
 * 全て純関数。DOM/タイマー非依存で完全にユニットテスト可能。
 *
 * # AI generated (reviewed)
 */

import type { Clip } from './magnetic-timeline';

/** A half-open time range [start, end) in seconds. */
export interface TimeRange {
  start: number;
  end: number;
}

export interface RangeEditOptions {
  /** Restrict the edit to a single track. When omitted, all tracks are edited. */
  trackId?: string;
  /** Id generator for split tails (injectable for deterministic tests). */
  newId?: () => string;
}

export interface RangeEditResult {
  /**
   * Clips created or modified by the edit. Existing clips keep their id
   * (head/trim pieces and rippled clips); split tails receive a fresh id.
   * The caller should `set()` each of these into its clip store.
   */
  clips: Clip[];
  /** Ids of clips removed entirely (fully inside the range). Caller deletes these. */
  removedIds: string[];
}

const EPS = 1e-9;

/** Build a sub-clip covering timeline range [a, b) of `c`, preserving media mapping. */
function subClip(c: Clip, a: number, b: number, id: string, nameSuffix = ''): Clip {
  return {
    ...c,
    id,
    name: nameSuffix ? c.name + nameSuffix : c.name,
    startTime: a,
    duration: b - a,
    mediaIn: c.mediaIn + (a - c.startTime),
    mediaOut: c.mediaIn + (b - c.startTime),
    transform: { ...c.transform },
    selected: false,
  };
}

/** Whether a clip is eligible to be edited (matches track filter, not locked). */
function eligible(c: Clip, trackId?: string): boolean {
  if (c.locked) return false;
  if (trackId !== undefined && c.trackId !== trackId) return false;
  return true;
}

/**
 * Core range cut. `ripple` controls Extract (true) vs Lift (false).
 *
 * Locked clips and clips on other tracks (when `trackId` is set) are left
 * untouched — they are not returned and not removed.
 */
function cutRange(
  clips: readonly Clip[],
  range: TimeRange,
  ripple: boolean,
  opts: RangeEditOptions,
): RangeEditResult {
  const rs = range.start;
  const re = range.end;
  const result: RangeEditResult = { clips: [], removedIds: [] };

  // Invalid / empty range is a no-op (defensive: NaN, end ≤ start).
  if (!(re > rs)) return result;

  const newId = opts.newId ?? (() => crypto.randomUUID());
  const rippleAmount = ripple ? re - rs : 0;

  /** Apply ripple shift to a piece whose start is at/after the range end. */
  const shifted = (c: Clip): Clip =>
    rippleAmount > 0 && c.startTime >= re - EPS
      ? { ...c, startTime: Math.max(0, c.startTime - rippleAmount) }
      : c;

  for (const c of clips) {
    if (!eligible(c, opts.trackId)) continue;

    const cs = c.startTime;
    const ce = c.startTime + c.duration;

    // No overlap.
    if (ce <= rs + EPS) {
      continue; // fully before — untouched
    }
    if (cs >= re - EPS) {
      // Fully after — only changes under ripple (Extract).
      if (rippleAmount > 0) result.clips.push(shifted(c));
      continue;
    }
    // Fully covered → removed.
    if (cs >= rs - EPS && ce <= re + EPS) {
      result.removedIds.push(c.id);
      continue;
    }
    // Range strictly inside clip → split into head + tail.
    if (cs < rs - EPS && ce > re + EPS) {
      result.clips.push(subClip(c, cs, rs, c.id));
      result.clips.push(shifted(subClip(c, re, ce, newId(), ' (2)')));
      continue;
    }
    // Overlap left edge → keep head [cs, rs).
    if (cs < rs - EPS) {
      result.clips.push(subClip(c, cs, rs, c.id));
      continue;
    }
    // Overlap right edge → keep tail [re, ce).
    result.clips.push(shifted(subClip(c, re, ce, c.id)));
  }

  return result;
}

/**
 * Lift: remove the [start, end) range from the timeline, leaving a gap.
 * Subsequent clips do not move.
 */
export function liftRange(
  clips: readonly Clip[],
  range: TimeRange,
  opts: RangeEditOptions = {},
): RangeEditResult {
  return cutRange(clips, range, false, opts);
}

/**
 * Extract: remove the [start, end) range and ripple everything after it left by
 * the range length so the gap is closed. Sequence duration shrinks.
 */
export function extractRange(
  clips: readonly Clip[],
  range: TimeRange,
  opts: RangeEditOptions = {},
): RangeEditResult {
  return cutRange(clips, range, true, opts);
}
