'use strict';

(function registerPluginSystem(global) {
  // Plugin API permission scopes and sandbox enforcement system
  const PERMISSION_SCOPES = {
    // File system access
    'filesystem:read': {
      name: 'File System Read',
      description: 'Read access to user-selected files and directories',
      dangerous: false,
      default: true
    },
    'filesystem:write': {
      name: 'File System Write',
      description: 'Write access to user-selected files and directories',
      dangerous: true,
      default: false
    },
    'filesystem:full': {
      name: 'Full File System Access',
      description: 'Unrestricted access to entire file system',
      dangerous: true,
      default: false
    },

    // Network access
    'network:request': {
      name: 'Network Requests',
      description: 'Make HTTP/HTTPS requests to external services',
      dangerous: true,
      default: false
    },
    'network:websocket': {
      name: 'WebSocket Connections',
      description: 'Establish WebSocket connections',
      dangerous: true,
      default: false
    },

    // System resources
    'system:memory': {
      name: 'Memory Usage',
      description: 'Access to memory usage information',
      dangerous: false,
      default: true
    },
    'system:performance': {
      name: 'Performance Monitoring',
      description: 'Access to performance metrics and monitoring',
      dangerous: false,
      default: true
    },
    'system:process': {
      name: 'Process Information',
      description: 'Access to process and system information',
      dangerous: true,
      default: false
    },

    // Media access
    'media:video': {
      name: 'Video Processing',
      description: 'Access to video decoding and processing',
      dangerous: false,
      default: true
    },
    'media:audio': {
      name: 'Audio Processing',
      description: 'Access to audio decoding and processing',
      dangerous: false,
      default: true
    },
    'media:stream': {
      name: 'Media Streaming',
      description: 'Access to camera and microphone streams',
      dangerous: true,
      default: false
    },

    // UI access
    'ui:elements': {
      name: 'UI Element Access',
      description: 'Access to create and modify UI elements',
      dangerous: false,
      default: true
    },
    'ui:modals': {
      name: 'Modal Dialogs',
      description: 'Access to show modal dialogs and notifications',
      dangerous: false,
      default: true
    },
    'ui:menus': {
      name: 'Menu System',
      description: 'Access to modify application menus',
      dangerous: false,
      default: false
    },

    // Storage access
    'storage:local': {
      name: 'Local Storage',
      description: 'Access to browser local storage',
      dangerous: false,
      default: true
    },
    'storage:session': {
      name: 'Session Storage',
      description: 'Access to browser session storage',
      dangerous: false,
      default: true
    },
    'storage:indexeddb': {
      name: 'IndexedDB',
      description: 'Access to IndexedDB for data persistence',
      dangerous: false,
      default: true
    },

    // Plugin management
    'plugin:install': {
      name: 'Plugin Installation',
      description: 'Install and manage other plugins',
      dangerous: true,
      default: false
    },
    'plugin:configure': {
      name: 'Plugin Configuration',
      description: 'Access to plugin configuration and settings',
      dangerous: false,
      default: true
    }
  };

  const SANDBOX_POLICIES = {
    // Sandbox isolation levels
    'strict': {
      name: 'Strict Isolation',
      description: 'Maximum security with minimal access',
      allowedScopes: [
        'system:memory',
        'system:performance',
        'media:video',
        'media:audio',
        'ui:elements',
        'ui:modals',
        'storage:local',
        'storage:session',
        'storage:indexeddb',
        'plugin:configure'
      ],
      resourceLimits: {
        memory: '100MB',
        cpu: '50%',
        network: false,
        filesystem: false
      }
    },
    'moderate': {
      name: 'Moderate Isolation',
      description: 'Balanced security and functionality',
      allowedScopes: [
        'filesystem:read',
        'system:memory',
        'system:performance',
        'media:video',
        'media:audio',
        'ui:elements',
        'ui:modals',
        'storage:local',
        'storage:session',
        'storage:indexeddb',
        'plugin:configure'
      ],
      resourceLimits: {
        memory: '500MB',
        cpu: '75%',
        network: false,
        filesystem: 'user-selected'
      }
    },
    'permissive': {
      name: 'Permissive Isolation',
      description: 'Minimal restrictions for trusted plugins',
      allowedScopes: [
        'filesystem:read',
        'filesystem:write',
        'network:request',
        'system:memory',
        'system:performance',
        'media:video',
        'media:audio',
        'media:stream',
        'ui:elements',
        'ui:modals',
        'ui:menus',
        'storage:local',
        'storage:session',
        'storage:indexeddb',
        'plugin:configure'
      ],
      resourceLimits: {
        memory: '1GB',
        cpu: '90%',
        network: 'restricted',
        filesystem: 'user-selected'
      }
    },
    'unrestricted': {
      name: 'No Isolation',
      description: 'Full access for system plugins',
      allowedScopes: Object.keys(PERMISSION_SCOPES),
      resourceLimits: {
        memory: '2GB',
        cpu: '100%',
        network: 'unrestricted',
        filesystem: 'full'
      }
    }
  };

  class SandboxManager {
    constructor() {
      this.activeSandboxes = new Map();
      this.resourceMonitors = new Map();
      this.violationHandlers = new Map();
    }

    createSandbox(pluginId, policy = 'strict') {
      const sandboxPolicy = SANDBOX_POLICIES[policy];
      if (!sandboxPolicy) {
        throw new Error(`Unknown sandbox policy: ${policy}`);
      }

      const sandbox = {
        id: `sandbox_${pluginId}_${Date.now()}`,
        pluginId,
        policy,
        allowedScopes: new Set(sandboxPolicy.allowedScopes),
        resourceLimits: { ...sandboxPolicy.resourceLimits },
        currentUsage: {
          memory: 0,
          cpu: 0,
          networkRequests: 0,
          filesystemOperations: 0
        },
        violations: [],
        created: Date.now(),
        lastActivity: Date.now()
      };

      this.activeSandboxes.set(sandbox.id, sandbox);
      this.setupResourceMonitoring(sandbox);

      return sandbox.id;
    }

    checkPermission(sandboxId, scope) {
      const sandbox = this.activeSandboxes.get(sandboxId);
      if (!sandbox) {
        throw new Error(`Sandbox not found: ${sandboxId}`);
      }

      if (!sandbox.allowedScopes.has(scope)) {
        this.recordViolation(sandboxId, 'permission_denied', { scope });
        return false;
      }

      this.updateActivity(sandboxId);
      return true;
    }

    setupResourceMonitoring(sandbox) {
      const monitor = {
        memoryInterval: setInterval(() => {
          this.checkMemoryUsage(sandbox);
        }, 1000),
        cpuInterval: setInterval(() => {
          this.checkCPUUsage(sandbox);
        }, 5000)
      };

      this.resourceMonitors.set(sandbox.id, monitor);
    }

    checkMemoryUsage(sandbox) {
      if (typeof performance !== 'undefined' && performance.memory) {
        const memoryUsage = performance.memory.usedJSHeapSize;
        const limit = this.parseMemoryLimit(sandbox.resourceLimits.memory);

        if (memoryUsage > limit) {
          this.handleResourceViolation(sandbox.id, 'memory', memoryUsage, limit);
        }

        sandbox.currentUsage.memory = memoryUsage;
      }
    }

    checkCPUUsage(sandbox) {
      // CPU usage monitoring would require more complex implementation
      // For now, we'll use a simple heuristic based on activity
      const now = Date.now();
      const timeSinceLastActivity = now - sandbox.lastActivity;
      const cpuUsage = Math.max(0, 100 - (timeSinceLastActivity / 100));

      if (cpuUsage > parseFloat(sandbox.resourceLimits.cpu)) {
        this.handleResourceViolation(sandbox.id, 'cpu', cpuUsage, sandbox.resourceLimits.cpu);
      }

      sandbox.currentUsage.cpu = cpuUsage;
    }

    parseMemoryLimit(limit) {
      const match = limit.match(/^(\d+)(MB|GB)$/);
      if (!match) return 100 * 1024 * 1024; // Default 100MB

      const value = parseInt(match[1]);
      const unit = match[2];

      return unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
    }

    handleResourceViolation(sandboxId, resource, current, limit) {
      const violation = {
        type: 'resource_violation',
        resource,
        current,
        limit,
        timestamp: Date.now()
      };

      this.recordViolation(sandboxId, violation.type, violation);

      // Take corrective action based on severity
      if (this.isCriticalViolation(resource, current, limit)) {
        this.terminateSandbox(sandboxId, 'critical_resource_violation');
      }
    }

    isCriticalViolation(resource, current, limit) {
      const ratio = current / limit;
      return ratio > 2.0; // 200% over limit is critical
    }

    recordViolation(sandboxId, type, details) {
      const sandbox = this.activeSandboxes.get(sandboxId);
      if (!sandbox) return;

      const violation = {
        type,
        details,
        timestamp: Date.now()
      };

      sandbox.violations.push(violation);

      // Notify violation handlers
      const handlers = this.violationHandlers.get(type) || [];
      handlers.forEach(handler => {
        try {
          handler(sandboxId, violation);
        } catch (error) {
          console.error('Violation handler error:', error);
        }
      });

      // Limit violation history
      if (sandbox.violations.length > 100) {
        sandbox.violations = sandbox.violations.slice(-50);
      }
    }

    updateActivity(sandboxId) {
      const sandbox = this.activeSandboxes.get(sandboxId);
      if (sandbox) {
        sandbox.lastActivity = Date.now();
      }
    }

    terminateSandbox(sandboxId, reason = 'terminated') {
      const sandbox = this.activeSandboxes.get(sandboxId);
      if (!sandbox) return;

      // Clean up monitoring
      const monitor = this.resourceMonitors.get(sandboxId);
      if (monitor) {
        clearInterval(monitor.memoryInterval);
        clearInterval(monitor.cpuInterval);
        this.resourceMonitors.delete(sandboxId);
      }

      // Mark as terminated
      sandbox.terminated = true;
      sandbox.terminationReason = reason;
      sandbox.terminatedAt = Date.now();

      // Remove from active sandboxes after a delay
      setTimeout(() => {
        this.activeSandboxes.delete(sandboxId);
      }, 30000); // Keep for 30 seconds for analysis
    }

    getSandboxInfo(sandboxId) {
      const sandbox = this.activeSandboxes.get(sandboxId);
      if (!sandbox) return null;

      return {
        ...sandbox,
        resourceUsage: { ...sandbox.currentUsage },
        violationCount: sandbox.violations.length,
        uptime: Date.now() - sandbox.created
      };
    }

    getAllSandboxes() {
      const result = [];
      for (const [id, sandbox] of this.activeSandboxes) {
        result.push(this.getSandboxInfo(id));
      }
      return result;
    }

    onViolation(type, handler) {
      if (!this.violationHandlers.has(type)) {
        this.violationHandlers.set(type, []);
      }
      this.violationHandlers.get(type).push(handler);
    }

    cleanup() {
      for (const [sandboxId] of this.activeSandboxes) {
        this.terminateSandbox(sandboxId, 'system_cleanup');
      }
      this.violationHandlers.clear();
    }
  }

  class PluginManager {
    constructor() {
      this.plugins = new Map();
      this.sandboxManager = new SandboxManager();
      this.pluginLoaders = new Map();
      this.dependencyGraph = new Map();
      this.isInitialized = false;
    }

    async initialize() {
      if (this.isInitialized) return;

      this.setupDefaultLoaders();
      this.sandboxManager = new SandboxManager();
      this.isInitialized = true;

      console.log('Plugin system initialized');
    }

    setupDefaultLoaders() {
      // JavaScript module loader
      this.registerLoader('js', async (pluginId, source, config) => {
        const sandboxId = this.sandboxManager.createSandbox(pluginId, config.sandboxPolicy);

        const wrappedSource = this.wrapPluginCode(source, sandboxId, config);

        try {
          const module = await this.executeInSandbox(wrappedSource, sandboxId);
          return { success: true, module, sandboxId };
        } catch (error) {
          this.sandboxManager.terminateSandbox(sandboxId, 'load_error');
          throw error;
        }
      });

      // JSON configuration loader
      this.registerLoader('json', async (pluginId, source, config) => {
        try {
          const parsed = JSON.parse(source);
          return { success: true, config: parsed, sandboxId: null };
        } catch (error) {
          throw new Error(`Invalid JSON in plugin ${pluginId}: ${error.message}`);
        }
      });

      // WASM module loader
      this.registerLoader('wasm', async (pluginId, source, config) => {
        const sandboxId = this.sandboxManager.createSandbox(pluginId, config.sandboxPolicy);

        try {
          const wasmModule = await WebAssembly.instantiate(source, {});
          return { success: true, module: wasmModule, sandboxId };
        } catch (error) {
          this.sandboxManager.terminateSandbox(sandboxId, 'load_error');
          throw error;
        }
      });
    }

    registerLoader(type, loader) {
      this.pluginLoaders.set(type, loader);
    }

    wrapPluginCode(source, sandboxId, config) {
      const grantedPermissions = config.permissions || [];

      return `
        (function() {
          const sandboxId = '${sandboxId}';
          const grantedPermissions = ${JSON.stringify(grantedPermissions)};

          // Create proxy for dangerous APIs
          const createSecureProxy = (target, permission) => {
            return new Proxy(target, {
              get(target, prop) {
                if (!grantedPermissions.includes(permission)) {
                  throw new Error(\`Permission denied: \${permission}\`);
                }
                return target[prop];
              },
              set(target, prop, value) {
                if (!grantedPermissions.includes(permission)) {
                  throw new Error(\`Permission denied: \${permission}\`);
                }
                return target[prop] = value;
              }
            });
          };

          // Secure globals
          const secureFetch = grantedPermissions.includes('network:request') ? fetch : null;
          const secureLocalStorage = grantedPermissions.includes('storage:local') ? localStorage : null;
          const secureSessionStorage = grantedPermissions.includes('storage:session') ? sessionStorage : null;

          // Plugin API
          const pluginAPI = {
            id: '${config.id}',
            name: '${config.name}',
            version: '${config.version}',
            permissions: grantedPermissions,
            filesystem: createSecureProxy({}, 'filesystem:read'),
            network: secureFetch ? { fetch: secureFetch } : null,
            storage: {
              local: secureLocalStorage,
              session: secureSessionStorage
            },
            ui: createSecureProxy({}, 'ui:elements'),
            media: createSecureProxy({}, 'media:video')
          };

          // Execute plugin code
          ${source}

          // Return plugin interface
          return {
            initialize: (hostAPI) => {
              try {
                if (typeof initialize === 'function') {
                  return initialize(hostAPI, pluginAPI);
                }
              } catch (error) {
                throw new Error(\`Plugin initialization failed: \${error.message}\`);
              }
            },
            destroy: () => {
              if (typeof destroy === 'function') {
                destroy();
              }
            }
          };
        })()
      `;
    }

    async executeInSandbox(code, sandboxId) {
      // In a real implementation, this would use a secure execution environment
      // For now, we'll use eval with strict limitations
      const sandbox = this.sandboxManager.activeSandboxes.get(sandboxId);
      if (!sandbox) {
        throw new Error('Sandbox not found');
      }

      try {
        // Create a function with limited scope
        const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', code);

        const module = { exports: {} };
        const context = {
          require: this.createSecureRequire(sandboxId),
          module,
          exports: module.exports,
          __filename: `plugin://${sandbox.pluginId}`,
          __dirname: `plugin://${sandbox.pluginId}`
        };

        fn.call(context, context.require, context.module, context.exports, context.__filename, context.__dirname);

        return module.exports;
      } catch (error) {
        throw new Error(`Plugin execution failed: ${error.message}`);
      }
    }

    createSecureRequire(sandboxId) {
      return (moduleName) => {
        if (!this.sandboxManager.checkPermission(sandboxId, 'plugin:require')) {
          throw new Error('Permission denied: plugin:require');
        }

        // Only allow loading from approved modules
        const allowedModules = ['lodash', 'underscore', 'moment', 'd3'];
        if (!allowedModules.includes(moduleName)) {
          throw new Error(`Module not allowed: ${moduleName}`);
        }

        // In a real implementation, this would load actual modules
        return {};
      };
    }

    async loadPlugin(pluginConfig, source) {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { id, type = 'js', permissions = [], sandboxPolicy = 'strict' } = pluginConfig;

      if (this.plugins.has(id)) {
        throw new Error(`Plugin already loaded: ${id}`);
      }

      const loader = this.pluginLoaders.get(type);
      if (!loader) {
        throw new Error(`No loader available for plugin type: ${type}`);
      }

      try {
        const result = await loader(id, source, { ...pluginConfig, permissions, sandboxPolicy });

        const plugin = {
          id,
          config: pluginConfig,
          module: result.module,
          sandboxId: result.sandboxId,
          loadedAt: Date.now(),
          status: 'loaded'
        };

        this.plugins.set(id, plugin);

        // Initialize plugin if it has an initialize method
        if (result.module && typeof result.module.initialize === 'function') {
          const hostAPI = this.createHostAPI(id);
          await result.module.initialize(hostAPI);
          plugin.status = 'active';
        }

        return plugin;
      } catch (error) {
        console.error(`Failed to load plugin ${id}:`, error);
        throw error;
      }
    }

    createHostAPI(pluginId) {
      return {
        // Plugin lifecycle
        getPluginInfo: () => this.getPluginInfo(pluginId),
        updateConfig: (config) => this.updatePluginConfig(pluginId, config),

        // Host services
        settings: {
          get: (key, defaultValue) => SettingsManager.get(key, defaultValue),
          set: (key, value) => SettingsManager.set(key, value)
        },

        ui: {
          registerMenuItem: (menuId, item) => this.registerMenuItem(pluginId, menuId, item),
          registerPanel: (panelId, panel) => this.registerPanel(pluginId, panelId, panel),
          showNotification: (message, type) => this.showNotification(pluginId, message, type)
        },

        events: {
          on: (event, handler) => this.onPluginEvent(pluginId, event, handler),
          off: (event, handler) => this.offPluginEvent(pluginId, event, handler),
          emit: (event, data) => this.emitHostEvent(pluginId, event, data)
        },

        // Sandbox-aware methods
        requestPermission: (permission) => this.requestPermission(pluginId, permission),
        checkPermission: (permission) => this.checkPermission(pluginId, permission)
      };
    }

    async unloadPlugin(pluginId) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      try {
        if (plugin.module && typeof plugin.module.destroy === 'function') {
          await plugin.module.destroy();
        }

        if (plugin.sandboxId) {
          this.sandboxManager.terminateSandbox(plugin.sandboxId, 'plugin_unloaded');
        }

        this.plugins.delete(pluginId);
        console.log(`Plugin unloaded: ${pluginId}`);
      } catch (error) {
        console.error(`Error unloading plugin ${pluginId}:`, error);
        throw error;
      }
    }

    getPluginInfo(pluginId) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) return null;

      const sandboxInfo = plugin.sandboxId
        ? this.sandboxManager.getSandboxInfo(plugin.sandboxId)
        : null;

      return {
        ...plugin,
        sandboxInfo
      };
    }

    updatePluginConfig(pluginId, config) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      plugin.config = { ...plugin.config, ...config };
    }

    requestPermission(pluginId, permission) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      const sandboxId = plugin.sandboxId;
      if (!sandboxId) {
        throw new Error(`Plugin ${pluginId} is not running in a sandbox`);
      }

      return this.sandboxManager.checkPermission(sandboxId, permission);
    }

    checkPermission(pluginId, permission) {
      return this.requestPermission(pluginId, permission);
    }

    registerMenuItem(pluginId, menuId, item) {
      // Implementation would integrate with the main menu system
      console.log(`Plugin ${pluginId} registered menu item:`, { menuId, item });
    }

    registerPanel(pluginId, panelId, panel) {
      // Implementation would integrate with the UI system
      console.log(`Plugin ${pluginId} registered panel:`, { panelId, panel });
    }

    showNotification(pluginId, message, type = 'info') {
      // Implementation would show a notification
      console.log(`Plugin ${pluginId} notification:`, { message, type });
    }

    onPluginEvent(pluginId, event, handler) {
      // Implementation would register event handlers
      console.log(`Plugin ${pluginId} listening for event:`, event);
    }

    offPluginEvent(pluginId, event, handler) {
      // Implementation would unregister event handlers
      console.log(`Plugin ${pluginId} stopped listening for event:`, event);
    }

    emitHostEvent(pluginId, event, data) {
      // Implementation would emit events to the host system
      console.log(`Plugin ${pluginId} emitted event:`, { event, data });
    }

    getAllPlugins() {
      const result = [];
      for (const [id, plugin] of this.plugins) {
        result.push(this.getPluginInfo(id));
      }
      return result;
    }

    validatePluginConfig(config) {
      const requiredFields = ['id', 'name', 'version'];
      for (const field of requiredFields) {
        if (!config[field]) {
          throw new Error(`Plugin config missing required field: ${field}`);
        }
      }

      if (!Array.isArray(config.permissions)) {
        config.permissions = [];
      }

      if (!config.sandboxPolicy || !SANDBOX_POLICIES[config.sandboxPolicy]) {
        config.sandboxPolicy = 'strict';
      }

      return config;
    }

    async installPluginFromURL(url, config = {}) {
      try {
        const response = await fetch(url);
        const source = await response.text();

        const pluginConfig = this.validatePluginConfig({
          id: config.id || this.generatePluginId(),
          name: config.name || 'Unnamed Plugin',
          version: config.version || '1.0.0',
          type: config.type || 'js',
          permissions: config.permissions || [],
          sandboxPolicy: config.sandboxPolicy || 'strict',
          ...config
        });

        return this.loadPlugin(pluginConfig, source);
      } catch (error) {
        console.error('Failed to install plugin from URL:', error);
        throw error;
      }
    }

    generatePluginId() {
      return `plugin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    cleanup() {
      for (const [pluginId] of this.plugins) {
        this.unloadPlugin(pluginId);
      }
      this.sandboxManager.cleanup();
    }
  }

  // Create global instances
  const pluginManager = new PluginManager();
  const sandboxManager = new SandboxManager();

  // Export to global scope
  global.PluginManager = pluginManager;
  global.SandboxManager = sandboxManager;
  global.PERMISSION_SCOPES = PERMISSION_SCOPES;
  global.SANDBOX_POLICIES = SANDBOX_POLICIES;

})(typeof window !== 'undefined' ? window : globalThis);
