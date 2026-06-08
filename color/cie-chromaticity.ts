/**
 * Artone v3 — CIE 1931 xy Chromaticity
 *
 * Pure-function utilities for the CIE 1931 two-degree observer color model:
 *
 *   - XYZ → xy chromaticity conversion
 *   - sRGB / linear-RGB → xy (via the standard D65 XYZ matrix)
 *   - Standard illuminant reference points (D50, D65, D75, A, E)
 *   - Color gamut primary triangles (sRGB, Rec.2020, DCI-P3, ACES AP0/AP1)
 *   - Planckian (blackbody) locus — Kim et al. (2002) polynomial approximation
 *   - Daylight locus
 *   - Correlated Color Temperature (CCT) estimation — McCamy (1992)
 *   - Vectorscope-style buffer sampling
 *
 * References:
 *   - CIE Publication 15:2004 (colorimetry)
 *   - IEC 61966-2-1:1999 (sRGB)
 *   - Kim et al. (2002) "Design of Advanced Color: Temperature Control System"
 *   - McCamy (1992) "Correlated color temperature of a sample of illuminants"
 *   - SMPTE ST 431-2:2011 (DCI-P3)
 *   - ITU-R BT.2020 (Rec. 2020)
 *   - Academy S-2014-006 (ACES AP0 / AP1)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** CIE 1931 xy chromaticity coordinate pair. */
export interface Chromaticity {
  x: number;
  y: number;
}

/** Chromaticity coordinate with an optional human-readable label. */
export interface ChromaticityPoint extends Chromaticity {
  label?: string;
}

/** Primary triangle defining a color gamut in xy space. */
export interface GamutPrimaries {
  r: Chromaticity;
  g: Chromaticity;
  b: Chromaticity;
  white: Chromaticity;
}

// ─── XYZ ↔ xy ─────────────────────────────────────────────────────────────────

/**
 * Convert CIE XYZ tristimulus values to xy chromaticity coordinates.
 *
 * Returns null when X+Y+Z ≈ 0 (no stimulus / perfect black).
 */
export function xyzToChromaticity(X: number, Y: number, Z: number): Chromaticity | null {
  const sum = X + Y + Z;
  if (sum < 1e-12) return null;
  return { x: X / sum, y: Y / sum };
}

/**
 * Convert linear sRGB (each channel in [0, 1]) to CIE XYZ (D65).
 *
 * Uses the exact IEC 61966-2-1 matrix (same as `SRGB_TO_XYZ_D65` in color-science.ts).
 */
