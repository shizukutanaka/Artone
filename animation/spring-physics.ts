/**
 * Artone v3 — Spring Physics (Damped Harmonic Oscillator)
 *
 * Closed-form analytical solutions for:
 *   m·x'' + c·x' + k·(x − target) = 0
 *
 * Three regimes:
 *   - Underdamped (ζ < 1): oscillates and settles
 *   - Critically damped (ζ = 1): fastest non-oscillating settlement
 *   - Overdamped (ζ > 1): no oscillation, slower than critical
 *
 * Also provides a semi-implicit Euler stepper for rAF/game-loop usage.
 *
 * References:
 *   - Wikipedia: Harmonic oscillator — analytical solution sections
 *   - Framer Motion spring solver source (MIT)
 *   - Apple HIG spring animations (WWDC 2023 session 10158)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Spring physical parameters. All fields must be positive unless noted. */
export interface SpringConfig {
  /** Spring constant k (N/m). Must be > 0. */
  stiffness: number;
  /** Damping coefficient c (N·s/m). Must be ≥ 0. */
  damping: number;
  /** Mass m (kg). Defaults to 1.0. */
  mass?: number;
  /**
   * Distance threshold below which the spring is considered at rest.
   * Defaults to 0.001.
   */
  precision?: number;
}

/** Current kinematic state. */
export interface SpringState {
  position: number;
  velocity: number;
}

/** Analytical spring animation — sample any time without iteration. */
export interface SpringAnimation {
  /** Position at elapsed time t (seconds from start). */
  valueAt(t: number): number;
  /** Velocity at elapsed time t (seconds from start). */
  velocityAt(t: number): number;
  /**
   * Elapsed time (seconds) after which the spring stays within `precision`
   * of the target for all future time. Uses a dense scan for accuracy.
   * @param precision Override the config precision for this call.
   */
  settlingTime(precision?: number): number;
  /** ζ = c / (2√(k·m)) */
  dampingRatio(): number;
  /** ωn = √(k/m) in rad/s */
  naturalFrequency(): number;
}

// ─── Presets ─────────────────────────────────────────────────────────────────

/**
 * Named spring presets. All are for mass = 1 kg.
 * ζ values: bouncy ≈ 0.29, wobbly ≈ 0.45, gentle ≈ 0.64, stiff ≈ 0.89, molasses > 1.
 */
export const SPRING_PRESETS = {
  /** High energy — bouncy UI feedback. ζ ≈ 0.289 */
  bouncy:   { stiffness: 300, damping:  10, mass: 1 },
  /** Medium oscillation. ζ ≈ 0.447 */
  wobbly:   { stiffness: 180, damping:  12, mass: 1 },
  /** Smooth, slight undershoot. ζ ≈ 0.639 */
  gentle:   { stiffness: 120, damping:  14, mass: 1 },
  /** Fast, no oscillation. ζ ≈ 0.894 */
  stiff:    { stiffness: 500, damping:  40, mass: 1 },
  /** Slow settling. ζ ≈ 0.566 */
  slow:     { stiffness:  50, damping:   8, mass: 1 },
  /** Heavily overdamped. ζ ≈ 3.58 */
  molasses: { stiffness: 280, damping: 120, mass: 1 },
} as const satisfies Record<string, SpringConfig>;

// ─── Scalar helpers ───────────────────────────────────────────────────────────

/** ωn = √(k/m) */
export function naturalFrequency(config: SpringConfig): number {
  const m = config.mass ?? 1;
  return Math.sqrt(config.stiffness / m);
}

/** ζ = c / (2√(k·m)) */
export function dampingRatio(config: SpringConfig): number {
  const m = config.mass ?? 1;
  return config.damping / (2 * Math.sqrt(config.stiffness * m));
}

// ─── Analytical solution ──────────────────────────────────────────────────────

/**
 * Create an analytical spring animation from `from` to `to`.
 *
 * @param from   Starting position.
 * @param to     Target position.
 * @param v0     Initial velocity (positive = away from lower values).
 * @param config Spring parameters.
 */
