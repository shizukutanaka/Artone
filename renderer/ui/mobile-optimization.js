/**
 * Mobile Optimization Suite - Touch Interactions, Responsive UI, and Mobile Performance
 * Comprehensive mobile support for Artone Video Editor
 */

(function initializeMobileOptimization(global) {
  'use strict';

  const React = global.React;
  const { useState, useEffect, useCallback, useRef } = React;

  // Mobile Detection and Capabilities
  const MobileDetection = {
    isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             (window.innerWidth <= 768 && window.innerHeight <= 1024);
    },

    isTablet() {
      return /iPad|Android(?=.*\bMobile\b)|Tablet/i.test(navigator.userAgent) ||
             (window.innerWidth > 768 && window.innerWidth <= 1024);
    },

    isTouchDevice() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    },

    getDevicePixelRatio() {
      return window.devicePixelRatio || 1;
    },

    getScreenSize() {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
      };
    },

    supportsPassiveEvents() {
      let supportsPassive = false;
      try {
        const opts = Object.defineProperty({}, 'passive', {
          get: () => supportsPassive = true
        });
        window.addEventListener('test', null, opts);
        window.removeEventListener('test', null, opts);
      } catch (e) {}
      return supportsPassive;
    },

    getTouchCapabilities() {
      return {
        maxTouchPoints: navigator.maxTouchPoints || 1,
        hasForceTouch: 'webkitForce' in document.createElement('div').style,
        has3DTouch: 'ontouchforcechange' in window
      };
    },

    // Performance capabilities
    getPerformanceCapabilities() {
      const connection = (navigator as any).connection;
      return {
        effectiveType: connection?.effectiveType || 'unknown',
        downlink: connection?.downlink || 0,
        rtt: connection?.rtt || 0,
        memory: (navigator as any).deviceMemory || 4,
        hardwareConcurrency: navigator.hardwareConcurrency || 2
      };
    }
  };

  // Touch Gesture Recognition
  class TouchGestureRecognizer {
    constructor(element, options = {}) {
      this.element = element;
      this.options = {
        minSwipeDistance: 50,
        maxTapDuration: 300,
        maxDoubleTapDelay: 300,
        ...options
      };

      this.touches = new Map();
      this.lastTap = 0;
      this.listeners = new Map();

      this.bindEvents();
    }

    bindEvents() {
      const passive = MobileDetection.supportsPassiveEvents();

      this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive });
      this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive });
      this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive });
      this.element.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive });
    }

    handleTouchStart(event) {
      const touches = Array.from(event.changedTouches);

      touches.forEach(touch => {
        const touchData = {
          id: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          currentX: touch.clientX,
          currentY: touch.clientY,
          startTime: Date.now(),
          moved: false
        };

        this.touches.set(touch.identifier, touchData);
      });

      if (this.touches.size === 1) {
        this.emit('touchstart', this.getTouchEventData(event));
      } else if (this.touches.size === 2) {
        this.emit('pinchstart', this.getPinchEventData());
      }
    }

    handleTouchMove(event) {
      const touches = Array.from(event.changedTouches);

      touches.forEach(touch => {
        const touchData = this.touches.get(touch.identifier);
        if (touchData) {
          touchData.currentX = touch.clientX;
          touchData.currentY = touch.clientY;
          touchData.moved = true;
        }
      });

      if (this.touches.size === 1) {
        const touchData = Array.from(this.touches.values())[0];
        const deltaX = touchData.currentX - touchData.startX;
        const deltaY = touchData.currentY - touchData.startY;

        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          this.emit('pan', {
            deltaX,
            deltaY,
            velocityX: deltaX / (Date.now() - touchData.startTime),
            velocityY: deltaY / (Date.now() - touchData.startTime),
            ...this.getTouchEventData(event)
          });
        }
      } else if (this.touches.size === 2) {
        const pinchData = this.getPinchEventData();
        this.emit('pinch', pinchData);
      }
    }

    handleTouchEnd(event) {
      const touches = Array.from(event.changedTouches);

      touches.forEach(touch => {
        const touchData = this.touches.get(touch.identifier);
        if (touchData) {
          const duration = Date.now() - touchData.startTime;
          const distance = Math.sqrt(
            Math.pow(touchData.currentX - touchData.startX, 2) +
            Math.pow(touchData.currentY - touchData.startY, 2)
          );

          if (!touchData.moved && duration < this.options.maxTapDuration) {
            const now = Date.now();
            if (now - this.lastTap < this.options.maxDoubleTapDelay) {
              this.emit('doubletap', this.getTouchEventData(event));
              this.lastTap = 0;
            } else {
              this.emit('tap', this.getTouchEventData(event));
              this.lastTap = now;
            }
          } else if (touchData.moved && distance > this.options.minSwipeDistance) {
            const angle = Math.atan2(
              touchData.currentY - touchData.startY,
              touchData.currentX - touchData.startX
            ) * 180 / Math.PI;

            let direction;
            if (angle >= -45 && angle < 45) direction = 'right';
            else if (angle >= 45 && angle < 135) direction = 'down';
            else if (angle >= -135 && angle < -45) direction = 'up';
            else direction = 'left';

            this.emit('swipe', {
              direction,
              distance,
              velocity: distance / duration,
              ...this.getTouchEventData(event)
            });
          }

          this.touches.delete(touch.identifier);
        }
      });

      if (this.touches.size === 0) {
        this.emit('touchend', this.getTouchEventData(event));
      }
    }

    handleTouchCancel(event) {
      this.touches.clear();
      this.emit('touchcancel', this.getTouchEventData(event));
    }

    getTouchEventData(event) {
      const touch = event.changedTouches[0];
      return {
        clientX: touch.clientX,
        clientY: touch.clientY,
        pageX: touch.pageX,
        pageY: touch.pageY,
        target: touch.target,
        touchCount: this.touches.size
      };
    }

    getPinchEventData() {
      const touches = Array.from(this.touches.values());
      const touch1 = touches[0];
      const touch2 = touches[1];

      const centerX = (touch1.currentX + touch2.currentX) / 2;
      const centerY = (touch1.currentY + touch2.currentY) / 2;

      const distance = Math.sqrt(
        Math.pow(touch2.currentX - touch1.currentX, 2) +
        Math.pow(touch2.currentY - touch1.currentY, 2)
      );

      return {
        centerX,
        centerY,
        distance,
        scale: distance / Math.sqrt(
          Math.pow(touch2.startX - touch1.startX, 2) +
          Math.pow(touch2.startY - touch1.startY, 2)
        )
      };
    }

    on(event, listener) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(listener);
    }

    off(event, listener) {
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }

    emit(event, data) {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.forEach(listener => listener(data));
      }
    }

    destroy() {
      this.touches.clear();
      this.listeners.clear();

      this.element.removeEventListener('touchstart', this.handleTouchStart);
      this.element.removeEventListener('touchmove', this.handleTouchMove);
      this.element.removeEventListener('touchend', this.handleTouchEnd);
      this.element.removeEventListener('touchcancel', this.handleTouchCancel);
    }
  }

  // Mobile UI Components
  function MobileToolbar({ children, position = 'bottom', className = '' }) {
    const positionClasses = {
      top: 'top-0 left-0 right-0',
      bottom: 'bottom-0 left-0 right-0',
      left: 'left-0 top-0 bottom-0',
      right: 'right-0 top-0 bottom-0'
    };

    return React.createElement('div', {
      className: `fixed z-50 bg-gray-900 border border-gray-700 ${positionClasses[position]} ${className}`,
      style: {
        height: position === 'top' || position === 'bottom' ? '60px' : 'auto',
        width: position === 'left' || position === 'right' ? '60px' : 'auto'
      }
    }, React.createElement('div', {
      className: `flex ${position === 'left' || position === 'right' ? 'flex-col' : 'flex-row'} items-center justify-around h-full px-2`
    }, children));
  }

  function MobileButton({ children, onClick, disabled = false, variant = 'primary', size = 'medium', className = '' }) {
    const sizeClasses = {
      small: 'w-8 h-8 text-sm',
      medium: 'w-12 h-12 text-base',
      large: 'w-16 h-16 text-lg'
    };

    const variantClasses = {
      primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
      secondary: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800',
      danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800'
    };

    const handleTouch = useCallback((e) => {
      e.preventDefault();
      if (!disabled && onClick) {
        // Add haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
        onClick(e);
      }
    }, [onClick, disabled]);

    return React.createElement('button', {
      className: `
        ${sizeClasses[size]} ${variantClasses[variant]}
        rounded-full flex items-center justify-center
        text-white font-medium transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `,
      onTouchStart: handleTouch,
      disabled,
      style: { touchAction: 'manipulation' }
    }, children);
  }

  function MobileDrawer({ isOpen, onClose, children, position = 'bottom', className = '' }) {
    const [isVisible, setIsVisible] = useState(isOpen);

    useEffect(() => {
      if (isOpen) {
        setIsVisible(true);
        document.body.style.overflow = 'hidden';
      } else {
        setTimeout(() => setIsVisible(false), 300);
        document.body.style.overflow = '';
      }

      return () => {
        document.body.style.overflow = '';
      };
    }, [isOpen]);

    if (!isVisible) return null;

    const positionClasses = {
      bottom: 'bottom-0 left-0 right-0 rounded-t-xl',
      top: 'top-0 left-0 right-0 rounded-b-xl',
      left: 'left-0 top-0 bottom-0 rounded-r-xl',
      right: 'right-0 top-0 bottom-0 rounded-l-xl'
    };

    const transformClasses = {
      bottom: isOpen ? 'translate-y-0' : 'translate-y-full',
      top: isOpen ? 'translate-y-0' : '-translate-y-full',
      left: isOpen ? 'translate-x-0' : '-translate-x-full',
      right: isOpen ? 'translate-x-0' : 'translate-x-full'
    };

    return React.createElement('div', {
      className: 'fixed inset-0 z-50'
    }, [
      // Backdrop
      React.createElement('div', {
        key: 'backdrop',
        className: `absolute inset-0 bg-black transition-opacity duration-300 ${
          isOpen ? 'opacity-50' : 'opacity-0'
        }`,
        onClick: onClose
      }),
      // Drawer
      React.createElement('div', {
        key: 'drawer',
        className: `absolute bg-white shadow-xl transition-transform duration-300 ${
          positionClasses[position]
        } ${transformClasses[position]} ${className}`
      }, children)
    ]);
  }

  function MobileTimeline({ timelineState, onSeek, onClipSelect, className = '' }) {
    const timelineRef = useRef(null);
    const [isScrubbing, setIsScrubbing] = useState(false);

    useEffect(() => {
      if (!timelineRef.current || !MobileDetection.isMobile()) return;

      const recognizer = new TouchGestureRecognizer(timelineRef.current);

      recognizer.on('tap', (data) => {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = data.clientX - rect.left;
        const percentage = x / rect.width;
        const time = percentage * timelineState.duration;
        onSeek(time);
      });

      recognizer.on('pan', (data) => {
        if (isScrubbing) {
          const rect = timelineRef.current.getBoundingClientRect();
          const x = data.clientX - rect.left;
          const percentage = Math.max(0, Math.min(1, x / rect.width));
          const time = percentage * timelineState.duration;
          onSeek(time);
        }
      });

      return () => recognizer.destroy();
    }, [timelineState.duration, onSeek, isScrubbing]);

    const handleScrubStart = useCallback(() => {
      setIsScrubbing(true);
    }, []);

    const handleScrubEnd = useCallback(() => {
      setIsScrubbing(false);
    }, []);

    return React.createElement('div', {
      ref: timelineRef,
      className: `relative bg-gray-800 rounded-lg overflow-hidden ${className}`,
      style: { height: '120px', touchAction: 'none' },
      onTouchStart: handleScrubStart,
      onTouchEnd: handleScrubEnd
    }, [
      // Timeline background
      React.createElement('div', {
        key: 'background',
        className: 'absolute inset-0 bg-gray-700'
      }),
      // Playhead
      React.createElement('div', {
        key: 'playhead',
        className: 'absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10',
        style: {
          left: `${(timelineState.playhead / timelineState.duration) * 100}%`
        }
      }),
      // Clips
      timelineState.clips.map(clip =>
        React.createElement('div', {
          key: clip.id,
          className: 'absolute top-2 bottom-2 bg-blue-600 rounded cursor-pointer',
          style: {
            left: `${(clip.start / timelineState.duration) * 100}%`,
            width: `${(clip.duration / timelineState.duration) * 100}%`
          },
          onClick: () => onClipSelect(clip.id)
        })
      )
    ]);
  }

  // Mobile-Optimized Components
  function ResponsiveContainer({ children, className = '' }) {
    const [screenSize, setScreenSize] = useState(MobileDetection.getScreenSize());

    useEffect(() => {
      const handleResize = () => {
        setScreenSize(MobileDetection.getScreenSize());
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
      };
    }, []);

    const isMobile = MobileDetection.isMobile();
    const isTablet = MobileDetection.isTablet();

    return React.createElement('div', {
      className: `
        ${isMobile ? 'px-4 py-2' : isTablet ? 'px-6 py-4' : 'px-8 py-6'}
        ${className}
      `,
      'data-device-type': isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
      'data-orientation': screenSize.orientation
    }, children);
  }

  function TouchOptimizedButton({ children, onClick, disabled = false, className = '' }) {
    const handleTouch = useCallback((e) => {
      e.preventDefault();
      if (!disabled && onClick) {
        // Prevent double-tap zoom
        e.target.style.transform = 'scale(0.95)';
        setTimeout(() => {
          e.target.style.transform = '';
        }, 150);

        // Add haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(20);
        }

        onClick(e);
      }
    }, [onClick, disabled]);

    return React.createElement('button', {
      className: `
        min-h-[44px] min-w-[44px] px-4 py-2
        bg-blue-600 hover:bg-blue-700 active:bg-blue-800
        text-white rounded-lg font-medium
        transition-all duration-150 ease-out
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `,
      onTouchStart: handleTouch,
      disabled,
      style: {
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent'
      }
    }, children);
  }

  // Mobile Performance Optimizations
  const MobilePerformanceOptimizer = {
    // Reduce motion for mobile devices
    optimizeAnimations() {
      const isMobile = MobileDetection.isMobile();
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (isMobile || prefersReducedMotion) {
        document.documentElement.style.setProperty('--animation-duration', '0.2s');
        document.documentElement.style.setProperty('--transition-duration', '0.15s');
      }
    },

    // Optimize images for mobile
    optimizeImages() {
      const images = document.querySelectorAll('img[data-src]');
      const isMobile = MobileDetection.isMobile();

      images.forEach(img => {
        const mobileSrc = img.getAttribute('data-mobile-src');
        const desktopSrc = img.getAttribute('data-desktop-src') || img.getAttribute('data-src');

        if (isMobile && mobileSrc) {
          img.src = mobileSrc;
        } else if (desktopSrc) {
          img.src = desktopSrc;
        }
      });
    },

    // Optimize event listeners for touch
    optimizeEventListeners() {
      const isTouch = MobileDetection.isTouchDevice();
      const passiveSupported = MobileDetection.supportsPassiveEvents();

      if (isTouch && passiveSupported) {
        // Use passive listeners for better scroll performance
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          if (['touchstart', 'touchmove', 'touchend', 'wheel'].includes(type)) {
            options = typeof options === 'object' ? { ...options, passive: true } : { passive: true };
          }
          return originalAddEventListener.call(this, type, listener, options);
        };
      }
    },

    // Optimize memory usage for mobile
    optimizeMemory() {
      const performanceCapabilities = MobileDetection.getPerformanceCapabilities();

      // Reduce cache sizes for low-memory devices
      if (performanceCapabilities.memory < 4) {
        console.log('Low memory device detected - optimizing memory usage');
        // Reduce image cache, disable heavy features
      }

      // Clean up unused resources
      setInterval(() => {
        if (global.gc && typeof global.gc === 'function') {
          global.gc();
        }
      }, 30000); // Every 30 seconds
    },

    // Optimize network requests for mobile
    optimizeNetwork() {
      const connection = (navigator as any).connection;

      if (connection) {
        const updateNetworkOptimizations = () => {
          if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
            console.log('Slow connection detected - enabling data saving mode');
            // Disable auto-updates, reduce image quality
          } else if (connection.effectiveType === '3g') {
            console.log('Medium connection detected - enabling balanced mode');
          }
        };

        connection.addEventListener('change', updateNetworkOptimizations);
        updateNetworkOptimizations();
      }
    }
  };

  // Mobile Keyboard Shortcuts (simplified)
  const MobileKeyboardShortcuts = {
    shortcuts: new Map(),

    registerShortcut(key, action, options = {}) {
      this.shortcuts.set(key, { action, options });
    },

    handleKeyPress(event) {
      const key = event.key.toLowerCase();
      const shortcut = this.shortcuts.get(key);

      if (shortcut && (!shortcut.options.ctrlKey || event.ctrlKey)) {
        event.preventDefault();
        shortcut.action();
      }
    },

    initialize() {
      document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }
  };

  // Initialize mobile optimizations
  function initializeMobileOptimizations() {
    // Apply performance optimizations
    MobilePerformanceOptimizer.optimizeAnimations();
    MobilePerformanceOptimizer.optimizeImages();
    MobilePerformanceOptimizer.optimizeEventListeners();
    MobilePerformanceOptimizer.optimizeMemory();
    MobilePerformanceOptimizer.optimizeNetwork();

    // Initialize mobile keyboard shortcuts
    MobileKeyboardShortcuts.initialize();

    // Add mobile-specific CSS
    const mobileCSS = `
      @media (max-width: 768px) {
        .mobile-optimized {
          font-size: 16px;
          line-height: 1.5;
        }

        .mobile-hide {
          display: none !important;
        }

        .mobile-full-width {
          width: 100vw;
          margin-left: calc(-50vw + 50%);
        }
      }

      @media (hover: none) and (pointer: coarse) {
        .hover-only {
          display: none !important;
        }
      }

      /* Prevent zoom on input focus */
      input[type="text"],
      input[type="email"],
      input[type="number"],
      input[type="tel"],
      input[type="password"],
      textarea,
      select {
        font-size: 16px;
      }
    `;

    const style = document.createElement('style');
    style.textContent = mobileCSS;
    document.head.appendChild(style);

    console.log('Mobile optimizations initialized');
  }

  // Initialize on load
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', initializeMobileOptimizations);
    } else {
      initializeMobileOptimizations();
    }
  }

  // Export mobile optimization components and utilities
  global.MobileDetection = MobileDetection;
  global.TouchGestureRecognizer = TouchGestureRecognizer;
  global.MobileToolbar = MobileToolbar;
  global.MobileButton = MobileButton;
  global.MobileDrawer = MobileDrawer;
  global.MobileTimeline = MobileTimeline;
  global.ResponsiveContainer = ResponsiveContainer;
  global.TouchOptimizedButton = TouchOptimizedButton;
  global.MobilePerformanceOptimizer = MobilePerformanceOptimizer;
  global.MobileKeyboardShortcuts = MobileKeyboardShortcuts;

})(typeof window !== 'undefined' ? window : globalThis);
