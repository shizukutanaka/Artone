/**
 * Tests for plugins/plugin-bridge.ts
 *
 * WASM compilation, fetch, and AudioWorklet are not available in jsdom, so
 * loadPlugin/processOffline/scanPlugins are out of scope. Plugin instances
 * are injected into the private map to exercise the pure registry, parameter,
 * preset, and chain logic. initialize() is tested with a mocked worklet.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PluginBridge,
  BUILTIN_PLUGINS,
  buildWasmProcessorCode,
  type PluginDescriptor,
  type PluginInstance,
} from '../plugins/plugin-bridge';

function makeDescriptor(over: Partial<PluginDescriptor> = {}): PluginDescriptor {
  return {
    id: 'test:plugin',
    name: 'Test Plugin',
    vendor: 'Artone',
    version: '1.0.0',
    category: 'effect',
    type: 'wasm-native',
    inputs: 2,
    outputs: 2,
    wasmUrl: '/plugins/test.wasm',
    parameters: [
      { id: 'gain', name: 'Gain', shortName: 'G', unit: 'dB', minValue: -12, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'mix', name: 'Mix', shortName: 'M', unit: '', minValue: 0, maxValue: 1, defaultValue: 0.5, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
    ],
    ...over,
  };
}

let instCounter = 0;
function injectInstance(bridge: PluginBridge, descriptor = makeDescriptor()): PluginInstance {
  instCounter++;
  const parameters = new Map<string, number>();
  const paramById = new Map<string, (typeof descriptor.parameters)[0]>();
  const paramIndexById = new Map<string, number>();
  for (let i = 0; i < descriptor.parameters.length; i++) {
    const p = descriptor.parameters[i];
    parameters.set(p.id, p.defaultValue);
    paramById.set(p.id, p);
    paramIndexById.set(p.id, i);
  }
  const instance: PluginInstance = {
    id: `inst-${instCounter}`,
    descriptor,
    wasmModule: {} as WebAssembly.Module,
    wasmInstance: { exports: {} } as unknown as WebAssembly.Instance,
    audioNode: undefined,
    parameters,
    presets: [],
    currentPreset: -1,
    bypassed: false,
    paramById,
    paramIndexById,
  };
  (bridge as unknown as { instances: Map<string, PluginInstance> }).instances.set(instance.id, instance);
  return instance;
}

function makeBridge(): PluginBridge {
  return new PluginBridge({} as unknown as AudioContext);
}

// ============================================================
// BUILTIN_PLUGINS
// ============================================================

describe('BUILTIN_PLUGINS', () => {
  it('defines the four built-in effects', () => {
    const ids = BUILTIN_PLUGINS.map(p => p.id);
    expect(ids).toContain('builtin:eq3');
    expect(ids).toContain('builtin:compressor');
    expect(ids).toContain('builtin:reverb');
    expect(ids).toContain('builtin:limiter');
  });

  it('every plugin has parameters with valid ranges', () => {
    for (const plugin of BUILTIN_PLUGINS) {
      expect(plugin.parameters.length).toBeGreaterThan(0);
      for (const p of plugin.parameters) {
        expect(p.minValue).toBeLessThanOrEqual(p.maxValue);
        expect(p.defaultValue).toBeGreaterThanOrEqual(p.minValue);
        expect(p.defaultValue).toBeLessThanOrEqual(p.maxValue);
      }
    }
  });
});

// ============================================================
// Registry
// ============================================================

describe('PluginBridge — registry', () => {
  let bridge: PluginBridge;
  beforeEach(() => { bridge = makeBridge(); });

  it('registerPlugin then getAvailablePlugins', () => {
    bridge.registerPlugin(makeDescriptor());
    expect(bridge.getAvailablePlugins()).toHaveLength(1);
  });

  it('getPluginsByCategory filters by category', () => {
    bridge.registerPlugin(makeDescriptor({ id: 'a', category: 'effect' }));
    bridge.registerPlugin(makeDescriptor({ id: 'b', category: 'instrument' }));
    expect(bridge.getPluginsByCategory('effect')).toHaveLength(1);
    expect(bridge.getPluginsByCategory('instrument')).toHaveLength(1);
    expect(bridge.getPluginsByCategory('analyzer')).toHaveLength(0);
  });

  it('registering the same id twice overwrites', () => {
    bridge.registerPlugin(makeDescriptor({ id: 'x', name: 'First' }));
    bridge.registerPlugin(makeDescriptor({ id: 'x', name: 'Second' }));
    expect(bridge.getAvailablePlugins()).toHaveLength(1);
    expect(bridge.getAvailablePlugins()[0].name).toBe('Second');
  });
});

// ============================================================
// Parameters
// ============================================================

describe('PluginBridge — parameters', () => {
  let bridge: PluginBridge;
  beforeEach(() => { bridge = makeBridge(); });

  it('setParameter clamps to the parameter range', () => {
    const inst = injectInstance(bridge);
    bridge.setParameter(inst.id, 'gain', 100);
    expect(bridge.getParameter(inst.id, 'gain')).toBe(12);
    bridge.setParameter(inst.id, 'gain', -100);
    expect(bridge.getParameter(inst.id, 'gain')).toBe(-12);
  });

  it('setParameter stores in-range values', () => {
    const inst = injectInstance(bridge);
    bridge.setParameter(inst.id, 'mix', 0.75);
    expect(bridge.getParameter(inst.id, 'mix')).toBeCloseTo(0.75);
  });

  it('setParameter ignores unknown instance', () => {
    expect(() => bridge.setParameter('ghost', 'gain', 1)).not.toThrow();
  });

  it('setParameter ignores unknown parameter', () => {
    const inst = injectInstance(bridge);
    bridge.setParameter(inst.id, 'nonexistent', 5);
    expect(bridge.getParameter(inst.id, 'nonexistent')).toBeUndefined();
  });

  it('getParameter returns undefined for unknown instance', () => {
    expect(bridge.getParameter('ghost', 'gain')).toBeUndefined();
  });

  it('getAllParameters returns a copy', () => {
    const inst = injectInstance(bridge);
    const params = bridge.getAllParameters(inst.id)!;
    params.set('gain', 999);
    expect(bridge.getParameter(inst.id, 'gain')).toBe(0); // unchanged
  });

  it('getAllParameters returns undefined for unknown instance', () => {
    expect(bridge.getAllParameters('ghost')).toBeUndefined();
  });

  it('setParameter forwards to the WASM export when present', () => {
    const inst = injectInstance(bridge);
    const setParameter = vi.fn();
    (inst.wasmInstance as unknown as { exports: Record<string, unknown> }).exports = { setParameter };
    bridge.setParameter(inst.id, 'gain', 3);
    // paramIndex 0 for 'gain', clamped value 3
    expect(setParameter).toHaveBeenCalledWith(0, 3);
  });
});

// ============================================================
// Bypass
// ============================================================

describe('PluginBridge — bypass', () => {
  it('setBypass updates the instance flag', () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge);
    bridge.setBypass(inst.id, true);
    expect(bridge.getInstance(inst.id)!.bypassed).toBe(true);
    bridge.setBypass(inst.id, false);
    expect(bridge.getInstance(inst.id)!.bypassed).toBe(false);
  });

  it('setBypass ignores unknown instance', () => {
    expect(() => makeBridge().setBypass('ghost', true)).not.toThrow();
  });
});

// ============================================================
// Presets
// ============================================================

describe('PluginBridge — presets', () => {
  let bridge: PluginBridge;
  beforeEach(() => { bridge = makeBridge(); });

  it('savePreset captures current parameters', () => {
    const inst = injectInstance(bridge);
    bridge.setParameter(inst.id, 'gain', 6);
    const preset = bridge.savePreset(inst.id, 'My Preset');
    expect(preset.name).toBe('My Preset');
    expect(preset.parameters.gain).toBe(6);
    expect(bridge.getPresets(inst.id)).toHaveLength(1);
  });

  it('savePreset throws for unknown instance', () => {
    expect(() => bridge.savePreset('ghost', 'x')).toThrow('not found');
  });

  it('loadPreset applies stored parameters', () => {
    const inst = injectInstance(bridge);
    bridge.setParameter(inst.id, 'gain', 8);
    bridge.savePreset(inst.id, 'Loud');
    bridge.setParameter(inst.id, 'gain', 0);
    bridge.loadPreset(inst.id, 0);
    expect(bridge.getParameter(inst.id, 'gain')).toBe(8);
    expect(bridge.getInstance(inst.id)!.currentPreset).toBe(0);
  });

  it('loadPreset ignores out-of-range index', () => {
    const inst = injectInstance(bridge);
    expect(() => bridge.loadPreset(inst.id, 5)).not.toThrow();
  });

  it('REGRESSION: loadPreset(-1) does not crash on presets[-1]', () => {
    const inst = injectInstance(bridge);
    bridge.savePreset(inst.id, 'P');
    expect(() => bridge.loadPreset(inst.id, -1)).not.toThrow();
    // currentPreset stays at its initial -1 (no preset applied)
    expect(bridge.getInstance(inst.id)!.currentPreset).toBe(-1);
  });

  it('getPresets returns [] for unknown instance', () => {
    expect(bridge.getPresets('ghost')).toEqual([]);
  });
});

// ============================================================
// Chains
// ============================================================

describe('PluginBridge — chains', () => {
  let bridge: PluginBridge;
  beforeEach(() => { bridge = makeBridge(); });

  it('createChain returns an id and registers the chain', () => {
    const id = bridge.createChain('My Chain');
    expect(bridge.getChain(id)!.name).toBe('My Chain');
    expect(bridge.getChain(id)!.plugins).toHaveLength(0);
  });

  it('addToChain appends instances', () => {
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);
    expect(bridge.getChain(chainId)!.plugins).toEqual([a.id, b.id]);
  });

  it('addToChain respects the position argument', () => {
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    const c = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);
    bridge.addToChain(chainId, c.id, 1); // insert c between a and b
    expect(bridge.getChain(chainId)!.plugins).toEqual([a.id, c.id, b.id]);
  });

  it('addToChain ignores unknown chain or instance', () => {
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    bridge.addToChain('ghost-chain', a.id);
    bridge.addToChain(chainId, 'ghost-instance');
    expect(bridge.getChain(chainId)!.plugins).toHaveLength(0);
  });

  it('removeFromChain removes an instance', () => {
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);
    bridge.removeFromChain(chainId, a.id);
    expect(bridge.getChain(chainId)!.plugins).toEqual([b.id]);
  });

  it('reorderChain moves a plugin', () => {
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    const c = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);
    bridge.addToChain(chainId, c.id);
    bridge.reorderChain(chainId, 0, 2); // move a to the end
    expect(bridge.getChain(chainId)!.plugins).toEqual([b.id, c.id, a.id]);
  });

  it('getChainInput/Output return first/last instance nodes', () => {
    const chainId = bridge.createChain('C');
    // No audioNodes injected → undefined, but chain has plugins
    const a = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    // audioNode is undefined on injected instances
    expect(bridge.getChainInput(chainId)).toBeUndefined();
    expect(bridge.getChainOutput(chainId)).toBeUndefined();
  });

  it('getChainInput returns undefined for empty chain', () => {
    const chainId = bridge.createChain('C');
    expect(bridge.getChainInput(chainId)).toBeUndefined();
  });

  it('REGRESSION: unloadPlugin removes the instance id from every chain it belongs to', () => {
    // Before fix: unloadPlugin() only removed the instance from
    // this.instances, leaving its id in chain.plugins. getChainInput/Output
    // index into instances via chain.plugins[0]/[length-1], so a chain
    // whose first plugin was unloaded became silently non-functional
    // (undefined input) instead of falling back to its remaining plugins.
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);

    bridge.unloadPlugin(a.id);

    expect(bridge.getChain(chainId)!.plugins).toEqual([b.id]);
  });

  it('REGRESSION: unloadPlugin removes a mid-chain id from multiple chains', () => {
    const chainA = bridge.createChain('A');
    const chainB = bridge.createChain('B');
    const shared = injectInstance(bridge);
    const other = injectInstance(bridge);
    bridge.addToChain(chainA, shared.id);
    bridge.addToChain(chainA, other.id);
    bridge.addToChain(chainB, shared.id);

    bridge.unloadPlugin(shared.id);

    expect(bridge.getChain(chainA)!.plugins).toEqual([other.id]);
    expect(bridge.getChain(chainB)!.plugins).toEqual([]);
  });

  it('REGRESSION: reorderChain ignores an out-of-range fromIndex instead of corrupting the array', () => {
    // Before fix: an out-of-range fromIndex made splice(fromIndex, 1) remove
    // nothing (removed = undefined), which the second splice then inserted
    // as a literal element -- permanently corrupting chain.plugins with a
    // stray `undefined` entry.
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);

    bridge.reorderChain(chainId, 5, 0); // fromIndex out of range

    expect(bridge.getChain(chainId)!.plugins).toEqual([a.id, b.id]);
    expect(bridge.getChain(chainId)!.plugins).not.toContain(undefined);
  });

  it('REGRESSION: reorderChain ignores an out-of-range toIndex', () => {
    const chainId = bridge.createChain('C');
    const a = injectInstance(bridge);
    const b = injectInstance(bridge);
    bridge.addToChain(chainId, a.id);
    bridge.addToChain(chainId, b.id);

    bridge.reorderChain(chainId, 0, 9);

    expect(bridge.getChain(chainId)!.plugins).toEqual([a.id, b.id]);
  });
});

// ============================================================
// initialize — REGRESSION: worklet URL revoked
// ============================================================

describe('PluginBridge — initialize', () => {
  it('REGRESSION: revokes the worklet object URL after addModule', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:worklet');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const addModule = vi.fn(async () => {});
    const ctx = { audioWorklet: { addModule } } as unknown as AudioContext;

    const bridge = new PluginBridge(ctx);
    await bridge.initialize();

    expect(addModule).toHaveBeenCalledWith('blob:worklet');
    expect(revokeSpy).toHaveBeenCalledWith('blob:worklet');

    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('revokes the URL even if addModule rejects', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:worklet');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const addModule = vi.fn(async () => { throw new Error('addModule failed'); });
    const ctx = { audioWorklet: { addModule } } as unknown as AudioContext;

    const bridge = new PluginBridge(ctx);
    await expect(bridge.initialize()).rejects.toThrow('addModule failed');
    expect(revokeSpy).toHaveBeenCalledWith('blob:worklet');

    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});

// ============================================================
// Accessors
// ============================================================

describe('PluginBridge — accessors', () => {
  it('getAllInstances and getAllChains return all entries', () => {
    const bridge = makeBridge();
    injectInstance(bridge);
    injectInstance(bridge);
    bridge.createChain('A');
    expect(bridge.getAllInstances()).toHaveLength(2);
    expect(bridge.getAllChains()).toHaveLength(1);
  });

  it('getInstance/getChain return undefined for unknown ids', () => {
    const bridge = makeBridge();
    expect(bridge.getInstance('ghost')).toBeUndefined();
    expect(bridge.getChain('ghost')).toBeUndefined();
  });

  it('unloadPlugin removes the instance', () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge);
    bridge.unloadPlugin(inst.id);
    expect(bridge.getInstance(inst.id)).toBeUndefined();
  });

  it('unloadPlugin is safe for unknown instance', () => {
    expect(() => makeBridge().unloadPlugin('ghost')).not.toThrow();
  });
});

// ============================================================
// processOffline
// ============================================================

describe('PluginBridge — processOffline', () => {
  let bridge: PluginBridge;

  beforeEach(() => { bridge = makeBridge(); });

  it('throws when instance not found', async () => {
    const fakeBuffer = { numberOfChannels: 1, length: 128, sampleRate: 44100, getChannelData: () => new Float32Array(128) } as unknown as AudioBuffer;
    await expect(bridge.processOffline('ghost', fakeBuffer)).rejects.toThrow('not found');
  });

  it('throws when plugin does not support offline processing', async () => {
    const inst = injectInstance(bridge);
    // wasmInstance.exports defaults to {} — missing process/getInputBuffer/getOutputBuffer
    const fakeBuffer = { numberOfChannels: 1, length: 128, sampleRate: 44100, getChannelData: () => new Float32Array(128) } as unknown as AudioBuffer;
    await expect(bridge.processOffline(inst.id, fakeBuffer)).rejects.toThrow('offline processing');
  });

  it('processes audio blocks through WASM and returns output buffer', async () => {
    const BLOCK = 128;
    const channels = 2;
    const length = BLOCK;

    // Allocate a memory buffer large enough for 2 channel * BLOCK * Float32 * 2 (in+out)
    const memoryBuffer = new ArrayBuffer(channels * BLOCK * 4 * 2);
    const inputPtr = 0;
    const outputPtr = channels * BLOCK * 4;

    const processFn = vi.fn();

    const inst = injectInstance(bridge);
    (inst.wasmInstance as unknown as { exports: Record<string, unknown> }).exports = {
      process: processFn,
      getInputBuffer: vi.fn().mockReturnValue(inputPtr),
      getOutputBuffer: vi.fn().mockReturnValue(outputPtr),
      memory: { buffer: memoryBuffer },
    };

    const outChannelData = [new Float32Array(length), new Float32Array(length)];
    const outputBufferMock = {
      numberOfChannels: channels,
      length,
      sampleRate: 44100,
      getChannelData: vi.fn((ch: number) => outChannelData[ch]),
    };
    (bridge as unknown as { audioContext: { createBuffer: ReturnType<typeof vi.fn> } }).audioContext = {
      createBuffer: vi.fn().mockReturnValue(outputBufferMock),
    };

    const inputChannelData = new Float32Array(length).fill(0.5);
    const inputBuffer = {
      numberOfChannels: channels,
      length,
      sampleRate: 44100,
      getChannelData: vi.fn().mockReturnValue(inputChannelData),
    } as unknown as AudioBuffer;

    const result = await bridge.processOffline(inst.id, inputBuffer);
    expect(processFn).toHaveBeenCalledWith(length);
    expect(result).toBe(outputBufferMock);
  });

  it('handles multiple blocks when input length exceeds BLOCK_SIZE', async () => {
    const BLOCK = 128;
    const channels = 1;
    const length = BLOCK * 3; // 3 blocks

    const memoryBuffer = new ArrayBuffer(channels * BLOCK * 4 * 2);
    const processFn = vi.fn();

    const inst = injectInstance(bridge);
    (inst.wasmInstance as unknown as { exports: Record<string, unknown> }).exports = {
      process: processFn,
      getInputBuffer: vi.fn().mockReturnValue(0),
      getOutputBuffer: vi.fn().mockReturnValue(channels * BLOCK * 4),
      memory: { buffer: memoryBuffer },
    };

    const outChannelData = [new Float32Array(length)];
    const outputBufferMock = {
      numberOfChannels: channels,
      length,
      sampleRate: 44100,
      getChannelData: vi.fn((ch: number) => outChannelData[ch]),
    };
    (bridge as unknown as { audioContext: { createBuffer: ReturnType<typeof vi.fn> } }).audioContext = {
      createBuffer: vi.fn().mockReturnValue(outputBufferMock),
    };

    const inputBuffer = {
      numberOfChannels: channels,
      length,
      sampleRate: 44100,
      getChannelData: vi.fn().mockReturnValue(new Float32Array(length)),
    } as unknown as AudioBuffer;

    await bridge.processOffline(inst.id, inputBuffer);
    // 3 blocks → process called 3 times
    expect(processFn).toHaveBeenCalledTimes(3);
  });

  it('REGRESSION: clamps channel iteration to the plugin descriptor, not the AudioBuffer channel count', async () => {
    // Before fix: the input copy loop iterated inputBuffer.numberOfChannels
    // unconditionally, unlike the real-time process() path which clamps to
    // Math.min(channels, 2). Bouncing a >stereo AudioBuffer (e.g. 5.1
    // surround) through a stereo (inputs:2) plugin wrote channel-2..N sample
    // blocks at inputPtr + ch*blockSize*4 for ch up to numberOfChannels-1 --
    // memory a real 2-channel plugin never reserves and never expects
    // touched. Memory layout below places an untouched "guard" region
    // immediately after the assumed 2-channel input area, which only the
    // unclamped excess-channel writes could ever reach.
    const BLOCK = 128;
    const length = BLOCK;
    const channels = 6; // 5.1 surround AudioBuffer, but the plugin is stereo (inputs:2/outputs:2)

    const inputPtr = 0;
    const guardPtr = 2 * BLOCK * 4; // where descriptor.inputs=2's region ends; ch=2..5 writes land here without the clamp
    const guardChannels = channels - 2;
    const outputPtr = guardPtr + guardChannels * BLOCK * 4; // placed after the guard, so legit output copy never touches it

    const processFn = vi.fn();
    const inst = injectInstance(bridge, makeDescriptor({ inputs: 2, outputs: 2 }));
    (inst.wasmInstance as unknown as { exports: Record<string, unknown> }).exports = {
      process: processFn,
      getInputBuffer: vi.fn().mockReturnValue(inputPtr),
      getOutputBuffer: vi.fn().mockReturnValue(outputPtr),
      memory: { buffer: new ArrayBuffer(outputPtr + 2 * BLOCK * 4) },
    };
    const memoryBuffer = (inst.wasmInstance.exports as unknown as { memory: { buffer: ArrayBuffer } }).memory.buffer;

    const outChannelData = Array.from({ length: channels }, () => new Float32Array(length));
    const outputBufferMock = {
      numberOfChannels: channels,
      length,
      sampleRate: 44100,
      getChannelData: vi.fn((ch: number) => outChannelData[ch]),
    };
    (bridge as unknown as { audioContext: { createBuffer: ReturnType<typeof vi.fn> } }).audioContext = {
      createBuffer: vi.fn().mockReturnValue(outputBufferMock),
    };

    const inputChannelData = Array.from({ length: channels }, (_, ch) => new Float32Array(length).fill(ch + 1));
    const inputBuffer = {
      numberOfChannels: channels,
      length,
      sampleRate: 44100,
      getChannelData: vi.fn((ch: number) => inputChannelData[ch]),
    } as unknown as AudioBuffer;

    // Guard region: only reachable by an unclamped excess-channel write.
    // Fill it with a sentinel and snapshot that value (as a plain array, not
    // a live view) so the post-call comparison actually detects a mutation
    // rather than trivially comparing the same backing memory to itself.
    const guardView = new Float32Array(memoryBuffer, guardPtr, guardChannels * BLOCK);
    guardView.fill(-999);
    const guardSnapshot = Array.from(guardView);

    await bridge.processOffline(inst.id, inputBuffer);

    expect(Array.from(guardView)).toEqual(guardSnapshot);
    // Only the first 2 (descriptor.outputs) output channels get written;
    // channels 2..5 must remain untouched (still their initial zeros).
    expect(outChannelData[2].every((v) => v === 0)).toBe(true);
    expect(outChannelData[5].every((v) => v === 0)).toBe(true);
  });
});

// ============================================================
// openPluginUI
// ============================================================

describe('PluginBridge — openPluginUI', () => {
  let bridge: PluginBridge;

  beforeEach(() => { bridge = makeBridge(); });

  it('does nothing for unknown instance', async () => {
    const container = document.createElement('div');
    await bridge.openPluginUI('ghost', container);
    expect(container.childNodes.length).toBe(0);
  });

  it('creates generic UI when descriptor has no uiUrl', async () => {
    const inst = injectInstance(bridge);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    expect(container.childNodes.length).toBeGreaterThan(0);
    expect(container.querySelector('.plugin-ui')).not.toBeNull();
  });

  it('generic UI contains parameter knobs for non-hidden params', async () => {
    const inst = injectInstance(bridge);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const knobs = container.querySelectorAll('.plugin-param');
    // descriptor has 2 parameters (gain, mix), neither hidden
    expect(knobs.length).toBe(2);
  });

  it('creates an iframe when uiUrl is set', async () => {
    const desc = makeDescriptor({ uiUrl: 'about:blank' });
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toContain('about:blank');
  });

  it('bypass button in generic UI toggles instance bypassed flag', async () => {
    const inst = injectInstance(bridge);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const bypassBtn = container.querySelector('.plugin-bypass') as HTMLButtonElement;
    expect(bypassBtn).not.toBeNull();
    bypassBtn.click();
    expect(bridge.getInstance(inst.id)!.bypassed).toBe(true);
    bypassBtn.click();
    expect(bridge.getInstance(inst.id)!.bypassed).toBe(false);
  });

  it('knob mousedown + mousemove changes parameter via drag', async () => {
    const inst = injectInstance(bridge);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);

    const knob = container.querySelector('.plugin-param-knob') as HTMLElement;
    expect(knob).not.toBeNull();

    // Simulate mousedown to start drag at clientY=100
    knob.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    // Simulate mousemove upward by 50px → positive delta → gain increases
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: false, clientY: 50 }));

    // gain range is -12 to 12, delta = (100-50)/100 * 24 = 12 → clamped to 12
    expect(bridge.getParameter(inst.id, 'gain')).toBe(12);

    // mouseup stops dragging
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: false }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: false, clientY: 0 }));
    // value unchanged after mouseup
    expect(bridge.getParameter(inst.id, 'gain')).toBe(12);
  });

  it('preset selector change loads preset', async () => {
    const inst = injectInstance(bridge);
    bridge.setParameter(inst.id, 'gain', 6);
    bridge.savePreset(inst.id, 'Test Preset');
    bridge.setParameter(inst.id, 'gain', 0);

    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);

    const select = container.querySelector('.plugin-preset-select') as HTMLSelectElement;
    // First real preset is at index 1 (option value "0")
    select.value = '0';
    select.dispatchEvent(new Event('change', { bubbles: false }));
    expect(bridge.getParameter(inst.id, 'gain')).toBe(6);
  });

  it('generic UI hides hidden parameters', async () => {
    const desc = makeDescriptor({
      parameters: [
        { id: 'visible', name: 'Visible', shortName: 'V', unit: '', minValue: 0, maxValue: 1, defaultValue: 0.5, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
        { id: 'secret', name: 'Secret', shortName: 'S', unit: '', minValue: 0, maxValue: 1, defaultValue: 0, stepCount: 0, flags: { automatable: false, readonly: true, hidden: true, programChange: false } },
      ],
    });
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const knobs = container.querySelectorAll('.plugin-param');
    expect(knobs.length).toBe(1); // only 'visible'
  });

  it('formatValue uses integer formatting for stepCount > 0', async () => {
    const desc = makeDescriptor({
      parameters: [
        { id: 'steps', name: 'Steps', shortName: 'S', unit: '', minValue: 0, maxValue: 8, defaultValue: 3, stepCount: 8, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      ],
    });
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const valueEl = container.querySelector('.plugin-param-value');
    expect(valueEl?.textContent).toBe('3'); // integer formatted, no decimal
  });

  it('formatValue uses integer for large values (|v| >= 100)', async () => {
    const desc = makeDescriptor({
      parameters: [
        { id: 'big', name: 'Big', shortName: 'B', unit: 'Hz', minValue: 0, maxValue: 20000, defaultValue: 1000, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      ],
    });
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const valueEl = container.querySelector('.plugin-param-value');
    expect(valueEl?.textContent).toBe('1000 Hz'); // integer, not 1000.0
  });
});

// ============================================================
// getImports — sandbox import surface (security boundary)
// ============================================================

type BridgePrivate = {
  getImports(): WebAssembly.Imports;
  loadFactoryPresets(instance: PluginInstance): Promise<void>;
};

describe('PluginBridge — getImports (sandbox import surface)', () => {
  it('exposes only an env namespace with memory + whitelisted math functions', () => {
    const env = (makeBridge() as unknown as BridgePrivate).getImports().env as Record<string, unknown>;
    expect(Object.keys((makeBridge() as unknown as BridgePrivate).getImports())).toEqual(['env']);
    expect(env.memory).toBeInstanceOf(WebAssembly.Memory);
    for (const fn of ['sin', 'cos', 'tan', 'exp', 'log', 'pow', 'sqrt', 'floor', 'ceil', 'abs', 'min', 'max']) {
      expect(typeof env[fn]).toBe('function');
    }
  });

  it('does NOT expose ambient host capabilities (no eval/Function/fetch/process/etc.)', () => {
    // CLAUDE.md: ホスト API は明示的 import のみ提供 (ambient access 禁止) / eval・Function 禁止
    const env = (makeBridge() as unknown as BridgePrivate).getImports().env as Record<string, unknown>;
    for (const forbidden of [
      'eval', 'Function', 'fetch', 'process', 'require', 'XMLHttpRequest',
      'importScripts', 'open', 'WebSocket', 'localStorage', 'indexedDB',
    ]) {
      expect(env[forbidden]).toBeUndefined();
    }
  });

  it('the import surface is exactly memory + 12 math functions (no extras)', () => {
    const env = (makeBridge() as unknown as BridgePrivate).getImports().env as Record<string, unknown>;
    expect(Object.keys(env).sort()).toEqual(
      ['abs', 'ceil', 'cos', 'exp', 'floor', 'log', 'max', 'memory', 'min', 'pow', 'sin', 'sqrt', 'tan'].sort()
    );
  });

  it('provides a bounded memory (256 pages, not unbounded)', () => {
    const env = (makeBridge() as unknown as BridgePrivate).getImports().env as Record<string, unknown>;
    const mem = env.memory as WebAssembly.Memory;
    expect(mem.buffer.byteLength).toBe(256 * 65536); // 256 pages × 64 KiB
  });
});

// ============================================================
// scanPlugins — discovery via fetched index
// ============================================================

describe('PluginBridge — scanPlugins', () => {
  it('fetches the directory index and registers every descriptor', async () => {
    const bridge = makeBridge();
    const descs = [makeDescriptor({ id: 'a:1' }), makeDescriptor({ id: 'b:2' })];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => descs }) as unknown as Response));
    try {
      const result = await bridge.scanPlugins('/plugins');
      expect(result).toHaveLength(2);
      const ids = bridge.getAvailablePlugins().map(p => p.id);
      expect(ids).toEqual(expect.arrayContaining(['a:1', 'b:2']));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requests <directory>/index.json', async () => {
    const bridge = makeBridge();
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await bridge.scanPlugins('/my/plugins');
      expect(fetchSpy).toHaveBeenCalledWith('/my/plugins/index.json');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ============================================================
// loadFactoryPresets — both success and failure branches
// ============================================================

describe('PluginBridge — loadFactoryPresets', () => {
  it('loads presets from the <wasm>.presets.json sidecar on success', async () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge);
    const presets = [{ name: 'Warm', parameters: { gain: 3 } }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => presets }) as unknown as Response));
    try {
      await (bridge as unknown as BridgePrivate).loadFactoryPresets(inst);
      expect(inst.presets).toEqual(presets);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves presets empty when the sidecar fetch fails (no factory presets)', async () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('404'); }));
    try {
      await (bridge as unknown as BridgePrivate).loadFactoryPresets(inst);
      expect(inst.presets).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ============================================================
// loadPlugin — WASM compile + instantiate (Node has WebAssembly)
// ============================================================

describe('PluginBridge — loadPlugin', () => {
  // Smallest valid WASM module: magic header + version, no imports/exports.
  const MINIMAL_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  it('compiles/instantiates the WASM and registers a usable instance', async () => {
    const bridge = makeBridge();
    bridge.registerPlugin(makeDescriptor({ id: 'wasm:1', wasmUrl: '/plugins/x.wasm' }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('.wasm')) {
        return { ok: true, arrayBuffer: async () => MINIMAL_WASM.buffer } as unknown as Response;
      }
      return { ok: true, json: async () => [] } as unknown as Response; // presets sidecar
    }));
    try {
      const instanceId = await bridge.loadPlugin('wasm:1');
      expect(typeof instanceId).toBe('string');
      expect(instanceId.length).toBeGreaterThan(0);
      // Parameters initialized from descriptor defaults (gain=0, mix=0.5)
      expect(bridge.getParameter(instanceId, 'gain')).toBe(0);
      expect(bridge.getParameter(instanceId, 'mix')).toBe(0.5);
      // loadFactoryPresets ran with an empty sidecar
      expect(bridge.getPresets(instanceId)).toEqual([]);
      // Instance is retrievable
      expect(bridge.getInstance(instanceId)?.descriptor.id).toBe('wasm:1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects when the plugin id is unknown', async () => {
    const bridge = makeBridge();
    await expect(bridge.loadPlugin('does-not-exist')).rejects.toThrow('not found');
  });

  it('loads factory presets discovered alongside the WASM', async () => {
    const bridge = makeBridge();
    bridge.registerPlugin(makeDescriptor({ id: 'wasm:2', wasmUrl: '/plugins/y.wasm' }));
    const presets = [{ name: 'Default', parameters: { gain: 6 } }];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('.wasm')) {
        return { ok: true, arrayBuffer: async () => MINIMAL_WASM.buffer } as unknown as Response;
      }
      return { ok: true, json: async () => presets } as unknown as Response;
    }));
    try {
      const instanceId = await bridge.loadPlugin('wasm:2');
      expect(bridge.getPresets(instanceId)).toEqual(presets);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ============================================================
// Security: XSS prevention in createGenericUI
// ============================================================

describe('PluginBridge — createGenericUI XSS prevention', () => {
  it('REGRESSION: plugin name with HTML is escaped, not executed', async () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge, makeDescriptor({ name: '<img src=x onerror=alert(1)>' }));
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const nameEl = container.querySelector('.plugin-name');
    expect(nameEl?.textContent).toContain('<img');
    expect(nameEl?.innerHTML).not.toContain('<img');
    expect(nameEl?.innerHTML).toContain('&lt;img');
  });

  it('REGRESSION: vendor name with HTML is escaped', async () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge, makeDescriptor({ vendor: '<script>bad()</script>' }));
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const vendorEl = container.querySelector('.plugin-vendor');
    expect(vendorEl?.innerHTML).toContain('&lt;script&gt;');
    expect(vendorEl?.innerHTML).not.toContain('<script>');
  });

  it('REGRESSION: preset names with HTML are escaped in select options', async () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge);
    bridge.savePreset(inst.id, '<b>Bold Preset</b>');
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const select = container.querySelector('.plugin-preset-select') as HTMLSelectElement;
    // The option text should be the raw string, not rendered HTML
    const opt = select.options[1]; // first real option (index 0 = placeholder)
    expect(opt.textContent).toContain('<b>');
    expect(opt.innerHTML).toContain('&lt;b&gt;');
  });

  it('REGRESSION: param shortName with HTML is escaped in knob label', async () => {
    const desc = makeDescriptor({
      parameters: [
        { id: 'g', name: 'Gain', shortName: '<em>G</em>', unit: 'dB', minValue: -12, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      ],
    });
    const bridge = makeBridge();
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const nameEl = container.querySelector('.plugin-param-name');
    expect(nameEl?.innerHTML).toContain('&lt;em&gt;');
    expect(nameEl?.innerHTML).not.toContain('<em>');
  });
});

// ============================================================
// Listener lifecycle: openPluginUI + unloadPlugin cleanup
// ============================================================

describe('PluginBridge — UI listener cleanup', () => {
  it('REGRESSION: document mousemove listener is removed after unloadPlugin', async () => {
    const bridge = makeBridge();
    const inst = injectInstance(bridge);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);

    // Start drag
    const knob = container.querySelector('.plugin-param-knob') as HTMLElement;
    knob.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50 }));
    expect(bridge.getParameter(inst.id, 'gain')).toBe(12); // drag worked

    // Unload removes all UI listeners
    bridge.unloadPlugin(inst.id);

    // Now mousemove should not fire (instance is gone; no crash either)
    expect(() => document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }))).not.toThrow();
  });

  it('REGRESSION: re-opening plugin UI does not double-fire message listener', async () => {
    // Before fix: each openPluginUI call with uiUrl added a permanent message
    // listener that was never removed, so N opens → N handlers fired per message.
    const desc = makeDescriptor({ uiUrl: '/plugin-ui.html' });
    const bridge = makeBridge();
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');

    let callCount = 0;
    const origSetParam = bridge.setParameter.bind(bridge);
    vi.spyOn(bridge, 'setParameter').mockImplementation((...args) => {
      callCount++;
      return origSetParam(...args);
    });

    // Open twice — before fix this created 2 permanent window.message listeners
    await bridge.openPluginUI(inst.id, container);
    await bridge.openPluginUI(inst.id, container);

    // Messages are matched by source window identity (the iframe is sandboxed
    // to an opaque origin, so origin-string matching can't be used).
    const iframe = container.querySelector('iframe')!;
    const msg = new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'parameterChange', instanceId: inst.id, parameterId: 'gain', value: 5 },
    });
    window.dispatchEvent(msg);

    // After fix: exactly 1 handler fires (the second open replaced the first)
    expect(callCount).toBe(1);
  });

  it('sandboxes the plugin UI iframe (allow-scripts only, no allow-same-origin)', async () => {
    const bridge = makeBridge();
    const desc = makeDescriptor({ uiUrl: '/plugin-ui.html' });
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);
    const iframe = container.querySelector('iframe')!;
    const sandbox = iframe.getAttribute('sandbox') ?? '';
    expect(sandbox.split(/\s+/)).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-popups');
  });

  it('ignores parameterChange messages not sourced from the plugin iframe', async () => {
    const bridge = makeBridge();
    const desc = makeDescriptor({ uiUrl: '/plugin-ui.html' });
    const inst = injectInstance(bridge, desc);
    const container = document.createElement('div');
    await bridge.openPluginUI(inst.id, container);

    const before = bridge.getParameter(inst.id, 'gain');
    // `iframe.contentWindow` is null in jsdom, so a message with no `source`
    // set (which also defaults to null there) can't distinguish "from the
    // iframe" from "from nowhere" in this environment. Use an unambiguously
    // different, non-null source instead — e.g. `window` itself.
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: 'parameterChange', instanceId: inst.id, parameterId: 'gain', value: 5 },
    }));
    expect(bridge.getParameter(inst.id, 'gain')).toBe(before);
  });
});

// ============================================================
// WasmPluginProcessor worklet — real-time path is allocation-free
// ============================================================

/**
 * Evaluate the stringified AudioWorklet source under mocked worklet globals and
 * return the registered processor class. The worklet runs in an isolated scope
 * with no module imports, so this eval harness (same pattern as the sandbox
 * lockdown test in plugin-manager.test.ts) is the only way to exercise it.
 */
