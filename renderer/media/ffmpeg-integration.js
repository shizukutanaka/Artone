'use strict';

(function registerFFmpegIntegration(global) {
  // FFmpeg integration for multi-format export with WebAssembly
  const SUPPORTED_FORMATS = {
    // Video formats
    'mp4': {
      extension: 'mp4',
      mimeType: 'video/mp4',
      codec: 'libx264',
      description: 'MP4 (H.264)',
      quality: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']
    },
    'webm': {
      extension: 'webm',
      mimeType: 'video/webm',
      codec: 'libvpx-vp9',
      description: 'WebM (VP9)',
      quality: ['realtime', 'good', 'best']
    },
    'avi': {
      extension: 'avi',
      mimeType: 'video/avi',
      codec: 'libx264',
      description: 'AVI (H.264)',
      quality: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']
    },
    'mov': {
      extension: 'mov',
      mimeType: 'video/quicktime',
      codec: 'libx264',
      description: 'QuickTime (H.264)',
      quality: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']
    },
    'mkv': {
      extension: 'mkv',
      mimeType: 'video/x-matroska',
      codec: 'libx264',
      description: 'Matroska (H.264)',
      quality: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']
    },

    // Audio formats
    'mp3': {
      extension: 'mp3',
      mimeType: 'audio/mpeg',
      codec: 'libmp3lame',
      description: 'MP3 Audio',
      quality: ['320k', '256k', '192k', '128k', '96k', '64k']
    },
    'wav': {
      extension: 'wav',
      mimeType: 'audio/wav',
      codec: 'pcm_s16le',
      description: 'WAV Audio',
      quality: ['44100', '48000', '96000']
    },
    'aac': {
      extension: 'aac',
      mimeType: 'audio/aac',
      codec: 'aac',
      description: 'AAC Audio',
      quality: ['320k', '256k', '192k', '128k', '96k', '64k']
    },
    'ogg': {
      extension: 'ogg',
      mimeType: 'audio/ogg',
      codec: 'libvorbis',
      description: 'OGG Audio',
      quality: ['q10', 'q9', 'q8', 'q7', 'q6', 'q5', 'q4', 'q3', 'q2', 'q1', 'q0']
    },

    // Image formats
    'png': {
      extension: 'png',
      mimeType: 'image/png',
      codec: 'png',
      description: 'PNG Image',
      quality: ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']
    },
    'jpg': {
      extension: 'jpg',
      mimeType: 'image/jpeg',
      codec: 'mjpeg',
      description: 'JPEG Image',
      quality: ['100', '95', '90', '85', '80', '75', '70', '65', '60', '50']
    },
    'gif': {
      extension: 'gif',
      mimeType: 'image/gif',
      codec: 'gif',
      description: 'GIF Animation',
      quality: ['high', 'medium', 'low']
    }
  };

  const QUALITY_PRESETS = {
    'ultra-hd-8k': {
      width: 7680,
      height: 4320,
      fps: 60,
      bitrate: '100M',
      audioBitrate: '512k',
      format: 'mp4',
      codec: 'libx265',
      preset: 'slow'
    },
    'ultra-hd-4k': {
      width: 3840,
      height: 2160,
      fps: 60,
      bitrate: '50M',
      audioBitrate: '320k',
      format: 'mp4',
      codec: 'libx265',
      preset: 'medium'
    },
    'full-hd-1080p': {
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: '8M',
      audioBitrate: '192k',
      format: 'mp4',
      codec: 'libx264',
      preset: 'fast'
    },
    'hd-720p': {
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: '4M',
      audioBitrate: '128k',
      format: 'mp4',
      codec: 'libx264',
      preset: 'faster'
    },
    'sd-480p': {
      width: 854,
      height: 480,
      fps: 24,
      bitrate: '1M',
      audioBitrate: '96k',
      format: 'mp4',
      codec: 'libx264',
      preset: 'ultrafast'
    },
    'web-optimized': {
      width: 1280,
      height: 720,
      fps: 24,
      bitrate: '2M',
      audioBitrate: '96k',
      format: 'webm',
      codec: 'libvpx-vp9',
      preset: 'good'
    },
    'social-media': {
      width: 1080,
      height: 1080,
      fps: 30,
      bitrate: '3M',
      audioBitrate: '128k',
      format: 'mp4',
      codec: 'libx264',
      preset: 'fast'
    },
    'mobile-friendly': {
      width: 640,
      height: 360,
      fps: 24,
      bitrate: '800k',
      audioBitrate: '64k',
      format: 'mp4',
      codec: 'libx264',
      preset: 'ultrafast'
    }
  };

  class FFmpegManager {
    constructor() {
      this.ffmpeg = null;
      this.isLoaded = false;
      this.isLoading = false;
      this.worker = null;
      this.pendingTasks = new Map();
      this.currentTaskId = 0;
    }

    async load(options = {}) {
      if (this.isLoaded) return;
      if (this.isLoading) {
        return new Promise((resolve, reject) => {
          const checkLoaded = () => {
            if (this.isLoaded) {
              resolve();
            } else if (!this.isLoading) {
              reject(new Error('FFmpeg loading failed'));
            } else {
              setTimeout(checkLoaded, 100);
            }
          };
          checkLoaded();
        });
      }

      this.isLoading = true;

      try {
        // Load FFmpeg WebAssembly from local bundle
        // Note: External CDN usage removed for security. Install @ffmpeg/ffmpeg via npm
        const { createFFmpeg } = await import('@ffmpeg/ffmpeg');
        this.ffmpeg = createFFmpeg({
          log: options.log || false,
          progress: (progress) => {
            this.onProgress(progress);
          }
        });

        await this.ffmpeg.load();
        this.isLoaded = true;
        this.isLoading = false;

        console.log('FFmpeg loaded successfully');
      } catch (error) {
        this.isLoading = false;
        console.error('Failed to load FFmpeg:', error);
        throw error;
      }
    }

    async run(command) {
      if (!this.isLoaded) {
        await this.load();
      }

      const taskId = ++this.currentTaskId;
      return new Promise((resolve, reject) => {
        this.pendingTasks.set(taskId, { resolve, reject });

        try {
          this.ffmpeg.run(...command.split(' ').filter(arg => arg.length > 0))
            .then(() => {
              const task = this.pendingTasks.get(taskId);
              if (task) {
                task.resolve();
                this.pendingTasks.delete(taskId);
              }
            })
            .catch((error) => {
              const task = this.pendingTasks.get(taskId);
              if (task) {
                task.reject(error);
                this.pendingTasks.delete(taskId);
              }
            });
        } catch (error) {
          const task = this.pendingTasks.get(taskId);
          if (task) {
            task.reject(error);
            this.pendingTasks.delete(taskId);
          }
        }
      });
    }

    async writeFile(filename, data) {
      if (!this.isLoaded) {
        await this.load();
      }
      this.ffmpeg.FS('writeFile', filename, data);
    }

    async readFile(filename) {
      if (!this.isLoaded) {
        await this.load();
      }
      return this.ffmpeg.FS('readFile', filename);
    }

    onProgress(progress) {
      // Emit progress events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ffmpeg-progress', {
          detail: { progress: progress.ratio * 100 }
        }));
      }
    }

    async transcode(inputFile, outputFile, options = {}) {
      const {
        format = 'mp4',
        codec = 'libx264',
        width = null,
        height = null,
        fps = 30,
        bitrate = '2M',
        audioBitrate = '128k',
        preset = 'fast',
        quality = null,
        startTime = null,
        duration = null,
        audioCodec = 'aac'
      } = options;

      let command = [];

      // Input file
      command.push('-i', inputFile);

      // Video settings
      if (width && height) {
        command.push('-vf', `scale=${width}:${height}`);
      }

      if (fps) {
        command.push('-r', fps.toString());
      }

      if (bitrate) {
        command.push('-b:v', bitrate);
      }

      if (preset) {
        command.push('-preset', preset);
      }

      if (quality !== null) {
        command.push('-crf', quality.toString());
      }

      // Audio settings
      if (audioBitrate) {
        command.push('-b:a', audioBitrate);
      }

      if (audioCodec) {
        command.push('-c:a', audioCodec);
      }

      // Time range
      if (startTime !== null) {
        command.push('-ss', startTime.toString());
      }

      if (duration !== null) {
        command.push('-t', duration.toString());
      }

      // Output settings
      command.push('-c:v', codec);
      command.push(outputFile);

      console.log('FFmpeg command:', command.join(' '));
      return this.run(command.join(' '));
    }

    async extractAudio(inputFile, outputFile, options = {}) {
      const {
        audioCodec = 'mp3',
        audioBitrate = '128k',
        startTime = null,
        duration = null
      } = options;

      let command = ['-i', inputFile];

      if (startTime !== null) {
        command.push('-ss', startTime.toString());
      }

      if (duration !== null) {
        command.push('-t', duration.toString());
      }

      command.push('-vn', '-c:a', audioCodec);

      if (audioBitrate) {
        command.push('-b:a', audioBitrate);
      }

      command.push(outputFile);

      return this.run(command.join(' '));
    }

    async createThumbnail(inputFile, outputFile, options = {}) {
      const {
        time = 1,
        width = 320,
        height = 240,
        quality = 75
      } = options;

      const command = [
        '-i', inputFile,
        '-ss', time.toString(),
        '-vframes', '1',
        '-vf', `scale=${width}:${height}`,
        '-q:v', quality.toString(),
        outputFile
      ];

      return this.run(command.join(' '));
    }

    async getVideoInfo(inputFile) {
      const command = [
        '-i', inputFile,
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams'
      ];

      try {
        await this.run(command.join(' '));
        const output = await this.readFile('ffprobe_output.json');
        return JSON.parse(new TextDecoder().decode(output));
      } catch (error) {
        console.error('Failed to get video info:', error);
        return null;
      }
    }

    async concatenateVideos(inputFiles, outputFile, options = {}) {
      const {
        format = 'mp4',
        codec = 'libx264',
        bitrate = '2M',
        audioCodec = 'aac',
        audioBitrate = '128k'
      } = options;

      // Create input file list
      const listContent = inputFiles.map((file, index) =>
        `file '${file}'`
      ).join('\n');

      await this.writeFile('concat_list.txt', new TextEncoder().encode(listContent));

      const command = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c:v', codec,
        '-b:v', bitrate,
        '-c:a', audioCodec,
        '-b:a', audioBitrate,
        outputFile
      ];

      return this.run(command.join(' '));
    }

    async addWatermark(inputFile, outputFile, watermarkFile, options = {}) {
      const {
        position = 'bottomright',
        margin = 10
      } = options;

      const positions = {
        topright: `W-w-${margin}:${margin}`,
        topleft: `${margin}:${margin}`,
        bottomright: `W-w-${margin}:H-h-${margin}`,
        bottomleft: `${margin}:H-h-${margin}`,
        center: `(W-w)/2:(H-h)/2`
      };

      const filter = `overlay=${positions[position] || positions.bottomright}`;

      const command = [
        '-i', inputFile,
        '-i', watermarkFile,
        '-filter_complex', filter,
        '-c:a', 'copy',
        outputFile
      ];

      return this.run(command.join(' '));
    }

    async applyEffects(inputFile, outputFile, effects = [], options = {}) {
      const {
        codec = 'libx264',
        bitrate = '2M',
        audioCodec = 'aac',
        audioBitrate = '128k'
      } = options;

      const filters = effects.map(effect => {
        switch (effect.type) {
          case 'blur':
            return `boxblur=${effect.radius || 2}`;
          case 'brightness':
            return `brightness=${effect.value || 0.1}`;
          case 'contrast':
            return `contrast=${effect.value || 1.2}`;
          case 'saturation':
            return `saturation=${effect.value || 1.5}`;
          case 'hue':
            return `hue=h=${effect.value || 90}`;
          case 'grayscale':
            return 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3';
          case 'sepia':
            return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
          case 'vintage':
            return 'curves=vintage';
          case 'sharpen':
            return 'unsharp=5:5:1.0:5:5:0.0';
          case 'noise':
            return `noise=alls=${effect.amount || 20}:allf=t+u`;
          default:
            return null;
        }
      }).filter(f => f !== null);

      if (filters.length === 0) {
        throw new Error('No valid effects specified');
      }

      const filterString = filters.join(',');
      const command = [
        '-i', inputFile,
        '-vf', filterString,
        '-c:v', codec,
        '-b:v', bitrate,
        '-c:a', audioCodec,
        '-b:a', audioBitrate,
        outputFile
      ];

      return this.run(command.join(' '));
    }

    async cleanup() {
      if (this.ffmpeg) {
        this.ffmpeg.exit();
      }
      this.isLoaded = false;
      this.isLoading = false;
      this.pendingTasks.clear();
    }
  }

  class MultiFormatExporter {
    constructor() {
      this.ffmpegManager = new FFmpegManager();
      this.exportQueue = [];
      this.isExporting = false;
      this.currentExport = null;
      this.progressCallback = null;
    }

    async initialize() {
      await this.ffmpegManager.load({ log: false });
      this.setupProgressListener();
    }

    setupProgressListener() {
      if (typeof window !== 'undefined') {
        window.addEventListener('ffmpeg-progress', (event) => {
          if (this.progressCallback) {
            this.progressCallback(event.detail.progress);
          }
        });
      }
    }

    setProgressCallback(callback) {
      this.progressCallback = callback;
    }

    async exportVideo(inputData, outputConfig, options = {}) {
      const {
        format = 'mp4',
        quality = 'hd-720p',
        effects = [],
        watermark = null,
        startTime = null,
        duration = null,
        metadata = {}
      } = options;

      const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS['hd-720p'];
      const formatInfo = SUPPORTED_FORMATS[format] || SUPPORTED_FORMATS['mp4'];

      // Create export task
      const task = {
        id: `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        inputData,
        outputConfig: {
          ...preset,
          format: formatInfo.extension,
          mimeType: formatInfo.mimeType
        },
        options: {
          ...options,
          effects,
          watermark,
          startTime,
          duration,
          metadata
        },
        status: 'queued',
        progress: 0,
        startTime: null,
        endTime: null
      };

      return new Promise((resolve, reject) => {
        this.exportQueue.push({ ...task, resolve, reject });
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
        task.status = 'processing';
        task.startTime = Date.now();

        const result = await this.performExport(task);

        task.status = 'completed';
        task.endTime = Date.now();
        task.result = result;

        task.resolve(result);
      } catch (error) {
        task.status = 'failed';
        task.endTime = Date.now();
        task.error = error;

        console.error('Export failed:', error);
        task.reject(error);
      } finally {
        this.isExporting = false;
        this.currentExport = null;
        this.processQueue();
      }
    }

    async performExport(task) {
      const { inputData, outputConfig, options } = task;

      // Generate filenames
      const inputFile = 'input.webm';
      const outputFile = `output.${outputConfig.format}`;

      // Write input data
      await this.ffmpegManager.writeFile(inputFile, inputData);

      // Apply effects if specified
      if (options.effects && options.effects.length > 0) {
        const effectFile = 'effect.webm';
        await this.ffmpegManager.applyEffects(inputFile, effectFile, options.effects, {
          codec: outputConfig.codec,
          bitrate: outputConfig.bitrate,
          audioCodec: 'aac',
          audioBitrate: outputConfig.audioBitrate
        });
        await this.ffmpegManager.writeFile(inputFile, await this.ffmpegManager.readFile(effectFile));
      }

      // Add watermark if specified
      if (options.watermark) {
        const watermarkFile = 'watermark.png';
        await this.ffmpegManager.writeFile(watermarkFile, options.watermark);
        await this.ffmpegManager.addWatermark(inputFile, 'watermarked.webm', watermarkFile, {
          position: options.watermarkPosition || 'bottomright',
          margin: options.watermarkMargin || 10
        });
        await this.ffmpegManager.writeFile(inputFile, await this.ffmpegManager.readFile('watermarked.webm'));
      }

      // Perform transcoding
      await this.ffmpegManager.transcode(inputFile, outputFile, {
        format: outputConfig.format,
        codec: outputConfig.codec,
        width: outputConfig.width,
        height: outputConfig.height,
        fps: outputConfig.fps,
        bitrate: outputConfig.bitrate,
        audioBitrate: outputConfig.audioBitrate,
        preset: outputConfig.preset,
        startTime: options.startTime,
        duration: options.duration
      });

      // Read output data
      const outputData = await this.ffmpegManager.readFile(outputFile);

      // Add metadata if specified
      if (options.metadata && Object.keys(options.metadata).length > 0) {
        // Metadata would be added here in a real implementation
      }

      return {
        data: outputData,
        format: outputConfig.format,
        mimeType: outputConfig.mimeType,
        size: outputData.length,
        duration: task.endTime - task.startTime,
        metadata: {
          width: outputConfig.width,
          height: outputConfig.height,
          fps: outputConfig.fps,
          bitrate: outputConfig.bitrate
        }
      };
    }

    async exportAudio(inputData, outputConfig, options = {}) {
      const {
        format = 'mp3',
        quality = '128k',
        startTime = null,
        duration = null
      } = options;

      const formatInfo = SUPPORTED_FORMATS[format] || SUPPORTED_FORMATS['mp3'];

      const task = {
        id: `audio_export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        inputData,
        outputConfig: {
          format: formatInfo.extension,
          mimeType: formatInfo.mimeType,
          quality
        },
        options,
        status: 'queued'
      };

      return new Promise((resolve, reject) => {
        this.exportQueue.push({ ...task, resolve, reject });
        this.processQueue();
      });
    }

    async performAudioExport(task) {
      const { inputData, outputConfig, options } = task;

      const inputFile = 'input.webm';
      const outputFile = `output.${outputConfig.format}`;

      await this.ffmpegManager.writeFile(inputFile, inputData);

      await this.ffmpegManager.extractAudio(inputFile, outputFile, {
        audioCodec: outputConfig.format === 'mp3' ? 'libmp3lame' :
                   outputConfig.format === 'aac' ? 'aac' :
                   outputConfig.format === 'ogg' ? 'libvorbis' :
                   'libmp3lame',
        audioBitrate: outputConfig.quality,
        startTime: options.startTime,
        duration: options.duration
      });

      const outputData = await this.ffmpegManager.readFile(outputFile);

      return {
        data: outputData,
        format: outputConfig.format,
        mimeType: outputConfig.mimeType,
        size: outputData.length
      };
    }

    async createThumbnail(inputData, options = {}) {
      const {
        time = 1,
        width = 320,
        height = 240,
        format = 'jpg',
        quality = 75
      } = options;

      const formatInfo = SUPPORTED_FORMATS[format] || SUPPORTED_FORMATS['jpg'];

      const task = {
        id: `thumbnail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        inputData,
        outputConfig: {
          format: formatInfo.extension,
          mimeType: formatInfo.mimeType,
          width,
          height,
          time,
          quality
        },
        status: 'queued'
      };

      return new Promise((resolve, reject) => {
        this.exportQueue.push({ ...task, resolve, reject });
        this.processQueue();
      });
    }

    async performThumbnailExport(task) {
      const { inputData, outputConfig } = task;

      const inputFile = 'input.webm';
      const outputFile = `thumbnail.${outputConfig.format}`;

      await this.ffmpegManager.writeFile(inputFile, inputData);

      await this.ffmpegManager.createThumbnail(inputFile, outputFile, {
        time: outputConfig.time,
        width: outputConfig.width,
        height: outputConfig.height,
        quality: outputConfig.quality
      });

      const outputData = await this.ffmpegManager.readFile(outputFile);

      return {
        data: outputData,
        format: outputConfig.format,
        mimeType: outputConfig.mimeType,
        size: outputData.length
      };
    }

    getSupportedFormats() {
      return Object.keys(SUPPORTED_FORMATS).map(format => ({
        format,
        ...SUPPORTED_FORMATS[format]
      }));
    }

    getQualityPresets() {
      return Object.keys(QUALITY_PRESETS).map(preset => ({
        preset,
        ...QUALITY_PRESETS[preset]
      }));
    }

    getExportStatus() {
      return {
        isExporting: this.isExporting,
        queueLength: this.exportQueue.length,
        currentExport: this.currentExport ? {
          id: this.currentExport.id,
          status: this.currentExport.status,
          progress: this.currentExport.progress
        } : null
      };
    }

    cancelExport(taskId) {
      const index = this.exportQueue.findIndex(task => task.id === taskId);
      if (index > -1) {
        this.exportQueue.splice(index, 1);
        return true;
      }

      if (this.currentExport && this.currentExport.id === taskId) {
        // Cancel current export
        this.currentExport.status = 'cancelled';
        return true;
      }

      return false;
    }

    async cleanup() {
      await this.ffmpegManager.cleanup();
      this.exportQueue = [];
      this.currentExport = null;
    }
  }

  // Create global instances
  const ffmpegManager = new FFmpegManager();
  const multiFormatExporter = new MultiFormatExporter();

  // Export to global scope
  global.FFmpegManager = ffmpegManager;
  global.MultiFormatExporter = multiFormatExporter;
  global.SUPPORTED_FORMATS = SUPPORTED_FORMATS;
  global.QUALITY_PRESETS = QUALITY_PRESETS;

})(typeof window !== 'undefined' ? window : globalThis);
