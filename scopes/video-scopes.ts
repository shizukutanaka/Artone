import { color } from '../app/design-system';
/**
 * Artone v3 — Video Scopes
 * 
 * プロフェッショナル級スコープ
 * - 波形 (Waveform)
 * - ベクトルスコープ (Vectorscope)
 * - ヒストグラム (Histogram)
 * - RGBパレード (RGB Parade)
 * 
 * Carmack: GPU加速、リアルタイム60fps
 * Martin: 単一責務、拡張性
 * Pike: 明快なデータフロー
 */

// ============================================================
// Types
// ============================================================

export type ScopeType = 'waveform' | 'vectorscope' | 'histogram' | 'parade';
export type WaveformMode = 'luma' | 'rgb' | 'parade';
export type VectorscopeMode = 'standard' | 'skin-tone' | 'hue-vs-sat';

// Canvas描画用プライマリカラー定数 (色空間定義 — design-system とは独立)
const SCOPE_RED   = '#ff3333';  // R channel (BT.709)
const SCOPE_GREEN = '#33ff33';  // G channel (BT.709)
const SCOPE_BLUE  = '#3333ff';  // B channel (BT.709)
const SCOPE_SKIN  = '#e0a080';  // skin tone reference

// Pre-parsed RGB components for waveform ImageData rendering.
// These avoid string parsing inside the 60fps render loop.
const WAVE_R_R = 0xff, WAVE_R_G = 0x33, WAVE_R_B = 0x33;  // #ff3333
const WAVE_G_R = 0x33, WAVE_G_G = 0xff, WAVE_G_B = 0x33;  // #33ff33
const WAVE_B_R = 0x33, WAVE_B_G = 0x33, WAVE_B_B = 0xff;  // #3333ff


export interface ScopeConfig {
  type: ScopeType;
  width: number;
  height: number;
  scale: number;
  brightness: number;
  showGraticule: boolean;
  backgroundColor: string;
}

export interface ScopeAnalysis {
  min: { r: number; g: number; b: number; y: number };
  max: { r: number; g: number; b: number; y: number };
  average: { r: number; g: number; b: number; y: number };
  clipping: { shadows: number; highlights: number };
  skinTonePercentage: number;
}

// ============================================================
// Waveform Scope
// ============================================================

export class WaveformScope {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private config: ScopeConfig;
  private mode: WaveformMode = 'luma';
  // Cached temp canvas for VideoFrame→ImageData extraction. Reused across
  // frames; recreated only when frame dimensions change (avoids per-frame alloc).
  private _tempCanvas: OffscreenCanvas | null = null;
  private _tempCtx: OffscreenCanvasRenderingContext2D | null = null;
  // Pre-allocated density maps: flat [scopeX * 256 + brightness] = pixel count.
  // Replaces per-frame Map + dynamic array allocation (~thousands of GC objects
  // at 60fps).  Size = config.width × 256 (fixed at construction time).
  private readonly waveR: Uint32Array;
  private readonly waveG: Uint32Array;
  private readonly waveB: Uint32Array;
  private readonly waveY: Uint32Array;
  // Separate dot canvas for waveform density rendering. Same pattern as Vectorscope:
  // graticule stays on main canvas, density dots written to waveImageData via
  // putImageData on dotCtx, then composited with ctx.drawImage(). Replaces up to
  // 300K fillRect(1,1)+globalAlpha API calls per frame (RGB mode) with one drawImage.
  private readonly dotCanvas: OffscreenCanvas;
  private readonly dotCtx: OffscreenCanvasRenderingContext2D;
  private readonly waveImageData: ImageData;

  constructor(config: Partial<ScopeConfig> = {}) {
    this.config = {
      type: 'waveform',
      width: 400,
      height: 256,
      scale: 1,
      brightness: 1,
      showGraticule: true,
      backgroundColor: color.surface0,
      ...config
    };

    this.canvas = new OffscreenCanvas(this.config.width, this.config.height);
    this.ctx = this.canvas.getContext('2d')!;

    const buckets = this.config.width * 256;
    this.waveR = new Uint32Array(buckets);
    this.waveG = new Uint32Array(buckets);
    this.waveB = new Uint32Array(buckets);
    this.waveY = new Uint32Array(buckets);
    this.dotCanvas = new OffscreenCanvas(this.config.width, this.config.height);
    this.dotCtx = this.dotCanvas.getContext('2d')!;
    this.waveImageData = new ImageData(this.config.width, this.config.height);
  }

  setMode(mode: WaveformMode): void {
    this.mode = mode;
  }

