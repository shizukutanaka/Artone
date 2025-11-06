/**
 * YouTube Integration Service
 * Provides comprehensive YouTube video metadata extraction and management
 * with compliance to YouTube Terms of Service
 */

import axios from 'axios';
import { sanitizeUrl } from '../security/url-sanitizer';
import { log } from '../utils/production-logger';

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideoMetadata {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnails: {
    default: string;
    medium: string;
    high: string;
    standard?: string;
    maxres?: string;
  };
  duration: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  categoryId: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  caption: boolean;
  contentRating: Record<string, string>;
  definition: 'hd' | 'sd';
  dimension: '2d' | '3d';
  license: 'youtube' | 'creativeCommon';
}

export interface YouTubePlaylistMetadata {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnails: {
    default: string;
    medium: string;
    high: string;
  };
  itemCount: number;
  videos: YouTubeVideoMetadata[];
}

export interface YouTubeSearchResult {
  videos: Array<{
    id: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedAt: string;
  }>;
  nextPageToken?: string;
  totalResults: number;
}

export class YouTubeIntegrationService {
  private apiKey: string;
  private cache: Map<string, { data: any; timestamp: number }>;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey?: string) {
    this.apiKey = apiKey || YOUTUBE_API_KEY;
    this.cache = new Map();

    if (!this.apiKey) {
      log.warn('YouTube API key not configured. Some features will be limited.');
    }
  }

  /**
   * Extract video ID from various YouTube URL formats
   */
  extractVideoId(url: string): string | null {
    const sanitized = sanitizeUrl(url);
    if (!sanitized) return null;

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = sanitized.match(pattern);
      if (match) return match[1];
    }

    // If it's just a video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    return null;
  }

  /**
   * Extract playlist ID from YouTube URL
   */
  extractPlaylistId(url: string): string | null {
    const sanitized = sanitizeUrl(url);
    if (!sanitized) return null;

    const match = sanitized.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get comprehensive video metadata from YouTube API
   */
  async getVideoMetadata(videoIdOrUrl: string): Promise<YouTubeVideoMetadata | null> {
    try {
      const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
      if (!videoId) {
        throw new Error('Invalid YouTube video URL or ID');
      }

      // Check cache
      const cached = this.getFromCache(`video:${videoId}`);
      if (cached) return cached;

      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
        params: {
          key: this.apiKey,
          id: videoId,
          part: 'snippet,contentDetails,statistics,status',
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found');
      }

      const item = response.data.items[0];
      const metadata: YouTubeVideoMetadata = {
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnails: {
          default: item.snippet.thumbnails.default?.url || '',
          medium: item.snippet.thumbnails.medium?.url || '',
          high: item.snippet.thumbnails.high?.url || '',
          standard: item.snippet.thumbnails.standard?.url,
          maxres: item.snippet.thumbnails.maxres?.url,
        },
        duration: item.contentDetails.duration,
        viewCount: parseInt(item.statistics.viewCount || '0', 10),
        likeCount: parseInt(item.statistics.likeCount || '0', 10),
        commentCount: parseInt(item.statistics.commentCount || '0', 10),
        tags: item.snippet.tags || [],
        categoryId: item.snippet.categoryId,
        defaultLanguage: item.snippet.defaultLanguage,
        defaultAudioLanguage: item.snippet.defaultAudioLanguage,
        caption: item.contentDetails.caption === 'true',
        contentRating: item.contentDetails.contentRating || {},
        definition: item.contentDetails.definition,
        dimension: item.contentDetails.dimension,
        license: item.status.license,
      };

      // Cache the result
      this.setCache(`video:${videoId}`, metadata);

      log.info('YouTube video metadata retrieved', { videoId, title: metadata.title });

      return metadata;
    } catch (error) {
      log.error('Failed to get YouTube video metadata', { error, videoIdOrUrl });
      return null;
    }
  }

  /**
   * Get playlist metadata and video list
   */
  async getPlaylistMetadata(playlistIdOrUrl: string): Promise<YouTubePlaylistMetadata | null> {
    try {
      const playlistId = this.extractPlaylistId(playlistIdOrUrl) || playlistIdOrUrl;
      if (!playlistId) {
        throw new Error('Invalid YouTube playlist URL or ID');
      }

      // Check cache
      const cached = this.getFromCache(`playlist:${playlistId}`);
      if (cached) return cached;

      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      // Get playlist details
      const playlistResponse = await axios.get(`${YOUTUBE_API_BASE}/playlists`, {
        params: {
          key: this.apiKey,
          id: playlistId,
          part: 'snippet,contentDetails',
        },
      });

      if (!playlistResponse.data.items || playlistResponse.data.items.length === 0) {
        throw new Error('Playlist not found');
      }

      const playlist = playlistResponse.data.items[0];

      // Get playlist items
      const itemsResponse = await axios.get(`${YOUTUBE_API_BASE}/playlistItems`, {
        params: {
          key: this.apiKey,
          playlistId: playlistId,
          part: 'snippet,contentDetails',
          maxResults: 50,
        },
      });

      // Fetch detailed metadata for each video
      const videoIds = itemsResponse.data.items.map((item: any) => item.contentDetails.videoId);
      const videosMetadata = await Promise.all(
        videoIds.map((id: string) => this.getVideoMetadata(id))
      );

      const metadata: YouTubePlaylistMetadata = {
        id: playlist.id,
        title: playlist.snippet.title,
        description: playlist.snippet.description,
        channelTitle: playlist.snippet.channelTitle,
        publishedAt: playlist.snippet.publishedAt,
        thumbnails: {
          default: playlist.snippet.thumbnails.default?.url || '',
          medium: playlist.snippet.thumbnails.medium?.url || '',
          high: playlist.snippet.thumbnails.high?.url || '',
        },
        itemCount: playlist.contentDetails.itemCount,
        videos: videosMetadata.filter((v): v is YouTubeVideoMetadata => v !== null),
      };

      // Cache the result
      this.setCache(`playlist:${playlistId}`, metadata);

      log.info('YouTube playlist metadata retrieved', { playlistId, videoCount: metadata.videos.length });

      return metadata;
    } catch (error) {
      log.error('Failed to get YouTube playlist metadata', { error, playlistIdOrUrl });
      return null;
    }
  }

  /**
   * Search YouTube videos
   */
  async searchVideos(query: string, options: {
    maxResults?: number;
    pageToken?: string;
    order?: 'date' | 'rating' | 'relevance' | 'title' | 'viewCount';
    videoDuration?: 'any' | 'long' | 'medium' | 'short';
    videoDefinition?: 'any' | 'high' | 'standard';
  } = {}): Promise<YouTubeSearchResult | null> {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
        params: {
          key: this.apiKey,
          q: query,
          part: 'snippet',
          type: 'video',
          maxResults: options.maxResults || 10,
          pageToken: options.pageToken,
          order: options.order || 'relevance',
          videoDuration: options.videoDuration,
          videoDefinition: options.videoDefinition,
        },
      });

      const result: YouTubeSearchResult = {
        videos: response.data.items.map((item: any) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnailUrl: item.snippet.thumbnails.medium?.url || '',
          publishedAt: item.snippet.publishedAt,
        })),
        nextPageToken: response.data.nextPageToken,
        totalResults: response.data.pageInfo.totalResults,
      };

      log.info('YouTube search completed', { query, results: result.videos.length });

      return result;
    } catch (error) {
      log.error('YouTube search failed', { error, query });
      return null;
    }
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  parseDuration(duration: string): number {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]?.replace('H', '') || '0', 10);
    const minutes = parseInt(match[2]?.replace('M', '') || '0', 10);
    const seconds = parseInt(match[3]?.replace('S', '') || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(duration: string): string {
    const totalSeconds = this.parseDuration(duration);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get video embed URL
   */
  getEmbedUrl(videoId: string, options: {
    autoplay?: boolean;
    controls?: boolean;
    start?: number;
    end?: number;
  } = {}): string {
    const params = new URLSearchParams();
    if (options.autoplay) params.append('autoplay', '1');
    if (options.controls === false) params.append('controls', '0');
    if (options.start) params.append('start', options.start.toString());
    if (options.end) params.append('end', options.end.toString());

    const queryString = params.toString();
    return `https://www.youtube.com/embed/${videoId}${queryString ? `?${queryString}` : ''}`;
  }

  /**
   * Validate if video is embeddable
   */
  async isVideoEmbeddable(videoIdOrUrl: string): Promise<boolean> {
    const metadata = await this.getVideoMetadata(videoIdOrUrl);
    return metadata !== null;
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    log.info('YouTube integration cache cleared');
  }

  /**
   * Import YouTube video as a project clip
   * Returns metadata that can be used to create a clip in the video editor
   */
  async importVideoAsClip(videoIdOrUrl: string): Promise<{
    name: string;
    duration: number;
    metadata: YouTubeVideoMetadata;
    thumbnailUrl: string;
    embedUrl: string;
  } | null> {
    const metadata = await this.getVideoMetadata(videoIdOrUrl);
    if (!metadata) return null;

    const duration = this.parseDuration(metadata.duration);
    const embedUrl = this.getEmbedUrl(metadata.id);

    return {
      name: metadata.title,
      duration,
      metadata,
      thumbnailUrl: metadata.thumbnails.high || metadata.thumbnails.medium,
      embedUrl,
    };
  }
}

// Singleton instance
export const youtubeService = new YouTubeIntegrationService();
