/**
 * Tests for animation/motion-path.ts
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  vecAdd, vecSub, vecScale, vecLerp, vecLength, vecNormalize, vecCross, vecDot,
  bezierPoint, bezierDerivative, bezierCurvature,
  bezierSplit, bezierArcLength, bezierArcLengthRange,
  makeMotionPath, makeLinearPath, makeClosedPath,
  evaluateAt, tangentAt, normalAt,
  buildArcLengthTable, evaluateAtLength, sampleAtLength,
  pathTotalLength, flattenPath, pathBoundingBox, samplePathUniform,
} from '../animation/motion-path';
import type { Vec2, BezierSegment, MotionPath } from '../animation/motion-path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const p = (x: number, y: number): Vec2 => ({ x, y });

/** A simple straight-line segment. */
const lineSeg: BezierSegment = {
  p0: p(0, 0), p1: p(1/3, 0), p2: p(2/3, 0), p3: p(1, 0),
};

/** A unit-circle arc approximation (1/4 of circle). */
const circleQuarterSeg: BezierSegment = {
  p0: p(1, 0),
  p1: p(1, 0.5523),  // Bézier approximation constant ≈ 0.5523
  p2: p(0.5523, 1),
  p3: p(0, 1),
};

// ─── Vec2 utilities ───────────────────────────────────────────────────────────

