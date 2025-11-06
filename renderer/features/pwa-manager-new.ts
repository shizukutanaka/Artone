interface PWAConfig {
  enableServiceWorker: boolean;
  enableWebAppManifest: boolean;
  enableInstallPrompt: boolean;
  enableOfflineSupport: boolean;
  enableBackgroundSync: boolean;
  enablePushNotifications: boolean;
  enableGeolocation: boolean;
  enableCamera: boolean;
  enableMicrophone: boolean;
  enableNotifications: boolean;
  enableShareAPI: boolean;
  enableFileAPI: boolean;
  enableWebShare: boolean;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface BeforeInstallPromptEvent extends Event {
  platforms: string[];
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

class PWAManager {
  private config: PWAConfig;
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private isInstalled: boolean = false;
  private isOnline: boolean = navigator.onLine;

  private readonly defaultConfig: PWAConfig = {
    enableServiceWorker: true,
    enableWebAppManifest: true,
    enableInstallPrompt: true,
    enableOfflineSupport: true,
    enableBackgroundSync: true,
    enablePushNotifications: false,
    enableGeolocation: false,
    enableCamera: false,
    enableMicrophone: false,
    enableNotifications: true,
    enableShareAPI: true,
    enableFileAPI: true,
    enableWebShare: true
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializePWA();
  }

  private initializePWA(): void {
    this.setupWebAppManifest();
    this.setupServiceWorker();
    this.setupInstallPrompt();
    this.setupOfflineSupport();
    this.setupBackgroundSync();
    this.setupFeatureDetection();
    this.setupEventListeners();
  }

  private setupWebAppManifest(): void {
    if (!this.config.enableWebAppManifest) return;

    const manifest = {
      name: 'Artone Video Editor',
      short_name: 'Artone',
      description: 'Professional video editing application',
      start_url: '/',
      display: 'standalone',
      background_color: '#1e293b',
      theme_color: '#3b82f6',
      orientation: 'portrait-primary',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-72x72.png',
          sizes: '72x72',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-96x96.png',
          sizes: '96x96',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-128x128.png',
          sizes: '128x128',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-144x144.png',
          sizes: '144x144',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-152x152.png',
          sizes: '152x152',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-384x384.png',
          sizes: '384x384',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ],
      categories: ['productivity', 'utilities', 'photo', 'video'],
      lang: 'ja',
      dir: 'ltr',
      prefer_related_applications: false
    };

    const manifestElement = document.createElement('link');
    manifestElement.rel = 'manifest';
    manifestElement.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));
    document.head.appendChild(manifestElement);
  }

  private setupServiceWorker(): void {
    if (!this.config.enableServiceWorker || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('Service Worker registered:', registration);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.showUpdateNotification();
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }

  private setupInstallPrompt(): void {
    if (!this.config.enableInstallPrompt) return;

    window.addEventListener('beforeinstallprompt', (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      this.installPrompt = event;

      this.showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.hideInstallButton();
      console.log('PWA was installed');
    });
  }

  private showInstallButton(): void {
    const installButton = document.createElement('button');
    installButton.id = 'pwa-install-button';
    installButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      Install App
    `;
    installButton.className = 'fixed top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-indigo-700 transition-colors z-50 flex items-center';

    installButton.addEventListener('click', () => {
      this.promptInstall();
    });

    document.body.appendChild(installButton);
  }

  private hideInstallButton(): void {
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) {
      installButton.remove();
    }
  }

  private async promptInstall(): Promise<void> {
    if (!this.installPrompt) return;

    try {
      await this.installPrompt.prompt();
      const choice = await this.installPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
    }
  }

  private showUpdateNotification(): void {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 left-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    notification.innerHTML = `
      <div class="flex justify-between items-center">
        <span>App update available</span>
        <button id="update-app" class="bg-blue-700 px-3 py-1 rounded text-sm">Update</button>
      </div>
    `;

    document.body.appendChild(notification);

    const updateButton = document.getElementById('update-app');
    updateButton?.addEventListener('click', () => {
      window.location.reload();
    });

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 10000);
  }

  private setupOfflineSupport(): void {
    if (!this.config.enableOfflineSupport) return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onOnline();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onOffline();
    });

    // Show offline indicator
    this.createOfflineIndicator();
  }

  private createOfflineIndicator(): void {
    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.className = 'fixed top-0 left-0 right-0 bg-yellow-500 text-black px-4 py-1 text-center text-sm z-50';
    indicator.textContent = 'You are currently offline';
    indicator.style.display = this.isOnline ? 'none' : 'block';

    document.body.appendChild(indicator);
  }

  private onOnline(): void {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }

    console.log('Back online');

    // Sync offline data
    this.syncOfflineData();
  }

  private onOffline(): void {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'block';
    }

    console.log('Gone offline');
  }

  private async syncOfflineData(): Promise<void> {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('background-sync');
    }
  }

  private setupBackgroundSync(): void {
    if (!this.config.enableBackgroundSync) return;

    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'background-sync') {
          console.log('Background sync completed:', event.data);
        }
      });
    }
  }

  private setupFeatureDetection(): void {
    const features = {
      geolocation: this.config.enableGeolocation && 'geolocation' in navigator,
      camera: this.config.enableCamera && 'mediaDevices' in navigator,
      microphone: this.config.enableMicrophone && 'mediaDevices' in navigator,
      notifications: this.config.enableNotifications && 'Notification' in window,
      shareAPI: this.config.enableShareAPI && 'share' in navigator,
      fileAPI: this.config.enableFileAPI && 'File' in window && 'FileReader' in window,
      webShare: this.config.enableWebShare && 'share' in navigator
    };

    console.log('PWA Features available:', features);

    // Set up features that are available
    if (features.notifications) {
      this.setupNotifications();
    }

    if (features.shareAPI) {
      this.setupShareAPI();
    }
  }

  private setupNotifications(): void {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }

  private setupShareAPI(): void {
    // Share functionality is handled by the UI components
    console.log('Share API available');
  }

  private setupEventListeners(): void {
    // Handle PWA events
    window.addEventListener('beforeinstallprompt', (event) => {
      console.log('Install prompt available');
    });

    window.addEventListener('appinstalled', (event) => {
      console.log('App installed');
    });

    // Handle visibility change for background sync
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.onAppVisible();
      } else {
        this.onAppHidden();
      }
    });
  }

  private onAppVisible(): void {
    console.log('App is now visible');
    // Resume any paused operations
  }

  private onAppHidden(): void {
    console.log('App is now hidden');
    // Pause non-essential operations
  }

  public async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';

    if (Notification.permission === 'default') {
      return await Notification.requestPermission();
    }

    return Notification.permission;
  }

  public async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      ...options
    });

    notification.addEventListener('click', () => {
      window.focus();
      notification.close();
    });
  }

  public async share(data: ShareData): Promise<void> {
    if ('share' in navigator) {
      try {
        await navigator.share(data);
      } catch (error) {
        console.error('Share failed:', error);
        // Fallback to clipboard
        if (data.url) {
          await navigator.clipboard.writeText(data.url);
          console.log('URL copied to clipboard');
        }
      }
    } else {
      // Fallback implementation
      console.log('Share API not available, using fallback');
    }
  }

  public async getLocation(): Promise<GeolocationPosition | null> {
    if (!('geolocation' in navigator)) return null;

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      });
    });
  }

  public async requestCamera(): Promise<MediaStream | null> {
    if (!('mediaDevices' in navigator)) return null;

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    } catch (error) {
      console.error('Camera access denied:', error);
      return null;
    }
  }

  public async requestMicrophone(): Promise<MediaStream | null> {
    if (!('mediaDevices' in navigator)) return null;

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      });
    } catch (error) {
      console.error('Microphone access denied:', error);
      return null;
    }
  }

  public isAppInstalled(): boolean {
    return this.isInstalled || window.matchMedia('(display-mode: standalone)').matches;
  }

  public isOnline(): boolean {
    return this.isOnline;
  }

  public getConfig(): PWAConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<PWAConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      isInstalled: this.isAppInstalled(),
      isOnline: this.isOnline(),
      features: {
        serviceWorker: 'serviceWorker' in navigator,
        notifications: 'Notification' in window,
        shareAPI: 'share' in navigator,
        geolocation: 'geolocation' in navigator,
        mediaDevices: 'mediaDevices' in navigator,
        indexedDB: 'indexedDB' in window,
        localStorage: 'localStorage' in window,
        webAppManifest: true
      },
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public destroy(): void {
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) {
      installButton.remove();
    }

    const offlineIndicator = document.getElementById('offline-indicator');
    if (offlineIndicator) {
      offlineIndicator.remove();
    }
  }
}

// Global instance
let pwaManager: PWAManager | null = null;

export function initializePWAManager(): void {
  if (typeof window === 'undefined') return;

  pwaManager = new PWAManager();
}

export function getPWAManager(): PWAManager | null {
  return pwaManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializePWAManager();
}
