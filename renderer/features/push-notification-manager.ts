interface PushNotificationConfig {
  enablePushNotifications: boolean;
  enableNotificationClick: boolean;
  enableNotificationClose: boolean;
  enableBackgroundMessages: boolean;
  enableRichNotifications: boolean;
  defaultIcon: string;
  defaultBadge: string;
  enableVibration: boolean;
  enableSound: boolean;
  enableActions: boolean;
  maxActions: number;
  enableTagGrouping: boolean;
  enableRenotify: boolean;
  requireInteraction: boolean;
  silent: boolean;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: any;
  actions?: NotificationAction[];
  requireInteraction?: boolean;
  renotify?: boolean;
  silent?: boolean;
  timestamp: number;
}

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

class PushNotificationManager {
  private config: PushNotificationConfig;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private notificationHistory: NotificationPayload[] = [];

  private readonly defaultConfig: PushNotificationConfig = {
    enablePushNotifications: true,
    enableNotificationClick: true,
    enableNotificationClose: true,
    enableBackgroundMessages: true,
    enableRichNotifications: true,
    defaultIcon: '/icons/icon-192x192.png',
    defaultBadge: '/icons/icon-72x72.png',
    enableVibration: true,
    enableSound: true,
    enableActions: true,
    maxActions: 2,
    enableTagGrouping: true,
    enableRenotify: false,
    requireInteraction: false,
    silent: false
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializePushNotifications();
  }

  private initializePushNotifications(): void {
    if (!this.config.enablePushNotifications) return;

    this.registerServiceWorker();
    this.requestNotificationPermission();
    this.setupNotificationEventListeners();
  }

