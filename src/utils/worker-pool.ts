/**
 * Web Worker Pool - Enhanced Performance System
 * Manages a pool of web workers for CPU-intensive tasks
 */

export interface WorkerTask {
  id: string;
  type: string;
  payload: any;
  priority?: 'low' | 'normal' | 'high';
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  idleTimeout: number;
  taskTimeout: number;
  retryAttempts: number;
}

export class WorkerPool {
  private workers: Map<string, Worker> = new Map();
  private taskQueue: Array<{
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
    startTime: number;
    attempts: number;
  }> = [];
  private processingTasks = new Set<string>();
  private config: WorkerPoolConfig;

  constructor(
    private workerScript: string,
    config: Partial<WorkerPoolConfig> = {}
  ) {
    this.config = {
      maxWorkers: navigator.hardwareConcurrency || 4,
      idleTimeout: 30000,
      taskTimeout: 60000,
      retryAttempts: 3,
      ...config,
    };

    this.initializeWorkers();
  }

  /**
   * Initialize worker pool
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.config.maxWorkers; i++) {
      const worker = new Worker(workerScript, { type: 'module' });
      const workerId = `worker-${i}`;

      worker.onmessage = (event) => this.handleWorkerMessage(workerId, event);
      worker.onerror = (error) => this.handleWorkerError(workerId, error);

      this.workers.set(workerId, worker);
    }
  }

  /**
   * Execute task in worker pool
   */
  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      // Add priority sorting
      const queueItem = {
        task,
        resolve,
        reject,
        startTime: Date.now(),
        attempts: 0,
      };

      this.insertTaskByPriority(queueItem);
      this.processQueue();
    });
  }

  /**
   * Insert task into queue based on priority
   */
  private insertTaskByPriority(item: typeof this.taskQueue[0]): void {
    const priority = item.task.priority || 'normal';
    const priorityOrder = { high: 0, normal: 1, low: 2 };

    const insertIndex = this.taskQueue.findIndex(
      (existing) => priorityOrder[existing.task.priority || 'normal'] > priorityOrder[priority]
    );

    if (insertIndex === -1) {
      this.taskQueue.push(item);
    } else {
      this.taskQueue.splice(insertIndex, 0, item);
    }
  }

  /**
   * Process task queue
   */
  private processQueue(): void {
    // Find available worker
    const availableWorker = this.findAvailableWorker();

    if (availableWorker && this.taskQueue.length > 0) {
      const queueItem = this.taskQueue.shift()!;
      this.executeTaskOnWorker(availableWorker, queueItem);
    }
  }

  /**
   * Find available worker
   */
  private findAvailableWorker(): string | null {
    for (const [workerId, worker] of this.workers.entries()) {
      if (!this.processingTasks.has(workerId)) {
        return workerId;
      }
    }
    return null;
  }

  /**
   * Execute task on specific worker
   */
  private executeTaskOnWorker(
    workerId: string,
    queueItem: typeof this.taskQueue[0]
  ): void {
    const { task, resolve, reject, startTime } = queueItem;
    this.processingTasks.add(workerId);

    const worker = this.workers.get(workerId)!;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.processingTasks.delete(workerId);
      this.handleTaskTimeout(task, resolve, reject, startTime);
    }, this.config.taskTimeout);

    // Store timeout reference
    (worker as any)._currentTimeout = timeoutId;

    worker.postMessage({
      type: 'execute',
      task: {
        ...task,
        _timeoutId: timeoutId,
      },
    });

    // Store task reference for cleanup
    (worker as any)._currentTask = {
      task,
      resolve,
      reject,
      startTime,
      timeoutId,
    };
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(workerId: string, event: MessageEvent): void {
    const { taskId, success, result, error, executionTime } = event.data;
    const worker = this.workers.get(workerId)!;
    const taskInfo = (worker as any)._currentTask;

    // Clear timeout
    if ((worker as any)._currentTimeout) {
      clearTimeout((worker as any)._currentTimeout);
    }

    this.processingTasks.delete(workerId);

    if (taskInfo) {
      const { resolve, startTime } = taskInfo;
      resolve({
        taskId,
        success,
        result,
        error,
        executionTime: Date.now() - startTime,
      });
    }

    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(workerId: string, error: ErrorEvent): void {
    const worker = this.workers.get(workerId)!;
    const taskInfo = (worker as any)._currentTask;

    this.processingTasks.delete(workerId);

    if (taskInfo) {
      const { reject, task, startTime } = taskInfo;
      this.handleTaskError(task, reject, error, startTime);
    }

    // Recreate worker on error
    this.recreateWorker(workerId);
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(
    task: WorkerTask,
    resolve: (result: WorkerResult) => void,
    reject: (error: Error) => void,
    startTime: number
  ): void {
    const result: WorkerResult = {
      taskId: task.id,
      success: false,
      error: 'Task timeout',
      executionTime: Date.now() - startTime,
    };
    resolve(result);
  }

  /**
   * Handle task error with retry logic
   */
  private handleTaskError(
    task: WorkerTask,
    reject: (error: Error) => void,
    error: ErrorEvent,
    startTime: number
  ): void {
    // Could implement retry logic here
    reject(new Error(`Worker task failed: ${error.message}`));
  }

  /**
   * Recreate failed worker
   */
  private recreateWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate();
      const newWorker = new Worker(this.workerScript, { type: 'module' });
      const newWorkerId = `worker-${Date.now()}`;

      newWorker.onmessage = (event) => this.handleWorkerMessage(newWorkerId, event);
      newWorker.onerror = (error) => this.handleWorkerError(newWorkerId, error);

      this.workers.delete(workerId);
      this.workers.set(newWorkerId, newWorker);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    activeWorkers: number;
    queuedTasks: number;
    averageExecutionTime: number;
  } {
    const executionTimes = Array.from(this.workers.values())
      .map((worker) => (worker as any)._currentTask?.startTime)
      .filter(Boolean)
      .map((startTime) => Date.now() - startTime);

    return {
      totalWorkers: this.workers.size,
      activeWorkers: this.processingTasks.size,
      queuedTasks: this.taskQueue.length,
      averageExecutionTime: executionTimes.length > 0
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
        : 0,
    };
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    for (const worker of this.workers.values()) {
      worker.terminate();
    }
    this.workers.clear();
    this.taskQueue.length = 0;
    this.processingTasks.clear();
  }
}

