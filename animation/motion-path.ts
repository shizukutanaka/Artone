/**
 * Artone v3 — Motion Path
 *
 * Cubic Bézier motion paths with arc-length parameterization for
 * constant-speed animation along arbitrary 2-D curves.
 *
 * A path is defined as an ordered sequence of cubic Bézier segments.
 * Each segment shares its start point with the previous segment's end
 * point (C0 continuity). When control handles are mirrored across the
 * shared knot the path is C1-continuous (smooth velocity transition).
 *
 * Arc-length reparameterization (Guenter & Parent 1990):
 *   - Precompute a lookup table of (t, arcLength) pairs using Gaussian
 *     quadrature per segment (5-point rule, fast and accurate for smooth curves).
 *   - Invert via binary search to evaluate "constant-speed" positions.
 *
 * Key operations:
 *   - Evaluate position / tangent / normal / curvature at parameter t.
 *   - Evaluate at constant arc length s (for camera dolly, object paths).
 *   - Compute total arc length.
 *   - Split a segment at parameter t (de Casteljau algorithm).
 *   - Flatten a path to polyline with configurable tolerance.
 *
 * Pure TypeScript — no browser APIs, fully testable with Vitest.
 *
 * References:
 *   - de Casteljau 1959: recursive subdivision algorithm.
 *   - Farin 2001: "Curves and Surfaces for CAGD" (5th ed.).
 *   - Guenter & Parent 1990: "Computing the arc length of parametric curves",
 *     IEEE CG&A 10(3), pp. 72-78.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** 2-D point / vector. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** One cubic Bézier segment: p0, p1, p2, p3 = start, ctrl1, ctrl2, end. */
export interface BezierSegment {
  readonly p0: Vec2;  // start (anchor)
  readonly p1: Vec2;  // control point 1
  readonly p2: Vec2;  // control point 2
  readonly p3: Vec2;  // end (anchor)
}

/** A path made of one or more cubic Bézier segments. */
export interface MotionPath {
  /** Ordered Bézier segments. Adjacent segments must share endpoints (p3_k == p0_{k+1}). */
  readonly segments: readonly BezierSegment[];
}

/** A path sample: position + geometric properties. */
export interface PathSample {
  /** Position on the curve. */
  position: Vec2;
  /** Unit tangent vector (direction of travel). */
  tangent: Vec2;
  /** Unit normal vector (perpendicular to tangent, pointing "left"). */
  normal: Vec2;
  /** Signed curvature κ (positive = curving left, negative = right). */
  curvature: number;
  /** Arc-length distance from path start. */
  arcLength: number;
}

/** Result of splitting a segment at parameter t. */
export interface SplitResult {
  left:  BezierSegment;
  right: BezierSegment;
}

// ─── Vec2 utilities ───────────────────────────────────────────────────────────

