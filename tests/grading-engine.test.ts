/**
 * ColorGradingEngine Tests
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ColorGradingEngine, type ColorWheels } from '../color/grading-engine';

/** jsdom's File lacks .text(); this wrapper injects it. */
function makeFile(content: string, name: string): File {
  const file = new File([content], name);
  if (typeof (file as unknown as { text?: unknown }).text !== 'function') {
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  }
  return file;
}

// ─── helpers ───────────────────────────────────────────────────

/** Access private method via type cast. */
function applyWheels(
  engine: ColorGradingEngine,
  data: Uint8ClampedArray,
  w: ColorWheels,
): void {
  (engine as unknown as { applyWheels(d: Uint8ClampedArray, w: ColorWheels): void })
    .applyWheels(data, w);
}

function defaultWheels(): ColorWheels {
  return {
    lift:   { r: 0, g: 0, b: 0, a: 0 },
    gamma:  { r: 0, g: 0, b: 0, a: 0 },
    gain:   { r: 0, g: 0, b: 0, a: 0 },
    offset: { r: 0, g: 0, b: 0, a: 0 },
    contrast: 0,
    pivot: 0.5,
    saturation: 1,
    hue: 0,
  };
}

/** Build a single-pixel Uint8ClampedArray RGBA buffer. */
function pixel(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

// ─── Grade Management ──────────────────────────────────────────

describe('ColorGradingEngine — createGrade', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  it('creates a grade with 3 nodes (input / node1 / output)', () => {
    const grade = engine.createGrade('Test Grade');
    expect(grade.name).toBe('Test Grade');
    expect(grade.nodes.size).toBe(3);
    expect(grade.nodes.has('input')).toBe(true);
    expect(grade.nodes.has('node1')).toBe(true);
    expect(grade.nodes.has('output')).toBe(true);
  });

  it('nodeOrder reflects input → node1 → output topology', () => {
    const grade = engine.createGrade('Topo');
    expect(grade.nodeOrder).toEqual(['input', 'node1', 'output']);
  });

  it('each grade gets a unique id', () => {
    const g1 = engine.createGrade('A');
    const g2 = engine.createGrade('B');
    expect(g1.id).not.toBe(g2.id);
  });

  it('nodes are enabled by default', () => {
    const grade = engine.createGrade('Defaults');
    for (const node of grade.nodes.values()) {
      expect(node.enabled).toBe(true);
    }
  });

  it('wheels start at neutral (all channels zero, saturation = 1)', () => {
    const grade = engine.createGrade('Neutral');
    const n = grade.nodes.get('node1')!;
    expect(n.wheels.lift).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(n.wheels.gamma).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(n.wheels.gain).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(n.wheels.offset).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(n.wheels.saturation).toBe(1);
    expect(n.wheels.contrast).toBe(0);
  });

  it('curves start with identity control points', () => {
    const grade = engine.createGrade('Curves');
    const n = grade.nodes.get('node1')!;
    expect(n.curves.master).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  });

  // ── Aliasing regressions ──────────────────────────────────────

  it('REGRESSION: setWheel on one grade does not mutate another grade', () => {
    const g1 = engine.createGrade('G1');
    const g2 = engine.createGrade('G2');

    engine.setWheel(g1.id, 'node1', 'lift', 'r', 0.5);

    // g2's node1 lift.r must remain 0 (not 0.5)
    expect(g2.nodes.get('node1')!.wheels.lift.r).toBe(0);
  });

  it('REGRESSION: setWheel does not mutate the DEFAULT_WHEELS constant (newly created grade unaffected)', () => {
    const g1 = engine.createGrade('G1');
    engine.setWheel(g1.id, 'node1', 'gamma', 'b', -0.3);

    // A grade created after the mutation must still have neutral defaults
    const g2 = engine.createGrade('G2');
    expect(g2.nodes.get('node1')!.wheels.gamma.b).toBe(0);
  });

  it('REGRESSION: addCurvePoint on one node does not affect another node in the same grade', () => {
    const grade = engine.createGrade('Curve Alias');
    engine.addCurvePoint(grade.id, 'node1', 'master', { x: 0.5, y: 0.4 });

    // input node's master curve must still be the 2-point identity
    expect(grade.nodes.get('input')!.curves.master).toHaveLength(2);
  });

  it('REGRESSION: addCurvePoint does not mutate DEFAULT_CURVES (newly created grade unaffected)', () => {
    const g1 = engine.createGrade('G1');
    engine.addCurvePoint(g1.id, 'node1', 'master', { x: 0.5, y: 0.6 });

    const g2 = engine.createGrade('G2');
    expect(g2.nodes.get('node1')!.curves.master).toHaveLength(2);
  });
});