  /** VideoFrame または ImageData から ImageData を取得する */
  private extractImageData(frame: VideoFrame | ImageData): ImageData {
    if (frame instanceof VideoFrame) {
      const w = frame.displayWidth, h = frame.displayHeight;
      // Reuse temp canvas when dimensions are unchanged (typical at 60fps).
      // Recreate only on resolution change to avoid per-frame OffscreenCanvas alloc.
      if (!this._tempCanvas || this._tempCanvas.width !== w || this._tempCanvas.height !== h) {
        this._tempCanvas = new OffscreenCanvas(w, h);
        // willReadFrequently: keeps canvas CPU-backed so getImageData() avoids
        // GPU→CPU readback stall (Qiita: canvas パフォーマンス向上).
        this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true })!;
      }
      this._tempCtx!.drawImage(frame, 0, 0);
      return this._tempCtx!.getImageData(0, 0, w, h);
    }
    return frame;
  }

  /**
   * Accumulate pixel counts into the flat density maps.
   * Replaces the old Map<number,{r:[],g:[],b:[],y:[]}> buildAccumulator()
   * which allocated thousands of dynamic-growing arrays per frame.
   */
  private fillWaveBufs(
    data: Uint8ClampedArray,
    frameWidth: number,
    frameHeight: number,
    scopeWidth: number,
  ): void {
    const { waveR, waveG, waveB, waveY } = this;
    waveR.fill(0); waveG.fill(0); waveB.fill(0); waveY.fill(0);

    const scaleX = scopeWidth / frameWidth;
    for (let x = 0; x < frameWidth; x++) {
      const base = Math.floor(x * scaleX) * 256;
      for (let y = 0; y < frameHeight; y++) {
        const idx = (y * frameWidth + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const luma = (r * 54 + g * 183 + b * 19) >> 8;
        waveR[base + r]++;
        waveG[base + g]++;
        waveB[base + b]++;
        waveY[base + luma]++;
      }
    }
  }

  analyze(frame: VideoFrame | ImageData): ImageBitmap {
    const { width, height } = this.config;

    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    const imageData = this.extractImageData(frame);
    const { data, width: frameWidth, height: frameHeight } = imageData;

    if (this.config.showGraticule) this.drawGraticule();

    this.fillWaveBufs(data, frameWidth, frameHeight, width);

    // Find global max for opacity normalization (density-map waveform).
    // Opacity is proportional to pixel density — matches professional scope behavior.
    const { waveR, waveG, waveB, waveY } = this;
    let maxCount = 0;
    for (let i = 0, len = width * 256; i < len; i++) {
      if (waveR[i] > maxCount) maxCount = waveR[i];
      if (waveG[i] > maxCount) maxCount = waveG[i];
      if (waveB[i] > maxCount) maxCount = waveB[i];
      if (waveY[i] > maxCount) maxCount = waveY[i];
    }
    if (maxCount === 0) return this.canvas.transferToImageBitmap();

    const scale = this.config.brightness * this.config.scale;

    // Write waveform dots directly to pre-allocated ImageData, then put in one call.
    // Replaces up to 300K fillRect(1,1)+globalAlpha assignments per frame (RGB mode).
    const d = this.waveImageData.data;
    d.fill(0); // clear to transparent

    // Source-over blend one channel color into the ImageData at pixel offset `off`.
    const blendChannel = (off: number, cr: number, cg: number, cb: number, a: number): void => {
      const ia = 255 - a;
      d[off]     = ((cr * a + d[off]     * ia) >> 8);
      d[off + 1] = ((cg * a + d[off + 1] * ia) >> 8);
      d[off + 2] = ((cb * a + d[off + 2] * ia) >> 8);
      d[off + 3] = a + ((d[off + 3] * ia) >> 8);
    };

    if (this.mode === 'luma') {
      for (let x = 0; x < width; x++) {
        const base = x * 256;
        for (let brt = 0; brt < 256; brt++) {
          const count = waveY[base + brt];
          if (count === 0) continue;
          const y = height - Math.ceil((brt / 255) * height);
          const a = Math.min(255, (count / maxCount) * scale * 255) | 0;
          blendChannel((y * width + x) * 4, 255, 255, 255, a);
        }
      }
    } else if (this.mode === 'rgb') {
      for (let x = 0; x < width; x++) {
        const base = x * 256;
        for (let brt = 0; brt < 256; brt++) {
          const y = height - Math.ceil((brt / 255) * height);
          const off = (y * width + x) * 4;
          const cr = waveR[base + brt];
          if (cr > 0) blendChannel(off, WAVE_R_R, WAVE_R_G, WAVE_R_B, Math.min(255, (cr / maxCount) * scale * 255) | 0);
          const cg = waveG[base + brt];
          if (cg > 0) blendChannel(off, WAVE_G_R, WAVE_G_G, WAVE_G_B, Math.min(255, (cg / maxCount) * scale * 255) | 0);
          const cb = waveB[base + brt];
          if (cb > 0) blendChannel(off, WAVE_B_R, WAVE_B_G, WAVE_B_B, Math.min(255, (cb / maxCount) * scale * 255) | 0);
        }
      }
    } else if (this.mode === 'parade') {
      const thirdWidth = Math.floor(width / 3);
      for (let x = 0; x < width; x++) {
        const base = x * 256;
        const paradeX = Math.floor(x / 3);
        for (let brt = 0; brt < 256; brt++) {
          const y = height - Math.ceil((brt / 255) * height);
          const cr = waveR[base + brt];
          if (cr > 0) blendChannel((y * width + paradeX) * 4, WAVE_R_R, WAVE_R_G, WAVE_R_B, Math.min(255, (cr / maxCount) * scale * 255) | 0);
          const cg = waveG[base + brt];
          if (cg > 0) blendChannel((y * width + paradeX + thirdWidth) * 4, WAVE_G_R, WAVE_G_G, WAVE_G_B, Math.min(255, (cg / maxCount) * scale * 255) | 0);
          const cb = waveB[base + brt];
          if (cb > 0) blendChannel((y * width + paradeX + thirdWidth * 2) * 4, WAVE_B_R, WAVE_B_G, WAVE_B_B, Math.min(255, (cb / maxCount) * scale * 255) | 0);
        }
      }
    }

    this.dotCtx.putImageData(this.waveImageData, 0, 0);
    this.ctx.drawImage(this.dotCanvas, 0, 0);
    return this.canvas.transferToImageBitmap();
  }

  private drawGraticule(): void {
    const { width, height } = this.config;
    
    this.ctx.strokeStyle = color.surface3;
    this.ctx.lineWidth = 1;
    
    // Horizontal lines (IRE levels)
    const levels = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    
    this.ctx.beginPath();
    levels.forEach(level => {
      const y = height - (level / 100) * height;
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    });
    this.ctx.stroke();
    
    // Labels
    this.ctx.fillStyle = color.textTertiary;
    this.ctx.font = '10px system-ui';
    this.ctx.textAlign = 'right';
    
    [0, 50, 100].forEach(level => {
      const y = height - (level / 100) * height;
      this.ctx.fillText(`${level}`, 25, y + 3);
    });
    
    // Clipping warning zones
    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, width, height * 0.02); // Highlights
    this.ctx.fillRect(0, height * 0.98, width, height * 0.02); // Shadows
  }
}

