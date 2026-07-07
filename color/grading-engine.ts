/**
 * Artone v3 — DaVinci Resolve級カラーグレーディングエンジン
 *
 * Node-based color grading with:
 * - Color Wheels (Lift/Gamma/Gain/Offset)
 * - RGB + Hue Curves
 * - HSL Qualifiers
 * - Power Windows
 * - 3D LUT support
 * - WebGPU acceleration
 *
 * @version 1.0.0
 */

import { applyLUTToBuffer, applyCurvesToBuffer, buildCurve } from './lut-apply';
import { createLogger } from '../app/logger';

const log = createLogger('GradingEngine');

// ============================================================
// Types
// ============================================================

export interface ColorWheels {
  lift: RGBA;
  gamma: RGBA;
  gain: RGBA;
  offset: RGBA;
  contrast: number;
  pivot: number;
  saturation: number;
  hue: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;  // Master
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface Curves {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
  hueVsSat: CurvePoint[];
  hueVsHue: CurvePoint[];
  lumVsSat: CurvePoint[];
}

export interface HSLQualifier {
  enabled: boolean;
  hueCenter: number;
  hueWidth: number;
  hueSoft: number;
  satLow: number;
  satHigh: number;
  satSoft: number;
  lumLow: number;
  lumHigh: number;
  lumSoft: number;
  invert: boolean;
}

export interface PowerWindow {
  id: string;
  type: 'circle' | 'rectangle' | 'polygon' | 'gradient';
  enabled: boolean;
  invert: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  softness: number;
  points?: Array<{ x: number; y: number }>;
}

export type NodeType = 'corrector' | 'serial' | 'parallel' | 'layer' | 'splitter' | 'combiner' | 'outside';

export interface ColorNode {
  id: string;
  type: NodeType;
  label: string;
  enabled: boolean;
  wheels: ColorWheels;
  curves: Curves;
  qualifier: HSLQualifier;
  windows: PowerWindow[];
  lut?: LUTData;
  inputs: string[];
  outputs: string[];
  position: { x: number; y: number };
  blend: { mode: string; opacity: number };
}

export interface LUTData {
  name: string;
  size: number;
  data: Float32Array;
}

export interface ColorGrade {
  id: string;
  name: string;
  nodes: Map<string, ColorNode>;
  nodeOrder: string[];
  inputCS: string;
  outputCS: string;
}

// ============================================================
// Defaults
// ============================================================

const DEFAULT_RGBA: RGBA = { r: 0, g: 0, b: 0, a: 0 };

const DEFAULT_WHEELS: ColorWheels = {
  lift: { ...DEFAULT_RGBA },
  gamma: { ...DEFAULT_RGBA },
  gain: { ...DEFAULT_RGBA },
  offset: { ...DEFAULT_RGBA },
  contrast: 0,
  pivot: 0.5,
  saturation: 1,
  hue: 0
};

const DEFAULT_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

const DEFAULT_CURVES: Curves = {
  master: [...DEFAULT_CURVE],
  red: [...DEFAULT_CURVE],
  green: [...DEFAULT_CURVE],
  blue: [...DEFAULT_CURVE],
  hueVsSat: [],
  hueVsHue: [],
  lumVsSat: []
};

const DEFAULT_QUALIFIER: HSLQualifier = {
  enabled: false,
  hueCenter: 0,
  hueWidth: 30,
  hueSoft: 0.1,
  satLow: 0.2,
  satHigh: 1,
  satSoft: 0.1,
  lumLow: 0,
  lumHigh: 1,
  lumSoft: 0.1,
  invert: false
};

// ============================================================
// Deep-clone helpers — prevent DEFAULT_* constant aliasing
// ============================================================

function deepCloneWheels(w: ColorWheels): ColorWheels {
  return {
    lift:   { ...w.lift },
    gamma:  { ...w.gamma },
    gain:   { ...w.gain },
    offset: { ...w.offset },
    contrast:   w.contrast,
    pivot:      w.pivot,
    saturation: w.saturation,
    hue:        w.hue,
  };
}

function deepCloneCurves(c: Curves): Curves {
  return {
    master:    c.master.map(p => ({ ...p })),
    red:       c.red.map(p => ({ ...p })),
    green:     c.green.map(p => ({ ...p })),
    blue:      c.blue.map(p => ({ ...p })),
    hueVsSat:  c.hueVsSat.map(p => ({ ...p })),
    hueVsHue:  c.hueVsHue.map(p => ({ ...p })),
    lumVsSat:  c.lumVsSat.map(p => ({ ...p })),
  };
}

// ============================================================
// Color Grading Engine
// ============================================================


// WGSL color grade shader — モジュールトップレベルに定義
// compileShaders() が毎回文字列を評価しないようにキャッシュ
const GRADE_SHADER_CODE = `
        struct Wheels {
          lift: vec4<f32>,
          gamma: vec4<f32>,
          gain: vec4<f32>,
          offset: vec4<f32>,
          contrast: f32,
          pivot: f32,
          saturation: f32,
          hue: f32,
        }

        @group(0) @binding(0) var inputTex: texture_2d<f32>;
        @group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(2) var<uniform> wheels: Wheels;

        fn rgb2hsl(c: vec3<f32>) -> vec3<f32> {
          let mx = max(max(c.r, c.g), c.b);
          let mn = min(min(c.r, c.g), c.b);
          let d = mx - mn;
          let l = (mx + mn) * 0.5;
          
          if (d < 0.00001) { return vec3(0.0, 0.0, l); }
          
          let s = d / (1.0 - abs(2.0 * l - 1.0));
          var h: f32;
          
          if (mx == c.r) { h = ((c.g - c.b) / d) % 6.0; }
          else if (mx == c.g) { h = (c.b - c.r) / d + 2.0; }
          else { h = (c.r - c.g) / d + 4.0; }
          
          h /= 6.0;
          if (h < 0.0) { h += 1.0; }
          
          return vec3(h, s, l);
        }

        fn hsl2rgb(c: vec3<f32>) -> vec3<f32> {
          let C = (1.0 - abs(2.0 * c.z - 1.0)) * c.y;
          let h2 = c.x * 6.0;
          let X = C * (1.0 - abs(h2 % 2.0 - 1.0));
          let m = c.z - C * 0.5;
          
          var rgb: vec3<f32>;
          if (h2 < 1.0) { rgb = vec3(C, X, 0.0); }
          else if (h2 < 2.0) { rgb = vec3(X, C, 0.0); }
          else if (h2 < 3.0) { rgb = vec3(0.0, C, X); }
          else if (h2 < 4.0) { rgb = vec3(0.0, X, C); }
          else if (h2 < 5.0) { rgb = vec3(X, 0.0, C); }
          else { rgb = vec3(C, 0.0, X); }
          
          return rgb + m;
        }

        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = textureDimensions(inputTex);
          if (id.x >= dims.x || id.y >= dims.y) { return; }
          
          var c = textureLoad(inputTex, vec2<i32>(id.xy), 0).rgb;
          
          // Lift (shadows)
          let lift = wheels.lift.rgb + wheels.lift.a;
          c = c + lift * (1.0 - c);
          
          // Gamma (midtones)
          let gm = 1.0 / max(vec3(1.0) + wheels.gamma.rgb + wheels.gamma.a, vec3(0.001));
          c = pow(max(c, vec3(0.0)), gm);
          
          // Gain (highlights)
          c = c * (vec3(1.0) + wheels.gain.rgb + wheels.gain.a);
          
          // Offset
          c = c + wheels.offset.rgb + wheels.offset.a;
          
          // Contrast
          c = (c - wheels.pivot) * (1.0 + wheels.contrast) + wheels.pivot;
          
          // Saturation
          let luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(luma), c, wheels.saturation);
          
          // Hue shift
          if (abs(wheels.hue) > 0.001) {
            var hsl = rgb2hsl(c);
            hsl.x = fract(hsl.x + wheels.hue / 360.0);
            c = hsl2rgb(hsl);
          }
          
          textureStore(outputTex, vec2<i32>(id.xy), vec4(clamp(c, vec3(0.0), vec3(1.0)), 1.0));
        }
      `;

export class ColorGradingEngine {
  private grades: Map<string, ColorGrade> = new Map();
  private luts: Map<string, LUTData> = new Map();
  private gpu: GPUDevice | null = null;
  private shaders: Map<string, GPUShaderModule> = new Map();
  /** Cached compute pipeline — created once after GPU init, reused per frame. */
  private computePipeline: GPUComputePipeline | null = null;
  // Per-frame canvas caches (lazy-grow on dimension change)
  private _stagingCanvas: OffscreenCanvas | null = null;
  private _outCanvas: OffscreenCanvas | null = null;
  private _outCtx: OffscreenCanvasRenderingContext2D | null = null;
  private _cpuCanvas: OffscreenCanvas | null = null;
  private _cpuCtx: OffscreenCanvasRenderingContext2D | null = null;
  /** Reusable 20-element uniform data buffer (80 bytes — ColorWheels struct). */
  private readonly _uniformData = new Float32Array(20);

