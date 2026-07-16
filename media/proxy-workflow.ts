/**
 * Artone v3 — Proxy Workflow
 *
 * 高解像度素材の自動プロキシ生成パイプライン
 * 設計: Carmack (計測駆動), Martin (Single Responsibility), Pike (シンプル)
 *
 * 機能:
 * - 4K/8K自動検出 → プロキシ自動生成
 * - 解像度別プリセット (1/2, 1/4, 1/8)
 * - WebCodecs H.264エンコード
 * - IndexedDB永続化
 * - 編集時はプロキシ、書き出し時は元素材
 * - バックグラウンドキュー処理
 *
 * @version 3.0.0
 */
import { createLogger } from '../app/logger';
import { setHighQualityScaling } from '../app/utils';

const log = createLogger('ProxyWorkflow');

// ============================================================
// Types
// ============================================================

export type ProxyResolution = 'full' | 'half' | 'quarter' | 'eighth';

export interface ProxyPreset {
  name: ProxyResolution;
  scale: number;
  bitrate: number;
  codec: 'avc' | 'vp9';
  fps?: number;
}

export interface ProxyJob {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  preset: ProxyPreset;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  outputBlob?: Blob;
  outputUrl?: string;
}

export interface ProxyMapping {
  sourceId: string;
  proxyId: string;
  preset: ProxyResolution;
  createdAt: number;
  sizeBytes: number;
}

export interface ProxyConfig {
  autoGenerateThreshold: number; // 4K以上で自動生成
  defaultPreset: ProxyResolution;
  maxConcurrent: number;
  storageQuotaMB: number;
  useEditing: boolean; // 編集時にプロキシを使用
  useExporting: boolean; // 書き出し時にプロキシを使用 (通常false)
}

// ============================================================
// Presets
// ============================================================

export const PROXY_PRESETS: Record<ProxyResolution, ProxyPreset> = {
  full: { name: 'full', scale: 1.0, bitrate: 50_000_000, codec: 'avc' },
  half: { name: 'half', scale: 0.5, bitrate: 8_000_000, codec: 'avc' },
  quarter: { name: 'quarter', scale: 0.25, bitrate: 3_000_000, codec: 'avc' },
  eighth: { name: 'eighth', scale: 0.125, bitrate: 1_000_000, codec: 'avc' }
};

const DEFAULT_CONFIG: ProxyConfig = {
  autoGenerateThreshold: 3840, // 4K width
  defaultPreset: 'quarter',
  maxConcurrent: 2,
  storageQuotaMB: 10_000,
  useEditing: true,
  useExporting: false
};

// ============================================================
// IndexedDB Storage
// ============================================================

class ProxyStorage {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'artone-proxies';
  private readonly version = 1;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('proxies')) {
          const store = db.createObjectStore('proxies', { keyPath: 'proxyId' });
          store.createIndex('sourceId', 'sourceId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      };
    });
  }

  async save(mapping: ProxyMapping, blob: Blob): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const tx = this.db.transaction(['proxies', 'blobs'], 'readwrite');
    tx.objectStore('proxies').put(mapping);
    tx.objectStore('blobs').put({ id: mapping.proxyId, blob });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(proxyId: string): Promise<{ mapping: ProxyMapping; blob: Blob } | null> {
    if (!this.db) return null;
    const tx = this.db.transaction(['proxies', 'blobs'], 'readonly');
    const mapping = await this.promisify<ProxyMapping>(
      tx.objectStore('proxies').get(proxyId)
    );
    const blobRec = await this.promisify<{ id: string; blob: Blob }>(
      tx.objectStore('blobs').get(proxyId)
    );
    if (!mapping || !blobRec) return null;
    return { mapping, blob: blobRec.blob };
  }

  async findBySourceId(sourceId: string): Promise<ProxyMapping[]> {
    if (!this.db) return [];
    const tx = this.db.transaction('proxies', 'readonly');
    const idx = tx.objectStore('proxies').index('sourceId');
    return this.promisify<ProxyMapping[]>(idx.getAll(sourceId));
  }

  async delete(proxyId: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(['proxies', 'blobs'], 'readwrite');
    tx.objectStore('proxies').delete(proxyId);
    tx.objectStore('blobs').delete(proxyId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }

  async getTotalSize(): Promise<number> {
    if (!this.db) return 0;
    const tx = this.db.transaction('proxies', 'readonly');
    const all = await this.promisify<ProxyMapping[]>(
      tx.objectStore('proxies').getAll()
    );
    return all.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);
  }

  async clear(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(['proxies', 'blobs'], 'readwrite');
    tx.objectStore('proxies').clear();
    tx.objectStore('blobs').clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }

  private promisify<T>(req: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }
}

