/**
 * Artone v3 — Browser Capabilities
 *
 * WebGPU / WebCodecs / WebAudio の可用性を起動時に一度だけ検出。
 * 結果をキャッシュし、各モジュールが fallback を選択できるようにする。
 */

export interface BrowserCapabilities {
  webgpu: boolean;
  webcodecs: boolean;
  webaudio: boolean;
  audioWorklet: boolean;
  offscreenCanvas: boolean;
  indexedDB: boolean;
  serviceWorker: boolean;
  sharedArrayBuffer: boolean;
  wasmThreads: boolean;
  tier: 'full' | 'degraded' | 'minimal';
  warnings: string[];
}

let cached: BrowserCapabilities | null = null;

export async function detectCapabilities(): Promise<BrowserCapabilities> {
  if (cached) return cached;

  const warnings: string[] = [];

  // WebGPU
  let webgpu = false;
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      webgpu = !!adapter;
    }
  } catch { /* ignore */ }
  if (!webgpu) warnings.push('WebGPU 非対応 — Canvas 2D フォールバック');

  // WebCodecs
  const webcodecs = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
  if (!webcodecs) warnings.push('WebCodecs 非対応 — ソフトウェアデコード');

  // WebAudio
  const webaudio = typeof AudioContext !== 'undefined' ||
    typeof (window as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';

  // AudioWorklet
  let audioWorklet = false;
  try { audioWorklet = webaudio && typeof AudioWorkletNode !== 'undefined'; } catch { /* ignore */ }

  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  let indexedDB = false;
  try { indexedDB = typeof window.indexedDB !== 'undefined' && !!window.indexedDB; } catch { /* ignore */ }
  if (!indexedDB) warnings.push('IndexedDB 非対応 — 保存機能制限');

  const serviceWorker = 'serviceWorker' in navigator;
  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const wasmThreads = sharedArrayBuffer && typeof WebAssembly !== 'undefined';

  let tier: BrowserCapabilities['tier'] = 'full';
  if (!webgpu || !webcodecs) tier = 'degraded';
  if (!webcodecs && !offscreenCanvas) tier = 'minimal';

  cached = {
    webgpu, webcodecs, webaudio, audioWorklet,
    offscreenCanvas, indexedDB, serviceWorker,
    sharedArrayBuffer, wasmThreads, tier, warnings,
  };
  return cached;
}

export function getCapabilities(): BrowserCapabilities | null { return cached; }
export function resetCapabilities(): void { cached = null; }
