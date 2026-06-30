/**
 * Artone v3 - VST/AU Plugin Bridge
 * WebAssembly オーディオプラグインシステム
 * 
 * 機能:
 * - WASM プラグインロード
 * - AudioWorklet 統合
 * - パラメータ自動化
 * - プリセット管理
 * - プラグインチェーン
 */

// ==================== Types ====================

interface PluginDescriptor {
  id: string;
  name: string;
  vendor: string;
  version: string;
  category: PluginCategory;
  type: PluginType;
  inputs: number;
  outputs: number;
  parameters: ParameterDescriptor[];
  wasmUrl: string;
  uiUrl?: string;
}

type PluginCategory = 'effect' | 'instrument' | 'analyzer' | 'utility';
type PluginType = 'vst3' | 'au' | 'lv2' | 'wasm-native';

interface ParameterDescriptor {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  stepCount: number;
  flags: ParameterFlags;
}

interface ParameterFlags {
  automatable: boolean;
  readonly: boolean;
  hidden: boolean;
  programChange: boolean;
}

export interface PluginInstance {
  id: string;
  descriptor: PluginDescriptor;
  wasmModule: WebAssembly.Module;
  wasmInstance: WebAssembly.Instance;
  audioNode?: AudioWorkletNode;
  parameters: Map<string, number>;
  presets: PluginPreset[];
  currentPreset: number;
  bypassed: boolean;
  /** O(1) lookup maps built once at instantiation — avoids .find()/.findIndex() per setParameter call. */
  paramById: Map<string, ParameterDescriptor>;
  paramIndexById: Map<string, number>;
}

interface PluginPreset {
  name: string;
  parameters: Record<string, number>;
}

interface PluginChain {
  id: string;
  name: string;
  plugins: string[]; // Instance IDs
  inputGain: number;
  outputGain: number;
  bypassed: boolean;
}

interface ProcessBuffer {
  inputs: Float32Array[];
  outputs: Float32Array[];
  sampleRate: number;
  blockSize: number;
}

// ==================== Plugin Bridge ====================

export class PluginBridge {
  private audioContext: AudioContext;
  private descriptors: Map<string, PluginDescriptor> = new Map();
  private instances: Map<string, PluginInstance> = new Map();
  private chains: Map<string, PluginChain> = new Map();
  private workletReady = false;
  /** AbortControllers for active plugin UIs — aborted on close/unload to remove all listeners. */
  private uiCleanups = new Map<string, AbortController>();

  private readonly BLOCK_SIZE = 128;