function instantiateWorkletProcessor(): new (opts: unknown) => {
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: unknown): boolean;
  [k: string]: unknown;
} {
  let RegisteredClass: unknown = null;
  const registerProcessor = (_name: string, cls: unknown): void => { RegisteredClass = cls; };
  class AudioWorkletProcessor {
    port = { postMessage: (): void => {}, onmessage: null as unknown };
  }
  const sampleRate = 48000;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', buildWasmProcessorCode())(
    AudioWorkletProcessor, registerProcessor, sampleRate,
  );
  if (!RegisteredClass) throw new Error('worklet did not registerProcessor');
  return RegisteredClass as new (opts: unknown) => {
    process(inputs: Float32Array[][], outputs: Float32Array[][], params: unknown): boolean;
    [k: string]: unknown;
  };
}

const BLOCK = 128;

/** Build a processor wired to a WASM-like memory with a doubling processFunc. */
function makeWiredProcessor() {
  const Proc = instantiateWorkletProcessor();
  const p = new Proc({});
  p.blockSize = BLOCK;
  const mem = new WebAssembly.Memory({ initial: 1 }); // 64 KiB
  p.wasmMemory = mem;
  p.inputPtr = 0;
  p.outputPtr = BLOCK * 2 * 4; // bytes: directly after the 256-float input region
  // Doubles every input sample, reading/writing the processor's cached views.
  p.processFunc = (): void => {
    const iv = p.inputView as Float32Array;
    const ov = p.outputView as Float32Array;
    for (let i = 0; i < BLOCK * 2; i++) ov[i] = iv[i] * 2;
  };
  return { p, mem };
}