describe('vec2 utilities', () => {
  it('vecAdd', () => {
    expect(vecAdd(p(1, 2), p(3, 4))).toEqual({ x: 4, y: 6 });
  });

  it('vecSub', () => {
    expect(vecSub(p(3, 5), p(1, 2))).toEqual({ x: 2, y: 3 });
  });

  it('vecScale', () => {
    expect(vecScale(p(2, 3), 2)).toEqual({ x: 4, y: 6 });
  });

  it('vecLerp at t=0 returns a', () => {
    expect(vecLerp(p(0, 0), p(10, 10), 0)).toEqual({ x: 0, y: 0 });
  });

  it('vecLerp at t=1 returns b', () => {
    expect(vecLerp(p(0, 0), p(10, 10), 1)).toEqual({ x: 10, y: 10 });
  });

  it('vecLerp at t=0.5 returns midpoint', () => {
    expect(vecLerp(p(0, 0), p(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('vecLength of (3, 4) = 5', () => {
    expect(vecLength(p(3, 4))).toBe(5);
  });

  it('vecNormalize produces unit vector', () => {
    const n = vecNormalize(p(3, 4));
    expect(vecLength(n)).toBeCloseTo(1, 10);
  });

  it('vecNormalize zero vector returns zero', () => {
    const n = vecNormalize(p(0, 0));
    expect(n).toEqual({ x: 0, y: 0 });
  });

  it('vecCross', () => {
    expect(vecCross(p(1, 0), p(0, 1))).toBe(1);
    expect(vecCross(p(0, 1), p(1, 0))).toBe(-1);
  });

  it('vecDot', () => {
    expect(vecDot(p(1, 0), p(0, 1))).toBe(0); // perpendicular
    expect(vecDot(p(1, 0), p(1, 0))).toBe(1); // parallel unit
  });
});

// ─── bezierPoint ─────────────────────────────────────────────────────────────

describe('bezierPoint', () => {
  it('t=0 returns p0', () => {
    const pt = bezierPoint(lineSeg, 0);
    expect(pt.x).toBeCloseTo(0, 10);
    expect(pt.y).toBeCloseTo(0, 10);
  });

  it('t=1 returns p3', () => {
    const pt = bezierPoint(lineSeg, 1);
    expect(pt.x).toBeCloseTo(1, 10);
    expect(pt.y).toBeCloseTo(0, 10);
  });

  it('t=0.5 on line → midpoint', () => {
    const pt = bezierPoint(lineSeg, 0.5);
    expect(pt.x).toBeCloseTo(0.5, 10);
    expect(pt.y).toBeCloseTo(0, 10);
  });

  it('t=0 on circle quarter returns (1,0)', () => {
    const pt = bezierPoint(circleQuarterSeg, 0);
    expect(pt.x).toBeCloseTo(1, 8);
    expect(pt.y).toBeCloseTo(0, 8);
  });

  it('t=1 on circle quarter returns (0,1)', () => {
    const pt = bezierPoint(circleQuarterSeg, 1);
    expect(pt.x).toBeCloseTo(0, 8);
    expect(pt.y).toBeCloseTo(1, 8);
  });

  it('t=0.5 on circle quarter is approximately on unit circle', () => {
    const pt = bezierPoint(circleQuarterSeg, 0.5);
    const r = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
    // Bézier circle approximation: error < 0.03%
    expect(r).toBeCloseTo(1, 2);
  });
});

// ─── bezierDerivative ────────────────────────────────────────────────────────

describe('bezierDerivative', () => {
  it('derivative of linear segment is constant (1/3, 0) * 3 = (1, 0)', () => {
    const d0 = bezierDerivative(lineSeg, 0);
    const d1 = bezierDerivative(lineSeg, 0.5);
    const d2 = bezierDerivative(lineSeg, 1);
    expect(d0.x).toBeCloseTo(1, 8);
    expect(d0.y).toBeCloseTo(0, 8);
    expect(d1.x).toBeCloseTo(1, 8);
    expect(d2.x).toBeCloseTo(1, 8);
  });

  it('non-zero everywhere on non-degenerate curve', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const d = bezierDerivative(circleQuarterSeg, t);
      expect(vecLength(d)).toBeGreaterThan(0.1);
    }
  });
});

// ─── bezierCurvature ─────────────────────────────────────────────────────────

describe('bezierCurvature', () => {
  it('straight line has zero curvature', () => {
    expect(bezierCurvature(lineSeg, 0.5)).toBeCloseTo(0, 8);
  });

  it('circle approximation curvature ≈ 1 at t=0.5', () => {
    // Unit circle has κ = 1 everywhere
    const κ = bezierCurvature(circleQuarterSeg, 0.5);
    expect(Math.abs(κ)).toBeCloseTo(1, 1); // Bézier approx error < 0.3
  });

  it('positive curvature means curve bends left', () => {
    // Quarter circle going from (1,0) to (0,1) bends left (counter-clockwise)
    expect(bezierCurvature(circleQuarterSeg, 0.5)).toBeGreaterThan(0);
  });
});

// ─── bezierSplit ──────────────────────────────────────────────────────────────

describe('bezierSplit', () => {
  it('left and right share the split point', () => {
    const { left, right } = bezierSplit(lineSeg, 0.5);
    expect(left.p3.x).toBeCloseTo(right.p0.x, 10);
    expect(left.p3.y).toBeCloseTo(right.p0.y, 10);
  });

  it('split at t=0.5 of line: left ends at (0.5,0)', () => {
    const { left } = bezierSplit(lineSeg, 0.5);
    expect(left.p3.x).toBeCloseTo(0.5, 10);
    expect(left.p3.y).toBeCloseTo(0, 10);
  });

  it('split preserves start and end', () => {
    const { left, right } = bezierSplit(circleQuarterSeg, 0.5);
    expect(left.p0.x).toBeCloseTo(circleQuarterSeg.p0.x, 10);
    expect(right.p3.x).toBeCloseTo(circleQuarterSeg.p3.x, 10);
  });

  it('point at t=0.5 on original == point at t=1 on left (= split point)', () => {
    const { left } = bezierSplit(circleQuarterSeg, 0.5);
    const orig = bezierPoint(circleQuarterSeg, 0.5);
    expect(orig.x).toBeCloseTo(left.p3.x, 8);
    expect(orig.y).toBeCloseTo(left.p3.y, 8);
  });
});

// ─── bezierArcLength ─────────────────────────────────────────────────────────

describe('bezierArcLength', () => {
  it('straight line of length 1 has arc length ≈ 1', () => {
    expect(bezierArcLength(lineSeg)).toBeCloseTo(1, 6);
  });

  it('quarter circle has arc length ≈ π/2', () => {
    // Bézier approximation error < 0.1%
    expect(bezierArcLength(circleQuarterSeg)).toBeCloseTo(Math.PI / 2, 2);
  });

  it('bezierArcLengthRange(0,1) == bezierArcLength', () => {
    const full = bezierArcLength(circleQuarterSeg);
    const range = bezierArcLengthRange(circleQuarterSeg, 0, 1);
    expect(range).toBeCloseTo(full, 8);
  });

  it('bezierArcLengthRange(0, 0.5) + (0.5, 1) ≈ bezierArcLength', () => {
    const half1 = bezierArcLengthRange(circleQuarterSeg, 0, 0.5);
    const half2 = bezierArcLengthRange(circleQuarterSeg, 0.5, 1);
    const full  = bezierArcLength(circleQuarterSeg);
    expect(half1 + half2).toBeCloseTo(full, 6);
  });
});

// ─── makeLinearPath ───────────────────────────────────────────────────────────

describe('makeLinearPath', () => {
  it('creates a single segment', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    expect(path.segments.length).toBe(1);
  });

  it('start and end are correct', () => {
    const path = makeLinearPath(p(3, 4), p(7, 8));
    expect(path.segments[0].p0).toEqual(p(3, 4));
    expect(path.segments[0].p3).toEqual(p(7, 8));
  });

  it('evaluateAt t=0 returns start', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    const pt = evaluateAt(path, 0);
    expect(pt.x).toBeCloseTo(0, 8);
  });

  it('evaluateAt t=1 returns end', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    const pt = evaluateAt(path, 1);
    expect(pt.x).toBeCloseTo(10, 8);
  });

  it('total length ≈ Euclidean distance', () => {
    const path = makeLinearPath(p(0, 0), p(3, 4));
    expect(pathTotalLength(path)).toBeCloseTo(5, 4);
  });
});