  constructor() {
    this.initGPU();
  }

  private async initGPU(): Promise<void> {
    if (!navigator.gpu) return;
    
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    
    this.gpu = await adapter.requestDevice();
    this.compileShaders();
  }

  private compileShaders(): void {
    if (!this.gpu) return;

    const gradeShader = this.gpu.createShaderModule({
      label: 'Color Grade',
      code: GRADE_SHADER_CODE,
    });
    this.shaders.set('grade', gradeShader);

    // Create the compute pipeline once; bind-group layouts are inferred (auto).
    // Pipeline creation is expensive (~ms); cache it here so processGPU() pays
    // only the cheap bind-group / uniform-write cost per frame.
    this.computePipeline = this.gpu.createComputePipeline({
      label: 'Color Grade Compute',
      layout: 'auto',
      compute: { module: gradeShader, entryPoint: 'main' },
    });
  }

  // ============================================================
  // Grade Management
  // ============================================================

  createGrade(name: string): ColorGrade {
    const id = crypto.randomUUID();
    
    const inputNode: ColorNode = {
      id: 'input',
      type: 'serial',
      label: 'Input',
      enabled: true,
      wheels: deepCloneWheels(DEFAULT_WHEELS),
      curves: deepCloneCurves(DEFAULT_CURVES),
      qualifier: { ...DEFAULT_QUALIFIER },
      windows: [],
      inputs: [],
      outputs: ['node1'],
      position: { x: 0, y: 0 },
      blend: { mode: 'normal', opacity: 1 }
    };

    const corrector: ColorNode = {
      id: 'node1',
      type: 'corrector',
      label: '01',
      enabled: true,
      wheels: deepCloneWheels(DEFAULT_WHEELS),
      curves: deepCloneCurves(DEFAULT_CURVES),
      qualifier: { ...DEFAULT_QUALIFIER },
      windows: [],
      inputs: ['input'],
      outputs: ['output'],
      position: { x: 200, y: 0 },
      blend: { mode: 'normal', opacity: 1 }
    };

    const outputNode: ColorNode = {
      id: 'output',
      type: 'serial',
      label: 'Output',
      enabled: true,
      wheels: deepCloneWheels(DEFAULT_WHEELS),
      curves: deepCloneCurves(DEFAULT_CURVES),
      qualifier: { ...DEFAULT_QUALIFIER },
      windows: [],
      inputs: ['node1'],
      outputs: [],
      position: { x: 400, y: 0 },
      blend: { mode: 'normal', opacity: 1 }
    };

    const grade: ColorGrade = {
      id,
      name,
      nodes: new Map([
        ['input', inputNode],
        ['node1', corrector],
        ['output', outputNode]
      ]),
      nodeOrder: ['input', 'node1', 'output'],
      inputCS: 'rec709',
      outputCS: 'rec709'
    };

    this.grades.set(id, grade);
    return grade;
  }

