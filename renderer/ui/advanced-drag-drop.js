/**
 * Advanced Drag and Drop System
 * Sophisticated drag and drop functionality for Artone Video Editor
 */

(function initializeDragDropSystem(global) {
  'use strict';

  // Drag and Drop Event Types
  const DragDropEventType = {
    DRAG_START: 'drag-start',
    DRAG_MOVE: 'drag-move',
    DRAG_OVER: 'drag-over',
    DRAG_ENTER: 'drag-enter',
    DRAG_LEAVE: 'drag-leave',
    DROP: 'drop',
    DRAG_END: 'drag-end'
  };

  // Drop Zone Types
  const DropZoneType = {
    TIMELINE: 'timeline',
    MEDIA_LIBRARY: 'media-library',
    TOOLBAR: 'toolbar',
    CANVAS: 'canvas',
    SIDEBAR: 'sidebar'
  };

  // Drag Item Types
  const DragItemType = {
    CLIP: 'clip',
    MEDIA_FILE: 'media-file',
    EFFECT: 'effect',
    TOOL: 'tool',
    ASSET: 'asset'
  };

  // Drag Context
  class DragContext {
    constructor() {
      this.isDragging = false;
      this.dragItem = null;
      this.dragSource = null;
      this.dropTarget = null;
      this.dragOffset = { x: 0, y: 0 };
      this.dropZones = new Map();
      this.listeners = new Set();
      this.ghostElement = null;
      this.feedbackElement = null;
    }

    startDrag(item, sourceElement, offset = { x: 0, y: 0 }) {
      if (this.isDragging) return;

      this.isDragging = true;
      this.dragItem = item;
      this.dragSource = sourceElement;
      this.dragOffset = offset;

      this.emit(DragDropEventType.DRAG_START, {
        item,
        source: sourceElement,
        offset
      });

      this.createGhostElement();
      this.attachGlobalListeners();
    }

    updateDragPosition(clientX, clientY) {
      if (!this.isDragging) return;

      const rect = this.ghostElement.getBoundingClientRect();
      const newLeft = clientX - this.dragOffset.x;
      const newTop = clientY - this.dragOffset.y;

      this.ghostElement.style.left = `${newLeft}px`;
      this.ghostElement.style.top = `${newTop}px`;

      this.checkDropZones(clientX, clientY);

      this.emit(DragDropEventType.DRAG_MOVE, {
        item: this.dragItem,
        position: { x: clientX, y: clientY },
        offset: this.dragOffset
      });
    }

    checkDropZones(clientX, clientY) {
      let newDropTarget = null;

      for (const [zoneId, zone] of this.dropZones) {
        if (this.isPointInZone(clientX, clientY, zone.element)) {
          newDropTarget = zone;
          break;
        }
      }

      if (newDropTarget !== this.dropTarget) {
        if (this.dropTarget) {
          this.emit(DragDropEventType.DRAG_LEAVE, {
            item: this.dragItem,
            zone: this.dropTarget
          });
        }

        this.dropTarget = newDropTarget;

        if (newDropTarget) {
          this.emit(DragDropEventType.DRAG_ENTER, {
            item: this.dragItem,
            zone: newDropTarget
          });
        }
      }

      if (this.dropTarget) {
        this.emit(DragDropEventType.DRAG_OVER, {
          item: this.dragItem,
          zone: this.dropTarget,
          position: { x: clientX, y: clientY }
        });
      }
    }

    endDrag(clientX, clientY) {
      if (!this.isDragging) return;

      const wasDropped = this.handleDrop(clientX, clientY);

      this.emit(DragDropEventType.DRAG_END, {
        item: this.dragItem,
        wasDropped,
        position: { x: clientX, y: clientY }
      });

      this.cleanup();
    }

    handleDrop(clientX, clientY) {
      if (!this.dropTarget) return false;

      this.emit(DragDropEventType.DROP, {
        item: this.dragItem,
        zone: this.dropTarget,
        position: { x: clientX, y: clientY }
      });

      return true;
    }

    registerDropZone(id, element, options = {}) {
      const zone = {
        id,
        element,
        type: options.type || DropZoneType.TIMELINE,
        accepts: options.accepts || [DragItemType.CLIP],
        onDrop: options.onDrop,
        onDragOver: options.onDragOver,
        onDragEnter: options.onDragEnter,
        onDragLeave: options.onDragLeave
      };

      this.dropZones.set(id, zone);
      return () => this.dropZones.delete(id);
    }

    isPointInZone(x, y, element) {
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    createGhostElement() {
      if (!this.dragSource) return;

      const rect = this.dragSource.getBoundingClientRect();
      this.ghostElement = this.dragSource.cloneNode(true);

      Object.assign(this.ghostElement.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '9999',
        pointerEvents: 'none',
        opacity: '0.8',
        transform: 'rotate(5deg)',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)'
      });

      document.body.appendChild(this.ghostElement);
    }

    attachGlobalListeners() {
      const handleMouseMove = (e) => this.updateDragPosition(e.clientX, e.clientY);
      const handleMouseUp = (e) => {
        this.endDrag(e.clientX, e.clientY);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    emit(eventType, data) {
      this.listeners.forEach(listener => {
        try {
          listener(eventType, data);
        } catch (error) {
          console.error('Drag drop listener error:', error);
        }
      });
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    cleanup() {
      this.isDragging = false;
      this.dragItem = null;
      this.dragSource = null;
      this.dropTarget = null;

      if (this.ghostElement && this.ghostElement.parentNode) {
        this.ghostElement.parentNode.removeChild(this.ghostElement);
      }
      this.ghostElement = null;
      this.feedbackElement = null;
    }
  }

  // Global drag context
  const dragContext = new DragContext();

  // Drag Handle Component (React)
  function DragHandle({ children, onDragStart, dragData, className = '' }) {
    const React = global.React;
    const { useRef, useCallback } = React;

    const handleRef = useRef(null);

    const handleMouseDown = useCallback((e) => {
      if (!handleRef.current) return;

      const rect = handleRef.current.getBoundingClientRect();
      const offset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };

      dragContext.startDrag(dragData, handleRef.current, offset);

      if (onDragStart) {
        onDragStart(dragData, offset);
      }

      e.preventDefault();
    }, [dragData, onDragStart]);

    return React.createElement('div', {
      ref: handleRef,
      className: `cursor-grab active:cursor-grabbing ${className}`,
      onMouseDown: handleMouseDown,
      role: 'button',
      tabIndex: 0,
      'aria-label': 'Drag handle'
    }, children);
  }

  // Drop Zone Component (React)
  function DropZone({ children, id, accepts, onDrop, onDragOver, onDragEnter, onDragLeave, className = '' }) {
    const React = global.React;
    const { useEffect, useRef } = React;

    const zoneRef = useRef(null);

    useEffect(() => {
      if (!zoneRef.current) return;

      const unsubscribe = dragContext.registerDropZone(id, zoneRef.current, {
        accepts,
        onDrop,
        onDragOver,
        onDragEnter,
        onDragLeave
      });

      return unsubscribe;
    }, [id, accepts, onDrop, onDragOver, onDragEnter, onDragLeave]);

    return React.createElement('div', {
      ref: zoneRef,
      className,
      role: 'region',
      'aria-label': `Drop zone for ${accepts.join(', ')}`
    }, children);
  }

  // Advanced Drag Manager
  class AdvancedDragManager {
    constructor() {
      this.dragOperations = new Map();
      this.snapThreshold = 10;
      this.snapTargets = new Set();
      this.collisionDetection = true;
      this.magneticSnapping = true;
    }

    // Register snap targets
    registerSnapTarget(target) {
      this.snapTargets.add(target);
      return () => this.snapTargets.delete(target);
    }

    // Calculate snap position
    calculateSnapPosition(dragPosition, excludeTargets = new Set()) {
      if (!this.magneticSnapping) return dragPosition;

      let closestSnap = null;
      let minDistance = this.snapThreshold;

      for (const target of this.snapTargets) {
        if (excludeTargets.has(target)) continue;

        const distance = this.getDistance(dragPosition, target.position);
        if (distance < minDistance) {
          minDistance = distance;
          closestSnap = target;
        }
      }

      return closestSnap ? closestSnap.position : dragPosition;
    }

    getDistance(pos1, pos2) {
      const dx = pos1.x - pos2.x;
      const dy = pos1.y - pos2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Collision detection
    detectCollisions(dragItem, position) {
      if (!this.collisionDetection) return [];

      const collisions = [];
      const dragRect = {
        left: position.x,
        top: position.y,
        right: position.x + (dragItem.width || 100),
        bottom: position.y + (dragItem.height || 50)
      };

      for (const target of this.snapTargets) {
        if (this.rectanglesOverlap(dragRect, target.bounds)) {
          collisions.push(target);
        }
      }

      return collisions;
    }

    rectanglesOverlap(rect1, rect2) {
      return !(rect1.right < rect2.left ||
               rect1.left > rect2.right ||
               rect1.bottom < rect2.top ||
               rect1.top > rect2.bottom);
    }

    // Advanced drag operations
    startAdvancedDrag(item, options = {}) {
      const operation = {
        id: `drag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        item,
        startTime: Date.now(),
        options: {
          enableSnapping: true,
          enableCollision: true,
          constrainToContainer: false,
          ...options
        },
        history: []
      };

      this.dragOperations.set(operation.id, operation);
      return operation.id;
    }

    updateAdvancedDrag(operationId, position, velocity = { x: 0, y: 0 }) {
      const operation = this.dragOperations.get(operationId);
      if (!operation) return position;

      let newPosition = { ...position };

      // Apply constraints
      if (operation.options.constrainToContainer) {
        newPosition = this.constrainToContainer(newPosition, operation.options.container);
      }

      // Apply magnetic snapping
      if (operation.options.enableSnapping) {
        newPosition = this.calculateSnapPosition(newPosition, operation.options.excludeSnapTargets);
      }

      // Apply collision avoidance
      if (operation.options.enableCollision) {
        const collisions = this.detectCollisions(operation.item, newPosition);
        if (collisions.length > 0) {
          newPosition = this.resolveCollisions(newPosition, collisions, velocity);
        }
      }

      // Record history for undo/redo
      operation.history.push({
        timestamp: Date.now(),
        position: newPosition,
        velocity
      });

      return newPosition;
    }

    constrainToContainer(position, container) {
      if (!container) return position;

      return {
        x: Math.max(container.left, Math.min(container.right - 100, position.x)),
        y: Math.max(container.top, Math.min(container.bottom - 50, position.y))
      };
    }

    resolveCollisions(position, collisions, velocity) {
      // Simple collision resolution - move away from collided objects
      let resolvedPosition = { ...position };

      for (const collision of collisions) {
        const dx = resolvedPosition.x - collision.bounds.left;
        const dy = resolvedPosition.y - collision.bounds.top;

        // Move in the direction of velocity or away from center
        const moveX = velocity.x !== 0 ? velocity.x : (dx > 0 ? 1 : -1);
        const moveY = velocity.y !== 0 ? velocity.y : (dy > 0 ? 1 : -1);

        resolvedPosition.x += moveX * 20; // Push 20px away
        resolvedPosition.y += moveY * 20;
      }

      return resolvedPosition;
    }

    endAdvancedDrag(operationId) {
      const operation = this.dragOperations.get(operationId);
      if (!operation) return null;

      const duration = Date.now() - operation.startTime;
      const result = {
        operationId,
        duration,
        historyLength: operation.history.length,
        finalPosition: operation.history[operation.history.length - 1]?.position
      };

      this.dragOperations.delete(operationId);
      return result;
    }

    // Multi-touch drag support
    startMultiTouchDrag(items, initialTouches) {
      // Handle multiple items being dragged simultaneously
      const operations = items.map((item, index) => ({
        item,
        touch: initialTouches[index],
        operationId: this.startAdvancedDrag(item)
      }));

      return {
        operations,
        update: (touches) => {
          return operations.map((op, index) => {
            const touch = touches[index];
            if (!touch) return op.item;

            const position = { x: touch.clientX, y: touch.clientY };
            return this.updateAdvancedDrag(op.operationId, position);
          });
        },
        end: () => {
          operations.forEach(op => this.endAdvancedDrag(op.operationId));
        }
      };
    }
  }

  // Global advanced drag manager
  const advancedDragManager = new AdvancedDragManager();

  // File Drop Handler for media files
  class FileDropHandler {
    constructor(options = {}) {
      this.acceptedTypes = options.acceptedTypes || ['video/*', 'audio/*', 'image/*'];
      this.maxFileSize = options.maxFileSize || 500 * 1024 * 1024; // 500MB
      this.multiple = options.multiple !== false;
      this.onFilesDropped = options.onFilesDropped;
      this.dropZone = null;
    }

    attachToElement(element) {
      this.dropZone = element;

      const preventDefault = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };

      const handleDragOver = (e) => {
        preventDefault(e);
        element.classList.add('drag-over');
      };

      const handleDragLeave = (e) => {
        preventDefault(e);
        if (!element.contains(e.relatedTarget)) {
          element.classList.remove('drag-over');
        }
      };

      const handleDrop = (e) => {
        preventDefault(e);
        element.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        const validFiles = this.validateFiles(files);

        if (validFiles.length > 0 && this.onFilesDropped) {
          this.onFilesDropped(validFiles, e);
        }
      };

      element.addEventListener('dragover', handleDragOver);
      element.addEventListener('dragleave', handleDragLeave);
      element.addEventListener('drop', handleDrop);

      // Cleanup function
      return () => {
        element.removeEventListener('dragover', handleDragOver);
        element.removeEventListener('dragleave', handleDragLeave);
        element.removeEventListener('drop', handleDrop);
      };
    }

    validateFiles(files) {
      return files.filter(file => {
        // Check file type
        const isAcceptedType = this.acceptedTypes.some(type => {
          if (type.endsWith('/*')) {
            const baseType = type.slice(0, -2);
            return file.type.startsWith(baseType);
          }
          return file.type === type;
        });

        // Check file size
        const isValidSize = file.size <= this.maxFileSize;

        return isAcceptedType && isValidSize;
      });
    }

    createFilePreview(file) {
      return new Promise((resolve) => {
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onload = () => resolve({ type: 'image', element: img, file });
          img.src = URL.createObjectURL(file);
        } else if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.onloadedmetadata = () => resolve({ type: 'video', element: video, file });
          video.src = URL.createObjectURL(file);
          video.preload = 'metadata';
        } else {
          resolve({ type: 'file', element: null, file });
        }
      });
    }
  }

  // Export all drag and drop functionality
  global.DragContext = dragContext;
  global.DragHandle = DragHandle;
  global.DropZone = DropZone;
  global.AdvancedDragManager = advancedDragManager;
  global.FileDropHandler = FileDropHandler;

  // Constants
  global.DragDropEventType = DragDropEventType;
  global.DropZoneType = DropZoneType;
  global.DragItemType = DragItemType;

})(typeof window !== 'undefined' ? window : globalThis);
