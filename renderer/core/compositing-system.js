'use strict';

(function registerWorkerCompositing(global) {
  // Advanced worker-based compositing system for Artone
  const COMPOSITING_WORKERS = {
    'canvas-compositor': 'Canvas-based composition worker',
    'webgl-compositor': 'WebGL-based composition worker',
    'hybrid-compositor': 'Hybrid composition worker'
  };

  const WORKER_POOL_SIZE = {
    min: 1,
    max: 4,
    default: 2
  };

  class WorkerPool {
    constructor(maxWorkers = WORKER_POOL_SIZE.default) {
      this.workers = [];
      this.availableWorkers = [];
      this.pendingTasks = [];
      this.taskId = 0;
      this.maxWorkers = maxWorkers;
      this.isInitialized = false;
    }

    async initialize() {
      if (this.isInitialized) return;

      // Create worker pool
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = await this.createWorker();
        this.workers.push(worker);
        this.availableWorkers.push(worker);
      }

      this.isInitialized = true;
      console.log(`Worker pool initialized with ${this.maxWorkers} workers`);
    }

    async createWorker() {
      return new Promise((resolve, reject) => {
        const worker = new Worker('/renderer/worker-compositing.js');

        worker.onmessage = (e) => {
          this.handleWorkerMessage(e.data);
        };

        worker.onerror = (error) => {
          console.error('Worker error:', error);
          reject(error);
        };

        worker.onmessageerror = (error) => {
          console.error('Worker message error:', error);
          reject(error);
        };

        // Wait for worker to be ready
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 5000);

        const readyHandler = (e) => {
          if (e.data.type === 'worker-ready') {
            clearTimeout(timeout);
            worker.removeEventListener('message', readyHandler);
            resolve(worker);
          }
        };

        worker.addEventListener('message', readyHandler);
      });
    }

    handleWorkerMessage(data) {
      const { taskId, type, result, error } = data;

      const task = this.pendingTasks.find(t => t.id === taskId);
      if (!task) {
        console.warn('Received message for unknown task:', taskId);
        return;
      }

      if (type === 'task-complete') {
        task.resolve(result);
      } else if (type === 'task-error') {
        task.reject(new Error(error));
      } else if (type === 'progress') {
        if (task.onProgress) {
          task.onProgress(result);
        }
      }

      // Remove from pending tasks
      this.pendingTasks = this.pendingTasks.filter(t => t.id !== taskId);

      // Return worker to pool
      const worker = this.workers.find(w => w.taskId === taskId);
      if (worker) {
        delete worker.taskId;
        this.availableWorkers.push(worker);
      }

      // Process next task
      this.processNextTask();
    }

    async executeTask(taskData, options = {}) {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const taskId = ++this.taskId;

      return new Promise((resolve, reject) => {
        const task = {
          id: taskId,
          data: taskData,
          options,
          resolve,
          reject,
          onProgress: options.onProgress
        };

        this.pendingTasks.push(task);
        this.processNextTask();
      });
    }

    processNextTask() {
      if (this.pendingTasks.length === 0 || this.availableWorkers.length === 0) {
        return;
      }

      const task = this.pendingTasks.shift();
      const worker = this.availableWorkers.shift();

      worker.taskId = task.id;
      worker.postMessage({
        type: 'execute-task',
        taskId: task.id,
        data: task.data,
        options: task.options
      });
    }

    async resizePool(newSize) {
      if (newSize < WORKER_POOL_SIZE.min || newSize > WORKER_POOL_SIZE.max) {
        throw new Error(`Worker pool size must be between ${WORKER_POOL_SIZE.min} and ${WORKER_POOL_SIZE.max}`);
      }

      const currentSize = this.workers.length;
      const delta = newSize - currentSize;

      if (delta > 0) {
        // Add workers
        for (let i = 0; i < delta; i++) {
          const worker = await this.createWorker();
          this.workers.push(worker);
          this.availableWorkers.push(worker);
        }
      } else if (delta < 0) {
        // Remove workers
        const workersToRemove = this.workers.splice(currentSize + delta, -delta);
        workersToRemove.forEach(worker => {
          worker.terminate();
        });

        // Remove from available workers
        this.availableWorkers = this.availableWorkers.filter(w =>
          this.workers.includes(w)
        );
      }

      this.maxWorkers = newSize;
      console.log(`Worker pool resized to ${newSize} workers`);
    }

    getStats() {
      return {
        totalWorkers: this.workers.length,
        availableWorkers: this.availableWorkers.length,
        pendingTasks: this.pendingTasks.length,
        isInitialized: this.isInitialized
      };
    }

    async terminate() {
      for (const worker of this.workers) {
        worker.terminate();
      }

      this.workers = [];
      this.availableWorkers = [];
      this.pendingTasks = [];
      this.isInitialized = false;
    }
  }

  class CompositingManager {
    constructor() {
      this.workerPool = new WorkerPool();
      this.canvasCompositor = null;
      this.webGLCompositor = null;
      this.hybridCompositor = null;
      this.currentCompositor = null;
      this.isEnabled = false;
      this.performanceMode = 'balanced'; // 'quality', 'balanced', 'performance'
      this.onFrameComplete = null;
      this.onError = null;
    }

    async initialize() {
      await this.workerPool.initialize();

      // Initialize different compositor types
      this.canvasCompositor = new CanvasCompositor(this.workerPool);
      this.webGLCompositor = new WebGLCompositor(this.workerPool);
      this.hybridCompositor = new HybridCompositor(this.workerPool);

      // Set default compositor based on capabilities
      this.setCompositor('hybrid');

      this.isEnabled = true;
      console.log('Compositing manager initialized');
    }

    setCompositor(type) {
      const compositors = {
        'canvas': this.canvasCompositor,
        'webgl': this.webGLCompositor,
        'hybrid': this.hybridCompositor
      };

      this.currentCompositor = compositors[type];
      if (!this.currentCompositor) {
        throw new Error(`Unknown compositor type: ${type}`);
      }

      console.log(`Compositor set to: ${type}`);
    }

    setPerformanceMode(mode) {
      if (!['quality', 'balanced', 'performance'].includes(mode)) {
        throw new Error(`Invalid performance mode: ${mode}`);
      }

      this.performanceMode = mode;

      // Adjust worker pool size based on mode
      let workerCount;
      switch (mode) {
        case 'quality':
          workerCount = WORKER_POOL_SIZE.max;
          break;
        case 'balanced':
          workerCount = WORKER_POOL_SIZE.default;
          break;
        case 'performance':
          workerCount = WORKER_POOL_SIZE.min;
          break;
      }

      this.workerPool.resizePool(workerCount);
      console.log(`Performance mode set to: ${mode}, workers: ${workerCount}`);
    }

    async compositeFrame(frameData, options = {}) {
      if (!this.isEnabled || !this.currentCompositor) {
        throw new Error('Compositing not enabled or no compositor available');
      }

      const startTime = performance.now();

      try {
        const result = await this.currentCompositor.composite(frameData, options);

        const endTime = performance.now();
        const duration = endTime - startTime;

        if (this.onFrameComplete) {
          this.onFrameComplete(result, { duration, frameData });
        }

        return result;
      } catch (error) {
        console.error('Frame compositing failed:', error);

        if (this.onError) {
          this.onError(error, frameData);
        }

        throw error;
      }
    }

    async compositeSequence(sequenceData, options = {}) {
      const {
        startFrame = 0,
        endFrame = sequenceData.length - 1,
        onProgress = null,
        onFrame = null
      } = options;

      const frames = [];

      for (let i = startFrame; i <= endFrame; i++) {
        const frameData = sequenceData[i];

        try {
          const frameResult = await this.compositeFrame(frameData, options);

          if (onFrame) {
            onFrame(frameResult, i);
          }

          frames.push(frameResult);
        } catch (error) {
          console.error(`Failed to composite frame ${i}:`, error);
          // Continue with other frames
        }

        if (onProgress) {
          onProgress((i - startFrame + 1) / (endFrame - startFrame + 1));
        }
      }

      return frames;
    }

    getCapabilities() {
      return {
        workerPool: this.workerPool.getStats(),
        currentCompositor: this.currentCompositor ? this.currentCompositor.type : null,
        performanceMode: this.performanceMode,
        isEnabled: this.isEnabled,
        supportedCompositors: ['canvas', 'webgl', 'hybrid']
      };
    }

    async terminate() {
      await this.workerPool.terminate();
      this.isEnabled = false;
    }
  }

  class CanvasCompositor {
    constructor(workerPool) {
      this.workerPool = workerPool;
      this.type = 'canvas';
    }

    async composite(frameData, options = {}) {
      return this.workerPool.executeTask({
        type: 'canvas-composite',
        frameData,
        options
      }, options);
    }
  }

  class WebGLCompositor {
    constructor(workerPool) {
      this.workerPool = workerPool;
      this.type = 'webgl';
    }

    async composite(frameData, options = {}) {
      return this.workerPool.executeTask({
        type: 'webgl-composite',
        frameData,
        options
      }, options);
    }
  }

  class HybridCompositor {
    constructor(workerPool) {
      this.workerPool = workerPool;
      this.canvasCompositor = new CanvasCompositor(workerPool);
      this.webGLCompositor = new WebGLCompositor(workerPool);
      this.type = 'hybrid';
    }

    async composite(frameData, options = {}) {
      const { complexity = this.estimateComplexity(frameData) } = options;

      // Choose compositor based on frame complexity
      if (complexity > 100) {
        // Use WebGL for complex frames
        return this.webGLCompositor.composite(frameData, options);
      } else {
        // Use Canvas for simple frames
        return this.canvasCompositor.composite(frameData, options);
      }
    }

    estimateComplexity(frameData) {
      // Estimate frame complexity based on layers, effects, etc.
      let complexity = 0;

      if (frameData.layers) {
        complexity += frameData.layers.length * 10;
      }

      if (frameData.effects) {
        complexity += frameData.effects.length * 20;
      }

      if (frameData.transitions) {
        complexity += frameData.transitions.length * 15;
      }

      return complexity;
    }
  }

  class CompositingWorker {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.isReady = false;
    }

    async initialize() {
      // Create offscreen canvas
      this.canvas = new OffscreenCanvas(1920, 1080);
      this.ctx = this.canvas.getContext('2d');

      this.isReady = true;
      self.postMessage({ type: 'worker-ready' });
    }

    async handleTask(taskData) {
      const { type, frameData, options } = taskData;

      try {
        let result;

        switch (type) {
          case 'canvas-composite':
            result = await this.canvasComposite(frameData, options);
            break;
          case 'webgl-composite':
            result = await this.webGLComposite(frameData, options);
            break;
          default:
            throw new Error(`Unknown task type: ${type}`);
        }

        return result;
      } catch (error) {
        throw error;
      }
    }

    async canvasComposite(frameData, options) {
      if (!this.isReady) {
        await this.initialize();
      }

      const { width = 1920, height = 1080 } = options;

      // Resize canvas if needed
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }

      // Clear canvas
      this.ctx.clearRect(0, 0, width, height);

      // Composite layers
      if (frameData.layers) {
        for (const layer of frameData.layers) {
          await this.compositeLayer(layer);
        }
      }

      // Apply effects
      if (frameData.effects) {
        for (const effect of frameData.effects) {
          await this.applyEffect(effect);
        }
      }

      // Convert to blob
      const imageBitmap = this.canvas.transferToImageBitmap();
      return imageBitmap;
    }

    async compositeLayer(layer) {
      const { image, x = 0, y = 0, width, height, opacity = 1, blendMode = 'normal' } = layer;

      if (!image) return;

      // Set blend mode
      this.ctx.globalCompositeOperation = this.mapBlendMode(blendMode);

      // Set opacity
      this.ctx.globalAlpha = opacity;

      // Draw image
      if (width && height) {
        this.ctx.drawImage(image, x, y, width, height);
      } else {
        this.ctx.drawImage(image, x, y);
      }

      // Reset
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.globalAlpha = 1;
    }

    async applyEffect(effect) {
      const { type, parameters } = effect;

      switch (type) {
        case 'blur':
          await this.applyBlur(parameters);
          break;
        case 'brightness':
          await this.applyBrightnessContrast(parameters);
          break;
        case 'saturation':
          await this.applySaturation(parameters);
          break;
        default:
          console.warn(`Unknown effect type: ${type}`);
      }
    }

    async applyBlur(parameters) {
      const { radius = 2 } = parameters;

      // Simple box blur implementation
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const data = imageData.data;

      for (let y = 0; y < this.canvas.height; y++) {
        for (let x = 0; x < this.canvas.width; x++) {
          const idx = (y * this.canvas.width + x) * 4;

          let r = 0, g = 0, b = 0, a = 0;
          let count = 0;

          // Sample surrounding pixels
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              const ny = y + dy;

              if (nx >= 0 && nx < this.canvas.width && ny >= 0 && ny < this.canvas.height) {
                const nidx = (ny * this.canvas.width + nx) * 4;
                r += data[nidx];
                g += data[nidx + 1];
                b += data[nidx + 2];
                a += data[nidx + 3];
                count++;
              }
            }
          }

          data[idx] = r / count;
          data[idx + 1] = g / count;
          data[idx + 2] = b / count;
          data[idx + 3] = a / count;
        }
      }

      this.ctx.putImageData(imageData, 0, 0);
    }

    async applyBrightnessContrast(parameters) {
      const { brightness = 0, contrast = 1 } = parameters;

      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        // Apply brightness
        data[i] = Math.min(255, Math.max(0, data[i] + brightness));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + brightness));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + brightness));

        // Apply contrast
        data[i] = ((data[i] - 128) * contrast) + 128;
        data[i + 1] = ((data[i + 1] - 128) * contrast) + 128;
        data[i + 2] = ((data[i + 2] - 128) * contrast) + 128;
      }

      this.ctx.putImageData(imageData, 0, 0);
    }

    async applySaturation(parameters) {
      const { saturation = 1 } = parameters;

      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];

        data[i] = gray + (data[i] - gray) * saturation;
        data[i + 1] = gray + (data[i + 1] - gray) * saturation;
        data[i + 2] = gray + (data[i + 2] - gray) * saturation;
      }

      this.ctx.putImageData(imageData, 0, 0);
    }

    async webGLComposite(frameData, options) {
      // WebGL compositing would be implemented here
      // For now, fall back to canvas
      return this.canvasComposite(frameData, options);
    }

    mapBlendMode(blendMode) {
      const blendModes = {
        'normal': 'source-over',
        'multiply': 'multiply',
        'screen': 'screen',
        'overlay': 'overlay',
        'darken': 'darken',
        'lighten': 'lighten',
        'color-dodge': 'color-dodge',
        'color-burn': 'color-burn',
        'hard-light': 'hard-light',
        'soft-light': 'soft-light',
        'difference': 'difference',
        'exclusion': 'exclusion'
      };

      return blendModes[blendMode] || 'source-over';
    }
  }

  class CompositingUI {
    constructor(container, compositingManager) {
      this.container = container;
      this.manager = compositingManager;
      this.isEnabled = false;

      this.setupUI();
      this.setupEventListeners();
      this.updateStats();
    }

    setupUI() {
      this.container.innerHTML = `
        <div class="compositing-ui">
          <div class="compositing-toolbar">
            <div class="compositing-info">
              <span class="worker-count" id="worker-count">Workers: 0</span>
              <span class="compositor-type" id="compositor-type">Compositor: None</span>
              <span class="performance-mode" id="performance-mode">Mode: Balanced</span>
            </div>
            <div class="compositing-controls">
              <button id="enable-compositing" title="Enable Compositing">Enable</button>
              <button id="disable-compositing" title="Disable Compositing">Disable</button>
              <select id="compositor-select">
                <option value="canvas">Canvas Compositor</option>
                <option value="webgl">WebGL Compositor</option>
                <option value="hybrid">Hybrid Compositor</option>
              </select>
              <select id="performance-select">
                <option value="quality">Quality Mode</option>
                <option value="balanced">Balanced Mode</option>
                <option value="performance">Performance Mode</option>
              </select>
            </div>
          </div>

          <div class="compositing-stats">
            <div class="stat-group">
              <h4>Performance Stats</h4>
              <div class="stat-item">
                <span class="stat-label">Average Frame Time:</span>
                <span class="stat-value" id="avg-frame-time">0ms</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Frames Processed:</span>
                <span class="stat-value" id="frames-processed">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Queue Length:</span>
                <span class="stat-value" id="queue-length">0</span>
              </div>
            </div>

            <div class="stat-group">
              <h4>Worker Stats</h4>
              <div class="stat-item">
                <span class="stat-label">Active Workers:</span>
                <span class="stat-value" id="active-workers">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Available Workers:</span>
                <span class="stat-value" id="available-workers">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Pending Tasks:</span>
                <span class="stat-value" id="pending-tasks">0</span>
              </div>
            </div>
          </div>

          <div class="compositing-preview">
            <canvas id="compositing-preview" width="320" height="180"></canvas>
            <div class="preview-info">
              <span>Preview (320x180)</span>
            </div>
          </div>

          <div class="compositing-actions">
            <button id="test-compositing" title="Test Compositing">Test Composite</button>
            <button id="benchmark-compositing" title="Benchmark">Benchmark</button>
            <button id="reset-stats" title="Reset Statistics">Reset Stats</button>
          </div>
        </div>
      `;

      this.workerCount = this.container.querySelector('#worker-count');
      this.compositorType = this.container.querySelector('#compositor-type');
      this.performanceMode = this.container.querySelector('#performance-mode');
      this.avgFrameTime = this.container.querySelector('#avg-frame-time');
      this.framesProcessed = this.container.querySelector('#frames-processed');
      this.queueLength = this.container.querySelector('#queue-length');
      this.activeWorkers = this.container.querySelector('#active-workers');
      this.availableWorkers = this.container.querySelector('#available-workers');
      this.pendingTasks = this.container.querySelector('#pending-tasks');
      this.previewCanvas = this.container.querySelector('#compositing-preview');
      this.previewCtx = this.previewCanvas.getContext('2d');
    }

    setupEventListeners() {
      // Control buttons
      this.container.querySelector('#enable-compositing').addEventListener('click', () => {
        this.enableCompositing();
      });

      this.container.querySelector('#disable-compositing').addEventListener('click', () => {
        this.disableCompositing();
      });

      this.container.querySelector('#compositor-select').addEventListener('change', (e) => {
        this.setCompositor(e.target.value);
      });

      this.container.querySelector('#performance-select').addEventListener('change', (e) => {
        this.setPerformanceMode(e.target.value);
      });

      // Action buttons
      this.container.querySelector('#test-compositing').addEventListener('click', () => {
        this.testCompositing();
      });

      this.container.querySelector('#benchmark-compositing').addEventListener('click', () => {
        this.benchmarkCompositing();
      });

      this.container.querySelector('#reset-stats').addEventListener('click', () => {
        this.resetStats();
      });

      // Manager events
      this.manager.onFrameComplete = (result, info) => {
        this.updateStats();
        this.updatePreview(result);
      };

      this.manager.onError = (error, frameData) => {
        this.showNotification(`Compositing error: ${error.message}`, 'error');
      };

      // Update stats periodically
      setInterval(() => {
        this.updateStats();
      }, 1000);
    }

    async enableCompositing() {
      try {
        await this.manager.initialize();
        this.isEnabled = true;
        this.updateControls();
        this.showNotification('Worker-based compositing enabled', 'success');
      } catch (error) {
        this.showNotification(`Failed to enable compositing: ${error.message}`, 'error');
      }
    }

    disableCompositing() {
      this.manager.terminate();
      this.isEnabled = false;
      this.updateControls();
      this.showNotification('Worker-based compositing disabled', 'info');
    }

    setCompositor(type) {
      try {
        this.manager.setCompositor(type);
        this.updateControls();
        this.showNotification(`Compositor set to: ${type}`, 'info');
      } catch (error) {
        this.showNotification(`Failed to set compositor: ${error.message}`, 'error');
      }
    }

    setPerformanceMode(mode) {
      try {
        this.manager.setPerformanceMode(mode);
        this.updateControls();
        this.showNotification(`Performance mode set to: ${mode}`, 'info');
      } catch (error) {
        this.showNotification(`Failed to set performance mode: ${error.message}`, 'error');
      }
    }

    async testCompositing() {
      const testFrame = this.createTestFrame();

      try {
        const startTime = performance.now();
        const result = await this.manager.compositeFrame(testFrame);
        const endTime = performance.now();

        this.showNotification(`Test completed in ${Math.round(endTime - startTime)}ms`, 'success');
      } catch (error) {
        this.showNotification(`Test failed: ${error.message}`, 'error');
      }
    }

    async benchmarkCompositing() {
      const testFrames = [];
      for (let i = 0; i < 10; i++) {
        testFrames.push(this.createTestFrame());
      }

      const times = [];

      try {
        for (let i = 0; i < testFrames.length; i++) {
          const startTime = performance.now();
          await this.manager.compositeFrame(testFrames[i]);
          const endTime = performance.now();

          times.push(endTime - startTime);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        this.showNotification(
          `Benchmark: Avg ${Math.round(avgTime)}ms, Min ${Math.round(minTime)}ms, Max ${Math.round(maxTime)}ms`,
          'info'
        );
      } catch (error) {
        this.showNotification(`Benchmark failed: ${error.message}`, 'error');
      }
    }

    createTestFrame() {
      // Create a simple test frame with multiple layers
      return {
        width: 1920,
        height: 1080,
        layers: [
          {
            image: this.createTestImage(1920, 1080, '#ff0000'),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            opacity: 1,
            blendMode: 'normal'
          },
          {
            image: this.createTestImage(400, 300, '#00ff00'),
            x: 100,
            y: 100,
            width: 400,
            height: 300,
            opacity: 0.8,
            blendMode: 'multiply'
          },
          {
            image: this.createTestImage(300, 400, '#0000ff'),
            x: 600,
            y: 200,
            width: 300,
            height: 400,
            opacity: 0.6,
            blendMode: 'screen'
          }
        ],
        effects: [
          {
            type: 'brightness',
            parameters: { brightness: 10, contrast: 1.2 }
          },
          {
            type: 'saturation',
            parameters: { saturation: 1.1 }
          }
        ]
      };
    }

    createTestImage(width, height, color) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);

      return canvas;
    }

    resetStats() {
      // Reset would be implemented in the manager
      this.updateStats();
      this.showNotification('Statistics reset', 'info');
    }

    updateControls() {
      const enableBtn = this.container.querySelector('#enable-compositing');
      const disableBtn = this.container.querySelector('#disable-compositing');
      const compositorSelect = this.container.querySelector('#compositor-select');
      const performanceSelect = this.container.querySelector('#performance-select');

      if (this.manager.isEnabled) {
        enableBtn.disabled = true;
        disableBtn.disabled = false;
      } else {
        enableBtn.disabled = false;
        disableBtn.disabled = true;
      }

      compositorSelect.value = this.manager.currentCompositor ?
        this.manager.currentCompositor.type : 'hybrid';
      performanceSelect.value = this.manager.performanceMode;
    }

    updateStats() {
      const capabilities = this.manager.getCapabilities();

      this.workerCount.textContent = `Workers: ${capabilities.workerPool.totalWorkers}`;
      this.compositorType.textContent = `Compositor: ${capabilities.currentCompositor || 'None'}`;
      this.performanceMode.textContent = `Mode: ${capabilities.performanceMode}`;

      if (capabilities.workerPool) {
        this.activeWorkers.textContent = capabilities.workerPool.availableWorkers;
        this.availableWorkers.textContent = capabilities.workerPool.availableWorkers;
        this.pendingTasks.textContent = capabilities.workerPool.pendingTasks;
      }

      // Update preview
      this.updatePreview();
    }

    updatePreview(frameResult) {
      if (frameResult && this.previewCtx) {
        // Draw preview
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        if (frameResult instanceof ImageBitmap) {
          this.previewCtx.drawImage(frameResult, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
        } else if (frameResult instanceof ImageData) {
          this.previewCtx.putImageData(frameResult, 0, 0);
        }
      }
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
      this.updateControls();
      this.updateStats();
    }
  }

  // Create worker script
  const workerScript = `
    class CompositingWorker {
      constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isReady = false;
      }

      async initialize() {
        this.canvas = new OffscreenCanvas(1920, 1080);
        this.ctx = this.canvas.getContext('2d');
        this.isReady = true;
        self.postMessage({ type: 'worker-ready' });
      }

      async handleTask(taskData) {
        const { type, frameData, options } = taskData;

        try {
          let result;

          switch (type) {
            case 'canvas-composite':
              result = await this.canvasComposite(frameData, options);
              break;
            case 'webgl-composite':
              result = await this.webGLComposite(frameData, options);
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }

          return result;
        } catch (error) {
          throw error;
        }
      }

      async canvasComposite(frameData, options) {
        if (!this.isReady) {
          await this.initialize();
        }

        const { width = 1920, height = 1080 } = options;

        if (this.canvas.width !== width || this.canvas.height !== height) {
          this.canvas.width = width;
          this.canvas.height = height;
        }

        this.ctx.clearRect(0, 0, width, height);

        if (frameData.layers) {
          for (const layer of frameData.layers) {
            await this.compositeLayer(layer);
          }
        }

        if (frameData.effects) {
          for (const effect of frameData.effects) {
            await this.applyEffect(effect);
          }
        }

        const imageBitmap = this.canvas.transferToImageBitmap();
        return imageBitmap;
      }

      async compositeLayer(layer) {
        const { image, x = 0, y = 0, width, height, opacity = 1, blendMode = 'normal' } = layer;

        if (!image) return;

        this.ctx.globalCompositeOperation = this.mapBlendMode(blendMode);
        this.ctx.globalAlpha = opacity;

        if (width && height) {
          this.ctx.drawImage(image, x, y, width, height);
        } else {
          this.ctx.drawImage(image, x, y);
        }

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = 1;
      }

      async applyEffect(effect) {
        // Effect application would be implemented here
        console.log('Applying effect:', effect.type);
      }

      mapBlendMode(blendMode) {
        const blendModes = {
          'normal': 'source-over',
          'multiply': 'multiply',
          'screen': 'screen',
          'overlay': 'overlay',
          'darken': 'darken',
          'lighten': 'lighten'
        };
        return blendModes[blendMode] || 'source-over';
      }
    }

    const worker = new CompositingWorker();

    self.onmessage = async (e) => {
      const { type, taskId, data, options } = e.data;

      try {
        if (type === 'execute-task') {
          const result = await worker.handleTask(data);

          self.postMessage({
            type: 'task-complete',
            taskId,
            result
          });
        }
      } catch (error) {
        self.postMessage({
          type: 'task-error',
          taskId,
          error: error.message
        });
      }
    };
  `;

  // Export to global scope
  global.CompositingManager = CompositingManager;
  global.CompositingUI = CompositingUI;
  global.WorkerPool = WorkerPool;
  global.COMPOSITING_WORKERS = COMPOSITING_WORKERS;
  global.WORKER_POOL_SIZE = WORKER_POOL_SIZE;
  global.workerScript = workerScript;

})(typeof window !== 'undefined' ? window : globalThis);