// ============================================================
// Vectorscope
// ============================================================

export class Vectorscope {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private config: ScopeConfig;
  private mode: VectorscopeMode = 'standard';
  // Pre-allocated density + colour accumulators for standard-mode rendering.
  // Replaces per-pixel `rgb(r,g,b)` string creation (~50 K new strings/frame at 60 fps)
  // and N individual fillRect calls with a single putImageData per frame.
  // Size = config.width × config.height (fixed at construction time).
  private readonly scopeDensity: Uint32Array;
  private readonly scopeRSum: Uint32Array;
  private readonly scopeGSum: Uint32Array;
  private readonly scopeBSum: Uint32Array;
  // Separate offscreen canvas for scope dots so they composite *over* the
  // graticule (drawn first on the main canvas) via ctx.drawImage().
  private readonly dotCanvas: OffscreenCanvas;
  private readonly dotCtx: OffscreenCanvasRenderingContext2D;
  private readonly dotImageData: ImageData;
  // Cached temp canvas for VideoFrame→ImageData extraction.
  private _tempCanvas: OffscreenCanvas | null = null;
  private _tempCtx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(config: Partial<ScopeConfig> = {}) {
    this.config = {
      type: 'vectorscope',
      width: 300,
      height: 300,
      scale: 1,
      brightness: 1,
      showGraticule: true,
      backgroundColor: color.surface0,
      ...config
    };

    this.canvas = new OffscreenCanvas(this.config.width, this.config.height);
    this.ctx = this.canvas.getContext('2d')!;

    const pixels = this.config.width * this.config.height;
    this.scopeDensity = new Uint32Array(pixels);
    this.scopeRSum    = new Uint32Array(pixels);
    this.scopeGSum    = new Uint32Array(pixels);
    this.scopeBSum    = new Uint32Array(pixels);
    this.dotCanvas    = new OffscreenCanvas(this.config.width, this.config.height);
    this.dotCtx       = this.dotCanvas.getContext('2d')!;
    this.dotImageData = new ImageData(this.config.width, this.config.height);
  }

  setMode(mode: VectorscopeMode): void {
    this.mode = mode;
  }

