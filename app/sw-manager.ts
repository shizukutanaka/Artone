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

    const { signal } = this.abortCtrl;

    // REGRESSION fix: this listener used to be registered with no `signal`,
    // so destroy()'s abortCtrl.abort() couldn't remove it. Every
    // register()/setupListeners() call on the underlying registration (a
    // fresh ServiceWorkerManager instance, or a re-register after destroy())
    // added another 'updatefound' listener that lived on for the
    // registration's full lifetime -- unbounded accumulation across manager
    // re-creation.
    this.registration.addEventListener('updatefound', () => {
      const worker = this.registration!.installing;
      if (!worker) return;
      // Use { once: true } so the statechange listener auto-removes after first fire,
      // preventing a listener leak when updatefound fires multiple times (e.g., rapid
      // redeploys in dev mode accumulate unlimited statechange listeners otherwise).
      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          this.updateAvailable = true;
          this.notify('updated');
        }
      }, { once: true });
    }, { signal });

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
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const settle = (value: T | null): void => {
        if (settled) return;
        settled = true;
        // Cancel the timeout so the closure is released immediately instead of
        // being kept alive by the event loop for the remaining 5-second window.
        if (timeoutId !== null) clearTimeout(timeoutId);
        // Close port1 to release the message channel; the transfer of port2 to
        // the SW means it gets closed on the other side when the SW drops it.
        ch.port1.close();
        resolve(value);
      };
      ch.port1.onmessage = (e) => settle(e.data as T);
      navigator.serviceWorker.controller?.postMessage(msg, [ch.port2]);
      // Timeout: resolve null and close port so the channel isn't leaked when
      // the SW never responds (e.g. SW not running, wrong message type).
      timeoutId = setTimeout(() => settle(null), 5000);
    });
  }
}