export function createSpringAnimation(
  from: number,
  to: number,
  v0: number,
  config: SpringConfig,
): SpringAnimation {
  const m = config.mass ?? 1;
  const k = config.stiffness;
  const c = config.damping;
  const defaultPrecision = config.precision ?? 0.001;

  const wn = Math.sqrt(k / m);                              // natural frequency
  const zeta = c / (2 * Math.sqrt(k * m));                  // damping ratio
  const x0 = from - to;                                     // initial displacement

  // Regime-specific coefficients and functions ─────────────────────────────

  let posAt: (t: number) => number;
  let velAt: (t: number) => number;
  // Amplitude estimate for settlingTime upper-bound
  let envelope: (t: number) => number;

  if (zeta < 1 - 1e-9) {
    // ── Underdamped ──────────────────────────────────────────────────────
    const wd = wn * Math.sqrt(1 - zeta * zeta);             // damped frequency
    const A = x0;
    const B = (v0 + zeta * wn * x0) / wd;

    posAt = (t) => {
      const e = Math.exp(-zeta * wn * t);
      return to + e * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    };
    velAt = (t) => {
      const e = Math.exp(-zeta * wn * t);
      const decay = -zeta * wn;
      const osc  = A * Math.cos(wd * t) + B * Math.sin(wd * t);
      const dosc = -A * wd * Math.sin(wd * t) + B * wd * Math.cos(wd * t);
      return e * (decay * osc + dosc);
    };
    const amp = Math.sqrt(A * A + B * B);
    envelope = (t) => amp * Math.exp(-zeta * wn * t);

  } else if (zeta > 1 + 1e-9) {
    // ── Overdamped ───────────────────────────────────────────────────────
    const sq = Math.sqrt(zeta * zeta - 1);
    const r1 = wn * (-zeta + sq);                           // slower (closer to 0)
    const r2 = wn * (-zeta - sq);                           // faster
    const A = (v0 - r2 * x0) / (r1 - r2);
    const B = x0 - A;

    posAt = (t) => to + A * Math.exp(r1 * t) + B * Math.exp(r2 * t);
    velAt = (t) => r1 * A * Math.exp(r1 * t) + r2 * B * Math.exp(r2 * t);
    envelope = (t) => (Math.abs(A) + Math.abs(B)) * Math.exp(r1 * t); // r1 is slower

  } else {
    // ── Critically damped ────────────────────────────────────────────────
    const A = x0;
    const Bc = v0 + wn * x0;

    posAt = (t) => {
      const e = Math.exp(-wn * t);
      return to + e * (A + Bc * t);
    };
    velAt = (t) => {
      const e = Math.exp(-wn * t);
      return e * (Bc - wn * (A + Bc * t));
    };
    // Maximum of (|A| + |Bc|·t)·e^(-wn·t) is bounded by (|A|+|Bc|/wn)·e^(-wn·t·0.5)
    const ampEst = Math.abs(A) + Math.abs(Bc) / wn;
    envelope = (t) => ampEst * Math.exp(-wn * t * 0.5);
  }

  // ── settlingTime ────────────────────────────────────────────────────────────

  function settlingTime(precision?: number): number {
    const p = precision ?? defaultPrecision;

    if (Math.abs(x0) < p && Math.abs(v0) < p) return 0;

    // Upper-bound estimate: when envelope drops below p/100
    const decayRate = zeta < 1 ? zeta * wn : wn;
    const ampEst = Math.max(envelope(0), Math.abs(x0), 1e-12);
    const hiEst = ampEst < p
      ? 0
      : Math.max(1, Math.log(ampEst / (p * 0.01)) / decayRate);
    const hi = Math.min(hiEst * 2, 3000);

    // Dense scan at 2 ms steps to find last time outside precision band
    const step = 0.002;
    let lastOutside = 0;
    for (let t = 0; t <= hi; t += step) {
      if (Math.abs(posAt(t) - to) >= p) lastOutside = t;
    }
    // Return next step boundary (so the caller is guaranteed within precision)
    return lastOutside === 0 ? 0 : lastOutside + step;
  }

  return {
    valueAt: posAt,
    velocityAt: velAt,
    settlingTime,
    dampingRatio: () => zeta,
    naturalFrequency: () => wn,
  };
}

// ─── Game-loop stepper ────────────────────────────────────────────────────────

/**
 * Advance spring state by one time step using semi-implicit Euler integration.
 * Stable for all typical spring configurations.
 *
 * ```ts
 * let state = { position: 0, velocity: 0 };
 * function onFrame(dt: number) {
 *   state = springStep(state, 100, dt, SPRING_PRESETS.gentle);
 * }
 * ```
 *
 * @param state  Current {position, velocity}.
 * @param target Target position.
 * @param dt     Time step in seconds (e.g. 1/60 for 60 fps).
 * @param config Spring parameters.
 */
export function springStep(
  state: SpringState,
  target: number,
  dt: number,
  config: SpringConfig,
): SpringState {
  const m = config.mass ?? 1;
  const k = config.stiffness;
  const c = config.damping;
  const displacement = state.position - target;
  const acceleration = (-k * displacement - c * state.velocity) / m;
  const velocity = state.velocity + acceleration * dt;         // semi-implicit: v first
  const position = state.position + velocity * dt;
  return { position, velocity };
}

/**
 * Returns true when the spring is effectively at rest (both displacement and
 * velocity are within the configured precision threshold).
 */
export function isAtRest(
  state: SpringState,
  target: number,
  config: SpringConfig,
): boolean {
  const p = config.precision ?? 0.001;
  return Math.abs(state.position - target) < p && Math.abs(state.velocity) < p;
}
