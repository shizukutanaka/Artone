/**
 * Artone v3 — Video Stabilization
 *
 * Pure trajectory-based stabilization, the standard 2-D pipeline used by
 * Premiere Warp Stabilizer, DaVinci Stabilizer, and CapCut "Stabilize":
 *
 *   1. Per-frame inter-frame motion (translation) is estimated upstream by
 *      `render/motion-estimation.ts` and passed in here.
 *   2. **Accumulate** motions into an absolute camera trajectory.
 *   3. **Smooth** the trajectory (moving-average or Gaussian) to model the
 *      intended, steady camera path.
 *   4. **Compensate**: each frame's correction = smoothed − original path.
 *   5. **Crop**: compute the largest centered window that stays inside every
 *      frame after compensation, so no black borders appear.
 *
 * This module is deliberately motion-source-agnostic: feed it translations from
 * block matching, optical flow, or gyro data. Pure, deterministic, testable.
 *
 * References:
 *   - Matsushita et al. 2006: "Full-frame Video Stabilization".
 *   - Grundmann et al. 2011: "Auto-Directed Video Stabilization with Robust
 *     L1 Optimal Camera Paths".
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A 2-D translation. */
export interface Translation {
  x: number;
  y: number;
}

/** Smoothing method for the camera path. */
export type SmoothingMethod = 'moving-average' | 'gaussian';

/** Options for stabilization. */
export interface StabilizeOptions {
  /**
   * Smoothing radius in frames (window half-width). Larger = steadier but more
   * cropping. Default: 15.
   */
  smoothingRadius?: number;
  /** Smoothing method. Default: 'gaussian'. */
  method?: SmoothingMethod;
  /**
   * Maximum per-frame correction magnitude in pixels (clamps extreme
   * compensations). 0 = unlimited. Default: 0.
   */
  maxCorrection?: number;
}

/** Per-frame stabilization correction. */
export interface FrameCorrection {
  /** Frame index. */
  frame: number;
  /** Translation to apply to the frame to stabilize it. */
  correction: Translation;
}

/** A centered crop rectangle. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Full stabilization result. */
export interface StabilizeResult {
  /** Per-frame corrections to apply. */
  corrections: FrameCorrection[];
  /** The original (accumulated) camera trajectory. */
  trajectory: Translation[];
  /** The smoothed camera trajectory. */
  smoothed: Translation[];
  /** Recommended crop rectangle to hide borders across all frames. */
  crop: CropRect;
}

// ─── Trajectory accumulation ──────────────────────────────────────────────────

/**
 * Accumulate per-frame inter-frame motions into an absolute trajectory.
 *
 * `motions[i]` is the motion from frame i to frame i+1. The trajectory has
 * `motions.length + 1` entries; trajectory[0] = (0,0).
 *
 * @param motions  Inter-frame translations.
 * @returns        Absolute cumulative positions.
 */
export function accumulateTrajectory(motions: readonly Translation[]): Translation[] {
  const traj: Translation[] = [{ x: 0, y: 0 }];
  let cx = 0, cy = 0;
  for (const m of motions) {
    cx += m.x; cy += m.y;
    traj.push({ x: cx, y: cy });
  }
  return traj;
}

// ─── Smoothing ────────────────────────────────────────────────────────────────

/** Build a normalized 1-D Gaussian kernel of the given radius. */
function gaussianWeights(radius: number): number[] {
  const sigma = Math.max(1e-6, radius / 2);
  const w: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    w.push(v); sum += v;
  }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  return w;
}

/**
 * Smooth a 1-D trajectory of values with a moving-average or Gaussian window.
 * Boundary samples are handled by edge replication.
 *
 * @param values  Trajectory values.
 * @param radius  Window half-width (≥ 0).
 * @param method  Smoothing method.
 * @returns       Smoothed values (same length).
 */
