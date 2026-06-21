/**
 * Artone v3 — 3-Tier Frame Cache
 *
 * 即時スクラビングを実現する3層キャッシュ。
 *
 * 設計根拠:
 * - byteiota / MASterSelects: 300 GPUテクスチャ(VRAM) + per-video フレーム + 900フレーム RAM プレビュー
 * - LongLive (arXiv 2509.22622): frame-sink + 短窓 rolling eviction で peak memory -17%
 * - CacheFlow (arXiv 2511.13644): 自然動画は時間冗長性が大 → 隣接フレーム優先保持
 *
 * 3層構造:
 *   Tier 1 (GPU/hot):  直近・再生ヘッド周辺のデコード済みフレーム (LRU, 上限あり)
 *   Tier 2 (RAM/warm): プレビュー用ダウンスケールフレーム (広範囲, rolling window)
 *   Tier 3 (sink):     先頭フレーム等の「絶対保持」フレーム (eviction 対象外)
 */

import { createLogger } from '../app/logger';

const log = createLogger('FrameCache');

export interface CachedFrame {
  frameIndex: number;
  data: VideoFrame | ImageBitmap;
  byteSize: number;
  lastAccess: number;
}

export interface FrameCacheConfig {
  /** Tier 1: GPU hot cache の最大フレーム数 */
  maxHotFrames: number;
  /** Tier 2: RAM warm cache の最大フレーム数 */
  maxWarmFrames: number;
  /** Tier 3: sink (常に保持) するフレームインデックス */
  sinkFrames: number[];
  /** メモリ上限 (バイト) — 超過時 Tier 2 から evict */
  maxBytes: number;
}

const DEFAULT_CONFIG: FrameCacheConfig = {
  maxHotFrames: 300,    // byteiota: 300 GPU textures
  maxWarmFrames: 900,   // byteiota: 900-frame RAM preview
  sinkFrames: [0],      // LongLive: 先頭フレームを sink に
  maxBytes: 512 * 1024 * 1024, // 512MB
};

export class FrameCache {
  private hot = new Map<number, CachedFrame>();   // Tier 1
  private warm = new Map<number, CachedFrame>();  // Tier 2
  private sink = new Map<number, CachedFrame>();   // Tier 3
  private config: FrameCacheConfig;
  private currentBytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<FrameCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** フレームを取得。hit 時は lastAccess を更新。 */
  get(frameIndex: number): VideoFrame | ImageBitmap | null {
    const now = performance.now();
    const sinkHit = this.sink.get(frameIndex);
    if (sinkHit) { sinkHit.lastAccess = now; this.hits++; return sinkHit.data; }

    const hotHit = this.hot.get(frameIndex);
    if (hotHit) { hotHit.lastAccess = now; this.hits++; return hotHit.data; }

    const warmHit = this.warm.get(frameIndex);
    if (warmHit) {
      // warm → hot に昇格 (再生ヘッドが近づいた)
      warmHit.lastAccess = now;
      this.promoteToHot(frameIndex, warmHit);
      this.hits++;
      return warmHit.data;
    }

    this.misses++;
    return null;
  }

  /** フレームを Tier 1 (hot) に追加。 */
  put(frameIndex: number, data: VideoFrame | ImageBitmap, byteSize: number): void {
    // Re-putting an existing index must release the stale frame first; otherwise
    // the old VideoFrame leaks GPU memory and currentBytes double-counts.
    this.removeExisting(frameIndex);

    if (this.config.sinkFrames.includes(frameIndex)) {
      this.sink.set(frameIndex, { frameIndex, data, byteSize, lastAccess: performance.now() });
      return;
    }
    const frame: CachedFrame = { frameIndex, data, byteSize, lastAccess: performance.now() };
    this.hot.set(frameIndex, frame);
    this.currentBytes += byteSize;
    this.evictIfNeeded();
  }

  /** 指定インデックスの既存フレームを全 Tier から除去し解放する。 */
  private removeExisting(frameIndex: number): void {
    const hot = this.hot.get(frameIndex);
    if (hot) { this.releaseFrame(hot); this.hot.delete(frameIndex); }
    const warm = this.warm.get(frameIndex);
    if (warm) { this.releaseFrame(warm); this.warm.delete(frameIndex); }
    const sink = this.sink.get(frameIndex);
    // sink frames are not counted in currentBytes — close data without adjusting bytes.
    if (sink) { this.closeData(sink); this.sink.delete(frameIndex); }
  }

