/**
 * Artone v3 — CIE Color Difference (ΔE)
 *
 * Perceptual color difference metrics in the CIE L*a*b* color space:
 *
 *   - XYZ ↔ L*a*b* conversion (D65/D50 reference)
 *   - sRGB (linear / encoded) → L*a*b*
 *   - CIE76 — simple Euclidean distance in Lab (ΔE*ab)
 *   - CIE94 — chroma/hue-weighted ΔE (graphic arts or textiles parametrization)
 *   - CIEDE2000 (ΔE00) — perceptually uniform, industry standard for color QC
 *
 * References:
 *   - CIE Publication 116:1995 (CIE94)
 *   - Sharma, Wu & Dalal (2005) "The CIEDE2000 Color-Difference Formula:
 *     Implementation Notes, Supplementary Test Data, and Mathematical Observations"
 *     Color Research & Application 30(1):21–30, DOI:10.1002/col.20070
 *   - IEC 61966-2-1:1999 (sRGB)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** CIE L*a*b* coordinate triple. */
export interface Lab {
  /** Lightness [0, 100]. */
  L: number;
  /** Green–Red opponent axis. */
  a: number;
  /** Blue–Yellow opponent axis. */
  b: number;
}

/** CIE L*C*h* (cylindrical form of Lab). */
export interface LCH {
  /** Lightness [0, 100]. */
  L: number;
  /** Chroma ≥ 0. */
  C: number;
  /** Hue angle [0°, 360°). */
  H: number;
}

// ─── Reference illuminants (XYZ, normalised so Yn = 1) ───────────────────────

/** A reference white point (XYZ tristimulus values, normalised so Yn = 1). */
export interface WhitePoint {
  readonly Xn: number;
  readonly Yn: number;
  readonly Zn: number;
}

/** D65 reference white tristimulus values (sRGB / Rec.709 / Rec.2020). */
export const D65_WHITE: WhitePoint = { Xn: 0.95047, Yn: 1.00000, Zn: 1.08883 };
/** D50 reference white (ISO print / ICC profiles). */
export const D50_WHITE: WhitePoint = { Xn: 0.96422, Yn: 1.00000, Zn: 0.82521 };

// ─── XYZ ↔ Lab ────────────────────────────────────────────────────────────────

/** CIE f(t) cube-root function with linear tail below (6/29)³. */
function labF(t: number): number {
  // (6/29)³ ≈ 0.008856;  (29/6)³/3 ≈ 7.787;  4/29 ≈ 0.1379
  return t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 0.137931034;
}

/**
 * Convert CIE XYZ (D65 by default) to CIE L*a*b*.
 *
 * @param X  CIE X tristimulus value.
 * @param Y  CIE Y (relative luminance, Y_n = 1).
 * @param Z  CIE Z tristimulus value.
 * @param ref Reference illuminant. Defaults to D65.
 */
