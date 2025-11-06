'use strict';

(function registerProxySystem(global) {
  // Advanced proxy system for memory optimization in Artone
  const PROXY_RESOLUTIONS = {
    '4k': { width: 3840, height: 2160, suffix: '_4k_proxy' },
    '2k': { width: 2048, height: 1152, suffix: '_2k_proxy' },
    'fullhd': { width: 1920, height: 1080, suffix: '_fhd_proxy' },
    'hd': { width: 1280, height: 720, suffix: '_hd_proxy' },
    'sd': { width: 854, height: 480, suffix: '_sd_proxy' },
    'preview': { width: 640, height: 360, suffix: '_preview_proxy' }
  };

  const PROXY_QUALITY_PRESETS = {
    'high': {
      codec: 'libx264',
      bitrate: '8M',
      preset: 'fast',
      crf: 18
    },
    'medium': {
      codec: 'libx264',
      bitrate: '4M',
      preset: 'faster',
      crf: 23
    },
    'low': {
      codec: 'libx264',
      bitrate: '2M',
      preset: 'ultrafast',
      crf: 28
    },
    'preview': {
      codec: 'libx264',
      bitrate: '1M',
      preset: 'ultrafast',
      crf: 35
    }
  };

  class ProxyManager {
    constructor() {
      this.proxies = new Map();
      this.proxyCache = new Map();
      this.activeProxies = new Map();
      this.proxyRequests = new Map();
      this.ffmpegManager = null;
      this.isInitialized = false;
      this.onProxyGenerated = null;
      this.onProxyFailed = null;
      this.memoryThreshold = 1024 * 1024 * 1024; // 1GB threshold
      this.currentMemoryUsage = 0;

      this.initialize();
    }

    async initialize() {
      if (this.isInitialized) return;

      // Initialize FFmpeg for proxy generation
      if (typeof FFmpegManager !== 'undefined') {
        this.ffmpegManager = new FFmpegManager();
        await this.ffmpegManager.load();
      }

      this.setupMemoryMonitoring();
      this.isInitialized = true;

      console.log('Proxy manager initialized');
    }

    setupMemoryMonitoring() {
      if (typeof performance !== 'undefined' && performance.memory) {
        // Monitor memory usage
        setInterval(() => {
          this.currentMemoryUsage = performance.memory.usedJSHeapSize;
          this.checkMemoryThreshold();
        }, 5000);
      }
    }

    checkMemoryThreshold() {
      if (this.currentMemoryUsage > this.memoryThreshold) {
        console.warn('Memory usage exceeded threshold, considering proxy generation');
        this.emit('memory-threshold-exceeded', {
          current: this.currentMemoryUsage,
          threshold: this.memoryThreshold
        });
      }
    }

    // Generate proxy for a media file
    async generateProxy(originalFile, options = {}) {
      const {
        resolution = 'preview',
        quality = 'preview',
        force = false
      } = options;

      const proxyId = `${originalFile.id}_${resolution}_${quality}`;

      // Check if proxy already exists
      if (this.proxies.has(proxyId) && !force) {
        return this.proxies.get(proxyId);
      }

      // Check cache
      if (this.proxyCache.has(proxyId)) {
        return this.proxyCache.get(proxyId);
      }

      try {
        const proxy = await this.createProxy(originalFile, resolution, quality);
        this.proxies.set(proxyId, proxy);
        this.proxyCache.set(proxyId, proxy);

        if (this.onProxyGenerated) {
          this.onProxyGenerated(proxy, originalFile);
        }

        return proxy;
      } catch (error) {
        console.error('Proxy generation failed:', error);

        if (this.onProxyFailed) {
          this.onProxyFailed(error, originalFile);
        }

        throw error;
      }
    }

    async createProxy(originalFile, resolution, quality) {
      const resolutionConfig = PROXY_RESOLUTIONS[resolution];
      const qualityConfig = PROXY_QUALITY_PRESETS[quality];

      if (!resolutionConfig || !qualityConfig) {
        throw new Error(`Invalid proxy configuration: ${resolution}/${quality}`);
      }

      const proxyId = `${originalFile.id}_${resolution}_${quality}`;
      const proxyPath = this.generateProxyPath(originalFile.path, resolutionConfig.suffix);

      // Use FFmpeg to create proxy
      if (this.ffmpegManager) {
        await this.ffmpegManager.writeFile('input', originalFile.data);

        const command = [
          '-i', 'input',
          '-vf', `scale=${resolutionConfig.width}:${resolutionConfig.height}`,
          '-c:v', qualityConfig.codec,
          '-b:v', qualityConfig.bitrate,
          '-preset', qualityConfig.preset,
          '-crf', qualityConfig.crf.toString(),
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          'output.mp4'
        ];

        await this.ffmpegManager.run(command.join(' '));
        const proxyData = await this.ffmpegManager.readFile('output.mp4');

        return {
          id: proxyId,
          originalId: originalFile.id,
          path: proxyPath,
          data: proxyData,
          resolution,
          quality,
          width: resolutionConfig.width,
          height: resolutionConfig.height,
          size: proxyData.length,
          created: Date.now(),
          metadata: {
            originalSize: originalFile.data.length,
            compressionRatio: originalFile.data.length / proxyData.length,
            generationTime: Date.now()
          }
        };
      } else {
        // Fallback: create simple proxy using canvas
        return this.createCanvasProxy(originalFile, resolutionConfig, quality);
      }
    }

    createCanvasProxy(originalFile, resolutionConfig, quality) {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        canvas.width = resolutionConfig.width;
        canvas.height = resolutionConfig.height;

        img.onload = () => {
          // Scale down the image
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((blob) => {
            const proxyId = `${originalFile.id}_${resolution}_${quality}`;
            const proxyPath = this.generateProxyPath(originalFile.path, resolutionConfig.suffix);

            resolve({
              id: proxyId,
              originalId: originalFile.id,
              path: proxyPath,
              data: blob,
              resolution,
              quality,
              width: resolutionConfig.width,
              height: resolutionConfig.height,
              size: blob.size,
              created: Date.now(),
              metadata: {
                originalSize: originalFile.data.length,
                compressionRatio: originalFile.data.length / blob.size,
                generationTime: Date.now(),
                method: 'canvas-scaling'
              }
            });
          }, 'image/jpeg', this.getJPEGQualityForProxy(quality));
        };

        img.onerror = () => {
          reject(new Error('Failed to load original file for proxy generation'));
        };

        // Create object URL for the original file
        const originalUrl = URL.createObjectURL(originalFile.data);
        img.src = originalUrl;

        // Clean up
        setTimeout(() => {
          URL.revokeObjectURL(originalUrl);
        }, 1000);
      });
    }

    getJPEGQualityForProxy(quality) {
      const qualityMap = {
        'high': 0.9,
        'medium': 0.7,
        'low': 0.5,
        'preview': 0.3
      };
      return qualityMap[quality] || 0.5;
    }

    generateProxyPath(originalPath, suffix) {
      const lastDot = originalPath.lastIndexOf('.');
      if (lastDot === -1) {
        return originalPath + suffix;
      }
      return originalPath.substring(0, lastDot) + suffix + originalPath.substring(lastDot);
    }

    // Get proxy for a media file
    getProxy(originalFile, resolution = 'preview', quality = 'preview') {
      const proxyId = `${originalFile.id}_${resolution}_${quality}`;
      return this.proxies.get(proxyId) || this.proxyCache.get(proxyId);
    }

    // Get all proxies for a media file
    getProxiesForFile(originalFileId) {
      const proxies = [];
      for (const [proxyId, proxy] of this.proxies) {
        if (proxy.originalId === originalFileId) {
          proxies.push(proxy);
        }
      }
      return proxies;
    }

    // Activate proxy (switch from original to proxy)
    activateProxy(originalFile, resolution = 'preview', quality = 'preview') {
      const proxy = this.getProxy(originalFile, resolution, quality);
      if (!proxy) {
        throw new Error('Proxy not found');
      }

      this.activeProxies.set(originalFile.id, proxy);

      this.emit('proxy-activated', {
        originalFile,
        proxy,
        memorySaved: originalFile.data.length - proxy.size
      });

      return proxy;
    }

    // Deactivate proxy (switch back to original)
    deactivateProxy(originalFile) {
      const activeProxy = this.activeProxies.get(originalFile.id);
      if (activeProxy) {
        this.activeProxies.delete(originalFile.id);

        this.emit('proxy-deactivated', {
          originalFile,
          proxy: activeProxy
        });
      }

      return originalFile;
    }

    // Get active proxy for a file
    getActiveProxy(originalFileId) {
      return this.activeProxies.get(originalFileId);
    }

    // Check if a file should use proxy
    shouldUseProxy(file, threshold = this.memoryThreshold) {
      if (file.data.length > threshold) {
        return true;
      }

      // Check if we have an active proxy
      const activeProxy = this.activeProxies.get(file.id);
      if (activeProxy) {
        return true;
      }

      return false;
    }

    // Automatically manage proxy usage based on memory
    autoManageProxy(file) {
      if (this.shouldUseProxy(file)) {
        // Check if we have a suitable proxy
        const proxy = this.getProxy(file, 'preview', 'preview');
        if (proxy) {
          return this.activateProxy(file, 'preview', 'preview');
        } else {
          // Generate proxy if needed
          this.generateProxy(file, { resolution: 'preview', quality: 'preview' })
            .then(proxy => this.activateProxy(file, 'preview', 'preview'))
            .catch(error => console.warn('Auto proxy generation failed:', error));
        }
      }

      return file;
    }

    // Batch generate proxies for multiple files
    async generateProxiesBatch(files, options = {}) {
      const {
        resolution = 'preview',
        quality = 'preview',
        onProgress = null
      } = options;

      const results = [];
      const total = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          const proxy = await this.generateProxy(file, { resolution, quality });
          results.push({ success: true, file, proxy });
        } catch (error) {
          results.push({ success: false, file, error: error.message });
        }

        if (onProgress) {
          onProgress((i + 1) / total);
        }
      }

      return results;
    }

    // Clean up unused proxies
    cleanupProxies(olderThan = 24 * 60 * 60 * 1000) { // 24 hours default
      const cutoffTime = Date.now() - olderThan;
      const toDelete = [];

      for (const [proxyId, proxy] of this.proxies) {
        if (proxy.created < cutoffTime) {
          // Check if proxy is in use
          if (!this.activeProxies.has(proxy.originalId)) {
            toDelete.push(proxyId);
          }
        }
      }

      for (const proxyId of toDelete) {
        this.proxies.delete(proxyId);
        this.proxyCache.delete(proxyId);
      }

      this.emit('proxies-cleaned', { deletedCount: toDelete.length });
      return toDelete.length;
    }

    // Get proxy statistics
    getProxyStats() {
      const stats = {
        totalProxies: this.proxies.size,
        cachedProxies: this.proxyCache.size,
        activeProxies: this.activeProxies.size,
        memorySaved: 0,
        compressionRatios: []
      };

      for (const proxy of this.proxies.values()) {
        if (proxy.metadata && proxy.metadata.originalSize) {
          stats.memorySaved += (proxy.metadata.originalSize - proxy.size);
          stats.compressionRatios.push(proxy.metadata.compressionRatio);
        }
      }

      if (stats.compressionRatios.length > 0) {
        stats.averageCompressionRatio = stats.compressionRatios.reduce((a, b) => a + b, 0) / stats.compressionRatios.length;
      }

      return stats;
    }

    // Export proxy configuration
    exportProxyConfig() {
      const config = {
        proxies: Array.from(this.proxies.entries()),
        activeProxies: Array.from(this.activeProxies.entries()),
        settings: {
          memoryThreshold: this.memoryThreshold,
          currentMemoryUsage: this.currentMemoryUsage
        },
        exportedAt: Date.now()
      };

      return JSON.stringify(config, null, 2);
    }

    // Import proxy configuration
    importProxyConfig(configData) {
      try {
        const config = JSON.parse(configData);

        this.proxies = new Map(config.proxies || []);
        this.activeProxies = new Map(config.activeProxies || []);

        if (config.settings) {
          this.memoryThreshold = config.settings.memoryThreshold || this.memoryThreshold;
        }

        this.emit('proxy-config-imported', { config });
        return true;
      } catch (error) {
        console.error('Failed to import proxy config:', error);
        throw error;
      }
    }

    // Event system
    on(event, callback) {
      if (!this.eventListeners) {
        this.eventListeners = new Map();
      }
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
      if (this.eventListeners && this.eventListeners.has(event)) {
        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }

    emit(event, data) {
      if (this.eventListeners && this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Proxy manager event handler error:', error);
          }
        });
      }
    }

    // Cleanup
    destroy() {
      this.proxies.clear();
      this.proxyCache.clear();
      this.activeProxies.clear();
      this.proxyRequests.clear();

      if (this.ffmpegManager) {
        this.ffmpegManager.cleanup();
      }
    }
  }

  class ProxyUI {
    constructor(container, proxyManager) {
      this.container = container;
      this.manager = proxyManager;
      this.selectedFile = null;
      this.isGenerating = false;

      this.setupUI();
      this.setupEventListeners();
      this.updateStats();
    }

    setupUI() {
      this.container.innerHTML = `
        <div class="proxy-manager-ui">
          <div class="proxy-toolbar">
            <div class="proxy-info">
              <span class="memory-usage" id="memory-usage">Memory: 0MB</span>
              <span class="proxy-count" id="proxy-count">Proxies: 0</span>
              <span class="memory-saved" id="memory-saved">Saved: 0MB</span>
            </div>
            <div class="proxy-actions">
              <button id="generate-proxies" title="Generate Proxies">Generate</button>
              <button id="cleanup-proxies" title="Cleanup Proxies">Cleanup</button>
              <button id="export-config" title="Export Config">Export</button>
              <button id="import-config" title="Import Config">Import</button>
            </div>
          </div>

          <div class="proxy-settings">
            <div class="setting-group">
              <label for="memory-threshold">Memory Threshold (MB):</label>
              <input type="number" id="memory-threshold" min="100" max="4096" step="100">
            </div>
            <div class="setting-group">
              <label for="default-resolution">Default Proxy Resolution:</label>
              <select id="default-resolution">
                <option value="preview">Preview (640x360)</option>
                <option value="sd">SD (854x480)</option>
                <option value="hd">HD (1280x720)</option>
                <option value="fullhd">Full HD (1920x1080)</option>
                <option value="2k">2K (2048x1152)</option>
                <option value="4k">4K (3840x2160)</option>
              </select>
            </div>
            <div class="setting-group">
              <label for="default-quality">Default Proxy Quality:</label>
              <select id="default-quality">
                <option value="preview">Preview</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div class="setting-group">
              <label for="auto-generate">Auto-generate Proxies:</label>
              <input type="checkbox" id="auto-generate" checked>
            </div>
          </div>

          <div class="proxy-list-container">
            <div class="proxy-list" id="proxy-list"></div>
          </div>

          <div class="generation-progress" id="generation-progress" style="display: none;">
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <div class="progress-text" id="progress-text">Generating proxies...</div>
          </div>
        </div>
      `;

      this.memoryUsage = this.container.querySelector('#memory-usage');
      this.proxyCount = this.container.querySelector('#proxy-count');
      this.memorySaved = this.container.querySelector('#memory-saved');
      this.proxyList = this.container.querySelector('#proxy-list');
      this.generationProgress = this.container.querySelector('#generation-progress');
      this.progressFill = this.container.querySelector('#progress-fill');
      this.progressText = this.container.querySelector('#progress-text');

      // Set initial values
      this.container.querySelector('#memory-threshold').value = Math.round(this.manager.memoryThreshold / (1024 * 1024));
    }

    setupEventListeners() {
      // Toolbar actions
      this.container.querySelector('#generate-proxies').addEventListener('click', () => {
        this.generateProxies();
      });

      this.container.querySelector('#cleanup-proxies').addEventListener('click', () => {
        this.cleanupProxies();
      });

      this.container.querySelector('#export-config').addEventListener('click', () => {
        this.exportConfig();
      });

      this.container.querySelector('#import-config').addEventListener('click', () => {
        this.importConfig();
      });

      // Settings
      this.container.querySelector('#memory-threshold').addEventListener('change', (e) => {
        this.manager.memoryThreshold = e.target.value * 1024 * 1024;
      });

      this.container.querySelector('#auto-generate').addEventListener('change', (e) => {
        this.manager.autoGenerate = e.target.checked;
      });

      // Manager events
      this.manager.on('memory-threshold-exceeded', (data) => {
        this.showNotification('Memory usage high, consider generating proxies', 'warning');
      });

      this.manager.on('proxy-activated', (data) => {
        this.updateStats();
        this.updateProxyList();
        this.showNotification(`Proxy activated for ${data.originalFile.name}, saved ${this.formatBytes(data.memorySaved)}`, 'info');
      });

      this.manager.on('proxies-cleaned', (data) => {
        this.updateStats();
        this.updateProxyList();
        this.showNotification(`Cleaned up ${data.deletedCount} unused proxies`, 'info');
      });

      // Update stats periodically
      setInterval(() => {
        this.updateStats();
      }, 2000);
    }

    generateProxies() {
      const resolution = this.container.querySelector('#default-resolution').value;
      const quality = this.container.querySelector('#default-quality').value;

      // Get files that need proxies
      const filesNeedingProxies = this.getFilesNeedingProxies();

      if (filesNeedingProxies.length === 0) {
        this.showNotification('No files need proxies', 'info');
        return;
      }

      this.isGenerating = true;
      this.generationProgress.style.display = 'block';
      this.progressText.textContent = `Generating proxies for ${filesNeedingProxies.length} files...`;

      this.manager.generateProxiesBatch(filesNeedingProxies, {
        resolution,
        quality,
        onProgress: (progress) => {
          this.progressFill.style.width = `${progress * 100}%`;
          this.progressText.textContent = `Generating proxies... ${Math.round(progress * 100)}%`;
        }
      }).then(results => {
        this.isGenerating = false;
        this.generationProgress.style.display = 'none';

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        this.updateStats();
        this.updateProxyList();

        if (successful > 0) {
          this.showNotification(`Generated ${successful} proxies successfully`, 'success');
        }
        if (failed > 0) {
          this.showNotification(`Failed to generate ${failed} proxies`, 'error');
        }
      }).catch(error => {
        this.isGenerating = false;
        this.generationProgress.style.display = 'none';
        this.showNotification(`Proxy generation failed: ${error.message}`, 'error');
      });
    }

    getFilesNeedingProxies() {
      // This would get files from the media manager
      // For now, return empty array
      return [];
    }

    cleanupProxies() {
      const olderThan = 24 * 60 * 60 * 1000; // 24 hours
      this.manager.cleanupProxies(olderThan);
    }

    exportConfig() {
      try {
        const config = this.manager.exportProxyConfig();
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'proxy_config.json';
        a.click();

        URL.revokeObjectURL(url);
      } catch (error) {
        this.showNotification(`Export failed: ${error.message}`, 'error');
      }
    }

    importConfig() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              this.manager.importProxyConfig(e.target.result);
              this.updateStats();
              this.updateProxyList();
              this.showNotification('Proxy configuration imported successfully', 'success');
            } catch (error) {
              this.showNotification(`Import failed: ${error.message}`, 'error');
            }
          };
          reader.readAsText(file);
        }
      };

      input.click();
    }

    updateStats() {
      if (typeof performance !== 'undefined' && performance.memory) {
        const memoryMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
        this.memoryUsage.textContent = `Memory: ${memoryMB}MB`;
      }

      const stats = this.manager.getProxyStats();
      this.proxyCount.textContent = `Proxies: ${stats.totalProxies}`;
      this.memorySaved.textContent = `Saved: ${this.formatBytes(stats.memorySaved)}`;

      // Update settings
      this.container.querySelector('#memory-threshold').value = Math.round(this.manager.memoryThreshold / (1024 * 1024));
    }

    updateProxyList() {
      const proxies = Array.from(this.manager.proxies.values());
      const activeProxies = Array.from(this.manager.activeProxies.values());

      this.proxyList.innerHTML = proxies.map(proxy => {
        const isActive = activeProxies.some(ap => ap.id === proxy.id);
        const compressionRatio = proxy.metadata?.compressionRatio ?
          (proxy.metadata.compressionRatio).toFixed(1) + 'x' : 'N/A';

        return `
          <div class="proxy-item ${isActive ? 'active' : ''}" data-proxy-id="${proxy.id}">
            <div class="proxy-info">
              <div class="proxy-name">${proxy.id}</div>
              <div class="proxy-details">
                ${proxy.width}x${proxy.height} •
                ${this.formatBytes(proxy.size)} •
                ${compressionRatio} compression
              </div>
            </div>
            <div class="proxy-status">
              <span class="status-indicator ${isActive ? 'active' : 'inactive'}"></span>
              ${isActive ? 'Active' : 'Inactive'}
            </div>
            <div class="proxy-actions">
              <button class="activate-proxy" data-proxy-id="${proxy.id}" title="Activate">✓</button>
              <button class="delete-proxy" data-proxy-id="${proxy.id}" title="Delete">🗑</button>
            </div>
          </div>
        `;
      }).join('');

      // Add event listeners
      this.proxyList.querySelectorAll('.activate-proxy').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const proxyId = e.target.dataset.proxyId;
          this.activateProxy(proxyId);
        });
      });

      this.proxyList.querySelectorAll('.delete-proxy').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const proxyId = e.target.dataset.proxyId;
          this.deleteProxy(proxyId);
        });
      });
    }

    activateProxy(proxyId) {
      const proxy = this.manager.proxies.get(proxyId);
      if (proxy) {
        // This would activate the proxy in the media system
        this.manager.activeProxies.set(proxy.originalId, proxy);
        this.updateProxyList();
      }
    }

    deleteProxy(proxyId) {
      // Remove from manager
      this.manager.proxies.delete(proxyId);
      this.manager.proxyCache.delete(proxyId);
      this.updateProxyList();
    }

    formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.textContent = message;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add('show');
      }, 100);

      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }

    refresh() {
      this.updateStats();
      this.updateProxyList();
    }
  }

  // Export to global scope
  global.ProxyManager = ProxyManager;
  global.ProxyUI = ProxyUI;
  global.PROXY_RESOLUTIONS = PROXY_RESOLUTIONS;
  global.PROXY_QUALITY_PRESETS = PROXY_QUALITY_PRESETS;

})(typeof window !== 'undefined' ? window : globalThis);