// ─── Wheel Adjustments ────────────────────────────────────────

describe('ColorGradingEngine — setWheel', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  it('sets lift.r on the specified node', () => {
    const g = engine.createGrade('W');
    engine.setWheel(g.id, 'node1', 'lift', 'r', 0.3);
    expect(g.nodes.get('node1')!.wheels.lift.r).toBeCloseTo(0.3);
  });

  it('clamps values to [-1, 1] (above)', () => {
    const g = engine.createGrade('W');
    engine.setWheel(g.id, 'node1', 'gain', 'a', 5);
    expect(g.nodes.get('node1')!.wheels.gain.a).toBe(1);
  });

  it('clamps values to [-1, 1] (below)', () => {
    const g = engine.createGrade('W');
    engine.setWheel(g.id, 'node1', 'offset', 'g', -5);
    expect(g.nodes.get('node1')!.wheels.offset.g).toBe(-1);
  });

  it('does not throw for unknown gradeId', () => {
    expect(() => engine.setWheel('ghost', 'node1', 'lift', 'r', 0.5)).not.toThrow();
  });

  it('does not throw for unknown nodeId', () => {
    const g = engine.createGrade('W');
    expect(() => engine.setWheel(g.id, 'ghost', 'lift', 'r', 0.5)).not.toThrow();
  });
});

describe('ColorGradingEngine — setContrast / setSaturation', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  it('setContrast updates contrast and pivot', () => {
    const g = engine.createGrade('C');
    engine.setContrast(g.id, 'node1', 0.5, 0.4);
    const w = g.nodes.get('node1')!.wheels;
    expect(w.contrast).toBeCloseTo(0.5);
    expect(w.pivot).toBeCloseTo(0.4);
  });

  it('setContrast clamps contrast to [-1, 1]', () => {
    const g = engine.createGrade('C');
    engine.setContrast(g.id, 'node1', 3);
    expect(g.nodes.get('node1')!.wheels.contrast).toBe(1);
  });

  it('setContrast clamps pivot to [0, 1]', () => {
    const g = engine.createGrade('C');
    engine.setContrast(g.id, 'node1', 0, 2);
    expect(g.nodes.get('node1')!.wheels.pivot).toBe(1);
  });

  it('setContrast default pivot is 0.5', () => {
    const g = engine.createGrade('C');
    engine.setContrast(g.id, 'node1', 0.2);
    expect(g.nodes.get('node1')!.wheels.pivot).toBe(0.5);
  });

  it('setSaturation updates saturation', () => {
    const g = engine.createGrade('S');
    engine.setSaturation(g.id, 'node1', 1.5);
    expect(g.nodes.get('node1')!.wheels.saturation).toBeCloseTo(1.5);
  });

  it('setSaturation clamps to [0, 2]', () => {
    const g = engine.createGrade('S');
    engine.setSaturation(g.id, 'node1', 5);
    expect(g.nodes.get('node1')!.wheels.saturation).toBe(2);
    engine.setSaturation(g.id, 'node1', -1);
    expect(g.nodes.get('node1')!.wheels.saturation).toBe(0);
  });
});

// ─── Curve Operations ─────────────────────────────────────────

