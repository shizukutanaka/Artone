/**
 * Artone v3 — ACES IDT / ODT (OCIO-compatible color transforms)
 *
 * Camera Input Device Transforms (IDT) and Display Output Device Transforms
 * (ODT) following ACES (Academy Color Encoding System) conventions and
 * OpenColorIO naming/semantics.
 *
 * Supported IDTs:
 *   Rec.709 / sRGB       — broadcast cameras, consumer video
 *   Sony S-Log3/S-Gamut3 — Venice, FX9, A7S III, …
 *   ARRI LogC3/Wide Gamut — ALEXA Mini/LF, AMIRA, …
 *
 * Supported ODTs:
 *   sRGB/Rec.709   — standard SDR display
 *   DCI-P3 D65     — cinema / wide-gamut display
 *   Rec.2020 + PQ  — HDR10 (SMPTE ST 2084)
 *   Rec.2020 + HLG — broadcast HDR (ARIB STD-B67)
 *
 * Transform path:
 *   camera-encoded → scene-linear → ACES 2065-1 (AP0)
 *   → [optionally AP1/ACEScg] → RRT+ODT → display-encoded
 *
 * References:
 *   Academy S-2014-006      — ACEScsc matrices
 *   Academy TB-2014-004     — ACEScg Primaries
 *   Sony MLUT-001 v2.5      — S-Log3 / S-Gamut3 encoding
 *   ARRI Technical Document — LogC3 EI 800 encoding
 *   ITU-R BT.2100           — PQ and HLG transfer functions
 *   SMPTE ST 2084           — PQ EOTF
 *   ARIB STD-B67            — HLG OETF/EOTF
 *   Lindbloom (2003)        — RGB/XYZ matrix derivation
 *
 * @version 1.0.0
 */

import {
  type Mat3,
  mat3Mul, mat3MulVec,
  SRGB_TO_XYZ_D65,
  XYZ_D65_TO_REC2020,
  AP0_TO_XYZ_D60, XYZ_D60_TO_AP0,
  AP0_TO_AP1,
  XYZ_D65_TO_D60, XYZ_D60_TO_D65,
  sRGBEOTF,
  acesHillRRTODT,
} from './color-science';

// ============================================================
// Matrix utilities
// ============================================================

/**
 * Compute the inverse of a 3×3 matrix using cofactor (adjugate) method.
 */
export function mat3Inv(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, k] = m;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  const inv = 1 / det;
  return [
     inv * (e * k - f * h),  inv * (c * h - b * k),  inv * (b * f - c * e),
     inv * (f * g - d * k),  inv * (a * k - c * g),  inv * (c * d - a * f),
     inv * (d * h - e * g),  inv * (b * g - a * h),  inv * (a * e - b * d),
  ];
}

/** Chromaticity coordinate pair (CIE 1931 x, y). */
export interface Chromaticity { x: number; y: number; }
/** RGB primaries and reference white as xy chromaticities. */
export interface Primaries {
  r: Chromaticity;
  g: Chromaticity;
  b: Chromaticity;
  w: Chromaticity;
}

/**
 * Derive an RGB→XYZ matrix from CIE 1931 xy chromaticities.
 *
 * Derivation (Lindbloom 2003 §5):
 *  1. Convert each primary chromaticity to XYZ with Y=1 normalisation.
 *  2. Solve M·s = W_xyz for per-primary luminance scale factors s.
 *  3. Scaled matrix: final[col] = s[col] × primary_xyz[col].
 */
