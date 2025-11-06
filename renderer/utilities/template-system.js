'use strict';

(function registerTemplateSystem(global) {
  // Advanced template management system for Artone

  function setHTMLSafe(element, html) {
    if (!element) return;

    const sanitizer = global.domSanitizer;
    const normalized = typeof html === 'string' ? html : String(html ?? '');

    if (sanitizer) {
      if (typeof sanitizer.setInnerHTMLSafe === 'function') {
        sanitizer.setInnerHTMLSafe(element, normalized);
        return;
      }

      if (typeof sanitizer.sanitizeHTML === 'function') {
        element.innerHTML = sanitizer.sanitizeHTML(normalized);
        return;
      }
    }

    element.textContent = normalized;
  }

  function clearHTML(element) {
    setHTMLSafe(element, '');
  }
  const TEMPLATE_CATEGORIES = {
    'project': 'Project Templates',
    'sequence': 'Sequence Templates',
    'title': 'Title Templates',
    'transition': 'Transition Templates',
    'effect': 'Effect Templates',
    'color': 'Color Templates',
    'audio': 'Audio Templates'
  };

  const DEFAULT_TEMPLATES = {
    'basic-project': {
      name: 'Basic Video Project',
      description: 'Simple project with one video track and one audio track',
      category: 'project',
      version: '1.0.0',
      metadata: {
        duration: 60,
        resolution: { width: 1920, height: 1080 },
        framerate: 30,
        colorSpace: 'rec709'
      },
      data: {
        tracks: [
          { id: 'video-1', name: 'Video', type: 'video', height: 60 },
          { id: 'audio-1', name: 'Audio', type: 'audio', height: 40 }
        ],
        settings: {
          timeline: { zoom: 1, snapToGrid: true },
          export: { format: 'mp4', quality: 'hd-720p' }
        }
      }
    },
    'social-media': {
      name: 'Social Media Post',
      description: 'Optimized for Instagram, TikTok, and other social platforms',
      category: 'project',
      version: '1.0.0',
      metadata: {
        duration: 30,
        resolution: { width: 1080, height: 1080 },
        framerate: 30,
        aspectRatio: '1:1'
      },
      data: {
        tracks: [
          { id: 'video-1', name: 'Main Video', type: 'video', height: 80 },
          { id: 'audio-1', name: 'Background Music', type: 'audio', height: 40 },
          { id: 'text-1', name: 'Captions', type: 'text', height: 30 }
        ],
        settings: {
          timeline: { zoom: 2, snapToGrid: false },
          export: { format: 'mp4', quality: 'social-media' }
        }
      }
    },
    'youtube-video': {
      name: 'YouTube Video',
      description: 'Professional YouTube video with intro and end screens',
      category: 'project',
      version: '1.0.0',
      metadata: {
        duration: 600,
        resolution: { width: 1920, height: 1080 },
        framerate: 30,
        aspectRatio: '16:9'
      },
      data: {
        tracks: [
          { id: 'intro', name: 'Intro', type: 'video', height: 60 },
          { id: 'main-video', name: 'Main Content', type: 'video', height: 60 },
          { id: 'b-roll', name: 'B-Roll', type: 'video', height: 60 },
          { id: 'voiceover', name: 'Voice Over', type: 'audio', height: 40 },
          { id: 'music', name: 'Background Music', type: 'audio', height: 40 },
          { id: 'sfx', name: 'Sound Effects', type: 'audio', height: 40 },
          { id: 'text-1', name: 'Titles', type: 'text', height: 30 },
          { id: 'text-2', name: 'Lower Thirds', type: 'text', height: 30 }
        ],
        settings: {
          timeline: { zoom: 0.5, snapToGrid: true },
          export: { format: 'mp4', quality: 'full-hd-1080p' }
        }
      }
    },
    'podcast-episode': {
      name: 'Podcast Episode',
      description: 'Audio-focused project for podcast production',
      category: 'project',
      version: '1.0.0',
      metadata: {
        duration: 3600,
        resolution: { width: 1920, height: 1080 },
        framerate: 30,
        sampleRate: 44100
      },
      data: {
        tracks: [
          { id: 'host-1', name: 'Host 1', type: 'audio', height: 50 },
          { id: 'host-2', name: 'Host 2', type: 'audio', height: 50 },
          { id: 'guest', name: 'Guest', type: 'audio', height: 50 },
          { id: 'intro-music', name: 'Intro Music', type: 'audio', height: 40 },
          { id: 'outro-music', name: 'Outro Music', type: 'audio', height: 40 },
          { id: 'background', name: 'Background Audio', type: 'audio', height: 40 },
          { id: 'waveform', name: 'Waveform Visual', type: 'video', height: 60 }
        ],
        settings: {
          timeline: { zoom: 0.1, snapToGrid: true },
          export: { format: 'mp3', quality: 'high' }
        }
      }
    },
    'title-slide': {
      name: 'Title Slide',
      description: 'Elegant title slide with smooth animations',
      category: 'title',
      version: '1.0.0',
      metadata: {
        duration: 5,
        layerType: 'text-overlay'
      },
      data: {
        text: 'Your Title Here',
        style: {
          fontFamily: 'Arial',
          fontSize: 72,
          fontWeight: 'bold',
          color: '#ffffff',
          backgroundColor: '#000000',
          textAlign: 'center',
          textBaseline: 'middle'
        },
        animation: {
          type: 'fade-slide-up',
          duration: 3,
          easing: 'easeOutCubic'
        },
        effects: {
          dropShadow: { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' },
          glow: { color: '#ffffff', strength: 0.5 }
        }
      }
    },
    'lower-third': {
      name: 'Lower Third',
      description: 'Professional lower third graphic for names and titles',
      category: 'title',
      version: '1.0.0',
      metadata: {
        duration: 10,
        layerType: 'graphic-overlay'
      },
      data: {
        name: 'John Doe',
        title: 'Creative Director',
        style: {
          backgroundColor: '#00000080',
          borderRadius: 8,
          padding: '16px 24px'
        },
        textStyle: {
          name: {
            fontSize: 32,
            fontWeight: 'bold',
            color: '#ffffff'
          },
          title: {
            fontSize: 24,
            fontWeight: 'normal',
            color: '#cccccc'
          }
        },
        animation: {
          type: 'slide-in-left',
          duration: 0.8,
          easing: 'easeOutCubic'
        }
      }
    },
    'crossfade': {
      name: 'Crossfade Transition',
      description: 'Smooth crossfade between two clips',
      category: 'transition',
      version: '1.0.0',
      metadata: {
        duration: 1,
        transitionType: 'dissolve'
      },
      data: {
        type: 'crossfade',
        duration: 1,
        easing: 'easeInOutCubic',
        parameters: {
          opacityCurve: 'smooth'
        }
      }
    },
    'slide-transition': {
      name: 'Slide Transition',
      description: 'Directional slide transition effect',
      category: 'transition',
      version: '1.0.0',
      metadata: {
        duration: 0.8,
        transitionType: 'slide'
      },
      data: {
        type: 'slide',
        direction: 'left',
        duration: 0.8,
        easing: 'easeInOutCubic',
        parameters: {
          slideDistance: 100,
          blurAmount: 0
        }
      }
    },
    'blur-effect': {
      name: 'Gaussian Blur',
      description: 'Professional gaussian blur effect',
      category: 'effect',
      version: '1.0.0',
      metadata: {
        effectType: 'blur'
      },
      data: {
        type: 'gaussian-blur',
        radius: 5,
        quality: 'high',
        parameters: {
          kernelSize: 13,
          sigma: 2.6
        }
      }
    },
    'color-correction': {
      name: 'Color Correction',
      description: 'Basic color correction template',
      category: 'color',
      version: '1.0.0',
      metadata: {
        gradeType: 'correction'
      },
      data: {
        parameters: {
          temperature: 5600,
          tint: 0,
          exposure: 0,
          contrast: 1.1,
          saturation: 1.05,
          highlights: 0.05,
          shadows: 0.02
        },
        curves: {
          rgb: 'linear',
          red: 'linear',
          green: 'linear',
          blue: 'linear'
        }
      }
    },
    'vocal-cleanup': {
      name: 'Vocal Cleanup',
      description: 'Noise reduction and vocal enhancement',
      category: 'audio',
      version: '1.0.0',
      metadata: {
        audioType: 'voice'
      },
      data: {
        effects: [
          {
            type: 'noise-gate',
            threshold: -40,
            ratio: 10,
            attack: 0.1,
            release: 100
          },
          {
            type: 'de-esser',
            frequency: 4000,
            threshold: -20,
            ratio: 4
          },
          {
            type: 'compressor',
            threshold: -20,
            ratio: 3,
            attack: 3,
            release: 100,
            makeupGain: 3
          },
          {
            type: 'eq',
            bands: [
              { frequency: 100, gain: 2, q: 1 },
              { frequency: 2000, gain: 1, q: 1.5 },
              { frequency: 8000, gain: -2, q: 2 }
            ]
          }
        ]
      }
    }
  };

  class TemplateManager {
    constructor() {
      this.templates = new Map();
      this.categories = new Map();
      this.customTemplates = new Map();
      this.recentTemplates = [];
      this.maxRecent = 10;
      this.onTemplateApplied = null;
      this.onTemplateCreated = null;
      this.onTemplateDeleted = null;

      this.initializeTemplates();
    }

    initializeTemplates() {
      for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
        this.templates.set(key, {
          ...template,
          id: key,
          created: Date.now(),
          modified: Date.now(),
          usageCount: 0,
          rating: 0,
          isBuiltIn: true
        });
      }

      // Initialize categories
      for (const [key, name] of Object.entries(TEMPLATE_CATEGORIES)) {
        this.categories.set(key, {
          id: key,
          name,
          description: `${name} for various project types`,
          templateCount: 0,
          icon: this.getCategoryIcon(key)
        });
      }

      this.updateCategoryCounts();
    }

    getCategoryIcon(category) {
      const icons = {
        'project': '📁',
        'sequence': '🎬',
        'title': '📝',
        'transition': '🔄',
        'effect': '✨',
        'color': '🎨',
        'audio': '🎵'
      };
      return icons[category] || '📄';
    }

    updateCategoryCounts() {
      // Reset counts
      for (const category of this.categories.values()) {
        category.templateCount = 0;
      }

      // Count templates per category
      for (const template of this.templates.values()) {
        if (this.categories.has(template.category)) {
          this.categories.get(template.category).templateCount++;
        }
      }

      for (const template of this.customTemplates.values()) {
        if (this.categories.has(template.category)) {
          this.categories.get(template.category).templateCount++;
        }
      }
    }

    // Get all templates
    getAllTemplates() {
      const templates = [];

      for (const [id, template] of this.templates) {
        templates.push({ ...template, id });
      }

      for (const [id, template] of this.customTemplates) {
        templates.push({ ...template, id });
      }

      return templates.sort((a, b) => {
        // Sort by category first, then by name
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
      });
    }

    // Get templates by category
    getTemplatesByCategory(category) {
      const allTemplates = this.getAllTemplates();
      return allTemplates.filter(template => template.category === category);
    }

    // Get template by ID
    getTemplate(templateId) {
      return this.templates.get(templateId) || this.customTemplates.get(templateId);
    }

    // Apply template
    applyTemplate(templateId, targetData = {}) {
      const template = this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Merge template data with target data
      const appliedData = this.mergeTemplateData(template.data, targetData);

      // Add to recent templates
      this.addToRecent(templateId);

      // Update usage count
      template.usageCount = (template.usageCount || 0) + 1;
      template.lastUsed = Date.now();

      // Emit event
      if (this.onTemplateApplied) {
        this.onTemplateApplied(template, appliedData);
      }

      return {
        template,
        appliedData,
        success: true
      };
    }

    // Merge template data with existing data
    mergeTemplateData(templateData, targetData) {
      const merged = { ...targetData };

      // Deep merge objects
      for (const [key, value] of Object.entries(templateData)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (!merged[key]) {
            merged[key] = {};
          }
          merged[key] = { ...merged[key], ...value };
        } else {
          merged[key] = value;
        }
      }

      return merged;
    }

    // Create custom template
    createTemplate(name, description, category, data, metadata = {}) {
      const templateId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (!TEMPLATE_CATEGORIES[category]) {
        throw new Error(`Invalid category: ${category}`);
      }

      const template = {
        id: templateId,
        name,
        description,
        category,
        version: '1.0.0',
        metadata,
        data: { ...data },
        created: Date.now(),
        modified: Date.now(),
        usageCount: 0,
        rating: 0,
        isCustom: true,
        author: 'User'
      };

      this.customTemplates.set(templateId, template);
      this.updateCategoryCounts();

      if (this.onTemplateCreated) {
        this.onTemplateCreated(template);
      }

      return templateId;
    }

    // Update custom template
    updateTemplate(templateId, updates) {
      const template = this.customTemplates.get(templateId);
      if (!template) {
        throw new Error(`Custom template not found: ${templateId}`);
      }

      if (updates.data) {
        template.data = { ...template.data, ...updates.data };
      }

      template.name = updates.name || template.name;
      template.description = updates.description || template.description;
      template.category = updates.category || template.category;
      template.metadata = { ...template.metadata, ...updates.metadata };
      template.modified = Date.now();

      return template;
    }

    // Delete custom template
    deleteTemplate(templateId) {
      if (!this.customTemplates.has(templateId)) {
        throw new Error(`Custom template not found: ${templateId}`);
      }

      const template = this.customTemplates.get(templateId);
      this.customTemplates.delete(templateId);
      this.updateCategoryCounts();

      // Remove from recent
      this.recentTemplates = this.recentTemplates.filter(id => id !== templateId);

      if (this.onTemplateDeleted) {
        this.onTemplateDeleted(template);
      }

      return true;
    }

    // Add to recent templates
    addToRecent(templateId) {
      // Remove if already exists
      this.recentTemplates = this.recentTemplates.filter(id => id !== templateId);

      // Add to beginning
      this.recentTemplates.unshift(templateId);

      // Trim to max length
      if (this.recentTemplates.length > this.maxRecent) {
        this.recentTemplates = this.recentTemplates.slice(0, this.maxRecent);
      }

      // Save to localStorage
      try {
        localStorage.setItem('artone-recent-templates', JSON.stringify(this.recentTemplates));
      } catch (error) {
        console.warn('Failed to save recent templates:', error);
      }
    }

    // Get recent templates
    getRecentTemplates() {
      return this.recentTemplates
        .map(id => this.getTemplate(id))
        .filter(template => template !== undefined);
    }

    // Load recent templates from storage
    loadRecentTemplates() {
      try {
        const stored = localStorage.getItem('artone-recent-templates');
        if (stored) {
          this.recentTemplates = JSON.parse(stored);
        }
      } catch (error) {
        console.warn('Failed to load recent templates:', error);
      }
    }

    // Search templates
    searchTemplates(query) {
      const allTemplates = this.getAllTemplates();
      const searchTerm = query.toLowerCase();

      return allTemplates.filter(template =>
        template.name.toLowerCase().includes(searchTerm) ||
        template.description.toLowerCase().includes(searchTerm) ||
        template.category.toLowerCase().includes(searchTerm)
      );
    }

    // Rate template
    rateTemplate(templateId, rating) {
      const template = this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      template.rating = Math.max(0, Math.min(5, rating));
      return template.rating;
    }

    // Export template
    exportTemplate(templateId, format = 'json') {
      const template = this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const exportData = {
        ...template,
        exportedAt: Date.now(),
        exportVersion: '1.0.0'
      };

      switch (format) {
        case 'json':
          return JSON.stringify(exportData, null, 2);
        case 'artemplate':
          // Custom template format
          return this.exportToArTemplate(exportData);
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    }

    // Import template
    importTemplate(data, format = 'json') {
      let template;

      switch (format) {
        case 'json':
          template = JSON.parse(data);
          break;
        case 'artemplate':
          template = this.parseArTemplate(data);
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      // Validate template
      this.validateTemplate(template);

      // Generate new ID for imported template
      const newId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      template.id = newId;
      template.isCustom = true;
      template.importedAt = Date.now();

      this.customTemplates.set(newId, template);
      this.updateCategoryCounts();

      return newId;
    }

    // Export to .artemplate format
    exportToArTemplate(template) {
      const header = `# Artone Template
# Version: 1.0.0
# Exported: ${new Date(template.exportedAt).toISOString()}
#
# Template: ${template.name}
# Category: ${template.category}
# Description: ${template.description}
#
`;

      const metadata = `METADATA
name: ${template.name}
description: ${template.description}
category: ${template.category}
version: ${template.version}
created: ${template.created}
modified: ${template.modified}
END
`;

      const data = `DATA
${JSON.stringify(template.data, null, 2)}
END
`;

      return header + metadata + data;
    }

    // Parse .artemplate format
    parseArTemplate(data) {
      const lines = data.split('\n');
      const template = {};

      let inMetadata = false;
      let inData = false;
      let metadataLines = [];
      let dataLines = [];

      for (const line of lines) {
        if (line.startsWith('METADATA')) {
          inMetadata = true;
          inData = false;
          continue;
        }

        if (line.startsWith('DATA')) {
          inMetadata = false;
          inData = true;
          continue;
        }

        if (line.startsWith('END')) {
          inMetadata = false;
          inData = false;
          continue;
        }

        if (inMetadata) {
          metadataLines.push(line);
        } else if (inData) {
          dataLines.push(line);
        }
      }

      // Parse metadata
      for (const line of metadataLines) {
        const [key, ...values] = line.split(':');
        if (key && values.length > 0) {
          const value = values.join(':').trim();
          switch (key.trim()) {
            case 'name':
              template.name = value;
              break;
            case 'description':
              template.description = value;
              break;
            case 'category':
              template.category = value;
              break;
            case 'version':
              template.version = value;
              break;
            case 'created':
              template.created = parseInt(value);
              break;
            case 'modified':
              template.modified = parseInt(value);
              break;
          }
        }
      }

      // Parse data
      template.data = JSON.parse(dataLines.join('\n'));

      return template;
    }

    // Validate template structure
    validateTemplate(template) {
      const required = ['name', 'description', 'category', 'data'];

      for (const field of required) {
        if (!template[field]) {
          throw new Error(`Template missing required field: ${field}`);
        }
      }

      if (!TEMPLATE_CATEGORIES[template.category]) {
        throw new Error(`Invalid template category: ${template.category}`);
      }

      return true;
    }

    // Get template statistics
    getTemplateStats() {
      const builtInCount = this.templates.size;
      const customCount = this.customTemplates.size;
      const totalCount = builtInCount + customCount;

      const categoryStats = {};
      for (const category of this.categories.keys()) {
        categoryStats[category] = this.getTemplatesByCategory(category).length;
      }

      const usageStats = {
        total: 0,
        average: 0,
        mostUsed: null,
        leastUsed: null
      };

      const allTemplates = this.getAllTemplates();
      for (const template of allTemplates) {
        usageStats.total += template.usageCount || 0;
        if (!usageStats.mostUsed || template.usageCount > usageStats.mostUsed.usageCount) {
          usageStats.mostUsed = template;
        }
        if (!usageStats.leastUsed || template.usageCount < usageStats.leastUsed.usageCount) {
          usageStats.leastUsed = template;
        }
      }

      usageStats.average = totalCount > 0 ? usageStats.total / totalCount : 0;

      return {
        total: totalCount,
        builtIn: builtInCount,
        custom: customCount,
        recent: this.recentTemplates.length,
        categories: categoryStats,
        usage: usageStats
      };
    }

    // Get categories
    getCategories() {
      const categories = [];

      for (const [id, category] of this.categories) {
        categories.push({
          id,
          name: category.name,
          description: category.description,
          icon: category.icon,
          count: category.templateCount
        });
      }

      return categories;
    }

    // Event system
    onTemplateApplied(callback) {
      this.onTemplateApplied = callback;
    }

    onTemplateCreated(callback) {
      this.onTemplateCreated = callback;
    }

    onTemplateDeleted(callback) {
      this.onTemplateDeleted = callback;
    }

    // Cleanup
    destroy() {
      this.templates.clear();
      this.customTemplates.clear();
      this.categories.clear();
      this.recentTemplates = [];
    }
  }

  class TemplateUI {
    constructor(container, templateManager) {
      this.container = container;
      this.manager = templateManager;
      this.currentCategory = 'all';
      this.searchQuery = '';
      this.selectedTemplate = null;
      this.isDragging = false;

      this.setupUI();
      this.setupEventListeners();
      this.updateTemplateGrid();
    }

    setupUI() {
      setHTMLSafe(this.container, `
        <div class="template-ui">
          <div class="template-toolbar">
            <div class="template-search">
              <input type="text" id="template-search" placeholder="Search templates...">
              <button id="clear-search" title="Clear Search">×</button>
            </div>
            <div class="template-categories">
              <button class="category-btn active" data-category="all">All</button>
              <button class="category-btn" data-category="project">Projects</button>
              <button class="category-btn" data-category="title">Titles</button>
              <button class="category-btn" data-category="transition">Transitions</button>
              <button class="category-btn" data-category="effect">Effects</button>
              <button class="category-btn" data-category="color">Color</button>
              <button class="category-btn" data-category="audio">Audio</button>
            </div>
            <div class="template-actions">
              <button id="create-template" title="Create Template">Create</button>
              <button id="import-template" title="Import Template">Import</button>
              <button id="export-template" title="Export Template">Export</button>
              <button id="delete-template" title="Delete Template">Delete</button>
            </div>
          </div>

          <div class="template-stats">
            <div class="stat-item">
              <span class="stat-label">Total Templates:</span>
              <span class="stat-value" id="total-templates">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Current Category:</span>
              <span class="stat-value" id="current-category">All</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Recent:</span>
              <span class="stat-value" id="recent-count">0</span>
            </div>
          </div>

          <div class="template-grid">
            <div class="template-list"></div>
          </div>

          <div class="template-preview" id="template-preview" style="display: none;">
            <div class="preview-header">
              <h3 id="preview-title">Template Preview</h3>
              <button id="close-preview" title="Close Preview">×</button>
            </div>
            <div class="preview-content">
              <div class="preview-metadata">
                <div class="metadata-item">
                  <span class="metadata-label">Category:</span>
                  <span class="metadata-value" id="preview-category"></span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">Version:</span>
                  <span class="metadata-value" id="preview-version"></span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">Usage:</span>
                  <span class="metadata-value" id="preview-usage"></span>
                </div>
              </div>
              <div class="preview-description" id="preview-description"></div>
              <div class="preview-data">
                <h4>Template Data:</h4>
                <pre id="preview-data"></pre>
              </div>
            </div>
            <div class="preview-actions">
              <button id="apply-template" class="primary-btn">Apply Template</button>
              <button id="edit-template" class="secondary-btn">Edit</button>
            </div>
          </div>

          <div class="template-creator" id="template-creator" style="display: none;">
            <div class="creator-header">
              <h3>Create New Template</h3>
              <button id="close-creator" title="Close Creator">×</button>
            </div>
            <div class="creator-form">
              <div class="form-group">
                <label for="template-name">Name:</label>
                <input type="text" id="template-name" placeholder="Template name">
              </div>
              <div class="form-group">
                <label for="template-description">Description:</label>
                <textarea id="template-description" placeholder="Template description"></textarea>
              </div>
              <div class="form-group">
                <label for="template-category">Category:</label>
                <select id="template-category">
                  ${Object.entries(TEMPLATE_CATEGORIES).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="template-data">Template Data (JSON):</label>
                <textarea id="template-data" placeholder="Template data as JSON"></textarea>
              </div>
            </div>
            <div class="creator-actions">
              <button id="save-template" class="primary-btn">Save Template</button>
              <button id="cancel-create" class="secondary-btn">Cancel</button>
            </div>
          </div>
        </div>
      `);

      this.templateList = this.container.querySelector('.template-list');
      this.previewPanel = this.container.querySelector('#template-preview');
      this.creatorPanel = this.container.querySelector('#template-creator');
    }

    setupEventListeners() {
      // Search
      const searchInput = this.container.querySelector('#template-search');
      const clearSearch = this.container.querySelector('#clear-search');

      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.updateTemplateGrid();
      });

      clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.updateTemplateGrid();
      });

      // Category buttons
      this.container.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.setCategory(e.target.dataset.category);
        });
      });

      // Toolbar actions
      this.container.querySelector('#create-template').addEventListener('click', () => {
        this.showCreator();
      });

      this.container.querySelector('#import-template').addEventListener('click', () => {
        this.importTemplate();
      });

      this.container.querySelector('#export-template').addEventListener('click', () => {
        if (this.selectedTemplate) {
          this.exportTemplate(this.selectedTemplate);
        }
      });

      this.container.querySelector('#delete-template').addEventListener('click', () => {
        if (this.selectedTemplate) {
          this.deleteTemplate(this.selectedTemplate);
        }
      });

      // Preview panel
      this.container.querySelector('#close-preview').addEventListener('click', () => {
        this.hidePreview();
      });

      this.container.querySelector('#apply-template').addEventListener('click', () => {
        if (this.selectedTemplate) {
          this.applyTemplate(this.selectedTemplate);
        }
      });

      // Creator panel
      this.container.querySelector('#close-creator').addEventListener('click', () => {
        this.hideCreator();
      });

      this.container.querySelector('#save-template').addEventListener('click', () => {
        this.saveTemplate();
      });

      this.container.querySelector('#cancel-create').addEventListener('click', () => {
        this.hideCreator();
      });
    }

    setCategory(category) {
      this.currentCategory = category;
      this.container.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
      });
      this.updateTemplateGrid();
    }

    updateTemplateGrid() {
      let templates;

      if (this.searchQuery) {
        templates = this.manager.searchTemplates(this.searchQuery);
      } else if (this.currentCategory === 'all') {
        templates = this.manager.getAllTemplates();
      } else {
        templates = this.manager.getTemplatesByCategory(this.currentCategory);
      }

      setHTMLSafe(this.templateList, templates.map(template => `
        <div class="template-item" data-template-id="${template.id}">
          <div class="template-icon">
            ${this.manager.categories.get(template.category)?.icon || '📄'}
          </div>
          <div class="template-info">
            <div class="template-name">${template.name}</div>
            <div class="template-description">${template.description}</div>
            <div class="template-category">${TEMPLATE_CATEGORIES[template.category] || template.category}</div>
          </div>
          <div class="template-actions">
            <button class="preview-btn" data-template-id="${template.id}" title="Preview">👁</button>
            <button class="apply-btn" data-template-id="${template.id}" title="Apply">✓</button>
          </div>
        </div>
      `).join(''));

      // Update stats
      this.updateStats();

      // Add event listeners
      this.templateList.querySelectorAll('.template-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (!e.target.classList.contains('preview-btn') && !e.target.classList.contains('apply-btn')) {
            this.selectTemplate(item.dataset.templateId);
          }
        });
      });

      this.templateList.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showPreview(e.target.dataset.templateId);
        });
      });

      this.templateList.querySelectorAll('.apply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyTemplate(e.target.dataset.templateId);
        });
      });
    }

    updateStats() {
      const stats = this.manager.getTemplateStats();
      const categories = this.manager.getCategories();

      this.container.querySelector('#total-templates').textContent = stats.total;
      this.container.querySelector('#current-category').textContent =
        this.currentCategory === 'all' ? 'All' : TEMPLATE_CATEGORIES[this.currentCategory];
      this.container.querySelector('#recent-count').textContent = stats.recent;
    }

    selectTemplate(templateId) {
      this.selectedTemplate = templateId;
      this.container.querySelectorAll('.template-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.templateId === templateId);
      });
    }

    showPreview(templateId) {
      const template = this.manager.getTemplate(templateId);
      if (!template) return;

      this.selectedTemplate = templateId;
      this.previewPanel.style.display = 'block';

      this.container.querySelector('#preview-title').textContent = template.name;
      this.container.querySelector('#preview-category').textContent = TEMPLATE_CATEGORIES[template.category];
      this.container.querySelector('#preview-version').textContent = template.version;
      this.container.querySelector('#preview-usage').textContent = template.usageCount || 0;
      this.container.querySelector('#preview-description').textContent = template.description;
      this.container.querySelector('#preview-data').textContent = JSON.stringify(template.data, null, 2);
    }

    hidePreview() {
      this.previewPanel.style.display = 'none';
    }

    applyTemplate(templateId) {
      try {
        const result = this.manager.applyTemplate(templateId);
        console.log('Template applied:', result);
        // Would emit event to main application
      } catch (error) {
        console.error('Failed to apply template:', error);
      }
    }

    showCreator() {
      this.creatorPanel.style.display = 'block';
      this.container.querySelector('#template-name').focus();
    }

    hideCreator() {
      this.creatorPanel.style.display = 'none';
      this.clearCreatorForm();
    }

    clearCreatorForm() {
      this.container.querySelector('#template-name').value = '';
      this.container.querySelector('#template-description').value = '';
      this.container.querySelector('#template-data').value = '';
    }

    saveTemplate() {
      const name = this.container.querySelector('#template-name').value.trim();
      const description = this.container.querySelector('#template-description').value.trim();
      const category = this.container.querySelector('#template-category').value;
      const dataText = this.container.querySelector('#template-data').value.trim();

      if (!name) {
        alert('Please enter a template name');
        return;
      }

      try {
        const data = JSON.parse(dataText);
        const templateId = this.manager.createTemplate(name, description, category, data);
        this.hideCreator();
        this.updateTemplateGrid();
        console.log('Template created:', templateId);
      } catch (error) {
        alert('Invalid JSON data: ' + error.message);
      }
    }

    exportTemplate(templateId) {
      try {
        const templateData = this.manager.exportTemplate(templateId, 'artemplate');
        const blob = new Blob([templateData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${templateId}.artemplate`;
        a.click();

        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to export template:', error);
      }
    }

    importTemplate() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.artemplate';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const format = file.name.endsWith('.artemplate') ? 'artemplate' : 'json';
              const templateId = this.manager.importTemplate(e.target.result, format);
              this.updateTemplateGrid();
              console.log('Template imported:', templateId);
            } catch (error) {
              console.error('Failed to import template:', error);
            }
          };
          reader.readAsText(file);
        }
      };

      input.click();
    }

    deleteTemplate(templateId) {
      if (confirm('Are you sure you want to delete this template?')) {
        try {
          this.manager.deleteTemplate(templateId);
          this.updateTemplateGrid();
          this.selectedTemplate = null;
          console.log('Template deleted:', templateId);
        } catch (error) {
          console.error('Failed to delete template:', error);
        }
      }
    }

    refresh() {
      this.updateTemplateGrid();
    }
  }

  // Export to global scope
  global.TemplateManager = TemplateManager;
  global.TemplateUI = TemplateUI;
  global.TEMPLATE_CATEGORIES = TEMPLATE_CATEGORIES;
  global.DEFAULT_TEMPLATES = DEFAULT_TEMPLATES;

})(typeof window !== 'undefined' ? window : globalThis);
