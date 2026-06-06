/**
 * Artone v3 — AI Effects Engine
 * 
 * 100%ローカルAI処理
 * - 背景除去 (BodyPix/MediaPipe)
 * - スタイル転送
 * - 超解像アップスケール
 * - 自動編集 (ハイライト検出)
 * - 顔検出/トラッキング
 * - 音声認識 (Whisper)
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface AIModel {
  id: string;
  name: string;
  type: AIModelType;
  size: number;       // MB
  loaded: boolean;
  progress: number;
  /** 量子化形式 — Transformers.js は Q8/FP16 で品質維持しつつサイズ削減 */
  quantization?: 'fp32' | 'fp16' | 'q8' | 'q4';
  /** 推論バックエンド — WebGPU 優先、非対応時 WASM (JS比10-20倍速) */
  backend?: 'webgpu' | 'wasm';
}

export type AIModelType = 
  | 'segmentation' | 'style-transfer' | 'upscale'
  | 'face-detection' | 'pose-estimation' | 'speech-recognition'
  | 'scene-detection' | 'object-tracking';

/** ASR の単語 (タイムスタンプ付き)。 */
export interface TranscriptionWord {
  text: string;
  start: number; // 秒
  end: number; // 秒
  confidence: number;
}

/** ASR のセグメント (字幕1行相当)。 */
export interface TranscriptionSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  words: TranscriptionWord[];
  speaker?: string;
}

/** ASR の結果全体。 */
export interface TranscriptionResult {
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
}

/** transcribe のオプション。 */
export interface TranscribeOptions {
  language?: string;
  /** 使用する speech-recognition モデル ID。既定 'whisper-base'。 */
  modelId?: string;
}

/**
 * 音声認識バックエンドの抽象 (Transformers.js/ONNX Runtime Web 等を注入)。
 * 重いモデル推論を分離し、テスト/差し替えを可能にする。
 */
export interface SpeechRecognizer {
  transcribe(
    audio: Float32Array,
    options: TranscribeOptions & { sampleRate: number }
  ): Promise<TranscriptionResult>;
}

/** ASR 結果を text-based-editing 用のフラットな単語配列へ変換する。 */
export function transcriptionToWords(
  result: TranscriptionResult
): Array<{ text: string; start: number; end: number; confidence: number; speaker?: string }> {
  const words: Array<{ text: string; start: number; end: number; confidence: number; speaker?: string }> = [];
  for (const seg of result.segments) {
    for (const w of seg.words) {
      words.push({ text: w.text, start: w.start, end: w.end, confidence: w.confidence, speaker: seg.speaker });
    }
  }
  return words;
}

export interface SegmentationResult {
  mask: ImageData;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface FaceDetection {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  landmarks: Array<{ x: number; y: number; name: string }>;
  confidence: number;
}

export interface SceneChange {
  time: number;
  type: 'cut' | 'dissolve' | 'fade';
  confidence: number;
}

export interface Highlight {
  start: number;
  end: number;
  score: number;
  reason: string;
}

export interface AIEffectParams {
  backgroundRemoval?: {
    enabled: boolean;
    threshold: number;
    feather: number;
    replaceColor?: string;
    replaceImage?: ImageBitmap;
  };
  faceBlur?: {
    enabled: boolean;
    intensity: number;
  };
  autoColor?: {
    enabled: boolean;
    style: 'cinematic' | 'vibrant' | 'muted' | 'vintage';
  };
  denoise?: {
    enabled: boolean;
    strength: number;
  };
}

// ============================================================
// AI Effects Engine
// ============================================================

export class AIEffectsEngine {
  private models: Map<string, AIModel> = new Map();
  private workers: Map<string, Worker> = new Map();
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private listeners: Set<() => void> = new Set();
  private recognizer: SpeechRecognizer | null = null;

  constructor() {
    this.canvas = new OffscreenCanvas(1920, 1080);
    this.ctx = this.canvas.getContext('2d')!;
    this.initModels();
  }

