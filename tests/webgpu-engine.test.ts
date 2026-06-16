/**
 * Tests for render/webgpu-engine.ts
 *
 * WebGPU is unavailable in jsdom (navigator.gpu is stubbed undefined), so
 * device-dependent paths are tested by injecting a mock GPUDevice into the
 * engine's private fields. The mock tracks createBuffer/createTexture and the
 * .destroy() calls on the objects they return, which is exactly what the
 * resource-leak regression needs to assert.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi } from 'vitest';
import { WebGPURenderEngine, type RenderLayer, type RenderEffect } from '../render/webgpu-engine';

// ============================================================
// Mock GPUDevice
// ============================================================

interface TrackedResource { destroy: ReturnType<typeof vi.fn>; width?: number; height?: number }

function makeMockDevice() {
  const createdBuffers: TrackedResource[] = [];
  const createdTextures: TrackedResource[] = [];

  const makeBuffer = (): TrackedResource => {
    const b = { destroy: vi.fn() };
    createdBuffers.push(b);
    return b;
  };
  const makeTexture = (size: number[]): TrackedResource => {
    const t = {
      destroy: vi.fn(),
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
      createView: vi.fn(() => ({})),
    };
    createdTextures.push(t);
    return t;
  };

  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };

  const encoder = {
    beginRenderPass: vi.fn(() => pass),
    beginComputePass: vi.fn(() => pass),
    finish: vi.fn(() => ({})),
  };

  const device = {
    createBuffer: vi.fn(() => makeBuffer()),
    createTexture: vi.fn((desc: { size: number[] }) => makeTexture(desc.size)),
    createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => encoder),
    createSampler: vi.fn(() => ({})),
    destroy: vi.fn(),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
  };

  return { device, createdBuffers, createdTextures, encoder, pass, deviceDestroy: device.destroy };
}

function makeContext() {
  return {
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) })),
    configure: vi.fn(),
  };
}

/** Inject a mock device + context + pipelines into a fresh engine. */
function primedEngine() {
  const engine = new WebGPURenderEngine();
  const mock = makeMockDevice();
  const internal = engine as unknown as {
    device: unknown;
    context: unknown;
    sampler: unknown;
    pipelines: Map<string, unknown>;
  };
  internal.device = mock.device;
  internal.context = makeContext();
  internal.sampler = {};
  internal.pipelines = new Map<string, unknown>([
    ['composite', { getBindGroupLayout: vi.fn(() => ({})) }],
    ['blur', { getBindGroupLayout: vi.fn(() => ({})) }],
  ]);
  return { engine, mock };
}

function makeLayerTexture(width = 100, height = 100) {
  return { width, height, destroy: vi.fn(), createView: vi.fn(() => ({})) } as unknown as GPUTexture;
}

function makeLayer(overrides: Partial<RenderLayer> = {}): RenderLayer {
  return {
    id: 'layer-1',
    texture: makeLayerTexture(),
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
    blend: 'normal',
    opacity: 1,
    effects: [],
    ...overrides,
  };
}

function makeEffect(type = 'blur', params: Record<string, number> = { radius: 5 }): RenderEffect {
  return { type, enabled: true, params } as unknown as RenderEffect;
}

// ============================================================
// constructor / getStats
// ============================================================

describe('WebGPURenderEngine — construction', () => {
  it('constructs without throwing', () => {
    expect(() => new WebGPURenderEngine()).not.toThrow();
  });

  it('getStats returns a copy (external mutation does not affect internal stats)', () => {
    const engine = new WebGPURenderEngine();
    const s = engine.getStats();
    s.fps = 999;
    expect(engine.getStats().fps).not.toBe(999);
  });

  it('initial stats are zeroed', () => {
    const stats = new WebGPURenderEngine().getStats();
    expect(stats.fps).toBe(0);
    expect(stats.cacheHitRate).toBe(0);
  });

  it('estimateMemory sums width*height*4 over cached textures, reported as MiB', async () => {
    // Memory-accounting logic (drives stats.textureMemoryMB during the render
    // loop). Tested directly: the loop body is pure arithmetic over the cache.
    const { engine } = primedEngine();
    await engine.importTexture({ width: 100, height: 100 } as unknown as ImageBitmap, 'a');
    await engine.importTexture({ width: 200, height: 100 } as unknown as ImageBitmap, 'b');
    const mb = (engine as unknown as { estimateMemory(): number }).estimateMemory();
    expect(mb).toBeCloseTo((100 * 100 * 4 + 200 * 100 * 4) / (1024 * 1024), 5);
  });

  it('estimateMemory is zero with an empty texture cache', () => {
    const mb = (new WebGPURenderEngine() as unknown as { estimateMemory(): number }).estimateMemory();
    expect(mb).toBe(0);
  });
});

