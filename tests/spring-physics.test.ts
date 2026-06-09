/**
 * Spring Physics — Damped Harmonic Oscillator Tests
 *
 * Covers all three regimes (under/critical/overdamped), analytical accuracy,
 * step-by-step simulation convergence, and preset sanity.
 */

import { describe, it, expect } from 'vitest';
import {
  naturalFrequency,
  dampingRatio,
  createSpringAnimation,
  springStep,
  isAtRest,
  SPRING_PRESETS,
  type SpringConfig,
  type SpringState,
} from '../animation/spring-physics';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Advance spring N steps of dt seconds, return final state. */
function simulate(
  from: number,
  target: number,
  config: SpringConfig,
  steps: number,
  dt = 1 / 60,
): SpringState {
  let state: SpringState = { position: from, velocity: 0 };
  for (let i = 0; i < steps; i++) {
    state = springStep(state, target, dt, config);
  }
  return state;
}

// ─── naturalFrequency ────────────────────────────────────────────────────────

describe('naturalFrequency', () => {
  it('returns sqrt(k/m) with default mass=1', () => {
    expect(naturalFrequency({ stiffness: 100, damping: 0 })).toBeCloseTo(10, 6);
  });

  it('returns sqrt(k/m) with explicit mass', () => {
    expect(naturalFrequency({ stiffness: 400, damping: 0, mass: 4 })).toBeCloseTo(10, 6);
  });

  it('is larger for stiffer springs', () => {
    const wn1 = naturalFrequency({ stiffness: 100, damping: 0 });
    const wn2 = naturalFrequency({ stiffness: 400, damping: 0 });
    expect(wn2).toBeGreaterThan(wn1);
  });
});

// ─── dampingRatio ────────────────────────────────────────────────────────────

describe('dampingRatio', () => {
  it('computes ζ = c / (2√(k·m))', () => {
    // k=100, m=1, c=20 → ζ = 20/(2*10) = 1.0
    expect(dampingRatio({ stiffness: 100, damping: 20, mass: 1 })).toBeCloseTo(1.0, 6);
  });

  it('underdamped when ζ < 1', () => {
    expect(dampingRatio(SPRING_PRESETS.bouncy)).toBeLessThan(1);
  });

  it('overdamped when ζ > 1', () => {
    expect(dampingRatio(SPRING_PRESETS.molasses)).toBeGreaterThan(1);
  });

  it('scales correctly with mass', () => {
    // k=100, c=20, m=4 → ζ = 20/(2*sqrt(400)) = 20/40 = 0.5
    expect(dampingRatio({ stiffness: 100, damping: 20, mass: 4 })).toBeCloseTo(0.5, 6);
  });
});

// ─── SPRING_PRESETS ───────────────────────────────────────────────────────────

describe('SPRING_PRESETS', () => {
  it('all presets have stiffness > 0 and damping ≥ 0', () => {
    for (const preset of Object.values(SPRING_PRESETS)) {
      expect(preset.stiffness).toBeGreaterThan(0);
      expect(preset.damping).toBeGreaterThanOrEqual(0);
    }
  });

  it('bouncy is underdamped', () => {
    expect(dampingRatio(SPRING_PRESETS.bouncy)).toBeLessThan(1);
  });

  it('molasses is overdamped', () => {
    expect(dampingRatio(SPRING_PRESETS.molasses)).toBeGreaterThan(1);
  });

  it('stiff has the highest natural frequency among mass-1 presets', () => {
    const wnStiff = naturalFrequency(SPRING_PRESETS.stiff);
    for (const [name, preset] of Object.entries(SPRING_PRESETS)) {
      if (name === 'stiff') continue;
      expect(wnStiff).toBeGreaterThan(naturalFrequency(preset));
    }
  });
});

// ─── createSpringAnimation — initial conditions ───────────────────────────────

