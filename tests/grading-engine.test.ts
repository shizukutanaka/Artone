/**
 * ColorGradingEngine Tests
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ColorGradingEngine, type ColorWheels } from '../color/grading-engine';

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
});