  // ============================================================
  // Wheel Adjustments
  // ============================================================

  setWheel(
    gradeId: string,
    nodeId: string,
    wheel: 'lift' | 'gamma' | 'gain' | 'offset',
    channel: 'r' | 'g' | 'b' | 'a',
    value: number
  ): void {
    const grade = this.grades.get(gradeId);
    const node = grade?.nodes.get(nodeId);
    if (!node) return;
    
    node.wheels[wheel][channel] = Math.max(-1, Math.min(1, value));
  }

  setContrast(gradeId: string, nodeId: string, contrast: number, pivot = 0.5): void {
    const grade = this.grades.get(gradeId);
    const node = grade?.nodes.get(nodeId);
    if (!node) return;
    
    node.wheels.contrast = Math.max(-1, Math.min(1, contrast));
    node.wheels.pivot = Math.max(0, Math.min(1, pivot));
  }

  setSaturation(gradeId: string, nodeId: string, saturation: number): void {
    const grade = this.grades.get(gradeId);
    const node = grade?.nodes.get(nodeId);
    if (!node) return;
    
    node.wheels.saturation = Math.max(0, Math.min(2, saturation));
  }

  // ============================================================
  // Curve Operations
  // ============================================================

  addCurvePoint(
    gradeId: string,
    nodeId: string,
    curve: keyof Curves,
    point: CurvePoint
  ): void {
    const grade = this.grades.get(gradeId);
    const node = grade?.nodes.get(nodeId);
    if (!node) return;

    const pts = node.curves[curve];
    const idx = pts.findIndex(p => p.x > point.x);
    
    if (idx === -1) {
      pts.push(point);
    } else {
      pts.splice(idx, 0, point);
    }
  }

