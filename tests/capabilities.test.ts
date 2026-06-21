/**
 * app/capabilities.ts — Browser capability detection unit tests.
 *
 * We mock the relevant global APIs (navigator.gpu, VideoDecoder, etc.) per test
 * and call resetCapabilities() between runs so the module-level cache is cleared.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectCapabilities,
  getCapabilities,
  resetCapabilities,
} from '../app/capabilities';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Remove a global so capabilities falls back to "not available". */
function removeGlobal(name: string) {
  const orig = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value: undefined, configurable: true, writable: true });
  return () => {
    if (orig) Object.defineProperty(globalThis, name, orig);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

beforeEach(() => {
  resetCapabilities();
});

// ── getCapabilities / resetCapabilities ──────────────────────────────────────

describe('getCapabilities()', () => {
  it('returns null before first detectCapabilities()', () => {
    expect(getCapabilities()).toBeNull();
  });

  it('returns the cached result after detectCapabilities()', async () => {
    const result = await detectCapabilities();
    expect(getCapabilities()).toBe(result);
  });

  it('resetCapabilities() clears the cache', async () => {
    await detectCapabilities();
    resetCapabilities();
    expect(getCapabilities()).toBeNull();
  });
});

// ── detectCapabilities: caching ──────────────────────────────────────────────

describe('detectCapabilities() caching', () => {
  it('returns the same object on repeated calls', async () => {
    const a = await detectCapabilities();
    const b = await detectCapabilities();
    expect(a).toBe(b);
  });
});

// ── detectCapabilities: WebGPU ────────────────────────────────────────────────

describe('detectCapabilities() — WebGPU', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });

  it('reports webgpu:false when navigator.gpu is undefined', async () => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(caps.webgpu).toBe(false);
    expect(caps.warnings.some((w) => w.includes('WebGPU'))).toBe(true);
  });

  it('reports webgpu:false when requestAdapter returns null', async () => {
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockResolvedValue(null) },
      configurable: true,
    });
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(caps.webgpu).toBe(false);
  });

  it('reports webgpu:true when requestAdapter returns an adapter', async () => {
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockResolvedValue({ name: 'mock-adapter' }) },
      configurable: true,
    });
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(caps.webgpu).toBe(true);
    expect(caps.warnings.some((w) => w.includes('WebGPU'))).toBe(false);
  });

  it('reports webgpu:false when requestAdapter throws', async () => {
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockRejectedValue(new Error('GPU unavailable')) },
      configurable: true,
    });
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(caps.webgpu).toBe(false);
  });
});

// ── detectCapabilities: WebCodecs ─────────────────────────────────────────────

describe('detectCapabilities() — WebCodecs', () => {
  it('reports webcodecs:false when VideoDecoder is undefined', async () => {
    const restoreDecoder = removeGlobal('VideoDecoder');
    const restoreEncoder = removeGlobal('VideoEncoder');
    resetCapabilities();
    try {
      const caps = await detectCapabilities();
      expect(caps.webcodecs).toBe(false);
      expect(caps.warnings.some((w) => w.includes('WebCodecs'))).toBe(true);
    } finally {
      restoreDecoder();
      restoreEncoder();
    }
  });

  it('reports webcodecs:true when both VideoDecoder and VideoEncoder are defined', async () => {
    const origD = globalThis.VideoDecoder;
    const origE = globalThis.VideoEncoder;
    (globalThis as Record<string, unknown>).VideoDecoder = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = class {};
    resetCapabilities();
    try {
      const caps = await detectCapabilities();
      expect(caps.webcodecs).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>).VideoDecoder = origD;
      (globalThis as Record<string, unknown>).VideoEncoder = origE;
    }
  });
});

// ── detectCapabilities: tier classification ───────────────────────────────────

describe('detectCapabilities() — tier', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });

  it('tier is "full" when webgpu AND webcodecs are available', async () => {
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockResolvedValue({ name: 'gpu' }) },
      configurable: true,
    });
    // Stub without vi.stubGlobal to avoid touching OffscreenCanvas when unstubbing
    const origD = globalThis.VideoDecoder;
    const origE = globalThis.VideoEncoder;
    (globalThis as Record<string, unknown>).VideoDecoder = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = class {};
    resetCapabilities();
    try {
      const caps = await detectCapabilities();
      expect(caps.tier).toBe('full');
    } finally {
      (globalThis as Record<string, unknown>).VideoDecoder = origD;
      (globalThis as Record<string, unknown>).VideoEncoder = origE;
    }
  });

  it('tier is "degraded" when webgpu is missing but webcodecs is present', async () => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const origD = globalThis.VideoDecoder;
    const origE = globalThis.VideoEncoder;
    (globalThis as Record<string, unknown>).VideoDecoder = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = class {};
    resetCapabilities();
    try {
      const caps = await detectCapabilities();
      expect(caps.tier).toBe('degraded');
    } finally {
      (globalThis as Record<string, unknown>).VideoDecoder = origD;
      (globalThis as Record<string, unknown>).VideoEncoder = origE;
    }
  });

  it('tier is "degraded" when webcodecs is missing but webgpu and OffscreenCanvas present', async () => {
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockResolvedValue({ name: 'gpu' }) },
      configurable: true,
    });
    const restoreD = removeGlobal('VideoDecoder');
    const restoreE = removeGlobal('VideoEncoder');
    resetCapabilities();
    try {
      // OffscreenCanvas is still available (stubbed in setup.ts), so tier='degraded' not 'minimal'
      const caps = await detectCapabilities();
      expect(caps.tier).toBe('degraded');
    } finally {
      restoreD();
      restoreE();
    }
  });

  it('tier is "minimal" when webcodecs and offscreenCanvas are both missing', async () => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const restoreD = removeGlobal('VideoDecoder');
    const restoreE = removeGlobal('VideoEncoder');
    const origOC = globalThis.OffscreenCanvas;
    (globalThis as Record<string, unknown>).OffscreenCanvas = undefined;
    resetCapabilities();
    try {
      const caps = await detectCapabilities();
      expect(caps.tier).toBe('minimal');
    } finally {
      restoreD();
      restoreE();
      (globalThis as Record<string, unknown>).OffscreenCanvas = origOC;
    }
  });
});

// ── detectCapabilities: individual fields ────────────────────────────────────

describe('detectCapabilities() — individual fields', () => {
  it('offscreenCanvas is true when OffscreenCanvas is defined', async () => {
    // OffscreenCanvas is already stubbed in setup.ts; just verify the capability reports true
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(caps.offscreenCanvas).toBe(true);
  });

  it('serviceWorker is true when navigator.serviceWorker exists', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(caps.serviceWorker).toBe(true);
  });

  it('warnings is an array', async () => {
    resetCapabilities();
    const caps = await detectCapabilities();
    expect(Array.isArray(caps.warnings)).toBe(true);
  });

  it('result has all expected fields', async () => {
    resetCapabilities();
    const caps = await detectCapabilities();
    const expectedKeys: (keyof typeof caps)[] = [
      'webgpu', 'webcodecs', 'webaudio', 'audioWorklet',
      'offscreenCanvas', 'indexedDB', 'serviceWorker',
      'sharedArrayBuffer', 'wasmThreads', 'tier', 'warnings',
    ];
    for (const key of expectedKeys) {
      expect(caps).toHaveProperty(key);
    }
  });
});
