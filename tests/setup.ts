/**
 * Vitest Test Setup
 *
 * ブラウザ API モック:
 * - ResizeObserver / IntersectionObserver / matchMedia
 * - requestAnimationFrame
 * - IndexedDB (fake-indexeddb)
 * - OffscreenCanvas
 * - AudioContext
 * - performance.memory
 * - navigator.gpu (stub)
 */

import { vi } from 'vitest';

// === Observer mocks ===
vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn()
})));

vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn()
})));

vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
  matches: false, media: query, onchange: null,
  addListener: vi.fn(), removeListener: vi.fn(),
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
})));

// === Animation ===
vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => setTimeout(cb, 16)));
vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => clearTimeout(id)));

// === IndexedDB (in-memory fake supporting keyPath stores + indexes) ===
//
// HistoryManager / ProjectManager / RecoveryManager の使用パターンを満たす:
// - createObjectStore(name, { keyPath }) + createIndex
// - put(value[, key]) は keyPath があれば value[keyPath] をキーに採用
// - get(key) / getAll([query]) / delete(key)
// - index(name).getAll([query]) は indexed プロパティで絞り込み
// - onupgradeneeded / onsuccess は { target: req } を引数に発火

interface FakeIndex {
  keyPath: string;
  unique: boolean;
}

class FakeObjectStore {
  readonly records = new Map<unknown, unknown>();
  readonly indexes = new Map<string, FakeIndex>();
  private autoKey = 1;

  constructor(public readonly name: string, public readonly keyPath: string | null) {}

  createIndex(indexName: string, keyPath: string, options?: { unique?: boolean }): void {
    this.indexes.set(indexName, { keyPath, unique: options?.unique ?? false });
  }

  private resolveKey(value: unknown, explicitKey?: unknown): unknown {
    if (explicitKey !== undefined) return explicitKey;
    if (this.keyPath && value && typeof value === 'object') {
      const k = (value as Record<string, unknown>)[this.keyPath];
      if (k !== undefined) return k;
    }
    return this.autoKey++;
  }

  put(value: unknown, key?: unknown) {
    this.records.set(this.resolveKey(value, key), value);
    return makeRequest(undefined);
  }

  get(key: unknown) {
    return makeRequest(this.records.get(key));
  }

  delete(key: unknown) {
    this.records.delete(key);
    return makeRequest(undefined);
  }

  clear() {
    this.records.clear();
    return makeRequest(undefined);
  }

  getAll(query?: unknown) {
    const all = Array.from(this.records.values());
    return makeRequest(query === undefined ? all : all);
  }

  index(indexName: string) {
    const idx = this.indexes.get(indexName);
    return {
      getAll: (query?: unknown) => {
        const all = Array.from(this.records.values());
        if (query === undefined || !idx) return makeRequest(all);
        const filtered = all.filter(
          (v) => v && typeof v === 'object' && (v as Record<string, unknown>)[idx.keyPath] === query
        );
        return makeRequest(filtered);
      },
    };
  }
}

class FakeDB {
  readonly stores = new Map<string, FakeObjectStore>();
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, options?: { keyPath?: string }): FakeObjectStore {
    const store = new FakeObjectStore(name, options?.keyPath ?? null);
    this.stores.set(name, store);
    return store;
  }

  transaction(_names: string | string[], _mode?: string) {
    const tx = {
      objectStore: (name: string) => {
        let store = this.stores.get(name);
        if (!store) store = this.createObjectStore(name);
        return store;
      },
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  }

  close(): void {}
}

interface FakeRequest<T> {
  result: T;
  error: unknown;
  onsuccess: ((event: { target: FakeRequest<T> }) => void) | null;
  onerror: ((event: { target: FakeRequest<T> }) => void) | null;
}

function makeRequest<T>(result: T): FakeRequest<T> {
  const req: FakeRequest<T> = { result, error: null, onsuccess: null, onerror: null };
  setTimeout(() => req.onsuccess?.({ target: req }), 0);
  return req;
}

// 名前付き DB を永続化 (open ごとに同じ DB インスタンスを返す)
const fakeDatabases = new Map<string, FakeDB>();

const fakeIDB = {
  open: vi.fn((name: string) => {
    const isNew = !fakeDatabases.has(name);
    const db = fakeDatabases.get(name) ?? new FakeDB();
    fakeDatabases.set(name, db);

    const req = {
      result: db,
      error: null as unknown,
      onsuccess: null as ((event: { target: { result: FakeDB } }) => void) | null,
      onerror: null as ((event: { target: { result: FakeDB } }) => void) | null,
      onupgradeneeded: null as ((event: { target: { result: FakeDB } }) => void) | null,
    };
    setTimeout(() => {
      if (isNew) req.onupgradeneeded?.({ target: req });
      req.onsuccess?.({ target: req });
    }, 0);
    return req;
  }),
  deleteDatabase: vi.fn((name: string) => {
    fakeDatabases.delete(name);
    return makeRequest(undefined);
  }),
};
if (typeof globalThis.indexedDB === 'undefined') {
  vi.stubGlobal('indexedDB', fakeIDB);
}

// === ImageData (jsdom が提供しない環境向けの最小スタブ) ===
if (typeof globalThis.ImageData === 'undefined') {
  class FakeImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = 'srgb' as const;
    constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
      if (a instanceof Uint8ClampedArray) {
        this.data = a;
        this.width = b;
        this.height = c ?? a.length / 4 / b;
      } else {
        this.width = a;
        this.height = b;
        this.data = new Uint8ClampedArray(a * b * 4);
      }
    }
  }
  vi.stubGlobal('ImageData', FakeImageData);
}