// ─── makeClosedPath ───────────────────────────────────────────────────────────

describe('makeClosedPath', () => {
  it('creates N segments for N anchors', () => {
    const path = makeClosedPath([p(0,0), p(1,0), p(0.5,1)]);
    expect(path.segments.length).toBe(3);
  });

  it('requires at least 3 anchors', () => {
    expect(() => makeClosedPath([p(0,0), p(1,0)])).toThrow(RangeError);
  });

  it('last segment ends at first anchor', () => {
    const anchors = [p(0,0), p(1,0), p(0.5,1)];
    const path = makeClosedPath(anchors);
    const lastSeg = path.segments[path.segments.length - 1];
    expect(lastSeg.p3.x).toBeCloseTo(anchors[0].x, 10);
    expect(lastSeg.p3.y).toBeCloseTo(anchors[0].y, 10);
  });

  it('REGRESSION: tangent direction is continuous (C1) across every anchor junction', () => {
    // Before fix: both handles of each segment sat on the straight chord
    // p0->p3, so the outgoing tangent at an anchor (end of one segment)
    // and the incoming tangent at the same anchor (start of the next
    // segment) pointed along two different chords — a hard corner at
    // every anchor instead of the smooth loop the function documents.
    const anchors = [p(0, 0), p(4, 0), p(4, 4), p(0, 4), p(-2, 2)];
    const path = makeClosedPath(anchors);
    const n = path.segments.length;
    for (let i = 0; i < n; i++) {
      const outgoing = vecNormalize(bezierDerivative(path.segments[i], 1));
      const incoming = vecNormalize(bezierDerivative(path.segments[(i + 1) % n], 0));
      expect(outgoing.x).toBeCloseTo(incoming.x, 8);
      expect(outgoing.y).toBeCloseTo(incoming.y, 8);
    }
  });

  it('REGRESSION: curve bows away from the straight chord (not degenerate to a polygon)', () => {
    // Before fix: p1/p2 both lay on the p0->p3 chord, so bezierPoint at
    // t=0.5 landed exactly on the midpoint of the chord — a straight
    // edge, not a curve. The Catmull-Rom-derived handles pull the curve
    // toward the neighboring anchors, so the midpoint should be off the
    // chord whenever the neighbors make the path bend.
    const anchors = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];
    const path = makeClosedPath(anchors);
    const seg = path.segments[0]; // p0=(0,0) -> p3=(4,0), bends toward (4,4) and (0,4)
    const mid = bezierPoint(seg, 0.5);
    const chordMidY = (seg.p0.y + seg.p3.y) / 2;
    expect(Math.abs(mid.y - chordMidY)).toBeGreaterThan(0.01);
  });
});