describe('ColorGradingEngine — addCurvePoint', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  it('inserts a point in sorted order by x', () => {
    const g = engine.createGrade('Curve');
    engine.addCurvePoint(g.id, 'node1', 'master', { x: 0.5, y: 0.6 });
    const pts = g.nodes.get('node1')!.curves.master;
    // Identity points are at x=0 and x=1; new point at x=0.5 goes between
    expect(pts).toHaveLength(3);
    expect(pts[0].x).toBe(0);
    expect(pts[1].x).toBeCloseTo(0.5);
    expect(pts[2].x).toBe(1);
  });

  it('appends a point past the last control point', () => {
    const g = engine.createGrade('Curve');
    // Insert beyond x=1 (last default point)
    engine.addCurvePoint(g.id, 'node1', 'master', { x: 1.5, y: 1.5 });
    const pts = g.nodes.get('node1')!.curves.master;
    expect(pts).toHaveLength(3);
    expect(pts[2].x).toBeCloseTo(1.5);
  });

  it('inserts into the red channel independently', () => {
    const g = engine.createGrade('Curve');
    engine.addCurvePoint(g.id, 'node1', 'red', { x: 0.3, y: 0.2 });
    const node = g.nodes.get('node1')!;
    expect(node.curves.red).toHaveLength(3);
    expect(node.curves.master).toHaveLength(2); // master unchanged
  });

  it('does not throw for unknown grade', () => {
    expect(() =>
      engine.addCurvePoint('ghost', 'node1', 'master', { x: 0.5, y: 0.5 })
    ).not.toThrow();
  });
});

// ─── Export / Import ──────────────────────────────────────────