export function primaryToXYZMatrix(p: Primaries): Mat3 {
  // Primary chromaticities → Y-normalised XYZ
  const Xr = p.r.x / p.r.y, Zr = (1 - p.r.x - p.r.y) / p.r.y;
  const Xg = p.g.x / p.g.y, Zg = (1 - p.g.x - p.g.y) / p.g.y;
  const Xb = p.b.x / p.b.y, Zb = (1 - p.b.x - p.b.y) / p.b.y;
  const Xw = p.w.x / p.w.y, Zw = (1 - p.w.x - p.w.y) / p.w.y;

  // M = [Xr Xg Xb; 1 1 1; Zr Zg Zb]  (Yr=Yg=Yb=1)
  const M: Mat3 = [Xr, Xg, Xb, 1, 1, 1, Zr, Zg, Zb];
  // s = M⁻¹ · [Xw; 1; Zw]
  const [Sr, Sg, Sb] = mat3MulVec(mat3Inv(M), Xw, 1, Zw);
  return [
    Sr * Xr, Sg * Xg, Sb * Xb,
    Sr,      Sg,      Sb,
    Sr * Zr, Sg * Zg, Sb * Zb,
  ];
}

// ============================================================
// Camera primaries (official chromaticity values)
// ============================================================

const D65: Chromaticity = { x: 0.3127, y: 0.3290 };

/**
 * Sony S-Gamut3 primaries.
 * Source: Sony MLUT-001 Technical Summary v2.5, Table 3.
 */
export const SGAMUT3_PRIMARIES: Primaries = {
  r: { x: 0.7300, y: 0.2800 },
  g: { x: 0.1400, y: 0.8550 },
  b: { x: 0.1000, y: -0.0500 },
  w: D65,
};

/**
 * ARRI Wide Gamut (LogC3 era) primaries.
 * Source: ARRI Technical Document D-2012-1, rev. 1, Table 3.
 */
export const ARRI_WG_PRIMARIES: Primaries = {
  r: { x: 0.6840, y: 0.3130 },
  g: { x: 0.2210, y: 0.8480 },
  b: { x: 0.0861, y: -0.1020 },
  w: D65,
};

/**
 * DCI-P3 D65 primaries (P3-D65 post-production variant).
 * Source: SMPTE EG 432-1 with D65 whitepoint adaptation.
 */
export const DCIP3_D65_PRIMARIES: Primaries = {
  r: { x: 0.6800, y: 0.3200 },
  g: { x: 0.2650, y: 0.6900 },
  b: { x: 0.1500, y: 0.0600 },
  w: D65,
};

// ============================================================
// Pre-computed IDT color matrices
// camera-linear (D65) → ACES 2065-1 (AP0, D60)
// chain: cam_lin → XYZ_D65 → XYZ_D60 → AP0
// ============================================================

const D65_TO_D60_TO_AP0: Mat3 = mat3Mul(XYZ_D60_TO_AP0, XYZ_D65_TO_D60);

/** Sony S-Gamut3 linear → ACES 2065-1 (AP0) */
export const SGAMUT3_TO_ACES2065: Mat3 =
  mat3Mul(D65_TO_D60_TO_AP0, primaryToXYZMatrix(SGAMUT3_PRIMARIES));

/** ARRI Wide Gamut linear → ACES 2065-1 (AP0) */
export const ARRIW_TO_ACES2065: Mat3 =
  mat3Mul(D65_TO_D60_TO_AP0, primaryToXYZMatrix(ARRI_WG_PRIMARIES));

// ============================================================
// Pre-computed ODT color matrices
// ACES 2065-1 (AP0, D60) → display primaries (D65)
// chain: AP0 → XYZ_D60 → XYZ_D65 → display_lin
// ============================================================

const AP0_TO_XYZ_D65: Mat3 = mat3Mul(XYZ_D60_TO_D65, AP0_TO_XYZ_D60);

/** ACES 2065-1 → DCI-P3 D65 linear */
export const ACES2065_TO_DCIP3: Mat3 =
  mat3Mul(mat3Inv(primaryToXYZMatrix(DCIP3_D65_PRIMARIES)), AP0_TO_XYZ_D65);

/** ACES 2065-1 → Rec.2020 linear */
export const ACES2065_TO_REC2020: Mat3 =
  mat3Mul(XYZ_D65_TO_REC2020, AP0_TO_XYZ_D65);

/** sRGB/Rec.709 → ACES 2065-1 (for use with already-linearised Rec.709) */
export const SRGB_TO_ACES2065: Mat3 =
  mat3Mul(D65_TO_D60_TO_AP0, SRGB_TO_XYZ_D65);

