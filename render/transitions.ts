/**
 * Artone v3 — Clip Transitions
 *
 * Pure two-frame transition generators: given frame A (outgoing) and frame B
 * (incoming) plus progress t ∈ [0, 1], produce the composited frame. Every NLE
 * ships these (Premiere "Cross Dissolve"/"Wipe"/"Push/Slide", DaVinci, CapCut);
 * Artone had only an internal dissolve in the grading engine.
 *
 * Implemented transitions:
 *   - `crossDissolve`  — linear A→B blend.
 *   - `dipToColor`     — A fades to a color (first half) then color fades to B.
 *   - `wipe`           — hard or soft-edged directional wipe (L/R/U/D).
 *   - `slide`          — B slides in over A from a direction.
 *   - `push`           — A and B move together (B pushes A out).
 *   - `radialWipe`     — clock-style angular wipe.
 *   - `irisWipe`       — circular iris open/close from center.
 *
 * All operate on RGBA `Uint8ClampedArray` of identical dimensions and return a
 * new opaque RGBA frame. An easing function may be supplied to shape `t`.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Direction for wipe / slide / push. */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

/** A transition that combines two frames at progress t. */
export type TransitionFn = (
  a:      Uint8ClampedArray | Uint8Array,
  b:      Uint8ClampedArray | Uint8Array,
  width:  number,
  height: number,
  t:      number,
) => Uint8ClampedArray;

/** Easing function mapping t∈[0,1] → eased t∈[0,1]. */
export type EaseFn = (t: number) => number;

// ─── Easing ───────────────────────────────────────────────────────────────────

/** Linear (identity) easing. */
export const easeLinear: EaseFn = (t) => t;
/** Smoothstep ease-in-out. */
export const easeInOut: EaseFn = (t) => t * t * (3 - 2 * t);
/** Quadratic ease-in. */
export const easeIn: EaseFn = (t) => t * t;
/** Quadratic ease-out. */
export const easeOut: EaseFn = (t) => 1 - (1 - t) * (1 - t);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp t to [0, 1]. */
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Clamp to 8-bit. */
function clamp8(x: number): number {
  const r = Math.round(x);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** Copy a source pixel into dst at offset (RGB + opaque alpha). */
function copyPixel(
  dst: Uint8ClampedArray, dOff: number,
  src: Uint8ClampedArray | Uint8Array, sOff: number,
): void {
  dst[dOff] = src[sOff]; dst[dOff + 1] = src[sOff + 1];
  dst[dOff + 2] = src[sOff + 2]; dst[dOff + 3] = 255;
}

/**
 * Return `buf` when it is large enough for `width × height × 4` bytes;
 * otherwise allocate a fresh `Uint8ClampedArray`. Callers in the render loop
 * should pass a pre-allocated buffer to avoid per-frame GC pressure.
 */
function mkFrame(width: number, height: number, buf?: Uint8ClampedArray): Uint8ClampedArray {
  const n = width * height * 4;
  return (buf && buf.length >= n) ? buf : new Uint8ClampedArray(n);
}

// ─── Cross dissolve ───────────────────────────────────────────────────────────

/**
 * Linear cross-dissolve between A and B.
 *
 * `out = A·(1−t) + B·t` per channel.
 *
 * @param a       Outgoing frame.
 * @param b       Incoming frame.
 * @param width   Frame width.
 * @param height  Frame height.
 * @param t       Progress in [0, 1].
 * @returns       Blended frame.
 */
export function crossDissolve(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const it = 1 - tt;
  const out = mkFrame(width, height, outBuf);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    out[off]     = clamp8(a[off]     * it + b[off]     * tt);
    out[off + 1] = clamp8(a[off + 1] * it + b[off + 1] * tt);
    out[off + 2] = clamp8(a[off + 2] * it + b[off + 2] * tt);
    out[off + 3] = 255;
  }
  return out;
}

/**
 * Dip-to-color transition: A fades to `color` over the first half, then `color`
 * fades to B over the second half (classic "dip to black/white").
 *
 * @param a       Outgoing frame.
 * @param b       Incoming frame.
 * @param width   Frame width.
 * @param height  Frame height.
 * @param t       Progress in [0, 1].
 * @param color   Dip color [r, g, b]. Default: black.
 * @returns       Blended frame.
 */
export function dipToColor(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  color: [number, number, number] = [0, 0, 0],
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const out = mkFrame(width, height, outBuf);
  const n = width * height;
  if (tt < 0.5) {
    // A → color, blend factor 0..1 across first half
    const f = tt * 2;
    const inv = 1 - f;
    for (let i = 0; i < n; i++) {
      const off = i * 4;
      out[off]     = clamp8(a[off]     * inv + color[0] * f);
      out[off + 1] = clamp8(a[off + 1] * inv + color[1] * f);
      out[off + 2] = clamp8(a[off + 2] * inv + color[2] * f);
      out[off + 3] = 255;
    }
  } else {
    // color → B
    const f = (tt - 0.5) * 2;
    const inv = 1 - f;
    for (let i = 0; i < n; i++) {
      const off = i * 4;
      out[off]     = clamp8(color[0] * inv + b[off]     * f);
      out[off + 1] = clamp8(color[1] * inv + b[off + 1] * f);
      out[off + 2] = clamp8(color[2] * inv + b[off + 2] * f);
      out[off + 3] = 255;
    }
  }
  return out;
}

