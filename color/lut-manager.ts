/**
 * Artone v3 — LUT Manager
 * 
 * 3D LUT管理
 * - .cube/.3dl 読み込み
 * - プレビュー
 * - カテゴリ管理
 * - GPU適用
 * 
 * @version 1.0.0
 */
import { createLogger } from '../app/logger';

const log = createLogger('LUTManager');

// ============================================================
// Types
// ============================================================

export interface LUT {
  id: string;
  name: string;
  filename: string;
  format: 'cube' | '3dl' | 'mga' | 'csp';
  size: number;           // LUT size (e.g., 33 for 33x33x33)
  data: Float32Array;     // RGB lookup table
  category: string;
  favorite: boolean;
  thumbnail?: string;
  metadata: LUTMetadata;
}

export interface LUTMetadata {
  title?: string;
  creator?: string;
  copyright?: string;
  inputSpace?: string;
  outputSpace?: string;
  domainMin?: [number, number, number];
  domainMax?: [number, number, number];
}

export interface LUTCategory {
  id: string;
  name: string;
  color: string;
  lutIds: string[];
}

// ============================================================
// Built-in Categories
// ============================================================

const DEFAULT_CATEGORIES: LUTCategory[] = [
  { id: 'cinematic', name: 'Cinematic', color: '#FF9500', lutIds: [] },
  { id: 'film', name: 'Film Emulation', color: '#34C759', lutIds: [] },
  { id: 'bw', name: 'Black & White', color: '#8E8E93', lutIds: [] },
  { id: 'creative', name: 'Creative', color: '#AF52DE', lutIds: [] },
  { id: 'correction', name: 'Correction', color: '#007AFF', lutIds: [] },
  { id: 'custom', name: 'Custom', color: '#FF3B30', lutIds: [] }
];

// ============================================================
// LUT Manager
// ============================================================

