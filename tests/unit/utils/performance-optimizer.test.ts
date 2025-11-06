import {
  MemoryManager,
  WorkerPool,
  VirtualScroller,
  optimizedHandlers,
  lazyLoad
} from '../../utils/performance-optimizer';

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    getEntries: jest.fn(() => []),
    getEntriesByType: jest.fn(() => [])
  },
  writable: true
});

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor(scriptURL: string) {}

  postMessage(data: any) {
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data: 'result' }));
      }
    }, 10);
  }

  addEventListener(type: string, listener: (e: any) => void) {
    if (type === 'message') {
      this.onmessage = listener;
    } else if (type === 'error') {
      this.onerror = listener;
    }
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    if (type === 'message') {
      this.onmessage = null;
    } else if (type === 'error') {
      this.onerror = null;
    }
  }

  terminate() {}
}

(global as any).Worker = MockWorker;

describe('Performance Optimizer', () => {
  describe('MemoryManager', () => {
    let memoryManager: MemoryManager;

    beforeEach(() => {
      memoryManager = new MemoryManager();
    });

    it('should store and retrieve values', () => {
      const testData = { test: 'data' };
      memoryManager.set('key1', testData, 100);

      expect(memoryManager.get('key1')).toEqual(testData);
    });

    it('should remove old items when cache is full', () => {
      // Fill cache
      for (let i = 0; i < 1000; i++) {
        memoryManager.set(`key${i}`, { data: 'x'.repeat(1000) }, 2000);
      }

      // Add one more item
      memoryManager.set('newKey', { data: 'new' }, 2000);

      // First key should be removed
      expect(memoryManager.get('key0')).toBeUndefined();
      expect(memoryManager.get('newKey')).toBeDefined();
    });

    it('should track memory usage', () => {
      memoryManager.set('key1', { data: 'test' }, 100);

      const usage = memoryManager.getMemoryUsage();
      expect(usage.used).toBeGreaterThan(0);
      expect(usage.percentage).toBeGreaterThan(0);
    });

    it('should clear all cache', () => {
      memoryManager.set('key1', 'data', 100);
      memoryManager.clear();

      expect(memoryManager.get('key1')).toBeUndefined();
      expect(memoryManager.getMemoryUsage().used).toBe(0);
    });
  });

  describe('WorkerPool', () => {
    let workerPool: WorkerPool;

    beforeEach(() => {
      workerPool = new WorkerPool('/test-worker.js', 2);
    });

    afterEach(() => {
      workerPool.terminate();
    });

    it('should execute tasks', async () => {
      const result = await workerPool.execute({ type: 'test', data: 'input' });
      expect(result).toBe('result');
    });

    it('should queue tasks when all workers are busy', async () => {
      const tasks = [
        workerPool.execute({ type: 'test1' }),
        workerPool.execute({ type: 'test2' }),
        workerPool.execute({ type: 'test3' }) // This should be queued
      ];

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(3);
      expect(results.every(r => r === 'result')).toBe(true);
    });

    it('should handle worker errors', async () => {
      // Mock worker to throw error
      const originalWorker = (global as any).Worker;
      (global as any).Worker = class extends MockWorker {
        postMessage(data: any) {
          setTimeout(() => {
            if (this.onerror) {
              this.onerror(new ErrorEvent('error', { message: 'Worker error' }));
            }
          }, 10);
        }
      };

      const newPool = new WorkerPool('/test-worker.js', 1);

      await expect(newPool.execute({ type: 'test' })).rejects.toThrow();

      newPool.terminate();
      (global as any).Worker = originalWorker;
    });
  });

  describe('VirtualScroller', () => {
    let scroller: VirtualScroller;

    beforeEach(() => {
      scroller = new VirtualScroller(50, 500, 1000);
    });

    it('should calculate visible range correctly', () => {
      const range = scroller.calculateVisibleRange(250);
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(1000);
      expect(range.end).toBeGreaterThan(range.start);
    });

    it('should return visible items', () => {
      const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
      scroller.calculateVisibleRange(0);
      const visibleItems = scroller.getVisibleItems(items);

      expect(visibleItems.length).toBeLessThan(items.length);
      expect(visibleItems[0]).toBe('item-0');
    });

    it('should generate correct container style', () => {
      const style = scroller.getContainerStyle();
      expect(style.height).toBe('50000px'); // 1000 * 50
      expect(style.position).toBe('relative');
    });

    it('should generate correct item style', () => {
      const style = scroller.getItemStyle(10);
      expect(style.position).toBe('absolute');
      expect(style.top).toBe('500px'); // 10 * 50
      expect(style.height).toBe('50px');
    });
  });

  describe('optimizedHandlers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce input handler', () => {
      const callback = jest.fn();

      optimizedHandlers.debounceInput(callback, 'arg1');
      optimizedHandlers.debounceInput(callback, 'arg2');
      optimizedHandlers.debounceInput(callback, 'arg3');

      expect(callback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('arg3');
    });

    it('should throttle scroll handler', () => {
      const callback = jest.fn();

      optimizedHandlers.throttleScroll(callback, 'arg1');
      optimizedHandlers.throttleScroll(callback, 'arg2');
      optimizedHandlers.throttleScroll(callback, 'arg3');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('arg1');

      jest.advanceTimersByTime(16);
      optimizedHandlers.throttleScroll(callback, 'arg4');
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should use requestAnimationFrame for updates', () => {
      const callback = jest.fn();
      const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        setTimeout(cb, 16);
        return 1;
      });

      const handler = optimizedHandlers.rafUpdate(callback);
      handler('arg1');
      handler('arg2'); // Should cancel previous

      jest.advanceTimersByTime(16);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('arg2');

      rafSpy.mockRestore();
    });
  });

  describe('lazyLoad', () => {
    it('should load images lazily', async () => {
      const mockImage = {
        onload: null as any,
        onerror: null as any,
        src: ''
      };

      const originalImage = global.Image;
      (global as any).Image = jest.fn(() => mockImage);

      const promise = lazyLoad.image('/test-image.jpg');

      // Simulate successful load
      setTimeout(() => {
        mockImage.onload();
      }, 10);

      const result = await promise;
      expect(result).toBe(mockImage);
      expect(mockImage.src).toBe('/test-image.jpg');

      (global as any).Image = originalImage;
    });

    it('should handle image load errors', async () => {
      const mockImage = {
        onload: null as any,
        onerror: null as any,
        src: ''
      };

      const originalImage = global.Image;
      (global as any).Image = jest.fn(() => mockImage);

      const promise = lazyLoad.image('/invalid-image.jpg');

      // Simulate error
      setTimeout(() => {
        mockImage.onerror(new Error('Load failed'));
      }, 10);

      await expect(promise).rejects.toThrow();

      (global as any).Image = originalImage;
    });

    it('should load scripts lazily', async () => {
      const mockScript = {
        onload: null as any,
        onerror: null as any,
        src: '',
        async: false
      };

      const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValue(mockScript as any);
      const appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation();

      const promise = lazyLoad.script('/test-script.js');

      // Simulate successful load
      setTimeout(() => {
        mockScript.onload();
      }, 10);

      await promise;

      expect(createElementSpy).toHaveBeenCalledWith('script');
      expect(mockScript.src).toBe('/test-script.js');
      expect(mockScript.async).toBe(true);
      expect(appendChildSpy).toHaveBeenCalledWith(mockScript);

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    });
  });
});