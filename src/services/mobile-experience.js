/**
 * Mobile Experience Enhancement for Artone Video Editor
 * Provides responsive design, touch interfaces, and offline capabilities
 */

export class MobileExperienceManager {
  constructor() {
    this.isMobile = false;
    this.isOffline = !navigator.onLine;
    this.touchDevice = 'ontouchstart' in window;
    this.deviceInfo = this.detectDevice();
    this.offlineQueue = [];
    this.syncInProgress = false;

    this.initialize();
  }

  async initialize() {
    this.setupMobileDetection();
    this.setupOfflineSupport();
    this.setupTouchOptimizations();
    this.setupResponsiveLayout();

    console.log('Mobile Experience Manager initialized');
  }

  detectDevice() {
    const userAgent = navigator.userAgent;
    const deviceInfo = {
      isIOS: /iPad|iPhone|iPod/.test(userAgent),
      isAndroid: /Android/.test(userAgent),
      isTablet: /iPad|Android(?!.*Mobile)/.test(userAgent),
      isPhone: /iPhone|Android.*Mobile/.test(userAgent),
      isDesktop: !/iPad|iPhone|iPod|Android/.test(userAgent),
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
    };

    this.isMobile = deviceInfo.isIOS || deviceInfo.isAndroid;
    return deviceInfo;
  }

  setupMobileDetection() {
    // Listen for orientation changes
    window.addEventListener('orientationchange', () => {
      this.deviceInfo.orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      this.handleOrientationChange();
    });

    // Listen for resize events
    window.addEventListener('resize', () => {
      this.deviceInfo.screenWidth = window.innerWidth;
      this.deviceInfo.screenHeight = window.innerHeight;
      this.handleResize();
    });

    // Listen for online/offline status
    window.addEventListener('online', () => {
      this.isOffline = false;
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOffline = true;
    });
  }

