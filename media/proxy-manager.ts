/**
 * Artone v3 — Proxy Workflow
 * 
 * プロキシワークフロー
 * - 自動プロキシ生成
 * - オリジナル/プロキシ切替
 * - バックグラウンド処理
 * - リリンク
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface ProxySettings {
  resolution: ProxyResolution;
  codec: 'h264' | 'vp9' | 'prores_proxy';
  quality: 'low' | 'medium' | 'high';
  autoGenerate: boolean;
  autoThreshold: number;  // Min resolution to auto-generate (e.g., 1920)
}

export type ProxyResolution = '1/2' | '1/4' | '1/8' | '480p' | '720p' | '540p';

export interface ProxyFile {
  id: string;
  originalId: string;
  originalPath: string;
  proxyPath: string;
  status: 'pending' | 'generating' | 'ready' | 'error' | 'outdated';
  progress: number;
  resolution: ProxyResolution;
  size: number;
  created: number;
  hash: string;
}

export interface ProxyJob {
  id: string;
  mediaId: string;
  settings: ProxySettings;
  status: 'queued' | 'processing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  error?: string;
  startTime: number;
  endTime?: number;
  /** 元素材の幅 (px)。サイズ推定用。取得不能時は未設定。 */
  sourceWidth?: number;
  /** 元素材の高さ (px)。サイズ推定用。取得不能時は未設定。 */
  sourceHeight?: number;
  /** 元素材の尺 (秒)。サイズ推定用。取得不能時は未設定。 */
  durationSec?: number;
}

// ============================================================
// Default Settings
// ============================================================

const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  resolution: '1/4',
  codec: 'h264',
  quality: 'medium',
  autoGenerate: true,
  autoThreshold: 1920
};

const RESOLUTION_SCALES: Record<ProxyResolution, number> = {
  '1/2': 0.5,
  '1/4': 0.25,
  '1/8': 0.125,
  '480p': 480,
  '720p': 720,
  '540p': 540
};

// ============================================================
// Proxy Size Estimation
// ============================================================
//
// プロキシは「軽量プレビュー用」の低ビットレート再エンコード。実際の WebCodecs
// エンコードはハードウェア依存だが、生成サイズはビットレートモデルで決定論的に
// 推定できる。固定 10MB のダミー値を排し、解像度・品質・コーデック・尺に比例した
// 現実的なサイズを返す (storage 計画・UI 表示の正確性向上)。

/** プロキシのフレームレート前提。プロキシは 30fps に正規化する。 */
export const PROXY_FPS = 30;

/** 品質別 bits-per-pixel-per-frame (inter-frame プロキシコーデック想定)。 */
const QUALITY_BPP: Record<ProxySettings['quality'], number> = {
  low: 0.04,
  medium: 0.07,
  high: 0.12,
};

/**
 * H.264 (=1.0) を基準にしたコーデック別ビットレート倍率。
 * VP9 は約30%小さく、ProRes Proxy は intra-frame のため大幅に大きい。
 */
const CODEC_MULTIPLIER: Record<ProxySettings['codec'], number> = {
  h264: 1.0,
  vp9: 0.7,
  prores_proxy: 4.0,
};

/** 元素材メタデータが取得できない場合のフォールバック (1080p / 60秒)。 */
const DEFAULT_SOURCE = { width: 1920, height: 1080, durationSec: 60 } as const;

/**
 * プロキシファイルサイズをビットレートモデルで推定する (バイト)。
 *
 * `bitrate = width × height × fps × bpp × codecMultiplier`、
 * `size = bitrate × duration / 8`。
 * いずれかの入力が 0 以下なら 0 を返す (無効入力)。
 *
 * @param width        プロキシ解像度の幅 (px)
 * @param height       プロキシ解像度の高さ (px)
 * @param durationSec  尺 (秒)
 * @param quality      品質ティア
 * @param codec        コーデック
 * @returns 推定サイズ (バイト、整数)
 */
export function estimateProxySize(
  width: number,
  height: number,
  durationSec: number,
  quality: ProxySettings['quality'],
  codec: ProxySettings['codec'],
): number {
  if (width <= 0 || height <= 0 || durationSec <= 0) return 0;
  const bpp = QUALITY_BPP[quality];
  const mult = CODEC_MULTIPLIER[codec];
  const bitsPerSecond = width * height * PROXY_FPS * bpp * mult;
  return Math.round((bitsPerSecond * durationSec) / 8);
}

/**
 * 元素材の幅/高さ/尺を安全に抽出する。HTMLVideoElement なら intrinsic 値を、
 * 取得不能 (Blob・undefined・metadata 未ロード) なら DEFAULT_SOURCE を返す。
 */