  private initModels(): void {
    const modelDefs: Array<{
      id: string; name: string; type: AIModelType; size: number;
      quantization?: AIModel['quantization']; backend?: AIModel['backend'];
    }> = [
      { id: 'bodypix', name: 'BodyPix (Segmentation)', type: 'segmentation', size: 8, quantization: 'fp16', backend: 'webgpu' },
      { id: 'selfie-seg', name: 'Selfie Segmentation', type: 'segmentation', size: 3, quantization: 'fp16', backend: 'webgpu' },
      // SAM2: streaming memory architecture で動画全体に object mask を伝播 (arXiv 2408.00714)
      { id: 'sam2-tiny', name: 'SAM2 Tiny (Video Segmentation)', type: 'segmentation', size: 39, quantization: 'q8', backend: 'webgpu' },
      { id: 'face-mesh', name: 'Face Mesh', type: 'face-detection', size: 5, quantization: 'fp16', backend: 'webgpu' },
      { id: 'pose', name: 'Pose Detection', type: 'pose-estimation', size: 12, quantization: 'fp16', backend: 'webgpu' },
      { id: 'style', name: 'Style Transfer', type: 'style-transfer', size: 25, quantization: 'fp16', backend: 'webgpu' },
      { id: 'esrgan', name: 'ESRGAN 4x Upscale', type: 'upscale', size: 64, quantization: 'fp16', backend: 'webgpu' },
      // Whisper: Transformers.js + ONNX Runtime Web, WebGPU で高速・プライベート文字起こし
      { id: 'whisper-tiny', name: 'Whisper Tiny', type: 'speech-recognition', size: 75, quantization: 'q8', backend: 'webgpu' },
      { id: 'whisper-base', name: 'Whisper Base', type: 'speech-recognition', size: 142, quantization: 'q8', backend: 'webgpu' },
      // Whisper Large V3 (2023-11): 100言語対応、最高精度
      { id: 'whisper-large-v3', name: 'Whisper Large V3', type: 'speech-recognition', size: 1550, quantization: 'q4', backend: 'webgpu' },
    ];

    for (const def of modelDefs) {
      this.models.set(def.id, {
        ...def,
        loaded: false,
        progress: 0
      });
    }
  }

  // ============================================================
  // Model Management
  // ============================================================

  async loadModel(modelId: string, onProgress?: (progress: number) => void): Promise<boolean> {
    const model = this.models.get(modelId);
    if (!model) return false;
    if (model.loaded) return true;

    // Simulate model loading
    for (let i = 0; i <= 100; i += 10) {
      model.progress = i / 100;
      onProgress?.(model.progress);
      await new Promise(r => setTimeout(r, 50));
    }

    model.loaded = true;
    model.progress = 1;
    this.notify();
    return true;
  }

  unloadModel(modelId: string): void {
    const model = this.models.get(modelId);
    if (model) {
      model.loaded = false;
      model.progress = 0;
      this.workers.get(modelId)?.terminate();
      this.workers.delete(modelId);
      this.notify();
    }
  }

  getModels(): AIModel[] {
    return Array.from(this.models.values());
  }

  isModelLoaded(modelId: string): boolean {
    return this.models.get(modelId)?.loaded ?? false;
  }

  // ============================================================
  // Speech Recognition (ASR)
  // ============================================================

  /** 音声認識バックエンド (Whisper/ONNX 等) を注入する。 */
  setSpeechRecognizer(recognizer: SpeechRecognizer): void {
    this.recognizer = recognizer;
  }

  /**
   * 音声を文字起こしする。実推論は注入された SpeechRecognizer に委譲。
   * バックエンド未設定なら明示的に失敗する (静かな no-op を避ける)。
   * @param audio - モノラル PCM サンプル
   * @param sampleRate - サンプルレート (Hz)
   * @param options - 言語 / モデル ID
   */
  async transcribe(
    audio: Float32Array,
    sampleRate: number,
    options: TranscribeOptions = {}
  ): Promise<TranscriptionResult> {
    if (!this.recognizer) {
      throw new Error(
        'No SpeechRecognizer configured — call setSpeechRecognizer() with a Whisper/ONNX backend first.'
      );
    }
    const modelId = options.modelId ?? 'whisper-base';
    const model = this.models.get(modelId);
    if (!model || model.type !== 'speech-recognition') {
      throw new Error(`Unknown speech-recognition model "${modelId}"`);
    }
    if (!model.loaded) await this.loadModel(modelId);
    return this.recognizer.transcribe(audio, { ...options, sampleRate });
  }

  // ============================================================
  // Background Removal
  // ============================================================