  setupOfflineSupport() {
    if ('serviceWorker' in navigator) {
      this.registerServiceWorker();
    }

    if ('caches' in window) {
      this.setupCacheStrategies();
    }

    // Initialize offline storage
    this.setupOfflineStorage();
  }

  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered successfully');

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.showUpdateNotification();
          }
        });
      });
    } catch (error) {
      console.warn('Service Worker registration failed:', error);
    }
  }

  setupCacheStrategies() {
    // Cache strategies for different types of resources
    this.cacheStrategies = {
      'templates': 'cache-first',
      'fonts': 'cache-first',
      'images': 'cache-first',
      'videos': 'network-first',
      'audio': 'cache-first',
      'scripts': 'stale-while-revalidate',
      'styles': 'cache-first'
    };
  }

  setupOfflineStorage() {
    // Use IndexedDB for offline project storage
    this.offlineDB = null;
    this.initOfflineDB();
  }

  async initOfflineDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ArtoneOfflineDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.offlineDB = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          const projectsStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectsStore.createIndex('lastModified', 'lastModified', { unique: false });
          projectsStore.createIndex('status', 'status', { unique: false });
        }

        // Assets store
        if (!db.objectStoreNames.contains('assets')) {
          const assetsStore = db.createObjectStore('assets', { keyPath: 'id' });
          assetsStore.createIndex('projectId', 'projectId', { unique: false });
          assetsStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  setupTouchOptimizations() {
    if (!this.touchDevice) return;

    // Increase touch target sizes
    this.enhanceTouchTargets();

    // Add touch gestures
    this.setupTouchGestures();

    // Optimize scrolling
    this.optimizeScrolling();
  }

  enhanceTouchTargets() {
    // Minimum touch target size: 44px x 44px
    const style = document.createElement('style');
    style.textContent = `
      .touch-target {
        min-width: 44px;
        min-height: 44px;
        padding: 8px;
      }

      .mobile-button {
        min-height: 48px;
        padding: 12px 16px;
        font-size: 16px;
      }

      .mobile-timeline {
        height: 120px;
      }

      .mobile-toolbar {
        padding: 16px;
        background: rgba(0, 0, 0, 0.8);
      }
    `;
    document.head.appendChild(style);
  }

  setupTouchGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTap = 0;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });

    document.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Detect swipes
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > 50) {
          if (deltaX > 0) {
            this.handleSwipeRight();
          } else {
            this.handleSwipeLeft();
          }
        }
      } else {
        if (Math.abs(deltaY) > 50) {
          if (deltaY > 0) {
            this.handleSwipeDown();
          } else {
            this.handleSwipeUp();
          }
        }
      }

      // Detect double tap
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 500 && tapLength > 0) {
        this.handleDoubleTap(e.changedTouches[0]);
      }
      lastTap = currentTime;
    });
  }

  handleSwipeRight() {
    // Navigate back or undo
    if (window.videoEditor?.canUndo()) {
      window.videoEditor.undo();
    }
  }

  handleSwipeLeft() {
    // Navigate forward or redo
    if (window.videoEditor?.canRedo()) {
      window.videoEditor.redo();
    }
  }

  handleSwipeUp() {
    // Show more options or zoom in
    this.toggleMobileMenu();
  }

  handleSwipeDown() {
    // Hide menu or zoom out
    this.closeMobileMenu();
  }

  handleDoubleTap(touch) {
    // Toggle fullscreen preview
    this.toggleFullscreenPreview();
  }

  optimizeScrolling() {
    // Improve scrolling performance on mobile
    let isScrolling = false;

    document.addEventListener('scroll', () => {
      if (!isScrolling) {
        window.requestAnimationFrame(() => {
          this.handleScroll();
          isScrolling = false;
        });
        isScrolling = true;
      }
    });
  }

  handleScroll() {
    // Update UI based on scroll position
    const scrollTop = window.pageYOffset;
    const header = document.querySelector('.mobile-header');

    if (header) {
      if (scrollTop > 100) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }

  setupResponsiveLayout() {
    this.applyResponsiveStyles();
    this.setupViewport();
  }

  applyResponsiveStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 768px) {
        .desktop-only { display: none !important; }
        .mobile-only { display: block !important; }

        .timeline-container {
          height: 120px;
          padding: 8px;
        }

        .preview-container {
          height: 200px;
        }

        .toolbar {
          flex-direction: column;
          padding: 8px;
        }

        .property-panel {
          width: 100%;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 300px;
          transform: translateY(100%);
          transition: transform 0.3s ease;
        }

        .property-panel.open {
          transform: translateY(0);
        }
      }

      @media (min-width: 769px) {
        .mobile-only { display: none !important; }
        .desktop-only { display: block !important; }
      }
    `;
    document.head.appendChild(style);
  }

  setupViewport() {
    // Ensure proper viewport meta tag
    let viewport = document.querySelector('meta[name=viewport]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
      document.head.appendChild(viewport);
    }
  }

  // Mobile-specific UI helpers
  showMobileMenu() {
    const menu = document.querySelector('.mobile-menu');
    if (menu) {
      menu.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  hideMobileMenu() {
    const menu = document.querySelector('.mobile-menu');
    if (menu) {
      menu.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  toggleMobileMenu() {
    const menu = document.querySelector('.mobile-menu');
    if (menu) {
      menu.classList.toggle('open');
      document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
    }
  }

  closeMobileMenu() {
    this.hideMobileMenu();
  }

  toggleFullscreenPreview() {
    const preview = document.querySelector('.video-preview');
    if (preview) {
      if (preview.requestFullscreen) {
        preview.requestFullscreen();
      } else if (preview.webkitRequestFullscreen) {
        preview.webkitRequestFullscreen();
      } else if (preview.msRequestFullscreen) {
        preview.msRequestFullscreen();
      }
    }
  }

  handleOrientationChange() {
    // Adjust UI for orientation change
    setTimeout(() => {
      this.adjustForOrientation();
    }, 100);
  }

  adjustForOrientation() {
    const timeline = document.querySelector('.timeline');
    if (timeline) {
      if (this.deviceInfo.orientation === 'landscape') {
        timeline.style.height = '80px';
      } else {
        timeline.style.height = '120px';
      }
    }
  }

  handleResize() {
    // Handle window resize
    this.deviceInfo = this.detectDevice();
    this.adjustLayout();
  }

  adjustLayout() {
    const isMobile = this.deviceInfo.screenWidth < 768;

    if (isMobile) {
      document.body.classList.add('mobile-layout');
      document.body.classList.remove('desktop-layout');
    } else {
      document.body.classList.add('desktop-layout');
      document.body.classList.remove('mobile-layout');
    }
  }

  // Offline functionality
  async saveProjectOffline(projectId, projectData) {
    if (!this.offlineDB) {
      throw new Error('Offline database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.offlineDB.transaction(['projects'], 'readwrite');
      const store = transaction.objectStore('projects');

      const projectRecord = {
        id: projectId,
        data: projectData,
        lastModified: new Date().toISOString(),
        status: 'offline',
        size: JSON.stringify(projectData).length
      };

      const request = store.put(projectRecord);

      request.onsuccess = () => {
        this.offlineQueue.push({ type: 'save', projectId, timestamp: Date.now() });
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async loadProjectOffline(projectId) {
    if (!this.offlineDB) {
      throw new Error('Offline database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.offlineDB.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.get(projectId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineProjects() {
    if (!this.offlineDB) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.offlineDB.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async syncOfflineData() {
    if (!navigator.onLine || this.syncInProgress) return;

    this.syncInProgress = true;

    try {
      for (const item of this.offlineQueue) {
        await this.syncItem(item);
      }

      this.offlineQueue = [];
      console.log('Offline data synced successfully');
    } catch (error) {
      console.error('Offline sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncItem(item) {
    // Implement sync logic based on item type
    switch (item.type) {
      case 'save':
        await this.uploadProject(item.projectId);
        break;
      default:
        console.warn('Unknown sync item type:', item.type);
    }
  }

  async uploadProject(projectId) {
    // Upload project to server when online
    const projectData = await this.loadProjectOffline(projectId);
    if (projectData) {
      // Here you would make an API call to upload the project
      console.log('Uploading project:', projectId);
    }
  }

  showUpdateNotification() {
    // Show notification for app updates
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Artone Update Available', {
        body: 'A new version of Artone is available. Refresh to update.',
        icon: '/icons/icon-192x192.png'
      });
    }
  }

  // Public API
  getDeviceInfo() {
    return this.deviceInfo;
  }

  isMobileDevice() {
    return this.isMobile;
  }

  isOfflineMode() {
    return this.isOffline;
  }

  supportsTouch() {
    return this.touchDevice;
  }

  getOptimalVideoQuality() {
    // Adjust video quality based on device capabilities
    if (this.isMobile) {
      return {
        resolution: this.deviceInfo.isPhone ? '720p' : '1080p',
        bitrate: this.deviceInfo.isPhone ? '2000k' : '4000k',
        fps: 30
      };
    }

    return {
      resolution: '1080p',
      bitrate: '8000k',
      fps: 60
    };
  }
}

// Export singleton instance
export const mobileExperience = new MobileExperienceManager();
export default MobileExperienceManager;