// ============================================================
// Camera log decoding (scene-encoded → scene-linear, 0.18 = 18% grey)
// ============================================================

/** S-Log3 normalised cut (code 171.2… of 1023). Below this, use linear toe. */
const SLOG3_CUT_ENC = 171.2102946929 / 1023;
/** Scene-linear value at the S-Log3 cut (= 0.01125). */
const SLOG3_CUT_LIN = 0.01125;

/**
 * Decode Sony S-Log3 normalised code value [0,1] to scene-linear.
 * Source: Sony MLUT-001 Technical Summary v2.5.
 * Key points: code 95 (≈0.0929) → 0 lin; code 420 (≈0.4106) → 0.18 (18% grey).
 */
export function decodeSLog3(x: number): number {
  if (x >= SLOG3_CUT_ENC) {
    return Math.pow(10, (x * 1023 - 420) / 261.5) * 0.19 - 0.01;
  }
  return (x * 1023 - 95) * SLOG3_CUT_LIN / (171.2102946929 - 95);
}

/**
 * Encode scene-linear to Sony S-Log3. Inverse of decodeSLog3.
 */
export function encodeSLog3(lin: number): number {
  if (lin >= SLOG3_CUT_LIN) {
    return (420 + Math.log10((lin + 0.01) / 0.19) * 261.5) / 1023;
  }
  return (lin * (171.2102946929 - 95) / SLOG3_CUT_LIN + 95) / 1023;
}

/**
 * ARRI LogC3 EI 800 parameters (ARRI Technical Document D-2012-1).
 * Note: the linear segment slope (E) is empirically fit and does not match
 * the log-section derivative at the cut; a small (~0.006) discontinuity
 * exists at the junction in encoded values. This matches DaVinci Resolve / colour-science.
 */
const LC3_A = 5.555556;
const LC3_B = 0.052272;
const LC3_C = 0.24136;
const LC3_D = 0.385537;
const LC3_E = 5.367655;
const LC3_F = 0.092809;
/** LogC3 cut in encoded signal space (= LC3_E × cut_lin + LC3_F). */
const LC3_CUT2 = 0.149658;
/** LogC3 cut in scene-linear space. */
const LC3_CUT1 = (LC3_CUT2 - LC3_F) / LC3_E;   // ≈ 0.010591

/**
 * Decode ARRI LogC3 (EI 800) normalised code value [0,1] to scene-linear.
 * Key point: 0.3909 encodes 18% grey (scene 0.18).
 */
export function decodeLogC3(x: number): number {
  if (x >= LC3_CUT2) {
    return (Math.pow(10, (x - LC3_D) / LC3_C) - LC3_B) / LC3_A;
  }
  return (x - LC3_F) / LC3_E;
}

/**
 * Encode scene-linear to ARRI LogC3 (EI 800). Inverse of decodeLogC3.
 */
export function encodeLogC3(lin: number): number {
  if (lin >= LC3_CUT1) {
    return LC3_C * Math.log10(LC3_A * lin + LC3_B) + LC3_D;
  }
  return LC3_E * lin + LC3_F;
}

// ============================================================
// IDTs — camera-encoded → ACES 2065-1 (AP0)
// ============================================================

/**
 * Rec.709 (gamma-encoded) → ACES 2065-1.
 * Uses sRGB EOTF (IEC 61966-2-1; identical primaries to Rec.709).
 */
export function idtRec709(r: number, g: number, b: number): [number, number, number] {
  return mat3MulVec(SRGB_TO_ACES2065, sRGBEOTF(r), sRGBEOTF(g), sRGBEOTF(b));
}

/**
 * Sony S-Log3 / S-Gamut3 → ACES 2065-1.
 * Decodes log encoding per-channel, then applies the S-Gamut3→AP0 matrix.
 */
export function idtSLog3SGamut3(r: number, g: number, b: number): [number, number, number] {
  return mat3MulVec(
    SGAMUT3_TO_ACES2065,
    decodeSLog3(r), decodeSLog3(g), decodeSLog3(b),
  );
}