  private async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw-push.js', {
        scope: '/'
      });

      this.serviceWorkerRegistration = registration;

      // Check for existing subscription
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        this.subscription = existingSubscription;
        console.log('Existing push subscription found');
      }

      console.log('Push Service Worker registered');
    } catch (error) {
      console.error('Failed to register push service worker:', error);
    }
  }

  private async requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        console.log('Notification permission granted');
        this.setupNotificationEventListeners();
      } else {
        console.log('Notification permission denied');
      }
    } else if (Notification.permission === 'granted') {
      this.setupNotificationEventListeners();
    }
  }

  private setupNotificationEventListeners(): void {
    // Handle notification clicks
    if (this.config.enableNotificationClick) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'notification-click') {
          this.handleNotificationClick(event.data);
        }
      });
    }

    // Handle background messages
    if (this.config.enableBackgroundMessages) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'background-message') {
          this.handleBackgroundMessage(event.data);
        }
      });
    }
  }

  private handleNotificationClick(data: any): void {
    console.log('Notification clicked:', data);

    // Focus the window
    window.focus();

    // Handle different notification types
    if (data.action) {
      this.handleNotificationAction(data.action, data.notificationData);
    } else {
      this.handleNotificationDefaultAction(data.notificationData);
    }
  }

  private handleNotificationAction(action: string, data: any): void {
    switch (action) {
      case 'view':
        if (data.url) {
          window.location.href = data.url;
        }
        break;
      case 'reply':
        this.showReplyInterface(data);
        break;
      case 'dismiss':
        // Dismiss the notification
        break;
      default:
        console.log('Unknown notification action:', action);
    }
  }

  private handleNotificationDefaultAction(data: any): void {
    if (data.url) {
      window.location.href = data.url;
    } else {
      // Default action - focus the app
      window.focus();
    }
  }

  private handleBackgroundMessage(data: any): void {
    console.log('Background message received:', data);

    // Handle background message processing
    if (data.type === 'sync') {
      this.handleBackgroundSync(data);
    } else if (data.type === 'update') {
      this.handleBackgroundUpdate(data);
    }
  }

  private handleBackgroundSync(data: any): void {
    // Handle background sync operations
    console.log('Processing background sync:', data);
  }

  private handleBackgroundUpdate(data: any): void {
    // Handle background updates
    console.log('Processing background update:', data);
  }

  public async subscribeToPushNotifications(): Promise<PushSubscription | null> {
    if (!this.serviceWorkerRegistration) {
      console.error('Service Worker not registered');
      return null;
    }

    try {
      // Get VAPID public key from server
      const vapidPublicKey = await this.getVAPIDPublicKey();

      const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
      });

      this.subscription = subscription;
      console.log('Push subscription created:', subscription);

      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);

      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return null;
    }
  }

  public async unsubscribeFromPushNotifications(): Promise<void> {
    if (!this.subscription) return;

    try {
      await this.subscription.unsubscribe();
      this.subscription = null;
      console.log('Unsubscribed from push notifications');
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
    }
  }

  private async getVAPIDPublicKey(): Promise<string> {
    // In a real implementation, this would fetch from your server
    // For demo purposes, return a placeholder
    return 'BKx3v8Q4n8H4n8Kx3v8Q4n8H4n8Kx3v8Q4n8H4n8Kx3v8Q4n8H4n8K';
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });

      console.log('Subscription sent to server');
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
    }
  }

  public async showNotification(payload: NotificationPayload): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.warn('Notifications not permitted');
      return;
    }

    try {
      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || this.config.defaultIcon,
        badge: payload.badge || this.config.defaultBadge,
        image: payload.image,
        tag: payload.tag,
        data: payload.data,
        actions: this.config.enableActions ? payload.actions?.slice(0, this.config.maxActions) : undefined,
        requireInteraction: payload.requireInteraction || this.config.requireInteraction,
        renotify: payload.renotify || this.config.enableRenotify,
        silent: payload.silent || this.config.silent,
        timestamp: payload.timestamp
      });

      // Set up notification event listeners
      if (this.config.enableNotificationClick) {
        notification.addEventListener('click', () => {
          this.handleNotificationClick({
            action: 'default',
            notificationData: payload.data
          });
          notification.close();
        });
      }

      if (this.config.enableNotificationClose) {
        notification.addEventListener('close', () => {
          console.log('Notification closed:', payload.title);
        });
      }

      // Auto-close after 5 seconds if not requiring interaction
      if (!this.config.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      // Store in history
      this.notificationHistory.push(payload);
      if (this.notificationHistory.length > 50) {
        this.notificationHistory.shift();
      }

      console.log('Notification shown:', payload.title);
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  public async showRichNotification(title: string, options: {
    body?: string;
    icon?: string;
    badge?: string;
    image?: string;
    actions?: NotificationAction[];
    data?: any;
  }): Promise<void> {
    if (!this.config.enableRichNotifications) {
      await this.showNotification({
        title,
        body: options.body || '',
        icon: options.icon,
        badge: options.badge,
        image: options.image,
        actions: options.actions,
        data: options.data,
        timestamp: Date.now()
      });
      return;
    }

    await this.showNotification({
      title,
      body: options.body || '',
      icon: options.icon,
      badge: options.badge,
      image: options.image,
      actions: options.actions,
      data: options.data,
      timestamp: Date.now()
    });
  }

  public async scheduleNotification(title: string, delay: number, options: {
    body?: string;
    icon?: string;
    badge?: string;
    data?: any;
  }): Promise<void> {
    setTimeout(() => {
      this.showNotification({
        title,
        body: options.body || '',
        icon: options.icon,
        badge: options.badge,
        data: options.data,
        timestamp: Date.now()
      });
    }, delay);
  }

  public async showProgressNotification(title: string, progress: number, total: number): Promise<void> {
    const percentage = Math.round((progress / total) * 100);

    await this.showNotification({
      title: `${title} (${percentage}%)`,
      body: `Progress: ${progress}/${total}`,
      data: { type: 'progress', progress, total, percentage },
      timestamp: Date.now()
    });
  }

  public async showErrorNotification(title: string, error: string): Promise<void> {
    await this.showNotification({
      title: `Error: ${title}`,
      body: error,
      data: { type: 'error', title, error },
      timestamp: Date.now()
    });
  }

  public async showSuccessNotification(title: string, message: string): Promise<void> {
    await this.showNotification({
      title: `Success: ${title}`,
      body: message,
      data: { type: 'success', title, message },
      timestamp: Date.now()
    });
  }

  public getNotificationHistory(): NotificationPayload[] {
    return [...this.notificationHistory];
  }

  public clearNotificationHistory(): void {
    this.notificationHistory = [];
  }

  public isSubscribed(): boolean {
    return this.subscription !== null;
  }

  public getSubscription(): PushSubscription | null {
    return this.subscription;
  }

  public getServiceWorkerRegistration(): ServiceWorkerRegistration | null {
    return this.serviceWorkerRegistration;
  }

  public getConfig(): PushNotificationConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<PushNotificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      isSubscribed: this.isSubscribed(),
      subscription: this.subscription,
      notificationCount: this.notificationHistory.length,
      recentNotifications: this.notificationHistory.slice(-5),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public destroy(): void {
    this.notificationHistory = [];
    this.subscription = null;
    this.serviceWorkerRegistration = null;
  }
}

// Global instance
let pushNotificationManager: PushNotificationManager | null = null;

export function initializePushNotificationManager(): void {
  if (typeof window === 'undefined') return;

  pushNotificationManager = new PushNotificationManager();
}

export function getPushNotificationManager(): PushNotificationManager | null {
  return pushNotificationManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializePushNotificationManager();
}