  analyze(frame: VideoFrame | ImageData): ImageBitmap {
    const { width, height } = this.config;
    const centerX = width / 2;
    const centerY = height / 2;
    // Subtract padding; clamp to ≥1 so ctx.arc() never receives a negative radius.
    const radius = Math.max(1, Math.min(width, height) / 2 - 20);
    
    // Clear
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);
    
    // Draw graticule
    if (this.config.showGraticule) {
      this.drawGraticule(centerX, centerY, radius);
    }
    
    // Get pixel data
    let imageData: ImageData;
    if (frame instanceof VideoFrame) {
      const w = frame.displayWidth, h = frame.displayHeight;
      if (!this._tempCanvas || this._tempCanvas.width !== w || this._tempCanvas.height !== h) {
        this._tempCanvas = new OffscreenCanvas(w, h);
        // willReadFrequently keeps canvas CPU-backed; avoids GPU→CPU readback stall.
        this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true })!;
      }
      this._tempCtx!.drawImage(frame, 0, 0);
      imageData = this._tempCtx!.getImageData(0, 0, w, h);
    } else {
      imageData = frame;
    }

    const { data, width: frameWidth, height: frameHeight } = imageData;

    // Sample pixels (downsample for performance)
    const sampleStep = Math.max(1, Math.floor(frameWidth * frameHeight / 50000));

    if (this.mode === 'standard') {
      this.renderStandardMode(data, centerX, centerY, radius, sampleStep);
    } else if (this.mode === 'skin-tone') {
      this.renderSkinToneMode(data, centerX, centerY, radius, sampleStep);
    } else {
      this.renderHueVsSatMode(data, centerX, centerY, radius, sampleStep);
    }

    return this.canvas.transferToImageBitmap();
  }

  /**
   * Standard mode: true-colour vectorscope dots, density-mapped opacity.
   * Accumulates pixel counts + RGB sums per scope position into pre-allocated
   * Uint32Array buffers, then renders to dotImageData with a single putImageData.
   * Eliminates ~50 K `rgb(r,g,b)` string allocations and fillRect calls per frame.
   */
  private renderStandardMode(
    data: Uint8ClampedArray,
    cx: number, cy: number, radius: number,
    sampleStep: number,
  ): void {
    const { width, height, scale, brightness } = this.config;
    const { scopeDensity, scopeRSum, scopeGSum, scopeBSum } = this;
    scopeDensity.fill(0); scopeRSum.fill(0); scopeGSum.fill(0); scopeBSum.fill(0);

    // Hoist loop-invariant: radius*scale/128 is constant across every pixel
    const rScale = radius * scale / 128;

    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // BT.709 Cb/Cr colour-difference signals
      const u = -0.1146 * r - 0.3854 * g + 0.5   * b;
      const v =  0.5    * r - 0.4542 * g - 0.0458 * b;
      const px = Math.round(cx + u * rScale);
      const py = Math.round(cy - v * rScale);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        const idx = py * width + px;
        scopeDensity[idx]++;
        scopeRSum[idx] += r;
        scopeGSum[idx] += g;
        scopeBSum[idx] += b;
      }
    }

    let maxDensity = 0;
    for (let i = 0, len = width * height; i < len; i++) {
      if (scopeDensity[i] > maxDensity) maxDensity = scopeDensity[i];
    }

    const dotPx = this.dotImageData.data;
    dotPx.fill(0);  // transparent background — composites over graticule
    if (maxDensity > 0) {
      const alphaMul = brightness * 255;
      for (let i = 0, len = width * height; i < len; i++) {
        const cnt = scopeDensity[i];
        if (cnt === 0) continue;
        const alpha = Math.min(255, ((cnt / maxDensity) * alphaMul + 0.5) | 0);
        const avgR = ((scopeRSum[i] / cnt) + 0.5) | 0;
        const avgG = ((scopeGSum[i] / cnt) + 0.5) | 0;
        const avgB = ((scopeBSum[i] / cnt) + 0.5) | 0;
        // Write 2×2 square (matches original fillRect(x, y, 2, 2))
        const px = i % width, py = (i / width) | 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < width && ny < height) {
              const pidx = (ny * width + nx) * 4;
              dotPx[pidx]     = avgR;
              dotPx[pidx + 1] = avgG;
              dotPx[pidx + 2] = avgB;
              dotPx[pidx + 3] = alpha;
            }
          }
        }
      }
    }
    this.dotCtx.putImageData(this.dotImageData, 0, 0);
    this.ctx.drawImage(this.dotCanvas, 0, 0);
  }

  /**
   * Skin-tone mode: highlights the I-line angular sector [15°,35°] in Cb/Cr space.
   * Uses cross-product sector test to replace Math.atan2() per pixel — same
   * technique already applied in HistogramScope.getStats().
   */
  private renderSkinToneMode(
    data: Uint8ClampedArray,
    cx: number, cy: number, radius: number,
    sampleStep: number,
  ): void {
    const { scale, brightness } = this.config;
    // Angular sector [15°,35°] cross-product boundary vectors (BT.709 Cb/Cr).
    // A point (u,v) is inside when: COS15*v - SIN15*u ≥ 0 AND COS35*v - SIN35*u ≤ 0.
    const COS15 = 0.9659, SIN15 = 0.2588;
    const COS35 = 0.8192, SIN35 = 0.5736;
    const rScale = radius * scale / 128;

    this.ctx.globalAlpha = brightness * 0.5;
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const u = -0.1146 * r - 0.3854 * g + 0.5   * b;
      const v =  0.5    * r - 0.4542 * g - 0.0458 * b;
      const isSkinTone = COS15 * v - SIN15 * u >= 0 && COS35 * v - SIN35 * u <= 0;
      this.ctx.fillStyle = isSkinTone ? SCOPE_SKIN : color.surface4;
      this.ctx.fillRect(cx + u * rScale, cy - v * rScale, 2, 2);
    }
    this.ctx.globalAlpha = 1;
  }

  /**
   * Hue-vs-saturation mode: single constant colour — no per-pixel string allocation.
   */
  private renderHueVsSatMode(
    data: Uint8ClampedArray,
    cx: number, cy: number, radius: number,
    sampleStep: number,
  ): void {
    const { scale, brightness } = this.config;
    const rScale = radius * scale / 128;
    this.ctx.globalAlpha = brightness * 0.5;
    this.ctx.fillStyle = color.textPrimary;
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const u = -0.1146 * r - 0.3854 * g + 0.5   * b;
      const v =  0.5    * r - 0.4542 * g - 0.0458 * b;
      this.ctx.fillRect(cx + u * rScale, cy - v * rScale, 2, 2);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawGraticule(cx: number, cy: number, r: number): void {
    this.ctx.strokeStyle = color.surface3;
    this.ctx.lineWidth = 1;
    
    // Outer circle
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Inner circles
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Crosshairs
    this.ctx.beginPath();
    this.ctx.moveTo(cx - r, cy);
    this.ctx.lineTo(cx + r, cy);
    this.ctx.moveTo(cx, cy - r);
    this.ctx.lineTo(cx, cy + r);
    this.ctx.stroke();
    
    // Color targets (75% saturation)
    const colorTargets = [
      { name: 'R', angle: 104, color: SCOPE_RED },
      { name: 'Mg', angle: 61, color: '#ff33ff' /* magenta */ },
      { name: 'B', angle: -13, color: SCOPE_BLUE },
      { name: 'Cy', angle: -104, color: '#00ffff' },
      { name: 'G', angle: -167, color: SCOPE_GREEN },
      { name: 'Yl', angle: 167, color: '#ffff00' }
    ];
    
    colorTargets.forEach(({ name, angle, color: targetColor }) => {
      const rad = (angle * Math.PI) / 180;
      const targetR = r * 0.75;
      const x = cx + Math.cos(rad) * targetR;
      const y = cy - Math.sin(rad) * targetR;

      this.ctx.fillStyle = targetColor;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 8, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.strokeStyle = color.textPrimary;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      
      // Label
      this.ctx.fillStyle = color.textTertiary;
      this.ctx.font = '10px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(name, x, y - 12);
    });
    
    // Skin tone line (I-line)
    if (this.mode === 'skin-tone') {
      this.ctx.strokeStyle = SCOPE_SKIN;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      
      const skinAngle = (25 * Math.PI) / 180; // ~25 degrees
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + Math.cos(skinAngle) * r, cy - Math.sin(skinAngle) * r);
      this.ctx.stroke();
      
      this.ctx.setLineDash([]);
    }
  }
}

