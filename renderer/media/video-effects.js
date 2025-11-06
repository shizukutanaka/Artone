/**
 * Advanced Video Effects System
 * Comprehensive video effects with keyframe animation, motion tracking, and transitions
 */

(function initializeVideoEffects(global) {
  'use strict';

  // Effect Types
  const EFFECT_TYPES = {
    TRANSFORM: 'transform',
    COLOR_CORRECTION: 'color_correction',
    BLUR: 'blur',
    GLOW: 'glow',
    SHADOW: 'shadow',
    CHROMATIC_ABERRATION: 'chromatic_aberration',
    VIGNETTE: 'vignette',
    FILM_GRAIN: 'film_grain',
    MOTION_BLUR: 'motion_blur',
    PARTICLES: 'particles',
    LIGHT_LEAKS: 'light_leaks',
    CUSTOM_SHADER: 'custom_shader'
  };

  // Transition Types
  const TRANSITION_TYPES = {
    FADE: 'fade',
    WIPE: 'wipe',
    SLIDE: 'slide',
    SCALE: 'scale',
    ROTATE: 'rotate',
    CUBE: 'cube',
    PAGE_TURN: 'page_turn',
    CIRCLE: 'circle',
    DIAMOND: 'diamond',
    STAR: 'star',
    CUSTOM: 'custom'
  };

  // Interpolation Types
  const INTERPOLATION_TYPES = {
    LINEAR: 'linear',
    EASE_IN: 'ease_in',
    EASE_OUT: 'ease_out',
    EASE_IN_OUT: 'ease_in_out',
    BOUNCE: 'bounce',
    ELASTIC: 'elastic',
    BACK: 'back',
    CIRCULAR: 'circular',
    EXPONENTIAL: 'exponential',
    SINE: 'sine',
    QUADRATIC: 'quadratic',
    CUBIC: 'cubic'
  };

  // Keyframe System
  class KeyframeAnimation {
    constructor(target, property) {
      this.target = target;
      this.property = property;
      this.keyframes = new Map();
      this.duration = 0;
      this.loop = false;
      this.easing = INTERPOLATION_TYPES.LINEAR;
    }

    addKeyframe(time, value, easing = null) {
      this.keyframes.set(time, { value, easing: easing || this.easing });
      this.updateDuration();
    }

    removeKeyframe(time) {
      this.keyframes.delete(time);
      this.updateDuration();
    }

    getValueAtTime(time) {
      if (this.keyframes.size === 0) return null;

      // Handle looping
      if (this.loop && this.duration > 0) {
        time = time % this.duration;
      }

      const times = Array.from(this.keyframes.keys()).sort((a, b) => a - b);

      // Find surrounding keyframes
      let prevTime = null;
      let nextTime = null;

      for (const t of times) {
        if (t <= time) {
          prevTime = t;
        } else {
          nextTime = t;
          break;
        }
      }

      if (prevTime === null) {
        // Before first keyframe
        return this.keyframes.get(times[0]).value;
      }

      if (nextTime === null) {
        // After last keyframe
        return this.keyframes.get(prevTime).value;
      }

      // Interpolate between keyframes
      const prevKeyframe = this.keyframes.get(prevTime);
      const nextKeyframe = this.keyframes.get(nextTime);

      const ratio = (time - prevTime) / (nextTime - prevTime);
      const easedRatio = this.applyEasing(ratio, prevKeyframe.easing);

      return this.interpolateValues(prevKeyframe.value, nextKeyframe.value, easedRatio);
    }

    applyEasing(ratio, easingType) {
      switch (easingType) {
        case INTERPOLATION_TYPES.EASE_IN:
          return ratio * ratio * ratio;
        case INTERPOLATION_TYPES.EASE_OUT:
          return 1 - Math.pow(1 - ratio, 3);
        case INTERPOLATION_TYPES.EASE_IN_OUT:
          return ratio < 0.5 ? 4 * ratio * ratio * ratio : 1 - Math.pow(-2 * ratio + 2, 3) / 2;
        case INTERPOLATION_TYPES.BOUNCE:
          return this.bounceEase(ratio);
        case INTERPOLATION_TYPES.ELASTIC:
          return this.elasticEase(ratio);
        case INTERPOLATION_TYPES.BACK:
          return this.backEase(ratio);
        case INTERPOLATION_TYPES.SINE:
          return Math.sin(ratio * Math.PI / 2);
        case INTERPOLATION_TYPES.CIRCULAR:
          return 1 - Math.sqrt(1 - Math.pow(ratio, 2));
        case INTERPOLATION_TYPES.EXPONENTIAL:
          return ratio === 0 ? 0 : Math.pow(2, 10 * (ratio - 1));
        case INTERPOLATION_TYPES.QUADRATIC:
          return ratio * ratio;
        case INTERPOLATION_TYPES.CUBIC:
          return ratio * ratio * ratio;
        case INTERPOLATION_TYPES.LINEAR:
        default:
          return ratio;
      }
    }

    bounceEase(ratio) {
      if (ratio < 1 / 2.75) {
        return 7.5625 * ratio * ratio;
      } else if (ratio < 2 / 2.75) {
        return 7.5625 * (ratio -= 1.5 / 2.75) * ratio + 0.75;
      } else if (ratio < 2.5 / 2.75) {
        return 7.5625 * (ratio -= 2.25 / 2.75) * ratio + 0.9375;
      } else {
        return 7.5625 * (ratio -= 2.625 / 2.75) * ratio + 0.984375;
      }
    }

    elasticEase(ratio) {
      if (ratio === 0 || ratio === 1) return ratio;
      const p = 0.3;
      const s = p / 4;
      return Math.pow(2, -10 * ratio) * Math.sin((ratio - s) * (2 * Math.PI) / p) + 1;
    }

    backEase(ratio) {
      const s = 1.70158;
      return ratio * ratio * ((s + 1) * ratio - s);
    }

    interpolateValues(value1, value2, ratio) {
      if (typeof value1 === 'number' && typeof value2 === 'number') {
        return value1 + (value2 - value1) * ratio;
      }

      if (Array.isArray(value1) && Array.isArray(value2)) {
        return value1.map((v, i) => this.interpolateValues(v, value2[i], ratio));
      }

      if (typeof value1 === 'object' && typeof value2 === 'object') {
        const result = {};
        for (const key in value1) {
          if (value2.hasOwnProperty(key)) {
            result[key] = this.interpolateValues(value1[key], value2[key], ratio);
          } else {
            result[key] = value1[key];
          }
        }
        return result;
      }

      // For non-interpolatable values, use the start value until halfway, then end value
      return ratio < 0.5 ? value1 : value2;
    }

    updateDuration() {
      const times = Array.from(this.keyframes.keys());
      if (times.length > 0) {
        this.duration = Math.max(...times);
      } else {
        this.duration = 0;
      }
    }

    toJSON() {
      return {
        target: this.target,
        property: this.property,
        keyframes: Object.fromEntries(this.keyframes),
        duration: this.duration,
        loop: this.loop,
        easing: this.easing
      };
    }

    static fromJSON(data) {
      const animation = new KeyframeAnimation(data.target, data.property);
      animation.keyframes = new Map(Object.entries(data.keyframes));
      animation.duration = data.duration;
      animation.loop = data.loop;
      animation.easing = data.easing;
      return animation;
    }
  }

  // Animation Controller
  class AnimationController {
    constructor() {
      this.animations = new Map();
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.listeners = new Set();
      this.lastFrameTime = 0;
    }

    addAnimation(animation) {
      this.animations.set(`${animation.target}_${animation.property}`, animation);
      this.updateDuration();
    }

    removeAnimation(target, property) {
      this.animations.delete(`${target}_${property}`);
      this.updateDuration();
    }

    play() {
      if (!this.isPlaying) {
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        this.animate();
        this.emit('play');
      }
    }

    pause() {
      this.isPlaying = false;
      this.emit('pause');
    }

    stop() {
      this.isPlaying = false;
      this.currentTime = 0;
      this.emit('stop');
    }

    seek(time) {
      this.currentTime = Math.max(0, Math.min(time, this.duration));
      this.updateAnimations();
      this.emit('seek', this.currentTime);
    }

    animate() {
      if (!this.isPlaying) return;

      const now = performance.now();
      const deltaTime = (now - this.lastFrameTime) / 1000; // Convert to seconds
      this.lastFrameTime = now;

      this.currentTime += deltaTime;

      if (this.currentTime >= this.duration) {
        if (this.shouldLoop()) {
          this.currentTime = 0;
        } else {
          this.stop();
          return;
        }
      }

      this.updateAnimations();
      this.emit('timeupdate', this.currentTime);

      requestAnimationFrame(() => this.animate());
    }

    updateAnimations() {
      for (const animation of this.animations.values()) {
        const value = animation.getValueAtTime(this.currentTime);
        if (value !== null) {
          this.applyAnimationValue(animation.target, animation.property, value);
        }
      }
    }

    applyAnimationValue(target, property, value) {
      // This would be implemented based on the specific target type
      // For example, if target is a DOM element, set CSS properties
      // If target is a video effect, update shader uniforms
      this.emit('valuechange', { target, property, value });
    }

    shouldLoop() {
      // Check if any animation has loop enabled
      for (const animation of this.animations.values()) {
        if (animation.loop) return true;
      }
      return false;
    }

    updateDuration() {
      let maxDuration = 0;
      for (const animation of this.animations.values()) {
        maxDuration = Math.max(maxDuration, animation.duration);
      }
      this.duration = maxDuration;
    }

    getAnimationsForTarget(target) {
      const result = [];
      for (const animation of this.animations.values()) {
        if (animation.target === target) {
          result.push(animation);
        }
      }
      return result;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(eventType, data) {
      this.listeners.forEach(listener => {
        try {
          listener(eventType, data);
        } catch (error) {
          console.error('Animation controller listener error:', error);
        }
      });
    }

    toJSON() {
      return {
        animations: Array.from(this.animations.values()).map(anim => anim.toJSON()),
        currentTime: this.currentTime,
        duration: this.duration,
        isPlaying: this.isPlaying
      };
    }

    static fromJSON(data) {
      const controller = new AnimationController();
      for (const animData of data.animations) {
        controller.addAnimation(KeyframeAnimation.fromJSON(animData));
      }
      controller.currentTime = data.currentTime;
      controller.duration = data.duration;
      return controller;
    }
  }

  // Motion Tracking System
  class MotionTracker {
    constructor(videoElement) {
      this.videoElement = videoElement;
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.isTracking = false;
      this.trackPoints = [];
      this.trackingData = [];
      this.lastFrame = null;
    }

    async startTracking(options = {}) {
      if (this.isTracking) return;

      this.isTracking = true;
      this.trackPoints = options.initialPoints || [];
      this.trackingData = [];
      this.lastFrame = null;

      // Set up canvas dimensions
      this.canvas.width = this.videoElement.videoWidth;
      this.canvas.height = this.videoElement.videoHeight;

      this.track();
    }

    stopTracking() {
      this.isTracking = false;
    }

    addTrackPoint(x, y) {
      this.trackPoints.push({
        id: Date.now() + Math.random(),
        x,
        y,
        confidence: 1.0,
        lastSeen: Date.now()
      });
    }

    removeTrackPoint(id) {
      this.trackPoints = this.trackPoints.filter(point => point.id !== id);
    }

    async track() {
      if (!this.isTracking) return;

      // Draw current video frame to canvas
      this.ctx.drawImage(this.videoElement, 0, 0);

      const currentFrame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      if (this.lastFrame) {
        // Track motion between frames
        await this.trackMotion(this.lastFrame, currentFrame);
      }

      this.lastFrame = currentFrame;

      // Store tracking data
      const timestamp = this.videoElement.currentTime;
      this.trackingData.push({
        timestamp,
        points: [...this.trackPoints]
      });

      // Continue tracking
      if (this.isTracking) {
        requestAnimationFrame(() => this.track());
      }
    }

    async trackMotion(prevFrame, currentFrame) {
      // Implement optical flow or feature tracking
      // This is a simplified implementation

      const blockSize = 16;
      const searchRadius = 8;

      for (const point of this.trackPoints) {
        const motion = this.findMotionVector(
          prevFrame,
          currentFrame,
          point.x,
          point.y,
          blockSize,
          searchRadius
        );

        if (motion) {
          point.x += motion.dx;
          point.y += motion.dy;
          point.confidence = motion.confidence;
          point.lastSeen = Date.now();
        } else {
          point.confidence *= 0.9; // Decay confidence if not found
        }
      }

      // Remove low confidence points
      this.trackPoints = this.trackPoints.filter(point => point.confidence > 0.1);
    }

    findMotionVector(prevFrame, currentFrame, x, y, blockSize, searchRadius) {
      let bestMatch = null;
      let bestDistance = Infinity;

      const halfBlock = blockSize / 2;

      // Block matching algorithm
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const newX = x + dx;
          const newY = y + dy;

          // Check bounds
          if (newX - halfBlock < 0 || newX + halfBlock >= currentFrame.width ||
              newY - halfBlock < 0 || newY + halfBlock >= currentFrame.height) {
            continue;
          }

          const distance = this.calculateBlockDistance(
            prevFrame, currentFrame,
            x - halfBlock, y - halfBlock,
            newX - halfBlock, newY - halfBlock,
            blockSize
          );

          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = { dx, dy };
          }
        }
      }

      if (bestMatch) {
        // Calculate confidence based on match quality
        const confidence = Math.max(0, 1 - bestDistance / (blockSize * blockSize * 255 * 3));
        return { ...bestMatch, confidence };
      }

      return null;
    }

    calculateBlockDistance(prevFrame, currentFrame, x1, y1, x2, y2, size) {
      let distance = 0;
      const width = prevFrame.width;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx1 = ((y1 + y) * width + (x1 + x)) * 4;
          const idx2 = ((y2 + y) * width + (x2 + x)) * 4;

          // Calculate Euclidean distance in RGB space
          const dr = prevFrame.data[idx1] - currentFrame.data[idx2];
          const dg = prevFrame.data[idx1 + 1] - currentFrame.data[idx2 + 1];
          const db = prevFrame.data[idx1 + 2] - currentFrame.data[idx2 + 2];

          distance += dr * dr + dg * dg + db * db;
        }
      }

      return distance;
    }

    getTrackingData() {
      return this.trackingData;
    }

    getCurrentTrackPoints() {
      return [...this.trackPoints];
    }

    exportTrackingData() {
      return JSON.stringify({
        videoDuration: this.videoElement.duration,
        trackPoints: this.trackPoints,
        trackingData: this.trackingData
      }, null, 2);
    }

    importTrackingData(jsonString) {
      try {
        const data = JSON.parse(jsonString);
        this.trackPoints = data.trackPoints || [];
        this.trackingData = data.trackingData || [];
      } catch (error) {
        console.error('Failed to import tracking data:', error);
      }
    }
  }

  // Transition System
  class TransitionEngine {
    constructor() {
      this.transitions = new Map();
      this.currentTransition = null;
      this.isTransitioning = false;
    }

    registerTransition(type, transitionClass) {
      this.transitions.set(type, transitionClass);
    }

    createTransition(type, options = {}) {
      const TransitionClass = this.transitions.get(type);
      if (!TransitionClass) {
        throw new Error(`Transition type '${type}' not registered`);
      }

      return new TransitionClass(options);
    }

    async executeTransition(fromClip, toClip, type, duration, options = {}) {
      if (this.isTransitioning) {
        throw new Error('Transition already in progress');
      }

      this.isTransitioning = true;

      try {
        const transition = this.createTransition(type, { duration, ...options });
        await transition.execute(fromClip, toClip);
        this.emit('transition_complete', { fromClip, toClip, type, duration });
      } catch (error) {
        console.error('Transition failed:', error);
        this.emit('transition_error', { error, fromClip, toClip, type });
      } finally {
        this.isTransitioning = false;
      }
    }

    // Built-in transitions
    initializeDefaultTransitions() {
      // Fade Transition
      class FadeTransition {
        constructor(options) {
          this.duration = options.duration || 1000;
          this.easing = options.easing || 'ease-in-out';
        }

        async execute(fromClip, toClip) {
          const startTime = Date.now();

          return new Promise((resolve) => {
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / this.duration, 1);

              const easedProgress = this.applyEasing(progress);

              // Apply fade effect
              fromClip.opacity = 1 - easedProgress;
              toClip.opacity = easedProgress;

              this.emit('progress', { progress: easedProgress, fromClip, toClip });

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                fromClip.opacity = 0;
                toClip.opacity = 1;
                resolve();
              }
            };

            animate();
          });
        }

        applyEasing(progress) {
          // Simple ease-in-out
          return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        }

        emit(event, data) {
          // Implementation depends on event system
        }
      }

      // Wipe Transition
      class WipeTransition {
        constructor(options) {
          this.duration = options.duration || 1000;
          this.direction = options.direction || 'left-to-right';
          this.easing = options.easing || 'linear';
        }

        async execute(fromClip, toClip) {
          const startTime = Date.now();

          return new Promise((resolve) => {
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / this.duration, 1);

              // Apply wipe effect based on direction
              const wipeProgress = this.calculateWipeProgress(progress);

              fromClip.clipRect = this.getWipeRect(wipeProgress, 'from');
              toClip.clipRect = this.getWipeRect(wipeProgress, 'to');

              this.emit('progress', { progress, fromClip, toClip });

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                fromClip.clipRect = null;
                toClip.clipRect = null;
                resolve();
              }
            };

            animate();
          });
        }

        calculateWipeProgress(progress) {
          switch (this.easing) {
            case 'ease-in':
              return progress * progress * progress;
            case 'ease-out':
              return 1 - Math.pow(1 - progress, 3);
            case 'ease-in-out':
              return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            default:
              return progress;
          }
        }

        getWipeRect(progress, type) {
          const width = 1920; // Assume 1920px width
          const height = 1080; // Assume 1080px height

          switch (this.direction) {
            case 'left-to-right':
              if (type === 'from') {
                return { x: 0, y: 0, width: progress * width, height };
              } else {
                return { x: progress * width, y: 0, width: (1 - progress) * width, height };
              }
            case 'right-to-left':
              if (type === 'from') {
                return { x: (1 - progress) * width, y: 0, width: progress * width, height };
              } else {
                return { x: 0, y: 0, width: (1 - progress) * width, height };
              }
            // Add more directions...
            default:
              return null;
          }
        }

        emit(event, data) {
          // Implementation depends on event system
        }
      }

      this.registerTransition(TRANSITION_TYPES.FADE, FadeTransition);
      this.registerTransition(TRANSITION_TYPES.WIPE, WipeTransition);
    }

    getAvailableTransitions() {
      return Array.from(this.transitions.keys());
    }

    subscribe(listener) {
      // Implementation depends on event system
      return () => {};
    }

    emit(eventType, data) {
      // Implementation depends on event system
    }
  }

  // Video Effects Library
  const VideoEffectsLibrary = {
    // Transform effects
    transform: {
      scale: (context, params) => {
        const { scaleX = 1, scaleY = 1, originX = 0.5, originY = 0.5 } = params;
        context.save();
        context.translate(originX * context.canvas.width, originY * context.canvas.height);
        context.scale(scaleX, scaleY);
        context.translate(-originX * context.canvas.width, -originY * context.canvas.height);
      },

      rotate: (context, params) => {
        const { angle = 0, originX = 0.5, originY = 0.5 } = params;
        context.save();
        context.translate(originX * context.canvas.width, originY * context.canvas.height);
        context.rotate(angle * Math.PI / 180);
        context.translate(-originX * context.canvas.width, -originY * context.canvas.height);
      },

      translate: (context, params) => {
        const { x = 0, y = 0 } = params;
        context.save();
        context.translate(x, y);
      }
    },

    // Color correction effects
    colorCorrection: {
      brightness: (imageData, params) => {
        const { value = 0 } = params;
        const data = imageData.data;
        const factor = 1 + value / 100;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * factor);     // Red
          data[i + 1] = Math.min(255, data[i + 1] * factor); // Green
          data[i + 2] = Math.min(255, data[i + 2] * factor); // Blue
        }
      },

      contrast: (imageData, params) => {
        const { value = 0 } = params;
        const data = imageData.data;
        const factor = (259 * (value + 255)) / (255 * (259 - value));

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
          data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
          data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
        }
      },

      saturation: (imageData, params) => {
        const { value = 0 } = params;
        const data = imageData.data;
        const factor = 1 + value / 100;

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
          data[i] = Math.max(0, Math.min(255, gray + (data[i] - gray) * factor));
          data[i + 1] = Math.max(0, Math.min(255, gray + (data[i + 1] - gray) * factor));
          data[i + 2] = Math.max(0, Math.min(255, gray + (data[i + 2] - gray) * factor));
        }
      }
    },

    // Blur effects
    blur: {
      gaussian: (context, params) => {
        const { radius = 5 } = params;
        context.filter = `blur(${radius}px)`;
      },

      motion: (context, params) => {
        const { angle = 0, distance = 10 } = params;
        const radian = angle * Math.PI / 180;
        const offsetX = Math.cos(radian) * distance;
        const offsetY = Math.sin(radian) * distance;

        // Create motion blur effect
        for (let i = 0; i < 5; i++) {
          const alpha = 0.2;
          const x = (offsetX * i) / 5;
          const y = (offsetY * i) / 5;

          context.save();
          context.globalAlpha = alpha;
          context.translate(x, y);
          // Draw the image multiple times with offset
          context.restore();
        }
      }
    },

    // Glow effect
    glow: (context, params) => {
      const { color = '#ffffff', intensity = 0.5, size = 10 } = params;

      context.shadowColor = color;
      context.shadowBlur = size;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = intensity;
    },

    // Vignette effect
    vignette: (context, params) => {
      const { intensity = 0.5, innerRadius = 0.5, outerRadius = 1.5 } = params;
      const { width, height } = context.canvas;

      const gradient = context.createRadialGradient(
        width / 2, height / 2, innerRadius * Math.min(width, height) / 2,
        width / 2, height / 2, outerRadius * Math.min(width, height) / 2
      );

      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);

      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    },

    // Film grain effect
    filmGrain: (imageData, params) => {
      const { intensity = 0.1, size = 1 } = params;
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * intensity * 255 * size;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
      }
    }
  };

  // Video Effects Engine
  class VideoEffectsEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.effects = new Map();
      this.animationController = new AnimationController();
      this.transitionEngine = new TransitionEngine();

      this.initializeDefaultEffects();
      this.transitionEngine.initializeDefaultTransitions();
    }

    initializeDefaultEffects() {
      // Register built-in effects
      Object.entries(VideoEffectsLibrary).forEach(([category, effects]) => {
        Object.entries(effects).forEach(([name, effect]) => {
          this.registerEffect(`${category}_${name}`, effect);
        });
      });
    }

    registerEffect(name, effectFunction) {
      this.effects.set(name, effectFunction);
    }

    applyEffect(effectName, params = {}) {
      const effect = this.effects.get(effectName);
      if (!effect) {
        console.warn(`Effect '${effectName}' not found`);
        return;
      }

      return (imageData, context) => {
        if (context && typeof effect === 'function') {
          // Canvas-based effect
          effect(context, params);
        } else if (imageData && typeof effect === 'function') {
          // ImageData-based effect
          effect(imageData, params);
        }
      };
    }

    createKeyframeAnimation(target, property) {
      return new KeyframeAnimation(target, property);
    }

    addAnimation(animation) {
      this.animationController.addAnimation(animation);
    }

    playAnimations() {
      this.animationController.play();
    }

    pauseAnimations() {
      this.animationController.pause();
    }

    stopAnimations() {
      this.animationController.stop();
    }

    createTransition(type, options) {
      return this.transitionEngine.createTransition(type, options);
    }

    async executeTransition(fromClip, toClip, type, duration, options) {
      return this.transitionEngine.executeTransition(fromClip, toClip, type, duration, options);
    }

    createMotionTracker(videoElement) {
      return new MotionTracker(videoElement);
    }

    // Apply multiple effects in sequence
    applyEffectsChain(imageData, effects) {
      let result = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );

      effects.forEach(effectConfig => {
        const { name, params = {} } = effectConfig;
        const effect = this.applyEffect(name, params);

        if (effect) {
          effect(result);
        }
      });

      return result;
    }

    // Render frame with effects
    renderFrame(sourceCanvas, effects = [], animations = []) {
      // Clear canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Save context
      this.ctx.save();

      // Apply effects
      if (effects.length > 0) {
        const imageData = sourceCanvas.getContext('2d').getImageData(
          0, 0, sourceCanvas.width, sourceCanvas.height
        );

        const processedImageData = this.applyEffectsChain(imageData, effects);

        // Create temporary canvas for processed image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = processedImageData.width;
        tempCanvas.height = processedImageData.height;
        tempCanvas.getContext('2d').putImageData(processedImageData, 0, 0);

        this.ctx.drawImage(tempCanvas, 0, 0);
      } else {
        // Draw source directly
        this.ctx.drawImage(sourceCanvas, 0, 0);
      }

      // Restore context
      this.ctx.restore();
    }

    getAvailableEffects() {
      return Array.from(this.effects.keys());
    }

    getAvailableTransitions() {
      return this.transitionEngine.getAvailableTransitions();
    }

    exportEffectsConfiguration(effects, animations) {
      return JSON.stringify({
        effects,
        animations: animations.map(anim => anim.toJSON()),
        timestamp: Date.now()
      }, null, 2);
    }

    importEffectsConfiguration(jsonString) {
      try {
        const config = JSON.parse(jsonString);
        const animations = config.animations.map(animData =>
          KeyframeAnimation.fromJSON(animData)
        );

        return { effects: config.effects, animations };
      } catch (error) {
        console.error('Failed to import effects configuration:', error);
        return { effects: [], animations: [] };
      }
    }

    dispose() {
      this.animationController.stop();
      this.effects.clear();
    }
  }

  // Global video effects system
  const videoEffectsEngine = {
    createEngine: (canvas) => new VideoEffectsEngine(canvas),

    // Utility functions
    createKeyframeAnimation: (target, property) => new KeyframeAnimation(target, property),

    createMotionTracker: (videoElement) => new MotionTracker(videoElement),

    // Effect presets
    effectPresets: {
      'cinematic': [
        { name: 'colorCorrection_brightness', params: { value: 10 } },
        { name: 'colorCorrection_contrast', params: { value: 15 } },
        { name: 'colorCorrection_saturation', params: { value: -5 } },
        { name: 'vignette', params: { intensity: 0.3 } },
        { name: 'filmGrain', params: { intensity: 0.05 } }
      ],

      'vintage': [
        { name: 'colorCorrection_saturation', params: { value: -20 } },
        { name: 'colorCorrection_contrast', params: { value: 10 } },
        { name: 'filmGrain', params: { intensity: 0.1, size: 2 } },
        { name: 'vignette', params: { intensity: 0.4, innerRadius: 0.3 } }
      ],

      'neon': [
        { name: 'colorCorrection_saturation', params: { value: 30 } },
        { name: 'glow', params: { color: '#00ffff', intensity: 0.8, size: 20 } },
        { name: 'colorCorrection_brightness', params: { value: 20 } }
      ],

      'dreamy': [
        { name: 'blur_gaussian', params: { radius: 2 } },
        { name: 'colorCorrection_saturation', params: { value: 10 } },
        { name: 'colorCorrection_brightness', params: { value: 5 } },
        { name: 'vignette', params: { intensity: 0.2 } }
      ]
    },

    getEffectPresets: () => Object.keys(videoEffectsEngine.effectPresets),

    getPresetEffects: (presetName) => videoEffectsEngine.effectPresets[presetName] || []
  };

  // Initialize on load
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => {
        console.log('Video effects system initialized');
      });
    } else {
      console.log('Video effects system initialized');
    }
  }

  // Export video effects functionality
  global.VideoEffectsEngine = videoEffectsEngine;
  global.KeyframeAnimation = KeyframeAnimation;
  global.AnimationController = AnimationController;
  global.MotionTracker = MotionTracker;
  global.TransitionEngine = TransitionEngine;

  // Constants
  global.EFFECT_TYPES = EFFECT_TYPES;
  global.TRANSITION_TYPES = TRANSITION_TYPES;
  global.INTERPOLATION_TYPES = INTERPOLATION_TYPES;

})(typeof window !== 'undefined' ? window : globalThis);
