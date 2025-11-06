interface SessionConfig {
  enableSecureCookies: boolean;
  sessionTimeout: number; // seconds
  extendOnActivity: boolean;
  activityTimeout: number; // seconds
  maxSessionsPerUser: number;
  enableSessionRotation: boolean;
  enableConcurrentSessions: boolean;
  enableSessionAnalytics: boolean;
  enableCSRFProtection: boolean;
  enableSessionFixationProtection: boolean;
  enableSessionHijackingProtection: boolean;
}

interface SessionData {
  sessionId: string;
  userId: string;
  userAgent: string;
  ipAddress: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  isActive: boolean;
  metadata: Record<string, any>;
  csrfToken: string;
  fingerprint: string;
}

interface SessionActivity {
  sessionId: string;
  action: string;
  timestamp: number;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, any>;
}

class SessionManager {
  private config: SessionConfig;
  private currentSession: SessionData | null = null;
  private sessionActivity: SessionActivity[] = [];
  private activityCheckInterval: number | null = null;

  private readonly defaultConfig: SessionConfig = {
    enableSecureCookies: true,
    sessionTimeout: 3600, // 1 hour
    extendOnActivity: true,
    activityTimeout: 1800, // 30 minutes
    maxSessionsPerUser: 5,
    enableSessionRotation: true,
    enableConcurrentSessions: true,
    enableSessionAnalytics: true,
    enableCSRFProtection: true,
    enableSessionFixationProtection: true,
    enableSessionHijackingProtection: true
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeSessionManagement();
  }

  private initializeSessionManagement(): void {
    this.loadExistingSession();
    this.setupActivityMonitoring();
    this.setupSessionSecurity();
    this.setupCSRFProtection();
    this.setupSessionCleanup();
  }

  private loadExistingSession(): void {
    try {
      const sessionCookie = this.getCookie('artone_session');
      if (sessionCookie) {
        const sessionData = JSON.parse(atob(sessionCookie));
        if (this.validateSession(sessionData)) {
          this.currentSession = sessionData;
          this.extendSession();
        } else {
          this.destroySession();
        }
      }
    } catch (error) {
      console.error('Failed to load existing session:', error);
      this.destroySession();
    }
  }

  private setupActivityMonitoring(): void {
    if (this.config.extendOnActivity) {
      this.activityCheckInterval = window.setInterval(() => {
        this.checkActivityTimeout();
      }, 60000); // Check every minute

      // Monitor user activity
      this.setupActivityListeners();
    }
  }

  private setupActivityListeners(): void {
    const activities = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    let lastActivity = Date.now();

    activities.forEach(activity => {
      document.addEventListener(activity, () => {
        lastActivity = Date.now();
        if (this.currentSession && this.config.extendOnActivity) {
          this.extendSession();
        }
      }, true);
    });

    // Store last activity time
    setInterval(() => {
      if (this.currentSession) {
        this.currentSession.lastActivity = lastActivity;
        this.saveSession();
      }
    }, 30000); // Update every 30 seconds
  }

  private checkActivityTimeout(): void {
    if (!this.currentSession) return;

    const now = Date.now();
    const timeSinceActivity = now - this.currentSession.lastActivity;

    if (timeSinceActivity > this.config.activityTimeout * 1000) {
      console.warn('Session activity timeout');
      this.handleSessionTimeout();
    }
  }

  private handleSessionTimeout(): void {
    if (this.currentSession) {
      this.logSessionActivity('timeout', { reason: 'activity_timeout' });
      this.destroySession();
    }
  }

  private setupSessionSecurity(): void {
    if (this.config.enableSessionHijackingProtection) {
      this.setupFingerprinting();
    }

    if (this.config.enableSessionFixationProtection) {
      this.setupSessionFixationProtection();
    }
  }

  private setupFingerprinting(): void {
    // Create browser fingerprint
    const fingerprint = this.generateFingerprint();
    if (this.currentSession) {
      this.currentSession.fingerprint = fingerprint;
    }
  }

