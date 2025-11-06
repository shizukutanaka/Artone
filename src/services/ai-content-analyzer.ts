/**
 * AI-Powered Content Analyzer Service
 * Uses TensorFlow.js and OpenAI APIs for intelligent video and research content analysis
 */

import * as tf from '@tensorflow/tfjs';
import axios from 'axios';
import { log } from '../utils/production-logger';
import type { ResearchPaper } from './research-integration';
import type { YouTubeVideoMetadata } from './youtube-integration';
import type { TranscriptResult } from './transcript-generator';

export interface ContentAnalysisResult {
  summary: string;
  keywords: string[];
  topics: string[];
  sentiment: {
    score: number; // -1 to 1
    label: 'negative' | 'neutral' | 'positive';
  };
  categories: Array<{
    name: string;
    confidence: number;
  }>;
  entities: Array<{
    text: string;
    type: 'person' | 'organization' | 'location' | 'concept' | 'other';
    relevance: number;
  }>;
  relatedContent: string[];
}

export interface VideoSceneAnalysis {
  timestamp: number;
  duration: number;
  description: string;
  objects: Array<{
    label: string;
    confidence: number;
  }>;
  actions: string[];
  emotions: Array<{
    emotion: string;
    confidence: number;
  }>;
}

export interface ResearchContentAnalysis {
  paper: ResearchPaper;
  analysis: ContentAnalysisResult;
  methodology: string[];
  contributions: string[];
  limitations: string[];
  futureWork: string[];
  citationContext: string[];
}

export class AIContentAnalyzerService {
  private openaiApiKey: string;
  private model: tf.LayersModel | null = null;
  private modelLoaded = false;

  constructor(apiKey?: string) {
    this.openaiApiKey = apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';

    if (!this.openaiApiKey) {
      log.warn('OpenAI API key not configured. Advanced AI features will be limited.');
    }
  }

  /**
   * Initialize TensorFlow.js models
   */
  async initializeModels(): Promise<void> {
    try {
      if (this.modelLoaded) return;

      // Set TensorFlow.js backend
      await tf.ready();
      await tf.setBackend('webgl');

      log.info('TensorFlow.js initialized', {
        backend: tf.getBackend(),
        version: tf.version.tfjs,
      });

      this.modelLoaded = true;
    } catch (error) {
      log.error('Failed to initialize TensorFlow.js models', { error });
    }
  }

  /**
   * Analyze YouTube video content using AI
   */
  async analyzeYouTubeVideo(metadata: YouTubeVideoMetadata, transcript?: TranscriptResult): Promise<ContentAnalysisResult> {
    try {
      const textContent = [
        metadata.title,
        metadata.description,
        ...metadata.tags,
        transcript?.fullText || '',
      ].join(' ');

      return await this.analyzeText(textContent);
    } catch (error) {
      log.error('YouTube video analysis failed', { error, videoId: metadata.id });
      throw error;
    }
  }

  /**
   * Analyze research paper content
   */
  async analyzeResearchPaper(paper: ResearchPaper): Promise<ResearchContentAnalysis> {
    try {
      const textContent = `${paper.title} ${paper.abstract}`;
      const analysis = await this.analyzeText(textContent);

      // Extract methodology, contributions, etc. using GPT
      const structuredAnalysis = await this.extractResearchStructure(paper);

      return {
        paper,
        analysis,
        ...structuredAnalysis,
      };
    } catch (error) {
      log.error('Research paper analysis failed', { error, paperId: paper.id });
      throw error;
    }
  }

  /**
   * General text analysis using OpenAI GPT
   */
  async analyzeText(text: string): Promise<ContentAnalysisResult> {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are an advanced content analyzer. Analyze the given text and provide a structured JSON response with the following fields:
- summary: A concise 2-3 sentence summary
- keywords: Array of 5-10 most important keywords
- topics: Array of 3-5 main topics
- sentiment: Object with score (-1 to 1) and label (negative/neutral/positive)
- categories: Array of category objects with name and confidence (0-1)
- entities: Array of entity objects with text, type, and relevance (0-1)
- relatedContent: Array of 3-5 related search queries or content suggestions`,
            },
            {
              role: 'user',
              content: `Analyze this content:\n\n${text.substring(0, 4000)}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);

      log.info('Content analysis completed', {
        keywordCount: result.keywords?.length,
        topicCount: result.topics?.length,
      });

