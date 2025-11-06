/**
 * Theme and Customization System
 * Comprehensive theming, layout customization, and settings management
 */

(function initializeThemeSystem(global) {
  'use strict';

  const React = global.React;
  const { useState, useEffect, useCallback, useMemo } = React;

  // Theme definitions
  const THEME_DEFINITIONS = {
    light: {
      name: 'Light',
      colors: {
        primary: '#3b82f6',
        secondary: '#64748b',
        background: '#ffffff',
        surface: '#f8fafc',
        text: '#0f172a',
        textSecondary: '#64748b',
        border: '#e2e8f0',
        hover: '#f1f5f9',
        active: '#e2e8f0',
        error: '#ef4444',
        success: '#10b981',
        warning: '#f59e0b'
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem'
      },
      borderRadius: {
        none: '0',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }
    },

    dark: {
      name: 'Dark',
      colors: {
        primary: '#60a5fa',
        secondary: '#94a3b8',
        background: '#0f172a',
        surface: '#1e293b',
        text: '#f8fafc',
        textSecondary: '#cbd5e1',
        border: '#334155',
        hover: '#334155',
        active: '#475569',
        error: '#f87171',
        success: '#34d399',
        warning: '#fbbf24'
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem'
      },
      borderRadius: {
        none: '0',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.5)'
      }
    },

    blue: {
      name: 'Blue',
      colors: {
        primary: '#2563eb',
        secondary: '#1e40af',
        background: '#ffffff',
        surface: '#f0f9ff',
        text: '#0c4a6e',
        textSecondary: '#0369a1',
        border: '#bae6fd',
        hover: '#e0f2fe',
        active: '#bae6fd',
        error: '#dc2626',
        success: '#059669',
        warning: '#d97706'
      }
    },

    purple: {
      name: 'Purple',
      colors: {
        primary: '#7c3aed',
        secondary: '#6d28d9',
        background: '#ffffff',
        surface: '#faf5ff',
        text: '#581c87',
        textSecondary: '#7c2d92',
        border: '#e9d5ff',
        hover: '#f3e8ff',
        active: '#e9d5ff',
        error: '#dc2626',
        success: '#059669',
        warning: '#d97706'
      }
    },

    green: {
      name: 'Green',
      colors: {
        primary: '#059669',
        secondary: '#047857',
        background: '#ffffff',
        surface: '#f0fdf4',
        text: '#14532d',
        textSecondary: '#166534',
        border: '#bbf7d0',
        hover: '#dcfce7',
        active: '#bbf7d0',
        error: '#dc2626',
        success: '#059669',
        warning: '#d97706'
      }
    }
  };

  // Layout presets
  const LAYOUT_PRESETS = {
    default: {
      name: 'Default',
      panels: {
        timeline: { visible: true, position: 'bottom', size: 300 },
        properties: { visible: true, position: 'right', size: 300 },
        media: { visible: true, position: 'left', size: 250 },
        preview: { visible: true, position: 'center' },
        toolbar: { visible: true, position: 'top', size: 50 }
      }
    },

    compact: {
      name: 'Compact',
      panels: {
        timeline: { visible: true, position: 'bottom', size: 250 },
        properties: { visible: false, position: 'right', size: 300 },
        media: { visible: true, position: 'left', size: 200 },
        preview: { visible: true, position: 'center' },
        toolbar: { visible: true, position: 'top', size: 40 }
      }
    },

    minimal: {
      name: 'Minimal',
      panels: {
        timeline: { visible: true, position: 'bottom', size: 200 },
        properties: { visible: false, position: 'right', size: 300 },
        media: { visible: false, position: 'left', size: 250 },
        preview: { visible: true, position: 'center' },
        toolbar: { visible: true, position: 'top', size: 40 }
      }
    },

    fullscreen: {
      name: 'Fullscreen Preview',
      panels: {
        timeline: { visible: false, position: 'bottom', size: 300 },
        properties: { visible: false, position: 'right', size: 300 },
        media: { visible: false, position: 'left', size: 250 },
        preview: { visible: true, position: 'center' },
        toolbar: { visible: false, position: 'top', size: 50 }
      }
    }
  };

  // Settings categories
  const SETTING_CATEGORIES = {
    APPEARANCE: 'appearance',
    EDITOR: 'editor',
    TIMELINE: 'timeline',
    PLAYBACK: 'playback',
    EXPORT: 'export',
    PERFORMANCE: 'performance',
    ACCESSIBILITY: 'accessibility',
    SHORTCUTS: 'shortcuts'
  };

  // Theme Manager
  class ThemeManager {
    constructor() {
      this.currentTheme = 'dark';
      this.customThemes = new Map();
      this.listeners = new Set();
      this.loadSettings();
    }

    setTheme(themeName) {
      if (this.customThemes.has(themeName)) {
        this.currentTheme = themeName;
      } else if (THEME_DEFINITIONS[themeName]) {
        this.currentTheme = themeName;
      } else {
        console.warn(`Theme '${themeName}' not found`);
        return;
      }

      this.applyTheme();
      this.saveSettings();
      this.notifyListeners();
    }

    getTheme() {
      return this.customThemes.get(this.currentTheme) || THEME_DEFINITIONS[this.currentTheme];
    }

    getAvailableThemes() {
      const themes = { ...THEME_DEFINITIONS };
      for (const [name, theme] of this.customThemes) {
        themes[name] = theme;
      }
      return themes;
    }

    createCustomTheme(name, baseTheme, modifications) {
      const base = THEME_DEFINITIONS[baseTheme] || this.customThemes.get(baseTheme);
      if (!base) {
        throw new Error(`Base theme '${baseTheme}' not found`);
      }

      const customTheme = JSON.parse(JSON.stringify(base));
      customTheme.name = name;
      customTheme.custom = true;

      // Apply modifications
      this.applyModifications(customTheme, modifications);

      this.customThemes.set(name, customTheme);
      this.saveSettings();
      return name;
    }

    applyModifications(theme, modifications) {
      if (modifications.colors) {
        Object.assign(theme.colors, modifications.colors);
      }
      if (modifications.spacing) {
        Object.assign(theme.spacing, modifications.spacing);
      }
      if (modifications.borderRadius) {
        Object.assign(theme.borderRadius, modifications.borderRadius);
      }
      if (modifications.shadows) {
        Object.assign(theme.shadows, modifications.shadows);
      }
    }

    applyTheme() {
      const theme = this.getTheme();
      if (!theme) return;

      const root = document.documentElement;

      // Apply CSS custom properties
      Object.entries(theme.colors).forEach(([key, value]) => {
        root.style.setProperty(`--color-${key}`, value);
      });

      Object.entries(theme.spacing).forEach(([key, value]) => {
        root.style.setProperty(`--spacing-${key}`, value);
      });

      Object.entries(theme.borderRadius).forEach(([key, value]) => {
        root.style.setProperty(`--radius-${key}`, value);
      });

      Object.entries(theme.shadows).forEach(([key, value]) => {
        root.style.setProperty(`--shadow-${key}`, value.replace(/, /g, ','));
      });

      // Update meta theme-color
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme.colors.primary);
      }
    }

    loadSettings() {
      try {
        const settings = localStorage.getItem('artone-theme-settings');
        if (settings) {
          const data = JSON.parse(settings);
          this.currentTheme = data.currentTheme || 'dark';
          this.customThemes = new Map(data.customThemes || []);
        }
      } catch (error) {
        console.warn('Failed to load theme settings:', error);
      }
    }

    saveSettings() {
      try {
        const data = {
          currentTheme: this.currentTheme,
          customThemes: Array.from(this.customThemes.entries())
        };
        localStorage.setItem('artone-theme-settings', JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save theme settings:', error);
      }
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyListeners() {
      this.listeners.forEach(listener => {
        try {
          listener(this.currentTheme, this.getTheme());
        } catch (error) {
          console.error('Theme listener error:', error);
        }
      });
    }
  }

  // Layout Manager
  class LayoutManager {
    constructor() {
      this.currentLayout = 'default';
      this.customLayouts = new Map();
      this.panelStates = new Map();
      this.listeners = new Set();
      this.loadSettings();
    }

    setLayout(layoutName) {
      if (this.customLayouts.has(layoutName)) {
        this.currentLayout = layoutName;
      } else if (LAYOUT_PRESETS[layoutName]) {
        this.currentLayout = layoutName;
      } else {
        console.warn(`Layout '${layoutName}' not found`);
        return;
      }

      this.applyLayout();
      this.saveSettings();
      this.notifyListeners();
    }

    getLayout() {
      return this.customLayouts.get(this.currentLayout) || LAYOUT_PRESETS[this.currentLayout];
    }

    getAvailableLayouts() {
      const layouts = { ...LAYOUT_PRESETS };
      for (const [name, layout] of this.customLayouts) {
        layouts[name] = layout;
      }
      return layouts;
    }

    createCustomLayout(name, baseLayout, modifications) {
      const base = LAYOUT_PRESETS[baseLayout] || this.customLayouts.get(baseLayout);
      if (!base) {
        throw new Error(`Base layout '${baseLayout}' not found`);
      }

      const customLayout = JSON.parse(JSON.stringify(base));
      customLayout.name = name;
      customLayout.custom = true;

      // Apply modifications
      if (modifications.panels) {
        Object.assign(customLayout.panels, modifications.panels);
      }

      this.customLayouts.set(name, customLayout);
      this.saveSettings();
      return name;
    }

    updatePanelState(panelId, state) {
      this.panelStates.set(panelId, state);
      this.applyLayout();
      this.saveSettings();
      this.notifyListeners();
    }

    getPanelState(panelId) {
      const layout = this.getLayout();
      const panelConfig = layout.panels[panelId];
      const customState = this.panelStates.get(panelId);

      return { ...panelConfig, ...customState };
    }

    applyLayout() {
      const layout = this.getLayout();
      if (!layout) return;

      // Apply layout via CSS custom properties or direct DOM manipulation
      // This would integrate with the main UI system
      console.log('Applying layout:', layout.name);

      // Emit layout change event
      if (global.CustomEvent) {
        window.dispatchEvent(new CustomEvent('layout-changed', {
          detail: { layout: layout, layoutName: this.currentLayout }
        }));
      }
    }

    loadSettings() {
      try {
        const settings = localStorage.getItem('artone-layout-settings');
        if (settings) {
          const data = JSON.parse(settings);
          this.currentLayout = data.currentLayout || 'default';
          this.customLayouts = new Map(data.customLayouts || []);
          this.panelStates = new Map(data.panelStates || []);
        }
      } catch (error) {
        console.warn('Failed to load layout settings:', error);
      }
    }

    saveSettings() {
      try {
        const data = {
          currentLayout: this.currentLayout,
          customLayouts: Array.from(this.customLayouts.entries()),
          panelStates: Array.from(this.panelStates.entries())
        };
        localStorage.setItem('artone-layout-settings', JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save layout settings:', error);
      }
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyListeners() {
      this.listeners.forEach(listener => {
        try {
          listener(this.currentLayout, this.getLayout());
        } catch (error) {
          console.error('Layout listener error:', error);
        }
      });
    }
  }

  // Settings Manager
  class SettingsManager {
    constructor() {
      this.settings = new Map();
      this.listeners = new Set();
      this.categories = SETTING_CATEGORIES;
      this.loadSettings();
    }

    set(category, key, value) {
      if (!this.settings.has(category)) {
        this.settings.set(category, new Map());
      }

      const categorySettings = this.settings.get(category);
      const oldValue = categorySettings.get(key);
      categorySettings.set(key, value);

      this.saveSettings();
      this.notifyListeners(category, key, value, oldValue);
    }

    get(category, key, defaultValue = null) {
      const categorySettings = this.settings.get(category);
      return categorySettings ? categorySettings.get(key) : defaultValue;
    }

    getCategory(category) {
      return Object.fromEntries(this.settings.get(category) || new Map());
    }

    getAllSettings() {
      const allSettings = {};
      for (const [category, settings] of this.settings) {
        allSettings[category] = Object.fromEntries(settings);
      }
      return allSettings;
    }

    resetCategory(category) {
      this.settings.delete(category);
      this.saveSettings();
      this.notifyListeners(category, null, null, null, 'reset');
    }

    resetAll() {
      this.settings.clear();
      this.saveSettings();
      this.notifyListeners(null, null, null, null, 'reset_all');
    }

    exportSettings() {
      return JSON.stringify(this.getAllSettings(), null, 2);
    }

    importSettings(jsonString) {
      try {
        const imported = JSON.parse(jsonString);

        for (const [category, settings] of Object.entries(imported)) {
          if (!this.settings.has(category)) {
            this.settings.set(category, new Map());
          }

          const categorySettings = this.settings.get(category);
          for (const [key, value] of Object.entries(settings)) {
            categorySettings.set(key, value);
          }
        }

        this.saveSettings();
        this.notifyListeners(null, null, null, null, 'imported');
        return true;
      } catch (error) {
        console.error('Failed to import settings:', error);
        return false;
      }
    }

    loadSettings() {
      try {
        const stored = localStorage.getItem('artone-settings');
        if (stored) {
          const data = JSON.parse(stored);
          for (const [category, settings] of Object.entries(data)) {
            const categoryMap = new Map();
            for (const [key, value] of Object.entries(settings)) {
              categoryMap.set(key, value);
            }
            this.settings.set(category, categoryMap);
          }
        }
      } catch (error) {
        console.warn('Failed to load settings:', error);
      }
    }

    saveSettings() {
      try {
        const data = this.getAllSettings();
        localStorage.setItem('artone-settings', JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save settings:', error);
      }
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyListeners(category, key, newValue, oldValue, action = 'changed') {
      this.listeners.forEach(listener => {
        try {
          listener({ category, key, newValue, oldValue, action });
        } catch (error) {
          console.error('Settings listener error:', error);
        }
      });
    }
  }

  // Preset Manager
  class PresetManager {
    constructor() {
      this.presets = new Map();
      this.loadPresets();
    }

    createPreset(name, type, data) {
      const preset = {
        id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        type,
        data,
        createdAt: new Date(),
        modifiedAt: new Date()
      };

      if (!this.presets.has(type)) {
        this.presets.set(type, new Map());
      }

      this.presets.get(type).set(preset.id, preset);
      this.savePresets();
      return preset.id;
    }

    getPreset(type, id) {
      const typePresets = this.presets.get(type);
      return typePresets ? typePresets.get(id) : null;
    }

    getPresetsByType(type) {
      const typePresets = this.presets.get(type);
      return typePresets ? Array.from(typePresets.values()) : [];
    }

    updatePreset(type, id, updates) {
      const preset = this.getPreset(type, id);
      if (preset) {
        Object.assign(preset, updates);
        preset.modifiedAt = new Date();
        this.savePresets();
      }
    }

    deletePreset(type, id) {
      const typePresets = this.presets.get(type);
      if (typePresets && typePresets.delete(id)) {
        this.savePresets();
        return true;
      }
      return false;
    }

    applyPreset(type, id) {
      const preset = this.getPreset(type, id);
      if (!preset) return false;

      // Apply preset based on type
      switch (type) {
        case 'theme':
          global.ThemeManager.setTheme(preset.data.themeName);
          break;
        case 'layout':
          global.LayoutManager.setLayout(preset.data.layoutName);
          break;
        case 'settings':
          for (const [category, settings] of Object.entries(preset.data)) {
            for (const [key, value] of Object.entries(settings)) {
              global.SettingsManager.set(category, key, value);
            }
          }
          break;
        default:
          console.warn(`Unknown preset type: ${type}`);
          return false;
      }

      return true;
    }

    exportPreset(type, id) {
      const preset = this.getPreset(type, id);
      return preset ? JSON.stringify(preset, null, 2) : null;
    }

    importPreset(jsonString) {
      try {
        const preset = JSON.parse(jsonString);
        preset.id = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        preset.createdAt = new Date(preset.createdAt);
        preset.modifiedAt = new Date();

        if (!this.presets.has(preset.type)) {
          this.presets.set(preset.type, new Map());
        }

        this.presets.get(preset.type).set(preset.id, preset);
        this.savePresets();
        return preset.id;
      } catch (error) {
        console.error('Failed to import preset:', error);
        return null;
      }
    }

    loadPresets() {
      try {
        const stored = localStorage.getItem('artone-presets');
        if (stored) {
          const data = JSON.parse(stored);
          for (const [type, presets] of Object.entries(data)) {
            const typeMap = new Map();
            for (const [id, preset] of Object.entries(presets)) {
              typeMap.set(id, preset);
            }
            this.presets.set(type, typeMap);
          }
        }
      } catch (error) {
        console.warn('Failed to load presets:', error);
      }
    }

    savePresets() {
      try {
        const data = {};
        for (const [type, presets] of this.presets) {
          data[type] = Object.fromEntries(presets);
        }
        localStorage.setItem('artone-presets', JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save presets:', error);
      }
    }
  }

  // React Components for Customization UI
  function ThemeSelector({ onThemeChange }) {
    const [currentTheme, setCurrentTheme] = useState(global.ThemeManager.currentTheme);
    const [customThemes, setCustomThemes] = useState([]);

    useEffect(() => {
      const unsubscribe = global.ThemeManager.subscribe((themeName, theme) => {
        setCurrentTheme(themeName);
      });

      // Load custom themes
      setCustomThemes(Object.keys(global.ThemeManager.customThemes));

      return unsubscribe;
    }, []);

    const themes = global.ThemeManager.getAvailableThemes();

    return React.createElement('div', { className: 'theme-selector' }, [
      React.createElement('h3', { key: 'title' }, 'Themes'),
      React.createElement('div', {
        key: 'themes',
        className: 'theme-grid'
      }, Object.entries(themes).map(([name, theme]) =>
        React.createElement('div', {
          key: name,
          className: `theme-option ${currentTheme === name ? 'active' : ''}`,
          onClick: () => {
            global.ThemeManager.setTheme(name);
            onThemeChange && onThemeChange(name);
          }
        }, [
          React.createElement('div', {
            key: 'preview',
            className: 'theme-preview',
            style: {
              backgroundColor: theme.colors.background,
              color: theme.colors.text
            }
          }, [
            React.createElement('div', {
              key: 'surface',
              className: 'preview-surface',
              style: { backgroundColor: theme.colors.surface }
            }),
            React.createElement('div', {
              key: 'primary',
              className: 'preview-primary',
              style: { backgroundColor: theme.colors.primary }
            })
          ]),
          React.createElement('span', { key: 'name' }, theme.name)
        ])
      ))
    ]);
  }

  function LayoutSelector({ onLayoutChange }) {
    const [currentLayout, setCurrentLayout] = useState(global.LayoutManager.currentLayout);

    useEffect(() => {
      const unsubscribe = global.LayoutManager.subscribe((layoutName, layout) => {
        setCurrentLayout(layoutName);
      });

      return unsubscribe;
    }, []);

    const layouts = global.LayoutManager.getAvailableLayouts();

    return React.createElement('div', { className: 'layout-selector' }, [
      React.createElement('h3', { key: 'title' }, 'Layouts'),
      React.createElement('div', {
        key: 'layouts',
        className: 'layout-grid'
      }, Object.entries(layouts).map(([name, layout]) =>
        React.createElement('div', {
          key: name,
          className: `layout-option ${currentLayout === name ? 'active' : ''}`,
          onClick: () => {
            global.LayoutManager.setLayout(name);
            onLayoutChange && onLayoutChange(name);
          }
        }, [
          React.createElement('div', {
            key: 'preview',
            className: 'layout-preview'
          }, [
            // Simple layout preview
            React.createElement('div', { key: 'toolbar', className: 'preview-toolbar' }),
            React.createElement('div', { key: 'main', className: 'preview-main' }, [
              React.createElement('div', { key: 'sidebar', className: 'preview-sidebar' }),
              React.createElement('div', { key: 'content', className: 'preview-content' }),
              React.createElement('div', { key: 'properties', className: 'preview-properties' })
            ]),
            React.createElement('div', { key: 'timeline', className: 'preview-timeline' })
          ]),
          React.createElement('span', { key: 'name' }, layout.name)
        ])
      ))
    ]);
  }

  function SettingsPanel({ category }) {
    const [settings, setSettings] = useState({});

    useEffect(() => {
      setSettings(global.SettingsManager.getCategory(category));

      const unsubscribe = global.SettingsManager.subscribe((change) => {
        if (change.category === category || change.action === 'reset') {
          setSettings(global.SettingsManager.getCategory(category));
        }
      });

      return unsubscribe;
    }, [category]);

    const updateSetting = useCallback((key, value) => {
      global.SettingsManager.set(category, key, value);
    }, [category]);

    // Render settings based on category
    return React.createElement('div', { className: 'settings-panel' }, [
      React.createElement('h3', { key: 'title' }, `${category.charAt(0).toUpperCase() + category.slice(1)} Settings`),
      React.createElement('div', { key: 'settings' },
        Object.entries(settings).map(([key, value]) =>
          React.createElement('div', { key: key, className: 'setting-item' }, [
            React.createElement('label', { key: 'label' }, key),
            React.createElement('input', {
              key: 'input',
              type: 'text',
              value: value || '',
              onChange: (e) => updateSetting(key, e.target.value)
            })
          ])
        )
      )
    ]);
  }

  // Global instances
  const themeManager = new ThemeManager();
  const layoutManager = new LayoutManager();
  const settingsManager = new SettingsManager();
  const presetManager = new PresetManager();

  // Initialize theme
  themeManager.applyTheme();

  // Export everything
  global.ThemeManager = themeManager;
  global.LayoutManager = layoutManager;
  global.SettingsManager = settingsManager;
  global.PresetManager = presetManager;

  // React components
  global.ThemeSelector = ThemeSelector;
  global.LayoutSelector = LayoutSelector;
  global.SettingsPanel = SettingsPanel;

  // Constants
  global.THEME_DEFINITIONS = THEME_DEFINITIONS;
  global.LAYOUT_PRESETS = LAYOUT_PRESETS;
  global.SETTING_CATEGORIES = SETTING_CATEGORIES;

})(typeof window !== 'undefined' ? window : globalThis);