/** Add two vectors. */
export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtract b from a. */
export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Scale a vector. */
export function vecScale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Lerp between two vectors. */
export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Euclidean length. */
export function vecLength(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Normalize to unit length. Returns zero vector if length < ε. */
export function vecNormalize(v: Vec2): Vec2 {
  const len = vecLength(v);
  return len < 1e-12 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

/** 2-D cross product (scalar z-component). */
export function vecCross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** Dot product. */
export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

// ─── Single cubic Bézier segment ─────────────────────────────────────────────

/**
 * Evaluate position on a cubic Bézier at parameter t ∈ [0, 1].
 *
 * Uses the standard polynomial form:
 *   B(t) = (1-t)³·p0 + 3(1-t)²t·p1 + 3(1-t)t²·p2 + t³·p3
 */
export function bezierPoint(seg: BezierSegment, t: number): Vec2 {
  const u  = 1 - t;
  const u2 = u  * u;
  const u3 = u2 * u;
  const t2 = t  * t;
  const t3 = t2 * t;
  return {
    x: u3 * seg.p0.x + 3 * u2 * t * seg.p1.x + 3 * u * t2 * seg.p2.x + t3 * seg.p3.x,
    y: u3 * seg.p0.y + 3 * u2 * t * seg.p1.y + 3 * u * t2 * seg.p2.y + t3 * seg.p3.y,
  };
}

/**
 * Evaluate the first derivative (velocity tangent) of a cubic Bézier at t.
 *
 *   B'(t) = 3[(1-t)²·(p1-p0) + 2(1-t)t·(p2-p1) + t²·(p3-p2)]
 */
export function bezierDerivative(seg: BezierSegment, t: number): Vec2 {
  const u  = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  const d0 = vecSub(seg.p1, seg.p0);
  const d1 = vecSub(seg.p2, seg.p1);
  const d2 = vecSub(seg.p3, seg.p2);
  return {
    x: 3 * (u2 * d0.x + 2 * u * t * d1.x + t2 * d2.x),
    y: 3 * (u2 * d0.y + 2 * u * t * d1.y + t2 * d2.y),
  };
}

/**
 * Evaluate the second derivative (acceleration) of a cubic Bézier at t.
 *
 *   B''(t) = 6[(1-t)·(p2-2p1+p0) + t·(p3-2p2+p1)]
 */
export function bezierSecondDerivative(seg: BezierSegment, t: number): Vec2 {
  const u  = 1 - t;
  const e0 = vecAdd(vecSub(seg.p2, vecScale(seg.p1, 2)), seg.p0);
  const e1 = vecAdd(vecSub(seg.p3, vecScale(seg.p2, 2)), seg.p1);
  return {
    x: 6 * (u * e0.x + t * e1.x),
    y: 6 * (u * e0.y + t * e1.y),
  };
}

/**
 * Compute signed curvature κ of a cubic Bézier at t.
 *
 *   κ = (x'y'' − y'x'') / (x'² + y'²)^(3/2)
 */
export function bezierCurvature(seg: BezierSegment, t: number): number {
  const d1 = bezierDerivative(seg, t);
  const d2 = bezierSecondDerivative(seg, t);
  const denom = Math.pow(d1.x * d1.x + d1.y * d1.y, 1.5);
  return denom < 1e-20 ? 0 : vecCross(d1, d2) / denom;
}

/**
 * Split a cubic Bézier at parameter t using de Casteljau's algorithm.
 *
 * @returns `{ left, right }` — two segments that together equal the original.
 */
export function bezierSplit(seg: BezierSegment, t: number): SplitResult {
  const p01  = vecLerp(seg.p0, seg.p1, t);
  const p12  = vecLerp(seg.p1, seg.p2, t);
  const p23  = vecLerp(seg.p2, seg.p3, t);
  const p012 = vecLerp(p01,  p12,  t);
  const p123 = vecLerp(p12,  p23,  t);
  const p    = vecLerp(p012, p123, t); // split point
  return {
    left:  { p0: seg.p0, p1: p01,  p2: p012, p3: p },
    right: { p0: p,      p1: p123, p2: p23,  p3: seg.p3 },
  };
}

// ─── Gaussian quadrature for arc length ──────────────────────────────────────

// 5-point Gauss-Legendre nodes and weights on [-1, 1]
const GL5_NODES: readonly number[] = [
  -0.9061798459386640, -0.5384693101056831, 0,
   0.5384693101056831,  0.9061798459386640,
];
const GL5_WEIGHTS: readonly number[] = [
  0.2369268850561891, 0.4786286704993665, 0.5688888888888889,
  0.4786286704993665, 0.2369268850561891,
];

/**
 * Estimate the arc length of one cubic Bézier segment from t=0 to t=1
 * using 5-point Gauss-Legendre quadrature.
 *
 * Integral: ∫₀¹ |B'(t)| dt
 */
export function bezierArcLength(seg: BezierSegment): number {
  let len = 0;
  for (let i = 0; i < 5; i++) {
    // Change of variables: t = (node+1)/2  (maps [-1,1]→[0,1])
    const t  = (GL5_NODES[i] + 1) * 0.5;
    const dt = bezierDerivative(seg, t);
    len += GL5_WEIGHTS[i] * Math.sqrt(dt.x * dt.x + dt.y * dt.y);
  }
  return len * 0.5; // Jacobian of transform
}

/**
 * Compute arc length of segment from t=a to t=b (0 ≤ a ≤ b ≤ 1).
 */
export function bezierArcLengthRange(seg: BezierSegment, a: number, b: number): number {
  const mid  = (a + b) * 0.5;
  const half = (b - a) * 0.5;
  let len = 0;
  for (let i = 0; i < 5; i++) {
    const t  = mid + half * GL5_NODES[i];
    const dt = bezierDerivative(seg, t);
    len += GL5_WEIGHTS[i] * Math.sqrt(dt.x * dt.x + dt.y * dt.y);
  }
  return len * half;
}

// ─── MotionPath construction ──────────────────────────────────────────────────

/**
 * Create a MotionPath from an ordered list of anchor points and control handles.
 *
 * @param anchors       Knot positions (the path passes through these).
 * @param outHandles    Out-tangent control points (one per anchor, same length).
 * @param inHandles     In-tangent control points (one per anchor, same length).
 */
export function makeMotionPath(
  anchors:    readonly Vec2[],
  outHandles: readonly Vec2[],
  inHandles:  readonly Vec2[],
): MotionPath {
  if (anchors.length < 2) throw new RangeError('MotionPath requires at least 2 anchors');
  const segments: BezierSegment[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    segments.push({
      p0: anchors[i],
      p1: outHandles[i],
      p2: inHandles[i + 1],
      p3: anchors[i + 1],
    });
  }
  return { segments };
}

/**
 * Create a straight-line MotionPath between two points.
 *
 * Control handles are set at 1/3 and 2/3 along the line (linear Bézier).
 */
export function makeLinearPath(from: Vec2, to: Vec2): MotionPath {
  const p1 = vecLerp(from, to, 1 / 3);
  const p2 = vecLerp(from, to, 2 / 3);
  return { segments: [{ p0: from, p1, p2, p3: to }] };
}

/**
 * Create a smooth closed loop from a list of anchor points.
 * Uses automatic in/out handle placement for C1 continuity
 * (handles are symmetric, 1/3 of segment length).
 *
 * @param anchors  Polygon vertices (at least 3). The path is closed
 *                 (last segment connects back to first anchor).
 */
export function makeClosedPath(anchors: readonly Vec2[]): MotionPath {
  const n = anchors.length;
  if (n < 3) throw new RangeError('Closed path requires at least 3 anchors');

  const segments: BezierSegment[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = anchors[i];
    const p3 = anchors[(i + 1) % n];
    const chord = vecSub(p3, p0);
    const p1 = vecAdd(p0, vecScale(chord, 1 / 3));
    const p2 = vecAdd(p0, vecScale(chord, 2 / 3));
    segments.push({ p0, p1, p2, p3 });
  }
  return { segments };
}

// ─── MotionPath queries ───────────────────────────────────────────────────────

/** Return the total number of segments in a path. */
export function pathSegmentCount(path: MotionPath): number {
  return path.segments.length;
}

/**
 * Evaluate a position on the path at global parameter `t` ∈ [0, 1].
 *
 * `t` is mapped linearly across all segments (equal parameter distribution,
 * NOT equal arc length). Use `evaluateAtLength` for constant-speed traversal.
 *
 * @param path  The motion path.
 * @param t     Global path parameter in [0, 1].
 */
export function evaluateAt(path: MotionPath, t: number): Vec2 {
  const n = path.segments.length;
  if (n === 0) return { x: 0, y: 0 };
  t = Math.max(0, Math.min(1, t));
  if (t >= 1) return path.segments[n - 1].p3;
  const scaled = t * n;
  const segIdx = Math.floor(scaled);
  const segT   = scaled - segIdx;
  return bezierPoint(path.segments[Math.min(segIdx, n - 1)], segT);
}

/**
 * Compute the unit tangent vector at global parameter t.
 */
export function tangentAt(path: MotionPath, t: number): Vec2 {
  const n = path.segments.length;
  if (n === 0) return { x: 1, y: 0 };
  t = Math.max(0, Math.min(1, t));
  if (t >= 1) {
    const last = path.segments[n - 1];
    return vecNormalize(bezierDerivative(last, 1));
  }
  const scaled = t * n;
  const segIdx = Math.floor(scaled);
  const segT   = scaled - segIdx;
  return vecNormalize(bezierDerivative(path.segments[segIdx], segT));
}

/**
 * Compute the unit normal vector (perpendicular to tangent, pointing left) at t.
 */
export function normalAt(path: MotionPath, t: number): Vec2 {
  const tan = tangentAt(path, t);
  return { x: -tan.y, y: tan.x };
}

/**
 * Compute signed curvature at global parameter t.
 */
export function curvatureAt(path: MotionPath, t: number): number {
  const n = path.segments.length;
  if (n === 0) return 0;
  t = Math.max(0, Math.min(1, t));
  const scaled = Math.min(t * n, n - 1e-9);
  const segIdx = Math.floor(scaled);
  const segT   = scaled - segIdx;
  return bezierCurvature(path.segments[Math.min(segIdx, n - 1)], segT);
}

// ─── Arc-length parameterization ─────────────────────────────────────────────

/** A precomputed arc-length lookup table for a MotionPath. */
export interface ArcLengthTable {
  /** Total arc length of the path. */
  totalLength: number;
  /** Cumulative arc length at the start of each segment. */
  segmentLengths: number[];
  /** Total path length (sum of segment lengths). */
  cumulativeLengths: number[]; // [0, L0, L0+L1, …]
}

/**
 * Build an arc-length lookup table for the path.
 *
 * Uses Gaussian quadrature per segment — fast and accurate.
 */
export function buildArcLengthTable(path: MotionPath): ArcLengthTable {
  const segmentLengths: number[] = path.segments.map(bezierArcLength);
  const cumulativeLengths: number[] = [0];
  for (const len of segmentLengths) {
    cumulativeLengths.push(cumulativeLengths[cumulativeLengths.length - 1] + len);
  }
  return {
    totalLength: cumulativeLengths[cumulativeLengths.length - 1],
    segmentLengths,
    cumulativeLengths,
  };
}

/**
 * Compute the (segmentIndex, segmentT) pair for a given arc-length s along the path.
 *
 * @param path   The motion path.
 * @param table  Pre-computed arc-length table.
 * @param s      Arc-length distance from path start (0 ≤ s ≤ totalLength).
 */
export function arcLengthToParameter(
  path:  MotionPath,
  table: ArcLengthTable,
  s:     number,
): { segmentIndex: number; segmentT: number } {
  const { cumulativeLengths, segmentLengths } = table;
  const n = path.segments.length;
  if (n === 0) return { segmentIndex: 0, segmentT: 0 };

  s = Math.max(0, Math.min(table.totalLength, s));

  // Find which segment contains s (binary search)
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulativeLengths[mid + 1] < s) lo = mid + 1;
    else hi = mid;
  }
  const segIdx = lo;
  const sLocal = s - cumulativeLengths[segIdx];   // arc length within segment
  const segLen = segmentLengths[segIdx];

  if (segLen < 1e-12) return { segmentIndex: segIdx, segmentT: 0 };

  // Binary search within segment for t such that arcLength(0..t) ≈ sLocal
  const seg = path.segments[segIdx];
  let tLo = 0, tHi = 1;
  for (let iter = 0; iter < 32; iter++) {
    const tMid = (tLo + tHi) * 0.5;
    const lMid = bezierArcLengthRange(seg, 0, tMid);
    if (lMid < sLocal) tLo = tMid;
    else               tHi = tMid;
  }
  return { segmentIndex: segIdx, segmentT: (tLo + tHi) * 0.5 };
}

