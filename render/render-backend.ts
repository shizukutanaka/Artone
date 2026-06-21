/**
 * Artone v3 — Render Backend Facade
 *
 * WebGPU を優先し、非対応環境では WebGL 2.0 に自動フォールバックする統一窓口。
 * フレームキャッシュ (3層) も統合し、呼び出し側はバックエンドを意識しない。
 *
 * 設計 (Strategy + Facade):
 * - initialize() が WebGPU 初期化を試み、失敗したら WebGLFallbackRenderer に切替
 * - renderLayers() は選択中のバックエンドに委譲
 * - getFrame()/cacheFrame() は FrameCache 経由で即時スクラビング
 *
 * これにより webgpu-engine / webgl-fallback / frame-cache が実パイプラインに配線される。
 */

import { createLogger } from '../app/logger';
import { WebGPURenderEngine, type RenderLayer } from './webgpu-engine';
import { WebGLFallbackRenderer } from './webgl-fallback';
import { FrameCache, type FrameCacheConfig } from './frame-cache';
import { RenderBundleCache, type BatchSignature } from './render-bundle-cache';

const log = createLogger('RenderBackend');

export type ActiveBackend = 'webgpu' | 'webgl2' | 'none';

export interface RenderBackendStats {
  backend: ActiveBackend;
  fps: number;
  frameTime: number;
  cache: ReturnType<FrameCache['getStats']>;
}

export class RenderBackend {
  private webgpu: WebGPURenderEngine | null = null;
  private webgl: WebGLFallbackRenderer | null = null;
  private cache: FrameCache;
  private bundleCache = new RenderBundleCache();
  private active: ActiveBackend = 'none';
  // When the active engine's GPU context is lost, `active` drops to 'none' so
  // renderLayers() pauses; on recovery it is restored. The backend type chosen
  // at initialize() is remembered here so recovery can restore it.
  private resolvedBackend: ActiveBackend = 'none';
  private gpuLost = false;
  private readonly contextListeners = new Set<(lost: boolean) => void>();

  constructor(cacheConfig?: Partial<FrameCacheConfig>) {
    this.cache = new FrameCache(cacheConfig);
  }

  /**
   * Subscribe to GPU context lost/recovered transitions of the active backend.
   * The UI can use this to show a "GPU recovering…" banner. Returns unsubscribe.
   */
  onContextChange(listener: (lost: boolean) => void): () => void {
    this.contextListeners.add(listener);
    return () => this.contextListeners.delete(listener);
  }

  /** Whether the active GPU backend is currently in a lost state. */
  isContextLost(): boolean {
    return this.gpuLost;
  }

  private notifyContext(lost: boolean): void {
    for (const l of this.contextListeners) {
      try { l(lost); } catch (e) { log.error('context listener threw', e); }
    }
  }

  /**
   * Wire an engine's context-loss callback to backend state: drop `active` to
   * 'none' while lost (renderLayers no-ops), restore it on recovery, and forward
   * the transition to backend-level subscribers.
   */
  private bindContextLoss(
    engine: { onContextChange(cb: (lost: boolean) => void): () => void },
  ): void {
    engine.onContextChange((lost) => {
      this.gpuLost = lost;
      this.active = lost ? 'none' : this.resolvedBackend;
      if (lost) log.warn('Render backend: GPU context lost — rendering paused');
      else log.info('Render backend: GPU context recovered');
      this.notifyContext(lost);
    });
  }

  /**
   * レイヤー群から Render Bundle のバッチシグネチャを生成。
   * 同一シグネチャの連続フレームは bundle 再利用で draw-call 削減。
   */
  private computeBatchSignature(layers: RenderLayer[]): BatchSignature {
    const pipelineKey = layers
      .map((l) => `${l.blend}:${l.effects.filter((e) => e.enabled).map((e) => e.type).join(',')}`)
      .join('|');
    return {
      pipelineKey,
      layerCount: layers.length,
      bufferLayoutKey: 'quad', // 全レイヤーはフルスクリーンクワッド
    };
  }

