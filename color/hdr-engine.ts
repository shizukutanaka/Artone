/**
 * Artone v3 — HDR Processing Engine
 * 
 * HDR対応
 * - HDR10 / HDR10+
 * - HLG (Hybrid Log-Gamma)
 * - Dolby Vision (Profile 5)
 * - トーンマッピング
 * - 色域変換
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export type HDRFormat = 'sdr' | 'hdr10' | 'hdr10plus' | 'hlg' | 'dolby_vision';
export type ColorSpace = 'rec709' | 'rec2020' | 'dci_p3' | 'aces';
export type TransferFunction = 'gamma22' | 'gamma24' | 'pq' | 'hlg' | 'linear';

export interface HDRMetadata {
  format: HDRFormat;
  colorSpace: ColorSpace;
  transferFunction: TransferFunction;
  maxCLL: number;       // Maximum Content Light Level (nits)
  maxFALL: number;      // Maximum Frame Average Light Level (nits)
  masteringDisplay: {
    redPrimary: { x: number; y: number };
    greenPrimary: { x: number; y: number };
    bluePrimary: { x: number; y: number };
    whitePoint: { x: number; y: number };
    minLuminance: number;
    maxLuminance: number;
  };
}

export interface ToneMappingConfig {
  method: 'reinhard' | 'aces' | 'filmic' | 'hable' | 'uchimura' | 'lottes';
  exposure: number;
  whitePoint: number;
  contrast: number;
  saturation: number;
  highlights: number;
  shadows: number;
}

export interface ColorGamutConfig {
  source: ColorSpace;
  target: ColorSpace;
  chromaAdapt: 'bradford' | 'vonKries' | 'cat02';
  gamutMapping: 'clip' | 'compress' | 'expand';
}

// ============================================================
// Color Space Primaries
// ============================================================

const COLOR_PRIMARIES: Record<ColorSpace, {
  r: { x: number; y: number };
  g: { x: number; y: number };
  b: { x: number; y: number };
  w: { x: number; y: number };
}> = {
  rec709: {
    r: { x: 0.640, y: 0.330 },
    g: { x: 0.300, y: 0.600 },
    b: { x: 0.150, y: 0.060 },
    w: { x: 0.3127, y: 0.3290 }
  },
  rec2020: {
    r: { x: 0.708, y: 0.292 },
    g: { x: 0.170, y: 0.797 },
    b: { x: 0.131, y: 0.046 },
    w: { x: 0.3127, y: 0.3290 }
  },
  dci_p3: {
    r: { x: 0.680, y: 0.320 },
    g: { x: 0.265, y: 0.690 },
    b: { x: 0.150, y: 0.060 },
    w: { x: 0.314, y: 0.351 }
  },
  aces: {
    r: { x: 0.7347, y: 0.2653 },
    g: { x: 0.0000, y: 1.0000 },
    b: { x: 0.0001, y: -0.0770 },
    w: { x: 0.32168, y: 0.33767 }
  }
};

// ============================================================
// HDR Engine
// ============================================================

export class HDREngine {
  private metadata: HDRMetadata | null = null;
  private toneMappingConfig: ToneMappingConfig;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.toneMappingConfig = {
      method: 'aces',
      exposure: 0,
      whitePoint: 1,
      contrast: 1,
      saturation: 1,
      highlights: 0,
      shadows: 0
    };
  }

  // ============================================================
  // Metadata Management
  // ============================================================

  setMetadata(metadata: HDRMetadata): void {
    this.metadata = metadata;
    this.notify();
  }

  getMetadata(): HDRMetadata | null {
    return this.metadata;
  }

  detectHDR(_videoElement: HTMLVideoElement): HDRMetadata | null {
    // In production, would analyze video track metadata
    // Here we return a default HDR10 profile
    return {
      format: 'hdr10',
      colorSpace: 'rec2020',
      transferFunction: 'pq',
      maxCLL: 1000,
      maxFALL: 400,
      masteringDisplay: {
        redPrimary: COLOR_PRIMARIES.rec2020.r,
        greenPrimary: COLOR_PRIMARIES.rec2020.g,
        bluePrimary: COLOR_PRIMARIES.rec2020.b,
        whitePoint: COLOR_PRIMARIES.rec2020.w,
        minLuminance: 0.0001,
        maxLuminance: 1000
      }
    };
  }

  // ============================================================
  // Transfer Functions
  // ============================================================

  // PQ (Perceptual Quantizer) - SMPTE ST 2084
  pqEOTF(value: number): number {
    const m1 = 2610 / 16384;
    const m2 = 2523 / 4096 * 128;
    const c1 = 3424 / 4096;
    const c2 = 2413 / 4096 * 32;
    const c3 = 2392 / 4096 * 32;

    const Vp = Math.pow(value, 1 / m2);
    const n = Math.max(Vp - c1, 0);
    const L = Math.pow(n / (c2 - c3 * Vp), 1 / m1);
    
    return L * 10000; // Returns nits
  }

  pqOETF(luminance: number): number {
    const L = luminance / 10000;
    const m1 = 2610 / 16384;
    const m2 = 2523 / 4096 * 128;
    const c1 = 3424 / 4096;
    const c2 = 2413 / 4096 * 32;
    const c3 = 2392 / 4096 * 32;

    const Lm1 = Math.pow(L, m1);
    return Math.pow((c1 + c2 * Lm1) / (1 + c3 * Lm1), m2);
  }

  // HLG (Hybrid Log-Gamma) - ARIB STD-B67
  hlgOETF(value: number): number {
    const a = 0.17883277;
    const b = 0.28466892;
    const c = 0.55991073;

    if (value <= 1 / 12) {
      return Math.sqrt(3 * value);
    } else {
      return a * Math.log(12 * value - b) + c;
    }
  }

  hlgEOTF(value: number): number {
    const a = 0.17883277;
    const b = 0.28466892;
    const c = 0.55991073;

    if (value <= 0.5) {
      return (value * value) / 3;
    } else {
      return (Math.exp((value - c) / a) + b) / 12;
    }
  }

  // ============================================================
  // Tone Mapping
  // ============================================================

  setToneMappingConfig(config: Partial<ToneMappingConfig>): void {
    this.toneMappingConfig = { ...this.toneMappingConfig, ...config };
    this.notify();
  }

  toneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    // Apply exposure
    const exp = Math.pow(2, this.toneMappingConfig.exposure);
    r *= exp;
    g *= exp;
    b *= exp;

    // Apply tone mapping
    const mapped = this.applyToneMapping(r, g, b);
    r = mapped.r;
    g = mapped.g;
    b = mapped.b;

    // Apply contrast
    const contrast = this.toneMappingConfig.contrast;
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    // Apply saturation
    const sat = this.toneMappingConfig.saturation;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;

    return {
      r: Math.max(0, Math.min(1, r)),
      g: Math.max(0, Math.min(1, g)),
      b: Math.max(0, Math.min(1, b))
    };
  }

  private applyToneMapping(r: number, g: number, b: number): { r: number; g: number; b: number } {
    switch (this.toneMappingConfig.method) {
      case 'reinhard':
        return this.reinhardToneMap(r, g, b);
      case 'aces':
        return this.acesToneMap(r, g, b);
      case 'filmic':
        return this.filmicToneMap(r, g, b);
      case 'hable':
        return this.hableToneMap(r, g, b);
      case 'uchimura':
        return this.uchimuraToneMap(r, g, b);
      case 'lottes':
        return this.lottesToneMap(r, g, b);
      default:
        return { r, g, b };
    }
  }

  private reinhardToneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    const wp = this.toneMappingConfig.whitePoint;
    // wp=0 makes wp2=0 → r/wp2 = Infinity; wp<0 is physically undefined → clamp.
    const wp2 = Math.max(1e-6, wp * wp);
    // Reinhard is defined for non-negative scene luminances.
    // Color-space conversion can produce negative out-of-gamut values; clamping
    // prevents (1 + r) = 0 at r = -1 (divide-by-zero → ±Infinity).
    const rn = Math.max(0, r);
    const gn = Math.max(0, g);
    const bn = Math.max(0, b);
    return {
      r: (rn * (1 + rn / wp2)) / (1 + rn),
      g: (gn * (1 + gn / wp2)) / (1 + gn),
      b: (bn * (1 + bn / wp2)) / (1 + bn),
    };
  }

  private acesToneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    // ACES Filmic Tone Mapping
    const a = 2.51;
    const bb = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;

    const map = (x: number) => Math.max(0, (x * (a * x + bb)) / (x * (c * x + d) + e));
    
    return {
      r: map(r),
      g: map(g),
      b: map(b)
    };
  }

  private filmicToneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    const map = (x: number) => {
      x = Math.max(0, x - 0.004);
      return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
    };
    
    return {
      r: map(r),
      g: map(g),
      b: map(b)
    };
  }

  private hableToneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    // John Hable's Uncharted 2 tone mapping
    const hable = (x: number) => {
      const A = 0.15;
      const B = 0.50;
      const C = 0.10;
      const D = 0.20;
      const E = 0.02;
      const F = 0.30;
      return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
    };

    const wp = this.toneMappingConfig.whitePoint;
    const hableWp = hable(wp);
    // hable(0) = 0 (the formula evaluates to zero at x=0) → 1/0 = Infinity.
    const whiteScale = Math.abs(hableWp) < 1e-9 ? 1 : 1 / hableWp;
    
    return {
      r: hable(r) * whiteScale,
      g: hable(g) * whiteScale,
      b: hable(b) * whiteScale
    };
  }

  private uchimuraToneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    // Hajime Uchimura's GT Tone Mapping
    const uchimura = (x: number) => {
      // Uchimura is defined for x ≥ 0; Math.pow(negative, 1.33) = NaN in JS.
      if (x <= 0) return 0;
      const P = 1.0;  // max brightness
      const a = 1.0;  // contrast
      const m = 0.22; // linear section start
      const l = 0.4;  // linear section length
      const c = 1.33; // black tightness
      const b = 0.0;  // pedestal

      const l0 = ((P - m) * l) / a;
      const S0 = m + l0;
      const S1 = m + a * l0;
      const C2 = (a * P) / (P - S1);
      const CP = -C2 / P;

      const w0 = 1.0 - Math.smoothstep(0.0, m, x);
      const w2 = Math.smoothstep(m + l0, m + l0, x);
      const w1 = 1.0 - w0 - w2;

      const T = m * Math.pow(x / m, c) + b;
      const S = P - (P - S1) * Math.exp(CP * (x - S0));
      const L = m + a * (x - m);

      return T * w0 + L * w1 + S * w2;
    };
    
    return {
      r: uchimura(r),
      g: uchimura(g),
      b: uchimura(b)
    };
  }

  private lottesToneMap(r: number, g: number, b: number): { r: number; g: number; b: number } {
    // Timothy Lottes tone mapping
    const lottes = (x: number) => {
      // Lottes uses Math.pow(x, fractional); negative base yields NaN in JS.
      if (x <= 0) return 0;
      const a = 1.6;
      const d = 0.977;
      const hdrMax = 8.0;
      const midIn = 0.18;
      const midOut = 0.267;

      const bb = (-Math.pow(midIn, a) + Math.pow(hdrMax, a) * midOut) /
                ((Math.pow(hdrMax, a * d) - Math.pow(midIn, a * d)) * midOut);
      const c = (Math.pow(hdrMax, a * d) * Math.pow(midIn, a) - Math.pow(hdrMax, a) * Math.pow(midIn, a * d) * midOut) /
                ((Math.pow(hdrMax, a * d) - Math.pow(midIn, a * d)) * midOut);

      return Math.pow(x, a) / (Math.pow(x, a * d) * bb + c);
    };
    
    return {
      r: lottes(r),
      g: lottes(g),
      b: lottes(b)
    };
  }

  // ============================================================
  // Color Space Conversion
  // ============================================================

  convertColorSpace(
    r: number, g: number, b: number,
    source: ColorSpace,
    target: ColorSpace
  ): { r: number; g: number; b: number } {
    // Convert to XYZ
    const xyz = this.rgbToXYZ(r, g, b, source);
    
    // Convert from XYZ to target
    return this.xyzToRGB(xyz.x, xyz.y, xyz.z, target);
  }

  private rgbToXYZ(r: number, g: number, b: number, colorSpace: ColorSpace): { x: number; y: number; z: number } {
    // Get RGB to XYZ matrix for color space
    const matrix = this.getRGBtoXYZMatrix(colorSpace);
    
    return {
      x: matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b,
      y: matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b,
      z: matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b
    };
  }

  private xyzToRGB(x: number, y: number, z: number, colorSpace: ColorSpace): { r: number; g: number; b: number } {
    // Get XYZ to RGB matrix for color space
    const matrix = this.getXYZtoRGBMatrix(colorSpace);
    
    return {
      r: matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
      g: matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
      b: matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z
    };
  }

  private getRGBtoXYZMatrix(colorSpace: ColorSpace): number[][] {
    // Simplified matrices for common color spaces
    const matrices: Record<ColorSpace, number[][]> = {
      rec709: [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041]
      ],
      rec2020: [
        [0.6369580, 0.1446169, 0.1688810],
        [0.2627002, 0.6779981, 0.0593017],
        [0.0000000, 0.0280727, 1.0609851]
      ],
      dci_p3: [
        [0.4865709, 0.2656677, 0.1982173],
        [0.2289746, 0.6917385, 0.0792869],
        [0.0000000, 0.0451134, 1.0439444]
      ],
      aces: [
        [0.9525523959, 0.0000000000, 0.0000936786],
        [0.3439664498, 0.7281660966, -0.0721325464],
        [0.0000000000, 0.0000000000, 1.0088251844]
      ]
    };
    
    return matrices[colorSpace];
  }

  private getXYZtoRGBMatrix(colorSpace: ColorSpace): number[][] {
    // Inverse matrices
    const matrices: Record<ColorSpace, number[][]> = {
      rec709: [
        [3.2404542, -1.5371385, -0.4985314],
        [-0.9692660, 1.8760108, 0.0415560],
        [0.0556434, -0.2040259, 1.0572252]
      ],
      rec2020: [
        [1.7166512, -0.3556708, -0.2533663],
        [-0.6666844, 1.6164812, 0.0157685],
        [0.0176399, -0.0427706, 0.9421031]
      ],
      dci_p3: [
        [2.4934969, -0.9313836, -0.4027108],
        [-0.8294890, 1.7626641, 0.0236247],
        [0.0358458, -0.0761724, 0.9568845]
      ],
      aces: [
        [1.0498110175, 0.0000000000, -0.0000974845],
        [-0.4959030231, 1.3733130458, 0.0982400361],
        [0.0000000000, 0.0000000000, 0.9912520182]
      ]
    };
    
    return matrices[colorSpace];
  }

  // ============================================================
  // Process Frame
  // ============================================================

  processFrame(imageData: ImageData, outputSDR = true): ImageData {
    const data = imageData.data;
    const metadata = this.metadata;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Apply inverse transfer function (to linear)
      if (metadata) {
        switch (metadata.transferFunction) {
          case 'pq':
            r = this.pqEOTF(r) / 10000;
            g = this.pqEOTF(g) / 10000;
            b = this.pqEOTF(b) / 10000;
            break;
          case 'hlg':
            r = this.hlgEOTF(r);
            g = this.hlgEOTF(g);
            b = this.hlgEOTF(b);
            break;
        }

        // Convert color space if needed
        if (metadata.colorSpace !== 'rec709') {
          const converted = this.convertColorSpace(r, g, b, metadata.colorSpace, 'rec709');
          r = converted.r;
          g = converted.g;
          b = converted.b;
        }
      }

      // Tone map if outputting SDR
      if (outputSDR) {
        const mapped = this.toneMap(r, g, b);
        r = mapped.r;
        g = mapped.g;
        b = mapped.b;
      }

      // Apply gamma for SDR output
      r = Math.pow(r, 1 / 2.2);
      g = Math.pow(g, 1 / 2.2);
      b = Math.pow(b, 1 / 2.2);

      data[i] = Math.round(Math.max(0, Math.min(255, r * 255)));
      data[i + 1] = Math.round(Math.max(0, Math.min(255, g * 255)));
      data[i + 2] = Math.round(Math.max(0, Math.min(255, b * 255)));
    }

    return imageData;
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

// Utility: smoothstep
declare global {
  interface Math {
    smoothstep(edge0: number, edge1: number, x: number): number;
  }
}

Math.smoothstep = function(edge0: number, edge1: number, x: number): number {
  // Guard against a zero-width edge interval (would divide by zero → NaN).
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export default HDREngine;
