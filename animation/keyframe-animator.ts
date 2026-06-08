/**
 * Artone v3 — Keyframe Animation System
 * 
 * プロパティアニメーション
 * - ベジェカーブ
 * - イージング関数
 * - 複数プロパティ同時アニメーション
 * - キーフレーム補間
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface Keyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingType;
  bezierHandles?: {
    inX: number;
    inY: number;
    outX: number;
    outY: number;
  };
}

export type EasingType = 
  | 'linear' | 'hold'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
  | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic'
  | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce'
  | 'bezier';

export interface AnimatedProperty {
  id: string;
  name: string;
  keyframes: Keyframe[];
  defaultValue: number;
  min?: number;
  max?: number;
}

export interface Animation {
  id: string;
  clipId: string;
  properties: Map<string, AnimatedProperty>;
  duration: number;
}

export interface PropertyGroup {
  name: string;
  properties: string[];
}

// ============================================================
// Standard Property Groups
// ============================================================

export const TRANSFORM_PROPERTIES: PropertyGroup = {
  name: 'Transform',
  properties: ['positionX', 'positionY', 'scaleX', 'scaleY', 'rotation', 'anchorX', 'anchorY', 'opacity']
};

export const EFFECT_PROPERTIES: PropertyGroup = {
  name: 'Effects',
  properties: ['blur', 'brightness', 'contrast', 'saturation', 'hue']
};

// ============================================================
// Easing Functions
// ============================================================

const EASING_FUNCTIONS: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  hold: () => 0,
  
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 
      ? Math.pow(2, 20 * t - 10) / 2 
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  
  easeInElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3);
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * (2 * Math.PI) / 4.5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * (2 * Math.PI) / 4.5)) / 2 + 1;
  },
  
  easeInBounce: (t) => 1 - EASING_FUNCTIONS.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t) => {
    return t < 0.5
      ? (1 - EASING_FUNCTIONS.easeOutBounce(1 - 2 * t)) / 2
      : (1 + EASING_FUNCTIONS.easeOutBounce(2 * t - 1)) / 2;
  },
  
  bezier: (t) => t // Will use custom bezier calculation
};

// ============================================================
// Bezier Curve
// ============================================================

function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): (t: number) => number {
  // Newton-Raphson iteration to find t for given x
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  
  function sampleCurveX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }
  
  function sampleCurveY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }
  
  function solveCurveX(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t) - x;
      if (Math.abs(x2) < 1e-6) return t;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= x2 / d;
    }
    return t;
  }
  
  return (x: number): number => sampleCurveY(solveCurveX(x));
}

// ============================================================
// Animation Engine
// ============================================================

export class KeyframeAnimator {
  private animations: Map<string, Animation> = new Map();
  private listeners: Set<() => void> = new Set();

  // ============================================================
  // Animation Management
  // ============================================================

  createAnimation(clipId: string): Animation {
    const animation: Animation = {
      id: crypto.randomUUID(),
      clipId,
      properties: new Map(),
      duration: 0
    };

    this.animations.set(animation.id, animation);
    this.notify();
    return animation;
  }

  getAnimation(animationId: string): Animation | undefined {
    return this.animations.get(animationId);
  }

  getAnimationForClip(clipId: string): Animation | undefined {
    for (const anim of this.animations.values()) {
      if (anim.clipId === clipId) return anim;
    }
    return undefined;
  }

  deleteAnimation(animationId: string): void {
    this.animations.delete(animationId);
    this.notify();
  }

  // ============================================================
  // Property Management
  // ============================================================

  addProperty(animationId: string, propertyName: string, defaultValue = 0): AnimatedProperty | null {
    const animation = this.animations.get(animationId);
    if (!animation) return null;

    const property: AnimatedProperty = {
      id: crypto.randomUUID(),
      name: propertyName,
      keyframes: [],
      defaultValue
    };

    animation.properties.set(propertyName, property);
    this.notify();
    return property;
  }

  removeProperty(animationId: string, propertyName: string): void {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.properties.delete(propertyName);
      this.notify();
    }
  }

  // ============================================================
  // Keyframe Operations
  // ============================================================

  addKeyframe(
    animationId: string,
    propertyName: string,
    time: number,
    value: number,
    easing: EasingType = 'easeInOut',
    bezierHandles?: Partial<{ inX: number; inY: number; outX: number; outY: number }>
  ): Keyframe | null {
    const animation = this.animations.get(animationId);
    if (!animation) return null;

    let property = animation.properties.get(propertyName);
    if (!property) {
      const added = this.addProperty(animationId, propertyName, value);
      if (!added) return null;
      property = added;
    }

    // Remove existing keyframe at same time
    property.keyframes = property.keyframes.filter(k => Math.abs(k.time - time) > 0.001);

    const keyframe: Keyframe = {
      id: crypto.randomUUID(),
      time,
      value,
      easing,
      ...(bezierHandles ? { bezierHandles: { inX: 0, inY: 0, outX: 1, outY: 1, ...bezierHandles } } : {})
    };

    property.keyframes.push(keyframe);
    property.keyframes.sort((a, b) => a.time - b.time);

    // Update animation duration
    animation.duration = Math.max(
      animation.duration,
      ...Array.from(animation.properties.values()).flatMap(p => p.keyframes.map(k => k.time))
    );

    this.notify();
    return keyframe;
  }

  updateKeyframe(
    animationId: string,
    propertyName: string,
    keyframeId: string,
    updates: Partial<Keyframe>
  ): void {
    const animation = this.animations.get(animationId);
    if (!animation) return;

    const property = animation.properties.get(propertyName);
    if (!property) return;

    const keyframe = property.keyframes.find(k => k.id === keyframeId);
    if (keyframe) {
      Object.assign(keyframe, updates);
      property.keyframes.sort((a, b) => a.time - b.time);
      this.notify();
    }
  }

  deleteKeyframe(animationId: string, propertyName: string, keyframeId: string): void {
    const animation = this.animations.get(animationId);
    if (!animation) return;

    const property = animation.properties.get(propertyName);
    if (property) {
      property.keyframes = property.keyframes.filter(k => k.id !== keyframeId);
      this.notify();
    }
  }

  // ============================================================
  // Value Interpolation
  // ============================================================

  getValue(animationId: string, propertyName: string, time: number): number {
    const animation = this.animations.get(animationId);
    if (!animation) return 0;

    const property = animation.properties.get(propertyName);
    if (!property) return 0;

    if (property.keyframes.length === 0) {
      return property.defaultValue;
    }

    if (property.keyframes.length === 1) {
      return property.keyframes[0].value;
    }

    // Find surrounding keyframes
    let prevKey: Keyframe | null = null;
    let nextKey: Keyframe | null = null;

    for (const kf of property.keyframes) {
      if (kf.time <= time) {
        prevKey = kf;
      }
      if (kf.time > time && !nextKey) {
        nextKey = kf;
        break;
      }
    }

    // Before first keyframe
    if (!prevKey) {
      return property.keyframes[0].value;
    }

    // After last keyframe
    if (!nextKey) {
      return prevKey.value;
    }

    // Interpolate
    const t = (time - prevKey.time) / (nextKey.time - prevKey.time);
    return this.interpolate(prevKey, nextKey, t);
  }

  private interpolate(from: Keyframe, to: Keyframe, t: number): number {
    let easedT: number;

    if (from.easing === 'bezier' && from.bezierHandles) {
      const bezier = cubicBezier(
        from.bezierHandles.outX,
        from.bezierHandles.outY,
        to.bezierHandles?.inX ?? 0.5,
        to.bezierHandles?.inY ?? 0.5
      );
      easedT = bezier(t);
    } else if (from.easing === 'hold') {
      return from.value;
    } else {
      easedT = EASING_FUNCTIONS[from.easing](t);
    }

    return from.value + (to.value - from.value) * easedT;
  }

  getAllValues(animationId: string, time: number): Record<string, number> {
    const animation = this.animations.get(animationId);
    if (!animation) return {};

    const values: Record<string, number> = {};
    for (const [name] of animation.properties) {
      values[name] = this.getValue(animationId, name, time);
    }
    return values;
  }

  // ============================================================
  // Keyframe Operations
  // ============================================================

  copyKeyframes(
    animationId: string,
    propertyName: string,
    startTime: number,
    endTime: number
  ): Keyframe[] {
    const animation = this.animations.get(animationId);
    if (!animation) return [];

    const property = animation.properties.get(propertyName);
    if (!property) return [];

    return property.keyframes
      .filter(k => k.time >= startTime && k.time <= endTime)
      .map(k => ({ ...k, id: crypto.randomUUID() }));
  }

  pasteKeyframes(
    animationId: string,
    propertyName: string,
    keyframes: Keyframe[],
    targetTime: number
  ): void {
    if (keyframes.length === 0) return;

    const minTime = Math.min(...keyframes.map(k => k.time));
    const offset = targetTime - minTime;

    for (const kf of keyframes) {
      this.addKeyframe(
        animationId,
        propertyName,
        kf.time + offset,
        kf.value,
        kf.easing
      );
    }
  }

  reverseKeyframes(animationId: string, propertyName: string): void {
    const animation = this.animations.get(animationId);
    if (!animation) return;

    const property = animation.properties.get(propertyName);
    if (!property || property.keyframes.length < 2) return;

    const values = property.keyframes.map(k => k.value);
    values.reverse();

    for (let i = 0; i < property.keyframes.length; i++) {
      property.keyframes[i].value = values[i];
    }

    this.notify();
  }

  // ============================================================
  // Utility
  // ============================================================

  hasKeyframeAt(animationId: string, propertyName: string, time: number): boolean {
    const animation = this.animations.get(animationId);
    if (!animation) return false;

    const property = animation.properties.get(propertyName);
    if (!property) return false;

    return property.keyframes.some(k => Math.abs(k.time - time) < 0.001);
  }

  getKeyframesInRange(
    animationId: string,
    startTime: number,
    endTime: number
  ): Array<{ property: string; keyframe: Keyframe }> {
    const animation = this.animations.get(animationId);
    if (!animation) return [];

    const result: Array<{ property: string; keyframe: Keyframe }> = [];

    for (const [name, property] of animation.properties) {
      for (const keyframe of property.keyframes) {
        if (keyframe.time >= startTime && keyframe.time <= endTime) {
          result.push({ property: name, keyframe });
        }
      }
    }

    return result.sort((a, b) => a.keyframe.time - b.keyframe.time);
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