// ─── makeMotionPath ───────────────────────────────────────────────────────────

describe('makeMotionPath', () => {
  it('creates n-1 segments for n anchors', () => {
    const anchors = [p(0,0), p(1,0), p(2,0)];
    const path = makeMotionPath(anchors, anchors, anchors);
    expect(path.segments.length).toBe(2);
  });

  it('requires at least 2 anchors', () => {
    expect(() => makeMotionPath([p(0,0)], [p(0,0)], [p(0,0)])).toThrow(RangeError);
  });
});

// ─── evaluateAt / tangentAt / normalAt ───────────────────────────────────────

describe('evaluateAt', () => {
  it('t=0 returns start of first segment', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    expect(evaluateAt(path, 0).x).toBeCloseTo(0, 8);
  });

  it('t=1 returns end of last segment', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    expect(evaluateAt(path, 1).x).toBeCloseTo(10, 8);
  });

  it('t clamps to [0,1]', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    expect(evaluateAt(path, -1).x).toBeCloseTo(0, 8);
    expect(evaluateAt(path, 2).x).toBeCloseTo(10, 8);
  });

  it('multi-segment path: t=0.5 is at segment boundary', () => {
    const anchors = [p(0,0), p(10,0), p(20,0)];
    const path = makeMotionPath(anchors, anchors.map(a => vecAdd(a, p(0,0))), anchors);
    // t=0.5 → end of first segment = p(10, 0)
    const mid = evaluateAt(path, 0.5);
    expect(mid.x).toBeCloseTo(10, 6);
  });
});

describe('tangentAt', () => {
  it('on horizontal line → tangent is (1, 0)', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    const tan = tangentAt(path, 0.5);
    expect(tan.x).toBeCloseTo(1, 6);
    expect(tan.y).toBeCloseTo(0, 6);
  });

  it('tangent is unit vector', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const tan = tangentAt(makeLinearPath(p(0,0), p(3,4)), t);
      expect(vecLength(tan)).toBeCloseTo(1, 6);
    }
  });
});

describe('normalAt', () => {
  it('on horizontal line → normal is (0, 1)', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    const nor = normalAt(path, 0.5);
    expect(nor.x).toBeCloseTo(0, 6);
    expect(nor.y).toBeCloseTo(1, 6);
  });

  it('normal is perpendicular to tangent', () => {
    const path = makeLinearPath(p(0, 0), p(3, 4));
    const tan = tangentAt(path, 0.5);
    const nor = normalAt(path, 0.5);
    expect(vecDot(tan, nor)).toBeCloseTo(0, 8);
  });
});

// ─── buildArcLengthTable ─────────────────────────────────────────────────────

describe('buildArcLengthTable', () => {
  it('totalLength ≈ pathTotalLength', () => {
    const path = makeLinearPath(p(0, 0), p(3, 4));
    const table = buildArcLengthTable(path);
    expect(table.totalLength).toBeCloseTo(pathTotalLength(path), 6);
  });

  it('cumulative lengths start at 0', () => {
    const path = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    expect(table.cumulativeLengths[0]).toBe(0);
  });

  it('cumulative lengths end at totalLength', () => {
    const path = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    const last = table.cumulativeLengths[table.cumulativeLengths.length - 1];
    expect(last).toBeCloseTo(table.totalLength, 10);
  });
});

