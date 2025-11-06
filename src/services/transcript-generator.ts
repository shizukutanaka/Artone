/**
 * Transcript Generator Service
 * Integrates with OpenAI Whisper API and other speech-to-text services
 * for automatic subtitle and transcript generation
 */

import axios from 'axios';
import { log } from '../utils/production-logger';

export interface TranscriptSegment {
  id: string;
  start: number; // seconds
  end: number; // seconds
  text: string;
  confidence?: number;
  speaker?: string;
}

export interface TranscriptResult {
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  duration: number;
}

export interface SubtitleFormat {
  format: 'srt' | 'vtt' | 'ass' | 'json';
  content: string;
}

export class TranscriptGeneratorService {
  private openaiApiKey: string;
  private openaiApiUrl = 'https://api.openai.com/v1/audio';

  constructor(apiKey?: string) {
    this.openaiApiKey = apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';

    if (!this.openaiApiKey) {
      log.warn('OpenAI API key not configured. Transcript generation will be limited.');
    }
  }

  /**
   * Generate transcript using OpenAI Whisper API
   */
  async generateTranscript(
    audioFile: File | Blob,
    options: {
      language?: string;
      prompt?: string;
      temperature?: number;
      format?: 'json' | 'text' | 'srt' | 'vtt';
      timestamps?: boolean;
    } = {}
  ): Promise<TranscriptResult | null> {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Prepare form data
      const formData = new FormData();
      formData.append('file', audioFile, 'audio.mp3');
      formData.append('model', 'whisper-1');

      if (options.language) formData.append('language', options.language);
      if (options.prompt) formData.append('prompt', options.prompt);
      if (options.temperature !== undefined) formData.append('temperature', options.temperature.toString());
      formData.append('response_format', 'verbose_json');

      // Call Whisper API
      const response = await axios.post(`${this.openaiApiUrl}/transcriptions`, formData, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minutes timeout
      });

      // Process response
      const result = response.data;
      const segments: TranscriptSegment[] = result.segments?.map((seg: any, index: number) => ({
        id: `segment-${index}`,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        confidence: seg.confidence,
      })) || [];

      const transcriptResult: TranscriptResult = {
        segments,
        fullText: result.text,
        language: result.language || options.language || 'en',
        duration: result.duration || 0,
      };

      log.info('Transcript generated successfully', {
        language: transcriptResult.language,
        segmentCount: segments.length,
        duration: transcriptResult.duration,
      });