export function smoothSeries(
  values: readonly number[],
  radius: number,
  method: SmoothingMethod = 'gaussian',
): number[] {
  const n = values.length;
  if (n === 0 || radius <= 0) return values.slice();

  const weights = method === 'gaussian'
    ? gaussianWeights(radius)
    : new Array(2 * radius + 1).fill(1 / (2 * radius + 1));

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = Math.max(0, Math.min(n - 1, i + k));
      acc += values[idx] * weights[k + radius];
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Smooth a 2-D trajectory (x and y independently).
 *
 * @param trajectory  Absolute positions.
 * @param radius      Window half-width.
 * @param method      Smoothing method.
 * @returns           Smoothed trajectory.
 */
export function smoothTrajectory(
  trajectory: readonly Translation[],
  radius:     number,
  method:     SmoothingMethod = 'gaussian',
): Translation[] {
  const n = trajectory.length;
  const xsIn: number[] = new Array(n);
  const ysIn: number[] = new Array(n);
  for (let i = 0; i < n; i++) { xsIn[i] = trajectory[i].x; ysIn[i] = trajectory[i].y; }
  const xsOut = smoothSeries(xsIn, radius, method);
  const ysOut = smoothSeries(ysIn, radius, method);
  const result: Translation[] = new Array(n);
  for (let i = 0; i < n; i++) result[i] = { x: xsOut[i], y: ysOut[i] };
  return result;
}

// ─── Compensation ─────────────────────────────────────────────────────────────

/**
 * Compute per-frame corrections from the original and smoothed trajectories.
 *
 * correction[i] = smoothed[i] − trajectory[i]. Applying this translation to
 * frame i moves it onto the steady (smoothed) path.
 *
 * @param trajectory     Original accumulated trajectory.
 * @param smoothed       Smoothed trajectory (same length).
 * @param maxCorrection  Clamp on correction magnitude (0 = unlimited).
 * @returns              Per-frame corrections.
 */
export function computeCorrections(
  trajectory: readonly Translation[],
  smoothed:   readonly Translation[],
  maxCorrection = 0,
): FrameCorrection[] {
  const n = Math.min(trajectory.length, smoothed.length);
  const corrections: FrameCorrection[] = [];
  for (let i = 0; i < n; i++) {
    let dx = smoothed[i].x - trajectory[i].x;
    let dy = smoothed[i].y - trajectory[i].y;
    if (maxCorrection > 0) {
      const mag = Math.hypot(dx, dy);
      if (mag > maxCorrection) {
        const s = maxCorrection / mag;
        dx *= s; dy *= s;
      }
    }
    corrections.push({ frame: i, correction: { x: dx, y: dy } });
  }
  return corrections;
}

// ─── Crop computation ─────────────────────────────────────────────────────────

/**
 * Compute the largest centered crop rectangle that remains fully inside every
 * frame after applying the corrections (so exposed borders are removed).
 *
 * The crop is symmetric: it insets by the maximum positive/negative correction
 * on each axis.
 *
 * @param corrections  Per-frame corrections.
 * @param width        Frame width.
 * @param height       Frame height.
 * @returns            A centered CropRect.
 */
export function computeCropWindow(
  corrections: readonly FrameCorrection[],
  width:       number,
  height:      number,
): CropRect {
  let maxLeft = 0, maxRight = 0, maxUp = 0, maxDown = 0;
  for (const c of corrections) {
    // A positive x correction shifts content right, exposing the left edge.
    if (c.correction.x > maxLeft)  maxLeft  = c.correction.x;
    if (-c.correction.x > maxRight) maxRight = -c.correction.x;
    if (c.correction.y > maxUp)    maxUp    = c.correction.y;
    if (-c.correction.y > maxDown)  maxDown  = -c.correction.y;
  }
  const insetX = Math.ceil(Math.max(maxLeft, maxRight));
  const insetY = Math.ceil(Math.max(maxUp, maxDown));

  const cropW = Math.max(1, width  - 2 * insetX);
  const cropH = Math.max(1, height - 2 * insetY);
  return { x: insetX, y: insetY, width: cropW, height: cropH };
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full stabilization pipeline from inter-frame motions.
 *
 * @param motions  Inter-frame translations (frame i → i+1), length = frames−1.
 * @param width    Frame width.
 * @param height   Frame height.
 * @param opts     Stabilization options.
 * @returns        A StabilizeResult with corrections, trajectories, and crop.
 *
 * @example
 * ```ts
 * const motions = pairs.map(([a, b]) => estimateGlobalMotion(a, b).translation);
 * const { corrections, crop } = stabilize(motions, 1920, 1080, { smoothingRadius: 20 });
 * ```
 */
export function stabilize(
  motions: readonly Translation[],
  width:   number,
  height:  number,
  opts:    StabilizeOptions = {},
): StabilizeResult {
  const radius = opts.smoothingRadius ?? 15;
  const method = opts.method ?? 'gaussian';
  const maxCorrection = opts.maxCorrection ?? 0;

  const trajectory = accumulateTrajectory(motions);
  const smoothed   = smoothTrajectory(trajectory, radius, method);
  const corrections = computeCorrections(trajectory, smoothed, maxCorrection);
  const crop = computeCropWindow(corrections, width, height);

  return { corrections, trajectory, smoothed, crop };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Measure trajectory "shakiness" as the mean absolute second difference
 * (jerk proxy) of the path. Lower = smoother.
 *
 * @param trajectory  Camera trajectory.
 * @returns           Mean absolute acceleration magnitude.
 */
export function trajectoryShakiness(trajectory: readonly Translation[]): number {
  if (trajectory.length < 3) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < trajectory.length - 1; i++) {
    const ax = trajectory[i + 1].x - 2 * trajectory[i].x + trajectory[i - 1].x;
    const ay = trajectory[i + 1].y - 2 * trajectory[i].y + trajectory[i - 1].y;
    sum += Math.hypot(ax, ay);
    count++;
  }
  return count > 0 ? sum / count : 0;
}
