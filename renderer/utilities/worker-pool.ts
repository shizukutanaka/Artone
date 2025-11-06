interface WorkerTask {
  id: string;
  type: string;
  payload: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
}

interface WorkerMessage {
  type: 'task' | 'result' | 'error' | 'progress' | 'status';
  taskId?: string;
  payload?: any;
  error?: string;
  progress?: number;
}

interface WorkerPoolConfig {
  maxWorkers: number;
  workerScript: string;
  enableTaskQueue: boolean;
  enablePriorityQueue: boolean;
  taskTimeout: number;
  workerTimeout: number;
}

class WorkerPool {
  private config: WorkerPoolConfig;
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, WorkerTask> = new Map();
  private workerTasks: Map<Worker, string> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();

  private readonly defaultConfig: WorkerPoolConfig = {
    maxWorkers: navigator.hardwareConcurrency || 4,
    workerScript: '',
    enableTaskQueue: true,
    enablePriorityQueue: true,
    taskTimeout: 30000,
    workerTimeout: 60000
  };

  constructor(config: Partial<WorkerPoolConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.initializeWorkerPool();
  }

  private initializeWorkerPool(): void {
    this.createWorkers();
    this.setupEventHandling();
    this.startTaskProcessor();
  }

  private createWorkers(): void {
    for (let i = 0; i < this.config.maxWorkers; i++) {
      try {
        const worker = new Worker(this.config.workerScript);
        this.workers.push(worker);
        this.availableWorkers.push(worker);

        this.setupWorkerEventHandlers(worker);
        this.setupWorkerTimeout(worker);
      } catch (error) {
        console.error('Failed to create worker:', error);
      }
    }

    console.log(`Worker pool initialized with ${this.workers.length} workers`);
  }

  private setupWorkerEventHandlers(worker: Worker): void {
    worker.addEventListener('message', (event) => {
      this.handleWorkerMessage(worker, event.data);
    });

    worker.addEventListener('error', (error) => {
      this.handleWorkerError(worker, error);
    });

    worker.addEventListener('messageerror', (error) => {
      this.handleWorkerMessageError(worker, error);
    });
  }

  private setupWorkerTimeout(worker: Worker): void {
    setTimeout(() => {
      if (this.workers.includes(worker) && !this.availableWorkers.includes(worker)) {
        console.warn('Worker timed out, terminating and recreating');
        this.terminateWorker(worker);
        this.createReplacementWorker();
      }
    }, this.config.workerTimeout);
  }

  private handleWorkerMessage(worker: Worker, message: WorkerMessage): void {
    switch (message.type) {
      case 'result':
        this.handleTaskResult(worker, message.taskId!, message.payload);
        break;
      case 'error':
        this.handleTaskError(worker, message.taskId!, message.error!);
        break;
      case 'progress':
        this.emitProgressEvent(message.taskId!, message.progress!);
        break;
      case 'status':
        this.handleWorkerStatus(worker, message.payload);
        break;
    }
  }

  private handleTaskResult(worker: Worker, taskId: string, result: any): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      this.activeTasks.delete(taskId);
      this.workerTasks.delete(worker);
      this.availableWorkers.push(worker);