export function sRGBLinearToXYZ(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

/**
 * Convert linear sRGB [0, 1] to CIE xy chromaticity.
 *
 * Returns null for the achromatic black pixel (all channels ≈ 0).
 */
export function sRGBLinearToChromaticity(r: number, g: number, b: number): Chromaticity | null {
  const [X, Y, Z] = sRGBLinearToXYZ(r, g, b);
  return xyzToChromaticity(X, Y, Z);
}

/**
 * sRGB EOTF: encoded [0, 1] → linear [0, 1].
 * Matches IEC 61966-2-1 piecewise definition.
 */
function srgbEOTF(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Convert gamma-encoded sRGB (0–255 byte values) to xy chromaticity.
 * Performs gamma decoding (EOTF) before the XYZ conversion.
 *
 * Returns null for black pixels.
 */
export function sRGBByteToChromaticity(r: number, g: number, b: number): Chromaticity | null {
  return sRGBLinearToChromaticity(srgbEOTF(r / 255), srgbEOTF(g / 255), srgbEOTF(b / 255));
}

// ─── Standard illuminants ─────────────────────────────────────────────────────

/**
 * Standard CIE illuminant white points in xy chromaticity.
 * Source: ISO 11664-2 / CIE Publication 15:2004.
 */
export const ILLUMINANTS: Readonly<Record<string, Chromaticity>> = Object.freeze({
  /** D50 — 5000 K approximation, print/ICC reference */
  D50: { x: 0.3457, y: 0.3585 },
  /** D55 — 5500 K, photography */
  D55: { x: 0.3324, y: 0.3474 },
  /** D65 — 6500 K, sRGB / Rec.709 / Rec.2020 reference */
  D65: { x: 0.3127, y: 0.3290 },
  /** D75 — 7500 K, northern sky */
  D75: { x: 0.2990, y: 0.3149 },
  /** CIE Illuminant A — tungsten 2856 K */
  A:   { x: 0.4476, y: 0.4074 },
  /** DCI reference white (near D63 / 6300 K) */
  DCI: { x: 0.3140, y: 0.3510 },
  /** ACES D60 reference white */
  D60: { x: 0.32168, y: 0.33767 },
  /** Equal-energy illuminant E */
  E:   { x: 1 / 3, y: 1 / 3 },
});

// ─── Gamut primaries ──────────────────────────────────────────────────────────

/**
 * Color gamut primary triangles in CIE xy chromaticity.
 *
 * All values are the *xy coordinates of the primaries* as published in the
 * respective standards. The triangles can be rendered as overlay polygons on
 * a CIE chromaticity diagram or vectorscope.
 */
export const GAMUT_PRIMARIES: Readonly<Record<string, GamutPrimaries>> = Object.freeze({
  /**
   * sRGB / ITU-R BT.709 — IEC 61966-2-1:1999, ITU-R BT.709-6.
   * White point: D65.
   */
  sRGB: {
    r: { x: 0.640, y: 0.330 },
    g: { x: 0.300, y: 0.600 },
    b: { x: 0.150, y: 0.060 },
    white: ILLUMINANTS.D65,
  },
  /**
   * ITU-R BT.2020 — wide-colour-gamut UHDTV/HDR.
   * White point: D65.
   */
  rec2020: {
    r: { x: 0.708, y: 0.292 },
    g: { x: 0.170, y: 0.797 },
    b: { x: 0.131, y: 0.046 },
    white: ILLUMINANTS.D65,
  },
  /**
   * DCI-P3 — SMPTE ST 431-2:2011 (digital cinema).
   * White point: DCI reference white (0.314, 0.351).
   */
  dciP3: {
    r: { x: 0.680, y: 0.320 },
    g: { x: 0.265, y: 0.690 },
    b: { x: 0.150, y: 0.060 },
    white: ILLUMINANTS.DCI,
  },
  /**
   * Display P3 — Apple / consumer HDR displays.
   * Same primaries as DCI-P3 but D65 white point.
   */
  displayP3: {
    r: { x: 0.680, y: 0.320 },
    g: { x: 0.265, y: 0.690 },
    b: { x: 0.150, y: 0.060 },
    white: ILLUMINANTS.D65,
  },
  /**
   * ACES AP0 (ACES 2065-1) — Academy S-2014-006.
   * White point: D60.
   */
  acesAP0: {
    r: { x:  0.73470, y: 0.26530 },
    g: { x:  0.00000, y: 1.00000 },
    b: { x:  0.00010, y: -0.07700 },
    white: ILLUMINANTS.D60,
  },
  /**
   * ACES AP1 (ACEScg) — Academy TB-2014-004.
   * White point: D60.
   */
  acesAP1: {
    r: { x: 0.713, y: 0.293 },
    g: { x: 0.165, y: 0.830 },
    b: { x: 0.128, y: 0.044 },
    white: ILLUMINANTS.D60,
  },
});

// ─── Planckian locus ──────────────────────────────────────────────────────────

/**
 * Compute the CIE xy chromaticity of a blackbody radiator at temperature `tempK`.
 *
 * Uses the Kim et al. (2002) polynomial approximation, valid for 1667–25000 K.
 * Outside this range the result is extrapolated but loses accuracy.
 *
 * @param tempK  Colour temperature in Kelvin (typical range: 1667–25000).
 * @returns CIE xy chromaticity of the Planckian locus at that temperature.
 */
export function planckianLocus(tempK: number): Chromaticity {
  const T = Math.max(1667, Math.min(25000, tempK));
  const T2 = T * T;
  const T3 = T2 * T;

  let x: number;
  if (T <= 4000) {
    x = -0.2661239e9 / T3 - 0.2343580e6 / T2 + 0.8776956e3 / T + 0.179910;
  } else {
    x = -3.0258469e9 / T3 + 2.1070379e6 / T2 + 0.2226347e3 / T + 0.240390;
  }

  let y: number;
  if (T <= 2222) {
    y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
  } else if (T <= 4000) {
    y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.0817580 * x * x * x - 5.8733867 * x * x + 3.75112997 * x - 0.37001483;
  }

  return { x, y };
}

/**
 * Compute a sequence of Planckian locus points for temperature range [minT, maxT].
 *
 * @param minT   Start temperature in Kelvin (≥ 1667).
 * @param maxT   End temperature in Kelvin (≤ 25000).
 * @param steps  Number of sample points (default 64). Must be ≥ 2.
 * @returns Array of labelled chromaticity points along the locus.
 */
export function planckianLocusPoints(
  minT = 1700,
  maxT = 10000,
  steps = 64,
): ChromaticityPoint[] {
  const n = Math.max(2, steps);
  const points: ChromaticityPoint[] = [];
  for (let i = 0; i < n; i++) {
    const T = minT + (i / (n - 1)) * (maxT - minT);
    const { x, y } = planckianLocus(T);
    points.push({ x, y, label: `${Math.round(T)}K` });
  }
  return points;
}

// ─── CCT estimation ────────────────────────────────────────────────────────────

/**
 * Estimate Correlated Colour Temperature (CCT) from CIE xy chromaticity.
 *
 * Uses McCamy (1992) cubic approximation:
 *   `CCT = −449n³ + 3525n² − 6823.3n + 5520.33`
 *   where `n = (x − 0.3320) / (y − 0.1858)`
 *
 * Valid range: approximately 2500–7500 K. Returns NaN outside the valid range.
 *
 * @param xy  CIE xy chromaticity coordinate.
 * @returns   Estimated CCT in Kelvin.
 */
export function estimateCCT(xy: Chromaticity): number {
  const n = (xy.x - 0.3320) / (xy.y - 0.1858);
  return -449 * n * n * n + 3525 * n * n - 6823.3 * n + 5520.33;
}

// ─── Buffer sampling ──────────────────────────────────────────────────────────

/**
 * Sample xy chromaticity coordinates from an sRGB RGBA buffer for
 * vectorscope-style visualisation.
 *
 * Black / near-black pixels are skipped (no meaningful chromaticity).
 *
 * @param data        sRGB RGBA Uint8ClampedArray (4 bytes per pixel).
 * @param maxSamples  Maximum number of samples to return. Pixels are
 *                    subsampled uniformly. Default: 2000.
 * @param minLuma     Skip pixels with BT.709 linear luma below this threshold.
 *                    Default: 0.01 (roughly 25/255 encoded).
 * @returns Array of chromaticity points (may be shorter than maxSamples if
 *          many pixels are achromatic or below minLuma).
 */
export function sampleBufferChromaticities(
  data: Uint8ClampedArray,
  maxSamples = 2000,
  minLuma = 0.01,
): Chromaticity[] {
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount === 0) return [];

  const step = Math.max(1, Math.floor(pixelCount / maxSamples));
  const result: Chromaticity[] = [];

  for (let i = 0; i < pixelCount; i += step) {
    const off = i * 4;
    const rLin = srgbEOTF(data[off]     / 255);
    const gLin = srgbEOTF(data[off + 1] / 255);
    const bLin = srgbEOTF(data[off + 2] / 255);

    // BT.709 luma — skip near-black
    const luma = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
    if (luma < minLuma) continue;

    const xy = sRGBLinearToChromaticity(rLin, gLin, bLin);
    if (xy) result.push(xy);
  }

  return result;
}