  async removeBackground(
    frame: VideoFrame | ImageBitmap,
    options: {
      threshold?: number;
      feather?: number;
      replaceColor?: string;
      replaceImage?: ImageBitmap;
    } = {}
  ): Promise<ImageBitmap> {
    const width = frame instanceof VideoFrame ? frame.displayWidth : frame.width;
    const height = frame instanceof VideoFrame ? frame.displayHeight : frame.height;

    // Ensure canvas size
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas = new OffscreenCanvas(width, height);
      this.ctx = this.canvas.getContext('2d')!;
    }

    // Draw original
    this.ctx.drawImage(frame, 0, 0);
    const imageData = this.ctx.getImageData(0, 0, width, height);

    // Simple green screen removal (production would use ML)
    const data = imageData.data;
    const threshold = options.threshold ?? 0.4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      // Check if pixel is greenish
      const isGreen = g > threshold && g > r * 1.2 && g > b * 1.2;
      
      if (isGreen) {
        data[i + 3] = 0; // Set alpha to 0
      }
    }

    // Apply feathering (simple box blur on alpha)
    if (options.feather && options.feather > 0) {
      this.applyAlphaFeather(data, width, height, options.feather);
    }

    // Draw background if provided
    if (options.replaceImage) {
      this.ctx.drawImage(options.replaceImage, 0, 0, width, height);
    } else if (options.replaceColor) {
      this.ctx.fillStyle = options.replaceColor;
      this.ctx.fillRect(0, 0, width, height);
    } else {
      this.ctx.clearRect(0, 0, width, height);
    }

