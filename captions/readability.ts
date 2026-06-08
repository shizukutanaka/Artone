/**
 * Caption Readability — broadcast-spec normalization
 *
 * Enforces Netflix / YouTube / EBU STL reading-speed and line-length rules
 * on raw ASR segments before they are imported into a CaptionTrack.
 *
 * Reference specs:
 *   Netflix Timed Text Style Guide: max 42 chars/line, 2 lines, 17 CPS (standard) / 20 CPS (fast)
 *   EBU R37 / EBU STL: max 40 chars/line, 2 lines, 17 CPS
 *   BBC Subtitle Guidelines: max 37 chars/line
 *   YouTube auto-caption: max 80 chars/cue (1-line), 17 CPS
 *
 * All operations are pure (no side effects), fully testable without DOM.
 */

// ============================================================
// Types
// ============================================================

/** One raw ASR-sourced segment (times in seconds). */
export interface RawCue {
  start: number;
  end: number;
  text: string;
}

/** Normalized output cue, ready for CaptionTrack.addCaption(). */
export interface NormalizedCue {
  start: number;
  end: number;
  /** Display text, already wrapped into lines with '\n'. */
  text: string;
  /** Actual CPS of this cue (informational). */
  cps: number;
}

/** Broadcast profile selects preset defaults. */
export type BroadcastProfile = 'netflix' | 'youtube' | 'ebu' | 'bbc' | 'custom';

export interface ReadabilityOptions {
  /** Maximum printable characters per line (default 42). */
  maxCharsPerLine?: number;
  /** Maximum lines per cue (default 2). */
  maxLines?: number;
  /** Maximum characters per second (default 17). */
  maxCps?: number;
  /**
   * Minimum cue duration in seconds (default 1.0).
   * When a split cue would be shorter, it gets extended to this floor.
   */
  minDurationSec?: number;
  /**
   * Minimum gap between split cues in seconds (default 0.04 — 1 frame @25fps).
   * Prevents flash-subtitle effect.
   */
  minGapSec?: number;
  /** Preset profile (overrides individual defaults, own fields still override profile). */
  profile?: BroadcastProfile;
}

// ============================================================
// Profile presets
// ============================================================

const PROFILES: Record<BroadcastProfile, Required<Omit<ReadabilityOptions, 'profile'>>> = {
  netflix: { maxCharsPerLine: 42, maxLines: 2, maxCps: 17, minDurationSec: 1.0, minGapSec: 0.04 },
  youtube: { maxCharsPerLine: 42, maxLines: 2, maxCps: 20, minDurationSec: 0.8, minGapSec: 0.04 },
  ebu:     { maxCharsPerLine: 40, maxLines: 2, maxCps: 17, minDurationSec: 1.0, minGapSec: 0.04 },
  bbc:     { maxCharsPerLine: 37, maxLines: 2, maxCps: 17, minDurationSec: 1.0, minGapSec: 0.04 },
  custom:  { maxCharsPerLine: 42, maxLines: 2, maxCps: 17, minDurationSec: 1.0, minGapSec: 0.04 },
};

function resolveOptions(opts: ReadabilityOptions): Required<Omit<ReadabilityOptions, 'profile'>> {
  const base = PROFILES[opts.profile ?? 'netflix'];
  return {
    maxCharsPerLine: opts.maxCharsPerLine ?? base.maxCharsPerLine,
    maxLines:        opts.maxLines        ?? base.maxLines,
    maxCps:          opts.maxCps          ?? base.maxCps,
    minDurationSec:  opts.minDurationSec  ?? base.minDurationSec,
    minGapSec:       opts.minGapSec       ?? base.minGapSec,
  };
}

// ============================================================
// Word-wrap helpers
// ============================================================

/**
 * Wraps `text` into lines of at most `maxChars` printable characters.
 * Splits on whitespace; does not break hyphenated tokens.
 * Returns array of line strings.
 */
export function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current.length > 0) lines.push(current);
      // Long word wider than maxChars: hard-break at maxChars boundary
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        current = remaining;
      } else {
        current = word;
      }
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

// ============================================================
// CPS utilities
// ============================================================

