/**
 * Automatic Video Chapter Detection Service
 * Uses AI and transcript analysis to detect natural chapter breaks
 */

import type { TranscriptResult, TranscriptSegment } from './transcript-generator';
import type { YouTubeVideoMetadata } from './youtube-integration';
import { aiAnalyzerService } from './ai-content-analyzer';
import { log } from '../utils/production-logger';

export interface VideoChapter {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  description: string;
  keywords: string[];
  thumbnail?: string;
}

export class ChapterDetectorService {
  /**
   * Detect chapters from transcript
   */
  async detectChaptersFromTranscript(
    transcript: TranscriptResult,
    metadata: YouTubeVideoMetadata
  ): Promise<VideoChapter[]> {
    try {
      // Analyze transcript for topic changes
      const segments = transcript.segments;
      const chapters: VideoChapter[] = [];

      // Group segments into chunks (every 30 seconds or semantic break)
      const chunks = this.groupSegmentsIntoChunks(segments);

      // Analyze each chunk for topic
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkText = chunk.map(s => s.text).join(' ');

        // Use AI to generate chapter title
        const title = await this.generateChapterTitle(chunkText, i);

        chapters.push({
          id: `chapter-${i}`,
          startTime: chunk[0].start,
          endTime: chunk[chunk.length - 1].end,
          title,
          description: chunkText.substring(0, 200),
          keywords: this.extractKeywords(chunkText),
        });
      }

      log.info('Chapters detected', { videoId: metadata.id, chapterCount: chapters.length });

      return chapters;
    } catch (error) {
      log.error('Chapter detection failed', { error });
      return [];
    }
  }

  /**
   * Detect chapters from description timestamps
   */
  detectChaptersFromDescription(description: string, duration: number): VideoChapter[] {
    const chapters: VideoChapter[] = [];

    // Match timestamp patterns: 0:00, 1:23, 12:34:56
    const timestampRegex = /(\d{1,2}:)?(\d{1,2}):(\d{2})\s*-?\s*([^\n]+)/g;
    let match;

    while ((match = timestampRegex.exec(description)) !== null) {
      const hours = match[1] ? parseInt(match[1].replace(':', '')) : 0;
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      const title = match[4].trim();

      const startTime = hours * 3600 + minutes * 60 + seconds;

      chapters.push({
        id: `chapter-${chapters.length}`,
        startTime,
        endTime: duration, // Will be adjusted
        title,
        description: '',
        keywords: [],
      });
    }

    // Adjust end times
    for (let i = 0; i < chapters.length - 1; i++) {
      chapters[i].endTime = chapters[i + 1].startTime;
    }

    log.info('Chapters detected from description', { chapterCount: chapters.length });

    return chapters;
  }

  /**
   * Generate chapter markers
   */
  async generateChapterMarkers(
    metadata: YouTubeVideoMetadata,
    transcript?: TranscriptResult
  ): Promise<VideoChapter[]> {
    // Try description first
    const descriptionChapters = this.detectChaptersFromDescription(
      metadata.description,
      metadata.duration ? this.parseDuration(metadata.duration) : 0
    );

    if (descriptionChapters.length > 0) {
      return descriptionChapters;
    }

    // Fall back to transcript analysis
    if (transcript) {
      return await this.detectChaptersFromTranscript(transcript, metadata);
    }

    return [];
  }

  /**
   * Export chapters in YouTube format
   */
  exportChaptersForYouTube(chapters: VideoChapter[]): string {
    return chapters
      .map(chapter => {
        const timestamp = this.formatTimestamp(chapter.startTime);
        return `${timestamp} ${chapter.title}`;
      })
      .join('\n');
  }

  /**
   * Export chapters in VTT format (for video players)
   */
  exportChaptersAsVTT(chapters: VideoChapter[]): string {
    let vtt = 'WEBVTT\n\n';

    chapters.forEach((chapter, index) => {
      const start = this.formatVTTTimestamp(chapter.startTime);
      const end = this.formatVTTTimestamp(chapter.endTime);

      vtt += `CHAPTER ${index + 1}\n`;
      vtt += `${start} --> ${end}\n`;
      vtt += `${chapter.title}\n\n`;
    });

    return vtt;
  }

  /**
   * Helper methods
   */

  private groupSegmentsIntoChunks(segments: TranscriptSegment[], chunkDuration = 30): TranscriptSegment[][] {
    const chunks: TranscriptSegment[][] = [];
    let currentChunk: TranscriptSegment[] = [];
    let chunkStartTime = 0;

    segments.forEach(segment => {
      if (segment.start - chunkStartTime >= chunkDuration && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [segment];
        chunkStartTime = segment.start;
      } else {
        currentChunk.push(segment);
      }
    });

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async generateChapterTitle(text: string, index: number): Promise<string> {
    try {
      // Use AI to generate concise chapter title
      const analysis = await aiAnalyzerService.analyzeText(text);
      return analysis.topics[0] || `Chapter ${index + 1}`;
    } catch {
      return `Chapter ${index + 1}`;
    }
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction (can be enhanced with NLP)
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const frequency: Record<string, number> = {};

    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]?.replace('H', '') || '0');
    const minutes = parseInt(match[2]?.replace('M', '') || '0');
    const seconds = parseInt(match[3]?.replace('S', '') || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private formatVTTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
}

export const chapterDetector = new ChapterDetectorService();