// ─── Wipe ─────────────────────────────────────────────────────────────────────

/**
 * Directional wipe: B is revealed from one side as a moving boundary sweeps
 * across the frame. A `softness` band cross-dissolves at the boundary.
 *
 * @param a          Outgoing frame.
 * @param b          Incoming frame.
 * @param width      Frame width.
 * @param height     Frame height.
 * @param t          Progress in [0, 1].
 * @param direction  Wipe direction. Default: 'left' (boundary moves rightward,
 *                   revealing B from the left).
 * @param softness   Soft-edge band as a fraction of the axis (0..1). Default: 0.
 * @returns          Wiped frame.
 */
export function wipe(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  direction: TransitionDirection = 'left',
  softness = 0,
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const out = mkFrame(width, height, outBuf);
  const soft = Math.max(0, softness);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Position along the wipe axis, normalized to the open interval (0,1)
      // using pixel centers so t=0 reveals nothing and t=1 reveals everything.
      let pos: number;
      switch (direction) {
        case 'left':  pos = (x + 0.5) / width;      break;
        case 'right': pos = 1 - (x + 0.5) / width;  break;
        case 'up':    pos = (y + 0.5) / height;     break;
        case 'down':  pos = 1 - (y + 0.5) / height; break;
      }
      // B shows where pos < t. Soft band of width `soft` around the boundary.
      let bWeight: number;
      if (soft <= 0) {
        bWeight = pos < tt ? 1 : 0;
      } else {
        bWeight = clamp01((tt - pos) / soft + 0.5);
      }
      const off = (y * width + x) * 4;
      if (bWeight >= 1) {
        copyPixel(out, off, b, off);
      } else if (bWeight <= 0) {
        copyPixel(out, off, a, off);
      } else {
        const ia = 1 - bWeight;
        out[off]     = clamp8(a[off]     * ia + b[off]     * bWeight);
        out[off + 1] = clamp8(a[off + 1] * ia + b[off + 1] * bWeight);
        out[off + 2] = clamp8(a[off + 2] * ia + b[off + 2] * bWeight);
        out[off + 3] = 255;
      }
    }
  }
  return out;
}

// ─── Slide & Push ─────────────────────────────────────────────────────────────

/**
 * Slide: B slides in over a stationary A from `direction`.
 *
 * @param a          Outgoing frame (stays put).
 * @param b          Incoming frame (slides in).
 * @param width      Frame width.
 * @param height     Frame height.
 * @param t          Progress in [0, 1].
 * @param direction  Direction B enters FROM. Default: 'left'.
 * @returns          Composited frame.
 */
export function slide(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  direction: TransitionDirection = 'left',
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const out = mkFrame(width, height, outBuf);
  // Offset of B in pixels
  const dx = direction === 'left' ? -Math.round((1 - tt) * width)
           : direction === 'right' ? Math.round((1 - tt) * width)
           : 0;
  const dy = direction === 'up' ? -Math.round((1 - tt) * height)
           : direction === 'down' ? Math.round((1 - tt) * height)
           : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      // Sample B at (x - dx, y - dy); if inside, use B else A
      const bx = x - dx;
      const by = y - dy;
      if (bx >= 0 && bx < width && by >= 0 && by < height) {
        copyPixel(out, off, b, (by * width + bx) * 4);
      } else {
        copyPixel(out, off, a, off);
      }
    }
  }
  return out;
}

/**
 * Push: A is pushed out while B pushes in (both move together).
 *
 * @param a          Outgoing frame (pushed out).
 * @param b          Incoming frame (pushes in).
 * @param width      Frame width.
 * @param height     Frame height.
 * @param t          Progress in [0, 1].
 * @param direction  Direction B enters FROM. Default: 'left'.
 * @returns          Composited frame.
 */
export function push(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  direction: TransitionDirection = 'left',
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const out = mkFrame(width, height, outBuf);

  // Displacement of A; B sits adjacent to A.
  const aDx = direction === 'left' ? Math.round(tt * width)
            : direction === 'right' ? -Math.round(tt * width)
            : 0;
  const aDy = direction === 'up' ? Math.round(tt * height)
            : direction === 'down' ? -Math.round(tt * height)
            : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      const ax = x - aDx, ay = y - aDy;
      if (ax >= 0 && ax < width && ay >= 0 && ay < height) {
        copyPixel(out, off, a, (ay * width + ax) * 4);
      } else {
        // B fills where A has moved out; B is offset by A's displacement − full extent
        let bx = x - aDx, by = y - aDy;
        if (direction === 'left')  bx += width;
        if (direction === 'right') bx -= width;
        if (direction === 'up')    by += height;
        if (direction === 'down')  by -= height;
        if (bx >= 0 && bx < width && by >= 0 && by < height) {
          copyPixel(out, off, b, (by * width + bx) * 4);
        } else {
          copyPixel(out, off, b, off); // fallback
        }
      }
    }
  }
  return out;
}