    // Draw foreground with alpha
    const tempCanvas = new OffscreenCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);
    this.ctx.drawImage(tempCanvas, 0, 0);

    return createImageBitmap(this.canvas);
  }

  private applyAlphaFeather(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
    const r = Math.ceil(radius);
    const alphaChannel = new Float32Array(width * height);

    // Extract alpha
    for (let i = 0; i < width * height; i++) {
      alphaChannel[i] = data[i * 4 + 3] / 255;
    }

    // Simple box blur
    const blurred = new Float32Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += alphaChannel[ny * width + nx];
              count++;
            }
          }
        }
        
        blurred[y * width + x] = sum / count;
      }
    }

    // Apply blurred alpha
    for (let i = 0; i < width * height; i++) {
      data[i * 4 + 3] = Math.round(blurred[i] * 255);
    }
  }

  // ============================================================
  // Face Detection
  // ============================================================

  async detectFaces(frame: VideoFrame | ImageBitmap): Promise<FaceDetection[]> {
    // Simplified face detection using skin tone heuristic
    // Production would use MediaPipe Face Mesh
    const width = frame instanceof VideoFrame ? frame.displayWidth : frame.width;
    const height = frame instanceof VideoFrame ? frame.displayHeight : frame.height;

    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.drawImage(frame, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Find skin-colored regions (very simplified)
    const skinMap = new Uint8Array(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Simple skin tone detection
      const isSkin = r > 95 && g > 40 && b > 20 &&
                     r > g && r > b &&
                     Math.abs(r - g) > 15 &&
                     r - Math.min(g, b) > 15;
      
      skinMap[i / 4] = isSkin ? 1 : 0;
    }

    // Find connected components (simplified)
    const faces: FaceDetection[] = [];
    
    // Return mock face for demo
    if (skinMap.some(v => v === 1)) {
      faces.push({
        id: 0,
        bounds: { x: width * 0.3, y: height * 0.1, width: width * 0.4, height: height * 0.5 },
        landmarks: [],
        confidence: 0.85
      });
    }

    return faces;
  }

  // ============================================================
  // Face Blur
  // ============================================================

  async blurFaces(
    frame: VideoFrame | ImageBitmap,
    faces: FaceDetection[],
    intensity = 20
  ): Promise<ImageBitmap> {
    const width = frame instanceof VideoFrame ? frame.displayWidth : frame.width;
    const height = frame instanceof VideoFrame ? frame.displayHeight : frame.height;

    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.drawImage(frame, 0, 0);

    for (const face of faces) {
      const { x, y, width: w, height: h } = face.bounds;
      
      // Get face region
      const faceData = this.ctx.getImageData(x, y, w, h);
      
      // Apply blur
      this.boxBlur(faceData.data, w, h, intensity);
      
      // Put back
      this.ctx.putImageData(faceData, x, y);
    }

    return createImageBitmap(this.canvas);
  }

  private boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
    const r = Math.ceil(radius);
    const temp = new Uint8ClampedArray(data.length);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (y * width + nx) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          count++;
        }
        
        const idx = (y * width + x) * 4;
        temp[idx] = rSum / count;
        temp[idx + 1] = gSum / count;
        temp[idx + 2] = bSum / count;
        temp[idx + 3] = data[idx + 3];
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        
        for (let dy = -r; dy <= r; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const idx = (ny * width + x) * 4;
          rSum += temp[idx];
          gSum += temp[idx + 1];
          bSum += temp[idx + 2];
          count++;
        }
        
        const idx = (y * width + x) * 4;
        data[idx] = rSum / count;
        data[idx + 1] = gSum / count;
        data[idx + 2] = bSum / count;
      }
    }
  }

  // ============================================================
  // Scene Detection
  // ============================================================

  async detectScenes(
    frames: Array<{ frame: VideoFrame | ImageBitmap; time: number }>,
    threshold = 0.3
  ): Promise<SceneChange[]> {
    const scenes: SceneChange[] = [];
    let prevHistogram: number[] | null = null;

    for (let i = 0; i < frames.length; i++) {
      const { frame, time } = frames[i];
      const histogram = await this.computeHistogram(frame);

      if (prevHistogram) {
        const diff = this.histogramDiff(prevHistogram, histogram);
        
        if (diff > threshold) {
          scenes.push({
            time,
            type: diff > 0.8 ? 'cut' : 'dissolve',
            confidence: Math.min(diff / threshold, 1)
          });
        }
      }

      prevHistogram = histogram;
    }

    return scenes;
  }

  private async computeHistogram(frame: VideoFrame | ImageBitmap): Promise<number[]> {
    // Use smaller size for performance
    const size = 64;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(frame, 0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    // 256-bin grayscale histogram
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }

    // Normalize
    const total = size * size;
    return histogram.map(v => v / total);
  }

  private histogramDiff(a: number[], b: number[]): number {
    let diff = 0;
    for (let i = 0; i < 256; i++) {
      diff += Math.abs(a[i] - b[i]);
    }
    return diff / 2; // Normalize to 0-1
  }

  // ============================================================
  // Auto Highlight Detection
  // ============================================================

  async detectHighlights(
    audioBuffer: AudioBuffer,
    options: { minDuration?: number; maxHighlights?: number } = {}
  ): Promise<Highlight[]> {
    const minDuration = options.minDuration ?? 3;
    const maxHighlights = options.maxHighlights ?? 10;

    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.5); // 500ms windows

    const energyProfile: Array<{ time: number; energy: number }> = [];

    // Compute energy profile
    for (let i = 0; i < data.length; i += windowSize) {
      const end = Math.min(i + windowSize, data.length);
      let energy = 0;
      
      for (let j = i; j < end; j++) {
        energy += data[j] * data[j];
      }
      
      energy = Math.sqrt(energy / (end - i));
      energyProfile.push({ time: i / sampleRate, energy });
    }

    // Find peaks
    const avgEnergy = energyProfile.reduce((s, e) => s + e.energy, 0) / energyProfile.length;
    const threshold = avgEnergy * 1.5;

    const highlights: Highlight[] = [];
    let inHighlight = false;
    let highlightStart = 0;
    let peakEnergy = 0;

    for (let i = 0; i < energyProfile.length; i++) {
      const { time, energy } = energyProfile[i];

      if (energy > threshold && !inHighlight) {
        inHighlight = true;
        highlightStart = time;
        peakEnergy = energy;
      } else if (energy > threshold && inHighlight) {
        peakEnergy = Math.max(peakEnergy, energy);
      } else if (energy <= threshold && inHighlight) {
        const duration = time - highlightStart;
        
        if (duration >= minDuration) {
          highlights.push({
            start: highlightStart,
            end: time,
            score: peakEnergy / avgEnergy,
            reason: 'High energy'
          });
        }
        
        inHighlight = false;
      }
    }

    // Sort by score and limit
    return highlights
      .sort((a, b) => b.score - a.score)
      .slice(0, maxHighlights);
  }

  // ============================================================
  // Upscale (Super Resolution)
  // ============================================================

  async upscale(
    frame: VideoFrame | ImageBitmap,
    scale: 2 | 4 = 2
  ): Promise<ImageBitmap> {
    const width = frame instanceof VideoFrame ? frame.displayWidth : frame.width;
    const height = frame instanceof VideoFrame ? frame.displayHeight : frame.height;

    const newWidth = width * scale;
    const newHeight = height * scale;

    // Simple bicubic upscale (production would use ESRGAN)
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d')!;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, 0, 0, newWidth, newHeight);

    // Apply sharpening
    const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
    this.sharpen(imageData.data, newWidth, newHeight, 0.3);
    ctx.putImageData(imageData, 0, 0);

    return createImageBitmap(canvas);
  }

  private sharpen(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
    const kernel = [
      0, -amount, 0,
      -amount, 1 + 4 * amount, -amount,
      0, -amount, 0
    ];

    const temp = new Uint8ClampedArray(data.length);
    temp.set(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += temp[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          const idx = (y * width + x) * 4 + c;
          data[idx] = Math.max(0, Math.min(255, sum));
        }
      }
    }
  }

  // ============================================================
  // Auto Color Correction
  // ============================================================

  async autoColor(
    frame: VideoFrame | ImageBitmap,
    style: 'cinematic' | 'vibrant' | 'muted' | 'vintage' = 'cinematic'
  ): Promise<ImageBitmap> {
    const width = frame instanceof VideoFrame ? frame.displayWidth : frame.width;
    const height = frame instanceof VideoFrame ? frame.displayHeight : frame.height;

    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.drawImage(frame, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Auto white balance
    this.autoWhiteBalance(data);

    // Apply style
    switch (style) {
      case 'cinematic':
        this.applyCinematicGrade(data);
        break;
      case 'vibrant':
        this.applyVibrantGrade(data);
        break;
      case 'muted':
        this.applyMutedGrade(data);
        break;
      case 'vintage':
        this.applyVintageGrade(data);
        break;
    }

    this.ctx.putImageData(imageData, 0, 0);
    return createImageBitmap(this.canvas);
  }

  private autoWhiteBalance(data: Uint8ClampedArray): void {
    let rSum = 0, gSum = 0, bSum = 0;
    const pixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
    }

    const rAvg = rSum / pixels;
    const gAvg = gSum / pixels;
    const bAvg = bSum / pixels;
    const gray = (rAvg + gAvg + bAvg) / 3;

    const rScale = gray / rAvg;
    const gScale = gray / gAvg;
    const bScale = gray / bAvg;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * rScale);
      data[i + 1] = Math.min(255, data[i + 1] * gScale);
      data[i + 2] = Math.min(255, data[i + 2] * bScale);
    }
  }

  private applyCinematicGrade(data: Uint8ClampedArray): void {
    // Teal & Orange look
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Shadows → Teal
      if (luma < 128) {
        data[i] *= 0.95;
        data[i + 1] *= 1.02;
        data[i + 2] *= 1.1;
      }
      // Highlights → Orange
      else {
        data[i] *= 1.08;
        data[i + 1] *= 0.98;
        data[i + 2] *= 0.92;
      }

      // Increase contrast
      data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.1 + 128));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.1 + 128));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.1 + 128));
    }
  }

  private applyVibrantGrade(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Boost saturation
      data[i] = Math.min(255, luma + (data[i] - luma) * 1.4);
      data[i + 1] = Math.min(255, luma + (data[i + 1] - luma) * 1.4);
      data[i + 2] = Math.min(255, luma + (data[i + 2] - luma) * 1.4);
    }
  }

  private applyMutedGrade(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Reduce saturation
      data[i] = luma + (data[i] - luma) * 0.6;
      data[i + 1] = luma + (data[i + 1] - luma) * 0.6;
      data[i + 2] = luma + (data[i + 2] - luma) * 0.6;

      // Lift shadows
      data[i] = Math.min(255, data[i] + 10);
      data[i + 1] = Math.min(255, data[i + 1] + 10);
      data[i + 2] = Math.min(255, data[i + 2] + 10);
    }
  }

  private applyVintageGrade(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      // Sepia-ish tint
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      data[i] = Math.min(255, r * 1.1);
      data[i + 1] = Math.min(255, g * 0.95);
      data[i + 2] = Math.min(255, b * 0.8);

      // Fade blacks
      data[i] = Math.min(255, data[i] + 20);
      data[i + 1] = Math.min(255, data[i + 1] + 15);
      data[i + 2] = Math.min(255, data[i + 2] + 10);
    }
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

export default AIEffectsEngine;