export function xyzToLab(
  X: number,
  Y: number,
  Z: number,
  ref = D65_WHITE,
): Lab {
  const fx = labF(X / ref.Xn);
  const fy = labF(Y / ref.Yn);
  const fz = labF(Z / ref.Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Convert CIE L*a*b* to XYZ.
 *
 * @param lab  L*a*b* triple.
 * @param ref  Reference illuminant. Defaults to D65.
 */
export function labToXYZ(lab: Lab, ref = D65_WHITE): [number, number, number] {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const eps = 0.008856451679;   // (6/29)^3
  const kappa = 903.296296;     // (29/6)^3
  const x = fx * fx * fx > eps ? fx * fx * fx : (116 * fx - 16) / kappa;
  const y = lab.L > kappa * eps ? Math.pow((lab.L + 16) / 116, 3) : lab.L / kappa;
  const z = fz * fz * fz > eps ? fz * fz * fz : (116 * fz - 16) / kappa;
  return [x * ref.Xn, y * ref.Yn, z * ref.Zn];
}

// ─── sRGB → Lab ───────────────────────────────────────────────────────────────

/** sRGB EOTF: encoded [0, 1] → linear [0, 1]. */
function sRGBEOTF(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB linear → XYZ (D65), IEC 61966-2-1 matrix. */
function sRGBLinearToXYZ(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

/**
 * Convert linear sRGB [0, 1] to L*a*b* (D65 reference).
 */
export function sRGBLinearToLab(r: number, g: number, b: number): Lab {
  const [X, Y, Z] = sRGBLinearToXYZ(r, g, b);
  return xyzToLab(X, Y, Z);
}

/**
 * Convert gamma-encoded sRGB bytes (0–255) to L*a*b* (D65 reference).
 * Applies sRGB EOTF (gamma decoding) before the conversion.
 */
export function sRGBByteToLab(r: number, g: number, b: number): Lab {
  return sRGBLinearToLab(sRGBEOTF(r / 255), sRGBEOTF(g / 255), sRGBEOTF(b / 255));
}

// ─── Lab ↔ LCH ────────────────────────────────────────────────────────────────

/** Convert L*a*b* to cylindrical L*C*h*. */
export function labToLCH(lab: Lab): LCH {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

/** Convert L*C*h* back to L*a*b*. */
export function lchToLab(lch: LCH): Lab {
  const rad = (lch.H * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

// ─── CIE76 ───────────────────────────────────────────────────────────────────

/**
 * CIE76 color difference — Euclidean distance in L*a*b* space.
 *
 * Fast but perceptually non-uniform (notably poor for saturated blues).
 * Returns ΔE*ab.
 */
export function deltaE76(lab1: Lab, lab2: Lab): number {
  const dL = lab2.L - lab1.L;
  const da = lab2.a - lab1.a;
  const db = lab2.b - lab1.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ─── CIE94 ───────────────────────────────────────────────────────────────────

/** CIE94 application mode parametrization. */
export interface CIE94Params {
  /** Lightness weighting factor (kL). Graphic arts: 1; textiles: 2. Default: 1. */
  kL?: number;
  /** Chroma sensitivity constant K1. Graphic arts: 0.045; textiles: 0.048. Default: 0.045. */
  K1?: number;
  /** Hue sensitivity constant K2. Graphic arts: 0.015; textiles: 0.014. Default: 0.015. */
  K2?: number;
}

/**
 * CIE94 color difference. More accurate than CIE76 for chromatic colours.
 *
 * Note: CIE94 is NOT symmetric; it uses `lab1` as the reference.
 * For symmetric comparison, compute both directions and take the average or max.
 *
 * @param lab1  Reference color.
 * @param lab2  Sample color.
 * @param params  Parametrization (default: graphic arts).
 */
export function deltaE94(lab1: Lab, lab2: Lab, params: CIE94Params = {}): number {
  const kL = params.kL ?? 1;
  const K1 = params.K1 ?? 0.045;
  const K2 = params.K2 ?? 0.015;
  const kC = 1;
  const kH = 1;

  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);

  const dL = lab1.L - lab2.L;
  const dC = C1 - C2;
  // ΔH*ab² = Δa² + Δb² - ΔC²
  const dHsq = Math.max(
    0,
    (lab2.a - lab1.a) ** 2 + (lab2.b - lab1.b) ** 2 - dC * dC,
  );

  const SL = 1;
  const SC = 1 + K1 * C1;
  const SH = 1 + K2 * C1;

  return Math.sqrt(
    (dL / (kL * SL)) ** 2 +
    (dC / (kC * SC)) ** 2 +
    dHsq / (kH * SH) ** 2,
  );
}

// ─── CIEDE2000 ────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/**
 * CIEDE2000 (ΔE00) color difference.
 *
 * The most perceptually uniform CIE color difference formula, accounting
 * for corrections in lightness, chroma, hue, and a hue-rotation term for
 * the blue region. Symmetric in lab1 and lab2.
 *
 * Reference implementation follows Sharma et al. (2005) exactly.
 *
 * @param lab1  First color.
 * @param lab2  Second color.
 * @returns ΔE00 value (0 = identical; > 1 = just-noticeable difference).
 */
export function deltaE00(lab1: Lab, lab2: Lab): number {
  const L1 = lab1.L;  const a1 = lab1.a;  const b1 = lab1.b;
  const L2 = lab2.L;  const a2 = lab2.a;  const b2 = lab2.b;

  // Step 1 — C*ab and Ĉ*ab
  const Cab1 = Math.sqrt(a1 * a1 + b1 * b1);
  const Cab2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cabbar = (Cab1 + Cab2) / 2;
  const Cabbar7 = Cabbar ** 7;

  // Step 2 — a' adjustment (G factor)
  const G = 0.5 * (1 - Math.sqrt(Cabbar7 / (Cabbar7 + 6103515625))); // 6103515625 = 25^7
  const ap1 = a1 * (1 + G);
  const ap2 = a2 * (1 + G);

  // Step 3 — C'
  const Cp1 = Math.sqrt(ap1 * ap1 + b1 * b1);
  const Cp2 = Math.sqrt(ap2 * ap2 + b2 * b2);

  // Step 4 — h' (degrees, 0–360)
  function hprime(b: number, ap: number): number {
    if (b === 0 && ap === 0) return 0;
    let h = (Math.atan2(b, ap) * 180) / Math.PI;
    if (h < 0) h += 360;
    return h;
  }
  const hp1 = hprime(b1, ap1);
  const hp2 = hprime(b2, ap2);

  // Step 5 — ΔL', ΔC', Δh', ΔH'
  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;

  let dhp: number;
  if (Cp1 * Cp2 === 0) {
    dhp = 0;
  } else if (Math.abs(hp2 - hp1) <= 180) {
    dhp = hp2 - hp1;
  } else if (hp2 - hp1 > 180) {
    dhp = hp2 - hp1 - 360;
  } else {
    dhp = hp2 - hp1 + 360;
  }

  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * DEG);

  // Step 6 — L̄', C̄', H̄'
  const Lpbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;

  let Hpbar: number;
  if (Cp1 * Cp2 === 0) {
    Hpbar = hp1 + hp2;
  } else if (Math.abs(hp1 - hp2) <= 180) {
    Hpbar = (hp1 + hp2) / 2;
  } else if (hp1 + hp2 < 360) {
    Hpbar = (hp1 + hp2 + 360) / 2;
  } else {
    Hpbar = (hp1 + hp2 - 360) / 2;
  }

  // Step 7 — T
  const T =
    1 -
    0.17 * Math.cos((Hpbar - 30) * DEG) +
    0.24 * Math.cos(2 * Hpbar * DEG) +
    0.32 * Math.cos((3 * Hpbar + 6) * DEG) -
    0.20 * Math.cos((4 * Hpbar - 63) * DEG);

  // Step 8 — SL, SC, SH
  const SL = 1 + (0.015 * (Lpbar - 50) ** 2) / Math.sqrt(20 + (Lpbar - 50) ** 2);
  const SC = 1 + 0.045 * Cpbar;
  const SH = 1 + 0.015 * Cpbar * T;

  // Step 9 — RT (rotation term)
  const dTheta = 30 * Math.exp(-(((Hpbar - 275) / 25) ** 2));
  const Cpbar7 = Cpbar ** 7;
  const RC = 2 * Math.sqrt(Cpbar7 / (Cpbar7 + 6103515625));
  const RT = -Math.sin(2 * dTheta * DEG) * RC;

  // Step 10 — ΔE00
  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}