      return transcriptResult;
    } catch (error) {
      log.error('Transcript generation failed', { error });
      return null;
    }
  }

  /**
   * Generate transcript from video URL (extract audio first)
   */
  async generateTranscriptFromVideoUrl(videoUrl: string, options: {
    language?: string;
  } = {}): Promise<TranscriptResult | null> {
    try {
      // Note: This requires server-side implementation to extract audio
      // Client-side video processing is limited due to CORS and resource constraints

      log.warn('Video URL transcript generation requires server-side implementation', { videoUrl });

      // This would typically:
      // 1. Extract audio from video using FFmpeg
      // 2. Convert to supported format (MP3, WAV, etc.)
      // 3. Send to Whisper API
      // 4. Return transcript

      return null;
    } catch (error) {
      log.error('Failed to generate transcript from video URL', { error, videoUrl });
      return null;
    }
  }

  /**
   * Convert transcript to SRT format
   */
  convertToSRT(transcript: TranscriptResult): string {
    let srt = '';

    transcript.segments.forEach((segment, index) => {
      const startTime = this.formatSRTTimestamp(segment.start);
      const endTime = this.formatSRTTimestamp(segment.end);

      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${segment.text}\n\n`;
    });

    return srt;
  }

  /**
   * Convert transcript to WebVTT format
   */
  convertToVTT(transcript: TranscriptResult): string {
    let vtt = 'WEBVTT\n\n';

    transcript.segments.forEach((segment, index) => {
      const startTime = this.formatVTTTimestamp(segment.start);
      const endTime = this.formatVTTTimestamp(segment.end);

      vtt += `${index + 1}\n`;
      vtt += `${startTime} --> ${endTime}\n`;
      vtt += `${segment.text}\n\n`;
    });

    return vtt;
  }

  /**
   * Convert transcript to ASS format (Advanced SubStation Alpha)
   */
  convertToASS(transcript: TranscriptResult, options: {
    fontName?: string;
    fontSize?: number;
    primaryColor?: string;
  } = {}): string {
    const fontName = options.fontName || 'Arial';
    const fontSize = options.fontSize || 20;
    const primaryColor = options.primaryColor || '&H00FFFFFF';

    let ass = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    transcript.segments.forEach((segment) => {
      const startTime = this.formatASSTimestamp(segment.start);
      const endTime = this.formatASSTimestamp(segment.end);

      ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${segment.text}\n`;
    });

    return ass;
  }

  /**
   * Format timestamp for SRT (00:00:00,000)
   */
  private formatSRTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Format timestamp for VTT (00:00:00.000)
   */
  private formatVTTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Format timestamp for ASS (0:00:00.00)
   */
  private formatASSTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100);

    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
  }

  /**
   * Export transcript in specified format
   */
  exportTranscript(transcript: TranscriptResult, format: SubtitleFormat['format']): SubtitleFormat {
    let content: string;

    switch (format) {
      case 'srt':
        content = this.convertToSRT(transcript);
        break;
      case 'vtt':
        content = this.convertToVTT(transcript);
        break;
      case 'ass':
        content = this.convertToASS(transcript);
        break;
      case 'json':
        content = JSON.stringify(transcript, null, 2);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return { format, content };
  }

  /**
   * Download transcript as file
   */
  downloadTranscript(transcript: TranscriptResult, filename: string, format: SubtitleFormat['format']): void {
    const { content } = this.exportTranscript(transcript, format);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log.info('Transcript downloaded', { filename, format });
  }

  /**
   * Translate transcript to another language
   */
  async translateTranscript(
    transcript: TranscriptResult,
    targetLanguage: string
  ): Promise<TranscriptResult | null> {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Use GPT for translation (preserving timestamps)
      const translatedSegments = await Promise.all(
        transcript.segments.map(async (segment) => {
          const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: `Translate the following text to ${targetLanguage}. Preserve the meaning and tone.`,
                },
                {
                  role: 'user',
                  content: segment.text,
                },
              ],
              temperature: 0.3,
            },
            {
              headers: {
                'Authorization': `Bearer ${this.openaiApiKey}`,
                'Content-Type': 'application/json',
              },
            }
          );

          return {
            ...segment,
            text: response.data.choices[0].message.content,
          };
        })
      );

      const translatedResult: TranscriptResult = {
        ...transcript,
        segments: translatedSegments,
        fullText: translatedSegments.map(s => s.text).join(' '),
        language: targetLanguage,
      };

      log.info('Transcript translated', { fromLanguage: transcript.language, toLanguage: targetLanguage });

      return translatedResult;
    } catch (error) {
      log.error('Transcript translation failed', { error, targetLanguage });
      return null;
    }
  }

  /**
   * Merge multiple transcripts (for multi-audio tracks)
   */
  mergeTranscripts(transcripts: TranscriptResult[]): TranscriptResult {
    const allSegments = transcripts.flatMap(t => t.segments);
    allSegments.sort((a, b) => a.start - b.start);

    return {
      segments: allSegments,
      fullText: allSegments.map(s => s.text).join(' '),
      language: transcripts[0]?.language || 'en',
      duration: Math.max(...transcripts.map(t => t.duration), 0),
    };
  }

  /**
   * Search transcript for specific text
   */
  searchTranscript(transcript: TranscriptResult, query: string): TranscriptSegment[] {
    const lowerQuery = query.toLowerCase();
    return transcript.segments.filter(segment =>
      segment.text.toLowerCase().includes(lowerQuery)
    );
  }
}

// Singleton instance
export const transcriptService = new TranscriptGeneratorService();
