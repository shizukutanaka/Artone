/**
 * Advanced YouTube Analytics Service
 * Provides deep insights, trend analysis, and channel analytics
 */

import axios from 'axios';
import { youtubeService, type YouTubeVideoMetadata } from './youtube-integration';
import { log } from '../utils/production-logger';

export interface YouTubeChannelAnalytics {
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  averageViews: number;
  engagementRate: number;
  uploadFrequency: string;
  topVideos: YouTubeVideoMetadata[];
  contentCategories: Array<{
    category: string;
    percentage: number;
  }>;
  growthTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface VideoPerformanceMetrics {
  video: YouTubeVideoMetadata;
  viewsPerDay: number;
  engagementScore: number; // 0-100
  viralityIndex: number; // 0-10
  retentionEstimate: number; // 0-100%
  competitorComparison: {
    aboveAverage: boolean;
    percentile: number;
  };
  predictedGrowth: {
    next7Days: number;
    next30Days: number;
  };
  audienceInsights: {
    likeRatio: number;
    commentEngagement: number;
    shareabilityScore: number;
  };
}

export interface TrendAnalysis {
  keyword: string;
  trendScore: number; // 0-100
  relatedKeywords: string[];
  topChannels: string[];
  averageViews: number;
  competitionLevel: 'low' | 'medium' | 'high';
  growthRate: number;
  bestPostingTime: string;
  recommendedTags: string[];
}

export interface ContentGapAnalysis {
  topic: string;
  searchVolume: number;
  competitionLevel: number;
  opportunityScore: number; // 0-100
  suggestedKeywords: string[];
  targetAudience: string;
  contentFormat: string;
  estimatedViews: number;
}

export class YouTubeAnalyticsService {
  private apiKey: string;
  private cache: Map<string, { data: any; timestamp: number }>;
  private cacheTimeout = 15 * 60 * 1000; // 15 minutes

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
    this.cache = new Map();
  }