describe('createSpringAnimation — initial conditions', () => {
  const config: SpringConfig = SPRING_PRESETS.gentle;

  it('valueAt(0) equals from', () => {
    const anim = createSpringAnimation(50, 100, 0, config);
    expect(anim.valueAt(0)).toBeCloseTo(50, 6);
  });

  it('velocityAt(0) equals initial velocity', () => {
    const anim = createSpringAnimation(50, 100, -5, config);
    expect(anim.velocityAt(0)).toBeCloseTo(-5, 6);
  });

  it('velocityAt(0) = 0 when no initial velocity', () => {
    const anim = createSpringAnimation(50, 100, 0, config);
    expect(anim.velocityAt(0)).toBeCloseTo(0, 6);
  });

  it('dampingRatio() matches scalar helper', () => {
    const anim = createSpringAnimation(0, 1, 0, config);
    expect(anim.dampingRatio()).toBeCloseTo(dampingRatio(config), 6);
  });

  it('naturalFrequency() matches scalar helper', () => {
    const anim = createSpringAnimation(0, 1, 0, config);
    expect(anim.naturalFrequency()).toBeCloseTo(naturalFrequency(config), 6);
  });
});

// ─── Underdamped regime ──────────────────────────────────────────────────────

describe('underdamped spring (ζ < 1)', () => {
  // bouncy: k=300, c=10, m=1 → ζ ≈ 0.289
  const config = SPRING_PRESETS.bouncy;
  const from = 0;
  const to = 100;
  const anim = createSpringAnimation(from, to, 0, config);

  it('converges to target at large t', () => {
    expect(anim.valueAt(10)).toBeCloseTo(to, 1);
  });

  it('oscillates: passes through target with nonzero velocity early on', () => {
    // Check that the spring overshoots (position > to at some point after t=0)
    let overshot = false;
    for (let t = 0.05; t < 2; t += 0.05) {
      if (anim.valueAt(t) > to) { overshot = true; break; }
    }
    expect(overshot).toBe(true);
  });

  it('velocity is negative (toward higher value) initially for from < to', () => {
    // Force is toward target → velocity becomes positive (increasing toward to)
    expect(anim.velocityAt(0.01)).toBeGreaterThan(0);
  });

  it('settlingTime() is a positive finite number', () => {
    const ts = anim.settlingTime();
    expect(ts).toBeGreaterThan(0);
    expect(Number.isFinite(ts)).toBe(true);
  });

  it('position stays within precision after settlingTime', () => {
    const prec = 0.1;
    const ts = anim.settlingTime(prec);
    // Sample a window after settling
    for (let t = ts; t < ts + 5; t += 0.2) {
      expect(Math.abs(anim.valueAt(t) - to)).toBeLessThan(prec);
    }
  });
});

// ─── Critically damped regime ────────────────────────────────────────────────