// Worker task types for video processing
export const WORKER_TASK_TYPES = {
  VIDEO_PROCESSING: 'video_processing',
  AUDIO_PROCESSING: 'audio_processing',
  IMAGE_PROCESSING: 'image_processing',
  DATA_COMPRESSION: 'data_compression',
  FILE_ENCRYPTION: 'file_encryption',
} as const;

export type WorkerTaskType = typeof WORKER_TASK_TYPES[keyof typeof WORKER_TASK_TYPES];

/**
 * Web Worker Pool - Enhanced Performance System
 * Manages a pool of web workers for CPU-intensive tasks
 */

export interface WorkerTask {
  id: string;
  type: string;
  payload: any;
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  retries?: number;
  dependencies?: string[]; // Task IDs this task depends on
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  memoryUsage?: number;
  workerId?: string;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  idleTimeout: number;
  taskTimeout: number;
  retryAttempts: number;
  autoScale?: boolean;
  minWorkers?: number;
  maxWorkers?: number;
  resourceThreshold?: number;
}

export interface WorkerMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  activeWorkers: number;
  queuedTasks: number;
}

export class WorkerPool {
  private workers: Map<string, Worker> = new Map();
  private taskQueue: Array<{
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
    startTime: number;
    attempts: number;
    dependencies: Set<string>;
  }> = [];
  private processingTasks = new Set<string>();
  private completedTasks = new Set<string>();
  private config: WorkerPoolConfig;
  private metrics: WorkerMetrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageExecutionTime: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    activeWorkers: 0,
    queuedTasks: 0,
  };
  private executionTimes: number[] = [];
  private resourceMonitor?: NodeJS.Timeout;

  constructor(
    private workerScript: string,
    config: Partial<WorkerPoolConfig> = {}
  ) {
    this.config = {
      maxWorkers: navigator.hardwareConcurrency || 4,
      idleTimeout: 30000,
      taskTimeout: 60000,
      retryAttempts: 3,
      autoScale: true,
      minWorkers: 1,
      maxWorkers: navigator.hardwareConcurrency || 8,
      resourceThreshold: 0.8,
      ...config,
    };

    this.initializeWorkers();
    this.startResourceMonitoring();
  }

  /**
   * Initialize worker pool
   */
  private initializeWorkers(): void {
    const workerCount = Math.min(this.config.maxWorkers, navigator.hardwareConcurrency || 4);

    for (let i = 0; i < workerCount; i++) {
      this.createWorker(`worker-${i}`);
    }
  }

  /**
   * Create a new worker
   */
  private createWorker(workerId: string): void {
    try {
      const worker = new Worker(this.workerScript, { type: 'module' });
      worker.onmessage = (event) => this.handleWorkerMessage(workerId, event);
      worker.onerror = (error) => this.handleWorkerError(workerId, error);

      this.workers.set(workerId, worker);
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
    }
  }

  /**
   * Execute task in worker pool with dependency management
   */
  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      // Check dependencies
      const dependencies = task.dependencies || [];
      const unresolvedDeps = dependencies.filter(dep => !this.completedTasks.has(dep));

      if (unresolvedDeps.length > 0) {
        // Wait for dependencies or add to queue
        setTimeout(() => this.executeTask(task).then(resolve).catch(reject), 100);
        return;
      }

      const queueItem = {
        task,
        resolve,
        reject,
        startTime: Date.now(),
        attempts: 0,
        dependencies: new Set(dependencies),
      };

      this.insertTaskByPriority(queueItem);
      this.processQueue();

      this.metrics.totalTasks++;
      this.updateMetrics();
    });
  }

  /**
   * Insert task into queue based on priority and dependencies
   */
  private insertTaskByPriority(item: typeof this.taskQueue[0]): void {
    const priority = item.task.priority || 'normal';
    const priorityOrder = { high: 0, normal: 1, low: 2 };

    // Find insertion point considering priority
    const insertIndex = this.taskQueue.findIndex(
      (existing) => {
        const existingPriority = priorityOrder[existing.task.priority || 'normal'];
        const currentPriority = priorityOrder[priority];
        return existingPriority > currentPriority;
      }
    );

    if (insertIndex === -1) {
      this.taskQueue.push(item);
    } else {
      this.taskQueue.splice(insertIndex, 0, item);
    }
  }

  /**
   * Process task queue
   */
  private processQueue(): void {
    // Auto-scale workers if needed
    if (this.config.autoScale) {
      this.autoScaleWorkers();
    }

    // Find available worker
    const availableWorker = this.findAvailableWorker();

    if (availableWorker && this.taskQueue.length > 0) {
      const queueItem = this.taskQueue.shift()!;
      this.executeTaskOnWorker(availableWorker, queueItem);
    }
  }

  /**
   * Auto-scale workers based on load
   */
  private autoScaleWorkers(): void {
    const currentLoad = this.processingTasks.size / this.workers.size;
    const targetWorkers = Math.min(
      this.config.maxWorkers || navigator.hardwareConcurrency || 8,
      Math.max(this.config.minWorkers || 1, Math.ceil(this.taskQueue.length / 2))
    );

    if (currentLoad > this.config.resourceThreshold! && this.workers.size < targetWorkers) {
      // Scale up
      const newWorkerId = `worker-${Date.now()}-${Math.random()}`;
      this.createWorker(newWorkerId);
    } else if (currentLoad < 0.3 && this.workers.size > (this.config.minWorkers || 1)) {
      // Scale down
      const workerToRemove = Array.from(this.workers.keys()).find(
        workerId => !this.processingTasks.has(workerId)
      );

      if (workerToRemove) {
        const worker = this.workers.get(workerToRemove);
        if (worker) {
          worker.terminate();
          this.workers.delete(workerToRemove);
        }
      }
    }
  }

  /**
   * Find available worker
   */
  private findAvailableWorker(): string | null {
    for (const [workerId, worker] of this.workers.entries()) {
      if (!this.processingTasks.has(workerId)) {
        return workerId;
      }
    }
    return null;
  }

  /**
   * Execute task on specific worker
   */
  private executeTaskOnWorker(
    workerId: string,
    queueItem: typeof this.taskQueue[0]
  ): void {
    const { task, resolve, reject, startTime } = queueItem;
    this.processingTasks.add(workerId);

    const worker = this.workers.get(workerId)!;

    // Set up timeout
    const timeout = task.timeout || this.config.taskTimeout;
    const timeoutId = setTimeout(() => {
      this.processingTasks.delete(workerId);
      this.handleTaskTimeout(task, resolve, reject, startTime);
    }, timeout);

    // Store timeout reference
    (worker as any)._currentTimeout = timeoutId;

    worker.postMessage({
      type: 'execute',
      task: {
        ...task,
        _timeoutId: timeoutId,
        _workerId: workerId,
      },
    });

    // Store task reference for cleanup
    (worker as any)._currentTask = {
      task,
      resolve,
      reject,
      startTime,
      timeoutId,
    };
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(workerId: string, event: MessageEvent): void {
    const { taskId, success, result, error, executionTime, memoryUsage } = event.data;
    const worker = this.workers.get(workerId)!;
    const taskInfo = (worker as any)._currentTask;

    // Clear timeout
    if ((worker as any)._currentTimeout) {
      clearTimeout((worker as any)._currentTimeout);
    }

    this.processingTasks.delete(workerId);

    if (taskInfo) {
      const { resolve, startTime } = taskInfo;
      const finalResult: WorkerResult = {
        taskId,
        success,
        result,
        error,
        executionTime: Date.now() - startTime,
        memoryUsage,
        workerId,
      };

      // Update metrics
      this.executionTimes.push(finalResult.executionTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift(); // Keep only recent measurements
      }

      if (success) {
        this.metrics.completedTasks++;
        this.completedTasks.add(taskId);
      } else {
        this.metrics.failedTasks++;
      }

      this.updateMetrics();
      resolve(finalResult);
    }

    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(workerId: string, error: ErrorEvent): void {
    const worker = this.workers.get(workerId)!;
    const taskInfo = (worker as any)._currentTask;

    this.processingTasks.delete(workerId);

    if (taskInfo) {
      const { reject, task, startTime } = taskInfo;
      this.handleTaskError(task, reject, error, startTime);
    }

    // Recreate worker on error
    this.recreateWorker(workerId);
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(
    task: WorkerTask,
    resolve: (result: WorkerResult) => void,
    reject: (error: Error) => void,
    startTime: number
  ): void {
    const result: WorkerResult = {
      taskId: task.id,
      success: false,
      error: 'Task timeout',
      executionTime: Date.now() - startTime,
    };
    resolve(result);
  }

  /**
   * Handle task error with retry logic
   */
  private handleTaskError(
    task: WorkerTask,
    reject: (error: Error) => void,
    error: ErrorEvent,
    startTime: number
  ): void {
    const maxRetries = task.retries || this.config.retryAttempts;

    // Could implement retry logic here
    reject(new Error(`Worker task failed: ${error.message}`));
  }

  /**
   * Recreate failed worker
   */
  private recreateWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate();
      const newWorkerId = `worker-${Date.now()}-${Math.random()}`;
      this.createWorker(newWorkerId);
    }
  }

  /**
   * Start resource monitoring
   */
  private startResourceMonitoring(): void {
    if (typeof window === 'undefined') return;

    this.resourceMonitor = setInterval(() => {
      this.updateResourceMetrics();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Update resource metrics
   */
  private updateResourceMetrics(): void {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }

    // Estimate CPU usage (simplified)
    this.metrics.cpuUsage = this.processingTasks.size / this.workers.size;
    this.metrics.activeWorkers = this.processingTasks.size;
    this.metrics.queuedTasks = this.taskQueue.length;
  }

  /**
   * Update overall metrics
   */
  private updateMetrics(): void {
    if (this.executionTimes.length > 0) {
      this.metrics.averageExecutionTime =
        this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length;
    }
  }

  /**
   * Get pool statistics and metrics
   */
  getStats(): WorkerMetrics & {
    uptime: number;
    successRate: number;
    throughput: number; // tasks per second
  } {
    const uptime = Date.now() - (this as any).startTime || Date.now();
    const successRate = this.metrics.totalTasks > 0
      ? this.metrics.completedTasks / this.metrics.totalTasks
      : 0;
    const throughput = uptime > 0 ? (this.metrics.completedTasks / uptime) * 1000 : 0;

    return {
      ...this.metrics,
      uptime,
      successRate,
      throughput,
    };
  }

  /**
   * Get worker performance by type
   */
  getPerformanceByType(): Record<string, { count: number; avgTime: number; successRate: number }> {
    const typeStats = new Map<string, { count: number; totalTime: number; successCount: number }>();

    // This would need to be implemented based on actual task execution data
    // For now, return empty stats
    return {};
  }

  /**
   * Terminate all workers and cleanup
   */
  terminate(): void {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }

    for (const worker of this.workers.values()) {
      worker.terminate();
    }
    this.workers.clear();
    this.taskQueue.length = 0;
    this.processingTasks.clear();
    this.completedTasks.clear();
  }
}

// Worker task types for video processing
export const WORKER_TASK_TYPES = {
  VIDEO_PROCESSING: 'video_processing',
  AUDIO_PROCESSING: 'audio_processing',
  IMAGE_PROCESSING: 'image_processing',
  DATA_COMPRESSION: 'data_compression',
  FILE_ENCRYPTION: 'file_encryption',
  TEXT_ANALYSIS: 'text_analysis',
  MACHINE_LEARNING: 'machine_learning',
} as const;

export type WorkerTaskType = typeof WORKER_TASK_TYPES[keyof typeof WORKER_TASK_TYPES];

// Global worker pool instances for different task types
export const videoProcessingPool = new WorkerPool('/workers/video-processor.js', {
  maxWorkers: 2,
  taskTimeout: 120000, // 2 minutes for video processing
});

export const audioProcessingPool = new WorkerPool('/workers/audio-processor.js', {
  maxWorkers: 2,
  taskTimeout: 60000, // 1 minute for audio processing
});

export const generalTaskPool = new WorkerPool('/workers/general-task.js', {
  maxWorkers: 4,
  taskTimeout: 30000, // 30 seconds for general tasks
});

// Initialize pools when available
if (typeof window !== 'undefined') {
  // Pools will be initialized when first task is submitted
}