  /** Escape HTML special characters to prevent XSS when injecting plugin metadata into innerHTML. */
  private static escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
    ));
  }
  
  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }
  
  // ==================== Initialization ====================
  
  async initialize(): Promise<void> {
    const workletUrl = this.createWorkletProcessor();
    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
      this.workletReady = true;
    } finally {
      // The worklet module has been fetched; revoke the blob URL so it does
      // not leak for the lifetime of the process.
      URL.revokeObjectURL(workletUrl);
    }
  }
  
  private createWorkletProcessor(): string {
    const blob = new Blob([buildWasmProcessorCode()], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }
  
  // ==================== Plugin Discovery ====================
  
  async scanPlugins(directory: string): Promise<PluginDescriptor[]> {
    // In browser: fetch plugin index from server
    const response = await fetch(`${directory}/index.json`);
    if (!response.ok) throw new Error(`Failed to fetch plugin index: ${response.status} ${response.statusText}`);
    const plugins: PluginDescriptor[] = await response.json();
    
    for (const plugin of plugins) {
      this.descriptors.set(plugin.id, plugin);
    }
    
    return plugins;
  }
  
  registerPlugin(descriptor: PluginDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
  }
  
  getAvailablePlugins(): PluginDescriptor[] {
    return [...this.descriptors.values()];
  }
  
  getPluginsByCategory(category: PluginCategory): PluginDescriptor[] {
    return [...this.descriptors.values()].filter(p => p.category === category);
  }
  
  // ==================== Plugin Instantiation ====================
  
  async loadPlugin(pluginId: string): Promise<string> {
    const descriptor = this.descriptors.get(pluginId);
    if (!descriptor) throw new Error(`Plugin ${pluginId} not found`);
    
    // Fetch WASM
    const response = await fetch(descriptor.wasmUrl);
    if (!response.ok) throw new Error(`Failed to fetch WASM for plugin ${pluginId}: ${response.status} ${response.statusText}`);
    const wasmBytes = await response.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);
    
    // Create instance
    const instanceId = this.generateId();
    const wasmInstance = await WebAssembly.instantiate(wasmModule, this.getImports());
    
    // Create AudioWorkletNode
    let audioNode: AudioWorkletNode | undefined;
    if (this.workletReady) {
      audioNode = new AudioWorkletNode(this.audioContext, 'wasm-plugin-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [descriptor.outputs]
      });
      
      audioNode.port.postMessage({
        type: 'init',
        data: { wasmBytes: new Uint8Array(wasmBytes), blockSize: this.BLOCK_SIZE }
      });
    }
    
    // Initialize parameters and build O(1) lookup indices (paramById, paramIndexById).
    // These avoid repeated .find()/.findIndex() in setParameter(), which is called
    // at up to 60fps during automation playback.
    const parameters = new Map<string, number>();
    const paramById = new Map<string, ParameterDescriptor>();
    const paramIndexById = new Map<string, number>();
    for (let i = 0; i < descriptor.parameters.length; i++) {
      const param = descriptor.parameters[i];
      parameters.set(param.id, param.defaultValue);
      paramById.set(param.id, param);
      paramIndexById.set(param.id, i);
    }

    const instance: PluginInstance = {
      id: instanceId,
      descriptor,
      wasmModule,
      wasmInstance,
      audioNode,
      parameters,
      presets: [],
      currentPreset: -1,
      bypassed: false,
      paramById,
      paramIndexById,
    };
    
    this.instances.set(instanceId, instance);
    
    // Load factory presets
    await this.loadFactoryPresets(instance);
    
    return instanceId;
  }
  
  private getImports(): WebAssembly.Imports {
    return {
      env: {
        memory: new WebAssembly.Memory({ initial: 256 }),
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        exp: Math.exp,
        log: Math.log,
        pow: Math.pow,
        sqrt: Math.sqrt,
        floor: Math.floor,
        ceil: Math.ceil,
        abs: Math.abs,
        min: Math.min,
        max: Math.max
      }
    };
  }
  
  unloadPlugin(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.audioNode?.disconnect();
      this.instances.delete(instanceId);
    }
    // Abort any active UI listeners (message + document mousemove/mouseup).
    this.uiCleanups.get(instanceId)?.abort();
    this.uiCleanups.delete(instanceId);
  }
  
  // ==================== Parameter Control ====================
  
  setParameter(instanceId: string, parameterId: string, value: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    const param = instance.paramById.get(parameterId);
    if (!param) return;

    const clampedValue = Math.max(param.minValue, Math.min(param.maxValue, value));
    instance.parameters.set(parameterId, clampedValue);

    // Update WASM instance — O(1) index lookup via pre-built map
    const exports = instance.wasmInstance.exports as { setParameter?: (id: number, value: number) => void };
    if (exports.setParameter) {
      const paramIndex = instance.paramIndexById.get(parameterId)!;
      exports.setParameter(paramIndex, clampedValue);
    }
    
    // Update AudioWorklet
    instance.audioNode?.port.postMessage({
      type: 'setParameter',
      data: { id: parameterId, value: clampedValue }
    });
  }
  
  getParameter(instanceId: string, parameterId: string): number | undefined {
    return this.instances.get(instanceId)?.parameters.get(parameterId);
  }
  
  getAllParameters(instanceId: string): Map<string, number> | undefined {
    const instance = this.instances.get(instanceId);
    return instance ? new Map(instance.parameters) : undefined;
  }
  
  // ==================== Bypass ====================
  
  setBypass(instanceId: string, bypassed: boolean): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.bypassed = bypassed;
      instance.audioNode?.port.postMessage({ type: 'bypass', data: { bypassed } });
    }
  }
  
  // ==================== Presets ====================
  
  private async loadFactoryPresets(instance: PluginInstance): Promise<void> {
    // Try to load presets from plugin's preset URL
    const presetsUrl = instance.descriptor.wasmUrl.replace('.wasm', '.presets.json');
    try {
      const response = await fetch(presetsUrl);
      if (!response.ok) return; // 404 expected when plugin has no presets
      const presets: PluginPreset[] = await response.json();
      instance.presets = presets;
    } catch {
      // No factory presets
    }
  }
  
  getPresets(instanceId: string): PluginPreset[] {
    return this.instances.get(instanceId)?.presets || [];
  }
  
  loadPreset(instanceId: string, presetIndex: number): void {
    const instance = this.instances.get(instanceId);
    // Guard negative indices too: presets[-1] is undefined → .parameters throws.
    if (!instance || presetIndex < 0 || presetIndex >= instance.presets.length) return;
    
    const preset = instance.presets[presetIndex];
    for (const [paramId, value] of Object.entries(preset.parameters)) {
      this.setParameter(instanceId, paramId, value);
    }
    instance.currentPreset = presetIndex;
  }
  
  savePreset(instanceId: string, name: string): PluginPreset {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);
    
    const preset: PluginPreset = {
      name,
      parameters: Object.fromEntries(instance.parameters)
    };
    
    instance.presets.push(preset);
    return preset;
  }
  
  // ==================== Plugin Chains ====================
  
  createChain(name: string): string {
    const id = this.generateId();
    const chain: PluginChain = {
      id,
      name,
      plugins: [],
      inputGain: 1,
      outputGain: 1,
      bypassed: false
    };
    this.chains.set(id, chain);
    return id;
  }
  
  addToChain(chainId: string, instanceId: string, position?: number): void {
    const chain = this.chains.get(chainId);
    const instance = this.instances.get(instanceId);
    if (!chain || !instance) return;
    
    if (position !== undefined && position >= 0 && position <= chain.plugins.length) {
      chain.plugins.splice(position, 0, instanceId);
    } else {
      chain.plugins.push(instanceId);
    }
    
    this.reconnectChain(chain);
  }
  
  removeFromChain(chainId: string, instanceId: string): void {
    const chain = this.chains.get(chainId);
    if (!chain) return;
    
    const idx = chain.plugins.indexOf(instanceId);
    if (idx >= 0) {
      chain.plugins.splice(idx, 1);
      this.reconnectChain(chain);
    }
  }
  
  reorderChain(chainId: string, fromIndex: number, toIndex: number): void {
    const chain = this.chains.get(chainId);
    if (!chain) return;
    
    const [removed] = chain.plugins.splice(fromIndex, 1);
    chain.plugins.splice(toIndex, 0, removed);
    this.reconnectChain(chain);
  }
  
  private reconnectChain(chain: PluginChain): void {
    // Disconnect all
    for (const instanceId of chain.plugins) {
      const instance = this.instances.get(instanceId);
      instance?.audioNode?.disconnect();
    }
    
    // Reconnect in order
    for (let i = 0; i < chain.plugins.length - 1; i++) {
      const current = this.instances.get(chain.plugins[i]);
      const next = this.instances.get(chain.plugins[i + 1]);
      if (current?.audioNode && next?.audioNode) {
        current.audioNode.connect(next.audioNode);
      }
    }
  }
  
  getChainInput(chainId: string): AudioNode | undefined {
    const chain = this.chains.get(chainId);
    if (!chain || chain.plugins.length === 0) return undefined;
    return this.instances.get(chain.plugins[0])?.audioNode;
  }
  
  getChainOutput(chainId: string): AudioNode | undefined {
    const chain = this.chains.get(chainId);
    if (!chain || chain.plugins.length === 0) return undefined;
    return this.instances.get(chain.plugins[chain.plugins.length - 1])?.audioNode;
  }
  
  // ==================== Offline Processing ====================
  
  async processOffline(
    instanceId: string,
    inputBuffer: AudioBuffer
  ): Promise<AudioBuffer> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);
    
    const exports = instance.wasmInstance.exports as {
      process?: (frames: number) => void;
      getInputBuffer?: () => number;
      getOutputBuffer?: () => number;
      memory: WebAssembly.Memory;
    };
    
    if (!exports.process || !exports.getInputBuffer || !exports.getOutputBuffer) {
      throw new Error('Plugin does not support offline processing');
    }
    
    const outputBuffer = this.audioContext.createBuffer(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    
    const memory = exports.memory;
    const inputPtr = exports.getInputBuffer();
    const outputPtr = exports.getOutputBuffer();
    
    const blockSize = this.BLOCK_SIZE;
    const numBlocks = Math.ceil(inputBuffer.length / blockSize);
    
    for (let block = 0; block < numBlocks; block++) {
      const offset = block * blockSize;
      const frames = Math.min(blockSize, inputBuffer.length - offset);
      
      // Copy input
      for (let ch = 0; ch < inputBuffer.numberOfChannels; ch++) {
        const inputData = inputBuffer.getChannelData(ch).subarray(offset, offset + frames);
        const wasmInput = new Float32Array(memory.buffer, inputPtr + ch * blockSize * 4, blockSize);
        wasmInput.set(inputData);
      }
      
      // Process
      exports.process(frames);
      
      // Copy output
      for (let ch = 0; ch < outputBuffer.numberOfChannels; ch++) {
        const outputData = outputBuffer.getChannelData(ch);
        const wasmOutput = new Float32Array(memory.buffer, outputPtr + ch * blockSize * 4, blockSize);
        outputData.set(wasmOutput.subarray(0, frames), offset);
      }
    }
    
    return outputBuffer;
  }
  
  // ==================== Plugin UI ====================
  
  async openPluginUI(instanceId: string, container: HTMLElement): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    // Abort any prior UI listeners for this instance (re-open replaces previous).
    this.uiCleanups.get(instanceId)?.abort();
    const uiController = new AbortController();
    this.uiCleanups.set(instanceId, uiController);

    if (instance.descriptor.uiUrl) {
      // Determine expected message origin for cross-origin security checks.
      // Relative URLs (e.g. /plugins/ui.html) resolve to the same origin as
      // the host app; absolute URLs specify their own origin. '*' is never used
      // to prevent parameter leakage to or injection from unrelated origins.
      let expectedOrigin: string;
      try {
        expectedOrigin = new URL(instance.descriptor.uiUrl).origin;
      } catch {
        // Relative URL — plugin UI is served from the same origin
        expectedOrigin = window.location.origin;
      }

      // Load custom UI
      const iframe = document.createElement('iframe');
      iframe.src = instance.descriptor.uiUrl;
      iframe.style.cssText = 'width:100%;height:400px;border:none;';

      iframe.onload = () => {
        // Target the exact expected origin so parameters are never sent to an
        // unintended origin if the iframe navigated away.
        iframe.contentWindow?.postMessage({
          type: 'init',
          parameters: Object.fromEntries(instance.parameters)
        }, expectedOrigin);
      };

      // Use signal so this listener is removed when unloadPlugin() or a
      // subsequent openPluginUI() call aborts uiController — preventing leaks
      // that previously accumulated one permanent listener per open call.
      window.addEventListener('message', (e) => {
        // Reject messages from origins other than the plugin's own UI origin.
        if (e.origin !== expectedOrigin) return;
        if (e.data.type === 'parameterChange' && e.data.instanceId === instanceId) {
          this.setParameter(instanceId, e.data.parameterId, e.data.value);
        }
      }, { signal: uiController.signal });

      container.appendChild(iframe);
    } else {
      // Generate generic UI — pass signal so knob listeners are also cleaned up.
      container.appendChild(this.createGenericUI(instance, uiController.signal));
    }
  }
  
  private createGenericUI(instance: PluginInstance, signal?: AbortSignal): HTMLElement {
    const esc = PluginBridge.escapeHtml;
    const container = document.createElement('div');
    container.className = 'plugin-ui';
    container.innerHTML = `
      <style>
        .plugin-ui {
          background: #1e1e1e;
          border-radius: 8px;
          padding: 16px;
          font-family: system-ui, sans-serif;
          color: #fff;
        }
        .plugin-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .plugin-name { font-size: 16px; font-weight: 600; }
        .plugin-vendor { font-size: 12px; color: #888; }
        .plugin-bypass {
          padding: 6px 12px;
          background: #333;
          border: none;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
        }
        .plugin-bypass.active { background: #ff5722; }
        .plugin-params { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
        .plugin-param { text-align: center; }
        .plugin-param-knob {
          width: 60px;
          height: 60px;
          margin: 0 auto 8px;
          position: relative;
        }
        .plugin-param-knob svg { width: 100%; height: 100%; }
        .plugin-param-name { font-size: 11px; color: #888; }
        .plugin-param-value { font-size: 12px; margin-top: 4px; }
        .plugin-presets {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #333;
        }
        .plugin-preset-select {
          width: 100%;
          padding: 8px;
          background: #333;
          border: none;
          border-radius: 4px;
          color: #fff;
        }
      </style>
      
      <div class="plugin-header">
        <div>
          <div class="plugin-name">${esc(instance.descriptor.name)}</div>
          <div class="plugin-vendor">${esc(instance.descriptor.vendor)}</div>
        </div>
        <button class="plugin-bypass ${instance.bypassed ? 'active' : ''}">Bypass</button>
      </div>

      <div class="plugin-params"></div>

      <div class="plugin-presets">
        <select class="plugin-preset-select">
          <option value="-1">-- プリセット --</option>
          ${instance.presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}
        </select>
      </div>
    `;
    
    // Create parameter knobs
    const paramsContainer = container.querySelector('.plugin-params')!;
    for (const param of instance.descriptor.parameters) {
      if (param.flags.hidden) continue;
      
      const paramEl = document.createElement('div');
      paramEl.className = 'plugin-param';
      paramEl.innerHTML = `
        <div class="plugin-param-knob">
          <svg viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" fill="#333" stroke="#555" stroke-width="2"/>
            <path class="knob-arc" d="M30 6 A24 24 0 1 1 29.99 6" fill="none" stroke="#00bcd4" stroke-width="4" stroke-linecap="round"/>
            <line class="knob-pointer" x1="30" y1="30" x2="30" y2="10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="plugin-param-name">${esc(param.shortName || param.name)}</div>
        <div class="plugin-param-value">${esc(this.formatValue(instance.parameters.get(param.id) || param.defaultValue, param))}</div>
      `;
      
      // Knob interaction
      const knob = paramEl.querySelector('.plugin-param-knob')!;
      let isDragging = false;
      let startY = 0;
      let startValue = 0;
      
      knob.addEventListener('mousedown', (e: Event) => {
        const me = e as MouseEvent;
        isDragging = true;
        startY = me.clientY;
        startValue = instance.parameters.get(param.id) || param.defaultValue;
      }, { signal });
      
      // Pass signal so these document-level listeners are cleaned up when the
      // plugin UI is closed (unloadPlugin) or re-opened (openPluginUI).
      // Without signal, each createGenericUI call leaked 2 listeners per param.
      document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;

        const delta = (startY - e.clientY) / 100;
        const range = param.maxValue - param.minValue;
        const newValue = Math.max(param.minValue, Math.min(param.maxValue, startValue + delta * range));

        this.setParameter(instance.id, param.id, newValue);
        this.updateKnob(paramEl, param, newValue);
      }, { signal });

      document.addEventListener('mouseup', () => { isDragging = false; }, { signal });
      
      this.updateKnob(paramEl, param, instance.parameters.get(param.id) || param.defaultValue);
      paramsContainer.appendChild(paramEl);
    }
    
    // Bypass button
    const bypassBtn = container.querySelector('.plugin-bypass')!;
    bypassBtn.addEventListener('click', () => {
      const newState = !instance.bypassed;
      this.setBypass(instance.id, newState);
      bypassBtn.classList.toggle('active', newState);
    }, { signal });
    
    // Preset selector
    const presetSelect = container.querySelector('.plugin-preset-select') as HTMLSelectElement;
    presetSelect.addEventListener('change', () => {
      const idx = parseInt(presetSelect.value);
      if (idx >= 0) {
        this.loadPreset(instance.id, idx);
        // Update all knobs
        for (const param of instance.descriptor.parameters) {
          const paramEl = paramsContainer.querySelector(`[data-param="${param.id}"]`);
          if (paramEl) {
            this.updateKnob(paramEl as HTMLElement, param, instance.parameters.get(param.id) || param.defaultValue);
          }
        }
      }
    }, { signal });
    
    return container;
  }
  
  private updateKnob(paramEl: HTMLElement, param: ParameterDescriptor, value: number): void {
    const normalized = (value - param.minValue) / (param.maxValue - param.minValue);
    const angle = -135 + normalized * 270;
    
    const pointer = paramEl.querySelector('.knob-pointer') as SVGLineElement;
    pointer.setAttribute('transform', `rotate(${angle} 30 30)`);
    
    const valueEl = paramEl.querySelector('.plugin-param-value')!;
    valueEl.textContent = this.formatValue(value, param);
  }
  
  private formatValue(value: number, param: ParameterDescriptor): string {
    let formatted: string;
    if (param.stepCount > 0) {
      formatted = Math.round(value).toString();
    } else if (Math.abs(value) >= 100) {
      formatted = Math.round(value).toString();
    } else {
      formatted = value.toFixed(1);
    }
    return param.unit ? `${formatted} ${param.unit}` : formatted;
  }
  
  // ==================== Utilities ====================
  
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  getInstance(instanceId: string): PluginInstance | undefined {
    return this.instances.get(instanceId);
  }
  
  getChain(chainId: string): PluginChain | undefined {
    return this.chains.get(chainId);
  }
  
  getAllInstances(): PluginInstance[] {
    return [...this.instances.values()];
  }
  
  getAllChains(): PluginChain[] {
    return [...this.chains.values()];
  }
}