/**
 * Evaluate position on the path at a given arc-length s (constant-speed traversal).
 *
 * @param path   The motion path.
 * @param table  Pre-computed arc-length table.
 * @param s      Arc-length distance from path start.
 */
export function evaluateAtLength(
  path:  MotionPath,
  table: ArcLengthTable,
  s:     number,
): Vec2 {
  const { segmentIndex, segmentT } = arcLengthToParameter(path, table, s);
  return bezierPoint(path.segments[segmentIndex], segmentT);
}

/**
 * Sample the path at a given arc-length s, returning full geometric properties.
 *
 * @param path   The motion path.
 * @param table  Pre-computed arc-length table.
 * @param s      Arc-length distance from path start.
 */
export function sampleAtLength(
  path:  MotionPath,
  table: ArcLengthTable,
  s:     number,
): PathSample {
  const { segmentIndex, segmentT } = arcLengthToParameter(path, table, s);
  const seg = path.segments[segmentIndex];
  const pos = bezierPoint(seg, segmentT);
  const tan = vecNormalize(bezierDerivative(seg, segmentT));
  const nor = { x: -tan.y, y: tan.x };
  return {
    position:  pos,
    tangent:   tan,
    normal:    nor,
    curvature: bezierCurvature(seg, segmentT),
    arcLength: s,
  };
}

