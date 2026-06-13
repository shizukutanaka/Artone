/**
 * KeyframeAnimator テスト — イージング / 補間 / タイムライン操作
 *
 * 純粋 TypeScript — DOM 不要。easing 関数の境界値・単調性と
 * getValue() の補間精度を検証。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyframeAnimator, type EasingType } from '../animation/keyframe-animator';

// ============================================================
// Easing function boundary conditions
// ============================================================

// All standard easing types that should map t=0→0 and t=1→1
const STANDARD_EASINGS: EasingType[] = [
  'linear',
  'easeIn', 'easeOut', 'easeInOut',
  'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
  'easeInExpo', 'easeOutExpo', 'easeInOutExpo',
  'easeInElastic', 'easeOutElastic', 'easeInOutElastic',
  'easeInBounce', 'easeOutBounce', 'easeInOutBounce',
];

describe('Easing functions via KeyframeAnimator.getValue()', () => {
  let anim: KeyframeAnimator;

  beforeEach(() => {
    anim = new KeyframeAnimator();
  });

  for (const easing of STANDARD_EASINGS) {
    it(`${easing}: getValue at t=0 returns start value`, () => {
      const id = anim.createAnimation('test').id;
      anim.addProperty(id, 'x', 0);
      anim.addKeyframe(id, 'x', 0,   0, easing);
      anim.addKeyframe(id, 'x', 1.0, 100, easing);
      expect(anim.getValue(id, 'x', 0)).toBeCloseTo(0, 4);
    });

    it(`${easing}: getValue at t=1 returns end value`, () => {
      const id = anim.createAnimation('test').id;
      anim.addProperty(id, 'x', 0);
      anim.addKeyframe(id, 'x', 0,   0, easing);
      anim.addKeyframe(id, 'x', 1.0, 100, easing);
      expect(anim.getValue(id, 'x', 1.0)).toBeCloseTo(100, 4);
    });
  }
});

// ============================================================
// Linear interpolation
// ============================================================

describe('Linear keyframe interpolation', () => {
  let anim: KeyframeAnimator;

  beforeEach(() => {
    anim = new KeyframeAnimator();
  });

  it('returns exact midpoint for linear easing', () => {
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 0);
    anim.addKeyframe(id, 'x', 0,   0,   'linear');
    anim.addKeyframe(id, 'x', 1.0, 100, 'linear');
    expect(anim.getValue(id, 'x', 0.5)).toBeCloseTo(50, 4);
  });

  it('returns first value before first keyframe', () => {
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 99);
    anim.addKeyframe(id, 'x', 1.0, 20, 'linear');
    anim.addKeyframe(id, 'x', 2.0, 40, 'linear');
    expect(anim.getValue(id, 'x', 0)).toBeCloseTo(20, 4);
  });

  it('returns last value after last keyframe', () => {
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 0);
    anim.addKeyframe(id, 'x', 0,   10, 'linear');
    anim.addKeyframe(id, 'x', 1.0, 90, 'linear');
    expect(anim.getValue(id, 'x', 5.0)).toBeCloseTo(90, 4);
  });

  it('returns default value when no keyframes exist', () => {
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 42);
    expect(anim.getValue(id, 'x', 0.5)).toBe(42);
  });

  it('returns single keyframe value regardless of time', () => {
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 0);
    anim.addKeyframe(id, 'x', 0.5, 77, 'linear');
    expect(anim.getValue(id, 'x', 0)).toBeCloseTo(77, 4);
    expect(anim.getValue(id, 'x', 1)).toBeCloseTo(77, 4);
  });
});

// ============================================================
// Hold easing
// ============================================================

describe('Hold easing', () => {
  it('holds the from-value until the next keyframe time', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 0);
    anim.addKeyframe(id, 'x', 0,   0,   'hold');
    anim.addKeyframe(id, 'x', 1.0, 100, 'hold');
    // Between 0 and 1 with hold: should stay at 0
    expect(anim.getValue(id, 'x', 0.5)).toBeCloseTo(0, 4);
    // After second keyframe: stays at 100
    expect(anim.getValue(id, 'x', 2.0)).toBeCloseTo(100, 4);
  });
});

// ============================================================
// Cubic bezier easing
// ============================================================

describe('Bezier easing', () => {
  it('ease-in-out bezier (CSS default) is symmetric around t=0.5', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 0);
    anim.addKeyframe(id, 'x', 0, 0, 'bezier', {
      outX: 0.42, outY: 0,
    });
    anim.addKeyframe(id, 'x', 1.0, 100, 'bezier', {
      inX: 0.58, inY: 1,
    });
    const v025 = anim.getValue(id, 'x', 0.25);
    const v075 = anim.getValue(id, 'x', 0.75);
    // Symmetric: v025 + v075 ≈ 100
    expect(v025 + v075).toBeCloseTo(100, 0);
  });

  it('linear bezier (0.5,0,0.5,1) ≈ linear', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('test').id;
    anim.addProperty(id, 'x', 0);
    anim.addKeyframe(id, 'x', 0, 0, 'bezier', { outX: 0.5, outY: 0 });
    anim.addKeyframe(id, 'x', 1.0, 100, 'bezier', { inX: 0.5, inY: 1 });
    // Near-linear bezier should be close to linear midpoint
    expect(anim.getValue(id, 'x', 0.5)).toBeCloseTo(50, 0);
  });
});

// ============================================================
// getAllValues
// ============================================================

describe('getAllValues', () => {
  it('returns values for all properties at a given time', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('multi').id;
    anim.addProperty(id, 'x', 0);
    anim.addProperty(id, 'y', 0);
    anim.addKeyframe(id, 'x', 0, 0, 'linear');
    anim.addKeyframe(id, 'x', 1.0, 100, 'linear');
    anim.addKeyframe(id, 'y', 0, 0, 'linear');
    anim.addKeyframe(id, 'y', 1.0, 200, 'linear');
    const vals = anim.getAllValues(id, 0.5);
    expect(vals.x).toBeCloseTo(50, 4);
    expect(vals.y).toBeCloseTo(100, 4);
  });

  it('returns empty object for unknown animation', () => {
    const anim = new KeyframeAnimator();
    expect(anim.getAllValues('nonexistent', 0.5)).toEqual({});
  });
});

// ============================================================
// Keyframe CRUD
// ============================================================

describe('Keyframe CRUD', () => {
  let anim: KeyframeAnimator;
  let id: string;

  beforeEach(() => {
    anim = new KeyframeAnimator();
    id = anim.createAnimation('crud-test').id;
    anim.addProperty(id, 'x', 0);
  });

  it('adds keyframes and retrieves them sorted', () => {
    anim.addKeyframe(id, 'x', 0.8, 80, 'linear');
    anim.addKeyframe(id, 'x', 0.2, 20, 'linear');
    anim.addKeyframe(id, 'x', 0.5, 50, 'linear');
    expect(anim.getValue(id, 'x', 0.2)).toBeCloseTo(20, 4);
    expect(anim.getValue(id, 'x', 0.5)).toBeCloseTo(50, 4);
    expect(anim.getValue(id, 'x', 0.8)).toBeCloseTo(80, 4);
  });

  it('overwrites keyframe at the same time', () => {
    anim.addKeyframe(id, 'x', 0.5, 50, 'linear');
    anim.addKeyframe(id, 'x', 0.5, 75, 'linear'); // overwrite
    expect(anim.getValue(id, 'x', 0.5)).toBeCloseTo(75, 4);
  });

  it('deleteKeyframe removes the keyframe', () => {
    const kf = anim.addKeyframe(id, 'x', 0.5, 50, 'linear');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    anim.deleteKeyframe(id, 'x', kf!.id);
    // After deletion: single value → returns that value or default
    expect(anim.getValue(id, 'x', 0.5)).toBe(0); // returns default
  });
});

// ============================================================
// Non-existent animation / property handling
// ============================================================

describe('Edge cases', () => {
  it('getValue returns 0 for unknown animation', () => {
    const anim = new KeyframeAnimator();
    expect(anim.getValue('nonexistent', 'x', 0.5)).toBe(0);
  });

  it('getValue returns 0 for unknown property', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('test').id;
    expect(anim.getValue(id, 'nonexistent', 0.5)).toBe(0);
  });
});

// ─── subscribe / notify ───────────────────────────────────────────────────────

describe('KeyframeAnimator — subscribe / notify', () => {
  it('listener is called when a keyframe is added', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('bounce').id;
    const listener = vi.fn();
    anim.subscribe(listener);
    anim.addKeyframe(id, 'x', { time: 0, value: 0, easing: 'linear' });
    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('test').id;
    const listener = vi.fn();
    const unsub = anim.subscribe(listener);
    unsub();
    anim.addKeyframe(id, 'x', { time: 0, value: 10, easing: 'linear' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('listener is called when a keyframe is deleted', () => {
    const anim = new KeyframeAnimator();
    const id = anim.createAnimation('test').id;
    const kf = anim.addKeyframe(id, 'y', { time: 0, value: 5, easing: 'easeIn' });
    const listener = vi.fn();
    anim.subscribe(listener);
    anim.deleteKeyframe(id, 'y', kf.id);
    expect(listener).toHaveBeenCalled();
  });
});