  // ============================================================
  // LUT Support
  // ============================================================

  async loadCubeLUT(file: File): Promise<LUTData | null> {
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    
    let size = 0;
    const data: number[] = [];

    for (const line of lines) {
      if (line.startsWith('LUT_3D_SIZE')) {
        size = parseInt(line.split(/\s+/)[1]);
        continue;
      }
      
      if (line.startsWith('DOMAIN') || line.startsWith('TITLE')) continue;

      const vals = line.split(/\s+/).map(parseFloat);
      if (vals.length >= 3 && !vals.some(isNaN)) {
        // Stride-3 RGB, matching the reader in lut-apply.ts's trilinear():
        // an extra 4th value here would misalign every cell past index 0.
        data.push(vals[0], vals[1], vals[2]);
      }
    }

    // Guard: parseInt(undefined) = NaN when the size token is missing.
    if (size === 0 || isNaN(size)) return null;

    // Reject truncated/incomplete LUTs (same rationale as lut-manager.ts's
    // parseCube): a size N cube needs exactly N^3 RGB triples, or every cell
    // after the truncation point trilinear-interpolates against stale/zero data.
    if (data.length < size * size * size * 3) {
      log.error(`Malformed .cube: declared size ${size} needs ${size ** 3} entries, got ${Math.floor(data.length / 3)}`);
      return null;
    }

    const lut: LUTData = {
      name: file.name.replace(/\.cube$/i, ''),
      size,
      data: new Float32Array(data)
    };

    this.luts.set(lut.name, lut);
    return lut;
  }

  // ============================================================
  // Processing
  // ============================================================

  async processFrame(
    input: ImageBitmap | HTMLVideoElement | HTMLCanvasElement,
    gradeId: string
  ): Promise<ImageBitmap | null> {
    const grade = this.grades.get(gradeId);
    if (!grade) return null;

    // GPU path: single corrector node with no LUT and no non-trivial curves.
    // Multi-node chains and grades with LUTs/curves fall through to CPU.
    if (this.gpu && this.computePipeline) {
      const correctors = grade.nodeOrder
        .map(id => grade.nodes.get(id))
        .filter((n): n is ColorNode => !!n?.enabled && n.type === 'corrector');

      if (
        correctors.length === 1 &&
        !correctors[0].lut &&
        this.isIdentityCurves(correctors[0].curves)
      ) {
        return this.processGPU(input, correctors[0].wheels);
      }
    }

    return this.processCPU(input, grade);
  }

