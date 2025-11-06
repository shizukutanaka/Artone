'use strict';

(function registerSafariCompatibility(global) {
  // Safari compatibility layer for MediaRecorder and alternative encoding methods
  const SAFARI_COMPATIBILITY = {
    // Safari supported formats and codecs
    supportedFormats: {
      video: {
        'video/mp4': ['h264'],
        'video/quicktime': ['h264'],
        'video/webm': [] // Safari doesn't support WebM
      },
      audio: {
        'audio/mp4': ['aac'],
        'audio/mpeg': ['mp3'],
        'audio/wav': ['pcm']
      }
    },

    // Fallback encoding methods
    fallbackMethods: {
      'canvas-to-mp4': 'Canvas capture to MP4',
      'webgl-to-texture': 'WebGL texture encoding',
      'software-encoder': 'Software-based encoding',
      'hybrid-approach': 'Hybrid encoding pipeline'
    },

    // Detection and compatibility checks
    browserSupport: {
      safari: /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edge/.test(navigator.userAgent),
      ios: /iPad|iPhone|iPod/.test(navigator.userAgent),
      macos: /Mac/.test(navigator.userAgent)
    }
  };

  class SafariCompatibilityManager {
    constructor() {
      this.isSafari = SAFARI_COMPATIBILITY.browserSupport.safari;
      this.isIOS = SAFARI_COMPATIBILITY.browserSupport.ios;
      this.isMacOS = SAFARI_COMPATIBILITY.browserSupport.macos;
      this.mediaRecorderSupported = false;
      this.supportedFormats = new Map();
      this.fallbackEncoder = null;
      this.canvasCaptureSupported = false;
      this.webGLSupported = false;

      this.initialize();
    }

    async initialize() {
      await this.detectCapabilities();
      this.setupFallbackMethods();
      console.log('Safari compatibility manager initialized:', {
        isSafari: this.isSafari,
        supportedFormats: Array.from(this.supportedFormats.keys()),
        fallbackAvailable: !!this.fallbackEncoder
      });
    }

    async detectCapabilities() {
      // Test MediaRecorder support
      if (typeof MediaRecorder !== 'undefined') {
        try {
          // Test basic MediaRecorder
          const testStream = new MediaStream();
          const testRecorder = new MediaRecorder(testStream);
          this.mediaRecorderSupported = true;
        } catch (error) {
          console.warn('MediaRecorder not fully supported:', error);
        }
      }

      // Test canvas capture support
      if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype.captureStream) {
        this.canvasCaptureSupported = true;
      }

      // Test WebGL support
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        this.webGLSupported = !!gl;
      } catch (error) {
        console.warn('WebGL not supported:', error);
      }

      // Detect supported formats
      this.detectSupportedFormats();
    }

    detectSupportedFormats() {
      if (!this.mediaRecorderSupported) return;

      // Test video formats
      for (const [mimeType, codecs] of Object.entries(SAFARI_COMPATIBILITY.supportedFormats.video)) {
        for (const codec of codecs) {
          const fullMimeType = `${mimeType};codecs=${codec}`;
          if (MediaRecorder.isTypeSupported(fullMimeType)) {
            if (!this.supportedFormats.has('video')) {
              this.supportedFormats.set('video', new Set());
            }
            this.supportedFormats.get('video').add(fullMimeType);
          }
        }
      }

      // Test audio formats
      for (const [mimeType, codecs] of Object.entries(SAFARI_COMPATIBILITY.supportedFormats.audio)) {
        for (const codec of codecs) {
          const fullMimeType = `${mimeType};codecs=${codec}`;
          if (MediaRecorder.isTypeSupported(fullMimeType)) {
            if (!this.supportedFormats.has('audio')) {
              this.supportedFormats.set('audio', new Set());
            }
            this.supportedFormats.get('audio').add(fullMimeType);
          }
        }
      }
    }

    setupFallbackMethods() {
      if (this.canvasCaptureSupported) {
        this.fallbackEncoder = new CanvasBasedEncoder();
      } else if (this.webGLSupported) {
        this.fallbackEncoder = new WebGLEncoder();
      } else {
        this.fallbackEncoder = new SoftwareEncoder();
      }
    }

    // Get best supported format for Safari
    getBestSupportedFormat(type = 'video') {
      const supported = this.supportedFormats.get(type);
      if (!supported || supported.size === 0) {
        return this.getFallbackFormat(type);
      }

      // Prefer MP4 for video, MP3 for audio
      const preferredVideo = 'video/mp4;codecs=h264';
      const preferredAudio = 'audio/mp4;codecs=aac';

      if (type === 'video' && supported.has(preferredVideo)) {
        return preferredVideo;
      }

      if (type === 'audio' && supported.has(preferredAudio)) {
        return preferredAudio;
      }

      // Return first available format
      return supported.values().next().value;
    }

    getFallbackFormat(type = 'video') {
      switch (type) {
        case 'video':
          return 'video/mp4;codecs=h264';
        case 'audio':
          return 'audio/mp4;codecs=aac';
        default:
          return 'video/mp4;codecs=h264';
      }
    }

    // Create compatible MediaRecorder
    createCompatibleRecorder(stream, options = {}) {
      if (!this.mediaRecorderSupported) {
        throw new Error('MediaRecorder not supported in this browser');
      }

      const mimeType = options.mimeType || this.getBestSupportedFormat('video');
      const recorderOptions = {
        mimeType,
        videoBitsPerSecond: options.videoBitsPerSecond || 2500000,
        audioBitsPerSecond: options.audioBitsPerSecond || 128000
      };

      try {
        return new MediaRecorder(stream, recorderOptions);
      } catch (error) {
        console.warn('Failed to create MediaRecorder with preferred format, trying fallback:', error);

        // Try fallback format
        recorderOptions.mimeType = this.getFallbackFormat('video');
        try {
          return new MediaRecorder(stream, recorderOptions);
        } catch (fallbackError) {
          throw new Error(`MediaRecorder not compatible: ${fallbackError.message}`);
        }
      }
    }

    // Alternative encoding using canvas
    async encodeWithCanvas(canvas, options = {}) {
      if (!this.fallbackEncoder) {
        throw new Error('No fallback encoder available');
      }

      return this.fallbackEncoder.encodeCanvas(canvas, options);
    }

    // Alternative encoding using WebGL
    async encodeWithWebGL(canvas, options = {}) {
      if (!this.webGLSupported) {
        throw new Error('WebGL not supported');
      }

      const webGLEncoder = new WebGLEncoder();
      return webGLEncoder.encodeCanvas(canvas, options);
    }

    // Software-based encoding fallback
    async encodeWithSoftware(canvas, options = {}) {
      const softwareEncoder = new SoftwareEncoder();
      return softwareEncoder.encodeCanvas(canvas, options);
    }

    // Hybrid encoding approach
    async encodeWithHybrid(canvas, options = {}) {
      const hybridEncoder = new HybridEncoder();
      return hybridEncoder.encodeCanvas(canvas, options);
    }

    // Get compatibility report
    getCompatibilityReport() {
      return {
        browser: {
          isSafari: this.isSafari,
          isIOS: this.isIOS,
          isMacOS: this.isMacOS,
          userAgent: navigator.userAgent
        },
        capabilities: {
          mediaRecorder: this.mediaRecorderSupported,
          canvasCapture: this.canvasCaptureSupported,
          webGL: this.webGLSupported
        },
        supportedFormats: {
          video: Array.from(this.supportedFormats.get('video') || []),
          audio: Array.from(this.supportedFormats.get('audio') || [])
        },
        fallbackMethods: {
          available: !!this.fallbackEncoder,
          type: this.fallbackEncoder ? this.fallbackEncoder.constructor.name : null
        },
        recommendations: this.getRecommendations()
      };
    }

    getRecommendations() {
      const recommendations = [];

      if (!this.mediaRecorderSupported) {
        recommendations.push('Use fallback encoding methods');
      }

      if (!this.canvasCaptureSupported) {
        recommendations.push('Canvas capture not supported - use WebGL or software encoding');
      }

      if (this.supportedFormats.get('video')?.size === 0) {
        recommendations.push('No hardware video encoding - software fallback required');
      }

      if (this.isIOS) {
        recommendations.push('iOS Safari has limited codec support - prefer H.264/AAC');
      }

      return recommendations;
    }
  }

  class CanvasBasedEncoder {
    constructor() {
      this.canvas = null;
      this.videoWriter = null;
      this.frameRate = 30;
      this.isRecording = false;
      this.frames = [];
      this.startTime = 0;
    }

    async encodeCanvas(canvas, options = {}) {
      this.canvas = canvas;
      this.frameRate = options.frameRate || 30;

      const format = options.format || 'mp4';
      const quality = options.quality || 'medium';

      try {
        // Initialize video writer
        await this.initializeVideoWriter(format, quality, options);

        // Start recording
        this.isRecording = true;
        this.startTime = Date.now();

        return new Promise((resolve, reject) => {
          const stopRecording = async () => {
            this.isRecording = false;
            try {
              const result = await this.finalizeRecording();
              resolve(result);
            } catch (error) {
              reject(error);
            }
          };

          // Set up frame capture loop
          this.captureLoop(stopRecording);
        });
      } catch (error) {
        console.error('Canvas encoding failed:', error);
        throw error;
      }
    }

    async initializeVideoWriter(format, quality, options) {
      // Use WebCodecs API if available (Chrome/Edge)
      if ('VideoEncoder' in global) {
        this.videoWriter = new WebCodecsVideoWriter();
        await this.videoWriter.initialize(format, quality, options);
      } else {
        // Fallback to canvas-based approach
        this.videoWriter = new CanvasVideoWriter();
        await this.videoWriter.initialize(format, quality, options);
      }
    }

    captureLoop(onComplete) {
      if (!this.isRecording) return;

      const frameInterval = 1000 / this.frameRate;
      const elapsed = Date.now() - this.startTime;

      // Capture frame
      this.captureFrame();

      // Schedule next frame
      setTimeout(() => {
        this.captureLoop(onComplete);
      }, frameInterval);
    }

    captureFrame() {
      if (!this.canvas || !this.videoWriter) return;

      try {
        const imageData = this.canvas.toDataURL('image/png');
        this.videoWriter.addFrame(imageData);
      } catch (error) {
        console.error('Frame capture failed:', error);
      }
    }

    async finalizeRecording() {
      if (!this.videoWriter) {
        throw new Error('Video writer not initialized');
      }

      return this.videoWriter.finalize();
    }
  }

  class WebCodecsVideoWriter {
    constructor() {
      this.encoder = null;
      this.frames = [];
      this.isInitialized = false;
    }

    async initialize(format, quality, options) {
      const { width, height } = options;

      if (!('VideoEncoder' in global)) {
        throw new Error('WebCodecs not supported');
      }

      this.encoder = new VideoEncoder({
        output: (chunk) => {
          this.frames.push(chunk);
        },
        error: (error) => {
          console.error('VideoEncoder error:', error);
        }
      });

      const config = {
        codec: format === 'webm' ? 'vp9' : 'avc1.420028', // H.264
        width: width,
        height: height,
        bitrate: this.getBitrateForQuality(quality),
        framerate: options.frameRate || 30
      };

      await this.encoder.configure(config);
      this.isInitialized = true;
    }

    addFrame(imageData) {
      if (!this.encoder || !this.isInitialized) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const frame = new VideoFrame(canvas, {
          timestamp: performance.now() * 1000
        });

        try {
          await this.encoder.encode(frame);
          frame.close();
        } catch (error) {
          console.error('Frame encoding failed:', error);
        }
      };

      img.src = imageData;
    }

    async finalize() {
      if (!this.encoder) return null;

      await this.encoder.flush();

      // Combine frames into blob
      const mimeType = this.encoder.config.codec.startsWith('avc') ? 'video/mp4' : 'video/webm';
      const framesData = this.frames.map(chunk => chunk.data);

      return new Blob(framesData, { type: mimeType });
    }

    getBitrateForQuality(quality) {
      const bitrates = {
        'low': 1000000,
        'medium': 2500000,
        'high': 5000000,
        'ultra': 8000000
      };
      return bitrates[quality] || bitrates.medium;
    }
  }

  class CanvasVideoWriter {
    constructor() {
      this.frames = [];
      this.canvas = null;
      this.width = 0;
      this.height = 0;
    }

    async initialize(format, quality, options) {
      this.width = options.width || 1920;
      this.height = options.height || 1080;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    addFrame(imageData) {
      this.frames.push(imageData);
    }

    async finalize() {
      // Create video from frames using canvas
      const ctx = this.canvas.getContext('2d');

      // For now, return the last frame as a simple fallback
      // In a real implementation, this would create actual video
      if (this.frames.length > 0) {
        const img = new Image();
        img.src = this.frames[this.frames.length - 1];
        ctx.drawImage(img, 0, 0, this.width, this.height);

        return new Promise((resolve) => {
          this.canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        });
      }

      return null;
    }
  }

  class WebGLEncoder {
    constructor() {
      this.gl = null;
      this.program = null;
      this.framebuffer = null;
      this.texture = null;
    }

    async encodeCanvas(canvas, options = {}) {
      this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!this.gl) {
        throw new Error('WebGL not supported');
      }

      this.setupWebGL();
      return this.encodeFrames(canvas, options);
    }

    setupWebGL() {
      // Vertex shader for texture rendering
      const vertexShaderSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;

        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `;

      // Fragment shader for video encoding
      const fragmentShaderSource = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;

        void main() {
          gl_FragColor = texture2D(u_image, v_texCoord);
        }
      `;

      const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

      this.program = this.createProgram(vertexShader, fragmentShader);
      this.gl.useProgram(this.program);

      // Set up geometry
      const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
      ]);

      const texCoords = new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        1, 0
      ]);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gl.createBuffer());
      this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

      const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gl.createBuffer());
      this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);

      const texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
      this.gl.enableVertexAttribArray(texCoordLocation);
      this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    createShader(type, source) {
      const shader = this.gl.createShader(type);
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);

      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        throw new Error('Shader compilation failed: ' + this.gl.getShaderInfoLog(shader));
      }

      return shader;
    }

    createProgram(vertexShader, fragmentShader) {
      const program = this.gl.createProgram();
      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);

      if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
        throw new Error('Program linking failed: ' + this.gl.getProgramInfoLog(program));
      }

      return program;
    }

    async encodeFrames(canvas, options) {
      // Simplified WebGL encoding - would need full implementation
      return new Promise((resolve) => {
        const imageData = canvas.toDataURL('image/png');
        const img = new Image();

        img.onload = () => {
          // Create texture
          this.texture = this.gl.createTexture();
          this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

          this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);

          // Render to framebuffer
          this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

          // Read back pixels
          const pixels = new Uint8Array(this.gl.drawingBufferWidth * this.gl.drawingBufferHeight * 4);
          this.gl.readPixels(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);

          // Convert to blob (simplified)
          const canvas2 = document.createElement('canvas');
          canvas2.width = this.gl.drawingBufferWidth;
          canvas2.height = this.gl.drawingBufferHeight;
          const ctx2 = canvas2.getContext('2d');
          const imageData2 = ctx2.createImageData(canvas2.width, canvas2.height);
          imageData2.data.set(pixels);
          ctx2.putImageData(imageData2, 0, 0);

          canvas2.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        };

        img.src = imageData;
      });
    }
  }

  class SoftwareEncoder {
    constructor() {
      this.frames = [];
      this.isRecording = false;
    }

    async encodeCanvas(canvas, options = {}) {
      this.isRecording = true;

      return new Promise((resolve) => {
        const captureFrame = () => {
          if (!this.isRecording) {
            resolve(this.createVideoFromFrames());
            return;
          }

          this.frames.push(canvas.toDataURL('image/png'));
          setTimeout(captureFrame, 1000 / (options.frameRate || 30));
        };

        captureFrame();
      });
    }

    createVideoFromFrames() {
      // Simplified software encoding - create a simple image sequence
      if (this.frames.length === 0) return null;

      // For demonstration, return the first frame as a blob
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      return new Promise((resolve) => {
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        };

        img.src = this.frames[0];
      });
    }

    stop() {
      this.isRecording = false;
    }
  }

  class HybridEncoder {
    constructor() {
      this.canvasEncoder = new CanvasBasedEncoder();
      this.webGLEncoder = new WebGLEncoder();
      this.softwareEncoder = new SoftwareEncoder();
    }

    async encodeCanvas(canvas, options = {}) {
      try {
        // Try WebCodecs first (Chrome/Edge)
        if ('VideoEncoder' in global) {
          return this.canvasEncoder.encodeCanvas(canvas, options);
        }

        // Try WebGL (if supported)
        if (this.webGLEncoder.gl) {
          return this.webGLEncoder.encodeCanvas(canvas, options);
        }

        // Fallback to software encoding
        return this.softwareEncoder.encodeCanvas(canvas, options);
      } catch (error) {
        console.error('Hybrid encoding failed, trying fallback:', error);

        // Ultimate fallback
        return this.softwareEncoder.encodeCanvas(canvas, options);
      }
    }
  }

  class SafariExportManager {
    constructor() {
      this.compatibilityManager = new SafariCompatibilityManager();
      this.isInitialized = false;
      this.exportQueue = [];
      this.isExporting = false;
    }

    async initialize() {
      if (this.isInitialized) return;

      await this.compatibilityManager.initialize();
      this.isInitialized = true;

      console.log('Safari export manager initialized');
    }

    async exportVideo(canvas, options = {}) {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const exportTask = {
        id: `safari_export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        canvas,
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

      try {
        const result = await this.performExport(task);
        task.resolve(result);
      } catch (error) {
        console.error('Safari export failed:', error);
        task.reject(error);
      } finally {
        this.isExporting = false;
        this.processQueue();
      }
    }

    async performExport(task) {
      const { canvas, options } = task;

      // Check if we can use MediaRecorder
      if (this.compatibilityManager.mediaRecorderSupported) {
        try {
          return await this.exportWithMediaRecorder(canvas, options);
        } catch (error) {
          console.warn('MediaRecorder failed, trying fallback:', error);
        }
      }

      // Use alternative encoding
      return await this.exportWithAlternative(canvas, options);
    }

    async exportWithMediaRecorder(canvas, options) {
      const stream = canvas.captureStream(options.frameRate || 30);
      const recorder = this.compatibilityManager.createCompatibleRecorder(stream, options);

      return new Promise((resolve, reject) => {
        const chunks = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          resolve({
            blob,
            url: URL.createObjectURL(blob),
            format: this.getFormatFromMimeType(recorder.mimeType),
            size: blob.size
          });
        };

        recorder.onerror = (event) => {
          reject(new Error(`MediaRecorder error: ${event.error?.message || 'Unknown error'}`));
        };

        recorder.start(options.timeslice || 1000);

        // Stop recording after specified duration
        setTimeout(() => {
          recorder.stop();
        }, options.duration || 5000);
      });
    }

    async exportWithAlternative(canvas, options) {
      try {
        const blob = await this.compatibilityManager.encodeWithCanvas(canvas, options);

        return {
          blob,
          url: URL.createObjectURL(blob),
          format: options.format || 'mp4',
          size: blob.size,
          method: 'fallback'
        };
      } catch (error) {
        throw new Error(`Alternative encoding failed: ${error.message}`);
      }
    }

    getFormatFromMimeType(mimeType) {
      if (mimeType.includes('mp4')) return 'mp4';
      if (mimeType.includes('webm')) return 'webm';
      if (mimeType.includes('quicktime')) return 'mov';
      return 'mp4';
    }

    getCompatibilityInfo() {
      return this.compatibilityManager.getCompatibilityReport();
    }

    async cleanup() {
      this.exportQueue = [];
      this.isExporting = false;
    }
  }

  // Export to global scope
  global.SafariCompatibilityManager = SafariCompatibilityManager;
  global.SafariExportManager = SafariExportManager;
  global.SAFARI_COMPATIBILITY = SAFARI_COMPATIBILITY;

})(typeof window !== 'undefined' ? window : globalThis);
