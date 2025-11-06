import { logInfo, logWarning, logError } from './structured-logger';

interface UploadConfig {
  enableChunkedUpload: boolean;
  chunkSize: number; // bytes
  maxFileSize: number; // bytes
  allowedFileTypes: string[];
  enableCompression: boolean;
  compressionQuality: number;
  enableProgressTracking: boolean;
  enableDragAndDrop: boolean;
  enablePasteUpload: boolean;
  enableRetryOnFailure: boolean;
  maxRetries: number;
  timeout: number; // milliseconds
  enableParallelUploads: boolean;
  maxParallelUploads: number;
}

interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  chunks: UploadChunk[];
  metadata: Record<string, any>;
}

interface UploadChunk {
  id: string;
  index: number;
  data: Blob;
  size: number;
  uploaded: boolean;
  retries: number;
}

interface UploadProgress {
  fileId: string;
  loaded: number;
  total: number;
  percentage: number;
  speed: number;
  eta: number;
  status: string;
}

interface UploadMetrics {
  totalFiles: number;
  activeFiles: number;
  queuedFiles: number;
  completedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
  averageProgress: number;
  timestamp: number;
}

class FileUploadManager {
  private config: UploadConfig;
  private activeUploads: Map<string, UploadFile> = new Map();
  private uploadQueue: UploadFile[] = [];
  private completedUploads: UploadFile[] = [];
  private progressCallbacks: Map<string, (progress: UploadProgress) => void> = new Map();
  private globalProgressCallbacks: Set<(metrics: UploadMetrics) => void> = new Set();

  private readonly defaultConfig: UploadConfig = {
    enableChunkedUpload: true,
    chunkSize: 1024 * 1024, // 1MB
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedFileTypes: ['image/*', 'video/*', 'audio/*', 'text/*', 'application/*'],
    enableCompression: true,
    compressionQuality: 0.8,
    enableProgressTracking: true,
    enableDragAndDrop: true,
    enablePasteUpload: true,
    enableRetryOnFailure: true,
    maxRetries: 3,
    timeout: 30000, // 30 seconds
    enableParallelUploads: true,
    maxParallelUploads: 3
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeUploadSystem();
    this.emitGlobalProgress();
  }

  private initializeUploadSystem(): void {
    this.setupDragAndDrop();
    this.setupPasteUpload();
    this.setupProgressTracking();
    this.startUploadProcessor();
  }