function extractSourceMeta(
  source: HTMLVideoElement | Blob | undefined
): { width: number; height: number; durationSec: number } {
  const v = source as Partial<HTMLVideoElement> | undefined;
  const width = typeof v?.videoWidth === 'number' && v.videoWidth > 0 ? v.videoWidth : DEFAULT_SOURCE.width;
  const height = typeof v?.videoHeight === 'number' && v.videoHeight > 0 ? v.videoHeight : DEFAULT_SOURCE.height;
  const durationSec =
    typeof v?.duration === 'number' && Number.isFinite(v.duration) && v.duration > 0
      ? v.duration
      : DEFAULT_SOURCE.durationSec;
  return { width, height, durationSec };
}

/**
 * プロキシ識別ハッシュ (FNV-1a 32bit) を決定論的に算出する。
 * 同一素材+設定なら同一ハッシュとなり、`outdated` 検出が機能する。
 * これは暗号学的コンテンツハッシュではなく ID 用 (元コードの乱数 UUID を置換)。
 */
function proxyIdentityHash(mediaId: string, settings: ProxySettings): string {
  const key = `${mediaId}|${settings.resolution}|${settings.codec}|${settings.quality}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ============================================================
// Proxy Manager
// ============================================================

export class ProxyManager {
  private proxies: Map<string, ProxyFile> = new Map();
  private jobs: Map<string, ProxyJob> = new Map();
  private settings: ProxySettings;
  private useProxy = true;
  private queue: string[] = [];
  private isProcessing = false;
  private listeners: Set<() => void> = new Set();

  constructor(settings?: Partial<ProxySettings>) {
    this.settings = { ...DEFAULT_PROXY_SETTINGS, ...settings };
  }

  // ============================================================
  // Settings
  // ============================================================

  getSettings(): ProxySettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<ProxySettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.notify();
  }

  setUseProxy(use: boolean): void {
    this.useProxy = use;
    this.notify();
  }

  isUsingProxy(): boolean {
    return this.useProxy;
  }

  // ============================================================
  // Proxy Generation
  // ============================================================

  async generateProxy(
    mediaId: string,
    sourceVideo: HTMLVideoElement | Blob,
    _onProgress?: (progress: number) => void
  ): Promise<ProxyFile | null> {
    // Return ready proxy immediately
    const existing = this.getProxyForMedia(mediaId);
    if (existing?.status === 'ready') {
      return existing;
    }

    // Prevent duplicate jobs for the same media
    const activeJob = Array.from(this.jobs.values()).find(
      j => j.mediaId === mediaId && (j.status === 'queued' || j.status === 'processing')
    );
    if (activeJob) return null;

    // Capture source metadata up-front so size estimation reflects the real
    // resolution/duration (falls back to 1080p/60s when unavailable).
    const meta = extractSourceMeta(sourceVideo);

    // Create job
    const job: ProxyJob = {
      id: crypto.randomUUID(),
      mediaId,
      settings: { ...this.settings },
      status: 'queued',
      progress: 0,
      startTime: Date.now(),
      sourceWidth: meta.width,
      sourceHeight: meta.height,
      durationSec: meta.durationSec
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.notify();

    // Process queue
    await this.processQueue();

    return this.getProxyForMedia(mediaId);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.jobs.get(jobId);
      if (!job) continue;

      job.status = 'processing';
      this.notify();

      try {
        await this.processJob(job);
        // cancelJob() may have set status='cancelled' while processJob was
        // running; do not overwrite it. The cast widens the control-flow
        // narrowing from the `job.status = 'processing'` assignment above, which
        // TS otherwise keeps across the await (it cannot see cancelJob's write).
        if ((job.status as ProxyJob['status']) !== 'cancelled') {
          job.status = 'complete';
          job.progress = 1;
          job.endTime = Date.now();
        }
      } catch (error) {
        if ((job.status as ProxyJob['status']) !== 'cancelled') {
          job.status = 'error';
          job.error = error instanceof Error ? error.message : String(error);
        }
      }

      this.notify();
    }

    this.isProcessing = false;
  }

  private async processJob(job: ProxyJob): Promise<void> {
    // Create proxy file entry
    const proxy: ProxyFile = {
      id: crypto.randomUUID(),
      originalId: job.mediaId,
      originalPath: '',
      proxyPath: '',
      status: 'generating',
      progress: 0,
      resolution: job.settings.resolution,
      size: 0,
      created: Date.now(),
      hash: ''
    };

    this.proxies.set(proxy.id, proxy);

    // Progress reporting. Actual WebCodecs encode is hardware-dependent; the
    // resulting file size is derived deterministically from a bitrate model.
    // Check job.status each iteration so cancelJob() short-circuits this loop
    // instead of running the full 2-second simulated encode after the user
    // already asked to cancel (Qiita: AbortController / setTimeout クリーンアップ).
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      if ((job.status as ProxyJob['status']) === 'cancelled') {
        // Drop the half-built proxy: a cancelled job must not leave a 'ready'-
        // looking proxy in the registry that getProxyForMedia would return.
        this.proxies.delete(proxy.id);
        return;
      }
      await new Promise(r => setTimeout(r, 20));
      proxy.progress = i / steps;
      job.progress = proxy.progress;
      this.notify();
    }

    // Compute the realistic proxy size from the (down-scaled) proxy resolution,
    // quality, codec, and duration — replacing the previous fixed 10MB dummy.
    const dims = this.calculateProxyDimensions(
      job.sourceWidth ?? DEFAULT_SOURCE.width,
      job.sourceHeight ?? DEFAULT_SOURCE.height,
      job.settings.resolution,
    );

    proxy.status = 'ready';
    proxy.size = estimateProxySize(
      dims.width,
      dims.height,
      job.durationSec ?? DEFAULT_SOURCE.durationSec,
      job.settings.quality,
      job.settings.codec,
    );
    // Deterministic identity hash so the same source+settings yield the same
    // proxy identity (enables 'outdated' detection; was a random UUID before).
    proxy.hash = proxyIdentityHash(job.mediaId, job.settings);
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      job.status = 'cancelled';
      this.queue = this.queue.filter(id => id !== jobId);
      this.notify();
    }
  }

  // ============================================================
  // Proxy Management
  // ============================================================

  getProxyForMedia(mediaId: string): ProxyFile | null {
    for (const proxy of this.proxies.values()) {
      if (proxy.originalId === mediaId) {
        return proxy;
      }
    }
    return null;
  }

  getProxy(proxyId: string): ProxyFile | undefined {
    return this.proxies.get(proxyId);
  }

  getAllProxies(): ProxyFile[] {
    return Array.from(this.proxies.values());
  }

  deleteProxy(proxyId: string): void {
    this.proxies.delete(proxyId);
    this.notify();
  }

  clearAllProxies(): void {
    this.proxies.clear();
    this.notify();
  }

  // ============================================================
  // Relinking
  // ============================================================

  relinkProxy(proxyId: string, newOriginalPath: string): void {
    const proxy = this.proxies.get(proxyId);
    if (proxy) {
      proxy.originalPath = newOriginalPath;
      this.notify();
    }
  }

  markOutdated(proxyId: string): void {
    const proxy = this.proxies.get(proxyId);
    if (proxy) {
      proxy.status = 'outdated';
      this.notify();
    }
  }

  async regenerateProxy(proxyId: string): Promise<void> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;

    proxy.status = 'pending';
    this.notify();

    // Would re-generate from original
    await this.generateProxy(proxy.originalId, undefined!);
  }

  // ============================================================
  // Resolution Calculation
  // ============================================================

  calculateProxyDimensions(
    originalWidth: number,
    originalHeight: number,
    resolution: ProxyResolution
  ): { width: number; height: number } {
    if (originalHeight <= 0) return { width: 0, height: 0 };
    const scale = RESOLUTION_SCALES[resolution];

    if (scale < 1) {
      // Fractional scale (1/2, 1/4, 1/8)
      return {
        width: Math.round(originalWidth * scale),
        height: Math.round(originalHeight * scale)
      };
    } else {
      // Fixed height (480p, 720p, 540p)
      const targetHeight = scale;
      const aspectRatio = originalWidth / originalHeight;
      return {
        width: Math.round(targetHeight * aspectRatio),
        height: targetHeight
      };
    }
  }

  shouldAutoGenerate(width: number): boolean {
    return this.settings.autoGenerate && width >= this.settings.autoThreshold;
  }

  // ============================================================
  // Storage Stats
  // ============================================================

  getStorageStats(): {
    totalProxies: number;
    totalSize: number;
    readyCount: number;
    pendingCount: number;
  } {
    const proxies = Array.from(this.proxies.values());
    
    return {
      totalProxies: proxies.length,
      totalSize: proxies.reduce((sum, p) => sum + p.size, 0),
      readyCount: proxies.filter(p => p.status === 'ready').length,
      pendingCount: proxies.filter(p => p.status === 'pending' || p.status === 'generating').length
    };
  }

  // ============================================================
  // Job Management
  // ============================================================

  getJob(jobId: string): ProxyJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): ProxyJob[] {
    return Array.from(this.jobs.values());
  }

  getActiveJobs(): ProxyJob[] {
    return Array.from(this.jobs.values()).filter(
      j => j.status === 'queued' || j.status === 'processing'
    );
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export default ProxyManager;