  /**
   * Get comprehensive channel analytics
   */
  async getChannelAnalytics(channelId: string): Promise<YouTubeChannelAnalytics | null> {
    try {
      const cacheKey = `channel:${channelId}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      // Get channel details
      const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
          key: this.apiKey,
          id: channelId,
          part: 'snippet,statistics,contentDetails',
        },
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error('Channel not found');
      }

      const channel = channelResponse.data.items[0];

      // Get recent videos for analysis
      const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
      const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: {
          key: this.apiKey,
          playlistId: uploadsPlaylistId,
          part: 'snippet',
          maxResults: 50,
        },
      });

      const videoIds = videosResponse.data.items.map((item: any) => item.snippet.resourceId.videoId);

      // Get detailed video statistics
      const videoDetailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          key: this.apiKey,
          id: videoIds.join(','),
          part: 'statistics,snippet,contentDetails',
        },
      });

      const videos = videoDetailsResponse.data.items;

      // Calculate analytics
      const totalViews = videos.reduce((sum: number, v: any) => sum + parseInt(v.statistics.viewCount || '0'), 0);
      const averageViews = totalViews / videos.length;

      const totalEngagement = videos.reduce((sum: number, v: any) => {
        const views = parseInt(v.statistics.viewCount || '0');
        const likes = parseInt(v.statistics.likeCount || '0');
        const comments = parseInt(v.statistics.commentCount || '0');
        return sum + (views > 0 ? ((likes + comments) / views) * 100 : 0);
      }, 0);
      const engagementRate = totalEngagement / videos.length;

      // Categorize content
      const categories = this.categorizeVideos(videos);

      // Determine growth trend
      const growthTrend = this.analyzeGrowthTrend(videos);

      const analytics: YouTubeChannelAnalytics = {
        channelId: channel.id,
        channelTitle: channel.snippet.title,
        subscriberCount: parseInt(channel.statistics.subscriberCount || '0'),
        viewCount: parseInt(channel.statistics.viewCount || '0'),
        videoCount: parseInt(channel.statistics.videoCount || '0'),
        averageViews,
        engagementRate,
        uploadFrequency: this.calculateUploadFrequency(videos),
        topVideos: videos.slice(0, 10).map((v: any) => this.convertToVideoMetadata(v)),
        contentCategories: categories,
        growthTrend,
      };

      this.setCache(cacheKey, analytics);
      log.info('Channel analytics retrieved', { channelId, videoCount: videos.length });

      return analytics;
    } catch (error) {
      log.error('Failed to get channel analytics', { error, channelId });
      return null;
    }
  }

  /**
   * Analyze video performance metrics
   */
  async analyzeVideoPerformance(videoId: string): Promise<VideoPerformanceMetrics | null> {
    try {
      const metadata = await youtubeService.getVideoMetadata(videoId);
      if (!metadata) return null;

      const publishDate = new Date(metadata.publishedAt);
      const now = new Date();
      const daysSincePublish = Math.max(1, Math.floor((now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24)));

      const viewsPerDay = metadata.viewCount / daysSincePublish;

      // Calculate engagement score
      const totalInteractions = metadata.likeCount + metadata.commentCount;
      const engagementRate = (totalInteractions / metadata.viewCount) * 100;
      const engagementScore = Math.min(100, engagementRate * 20);

      // Calculate virality index (0-10)
      const viralityIndex = this.calculateViralityIndex(metadata, viewsPerDay);

      // Estimate retention (based on engagement patterns)
      const retentionEstimate = this.estimateRetention(metadata);

      // Predict growth
      const predictedGrowth = this.predictVideoGrowth(metadata, viewsPerDay, daysSincePublish);

      const metrics: VideoPerformanceMetrics = {
        video: metadata,
        viewsPerDay,
        engagementScore,
        viralityIndex,
        retentionEstimate,
        competitorComparison: {
          aboveAverage: viewsPerDay > 1000, // Simplified comparison
          percentile: this.calculatePercentile(viewsPerDay),
        },
        predictedGrowth,
        audienceInsights: {
          likeRatio: metadata.viewCount > 0 ? (metadata.likeCount / metadata.viewCount) * 100 : 0,
          commentEngagement: metadata.viewCount > 0 ? (metadata.commentCount / metadata.viewCount) * 100 : 0,
          shareabilityScore: this.calculateShareabilityScore(metadata),
        },
      };

      log.info('Video performance analyzed', { videoId, engagementScore, viralityIndex });

      return metrics;
    } catch (error) {
      log.error('Failed to analyze video performance', { error, videoId });
      return null;
    }
  }

  /**
   * Analyze trending topics and keywords
   */
  async analyzeTrends(keyword: string): Promise<TrendAnalysis | null> {
    try {
      const searchResults = await youtubeService.searchVideos(keyword, {
        maxResults: 50,
        order: 'date',
      });

      if (!searchResults || searchResults.videos.length === 0) {
        return null;
      }

      // Analyze video metadata for trends
      const videoIds = searchResults.videos.map(v => v.id);
      const detailedVideos = await Promise.all(
        videoIds.slice(0, 20).map(id => youtubeService.getVideoMetadata(id))
      );

      const validVideos = detailedVideos.filter(v => v !== null) as YouTubeVideoMetadata[];

      // Extract related keywords from tags
      const allTags = validVideos.flatMap(v => v.tags);
      const tagFrequency = this.calculateFrequency(allTags);
      const relatedKeywords = Object.entries(tagFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);

      // Calculate average views
      const totalViews = validVideos.reduce((sum, v) => sum + v.viewCount, 0);
      const averageViews = totalViews / validVideos.length;

      // Extract top channels
      const channelFrequency = this.calculateFrequency(validVideos.map(v => v.channelTitle));
      const topChannels = Object.entries(channelFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([channel]) => channel);

      // Calculate trend score (simplified)
      const recentVideos = validVideos.filter(v => {
        const publishDate = new Date(v.publishedAt);
        const daysSince = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      });
      const trendScore = Math.min(100, (recentVideos.length / validVideos.length) * 100 * 2);

      // Determine competition level
      const competitionLevel = searchResults.totalResults > 10000 ? 'high' :
                                searchResults.totalResults > 1000 ? 'medium' : 'low';

      const analysis: TrendAnalysis = {
        keyword,
        trendScore,
        relatedKeywords,
        topChannels,
        averageViews,
        competitionLevel,
        growthRate: this.calculateGrowthRate(validVideos),
        bestPostingTime: this.determineBestPostingTime(validVideos),
        recommendedTags: relatedKeywords.slice(0, 5),
      };

      log.info('Trend analysis completed', { keyword, trendScore, competitionLevel });

      return analysis;
    } catch (error) {
      log.error('Failed to analyze trends', { error, keyword });
      return null;
    }
  }

  /**
   * Identify content gaps and opportunities
   */
  async identifyContentGaps(niche: string): Promise<ContentGapAnalysis[]> {
    try {
      const baseSearchResults = await youtubeService.searchVideos(niche, { maxResults: 50 });
      if (!baseSearchResults) return [];

      // Generate related queries
      const relatedQueries = this.generateRelatedQueries(niche);

      const gaps: ContentGapAnalysis[] = [];

      for (const query of relatedQueries) {
        const results = await youtubeService.searchVideos(query, { maxResults: 10 });
        if (!results) continue;

        const videoIds = results.videos.slice(0, 10).map(v => v.id);
        const videos = await Promise.all(
          videoIds.map(id => youtubeService.getVideoMetadata(id))
        );

        const validVideos = videos.filter(v => v !== null) as YouTubeVideoMetadata[];

        if (validVideos.length < 5) {
          // Low competition - potential gap
          const averageViews = validVideos.length > 0
            ? validVideos.reduce((sum, v) => sum + v.viewCount, 0) / validVideos.length
            : 0;

          const opportunityScore = this.calculateOpportunityScore(
            results.totalResults,
            averageViews,
            validVideos.length
          );

          if (opportunityScore > 50) {
            gaps.push({
              topic: query,
              searchVolume: results.totalResults,
              competitionLevel: validVideos.length,
              opportunityScore,
              suggestedKeywords: this.extractKeywords(query),
              targetAudience: niche,
              contentFormat: this.suggestContentFormat(query),
              estimatedViews: Math.floor(averageViews * 0.7),
            });
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Sort by opportunity score
      gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);

      log.info('Content gap analysis completed', { niche, gapsFound: gaps.length });

      return gaps.slice(0, 10);
    } catch (error) {
      log.error('Failed to identify content gaps', { error, niche });
      return [];
    }
  }

  /**
   * Compare multiple videos or channels
   */
  async compareVideos(videoIds: string[]): Promise<{
    summary: string;
    bestPerforming: YouTubeVideoMetadata;
    averageMetrics: {
      views: number;
      engagement: number;
      duration: number;
    };
    recommendations: string[];
  } | null> {
    try {
      const videos = await Promise.all(
        videoIds.map(id => youtubeService.getVideoMetadata(id))
      );

      const validVideos = videos.filter(v => v !== null) as YouTubeVideoMetadata[];

      if (validVideos.length === 0) return null;

      // Find best performing
      const bestPerforming = validVideos.reduce((best, current) =>
        current.viewCount > best.viewCount ? current : best
      );

      // Calculate averages
      const totalViews = validVideos.reduce((sum, v) => sum + v.viewCount, 0);
      const totalEngagement = validVideos.reduce((sum, v) =>
        sum + v.likeCount + v.commentCount, 0
      );
      const totalDuration = validVideos.reduce((sum, v) =>
        sum + youtubeService.parseDuration(v.duration), 0
      );

      const averageMetrics = {
        views: totalViews / validVideos.length,
        engagement: totalEngagement / validVideos.length,
        duration: totalDuration / validVideos.length,
      };

      // Generate recommendations
      const recommendations = this.generateRecommendations(validVideos, bestPerforming);

      const summary = `Analyzed ${validVideos.length} videos. Best performing video has ${bestPerforming.viewCount.toLocaleString()} views. Average engagement is ${averageMetrics.engagement.toFixed(0)} interactions per video.`;

      log.info('Video comparison completed', { videoCount: validVideos.length });

      return {
        summary,
        bestPerforming,
        averageMetrics,
        recommendations,
      };
    } catch (error) {
      log.error('Failed to compare videos', { error });
      return null;
    }
  }

  /**
   * Helper methods
   */

  private categorizeVideos(videos: any[]): Array<{ category: string; percentage: number }> {
    const categoryCount: Record<string, number> = {};

    videos.forEach(video => {
      const category = video.snippet.categoryId || 'Unknown';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    const total = videos.length;
    return Object.entries(categoryCount).map(([category, count]) => ({
      category,
      percentage: (count / total) * 100,
    }));
  }

  private analyzeGrowthTrend(videos: any[]): 'increasing' | 'stable' | 'decreasing' {
    if (videos.length < 5) return 'stable';

    const recentVideos = videos.slice(0, Math.floor(videos.length / 2));
    const olderVideos = videos.slice(Math.floor(videos.length / 2));

    const recentAvgViews = recentVideos.reduce((sum: number, v: any) =>
      sum + parseInt(v.statistics.viewCount || '0'), 0) / recentVideos.length;

    const olderAvgViews = olderVideos.reduce((sum: number, v: any) =>
      sum + parseInt(v.statistics.viewCount || '0'), 0) / olderVideos.length;

    const difference = recentAvgViews - olderAvgViews;
    const percentChange = (difference / olderAvgViews) * 100;

    if (percentChange > 10) return 'increasing';
    if (percentChange < -10) return 'decreasing';
    return 'stable';
  }

  private calculateUploadFrequency(videos: any[]): string {
    if (videos.length < 2) return 'irregular';

    const dates = videos.map((v: any) => new Date(v.snippet.publishedAt).getTime());
    dates.sort((a, b) => b - a);

    const intervals: number[] = [];
    for (let i = 1; i < Math.min(dates.length, 10); i++) {
      intervals.push(dates[i - 1] - dates[i]);
    }

    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const daysInterval = avgInterval / (1000 * 60 * 60 * 24);

    if (daysInterval < 3) return 'daily';
    if (daysInterval < 10) return 'weekly';
    if (daysInterval < 35) return 'monthly';
    return 'irregular';
  }

  private calculateViralityIndex(metadata: YouTubeVideoMetadata, viewsPerDay: number): number {
    const factors = [
      Math.min(2, viewsPerDay / 10000), // Views per day factor
      Math.min(2, metadata.likeCount / metadata.viewCount * 100), // Like ratio
      Math.min(2, metadata.commentCount / metadata.viewCount * 50), // Comment ratio
      Math.min(2, metadata.tags.length / 10), // Tag optimization
      Math.min(2, metadata.caption ? 1 : 0), // Has captions
    ];

    return factors.reduce((sum, val) => sum + val, 0);
  }

  private estimateRetention(metadata: YouTubeVideoMetadata): number {
    const duration = youtubeService.parseDuration(metadata.duration);
    const engagementRate = (metadata.likeCount + metadata.commentCount) / metadata.viewCount;

    // Simplified retention estimate
    let retention = 50; // Base retention

    if (duration < 300) retention += 20; // Short videos tend to have better retention
    if (duration > 1800) retention -= 15; // Long videos may lose viewers

    if (engagementRate > 0.05) retention += 15;
    if (engagementRate > 0.1) retention += 10;

    return Math.min(100, Math.max(0, retention));
  }

  private predictVideoGrowth(metadata: YouTubeVideoMetadata, viewsPerDay: number, daysSincePublish: number): {
    next7Days: number;
    next30Days: number;
  } {
    // Exponential decay model
    const decayFactor = Math.exp(-daysSincePublish / 30);
    const currentRate = viewsPerDay * decayFactor;

    return {
      next7Days: Math.floor(currentRate * 7),
      next30Days: Math.floor(currentRate * 30),
    };
  }

  private calculateShareabilityScore(metadata: YouTubeVideoMetadata): number {
    let score = 0;

    // Title optimization (contains numbers, questions, power words)
    if (/\d+/.test(metadata.title)) score += 10;
    if (/\?/.test(metadata.title)) score += 10;
    if (/(how|what|why|best|top|ultimate|complete)/i.test(metadata.title)) score += 15;

    // Description quality
    if (metadata.description.length > 200) score += 15;
    if (metadata.description.length > 500) score += 10;

    // Tags optimization
    if (metadata.tags.length >= 10) score += 10;
    if (metadata.tags.length >= 20) score += 10;

    // Engagement
    const engagementRate = (metadata.likeCount + metadata.commentCount) / metadata.viewCount;
    score += Math.min(20, engagementRate * 1000);

    return Math.min(100, score);
  }

  private calculatePercentile(viewsPerDay: number): number {
    // Simplified percentile calculation
    if (viewsPerDay > 10000) return 99;
    if (viewsPerDay > 5000) return 95;
    if (viewsPerDay > 1000) return 90;
    if (viewsPerDay > 500) return 80;
    if (viewsPerDay > 100) return 70;
    if (viewsPerDay > 50) return 60;
    return 50;
  }

  private calculateFrequency(items: string[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    items.forEach(item => {
      if (item) frequency[item] = (frequency[item] || 0) + 1;
    });
    return frequency;
  }

  private calculateGrowthRate(videos: YouTubeVideoMetadata[]): number {
    if (videos.length < 2) return 0;

    const sortedByDate = videos.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    const recent = sortedByDate.slice(0, Math.floor(videos.length / 2));
    const older = sortedByDate.slice(Math.floor(videos.length / 2));

    const recentAvg = recent.reduce((sum, v) => sum + v.viewCount, 0) / recent.length;
    const olderAvg = older.reduce((sum, v) => sum + v.viewCount, 0) / older.length;

    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }

  private determineBestPostingTime(videos: YouTubeVideoMetadata[]): string {
    const hourCounts: Record<number, number> = {};

    videos.forEach(video => {
      const hour = new Date(video.publishedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + video.viewCount;
    });

    const bestHour = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '12';

    return `${bestHour}:00`;
  }

  private generateRelatedQueries(baseQuery: string): string[] {
    const modifiers = [
      'tutorial', 'guide', 'tips', 'tricks', 'how to', 'best',
      'for beginners', 'advanced', 'complete', 'ultimate', '2025'
    ];

    return modifiers.map(mod => `${baseQuery} ${mod}`);
  }

  private calculateOpportunityScore(searchVolume: number, avgViews: number, competition: number): number {
    let score = 50;

    // Higher search volume is better
    if (searchVolume > 1000) score += 20;
    else if (searchVolume > 100) score += 10;

    // Lower competition is better
    if (competition < 5) score += 20;
    else if (competition < 10) score += 10;

    // Higher average views indicate audience interest
    if (avgViews > 10000) score += 10;

    return Math.min(100, score);
  }

  private extractKeywords(query: string): string[] {
    return query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !['the', 'and', 'for', 'with'].includes(word));
  }

  private suggestContentFormat(query: string): string {
    if (/tutorial|guide|how to/i.test(query)) return 'Tutorial';
    if (/review|comparison/i.test(query)) return 'Review';
    if (/tips|tricks/i.test(query)) return 'Tips & Tricks';
    if (/list|top \d+/i.test(query)) return 'Listicle';
    return 'Educational';
  }

  private generateRecommendations(videos: YouTubeVideoMetadata[], bestVideo: YouTubeVideoMetadata): string[] {
    const recommendations: string[] = [];

    const avgDuration = videos.reduce((sum, v) =>
      sum + youtubeService.parseDuration(v.duration), 0) / videos.length;

    const bestDuration = youtubeService.parseDuration(bestVideo.duration);

    if (bestDuration < avgDuration * 0.8) {
      recommendations.push('Consider creating shorter, more concise content');
    } else if (bestDuration > avgDuration * 1.5) {
      recommendations.push('Longer, in-depth content performs well for your audience');
    }

    const avgTags = videos.reduce((sum, v) => sum + v.tags.length, 0) / videos.length;
    if (bestVideo.tags.length > avgTags * 1.5) {
      recommendations.push('Use more tags for better discoverability');
    }

    if (bestVideo.caption) {
      recommendations.push('Add captions to all videos for better accessibility and engagement');
    }

    const bestEngagement = (bestVideo.likeCount + bestVideo.commentCount) / bestVideo.viewCount;
    if (bestEngagement > 0.05) {
      recommendations.push('Replicate engagement strategies from your best performing video');
    }

    return recommendations;
  }

  private convertToVideoMetadata(video: any): YouTubeVideoMetadata {
    return {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      thumbnails: {
        default: video.snippet.thumbnails.default?.url || '',
        medium: video.snippet.thumbnails.medium?.url || '',
        high: video.snippet.thumbnails.high?.url || '',
      },
      duration: video.contentDetails?.duration || 'PT0S',
      viewCount: parseInt(video.statistics?.viewCount || '0'),
      likeCount: parseInt(video.statistics?.likeCount || '0'),
      commentCount: parseInt(video.statistics?.commentCount || '0'),
      tags: video.snippet.tags || [],
      categoryId: video.snippet.categoryId,
      caption: video.contentDetails?.caption === 'true',
      contentRating: video.contentDetails?.contentRating || {},
      definition: video.contentDetails?.definition || 'sd',
      dimension: video.contentDetails?.dimension || '2d',
      license: video.status?.license || 'youtube',
    };
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const youtubeAnalytics = new YouTubeAnalyticsService();