  /**
   * バックエンドを初期化。WebGPU → WebGL2 の順に試す。
   * いずれも失敗したら active = 'none' (caller は capability tier で UI 制限)。
   */
  async initialize(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<ActiveBackend> {
    // Idempotent: tear down any backend from a previous initialize() before
    // creating a new one. Re-init is expected (WebGPU context loss → recover),
    // and overwriting this.webgpu/this.webgl without destroying the old engine
    // would orphan its GPU device/textures (destroy 漏れ — render/CLAUDE.md).
    if (this.webgpu || this.webgl) {
      this.webgpu?.destroy();
      this.webgl?.destroy();
      this.webgpu = null;
      this.webgl = null;
      this.active = 'none';
    }
    // Reset loss state for the fresh backend (initialize is also the recovery
    // entry point, so a prior lost flag must not leak into the new engine).
    this.gpuLost = false;

    // 1. WebGPU を試す
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      const engine = new WebGPURenderEngine();
      const ok = await engine.initialize(canvas);
      if (ok) {
        this.webgpu = engine;
        this.active = 'webgpu';
        this.resolvedBackend = 'webgpu';
        this.bindContextLoss(engine);
        log.info('Render backend: WebGPU (hardware accelerated)');
        return 'webgpu';
      }
      log.warn('WebGPU initialization failed, falling back to WebGL 2.0');
    }

    // 2. WebGL 2.0 フォールバック
    const fallback = new WebGLFallbackRenderer();
    if (fallback.initialize(canvas)) {
      this.webgl = fallback;
      this.active = 'webgl2';
      this.resolvedBackend = 'webgl2';
      this.bindContextLoss(fallback);
      log.info('Render backend: WebGL 2.0 (fallback)');
      return 'webgl2';
    }

    // 3. どちらも不可
    this.active = 'none';
    this.resolvedBackend = 'none';
    log.error('No rendering backend available (no WebGPU, no WebGL 2.0)');
    return 'none';
  }

  getActiveBackend(): ActiveBackend {
    return this.active;
  }

  /** キャッシュからフレーム取得。即時スクラビングの要。 */
  getCachedFrame(frameIndex: number): VideoFrame | ImageBitmap | null {
    return this.cache.get(frameIndex);
  }

  /** デコード済みフレームをキャッシュに格納。 */
  cacheFrame(frameIndex: number, frame: VideoFrame | ImageBitmap, byteSize: number): void {
    this.cache.put(frameIndex, frame, byteSize);
  }

  /** スクラビング先読みヒント (再生ヘッド周辺の未キャッシュフレーム)。 */
  getPrefetchTargets(centerFrame: number, radius = 30): number[] {
    return this.cache.prefetchHint(centerFrame, radius);
  }

  /** レイヤー合成。アクティブバックエンドに委譲。 */
  async renderLayers(layers: RenderLayer[]): Promise<void> {
    // Render Bundle 再記録判定 (WebGPU 時の draw-call 削減)
    if (this.active === 'webgpu' && this.webgpu) {
      const sig = this.computeBatchSignature(layers);
      const rerecord = this.bundleCache.needsRerecord(sig);
      // rerecord=true なら bundle 再構築、false なら executeBundles で再利用
      // (webgpu-engine が将来 setBundleMode(rerecord) を実装)
      await this.webgpu.renderFrame(layers);
      void rerecord;
    } else if (this.active === 'webgl2' && this.webgl) {
      this.webgl.renderFrame(layers);
    }
    // active === 'none' は no-op (UI 側で degraded 表示)
  }

  /** エフェクト/レイヤー構成変更時に bundle を無効化 */
  invalidateBundles(): void {
    this.bundleCache.invalidate();
  }

  /** Render Bundle の再利用統計 (draw-call 削減効果の可視化) */
  getBundleStats() {
    return this.bundleCache.getStats();
  }

  getStats(): RenderBackendStats {
    let fps = 0, frameTime = 0;
    if (this.active === 'webgpu' && this.webgpu) {
      const s = this.webgpu.getStats();
      fps = s.fps; frameTime = s.frameTime;
    } else if (this.active === 'webgl2' && this.webgl) {
      const s = this.webgl.getStats();
      fps = s.fps; frameTime = s.frameTime;
    }
    return { backend: this.active, fps, frameTime, cache: this.cache.getStats() };
  }

  clearCache(): void {
    this.cache.clear();
    this.webgpu?.clearCache();
    this.webgl?.clearCache();
  }

  destroy(): void {
    this.cache.clear();
    this.webgpu?.destroy();
    this.webgl?.destroy();
    this.webgpu = null;
    this.webgl = null;
    this.active = 'none';
    this.resolvedBackend = 'none';
    this.gpuLost = false;
    this.contextListeners.clear();
  }
}