  private setupDragAndDrop(): void {
    if (!this.config.enableDragAndDrop) return;

    const dropZones = document.querySelectorAll('[data-upload-zone]');

    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer?.files || []);
        this.handleFiles(files, zone as HTMLElement);
      });
    });
  }

  private setupPasteUpload(): void {
    if (!this.config.enablePasteUpload) return;

    document.addEventListener('paste', (e) => {
      const items = Array.from(e.clipboardData?.items || []);

      items.forEach(item => {
        if (item.type.startsWith('image/') || item.type.startsWith('text/')) {
          const file = item.getAsFile();
          if (file) {
            this.handleFiles([file]);
          }
        }
      });
    });
  }

  private setupProgressTracking(): void {
    // Set up progress tracking UI updates
    setInterval(() => {
      this.updateProgressDisplays();
    }, 100); // Update every 100ms
  }

  private startUploadProcessor(): void {
    setInterval(() => {
      this.processUploadQueue();
    }, 1000); // Process queue every second
  }

  public async uploadFile(file: File, options?: any): Promise<UploadFile> {
    // Validate file
    if (!this.validateFile(file)) {
      throw new Error('File validation failed');
    }

    // Create upload file object
    const uploadFile: UploadFile = {
      id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'pending',
      chunks: [],
      metadata: {
        startTime: Date.now(),
        ...options?.metadata
      }
    };

    // Split into chunks if enabled
    if (this.config.enableChunkedUpload && file.size > this.config.chunkSize) {
      uploadFile.chunks = await this.createChunks(file);
    }

    this.activeUploads.set(uploadFile.id, uploadFile);

    // Add to queue or start immediately
    if (this.getActiveUploadCount() < this.config.maxParallelUploads) {
      this.startUpload(uploadFile);
    } else {
      this.uploadQueue.push(uploadFile);
    }

    return uploadFile;
  }

  public async uploadFiles(files: FileList | File[], options?: any): Promise<UploadFile[]> {
    const uploadPromises = Array.from(files).map(file =>
      this.uploadFile(file, options)
    );

    return Promise.all(uploadPromises);
  }

  private async handleFiles(files: File[], targetZone?: HTMLElement): Promise<void> {
    try {
      const validFiles = files.filter(file => this.validateFile(file));

      if (validFiles.length === 0) {
        this.showError('No valid files to upload');
        return;
      }

      if (validFiles.length !== files.length) {
        this.showWarning(`${files.length - validFiles.length} files were skipped due to validation errors`);
      }

      const uploadFiles = await this.uploadFiles(validFiles);

      if (targetZone) {
        this.showUploadPreview(uploadFiles, targetZone);
      }

      console.log('Files uploaded:', uploadFiles);
    } catch (error) {
      console.error('File upload failed:', error);
      this.showError('Upload failed. Please try again.');
    }
  }

  private validateFile(file: File): boolean {
    // Check file size
    if (file.size > this.config.maxFileSize) {
      this.showError(`File ${file.name} is too large (max ${this.formatBytes(this.config.maxFileSize)})`);
      return false;
    }

    // Check file type
    const isAllowedType = this.config.allowedFileTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isAllowedType) {
      this.showError(`File type ${file.type} is not allowed`);
      return false;
    }

    return true;
  }

  private async createChunks(file: File): Promise<UploadChunk[]> {
    const chunks: UploadChunk[] = [];
    const totalChunks = Math.ceil(file.size / this.config.chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, file.size);
      const chunkData = file.slice(start, end);

      chunks.push({
        id: `chunk_${i}`,
        index: i,
        data: chunkData,
        size: end - start,
        uploaded: false,
        retries: 0
      });
    }

    return chunks;
  }

  private async startUpload(uploadFile: UploadFile): Promise<void> {
    if (!uploadFile.metadata.startTime) {
      uploadFile.metadata.startTime = Date.now();
    }
    uploadFile.status = 'uploading';

    try {
      if (uploadFile.chunks.length > 0) {
        await this.uploadChunks(uploadFile);
      } else {
        await this.uploadDirect(uploadFile);
      }

      uploadFile.status = 'completed';
      uploadFile.progress = 100;

      this.completedUploads.push(uploadFile);
      this.activeUploads.delete(uploadFile.id);

      this.onUploadComplete(uploadFile);
      this.emitGlobalProgress();
    } catch (error) {
      uploadFile.status = 'failed';
      this.onUploadError(uploadFile, error as Error);
    }
  }

  private async uploadChunks(uploadFile: UploadFile): Promise<void> {
    const chunks = uploadFile.chunks;
    let uploadedChunks = 0;

    const uploadChunk = async (chunk: UploadChunk): Promise<void> => {
      if (chunk.uploaded) return;

      try {
        await this.uploadChunkData(uploadFile, chunk);
        chunk.uploaded = true;
        uploadedChunks++;

        const progress = (uploadedChunks / chunks.length) * 100;
        uploadFile.progress = progress;

        this.updateProgress(uploadFile.id, progress);
      } catch (error) {
        chunk.retries++;

        if (chunk.retries < this.config.maxRetries) {
          console.warn(`Chunk ${chunk.index} failed, retrying (${chunk.retries}/${this.config.maxRetries})`);
          await uploadChunk(chunk);
        } else {
          throw new Error(`Chunk ${chunk.index} failed after ${this.config.maxRetries} retries`);
        }
      }
    };

    // Upload chunks in parallel but limited by maxParallelUploads
    const uploadPromises: Promise<void>[] = [];
    for (let i = 0; i < chunks.length; i += this.config.maxParallelUploads) {
      const batch = chunks.slice(i, i + this.config.maxParallelUploads);
      const batchPromises = batch.map(chunk => uploadChunk(chunk));
      uploadPromises.push(...batchPromises);
    }

    await Promise.all(uploadPromises);
  }

  private async uploadChunkData(uploadFile: UploadFile, chunk: UploadChunk): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk.data, `${uploadFile.name}.part${chunk.index}`);
    formData.append('chunkIndex', chunk.index.toString());
    formData.append('totalChunks', uploadFile.chunks.length.toString());
    formData.append('fileName', uploadFile.name);
    formData.append('fileSize', uploadFile.size.toString());

    const response = await fetch('/api/upload/chunk', {
      method: 'POST',
      body: formData,
      timeout: this.config.timeout
    });

    if (!response.ok) {
      throw new Error(`Chunk upload failed: ${response.statusText}`);
    }
  }

  private async uploadDirect(uploadFile: UploadFile): Promise<void> {
    const formData = new FormData();
    formData.append('file', uploadFile.file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      timeout: this.config.timeout
    });

    if (!response.ok) {
      throw new Error(`Direct upload failed: ${response.statusText}`);
    }

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      if (uploadFile.progress < 90) {
        uploadFile.progress += Math.random() * 10;
        this.updateProgress(uploadFile.id, uploadFile.progress);
      } else {
        this.updateProgress(uploadFile.id, uploadFile.progress);
      }
    }, 200);

    uploadFile.progress = 100;
    this.updateProgress(uploadFile.id, 100);
  }

  private logProgressEvent(uploadFile: UploadFile, progress: number, speed: number, eta: number): void {
    logInfo('Upload progress', {
      component: 'upload-manager',
      metadata: {
        fileId: uploadFile.id,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        progress: progress,
        speed: speed,
        eta: eta
      }
    });
  }

  private emitGlobalProgress(): void {
    const metrics = this.computeGlobalMetrics();
    this.globalProgressCallbacks.forEach(callback => callback(metrics));
  }

  private computeGlobalMetrics(): UploadMetrics {
    const activeUploads = Array.from(this.activeUploads.values());
    const totalSize = activeUploads.reduce((total, upload) => total + upload.size, 0);
    const totalProgress = activeUploads.reduce((total, upload) => total + (upload.size * upload.progress) / 100, 0);
    const speed = activeUploads.reduce((total, upload) => total + this.calculateUploadSpeed(upload), 0) / activeUploads.length;
    const eta = activeUploads.reduce((total, upload) => total + this.calculateETA(upload, speed), 0) / activeUploads.length;

    return {
      totalSize,
      totalProgress,
      speed,
      eta
    };
  }

  private processUploadQueue(): void {
    if (this.getActiveUploadCount() >= this.config.maxParallelUploads) return;

    const nextFile = this.uploadQueue.shift();
    if (nextFile) {
      nextFile.metadata.startTime = Date.now();
      this.startUpload(nextFile);
    }

    this.emitGlobalProgress();
  }

  private getActiveUploadCount(): number {
    return Array.from(this.activeUploads.values()).filter(upload => upload.status === 'uploading').length;
  }

  private showUploadPreview(uploadFiles: UploadFile[], targetZone: HTMLElement): void {
    const preview = document.createElement('div');
    preview.className = 'upload-preview';

    const previewContent = document.createElement('div');
    previewContent.className = 'upload-preview-content';

    const title = document.createElement('h4');
    title.textContent = 'Upload Preview';

    previewContent.appendChild(title);

    uploadFiles.forEach(file => {
      const uploadItem = document.createElement('div');
      uploadItem.className = 'upload-item';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = file.name;

      const sizeSpan = document.createElement('span');
      sizeSpan.textContent = this.formatBytes(file.size);

      const progressContainer = document.createElement('div');
      progressContainer.className = 'progress-bar';

      const progressFill = document.createElement('div');
      progressFill.className = 'progress-fill';
      progressFill.style.width = `${file.progress}%`;

      progressContainer.appendChild(progressFill);
      uploadItem.appendChild(nameSpan);
      uploadItem.appendChild(sizeSpan);
      uploadItem.appendChild(progressContainer);
      previewContent.appendChild(uploadItem);
    });

    preview.appendChild(previewContent);
    targetZone.appendChild(preview);
  }

  private showError(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'upload-error';
    notification.textContent = message;

    document.body.appendChild(notification);

    logError('Upload error', {
      component: 'upload-manager',
      metadata: { message }
    });

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  private showWarning(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'upload-warning';
    notification.textContent = message;

    document.body.appendChild(notification);

    logWarning('Upload warning', {
      component: 'upload-manager',
      metadata: { message }
    });

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  private onUploadComplete(uploadFile: UploadFile): void {
    console.log('Upload completed:', uploadFile.name);
    logInfo('Upload completed', {
      component: 'upload-manager',
      metadata: {
        fileId: uploadFile.id,
        fileName: uploadFile.name,
        fileSize: uploadFile.size
      }
    });

    // Remove from active uploads
    this.activeUploads.delete(uploadFile.id);

    // Process next in queue
    this.processUploadQueue();
  }

  private onUploadError(uploadFile: UploadFile, error: Error): void {
    console.error('Upload failed:', uploadFile.name, error);
    logError('Upload failed', {
      component: 'upload-manager',
      metadata: {
        fileId: uploadFile.id,
        fileName: uploadFile.name,
        error: error.message
      },
      error
    });

    // Remove from active uploads
    this.activeUploads.delete(uploadFile.id);

    // Process next in queue
    this.processUploadQueue();
    this.emitGlobalProgress();
  }

  private updateProgressDisplays(): void {
    // Update all progress displays
    document.querySelectorAll('[data-upload-progress]').forEach(display => {
      const fileId = display.getAttribute('data-upload-progress');
      if (fileId) {
        const uploadFile = this.activeUploads.get(fileId);
        if (uploadFile) {
          const progressBar = display.querySelector('.progress-fill');
          const progressText = display.querySelector('.progress-text');

          if (progressBar) {
            progressBar.style.width = `${uploadFile.progress}%`;
          }

          if (progressText) {
            progressText.textContent = `${Math.round(uploadFile.progress)}%`;
          }
        }
      }
    });
  }

  public pauseUpload(fileId: string): void {
    const uploadFile = this.activeUploads.get(fileId);
    if (uploadFile) {
      uploadFile.status = 'paused';
    }
    this.emitGlobalProgress();
  }

  public resumeUpload(fileId: string): void {
    const uploadFile = this.activeUploads.get(fileId);
    if (uploadFile && uploadFile.status === 'paused') {
      uploadFile.status = 'uploading';
      this.startUpload(uploadFile);
    }
  }

  public cancelUpload(fileId: string): void {
    const uploadFile = this.activeUploads.get(fileId);
    if (uploadFile) {
      uploadFile.status = 'cancelled';
      this.activeUploads.delete(fileId);
      this.processUploadQueue();
    }
    this.emitGlobalProgress();
  }

  public onProgress(fileId: string, callback: (progress: UploadProgress) => void): void {
    this.progressCallbacks.set(fileId, callback);
    const uploadFile = this.activeUploads.get(fileId);
    if (uploadFile) {
      const speed = this.calculateUploadSpeed(uploadFile);
      const eta = this.calculateETA(uploadFile, speed);
      callback({
        fileId,
        loaded: (uploadFile.size * uploadFile.progress) / 100,
        total: uploadFile.size,
        percentage: uploadFile.progress,
        speed,
        eta,
        status: uploadFile.status
      });
    }
  }

  public onGlobalProgress(callback: (metrics: UploadMetrics) => void): void {
    this.globalProgressCallbacks.add(callback);
    callback(this.computeGlobalMetrics());
  }

  public offGlobalProgress(callback: (metrics: UploadMetrics) => void): void {
    this.globalProgressCallbacks.delete(callback);
  }

  public getUploadStatus(fileId: string): UploadFile | null {
    return this.activeUploads.get(fileId) || null;
  }

  public getAllUploads(): UploadFile[] {
    return Array.from(this.activeUploads.values());
  }

  public getUploadQueue(): UploadFile[] {
    return [...this.uploadQueue];
  }

  public getCompletedUploads(): UploadFile[] {
    return [...this.completedUploads];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  public updateConfig(newConfig: Partial<UploadConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): UploadConfig {
    return { ...this.config };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      activeUploads: this.activeUploads.size,
      queuedUploads: this.uploadQueue.length,
      completedUploads: this.completedUploads.length,
      totalUploaded: this.completedUploads.reduce((sum, upload) => sum + upload.size, 0),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public destroy(): void {
    this.activeUploads.clear();
    this.uploadQueue = [];
    this.completedUploads = [];
    this.progressCallbacks.clear();
    this.globalProgressCallbacks.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('artone:upload-progress', {
        detail: this.computeGlobalMetrics()
      }));
    }
  }

  private computeGlobalMetrics(): UploadMetrics {
    const activeFiles = Array.from(this.activeUploads.values());
    const queuedFiles = this.uploadQueue;
    const completedFiles = this.completedUploads;

    const activeBytes = activeFiles.reduce((sum, file) => sum + file.size, 0);
    const queuedBytes = queuedFiles.reduce((sum, file) => sum + file.size, 0);
    const completedBytes = completedFiles.reduce((sum, file) => sum + file.size, 0);

    const uploadedActiveBytes = activeFiles.reduce((sum, file) => sum + (file.size * file.progress) / 100, 0);
    const uploadedBytes = uploadedActiveBytes + completedBytes;
    const totalBytes = activeBytes + queuedBytes + completedBytes;

    const metrics: UploadMetrics = {
      totalFiles: activeFiles.length + queuedFiles.length + completedFiles.length,
      activeFiles: activeFiles.length,
      queuedFiles: queuedFiles.length,
      completedFiles: completedFiles.length,
      totalBytes,
      uploadedBytes,
      averageProgress: totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0,
      timestamp: Date.now()
    };

    return metrics;
  }

  private emitGlobalProgress(): void {
    const metrics = this.computeGlobalMetrics();

    this.globalProgressCallbacks.forEach((callback) => {
      try {
        callback(metrics);
      } catch (error) {
        logWarning('Global progress callback failed', {
          component: 'upload-manager',
          metadata: { error: (error as Error).message }
        });
      }
    });

    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('artone:upload-progress', {
        detail: metrics
      }));
    }
  }

  private logProgressEvent(uploadFile: UploadFile, progress: number, speed: number, eta: number): void {
    logInfo('Upload progress update', {
      component: 'upload-manager',
      metadata: {
        fileId: uploadFile.id,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        progress,
        speed,
        eta
      }
    });
  }
}

// Global instance
let fileUploadManager: FileUploadManager | null = null;

export function initializeFileUploadManager(): void {
  if (typeof window === 'undefined') return;

  fileUploadManager = new FileUploadManager();
}

export function getFileUploadManager(): FileUploadManager | null {
  return fileUploadManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeFileUploadManager();
}
