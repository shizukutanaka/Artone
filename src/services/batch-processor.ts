/**
 * Batch Processing Service
 * Handles batch operations for videos, transcripts, and content analysis
 */

import { youtubeService } from './youtube-integration';
import { transcriptService } from './transcript-generator';
import { aiAnalyzerService } from './ai-content-analyzer';
import { researchService } from './research-integration';
import { log } from '../utils/production-logger';

export interface BatchJob {
  id: string;
  type: 'youtube_import' | 'transcript_generation' | 'content_analysis' | 'research_search';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  items: BatchJobItem[];
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface BatchJobItem {
  id: string;
  input: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export class BatchProcessorService {
  private jobs: Map<string, BatchJob>;
  private maxConcurrent = 3;
  private activeJobs = 0;
  private queue: BatchJob[] = [];

  constructor() {
    this.jobs = new Map();
  }

  /**
   * Create a new batch job
   */
  createJob(type: BatchJob['type'], inputs: any[]): BatchJob {
    const job: BatchJob = {
      id: this.generateJobId(),
      type,
      status: 'pending',
      progress: 0,
      items: inputs.map(input => ({
        id: this.generateJobId(),
        input,
        status: 'pending',
      })),
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.processQueue();

    log.info('Batch job created', { jobId: job.id, type, itemCount: inputs.length });

    return job;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): BatchJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') return false;

    job.status = 'failed';
    job.error = 'Cancelled by user';
    this.queue = this.queue.filter(j => j.id !== jobId);

    log.info('Batch job cancelled', { jobId });

    return true;
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) continue;

      this.activeJobs++;
      job.status = 'processing';

      try {
        await this.processJob(job);
        job.status = 'completed';
        job.completedAt = new Date();
        job.progress = 100;
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        log.error('Batch job failed', { jobId: job.id, error });
      } finally {
        this.activeJobs--;
        this.processQueue(); // Process next job
      }
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: BatchJob): Promise<void> {
    const totalItems = job.items.length;

    for (let i = 0; i < totalItems; i++) {
      const item = job.items[i];
      item.status = 'processing';

      try {
        switch (job.type) {
          case 'youtube_import':
            item.result = await youtubeService.importVideoAsClip(item.input);
            break;

          case 'transcript_generation':
            item.result = await transcriptService.generateTranscript(item.input);
            break;

          case 'content_analysis':
            item.result = await aiAnalyzerService.analyzeText(item.input);
            break;

          case 'research_search':
            item.result = await researchService.searchSemanticScholar(item.input);
            break;
        }

        item.status = 'completed';
      } catch (error) {
        item.status = 'failed';
        item.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Update progress
      job.progress = Math.floor(((i + 1) / totalItems) * 100);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Batch import YouTube videos
   */
  async batchImportYouTubeVideos(urls: string[]): Promise<BatchJob> {
    return this.createJob('youtube_import', urls);
  }

  /**
   * Batch generate transcripts
   */
  async batchGenerateTranscripts(audioFiles: Blob[]): Promise<BatchJob> {
    return this.createJob('transcript_generation', audioFiles);
  }

  /**
   * Batch analyze content
   */
  async batchAnalyzeContent(texts: string[]): Promise<BatchJob> {
    return this.createJob('content_analysis', texts);
  }

  /**
   * Batch search research papers
   */
  async batchSearchResearch(queries: string[]): Promise<BatchJob> {
    return this.createJob('research_search', queries);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Clear completed jobs
   */
  clearCompletedJobs(): void {
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.jobs.delete(id);
      }
    }
  }

  private generateJobId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const batchProcessor = new BatchProcessorService();