// ============================================================
// Histogram
// ============================================================

export class HistogramScope {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private config: ScopeConfig;
  private showRGB = true;
  // Pre-allocated histogram accumulators — reused every analyze() call to avoid
  // 4×Uint32Array(256) GC churn at 60fps (same pattern as audio meter buffers).
  private readonly histR = new Uint32Array(256);
  private readonly histG = new Uint32Array(256);
  private readonly histB = new Uint32Array(256);
  private readonly histY = new Uint32Array(256);
  // Cached temp canvas shared by analyze() and getStats() for VideoFrame extraction.
  private _tempCanvas: OffscreenCanvas | null = null;
  private _tempCtx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(config: Partial<ScopeConfig> = {}) {
    this.config = {
      type: 'histogram',
      width: 256,
      height: 150,
      scale: 1,
      brightness: 1,
      showGraticule: true,
      backgroundColor: color.surface0,
      ...config
    };
    
    this.canvas = new OffscreenCanvas(this.config.width, this.config.height);
    this.ctx = this.canvas.getContext('2d')!;
  }

  setShowRGB(show: boolean): void {
    this.showRGB = show;
  }

  analyze(frame: VideoFrame | ImageData): ImageBitmap {
    const { width, height } = this.config;
    
    // Clear
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);
    
    // Get pixel data
    let imageData: ImageData;
    if (frame instanceof VideoFrame) {
      const w = frame.displayWidth, h = frame.displayHeight;
      if (!this._tempCanvas || this._tempCanvas.width !== w || this._tempCanvas.height !== h) {
        this._tempCanvas = new OffscreenCanvas(w, h);
        // willReadFrequently keeps canvas CPU-backed; avoids GPU→CPU readback stall.
        this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true })!;
      }
      this._tempCtx!.drawImage(frame, 0, 0);
      imageData = this._tempCtx!.getImageData(0, 0, w, h);
    } else {
      imageData = frame;
    }

    const { data } = imageData;

    // Reuse pre-allocated accumulators — fill(0) is O(256), far cheaper than
    // allocating four new Uint32Array(256) instances every frame at 60fps.
    const { histR, histG, histB, histY } = this;
    histR.fill(0); histG.fill(0); histB.fill(0); histY.fill(0);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Integer BT.709 luma approximation: avoids FP per pixel.
      // Coefficients: 54/256≈0.211, 183/256≈0.715, 19/256≈0.074, sum=256.
      const y = (r * 54 + g * 183 + b * 19) >> 8;
      histR[r]++;
      histG[g]++;
      histB[b]++;
      histY[y]++;
    }

    // Manual max loop — avoids spread operator on TypedArray which creates a
    // temporary Array iterator and can trigger GC on every frame.
    let maxAll = 0, maxY = 0;
    for (let i = 0; i < 256; i++) {
      if (histR[i] > maxAll) maxAll = histR[i];
      if (histG[i] > maxAll) maxAll = histG[i];
      if (histB[i] > maxAll) maxAll = histB[i];
      if (histY[i] > maxAll) maxAll = histY[i];
      if (histY[i] > maxY)   maxY   = histY[i];
    }
    
    // Draw graticule
    if (this.config.showGraticule) {
      this.drawGraticule();
    }
    
    // Draw histogram
    const scaleX = width / 256;

    // Guard: zero-pixel frame → all histogram bins are 0 → maxAll = 0 → NaN.
    // Return background-only bitmap instead of producing NaN canvas paths.
    if (maxAll === 0) {
      return this.canvas.transferToImageBitmap();
    }

    if (this.showRGB) {
      // RGB overlay
      this.ctx.globalCompositeOperation = 'screen';
      
      // Red
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
      this.ctx.beginPath();
      this.ctx.moveTo(0, height);
      for (let i = 0; i < 256; i++) {
        const h = (histR[i] / maxAll) * height * this.config.scale;
        this.ctx.lineTo(i * scaleX, height - h);
      }
      this.ctx.lineTo(width, height);
      this.ctx.closePath();
      this.ctx.fill();
      
      // Green
      this.ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
      this.ctx.beginPath();
      this.ctx.moveTo(0, height);
      for (let i = 0; i < 256; i++) {
        const h = (histG[i] / maxAll) * height * this.config.scale;
        this.ctx.lineTo(i * scaleX, height - h);
      }
      this.ctx.lineTo(width, height);
      this.ctx.closePath();
      this.ctx.fill();
      
      // Blue
      this.ctx.fillStyle = 'rgba(0, 0, 255, 0.6)';
      this.ctx.beginPath();
      this.ctx.moveTo(0, height);
      for (let i = 0; i < 256; i++) {
        const h = (histB[i] / maxAll) * height * this.config.scale;
        this.ctx.lineTo(i * scaleX, height - h);
      }
      this.ctx.lineTo(width, height);
      this.ctx.closePath();
      this.ctx.fill();
      
      this.ctx.globalCompositeOperation = 'source-over';
    } else {
      // Luma only — use maxY; maxAll > 0 is already guaranteed above.
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.beginPath();
      this.ctx.moveTo(0, height);
      for (let i = 0; i < 256; i++) {
        const h = maxY > 0 ? (histY[i] / maxY) * height * this.config.scale : 0;
        this.ctx.lineTo(i * scaleX, height - h);
      }
      this.ctx.lineTo(width, height);
      this.ctx.closePath();
      this.ctx.fill();
    }
    
    return this.canvas.transferToImageBitmap();
  }

  private drawGraticule(): void {
    const { width, height } = this.config;
    
    this.ctx.strokeStyle = color.surface3;
    this.ctx.lineWidth = 1;
    
    // Vertical lines at key points
    [0, 64, 128, 192, 255].forEach(v => {
      const x = (v / 255) * width;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    });
    
    // Horizontal guides
    [0.25, 0.5, 0.75].forEach(ratio => {
      const y = height * (1 - ratio);
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    });
    
    // Labels
    this.ctx.fillStyle = color.textTertiary;
    this.ctx.font = '9px system-ui';
    this.ctx.textAlign = 'center';
    
    [0, 128, 255].forEach(v => {
      const x = (v / 255) * width;
      this.ctx.fillText(String(v), x, height - 3);
    });
  }

  // Get statistics
  getStats(frame: VideoFrame | ImageData): ScopeAnalysis {
    let imageData: ImageData;
    if (frame instanceof VideoFrame) {
      const w = frame.displayWidth, h = frame.displayHeight;
      if (!this._tempCanvas || this._tempCanvas.width !== w || this._tempCanvas.height !== h) {
        this._tempCanvas = new OffscreenCanvas(w, h);
        this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true })!;
      }
      this._tempCtx!.drawImage(frame, 0, 0);
      imageData = this._tempCtx!.getImageData(0, 0, w, h);
    } else {
      imageData = frame;
    }
    
    const { data } = imageData;
    const pixelCount = data.length / 4;

    // An empty/zero-dimension frame (a decode glitch or placeholder) would make
    // every `/ pixelCount` below 0/0 = NaN, poisoning the realtime scope display
    // and any auto-grade that reads average.y. Return neutral stats instead.
    if (pixelCount === 0) {
      return {
        min: { r: 0, g: 0, b: 0, y: 0 },
        max: { r: 0, g: 0, b: 0, y: 0 },
        average: { r: 0, g: 0, b: 0, y: 0 },
        clipping: { shadows: 0, highlights: 0 },
        skinTonePercentage: 0,
      };
    }

    let minR = 255, maxR = 0, sumR = 0;
    let minG = 255, maxG = 0, sumG = 0;
    let minB = 255, maxB = 0, sumB = 0;
    let minY = 255, maxY = 0, sumY = 0;
    let shadowClip = 0, highlightClip = 0;
    let skinToneCount = 0;
    
    // Precomputed angular sector boundary for skin tone [15°, 35°] in Cb/Cr space.
    // Cross-product sector test replaces per-pixel Math.atan2 (expensive trig call).
    // A point (u,v) is in [15°,35°] when cross(dir15,(u,v))>=0 AND cross(dir35,(u,v))<=0.
    // cross((ax,ay),(bx,by)) = ax*by - ay*bx
    // dir15 = (cos15°, sin15°) = (0.9659, 0.2588)  →  0.9659*v - 0.2588*u >= 0
    // dir35 = (cos35°, sin35°) = (0.8192, 0.5736)  →  0.8192*v - 0.5736*u <= 0
    const COS15 = 0.9659, SIN15 = 0.2588;
    const COS35 = 0.8192, SIN35 = 0.5736;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Integer BT.709 luma: (r*54 + g*183 + b*19) >> 8, same approx as analyze().
      const y = (r * 54 + g * 183 + b * 19) >> 8;

      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      sumR += r;

      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
      sumG += g;

      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
      sumB += b;

      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumY += y;

      if (r <= 5 || g <= 5 || b <= 5) shadowClip++;
      if (r >= 250 || g >= 250 || b >= 250) highlightClip++;

      // Skin tone: angular sector [15°,35°] in Cb/Cr, luma guard [50,200].
      if (y > 50 && y < 200) {
        const u = -0.1146 * r - 0.3854 * g + 0.5   * b;
        const v =  0.5    * r - 0.4542 * g - 0.0458 * b;
        if (COS15 * v - SIN15 * u >= 0 && COS35 * v - SIN35 * u <= 0) {
          skinToneCount++;
        }
      }
    }
    
    return {
      min: { r: minR, g: minG, b: minB, y: minY },
      max: { r: maxR, g: maxG, b: maxB, y: maxY },
      average: {
        r: sumR / pixelCount,
        g: sumG / pixelCount,
        b: sumB / pixelCount,
        y: sumY / pixelCount
      },
      clipping: {
        shadows: (shadowClip / pixelCount) * 100,
        highlights: (highlightClip / pixelCount) * 100
      },
      skinTonePercentage: (skinToneCount / pixelCount) * 100
    };
  }
}