// === ImageBitmap / createImageBitmap ===
// scopes 等が canvas.transferToImageBitmap() / createImageBitmap() の戻り値を
// truthy な ImageBitmap として扱うためのスタブ。
function makeImageBitmap(width = 1, height = 1): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}
if (typeof globalThis.createImageBitmap === 'undefined') {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => makeImageBitmap()));
}

// === OffscreenCanvas ===
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  vi.stubGlobal('OffscreenCanvas', vi.fn((w: number, h: number) => {
    const ctx2d = {
      fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
      beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
      setLineDash: vi.fn(),
      translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), save: vi.fn(), restore: vi.fn(),
      transform: vi.fn(), setTransform: vi.fn(), resetTransform: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 8 })),
      putImageData: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, iw: number, ih: number) => ({
        data: new Uint8ClampedArray((iw || w) * (ih || h) * 4), width: iw || w, height: ih || h,
      })),
      createImageData: vi.fn((iw: number, ih: number) => ({ data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih })),
      canvas: { width: w, height: h },
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
      globalAlpha: 1, globalCompositeOperation: '', filter: '',
    };
    return {
      width: w, height: h,
      getContext: vi.fn(() => ctx2d),
      transferToImageBitmap: vi.fn(() => makeImageBitmap(w, h)),
    };
  }));
}

// === VideoFrame (instanceof チェックと close() 用の最小スタブ) ===
if (typeof globalThis.VideoFrame === 'undefined') {
  class FakeVideoFrame {
    displayWidth = 1;
    displayHeight = 1;
    close = vi.fn();
  }
  vi.stubGlobal('VideoFrame', FakeVideoFrame);
}

// === AudioContext ===
// AudioEngine / SurroundAudioEngine が使う AudioNode ファクトリを網羅。
// 返却ノードは connect/disconnect と必要な AudioParam (gain/pan/frequency 等) を持つ。
function makeAudioParam(value = 0) {
  return {
    value,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}
function makeAudioNode(extra: Record<string, unknown> = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
}
function makeAudioContextLike(sampleRate = 48000) {
  return {
    createGain: vi.fn(() => makeAudioNode({ gain: makeAudioParam(1) })),
    createStereoPanner: vi.fn(() => makeAudioNode({ pan: makeAudioParam(0) })),
    createAnalyser: vi.fn(() => makeAudioNode({
      fftSize: 2048,
      frequencyBinCount: 1024,
      getFloatTimeDomainData: vi.fn(),
      getFloatFrequencyData: vi.fn(),
      getByteFrequencyData: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => makeAudioNode({ type: 'lowpass', frequency: makeAudioParam(350), gain: makeAudioParam(0), Q: makeAudioParam(1) })),
    createDynamicsCompressor: vi.fn(() => makeAudioNode({
      threshold: makeAudioParam(-24), knee: makeAudioParam(30), ratio: makeAudioParam(12),
      attack: makeAudioParam(0.003), release: makeAudioParam(0.25),
    })),
    createConvolver: vi.fn(() => makeAudioNode({ buffer: null })),
    createDelay: vi.fn(() => makeAudioNode({ delayTime: makeAudioParam(0) })),
    createWaveShaper: vi.fn(() => makeAudioNode({ curve: null, oversample: 'none' })),
    createOscillator: vi.fn(() => makeAudioNode({ frequency: makeAudioParam(440), type: 'sine', start: vi.fn(), stop: vi.fn() })),
    createBufferSource: vi.fn(() => makeAudioNode({ buffer: null, start: vi.fn(), stop: vi.fn() })),
    createMediaStreamSource: vi.fn(() => makeAudioNode()),
    createBuffer: vi.fn((channels: number, length: number, rate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      duration: length / rate,
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    destination: makeAudioNode(),
    currentTime: 0,
    sampleRate,
    state: 'running',
    close: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
  };
}
if (typeof globalThis.AudioContext === 'undefined') {
  vi.stubGlobal('AudioContext', vi.fn((opts?: { sampleRate?: number }) => makeAudioContextLike(opts?.sampleRate)));
}

// === OfflineAudioContext (createBufferSource/createBiquadFilter + startRendering) ===
if (typeof globalThis.OfflineAudioContext === 'undefined') {
  vi.stubGlobal('OfflineAudioContext', vi.fn((channels: number, length: number, rate: number) => {
    const base = makeAudioContextLike(rate);
    return {
      ...base,
      length,
      startRendering: vi.fn(async () => ({
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: vi.fn(() => new Float32Array(length)),
      })),
    };
  }));
}

// === navigator.gpu (WebGPU stub — always unavailable) ===
if (!navigator.gpu) {
  Object.defineProperty(navigator, 'gpu', {
    value: undefined,
    configurable: true,
  });
}

// === WebGPU usage-flag constants ===
// These bitflag enums are referenced by webgpu-engine code paths even when a
// mock GPUDevice is injected directly. jsdom does not define them.
if (typeof globalThis.GPUTextureUsage === 'undefined') {
  vi.stubGlobal('GPUTextureUsage', {
    COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10,
  });
}
if (typeof globalThis.GPUBufferUsage === 'undefined') {
  vi.stubGlobal('GPUBufferUsage', {
    MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008,
    INDEX: 0x0010, VERTEX: 0x0020, UNIFORM: 0x0040, STORAGE: 0x0080,
    INDIRECT: 0x0100, QUERY_RESOLVE: 0x0200,
  });
}

// === performance.memory ===
if (!(performance as unknown as Record<string, unknown>).memory) {
  Object.defineProperty(performance, 'memory', {
    value: { usedJSHeapSize: 50_000_000, totalJSHeapSize: 100_000_000, jsHeapSizeLimit: 2_000_000_000 },
    configurable: true,
  });
}

// === URL.createObjectURL / revokeObjectURL ===
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
}