function stereoIO() {
  const inL = new Float32Array(BLOCK).fill(0.25);
  const inR = new Float32Array(BLOCK).fill(0.5);
  const outL = new Float32Array(BLOCK);
  const outR = new Float32Array(BLOCK);
  return { inputs: [[inL, inR]], outputs: [[outL, outR]], outL, outR };
}

describe('WasmPluginProcessor — real-time process()', () => {
  it('routes input through WASM buffers to output via cached views', () => {
    const { p } = makeWiredProcessor();
    const { inputs, outputs, outL, outR } = stereoIO();

    expect(p.process(inputs, outputs, {})).toBe(true);
    expect(outL[0]).toBeCloseTo(0.5);  // 0.25 * 2
    expect(outR[0]).toBeCloseTo(1.0);  // 0.5 * 2
  });

  it('REGRESSION: reuses the same Float32Array views across blocks (no per-block alloc)', () => {
    const { p } = makeWiredProcessor();
    const { inputs, outputs } = stereoIO();

    p.process(inputs, outputs, {});
    const inView = p.inputView;
    const outView = p.outputView;
    expect(inView).toBeInstanceOf(Float32Array);

    // Many more blocks must not allocate new views.
    for (let i = 0; i < 50; i++) p.process(inputs, outputs, {});
    expect(p.inputView).toBe(inView);
    expect(p.outputView).toBe(outView);
  });

  it('rebuilds views when WASM memory grows (buffer detached)', () => {
    const { p, mem } = makeWiredProcessor();
    const { inputs, outputs, outL } = stereoIO();

    p.process(inputs, outputs, {});
    const before = p.inputView;

    mem.grow(1); // detaches the previous ArrayBuffer, invalidating old views
    p.process(inputs, outputs, {});

    // Plain identity checks — never hand the now-detached old view to a matcher,
    // whose diff serializer would throw on the detached buffer.
    expect(p.inputView !== before).toBe(true);
    expect(p.viewBuffer === mem.buffer).toBe(true);
    expect(outL[0]).toBeCloseTo(0.5); // still correct after rebuild
  });

  it('bypass path copies present channels and zero-fills absent ones without allocating', () => {
    const { p } = makeWiredProcessor();
    p.bypassed = true;

    // Present input channel is copied through.
    const inL = new Float32Array(BLOCK).fill(0.7);
    const outL = new Float32Array(BLOCK).fill(9);
    expect(p.process([[inL]], [[outL]], {})).toBe(true);
    expect(outL[0]).toBeCloseTo(0.7);

    // Absent input channel is silenced in place (no allocated silent buffer).
    const outSilent = new Float32Array(BLOCK).fill(9);
    p.process([[]], [[outSilent]], {});
    expect(outSilent[0]).toBe(0);

    // Missing inputs[0] entirely must not throw.
    const outSilent2 = new Float32Array(BLOCK).fill(9);
    expect(() => p.process([], [[outSilent2]], {})).not.toThrow();
    expect(outSilent2[0]).toBe(0);
  });

  it('bypasses (silences) before init when processFunc is unset', () => {
    const Proc = instantiateWorkletProcessor();
    const p = new Proc({});
    p.blockSize = BLOCK;
    // processFunc unset → bypass branch even though not explicitly bypassed.
    const outL = new Float32Array(BLOCK).fill(9);
    expect(p.process([[]], [[outL]], {})).toBe(true);
    expect(outL[0]).toBe(0);
  });

  it('source no longer contains the old per-block allocation patterns', () => {
    const src = buildWasmProcessorCode();
    expect(src).not.toMatch(/new Float32Array\(this\.blockSize\)/); // old bypass alloc
    expect(src).not.toMatch(/\.subarray\(/);                        // old per-channel output view
    expect(src).toContain('this.viewBuffer');                       // view caching present
  });
});

// ============================================================
// WasmPluginProcessor.setParameter — REGRESSION: allocation-free
// ============================================================

type ParamProcessor = {
  setParameter(id: string, value: number): void;
  [k: string]: unknown;
};

/** Build a processor wired to capture setParameter's WASM-side calls. */
function makeParamProcessor(): { p: ParamProcessor; calls: Array<{ id: string; value: number }> } {
  const Proc = instantiateWorkletProcessor();
  const p = new Proc({}) as unknown as ParamProcessor;
  const mem = new WebAssembly.Memory({ initial: 1 });
  p.wasmMemory = mem;
  const calls: Array<{ id: string; value: number }> = [];
  p.wasmAllocString = (): number => 1000; // fixed scratch offset in WASM memory
  p.wasmSetParameter = (ptr: number, len: number, value: number): void => {
    const bytes = new Uint8Array(mem.buffer, ptr, len);
    calls.push({ id: new TextDecoder().decode(bytes), value });
  };
  return { p, calls };
}

describe('WasmPluginProcessor.setParameter() — REGRESSION: allocation-free per call', () => {
  it('constructs at most one TextEncoder for the processor\'s lifetime, not one per setParameter call', () => {
    // Before fix: every call did `new TextEncoder().encode(id)`, allocating
    // both a new encoder AND a new Uint8Array on the real-time audio
    // thread -- reachable continuously during automation playback (driven
    // by port.onmessage), violating this codebase's "起動時のみアロケート"
    // rule for AudioWorkletProcessor the same way process() itself was
    // already fixed to respect. A plain identity check on p._textEncoder
    // would false-pass on the old code too (the property simply doesn't
    // exist there, so undefined === undefined trivially) -- count actual
    // constructor invocations instead via a spy on the global TextEncoder.
    let constructCount = 0;
    const RealTextEncoder = globalThis.TextEncoder;
    class CountingTextEncoder extends RealTextEncoder {
      constructor(...args: []) { super(...args); constructCount++; }
    }
    vi.stubGlobal('TextEncoder', CountingTextEncoder);
    try {
      const { p } = makeParamProcessor();
      const afterConstruct = constructCount;

      for (let i = 0; i < 20; i++) p.setParameter('gain', i * 0.1);

      expect(afterConstruct).toBeGreaterThanOrEqual(1); // sanity: was constructed at all
      expect(constructCount).toBe(afterConstruct); // none of the 20 calls constructed another
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('still delivers the correct parameter id and value to the WASM side', () => {
    const { p, calls } = makeParamProcessor();
    p.setParameter('gain', 0.5);
    p.setParameter('mix', 0.8);
    expect(calls).toEqual([
      { id: 'gain', value: 0.5 },
      { id: 'mix', value: 0.8 },
    ]);
  });

  it('source constructs TextEncoder once (in the constructor), not inside setParameter', () => {
    const src = buildWasmProcessorCode();
    const setParamBody = src.slice(src.indexOf('setParameter(id, value)'));
    expect(setParamBody).not.toMatch(/new TextEncoder\(\)/);
    expect(setParamBody).toContain('encodeInto');
    expect(src).toContain('this._textEncoder = new TextEncoder()');
  });
});
