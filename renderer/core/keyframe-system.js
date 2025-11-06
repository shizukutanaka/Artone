'use strict';

(function registerKeyframeSystem(global) {
  // Advanced keyframe animation system for Artone
  const EASING_FUNCTIONS = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
    easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
    easeOutCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
    easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,
    easeInBack: (t) => t * t * (2.70158 * t - 1.70158),
    easeOutBack: (t) => 1 + (--t) * t * (2.70158 * t + 1.70158),
    easeInOutBack: (t) => t < 0.5 ? t * t * (7 * t - 2.5) * 2 : 1 + (--t) * t * 2 * (7 * t + 2.5),
    easeInElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI),
    easeOutElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1,
    easeInOutElastic: (t) => {
      if (t === 0) return 0;
      if (t === 1) return 1;
      if (t < 0.5) return -Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * Math.PI * 2 / 4.5) / 2;
      return Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * Math.PI * 2 / 4.5) / 2 + 1;
    },
    easeInBounce: (t) => 1 - EASING_FUNCTIONS.easeOutBounce(1 - t),
    easeOutBounce: (t) => {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
      if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    },
    easeInOutBounce: (t) => t < 0.5 ? EASING_FUNCTIONS.easeInBounce(t * 2) * 0.5 : EASING_FUNCTIONS.easeOutBounce(t * 2 - 1) * 0.5 + 0.5
  };

  class KeyframeManager {
    constructor() {
      this.keyframes = new Map();
      this.activeAnimations = new Map();
      this.animationQueue = [];
      this.isAnimating = false;
      this.animationFrame = null;
      this.onKeyframeUpdate = null;
      this.onAnimationComplete = null;
    }

    // Create a new keyframe
    createKeyframe(clipId, time, property, value, options = {}) {
      const keyframeId = `keyframe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const keyframe = {
        id: keyframeId,
        clipId,
        time: Math.max(0, time),
        property,
        value,
        easing: options.easing || 'linear',
        interpolation: options.interpolation || 'linear',
        tangentIn: options.tangentIn || [0, 0],
        tangentOut: options.tangentOut || [0, 0],
        locked: options.locked || false,
        selected: options.selected || false,
        metadata: options.metadata || {}
      };

      if (!this.keyframes.has(clipId)) {
        this.keyframes.set(clipId, new Map());
      }

      const clipKeyframes = this.keyframes.get(clipId);
      if (!clipKeyframes.has(property)) {
        clipKeyframes.set(property, []);
      }

      const propertyKeyframes = clipKeyframes.get(property);
      propertyKeyframes.push(keyframe);
      propertyKeyframes.sort((a, b) => a.time - b.time);

      this.emit('keyframe-created', { keyframe, clipId, property });
      return keyframe;
    }

    // Update an existing keyframe
    updateKeyframe(keyframeId, updates) {
      for (const [clipId, properties] of this.keyframes) {
        for (const [property, keyframes] of properties) {
          const keyframe = keyframes.find(kf => kf.id === keyframeId);
          if (keyframe) {
            Object.assign(keyframe, updates);
            keyframes.sort((a, b) => a.time - b.time);
            this.emit('keyframe-updated', { keyframe, clipId, property });
            return true;
          }
        }
      }
      return false;
    }

    // Delete a keyframe
    deleteKeyframe(keyframeId) {
      for (const [clipId, properties] of this.keyframes) {
        for (const [property, keyframes] of properties) {
          const index = keyframes.findIndex(kf => kf.id === keyframeId);
          if (index >= 0) {
            const keyframe = keyframes[index];
            keyframes.splice(index, 1);

            if (keyframes.length === 0) {
              properties.delete(property);
            }

            if (properties.size === 0) {
              this.keyframes.delete(clipId);
            }

            this.emit('keyframe-deleted', { keyframe, clipId, property });
            return true;
          }
        }
      }
      return false;
    }

    // Get all keyframes for a clip
    getClipKeyframes(clipId) {
      const clipKeyframes = this.keyframes.get(clipId);
      if (!clipKeyframes) return {};

      const result = {};
      for (const [property, keyframes] of clipKeyframes) {
        result[property] = keyframes.slice();
      }
      return result;
    }

    // Get keyframes for a specific property
    getPropertyKeyframes(clipId, property) {
      const clipKeyframes = this.keyframes.get(clipId);
      if (!clipKeyframes) return [];

      return clipKeyframes.get(property) || [];
    }

    // Start animation
    startAnimation(clipId, startTime = 0, endTime = null) {
      const clipKeyframes = this.getClipKeyframes(clipId);
      if (Object.keys(clipKeyframes).length === 0) return;

      const animation = {
        id: `animation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        clipId,
        startTime,
        endTime,
        currentTime: startTime,
        isPlaying: true,
        isPaused: false,
        playbackRate: 1,
        loop: false,
        keyframes: clipKeyframes
      };

      this.activeAnimations.set(clipId, animation);
      this.startAnimationLoop();

      this.emit('animation-started', { animation, clipId });
    }

    // Stop animation
    stopAnimation(clipId) {
      const animation = this.activeAnimations.get(clipId);
      if (!animation) return;

      animation.isPlaying = false;
      this.activeAnimations.delete(clipId);

      if (this.activeAnimations.size === 0) {
        this.stopAnimationLoop();
      }

      this.emit('animation-stopped', { animation, clipId });
    }

    // Pause animation
    pauseAnimation(clipId) {
      const animation = this.activeAnimations.get(clipId);
      if (animation) {
        animation.isPaused = true;
        this.emit('animation-paused', { animation, clipId });
      }
    }

    // Resume animation
    resumeAnimation(clipId) {
      const animation = this.activeAnimations.get(clipId);
      if (animation) {
        animation.isPaused = false;
        this.emit('animation-resumed', { animation, clipId });
      }
    }

    // Animation loop
    startAnimationLoop() {
      if (this.isAnimating) return;

      this.isAnimating = true;
      const animate = (currentTime) => {
        if (!this.isAnimating) return;

        this.updateAnimations(currentTime);
        this.animationFrame = requestAnimationFrame(animate);
      };

      this.animationFrame = requestAnimationFrame(animate);
    }

    stopAnimationLoop() {
      this.isAnimating = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }

    updateAnimations(currentTime) {
      for (const [clipId, animation] of this.activeAnimations) {
        if (!animation.isPlaying || animation.isPaused) continue;

        const deltaTime = 16.67; // Assume 60fps
        animation.currentTime += (deltaTime * animation.playbackRate) / 1000;

        // Check if animation should end
        if (animation.endTime && animation.currentTime >= animation.endTime) {
          if (animation.loop) {
            animation.currentTime = animation.startTime;
          } else {
            animation.currentTime = animation.endTime;
            animation.isPlaying = false;
            this.emit('animation-completed', { animation, clipId });
          }
        }

        // Update clip properties based on keyframes
        this.updateClipProperties(clipId, animation.currentTime);

        if (this.onKeyframeUpdate) {
          this.onKeyframeUpdate(clipId, animation.currentTime, this.getInterpolatedValues(clipId, animation.currentTime));
        }
      }
    }

    updateClipProperties(clipId, time) {
      const interpolatedValues = this.getInterpolatedValues(clipId, time);

      if (this.onKeyframeUpdate) {
        this.onKeyframeUpdate(clipId, time, interpolatedValues);
      }
    }

    getInterpolatedValues(clipId, time) {
      const clipKeyframes = this.getClipKeyframes(clipId);
      const result = {};

      for (const [property, keyframes] of Object.entries(clipKeyframes)) {
        result[property] = this.interpolateProperty(keyframes, time);
      }

      return result;
    }

    interpolateProperty(keyframes, time) {
      if (keyframes.length === 0) return null;
      if (keyframes.length === 1) return keyframes[0].value;

      // Find surrounding keyframes
      let prevKeyframe = null;
      let nextKeyframe = null;

      for (let i = 0; i < keyframes.length; i++) {
        if (keyframes[i].time <= time) {
          prevKeyframe = keyframes[i];
        } else {
          nextKeyframe = keyframes[i];
          break;
        }
      }

      if (!prevKeyframe) {
        return keyframes[0].value;
      }

      if (!nextKeyframe) {
        return keyframes[keyframes.length - 1].value;
      }

      // Interpolate between keyframes
      const timeDiff = nextKeyframe.time - prevKeyframe.time;
      if (timeDiff === 0) return prevKeyframe.value;

      const t = (time - prevKeyframe.time) / timeDiff;
      const easedT = this.applyEasing(t, prevKeyframe.easing);

      return this.interpolateValues(prevKeyframe.value, nextKeyframe.value, easedT);
    }

    interpolateValues(startValue, endValue, t) {
      if (typeof startValue === 'number' && typeof endValue === 'number') {
        return startValue + (endValue - startValue) * t;
      }

      if (Array.isArray(startValue) && Array.isArray(endValue)) {
        return startValue.map((start, index) => {
          const end = endValue[index];
          if (typeof start === 'number' && typeof end === 'number') {
            return start + (end - start) * t;
          }
          return start;
        });
      }

      if (typeof startValue === 'object' && typeof endValue === 'object') {
        const result = {};
        for (const key in startValue) {
          if (endValue.hasOwnProperty(key)) {
            const start = startValue[key];
            const end = endValue[key];
            if (typeof start === 'number' && typeof end === 'number') {
              result[key] = start + (end - start) * t;
            } else {
              result[key] = start;
            }
          }
        }
        return result;
      }

      return startValue;
    }

    applyEasing(t, easing) {
      const easingFn = EASING_FUNCTIONS[easing] || EASING_FUNCTIONS.linear;
      return easingFn(t);
    }

    // Export keyframes
    exportKeyframes(clipId, format = 'json') {
      const keyframes = this.getClipKeyframes(clipId);

      switch (format) {
        case 'json':
          return JSON.stringify(keyframes, null, 2);
        case 'csv':
          let csv = 'Time,Property,Value,Easing\n';
          for (const [property, propertyKeyframes] of Object.entries(keyframes)) {
            for (const keyframe of propertyKeyframes) {
              csv += `${keyframe.time},${property},${JSON.stringify(keyframe.value)},${keyframe.easing}\n`;
            }
          }
          return csv;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    }

    // Import keyframes
    importKeyframes(clipId, data, format = 'json') {
      let keyframes;

      switch (format) {
        case 'json':
          keyframes = JSON.parse(data);
          break;
        case 'csv':
          keyframes = this.parseCSVKeyframes(data);
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      // Clear existing keyframes
      const existingKeyframes = this.getClipKeyframes(clipId);
      for (const property in existingKeyframes) {
        this.keyframes.get(clipId).delete(property);
      }

      // Import new keyframes
      for (const [property, propertyKeyframes] of Object.entries(keyframes)) {
        for (const keyframeData of propertyKeyframes) {
          this.createKeyframe(clipId, keyframeData.time, property, keyframeData.value, {
            easing: keyframeData.easing,
            interpolation: keyframeData.interpolation
          });
        }
      }
    }

    parseCSVKeyframes(csv) {
      const lines = csv.split('\n').filter(line => line.trim());
      const keyframes = {};

      for (let i = 1; i < lines.length; i++) {
        const [time, property, value, easing] = lines[i].split(',').map(field => field.trim());
        if (!keyframes[property]) {
          keyframes[property] = [];
        }

        keyframes[property].push({
          time: parseFloat(time),
          value: JSON.parse(value),
          easing: easing || 'linear'
        });
      }

      return keyframes;
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
            console.error('Keyframe event handler error:', error);
          }
        });
      }
    }

    // Cleanup
    destroy() {
      this.stopAnimationLoop();
      this.activeAnimations.clear();
      this.keyframes.clear();
      this.animationQueue = [];
    }
  }

  class KeyframeEditor {
    constructor(container, options = {}) {
      this.container = container;
      this.keyframeManager = options.keyframeManager || new KeyframeManager();
      this.currentClipId = null;
      this.selectedKeyframes = new Set();
      this.isDragging = false;
      this.dragKeyframe = null;
      this.snapToGrid = options.snapToGrid !== false;
      this.gridSize = options.gridSize || 1;
      this.showEasingCurves = options.showEasingCurves !== false;

      this.setupUI();
      this.setupEventListeners();
    }

    setupUI() {
      this.container.innerHTML = `
        <div class="keyframe-editor">
          <div class="keyframe-toolbar">
            <button id="add-keyframe" title="Add Keyframe">Add</button>
            <button id="delete-keyframe" title="Delete Keyframe">Delete</button>
            <button id="copy-keyframe" title="Copy Keyframe">Copy</button>
            <button id="paste-keyframe" title="Paste Keyframe">Paste</button>
            <div class="separator"></div>
            <button id="play-animation" title="Play Animation">Play</button>
            <button id="pause-animation" title="Pause Animation">Pause</button>
            <button id="stop-animation" title="Stop Animation">Stop</button>
            <div class="separator"></div>
            <select id="easing-select">
              <option value="linear">Linear</option>
              <option value="easeInQuad">Ease In Quad</option>
              <option value="easeOutQuad">Ease Out Quad</option>
              <option value="easeInOutQuad">Ease In Out Quad</option>
              <option value="easeInCubic">Ease In Cubic</option>
              <option value="easeOutCubic">Ease Out Cubic</option>
              <option value="easeInOutCubic">Ease In Out Cubic</option>
              <option value="easeInSine">Ease In Sine</option>
              <option value="easeOutSine">Ease Out Sine</option>
              <option value="easeInOutSine">Ease In Out Sine</option>
            </select>
          </div>
          <div class="keyframe-timeline">
            <canvas class="keyframe-canvas"></canvas>
            <div class="keyframe-properties">
              <div class="property-list"></div>
            </div>
          </div>
          <div class="keyframe-curve-editor" style="display: none;">
            <canvas class="curve-canvas"></canvas>
          </div>
        </div>
      `;

      this.canvas = this.container.querySelector('.keyframe-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.curveCanvas = this.container.querySelector('.curve-canvas');
      this.curveCtx = this.curveCanvas.getContext('2d');

      this.resize();
    }

    setupEventListeners() {
      // Toolbar events
      this.container.querySelector('#add-keyframe').addEventListener('click', () => {
        this.addKeyframeAtCurrentTime();
      });

      this.container.querySelector('#delete-keyframe').addEventListener('click', () => {
        this.deleteSelectedKeyframes();
      });

      this.container.querySelector('#play-animation').addEventListener('click', () => {
        this.playAnimation();
      });

      this.container.querySelector('#pause-animation').addEventListener('click', () => {
        this.pauseAnimation();
      });

      this.container.querySelector('#stop-animation').addEventListener('click', () => {
        this.stopAnimation();
      });

      // Canvas events
      this.canvas.addEventListener('click', (e) => {
        this.handleCanvasClick(e);
      });

      this.canvas.addEventListener('mousedown', (e) => {
        this.handleMouseDown(e);
      });

      this.canvas.addEventListener('mousemove', (e) => {
        this.handleMouseMove(e);
      });

      this.canvas.addEventListener('mouseup', () => {
        this.handleMouseUp();
      });

      this.canvas.addEventListener('wheel', (e) => {
        this.handleWheel(e);
      });

      // Window resize
      window.addEventListener('resize', () => {
        this.resize();
      });
    }

    resize() {
      const rect = this.container.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = 200;
      this.curveCanvas.width = rect.width;
      this.curveCanvas.height = 150;
      this.draw();
    }

    setClip(clipId) {
      this.currentClipId = clipId;
      this.selectedKeyframes.clear();
      this.draw();
    }

    addKeyframeAtCurrentTime(property = 'opacity') {
      if (!this.currentClipId) return;

      const currentTime = this.getCurrentTime();
      const currentValue = this.getCurrentPropertyValue(property);

      this.keyframeManager.createKeyframe(this.currentClipId, currentTime, property, currentValue, {
        easing: this.container.querySelector('#easing-select').value
      });

      this.draw();
    }

    deleteSelectedKeyframes() {
      for (const keyframeId of this.selectedKeyframes) {
        this.keyframeManager.deleteKeyframe(keyframeId);
      }
      this.selectedKeyframes.clear();
      this.draw();
    }

    playAnimation() {
      if (this.currentClipId) {
        this.keyframeManager.startAnimation(this.currentClipId);
      }
    }

    pauseAnimation() {
      if (this.currentClipId) {
        this.keyframeManager.pauseAnimation(this.currentClipId);
      }
    }

    stopAnimation() {
      if (this.currentClipId) {
        this.keyframeManager.stopAnimation(this.currentClipId);
      }
    }

    handleCanvasClick(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const time = this.xToTime(x);
      const clickedKeyframe = this.getKeyframeAtPosition(time, y);

      if (clickedKeyframe) {
        if (e.ctrlKey || e.metaKey) {
          this.toggleKeyframeSelection(clickedKeyframe.id);
        } else {
          this.selectKeyframe(clickedKeyframe.id);
        }
      } else {
        this.clearSelection();
      }
    }

    handleMouseDown(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = this.xToTime(x);

      const clickedKeyframe = this.getKeyframeAtPosition(time, e.clientY - rect.top);
      if (clickedKeyframe) {
        this.isDragging = true;
        this.dragKeyframe = clickedKeyframe;
        this.dragStartX = x;
        this.dragStartTime = clickedKeyframe.time;
      }
    }

    handleMouseMove(e) {
      if (!this.isDragging || !this.dragKeyframe) return;

      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const deltaX = x - this.dragStartX;
      const deltaTime = this.xToTime(deltaX) - this.xToTime(0);

      const newTime = Math.max(0, this.dragStartTime + deltaTime);
      const snappedTime = this.snapToGrid ? Math.round(newTime / this.gridSize) * this.gridSize : newTime;

      this.keyframeManager.updateKeyframe(this.dragKeyframe.id, { time: snappedTime });
      this.draw();
    }

    handleMouseUp() {
      this.isDragging = false;
      this.dragKeyframe = null;
    }

    handleWheel(e) {
      e.preventDefault();
      // Zoom implementation would go here
    }

    xToTime(x) {
      const width = this.canvas.width;
      const duration = 10; // seconds
      return (x / width) * duration;
    }

    timeToX(time) {
      const width = this.canvas.width;
      const duration = 10; // seconds
      return (time / duration) * width;
    }

    getCurrentTime() {
      return 0; // Would get from timeline
    }

    getCurrentPropertyValue(property) {
      // Would get current value from clip properties
      return property === 'opacity' ? 1 : 0;
    }

    getKeyframeAtPosition(time, y) {
      if (!this.currentClipId) return null;

      const keyframes = this.keyframeManager.getClipKeyframes(this.currentClipId);
      const trackHeight = 40;
      const trackY = 20;

      for (const [property, propertyKeyframes] of Object.entries(keyframes)) {
        for (const keyframe of propertyKeyframes) {
          const x = this.timeToX(keyframe.time);
          if (Math.abs(x - this.timeToX(time)) < 10 &&
              Math.abs(trackY + (propertyKeyframes.indexOf(keyframe) * trackHeight) - y) < 15) {
            return keyframe;
          }
        }
      }

      return null;
    }

    selectKeyframe(keyframeId) {
      this.clearSelection();
      this.selectedKeyframes.add(keyframeId);
      this.draw();
    }

    toggleKeyframeSelection(keyframeId) {
      if (this.selectedKeyframes.has(keyframeId)) {
        this.selectedKeyframes.delete(keyframeId);
      } else {
        this.selectedKeyframes.add(keyframeId);
      }
      this.draw();
    }

    clearSelection() {
      this.selectedKeyframes.clear();
    }

    draw() {
      this.drawTimeline();
      this.drawKeyframes();
      this.drawCurveEditor();
    }

    drawTimeline() {
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;

      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;

      for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    drawKeyframes() {
      if (!this.currentClipId) return;

      const ctx = this.ctx;
      const keyframes = this.keyframeManager.getClipKeyframes(this.currentClipId);

      let trackY = 20;
      const trackHeight = 40;

      for (const [property, propertyKeyframes] of Object.entries(keyframes)) {
        // Draw track label
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText(property, 5, trackY + 15);

        // Draw keyframes
        for (const keyframe of propertyKeyframes) {
          const x = this.timeToX(keyframe.time);
          const isSelected = this.selectedKeyframes.has(keyframe.id);

          // Keyframe diamond
          ctx.fillStyle = isSelected ? '#ff6b6b' : '#4ecdc4';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;

          this.drawKeyframeDiamond(x, trackY + 20, 8, keyframe);

          // Keyframe label
          ctx.fillStyle = '#fff';
          ctx.font = '10px Arial';
          ctx.fillText(keyframe.time.toFixed(1), x - 10, trackY + 35);
        }

        trackY += trackHeight;
      }
    }

    drawKeyframeDiamond(x, y, size, keyframe) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    drawCurveEditor() {
      if (!this.showEasingCurves) return;

      const ctx = this.curveCtx;
      const width = this.curveCanvas.width;
      const height = this.curveCanvas.height;

      // Clear canvas
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, width, height);

      // Draw curve
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let x = 0; x <= width; x++) {
        const t = x / width;
        const easedT = EASING_FUNCTIONS.easeInOutQuad(t);
        const y = height - (easedT * height);

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    destroy() {
      this.keyframeManager.destroy();
    }
  }

  // Export to global scope
  global.KeyframeManager = KeyframeManager;
  global.KeyframeEditor = KeyframeEditor;
  global.EASING_FUNCTIONS = EASING_FUNCTIONS;

})(typeof window !== 'undefined' ? window : globalThis);