  /**
   * Returns true when every curve in `c` is the identity (linear pass-through).
   * A curve is identity if it has exactly two control points: (0,0) and (1,1).
   */
  private isIdentityCurves(c: Curves): boolean {
    const isId = (pts: CurvePoint[]) =>
      pts.length === 2 &&
      pts[0].x === 0 && pts[0].y === 0 &&
      pts[1].x === 1 && pts[1].y === 1;

    return (
      isId(c.master) && isId(c.red) && isId(c.green) && isId(c.blue) &&
      c.hueVsSat.length === 0 && c.hueVsHue.length === 0 && c.lumVsSat.length === 0
    );
  }

  /**
   * GPU compute-shader grading path.
   * Uploads the input image to a GPU texture, dispatches the WGSL wheels
   * shader (workgroup_size 8×8), reads back via a staging buffer, and returns
   * an ImageBitmap.  Called only when GPU and computePipeline are ready and
   * the grade has a single corrector node with identity curves and no LUT.
   */
  private async processGPU(
    input: ImageBitmap | HTMLVideoElement | HTMLCanvasElement,
    wheels: ColorWheels,
  ): Promise<ImageBitmap> {
    const gpu = this.gpu!;
    const pipeline = this.computePipeline!;
    const w = input instanceof HTMLVideoElement ? input.videoWidth  : input.width;
    const h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;

    // copyExternalImageToTexture does not accept HTMLVideoElement — draw first.
    if (!this._stagingCanvas || this._stagingCanvas.width !== w || this._stagingCanvas.height !== h) {
      this._stagingCanvas = new OffscreenCanvas(w, h);
    }
    this._stagingCanvas.getContext('2d')!.drawImage(input, 0, 0);
    const staging = this._stagingCanvas;

    const inputTex = gpu.createTexture({
      label: 'grade-in',
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING |
             GPUTextureUsage.COPY_DST       |
             GPUTextureUsage.RENDER_ATTACHMENT,
    });
    gpu.queue.copyExternalImageToTexture({ source: staging }, { texture: inputTex }, [w, h]);

    const outputTex = gpu.createTexture({
      label: 'grade-out',
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Pack ColorWheels → 80-byte Float32Array matching the WGSL Wheels struct:
    // 4×vec4<f32> (lift/gamma/gain/offset) + 4×f32 (contrast/pivot/sat/hue)
    const uniformData = this._uniformData;
    uniformData.set([
      wheels.lift.r,   wheels.lift.g,   wheels.lift.b,   wheels.lift.a,
      wheels.gamma.r,  wheels.gamma.g,  wheels.gamma.b,  wheels.gamma.a,
      wheels.gain.r,   wheels.gain.g,   wheels.gain.b,   wheels.gain.a,
      wheels.offset.r, wheels.offset.g, wheels.offset.b, wheels.offset.a,
      wheels.contrast, wheels.pivot, wheels.saturation, wheels.hue,
    ]);
    const uniformBuf = gpu.createBuffer({
      label: 'wheels-uniform',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    gpu.queue.writeBuffer(uniformBuf, 0, uniformData);

    const bindGroup = gpu.createBindGroup({
      label: 'grade-bg',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTex.createView() },
        { binding: 1, resource: outputTex.createView() },
        { binding: 2, resource: { buffer: uniformBuf } },
      ],
    });

    // bytesPerRow must be a multiple of 256 for copyTextureToBuffer.
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
    const readbackBuf = gpu.createBuffer({
      label: 'grade-readback',
      size: bytesPerRow * h,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = gpu.createCommandEncoder({ label: 'grade-encoder' });
    const pass = encoder.beginComputePass({ label: 'grade-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    pass.end();
    encoder.copyTextureToBuffer(
      { texture: outputTex },
      { buffer: readbackBuf, bytesPerRow },
      [w, h],
    );
    gpu.queue.submit([encoder.finish()]);

    await readbackBuf.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(readbackBuf.getMappedRange());
    const imgData = new ImageData(w, h);
    for (let row = 0; row < h; row++) {
      imgData.data.set(
        raw.subarray(row * bytesPerRow, row * bytesPerRow + w * 4),
        row * w * 4,
      );
    }
    readbackBuf.unmap();

    // Release per-frame GPU resources; the compute pipeline is cached on the
    // class and must NOT be destroyed here.
    inputTex.destroy();
    outputTex.destroy();
    uniformBuf.destroy();
    readbackBuf.destroy();

    if (!this._outCanvas || this._outCanvas.width !== w || this._outCanvas.height !== h) {
      this._outCanvas = new OffscreenCanvas(w, h);
      this._outCtx = this._outCanvas.getContext('2d')!;
    }
    this._outCtx!.putImageData(imgData, 0, 0);
    return createImageBitmap(this._outCanvas);
  }

  private async processCPU(
    input: ImageBitmap | HTMLVideoElement | HTMLCanvasElement,
    grade: ColorGrade
  ): Promise<ImageBitmap> {
    const w = input instanceof HTMLVideoElement ? input.videoWidth : input.width;
    const h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;
    
    if (!this._cpuCanvas || this._cpuCanvas.width !== w || this._cpuCanvas.height !== h) {
      this._cpuCanvas = new OffscreenCanvas(w, h);
      // willReadFrequently: this context exists to read pixels back via
      // getImageData for CPU grading; avoids per-call GPU→CPU readback.
      const newCtx = this._cpuCanvas.getContext('2d', { willReadFrequently: true });
      if (!newCtx) throw new Error('ColorGradingEngine: failed to acquire 2D context for CPU grading');
      this._cpuCtx = newCtx;;
    }
    const canvas = this._cpuCanvas;
    const ctx = this._cpuCtx!;
    ctx.drawImage(input, 0, 0);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (const nodeId of grade.nodeOrder) {
      const node = grade.nodes.get(nodeId);
      if (!node?.enabled || node.type !== 'corrector') continue;

      this.applyWheels(data, node.wheels);

      // Apply per-channel curves (monotone cubic spline)
      const cv = node.curves;
      if (cv) {
        applyCurvesToBuffer(data, {
          master: buildCurve(cv.master),
          red:    buildCurve(cv.red),
          green:  buildCurve(cv.green),
          blue:   buildCurve(cv.blue),
        });
      }

      // Apply 3D LUT last (same order as DaVinci: wheels → curves → LUT)
      if (node.lut) {
        applyLUTToBuffer(data, node.lut);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return createImageBitmap(canvas);
  }

  private applyWheels(data: Uint8ClampedArray, w: ColorWheels): void {
    // Hoist loop-invariant coefficients: for a 1920×1080 frame (≈2M pixels) this
    // eliminates ~18M redundant additions/divisions inside the hot path.
    const liftR = w.lift.r + w.lift.a;
    const liftG = w.lift.g + w.lift.a;
    const liftB = w.lift.b + w.lift.a;
    const gammaR = 1 / Math.max(1 + w.gamma.r + w.gamma.a, 0.001);
    const gammaG = 1 / Math.max(1 + w.gamma.g + w.gamma.a, 0.001);
    const gammaB = 1 / Math.max(1 + w.gamma.b + w.gamma.a, 0.001);
    const gainR  = 1 + w.gain.r + w.gain.a;
    const gainG  = 1 + w.gain.g + w.gain.a;
    const gainB  = 1 + w.gain.b + w.gain.a;
    const offR   = w.offset.r + w.offset.a;
    const offG   = w.offset.g + w.offset.a;
    const offB   = w.offset.b + w.offset.a;
    // Contrast rewritten as scale + bias to avoid per-channel pivot subtraction:
    //   (v - pivot) * scale + pivot  =  v * scale + pivot * (1 - scale)
    const contrastScale = 1 + w.contrast;
    const contrastBias  = w.pivot * (1 - contrastScale);
    const saturation    = w.saturation;
    // Loop-invariant identity checks hoisted before the pixel loop.
    // V8 constant-folds these const booleans and eliminates the branch inside
    // the loop, so we pay zero per-pixel cost for the common "no adjustment" case.
    const noGamma = gammaR === 1 && gammaG === 1 && gammaB === 1;
    const noSat   = saturation === 1;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]     / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Lift
      r += liftR * (1 - r);
      g += liftG * (1 - g);
      b += liftB * (1 - b);

      // Gamma — Math.exp(γ · ln r) is faster than Math.pow(r, γ) in V8 because
      // Math.exp uses the native fast-path while Math.pow goes through general pow().
      // Skip entirely when all three channels have identity gamma (gammaR/G/B = 1).
      if (!noGamma) {
        r = r > 0 ? Math.exp(gammaR * Math.log(r)) : 0;
        g = g > 0 ? Math.exp(gammaG * Math.log(g)) : 0;
        b = b > 0 ? Math.exp(gammaB * Math.log(b)) : 0;
      }

      // Gain
      r *= gainR;
      g *= gainG;
      b *= gainB;

      // Offset
      r += offR;
      g += offG;
      b += offB;

      // Contrast
      r = r * contrastScale + contrastBias;
      g = g * contrastScale + contrastBias;
      b = b * contrastScale + contrastBias;

      // Saturation — skip when saturation === 1 (no-op by definition).
      if (!noSat) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * saturation;
        g = luma + (g - luma) * saturation;
        b = luma + (b - luma) * saturation;
      }

      data[i]     = Math.max(0, Math.min(255, r * 255));
      data[i + 1] = Math.max(0, Math.min(255, g * 255));
      data[i + 2] = Math.max(0, Math.min(255, b * 255));
    }
  }

  // ============================================================
  // Export
  // ============================================================

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Release GPU resources. Call when the engine will no longer be used.
   * Failing to call destroy() leaks the GPUDevice and compute pipeline
   * (flagged as a risk zone in render/CLAUDE.md).
   */
  destroy(): void {
    // computePipeline has no explicit destroy() in WebGPU spec — dropping the
    // reference is sufficient; the GPUDevice cleanup handles it.
    this.computePipeline = null;
    this.shaders.clear();
    this.gpu?.destroy();
    this.gpu = null;
  }

  exportGrade(gradeId: string): string {
    const grade = this.grades.get(gradeId);
    if (!grade) throw new Error('Grade not found');

    return JSON.stringify({
      version: '1.0',
      grade: {
        ...grade,
        nodes: Array.from(grade.nodes.entries())
      }
    }, null, 2);
  }

  importGrade(json: string): ColorGrade {
    // Validate untrusted external grade JSON at the entry point (CLAUDE.md:
    // 入力バリデーション全入口). A raw JSON.parse throws a bare SyntaxError,
    // and a foreign-but-valid JSON without grade.nodes would throw an opaque
    // "iterable" error inside new Map(); wrap both with a clear message.
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch (err) {
      throw new Error(`Invalid grade file: ${(err as Error).message}`);
    }

    const gradeData = (data as { grade?: unknown }).grade;
    if (!gradeData || typeof gradeData !== 'object') {
      throw new Error('Invalid grade file: missing "grade" object');
    }
    const nodes = (gradeData as { nodes?: unknown }).nodes;
    if (!Array.isArray(nodes)) {
      throw new Error('Invalid grade file: "grade.nodes" must be an array of [id, node] entries');
    }

    const grade: ColorGrade = {
      ...(gradeData as Omit<ColorGrade, 'id' | 'nodes'>),
      id: crypto.randomUUID(),
      nodes: new Map(nodes as Array<[string, ColorNode]>),
    };
    this.grades.set(grade.id, grade);
    return grade;
  }
}

export default ColorGradingEngine;