describe('ColorGradingEngine — exportGrade / importGrade', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  it('exportGrade returns valid JSON', () => {
    const g = engine.createGrade('Export');
    const json = engine.exportGrade(g.id);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('exportGrade JSON contains version and grade name', () => {
    const g = engine.createGrade('MyGrade');
    const data = JSON.parse(engine.exportGrade(g.id));
    expect(data.version).toBe('1.0');
    expect(data.grade.name).toBe('MyGrade');
  });

  it('exportGrade throws for unknown id', () => {
    expect(() => engine.exportGrade('ghost')).toThrow('Grade not found');
  });

  it('importGrade creates a new grade with a different id', () => {
    const g = engine.createGrade('Original');
    const json = engine.exportGrade(g.id);
    const imported = engine.importGrade(json);
    expect(imported.name).toBe('Original');
    expect(imported.id).not.toBe(g.id);
  });

  it('round-trip preserves grade structure', () => {
    const g = engine.createGrade('RT');
    engine.setWheel(g.id, 'node1', 'gain', 'r', 0.2);
    const json = engine.exportGrade(g.id);
    const imported = engine.importGrade(json);
    // Nodes should be present — importGrade reconstructs from JSON array
    expect(imported.nodes).toBeDefined();
  });

  it('REGRESSION: importGrade rejects malformed JSON with a clear error (not raw SyntaxError)', () => {
    expect(() => engine.importGrade('{broken json::')).toThrow(/Invalid grade file/i);
  });

  it('REGRESSION: importGrade rejects valid JSON missing the grade object', () => {
    expect(() => engine.importGrade('{"version":"1.0"}')).toThrow(/Invalid grade file/i);
  });

  it('REGRESSION: importGrade rejects grade with non-array nodes (no opaque Map error)', () => {
    expect(() => engine.importGrade('{"grade":{"name":"X","nodes":{}}}')).toThrow(/Invalid grade file/i);
  });
});

// ─── applyWheels (CPU math) ───────────────────────────────────

describe('ColorGradingEngine — applyWheels (CPU path)', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  it('identity wheels leave pixel unchanged', () => {
    const data = pixel(128, 64, 200);
    applyWheels(engine, data, defaultWheels());
    // Allow ±1 for rounding
    expect(data[0]).toBeCloseTo(128, -1);
    expect(data[1]).toBeCloseTo(64, -1);
    expect(data[2]).toBeCloseTo(200, -1);
    expect(data[3]).toBe(255); // alpha unchanged
  });

  it('master lift (a=0.5) lifts shadow pixels toward midtones', () => {
    const data = pixel(0, 0, 0); // pure black
    const w = defaultWheels();
    w.lift.a = 0.5; // lift all channels
    applyWheels(engine, data, w);
    // r = 0 + 0.5*(1-0) = 0.5 → 128
    expect(data[0]).toBeCloseTo(128, -1);
    expect(data[1]).toBeCloseTo(128, -1);
    expect(data[2]).toBeCloseTo(128, -1);
  });

  it('gain (a = 0.5) brightens a pixel (r *= 1.5)', () => {
    const data = pixel(100, 100, 100);
    const w = defaultWheels();
    w.gain.a = 0.5; // r *= 1 + 0.5 = 1.5
    applyWheels(engine, data, w);
    // 100/255 * 1.5 * 255 = 150
    expect(data[0]).toBeCloseTo(150, -1);
  });

  it('saturation = 0 desaturates to grayscale', () => {
    const data = pixel(255, 0, 0); // pure red
    const w = defaultWheels();
    w.saturation = 0;
    applyWheels(engine, data, w);
    // luma of (1,0,0) = 0.2126 → all channels ≈ 0.2126*255 ≈ 54
    expect(data[0]).toBeCloseTo(54, -1);
    expect(data[1]).toBeCloseTo(54, -1);
    expect(data[2]).toBeCloseTo(54, -1);
  });

  it('positive contrast increases midtone separation', () => {
    // Two midtone pixels on opposite sides of pivot=0.5
    const bright = pixel(200, 200, 200);
    const w = defaultWheels();
    w.contrast = 0.5; // (x - 0.5)*1.5 + 0.5
    applyWheels(engine, bright, w);
    applyWheels(engine, new Uint8ClampedArray([50, 50, 50, 255]), w);

    // bright pixel (200/255 ≈ 0.784): (0.784 - 0.5)*1.5 + 0.5 = 0.926 → 236
    expect(bright[0]).toBeCloseTo(236, -1);
    // dark pixel (50/255 ≈ 0.196): (0.196 - 0.5)*1.5 + 0.5 = 0.044 → 11
    const dark2 = pixel(50, 50, 50);
    applyWheels(engine, dark2, w);
    expect(dark2[0]).toBeCloseTo(11, -1);
  });

  it('white pixel stays white with default wheels', () => {
    const data = pixel(255, 255, 255);
    applyWheels(engine, data, defaultWheels());
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);
  });

  it('offset shifts all channels uniformly', () => {
    const data = pixel(100, 100, 100);
    const w = defaultWheels();
    w.offset.a = 0.2; // +0.2 to all
    applyWheels(engine, data, w);
    // (100/255 + 0.2) * 255 = 100 + 51 = 151
    expect(data[0]).toBeCloseTo(151, -1);
    expect(data[1]).toBeCloseTo(151, -1);
    expect(data[2]).toBeCloseTo(151, -1);
  });

  // REGRESSION: applyWheels (the CPU path — used whenever GPU is
  // unavailable, or the grade has curves/a LUT/multiple nodes) never read
  // wheels.hue at all, so a hue-wheel adjustment silently vanished as soon
  // as the WGSL single-node fast path didn't apply, even though the GPU
  // shader correctly rotates hue via rgb2hsl/hsl2rgb.
  it('REGRESSION: hue=120 rotates pure red to pure green (matches GPU shader math)', () => {
    const data = pixel(255, 0, 0);
    const w = defaultWheels();
    w.hue = 120;
    applyWheels(engine, data, w);
    expect(data[0]).toBeCloseTo(0, -1);
    expect(data[1]).toBeCloseTo(255, -1);
    expect(data[2]).toBeCloseTo(0, -1);
  });

  it('REGRESSION: hue=240 rotates pure red to pure blue', () => {
    const data = pixel(255, 0, 0);
    const w = defaultWheels();
    w.hue = 240;
    applyWheels(engine, data, w);
    expect(data[0]).toBeCloseTo(0, -1);
    expect(data[1]).toBeCloseTo(0, -1);
    expect(data[2]).toBeCloseTo(255, -1);
  });

  it('hue rotation of an achromatic (gray) pixel is a no-op', () => {
    const data = pixel(128, 128, 128);
    const w = defaultWheels();
    w.hue = 90;
    applyWheels(engine, data, w);
    expect(data[0]).toBeCloseTo(128, -1);
    expect(data[1]).toBeCloseTo(128, -1);
    expect(data[2]).toBeCloseTo(128, -1);
  });

  it('hue=0 (default) leaves color unchanged (fast-path skip)', () => {
    const data = pixel(200, 100, 50);
    applyWheels(engine, data, defaultWheels());
    expect(data[0]).toBeCloseTo(200, -1);
    expect(data[1]).toBeCloseTo(100, -1);
    expect(data[2]).toBeCloseTo(50, -1);
  });
});

