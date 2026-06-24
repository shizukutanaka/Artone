/**
 * 3D LUT trilinear interpolation + 1D tone-curve application
 *
 * Pure TypeScript — no DOM, WebGPU, or OffscreenCanvas needed.
 * The GPU path (WGSL compute, G7) will replace the inner pixel loop;
 * this module provides the reference CPU implementation and the
 * mathematically correct LUT sampling used for testing.
 *
 * References:
 *   - ICC.1:2022 — interpolation in device link tables (trilinear)
 *   - Colour & Vision Research Lab: "The CUBE LUT Specification 1.0"
 *   - Monotone cubic interpolation: Fritsch-Carlson (1980)
 */

// ============================================================
// Types (mirrors color/grading-engine.ts, avoids circular import)
// ============================================================

export interface LUTData {
  name: string;
  /** LUT edge size N: the table contains N³ entries. */
  size: number;
  /**
   * Flat Float32Array of N³ × 3 values (R,G,B interleaved).
   * Index: (b * N * N + g * N + r) * 3
   */
  data: Float32Array;
}

export interface CurvePoint {
  x: number; // input  [0, 1]
  y: number; // output [0, 1]
}

// ============================================================
// 3D LUT — trilinear interpolation
// ============================================================

/**
 * Trilinear-samples a 3D LUT, writing the result into `out` (length ≥ 3).
 *
 * The allocation-free core shared by {@link sampleLUT} and
 * {@link applyLUTToBuffer}. The earlier implementation allocated 16 tiny
 * arrays per sample (8 corner reads + 7 lerps + the return), which on a 4K
 * frame meant ~125M short-lived arrays per LUT pass — crippling GC pressure on
 * the CPU grading fallback. This computes every corner and axis blend with
 * scalar locals and a single shared base-index calculation instead.
 *
 * Math is identical to the previous version: `a + (b - a) * t` lerps, applied
 * along R, then G, then B.
 */
function trilinear(data: Float32Array, N: number, r: number, g: number, b: number, out: number[]): void {
  const scale = N - 1;
  const ri = Math.min(Math.max(r * scale, 0), scale);
  const gi = Math.min(Math.max(g * scale, 0), scale);
  const bi = Math.min(Math.max(b * scale, 0), scale);

  const r0 = Math.floor(ri);
  const g0 = Math.floor(gi);
  const b0 = Math.floor(bi);
  const r1 = Math.min(r0 + 1, scale);
  const g1 = Math.min(g0 + 1, scale);
  const b1 = Math.min(b0 + 1, scale);

  const dr = ri - r0;
  const dg = gi - g0;
  const db = bi - b0;

  const N2 = N * N;
  // 8 corner base offsets (×3 RGB stride); the channel is added per component.
  const o000 = (b0 * N2 + g0 * N + r0) * 3;
  const o100 = (b0 * N2 + g0 * N + r1) * 3;
  const o010 = (b0 * N2 + g1 * N + r0) * 3;
  const o110 = (b0 * N2 + g1 * N + r1) * 3;
  const o001 = (b1 * N2 + g0 * N + r0) * 3;
  const o101 = (b1 * N2 + g0 * N + r1) * 3;
  const o011 = (b1 * N2 + g1 * N + r0) * 3;
  const o111 = (b1 * N2 + g1 * N + r1) * 3;

  for (let c = 0; c < 3; c++) {
    // R axis
    const c00 = data[o000 + c] + (data[o100 + c] - data[o000 + c]) * dr;
    const c10 = data[o010 + c] + (data[o110 + c] - data[o010 + c]) * dr;
    const c01 = data[o001 + c] + (data[o101 + c] - data[o001 + c]) * dr;
    const c11 = data[o011 + c] + (data[o111 + c] - data[o011 + c]) * dr;
    // G axis
    const c0 = c00 + (c10 - c00) * dg;
    const c1 = c01 + (c11 - c01) * dg;
    // B axis
    out[c] = c0 + (c1 - c0) * db;
  }
}

/**
 * Samples a 3D LUT using trilinear interpolation.
 * Input r/g/b are in [0, 1]. Returns [r, g, b] in [0, 1].
 */
export function sampleLUT(lut: LUTData, r: number, g: number, b: number): [number, number, number] {
  const N = lut.size;
  if (N < 2) return [r, g, b];
  const out: [number, number, number] = [0, 0, 0];
  trilinear(lut.data, N, r, g, b, out);
  return out;
}