/** Counts printable characters (strips '\n', trailing spaces). */
export function countPrintableChars(text: string): number {
  return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/** Characters per second for a cue. Returns 0 for zero-duration cues. */
export function cps(text: string, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return countPrintableChars(text) / durationSec;
}

// ============================================================
// Single-cue normalization (wrap + duration extension)
// ============================================================

/**
 * Wraps a cue's text into ≤maxLines lines of ≤maxCharsPerLine characters.
 * Returns all lines (caller decides whether to split into multiple cues).
 */
function wrapCue(
  text: string,
  maxCharsPerLine: number,
  maxLines: number
): string[][] {
  const rawLines = wrapWords(text, maxCharsPerLine);

  // Chunk into groups of maxLines for cue splitting
  const groups: string[][] = [];
  for (let i = 0; i < rawLines.length; i += maxLines) {
    groups.push(rawLines.slice(i, i + maxLines));
  }
  return groups.length > 0 ? groups : [['']];
}

// ============================================================
// Main export: normalizeCues
// ============================================================

/**
 * Normalises raw ASR cues into broadcast-compliant NormalizedCue[]:
 *
 * 1. Word-wraps each cue to maxCharsPerLine.
 * 2. Splits cues exceeding maxLines into sequential timed sub-cues.
 * 3. Extends sub-cue durations when CPS > maxCps (slower reading pace).
 * 4. Enforces minDurationSec floor per cue.
 * 5. Applies minGapSec between adjacent split cues.
 * 6. Empty cues are dropped.
 */
export function normalizeCues(
  segments: RawCue[],
  options: ReadabilityOptions = {}
): NormalizedCue[] {
  const opts = resolveOptions(options);
  const result: NormalizedCue[] = [];

  for (const seg of segments) {
    const text = seg.text.trim();
    if (text.length === 0) continue;

    const originalDuration = Math.max(0, seg.end - seg.start);
    const groups = wrapCue(text, opts.maxCharsPerLine, opts.maxLines);

    if (groups.length === 1) {
      // Fast path: no splitting needed
      const displayText = groups[0].join('\n');
      const chars = countPrintableChars(displayText);

      // Minimum duration required by maxCps
      const minBySpeed = chars / opts.maxCps;
      const duration = Math.max(originalDuration, minBySpeed, opts.minDurationSec);

      result.push({
        start: seg.start,
        end: seg.start + duration,
        text: displayText,
        cps: cps(displayText, duration),
      });
    } else {
      // Splitting path: distribute total char count proportionally across sub-cues
      const groupTexts = groups.map((g) => g.join('\n'));
      const groupChars = groupTexts.map(countPrintableChars);
      const totalChars = groupChars.reduce((s, n) => s + n, 0);

      // Minimum total duration accounting for all sub-cues' speed requirements
      const minTotalBySpeed = groupChars.reduce((s, n) => s + n / opts.maxCps, 0);
      const totalGap = opts.minGapSec * (groups.length - 1);
      const totalAvailable = Math.max(originalDuration, minTotalBySpeed + totalGap, opts.minDurationSec * groups.length + totalGap);

      const contentDuration = totalAvailable - totalGap;

      let cursor = seg.start;
      for (let i = 0; i < groupTexts.length; i++) {
        const displayText = groupTexts[i];
        const chars = groupChars[i];

        // Proportional share of content duration, floored by minDurationSec and speed
        const shareRatio = totalChars > 0 ? chars / totalChars : 1 / groupTexts.length;
        const rawShare = contentDuration * shareRatio;
        const minBySpeed = chars / opts.maxCps;
        const subDuration = Math.max(rawShare, minBySpeed, opts.minDurationSec);

        const start = cursor;
        const end = start + subDuration;

        result.push({
          start,
          end,
          text: displayText,
          cps: cps(displayText, subDuration),
        });

        cursor = end + (i < groupTexts.length - 1 ? opts.minGapSec : 0);
      }
    }
  }

  return result;
}

// ============================================================
// Diagnostic: audit existing NormalizedCue[] for violations
// ============================================================

export interface ReadabilityViolation {
  index: number;
  type: 'cps' | 'line_length' | 'line_count';
  detail: string;
}

/**
 * Audits a cue array for broadcast-spec violations.
 * Returns an array of violations (empty = compliant).
 */
export function auditCues(
  cues: NormalizedCue[],
  options: ReadabilityOptions = {}
): ReadabilityViolation[] {
  const opts = resolveOptions(options);
  const violations: ReadabilityViolation[] = [];

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const lines = c.text.split('\n');

    if (lines.length > opts.maxLines) {
      violations.push({
        index: i,
        type: 'line_count',
        detail: `${lines.length} lines > max ${opts.maxLines}`,
      });
    }

    for (const line of lines) {
      if (line.length > opts.maxCharsPerLine) {
        violations.push({
          index: i,
          type: 'line_length',
          detail: `line "${line.slice(0, 20)}…" length ${line.length} > max ${opts.maxCharsPerLine}`,
        });
        break; // one violation per cue for line_length
      }
    }

    const actualCps = cps(c.text, c.end - c.start);
    if (actualCps > opts.maxCps) {
      violations.push({
        index: i,
        type: 'cps',
        detail: `${actualCps.toFixed(1)} CPS > max ${opts.maxCps}`,
      });
    }
  }

  return violations;
}
