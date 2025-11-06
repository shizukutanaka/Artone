'use strict';

(function registerExportManager(global) {
  const MAX_RETRY_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 1000;
  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  const SUPPORTED_FORMATS = ['webm', 'mp4', 'mov'];
  const QUALITY_PRESETS = {
    draft: { bitrate: 1000000, framerate: 24 },
    standard: { bitrate: 2500000, framerate: 30 },
    high: { bitrate: 5000000, framerate: 60 },
    ultra: { bitrate: 8000000, framerate: 60 }
  };

  class MediaRecorderManager {
    constructor() {
      this.recorder = null;
      this.stream = null;
      this.chunks = [];
      this.isRecording = false;
      this.retryCount = 0;
      this.eventListeners = new Map();
      this.exportProgress = 0;
      this.estimatedSize = 0;
    }

    async initialize(canvas, options = {}) {
      try {
        const {
          format = 'webm',
          quality = 'standard',
          width = canvas.width,
          height = canvas.height,
          framerate = 30
        } = options;

        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
          throw new Error('Valid canvas element required');
        }

        // Create stream from canvas
        this.stream = canvas.captureStream(framerate);

        const mimeType = this.getSupportedMimeType(format);
        if (!mimeType) {
          throw new Error(`Unsupported format: ${format}`);
        }

        const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.standard;
        const recorderOptions = {
          mimeType,
          videoBitsPerSecond: preset.bitrate
        };

        this.recorder = new MediaRecorder(this.stream, recorderOptions);
        this.setupEventHandlers();

        return {
          supportedFormats: this.getSupportedFormats(),
          selectedFormat: format,
          qualityPreset: preset,
          dimensions: { width, height }
        };
      } catch (error) {
        console.error('Failed to initialize MediaRecorder:', error);
        throw new Error(`Initialization failed: ${error.message}`);
      }
    }

    getSupportedMimeType(format) {
      const mimeTypes = {
        webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
        mp4: ['video/mp4;codecs=h264', 'video/mp4'],
        mov: ['video/quicktime']
      };

      const candidates = mimeTypes[format] || [];
      for (const mimeType of candidates) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          return mimeType;
        }
      }
      return null;
    }

    getSupportedFormats() {
      return SUPPORTED_FORMATS.filter(format => this.getSupportedMimeType(format) !== null);
    }

    setupEventHandlers() {
      if (!this.recorder) return;

      this.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
          this.updateProgress();
        }
      };

      this.recorder.onstop = () => {
        this.isRecording = false;
        this.emit('recording-stopped', {
          chunks: this.chunks,
          totalSize: this.chunks.reduce((sum, chunk) => sum + chunk.size, 0)
        });
      };

      this.recorder.onerror = (event) => {
        const error = new Error(event.error?.message || 'MediaRecorder error');
        this.handleError(error);
      };

      this.recorder.onwarning = (event) => {
        console.warn('MediaRecorder warning:', event);
        this.emit('warning', event);
      };
    }

    startRecording(timeslice = 1000) {
      if (!this.recorder || this.isRecording) {
        throw new Error('Recorder not ready or already recording');
      }

      return new Promise((resolve, reject) => {
        this.chunks = [];
        this.retryCount = 0;
        this.isRecording = true;
        this.exportProgress = 0;

        const startHandler = () => {
          this.recorder.removeEventListener('start', startHandler);
          this.emit('recording-started');
          resolve();
        };

        this.recorder.addEventListener('start', startHandler, { once: true });
        this.recorder.addEventListener('error', (event) => {
          this.recorder.removeEventListener('start', startHandler);
          reject(new Error(event.error?.message || 'Failed to start recording'));
        }, { once: true });

        this.recorder.start(timeslice);
      });
    }

    async stopRecording() {
      if (!this.recorder || !this.isRecording) {
        throw new Error('No active recording to stop');
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.isRecording) {
            this.forceStop();
            reject(new Error('Recording stop timeout'));
          }
        }, 10000);

        const stopHandler = async () => {
          clearTimeout(timeout);
          try {
            const blob = await this.finalizeRecording();
            resolve(blob);
          } catch (error) {
            if (this.retryCount < MAX_RETRY_ATTEMPTS) {
              await this.retryStopRecording();
              try {
                const blob = await this.finalizeRecording();
                resolve(blob);
              } catch (retryError) {
                reject(retryError);
              }
            } else {
              reject(error);
            }
          }
        };

        this.recorder.addEventListener('stop', stopHandler, { once: true });
        this.recorder.stop();
      });
    }

    forceStop() {
      if (this.recorder && this.isRecording) {
        this.recorder.stop();
        this.isRecording = false;
        this.emit('force-stopped');
      }
    }

    async retryStopRecording() {
      this.retryCount++;
      this.emit('retry-attempt', { attempt: this.retryCount, maxAttempts: MAX_RETRY_ATTEMPTS });

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * this.retryCount));
      return this.finalizeRecording();
    }

    async finalizeRecording() {
      if (this.chunks.length === 0) {
        throw new Error('No recording data available');
      }

      const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
      this.cleanup();

      return blob;
    }

    cleanup() {
      this.chunks = [];
      this.isRecording = false;
      this.retryCount = 0;
      this.exportProgress = 0;

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
    }

    updateProgress() {
      if (this.chunks.length > 0) {
        const totalSize = this.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
        this.exportProgress = Math.min(100, (totalSize / this.estimatedSize) * 100);
        this.emit('progress', { progress: this.exportProgress, size: totalSize });
      }
    }

    setEstimatedSize(size) {
      this.estimatedSize = size;
    }

    on(event, callback) {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
      if (this.eventListeners.has(event)) {
        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }

    emit(event, data) {
      if (this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Event listener error:', error);
          }
        });
      }
    }

    handleError(error) {
      console.error('MediaRecorder error:', error);
      this.emit('error', { error, retryCount: this.retryCount });
    }

    getStats() {
      return {
        isRecording: this.isRecording,
        chunksCount: this.chunks.length,
        totalSize: this.chunks.reduce((sum, chunk) => sum + chunk.size, 0),
        retryCount: this.retryCount,
        progress: this.exportProgress,
        mimeType: this.recorder?.mimeType
      };
    }

    destroy() {
      this.cleanup();
      if (this.recorder) {
        this.recorder = null;
      }
      this.eventListeners.clear();
    }
  }

  class ExportManager {
    constructor() {
      this.recorderManager = new MediaRecorderManager();
      this.isExporting = false;
      this.exportQueue = [];
      this.currentExport = null;
    }

    async exportVideo(canvas, fileName, options = {}) {
      if (this.isExporting) {
        throw new Error('Export already in progress');
      }

      const exportTask = {
        id: `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        canvas,
        fileName,
        options,
        startTime: Date.now()
      };

      return new Promise((resolve, reject) => {
        this.exportQueue.push({ ...exportTask, resolve, reject });
        this.processQueue();
      });
    }

    async processQueue() {
      if (this.isExporting || this.exportQueue.length === 0) {
        return;
      }

      this.isExporting = true;
      const task = this.exportQueue.shift();
      this.currentExport = task;

      try {
        const result = await this.performExport(task);
        task.resolve(result);
      } catch (error) {
        console.error('Export failed:', error);
        task.reject(error);
      } finally {
        this.isExporting = false;
        this.currentExport = null;
        this.processQueue();
      }
    }

    async performExport(task) {
      const { canvas, fileName, options } = task;

      // Initialize recorder
      const config = await this.recorderManager.initialize(canvas, options);

      // Setup event listeners for this export
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          this.recorderManager.off('recording-started', startHandler);
          this.recorderManager.off('recording-stopped', stopHandler);
          this.recorderManager.off('error', errorHandler);
          this.recorderManager.off('progress', progressHandler);
        };

        const startHandler = () => {
          console.log('Recording started for export:', task.id);
        };

        const stopHandler = async (data) => {
          try {
            const blob = await this.recorderManager.finalizeRecording();
            const result = await this.saveExport(blob, fileName, options);
            cleanup();
            resolve(result);
          } catch (error) {
            cleanup();
            reject(error);
          }
        };

        const errorHandler = (errorData) => {
          cleanup();
          reject(new Error(`Export failed: ${errorData.error.message}`));
        };

        const progressHandler = (progressData) => {
          this.emit('export-progress', { ...progressData, exportId: task.id });
        };

        this.recorderManager.on('recording-started', startHandler);
        this.recorderManager.on('recording-stopped', stopHandler);
        this.recorderManager.on('error', errorHandler);
        this.recorderManager.on('progress', progressHandler);

        // Start recording
        this.recorderManager.startRecording(options.timeslice || 1000);
      });
    }

    async saveExport(blob, fileName, options = {}) {
      const { format = 'webm', download = true } = options;

      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || `export_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      return {
        blob,
        url: URL.createObjectURL(blob),
        size: blob.size,
        type: blob.type,
        fileName
      };
    }

    cancelExport(exportId) {
      if (this.currentExport && this.currentExport.id === exportId) {
        this.recorderManager.forceStop();
        return true;
      }

      const index = this.exportQueue.findIndex(task => task.id === exportId);
      if (index > -1) {
        this.exportQueue.splice(index, 1);
        return true;
      }

      return false;
    }

    on(event, callback) {
      this.recorderManager.on(event, callback);
    }

    off(event, callback) {
      this.recorderManager.off(event, callback);
    }

    emit(event, data) {
      this.recorderManager.emit(event, data);
    }

    getStats() {
      return {
        isExporting: this.isExporting,
        queueLength: this.exportQueue.length,
        currentExport: this.currentExport?.id,
        recorderStats: this.recorderManager.getStats()
      };
    }

    destroy() {
      this.recorderManager.destroy();
      this.exportQueue = [];
      this.currentExport = null;
    }
  }

  // Export to global scope
  global.MediaRecorderManager = MediaRecorderManager;
  global.ExportManager = ExportManager;
  global.QUALITY_PRESETS = QUALITY_PRESETS;
  global.SUPPORTED_FORMATS = SUPPORTED_FORMATS;

})(typeof window !== 'undefined' ? window : globalThis);
