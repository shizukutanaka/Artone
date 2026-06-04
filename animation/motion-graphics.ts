/**
 * Artone v3 — Motion Graphics Engine
 * 
 * テキスト/シェイプ/パーティクル
 * - アニメーションテキスト
 * - シェイプレイヤー
 * - パーティクルシステム
 * - エクスプレッション
 * - プリセットアニメーション
 * 
 * @version 1.0.0
 */

import type { EasingType } from './keyframe-animator';
import { KeyframeAnimator } from './keyframe-animator';

// ============================================================
// Types
// ============================================================

export interface TextLayer {
  id: string;
  type: 'text';
  text: string;
  font: TextStyle;
  position: { x: number; y: number };
  anchor: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
  animation?: TextAnimation;
}

export interface TextStyle {
  family: string;
  size: number;
  weight: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  letterSpacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
}

export interface TextAnimation {
  type: TextAnimationType;
  duration: number;
  delay: number;
  stagger: number;
  easing: EasingType;
  direction: 'forward' | 'backward' | 'random';
}

export type TextAnimationType = 
  | 'fadeIn' | 'fadeOut'
  | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight'
  | 'scaleIn' | 'scaleOut'
  | 'typewriter' | 'scramble' | 'bounce'
  | 'wave' | 'glitch' | 'blur';

export interface ShapeLayer {
  id: string;
  type: 'shape';
  shape: ShapeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  opacity: number;
  fill: FillStyle;
  stroke: StrokeStyle;
  cornerRadius?: number;
  points?: Array<{ x: number; y: number }>;
}

export type ShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line' | 'path';

export interface FillStyle {
  type: 'solid' | 'gradient' | 'none';
  color?: string;
  gradient?: {
    type: 'linear' | 'radial';
    stops: Array<{ offset: number; color: string }>;
    angle?: number;
  };
}

export interface StrokeStyle {
  color: string;
  width: number;
  dashArray?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}

export interface ParticleSystem {
  id: string;
  type: 'particles';
  emitter: ParticleEmitter;
  particles: Particle[];
  maxParticles: number;
}

export interface ParticleEmitter {
  position: { x: number; y: number };
  shape: 'point' | 'line' | 'circle' | 'rectangle';
  size: { width: number; height: number };
  rate: number;
  lifetime: { min: number; max: number };
  speed: { min: number; max: number };
  direction: { min: number; max: number };
  gravity: { x: number; y: number };
  particleSize: { start: number; end: number };
  particleColor: { start: string; end: string };
  particleOpacity: { start: number; end: number };
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  opacity: number;
}

export type MotionLayer = TextLayer | ShapeLayer | ParticleSystem;

// ============================================================
// Preset Animations
// ============================================================