/**
 * Applies a 3D LUT to a pixel buffer in-place (RGBA byte order).
 * Alpha channel is preserved.
 */
export function applyLUTToBuffer(data: Uint8ClampedArray, lut: LUTData): void {
  const N = lut.size;
  if (N < 2) return; // degenerate LUT → identity (leave pixels untouched)

  const lutData = lut.data;
  // One reusable scratch tuple for the whole buffer — no per-pixel allocation.
  const px: number[] = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    trilinear(lutData, N, data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, px);
    data[i]     = Math.round(Math.max(0, Math.min(1, px[0])) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, px[1])) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, px[2])) * 255);
  }
}

// ============================================================
// 1D Tone Curves — monotone cubic spline (Fritsch-Carlson 1980)
// ============================================================

/**
 * Builds a monotone cubic interpolant from sorted control points.
 * Returns a function mapping x → y (both in [0, 1]).
 * Falls back to linear interpolation for < 3 points.
 */
export function buildCurve(points: CurvePoint[]): (x: number) => number {
  if (points.length === 0) return (x) => x;
  if (points.length === 1) return () => points[0].y;

  // Sort by x ascending, deduplicate
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n === 2) {
    // Linear
    const { x: x0, y: y0 } = pts[0];
    const { x: x1, y: y1 } = pts[1];
    const slope = x1 !== x0 ? (y1 - y0) / (x1 - x0) : 0;
    return (x) => {
      if (x <= x0) return y0;
      if (x >= x1) return y1;
      return y0 + slope * (x - x0);
    };
  }

  // Compute finite differences
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    delta.push(dx !== 0 ? (pts[i + 1].y - pts[i].y) / dx : 0);
  }

  // Initialize tangents (average of adjacent slopes)
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = (delta[i - 1] + delta[i]) / 2;
  }

  // Fritsch-Carlson monotonicity constraints
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-12) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / delta[i];
    const beta = m[i + 1] / delta[i];
    const tau = alpha * alpha + beta * beta;
    if (tau > 9) {
      const scale = 3 / Math.sqrt(tau);
      m[i]     = scale * alpha * delta[i];
      m[i + 1] = scale * beta  * delta[i];
    }
  }

  return (x: number): number => {
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[n - 1].x) return pts[n - 1].y;

    // Binary search for interval
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid + 1].x < x) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    const h = pts[i + 1].x - pts[i].x;
    const t = h !== 0 ? (x - pts[i].x) / h : 0;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis
    const h00 =  2 * t3 - 3 * t2 + 1;
    const h10 =      t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 =      t3 -     t2;

    return h00 * pts[i].y + h10 * h * m[i] + h01 * pts[i + 1].y + h11 * h * m[i + 1];
  };
}

/**
 * Applies per-channel and master curves to a pixel buffer in-place (RGBA byte order).
 * Each curve maps [0,1]→[0,1]. Pass identity points to skip a channel.
 */
export function applyCurvesToBuffer(
  data: Uint8ClampedArray,
  curves: {
    master: (x: number) => number;
    red:    (x: number) => number;
    green:  (x: number) => number;
    blue:   (x: number) => number;
  }
): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const mr = curves.master(r);
    const mg = curves.master(g);
    const mb = curves.master(b);

    data[i]     = Math.round(Math.max(0, Math.min(1, curves.red(mr)))   * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, curves.green(mg))) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, curves.blue(mb)))  * 255);
  }
}

// ============================================================
// Convenience: parse a .cube file text → LUTData (browser-free)
// ============================================================

/**
 * Parses a .cube LUT file string into LUTData.
 * Handles TITLE, LUT_3D_SIZE, and float data lines.
 * Throws for missing or invalid headers.
 */
export function parseCubeLUT(text: string): LUTData {
  const lines = text.split(/\r?\n/);
  let name = 'Unknown';
  let size = 0;
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) {
      name = line.slice('TITLE'.length).trim().replace(/^["']|["']$/g, '');
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1] ?? '0', 10);
      continue;
    }
    // Ignore 1D-only headers
    if (line.startsWith('LUT_1D_SIZE') || line.startsWith('DOMAIN_')) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        values.push(r, g, b);
      }
    }
  }

  if (size < 2) throw new Error('Missing or invalid LUT_3D_SIZE in .cube file');
  const expected = size * size * size * 3;
  if (values.length < expected) {
    throw new Error(`LUT data too short: got ${values.length / 3} entries, expected ${size ** 3}`);
  }

  return { name, size, data: new Float32Array(values.slice(0, expected)) };
}