// ============================================================
// Proxy Encoder (WebCodecs)
// ============================================================

export interface ProxyEncodeOptions {
  sourceUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  preset: ProxyPreset;
  onProgress: (p: number) => void;
  /** Aborting stops the per-frame encode loop as soon as the current frame finishes. */
  signal?: AbortSignal;
}

class ProxyEncoder {
  async encode(opts: ProxyEncodeOptions): Promise<Blob> {
    const { sourceUrl, sourceWidth: sourceW, sourceHeight: sourceH, preset, onProgress, signal } = opts;
    const targetW = Math.round((sourceW * preset.scale) / 2) * 2;
    const targetH = Math.round((sourceH * preset.scale) / 2) * 2;

    if (typeof VideoEncoder === 'undefined') {
      throw new Error('WebCodecs VideoEncoder not supported');
    }

    const chunks: Uint8Array[] = [];
    const config: VideoEncoderConfig = {
      codec: preset.codec === 'avc' ? 'avc1.42E01E' : 'vp09.00.10.08',
      width: targetW,
      height: targetH,
      bitrate: preset.bitrate,
      framerate: preset.fps || 30,
      hardwareAcceleration: 'prefer-hardware'
    };

    const encoder = new VideoEncoder({
      output: (chunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        chunks.push(buf);
      },
      error: (e) => {
        log.error('Encoder error:', e);
      }
    });

    encoder.configure(config);

    // Decode source -> resize -> encode
    const video = document.createElement('video');
    // REGRESSION fix: crossOrigin must be set BEFORE src -- it configures the
    // CORS mode for the load `src` triggers, so setting it afterward has no
    // effect on the in-flight request. A cross-origin source would then taint
    // the canvas drawImage() below draws into, making `new VideoFrame(canvas, …)`
    // throw SecurityError instead of encoding.
    video.crossOrigin = 'anonymous';
    video.src = sourceUrl;
    video.muted = true;
    await new Promise<void>((res, rej) => {
      const METADATA_TIMEOUT_MS = 30_000;
      const timer = setTimeout(() => {
        video.onloadedmetadata = null;
        video.onerror = null;
        rej(new Error(`Proxy encode: metadata load timeout after ${METADATA_TIMEOUT_MS}ms`));
      }, METADATA_TIMEOUT_MS);
      const settle = (fn: () => void) => () => {
        clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onerror = null;
        fn();
      };
      video.onloadedmetadata = settle(res);
      video.onerror = settle(() => rej(new Error('Video load failed')));
    });

    const duration = video.duration;
    const frameInterval = 1 / (preset.fps || 30);
    let currentTime = 0;
    let frameCount = 0;
    const totalFrames = Math.ceil(duration / frameInterval);

    // Offscreen canvas for resize
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    setHighQualityScaling(ctx); // proxies downscale the source — use a good kernel

    try {
      while (currentTime < duration) {
        // Cancellation used to be bookkeeping-only: cancel() dropped the job
        // from `active` immediately, but this loop kept running to completion
        // in the background regardless, still burning CPU/GPU and letting
        // processQueue() start a new job on top of it (exceeding maxConcurrent).
        if (signal?.aborted) break;
        video.currentTime = currentTime;
        await new Promise<void>((res) => {
          video.onseeked = () => res();
        });

        ctx.drawImage(video, 0, 0, targetW, targetH);
        const frame = new VideoFrame(canvas, {
          timestamp: currentTime * 1_000_000,
          duration: frameInterval * 1_000_000
        });

        try {
          encoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
        } finally {
          frame.close();
        }

        frameCount++;
        currentTime += frameInterval;
        onProgress(frameCount / totalFrames);
      }

      await encoder.flush();
    } finally {
      encoder.close();
      // Release the network connection and allow the element to be GC'd immediately.
      video.src = '';
      video.onloadedmetadata = null;
      video.onerror = null;
      video.onseeked = null;
    }

    return new Blob(chunks as BlobPart[], { type: 'video/mp4' });
  }
}