// ─── Radial & Iris ────────────────────────────────────────────────────────────

/**
 * Radial (clock) wipe: B is revealed by a sweeping angular boundary from the
 * top, clockwise.
 *
 * @param a       Outgoing frame.
 * @param b       Incoming frame.
 * @param width   Frame width.
 * @param height  Frame height.
 * @param t       Progress in [0, 1].
 * @returns       Composited frame.
 */
export function radialWipe(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const out = mkFrame(width, height, outBuf);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const sweep = tt * Math.PI * 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Angle from top (12 o'clock), clockwise, in [0, 2π)
      let ang = Math.atan2(x - cx, -(y - cy)); // 0 at top, + clockwise
      if (ang < 0) ang += Math.PI * 2;
      const off = (y * width + x) * 4;
      copyPixel(out, off, ang <= sweep ? b : a, off);
    }
  }
  return out;
}

/**
 * Iris wipe: a circle from the center grows (B revealed inside) as t increases.
 *
 * @param a         Outgoing frame.
 * @param b         Incoming frame.
 * @param width     Frame width.
 * @param height    Frame height.
 * @param t         Progress in [0, 1].
 * @param softness  Soft edge band in pixels. Default: 0.
 * @returns         Composited frame.
 */
export function irisWipe(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  width: number, height: number, t: number,
  softness = 0,
  outBuf?: Uint8ClampedArray,
): Uint8ClampedArray {
  const tt = clamp01(t);
  const out = mkFrame(width, height, outBuf);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  const radius = tt * maxR;
  const soft = Math.max(0, softness);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const off = (y * width + x) * 4;
      let bWeight: number;
      if (soft <= 0) {
        bWeight = d <= radius ? 1 : 0;
      } else {
        bWeight = clamp01((radius - d) / soft + 0.5);
      }
      if (bWeight >= 1) {
        copyPixel(out, off, b, off);
      } else if (bWeight <= 0) {
        copyPixel(out, off, a, off);
      } else {
        const ia = 1 - bWeight;
        out[off]     = clamp8(a[off]     * ia + b[off]     * bWeight);
        out[off + 1] = clamp8(a[off + 1] * ia + b[off + 1] * bWeight);
        out[off + 2] = clamp8(a[off + 2] * ia + b[off + 2] * bWeight);
        out[off + 3] = 255;
      }
    }
  }
  return out;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Named transition kinds for UI selection. */
export type TransitionKind =
  | 'cross-dissolve' | 'dip-to-black' | 'dip-to-white'
  | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down'
  | 'slide-left' | 'slide-right' | 'push-left' | 'push-right'
  | 'radial' | 'iris';

// Module-level color constants avoid per-frame array literal allocation.
const _BLACK: [number, number, number] = [0, 0, 0];
const _WHITE: [number, number, number] = [255, 255, 255];

/**
 * Resolve a named transition to a TransitionFn with an optional eased `t`.
 *
 * The returned function re-uses a single output buffer across calls (lazy-grow
 * on dimension change), eliminating the per-frame `new Uint8ClampedArray` that
 * would otherwise pressure the GC inside the render loop.
 *
 * @param kind  The transition kind.
 * @param ease  Optional easing applied to `t`. Default: linear.
 * @returns     A TransitionFn.
 */
export function getTransition(kind: TransitionKind, ease: EaseFn = easeLinear): TransitionFn {
  let outBuf: Uint8ClampedArray | undefined;
  return (a, b, w, h, t) => {
    const e = ease(clamp01(t));
    switch (kind) {
      case 'cross-dissolve': outBuf = crossDissolve(a, b, w, h, e, outBuf); break;
      case 'dip-to-black':   outBuf = dipToColor(a, b, w, h, e, _BLACK, outBuf); break;
      case 'dip-to-white':   outBuf = dipToColor(a, b, w, h, e, _WHITE, outBuf); break;
      case 'wipe-left':      outBuf = wipe(a, b, w, h, e, 'left',  0, outBuf); break;
      case 'wipe-right':     outBuf = wipe(a, b, w, h, e, 'right', 0, outBuf); break;
      case 'wipe-up':        outBuf = wipe(a, b, w, h, e, 'up',    0, outBuf); break;
      case 'wipe-down':      outBuf = wipe(a, b, w, h, e, 'down',  0, outBuf); break;
      case 'slide-left':     outBuf = slide(a, b, w, h, e, 'left',  outBuf); break;
      case 'slide-right':    outBuf = slide(a, b, w, h, e, 'right', outBuf); break;
      case 'push-left':      outBuf = push(a, b, w, h, e, 'left',  outBuf); break;
      case 'push-right':     outBuf = push(a, b, w, h, e, 'right', outBuf); break;
      case 'radial':         outBuf = radialWipe(a, b, w, h, e, outBuf); break;
      case 'iris':           outBuf = irisWipe(a, b, w, h, e, 0, outBuf); break;
    }
    return outBuf!;
  };
}
