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

    // Unified color grading shader
    const gradeShader = this.gpu.createShaderModule({
      label: 'Color Grade',
      code: GRADE_SHADER_CODE,
    });
    this.shaders.set('grade', gradeShader);
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
        data.push(vals[0], vals[1], vals[2], 1.0);
      }
    }

    // Guard: parseInt(undefined) = NaN when the size token is missing.
    if (size === 0 || isNaN(size)) return null;

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

    // CPU fallback
    if (!this.gpu) {
      return this.processCPU(input, grade);
    }

    // GPU processing would go here
    return this.processCPU(input, grade);
  }

  private async processCPU(
    input: ImageBitmap | HTMLVideoElement | HTMLCanvasElement,
    grade: ColorGrade
  ): Promise<ImageBitmap> {
    const w = input instanceof HTMLVideoElement ? input.videoWidth : input.width;
    const h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;
    
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
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
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Lift
      const liftR = w.lift.r + w.lift.a;
      const liftG = w.lift.g + w.lift.a;
      const liftB = w.lift.b + w.lift.a;
      r += liftR * (1 - r);
      g += liftG * (1 - g);
      b += liftB * (1 - b);

      // Gamma
      const gammaR = 1 / Math.max(1 + w.gamma.r + w.gamma.a, 0.001);
      const gammaG = 1 / Math.max(1 + w.gamma.g + w.gamma.a, 0.001);
      const gammaB = 1 / Math.max(1 + w.gamma.b + w.gamma.a, 0.001);
      r = Math.pow(Math.max(r, 0), gammaR);
      g = Math.pow(Math.max(g, 0), gammaG);
      b = Math.pow(Math.max(b, 0), gammaB);

      // Gain
      r *= 1 + w.gain.r + w.gain.a;
      g *= 1 + w.gain.g + w.gain.a;
      b *= 1 + w.gain.b + w.gain.a;

      // Offset
      r += w.offset.r + w.offset.a;
      g += w.offset.g + w.offset.a;
      b += w.offset.b + w.offset.a;

      // Contrast
      r = (r - w.pivot) * (1 + w.contrast) + w.pivot;
      g = (g - w.pivot) * (1 + w.contrast) + w.pivot;
      b = (b - w.pivot) * (1 + w.contrast) + w.pivot;

      // Saturation
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * w.saturation;
      g = luma + (g - luma) * w.saturation;
      b = luma + (b - luma) * w.saturation;

      data[i] = Math.max(0, Math.min(255, r * 255));
      data[i + 1] = Math.max(0, Math.min(255, g * 255));
      data[i + 2] = Math.max(0, Math.min(255, b * 255));
    }
  }

  // ============================================================
  // Export
  // ============================================================

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
    const data = JSON.parse(json);
    const grade: ColorGrade = {
      ...data.grade,
      id: crypto.randomUUID(),
      nodes: new Map(data.grade.nodes)
    };
    this.grades.set(grade.id, grade);
    return grade;
  }
}

export default ColorGradingEngine;