// ============================================================
// Proxy Workflow
// ============================================================

export class ProxyWorkflow {
  private config: ProxyConfig;
  private storage: ProxyStorage;
  private encoder: ProxyEncoder;
  private queue: ProxyJob[] = [];
  private active = new Map<string, ProxyJob>();
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<(job: ProxyJob) => void>();
  private mappingCache = new Map<string, ProxyMapping>();
  /** Cache of proxyId → Blob URL so resolveUrl() never creates duplicate URLs. */
  private blobUrlCache = new Map<string, string>();
  private initialized = false;

  constructor(config: Partial<ProxyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = new ProxyStorage();
    this.encoder = new ProxyEncoder();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.storage.init();
    this.initialized = true;
  }

  // --- Auto Detection ---

  shouldGenerate(width: number, height: number): boolean {
    return Math.max(width, height) >= this.config.autoGenerateThreshold;
  }

  recommendedPreset(width: number, height: number): ProxyResolution {
    const max = Math.max(width, height);
    if (max >= 7680) return 'eighth'; // 8K → 1/8
    if (max >= 3840) return 'quarter'; // 4K → 1/4
    if (max >= 1920) return 'half'; // FHD → 1/2
    return 'full';
  }

  // --- Job Management ---

  async enqueue(
    sourceId: string,
    sourceUrl: string,
    sourceWidth: number,
    sourceHeight: number,
    presetName?: ProxyResolution
  ): Promise<string> {
    await this.init();

    const existing = await this.storage.findBySourceId(sourceId);
    if (existing.length > 0) {
      const mapping = existing[0];
      this.mappingCache.set(sourceId, mapping);
      return mapping.proxyId;
    }

    const preset = PROXY_PRESETS[
      presetName || this.recommendedPreset(sourceWidth, sourceHeight)
    ];

    const job: ProxyJob = {
      id: `proxy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sourceId,
      sourceUrl,
      sourceWidth,
      sourceHeight,
      preset,
      status: 'queued',
      progress: 0
    };

    this.queue.push(job);
    this.notifyListeners(job);
    this.processQueue();
    return job.id;
  }

  private async processQueue(): Promise<void> {
    while (this.active.size < this.config.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      this.active.set(job.id, job);
      this.runJob(job).catch((e) => log.error('Job failed:', e));
    }
  }

  private async runJob(job: ProxyJob): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    try {
      job.status = 'processing';
      job.startedAt = Date.now();
      this.notifyListeners(job);

      const blob = await this.encoder.encode({
        sourceUrl: job.sourceUrl,
        sourceWidth: job.sourceWidth,
        sourceHeight: job.sourceHeight,
        preset: job.preset,
        onProgress: (p) => {
          job.progress = p;
          this.notifyListeners(job);
        },
        signal: controller.signal,
      });

      const mapping: ProxyMapping = {
        sourceId: job.sourceId,
        proxyId: job.id,
        preset: job.preset.name,
        createdAt: Date.now(),
        sizeBytes: blob.size
      };

      await this.storage.save(mapping, blob);
      this.mappingCache.set(job.sourceId, mapping);

      // REGRESSION: cancel() removes the job from active while encode runs.
      // If it fired during the awaits above, bail out without overwriting status.
      if (!this.active.has(job.id)) return;
      job.status = 'completed';
      job.completedAt = Date.now();
      job.progress = 1;
      job.outputBlob = blob;
      // REGRESSION fix: this used to call URL.createObjectURL(blob) directly
      // and store the result only on job.outputUrl -- never registered in
      // blobUrlCache, so clearAll()/deleteProxy() (which only revoke entries
      // in that cache) never revoked it. Every completed job leaked one
      // object URL for the app's lifetime. mapping.proxyId === job.id (see
      // above), so reuse the same cache resolveUrl() already reads from —
      // this also means a later resolveUrl() call for the same proxy returns
      // this exact URL instead of minting a second one for the same blob.
      job.outputUrl = this.blobUrlCache.get(job.id) ?? URL.createObjectURL(blob);
      this.blobUrlCache.set(job.id, job.outputUrl);
      this.notifyListeners(job);
    } catch (e) {
      if (!this.active.has(job.id)) return;
      job.status = 'failed';
      job.error = e instanceof Error ? e.message : String(e);
      this.notifyListeners(job);
    } finally {
      this.active.delete(job.id);
      this.controllers.delete(job.id);
      this.processQueue();
    }
  }

  cancel(jobId: string): boolean {
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx >= 0) {
      const job = this.queue[idx];
      job.status = 'cancelled';
      this.queue.splice(idx, 1);
      this.notifyListeners(job);
      return true;
    }
    const active = this.active.get(jobId);
    if (active) {
      active.status = 'cancelled';
      this.active.delete(jobId);
      // Actually stop the in-flight encode loop, not just the bookkeeping —
      // otherwise it kept consuming CPU/GPU in the background until it ran
      // to completion on its own, and a new job could start on top of it,
      // exceeding maxConcurrent.
      this.controllers.get(jobId)?.abort();
      this.controllers.delete(jobId);
      this.notifyListeners(active);
      return true;
    }
    return false;
  }

  // --- URL Resolution ---

  async resolveUrl(sourceId: string, sourceUrl: string, isExport = false): Promise<string> {
    if (isExport && !this.config.useExporting) return sourceUrl;
    if (!isExport && !this.config.useEditing) return sourceUrl;

    const cached = this.mappingCache.get(sourceId);
    if (cached) {
      // Return cached Blob URL if already created — resolveUrl is called once
      // per clip per render tick, so without this cache each call would create
      // a new unrevoced Blob URL (O(fps × clips) permanent leak).
      const existing = this.blobUrlCache.get(cached.proxyId);
      if (existing) return existing;
      const rec = await this.storage.get(cached.proxyId);
      if (rec) {
        const url = URL.createObjectURL(rec.blob);
        this.blobUrlCache.set(cached.proxyId, url);
        return url;
      }
    }

    const mappings = await this.storage.findBySourceId(sourceId);
    if (mappings.length === 0) return sourceUrl;

    const mapping = mappings[0];
    this.mappingCache.set(sourceId, mapping);
    const existing = this.blobUrlCache.get(mapping.proxyId);
    if (existing) return existing;
    const rec = await this.storage.get(mapping.proxyId);
    if (!rec) return sourceUrl;
    const url = URL.createObjectURL(rec.blob);
    this.blobUrlCache.set(mapping.proxyId, url);
    return url;
  }

  // --- Storage Management ---

  async getStorageInfo(): Promise<{ usedMB: number; quotaMB: number; percent: number }> {
    const used = await this.storage.getTotalSize();
    const usedMB = used / 1_048_576;
    const quota = this.config.storageQuotaMB;
    return {
      usedMB,
      quotaMB: quota,
      percent: quota > 0 ? (usedMB / quota) * 100 : 0,
    };
  }

  async clearAll(): Promise<void> {
    await this.storage.clear();
    this.mappingCache.clear();
    // Revoke all cached Blob URLs to release memory.
    for (const url of this.blobUrlCache.values()) URL.revokeObjectURL(url);
    this.blobUrlCache.clear();
  }

  async deleteProxy(proxyId: string): Promise<void> {
    await this.storage.delete(proxyId);
    // Revoke the Blob URL for this proxy so the browser can release the memory.
    const url = this.blobUrlCache.get(proxyId);
    if (url) {
      URL.revokeObjectURL(url);
      this.blobUrlCache.delete(proxyId);
    }
    for (const [k, v] of this.mappingCache.entries()) {
      if (v.proxyId === proxyId) {
        this.mappingCache.delete(k);
        break;
      }
    }
  }

  // --- Events ---

  onJobUpdate(listener: (job: ProxyJob) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(job: ProxyJob): void {
    for (const l of this.listeners) {
      try {
        l(job);
      } catch (e) {
        log.error('Listener error:', e);
      }
    }
  }

  // --- Status ---

  getQueue(): ProxyJob[] {
    return [...this.queue];
  }

  getActive(): ProxyJob[] {
    return Array.from(this.active.values());
  }
}
