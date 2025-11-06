interface PWAConfig {
  enableServiceWorker: boolean;
  enableOfflineSupport: boolean;
  enableBackgroundSync: boolean;
  enablePushNotifications: boolean;
  cacheStrategy: 'networkFirst' | 'cacheFirst' | 'staleWhileRevalidate';
}

class PWAManager {
  private config: PWAConfig;
  private registration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.config = this.getDefaultConfig();
    this.initializePWA();
  }

  private getDefaultConfig(): PWAConfig {
    return {
      enableServiceWorker: true,
      enableOfflineSupport: true,
      enableBackgroundSync: false,
      enablePushNotifications: false,
      cacheStrategy: 'networkFirst'
    };
  }

  private async initializePWA(): Promise<void> {
    if (!this.isPWAEnabled()) return;

    try {
      await this.registerServiceWorker();
      this.setupAppInstallPrompt();
      this.handleOfflineEvents();
      this.setupBackgroundSync();
    } catch (error) {
      console.error('PWA initialization failed:', error);
    }
  }

  private isPWAEnabled(): boolean {
    return 'serviceWorker' in navigator && 'caches' in window;
  }

  private async registerServiceWorker(): Promise<void> {
    if (!this.config.enableServiceWorker) return;

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('Service Worker registered:', this.registration);

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdatePrompt();
            }
          });
        }
      });

    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }

  private showUpdatePrompt(): void {
    // Show user-friendly update notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Artone Update Available', {
        body: 'A new version is available. Reload to update.',
        icon: '/icon-192x192.png'
      });
    }
  }

  private setupAppInstallPrompt(): void {
    let deferredPrompt: Event | null = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;

      // Show custom install button
      this.showInstallButton(() => {
        if (deferredPrompt) {
          (deferredPrompt as any).prompt();
          (deferredPrompt as any).userChoice.then((choiceResult: any) => {
            if (choiceResult.outcome === 'accepted') {
              console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
          });
        }
      });
    });

    // Hide install button if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.hideInstallButton();
    }
  }

  private showInstallButton(onClick: () => void): void {
    const installButton = document.createElement('button');
    installButton.textContent = 'Install Artone';
    installButton.className = 'install-pwa-button';
    installButton.addEventListener('click', onClick);

    // Add to UI (this would typically be handled by your UI components)
    document.body.appendChild(installButton);
  }

  private hideInstallButton(): void {
    const button = document.querySelector('.install-pwa-button');
    if (button) {
      button.remove();
    }
  }

  private handleOfflineEvents(): void {
    window.addEventListener('online', () => {
      this.handleOnlineStatus(true);
    });

    window.addEventListener('offline', () => {
      this.handleOnlineStatus(false);
    });
  }

  private handleOnlineStatus(isOnline: boolean): void {
    const status = isOnline ? 'online' : 'offline';

    // Update UI
    document.body.classList.toggle('offline', !isOnline);

    // Announce status change
    if (window.accessibilityManager) {
      window.accessibilityManager.announce(
        `Connection status changed to ${status}`,
        'polite'
      );
    }

    // Try to sync pending changes when coming back online
    if (isOnline && this.config.enableBackgroundSync) {
      this.syncPendingChanges();
    }
  }

  private setupBackgroundSync(): void {
    if (!this.config.enableBackgroundSync || !('serviceWorker' in navigator)) return;

    // Register background sync for offline actions
    navigator.serviceWorker.ready.then((registration) => {
      // This would be used for syncing user actions when back online
      console.log('Background sync ready');
    });
  }

  private async syncPendingChanges(): Promise<void> {
    try {
      const pendingActions = this.getPendingActions();
      for (const action of pendingActions) {
        await this.syncAction(action);
      }
      this.clearPendingActions();
    } catch (error) {
      console.error('Failed to sync pending changes:', error);
    }
  }

  private getPendingActions(): any[] {
    try {
      const stored = localStorage.getItem('artone_pending_actions');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  private async syncAction(action: any): Promise<void> {
    // Implement actual sync logic here
    console.log('Syncing action:', action);
  }

  private clearPendingActions(): void {
    try {
      localStorage.removeItem('artone_pending_actions');
    } catch (e) {
      console.warn('Could not clear pending actions');
    }
  }

  public isInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true;
  }

  public isOnline(): boolean {
    return navigator.onLine;
  }

  public async updateApp(): Promise<void> {
    if (this.registration) {
      const newWorker = this.registration.installing;
      if (newWorker) {
        await newWorker.postMessage({ action: 'skipWaiting' });
        window.location.reload();
      }
    }
  }

  public getConfig(): PWAConfig {
    return { ...this.config };
  }
}

// Service Worker implementation
const SERVICE_WORKER_CODE = `
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        const responseClone = fetchResponse.clone();
        caches.open('artone-v1').then((cache) => {
          cache.put(event.request, responseClone);
        });
        return fetchResponse;
      });
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncPendingActions());
  }
});

async function syncPendingActions() {
  // Implement background sync logic
  console.log('Background sync triggered');
}
`;

// Global instance
let pwaManager: PWAManager | null = null;

export function initializePWA(): void {
  if (typeof window === 'undefined') return;

  pwaManager = new PWAManager();
}

export function getPWAManager(): PWAManager | null {
  return pwaManager;
}

// Register service worker
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const swBlob = new Blob([SERVICE_WORKER_CODE], { type: 'application/javascript' });
  const swUrl = URL.createObjectURL(swBlob);

  navigator.serviceWorker.register(swUrl, { scope: '/' }).catch((error) => {
    console.error('Service Worker registration failed:', error);
  });
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializePWA();
}
