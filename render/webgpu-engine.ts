/**
 * Artone v3 — WebGPU Render Engine
 * 
 * ゼロコピーGPUパイプライン
 * - 60fps リアルタイムプレビュー
 * - GPU エフェクト
 * - 3層キャッシュ
 * - ブレンドモード
 * 
 * @version 1.0.0
 */

import { createLogger } from '../app/logger';

// ============================================================
// Types
// ============================================================

const log = createLogger('WebGPU');

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
  maxTextureCache: number;
  preferLowPower: boolean;
}

export interface RenderLayer {
  id: string;
  texture: GPUTexture | null;
  transform: LayerTransform;
  blend: BlendMode;
  opacity: number;
  effects: RenderEffect[];
}

export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export type BlendMode = 
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

export interface RenderEffect {
  type: EffectType;
  params: Record<string, number>;
  enabled: boolean;
}

export type EffectType = 
  | 'blur' | 'sharpen' | 'vignette' | 'chromaKey'
  | 'colorCorrect' | 'glow' | 'noise' | 'film';

export interface RenderStats {
  fps: number;
  frameTime: number;
  gpuTime: number;
  textureMemoryMB: number;
  cacheHitRate: number;
}

// ============================================================
// Default Config
// ============================================================

const DEFAULT_CONFIG: RenderConfig = {
  width: 1920,
  height: 1080,
  fps: 60,
  maxTextureCache: 300,
  preferLowPower: false
};

// ============================================================
// WebGPU Render Engine
// ============================================================

export class WebGPURenderEngine {
  private config: RenderConfig;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;

