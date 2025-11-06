'use strict';

(function registerWaveformVisualizer(global) {
  // Advanced audio waveform visualization system
  class WaveformVisualizer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.waveformData = null;
      this.audioBuffer = null;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.zoom = 1;
      this.scrollPosition = 0;

      // Configuration
      this.config = {
        height: options.height || 120,
        backgroundColor: options.backgroundColor || '#1a1a1a',
        waveformColor: options.waveformColor || '#3b82f6',
        progressColor: options.progressColor || '#10b981',
        cursorColor: options.cursorColor || '#ef4444',
        gridColor: options.gridColor || '#374151',
        showGrid: options.showGrid !== false,
        showTimeLabels: options.showTimeLabels !== false,
        showAmplitudeLabels: options.showAmplitudeLabels !== false,
        smoothing: options.smoothing || 0.8,
        fftSize: options.fftSize || 2048,
        minDecibels: options.minDecibels || -90,
        maxDecibels: options.maxDecibels || -10
      };

      // Animation
      this.animationId = null;
      this.lastDrawTime = 0;

      // Event handling
      this.eventListeners = new Map();
      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartTime = 0;

      this.setupEventListeners();
      this.resize();
    }

    setupEventListeners() {
      const canvas = this.canvas;

      canvas.addEventListener('click', (e) => {
        this.handleClick(e);
      });

      canvas.addEventListener('mousedown', (e) => {
        this.handleMouseDown(e);
      });

      canvas.addEventListener('mousemove', (e) => {
        this.handleMouseMove(e);
      });

      canvas.addEventListener('mouseup', () => {
        this.handleMouseUp();
      });

      canvas.addEventListener('wheel', (e) => {
        this.handleWheel(e);
      });

      canvas.addEventListener('dblclick', (e) => {
        this.handleDoubleClick(e);
      });
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = this.config.height;
      this.draw();
    }

    setWaveformData(waveformData) {
      this.waveformData = waveformData;
      this.duration = waveformData.duration || 0;
      this.draw();
    }

    setAudioBuffer(audioBuffer) {
      this.audioBuffer = audioBuffer;
      this.duration = audioBuffer.duration;
      this.generateWaveformFromBuffer(audioBuffer);
    }

    generateWaveformFromBuffer(audioBuffer) {
      const channelData = audioBuffer.getChannelData(0);
      const samples = channelData.length;
      const blockSize = Math.floor(samples / this.canvas.width);
      const waveform = [];

      for (let i = 0; i < this.canvas.width; i++) {
        const start = i * blockSize;
        const end = Math.min(start + blockSize, samples);
        let sum = 0;

        for (let j = start; j < end; j++) {
          sum += Math.abs(channelData[j]);
        }

        const amplitude = sum / (end - start);
        waveform.push(amplitude);
      }

      this.waveformData = {
        waveform,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels
      };

      this.draw();
    }

    setCurrentTime(time) {
      this.currentTime = Math.max(0, Math.min(time, this.duration));
      this.draw();
    }

    setZoom(zoom) {
      this.zoom = Math.max(0.1, Math.min(10, zoom));
      this.draw();
    }

    setScrollPosition(position) {
      this.scrollPosition = Math.max(0, Math.min(position, 1));
      this.draw();
    }

    play() {
      this.isPlaying = true;
      this.animate();
    }

    pause() {
      this.isPlaying = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }

    stop() {
      this.isPlaying = false;
      this.currentTime = 0;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this.draw();
    }

    animate() {
      if (!this.isPlaying) return;

      this.animationId = requestAnimationFrame(() => {
        this.animate();
      });

      this.draw();
    }

    draw() {
      const ctx = this.ctx;
      const canvas = this.canvas;
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.fillStyle = this.config.backgroundColor;
      ctx.fillRect(0, 0, width, height);

      if (!this.waveformData || !this.waveformData.waveform) {
        return;
      }

      // Draw grid
      if (this.config.showGrid) {
        this.drawGrid();
      }

      // Draw waveform
      this.drawWaveform();

      // Draw progress
      this.drawProgress();

      // Draw cursor
      this.drawCursor();

      // Draw labels
      if (this.config.showTimeLabels) {
        this.drawTimeLabels();
      }

      if (this.config.showAmplitudeLabels) {
        this.drawAmplitudeLabels();
      }
    }

    drawGrid() {
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;

      ctx.strokeStyle = this.config.gridColor;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;

      // Vertical lines (time)
      const timeStep = width / 20;
      for (let x = 0; x <= width; x += timeStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal lines (amplitude)
      const ampStep = height / 4;
      for (let y = ampStep; y < height; y += ampStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    drawWaveform() {
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const waveform = this.waveformData.waveform;

      if (!waveform || waveform.length === 0) return;

      ctx.strokeStyle = this.config.waveformColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;

      const centerY = height / 2;
      const scaleY = centerY * 0.8;

      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        const waveformIndex = Math.floor((x / width) * waveform.length);
        const amplitude = waveform[waveformIndex] || 0;
        const y = centerY - (amplitude * scaleY);

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawProgress() {
      if (this.duration === 0) return;

      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const progress = this.currentTime / this.duration;

      const progressX = (progress * width);

      // Progress background
      ctx.fillStyle = this.config.progressColor;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(0, 0, progressX, height);

      // Progress line
      ctx.strokeStyle = this.config.progressColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, height);
      ctx.stroke();
    }

    drawCursor() {
      if (this.duration === 0) return;

      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const progress = this.currentTime / this.duration;

      const cursorX = (progress * width);

      // Cursor line
      ctx.strokeStyle = this.config.cursorColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();

      // Cursor handle
      const handleSize = 8;
      ctx.fillStyle = this.config.cursorColor;
      ctx.fillRect(cursorX - handleSize / 2, 0, handleSize, height);
    }

    drawTimeLabels() {
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;

      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';

      const timeStep = this.duration / 10;
      for (let i = 0; i <= 10; i++) {
        const time = i * timeStep;
        const x = (i / 10) * width;
        const timeStr = this.formatTime(time);

        ctx.fillText(timeStr, x, height - 5);
      }
    }

    drawAmplitudeLabels() {
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';

      const labels = ['1.0', '0.5', '0.0', '-0.5', '-1.0'];
      for (let i = 0; i < labels.length; i++) {
        const y = (i / (labels.length - 1)) * height;
        ctx.fillText(labels[i], width - 5, y + 4);
      }
    }

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    handleClick(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = this.canvas.width;

      const time = (x / width) * this.duration;
      this.setCurrentTime(time);

      this.emit('time-selected', { time, x });
    }

    handleMouseDown(e) {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartTime = this.currentTime;
    }

    handleMouseMove(e) {
      if (!this.isDragging) return;

      const rect = this.canvas.getBoundingClientRect();
      const deltaX = e.clientX - this.dragStartX;
      const width = this.canvas.width;
      const deltaTime = (deltaX / width) * this.duration;

      const newTime = Math.max(0, Math.min(this.dragStartTime + deltaTime, this.duration));
      this.setCurrentTime(newTime);
    }

    handleMouseUp() {
      this.isDragging = false;
    }

    handleWheel(e) {
      e.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = this.canvas.width;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = this.zoom * zoomFactor;

      this.setZoom(newZoom);

      // Zoom towards mouse position
      const timeAtMouse = (x / width) * this.duration;
      const newScrollPosition = (timeAtMouse / this.duration) * (1 / newZoom);
      this.setScrollPosition(newScrollPosition);
    }

    handleDoubleClick(e) {
      this.emit('double-click', { x: e.clientX, y: e.clientY });
    }

    // Event system
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
            console.error('Waveform visualizer event handler error:', error);
          }
        });
      }
    }

    // Public API
    getDuration() {
      return this.duration;
    }

    getCurrentTime() {
      return this.currentTime;
    }

    getWaveformData() {
      return this.waveformData;
    }

    setConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      this.draw();
    }

    exportImage(format = 'png', quality = 1) {
      return this.canvas.toDataURL(`image/${format}`, quality);
    }

    destroy() {
      this.pause();
      this.eventListeners.clear();
    }
  }

  class MultiTrackWaveformVisualizer {
    constructor(container, options = {}) {
      this.container = container;
      this.visualizers = new Map();
      this.audioTracks = new Map();
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;

      this.config = {
        trackHeight: options.trackHeight || 60,
        trackSpacing: options.trackSpacing || 2,
        showTrackLabels: options.showTrackLabels !== false,
        showMasterTrack: options.showMasterTrack !== false,
        masterTrackHeight: options.masterTrackHeight || 80,
        colors: {
          background: options.backgroundColor || '#1a1a1a',
          trackBackground: options.trackBackground || '#2d2d2d',
          waveform: options.waveform || '#3b82f6',
          progress: options.progress || '#10b981',
          cursor: options.cursor || '#ef4444',
          text: options.text || '#9ca3af'
        }
      };

      this.setupContainer();
      this.setupEventListeners();
    }

  setupContainer() {
    // Clear existing content safely
    this.container.innerHTML = '';

    // Create elements using safe DOM construction
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'multi-track-waveform';

    const canvas = document.createElement('canvas');
    canvas.className = 'waveform-canvas';
    canvas.style.cssText = 'width: 100%; display: block;';

    waveformContainer.appendChild(canvas);

    const trackLabels = document.createElement('div');
    trackLabels.className = 'track-labels';
    trackLabels.style.cssText = `
      position: absolute; left: 0; top: 0; width: 120px; height: 100%;
      background: ${this.config.colors.trackBackground}; border-right: 1px solid #374151;
      display: ${this.config.showTrackLabels ? 'block' : 'none'};
    `;

    const masterLabel = document.createElement('div');
    masterLabel.className = 'master-track-label';
    masterLabel.style.cssText = `
      padding: 8px; color: ${this.config.colors.text}; font-size: 12px; font-weight: bold;
    `;
    masterLabel.textContent = 'Master';

    trackLabels.appendChild(masterLabel);
    waveformContainer.appendChild(trackLabels);

    this.container.appendChild(waveformContainer);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.trackLabels = trackLabels;

    this.resize();
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width - (this.config.showTrackLabels ? 120 : 0);
    this.canvas.height = this.calculateTotalHeight();
    this.draw();
  }

  calculateTotalHeight() {
    let height = 0;
    if (this.config.showMasterTrack) {
      height += this.config.masterTrackHeight;
    }
    for (const track of this.audioTracks.values()) {
      height += this.config.trackHeight + this.config.trackSpacing;
    }
    return Math.max(height - this.config.trackSpacing, 100);
  }

  addTrack(trackId, audioBuffer, options = {}) {
    const track = {
      id: trackId,
      audioBuffer,
      name: options.name || `Track ${trackId}`,
      color: options.color || this.config.colors.waveform,
      muted: options.muted || false,
      volume: options.volume !== undefined ? options.volume : 1,
      pan: options.pan || 0,
      effects: options.effects || []
    };

    this.audioTracks.set(trackId, track);
    this.updateTrackLabels();
    this.resize();
  }

  removeTrack(trackId) {
    this.audioTracks.delete(trackId);
    this.updateTrackLabels();
    this.resize();
  }

  setTrackAudio(trackId, audioBuffer) {
    const track = this.audioTracks.get(trackId);
    if (track) {
      track.audioBuffer = audioBuffer;
      this.resize();
    }
  }

  setCurrentTime(time) {
    this.currentTime = Math.max(0, Math.min(time, this.duration));
    this.draw();
  }

  play() {
    this.isPlaying = true;
    this.animate();
  }

  pause() {
    this.isPlaying = false;
  }

  stop() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.draw();
  }

  animate() {
    if (!this.isPlaying) return;

    requestAnimationFrame(() => {
      this.animate();
    });

    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.fillStyle = this.config.colors.background;
    ctx.fillRect(0, 0, width, height);

    let currentY = 0;

    // Draw master track
    if (this.config.showMasterTrack) {
      this.drawTrack('master', currentY, this.config.masterTrackHeight);
      currentY += this.config.masterTrackHeight + this.config.trackSpacing;
    }

    // Draw individual tracks
    for (const [trackId, track] of this.audioTracks) {
      this.drawTrack(trackId, currentY, this.config.trackHeight);
      currentY += this.config.trackHeight + this.config.trackSpacing;
    }

    // Draw cursor
    this.drawCursor();
  }

  drawTrack(trackId, y, height) {
    const ctx = this.ctx;
    const width = this.canvas.width;

    // Track background
    ctx.fillStyle = this.config.colors.trackBackground;
    ctx.fillRect(0, y, width, height);

    // Track border
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, y, width, height);

    const track = trackId === 'master' ? null : this.audioTracks.get(trackId);
    if (track && track.audioBuffer) {
      this.drawWaveform(track.audioBuffer, 0, y, width, height, track.color);
    }
  }

  drawWaveform(audioBuffer, x, y, width, height, color) {
    const ctx = this.ctx;
    const channelData = audioBuffer.getChannelData(0);
    const samples = channelData.length;
    const blockSize = Math.floor(samples / width);
    const centerY = y + height / 2;
    const scaleY = (height / 2) * 0.8;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;

    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, samples);
      let sum = 0;

      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j]);
      }

      const amplitude = sum / (end - start);
      const waveY = centerY - (amplitude * scaleY);

      if (i === 0) {
        ctx.moveTo(x + i, waveY);
      } else {
        ctx.lineTo(x + i, waveY);
      }
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawCursor() {
    if (this.duration === 0) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const progress = this.currentTime / this.duration;

    const cursorX = progress * width;

    // Cursor line
    ctx.strokeStyle = this.config.colors.cursor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, height);
    ctx.stroke();
  }

  updateTrackLabels() {
    if (!this.config.showTrackLabels) return;

    const labelsContainer = this.trackLabels;
    const existingLabels = labelsContainer.querySelectorAll('.track-label');

    // Remove existing labels
    existingLabels.forEach(label => label.remove());

    // Add master track label
    if (this.config.showMasterTrack) {
      const masterLabel = document.createElement('div');
      masterLabel.className = 'track-label master-track-label';
      masterLabel.textContent = 'Master';
      masterLabel.style.cssText = `
        padding: 8px;
        color: ${this.config.colors.text};
        font-size: 12px;
        font-weight: bold;
        border-bottom: 1px solid #374151;
      `;
      labelsContainer.appendChild(masterLabel);
    }

    // Add track labels
    for (const [trackId, track] of this.audioTracks) {
      const label = document.createElement('div');
      label.className = 'track-label';
      label.textContent = track.name;
      label.style.cssText = `
        padding: 8px;
        color: ${this.config.colors.text};
        font-size: 12px;
        border-bottom: 1px solid #374151;
        height: ${this.config.trackHeight}px;
        display: flex;
        align-items: center;
      `;
      labelsContainer.appendChild(label);
    }
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.duration;
  }

  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.updateTrackLabels();
    this.resize();
  }

  destroy() {
    this.pause();
  }
}

// Export to global scope
global.WaveformVisualizer = WaveformVisualizer;
global.MultiTrackWaveformVisualizer = MultiTrackWaveformVisualizer;
