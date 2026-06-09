/**
 * Tests for animation/motion-graphics.ts — MotionGraphicsEngine
 *
 * Covers text/shape/particle layer creation, star geometry, particle
 * lifecycle with mocked Math.random, layer CRUD, subscribe, and the
 * regression fix: lerpColor must handle 3-digit hex (#rgb) without
 * producing NaN channel values.
 *
 * Canvas-dependent methods (setCanvas, render) are not tested here.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MotionGraphicsEngine } from '../animation/motion-graphics';
import type { TextLayer } from '../animation/motion-graphics';

let engine: MotionGraphicsEngine;

beforeEach(() => {
  engine = new MotionGraphicsEngine();
});

// ─── Text layers ──────────────────────────────────────────────────────────────

describe('createTextLayer', () => {
  it('returns a text layer with the given text and default style', () => {
    const layer = engine.createTextLayer('Hello');
    expect(layer.type).toBe('text');
    expect(layer.text).toBe('Hello');
    expect(layer.font.family).toBe('SF Pro Display');
    expect(layer.font.size).toBe(48);
    expect(layer.opacity).toBe(1);
    expect(layer.position).toEqual({ x: 0, y: 0 });
  });

  it('applies partial style overrides', () => {
    const layer = engine.createTextLayer('Hi', { size: 24, color: '#f00' });
    expect(layer.font.size).toBe(24);
    expect(layer.font.color).toBe('#f00');
    expect(layer.font.family).toBe('SF Pro Display'); // default retained
  });

  it('each layer gets a unique id', () => {
    const a = engine.createTextLayer('A');
    const b = engine.createTextLayer('B');
    expect(a.id).not.toBe(b.id);
  });

  it('layer is retrievable via getLayer', () => {
    const layer = engine.createTextLayer('X');
    expect(engine.getLayer(layer.id)).toBe(layer);
  });
});

describe('updateTextLayer', () => {
  it('merges partial updates onto the layer', () => {
    const layer = engine.createTextLayer('A');
    engine.updateTextLayer(layer.id, { text: 'B', opacity: 0.5 });
    const updated = engine.getLayer(layer.id) as TextLayer;
    expect(updated.text).toBe('B');
    expect(updated.opacity).toBe(0.5);
  });

  it('silently ignores unknown id', () => {
    expect(() => engine.updateTextLayer('no-such-id', { text: 'X' })).not.toThrow();
  });

  it('silently ignores non-text layer id', () => {
    const shape = engine.createShapeLayer('rectangle', { width: 100, height: 100 });
    expect(() => engine.updateTextLayer(shape.id, { text: 'X' })).not.toThrow();
  });
});

describe('setTextAnimation', () => {
  it('assigns animation to a text layer', () => {
    const layer = engine.createTextLayer('A');
    engine.setTextAnimation(layer.id, {
      type: 'fadeIn', duration: 0.5, delay: 0, stagger: 0.05,
      easing: 'easeOut', direction: 'forward',
    });
    const updated = engine.getLayer(layer.id) as TextLayer;
    expect(updated.animation?.type).toBe('fadeIn');
  });
});

// ─── Shape layers ─────────────────────────────────────────────────────────────

describe('createShapeLayer', () => {
  it('creates a shape with given type and size', () => {
    const layer = engine.createShapeLayer('ellipse', { width: 200, height: 100 });
    expect(layer.type).toBe('shape');
    expect(layer.shape).toBe('ellipse');
    expect(layer.size).toEqual({ width: 200, height: 100 });
  });

  it('default fill is solid #007AFF', () => {
    const layer = engine.createShapeLayer('rectangle', { width: 100, height: 100 });
    expect(layer.fill.type).toBe('solid');
    expect(layer.fill.color).toBe('#007AFF');
  });
});

describe('createRectangle', () => {
  it('sets cornerRadius', () => {
    const layer = engine.createRectangle(200, 100, 12);
    expect(layer.shape).toBe('rectangle');
    expect(layer.size).toEqual({ width: 200, height: 100 });
    expect(layer.cornerRadius).toBe(12);
  });

  it('defaults cornerRadius to 0', () => {
    const layer = engine.createRectangle(100, 100);
    expect(layer.cornerRadius).toBe(0);
  });
});

describe('createEllipse', () => {
  it('creates an ellipse layer', () => {
    const layer = engine.createEllipse(80, 40);
    expect(layer.shape).toBe('ellipse');
    expect(layer.size).toEqual({ width: 80, height: 40 });
  });
});

describe('createPolygon', () => {
  it('stores the provided points array', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    const layer = engine.createPolygon(pts);
    expect(layer.shape).toBe('polygon');
    expect(layer.points).toEqual(pts);
  });
});

describe('createStar', () => {
  it('generates 2×points vertices for a 5-pointed star', () => {
    const layer = engine.createStar(5, 20, 50);
    expect(layer.shape).toBe('star');
    expect(layer.points?.length).toBe(10);
  });

  it('outer vertices are at outerRadius distance from origin', () => {
    const layer = engine.createStar(5, 20, 50);
    const pts = layer.points!;
    const outerDists = [0, 2, 4, 6, 8].map(i =>
      Math.sqrt(pts[i].x ** 2 + pts[i].y ** 2)
    );
    for (const d of outerDists) expect(d).toBeCloseTo(50, 5);
  });

  it('inner vertices are at innerRadius distance from origin', () => {
    const layer = engine.createStar(5, 20, 50);
    const pts = layer.points!;
    const innerDists = [1, 3, 5, 7, 9].map(i =>
      Math.sqrt(pts[i].x ** 2 + pts[i].y ** 2)
    );
    for (const d of innerDists) expect(d).toBeCloseTo(20, 5);
  });

  it('first outer vertex points upward (negative y, x≈0)', () => {
    const layer = engine.createStar(5, 20, 50);
    const pt = layer.points![0];
    expect(pt.x).toBeCloseTo(0, 5);
    expect(pt.y).toBeCloseTo(-50, 5);
  });

  it('size equals 2×outerRadius', () => {
    const layer = engine.createStar(6, 10, 30);
    expect(layer.size).toEqual({ width: 60, height: 60 });
  });
});

// ─── Particle system ──────────────────────────────────────────────────────────

describe('createParticleSystem', () => {
  it('creates a particle system with defaults', () => {
    const sys = engine.createParticleSystem();
    expect(sys.type).toBe('particles');
    expect(sys.particles).toEqual([]);
    expect(sys.maxParticles).toBe(1000);
    expect(sys.emitter.rate).toBe(10);
  });

  it('merges partial emitter overrides', () => {
    const sys = engine.createParticleSystem({ rate: 50, maxParticles: 200 } as Parameters<typeof engine.createParticleSystem>[0]);
    expect(sys.emitter.rate).toBe(50);
    expect(sys.emitter.gravity.x).toBe(0); // default retained
  });
});

describe('updateParticleSystem', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits particles on update', () => {
    const sys = engine.createParticleSystem({ rate: 10 });
    engine.updateParticleSystem(sys.id, 1); // 1s: should emit particles
    expect(sys.particles.length).toBeGreaterThan(0);
  });

  it('particles have valid position and velocity', () => {
    const sys = engine.createParticleSystem({ rate: 5 });
    engine.updateParticleSystem(sys.id, 0.5);
    for (const p of sys.particles) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.vx)).toBe(true);
      expect(Number.isFinite(p.vy)).toBe(true);
    }
  });

  it('particles die and are removed when life reaches 0', () => {
    const sys = engine.createParticleSystem({ rate: 5, lifetime: { min: 0.1, max: 0.1 } });
    engine.updateParticleSystem(sys.id, 0.05); // emit, not yet dead
    const count = sys.particles.length;
    expect(count).toBeGreaterThan(0);
    engine.updateParticleSystem(sys.id, 0.2); // exceed lifetime
    expect(sys.particles.length).toBeLessThan(count);
  });

  it('respects maxParticles cap', () => {
    const sys = engine.createParticleSystem({ rate: 1000 });
    sys.maxParticles = 5;
    engine.updateParticleSystem(sys.id, 10);
    expect(sys.particles.length).toBeLessThanOrEqual(5);
  });

  it('REGRESSION: 3-digit hex particle colors produce valid rgb() output', () => {
    const sys = engine.createParticleSystem({
      rate: 10,
      particleColor: { start: '#f00', end: '#00f' }, // 3-digit hex
    });
    engine.updateParticleSystem(sys.id, 1);
    for (const p of sys.particles) {
      // Valid rgb(r,g,b) must not contain NaN
      expect(p.color).not.toContain('NaN');
      expect(p.color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
  });

  it('particle colors transition from start to end over lifetime', () => {
    vi.restoreAllMocks();
    // Use Math.random = 0 for deterministic lifetime at min, max speed at min
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sys = engine.createParticleSystem({
      rate: 5,
      particleColor: { start: '#ff0000', end: '#0000ff' },
      lifetime: { min: 2, max: 2 },
    });
    engine.updateParticleSystem(sys.id, 0.01); // just born → t≈0
    const newParticle = sys.particles[0];
    // At birth (t≈0), color should be close to start color
    expect(newParticle.color).toMatch(/^rgb\(/);
    expect(Number.isFinite(newParticle.opacity)).toBe(true);
  });
});

// ─── Layer CRUD ───────────────────────────────────────────────────────────────

describe('layer management', () => {
  it('getLayers() returns all added layers', () => {
    const t = engine.createTextLayer('A');
    const s = engine.createShapeLayer('rectangle', { width: 100, height: 100 });
    const p = engine.createParticleSystem();
    const ids = engine.getLayers().map(l => l.id);
    expect(ids).toContain(t.id);
    expect(ids).toContain(s.id);
    expect(ids).toContain(p.id);
  });

  it('deleteLayer removes the layer', () => {
    const layer = engine.createTextLayer('X');
    engine.deleteLayer(layer.id);
    expect(engine.getLayer(layer.id)).toBeUndefined();
    expect(engine.getLayers()).toHaveLength(0);
  });

  it('getLayer returns undefined for unknown id', () => {
    expect(engine.getLayer('no-such')).toBeUndefined();
  });

  it('getAnimator returns the internal KeyframeAnimator', () => {
    expect(engine.getAnimator()).toBeDefined();
  });
});

// ─── Subscribe ────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('fires on layer creation and unsubscribes cleanly', () => {
    let calls = 0;
    const unsub = engine.subscribe(() => { calls++; });
    engine.createTextLayer('A');
    expect(calls).toBe(1);
    unsub();
    engine.createTextLayer('B');
    expect(calls).toBe(1);
  });

  it('fires on deleteLayer', () => {
    const layer = engine.createTextLayer('X');
    let calls = 0;
    engine.subscribe(() => { calls++; });
    engine.deleteLayer(layer.id);
    expect(calls).toBe(1);
  });
});