export const TEXT_ANIMATION_PRESETS: Record<TextAnimationType, (char: HTMLElement, index: number, total: number, progress: number) => void> = {
  fadeIn: (el, _i, _total, p) => {
    el.style.opacity = String(p);
  },
  fadeOut: (el, _i, _total, p) => {
    el.style.opacity = String(1 - p);
  },
  slideUp: (el, _i, _total, p) => {
    el.style.opacity = String(p);
    el.style.transform = `translateY(${(1 - p) * 20}px)`;
  },
  slideDown: (el, _i, _total, p) => {
    el.style.opacity = String(p);
    el.style.transform = `translateY(${(p - 1) * 20}px)`;
  },
  slideLeft: (el, _i, _total, p) => {
    el.style.opacity = String(p);
    el.style.transform = `translateX(${(1 - p) * 20}px)`;
  },
  slideRight: (el, _i, _total, p) => {
    el.style.opacity = String(p);
    el.style.transform = `translateX(${(p - 1) * 20}px)`;
  },
  scaleIn: (el, _i, _total, p) => {
    el.style.opacity = String(p);
    el.style.transform = `scale(${p})`;
  },
  scaleOut: (el, _i, _total, p) => {
    el.style.opacity = String(1 - p);
    el.style.transform = `scale(${1 - p * 0.5})`;
  },
  typewriter: (el, _i, _total, p) => {
    el.style.opacity = p > 0 ? '1' : '0';
  },
  scramble: (el, _i, _total, p) => {
    if (p < 1) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      el.textContent = chars[Math.floor(Math.random() * chars.length)];
    }
    el.style.opacity = '1';
  },
  bounce: (el, _i, _total, p) => {
    const bounce = Math.sin(p * Math.PI) * (1 - p) * 20;
    el.style.opacity = String(Math.min(p * 2, 1));
    el.style.transform = `translateY(${-bounce}px)`;
  },
  wave: (el, i, total, p) => {
    const wave = Math.sin((p + i / total) * Math.PI * 2) * 10;
    el.style.transform = `translateY(${wave}px)`;
    el.style.opacity = '1';
  },
  glitch: (el, _i, _total, _p) => {
    const glitch = Math.random() > 0.9;
    el.style.opacity = glitch ? '0.5' : '1';
    el.style.transform = glitch ? `translate(${(Math.random() - 0.5) * 10}px, ${(Math.random() - 0.5) * 5}px)` : 'none';
  },
  blur: (el, _i, _total, p) => {
    el.style.opacity = String(p);
    el.style.filter = `blur(${(1 - p) * 10}px)`;
  }
};

// ============================================================
// Motion Graphics Engine
// ============================================================

export class MotionGraphicsEngine {
  private layers: Map<string, MotionLayer> = new Map();
  private animator: KeyframeAnimator;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(animator?: KeyframeAnimator) {
    this.animator = animator || new KeyframeAnimator();
  }

  /** 内部の KeyframeAnimator を取得 (モーションのキーフレーム制御用) */
  getAnimator(): KeyframeAnimator {
    return this.animator;
  }

  // ============================================================
  // Canvas Setup
  // ============================================================

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // ============================================================
  // Text Layers
  // ============================================================

  createTextLayer(text: string, style?: Partial<TextStyle>): TextLayer {
    const defaultStyle: TextStyle = {
      family: 'SF Pro Display',
      size: 48,
      weight: 600,
      color: '#ffffff',
      letterSpacing: 0,
      lineHeight: 1.2,
      align: 'center'
    };

    const layer: TextLayer = {
      id: crypto.randomUUID(),
      type: 'text',
      text,
      font: { ...defaultStyle, ...style },
      position: { x: 0, y: 0 },
      anchor: { x: 0.5, y: 0.5 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      opacity: 1
    };

    this.layers.set(layer.id, layer);
    this.notify();
    return layer;
  }

  updateTextLayer(layerId: string, updates: Partial<TextLayer>): void {
    const layer = this.layers.get(layerId);
    if (layer && layer.type === 'text') {
      Object.assign(layer, updates);
      this.notify();
    }
  }

  setTextAnimation(layerId: string, animation: TextAnimation): void {
    const layer = this.layers.get(layerId) as TextLayer;
    if (layer && layer.type === 'text') {
      layer.animation = animation;
      this.notify();
    }
  }

  // ============================================================
  // Shape Layers
  // ============================================================

  createShapeLayer(shape: ShapeType, size: { width: number; height: number }): ShapeLayer {
    const layer: ShapeLayer = {
      id: crypto.randomUUID(),
      type: 'shape',
      shape,
      position: { x: 0, y: 0 },
      size,
      rotation: 0,
      opacity: 1,
      fill: { type: 'solid', color: '#007AFF' },
      stroke: { color: '#ffffff', width: 0 }
    };

    this.layers.set(layer.id, layer);
    this.notify();
    return layer;
  }

  createRectangle(width: number, height: number, cornerRadius = 0): ShapeLayer {
    const layer = this.createShapeLayer('rectangle', { width, height });
    layer.cornerRadius = cornerRadius;
    return layer;
  }

  createEllipse(width: number, height: number): ShapeLayer {
    return this.createShapeLayer('ellipse', { width, height });
  }

  createPolygon(points: Array<{ x: number; y: number }>): ShapeLayer {
    const layer = this.createShapeLayer('polygon', { width: 100, height: 100 });
    layer.points = points;
    return layer;
  }

  createStar(points: number, innerRadius: number, outerRadius: number): ShapeLayer {
    const layer = this.createShapeLayer('star', { width: outerRadius * 2, height: outerRadius * 2 });
    
    const starPoints: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      starPoints.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }
    layer.points = starPoints;
    
    return layer;
  }

