'use strict';

(function registerMobileTouchUI(global) {
  // Mobile-first touch interface for Artone
  const MOBILE_BREAKPOINTS = {
    mobile: 768,
    tablet: 1024,
    desktop: 1280
  };

  const TOUCH_CONFIG = {
    // Touch gesture thresholds
    tapThreshold: 10,
    swipeThreshold: 50,
    pinchThreshold: 0.1,
    longPressDelay: 500,

    // UI sizing for touch
    minTouchTarget: 44,
    minButtonSize: 48,
    minSliderHeight: 32,
    minTextSize: 16,

    // Gesture recognition
    gestureTimeout: 300,
    multiTouchTimeout: 100,

    // Scroll and zoom
    scrollThreshold: 5,
    zoomThreshold: 0.05,
    momentumDuration: 300
  };

  class MobileTouchManager {
    constructor() {
      this.isMobile = false;
      this.isTablet = false;
      this.isTouchDevice = false;
      this.touchStartX = 0;
      this.touchStartY = 0;
      this.touchStartTime = 0;
      this.longPressTimer = null;
      this.gestureStartDistance = 0;
      this.gestureStartTime = 0;
      this.activeTouches = new Map();
      this.gestureCallbacks = new Map();
      this.momentumAnimation = null;

      this.detectDevice();
      this.setupTouchEvents();
    }

    detectDevice() {
      const width = window.innerWidth;
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      this.isMobile = width < MOBILE_BREAKPOINTS.mobile;
      this.isTablet = width >= MOBILE_BREAKPOINTS.mobile && width < MOBILE_BREAKPOINTS.desktop;
      this.isTouchDevice = isTouch;

      // Override detection for known mobile devices
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
        this.isMobile = true;
      }

      console.log('Device detected:', {
        isMobile: this.isMobile,
        isTablet: this.isTablet,
        isTouchDevice: this.isTouchDevice,
        width: width
      });
    }

    setupTouchEvents() {
      if (!this.isTouchDevice) return;

      // Touch event listeners
      document.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
      document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
      document.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
      document.addEventListener('touchcancel', (e) => this.handleTouchCancel(e), { passive: false });

      // Gesture events
      document.addEventListener('gesturestart', (e) => this.handleGestureStart(e));
      document.addEventListener('gesturechange', (e) => this.handleGestureChange(e));
      document.addEventListener('gestureend', (e) => this.handleGestureEnd(e));

      // Window resize
      window.addEventListener('resize', () => {
        this.detectDevice();
        this.emit('device-changed', {
          isMobile: this.isMobile,
          isTablet: this.isTablet,
          width: window.innerWidth
        });
      });

      // Orientation change
      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          this.detectDevice();
          this.emit('orientation-changed', {
            orientation: window.orientation || 0,
            isMobile: this.isMobile
          });
        }, 100);
      });
    }

    handleTouchStart(e) {
      const touches = e.touches;
      const touch = touches[0];
      const now = Date.now();

      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchStartTime = now;

      // Track all touches
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        this.activeTouches.set(t.identifier, {
          id: t.identifier,
          x: t.clientX,
          y: t.clientY,
          startX: t.clientX,
          startY: t.clientY,
          startTime: now
        });
      }

      // Long press detection
      if (touches.length === 1) {
        this.longPressTimer = setTimeout(() => {
          this.emit('long-press', {
            x: touch.clientX,
            y: touch.clientY,
            target: e.target
          });
        }, TOUCH_CONFIG.longPressDelay);
      }

      // Multi-touch gesture detection
      if (touches.length === 2) {
        const t1 = touches[0];
        const t2 = touches[1];
        this.gestureStartDistance = this.getDistance(t1, t2);
        this.gestureStartTime = now;
      }

      this.emit('touch-start', {
        touches: Array.from(this.activeTouches.values()),
        originalEvent: e
      });
    }

    handleTouchMove(e) {
      e.preventDefault(); // Prevent scrolling and other default behaviors

      const touches = e.touches;
      const now = Date.now();

      // Update touch positions
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        const activeTouch = this.activeTouches.get(t.identifier);
        if (activeTouch) {
          activeTouch.x = t.clientX;
          activeTouch.y = t.clientY;
        }
      }

      // Detect gestures
      if (touches.length === 1) {
        const touch = touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Clear long press timer
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }

        // Detect swipe
        if (distance > TOUCH_CONFIG.swipeThreshold) {
          const direction = this.getSwipeDirection(deltaX, deltaY);
          this.emit('swipe', {
            direction,
            deltaX,
            deltaY,
            distance,
            velocity: distance / (now - this.touchStartTime),
            touch: touches[0]
          });
        }

        // Detect drag
        if (distance > TOUCH_CONFIG.tapThreshold) {
          this.emit('drag', {
            deltaX,
            deltaY,
            distance,
            touch: touches[0]
          });
        }
      }

      // Pinch gesture
      if (touches.length === 2) {
        const t1 = touches[0];
        const t2 = touches[1];
        const currentDistance = this.getDistance(t1, t2);
        const scale = currentDistance / this.gestureStartDistance;

        if (Math.abs(scale - 1) > TOUCH_CONFIG.pinchThreshold) {
          this.emit('pinch', {
            scale,
            centerX: (t1.clientX + t2.clientX) / 2,
            centerY: (t1.clientY + t2.clientY) / 2,
            touches: [t1, t2]
          });
        }
      }

      this.emit('touch-move', {
        touches: Array.from(this.activeTouches.values()),
        originalEvent: e
      });
    }

    handleTouchEnd(e) {
      const touches = e.changedTouches;
      const now = Date.now();

      for (let i = 0; i < touches.length; i++) {
        const touch = touches[i];
        const activeTouch = this.activeTouches.get(touch.identifier);

        if (activeTouch) {
          const deltaX = touch.clientX - activeTouch.startX;
          const deltaY = touch.clientY - activeTouch.startY;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const duration = now - activeTouch.startTime;

          // Detect tap
          if (distance < TOUCH_CONFIG.tapThreshold && duration < TOUCH_CONFIG.longPressDelay) {
            this.emit('tap', {
              x: touch.clientX,
              y: touch.clientY,
              target: touch.target,
              touch
            });
          }

          // Detect double tap
          if (duration < 300 && distance < TOUCH_CONFIG.tapThreshold) {
            this.emit('double-tap', {
              x: touch.clientX,
              y: touch.clientY,
              target: touch.target,
              touch
            });
          }

          this.activeTouches.delete(touch.identifier);
        }
      }

      // Clear long press timer
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      this.emit('touch-end', {
        remainingTouches: Array.from(this.activeTouches.values()),
        originalEvent: e
      });
    }

    handleTouchCancel(e) {
      // Clear all touches
      this.activeTouches.clear();

      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      this.emit('touch-cancel', { originalEvent: e });
    }

    handleGestureStart(e) {
      this.emit('gesture-start', { scale: e.scale, rotation: e.rotation });
    }

    handleGestureChange(e) {
      this.emit('gesture-change', { scale: e.scale, rotation: e.rotation });
    }

    handleGestureEnd(e) {
      this.emit('gesture-end', { scale: e.scale, rotation: e.rotation });
    }

    getSwipeDirection(deltaX, deltaY) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX > absY) {
        return deltaX > 0 ? 'right' : 'left';
      } else {
        return deltaY > 0 ? 'down' : 'up';
      }
    }

    getDistance(touch1, touch2) {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Event system
    on(event, callback) {
      if (!this.gestureCallbacks.has(event)) {
        this.gestureCallbacks.set(event, []);
      }
      this.gestureCallbacks.get(event).push(callback);
    }

    off(event, callback) {
      if (this.gestureCallbacks.has(event)) {
        const callbacks = this.gestureCallbacks.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }

    emit(event, data) {
      if (this.gestureCallbacks.has(event)) {
        this.gestureCallbacks.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Touch event handler error:', error);
          }
        });
      }
    }

    // Public API
    isTouchDevice() {
      return this.isTouchDevice;
    }

    isMobile() {
      return this.isMobile;
    }

    isTablet() {
      return this.isTablet;
    }

    getDeviceInfo() {
      return {
        isMobile: this.isMobile,
        isTablet: this.isTablet,
        isTouchDevice: this.isTouchDevice,
        width: window.innerWidth,
        height: window.innerHeight,
        orientation: window.orientation || 0
      };
    }
  }

  class MobileUIAdapter {
    constructor(touchManager) {
      this.touchManager = touchManager;
      this.isMobileMode = false;
      this.originalElements = new Map();
      this.touchElements = new Map();
      this.isEnabled = false;

      this.setupMobileMode();
    }

    setupMobileMode() {
      this.detectMobileMode();
      this.setupMobileOptimizations();
      this.createMobileControls();
    }

    detectMobileMode() {
      this.isMobileMode = this.touchManager.isMobile() || this.touchManager.isTablet();
      this.isEnabled = this.isMobileMode;
    }

    setupMobileOptimizations() {
      if (!this.isMobileMode) return;

      // Optimize viewport
      this.optimizeViewport();

      // Add touch-friendly CSS
      this.addMobileCSS();

      // Optimize existing elements
      this.optimizeExistingElements();
    }

    optimizeViewport() {
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        document.head.appendChild(viewport);
      }

      viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover';
    }

    addMobileCSS() {
      const mobileCSS = `
        .mobile-optimized {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          -khtml-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .touch-target {
          min-width: ${TOUCH_CONFIG.minTouchTarget}px;
          min-height: ${TOUCH_CONFIG.minTouchTarget}px;
          padding: 8px;
        }

        .mobile-button {
          min-width: ${TOUCH_CONFIG.minButtonSize}px;
          min-height: ${TOUCH_CONFIG.minButtonSize}px;
          border-radius: 8px;
          touch-action: manipulation;
        }

        .mobile-slider {
          min-height: ${TOUCH_CONFIG.minSliderHeight}px;
          touch-action: pan-y;
        }

        .mobile-text {
          font-size: ${TOUCH_CONFIG.minTextSize}px;
          line-height: 1.4;
        }

        .mobile-scroll {
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        .mobile-gesture-area {
          touch-action: none;
        }

        @media (max-width: ${MOBILE_BREAKPOINTS.mobile}px) {
          .desktop-only {
            display: none !important;
          }
          .mobile-only {
            display: block !important;
          }
        }

        @media (min-width: ${MOBILE_BREAKPOINTS.mobile}px) and (max-width: ${MOBILE_BREAKPOINTS.tablet}px) {
          .mobile-only, .tablet-only {
            display: block !important;
          }
          .desktop-only {
            display: none !important;
          }
        }

        @media (min-width: ${MOBILE_BREAKPOINTS.desktop}px) {
          .mobile-only, .tablet-only {
            display: none !important;
          }
          .desktop-only {
            display: block !important;
          }
        }
      `;

      const style = document.createElement('style');
      style.textContent = mobileCSS;
      document.head.appendChild(style);
    }

    optimizeExistingElements() {
      // Make buttons touch-friendly
      document.querySelectorAll('button, .button').forEach(btn => {
        if (!btn.classList.contains('mobile-optimized')) {
          btn.classList.add('mobile-button', 'touch-target');
          this.originalElements.set(btn, { className: btn.className });
        }
      });

      // Optimize sliders
      document.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.classList.add('mobile-slider');
      });

      // Optimize text
      document.querySelectorAll('p, span, div').forEach(el => {
        if (el.offsetHeight < TOUCH_CONFIG.minTouchTarget && el.textContent) {
          el.classList.add('mobile-text');
        }
      });

      // Add mobile class to body
      document.body.classList.add('mobile-optimized');
    }

    createMobileControls() {
      if (!this.isMobileMode) return;

      this.createMobileTimelineControls();
      this.createMobilePropertyControls();
      this.createMobilePlaybackControls();
      this.createMobileGestureControls();
    }

    createMobileTimelineControls() {
      const timelineControls = document.createElement('div');
      timelineControls.className = 'mobile-timeline-controls mobile-only';
      const createButton = (className, title, label) => {
        const button = document.createElement('button');
        button.className = `mobile-button ${className}`;
        button.title = title;
        button.textContent = label;
        return button;
      };

      const zoomGroup = document.createElement('div');
      zoomGroup.className = 'mobile-control-group';
      const zoomOutButton = createButton('zoom-out', 'Zoom Out', '🔍-');
      const zoomInButton = createButton('zoom-in', 'Zoom In', '🔍+');
      const fitButton = createButton('fit-screen', 'Fit to Screen', '📐');
      zoomGroup.appendChild(zoomOutButton);
      zoomGroup.appendChild(zoomInButton);
      zoomGroup.appendChild(fitButton);

      const toggleGroup = document.createElement('div');
      toggleGroup.className = 'mobile-control-group';
      const snapButton = createButton('snap-toggle', 'Toggle Snap', '📏');
      const gridButton = createButton('grid-toggle', 'Toggle Grid', '⊞');
      toggleGroup.appendChild(snapButton);
      toggleGroup.appendChild(gridButton);

      timelineControls.appendChild(zoomGroup);
      timelineControls.appendChild(toggleGroup);

      // Insert after timeline
      const timeline = document.querySelector('.timeline');
      if (timeline && timeline.parentNode) {
        timeline.parentNode.insertBefore(timelineControls, timeline.nextSibling);
      }

      // Add event listeners
      zoomOutButton.addEventListener('click', () => {
        this.emit('timeline-zoom', { direction: 'out' });
      });

      zoomInButton.addEventListener('click', () => {
        this.emit('timeline-zoom', { direction: 'in' });
      });

      fitButton.addEventListener('click', () => {
        this.emit('timeline-fit', {});
      });

      snapButton.addEventListener('click', () => {
        this.emit('timeline-snap-toggle', {});
      });

      gridButton.addEventListener('click', () => {
        this.emit('timeline-grid-toggle', {});
      });
    }

    createMobilePropertyControls() {
      const propertyControls = document.createElement('div');
      propertyControls.className = 'mobile-property-controls mobile-only';
      const createButton = (className, title, label) => {
        const button = document.createElement('button');
        button.className = `mobile-button ${className}`;
        button.title = title;
        button.textContent = label;
        return button;
      };

      const propertyGroup = document.createElement('div');
      propertyGroup.className = 'mobile-control-group';
      const resetButton = createButton('reset-property', 'Reset Property', '↻');
      const copyButton = createButton('copy-property', 'Copy Property', '📋');
      const pasteButton = createButton('paste-property', 'Paste Property', '📌');
      propertyGroup.appendChild(resetButton);
      propertyGroup.appendChild(copyButton);
      propertyGroup.appendChild(pasteButton);

      const keyframeGroup = document.createElement('div');
      keyframeGroup.className = 'mobile-control-group';
      const addKeyframeButton = createButton('add-keyframe', 'Add Keyframe', '🔑');
      const showCurvesButton = createButton('show-curves', 'Show Curves', '📈');
      keyframeGroup.appendChild(addKeyframeButton);
      keyframeGroup.appendChild(showCurvesButton);

      propertyControls.appendChild(propertyGroup);
      propertyControls.appendChild(keyframeGroup);

      // Insert in properties panel
      const propertiesPanel = document.querySelector('.properties-panel');
      if (propertiesPanel) {
        propertiesPanel.appendChild(propertyControls);
      }

      // Add event listeners
      resetButton.addEventListener('click', () => {
        this.emit('property-reset', {});
      });

      copyButton.addEventListener('click', () => {
        this.emit('property-copy', {});
      });

      pasteButton.addEventListener('click', () => {
        this.emit('property-paste', {});
      });

      addKeyframeButton.addEventListener('click', () => {
        this.emit('keyframe-add', {});
      });

      showCurvesButton.addEventListener('click', () => {
        this.emit('curves-show', {});
      });
    }

    createMobilePlaybackControls() {
      const playbackControls = document.createElement('div');
      playbackControls.className = 'mobile-playback-controls mobile-only';
      const createButton = (className, title, label) => {
        const button = document.createElement('button');
        button.className = `mobile-button ${className}`;
        button.title = title;
        button.textContent = label;
        return button;
      };

      const playbackGroup = document.createElement('div');
      playbackGroup.className = 'mobile-control-group';
      const skipBackwardButton = createButton('skip-backward', 'Skip Backward', '⏪');
      const playPauseButton = createButton('play-pause', 'Play/Pause', '▶️');
      const skipForwardButton = createButton('skip-forward', 'Skip Forward', '⏩');
      playbackGroup.appendChild(skipBackwardButton);
      playbackGroup.appendChild(playPauseButton);
      playbackGroup.appendChild(skipForwardButton);

      const recordingGroup = document.createElement('div');
      recordingGroup.className = 'mobile-control-group';
      const recordButton = createButton('record', 'Record', '⏺️');
      const loopButton = createButton('loop-toggle', 'Toggle Loop', '🔁');
      const speedButton = createButton('speed-control', 'Speed Control', '⚡');
      recordingGroup.appendChild(recordButton);
      recordingGroup.appendChild(loopButton);
      recordingGroup.appendChild(speedButton);

      playbackControls.appendChild(playbackGroup);
      playbackControls.appendChild(recordingGroup);

      // Insert in playback area
      const playbackArea = document.querySelector('.playback-controls');
      if (playbackArea) {
        playbackArea.appendChild(playbackControls);
      }

      // Add event listeners
      skipBackwardButton.addEventListener('click', () => {
        this.emit('playback-skip', { direction: 'backward' });
      });

      playPauseButton.addEventListener('click', () => {
        this.emit('playback-toggle', {});
      });

      skipForwardButton.addEventListener('click', () => {
        this.emit('playback-skip', { direction: 'forward' });
      });

      recordButton.addEventListener('click', () => {
        this.emit('playback-record', {});
      });

      loopButton.addEventListener('click', () => {
        this.emit('playback-loop-toggle', {});
      });

      speedButton.addEventListener('click', () => {
        this.emit('playback-speed', {});
      });
    }

    createMobileGestureControls() {
      const gestureOverlay = document.createElement('div');
      gestureOverlay.className = 'mobile-gesture-overlay mobile-only';
      gestureOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
      `;

      document.body.appendChild(gestureOverlay);

      // Add gesture areas
      const timelineGestureArea = document.createElement('div');
      timelineGestureArea.className = 'timeline-gesture-area mobile-gesture-area';
      timelineGestureArea.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 200px;
        pointer-events: auto;
      `;

      gestureOverlay.appendChild(timelineGestureArea);

      // Touch manager integration
      this.touchManager.on('swipe', (data) => {
        this.handleSwipeGesture(data);
      });

      this.touchManager.on('pinch', (data) => {
        this.handlePinchGesture(data);
      });

      this.touchManager.on('tap', (data) => {
        this.handleTapGesture(data);
      });

      this.touchManager.on('double-tap', (data) => {
        this.handleDoubleTapGesture(data);
      });
    }

    handleSwipeGesture(data) {
      switch (data.direction) {
        case 'left':
          this.emit('timeline-scrub', { direction: 'forward', velocity: data.velocity });
          break;
        case 'right':
          this.emit('timeline-scrub', { direction: 'backward', velocity: data.velocity });
          break;
        case 'up':
          this.emit('timeline-zoom', { direction: 'in' });
          break;
        case 'down':
          this.emit('timeline-zoom', { direction: 'out' });
          break;
      }
    }

    handlePinchGesture(data) {
      if (data.scale > 1) {
        this.emit('timeline-zoom', { direction: 'in', center: data.centerX });
      } else {
        this.emit('timeline-zoom', { direction: 'out', center: data.centerX });
      }
    }

    handleTapGesture(data) {
      // Timeline position tap
      const timeline = document.querySelector('.timeline');
      if (timeline && timeline.contains(data.target)) {
        const rect = timeline.getBoundingClientRect();
        const position = (data.x - rect.left) / rect.width;
        this.emit('timeline-seek', { position });
      }
    }

    handleDoubleTapGesture(data) {
      this.emit('timeline-fit', {});
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
            console.error('Mobile UI event handler error:', error);
          }
        });
      }
    }

    // Public API
    enable() {
      this.isEnabled = true;
      this.setupMobileOptimizations();
    }

    disable() {
      this.isEnabled = false;
      this.restoreOriginalElements();
    }

    isEnabled() {
      return this.isEnabled;
    }

    getTouchManager() {
      return this.touchManager;
    }

    restoreOriginalElements() {
      for (const [element, original] of this.originalElements) {
        element.className = original.className;
      }
      this.originalElements.clear();

      document.body.classList.remove('mobile-optimized');
    }
  }

  class MobileKeyboardManager {
    constructor() {
      this.isMobile = false;
      this.virtualKeyboard = null;
      this.isKeyboardVisible = false;
      this.inputElements = new Set();
      this.keyboardHeight = 0;

      this.setupMobileKeyboard();
    }

    setupMobileKeyboard() {
      this.detectMobileKeyboard();

      if (this.isMobile) {
        this.createVirtualKeyboard();
        this.setupKeyboardEvents();
        this.optimizeInputs();
      }
    }

    detectMobileKeyboard() {
      const userAgent = navigator.userAgent.toLowerCase();
      this.isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);

      if (this.isMobile) {
        // Detect keyboard height
        this.keyboardHeight = this.estimateKeyboardHeight();
      }
    }

    estimateKeyboardHeight() {
      const screenHeight = screen.height;
      const windowHeight = window.innerHeight;

      if (screenHeight > windowHeight) {
        return screenHeight - windowHeight;
      }

      // Default estimates
      return window.innerWidth > window.innerHeight ? 300 : 250;
    }

    createVirtualKeyboard() {
      this.virtualKeyboard = document.createElement('div');
      this.virtualKeyboard.className = 'virtual-keyboard mobile-only';
      this.virtualKeyboard.style.cssText = `
        position: fixed;
        bottom: -${this.keyboardHeight}px;
        left: 0;
        right: 0;
        height: ${this.keyboardHeight}px;
        background: #f8f9fa;
        border-top: 1px solid #dee2e6;
        display: flex;
        flex-wrap: wrap;
        padding: 8px;
        box-sizing: border-box;
        transition: bottom 0.3s ease;
        z-index: 10000;
      `;

      // Create number row
      const numberRow = this.createKeyRow(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
      this.virtualKeyboard.appendChild(numberRow);

      // Create QWERTY row 1
      const qwertyRow1 = this.createKeyRow(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']);
      this.virtualKeyboard.appendChild(qwertyRow1);

      // Create QWERTY row 2
      const qwertyRow2 = this.createKeyRow(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']);
      this.virtualKeyboard.appendChild(qwertyRow2);

      // Create bottom row with special keys
      const bottomRow = document.createElement('div');
      bottomRow.className = 'keyboard-row';
      bottomRow.style.cssText = 'display: flex; justify-content: space-between; width: 100%;';

      const shiftKey = this.createKey('⇧', 'shift');
      const spaceKey = this.createKey('Space', 'space', { flex: '1' });
      const backspaceKey = this.createKey('⌫', 'backspace');
      const enterKey = this.createKey('⏎', 'enter');

      bottomRow.appendChild(shiftKey);
      bottomRow.appendChild(spaceKey);
      bottomRow.appendChild(backspaceKey);
      bottomRow.appendChild(enterKey);

      this.virtualKeyboard.appendChild(bottomRow);

      document.body.appendChild(this.virtualKeyboard);
    }

    createKeyRow(keys) {
      const row = document.createElement('div');
      row.className = 'keyboard-row';
      row.style.cssText = 'display: flex; width: 100%; margin-bottom: 4px;';

      keys.forEach(key => {
        const keyElement = this.createKey(key);
        row.appendChild(keyElement);
      });

      return row;
    }

    createKey(label, keyType = 'character', options = {}) {
      const key = document.createElement('button');
      key.className = `virtual-key virtual-${keyType}`;
      key.textContent = label;
      key.style.cssText = `
        flex: ${options.flex || '0 0 auto'};
        margin: 0 2px;
        padding: 8px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
        font-size: 14px;
        cursor: pointer;
        touch-action: manipulation;
        min-width: ${TOUCH_CONFIG.minTouchTarget}px;
        min-height: ${TOUCH_CONFIG.minTouchTarget}px;
      `;

      key.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.handleKeyPress(keyType, label);
      });

      return key;
    }

    handleKeyPress(keyType, label) {
      const activeElement = document.activeElement;

      if (!activeElement || !['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
        return;
      }

      switch (keyType) {
        case 'character':
          this.insertText(activeElement, label);
          break;
        case 'space':
          this.insertText(activeElement, ' ');
          break;
        case 'backspace':
          this.deleteText(activeElement);
          break;
        case 'enter':
          activeElement.dispatchEvent(new Event('submit', { bubbles: true }));
          break;
        case 'shift':
          this.toggleShift();
          break;
      }
    }

    insertText(element, text) {
      const start = element.selectionStart;
      const end = element.selectionEnd;
      const value = element.value;

      element.value = value.substring(0, start) + text + value.substring(end);
      element.selectionStart = element.selectionEnd = start + text.length;
      element.focus();

      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    deleteText(element) {
      const start = element.selectionStart;
      const end = element.selectionEnd;

      if (start === end) {
        // Delete previous character
        element.selectionStart = Math.max(0, start - 1);
      }

      this.insertText(element, '');
    }

    toggleShift() {
      // Toggle case of letter keys
      const letterKeys = this.virtualKeyboard.querySelectorAll('.virtual-character');
      letterKeys.forEach(key => {
        const text = key.textContent;
        key.textContent = text === text.toUpperCase() ? text.toLowerCase() : text.toUpperCase();
      });
    }

    setupKeyboardEvents() {
      // Show/hide virtual keyboard
      document.addEventListener('focusin', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
          this.showKeyboard();
          this.inputElements.add(e.target);
        }
      });

      document.addEventListener('focusout', (e) => {
        if (this.inputElements.has(e.target)) {
          setTimeout(() => {
            this.inputElements.delete(e.target);
            if (this.inputElements.size === 0) {
              this.hideKeyboard();
            }
          }, 100);
        }
      });

      // Window resize
      window.addEventListener('resize', () => {
        this.updateKeyboardPosition();
      });
    }

    showKeyboard() {
      if (!this.virtualKeyboard) return;

      this.isKeyboardVisible = true;
      this.virtualKeyboard.style.bottom = '0';

      // Adjust viewport
      this.adjustViewportForKeyboard();
    }

    hideKeyboard() {
      if (!this.virtualKeyboard) return;

      this.isKeyboardVisible = false;
      this.virtualKeyboard.style.bottom = `-${this.keyboardHeight}px`;

      // Restore viewport
      this.restoreViewport();
    }

    updateKeyboardPosition() {
      if (this.isKeyboardVisible) {
        this.adjustViewportForKeyboard();
      }
    }

    adjustViewportForKeyboard() {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.content = `width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover`;
      }
    }

    restoreViewport() {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover';
      }
    }

    optimizeInputs() {
      // Make all inputs mobile-friendly
      document.querySelectorAll('input, textarea').forEach(input => {
        input.style.cssText += `
          font-size: 16px;
          padding: 12px 16px;
          border-radius: 8px;
          border: 2px solid #dee2e6;
        `;

        // Prevent zoom on iOS
        input.addEventListener('focus', () => {
          if (this.isMobile) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      });
    }

    // Public API
    isVisible() {
      return this.isKeyboardVisible;
    }

    getHeight() {
      return this.keyboardHeight;
    }

    destroy() {
      if (this.virtualKeyboard) {
        this.virtualKeyboard.remove();
        this.virtualKeyboard = null;
      }
    }
  }

  // Export to global scope
  global.MobileTouchManager = MobileTouchManager;
  global.MobileUIAdapter = MobileUIAdapter;
  global.MobileKeyboardManager = MobileKeyboardManager;
  global.TOUCH_CONFIG = TOUCH_CONFIG;
  global.MOBILE_BREAKPOINTS = MOBILE_BREAKPOINTS;

})(typeof window !== 'undefined' ? window : globalThis);
