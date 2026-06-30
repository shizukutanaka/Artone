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
  }

  setMode(mode: WaveformMode): void {
    this.mode = mode;
  }

  /** VideoFrame または ImageData から ImageData を取得する */
  private extractImageData(frame: VideoFrame | ImageData): ImageData {
    if (frame instanceof VideoFrame) {
      const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      // willReadFrequently: getImageData() is called every frame; without it
      // Chrome keeps the canvas GPU-backed and each read triggers a slow
      // GPU→CPU readback (Qiita: canvas パフォーマンス向上).
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      tempCtx.drawImage(frame, 0, 0);
      return tempCtx.getImageData(0, 0, frame.displayWidth, frame.displayHeight);
    }
    return frame;
  }

  /** ピクセルデータを X 位置ごとに集計する */
  private buildAccumulator(
    data: Uint8ClampedArray,
    frameWidth: number,
    frameHeight: number,
    scopeWidth: number
  ): Map<number, { r: number[]; g: number[]; b: number[]; y: number[] }> {
    const scaleX = scopeWidth / frameWidth;
    const acc = new Map<number, { r: number[]; g: number[]; b: number[]; y: number[] }>();

    for (let x = 0; x < frameWidth; x++) {
      const scopeX = Math.floor(x * scaleX);
      if (!acc.has(scopeX)) acc.set(scopeX, { r: [], g: [], b: [], y: [] });
      const col = acc.get(scopeX)!;

      for (let y = 0; y < frameHeight; y++) {
        const idx = (y * frameWidth + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        col.r.push(r); col.g.push(g); col.b.push(b); col.y.push(luma);
      }
    }
    return acc;
  }

  analyze(frame: VideoFrame | ImageData): ImageBitmap {
    const { width, height } = this.config;

    // Clear
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    const imageData = this.extractImageData(frame);
    const { data, width: frameWidth, height: frameHeight } = imageData;

    if (this.config.showGraticule) this.drawGraticule();

    const accumulator = this.buildAccumulator(data, frameWidth, frameHeight, width);
    this.ctx.globalAlpha = this.config.brightness * 0.3;
    
    if (this.mode === 'luma') {
      this.ctx.fillStyle = color.textPrimary;
      accumulator.forEach((acc, x) => {
        acc.y.forEach(y => {
          const scopeY = height - (y / 255) * height;
          this.ctx.fillRect(x, scopeY, 1, 1);
        });
      });
    } else if (this.mode === 'rgb') {
      accumulator.forEach((acc, x) => {
        // Red
        this.ctx.fillStyle = SCOPE_RED;
        acc.r.forEach(v => {
          const scopeY = height - (v / 255) * height;
          this.ctx.fillRect(x, scopeY, 1, 1);
        });
        // Green
        this.ctx.fillStyle = SCOPE_GREEN;
        acc.g.forEach(v => {
          const scopeY = height - (v / 255) * height;
          this.ctx.fillRect(x, scopeY, 1, 1);
        });
        // Blue
        this.ctx.fillStyle = SCOPE_BLUE;
        acc.b.forEach(v => {
          const scopeY = height - (v / 255) * height;
          this.ctx.fillRect(x, scopeY, 1, 1);
        });
      });
    } else if (this.mode === 'parade') {
      const thirdWidth = width / 3;
      
      accumulator.forEach((acc, x) => {
        const paradeX = x / 3;
        
        // Red (left third)
        this.ctx.fillStyle = SCOPE_RED;
        acc.r.forEach(v => {
          const scopeY = height - (v / 255) * height;
          this.ctx.fillRect(paradeX, scopeY, 1, 1);
        });
        
        // Green (middle third)
        this.ctx.fillStyle = SCOPE_GREEN;
        acc.g.forEach(v => {
          const scopeY = height - (v / 255) * height;
          this.ctx.fillRect(paradeX + thirdWidth, scopeY, 1, 1);
        });
        
        // Blue (right third)
        this.ctx.fillStyle = SCOPE_BLUE;
        acc.b.forEach(v => {
          const scopeY = height - (v / 255) * height;
          this.ctx.fillRect(paradeX + thirdWidth * 2, scopeY, 1, 1);
        });
      });
    }
    
    this.ctx.globalAlpha = 1;
    
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
      const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      // willReadFrequently: getImageData() is called every frame; without it
      // Chrome keeps the canvas GPU-backed and each read triggers a slow
      // GPU→CPU readback (Qiita: canvas パフォーマンス向上).
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      tempCtx.drawImage(frame, 0, 0);
      imageData = tempCtx.getImageData(0, 0, frame.displayWidth, frame.displayHeight);
    } else {
      imageData = frame;
    }
    
    const { data, width: frameWidth, height: frameHeight } = imageData;
    
    // Sample pixels (downsample for performance)
    const sampleStep = Math.max(1, Math.floor(frameWidth * frameHeight / 50000));
    
    this.ctx.globalAlpha = this.config.brightness * 0.5;
    
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert RGB to YUV (BT.709) — ベクトルスコープは U/V (色差) のみ使用
      const u = -0.1146 * r - 0.3854 * g + 0.5 * b; // Cb
      const v = 0.5 * r - 0.4542 * g - 0.0458 * b;  // Cr
      
      // Map to scope coordinates
      const scopeX = centerX + (u / 128) * radius * this.config.scale;
      const scopeY = centerY - (v / 128) * radius * this.config.scale;
      
      // Color based on mode
      if (this.mode === 'standard') {
        this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      } else if (this.mode === 'skin-tone') {
        // Highlight skin tones (I-line region)
        const angle = Math.atan2(v, u) * (180 / Math.PI);
        const isSkinTone = angle >= 15 && angle <= 35;
        this.ctx.fillStyle = isSkinTone ? SCOPE_SKIN : color.surface4;
      } else {
        this.ctx.fillStyle = color.textPrimary;
      }
      
      this.ctx.fillRect(scopeX, scopeY, 2, 2);
    }
    
    this.ctx.globalAlpha = 1;
    
    return this.canvas.transferToImageBitmap();
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
      const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      // willReadFrequently: getImageData() is called every frame; without it
      // Chrome keeps the canvas GPU-backed and each read triggers a slow
      // GPU→CPU readback (Qiita: canvas パフォーマンス向上).
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      tempCtx.drawImage(frame, 0, 0);
      imageData = tempCtx.getImageData(0, 0, frame.displayWidth, frame.displayHeight);
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
      const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      // willReadFrequently: getImageData() is called every frame; without it
      // Chrome keeps the canvas GPU-backed and each read triggers a slow
      // GPU→CPU readback (Qiita: canvas パフォーマンス向上).
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      tempCtx.drawImage(frame, 0, 0);
      imageData = tempCtx.getImageData(0, 0, frame.displayWidth, frame.displayHeight);
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
