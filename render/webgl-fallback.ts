/**
 * Artone v3 — WebGL 2.0 Fallback Renderer
 *
 * WebGPU 非対応環境 (Firefox 116+ はフラグ必要、古い Safari 等) のための
 * フォールバック・レンダリングパス。
 *
 * 設計根拠 (webrtcHacks / W3C Media WG / LoopDesk):
 * - WebGL 2.0 の VideoFrame 処理性能は WebGPU とほぼ同等
 * - GPU-to-CPU コピーは最大1回に抑える (テクスチャは GPU 上に保つ)
 * - 同一の頂点/フラグメントシェーダで VideoFrame を 2D テクスチャとしてサンプル
 *
 * WebGPURenderEngine と同じ RenderLayer インターフェースを受け、
 * 呼び出し側はバックエンドを意識せず使える (Strategy パターン)。
 */

import { createLogger } from '../app/logger';
import type { RenderLayer, LayerTransform } from './webgpu-engine';

const log = createLogger('WebGLFallback');

// ============================================================
// シェーダソース (GLSL ES 3.0)
// ============================================================

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
uniform mat3 u_transform;
out vec2 v_texCoord;
void main() {
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = vec4(color.rgb, color.a * u_opacity);
}`;

// ============================================================
// WebGLFallbackRenderer
// ============================================================

export class WebGLFallbackRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private textures = new Map<string, WebGLTexture>();
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private attribs: { posLoc: number; texLoc: number } = { posLoc: -1, texLoc: -1 };
  private frameCount = 0;
  private lastFrameTime = 0;
  private readonly matBuf = new Float32Array(9);
  // GPU context loss (driver crash, GPU reset, tab backgrounding on mobile) is a
  // normal event that MUST be handled or the renderer silently dies. Critically,
  // preventDefault() on the lost event is required or the browser never fires the
  // restored event. (Qiita: WebGL コンテキストロスト復元)
  private contextLost = false;
  private readonly contextListeners = new Set<(lost: boolean) => void>();
  private readonly _onContextLost = (e: Event): void => {
    // Without preventDefault the 'restored' event is never dispatched.
    e.preventDefault();
    this.contextLost = true;
    // All GL objects are now invalid; drop references without calling gl.delete*
    // (the underlying objects are already gone). Textures are re-uploaded by the
    // frame source on the next frame after restore.
    this.program = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.textures.clear();
    log.warn('WebGL context lost — rendering paused until restore');
    this.notifyContext(true);
  };
  private readonly _onContextRestored = (): void => {
    if (!this.canvas) return;
    log.info('WebGL context restored — reinitializing GPU resources');
    if (this.setupGLResources()) {
      this.contextLost = false;
      this.notifyContext(false);
    }
  };

  /** Subscribe to context-lost/restored transitions (UI can show a banner). */
  onContextChange(listener: (lost: boolean) => void): () => void {
    this.contextListeners.add(listener);
    return () => this.contextListeners.delete(listener);
  }

  /** Whether the GL context is currently lost (renderFrame is a no-op while true). */
  isContextLost(): boolean {
    return this.contextLost;
  }

  private notifyContext(lost: boolean): void {
    for (const l of this.contextListeners) {
      try { l(lost); } catch (e) { log.error('context listener threw', e); }
    }
  }

  /** WebGL 2.0 コンテキストを初期化。成功時 true。 */
  initialize(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    if (this.gl !== null) {
      log.warn('WebGLFallbackRenderer already initialized — call destroy() before re-initializing');
      return false;
    }
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      log.error('WebGL 2.0 not supported — no rendering backend available');
      return false;
    }

    this.gl = gl;
    this.canvas = canvas;

    // Listen for GPU context loss/restore. HTMLCanvasElement uses the
    // 'webgl'-prefixed names; OffscreenCanvas uses the unprefixed ones. Register
    // both — a listener for an event that never fires on a given canvas type is
    // harmless.
    const target = canvas as unknown as EventTarget;
    target.addEventListener('webglcontextlost', this._onContextLost as EventListener);
    target.addEventListener('webglcontextrestored', this._onContextRestored as EventListener);
    target.addEventListener('contextlost', this._onContextLost as EventListener);
    target.addEventListener('contextrestored', this._onContextRestored as EventListener);

    if (!this.setupGLResources()) return false;

    log.info('WebGL 2.0 fallback renderer initialized');
    return true;
  }

  /**
   * Create the shader program, uniforms, geometry and blend state on the current
   * GL context. Extracted from initialize() so it can be re-run verbatim on
   * context restore. Returns false if program creation fails.
   */
  private setupGLResources(): boolean {
    const gl = this.gl;
    if (!gl) return false;

    const program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) return false;
    this.program = program;

    this.uniforms = {
      transform: gl.getUniformLocation(program, 'u_transform'),
      texture: gl.getUniformLocation(program, 'u_texture'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
    };
    this.attribs = {
      posLoc: gl.getAttribLocation(program, 'a_position'),
      texLoc: gl.getAttribLocation(program, 'a_texCoord'),
    };

    this.setupGeometry();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      log.error('Shader compile failed', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    const gl = this.gl!;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
      // REGRESSION: free whichever shader succeeded to avoid a resource leak.
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    // Shaders are no longer needed once the program is linked.
    gl.detachShader(program, vs);
    gl.detachShader(program, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      log.error('Program link failed', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  private setupGeometry(): void {
    const gl = this.gl!;
    // フルスクリーンクワッド
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  }

  /**
   * VideoFrame / ImageBitmap をテクスチャとしてアップロード。
   * GPU-to-CPU コピーを避けるため texImage2D に直接ソースを渡す。
   */
  uploadTexture(id: string, source: VideoFrame | ImageBitmap | HTMLCanvasElement): void {
    // Texture uploads against a lost context are invalid; skip until restored.
    if (this.contextLost || !this.gl) return;
    const gl = this.gl;
    let texture = this.textures.get(id);
    if (!texture) {
      const created = gl.createTexture();
      if (!created) { log.error('Failed to create texture'); return; }
      texture = created;
      this.textures.set(id, texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    // 直接アップロード (CPU 経由なし)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
  }

  /** transform を 3x3 行列に変換 (列優先) — pre-allocated buffer, reused every call */
  private buildMatrix(t: LayerTransform): Float32Array {
    const cos = Math.cos(t.rotation);
    const sin = Math.sin(t.rotation);
    const m = this.matBuf;
    m[0] = t.scaleX * cos;  m[1] = t.scaleX * sin;  m[2] = 0;
    m[3] = -t.scaleY * sin; m[4] = t.scaleY * cos;  m[5] = 0;
    m[6] = t.x;             m[7] = t.y;              m[8] = 1;
    return m;
  }

  /** レイヤーを合成してキャンバスに描画 */
  renderFrame(layers: RenderLayer[]): void {
    const gl = this.gl;
    const program = this.program;
    // Skip while the context is lost — GL calls would be no-ops or warnings.
    if (this.contextLost || !gl || !program) return;

    const start = performance.now();

    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    const { posLoc, texLoc } = this.attribs;

    for (const layer of layers) {
      const texture = this.textures.get(layer.id);
      if (!texture) continue;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniforms.texture, 0);
      gl.uniform1f(this.uniforms.opacity, layer.opacity);
      gl.uniformMatrix3fv(this.uniforms.transform, false, this.buildMatrix(layer.transform));

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    this.frameCount++;
    this.lastFrameTime = performance.now() - start;
  }

  getStats() {
    return {
      backend: 'webgl2' as const,
      fps: this.lastFrameTime > 0 ? Math.round(1000 / this.lastFrameTime) : 0,
      frameTime: this.lastFrameTime,
      textureCount: this.textures.size,
      frameCount: this.frameCount,
    };
  }

  releaseTexture(id: string): void {
    const gl = this.gl;
    const texture = this.textures.get(id);
    if (gl && texture) {
      gl.deleteTexture(texture);
      this.textures.delete(id);
    }
  }

  clearCache(): void {
    const gl = this.gl;
    if (gl) for (const tex of this.textures.values()) gl.deleteTexture(tex);
    this.textures.clear();
  }

  destroy(): void {
    this.clearCache();
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    }
    // Remove context-loss listeners so a disposed renderer is not kept alive by
    // the canvas, and stale handlers don't fire after teardown.
    const target = this.canvas as unknown as EventTarget | null;
    if (target) {
      target.removeEventListener('webglcontextlost', this._onContextLost as EventListener);
      target.removeEventListener('webglcontextrestored', this._onContextRestored as EventListener);
      target.removeEventListener('contextlost', this._onContextLost as EventListener);
      target.removeEventListener('contextrestored', this._onContextRestored as EventListener);
    }
    this.contextListeners.clear();
    this.gl = null;
    this.program = null;
    this.canvas = null;
  }
}
