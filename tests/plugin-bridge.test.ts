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
  for (const p of descriptor.parameters) parameters.set(p.id, p.defaultValue);
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