/**
 * ARRI LogC3 / Wide Gamut → ACES 2065-1.
 * Decodes LogC3 EI 800 per-channel, then applies the ARRI WG→AP0 matrix.
 */
export function idtLogC3WideGamut(r: number, g: number, b: number): [number, number, number] {
  return mat3MulVec(
    ARRIW_TO_ACES2065,
    decodeLogC3(r), decodeLogC3(g), decodeLogC3(b),
  );
}

// ============================================================
// Display transfer functions
// ============================================================

/** PQ (SMPTE ST 2084) OETF: scene-linear [nits] → signal [0,1]. */
export function pqOETF(nits: number): number {
  const L = Math.max(nits, 0) / 10000;
  const m1 = 2610 / 16384;
  const m2 = 2523 / 4096 * 128;
  const c1 = 3424 / 4096;
  const c2 = 2413 / 4096 * 32;
  const c3 = 2392 / 4096 * 32;
  const Lm1 = Math.pow(L, m1);
  return Math.pow((c1 + c2 * Lm1) / (1 + c3 * Lm1), m2);
}

/** PQ (SMPTE ST 2084) EOTF: signal [0,1] → [nits]. */
export function pqEOTF(x: number): number {
  const m1 = 2610 / 16384;
  const m2 = 2523 / 4096 * 128;
  const c1 = 3424 / 4096;
  const c2 = 2413 / 4096 * 32;
  const c3 = 2392 / 4096 * 32;
  const Vp = Math.pow(Math.max(x, 0), 1 / m2);
  const n = Math.max(Vp - c1, 0);
  return Math.pow(n / (c2 - c3 * Vp), 1 / m1) * 10000;
}

/** HLG (ARIB STD-B67) OETF: scene-linear [0,1] → signal [0,1]. */
export function hlgOETF(lin: number): number {
  const a = 0.17883277;
  const b = 0.28466892;
  const c = 0.55991073;
  if (lin <= 1 / 12) return Math.sqrt(3 * lin);
  return a * Math.log(12 * lin - b) + c;
}

/** HLG (ARIB STD-B67) EOTF: signal [0,1] → scene-linear [0,1]. */
export function hlgEOTF(x: number): number {
  const a = 0.17883277;
  const b = 0.28466892;
  const c = 0.55991073;
  if (x <= 0.5) return (x * x) / 3;
  return (Math.exp((x - c) / a) + b) / 12;
}

/** DCI-P3 power-law OETF (γ = 2.6). */
export function p3OETF(lin: number): number {
  return Math.pow(Math.max(lin, 0), 1 / 2.6);
}

/** DCI-P3 power-law EOTF (γ = 2.6). */
export function p3EOTF(enc: number): number {
  return Math.pow(Math.max(enc, 0), 2.6);
}

// ============================================================
// ODTs — ACES 2065-1 (AP0) → display-encoded output
// ============================================================

/**
 * ACES 2065-1 → sRGB display (SDR, Rec.709).
 * Converts AP0 → ACEScg (AP1), then applies the Hill 2017 polynomial
 * RRT+ODT which outputs display-encoded sRGB.
 */
export function odtSRGB(r: number, g: number, b: number): [number, number, number] {
  const [ra, ga, ba] = mat3MulVec(AP0_TO_AP1, r, g, b);
  return acesHillRRTODT(ra, ga, ba);
}

/**
 * ACES 2065-1 → DCI-P3 D65 display.
 * Applies Hill RRT tone-mapping, then re-gamut-maps from sRGB to P3-D65
 * and re-encodes with P3 γ 2.6.
 */
export function odtDCIP3(r: number, g: number, b: number): [number, number, number] {
  // Apply Hill RRT+ODT, then decode to linear
  const [rs, gs, bs] = odtSRGB(r, g, b);
  const linR = sRGBEOTF(rs), linG = sRGBEOTF(gs), linB = sRGBEOTF(bs);
  // Remap sRGB linear → P3-D65 linear via XYZ
  const [xp, yp, zp] = mat3MulVec(SRGB_TO_XYZ_D65, linR, linG, linB);
  const [rp, gp, bp] = mat3MulVec(mat3Inv(primaryToXYZMatrix(DCIP3_D65_PRIMARIES)), xp, yp, zp);
  return [p3OETF(rp), p3OETF(gp), p3OETF(bp)];
}

