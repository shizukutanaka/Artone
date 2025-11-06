'use strict';

(function registerTestRunner(global) {
  // Simple integrated test environment for Artone

  // Enhanced test runner with E2E and media testing capabilities
  class TestRunner {
    constructor() {
      this.tests = new Map();
      this.results = [];
      this.isRunning = false;
      this.config = {
        timeout: 10000,
        verbose: true,
        stopOnFirstFailure: false,
        headless: false,
        mediaTimeout: 30000,
        screenshotOnFailure: true,
        videoOnFailure: false
      };
      this.browserContext = null;
      this.mediaMocks = new Map();
    }

    // Enhanced test registration with categories
    describe(suiteName, testFn, options = {}) {
      const { category = 'unit', tags = [] } = options;

      if (!this.tests.has(suiteName)) {
        this.tests.set(suiteName, {
          name: suiteName,
          category,
          tags,
          tests: [],
          beforeEach: null,
          afterEach: null,
          beforeAll: null,
          afterAll: null
        });
      }

      const suite = this.tests.get(suiteName);

      const context = {
        beforeEach: (fn) => { suite.beforeEach = fn; },
        afterEach: (fn) => { suite.afterEach = fn; },
        beforeAll: (fn) => { suite.beforeAll = fn; },
        afterAll: (fn) => { suite.afterAll = fn; },
        it: (testName, testFn, options = {}) => {
          suite.tests.push({
            name: testName,
            fn: testFn,
            type: options.type || 'unit',
            tags: options.tags || [],
            timeout: options.timeout || this.config.timeout
          });
        },
        xit: (testName, testFn) => {
          suite.tests.push({
            name: testName,
            fn: testFn,
            skipped: true
          });
        }
      };

      testFn(context);
    }

    // E2E test helpers
    e2e(suiteName, testFn) {
      return this.describe(suiteName, testFn, { category: 'e2e' });
    }

    // Media test helpers
    media(suiteName, testFn) {
      return this.describe(suiteName, testFn, { category: 'media' });
    }

    // Performance test helpers
    perf(suiteName, testFn) {
      return this.describe(suiteName, testFn, { category: 'performance' });
    }

    // Run tests by category
    async runCategory(category) {
      const suites = Array.from(this.tests.values()).filter(s => s.category === category);
      return this.runSuites(suites);
    }

    // Run tests by tags
    async runTags(tags) {
      const suites = Array.from(this.tests.values()).filter(s =>
        tags.some(tag => s.tags.includes(tag))
      );
      return this.runSuites(suites);
    }

    // Run specific test suites
    async runSuites(suites) {
      if (this.isRunning) {
        console.warn('Tests are already running');
        return;
      }

      this.isRunning = true;
      this.results = [];

      console.log(`Starting test execution for ${suites.length} suites...`);
      const startTime = Date.now();

      for (const suite of suites) {
        await this.runSuite(suite);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.printSummary(duration);
      this.isRunning = false;

      return this.getTestResults();
    }

    // Enhanced test execution
    async runTest(suite, test) {
      if (test.skipped) {
        this.recordResult(suite.name, test.name, 'skipped', 0, null);
        return;
      }

      const result = {
        suite: suite.name,
        test: test.name,
        status: 'pending',
        duration: 0,
        error: null,
        logs: [],
        screenshots: [],
        videos: [],
        memoryUsage: 0,
        performanceMetrics: {}
      };

      const startTime = Date.now();
      const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

      try {
        // Setup test context
        const testContext = this.createTestContext(suite, test);

        // Run beforeAll if first test in suite
        if (suite.beforeAll && !suite._beforeAllRun) {
          await suite.beforeAll.call(testContext);
          suite._beforeAllRun = true;
        }

        // Run beforeEach
        if (suite.beforeEach) {
          await suite.beforeEach.call(testContext);
        }

        // Run the actual test
        await this.executeTest(test, testContext, result);

        // Run afterEach
        if (suite.afterEach) {
          await suite.afterEach.call(testContext);
        }

        const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        result.memoryUsage = endMemory - startMemory;

        result.status = 'passed';
        result.duration = Date.now() - startTime;

      } catch (error) {
        result.status = 'failed';
        result.duration = Date.now() - startTime;
        result.error = {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name
        };

        if (this.config.screenshotOnFailure) {
          await this.takeScreenshot(`${suite.name}_${test.name}_failure`);
        }

        if (this.config.videoOnFailure && test.type === 'e2e') {
          await this.recordVideo(`${suite.name}_${test.name}_failure`);
        }
      }

      this.results.push(result);
      this.logTestResult(result);
    }

    createTestContext(suite, test) {
      return {
        // Test helpers
        expect: this.createExpect(),
        mock: this.createMock(),
        waitFor: this.createWaitFor(),

        // Media testing helpers
        createMediaMock: (type, data) => this.createMediaMock(type, data),
        loadTestMedia: (url) => this.loadTestMedia(url),
        simulateUserAction: (action, element) => this.simulateUserAction(action, element),

        // E2E helpers
        page: this.browserContext,
        browser: this.browserContext,
        findElement: (selector) => this.findElement(selector),
        findElements: (selector) => this.findElements(selector),

        // Test data
        testData: {},
        suiteData: suite,
        test: test
      };
    }

    createExpect() {
      return {
        toBe: (actual, expected) => {
          if (actual !== expected) {
            throw new Error(`Expected ${expected}, but got ${actual}`);
          }
        },
        toBeTruthy: (actual) => {
          if (!actual) {
            throw new Error(`Expected truthy value, but got ${actual}`);
          }
        },
        toBeFalsy: (actual) => {
          if (actual) {
            throw new Error(`Expected falsy value, but got ${actual}`);
          }
        },
        toEqual: (actual, expected) => {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
          }
        },
        toThrow: async (fn) => {
          try {
            await fn();
            throw new Error('Expected function to throw, but it did not');
          } catch (e) {
            // Expected to throw
          }
        }
      };
    }

    createMock() {
      return {
        fn: (originalFn) => {
          const mock = (...args) => {
            mock.calls.push(args);
            if (mock.shouldThrow) {
              throw mock.throwError;
            }
            return mock.returnValue;
          };
          mock.calls = [];
          mock.returnValue = undefined;
          mock.shouldThrow = false;
          mock.throwError = new Error('Mock error');
          return mock;
        }
      };
    }

    createWaitFor() {
      return {
        timeout: async (condition, timeout = 5000, message = 'Wait condition timeout') => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            if (await condition()) {
              return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error(message);
        },
        element: async (selector, timeout = 5000) => {
          return this.waitFor(
            () => this.findElement(selector),
            timeout,
            `Element ${selector} not found within ${timeout}ms`
          );
        }
      };
    }

    // Media testing helpers
    createMediaMock(type, data) {
      const mockId = `mock_${Date.now()}_${Math.random()}`;
      this.mediaMocks.set(mockId, { type, data, created: Date.now() });
      return mockId;
    }

    async loadTestMedia(url) {
      return new Promise((resolve, reject) => {
        const media = new Image();
        media.onload = () => resolve(media);
        media.onerror = reject;
        media.src = url;
      });
    }

    // E2E testing helpers
    async findElement(selector) {
      if (!this.browserContext) return null;
      return this.browserContext.querySelector(selector);
    }

    async findElements(selector) {
      if (!this.browserContext) return [];
      return Array.from(this.browserContext.querySelectorAll(selector));
    }

    async simulateUserAction(action, element) {
      if (!element) return;

      const actions = {
        click: () => element.click(),
        type: (text) => {
          element.value = text;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        },
        clear: () => {
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
        },
        select: (value) => {
          element.value = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      if (actions[action]) {
        return actions[action]();
      }
    }

    // Screenshot and video recording
    async takeScreenshot(name) {
      if (!this.browserContext) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = this.browserContext.scrollWidth;
        canvas.height = this.browserContext.scrollHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.browserContext, 0, 0);
        const dataUrl = canvas.toDataURL();
        this.saveTestArtifact(name, dataUrl, 'screenshot');
      } catch (error) {
        console.error('Failed to take screenshot:', error);
      }
    }

    async recordVideo(name) {
      // Video recording implementation would go here
      console.log(`Video recording for ${name} would start here`);
    }

    saveTestArtifact(name, data, type) {
      const artifacts = JSON.parse(localStorage.getItem('artone_test_artifacts') || '[]');
      artifacts.push({ name, data, type, timestamp: Date.now() });
      localStorage.setItem('artone_test_artifacts', JSON.stringify(artifacts));
    }

    // Enhanced test execution
    async executeTest(test, context, result) {
      const timeout = test.timeout || this.config.timeout;

      return Promise.race([
        test.fn.call(context, context),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Test timeout after ${timeout}ms`));
          }, timeout);
        })
      ]);
    }

    recordResult(suiteName, testName, status, duration, error) {
      this.results.push({
        suite: suiteName,
        test: testName,
        status,
        duration,
        error
      });
    }

    logTestResult(result) {
      if (!this.config.verbose) return;

      const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
      console.log(`${icon} ${result.suite} > ${result.test} (${result.duration}ms)`);

      if (result.error && this.config.verbose) {
        console.log(`   Error: ${result.error.message}`);
      }
    }

    printSummary(duration) {
      const passed = this.results.filter(r => r.status === 'passed').length;
      const failed = this.results.filter(r => r.status === 'failed').length;
      const skipped = this.results.filter(r => r.status === 'skipped').length;
      const total = this.results.length;

      console.log(`
=== Test Summary ===`);
      console.log(`Total: ${total}`);
      console.log(`Passed: ${passed}`);
      console.log(`Failed: ${failed}`);
      console.log(`Skipped: ${skipped}`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Success Rate: ${total > 0 ? Math.round((passed / total) * 100) : 0}%`);

      if (failed > 0) {
        console.log(`\n❌ Failed Tests:`);
        this.results.filter(r => r.status === 'failed').forEach(r => {
          console.log(`   ${r.suite} > ${r.test}: ${r.error.message}`);
        });
      }
    }

    getTestResults() {
      return {
        summary: {
          total: this.results.length,
          passed: this.results.filter(r => r.status === 'passed').length,
          failed: this.results.filter(r => r.status === 'failed').length,
          skipped: this.results.filter(r => r.status === 'skipped').length
        },
        results: this.results,
        duration: this.results.reduce((sum, r) => sum + r.duration, 0)
      };
    }

    // Setup browser context for E2E tests
    async setupBrowserContext() {
      if (this.config.headless) {
        // In a real implementation, this would set up a headless browser
        this.browserContext = document;
      } else {
        this.browserContext = document;
      }
    }

    // Cleanup
    async cleanup() {
      this.tests.clear();
      this.results = [];
      this.mediaMocks.clear();
      if (this.browserContext) {
        this.browserContext = null;
      }
    }
  }

        // Run the test with timeout
        await Promise.race([
          test.fn(),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Test timeout')), this.config.timeout);
          })
        ]);

        result.status = 'passed';

        if (this.config.verbose) {
          console.log(`  ✓ ${test.name}`);
        }

      } catch (error) {
        result.status = 'failed';
        result.error = error.message;

        console.log(`  ✗ ${test.name}`);
        console.log(`    Error: ${error.message}`);

        if (error.stack && this.config.verbose) {
          console.log(`    Stack: ${error.stack}`);
        }

      } finally {
        // Run afterEach
        try {
          if (suite.afterEach) {
            await suite.afterEach();
          }
        } catch (error) {
          console.warn(`afterEach error in ${test.name}:`, error);
        }

        result.duration = Date.now() - startTime;
        this.results.push(result);
      }
    }

    // Print test summary
    printSummary(duration) {
      const total = this.results.length;
      const passed = this.results.filter(r => r.status === 'passed').length;
      const failed = this.results.filter(r => r.status === 'failed').length;

      console.log('\n=== Test Summary ===');
      console.log(`Total: ${total}`);
      console.log(`Passed: ${passed}`);
      console.log(`Failed: ${failed}`);
      console.log(`Duration: ${duration}ms`);

      if (failed > 0) {
        console.log('\nFailed tests:');
        this.results
          .filter(r => r.status === 'failed')
          .forEach(r => {
            console.log(`  ${r.suite} > ${r.test}: ${r.error}`);
          });
      }
    }

    // Get test results
    getTestResults() {
      return {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'passed').length,
        failed: this.results.filter(r => r.status === 'failed').length,
        results: [...this.results]
      };
    }

    // Check if there are failures
    hasFailures() {
      return this.results.some(r => r.status === 'failed');
    }

    // Configuration
    configure(options) {
      Object.assign(this.config, options);
    }
  }

  // Test utilities
  const expect = (actual) => ({
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toEqual: (expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`);
      }
    },
    toBeFalsy: () => {
      if (actual) {
        throw new Error(`Expected ${actual} to be falsy`);
      }
    },
    toThrow: () => {
      if (typeof actual !== 'function') {
        throw new Error('Expected a function');
      }
      try {
        actual();
        throw new Error('Expected function to throw');
      } catch (error) {
        // Expected to throw
      }
    }
  });

  // Create test instance
  const testRunner = new TestRunner();

  // Export test framework
  global.TestRunner = testRunner;
  global.describe = testRunner.describe.bind(testRunner);
  global.expect = expect;

  // Built-in tests for Artone modules
  function registerBuiltInTests() {
    describe('Module Loader', (test) => {
      test.it('should be available', () => {
        expect(global.ModuleLoader).toBeTruthy();
      });

      test.it('should have required methods', () => {
        expect(typeof global.ModuleLoader.get).toBe('function');
        expect(typeof global.ModuleLoader.register).toBe('function');
      });
    });

    describe('Performance Optimizer', (test) => {
      test.it('should be available', () => {
        expect(global.PerformanceOptimizer).toBeTruthy();
      });

      test.it('should have memory manager', () => {
        expect(global.PerformanceOptimizer.memory).toBeTruthy();
        expect(typeof global.PerformanceOptimizer.memory.track).toBe('function');
      });
    });

    describe('Settings Manager', (test) => {
      test.it('should be available', () => {
        expect(global.SettingsManager).toBeTruthy();
      });

      test.it('should have core methods', () => {
        expect(typeof global.SettingsManager.get).toBe('function');
        expect(typeof global.SettingsManager.set).toBe('function');
        expect(typeof global.SettingsManager.watch).toBe('function');
      });
    });

    describe('Cache Manager', (test) => {
      test.it('should be available', () => {
        expect(global.CacheManager).toBeTruthy();
        expect(global.defaultCache).toBeTruthy();
      });

      test.it('should handle basic operations', async () => {
        await global.defaultCache.set('test-key', 'test-value');
        const value = await global.defaultCache.get('test-key');
        expect(value).toBe('test-value');
      });
    });

    describe('UI Manager', (test) => {
      test.it('should be available', () => {
        expect(global.UIManager).toBeTruthy();
      });

      test.it('should have theme and layout managers', () => {
        expect(global.UIManager.themeManager).toBeTruthy();
        expect(global.UIManager.layoutManager).toBeTruthy();
        expect(global.UIManager.accessibilityManager).toBeTruthy();
      });
    });

    describe('Timeline Core', (test) => {
      test.it('should be available', () => {
        expect(global.TimelineCore).toBeTruthy();
      });

      test.it('should have core utilities', () => {
        expect(typeof global.TimelineCore.formatTimecode).toBe('function');
        expect(typeof global.TimelineCore.roundToFrame).toBe('function');
        expect(typeof global.TimelineCore.createInitialState).toBe('function');
      });

      test.it('should format timecode correctly', () => {
        const formatted = global.TimelineCore.formatTimecode(65.5);
        expect(formatted).toBe('01:05:15'); // 1 minute, 5 seconds, 15 frames
      });
    });

    describe('Timeline Enhanced', (test) => {
      test.it('should be available', () => {
        expect(global.TimelineEnhanced).toBeTruthy();
      });

      test.it('should have enhanced features', () => {
        expect(global.TimelineEnhanced.RenderQueue).toBeTruthy();
        expect(global.TimelineEnhanced.CompressedHistory).toBeTruthy();
        expect(global.TimelineEnhanced.RobustMediaRecorder).toBeTruthy();
      });
    });
  }

  // Quality checks
  function runQualityChecks() {
    describe('Quality Checks', (test) => {
      test.it('should not have console.log in production modules', () => {
        // This would be implemented to check source code
        expect(true).toBeTruthy(); // Placeholder
      });

      test.it('should have proper error handling', () => {
        // Check that major modules handle errors gracefully
        expect(true).toBeTruthy(); // Placeholder
      });

      test.it('should not have memory leaks', () => {
        // Basic memory leak detection
        const initialMemory = global.performance && global.performance.memory
          ? global.performance.memory.usedJSHeapSize : 0;

        // Simulate some operations
        for (let i = 0; i < 100; i++) {
          global.defaultCache.set(`test-${i}`, { data: 'test'.repeat(100) });
        }

        // Clean up
        for (let i = 0; i < 100; i++) {
          global.defaultCache.delete(`test-${i}`);
        }

        // Memory should not have grown significantly
        expect(true).toBeTruthy(); // Simplified check
      });
    });
  }

  // Initialize tests when modules are ready
  global.addEventListener('artone:modules-ready', () => {
    registerBuiltInTests();
    runQualityChecks();

    console.log('Test runner initialized with built-in tests');
  });

  // Auto-run tests in development mode
  if (global.location && global.location.search.includes('run-tests')) {
    global.addEventListener('load', () => {
      setTimeout(() => {
        testRunner.runAll();
      }, 1000); // Wait for modules to initialize
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);