interface AccessibilityConfig {
  announcePageLoad: boolean;
  announceStateChanges: boolean;
  highContrastMode: boolean;
  reducedMotion: boolean;
}

class AccessibilityManager {
  private config: AccessibilityConfig;
  private announcements: string[] = [];
  private liveRegion: HTMLElement | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.initializeAccessibility();
  }

  private loadConfig(): AccessibilityConfig {
    try {
      const stored = localStorage.getItem('artone_accessibility_config');
      if (stored) {
        return { ...this.getDefaultConfig(), ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Could not load accessibility config');
    }

    return this.getDefaultConfig();
  }

  private getDefaultConfig(): AccessibilityConfig {
    return {
      announcePageLoad: true,
      announceStateChanges: true,
      highContrastMode: false,
      reducedMotion: false
    };
  }

  private initializeAccessibility(): void {
    this.createLiveRegion();
    this.applyAccessibilitySettings();
    this.setupKeyboardNavigation();
    this.setupFocusManagement();
    this.setupARIALabels();
  }

  private createLiveRegion(): void {
    if (typeof document === 'undefined') return;

    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('id', 'artone-live-region');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';

    document.body.appendChild(liveRegion);
    this.liveRegion = liveRegion;
  }

  private applyAccessibilitySettings(): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    // High contrast mode
    if (this.config.highContrastMode) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Reduced motion
    if (this.config.reducedMotion) {
      root.classList.add('reduce-motion');
      root.style.setProperty('--animation-duration', '0.01ms');
    } else {
      root.classList.remove('reduce-motion');
      root.style.removeProperty('--animation-duration');
    }
  }

  private setupKeyboardNavigation(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('keydown', (event) => {
      this.handleKeyboardNavigation(event);
    });

    // Skip to main content
    this.createSkipLink();
  }

  private handleKeyboardNavigation(event: KeyboardEvent): void {
    const { key, target, ctrlKey, shiftKey } = event;
    const activeElement = target as HTMLElement;

    switch (key) {
      case 'Tab':
        this.handleTabNavigation(event, activeElement);
        break;
      case 'Escape':
        this.handleEscapeKey(activeElement);
        break;
      case 'Enter':
      case ' ':
        this.handleActivation(event, activeElement);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        this.handleArrowNavigation(event, activeElement);
        break;
      case 'Home':
      case 'End':
        this.handleHomeEndKeys(event, activeElement);
        break;
    }

    // Global shortcuts
    if (ctrlKey) {
      switch (key) {
        case 'h':
          event.preventDefault();
          this.toggleHighContrastMode();
          break;
        case 'm':
          event.preventDefault();
          this.toggleReducedMotion();
          break;
      }
    }
  }

  private handleTabNavigation(event: KeyboardEvent, activeElement: HTMLElement): void {
    // Ensure proper tab order
    const focusableElements = this.getFocusableElements();

    if (shiftKey) {
      // Shift+Tab (backward navigation)
      const currentIndex = focusableElements.indexOf(activeElement);
      if (currentIndex > 0) {
        event.preventDefault();
        focusableElements[currentIndex - 1].focus();
      }
    } else {
      // Tab (forward navigation)
      const currentIndex = focusableElements.indexOf(activeElement);
      if (currentIndex < focusableElements.length - 1 && currentIndex !== -1) {
        event.preventDefault();
        focusableElements[currentIndex + 1].focus();
      }
    }
  }

  private handleEscapeKey(activeElement: HTMLElement): void {
    // Close modals, dropdowns, etc.
    const modal = activeElement.closest('[role="dialog"]');
    if (modal) {
      const closeButton = modal.querySelector('[aria-label="Close"], [data-dismiss]') as HTMLElement;
      if (closeButton) {
        closeButton.click();
      }
    }
  }

  private handleActivation(event: KeyboardEvent, activeElement: HTMLElement): void {
    // Handle button-like elements
    const role = activeElement.getAttribute('role');
    if (role === 'button' || activeElement.tagName === 'BUTTON') {
      if (!activeElement.hasAttribute('disabled')) {
        event.preventDefault();
        activeElement.click();
      }
    }
  }

  private handleArrowNavigation(event: KeyboardEvent, activeElement: HTMLElement): void {
    const { key } = event;

    // Handle timeline navigation
    if (activeElement.closest('.timeline')) {
      event.preventDefault();

      const moveAmount = shiftKey ? 10 : 1; // Larger movement with Shift

      switch (key) {
        case 'ArrowLeft':
          this.navigateTimeline(-moveAmount);
          break;
        case 'ArrowRight':
          this.navigateTimeline(moveAmount);
          break;
        case 'ArrowUp':
          this.navigateTracks(-1);
          break;
        case 'ArrowDown':
          this.navigateTracks(1);
          break;
      }
    }
  }

  private handleHomeEndKeys(event: KeyboardEvent, activeElement: HTMLElement): void {
    if (activeElement.closest('.timeline')) {
      event.preventDefault();

      if (event.key === 'Home') {
        this.goToTimelineStart();
      } else {
        this.goToTimelineEnd();
      }
    }
  }

  private getFocusableElements(): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(', ');

    return Array.from(document.querySelectorAll(selector)).filter(el => {
      const htmlEl = el as HTMLElement;
      return htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0;
    });
  }

  private createSkipLink(): void {
    if (typeof document === 'undefined') return;

    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'メインコンテンツにスキップ';
    skipLink.className = 'skip-link';
    skipLink.style.cssText = `
      position: absolute;
      top: -40px;
      left: 6px;
      background: #000;
      color: #fff;
      padding: 8px;
      text-decoration: none;
      z-index: 1000;
      border-radius: 4px;
    `;

    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '6px';
    });

    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-40px';
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  private setupFocusManagement(): void {
    // Focus trap for modals
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        const modal = document.querySelector('[role="dialog"]:focus-within');
        if (modal) {
          this.trapFocusInModal(event, modal);
        }
      }
    });
  }

  private trapFocusInModal(event: KeyboardEvent, modal: Element): void {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  private setupARIALabels(): void {
    if (typeof document === 'undefined') return;

    // Add ARIA labels to interactive elements
    this.labelButtons();
    this.labelInputs();
    this.labelNavigation();
    this.labelTimeline();
  }

  private labelButtons(): void {
    const buttons = document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
    buttons.forEach((button, index) => {
      const textContent = button.textContent?.trim();
      if (textContent) {
        button.setAttribute('aria-label', textContent);
      } else {
        button.setAttribute('aria-label', `Button ${index + 1}`);
      }
    });
  }

  private labelInputs(): void {
    const inputs = document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
    inputs.forEach((input) => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        input.setAttribute('aria-label', label.textContent || 'Input field');
      }
    });
  }

  private labelNavigation(): void {
    const navElements = document.querySelectorAll('nav, [role="navigation"]');
    navElements.forEach((nav) => {
      if (!nav.hasAttribute('aria-label')) {
        nav.setAttribute('aria-label', 'Main navigation');
      }
    });
  }

  private labelTimeline(): void {
    const timeline = document.querySelector('.timeline, [role="timeline"]');
    if (timeline && !timeline.hasAttribute('aria-label')) {
      timeline.setAttribute('aria-label', 'Video timeline editor');
    }
  }

  // Navigation methods
  private navigateTimeline(deltaFrames: number): void {
    // Dispatch custom event for timeline navigation
    const event = new CustomEvent('timeline-navigate', {
      detail: { deltaFrames }
    });
    document.dispatchEvent(event);
  }

  private navigateTracks(direction: number): void {
    const event = new CustomEvent('timeline-track-navigate', {
      detail: { direction }
    });
    document.dispatchEvent(event);
  }

  private goToTimelineStart(): void {
    const event = new CustomEvent('timeline-go-to-start');
    document.dispatchEvent(event);
  }

  private goToTimelineEnd(): void {
    const event = new CustomEvent('timeline-go-to-end');
    document.dispatchEvent(event);
  }

  // Public methods
  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.config.announceStateChanges || !this.liveRegion) return;

    this.liveRegion.setAttribute('aria-live', priority);
    this.liveRegion.textContent = message;

    // Clear after announcement
    setTimeout(() => {
      this.liveRegion!.textContent = '';
    }, 1000);
  }

  public toggleHighContrastMode(): void {
    this.config.highContrastMode = !this.config.highContrastMode;
    this.saveConfig();
    this.applyAccessibilitySettings();
    this.announce(`ハイコントラストモードを${this.config.highContrastMode ? '有効' : '無効'}にしました`);
  }

  public toggleReducedMotion(): void {
    this.config.reducedMotion = !this.config.reducedMotion;
    this.saveConfig();
    this.applyAccessibilitySettings();
    this.announce(`モーション軽減モードを${this.config.reducedMotion ? '有効' : '無効'}にしました`);
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('artone_accessibility_config', JSON.stringify(this.config));
    } catch (e) {
      console.warn('Could not save accessibility config');
    }
  }

  public getConfig(): AccessibilityConfig {
    return { ...this.config };
  }
}

// Global instance
let accessibilityManager: AccessibilityManager | null = null;

export function initializeAccessibility(): void {
  if (typeof document === 'undefined') return;

  accessibilityManager = new AccessibilityManager();
}

export function getAccessibilityManager(): AccessibilityManager | null {
  return accessibilityManager;
}

// Auto-initialize
if (typeof document !== 'undefined') {
  initializeAccessibility();
}