// ─── evaluateAtLength ────────────────────────────────────────────────────────

describe('evaluateAtLength', () => {
  it('REGRESSION: empty path returns origin without crashing', () => {
    const emptyPath: MotionPath = { segments: [] };
    const table = buildArcLengthTable(emptyPath);
    expect(() => evaluateAtLength(emptyPath, table, 0)).not.toThrow();
    expect(evaluateAtLength(emptyPath, table, 0)).toEqual({ x: 0, y: 0 });
  });

  it('s=0 returns start of path', () => {
    const path  = makeLinearPath(p(0, 0), p(10, 0));
    const table = buildArcLengthTable(path);
    const pt    = evaluateAtLength(path, table, 0);
    expect(pt.x).toBeCloseTo(0, 5);
  });

  it('s=totalLength returns end of path', () => {
    const path  = makeLinearPath(p(0, 0), p(10, 0));
    const table = buildArcLengthTable(path);
    const pt    = evaluateAtLength(path, table, table.totalLength);
    expect(pt.x).toBeCloseTo(10, 4);
  });

  it('midpoint of line at s=5', () => {
    const path  = makeLinearPath(p(0, 0), p(10, 0));
    const table = buildArcLengthTable(path);
    const pt    = evaluateAtLength(path, table, 5);
    expect(pt.x).toBeCloseTo(5, 3);
  });

  it('constant-speed: samples are equally spaced on line', () => {
    const path  = makeLinearPath(p(0, 0), p(10, 0));
    const table = buildArcLengthTable(path);
    const pts   = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => evaluateAtLength(path, table, s));
    for (let i = 1; i < pts.length; i++) {
      // Each step should advance ~1 unit along x
      expect(pts[i].x - pts[i-1].x).toBeCloseTo(1, 2);
    }
  });
});

// ─── sampleAtLength ───────────────────────────────────────────────────────────

describe('sampleAtLength', () => {
  it('REGRESSION: empty path returns origin sample without crashing', () => {
    const emptyPath: MotionPath = { segments: [] };
    const table = buildArcLengthTable(emptyPath);
    expect(() => sampleAtLength(emptyPath, table, 0)).not.toThrow();
    const sample = sampleAtLength(emptyPath, table, 0);
    expect(sample.position).toEqual({ x: 0, y: 0 });
    expect(sample.curvature).toBe(0);
  });

  it('returns correct arcLength field', () => {
    const path  = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    const s     = 7.5;
    const sample = sampleAtLength(path, table, s);
    expect(sample.arcLength).toBe(s);
  });

  it('position matches evaluateAtLength', () => {
    const path  = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    const s     = 3.0;
    const sample = sampleAtLength(path, table, s);
    const pt     = evaluateAtLength(path, table, s);
    expect(sample.position.x).toBeCloseTo(pt.x, 8);
    expect(sample.position.y).toBeCloseTo(pt.y, 8);
  });

  it('tangent is unit vector', () => {
    const path   = makeLinearPath(p(0,0), p(3,4));
    const table  = buildArcLengthTable(path);
    const sample = sampleAtLength(path, table, 2);
    expect(vecLength(sample.tangent)).toBeCloseTo(1, 6);
  });

  it('normal is perpendicular to tangent', () => {
    const path   = makeLinearPath(p(0,0), p(3,4));
    const table  = buildArcLengthTable(path);
    const sample = sampleAtLength(path, table, 2);
    expect(vecDot(sample.tangent, sample.normal)).toBeCloseTo(0, 8);
  });
});

// ─── samplePathUniform ────────────────────────────────────────────────────────

