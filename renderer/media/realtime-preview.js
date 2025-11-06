/**
 * Real-time Preview Engine - Hardware-Accelerated Rendering
 * High-performance video preview with live effects and GPU acceleration
 */

(function initializeRealTimePreview(global) {
  'use strict';

  // WebGL Shader Programs
  const SHADER_SOURCES = {
    vertex: `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `,

    fragment: `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      uniform float u_time;
      varying vec2 v_texCoord;

      void main() {
        vec4 color = texture2D(u_texture, v_texCoord);
        gl_FragColor = color;
      }
    `,

    // Color correction shader
    colorCorrection: `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_saturation;
      uniform float u_hue;
      uniform vec3 u_tint;
      varying vec2 v_texCoord;

      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec4 color = texture2D(u_texture, v_texCoord);

        // Brightness and contrast
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5 + u_brightness;

        // Saturation
        vec3 hsv = rgb2hsv(color.rgb);
        hsv.y *= u_saturation;
        color.rgb = hsv2rgb(hsv);

        // Hue shift
        hsv = rgb2hsv(color.rgb);
        hsv.x = mod(hsv.x + u_hue, 1.0);
        color.rgb = hsv2rgb(hsv);

        // Tint
        color.rgb = mix(color.rgb, u_tint, 0.1);

        gl_FragColor = color;
      }
    `,

    // Blur shader
    blur: `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      uniform float u_radius;
      varying vec2 v_texCoord;

      void main() {
        vec2 texelSize = 1.0 / u_resolution;
        vec4 color = vec4(0.0);

        float total = 0.0;
        float radius = u_radius;

        for (float x = -radius; x <= radius; x += 1.0) {
          for (float y = -radius; y <= radius; y += 1.0) {
            vec2 offset = vec2(x, y) * texelSize;
            float weight = 1.0 / ((x * x + y * y) + 1.0);
            color += texture2D(u_texture, v_texCoord + offset) * weight;
            total += weight;
          }
        }

        gl_FragColor = color / total;
      }
    `,

    // Transform shader
    transform: `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform vec2 u_scale;
      uniform vec2 u_translate;
      uniform float u_rotation;
      uniform vec2 u_resolution;
      varying vec2 v_texCoord;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 pos = v_texCoord - center;

        // Apply rotation
        float cos_rot = cos(u_rotation);
        float sin_rot = sin(u_rotation);
        pos = vec2(
          pos.x * cos_rot - pos.y * sin_rot,
          pos.x * sin_rot + pos.y * cos_rot
        );

        // Apply scale
        pos *= u_scale;

        // Apply translation
        pos += u_translate;

        pos += center;

        // Sample texture
        if (pos.x >= 0.0 && pos.x <= 1.0 && pos.y >= 0.0 && pos.y <= 1.0) {
          gl_FragColor = texture2D(u_texture, pos);
        } else {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
      }
    `
  };

  // WebGL Renderer Class
  class WebGLRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!this.gl) {
        throw new Error('WebGL not supported');
      }

      this.shaders = new Map();
      this.textures = new Map();
      this.framebuffers = new Map();
      this.currentProgram = null;

      this.initializeWebGL();
      this.createShaders();
    }

    initializeWebGL() {
      const gl = this.gl;

      // Enable extensions for better performance
      gl.getExtension('OES_texture_float');
      gl.getExtension('OES_texture_float_linear');
      gl.getExtension('EXT_color_buffer_float');

      // Set up viewport
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);

      // Enable blending
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Clear color
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
    }

    createShaders() {
      for (const [name, source] of Object.entries(SHADER_SOURCES)) {
        if (name === 'vertex') continue;

        const program = this.createShaderProgram(SHADER_SOURCES.vertex, source);
        this.shaders.set(name, program);
      }
    }

    createShaderProgram(vertexSource, fragmentSource) {
      const gl = this.gl;

      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Shader program linking failed: ' + gl.getProgramInfoLog(program));
      }

      return program;
    }

    compileShader(type, source) {
      const gl = this.gl;

      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error('Shader compilation failed: ' + gl.getShaderInfoLog(shader));
      }

      return shader;
    }

    useProgram(programName) {
      const program = this.shaders.get(programName);
      if (program && program !== this.currentProgram) {
        this.gl.useProgram(program);
        this.currentProgram = program;
      }
      return program;
    }

    createTexture(width, height, data = null) {
      const gl = this.gl;

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Allocate texture
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
      );

      return texture;
    }

    updateTexture(texture, width, height, data) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
      );
    }

    createFramebuffer(texture) {
      const gl = this.gl;

      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      return framebuffer;
    }

    renderToTexture(texture, width, height, renderCallback) {
      const gl = this.gl;

      // Save current viewport
      const currentViewport = gl.getParameter(gl.VIEWPORT);

      // Set up framebuffer
      const framebuffer = this.createFramebuffer(texture);
      gl.viewport(0, 0, width, height);

      // Clear
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Execute render callback
      renderCallback();

      // Restore viewport
      gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    renderQuad(program, uniforms = {}) {
      const gl = this.gl;

      // Set uniforms
      for (const [name, value] of Object.entries(uniforms)) {
        const location = gl.getUniformLocation(program, name);
        if (location !== null) {
          this.setUniform(location, value);
        }
      }

      // Create quad vertices
      const vertices = new Float32Array([
        -1, -1,  0, 1,  // Bottom left
         1, -1,  1, 1,  // Bottom right
        -1,  1,  0, 0,  // Top left
         1,  1,  1, 0   // Top right
      ]);

      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, 'a_position');
      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.deleteBuffer(vertexBuffer);
    }

    setUniform(location, value) {
      const gl = this.gl;

      if (typeof value === 'number') {
        gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        switch (value.length) {
          case 2:
            gl.uniform2fv(location, value);
            break;
          case 3:
            gl.uniform3fv(location, value);
            break;
          case 4:
            gl.uniform4fv(location, value);
            break;
        }
      }
    }

    dispose() {
      const gl = this.gl;

      // Delete shaders
      for (const program of this.shaders.values()) {
        gl.deleteProgram(program);
      }

      // Delete textures
      for (const texture of this.textures.values()) {
        gl.deleteTexture(texture);
      }

      // Delete framebuffers
      for (const framebuffer of this.framebuffers.values()) {
        gl.deleteFramebuffer(framebuffer);
      }

      this.shaders.clear();
      this.textures.clear();
      this.framebuffers.clear();
    }
  }

  // Video Decoder Class
  class HardwareVideoDecoder {
    constructor() {
      this.decoder = null;
      this.isSupported = this.checkSupport();
      this.frameCallback = null;
      this.currentFrame = null;
    }

    checkSupport() {
      return typeof VideoDecoder !== 'undefined';
    }

    async initialize(videoElement) {
      if (!this.isSupported) {
        throw new Error('Hardware video decoding not supported');
      }

      this.decoder = new VideoDecoder({
        output: (frame) => {
          this.currentFrame = frame;
          if (this.frameCallback) {
            this.frameCallback(frame);
          }
        },
        error: (error) => {
          console.error('Video decode error:', error);
        }
      });

      // Configure decoder
      const config = {
        codec: 'avc1.42E01E',
        codedWidth: videoElement.videoWidth,
        codedHeight: videoElement.videoHeight,
        displayWidth: videoElement.videoWidth,
        displayHeight: videoElement.videoHeight
      };

      await this.decoder.configure(config);
    }

    async decodeFrame(videoElement) {
      if (!this.decoder) return null;

      // Extract frame from video element
      const frame = new VideoFrame(videoElement);
      await this.decoder.decode(frame);
      frame.close();

      return this.currentFrame;
    }

    setFrameCallback(callback) {
      this.frameCallback = callback;
    }

    dispose() {
      if (this.decoder) {
        this.decoder.close();
        this.decoder = null;
      }

      if (this.currentFrame) {
        this.currentFrame.close();
        this.currentFrame = null;
      }
    }
  }

  // Effect Pipeline Class
  class EffectPipeline {
    constructor(renderer) {
      this.renderer = renderer;
      this.effects = [];
      this.pipelineTextures = new Map();
      this.outputTexture = null;
    }

    addEffect(effect) {
      this.effects.push(effect);
    }

    removeEffect(index) {
      if (index >= 0 && index < this.effects.length) {
        this.effects.splice(index, 1);
      }
    }

    clearEffects() {
      this.effects = [];
    }

    async processFrame(inputTexture, width, height) {
      let currentTexture = inputTexture;

      for (let i = 0; i < this.effects.length; i++) {
        const effect = this.effects[i];

        // Create intermediate texture if needed
        const outputTexture = this.getPipelineTexture(i, width, height);

        // Apply effect
        await this.applyEffect(effect, currentTexture, outputTexture, width, height);

        currentTexture = outputTexture;
      }

      this.outputTexture = currentTexture;
      return currentTexture;
    }

    getPipelineTexture(index, width, height) {
      const key = `${index}_${width}_${height}`;

      if (!this.pipelineTextures.has(key)) {
        const texture = this.renderer.createTexture(width, height);
        this.pipelineTextures.set(key, texture);
      }

      return this.pipelineTextures.get(key);
    }

    async applyEffect(effect, inputTexture, outputTexture, width, height) {
      this.renderer.renderToTexture(outputTexture, width, height, () => {
        const program = this.renderer.useProgram(effect.type);

        // Bind input texture
        const gl = this.renderer.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

        // Set uniforms
        const uniforms = {
          u_resolution: [width, height],
          u_time: performance.now() / 1000,
          ...effect.parameters
        };

        this.renderer.renderQuad(program, uniforms);
      });
    }

    getOutputTexture() {
      return this.outputTexture;
    }

    dispose() {
      for (const texture of this.pipelineTextures.values()) {
        this.renderer.gl.deleteTexture(texture);
      }
      this.pipelineTextures.clear();
    }
  }

  // Real-time Preview Engine
  class RealTimePreviewEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new WebGLRenderer(canvas);
      this.videoDecoder = new HardwareVideoDecoder();
      this.effectPipeline = new EffectPipeline(this.renderer);

      this.videoElement = null;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.playbackRate = 1.0;

      this.frameCallback = null;
      this.timeUpdateCallback = null;

      this.animationFrameId = null;
      this.lastFrameTime = 0;
    }

    async initialize(videoElement) {
      this.videoElement = videoElement;
      this.duration = videoElement.duration;

      // Initialize hardware decoder if available
      if (this.videoDecoder.isSupported) {
        try {
          await this.videoDecoder.initialize(videoElement);
          this.videoDecoder.setFrameCallback((frame) => {
            this.processFrame(frame);
          });
        } catch (error) {
          console.warn('Hardware decoding failed, falling back to software:', error);
        }
      }

      // Set up canvas size
      this.updateCanvasSize();
    }

    updateCanvasSize() {
      const videoRect = this.videoElement.getBoundingClientRect();
      this.canvas.width = videoRect.width;
      this.canvas.height = videoRect.height;
      this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    async play() {
      if (this.isPlaying) return;

      this.isPlaying = true;
      this.lastFrameTime = performance.now();

      if (this.videoDecoder.decoder) {
        // Hardware accelerated playback
        await this.videoElement.play();
        this.renderLoop();
      } else {
        // Software fallback
        await this.videoElement.play();
        this.renderLoop();
      }
    }

    pause() {
      this.isPlaying = false;
      this.videoElement.pause();

      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    stop() {
      this.pause();
      this.currentTime = 0;
      this.videoElement.currentTime = 0;
    }

    seek(time) {
      this.currentTime = Math.max(0, Math.min(time, this.duration));
      this.videoElement.currentTime = this.currentTime;

      if (this.timeUpdateCallback) {
        this.timeUpdateCallback(this.currentTime);
      }
    }

    setPlaybackRate(rate) {
      this.playbackRate = rate;
      this.videoElement.playbackRate = rate;
    }

    async renderLoop() {
      if (!this.isPlaying) return;

      const now = performance.now();
      const deltaTime = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      this.currentTime += deltaTime * this.playbackRate;

      // Update video element time
      if (Math.abs(this.videoElement.currentTime - this.currentTime) > 0.1) {
        this.videoElement.currentTime = this.currentTime;
      }

      // Process current frame
      if (this.videoDecoder.decoder) {
        // Hardware decoded frame
        const frame = await this.videoDecoder.decodeFrame(this.videoElement);
        if (frame) {
          this.processFrame(frame);
        }
      } else {
        // Software rendering
        this.renderSoftwareFrame();
      }

      if (this.timeUpdateCallback) {
        this.timeUpdateCallback(this.currentTime);
      }

      if (this.currentTime >= this.duration) {
        this.stop();
        return;
      }

      this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    }

    async processFrame(videoFrame) {
      const gl = this.renderer.gl;

      // Create texture from video frame
      const texture = this.renderer.createTexture(
        videoFrame.displayWidth,
        videoFrame.displayHeight
      );

      // Copy video frame to WebGL texture
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        videoFrame.displayWidth,
        videoFrame.displayHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );

      // Use WebGL's video texture extension if available
      const videoTextureExtension = gl.getExtension('WEBGL_video_texture');
      if (videoTextureExtension) {
        videoTextureExtension.texImage2DWEBGL(gl.TEXTURE_2D, this.videoElement);
      }

      // Apply effect pipeline
      const processedTexture = await this.effectPipeline.processFrame(
        texture,
        videoFrame.displayWidth,
        videoFrame.displayHeight
      );

      // Render to canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const program = this.renderer.useProgram('fragment');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, processedTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

      this.renderer.renderQuad(program);

      // Close video frame
      videoFrame.close();

      // Delete temporary texture
      gl.deleteTexture(texture);

      if (this.frameCallback) {
        this.frameCallback();
      }
    }

    renderSoftwareFrame() {
      const gl = this.renderer.gl;

      // Create texture from video element
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // Use video element as texture source
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.videoElement);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

      // Apply effect pipeline
      const processedTexture = this.effectPipeline.processFrame(
        texture,
        this.videoElement.videoWidth,
        this.videoElement.videoHeight
      );

      // Render to canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const program = this.renderer.useProgram('fragment');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, processedTexture || texture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

      this.renderer.renderQuad(program);

      // Delete texture
      gl.deleteTexture(texture);

      if (this.frameCallback) {
        this.frameCallback();
      }
    }

    addEffect(effect) {
      this.effectPipeline.addEffect(effect);
    }

    removeEffect(index) {
      this.effectPipeline.removeEffect(index);
    }

    clearEffects() {
      this.effectPipeline.clearEffects();
    }

    onFrame(callback) {
      this.frameCallback = callback;
    }

    onTimeUpdate(callback) {
      this.timeUpdateCallback = callback;
    }

    getCurrentTime() {
      return this.currentTime;
    }

    getDuration() {
      return this.duration;
    }

    isPlaying() {
      return this.isPlaying;
    }

    dispose() {
      this.pause();
      this.effectPipeline.dispose();
      this.renderer.dispose();
      this.videoDecoder.dispose();
    }
  }

  // Performance Monitor
  class PreviewPerformanceMonitor {
    constructor() {
      this.frameCount = 0;
      this.lastTime = 0;
      this.fps = 0;
      this.frameTime = 0;
      this.droppedFrames = 0;
      this.memoryUsage = 0;

      this.onPerformanceUpdate = null;
    }

    start() {
      this.lastTime = performance.now();
      this.monitor();
    }

    monitor() {
      const now = performance.now();
      this.frameCount++;

      if (now - this.lastTime >= 1000) {
        this.fps = (this.frameCount * 1000) / (now - this.lastTime);
        this.frameTime = (now - this.lastTime) / this.frameCount;

        // Check for dropped frames
        const expectedFrames = (now - this.lastTime) / (1000 / 60); // 60 FPS
        this.droppedFrames = Math.max(0, expectedFrames - this.frameCount);

        // Memory usage
        if (performance.memory) {
          this.memoryUsage = performance.memory.usedJSHeapSize;
        }

        if (this.onPerformanceUpdate) {
          this.onPerformanceUpdate({
            fps: this.fps,
            frameTime: this.frameTime,
            droppedFrames: this.droppedFrames,
            memoryUsage: this.memoryUsage
          });
        }

        this.frameCount = 0;
        this.lastTime = now;
      }

      requestAnimationFrame(() => this.monitor());
    }

    setPerformanceCallback(callback) {
      this.onPerformanceUpdate = callback;
    }
  }

  // Global real-time preview system
  const realTimePreviewSystem = {
    createEngine: (canvas) => new RealTimePreviewEngine(canvas),

    // Effect factories
    createColorCorrectionEffect: (params = {}) => ({
      type: 'colorCorrection',
      parameters: {
        u_brightness: params.brightness || 0,
        u_contrast: params.contrast || 1,
        u_saturation: params.saturation || 1,
        u_hue: params.hue || 0,
        u_tint: params.tint || [1, 1, 1]
      }
    }),

    createBlurEffect: (params = {}) => ({
      type: 'blur',
      parameters: {
        u_radius: params.radius || 2,
        u_resolution: params.resolution || [1920, 1080]
      }
    }),

    createTransformEffect: (params = {}) => ({
      type: 'transform',
      parameters: {
        u_scale: params.scale || [1, 1],
        u_translate: params.translate || [0, 0],
        u_rotation: params.rotation || 0,
        u_resolution: params.resolution || [1920, 1080]
      }
    }),

    // Performance monitoring
    createPerformanceMonitor: () => new PreviewPerformanceMonitor(),

    // Hardware detection
    detectHardwareAcceleration: () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) return false;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';

      // Check for software rendering
      const isSoftware = /software|swiftshader|llvmpipe/i.test(renderer);

      // Check for video texture support
      const hasVideoTextures = !!gl.getExtension('WEBGL_video_texture');

      return {
        webgl: true,
        hardwareAccelerated: !isSoftware,
        videoTextures: hasVideoTextures,
        renderer: renderer
      };
    },

    // Quality settings
    qualitySettings: {
      ultra: {
        resolution: '4K',
        frameRate: 60,
        effects: 'all',
        antialiasing: true,
        postProcessing: true
      },
      high: {
        resolution: '1080p',
        frameRate: 60,
        effects: 'advanced',
        antialiasing: true,
        postProcessing: true
      },
      medium: {
        resolution: '720p',
        frameRate: 30,
        effects: 'basic',
        antialiasing: false,
        postProcessing: false
      },
      low: {
        resolution: '480p',
        frameRate: 24,
        effects: 'minimal',
        antialiasing: false,
        postProcessing: false
      }
    },

    getRecommendedQuality: () => {
      const hardware = realTimePreviewSystem.detectHardwareAcceleration();

      if (hardware.hardwareAccelerated && hardware.videoTextures) {
        return 'ultra';
      } else if (hardware.hardwareAccelerated) {
        return 'high';
      } else {
        return 'medium';
      }
    },

    setQuality: (quality) => {
      const settings = realTimePreviewSystem.qualitySettings[quality];
      if (settings) {
        console.log(`Setting preview quality to: ${quality}`, settings);
        // Apply quality settings to rendering engine
        return settings;
      }
      return null;
    }
  };

  // Initialize on load
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => {
        console.log('Real-time preview system initialized');
        console.log('Hardware acceleration:', realTimePreviewSystem.detectHardwareAcceleration());
      });
    } else {
      console.log('Real-time preview system initialized');
      console.log('Hardware acceleration:', realTimePreviewSystem.detectHardwareAcceleration());
    }
  }

  // Export real-time preview functionality
  global.RealTimePreviewEngine = realTimePreviewSystem;

})(typeof window !== 'undefined' ? window : globalThis);