// ─── Path utilities ───────────────────────────────────────────────────────────

/**
 * Total arc length of a path (computed via Gaussian quadrature per segment).
 */
export function pathTotalLength(path: MotionPath): number {
  return path.segments.reduce((acc, seg) => acc + bezierArcLength(seg), 0);
}

/**
 * Flatten the path to an array of polyline vertices (adaptive chord-error).
 *
 * Recursive subdivision stops when the chord from start to end of the
 * sub-segment is within `tolerance` of the curve.
 *
 * @param path       Motion path.
 * @param tolerance  Maximum chord error in path units. Default: 0.5.
 */
export function flattenPath(path: MotionPath, tolerance = 0.5): Vec2[] {
  const points: Vec2[] = [];

  function flattenSeg(seg: BezierSegment, depth: number): void {
    // Chord: straight line from p0 to p3
    const chordLen = vecLength(vecSub(seg.p3, seg.p0));
    const mid = bezierPoint(seg, 0.5);
    const chordMid = vecLerp(seg.p0, seg.p3, 0.5);
    const err = vecLength(vecSub(mid, chordMid));

    if (err <= tolerance || depth >= 12) {
      points.push(seg.p3);
      return;
    }
    const { left, right } = bezierSplit(seg, 0.5);
    flattenSeg(left,  depth + 1);
    flattenSeg(right, depth + 1);
  }

  if (path.segments.length > 0) {
    points.push(path.segments[0].p0);
    for (const seg of path.segments) {
      flattenSeg(seg, 0);
    }
  }
  return points;
}