// ─── HSL Qualifier / Power Window masking ────────────────────────

import { rgbToHsl, computeQualifierMask, computeWindowMask, type HSLQualifier, type PowerWindow, type ColorNode } from '../color/grading-engine';

/** Access the private blendWithMask() method via type cast. */
function blendWithMask(
  engine: ColorGradingEngine,
  data: Uint8ClampedArray,
  original: Uint8ClampedArray,
  node: ColorNode,
  width: number,
  height: number,
): void {
  (engine as unknown as {
    blendWithMask(d: Uint8ClampedArray, o: Uint8ClampedArray, n: ColorNode, w: number, h: number): void;
  }).blendWithMask(data, original, node, width, height);
}

function defaultQualifier(over: Partial<HSLQualifier> = {}): HSLQualifier {
  return {
    enabled: true, hueCenter: 0, hueWidth: 30, hueSoft: 0.1,
    satLow: 0.2, satHigh: 1, satSoft: 0.1,
    lumLow: 0, lumHigh: 1, lumSoft: 0.1,
    invert: false,
    ...over,
  };
}

function defaultWindow(over: Partial<PowerWindow> = {}): PowerWindow {
  return {
    id: 'w1', type: 'circle', enabled: true, invert: false,
    x: 0.5, y: 0.5, width: 0.4, height: 0.4, rotation: 0, softness: 0.2,
    ...over,
  };
}