// ============================================================
// initialize — fallback contract (documented: WebGPU 失敗時は false を返し
// 呼び出し側 RenderBackend が WebGL2 にフォールバックする)
//
// The shader/pipeline creation on the success path is irreducible GPUDevice
// API that only real hardware can validate (render/CLAUDE.md routes that to
// per-vendor + leak tests), so it is deliberately NOT faked here — doing so
// would assert only that fakes get stored in maps. These tests cover the
// genuinely meaningful contract: initialize must RETURN false, never throw,
// when WebGPU is unavailable.
// ============================================================

describe('WebGPURenderEngine — initialize fallback contract', () => {
  const canvas = { getContext: () => ({ configure: () => {} }) } as unknown as HTMLCanvasElement;
  // Restore only navigator (not vi.unstubAllGlobals, which would wipe the
  // setup.ts stubs like GPUTextureUsage / ImageData that later tests rely on).
  const realNavigator = globalThis.navigator;
  const restoreNavigator = () => vi.stubGlobal('navigator', realNavigator);

  it('returns false when navigator.gpu is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    try {
      expect(await new WebGPURenderEngine().initialize(canvas)).toBe(false);
    } finally {
      restoreNavigator();
    }
  });

  it('returns false (not throws) when no adapter is available', async () => {
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: async () => null, getPreferredCanvasFormat: () => 'bgra8unorm' },
    });
    try {
      expect(await new WebGPURenderEngine().initialize(canvas)).toBe(false);
    } finally {
      restoreNavigator();
    }
  });

  it('returns false (not throws) when device acquisition throws', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => { throw new Error('GPU device lost'); },
        getPreferredCanvasFormat: () => 'bgra8unorm',
      },
    });
    try {
      expect(await new WebGPURenderEngine().initialize(canvas)).toBe(false);
    } finally {
      restoreNavigator();
    }
  });
});

// ============================================================
// renderFrame — no device guard
// ============================================================

describe('WebGPURenderEngine — renderFrame guards', () => {
  it('is a no-op when device is not initialized', async () => {
    const engine = new WebGPURenderEngine();
    await expect(engine.renderFrame([])).resolves.toBeUndefined();
  });

  it('skips layers with no texture', async () => {
    const { engine, mock } = primedEngine();
    await engine.renderFrame([makeLayer({ texture: null })]);
    // Only the clear pass runs; no composite buffer created
    expect(mock.device.createBuffer).not.toHaveBeenCalled();
  });
});

// ============================================================
// REGRESSION: GPU resource leak — transient buffers/textures destroyed
// ============================================================

