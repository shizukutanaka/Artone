'use strict';

// Import production logger
let productionLogger = null;
try {
  if (global.ProductionLogger) {
    productionLogger = global.ProductionLogger;
  }
} catch (e) {
  // Fallback to console in development
  productionLogger = { info: console.log, warn: console.warn, error: console.error };
}

  class ThemeManager {
    constructor() {
      this.themes = new Map();
      this.currentTheme = 'dark';
      this.systemPreference = this.getSystemPreference();
      this.initializeThemes();
    }

    initializeThemes() {
      this.themes.set('dark', {
        name: 'Dark',
        variables: {
          '--bg-primary': '#1a1a1a',
          '--bg-secondary': '#2d2d2d',
          '--bg-tertiary': '#404040',
          '--text-primary': '#ffffff',
          '--text-secondary': '#b3b3b3',
          '--text-muted': '#666666',
          '--accent-primary': '#3b82f6',
          '--accent-secondary': '#8b5cf6',
          '--border-color': '#404040',
          '--success-color': '#10b981',
          '--warning-color': '#f59e0b',
          '--error-color': '#ef4444'
        }
      });

      this.themes.set('light', {
        name: 'Light',
        variables: {
          '--bg-primary': '#ffffff',
          '--bg-secondary': '#f8fafc',
          '--bg-tertiary': '#e2e8f0',
          '--text-primary': '#1a202c',
          '--text-secondary': '#4a5568',
          '--text-muted': '#a0aec0',
          '--accent-primary': '#3182ce',
          '--accent-secondary': '#805ad5',
          '--border-color': '#e2e8f0',
          '--success-color': '#38a169',
          '--warning-color': '#d69e2e',
          '--error-color': '#e53e3e'
        }
      });

      this.themes.set('high-contrast', {
        name: 'High Contrast',
        variables: {
          '--bg-primary': '#000000',
          '--bg-secondary': '#1a1a1a',
          '--bg-tertiary': '#333333',
          '--text-primary': '#ffffff',
          '--text-secondary': '#ffffff',
          '--text-muted': '#cccccc',
          '--accent-primary': '#00ff00',
          '--accent-secondary': '#ffff00',
          '--border-color': '#ffffff',
          '--success-color': '#00ff00',
          '--warning-color': '#ffff00',
          '--error-color': '#ff0000'
        }
      });
    }

    setTheme(themeName) {
      const theme = this.themes.get(themeName);
      if (!theme) {
        productionLogger.error(`Theme '${themeName}' not found`);
        return false;
      }

      // Apply CSS variables
      const root = document.documentElement;
      for (const [property, value] of Object.entries(theme.variables)) {
        root.style.setProperty(property, value);
      }

      this.currentTheme = themeName;
      document.body.setAttribute('data-theme', themeName);

      // Dispatch theme change event
      global.dispatchEvent(new CustomEvent('theme-changed', {
        detail: { theme: themeName }
      }));

      return true;
    }

    // Responsive panel management for clip inspector
    createResponsiveInspector() {
      const inspector = {
        container: null,
        panels: new Map(),
        activePanel: null,
        layout: 'single', // 'single' | 'split' | 'tabs'
        breakpoints: {
          mobile: 768,
          tablet: 1024,
          desktop: 1280
        },
        currentBreakpoint: 'desktop'
      };

      // Panel definitions
      const panelDefinitions = {
        properties: {
          id: 'properties',
          title: 'Properties',
          icon: '⚙️',
          defaultSize: 300,
          minSize: 200,
          maxSize: 600
        },
        effects: {
          id: 'effects',
          title: 'Effects',
          icon: '✨',
          defaultSize: 350,
          minSize: 250,
          maxSize: 700
        },
        keyframes: {
          id: 'keyframes',
          title: 'Keyframes',
          icon: '📊',
          defaultSize: 400,
          minSize: 300,
          maxSize: 800
        },
        audio: {
          id: 'audio',
          title: 'Audio',
          icon: '🔊',
          defaultSize: 280,
          minSize: 200,
          maxSize: 500
        }
      };

      inspector.panelDefinitions = panelDefinitions;
      inspector.panels = new Map(Object.entries(panelDefinitions).map(([key, def]) => [key, def]));

      return inspector;
    }

    // Update responsive layout based on screen size
    updateResponsiveLayout() {
      const width = window.innerWidth;
      const { breakpoints } = this.responsiveInspector;

      if (width < breakpoints.mobile) {
        this.responsiveInspector.currentBreakpoint = 'mobile';
        this.setInspectorLayout('single');
      } else if (width < breakpoints.tablet) {
        this.responsiveInspector.currentBreakpoint = 'tablet';
        this.setInspectorLayout('tabs');
      } else {
        this.responsiveInspector.currentBreakpoint = 'desktop';
        this.setInspectorLayout('split');
      }
    }

    // Set inspector layout mode
    setInspectorLayout(layout) {
      const inspector = this.responsiveInspector;
      if (inspector.layout === layout) return;

      inspector.layout = layout;
      this.emit('inspector-layout-changed', { layout, breakpoint: inspector.currentBreakpoint });

      switch (layout) {
        case 'single':
          this.createSinglePanelLayout();
          break;
        case 'tabs':
          this.createTabbedLayout();
          break;
        case 'split':
          this.createSplitPanelLayout();
          break;
      }
    }

    createSinglePanelLayout() {
      const inspector = this.responsiveInspector;
      const container = inspector.container;
      if (!container) return;

      container.textContent = '';

      const content = document.createElement('div');
      content.className = 'inspector-content';

      const header = document.createElement('div');
      header.className = 'inspector-header';

      const tabsWrapper = document.createElement('div');
      tabsWrapper.className = 'inspector-tabs';

      Array.from(inspector.panels.values()).forEach(panel => {
        const tab = document.createElement('button');
        tab.className = `inspector-tab ${inspector.activePanel === panel.id ? 'active' : ''}`;
        tab.dataset.panel = panel.id;
        tab.textContent = `${panel.icon} ${panel.title}`;
        tab.addEventListener('click', () => {
          this.switchInspectorPanel(panel.id);
        });
        tabsWrapper.appendChild(tab);
      });

      header.appendChild(tabsWrapper);

      const body = document.createElement('div');
      body.className = 'inspector-body';

      Array.from(inspector.panels.values()).forEach(panel => {
        const panelWrapper = document.createElement('div');
        panelWrapper.className = `inspector-panel ${inspector.activePanel === panel.id ? 'active' : 'hidden'}`;
        panelWrapper.dataset.panel = panel.id;

        const panelContent = document.createElement('div');
        panelContent.className = 'panel-content';
        panelContent.id = `panel-${panel.id}`;

        panelWrapper.appendChild(panelContent);
        body.appendChild(panelWrapper);
      });

      content.appendChild(header);
      content.appendChild(body);

      container.appendChild(content);
    }

    createTabbedLayout() {
      // Similar to single panel but with better mobile optimization
      this.createSinglePanelLayout();
      // Add mobile-specific styling
      const container = this.responsiveInspector.container;
      if (container) {
        container.classList.add('mobile-optimized');
      }
    }

    createSplitPanelLayout() {
      const inspector = this.responsiveInspector;
      const container = inspector.container;
      if (!container) return;

      const activePanel = inspector.panels.get(inspector.activePanel);
      const otherPanels = Array.from(inspector.panels.values()).filter(p => p.id !== inspector.activePanel);

      container.textContent = '';

      const layout = document.createElement('div');
      layout.className = 'inspector-split-layout';

      const mainPanel = document.createElement('div');
      mainPanel.className = 'inspector-main-panel';

      const mainContent = document.createElement('div');
      mainContent.className = 'panel-content';
      if (activePanel) {
        mainContent.id = `panel-${activePanel.id}`;
      }

      const mainHeader = document.createElement('div');
      mainHeader.className = 'panel-header';
      const mainTitle = document.createElement('h3');
      mainTitle.textContent = activePanel ? `${activePanel.icon} ${activePanel.title}` : '';
      mainHeader.appendChild(mainTitle);

      const mainBody = document.createElement('div');
      mainBody.className = 'panel-body';

      mainContent.appendChild(mainHeader);
      mainContent.appendChild(mainBody);
      mainPanel.appendChild(mainContent);

      const sidePanel = document.createElement('div');
      sidePanel.className = 'inspector-side-panel';

      const tabs = document.createElement('div');
      tabs.className = 'panel-tabs';

      const sidePanelsContainer = document.createElement('div');
      sidePanelsContainer.className = 'side-panels';

      otherPanels.forEach(panel => {
        const tab = document.createElement('button');
        tab.className = `side-tab ${panel.id === inspector.activePanel ? 'active' : ''}`;
        tab.dataset.panel = panel.id;
        tab.textContent = panel.icon;
        tab.addEventListener('click', () => {
          this.switchInspectorPanel(panel.id);
        });
        tabs.appendChild(tab);

        const sidePanelWrapper = document.createElement('div');
        sidePanelWrapper.className = `side-panel ${panel.id === inspector.activePanel ? 'active' : 'hidden'}`;
        sidePanelWrapper.dataset.panel = panel.id;

        const sidePanelContent = document.createElement('div');
        sidePanelContent.className = 'panel-content';
        sidePanelContent.id = `panel-${panel.id}`;

        sidePanelWrapper.appendChild(sidePanelContent);
        sidePanelsContainer.appendChild(sidePanelWrapper);
      });

      sidePanel.appendChild(tabs);
      sidePanel.appendChild(sidePanelsContainer);

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'inspector-resize-handle';
      resizeHandle.id = 'inspector-resize-handle';

      layout.appendChild(mainPanel);
      layout.appendChild(sidePanel);
      layout.appendChild(resizeHandle);

      container.appendChild(layout);

      this.setupSplitPanelResizing();
    }

    setupSplitPanelResizing() {
      const handle = document.getElementById('inspector-resize-handle');
      if (!handle) return;

      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      const startResize = (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = this.responsiveInspector.container.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      };

      const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.emit('inspector-resized');
      };

      const resize = (e) => {
        if (!isResizing) return;

        const width = startWidth - (e.clientX - startX);
        const minWidth = 400;
        const maxWidth = 1200;

        if (width >= minWidth && width <= maxWidth) {
          this.responsiveInspector.container.style.width = `${width}px`;
        }
      };

      handle.addEventListener('mousedown', startResize);
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
    }

    switchInspectorPanel(panelId) {
      const inspector = this.responsiveInspector;
      if (!inspector.panels.has(panelId)) return;

      inspector.activePanel = panelId;
      this.emit('inspector-panel-switched', { panelId, layout: inspector.layout });

      // Update UI based on current layout
      if (inspector.layout === 'single' || inspector.layout === 'tabs') {
        this.updateTabbedInterface(panelId);
      } else if (inspector.layout === 'split') {
        this.updateSplitInterface(panelId);
      }
    }

    updateTabbedInterface(panelId) {
      // Update tab states
      const container = this.responsiveInspector.container;
      if (!container) return;

      container.querySelectorAll('.inspector-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.panel === panelId);
      });

      container.querySelectorAll('.inspector-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === panelId);
        panel.classList.toggle('hidden', panel.dataset.panel !== panelId);
      });
    }

    updateSplitInterface(panelId) {
      // Update split panel states
      const container = this.responsiveInspector.container;
      if (!container) return;

      container.querySelectorAll('.side-tab, .side-panel').forEach(el => {
        el.classList.toggle('active', el.dataset.panel === panelId);
        if (el.classList.contains('side-panel')) {
          el.classList.toggle('hidden', el.dataset.panel !== panelId);
        }
      });
    }

    // Initialize responsive inspector
    initializeResponsiveInspector(container) {
      if (!container) {
        console.error('Inspector container required');
        return;
      }

      this.responsiveInspector = this.createResponsiveInspector();
      this.responsiveInspector.container = container;

      // Set up responsive breakpoints
      this.updateResponsiveLayout();
      window.addEventListener('resize', () => {
        this.updateResponsiveLayout();
      });

      this.emit('responsive-inspector-ready', {
        inspector: this.responsiveInspector,
        layout: this.responsiveInspector.layout
      });
    }

    watchSystemPreference() {
      if (global.matchMedia) {
        const mediaQuery = global.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
          this.systemPreference = e.matches ? 'dark' : 'light';
          if (this.currentTheme === 'auto') {
            this.setTheme(this.systemPreference);
          }
        });
      }
    }

    getAvailableThemes() {
      return Array.from(this.themes.keys());
    }

    getCurrentTheme() {
      return this.currentTheme;
    }
  }

  class LayoutManager {
    constructor() {
      this.layouts = new Map();
      this.currentLayout = 'default';
      this.breakpoints = {
        mobile: 768,
        tablet: 1024,
        desktop: 1200,
        wide: 1600
      };
      this.initializeLayouts();
    }

    initializeLayouts() {
      this.layouts.set('default', {
        name: 'Default',
        sidePanelWidth: '300px',
        timelineHeight: '60%',
        inspectorWidth: '280px',
        showAllPanels: true
      });

      this.layouts.set('compact', {
        name: 'Compact',
        sidePanelWidth: '250px',
        timelineHeight: '70%',
        inspectorWidth: '220px',
        showAllPanels: true
      });

      this.layouts.set('minimal', {
        name: 'Minimal',
        sidePanelWidth: '200px',
        timelineHeight: '80%',
        inspectorWidth: '180px',
        showAllPanels: false
      });

      this.layouts.set('mobile', {
        name: 'Mobile',
        sidePanelWidth: '100%',
        timelineHeight: '50%',
        inspectorWidth: '100%',
        showAllPanels: false,
        stackVertical: true
      });
    }

    setLayout(layoutName) {
      const layout = this.layouts.get(layoutName);
      if (!layout) {
        console.error(`Layout '${layoutName}' not found`);
        return false;
      }

      this.applyLayout(layout);
      this.currentLayout = layoutName;

      global.dispatchEvent(new CustomEvent('layout-changed', {
        detail: { layout: layoutName }
      }));

      return true;
    }

    applyLayout(layout) {
      const root = document.documentElement;

      root.style.setProperty('--side-panel-width', layout.sidePanelWidth);
      root.style.setProperty('--timeline-height', layout.timelineHeight);
      root.style.setProperty('--inspector-width', layout.inspectorWidth);

      document.body.setAttribute('data-layout', this.currentLayout);
      document.body.classList.toggle('stack-vertical', layout.stackVertical || false);
      document.body.classList.toggle('minimal-ui', !layout.showAllPanels);
    }

    getResponsiveLayout() {
      const width = global.innerWidth || 1200;

      if (width < this.breakpoints.mobile) {
        return 'mobile';
      } else if (width < this.breakpoints.tablet) {
        return 'compact';
      } else {
        return 'default';
      }
    }

    enableResponsiveLayout() {
      const updateLayout = () => {
        const newLayout = this.getResponsiveLayout();
        if (newLayout !== this.currentLayout) {
          this.setLayout(newLayout);
        }
      };

      global.addEventListener('resize', updateLayout);
      updateLayout(); // Apply initial layout
    }

    getCurrentLayout() {
      return this.currentLayout;
    }

    getAvailableLayouts() {
      return Array.from(this.layouts.keys());
    }
  }

  class AccessibilityManager {
    constructor() {
      this.features = {
        highContrast: false,
        largeText: false,
        reducedMotion: false,
        focusVisible: true,
        screenReader: this.detectScreenReader()
      };

      this.initializeA11y();
    }

    initializeA11y() {
      // Add focus visible polyfill
      this.addFocusVisibleSupport();

      // Monitor system preferences
      this.watchSystemPreferences();

      // Add keyboard navigation
      this.addKeyboardNavigation();

      // Add ARIA live regions
      this.addLiveRegions();
    }

    addFocusVisibleSupport() {
      if (!CSS.supports('selector(:focus-visible)')) {
        // Polyfill for older browsers
        let hadKeyboardEvent = true;

        const keyboardThrottledEventListener = (e) => {
          if (e.type === 'keydown' && e.metaKey || e.altKey || e.ctrlKey) {
            return;
          }
          hadKeyboardEvent = true;
        };

        const pointerEventListener = () => {
          hadKeyboardEvent = false;
        };

        document.addEventListener('keydown', keyboardThrottledEventListener, true);
        document.addEventListener('mousedown', pointerEventListener, true);
        document.addEventListener('pointerdown', pointerEventListener, true);
        document.addEventListener('touchstart', pointerEventListener, true);

        document.addEventListener('focus', (e) => {
          if (hadKeyboardEvent || e.target.matches(':focus-visible')) {
            e.target.classList.add('focus-visible');
          }
        }, true);

        document.addEventListener('blur', (e) => {
          e.target.classList.remove('focus-visible');
        }, true);
      }
    }

    watchSystemPreferences() {
      // High contrast
      if (global.matchMedia) {
        const highContrastQuery = global.matchMedia('(prefers-contrast: high)');
        this.features.highContrast = highContrastQuery.matches;

        highContrastQuery.addEventListener('change', (e) => {
          this.features.highContrast = e.matches;
          this.applyHighContrast(e.matches);
        });

        // Reduced motion
        const reducedMotionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
        this.features.reducedMotion = reducedMotionQuery.matches;

        reducedMotionQuery.addEventListener('change', (e) => {
          this.features.reducedMotion = e.matches;
          this.applyReducedMotion(e.matches);
        });
      }
    }

    applyHighContrast(enabled) {
      document.body.classList.toggle('high-contrast', enabled);
      if (enabled && global.ThemeManager) {
        global.ThemeManager.setTheme('high-contrast');
      }
    }

    applyReducedMotion(enabled) {
      document.body.classList.toggle('reduced-motion', enabled);

      if (enabled) {
        const style = document.createElement('style');
        style.id = 'reduced-motion-style';
        style.textContent = `
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        `;
        document.head.appendChild(style);
      } else {
        const existingStyle = document.getElementById('reduced-motion-style');
        if (existingStyle) {
          existingStyle.remove();
        }
      }
    }

    addKeyboardNavigation() {
      // Tab trap for modals
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          const modal = document.querySelector('.modal:not([hidden])');
          if (modal) {
            this.trapFocus(modal, e);
          }
        }
      });

      // Escape key handling
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const modal = document.querySelector('.modal:not([hidden])');
          if (modal) {
            this.closeModal(modal);
          }
        }
      });
    }

    trapFocus(container, event) {
      const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          event.preventDefault();
        }
      }
    }

    addLiveRegions() {
      // Add status region for announcements
      const statusRegion = document.createElement('div');
      statusRegion.id = 'status-region';
      statusRegion.setAttribute('aria-live', 'polite');
      statusRegion.setAttribute('aria-atomic', 'true');
      statusRegion.style.cssText = `
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      `;
      document.body.appendChild(statusRegion);

      // Add alert region for urgent announcements
      const alertRegion = document.createElement('div');
      alertRegion.id = 'alert-region';
      alertRegion.setAttribute('aria-live', 'assertive');
      alertRegion.setAttribute('aria-atomic', 'true');
      alertRegion.style.cssText = statusRegion.style.cssText;
      document.body.appendChild(alertRegion);
    }

    announce(message, priority = 'polite') {
      const regionId = priority === 'assertive' ? 'alert-region' : 'status-region';
      const region = document.getElementById(regionId);

      if (region) {
        region.textContent = message;

        // Clear after announcement
        setTimeout(() => {
          region.textContent = '';
        }, 1000);
      }
    }

    detectScreenReader() {
      // Simple screen reader detection
      return navigator.userAgent.includes('NVDA') ||
             navigator.userAgent.includes('JAWS') ||
             navigator.userAgent.includes('VoiceOver') ||
             global.speechSynthesis !== undefined;
    }

    toggleFeature(feature, enabled) {
      if (feature in this.features) {
        this.features[feature] = enabled;

        switch (feature) {
          case 'highContrast':
            this.applyHighContrast(enabled);
            break;
          case 'reducedMotion':
            this.applyReducedMotion(enabled);
            break;
          case 'largeText':
            document.body.classList.toggle('large-text', enabled);
            break;
        }

        global.dispatchEvent(new CustomEvent('a11y-feature-changed', {
          detail: { feature, enabled }
        }));
      }
    }

    getFeatures() {
      return { ...this.features };
    }
  }

  // Main UI Manager
  class UIManager {
    constructor() {
      this.themeManager = new ThemeManager();
      this.layoutManager = new LayoutManager();
      this.accessibilityManager = new AccessibilityManager();
      this.initialized = false;
    }

    async initialize() {
      if (this.initialized) return;

      // Initialize theme
      this.themeManager.watchSystemPreference();
      this.themeManager.setTheme('dark'); // Default theme

      // Initialize responsive layout
      this.layoutManager.enableResponsiveLayout();

      // Set up UI event handlers
      this.setupEventHandlers();

      this.initialized = true;
      console.log('UI Manager initialized');

      global.dispatchEvent(new CustomEvent('ui-manager-ready'));
    }

    setupEventHandlers() {
      // Handle settings changes
      if (global.SettingsManager) {
        global.SettingsManager.watch('general.theme', (theme) => {
          if (theme === 'auto') {
            this.themeManager.setTheme(this.themeManager.systemPreference);
          } else {
            this.themeManager.setTheme(theme);
          }
        });

        global.SettingsManager.watch('ui.compactMode', (compact) => {
          this.layoutManager.setLayout(compact ? 'compact' : 'default');
        });
      }

      // Handle viewport changes
      global.addEventListener('resize', () => {
        this.handleViewportChange();
      });

      // Handle orientation changes
      global.addEventListener('orientationchange', () => {
        setTimeout(() => this.handleViewportChange(), 500);
      });
    }

    handleViewportChange() {
      // Dispatch viewport change event with details
      const viewport = {
        width: global.innerWidth,
        height: global.innerHeight,
        isMobile: global.innerWidth < 768,
        isTablet: global.innerWidth >= 768 && global.innerWidth < 1024,
        isDesktop: global.innerWidth >= 1024
      };

      global.dispatchEvent(new CustomEvent('viewport-changed', {
        detail: viewport
      }));
    }

    // Public API
    setTheme(theme) {
      return this.themeManager.setTheme(theme);
    }

    setLayout(layout) {
      return this.layoutManager.setLayout(layout);
    }

    announce(message, priority = 'polite') {
      this.accessibilityManager.announce(message, priority);
    }

    toggleA11yFeature(feature, enabled) {
      this.accessibilityManager.toggleFeature(feature, enabled);
    }

    getStatus() {
      return {
        theme: this.themeManager.getCurrentTheme(),
        layout: this.layoutManager.getCurrentLayout(),
        accessibility: this.accessibilityManager.getFeatures(),
        viewport: {
          width: global.innerWidth,
          height: global.innerHeight
        }
      };
    }
  }

  // Export UI Manager
  const uiManager = new UIManager();
  global.UIManager = uiManager;

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      uiManager.initialize();
    });
  } else {
    uiManager.initialize();
  }

})(typeof window !== 'undefined' ? window : globalThis);