// ==================== Built-in WASM Plugins ====================

export const BUILTIN_PLUGINS: PluginDescriptor[] = [
  {
    id: 'builtin:eq3',
    name: '3-Band EQ',
    vendor: 'Artone',
    version: '1.0.0',
    category: 'effect',
    type: 'wasm-native',
    inputs: 2,
    outputs: 2,
    wasmUrl: '/plugins/eq3.wasm',
    parameters: [
      { id: 'lowGain', name: 'Low Gain', shortName: 'Low', unit: 'dB', minValue: -12, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'lowFreq', name: 'Low Frequency', shortName: 'Low Hz', unit: 'Hz', minValue: 20, maxValue: 500, defaultValue: 100, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'midGain', name: 'Mid Gain', shortName: 'Mid', unit: 'dB', minValue: -12, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'midFreq', name: 'Mid Frequency', shortName: 'Mid Hz', unit: 'Hz', minValue: 200, maxValue: 5000, defaultValue: 1000, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'highGain', name: 'High Gain', shortName: 'High', unit: 'dB', minValue: -12, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'highFreq', name: 'High Frequency', shortName: 'High Hz', unit: 'Hz', minValue: 2000, maxValue: 20000, defaultValue: 8000, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } }
    ]
  },
  {
    id: 'builtin:compressor',
    name: 'Compressor',
    vendor: 'Artone',
    version: '1.0.0',
    category: 'effect',
    type: 'wasm-native',
    inputs: 2,
    outputs: 2,
    wasmUrl: '/plugins/compressor.wasm',
    parameters: [
      { id: 'threshold', name: 'Threshold', shortName: 'Thresh', unit: 'dB', minValue: -60, maxValue: 0, defaultValue: -20, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'ratio', name: 'Ratio', shortName: 'Ratio', unit: ':1', minValue: 1, maxValue: 20, defaultValue: 4, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'attack', name: 'Attack', shortName: 'Atk', unit: 'ms', minValue: 0.1, maxValue: 100, defaultValue: 10, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'release', name: 'Release', shortName: 'Rel', unit: 'ms', minValue: 10, maxValue: 1000, defaultValue: 100, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'makeupGain', name: 'Makeup Gain', shortName: 'Makeup', unit: 'dB', minValue: 0, maxValue: 24, defaultValue: 0, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } }
    ]
  },
  {
    id: 'builtin:reverb',
    name: 'Reverb',
    vendor: 'Artone',
    version: '1.0.0',
    category: 'effect',
    type: 'wasm-native',
    inputs: 2,
    outputs: 2,
    wasmUrl: '/plugins/reverb.wasm',
    parameters: [
      { id: 'roomSize', name: 'Room Size', shortName: 'Size', unit: '', minValue: 0, maxValue: 1, defaultValue: 0.5, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'damping', name: 'Damping', shortName: 'Damp', unit: '', minValue: 0, maxValue: 1, defaultValue: 0.5, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'wetLevel', name: 'Wet Level', shortName: 'Wet', unit: '', minValue: 0, maxValue: 1, defaultValue: 0.3, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'dryLevel', name: 'Dry Level', shortName: 'Dry', unit: '', minValue: 0, maxValue: 1, defaultValue: 0.7, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'predelay', name: 'Pre-delay', shortName: 'Pre', unit: 'ms', minValue: 0, maxValue: 100, defaultValue: 20, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } }
    ]
  },
  {
    id: 'builtin:limiter',
    name: 'Limiter',
    vendor: 'Artone',
    version: '1.0.0',
    category: 'effect',
    type: 'wasm-native',
    inputs: 2,
    outputs: 2,
    wasmUrl: '/plugins/limiter.wasm',
    parameters: [
      { id: 'ceiling', name: 'Ceiling', shortName: 'Ceil', unit: 'dB', minValue: -6, maxValue: 0, defaultValue: -0.3, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } },
      { id: 'release', name: 'Release', shortName: 'Rel', unit: 'ms', minValue: 10, maxValue: 500, defaultValue: 50, stepCount: 0, flags: { automatable: true, readonly: false, hidden: false, programChange: false } }
    ]
  }
];