describe('WebGPURenderEngine — REGRESSION: frame-local GPU resources are destroyed', () => {
  it('destroys the composite paramBuffer after submit', async () => {
    const { engine, mock } = primedEngine();
    await engine.renderFrame([makeLayer()]);

    expect(mock.device.createBuffer).toHaveBeenCalledTimes(1); // composite paramBuffer
    // Every created buffer must be destroyed
    expect(mock.createdBuffers).toHaveLength(1);
    expect(mock.createdBuffers[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys effect paramBuffer AND intermediate output texture', async () => {
    const { engine, mock } = primedEngine();
    await engine.renderFrame([makeLayer({ effects: [makeEffect('blur')] })]);

    // 2 buffers: effect paramBuffer + composite paramBuffer
    expect(mock.createdBuffers).toHaveLength(2);
    for (const b of mock.createdBuffers) {
      expect(b.destroy).toHaveBeenCalledTimes(1);
    }

    // 1 intermediate texture from applyEffect — must be destroyed
    expect(mock.createdTextures).toHaveLength(1);
    expect(mock.createdTextures[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys resources for multiple effects in a chain', async () => {
    const { engine, mock } = primedEngine();
    await engine.renderFrame([
      makeLayer({ effects: [makeEffect('blur'), makeEffect('blur')] }),
    ]);

    // 2 effect buffers + 1 composite buffer = 3
    expect(mock.createdBuffers).toHaveLength(3);
    for (const b of mock.createdBuffers) expect(b.destroy).toHaveBeenCalledTimes(1);

    // 2 intermediate textures
    expect(mock.createdTextures).toHaveLength(2);
    for (const t of mock.createdTextures) expect(t.destroy).toHaveBeenCalledTimes(1);
  });

  it('submits the encoder once per frame', async () => {
    const { engine, mock } = primedEngine();
    await engine.renderFrame([makeLayer()]);
    expect(mock.device.queue.submit).toHaveBeenCalledTimes(1);
  });

  it('disabled effects do not create resources', async () => {
    const { engine, mock } = primedEngine();
    await engine.renderFrame([
      makeLayer({ effects: [{ type: 'blur', enabled: false, params: {} } as unknown as RenderEffect] }),
    ]);
    // No effect resources; only the composite paramBuffer
    expect(mock.createdBuffers).toHaveLength(1);
    expect(mock.createdTextures).toHaveLength(0);
  });

  it('unknown effect type leaves input texture unchanged (no output texture)', async () => {
    const { engine, mock } = primedEngine();
    // 'sharpen' has no pipeline → applyEffect returns null, caller keeps current tex
    await engine.renderFrame([makeLayer({ effects: [makeEffect('sharpen')] })]);
    // No intermediate texture created for the missing pipeline
    expect(mock.createdTextures).toHaveLength(0);
    // Only composite paramBuffer
    expect(mock.createdBuffers).toHaveLength(1);
  });

  it('REGRESSION: unknown effect type does not destroy the original layer texture', async () => {
    // Bug: applyEffect returned `input` (not null) when no pipeline was registered.
    // The caller pushed `input` into transientTextures and destroyed it after submit,
    // wiping the layer's own GPU texture and corrupting subsequent frames that
    // reference the same layer (e.g. cached textures from importTexture).
    const { engine } = primedEngine();
    const layerTex = makeLayerTexture();
    await engine.renderFrame([
      makeLayer({ texture: layerTex, effects: [makeEffect('sharpen')] }),
    ]);
    const destroyFn = (layerTex as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy;
    expect(destroyFn).not.toHaveBeenCalled();
  });
});

// ============================================================
// Texture cache
// ============================================================

describe('WebGPURenderEngine — texture cache', () => {
  function makeSource(width = 50, height = 50) {
    return { width, height } as unknown as ImageBitmap;
  }

  it('importTexture returns null without a device', async () => {
    const engine = new WebGPURenderEngine();
    expect(await engine.importTexture(makeSource(), 'tex-1')).toBeNull();
  });

  it('caches a texture and returns the same instance on cache hit', async () => {
    const { engine, mock } = primedEngine();
    const first = await engine.importTexture(makeSource(), 'tex-1');
    mock.device.createTexture.mockClear();
    const second = await engine.importTexture(makeSource(), 'tex-1');
    expect(second).toBe(first);
    expect(mock.device.createTexture).not.toHaveBeenCalled(); // served from cache
  });

  it('evicts the oldest texture when the cache is full', async () => {
    const engine = new WebGPURenderEngine({ maxTextureCache: 2 });
    const mock = makeMockDevice();
    (engine as unknown as { device: unknown }).device = mock.device;

    await engine.importTexture(makeSource(), 'a');
    await engine.importTexture(makeSource(), 'b');
    await engine.importTexture(makeSource(), 'c'); // evicts 'a'

    // 'a' (first created texture) must have been destroyed on eviction
    expect(mock.createdTextures[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('clearCache destroys all cached textures', async () => {
    const { engine, mock } = primedEngine();
    await engine.importTexture(makeSource(), 'a');
    await engine.importTexture(makeSource(), 'b');
    engine.clearCache();
    for (const t of mock.createdTextures) {
      expect(t.destroy).toHaveBeenCalledTimes(1);
    }
  });
});

// ============================================================
// destroy
// ============================================================

describe('WebGPURenderEngine — destroy()', () => {
  it('clears the cache and drops device/context references', async () => {
    const { engine, mock } = primedEngine();
    await engine.importTexture({ width: 10, height: 10 } as unknown as ImageBitmap, 'a');
    engine.destroy();
    // Cached texture destroyed
    expect(mock.createdTextures[0].destroy).toHaveBeenCalled();
    // GPUDevice.destroy() called to free all remaining GPU resources
    expect(mock.deviceDestroy).toHaveBeenCalledOnce();
    // After destroy, renderFrame becomes a no-op (device cleared)
    await expect(engine.renderFrame([makeLayer()])).resolves.toBeUndefined();
  });

  it('is safe to call without initialization', () => {
    expect(() => new WebGPURenderEngine().destroy()).not.toThrow();
  });
});
