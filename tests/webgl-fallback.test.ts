/**
 * Tests for render/webgl-fallback.ts
 *
 * WebGL2 is not available in jsdom, so all tests use a hand-crafted
 * minimal GL mock. The mock tracks call counts for resource-lifecycle
 * assertions (create/delete/detach).
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import { WebGLFallbackRenderer } from '../render/webgl-fallback';

// ============================================================
// Minimal WebGL2 mock
// ============================================================

function makeGLMock() {
  const shaders: object[] = [];
  const programs: object[] = [];
  const textures: object[] = [];
  const buffers: object[] = [];

  const gl = {
    // Constants (numeric values taken from the WebGL2 spec)
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    CLAMP_TO_EDGE: 33071,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    LINEAR: 9729,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    COLOR_BUFFER_BIT: 16384,
    FLOAT: 5126,
    TRIANGLE_STRIP: 5,

    // Shader / program lifecycle
    createShader: vi.fn(() => { const s = {}; shaders.push(s); return s; }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true), // always compiles ok
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => { const p = {}; programs.push(p); return p; }),
    attachShader: vi.fn(),
    detachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true), // always links ok
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => 0),

    // Texture lifecycle
    createTexture: vi.fn(() => { const t = {}; textures.push(t); return t; }),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),

    // Buffer lifecycle
    createBuffer: vi.fn(() => { const b = {}; buffers.push(b); return b; }),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),

    // Rendering
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),

    // Uniforms
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniformMatrix3fv: vi.fn(),

    _shaders: shaders,
    _programs: programs,
    _textures: textures,
    _buffers: buffers,
  };

  return gl;
}

function makeCanvas(gl: ReturnType<typeof makeGLMock> | null = makeGLMock()) {
  return {
    width: 1920,
    height: 1080,
    getContext: vi.fn(() => gl),
  } as unknown as HTMLCanvasElement;
}

import type { RenderLayer } from '../render/webgpu-engine';

function makeLayer(id = 'layer-1', opacity = 1): RenderLayer {
  return {
    id,
    opacity,
    texture: null,
    blend: 'normal',
    effects: [],
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
  };
}

// ============================================================
// initialize()
// ============================================================

describe('WebGLFallbackRenderer — initialize()', () => {
  it('returns false when WebGL2 is not supported', () => {
    const renderer = new WebGLFallbackRenderer();
    expect(renderer.initialize(makeCanvas(null))).toBe(false);
  });

  it('returns true on successful init', () => {
    const renderer = new WebGLFallbackRenderer();
    expect(renderer.initialize(makeCanvas())).toBe(true);
  });

  it('sets up blend state on success', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    expect(gl.enable).toHaveBeenCalledWith(gl.BLEND);
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  });

  it('creates exactly two buffers (position + texCoord)', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    expect(gl.createBuffer).toHaveBeenCalledTimes(2);
  });

  it('creates shader objects for vertex and fragment stages', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    expect(gl.createShader).toHaveBeenCalledWith(gl.VERTEX_SHADER);
    expect(gl.createShader).toHaveBeenCalledWith(gl.FRAGMENT_SHADER);
  });

  it('REGRESSION: shaders are deleted after successful link', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    // Both shaders must be deleted after link
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('REGRESSION: vertex shader freed when fragment shader fails to compile', () => {
    const gl = makeGLMock();
    let shaderCount = 0;
    gl.createShader = vi.fn(() => { shaderCount++; return {}; });
    gl.getShaderParameter = vi.fn((_s: unknown, param: unknown) => {
      // Fail only on the second call (fragment shader compile status)
      return param === gl.COMPILE_STATUS ? shaderCount < 2 : true;
    });

    const renderer = new WebGLFallbackRenderer();
    const result = renderer.initialize(makeCanvas(gl));
    expect(result).toBe(false);
    // createShader deletes the failed fs itself (call 1).
    // createProgram must additionally delete the already-compiled vs (call 2).
    // Before the fix only 1 deletion occurred (vs was leaked).
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// uploadTexture()
// ============================================================

describe('WebGLFallbackRenderer — uploadTexture()', () => {
  it('creates a new texture for a new id', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    gl.createTexture.mockClear();
    renderer.uploadTexture('tex-1', {} as HTMLCanvasElement);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
    expect(renderer.getStats().textureCount).toBe(1);
  });

  it('reuses existing texture for the same id', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('tex-1', {} as HTMLCanvasElement);
    gl.createTexture.mockClear();
    renderer.uploadTexture('tex-1', {} as HTMLCanvasElement);
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(renderer.getStats().textureCount).toBe(1);
  });

  it('accumulates multiple textures', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('a', {} as HTMLCanvasElement);
    renderer.uploadTexture('b', {} as HTMLCanvasElement);
    expect(renderer.getStats().textureCount).toBe(2);
  });
});

// ============================================================
// releaseTexture() / clearCache()
// ============================================================

describe('WebGLFallbackRenderer — releaseTexture / clearCache', () => {
  it('releaseTexture deletes GL texture and removes from map', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('tex-1', {} as HTMLCanvasElement);
    gl.deleteTexture.mockClear();
    renderer.releaseTexture('tex-1');
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(renderer.getStats().textureCount).toBe(0);
  });

  it('releaseTexture is no-op for unknown id', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    expect(() => renderer.releaseTexture('ghost')).not.toThrow();
  });

  it('clearCache deletes all textures', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('a', {} as HTMLCanvasElement);
    renderer.uploadTexture('b', {} as HTMLCanvasElement);
    gl.deleteTexture.mockClear();
    renderer.clearCache();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(renderer.getStats().textureCount).toBe(0);
  });
});

// ============================================================
// destroy()
// ============================================================

describe('WebGLFallbackRenderer — destroy()', () => {
  it('deletes program and both geometry buffers', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.destroy();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
  });

  it('deletes all textures on destroy', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('t', {} as HTMLCanvasElement);
    gl.deleteTexture.mockClear();
    renderer.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  });

  it('is safe to call without initialize', () => {
    expect(() => new WebGLFallbackRenderer().destroy()).not.toThrow();
  });

  it('is safe to call twice', () => {
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas());
    renderer.destroy();
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('renderFrame is no-op after destroy', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.destroy();
    gl.clear.mockClear();
    renderer.renderFrame([]);
    expect(gl.clear).not.toHaveBeenCalled();
  });
});

// ============================================================
// renderFrame()
// ============================================================

describe('WebGLFallbackRenderer — renderFrame()', () => {
  it('clears the viewport on each frame', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.renderFrame([]);
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
  });

  it('skips layers without uploaded texture', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.renderFrame([makeLayer('no-texture')]);
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it('draws each layer that has a texture', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('a', {} as HTMLCanvasElement);
    renderer.uploadTexture('b', {} as HTMLCanvasElement);
    renderer.renderFrame([makeLayer('a'), makeLayer('b'), makeLayer('no-tex')]);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });

  it('sets opacity uniform for each layer', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('layer', {} as HTMLCanvasElement);
    renderer.renderFrame([makeLayer('layer', 0.5)]);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.5);
  });

  it('sets transform uniform for each layer', () => {
    const gl = makeGLMock();
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas(gl));
    renderer.uploadTexture('layer', {} as HTMLCanvasElement);
    renderer.renderFrame([makeLayer('layer')]);
    expect(gl.uniformMatrix3fv).toHaveBeenCalled();
  });

  it('increments frameCount on each render', () => {
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas());
    renderer.renderFrame([]);
    renderer.renderFrame([]);
    expect(renderer.getStats().frameCount).toBe(2);
  });

  it('is no-op before initialize', () => {
    const renderer = new WebGLFallbackRenderer();
    expect(() => renderer.renderFrame([])).not.toThrow();
  });
});

// ============================================================
// getStats()
// ============================================================

describe('WebGLFallbackRenderer — getStats()', () => {
  it('backend is "webgl2"', () => {
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas());
    expect(renderer.getStats().backend).toBe('webgl2');
  });

  it('fps is 0 before first frame', () => {
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas());
    expect(renderer.getStats().fps).toBe(0);
  });

  it('frameCount starts at 0', () => {
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas());
    expect(renderer.getStats().frameCount).toBe(0);
  });

  it('textureCount reflects uploaded textures', () => {
    const renderer = new WebGLFallbackRenderer();
    renderer.initialize(makeCanvas());
    renderer.uploadTexture('t1', {} as HTMLCanvasElement);
    renderer.uploadTexture('t2', {} as HTMLCanvasElement);
    expect(renderer.getStats().textureCount).toBe(2);
    renderer.releaseTexture('t1');
    expect(renderer.getStats().textureCount).toBe(1);
  });
});