      this.emitTaskEvent('completed', taskId, result);
      this.processNextTask();
    }
  }

  private handleTaskError(worker: Worker, taskId: string, error: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      this.activeTasks.delete(taskId);
      this.workerTasks.delete(worker);
      this.availableWorkers.push(worker);

      this.emitTaskEvent('error', taskId, { error });
      this.processNextTask();
    }
  }

  private handleWorkerStatus(worker: Worker, status: any): void {
    console.log('Worker status:', status);
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    console.error('Worker error:', error);

    // Remove the faulty worker
    this.removeWorker(worker);

    // Create a replacement if needed
    if (this.workers.length < this.config.maxWorkers) {
      this.createReplacementWorker();
    }
  }

  private handleWorkerMessageError(worker: Worker, error: MessageEvent): void {
    console.error('Worker message error:', error);
    this.removeWorker(worker);
  }

  private removeWorker(worker: Worker): void {
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    const availableIndex = this.availableWorkers.indexOf(worker);
    if (availableIndex > -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }

    const taskId = this.workerTasks.get(worker);
    if (taskId) {
      this.activeTasks.delete(taskId);
      this.workerTasks.delete(worker);
    }

    worker.terminate();
  }

  private createReplacementWorker(): void {
    if (this.workers.length >= this.config.maxWorkers) return;

    try {
      const worker = new Worker(this.config.workerScript);
      this.workers.push(worker);
      this.availableWorkers.push(worker);

      this.setupWorkerEventHandlers(worker);
      this.setupWorkerTimeout(worker);

      console.log('Replacement worker created');
    } catch (error) {
      console.error('Failed to create replacement worker:', error);
    }
  }

  private startTaskProcessor(): void {
    if (!this.config.enableTaskQueue) return;

    setInterval(() => {
      this.processNextTask();
    }, 100);
  }

  private processNextTask(): void {
    if (this.availableWorkers.length === 0 || this.taskQueue.length === 0) return;

    let nextTask: WorkerTask | null = null;

    if (this.config.enablePriorityQueue) {
      // Process highest priority tasks first
      const priorityOrder = ['critical', 'high', 'normal', 'low'];
      for (const priority of priorityOrder) {
        nextTask = this.taskQueue.find(task => task.priority === priority) || null;
        if (nextTask) break;
      }
    } else {
      nextTask = this.taskQueue.shift() || null;
    }

    if (nextTask) {
      this.executeTask(nextTask);
    }
  }

  private executeTask(task: WorkerTask): void {
    const worker = this.availableWorkers.pop();
    if (!worker) return;

    this.activeTasks.set(task.id, task);
    this.workerTasks.set(worker, task.id);

    const message: WorkerMessage = {
      type: 'task',
      taskId: task.id,
      payload: task.payload
    };

    worker.postMessage(message);

    // Set task timeout
    if (task.timeout) {
      setTimeout(() => {
        if (this.activeTasks.has(task.id)) {
          this.handleTaskError(worker, task.id, 'Task timeout');
        }
      }, task.timeout);
    }
  }

  public async submitTask(task: WorkerTask): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('completed', successHandler);
        this.off('error', errorHandler);
        reject(new Error('Task timeout'));
      }, task.timeout || this.config.taskTimeout);

      const successHandler = (taskId: string, result: any) => {
        if (taskId === task.id) {
          clearTimeout(timeout);
          this.off('completed', successHandler);
          this.off('error', errorHandler);
          resolve(result);
        }
      };

      const errorHandler = (taskId: string, error: any) => {
        if (taskId === task.id) {
          clearTimeout(timeout);
          this.off('completed', successHandler);
          this.off('error', errorHandler);
          reject(error);
        }
      };

      this.on('completed', successHandler);
      this.on('error', errorHandler);

      if (this.availableWorkers.length > 0) {
        this.executeTask(task);
      } else if (this.config.enableTaskQueue) {
        this.taskQueue.push(task);
      } else {
        clearTimeout(timeout);
        this.off('completed', successHandler);
        this.off('error', errorHandler);
        reject(new Error('No workers available'));
      }
    });
  }

  public broadcastMessage(message: WorkerMessage): void {
    this.workers.forEach(worker => {
      worker.postMessage(message);
    });
  }

  public terminateAllWorkers(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeTasks.clear();
    this.workerTasks.clear();
  }

  public getPoolStats(): any {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      maxWorkers: this.config.maxWorkers
    };
  }

  private emitTaskEvent(eventType: string, taskId: string, data: any): void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.forEach(listener => {
      try {
        (listener as Function)(taskId, data);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
  }

  private emitProgressEvent(taskId: string, progress: number): void {
    this.emitTaskEvent('progress', taskId, { progress });
  }

  public on(eventType: string, listener: Function): void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.push(listener);
    this.eventListeners.set(eventType, listeners);
  }

  public off(eventType: string, listener: Function): void {
    const listeners = this.eventListeners.get(eventType) || [];
    const filteredListeners = listeners.filter(l => l !== listener);
    this.eventListeners.set(eventType, filteredListeners);
  }

  public getConfig(): WorkerPoolConfig {
    return { ...this.config };
  }
}

// Specialized worker pools for different tasks
class AudioProcessingPool extends WorkerPool {
  constructor() {
    super({
      maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 2),
      workerScript: './audio-worker.js',
      enableTaskQueue: true,
      enablePriorityQueue: true,
      taskTimeout: 60000
    });
  }

  public async processAudio(audioData: any): Promise<any> {
    return this.submitTask({
      id: `audio-${Date.now()}`,
      type: 'audio-processing',
      payload: audioData,
      priority: 'normal',
      timeout: 60000
    });
  }
}

class VideoProcessingPool extends WorkerPool {
  constructor() {
    super({
      maxWorkers: 1, // Video processing is typically single-threaded
      workerScript: './video-worker.js',
      enableTaskQueue: true,
      enablePriorityQueue: true,
      taskTimeout: 300000 // 5 minutes for video processing
    });
  }

  public async processVideo(videoData: any): Promise<any> {
    return this.submitTask({
      id: `video-${Date.now()}`,
      type: 'video-processing',
      payload: videoData,
      priority: 'high',
      timeout: 300000
    });
  }
}

class ExportProcessingPool extends WorkerPool {
  constructor() {
    super({
      maxWorkers: 1,
      workerScript: './export-worker.js',
      enableTaskQueue: true,
      enablePriorityQueue: true,
      taskTimeout: 600000 // 10 minutes for export
    });
  }

  public async exportProject(exportData: any): Promise<any> {
    return this.submitTask({
      id: `export-${Date.now()}`,
      type: 'project-export',
      payload: exportData,
      priority: 'critical',
      timeout: 600000
    });
  }
}

// Global worker pools
let audioPool: AudioProcessingPool | null = null;
let videoPool: VideoProcessingPool | null = null;
let exportPool: ExportProcessingPool | null = null;

export function initializeWorkerPools(): void {
  if (typeof window === 'undefined') return;

  audioPool = new AudioProcessingPool();
  videoPool = new VideoProcessingPool();
  exportPool = new ExportProcessingPool();
}

export function getAudioPool(): AudioProcessingPool | null {
  return audioPool;
}

export function getVideoPool(): VideoProcessingPool | null {
  return videoPool;
}

export function getExportPool(): ExportProcessingPool | null {
  return exportPool;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeWorkerPools();
}