// ============================================================
// Scopes Manager
// ============================================================

export class ScopesManager {
  private waveform: WaveformScope;
  private vectorscope: Vectorscope;
  private histogram: HistogramScope;
  private enabled = new Set<ScopeType>();
  private rafId: number | null = null;
  // Track user-configured waveform mode so parade analysis doesn't clobber it.
  private waveformMode: WaveformMode = 'luma';

  constructor() {
    this.waveform = new WaveformScope();
    this.vectorscope = new Vectorscope();
    this.histogram = new HistogramScope();
  }

  enable(type: ScopeType): void {
    this.enabled.add(type);
  }

  disable(type: ScopeType): void {
    this.enabled.delete(type);
  }

  toggle(type: ScopeType): boolean {
    if (this.enabled.has(type)) {
      this.enabled.delete(type);
      return false;
    } else {
      this.enabled.add(type);
      return true;
    }
  }

  isEnabled(type: ScopeType): boolean {
    return this.enabled.has(type);
  }

  setWaveformMode(mode: WaveformMode): void {
    this.waveformMode = mode;
    this.waveform.setMode(mode);
  }

  setVectorscopeMode(mode: VectorscopeMode): void {
    this.vectorscope.setMode(mode);
  }

  analyze(frame: VideoFrame): Map<ScopeType, ImageBitmap> {
    const results = new Map<ScopeType, ImageBitmap>();
    
    if (this.enabled.has('waveform')) {
      results.set('waveform', this.waveform.analyze(frame));
    }
    
    if (this.enabled.has('vectorscope')) {
      results.set('vectorscope', this.vectorscope.analyze(frame));
    }
    
    if (this.enabled.has('histogram')) {
      results.set('histogram', this.histogram.analyze(frame));
    }
    
    // Parade is handled by waveform with parade mode.
    // REGRESSION fix: restore the user-configured mode after parade analysis so
    // subsequent waveform renders are not permanently stuck in parade mode.
    if (this.enabled.has('parade')) {
      this.waveform.setMode('parade');
      results.set('parade', this.waveform.analyze(frame));
      this.waveform.setMode(this.waveformMode);
    }
    
    return results;
  }