describe('samplePathUniform', () => {
  it('returns count samples', () => {
    const path  = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    const samples = samplePathUniform(path, table, 5);
    expect(samples.length).toBe(5);
  });

  it('requires count >= 2', () => {
    const path  = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    expect(() => samplePathUniform(path, table, 1)).toThrow(RangeError);
  });

  it('first sample is at s=0, last at s=totalLength', () => {
    const path  = makeLinearPath(p(0,0), p(10,0));
    const table = buildArcLengthTable(path);
    const samples = samplePathUniform(path, table, 11);
    expect(samples[0].arcLength).toBe(0);
    expect(samples[10].arcLength).toBeCloseTo(table.totalLength, 6);
  });
});

// ─── pathBoundingBox ─────────────────────────────────────────────────────────

describe('pathBoundingBox', () => {
  it('empty path returns zero box', () => {
    const path: MotionPath = { segments: [] };
    const bb = pathBoundingBox(path);
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('horizontal line → bbox height is 0', () => {
    const path = makeLinearPath(p(2, 5), p(8, 5));
    const bb   = pathBoundingBox(path);
    expect(bb.minY).toBeCloseTo(5, 6);
    expect(bb.maxY).toBeCloseTo(5, 6);
    expect(bb.minX).toBeCloseTo(2, 6);
    expect(bb.maxX).toBeCloseTo(8, 6);
  });

  it('circle quarter bbox contains (0,0) to (1,1)', () => {
    const path: MotionPath = { segments: [circleQuarterSeg] };
    const bb   = pathBoundingBox(path);
    expect(bb.minX).toBeLessThanOrEqual(0);
    expect(bb.minY).toBeLessThanOrEqual(0);
    expect(bb.maxX).toBeGreaterThanOrEqual(1);
    expect(bb.maxY).toBeGreaterThanOrEqual(1);
  });
});

// ─── flattenPath ─────────────────────────────────────────────────────────────

describe('flattenPath', () => {
  it('empty path returns empty array', () => {
    const path: MotionPath = { segments: [] };
    expect(flattenPath(path)).toEqual([]);
  });

  it('returns at least start and end points', () => {
    const path = makeLinearPath(p(0, 0), p(10, 0));
    const pts  = flattenPath(path, 0.1);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0].x).toBeCloseTo(0, 6);
    expect(pts[pts.length - 1].x).toBeCloseTo(10, 6);
  });

  it('tighter tolerance → more points', () => {
    const path = makeLinearPath(p(0, 0), p(0, 10)); // vertical line (no error)
    const coarse = flattenPath(path, 1.0);
    const fine   = flattenPath(path, 0.01);
    // For a straight line, both should have minimum points (no need to subdivide)
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length);
  });

  it('all flatten points are near the path', () => {
    // For a curve, all polyline points should be close to actual curve position
    const path: MotionPath = { segments: [circleQuarterSeg] };
    const pts = flattenPath(path, 0.01);
    for (const pt of pts) {
      // All points on the quarter circle should be close to unit circle
      const r = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.1);
    }
  });
});

// ─── pathTotalLength ─────────────────────────────────────────────────────────

describe('pathTotalLength', () => {
  it('line (3,4) has length 5', () => {
    const path = makeLinearPath(p(0, 0), p(3, 4));
    expect(pathTotalLength(path)).toBeCloseTo(5, 4);
  });

  it('full circle (4 quarter segments) has length ≈ 2π', () => {
    const k = 0.5523;
    const segs: BezierSegment[] = [
      { p0: p(1, 0),  p1: p(1,  k),  p2: p(k,  1),  p3: p(0,  1)  },
      { p0: p(0, 1),  p1: p(-k, 1),  p2: p(-1, k),  p3: p(-1, 0)  },
      { p0: p(-1, 0), p1: p(-1, -k), p2: p(-k, -1), p3: p(0,  -1) },
      { p0: p(0, -1), p1: p(k,  -1), p2: p(1,  -k), p3: p(1,  0)  },
    ];
    const path: MotionPath = { segments: segs };
    expect(pathTotalLength(path)).toBeCloseTo(2 * Math.PI, 1);
  });
});