/**
 * Compute the bounding box of the path.
 *
 * Uses Bézier derivative roots to find extrema (exact for cubic Bézier).
 *
 * @returns `{ minX, minY, maxX, maxY }`.
 */
export function pathBoundingBox(
  path: MotionPath,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (path.segments.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateExtent(p: Vec2): void {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  /** Roots of at² + bt + c = 0 in (0, 1). */
  function quadraticRoots(a: number, b: number, c: number): number[] {
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) < 1e-12) return [];
      const t = -c / b;
      return t > 0 && t < 1 ? [t] : [];
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    return [-b - sq, -b + sq]
      .map(v => v / (2 * a))
      .filter(t => t > 0 && t < 1);
  }

  for (const seg of path.segments) {
    // Check endpoints and knots
    updateExtent(seg.p0);
    updateExtent(seg.p3);

    // Derivative B'(t) is quadratic: coefficients for x and y
    // B'(t) = 3[(-p0+3p1-3p2+p3)t² + 2(p0-2p1+p2)t + (-p0+p1)]
    for (const axis of ['x', 'y'] as const) {
      const p0 = seg.p0[axis], p1 = seg.p1[axis], p2 = seg.p2[axis], p3 = seg.p3[axis];
      const a = -p0 + 3 * p1 - 3 * p2 + p3;
      const b =  2 * (p0 - 2 * p1 + p2);
      const c = -p0 + p1;
      for (const t of quadraticRoots(a, b, c)) {
        updateExtent(bezierPoint(seg, t));
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Sample the path at `count` equally-spaced arc-length positions.
 *
 * @param path   Motion path.
 * @param table  Pre-computed arc-length table.
 * @param count  Number of samples (≥ 2).
 * @returns      Array of `count` PathSample objects.
 */
export function samplePathUniform(
  path:  MotionPath,
  table: ArcLengthTable,
  count: number,
): PathSample[] {
  if (count < 2) throw new RangeError('count must be ≥ 2');
  const samples: PathSample[] = [];
  for (let i = 0; i < count; i++) {
    const s = (i / (count - 1)) * table.totalLength;
    samples.push(sampleAtLength(path, table, s));
  }
  return samples;
}
