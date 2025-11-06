/**
 * Advanced Project Management System
 * Comprehensive project templates, auto-save, batch processing, and project organization
 */

(function initializeProjectManagement(global) {
  'use strict';

  const React = global.React;
  const { useState, useEffect, useCallback, useMemo } = React;

  // Project states
  const PROJECT_STATES = {
    NEW: 'new',
    LOADING: 'loading',
    LOADED: 'loaded',
    SAVING: 'saving',
    SAVED: 'saved',
    ERROR: 'error',
    CLOSED: 'closed'
  };

  // Project types
  const PROJECT_TYPES = {
    VIDEO_EDIT: 'video_edit',
    AUDIO_EDIT: 'audio_edit',
    MOTION_GRAPHICS: 'motion_graphics',
    COLOR_GRADING: 'color_grading',
    DOCUMENTARY: 'documentary',
    COMMERCIAL: 'commercial',
    MUSIC_VIDEO: 'music_video',
    TUTORIAL: 'tutorial'
  };

  // Auto-save intervals
  const AUTO_SAVE_INTERVALS = {
    DISABLED: 0,
    FREQUENT: 30000,    // 30 seconds
    NORMAL: 60000,      // 1 minute
    RELAXED: 300000,    // 5 minutes
    MANUAL: -1          // Manual only
  };

  // Project templates
  const PROJECT_TEMPLATES = {
    'basic-video': {
      id: 'basic-video',
      name: 'Basic Video Edit',
      description: 'Simple video editing project with basic timeline and effects',
      type: PROJECT_TYPES.VIDEO_EDIT,
      thumbnail: '/templates/basic-video.png',
      settings: {
        resolution: '1920x1080',
        frameRate: 30,
        duration: 180, // 3 minutes
        audioTracks: 2,
        videoTracks: 3
      },
      structure: {
        tracks: [
          { type: 'video', name: 'Main Video', height: 60 },
          { type: 'video', name: 'Overlays', height: 60 },
          { type: 'audio', name: 'Main Audio', height: 40 },
          { type: 'audio', name: 'Music', height: 40 }
        ],
        effects: [],
        transitions: []
      }
    },

    'music-video': {
      id: 'music-video',
      name: 'Music Video',
      description: 'Dynamic music video project with advanced effects and transitions',
      type: PROJECT_TYPES.MUSIC_VIDEO,
      thumbnail: '/templates/music-video.png',
      settings: {
        resolution: '1920x1080',
        frameRate: 30,
        duration: 240, // 4 minutes
        audioTracks: 3,
        videoTracks: 5
      },
      structure: {
        tracks: [
          { type: 'video', name: 'Main Footage', height: 60 },
          { type: 'video', name: 'Cutaways', height: 60 },
          { type: 'video', name: 'Effects', height: 60 },
          { type: 'video', name: 'Titles', height: 60 },
          { type: 'audio', name: 'Vocals', height: 40 },
          { type: 'audio', name: 'Instruments', height: 40 },
          { type: 'audio', name: 'Effects', height: 40 }
        ],
        effects: ['color_correction', 'blur', 'glow'],
        transitions: ['fade', 'wipe', 'slide']
      }
    },

    'documentary': {
      id: 'documentary',
      name: 'Documentary',
      description: 'Professional documentary project with interviews and B-roll',
      type: PROJECT_TYPES.DOCUMENTARY,
      thumbnail: '/templates/documentary.png',
      settings: {
        resolution: '3840x2160',
        frameRate: 24,
        duration: 1800, // 30 minutes
        audioTracks: 4,
        videoTracks: 6
      },
      structure: {
        tracks: [
          { type: 'video', name: 'Interviews', height: 60 },
          { type: 'video', name: 'B-Roll', height: 60 },
          { type: 'video', name: 'Graphics', height: 60 },
          { type: 'video', name: 'Titles', height: 60 },
          { type: 'video', name: 'Lower Thirds', height: 60 },
          { type: 'audio', name: 'Interview Audio', height: 40 },
          { type: 'audio', name: 'Ambience', height: 40 },
          { type: 'audio', name: 'Music', height: 40 },
          { type: 'audio', name: 'Voiceover', height: 40 }
        ],
        effects: ['color_correction', 'stabilization'],
        transitions: ['dissolve', 'fade']
      }
    },

    'commercial': {
      id: 'commercial',
      name: 'Commercial',
      description: 'High-energy commercial project with dynamic effects',
      type: PROJECT_TYPES.COMMERCIAL,
      thumbnail: '/templates/commercial.png',
      settings: {
        resolution: '1920x1080',
        frameRate: 30,
        duration: 30, // 30 seconds
        audioTracks: 3,
        videoTracks: 4
      },
      structure: {
        tracks: [
          { type: 'video', name: 'Main Footage', height: 60 },
          { type: 'video', name: 'Product Shots', height: 60 },
          { type: 'video', name: 'Graphics', height: 60 },
          { type: 'audio', name: 'Dialogue', height: 40 },
          { type: 'audio', name: 'Music', height: 40 },
          { type: 'audio', name: 'SFX', height: 40 }
        ],
        effects: ['color_grading', 'speed_ramp', 'glow'],
        transitions: ['quick_cut', 'flash', 'zoom']
      }
    }
  };

  // Project Manager Class
  class ProjectManager {
    constructor() {
      this.currentProject = null;
      this.recentProjects = [];
      this.autoSaveTimer = null;
      this.listeners = new Set();
      this.batchQueue = [];
      this.isProcessingBatch = false;

      this.loadRecentProjects();
      this.setupAutoSave();
    }

    // Project creation and loading
    async createProject(templateId = null, options = {}) {
      const template = templateId ? PROJECT_TEMPLATES[templateId] : null;

      const project = {
        id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: options.name || (template ? `${template.name} Project` : 'New Project'),
        type: template?.type || PROJECT_TYPES.VIDEO_EDIT,
        template: templateId,
        state: PROJECT_STATES.NEW,
        createdAt: new Date(),
        modifiedAt: new Date(),
        settings: {
          ...this.getDefaultSettings(),
          ...(template?.settings || {}),
          ...options.settings
        },
        data: {
          timeline: {
            duration: template?.settings.duration || 180,
            tracks: template?.structure.tracks || this.getDefaultTracks(),
            clips: [],
            markers: []
          },
          media: [],
          effects: template?.structure.effects || [],
          transitions: template?.structure.transitions || []
        },
        metadata: {
          description: options.description || '',
          tags: options.tags || [],
          client: options.client || '',
          deadline: options.deadline || null
        },
        version: 1,
        autoSaveEnabled: true,
        lastSaved: null,
        unsavedChanges: false
      };

      this.currentProject = project;
      this.addToRecentProjects(project);
      this.notifyListeners('project_created', project);

      return project;
    }

    async loadProject(projectId) {
      try {
        this.currentProject = { ...this.currentProject, state: PROJECT_STATES.LOADING };
        this.notifyListeners('project_loading', this.currentProject);

        // Try to load from local storage first
        let projectData = this.loadFromLocalStorage(projectId);

        if (!projectData) {
          // Try to load from cloud storage
          projectData = await this.loadFromCloudStorage(projectId);
        }

        if (!projectData) {
          throw new Error('Project not found');
        }

        this.currentProject = {
          ...projectData,
          state: PROJECT_STATES.LOADED,
          modifiedAt: new Date()
        };

        this.addToRecentProjects(this.currentProject);
        this.notifyListeners('project_loaded', this.currentProject);

        return this.currentProject;
      } catch (error) {
        console.error('Failed to load project:', error);
        if (this.currentProject) {
          this.currentProject.state = PROJECT_STATES.ERROR;
        }
        throw error;
      }
    }

    async saveProject(project = this.currentProject, options = {}) {
      if (!project) return;

      try {
        project.state = PROJECT_STATES.SAVING;
        project.modifiedAt = new Date();
        this.notifyListeners('project_saving', project);

        // Save to local storage
        this.saveToLocalStorage(project);

        // Save to cloud if enabled
        if (options.cloudSave !== false) {
          await this.saveToCloudStorage(project);
        }

        project.state = PROJECT_STATES.SAVED;
        project.lastSaved = new Date();
        project.unsavedChanges = false;
        project.version++;

        this.notifyListeners('project_saved', project);
        return project;
      } catch (error) {
        console.error('Failed to save project:', error);
        project.state = PROJECT_STATES.ERROR;
        throw error;
      }
    }

    async exportProject(project = this.currentProject, format = 'artone') {
      if (!project) return null;

      const exportData = {
        ...project,
        exportedAt: new Date(),
        exportFormat: format
      };

      // Generate export file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      return blob;
    }

    async importProject(file) {
      try {
        const text = await file.text();
        const projectData = JSON.parse(text);

        // Validate project data
        if (!projectData.id || !projectData.name) {
          throw new Error('Invalid project file');
        }

        // Create new project with imported data
        const project = await this.createProject(null, {
          name: `${projectData.name} (Imported)`,
          settings: projectData.settings,
          description: projectData.metadata?.description,
          tags: projectData.metadata?.tags
        });

        // Restore project data
        project.data = projectData.data;
        project.metadata = projectData.metadata;

        this.notifyListeners('project_imported', project);
        return project;
      } catch (error) {
        console.error('Failed to import project:', error);
        throw error;
      }
    }

    // Auto-save functionality
    setupAutoSave() {
      this.autoSaveTimer = setInterval(() => {
        if (this.currentProject &&
            this.currentProject.autoSaveEnabled &&
            this.currentProject.unsavedChanges) {
          this.saveProject(this.currentProject, { silent: true });
        }
      }, AUTO_SAVE_INTERVALS.NORMAL);
    }

    setAutoSaveInterval(interval) {
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }

      if (interval > 0) {
        this.autoSaveTimer = setInterval(() => {
          if (this.currentProject &&
              this.currentProject.autoSaveEnabled &&
              this.currentProject.unsavedChanges) {
            this.saveProject(this.currentProject, { silent: true });
          }
        }, interval);
      }
    }

    // Batch processing
    async addToBatch(operation, ...args) {
      return new Promise((resolve, reject) => {
        this.batchQueue.push({
          operation,
          args,
          resolve,
          reject,
          timestamp: Date.now()
        });

        this.processBatchQueue();
      });
    }

    async processBatchQueue() {
      if (this.isProcessingBatch || this.batchQueue.length === 0) return;

      this.isProcessingBatch = true;

      try {
        while (this.batchQueue.length > 0) {
          const batchItem = this.batchQueue.shift();
          const { operation, args, resolve, reject } = batchItem;

          try {
            let result;
            switch (operation) {
              case 'save_project':
                result = await this.saveProject(...args);
                break;
              case 'load_project':
                result = await this.loadProject(...args);
                break;
              case 'export_project':
                result = await this.exportProject(...args);
                break;
              default:
                throw new Error(`Unknown batch operation: ${operation}`);
            }
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      } finally {
        this.isProcessingBatch = false;
      }
    }

    // Project state management
    markUnsavedChanges() {
      if (this.currentProject) {
        this.currentProject.unsavedChanges = true;
        this.notifyListeners('project_modified', this.currentProject);
      }
    }

    getCurrentProject() {
      return this.currentProject;
    }

    closeProject() {
      if (this.currentProject) {
        if (this.currentProject.unsavedChanges) {
          // Auto-save before closing
          this.saveProject(this.currentProject);
        }

        this.currentProject.state = PROJECT_STATES.CLOSED;
        this.notifyListeners('project_closed', this.currentProject);
        this.currentProject = null;
      }
    }

    // Recent projects management
    addToRecentProjects(project) {
      // Remove if already exists
      this.recentProjects = this.recentProjects.filter(p => p.id !== project.id);

      // Add to beginning
      this.recentProjects.unshift({
        id: project.id,
        name: project.name,
        type: project.type,
        thumbnail: project.thumbnail,
        lastModified: project.modifiedAt,
        size: this.calculateProjectSize(project)
      });

      // Keep only recent 10 projects
      this.recentProjects = this.recentProjects.slice(0, 10);

      this.saveRecentProjects();
    }

    getRecentProjects() {
      return [...this.recentProjects];
    }

    removeFromRecentProjects(projectId) {
      this.recentProjects = this.recentProjects.filter(p => p.id !== projectId);
      this.saveRecentProjects();
    }

    // Storage operations
    loadFromLocalStorage(projectId) {
      try {
        const stored = localStorage.getItem(`artone_project_${projectId}`);
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        console.warn('Failed to load project from local storage:', error);
        return null;
      }
    }

    saveToLocalStorage(project) {
      try {
        localStorage.setItem(`artone_project_${project.id}`, JSON.stringify(project));
      } catch (error) {
        console.warn('Failed to save project to local storage:', error);
      }
    }

    async loadFromCloudStorage(projectId) {
      // Implementation would integrate with cloud storage
      console.log('Loading project from cloud storage:', projectId);
      return null;
    }

    async saveToCloudStorage(project) {
      // Implementation would integrate with cloud storage
      console.log('Saving project to cloud storage:', project.id);
    }

    // Utility methods
    getDefaultSettings() {
      return {
        resolution: '1920x1080',
        frameRate: 30,
        duration: 180,
        audioTracks: 2,
        videoTracks: 3
      };
    }

    getDefaultTracks() {
      return [
        { type: 'video', name: 'Video Track 1', height: 60 },
        { type: 'audio', name: 'Audio Track 1', height: 40 },
        { type: 'audio', name: 'Audio Track 2', height: 40 }
      ];
    }

    calculateProjectSize(project) {
      // Rough estimation
      const dataSize = JSON.stringify(project).length;
      return Math.round(dataSize / 1024); // KB
    }

    loadRecentProjects() {
      try {
        const stored = localStorage.getItem('artone_recent_projects');
        this.recentProjects = stored ? JSON.parse(stored) : [];
      } catch (error) {
        console.warn('Failed to load recent projects:', error);
        this.recentProjects = [];
      }
    }

    saveRecentProjects() {
      try {
        localStorage.setItem('artone_recent_projects', JSON.stringify(this.recentProjects));
      } catch (error) {
        console.warn('Failed to save recent projects:', error);
      }
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyListeners(event, data) {
      this.listeners.forEach(listener => {
        try {
          listener(event, data);
        } catch (error) {
          console.error('Project manager listener error:', error);
        }
      });
    }

    destroy() {
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }
      this.listeners.clear();
    }
  }

  // Template Manager
  class TemplateManager {
    constructor() {
      this.customTemplates = new Map();
      this.loadCustomTemplates();
    }

    getAllTemplates() {
      return { ...PROJECT_TEMPLATES, ...Object.fromEntries(this.customTemplates) };
    }

    getTemplate(templateId) {
      return PROJECT_TEMPLATES[templateId] || this.customTemplates.get(templateId);
    }

    getTemplatesByType(type) {
      const allTemplates = this.getAllTemplates();
      return Object.values(allTemplates).filter(template => template.type === type);
    }

    createCustomTemplate(name, description, baseTemplateId, modifications) {
      const baseTemplate = this.getTemplate(baseTemplateId);
      if (!baseTemplate) {
        throw new Error(`Base template '${baseTemplateId}' not found`);
      }

      const customTemplate = {
        ...JSON.parse(JSON.stringify(baseTemplate)),
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        custom: true,
        createdAt: new Date()
      };

      // Apply modifications
      if (modifications.settings) {
        Object.assign(customTemplate.settings, modifications.settings);
      }
      if (modifications.structure) {
        Object.assign(customTemplate.structure, modifications.structure);
      }

      this.customTemplates.set(customTemplate.id, customTemplate);
      this.saveCustomTemplates();

      return customTemplate.id;
    }

    updateTemplate(templateId, updates) {
      const template = this.customTemplates.get(templateId);
      if (!template) {
        throw new Error(`Template '${templateId}' not found or is not custom`);
      }

      Object.assign(template, updates);
      template.modifiedAt = new Date();
      this.saveCustomTemplates();
    }

    deleteTemplate(templateId) {
      if (this.customTemplates.delete(templateId)) {
        this.saveCustomTemplates();
        return true;
      }
      return false;
    }

    exportTemplate(templateId) {
      const template = this.getTemplate(templateId);
      return template ? JSON.stringify(template, null, 2) : null;
    }

    importTemplate(jsonString) {
      try {
        const template = JSON.parse(jsonString);
        template.id = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        template.custom = true;
        template.importedAt = new Date();

        this.customTemplates.set(template.id, template);
        this.saveCustomTemplates();

        return template.id;
      } catch (error) {
        console.error('Failed to import template:', error);
        return null;
      }
    }

    loadCustomTemplates() {
      try {
        const stored = localStorage.getItem('artone_custom_templates');
        if (stored) {
          const templates = JSON.parse(stored);
          for (const [id, template] of Object.entries(templates)) {
            this.customTemplates.set(id, template);
          }
        }
      } catch (error) {
        console.warn('Failed to load custom templates:', error);
      }
    }

    saveCustomTemplates() {
      try {
        const data = Object.fromEntries(this.customTemplates);
        localStorage.setItem('artone_custom_templates', JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save custom templates:', error);
      }
    }
  }

  // Batch Processor
  class BatchProcessor {
    constructor(projectManager) {
      this.projectManager = projectManager;
      this.queue = [];
      this.isProcessing = false;
      this.listeners = new Set();
    }

    addBatchOperation(operation) {
      const batchItem = {
        id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation,
        status: 'queued',
        progress: 0,
        result: null,
        error: null,
        startTime: null,
        endTime: null
      };

      this.queue.push(batchItem);
      this.notifyListeners('operation_added', batchItem);
      this.processQueue();

      return batchItem.id;
    }

    async addBatchJob(name, operations) {
      const batchJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        operations,
        status: 'queued',
        progress: 0,
        currentOperation: 0,
        results: [],
        errors: [],
        startTime: null,
        endTime: null
      };

      this.queue.push(batchJob);
      this.notifyListeners('job_added', batchJob);
      this.processQueue();

      return batchJob.id;
    }

    async processQueue() {
      if (this.isProcessing || this.queue.length === 0) return;

      this.isProcessing = true;

      try {
        while (this.queue.length > 0) {
          const item = this.queue.shift();
          item.startTime = Date.now();

          try {
            if (item.operations) {
              // Batch job
              await this.processBatchJob(item);
            } else {
              // Single operation
              await this.processBatchOperation(item);
            }
          } catch (error) {
            item.status = 'error';
            item.error = error.message;
            this.notifyListeners('operation_error', item);
          }

          item.endTime = Date.now();
        }
      } finally {
        this.isProcessing = false;
      }
    }

    async processBatchOperation(operation) {
      operation.status = 'running';
      this.notifyListeners('operation_started', operation);

      try {
        // Execute operation based on type
        const result = await this.executeOperation(operation.operation);
        operation.result = result;
        operation.status = 'completed';
        operation.progress = 100;

        this.notifyListeners('operation_completed', operation);
      } catch (error) {
        operation.status = 'error';
        operation.error = error.message;
        throw error;
      }
    }

    async processBatchJob(job) {
      job.status = 'running';
      this.notifyListeners('job_started', job);

      const totalOperations = job.operations.length;

      for (let i = 0; i < totalOperations; i++) {
        job.currentOperation = i;
        job.progress = (i / totalOperations) * 100;

        try {
          const result = await this.executeOperation(job.operations[i]);
          job.results.push(result);
        } catch (error) {
          job.errors.push({
            operation: i,
            error: error.message
          });
        }

        this.notifyListeners('job_progress', job);
      }

      job.status = 'completed';
      job.progress = 100;
      this.notifyListeners('job_completed', job);
    }

    async executeOperation(operation) {
      // Execute operation based on type
      switch (operation.type) {
        case 'export_video':
          return await this.projectManager.exportProject(operation.projectId, operation.format);
        case 'save_project':
          return await this.projectManager.saveProject(operation.projectId);
        case 'load_project':
          return await this.projectManager.loadProject(operation.projectId);
        case 'apply_template':
          return await this.applyTemplate(operation.projectId, operation.templateId);
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }
    }

    async applyTemplate(projectId, templateId) {
      // Implementation for applying templates to existing projects
      console.log(`Applying template ${templateId} to project ${projectId}`);
      return { success: true };
    }

    getQueueStatus() {
      return {
        queueLength: this.queue.length,
        isProcessing: this.isProcessing,
        pendingOperations: this.queue.filter(item => item.status === 'queued').length,
        runningOperations: this.queue.filter(item => item.status === 'running').length
      };
    }

    cancelOperation(operationId) {
      const operation = this.queue.find(op => op.id === operationId);
      if (operation && operation.status === 'queued') {
        operation.status = 'cancelled';
        this.notifyListeners('operation_cancelled', operation);
        return true;
      }
      return false;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyListeners(event, data) {
      this.listeners.forEach(listener => {
        try {
          listener(event, data);
        } catch (error) {
          console.error('Batch processor listener error:', error);
        }
      });
    }
  }

  // React Components for Project Management UI
  function ProjectSelector({ onProjectSelect, onCreateNew }) {
    const [recentProjects, setRecentProjects] = useState([]);
    const [templates, setTemplates] = useState({});

    useEffect(() => {
      setRecentProjects(global.ProjectManager.getRecentProjects());
      setTemplates(global.TemplateManager.getAllTemplates());
    }, []);

    return React.createElement('div', { className: 'project-selector' }, [
      React.createElement('div', { key: 'recent', className: 'recent-projects' }, [
        React.createElement('h3', { key: 'title' }, 'Recent Projects'),
        React.createElement('div', { key: 'list', className: 'project-list' },
          recentProjects.map(project =>
            React.createElement('div', {
              key: project.id,
              className: 'project-item',
              onClick: () => onProjectSelect(project.id)
            }, [
              React.createElement('div', { key: 'thumbnail', className: 'project-thumbnail' }),
              React.createElement('div', { key: 'info', className: 'project-info' }, [
                React.createElement('h4', { key: 'name' }, project.name),
                React.createElement('span', { key: 'date' }, project.lastModified.toLocaleDateString())
              ])
            ])
          )
        )
      ]),
      React.createElement('div', { key: 'templates', className: 'project-templates' }, [
        React.createElement('h3', { key: 'title' }, 'Project Templates'),
        React.createElement('div', { key: 'grid', className: 'template-grid' },
          Object.entries(templates).map(([id, template]) =>
            React.createElement('div', {
              key: id,
              className: 'template-item',
              onClick: () => onCreateNew(id)
            }, [
              React.createElement('div', { key: 'thumbnail', className: 'template-thumbnail' }),
              React.createElement('h4', { key: 'name' }, template.name),
              React.createElement('p', { key: 'desc' }, template.description)
            ])
          )
        )
      ])
    ]);
  }

  function AutoSaveIndicator({ project }) {
    const [status, setStatus] = useState('saved');

    useEffect(() => {
      const unsubscribe = global.ProjectManager.subscribe((event, data) => {
        if (data.id === project.id) {
          switch (event) {
            case 'project_saving':
              setStatus('saving');
              break;
            case 'project_saved':
              setStatus('saved');
              break;
            case 'project_modified':
              setStatus('unsaved');
              break;
          }
        }
      });

      return unsubscribe;
    }, [project.id]);

    const statusIcons = {
      saved: '✅',
      saving: '⏳',
      unsaved: '⚠️'
    };

    const statusTexts = {
      saved: 'All changes saved',
      saving: 'Saving...',
      unsaved: 'Unsaved changes'
    };

    return React.createElement('div', {
      className: `auto-save-indicator status-${status}`
    }, [
      React.createElement('span', { key: 'icon' }, statusIcons[status]),
      React.createElement('span', { key: 'text' }, statusTexts[status])
    ]);
  }

  function BatchProgress({ batchId }) {
    const [progress, setProgress] = useState({});

    useEffect(() => {
      const unsubscribe = global.BatchProcessor.subscribe((event, data) => {
        if (data.id === batchId) {
          setProgress(data);
        }
      });

      return unsubscribe;
    }, [batchId]);

    if (!progress.status) return null;

    return React.createElement('div', { className: 'batch-progress' }, [
      React.createElement('div', { key: 'header', className: 'progress-header' }, [
        React.createElement('span', { key: 'name' }, progress.name || 'Batch Operation'),
        React.createElement('span', { key: 'status' }, progress.status)
      ]),
      React.createElement('div', { key: 'bar', className: 'progress-bar' }, [
        React.createElement('div', {
          key: 'fill',
          className: 'progress-fill',
          style: { width: `${progress.progress || 0}%` }
        })
      ]),
      progress.currentOperation !== undefined && React.createElement('div', {
        key: 'details',
        className: 'progress-details'
      }, `Operation ${progress.currentOperation + 1} of ${progress.operations?.length || 0}`)
    ]);
  }

  // Global instances
  const projectManager = new ProjectManager();
  const templateManager = new TemplateManager();
  const batchProcessor = new BatchProcessor(projectManager);

  // Export everything
  global.ProjectManager = projectManager;
  global.TemplateManager = templateManager;
  global.BatchProcessor = batchProcessor;

  // React components
  global.ProjectSelector = ProjectSelector;
  global.AutoSaveIndicator = AutoSaveIndicator;
  global.BatchProgress = BatchProgress;

  // Constants
  global.PROJECT_STATES = PROJECT_STATES;
  global.PROJECT_TYPES = PROJECT_TYPES;
  global.PROJECT_TEMPLATES = PROJECT_TEMPLATES;
  global.AUTO_SAVE_INTERVALS = AUTO_SAVE_INTERVALS;

})(typeof window !== 'undefined' ? window : globalThis);