  // Cache
  private textureCache: Map<string, GPUTexture> = new Map();
  private cacheOrder: string[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  
  // Shaders & Pipelines
  private shaders: Map<string, GPUShaderModule> = new Map();
  private pipelines: Map<string, GPURenderPipeline | GPUComputePipeline> = new Map();
  private sampler: GPUSampler | null = null;
  
  // Stats
  private frameCount = 0;
  private lastStatsTime = 0;
  private stats: RenderStats = {
    fps: 0, frameTime: 0, gpuTime: 0,
    textureMemoryMB: 0, cacheHitRate: 0
  };

  constructor(config: Partial<RenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================
  // Device loss / recovery
  // ============================================================
  //
  // WebGPU exposes device loss via the device.lost Promise (it RESOLVES, never
  // rejects, when the device is lost). Unlike WebGL there is no "restored" event:
  // the app must re-request adapter+device and rebuild every GPU resource. An
  // intentional device.destroy() also resolves device.lost with reason
  // 'destroyed' — that must NOT be treated as a crash. (MDN: GPUDevice.lost)

  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private deviceLost = false;
  private intentionalDestroy = false;
  private readonly contextListeners = new Set<(lost: boolean) => void>();

  /** Subscribe to device lost/recovered transitions (UI can show a banner). */
  onContextChange(listener: (lost: boolean) => void): () => void {
    this.contextListeners.add(listener);
    return () => this.contextListeners.delete(listener);
  }

  /** Whether the GPU device is currently lost (renderFrame is a no-op while true). */
  isDeviceLost(): boolean {
    return this.deviceLost;
  }

  private notifyContext(lost: boolean): void {
    for (const l of this.contextListeners) {
      try { l(lost); } catch (e) { log.error('context listener threw', e); }
    }
  }

  /** Attach the device.lost watcher (guarded — mock devices may lack .lost). */
  private watchDeviceLost(device: GPUDevice): void {
    const lost = (device as GPUDevice).lost;
    if (!lost || typeof lost.then !== 'function') return;
    lost.then((info) => this.handleDeviceLost(info)).catch(() => { /* never rejects */ });
  }

  /** React to device loss: ignore intentional destroy, else pause + recover. */
  private handleDeviceLost(info: GPUDeviceLostInfo): void {
    if (this.intentionalDestroy || info?.reason === 'destroyed') return;
    this.deviceLost = true;
    log.warn(`WebGPU device lost (${info?.reason ?? 'unknown'}): ${info?.message ?? ''} — attempting recovery`);
    this.notifyContext(true);
    void this.attemptRecovery();
  }

  /** Best-effort recovery: drop invalid resources and re-run initialize(). */
  private async attemptRecovery(): Promise<void> {
    if (!this.canvas) return;
    // All GPU objects belonged to the lost device and are now invalid; drop refs
    // (do not call .destroy() — the device is gone). Textures re-upload next frame.
    this.textureCache.clear();
    this.cacheOrder = [];
    this.pipelines.clear();
    this.shaders.clear();
    this.sampler = null;
    this.device = null;
    const ok = await this.initialize(this.canvas);
    if (ok) {
      this.deviceLost = false;
      this.notifyContext(false);
      log.info('WebGPU device recovered');
    }
  }

  // ============================================================
  // Initialization
  // ============================================================

  async initialize(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<boolean> {
    if (!navigator.gpu) {
      log.warn('WebGPU not supported');
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: this.config.preferLowPower ? 'low-power' : 'high-performance'
      });
      if (!adapter) return false;

      this.device = await adapter.requestDevice();
      this.canvas = canvas;
      // Watch for device loss so we can pause rendering and auto-recover.
      this.watchDeviceLost(this.device);
      this.context = canvas.getContext('webgpu') as GPUCanvasContext;

      const format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format,
        alphaMode: 'premultiplied'
      });

      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear'
      });

      await this.compileShaders();
      await this.createPipelines();

      return true;
    } catch (e) {
      log.error('WebGPU init failed:', e);
      return false;
    }
  }

  private async compileShaders(): Promise<void> {
    if (!this.device) return;

    // Composite shader
    this.shaders.set('composite', this.device.createShaderModule({
      code: `
        struct VertexOutput {
          @builtin(position) pos: vec4<f32>,
          @location(0) uv: vec2<f32>,
        }

        @vertex
        fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
          var p = array<vec2<f32>, 4>(
            vec2(-1.0, -1.0), vec2(1.0, -1.0),
            vec2(-1.0, 1.0), vec2(1.0, 1.0)
          );
          var uv = array<vec2<f32>, 4>(
            vec2(0.0, 1.0), vec2(1.0, 1.0),
            vec2(0.0, 0.0), vec2(1.0, 0.0)
          );
          var out: VertexOutput;
          out.pos = vec4(p[i], 0.0, 1.0);
          out.uv = uv[i];
          return out;
        }

        @group(0) @binding(0) var samp: sampler;
        @group(0) @binding(1) var tex: texture_2d<f32>;

        struct Params {
          opacity: f32,
          blendMode: u32,
          pad: vec2<f32>,
        }
        @group(0) @binding(2) var<uniform> params: Params;

        @fragment
        fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
          var c = textureSample(tex, samp, in.uv);
          c.a *= params.opacity;
          return c;
        }
      `
    }));

    // Transform shader
    this.shaders.set('transform', this.device.createShaderModule({
      code: `
        struct VertexOutput {
          @builtin(position) pos: vec4<f32>,
          @location(0) uv: vec2<f32>,
        }

        struct Transform {
          matrix: mat4x4<f32>,
        }
        @group(0) @binding(0) var<uniform> transform: Transform;

        @vertex
        fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
          var p = array<vec2<f32>, 4>(
            vec2(-0.5, -0.5), vec2(0.5, -0.5),
            vec2(-0.5, 0.5), vec2(0.5, 0.5)
          );
          var uv = array<vec2<f32>, 4>(
            vec2(0.0, 1.0), vec2(1.0, 1.0),
            vec2(0.0, 0.0), vec2(1.0, 0.0)
          );
          var out: VertexOutput;
          out.pos = transform.matrix * vec4(p[i], 0.0, 1.0);
          out.uv = uv[i];
          return out;
        }

        @group(0) @binding(1) var samp: sampler;
        @group(0) @binding(2) var tex: texture_2d<f32>;

        @fragment
        fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
          return textureSample(tex, samp, in.uv);
        }
      `
    }));

    // Blur compute shader
    this.shaders.set('blur', this.device.createShaderModule({
      code: `
        @group(0) @binding(0) var inputTex: texture_2d<f32>;
        @group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
        
        struct Params { radius: f32, sigma: f32, pad: vec2<f32> }
        @group(0) @binding(2) var<uniform> params: Params;

        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = textureDimensions(inputTex);
          if (id.x >= dims.x || id.y >= dims.y) { return; }
          
          var color = vec4(0.0);
          var weight = 0.0;
          let r = i32(params.radius);
          
          for (var dy = -r; dy <= r; dy++) {
            for (var dx = -r; dx <= r; dx++) {
              let pos = vec2<i32>(i32(id.x) + dx, i32(id.y) + dy);
              if (pos.x >= 0 && pos.x < i32(dims.x) && pos.y >= 0 && pos.y < i32(dims.y)) {
                let d = sqrt(f32(dx*dx + dy*dy));
                let w = exp(-d*d / (2.0 * params.sigma * params.sigma));
                color += textureLoad(inputTex, pos, 0) * w;
                weight += w;
              }
            }
          }
          
          textureStore(outputTex, vec2<i32>(id.xy), color / weight);
        }
      `
    }));

    // Chroma key compute shader
    this.shaders.set('chromaKey', this.device.createShaderModule({
      code: `
        @group(0) @binding(0) var inputTex: texture_2d<f32>;
        @group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
        
        struct Params {
          keyColor: vec3<f32>,
          tolerance: f32,
          softness: f32,
          spill: f32,
          pad: vec2<f32>,
        }
        @group(0) @binding(2) var<uniform> params: Params;

        fn rgb2yuv(c: vec3<f32>) -> vec3<f32> {
          let y = 0.299*c.r + 0.587*c.g + 0.114*c.b;
          let u = -0.147*c.r - 0.289*c.g + 0.436*c.b;
          let v = 0.615*c.r - 0.515*c.g - 0.100*c.b;
          return vec3(y, u, v);
        }

        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = textureDimensions(inputTex);
          if (id.x >= dims.x || id.y >= dims.y) { return; }
          
          let c = textureLoad(inputTex, vec2<i32>(id.xy), 0);
          let keyYuv = rgb2yuv(params.keyColor);
          let pixYuv = rgb2yuv(c.rgb);
          
          let dist = distance(pixYuv.yz, keyYuv.yz);
          let alpha = smoothstep(params.tolerance, params.tolerance + params.softness, dist);
          
          var rgb = c.rgb;
          if (params.spill > 0.0) {
            let spillAmt = max(0.0, rgb.g - max(rgb.r, rgb.b)) * params.spill;
            rgb.g -= spillAmt;
          }
          
          textureStore(outputTex, vec2<i32>(id.xy), vec4(rgb, alpha * c.a));
        }
      `
    }));
  }

  private async createPipelines(): Promise<void> {
    if (!this.device) return;

    const format = navigator.gpu.getPreferredCanvasFormat();

    // Composite pipeline
    this.pipelines.set('composite', this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.shaders.get('composite')!,
        entryPoint: 'vs'
      },
      fragment: {
        module: this.shaders.get('composite')!,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive: { topology: 'triangle-strip' }
    }));

    // Transform pipeline
    this.pipelines.set('transform', this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.shaders.get('transform')!,
        entryPoint: 'vs'
      },
      fragment: {
        module: this.shaders.get('transform')!,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive: { topology: 'triangle-strip' }
    }));

    // Compute pipelines
    for (const name of ['blur', 'chromaKey']) {
      this.pipelines.set(name, this.device.createComputePipeline({
        layout: 'auto',
        compute: { module: this.shaders.get(name)!, entryPoint: 'main' }
      }));
    }
  }

  // ============================================================
  // Texture Management
  // ============================================================

  async importTexture(
    source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement,
    id: string
  ): Promise<GPUTexture | null> {
    if (!this.device) return null;

    // Check cache
    if (this.textureCache.has(id)) {
      this.cacheHits++;
      this.updateCacheOrder(id);
      return this.textureCache.get(id)!;
    }

    this.cacheMisses++;

    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.COPY_DST | 
             GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.device.queue.copyExternalImageToTexture(
      { source },
      { texture },
      [width, height]
    );

    this.cacheTexture(id, texture);
    return texture;
  }

  private cacheTexture(id: string, texture: GPUTexture): void {
    // Evict if full
    while (this.textureCache.size >= this.config.maxTextureCache) {
      const oldest = this.cacheOrder.shift();
      if (oldest) {
        this.textureCache.get(oldest)?.destroy();
        this.textureCache.delete(oldest);
      }
    }

    this.textureCache.set(id, texture);
    this.cacheOrder.push(id);
  }

  private updateCacheOrder(id: string): void {
    const idx = this.cacheOrder.indexOf(id);
    if (idx > -1) {
      this.cacheOrder.splice(idx, 1);
      this.cacheOrder.push(id);
    }
  }

  clearCache(): void {
    for (const tex of this.textureCache.values()) {
      tex.destroy();
    }
    this.textureCache.clear();
    this.cacheOrder = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  // ============================================================
  // Rendering
  // ============================================================

  async renderFrame(layers: RenderLayer[]): Promise<void> {
    // Skip while the device is lost — GPU calls would throw or be dropped.
    if (this.deviceLost || !this.device || !this.context) return;

    const startTime = performance.now();
    const encoder = this.device.createCommandEncoder();

    // Get output texture
    const outputView = this.context.getCurrentTexture().createView();

    // Clear pass
    const clearPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: outputView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });
    clearPass.end();

    // Frame-local GPU resources created during encoding; destroyed after submit.
    const transientBuffers: GPUBuffer[] = [];
    const transientTextures: GPUTexture[] = [];

    // Render each layer
    for (const layer of layers) {
      if (!layer.texture) continue;

      // Apply effects
      let tex = layer.texture;
      for (const effect of layer.effects) {
        if (!effect.enabled) continue;
        const out = await this.applyEffect(encoder, tex, effect, transientBuffers);
        if (out) {
          transientTextures.push(out);
          tex = out;
        }
      }

      // Composite
      await this.compositeLayer(encoder, outputView, tex, layer, transientBuffers);
    }

    this.device.queue.submit([encoder.finish()]);

    // REGRESSION: destroy all frame-local GPU resources after submit.
    // paramBuffers and intermediate effect textures were previously leaked every frame.
    for (const buf of transientBuffers) buf.destroy();
    for (const t of transientTextures) t.destroy();

    // Update stats
    this.updateStats(performance.now() - startTime);
  }

  private async applyEffect(
    encoder: GPUCommandEncoder,
    input: GPUTexture,
    effect: RenderEffect,
    transient: GPUBuffer[]
  ): Promise<GPUTexture | null> {
    if (!this.device) return null;

    const pipeline = this.pipelines.get(effect.type) as GPUComputePipeline;
    // Return null (not input) so the caller's transientTextures array does not
    // capture and later destroy the original layer texture. The caller skips
    // assignment when null, preserving the current tex reference unchanged.
    if (!pipeline) return null;

    const output = this.device.createTexture({
      size: [input.width, input.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
    });

    const paramData = new Float32Array(8);
    let i = 0;
    for (const v of Object.values(effect.params)) {
      if (typeof v === 'number') paramData[i++] = v;
    }

    const paramBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    transient.push(paramBuffer);
    this.device.queue.writeBuffer(paramBuffer, 0, paramData);

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: paramBuffer } }
      ]
    });

    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(input.width / 8),
      Math.ceil(input.height / 8)
    );
    pass.end();

    return output;
  }

  private async compositeLayer(
    encoder: GPUCommandEncoder,
    output: GPUTextureView,
    texture: GPUTexture,
    layer: RenderLayer,
    transient: GPUBuffer[]
  ): Promise<void> {
    if (!this.device || !this.sampler) return;

    const pipeline = this.pipelines.get('composite') as GPURenderPipeline;

    const paramData = new Float32Array([layer.opacity, this.blendModeToInt(layer.blend), 0, 0]);
    const paramBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    transient.push(paramBuffer);
    this.device.queue.writeBuffer(paramBuffer, 0, paramData);

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: { buffer: paramBuffer } }
      ]
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: output,
        loadOp: 'load',
        storeOp: 'store'
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  private blendModeToInt(mode: BlendMode): number {
    const modes: BlendMode[] = [
      'normal', 'multiply', 'screen', 'overlay',
      'darken', 'lighten', 'color-dodge', 'color-burn',
      'hard-light', 'soft-light', 'difference', 'exclusion'
    ];
    return modes.indexOf(mode);
  }

  // ============================================================
  // Stats
  // ============================================================

  private updateStats(frameTime: number): void {
    this.frameCount++;
    const now = performance.now();

    if (now - this.lastStatsTime >= 1000) {
      this.stats = {
        fps: this.frameCount,
        frameTime,
        gpuTime: 0,
        textureMemoryMB: this.estimateMemory(),
        cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
      };

      this.frameCount = 0;
      this.lastStatsTime = now;
      this.cacheHits = 0;
      this.cacheMisses = 0;
    }
  }

  private estimateMemory(): number {
    let bytes = 0;
    for (const tex of this.textureCache.values()) {
      bytes += tex.width * tex.height * 4;
    }
    return bytes / (1024 * 1024);
  }

  getStats(): RenderStats {
    return { ...this.stats };
  }

  // ============================================================
  // Cleanup
  // ============================================================

  destroy(): void {
    this.clearCache();
    // GPURenderPipeline, GPUComputePipeline, GPUSampler, and GPUShaderModule
    // have no .destroy(), but clearing the maps allows GC.
    this.pipelines.clear();
    this.shaders.clear();
    this.sampler = null;
    // Mark BEFORE destroy() so the device.lost handler treats the resulting
    // 'destroyed' resolution as intentional (no spurious recovery attempt).
    this.intentionalDestroy = true;
    // Explicitly destroy the device to release all remaining GPU resources
    // (uniform buffers, bind group layouts, etc.) before nulling the reference.
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.canvas = null;
    this.contextListeners.clear();
  }
}

export default WebGPURenderEngine;