  // ============================================================
  // Particle Systems
  // ============================================================

  createParticleSystem(emitter: Partial<ParticleEmitter> = {}): ParticleSystem {
    const defaultEmitter: ParticleEmitter = {
      position: { x: 0, y: 0 },
      shape: 'point',
      size: { width: 0, height: 0 },
      rate: 10,
      lifetime: { min: 1, max: 3 },
      speed: { min: 50, max: 100 },
      direction: { min: 0, max: 360 },
      gravity: { x: 0, y: 100 },
      particleSize: { start: 10, end: 0 },
      particleColor: { start: '#ffffff', end: '#ffffff' },
      particleOpacity: { start: 1, end: 0 }
    };

    const system: ParticleSystem = {
      id: crypto.randomUUID(),
      type: 'particles',
      emitter: { ...defaultEmitter, ...emitter },
      particles: [],
      maxParticles: 1000
    };

    this.layers.set(system.id, system);
    this.notify();
    return system;
  }

  updateParticleSystem(systemId: string, deltaTime: number): void {
    const system = this.layers.get(systemId) as ParticleSystem;
    if (!system || system.type !== 'particles') return;

    const { emitter } = system;

    // Emit new particles
    const toEmit = emitter.rate * deltaTime;
    for (let i = 0; i < toEmit && system.particles.length < system.maxParticles; i++) {
      const angle = this.randomRange(emitter.direction.min, emitter.direction.max) * Math.PI / 180;
      const speed = this.randomRange(emitter.speed.min, emitter.speed.max);
      const lifetime = this.randomRange(emitter.lifetime.min, emitter.lifetime.max);

      let x = emitter.position.x;
      let y = emitter.position.y;

      if (emitter.shape === 'circle') {
        const r = Math.sqrt(Math.random()) * emitter.size.width / 2;
        const a = Math.random() * Math.PI * 2;
        x += Math.cos(a) * r;
        y += Math.sin(a) * r;
      } else if (emitter.shape === 'rectangle') {
        x += (Math.random() - 0.5) * emitter.size.width;
        y += (Math.random() - 0.5) * emitter.size.height;
      }

      system.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: lifetime,
        maxLife: lifetime,
        size: emitter.particleSize.start,
        color: emitter.particleColor.start,
        opacity: emitter.particleOpacity.start
      });
    }

    // Update particles
    for (let i = system.particles.length - 1; i >= 0; i--) {
      const p = system.particles[i];
      
      p.vx += emitter.gravity.x * deltaTime;
      p.vy += emitter.gravity.y * deltaTime;
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;

      const t = 1 - p.life / p.maxLife;
      p.size = this.lerp(emitter.particleSize.start, emitter.particleSize.end, t);
      p.opacity = this.lerp(emitter.particleOpacity.start, emitter.particleOpacity.end, t);
      p.color = this.lerpColor(emitter.particleColor.start, emitter.particleColor.end, t);

      if (p.life <= 0) {
        system.particles.splice(i, 1);
      }
    }
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpColor(a: string, b: string, t: number): string {
    const parseHex = (hex: string) => {
      const h = hex.replace('#', '');
      return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16)
      };
    };

    const ca = parseHex(a);
    const cb = parseHex(b);

    const r = Math.round(this.lerp(ca.r, cb.r, t));
    const g = Math.round(this.lerp(ca.g, cb.g, t));
    const bl = Math.round(this.lerp(ca.b, cb.b, t));

    return `rgb(${r},${g},${bl})`;
  }

  // ============================================================
  // Rendering
  // ============================================================

  render(time: number): void {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const layer of this.layers.values()) {
      switch (layer.type) {
        case 'text':
          this.renderText(layer, time);
          break;
        case 'shape':
          this.renderShape(layer);
          break;
        case 'particles':
          this.renderParticles(layer);
          break;
      }
    }
  }

  private renderText(layer: TextLayer, _time: number): void {
    if (!this.ctx) return;

    const { font, position, scale, rotation, opacity } = layer;

    this.ctx.save();
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(rotation * Math.PI / 180);
    this.ctx.scale(scale.x, scale.y);
    this.ctx.globalAlpha = opacity;

    this.ctx.font = `${font.weight} ${font.size}px "${font.family}"`;
    this.ctx.fillStyle = font.color;
    this.ctx.textAlign = font.align;
    this.ctx.textBaseline = 'middle';

    if (font.strokeWidth && font.strokeColor) {
      this.ctx.strokeStyle = font.strokeColor;
      this.ctx.lineWidth = font.strokeWidth;
      this.ctx.strokeText(layer.text, 0, 0);
    }

    this.ctx.fillText(layer.text, 0, 0);
    this.ctx.restore();
  }

  private renderShape(layer: ShapeLayer): void {
    if (!this.ctx) return;

    const { shape, position, size, rotation, opacity, fill, stroke, cornerRadius, points } = layer;

    this.ctx.save();
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(rotation * Math.PI / 180);
    this.ctx.globalAlpha = opacity;

    this.ctx.beginPath();

    switch (shape) {
      case 'rectangle':
        if (cornerRadius) {
          this.roundRect(-size.width / 2, -size.height / 2, size.width, size.height, cornerRadius);
        } else {
          this.ctx.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        }
        break;

      case 'ellipse':
        this.ctx.ellipse(0, 0, size.width / 2, size.height / 2, 0, 0, Math.PI * 2);
        break;

      case 'polygon':
      case 'star':
        if (points && points.length > 0) {
          this.ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
          }
          this.ctx.closePath();
        }
        break;
    }

    if (fill.type === 'solid' && fill.color) {
      this.ctx.fillStyle = fill.color;
      this.ctx.fill();
    } else if (fill.type === 'gradient' && fill.gradient) {
      const grad = fill.gradient.type === 'linear'
        ? this.ctx.createLinearGradient(-size.width / 2, 0, size.width / 2, 0)
        : this.ctx.createRadialGradient(0, 0, 0, 0, 0, size.width / 2);

      for (const stop of fill.gradient.stops) {
        grad.addColorStop(stop.offset, stop.color);
      }
      this.ctx.fillStyle = grad;
      this.ctx.fill();
    }

    if (stroke.width > 0) {
      this.ctx.strokeStyle = stroke.color;
      this.ctx.lineWidth = stroke.width;
      if (stroke.dashArray) this.ctx.setLineDash(stroke.dashArray);
      if (stroke.lineCap) this.ctx.lineCap = stroke.lineCap;
      if (stroke.lineJoin) this.ctx.lineJoin = stroke.lineJoin;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    if (!this.ctx) return;
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  private renderParticles(system: ParticleSystem): void {
    if (!this.ctx) return;

    for (const p of system.particles) {
      this.ctx.save();
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  // ============================================================
  // Layer Management
  // ============================================================

  getLayer(id: string): MotionLayer | undefined {
    return this.layers.get(id);
  }

  getLayers(): MotionLayer[] {
    return Array.from(this.layers.values());
  }

  deleteLayer(id: string): void {
    this.layers.delete(id);
    this.notify();
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export default MotionGraphicsEngine;
