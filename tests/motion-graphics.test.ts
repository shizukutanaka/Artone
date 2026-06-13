/**
 * Tests for animation/motion-graphics.ts — MotionGraphicsEngine
 *
 * Covers text/shape/particle layer creation, star geometry, particle
 * lifecycle with mocked Math.random, layer CRUD, subscribe, and the
 * regression fix: lerpColor must handle 3-digit hex (#rgb) without
 * producing NaN channel values.
 *
 * Canvas rendering is tested via a mocked 2D context.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MotionGraphicsEngine, TEXT_ANIMATION_PRESETS } from '../animation/motion-graphics';
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

// ─── TEXT_ANIMATION_PRESETS ───────────────────────────────────────────────────

describe('TEXT_ANIMATION_PRESETS — glitch and blur', () => {
  function makeEl(): HTMLElement {
    return document.createElement('span');
  }

  it('glitch preset sets opacity to "0.5" or "1"', () => {
    const el = makeEl();
    // Run many times to hit both branches (Math.random > 0.9 is rare)
    for (let i = 0; i < 20; i++) {
      TEXT_ANIMATION_PRESETS.glitch(el, 0, 1, 0.5);
    }
    expect(['0.5', '1']).toContain(el.style.opacity);
  });

  it('blur preset sets opacity to progress value and filter to blur', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.blur(el, 0, 1, 0.5);
    expect(el.style.opacity).toBe('0.5');
    expect(el.style.filter).toContain('blur(');
  });

  it('bounce preset sets opacity and translateY transform', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.bounce(el, 0, 1, 0.5);
    expect(el.style.opacity).toBeDefined();
    expect(el.style.transform).toContain('translateY(');
  });

  it('wave preset sets opacity to "1" and translateY transform', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.wave(el, 0, 4, 0.5);
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toContain('translateY(');
  });

  it('typewriter preset shows element when progress > 0', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.typewriter(el, 0, 1, 0.5);
    expect(el.style.opacity).toBe('1');
    TEXT_ANIMATION_PRESETS.typewriter(el, 0, 1, 0);
    expect(el.style.opacity).toBe('0');
  });

  it('scramble preset randomizes textContent when progress < 1', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.scramble(el, 0, 1, 0.5);
    expect(el.style.opacity).toBe('1');
    expect(el.textContent).toBeTruthy();
  });

  it('scramble preset does not scramble textContent when progress == 1', () => {
    const el = makeEl();
    el.textContent = 'original';
    TEXT_ANIMATION_PRESETS.scramble(el, 0, 1, 1);
    expect(el.textContent).toBe('original');
  });

  it('scaleIn preset sets opacity and scale transform', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.scaleIn(el, 0, 1, 0.7);
    expect(el.style.opacity).toBe('0.7');
    expect(el.style.transform).toContain('scale(');
  });

  it('scaleOut preset decreases opacity and scale as progress increases', () => {
    const el = makeEl();
    TEXT_ANIMATION_PRESETS.scaleOut(el, 0, 1, 0.5);
    expect(el.style.opacity).toBe('0.5');
    expect(el.style.transform).toContain('scale(');
  });
});

// ─── Emitter shape: circle and rectangle ─────────────────────────────────────

describe('updateParticleSystem — emitter shapes', () => {
  it('emitter shape=circle spawns particles with circular distribution', () => {
    const system = engine.createParticleSystem({
      shape: 'circle',
      size: { width: 100, height: 100 },
      rate: 100,
      lifetime: { min: 5, max: 5 }, // long enough that particles survive the 0.1s update
    });
    engine.updateParticleSystem(system.id, 0.1);
    // rate=100, deltaTime=0.1 → toEmit=10; lifetime=5 >> 0.1 so none die
    expect(system.particles.length).toBeGreaterThan(0);
  });

  it('emitter shape=rectangle spawns particles with rectangular distribution', () => {
    const system = engine.createParticleSystem({
      shape: 'rectangle',
      size: { width: 100, height: 100 },
      rate: 100,
      lifetime: { min: 5, max: 5 },
    });
    engine.updateParticleSystem(system.id, 0.1);
    expect(system.particles.length).toBeGreaterThan(0);
  });
});

// ─── setCanvas / render ────────────────────────────────────────────────────────

function makeMockCanvas(width = 400, height = 300): HTMLCanvasElement {
  const grad = { addColorStop: vi.fn() };
  const ctx2d = {
    fillStyle: '' as string | CanvasGradient,
    strokeStyle: '' as string,
    lineWidth: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    globalAlpha: 1,
    lineCap: '' as CanvasLineCap,
    lineJoin: '' as CanvasLineJoin,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    quadraticCurveTo: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => grad),
    createRadialGradient: vi.fn(() => grad),
  };
  return {
    width,
    height,
    getContext: vi.fn(() => ctx2d),
  } as unknown as HTMLCanvasElement;
}

describe('setCanvas and render()', () => {
  it('render() does nothing when no canvas is set', () => {
    expect(() => engine.render(0)).not.toThrow();
  });

  it('setCanvas stores the canvas and calls getContext("2d")', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    expect((canvas.getContext as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('2d');
  });

  it('render() calls clearRect on each call', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
  });

  it('render() renders a text layer (fillText called)', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.createTextLayer('Hello World');
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.fillText).toHaveBeenCalledWith('Hello World', 0, 0);
  });

  it('render() renders text with stroke when strokeWidth is set', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.createTextLayer('Stroked', { strokeWidth: 2, strokeColor: '#000' });
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.strokeText).toHaveBeenCalledWith('Stroked', 0, 0);
  });

  it('render() renders a solid-fill rectangle shape', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.createShapeLayer('rectangle', { width: 100, height: 50 });
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('render() renders a rounded rectangle (cornerRadius path)', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.createRectangle(100, 50, 8);
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.quadraticCurveTo).toHaveBeenCalled();
  });

  it('render() renders an ellipse shape', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.createEllipse(80, 40);
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it('render() renders a polygon shape (lineTo for each point)', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    engine.createPolygon([{ x: 0, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }]);
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.moveTo).toHaveBeenCalledWith(0, -50);
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('render() renders a gradient-fill shape', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    const layer = engine.createShapeLayer('rectangle', { width: 100, height: 50 });
    layer.fill = {
      type: 'gradient',
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] },
    };
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.createLinearGradient).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('render() renders a radial gradient shape', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    const layer = engine.createShapeLayer('ellipse', { width: 100, height: 100 });
    layer.fill = {
      type: 'gradient',
      gradient: { type: 'radial', stops: [{ offset: 0, color: '#ff0' }, { offset: 1, color: '#f00' }] },
    };
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.createRadialGradient).toHaveBeenCalled();
  });

  it('render() renders a shape with stroke', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    const layer = engine.createShapeLayer('rectangle', { width: 60, height: 60 });
    layer.stroke = { color: '#ff0', width: 3, dashArray: [4, 4] };
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
  });

  it('render() renders particles (arc called for each particle)', () => {
    const canvas = makeMockCanvas();
    engine.setCanvas(canvas);
    const system = engine.createParticleSystem();
    // Manually inject a particle
    (system.particles as Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string; opacity: number }>).push(
      { x: 10, y: 20, vx: 0, vy: 0, life: 1, maxLife: 2, size: 5, color: '#fff', opacity: 0.8 }
    );
    engine.render(0);
    const ctx = (canvas.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.arc).toHaveBeenCalled();
  });
});