describe('critically damped spring (ζ = 1)', () => {
  // k=100, c=20, m=1 → ζ = 1 exactly
  const config: SpringConfig = { stiffness: 100, damping: 20, mass: 1 };
  const anim = createSpringAnimation(0, 100, 0, config);

  it('converges to target at large t', () => {
    expect(anim.valueAt(10)).toBeCloseTo(100, 1);
  });

  it('does NOT overshoot when v0=0 (monotonic approach)', () => {
    // No oscillation: position should increase monotonically from 0 to 100
    let prev = anim.valueAt(0);
    for (let t = 0.05; t < 5; t += 0.05) {
      const cur = anim.valueAt(t);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });

  it('dampingRatio is 1.0', () => {
    expect(anim.dampingRatio()).toBeCloseTo(1.0, 6);
  });

  it('settlingTime() is finite and positive', () => {
    const ts = anim.settlingTime();
    expect(ts).toBeGreaterThan(0);
    expect(Number.isFinite(ts)).toBe(true);
  });
});

// ─── Overdamped regime ───────────────────────────────────────────────────────

describe('overdamped spring (ζ > 1)', () => {
  // molasses: k=280, c=120, m=1 → ζ ≈ 3.58
  const config = SPRING_PRESETS.molasses;
  const anim = createSpringAnimation(0, 100, 0, config);

  it('converges to target at large t', () => {
    expect(anim.valueAt(20)).toBeCloseTo(100, 0);
  });

  it('does NOT overshoot (monotonic approach when v0=0)', () => {
    let prev = anim.valueAt(0);
    for (let t = 0.1; t < 10; t += 0.1) {
      const cur = anim.valueAt(t);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });

  it('settlingTime() is finite', () => {
    expect(Number.isFinite(anim.settlingTime())).toBe(true);
  });
});

// ─── Settles slower underdamped vs critically damped ─────────────────────────

describe('settling time ordering', () => {
  it('bouncy (ζ≈0.29) settles later than critical with same ωn', () => {
    // Critical config: c = 2*sqrt(k*m), same k, m=1
    const critDamping = 2 * Math.sqrt(SPRING_PRESETS.bouncy.stiffness);
    const critConfig: SpringConfig = { stiffness: SPRING_PRESETS.bouncy.stiffness, damping: critDamping, mass: 1 };

    const tsUnder = createSpringAnimation(0, 100, 0, SPRING_PRESETS.bouncy).settlingTime(0.5);
    const tsCrit  = createSpringAnimation(0, 100, 0, critConfig).settlingTime(0.5);
    expect(tsUnder).toBeGreaterThan(tsCrit);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('from === to: settlingTime returns 0', () => {
    const anim = createSpringAnimation(50, 50, 0, SPRING_PRESETS.gentle);
    expect(anim.settlingTime()).toBe(0);
  });

  it('large initial velocity away from target eventually settles', () => {
    const anim = createSpringAnimation(0, 100, -500, SPRING_PRESETS.stiff);
    expect(anim.valueAt(30)).toBeCloseTo(100, 0);
  });

  it('custom precision in settlingTime narrows the window', () => {
    const anim = createSpringAnimation(0, 100, 0, SPRING_PRESETS.gentle);
    const ts1 = anim.settlingTime(1.0);     // loose
    const ts2 = anim.settlingTime(0.01);    // tight
    expect(ts2).toBeGreaterThanOrEqual(ts1);
  });

  it('negative displacement (from > to) mirrors positive case', () => {
    const animFwd = createSpringAnimation(0, 100, 0, SPRING_PRESETS.gentle);
    const animRev = createSpringAnimation(100, 0, 0, SPRING_PRESETS.gentle);
    // At same t, displacement should be equal in magnitude
    const t = 0.3;
    expect(Math.abs(animFwd.valueAt(t) - 100)).toBeCloseTo(
      Math.abs(animRev.valueAt(t) - 0), 4
    );
  });
});

// ─── springStep ───────────────────────────────────────────────────────────────

describe('springStep', () => {
  const config = SPRING_PRESETS.gentle;
  const target = 100;
  const DT = 1 / 60;

  it('moves position toward target after one step', () => {
    const s0: SpringState = { position: 0, velocity: 0 };
    const s1 = springStep(s0, target, DT, config);
    expect(s1.position).toBeGreaterThan(s0.position);
  });

  it('converges to target after 600 steps (10s at 60fps)', () => {
    const final = simulate(0, target, config, 600, DT);
    expect(Math.abs(final.position - target)).toBeLessThan(0.1);
  });

  it('velocity is zero after convergence', () => {
    const final = simulate(0, target, config, 600, DT);
    expect(Math.abs(final.velocity)).toBeLessThan(0.1);
  });

  it('does not diverge for stiff spring', () => {
    const final = simulate(0, target, SPRING_PRESETS.stiff, 600, DT);
    expect(Math.abs(final.position - target)).toBeLessThan(0.01);
  });

  it('handles from > to (negative displacement)', () => {
    const final = simulate(200, 0, config, 600, DT);
    expect(Math.abs(final.position)).toBeLessThan(0.1);
  });
});

// ─── isAtRest ─────────────────────────────────────────────────────────────────

describe('isAtRest', () => {
  const config = SPRING_PRESETS.gentle;
  const target = 100;

  it('returns false when far from target', () => {
    const s: SpringState = { position: 0, velocity: 0 };
    expect(isAtRest(s, target, config)).toBe(false);
  });

  it('returns false when close but moving fast', () => {
    const s: SpringState = { position: 99.999, velocity: 5 };
    expect(isAtRest(s, target, config)).toBe(false);
  });

  it('returns true when within precision and slow', () => {
    const s: SpringState = { position: 100.0005, velocity: 0.0005 };
    expect(isAtRest(s, target, config)).toBe(true);
  });

  it('respects custom precision in config', () => {
    const tightConfig: SpringConfig = { ...config, precision: 0.0001 };
    const s: SpringState = { position: 99.9998, velocity: 0.00005 };
    expect(isAtRest(s, target, tightConfig)).toBe(false);
  });

  it('becomes true after sufficient simulation steps', () => {
    const DT = 1 / 60;
    let state: SpringState = { position: 0, velocity: 0 };
    let settled = false;
    for (let i = 0; i < 1200; i++) {
      state = springStep(state, target, DT, config);
      if (isAtRest(state, target, config)) { settled = true; break; }
    }
    expect(settled).toBe(true);
  });
});