      return result;
    } catch (error) {
      log.error('Text analysis failed', { error });
      throw error;
    }
  }

  /**
   * Extract structured information from research papers
   */
  async extractResearchStructure(paper: ResearchPaper): Promise<{
    methodology: string[];
    contributions: string[];
    limitations: string[];
    futureWork: string[];
    citationContext: string[];
  }> {
    try {
      if (!this.openaiApiKey) {
        return {
          methodology: [],
          contributions: [],
          limitations: [],
          futureWork: [],
          citationContext: [],
        };
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `Extract structured information from a research paper. Return JSON with:
- methodology: Array of methodology approaches
- contributions: Array of key contributions
- limitations: Array of limitations
- futureWork: Array of future work suggestions
- citationContext: Array of contexts where this paper might be cited`,
            },
            {
              role: 'user',
              content: `Title: ${paper.title}\n\nAbstract: ${paper.abstract}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      log.error('Research structure extraction failed', { error });
      return {
        methodology: [],
        contributions: [],
        limitations: [],
        futureWork: [],
        citationContext: [],
      };
    }
  }

  /**
   * Analyze video scenes using computer vision (TensorFlow.js)
   */
  async analyzeVideoScenes(videoElement: HTMLVideoElement): Promise<VideoSceneAnalysis[]> {
    try {
      await this.initializeModels();

      const scenes: VideoSceneAnalysis[] = [];
      const duration = videoElement.duration;
      const interval = 5; // Analyze every 5 seconds

      for (let time = 0; time < duration; time += interval) {
        videoElement.currentTime = time;

        // Wait for video to seek
        await new Promise(resolve => {
          videoElement.onseeked = resolve;
        });

        // Capture frame and analyze
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoElement, 0, 0);

        // Convert to tensor
        const tensor = tf.browser.fromPixels(canvas);
        const resized = tf.image.resizeBilinear(tensor, [224, 224]);
        const normalized = resized.div(255.0);

        // Note: Object detection would require a pre-trained model like COCO-SSD
        // For now, we'll provide a placeholder structure

        scenes.push({
          timestamp: time,
          duration: interval,
          description: `Scene at ${time}s`,
          objects: [],
          actions: [],
          emotions: [],
        });

        // Cleanup tensors
        tensor.dispose();
        resized.dispose();
        normalized.dispose();
      }

      log.info('Video scene analysis completed', { sceneCount: scenes.length });

      return scenes;
    } catch (error) {
      log.error('Video scene analysis failed', { error });
      return [];
    }
  }

  /**
   * Generate intelligent video summary
   */
  async generateVideoSummary(
    metadata: YouTubeVideoMetadata,
    transcript?: TranscriptResult,
    scenes?: VideoSceneAnalysis[]
  ): Promise<string> {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const contextParts = [
        `Title: ${metadata.title}`,
        `Description: ${metadata.description}`,
        transcript ? `Transcript: ${transcript.fullText.substring(0, 2000)}` : '',
        scenes ? `Scenes analyzed: ${scenes.length}` : '',
      ].filter(Boolean);

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Create a comprehensive yet concise summary (3-5 paragraphs) of this video content.',
            },
            {
              role: 'user',
              content: contextParts.join('\n\n'),
            },
          ],
          temperature: 0.5,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      log.error('Video summary generation failed', { error });
      return '';
    }
  }

  /**
   * Compare multiple research papers
   */
  async compareResearchPapers(papers: ResearchPaper[]): Promise<{
    commonTopics: string[];
    differences: string[];
    timeline: Array<{ year: number; paper: ResearchPaper }>;
    citationNetwork: Array<{ from: string; to: string; strength: number }>;
  }> {
    try {
      if (papers.length < 2) {
        throw new Error('At least 2 papers required for comparison');
      }

      // Sort by year
      const timeline = papers
        .map(paper => ({ year: paper.year, paper }))
        .sort((a, b) => a.year - b.year);

      // Extract common topics using AI
      const commonTopics = await this.findCommonTopics(papers);

      // Analyze differences
      const differences = await this.analyzeDifferences(papers);

      return {
        commonTopics,
        differences,
        timeline,
        citationNetwork: [],
      };
    } catch (error) {
      log.error('Research paper comparison failed', { error });
      throw error;
    }
  }

  /**
   * Find common topics across multiple papers
   */
  private async findCommonTopics(papers: ResearchPaper[]): Promise<string[]> {
    try {
      if (!this.openaiApiKey) return [];

      const papersSummary = papers.map(p => `${p.title}: ${p.abstract.substring(0, 200)}`).join('\n\n');

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Identify 5-10 common topics across these research papers. Return as JSON array of strings.',
            },
            {
              role: 'user',
              content: papersSummary,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return result.topics || [];
    } catch (error) {
      log.error('Common topics extraction failed', { error });
      return [];
    }
  }

  /**
   * Analyze differences between papers
   */
  private async analyzeDifferences(papers: ResearchPaper[]): Promise<string[]> {
    try {
      if (!this.openaiApiKey) return [];

      const papersSummary = papers.map((p, i) => `Paper ${i + 1} - ${p.title}: ${p.abstract.substring(0, 200)}`).join('\n\n');

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Identify 3-5 key differences in approach, methodology, or findings across these papers. Return as JSON array of strings.',
            },
            {
              role: 'user',
              content: papersSummary,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return result.differences || [];
    } catch (error) {
      log.error('Differences analysis failed', { error });
      return [];
    }
  }

  /**
   * Generate content recommendations based on user interests
   */
  async generateRecommendations(
    userInterests: string[],
    viewedContent: Array<YouTubeVideoMetadata | ResearchPaper>
  ): Promise<string[]> {
    try {
      if (!this.openaiApiKey) return [];

      const context = {
        interests: userInterests,
        recentlyViewed: viewedContent.map(c => 'title' in c ? c.title : (c as any).title),
      };

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Generate 5-10 personalized content recommendations (topics, keywords, or search queries) based on user interests and viewing history. Return as JSON array of strings.',
            },
            {
              role: 'user',
              content: JSON.stringify(context),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return result.recommendations || [];
    } catch (error) {
      log.error('Recommendation generation failed', { error });
      return [];
    }
  }
}

// Singleton instance
export const aiAnalyzerService = new AIContentAnalyzerService();