// ==================== AudioWorklet Processor Source ====================

/**
 * Build the source for the `wasm-plugin-processor` AudioWorklet, loaded as a
 * Blob module by {@link PluginBridge}.
 *
 * The `process()` callback runs on the real-time audio render thread (~every
 * 2.9 ms at 44.1 kHz / 128-frame blocks). Per audio/CLAUDE.md and plugins/
 * CLAUDE.md, this path must not allocate — any heap churn risks a GC pause that
 * drops a block and produces an audible glitch (Chrome "Audio Worklet design
 * patterns"; Zenn「ブラウザ上でリアルタイムに音声を処理するためのノウハウ」).
 *
 * Steady-state allocations are therefore eliminated:
 * - The two `Float32Array` views over WASM memory are created once and reused;
 *   they are rebuilt only when `wasmMemory.buffer` is detached (i.e. the WASM
 *   instance grew its memory), which invalidates existing views.
 * - The bypass path zero-fills the output in place instead of allocating a
 *   silent `Float32Array` each call when an input channel is absent.
 * - Output is copied with an index loop rather than `subarray()`, which would
 *   allocate a fresh view per channel per block.
 *
 * Exported (rather than inlined) so the otherwise-untestable worklet source can
 * be evaluated and exercised in unit tests — see tests/plugin-bridge.test.ts.
 *
 * # AI generated (reviewed)
 */
