/**
 * Artone v3 — Service Worker Registration Helper
 *
 * クライアント側のSW登録・通信ヘルパー
 *
 * @version 3.0.0
 */
import { createLogger } from './logger';

const log = createLogger('SWManager');

export interface CacheInfo {
  count: number;
  sizeBytes: number;
}

export type CacheStatus = Record<string, CacheInfo>;

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;
  private listeners = new Set<(state: 'updated' | 'offline' | 'online') => void>();
  private readonly abortCtrl = new AbortController();

  async register(swUrl = '/sw.js'): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false;

    try {
      this.registration = await navigator.serviceWorker.register(swUrl);
      this.setupListeners();
      return true;
    } catch (e) {
      log.error('SW registration failed:', e);
      return false;
    }
  }

  private setupListeners(): void {
    if (!this.registration) return;

    this.registration.addEventListener('updatefound', () => {
      const worker = this.registration!.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          this.updateAvailable = true;
          this.notify('updated');
        }
      });
    });

    const { signal } = this.abortCtrl;

    navigator.serviceWorker.addEventListener('message', (e) => {
      // ハンドラ拡張ポイント
      if (e.data?.type === 'SYNC_TRIGGERED') {
        // アプリ側でリスナー登録可
      }
    }, { signal });

    window.addEventListener('online', () => this.notify('online'), { signal });
    window.addEventListener('offline', () => this.notify('offline'), { signal });
  }

  async applyUpdate(): Promise<void> {
    if (!this.registration?.waiting) return;
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    await new Promise<void>((res) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => res(), { once: true });
    });
    location.reload();
  }

  async getCacheStatus(): Promise<CacheStatus | null> {
    if (!navigator.serviceWorker.controller) return null;
    return this.sendMessage<CacheStatus>({ type: 'CACHE_STATUS' });
  }

  async clearCache(cacheName?: string): Promise<boolean> {
    if (!navigator.serviceWorker.controller) return false;
    const r = await this.sendMessage<{ success: boolean }>({
      type: 'CLEAR_CACHE',
      payload: { cacheName }
    });
    return r?.success ?? false;
  }

  async prefetch(urls: string[]): Promise<number> {
    if (!navigator.serviceWorker.controller) return 0;
    const r = await this.sendMessage<{ prefetched: number }>({
      type: 'PREFETCH',
      payload: { urls }
    });
    return r?.prefetched ?? 0;
  }

  async requestBackgroundSync(tag: string): Promise<boolean> {
    if (!this.registration) return false;
    const sync = (this.registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    if (!sync) return false;
    try {
      await sync.register(tag);
      return true;
    } catch {
      return false;
    }
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  hasUpdate(): boolean {
    return this.updateAvailable;
  }

  onStateChange(listener: (state: 'updated' | 'offline' | 'online') => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(state: 'updated' | 'offline' | 'online'): void {
    for (const l of this.listeners) {
      try {
        l(state);
      } catch (e) {
        log.error('Listener error:', e);
      }
    }
  }

  /** Remove all global event listeners (online/offline/SW message). */
  destroy(): void {
    this.abortCtrl.abort();
    this.listeners.clear();
  }

  private sendMessage<T>(msg: unknown): Promise<T | null> {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data as T);
      navigator.serviceWorker.controller?.postMessage(msg, [ch.port2]);
      setTimeout(() => resolve(null), 5000);
    });
  }
}
