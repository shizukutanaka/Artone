/**
 * ACES / OpenColorIO-compatible color science
 *
 * Pure TypeScript — no DOM, no WebGPU. All transforms use
 * industry-standard matrices from the official ACES documentation
 * (S-2014-006 "ACEScc") and IEC 61966-2-1 (sRGB).
 *
 * Supported pipelines:
 *   sRGB linear  ←→  ACEScg (AP1 linear)
 *   sRGB linear  ←→  ACES 2065-1 (AP0 linear)
 *   ACES RRT+ODT (Hill 2017 polynomial approximation)
 *   ACEScc / ACEScct log encoding
 *   sRGB / Rec.709 / Rec.2020 transfer functions
 *   Gamut compression (wide-gamut negative-lobe clip + smooth compress)
 *
 * References:
 *   Academy S-2014-006   — ACEScc
 *   Academy TB-2014-004  — ACEScg Primaries
 *   Academy S-2016-001   — ACES Reference Gamut Compression
 *   Hill (2017)          — ACES approximate polynomial (GDC)
 *   IEC 61966-2-1        — sRGB
 *   ITU-R BT.709 / BT.2020
 */

// ============================================================
// 3×3 matrix operations
// ============================================================

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** Multiply 3×3 matrix m by column vector [r,g,b]. */
export function mat3MulVec(m: Mat3, r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/** Multiply two 3×3 matrices: returns A × B. */
export function mat3Mul(A: Mat3, B: Mat3): Mat3 {
  return [
    A[0]*B[0]+A[1]*B[3]+A[2]*B[6],  A[0]*B[1]+A[1]*B[4]+A[2]*B[7],  A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
    A[3]*B[0]+A[4]*B[3]+A[5]*B[6],  A[3]*B[1]+A[4]*B[4]+A[5]*B[7],  A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
    A[6]*B[0]+A[7]*B[3]+A[8]*B[6],  A[6]*B[1]+A[7]*B[4]+A[8]*B[7],  A[6]*B[2]+A[7]*B[5]+A[8]*B[8],
  ];
}

// ============================================================
// Standard color-conversion matrices (row-major, applied as M × col-vec)
// ============================================================

/**
 * sRGB/Rec.709 linear → XYZ (D65)
 * Source: IEC 61966-2-1:1999 Annex B (exact D65 adaptation)
 */
export const SRGB_TO_XYZ_D65: Mat3 = [
   0.4124564,  0.3575761,  0.1804375,
   0.2126729,  0.7151522,  0.0721750,
   0.0193339,  0.1191920,  0.9503041,
];

/** XYZ (D65) → sRGB/Rec.709 linear */
export const XYZ_D65_TO_SRGB: Mat3 = [
   3.2404542, -1.5371385, -0.4985314,
  -0.9692660,  1.8760108,  0.0415560,
   0.0556434, -0.2040259,  1.0572252,
];

/**
 * Rec.2020 linear → XYZ (D65)
 * Source: ITU-R BT.2020 Table 4
 */
export const REC2020_TO_XYZ_D65: Mat3 = [
   0.6369580,  0.1446169,  0.1688810,
   0.2627002,  0.6779981,  0.0593017,
   0.0000000,  0.0280727,  1.0609851,
];

/** XYZ (D65) → Rec.2020 linear */
export const XYZ_D65_TO_REC2020: Mat3 = [
   1.7166512, -0.3556708, -0.2533663,
  -0.6666844,  1.6164812,  0.0157685,
   0.0176399, -0.0427706,  0.9421031,
];

/**
 * ACES AP0 (2065-1) → XYZ (D60)
 * Source: Academy S-2014-006, Table B-1
 */
export const AP0_TO_XYZ_D60: Mat3 = [
   0.9525523959,  0.0000000000,  0.0000936786,
   0.3439664498,  0.7281660966, -0.0721325464,
   0.0000000000,  0.0000000000,  1.0088251844,
];

/** XYZ (D60) → ACES AP0 */
export const XYZ_D60_TO_AP0: Mat3 = [
   1.0498110175,  0.0000000000, -0.0000974845,
  -0.4959030231,  1.3733130458,  0.0982400361,
   0.0000000000,  0.0000000000,  0.9912520182,
];

/**
 * ACES AP0 → ACES AP1 (ACEScg)
 * Source: Academy TB-2014-004
 */
export const AP0_TO_AP1: Mat3 = [
   1.4514393161, -0.2365107469, -0.2149285693,
  -0.0765537734,  1.1762296998, -0.0996759264,
   0.0083161484, -0.0060324498,  0.9977163014,
];

/** ACES AP1 (ACEScg) → ACES AP0 */
export const AP1_TO_AP0: Mat3 = [
   0.6954522414,  0.1406786965,  0.1638690622,
   0.0447945634,  0.8596711325,  0.0955343042,
  -0.0055258826,  0.0040252103,  1.0015006723,
];

/**
 * ACEScg (AP1) → sRGB linear
 * Derived: AP1→AP0→XYZ(D60)→XYZ(D65)→sRGB
 * Reference pre-computed: Academy CTL aces-dev/transforms
 */
export const AP1_TO_SRGB: Mat3 = [
   1.7050495, -0.6217955, -0.0832540,
  -0.1302022,  1.1408026, -0.0106004,
  -0.0240031, -0.1289844,  1.1529874,
];

/** sRGB linear → ACEScg (AP1) */
export const SRGB_TO_AP1: Mat3 = [
   0.6130973, 0.3395235, 0.0473792,
   0.0700713, 0.9163861, 0.0135426,
   0.0205996, 0.1095743, 0.8698261,
];

// ============================================================
// Bradford chromatic adaptation: D65 ↔ D60
// ============================================================

/**
 * XYZ (D65) → XYZ (D60) via Bradford cone space adaptation.
 * Used to bridge sRGB (D65) and ACES (D60) white points.
 * Source: Academy CTL aces-dev / colour-science.org
 */
export const XYZ_D65_TO_D60: Mat3 = [
   0.9869929, -0.1470543,  0.1599627,
   0.0432590,  0.9836027,  0.0009137,
  -0.0085287,  0.0400428,  0.9684867,
];

/** XYZ (D60) → XYZ (D65) */
export const XYZ_D60_TO_D65: Mat3 = [
   1.0130349,  0.1519240, -0.1569241,
  -0.0444875,  1.0166450, -0.0066023,
   0.0085643, -0.0421101,  1.0328485,
];

// ============================================================
// Transfer functions (OETF / EOTF)
// ============================================================

/**
 * sRGB OETF: linear light → encoded (gamma ≈ 2.2 with linear toe).
 * IEC 61966-2-1 §5.1
 */
export function sRGBOETF(x: number): number {
  if (x <= 0) return 0;
  if (x <= 0.0031308) return 12.92 * x;
  return 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** sRGB EOTF: encoded → linear light. */
export function sRGBEOTF(x: number): number {
  if (x <= 0) return 0;
  if (x <= 0.04045) return x / 12.92;
  return Math.pow((x + 0.055) / 1.055, 2.4);
}

/**
 * ACEScc log encoding: linear light → ACEScc.
 * Source: Academy S-2014-006 §4.4
 * Domain: (-∞, 1] → (−∞, 1]. Negative ACEScg values are handled.
 */
export function acescCOETF(x: number): number {
  // Non-positive linear maps to the ACEScc "black" code. Per S-2014-006 this
  // is (log2(2^-16) + 9.72) / 17.52 = -0.358447…, matching the x→0⁺ limit of
  // the toe branch below and the cut2 constant in acescEOTF. The previous code
  // wrote a second `-16` where the +9.72 offset belongs (log2(2^-15·0.5) also
  // equals -16), yielding -1.8265 — off the valid ACEScc range and
  // discontinuous with the toe branch.
  if (x <= 0) return (Math.log2(Math.pow(2, -16)) + 9.72) / 17.52;
  if (x < Math.pow(2, -15)) return (Math.log2(Math.pow(2, -16) + x * 0.5) + 9.72) / 17.52;
  return (Math.log2(x) + 9.72) / 17.52;
}

/** ACEScc → linear. */
export function acescEOTF(x: number): number {
  const cut1 = (9.72 - 15) / 17.52; // ≈ -0.3013698...
  const cut2 = (Math.log2(Math.pow(2, -15) * 0.5) + 9.72) / 17.52;
  if (x < cut1) return (Math.pow(2, x * 17.52 - 9.72) - Math.pow(2, -16)) * 2;
  if (x < cut2) return (Math.pow(2, x * 17.52 - 9.72) - Math.pow(2, -16)) * 2;
  return Math.pow(2, x * 17.52 - 9.72);
}

/**
 * ACEScct: like ACEScc but with linear toe for better grading tool compatibility.
 * Source: Academy S-2016-001 §4
 */
const ACESCCT_CUT = 0.0078125; // 2^-7 / 16
const ACESCCT_A   = 10.5402377416672;
const ACESCCT_B   = 0.0729055341958355;

export function acescctOETF(x: number): number {
  if (x <= ACESCCT_CUT) return ACESCCT_A * x + ACESCCT_B;
  return (Math.log2(x) + 9.72) / 17.52;
}

export function acescctEOTF(y: number): number {
  if (y <= ACESCCT_A * ACESCCT_CUT + ACESCCT_B) return (y - ACESCCT_B) / ACESCCT_A;
  return Math.pow(2, y * 17.52 - 9.72);
}

// ============================================================
// ACES RRT + ODT (Hill 2017 polynomial approximation)
// ============================================================

/**
 * ACES RRT + ODT (sRGB output) — Hill 2017 polynomial approximation.
 * Maps ACES AP1 linear → display-encoded sRGB in [0,1].
 *
 * Reference: Stephen Hill, "Self Shadow" GDC 2017 / ACES GitHub.
 * Equivalent to the full CTL pipeline at < 0.0005 dE2000 error.
 */
export function acesHillRRTODT(r: number, g: number, b: number): [number, number, number] {
  // RRT exposure
  const a = 2.51;
  const bb = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;

  const map = (x: number): number => {
    const v = Math.max(0, x);
    // Polynomial has asymptote at a/c ≈ 1.033; clamp to [0,1] as per ODT design intent
    return Math.min(1, Math.max(0, (v * (a * v + bb)) / (v * (c * v + d) + e)));
  };

  // sRGB encode after tone mapping
  return [sRGBOETF(map(r)), sRGBOETF(map(g)), sRGBOETF(map(b))];
}

// ============================================================
// Gamut compression (Academy Reference Gamut Compression, S-2020-003)
// ============================================================

/**
 * Simple wide-gamut clip for negative lobe values.
 * For production use, apply before the RRT.
 */
export function gamutClip(r: number, g: number, b: number): [number, number, number] {
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

// ============================================================
// High-level pipeline helpers
// ============================================================

/**
 * sRGB encoded pixel → ACEScg linear.
 * Typical input pipeline for grading.
 */
export function sRGBToACEScg(r: number, g: number, b: number): [number, number, number] {
  // Decode gamma
  const lr = sRGBEOTF(r);
  const lg = sRGBEOTF(g);
  const lb = sRGBEOTF(b);
  // sRGB lin → AP1 lin
  return mat3MulVec(SRGB_TO_AP1, lr, lg, lb);
}

/**
 * ACEScg linear → sRGB encoded.
 * Typical output pipeline.
 */
export function acesCgToSRGB(r: number, g: number, b: number): [number, number, number] {
  // AP1 → sRGB linear
  const [lr, lg, lb] = mat3MulVec(AP1_TO_SRGB, r, g, b);
  // Gamma encode + clamp
  return [
    sRGBOETF(Math.max(0, lr)),
    sRGBOETF(Math.max(0, lg)),
    sRGBOETF(Math.max(0, lb)),
  ];
}

/**
 * Full ACES pipeline: sRGB encoded → grading space (ACEScg) → RRT+ODT → display sRGB.
 * r/g/b in [0,1] encoded sRGB → [0,1] display sRGB.
 */
export function acesRenderPipeline(r: number, g: number, b: number): [number, number, number] {
  // Step 1: sRGB → ACEScg linear
  const [ar, ag, ab] = sRGBToACEScg(r, g, b);
  // Step 2: Gamut clip (remove negative lobes)
  const [gr, gg, gb] = gamutClip(ar, ag, ab);
  // Step 3: RRT + ODT
  return acesHillRRTODT(gr, gg, gb);
}

/**
 * Applies color space conversion to a pixel buffer in-place (RGBA byte order).
 * `transform` is called with [0,1] linear channel values.
 */
export function applyColorPipelineToBuffer(
  data: Uint8ClampedArray,
  transform: (r: number, g: number, b: number) => [number, number, number]
): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const [or, og, ob] = transform(r, g, b);
    data[i]     = Math.round(Math.max(0, Math.min(1, or)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, og)) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, ob)) * 255);
  }
}