export function buildWasmProcessorCode(): string {
  return `
      class WasmPluginProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          this.wasmMemory = null;
          this.processFunc = null;
          // Exported WASM functions stored individually (wasmInstance is never set)
          this.wasmSetParameter = null;
          this.wasmAllocString = null;
          this.inputPtr = 0;
          this.outputPtr = 0;
          this.blockSize = 128;
          this.bypassed = false;
          // Cached typed-array views over WASM memory (see header). null until the
          // first process() call after init; rebuilt only on buffer detach.
          this.inputView = null;
          this.outputView = null;
          this.viewBuffer = null;

          this.port.onmessage = (e) => {
            const { type, data } = e.data;
            switch (type) {
              case 'init':
                this.initWasm(data.wasmBytes, data.blockSize);
                break;
              case 'setParameter':
                this.setParameter(data.id, data.value);
                break;
              case 'bypass':
                this.bypassed = data.bypassed;
                break;
            }
          };
        }

        async initWasm(wasmBytes, blockSize) {
          this.blockSize = blockSize;
          // Force the views to be rebuilt on the next process() with the new
          // block size / buffer.
          this.viewBuffer = null;

          const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });
          this.wasmMemory = memory;

          const importObject = {
            env: {
              memory,
              log: (ptr, len) => {
                const bytes = new Uint8Array(memory.buffer, ptr, len);
                const str = new TextDecoder().decode(bytes);
                // Plugin stdout — forwarded to plugin sandbox log only
              }
            }
          };

          const module = await WebAssembly.compile(wasmBytes);
          const instance = await WebAssembly.instantiate(module, importObject);

          this.processFunc = instance.exports.process;
          this.wasmSetParameter = instance.exports.setParameter || null;
          this.wasmAllocString = instance.exports.allocString || null;
          this.inputPtr = instance.exports.getInputBuffer();
          this.outputPtr = instance.exports.getOutputBuffer();

          if (instance.exports.init) {
            instance.exports.init(sampleRate, blockSize);
          }

          this.port.postMessage({ type: 'ready' });
        }

        setParameter(id, value) {
          // Use the stored export references; wasmInstance is never set in this processor.
          if (this.wasmSetParameter && this.wasmAllocString) {
            const idBytes = new TextEncoder().encode(id);
            const idPtr = this.wasmAllocString(idBytes.length);
            new Uint8Array(this.wasmMemory.buffer, idPtr, idBytes.length).set(idBytes);
            this.wasmSetParameter(idPtr, idBytes.length, value);
          }
        }

        process(inputs, outputs, parameters) {
          if (this.bypassed || !this.processFunc) {
            // Pass through — copy each available input channel, silence the rest.
            // Zero-fill in place to avoid allocating a silent buffer per block.
            const inCh = inputs[0];
            for (let ch = 0; ch < outputs[0].length; ch++) {
              const src = inCh && inCh[ch];
              if (src) outputs[0][ch].set(src);
              else outputs[0][ch].fill(0);
            }
            return true;
          }

          // Rebuild the WASM-memory views only when the backing buffer changed
          // (first call, or memory growth detached the previous ArrayBuffer).
          if (this.viewBuffer !== this.wasmMemory.buffer) {
            this.viewBuffer = this.wasmMemory.buffer;
            this.inputView = new Float32Array(this.viewBuffer, this.inputPtr, this.blockSize * 2);
            this.outputView = new Float32Array(this.viewBuffer, this.outputPtr, this.blockSize * 2);
          }
          const inputView = this.inputView;
          const outputView = this.outputView;
          const blockSize = this.blockSize;

          // Copy input into the WASM input buffer.
          const inCh = inputs[0];
          for (let ch = 0; ch < Math.min((inCh && inCh.length) || 0, 2); ch++) {
            inputView.set(inCh[ch], ch * blockSize);
          }

          // Process
          this.processFunc(blockSize);

          // Copy output out of the WASM output buffer. An index loop avoids the
          // per-channel view allocation that subarray() would incur each block.
          for (let ch = 0; ch < Math.min(outputs[0].length, 2); ch++) {
            const out = outputs[0][ch];
            const base = ch * blockSize;
            for (let i = 0; i < blockSize; i++) out[i] = outputView[base + i];
          }

          return true;
        }
      }

      registerProcessor('wasm-plugin-processor', WasmPluginProcessor);
    `;
}

// ==================== Export ====================

export type {
  PluginDescriptor,
  PluginCategory,
  PluginType,
  ParameterDescriptor,
  ParameterFlags,
  PluginPreset,
  PluginChain,
  ProcessBuffer
};