  private generateFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('fingerprint', 10, 10);

    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      screenWidth: screen.width,
      screenHeight: screen.height,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL()
    };

    return btoa(JSON.stringify(fingerprint));
  }

  private setupSessionFixationProtection(): void {
    // Prevent session fixation attacks
    if (this.currentSession && this.config.enableSessionRotation) {
      this.rotateSession();
    }
  }

  private setupCSRFProtection(): void {
    if (!this.config.enableCSRFProtection) return;

    // Generate CSRF token
    if (this.currentSession) {
      this.currentSession.csrfToken = this.generateCSRFToken();
    }
  }

  private generateCSRFToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)));
  }

  private setupSessionCleanup(): void {
    // Clean up expired sessions periodically
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000); // Every 5 minutes

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  public async createSession(userId: string, metadata?: Record<string, any>): Promise<SessionData> {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const sessionData: SessionData = {
      sessionId,
      userId,
      userAgent: navigator.userAgent,
      ipAddress: await this.getClientIP(),
      createdAt: now,
      lastActivity: now,
      expiresAt: now + (this.config.sessionTimeout * 1000),
      isActive: true,
      csrfToken: this.generateCSRFToken(),
      fingerprint: this.generateFingerprint(),
      metadata: metadata || {}
    };

    this.currentSession = sessionData;
    this.saveSession();
    this.logSessionActivity('created', { userId });

    console.log('Session created:', sessionId);
    return sessionData;
  }

  public async validateSession(sessionData?: SessionData): Promise<boolean> {
    const session = sessionData || this.currentSession;
    if (!session) return false;

    const now = Date.now();

    // Check if session is expired
    if (now > session.expiresAt) {
      console.warn('Session expired');
      return false;
    }

    // Check if session is active
    if (!session.isActive) {
      console.warn('Session is not active');
      return false;
    }

    // Check fingerprint for hijacking protection
    if (this.config.enableSessionHijackingProtection) {
      const currentFingerprint = this.generateFingerprint();
      if (currentFingerprint !== session.fingerprint) {
        console.warn('Session fingerprint mismatch - possible hijacking');
        this.logSessionActivity('hijack_attempt', { reason: 'fingerprint_mismatch' });
        return false;
      }
    }

    return true;
  }

  public extendSession(): void {
    if (!this.currentSession) return;

    const now = Date.now();
    this.currentSession.lastActivity = now;
    this.currentSession.expiresAt = now + (this.config.sessionTimeout * 1000);

    this.saveSession();
    this.logSessionActivity('extended');
  }

  public rotateSession(): void {
    if (!this.currentSession) return;

    const oldSessionId = this.currentSession.sessionId;
    this.currentSession.sessionId = this.generateSessionId();
    this.currentSession.createdAt = Date.now();
    this.currentSession.csrfToken = this.generateCSRFToken();

    this.saveSession();
    this.logSessionActivity('rotated', { oldSessionId });

    console.log('Session rotated:', oldSessionId, '->', this.currentSession.sessionId);
  }

  public destroySession(): void {
    if (!this.currentSession) return;

    this.logSessionActivity('destroyed', { reason: 'manual' });

    // Clear session data
    this.currentSession.isActive = false;
    this.saveSession();

    // Clear cookies
    this.setCookie('artone_session', '', -1);

    // Clear current session
    this.currentSession = null;

    console.log('Session destroyed');
  }

  public getSessionData(): SessionData | null {
    return this.currentSession;
  }

  public getCSRFToken(): string | null {
    return this.currentSession?.csrfToken || null;
  }

  public validateCSRFToken(token: string): boolean {
    if (!this.currentSession || !this.config.enableCSRFProtection) return true;
    return token === this.currentSession.csrfToken;
  }

  public async refreshSession(): Promise<SessionData | null> {
    if (!this.currentSession) return null;

    try {
      // In a real implementation, this would make an API call to refresh the session
      const refreshedSession = await this.refreshSessionFromServer(this.currentSession);

      if (refreshedSession) {
        this.currentSession = refreshedSession;
        this.saveSession();
        this.logSessionActivity('refreshed');
        return refreshedSession;
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }

    return null;
  }

  private async refreshSessionFromServer(session: SessionData): Promise<SessionData | null> {
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ...session,
          expiresAt: Date.now() + (this.config.sessionTimeout * 1000),
          lastActivity: Date.now()
        });
      }, 100);
    });
  }

  private generateSessionId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return 'session_' + btoa(String.fromCharCode.apply(null, Array.from(array)));
  }

  private async getClientIP(): Promise<string> {
    try {
      // Client IP should be obtained from server-side headers in production
      // This is a placeholder for client-side session tracking
      return 'client-side';
    } catch {
      return 'unknown';
    }
  }

  private saveSession(): void {
    if (!this.currentSession) return;

    try {
      const sessionString = btoa(JSON.stringify(this.currentSession));
      this.setCookie('artone_session', sessionString, this.currentSession.expiresAt);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  private setCookie(name: string, value: string, expiresAt: number): void {
    const expires = new Date(expiresAt);
    const cookieOptions = [
      `${name}=${value}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      this.config.enableSecureCookies ? 'secure' : '',
      'httponly',
      'samesite=strict'
    ].filter(Boolean).join('; ');

    document.cookie = cookieOptions;
  }

  private getCookie(name: string): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [cookieName, cookieValue] = cookie.trim().split('=');
      if (cookieName === name) {
        return cookieValue;
      }
    }
    return null;
  }

  private logSessionActivity(action: string, metadata?: Record<string, any>): void {
    if (!this.currentSession || !this.config.enableSessionAnalytics) return;

    const activity: SessionActivity = {
      sessionId: this.currentSession.sessionId,
      action,
      timestamp: Date.now(),
      ipAddress: this.currentSession.ipAddress,
      userAgent: navigator.userAgent,
      metadata: metadata || {}
    };

    this.sessionActivity.push(activity);

    // Keep only recent activities
    if (this.sessionActivity.length > 100) {
      this.sessionActivity.shift();
    }

    console.log('Session Activity:', activity);
  }

  private cleanupExpiredSessions(): void {
    // Clean up expired session activities
    const now = Date.now();
    const validActivities = this.sessionActivity.filter(activity =>
      now - activity.timestamp < 86400000 // Keep activities for 24 hours
    );

    this.sessionActivity = validActivities;
  }

  private cleanup(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }

    this.logSessionActivity('cleanup', { reason: 'page_unload' });
  }

  public getSessionActivity(): SessionActivity[] {
    return [...this.sessionActivity];
  }

  public getSessionStats(): any {
    const now = Date.now();
    const activeActivities = this.sessionActivity.filter(activity =>
      now - activity.timestamp < 3600000 // Last hour
    );

    return {
      currentSession: this.currentSession ? {
        id: this.currentSession.sessionId,
        userId: this.currentSession.userId,
        createdAt: this.currentSession.createdAt,
        lastActivity: this.currentSession.lastActivity,
        expiresAt: this.currentSession.expiresAt
      } : null,
      totalActivities: this.sessionActivity.length,
      recentActivities: activeActivities.length,
      sessionAge: this.currentSession ? now - this.currentSession.createdAt : 0
    };
  }

  public updateConfig(newConfig: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): SessionConfig {
    return { ...this.config };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      stats: this.getSessionStats(),
      recentActivity: this.sessionActivity.slice(-10),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public destroy(): void {
    this.cleanup();
    this.destroySession();
    this.sessionActivity = [];
  }
}

// Global instance
let sessionManager: SessionManager | null = null;

export function initializeSessionManager(): void {
  if (typeof window === 'undefined') return;

  sessionManager = new SessionManager();
}

export function getSessionManager(): SessionManager | null {
  return sessionManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeSessionManager();
}