/**
 * ACES 2065-1 → Rec.2020 + PQ (HDR10).
 *
 * Converts AP0 → Rec.2020 linear, scales to nits
 * (0.18 scene-linear = 203 nits, matching ITU-R BT.2408 reference white),
 * then applies PQ OETF. No creative tone mapping — suitable for
 * content already graded in HDR colour space.
 */
export function odtHDR10(r: number, g: number, b: number): [number, number, number] {
  const [rr, gr, br] = mat3MulVec(ACES2065_TO_REC2020, r, g, b);
  // 0.18 → 203 nits reference white (ITU-R BT.2408-4)
  const nitsScale = 203 / 0.18;
  return [
    pqOETF(rr * nitsScale),
    pqOETF(gr * nitsScale),
    pqOETF(br * nitsScale),
  ];
}

/**
 * ACES 2065-1 → Rec.2020 + HLG (broadcast HDR).
 *
 * Converts AP0 → Rec.2020 linear, then applies HLG OETF directly.
 * Scene-referred: 0.18 maps to ≈ 0.67 HLG signal (nominal diffuse white).
 */
export function odtHLG(r: number, g: number, b: number): [number, number, number] {
  const [rr, gr, br] = mat3MulVec(ACES2065_TO_REC2020, r, g, b);
  return [hlgOETF(rr), hlgOETF(gr), hlgOETF(br)];
}

// ============================================================
// Pipeline API
// ============================================================

export type InputColorspace = 'rec709' | 'slog3-sgamut3' | 'logc3-wg' | 'aces2065-1';
export type OutputColorspace = 'srgb' | 'dcip3-d65' | 'hdr10' | 'hlg';

const IDT_MAP: Record<InputColorspace, (r: number, g: number, b: number) => [number, number, number]> = {
  'rec709':        idtRec709,
  'slog3-sgamut3': idtSLog3SGamut3,
  'logc3-wg':      idtLogC3WideGamut,
  'aces2065-1':    (r, g, b) => [r, g, b],
};

const ODT_MAP: Record<OutputColorspace, (r: number, g: number, b: number) => [number, number, number]> = {
  'srgb':     odtSRGB,
  'dcip3-d65': odtDCIP3,
  'hdr10':    odtHDR10,
  'hlg':      odtHLG,
};

/**
 * Build a composed color transform function: input colorspace → ACES 2065-1 → output colorspace.
 *
 * @param src - input camera/source colorspace
 * @param dst - target display colorspace
 * @returns pixel transform (r,g,b) → (r,g,b) for use in shaders or buffer processing
 *
 * @example
 *   const xf = colorTransform('slog3-sgamut3', 'srgb');
 *   const [r, g, b] = xf(0.41, 0.41, 0.41); // S-Log3 middle grey → display sRGB
 */
export function colorTransform(
  src: InputColorspace,
  dst: OutputColorspace,
): (r: number, g: number, b: number) => [number, number, number] {
  const idt = IDT_MAP[src];
  const odt = ODT_MAP[dst];
  return (r, g, b) => odt(...idt(r, g, b));
}

/**
 * Apply a color transform to a packed RGBA Uint8ClampedArray in-place.
 * Alpha channel is preserved unchanged.
 *
 * @param data  - RGBA byte buffer (length must be divisible by 4)
 * @param xform - pixel transform from colorTransform()
 */
export function applyColorTransformToBuffer(
  data: Uint8ClampedArray,
  xform: (r: number, g: number, b: number) => [number, number, number],
): void {
  for (let i = 0; i < data.length; i += 4) {
    const [ro, go, bo] = xform(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    data[i]     = Math.round(Math.max(0, Math.min(1, ro)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, go)) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, bo)) * 255);
    // data[i + 3] alpha unchanged
  }
}