  private promoteToHot(frameIndex: number, frame: CachedFrame): void {
    this.warm.delete(frameIndex);
    this.hot.set(frameIndex, frame);
    this.evictIfNeeded();
  }

  /**
   * LRU + rolling eviction:
   * hot が溢れたら最古を warm に降格。warm も溢れたら破棄。
   * sink は対象外 (LongLive frame-sink パターン)。
   */
  private evictIfNeeded(): void {
    // Tier 1 → Tier 2 降格
    while (this.hot.size > this.config.maxHotFrames) {
      const oldest = this.findOldest(this.hot);
      if (oldest === null) break;
      const frame = this.hot.get(oldest)!;
      this.hot.delete(oldest);
      this.warm.set(oldest, frame);
    }

    // Tier 2 溢れ → 破棄 (VideoFrame は close でメモリ解放必須)
    while (this.warm.size > this.config.maxWarmFrames) {
      const oldest = this.findOldest(this.warm);
      if (oldest === null) break;
      this.releaseFrame(this.warm.get(oldest)!);
      this.warm.delete(oldest);
    }

    // メモリ上限超過 → warm から evict。warm が尽きたら hot を warm に降格して
    // さらに evict し、byte cap を実効化する (sink は対象外)。
    while (this.currentBytes > this.config.maxBytes && (this.warm.size > 0 || this.hot.size > 0)) {
      if (this.warm.size === 0) {
        // hot の最古を warm へ降格 (Tier 1 → Tier 2)
        const oldestHot = this.findOldest(this.hot);
        if (oldestHot === null) break;
        const frame = this.hot.get(oldestHot)!;
        this.hot.delete(oldestHot);
        this.warm.set(oldestHot, frame);
      }
      const oldest = this.findOldest(this.warm);
      if (oldest === null) break;
      this.releaseFrame(this.warm.get(oldest)!);
      this.warm.delete(oldest);
    }
  }

  private findOldest(map: Map<number, CachedFrame>): number | null {
    let oldestIdx: number | null = null;
    let oldestTime = Infinity;
    for (const [idx, frame] of map) {
      if (frame.lastAccess < oldestTime) {
        oldestTime = frame.lastAccess;
        oldestIdx = idx;
      }
    }
    return oldestIdx;
  }

  /** VideoFrame.close() でGPUメモリを明示解放 (WebCodecs ハンドブック準拠) */
  private releaseFrame(frame: CachedFrame): void {
    this.currentBytes -= frame.byteSize;
    this.closeData(frame);
  }

  /** フレームデータの GPU/メモリハンドルを close する (byte 会計は変更しない)。 */
  private closeData(frame: CachedFrame): void {
    if (frame.data instanceof VideoFrame) {
      frame.data.close();
    } else if ('close' in frame.data && typeof frame.data.close === 'function') {
      (frame.data as ImageBitmap).close();
    }
  }

  /** スクラビング先読み: 再生ヘッド周辺のフレームを優先保持するヒント */
  prefetchHint(centerFrame: number, radius = 30): number[] {
    const needed: number[] = [];
    for (let i = centerFrame - radius; i <= centerFrame + radius; i++) {
      if (i >= 0 && !this.hot.has(i) && !this.warm.has(i) && !this.sink.has(i)) {
        needed.push(i);
      }
    }
    return needed;
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      hot: this.hot.size,
      warm: this.warm.size,
      sink: this.sink.size,
      bytes: this.currentBytes,
      hitRate: total > 0 ? this.hits / total : 0,
      hits: this.hits,
      misses: this.misses,
    };
  }

  clear(): void {
    for (const frame of this.hot.values()) this.releaseFrame(frame);
    for (const frame of this.warm.values()) this.releaseFrame(frame);
    // sink も解放 (clear は全消去)
    for (const frame of this.sink.values()) this.releaseFrame(frame);
    this.hot.clear();
    this.warm.clear();
    this.sink.clear();
    this.currentBytes = 0;
    log.info('Frame cache cleared');
  }
}