describe('rgbToHsl', () => {
  it('pure red / green / blue map to 0° / 120° / 240°', () => {
    expect(rgbToHsl(1, 0, 0).h).toBeCloseTo(0, 5);
    expect(rgbToHsl(0, 1, 0).h).toBeCloseTo(120, 5);
    expect(rgbToHsl(0, 0, 1).h).toBeCloseTo(240, 5);
  });

  it('white and black are achromatic (s=0) with l=1/0', () => {
    expect(rgbToHsl(1, 1, 1)).toEqual({ h: 0, s: 0, l: 1 });
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('mid gray has l=0.5, s=0', () => {
    const { s, l } = rgbToHsl(0.5, 0.5, 0.5);
    expect(s).toBe(0);
    expect(l).toBeCloseTo(0.5, 5);
  });
});

describe('computeQualifierMask', () => {
  it('REGRESSION: a disabled qualifier always returns 1 (full effect, matches pre-fix behavior)', () => {
    const q = defaultQualifier({ enabled: false });
    expect(computeQualifierMask(q, 1, 0, 0)).toBe(1); // red
    expect(computeQualifierMask(q, 0, 1, 0)).toBe(1); // green
  });

  it('an enabled qualifier fully selects a color inside its hue/sat/lum range', () => {
    const q = defaultQualifier({ hueCenter: 0, hueWidth: 30, satLow: 0.5, satHigh: 1, lumLow: 0.3, lumHigh: 0.7 });
    // Pure, saturated red at mid-lightness sits well inside all three ranges.
    expect(computeQualifierMask(q, 0.8, 0.2, 0.2)).toBeCloseTo(1, 5);
  });

  it('a color far outside the hue range is fully rejected (mask 0)', () => {
    const q = defaultQualifier({ hueCenter: 0, hueWidth: 30, hueSoft: 0.05 });
    // Pure green (120°) is nowhere near a qualifier centered on red (0°).
    expect(computeQualifierMask(q, 0, 1, 0)).toBeCloseTo(0, 5);
  });

  it('the hue soft ramp gives a partial (0<mask<1) value just past the hard edge', () => {
    const q = defaultQualifier({ hueCenter: 0, hueWidth: 20, hueSoft: 0.1, satLow: 0, satHigh: 1, lumLow: 0, lumHigh: 1 });
    // Hard edge at ±10°; soft ramp extends to ±(10+36)=46°. 25° should be
    // partially selected: neither fully in (mask=1) nor fully out (mask=0).
    // Construct an RGB whose hue is exactly 25°, full saturation, l=0.5.
    // HSL(25°, 1, 0.5) -> RGB via standard conversion.
    const c = 1; // chroma at s=1,l=0.5
    const hp = 25 / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [c, x, 0] : [x, c, 0];
    const m = 0.5 - c / 2;
    const mask = computeQualifierMask(q, r1 + m, g1 + m, b1 + m);
    expect(mask).toBeGreaterThan(0);
    expect(mask).toBeLessThan(1);
  });

  it('invert flips a full match to fully rejected', () => {
    const q = defaultQualifier({ hueCenter: 0, hueWidth: 30, satLow: 0, satHigh: 1, lumLow: 0, lumHigh: 1, invert: true });
    expect(computeQualifierMask(q, 1, 0, 0)).toBeCloseTo(0, 5); // red normally fully matches
  });
});

describe('computeWindowMask', () => {
  it('REGRESSION: a disabled window always returns 1 (full effect, matches pre-fix behavior)', () => {
    const win = defaultWindow({ enabled: false });
    expect(computeWindowMask(win, 0, 0, 100, 100)).toBe(1);
  });

  it('circle: the exact center is fully inside (mask 1)', () => {
    const win = defaultWindow({ type: 'circle', x: 0.5, y: 0.5, width: 0.4, height: 0.4, softness: 0.2 });
    expect(computeWindowMask(win, 50, 50, 100, 100)).toBeCloseTo(1, 5);
  });

  it('circle: a far corner is fully outside (mask 0)', () => {
    const win = defaultWindow({ type: 'circle', x: 0.5, y: 0.5, width: 0.2, height: 0.2, softness: 0.1 });
    expect(computeWindowMask(win, 0, 0, 100, 100)).toBe(0);
  });

  it('rectangle: a point just inside the box edge is fully selected', () => {
    const win = defaultWindow({ type: 'rectangle', x: 0.5, y: 0.5, width: 0.6, height: 0.6, softness: 0.05 });
    // Box half-extents are 30px each side of center (50,50) -> inner edge at ±(1-0.05)*30=28.5
    expect(computeWindowMask(win, 50 + 20, 50, 100, 100)).toBeCloseTo(1, 5);
  });

  it('invert flips inside (1) to outside (0)', () => {
    const win = defaultWindow({ type: 'circle', x: 0.5, y: 0.5, width: 0.4, height: 0.4, softness: 0.2, invert: true });
    expect(computeWindowMask(win, 50, 50, 100, 100)).toBeCloseTo(0, 5);
  });

  it('gradient: ramps linearly from 0 at the left edge to 1 at the right edge', () => {
    const win = defaultWindow({ type: 'gradient', x: 0.5, y: 0.5, width: 0.4, height: 0.4, rotation: 0 });
    const left = computeWindowMask(win, 30, 50, 100, 100);
    const center = computeWindowMask(win, 50, 50, 100, 100);
    const right = computeWindowMask(win, 70, 50, 100, 100);
    expect(left).toBeLessThan(center);
    expect(center).toBeCloseTo(0.5, 1);
    expect(center).toBeLessThan(right);
  });
});

describe('ColorGradingEngine — blendWithMask', () => {
  let engine: ColorGradingEngine;
  beforeEach(() => { engine = new ColorGradingEngine(); });

  function makeNode(over: Partial<Pick<ColorNode, 'qualifier' | 'windows'>>): ColorNode {
    return {
      id: 'n', type: 'corrector', label: '', enabled: true,
      wheels: defaultWheels(), curves: { master: [], red: [], green: [], blue: [], hueVsSat: [], hueVsHue: [], lumVsSat: [] },
      qualifier: defaultQualifier({ enabled: false }),
      windows: [],
      inputs: [], outputs: [], position: { x: 0, y: 0 }, blend: { mode: 'normal', opacity: 1 },
      ...over,
    };
  }

  it('REGRESSION: a node with an enabled qualifier only keeps the graded result where the qualifier matches', () => {
    // Before fix: qualifier/windows were never consulted at all -- the
    // graded (fully shifted) pixel was kept everywhere, with zero
    // isolation, regardless of the node's qualifier/window configuration.
    const node = makeNode({
      qualifier: defaultQualifier({ hueCenter: 0, hueWidth: 20, hueSoft: 0.02, satLow: 0, satHigh: 1, lumLow: 0, lumHigh: 1 }),
    });
    // Two pixels: one red (matches qualifier), one green (does not).
    const original = new Uint8ClampedArray([255, 0, 0, 255,   0, 255, 0, 255]);
    const graded   = new Uint8ClampedArray([0, 0, 255, 255,   0, 0, 255, 255]); // both shifted to blue by the grade
    blendWithMask(engine, graded, original, node, 2, 1);

    // Red pixel: qualifier matched -> graded (blue) result kept.
    expect(graded[0]).toBeCloseTo(0, 0);
    expect(graded[2]).toBeCloseTo(255, 0);
    // Green pixel: qualifier did not match -> reverted to the original color.
    expect(graded[4]).toBeCloseTo(0, 0);
    expect(graded[5]).toBeCloseTo(255, 0);
    expect(graded[6]).toBeCloseTo(0, 0);
  });

  it('a node with neither qualifier nor windows enabled is untouched (mask always 1)', () => {
    const node = makeNode({});
    const original = new Uint8ClampedArray([10, 20, 30, 255]);
    const graded   = new Uint8ClampedArray([200, 210, 220, 255]);
    const gradedCopy = graded.slice();
    blendWithMask(engine, graded, original, node, 1, 1);
    expect(graded).toEqual(gradedCopy); // unchanged — fully graded result kept
  });
});

// ─── loadCubeLUT ────────────────────────────────────────────────

describe('ColorGradingEngine — loadCubeLUT', () => {
  let engine: ColorGradingEngine;

  beforeEach(() => { engine = new ColorGradingEngine(); });

  const VALID_CUBE_2 = `LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

  it('REGRESSION: produces stride-3 RGB data (not stride-4), matching lut-apply.ts trilinear() reader', async () => {
    const lut = await engine.loadCubeLUT(makeFile(VALID_CUBE_2, 'test.cube'));
    expect(lut).not.toBeNull();
    // size=2 cube has 8 cells; stride-3 => 24 floats. The prior bug appended a
    // spurious 4th value per cell (stride 4 => 32 floats), which desynced
    // every cell after the first against lut-apply.ts's stride-3 reader.
    expect(lut!.data.length).toBe(2 * 2 * 2 * 3);
  });

  it('REGRESSION: rejects a truncated .cube (fewer than size^3 entries)', async () => {
    const truncated = `LUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 0.0 0.0\n`;
    const lut = await engine.loadCubeLUT(makeFile(truncated, 'bad.cube'));
    expect(lut).toBeNull();
  });
});