export class LUTManager {
  private luts: Map<string, LUT> = new Map();
  private categories: Map<string, LUTCategory> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    // Initialize default categories
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, { ...cat });
    }
  }

  // ============================================================
  // LUT Import
  // ============================================================

  async importLUT(file: File): Promise<LUT | null> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext !== 'cube' && ext !== '3dl') {
      log.error('Unsupported LUT format');
      return null;
    }

    const content = await file.text();
    
    try {
      const lut = ext === 'cube' 
        ? this.parseCube(content, file.name)
        : this.parse3DL(content, file.name);

      if (lut) {
        lut.thumbnail = await this.generateThumbnail(lut);
        this.luts.set(lut.id, lut);
        this.notify();
      }

      return lut;
    } catch (error) {
      log.error('Failed to parse LUT:', error);
      return null;
    }
  }

  private parseCube(content: string, filename: string): LUT | null {
    const lines = content.split('\n');
    let size = 0;
    const metadata: LUTMetadata = {};
    const data: number[] = [];
    let domainMin: [number, number, number] = [0, 0, 0];
    let domainMax: [number, number, number] = [1, 1, 1];

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#') || trimmed === '') continue;
      
      if (trimmed.startsWith('TITLE')) {
        metadata.title = trimmed.substring(6).trim().replace(/"/g, '');
      } else if (trimmed.startsWith('LUT_3D_SIZE')) {
        size = parseInt(trimmed.split(/\s+/)[1]);
      } else if (trimmed.startsWith('DOMAIN_MIN')) {
        const parts = trimmed.split(/\s+/).slice(1).map(Number);
        domainMin = [parts[0], parts[1], parts[2]];
      } else if (trimmed.startsWith('DOMAIN_MAX')) {
        const parts = trimmed.split(/\s+/).slice(1).map(Number);
        domainMax = [parts[0], parts[1], parts[2]];
      } else {
        // Data line
        const values = trimmed.split(/\s+/).map(Number);
        if (values.length >= 3) {
          data.push(values[0], values[1], values[2]);
        }
      }
    }

    // Guard: parseInt(undefined) = NaN when the size token is missing;
    // NaN === 0 is false so the original check silently passed.
    if (size === 0 || isNaN(size) || data.length === 0) return null;

    metadata.domainMin = domainMin;
    metadata.domainMax = domainMax;

    return {
      id: crypto.randomUUID(),
      name: metadata.title || filename.replace(/\.[^/.]+$/, ''),
      filename,
      format: 'cube',
      size,
      data: new Float32Array(data),
      category: 'custom',
      favorite: false,
      metadata
    };
  }

  private parse3DL(content: string, filename: string): LUT | null {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    
    // First line should be "Mesh N N N" or just the size
    const firstLine = lines[0].trim().split(/\s+/);
    let size = 0;
    let startIndex = 0;

    if (firstLine[0].toLowerCase() === 'mesh') {
      size = parseInt(firstLine[1]);
      startIndex = 1;
    } else {
      size = parseInt(firstLine[0]);
      startIndex = 1;
    }

    if (isNaN(size) || size <= 0) return null;

    const data: number[] = [];
    const maxVal = 4095; // 12-bit

    for (let i = startIndex; i < lines.length; i++) {
      const values = lines[i].trim().split(/\s+/).map(Number);
      if (values.length >= 3) {
        data.push(
          values[0] / maxVal,
          values[1] / maxVal,
          values[2] / maxVal
        );
      }
    }

    return {
      id: crypto.randomUUID(),
      name: filename.replace(/\.[^/.]+$/, ''),
      filename,
      format: '3dl',
      size,
      data: new Float32Array(data),
      category: 'custom',
      favorite: false,
      metadata: {}
    };
  }

  // ============================================================
  // LUT Application
  // ============================================================

  applyLUT(imageData: ImageData, lutId: string, intensity = 1): ImageData {
    const lut = this.luts.get(lutId);
    if (!lut) return imageData;

    const data = imageData.data;
    const size = lut.size;
    const lutData = lut.data;

    for (let i = 0; i < data.length; i += 4) {
      // Normalize input to 0-1
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      // Lookup with trilinear interpolation
      const result = this.trilinearInterpolate(lutData, size, r, g, b);

      // Blend with intensity
      data[i] = Math.round((r * (1 - intensity) + result.r * intensity) * 255);
      data[i + 1] = Math.round((g * (1 - intensity) + result.g * intensity) * 255);
      data[i + 2] = Math.round((b * (1 - intensity) + result.b * intensity) * 255);
    }

    return imageData;
  }

  private trilinearInterpolate(
    lutData: Float32Array,
    size: number,
    r: number,
    g: number,
    b: number
  ): { r: number; g: number; b: number } {
    // Scale to LUT coordinates
    const maxIndex = size - 1;
    const rScaled = r * maxIndex;
    const gScaled = g * maxIndex;
    const bScaled = b * maxIndex;

    // Get integer indices
    const r0 = Math.floor(rScaled);
    const g0 = Math.floor(gScaled);
    const b0 = Math.floor(bScaled);
    const r1 = Math.min(r0 + 1, maxIndex);
    const g1 = Math.min(g0 + 1, maxIndex);
    const b1 = Math.min(b0 + 1, maxIndex);

    // Get fractional parts
    const rFrac = rScaled - r0;
    const gFrac = gScaled - g0;
    const bFrac = bScaled - b0;

    // Get LUT values at 8 corners
    const getValue = (ri: number, gi: number, bi: number, channel: number): number => {
      const index = (bi * size * size + gi * size + ri) * 3 + channel;
      return lutData[index] || 0;
    };

    // Interpolate for each channel
    const interpolateChannel = (channel: number): number => {
      const c000 = getValue(r0, g0, b0, channel);
      const c100 = getValue(r1, g0, b0, channel);
      const c010 = getValue(r0, g1, b0, channel);
      const c110 = getValue(r1, g1, b0, channel);
      const c001 = getValue(r0, g0, b1, channel);
      const c101 = getValue(r1, g0, b1, channel);
      const c011 = getValue(r0, g1, b1, channel);
      const c111 = getValue(r1, g1, b1, channel);

      const c00 = c000 * (1 - rFrac) + c100 * rFrac;
      const c10 = c010 * (1 - rFrac) + c110 * rFrac;
      const c01 = c001 * (1 - rFrac) + c101 * rFrac;
      const c11 = c011 * (1 - rFrac) + c111 * rFrac;

      const c0 = c00 * (1 - gFrac) + c10 * gFrac;
      const c1 = c01 * (1 - gFrac) + c11 * gFrac;

      return c0 * (1 - bFrac) + c1 * bFrac;
    };

    return {
      r: Math.max(0, Math.min(1, interpolateChannel(0))),
      g: Math.max(0, Math.min(1, interpolateChannel(1))),
      b: Math.max(0, Math.min(1, interpolateChannel(2)))
    };
  }

  // ============================================================
  // WebGPU Shader Generation
  // ============================================================

  generateWGSLShader(lutId: string): string {
    const lut = this.luts.get(lutId);
    if (!lut) return '';

    return `
      @group(0) @binding(0) var inputTex: texture_2d<f32>;
      @group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
      @group(0) @binding(2) var lutTex: texture_3d<f32>;
      @group(0) @binding(3) var lutSampler: sampler;

      struct Params {
        intensity: f32,
        pad: vec3<f32>,
      }
      @group(0) @binding(4) var<uniform> params: Params;

      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let dims = textureDimensions(inputTex);
        if (id.x >= dims.x || id.y >= dims.y) { return; }

        let color = textureLoad(inputTex, vec2<i32>(id.xy), 0);
        let lutColor = textureSampleLevel(lutTex, lutSampler, color.rgb, 0.0);
        let result = mix(color.rgb, lutColor.rgb, params.intensity);

        textureStore(outputTex, vec2<i32>(id.xy), vec4(result, color.a));
      }
    `;
  }

  // ============================================================
  // Thumbnail Generation
  // ============================================================

  private async generateThumbnail(lut: LUT): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Create gradient test image
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const r = x / canvas.width;
        const g = 1 - (y / canvas.height);
        const b = 0.5;
        
        ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Apply LUT
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.applyLUT(imageData, lut.id, 1);
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.8);
  }

  // ============================================================
  // LUT Management
  // ============================================================

  getLUT(id: string): LUT | undefined {
    return this.luts.get(id);
  }

  getAllLUTs(): LUT[] {
    return Array.from(this.luts.values());
  }

  getLUTsByCategory(categoryId: string): LUT[] {
    return Array.from(this.luts.values()).filter(l => l.category === categoryId);
  }

  getFavorites(): LUT[] {
    return Array.from(this.luts.values()).filter(l => l.favorite);
  }

  updateLUT(id: string, updates: Partial<LUT>): void {
    const lut = this.luts.get(id);
    if (lut) {
      Object.assign(lut, updates);
      this.notify();
    }
  }

  toggleFavorite(id: string): void {
    const lut = this.luts.get(id);
    if (lut) {
      lut.favorite = !lut.favorite;
      this.notify();
    }
  }

  setCategory(lutId: string, categoryId: string): void {
    const lut = this.luts.get(lutId);
    if (lut && this.categories.has(categoryId)) {
      lut.category = categoryId;
      this.notify();
    }
  }

  deleteLUT(id: string): void {
    this.luts.delete(id);
    this.notify();
  }

  // ============================================================
  // Category Management
  // ============================================================

  getCategories(): LUTCategory[] {
    return Array.from(this.categories.values());
  }

  createCategory(name: string, color = '#666666'): LUTCategory {
    const category: LUTCategory = {
      id: crypto.randomUUID(),
      name,
      color,
      lutIds: []
    };

    this.categories.set(category.id, category);
    this.notify();
    return category;
  }

  deleteCategory(id: string): void {
    // Move LUTs to custom
    for (const lut of this.luts.values()) {
      if (lut.category === id) {
        lut.category = 'custom';
      }
    }

    this.categories.delete(id);
    this.notify();
  }

  // ============================================================
  // Export
  // ============================================================

  exportLUT(id: string, format: 'cube' | '3dl' = 'cube'): string {
    const lut = this.luts.get(id);
    if (!lut) return '';

    if (format === 'cube') {
      return this.exportCube(lut);
    } else {
      return this.export3DL(lut);
    }
  }

  private exportCube(lut: LUT): string {
    const lines: string[] = [
      `# Created by Artone v3`,
      `TITLE "${lut.name}"`,
      `LUT_3D_SIZE ${lut.size}`,
      ''
    ];

    for (let b = 0; b < lut.size; b++) {
      for (let g = 0; g < lut.size; g++) {
        for (let r = 0; r < lut.size; r++) {
          const index = (b * lut.size * lut.size + g * lut.size + r) * 3;
          lines.push(`${lut.data[index].toFixed(6)} ${lut.data[index + 1].toFixed(6)} ${lut.data[index + 2].toFixed(6)}`);
        }
      }
    }

    return lines.join('\n');
  }

  private export3DL(lut: LUT): string {
    const lines: string[] = [
      `Mesh ${lut.size} ${lut.size} ${lut.size}`
    ];

    for (let i = 0; i < lut.data.length; i += 3) {
      const r = Math.round(lut.data[i] * 4095);
      const g = Math.round(lut.data[i + 1] * 4095);
      const b = Math.round(lut.data[i + 2] * 4095);
      lines.push(`${r} ${g} ${b}`);
    }

    return lines.join('\n');
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

export default LUTManager;
