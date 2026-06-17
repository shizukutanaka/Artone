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
    _sourceVideo: HTMLVideoElement | Blob,
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

    // Create job
    const job: ProxyJob = {
      id: crypto.randomUUID(),
      mediaId,
      settings: { ...this.settings },
      status: 'queued',
      progress: 0,
      startTime: Date.now()
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

    // Simulate encoding (in production, use WebCodecs)
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      await new Promise(r => setTimeout(r, 20));
      proxy.progress = i / steps;
      job.progress = proxy.progress;
      this.notify();
    }

    proxy.status = 'ready';
    proxy.size = 1024 * 1024 * 10; // Simulated 10MB
    proxy.hash = crypto.randomUUID();
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