  getHistogramStats(frame: VideoFrame): ScopeAnalysis {
    return this.histogram.getStats(frame);
  }

  // Start continuous analysis
  startContinuous(getFrame: () => VideoFrame | null, onUpdate: (results: Map<ScopeType, ImageBitmap>) => void): void {
    const loop = () => {
      const frame = getFrame();
      if (frame) {
        const results = this.analyze(frame);
        onUpdate(results);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stopContinuous(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.stopContinuous();
  }
}

// ============================================================
// Scopes Panel UI Component
// ============================================================

export function ScopesPanelUI(_props: { scopes: ScopesManager }): string {
  return `
    <div class="scopes-panel" style="
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 12px;
      background: #0a0a0a;
      border-radius: 8px;
    ">
      <div class="scope-container" data-scope="waveform">
        <div class="scope-header" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        ">
          <span style="color: #888; font-size: 11px;">WAVEFORM</span>
          <select class="scope-mode" style="
            background: #222;
            border: none;
            color: #ccc;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
          ">
            <option value="luma">Luma</option>
            <option value="rgb">RGB</option>
            <option value="parade">Parade</option>
          </select>
        </div>
        <canvas class="scope-canvas" width="400" height="256" style="
          width: 100%;
          border-radius: 4px;
        "></canvas>
      </div>
      
      <div class="scope-container" data-scope="vectorscope">
        <div class="scope-header" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        ">
          <span style="color: #888; font-size: 11px;">VECTORSCOPE</span>
          <select class="scope-mode" style="
            background: #222;
            border: none;
            color: #ccc;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
          ">
            <option value="standard">Standard</option>
            <option value="skin-tone">Skin Tone</option>
          </select>
        </div>
        <canvas class="scope-canvas" width="300" height="300" style="
          width: 100%;
          aspect-ratio: 1;
          border-radius: 4px;
        "></canvas>
      </div>
      
      <div class="scope-container" data-scope="histogram" style="grid-column: span 2;">
        <div class="scope-header" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        ">
          <span style="color: #888; font-size: 11px;">HISTOGRAM</span>
          <label style="display: flex; align-items: center; gap: 4px; color: #666; font-size: 10px;">
            <input type="checkbox" checked class="rgb-toggle"> RGB
          </label>
        </div>
        <canvas class="scope-canvas" width="512" height="150" style="
          width: 100%;
          border-radius: 4px;
        "></canvas>
        <div class="histogram-stats" style="
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 10px;
          color: #666;
        ">
          <span>Min: --</span>
          <span>Avg: --</span>
          <span>Max: --</span>
          <span>Clipping: --%</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// Singleton Export
// ============================================================

export const scopesManager = new ScopesManager();
