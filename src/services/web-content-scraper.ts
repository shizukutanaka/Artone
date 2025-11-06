/**
 * Web Content Scraper Service
 * Compliant with copyright laws, robots.txt, and ethical scraping practices
 * Focuses on public metadata extraction without direct video download
 */

import axios from 'axios';
import { sanitizeUrl } from '../security/url-sanitizer';
import { log } from '../utils/production-logger';

export interface WebVideoMetadata {
  url: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  duration?: number;
  author?: string;
  publishDate?: string;
  embedUrl?: string;
  platform: 'youtube' | 'vimeo' | 'dailymotion' | 'twitter' | 'facebook' | 'generic';
  isEmbeddable: boolean;
  contentType?: string;
}

export interface RobotsTxtRules {
  isAllowed: boolean;
  crawlDelay?: number;
  userAgent: string;
}

export class WebContentScraperService {
  private userAgent = 'Artone-Video-Editor/1.0 (Educational/Research Purpose)';
  private robotsTxtCache: Map<string, RobotsTxtRules>;
  private metadataCache: Map<string, { data: WebVideoMetadata; timestamp: number }>;
  private cacheTimeout = 10 * 60 * 1000; // 10 minutes
  private requestDelay = 1000; // 1 second between requests
  private lastRequestTime = 0;

  constructor() {
    this.robotsTxtCache = new Map();
    this.metadataCache = new Map();
  }

  /**
   * Check robots.txt before scraping
   */
  async checkRobotsTxt(url: string): Promise<RobotsTxtRules> {
    try {
      const parsedUrl = new URL(url);
      const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;

      // Check cache
      const cached = this.robotsTxtCache.get(parsedUrl.host);
      if (cached) return cached;

      const response = await axios.get(robotsUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 5000,
      }).catch(() => ({ data: '' }));

      const robotsTxt = response.data;
      const rules = this.parseRobotsTxt(robotsTxt);

      // Cache for domain
      this.robotsTxtCache.set(parsedUrl.host, rules);

      return rules;
    } catch (error) {
      // If robots.txt cannot be fetched, assume scraping is allowed but be cautious
      return {
        isAllowed: true,
        userAgent: this.userAgent,
      };
    }
  }

  /**
   * Parse robots.txt content
   */
  private parseRobotsTxt(content: string): RobotsTxtRules {
    const lines = content.split('\n');
    let currentUserAgent = '';
    let isRelevant = false;
    const disallowedPaths: string[] = [];
    let crawlDelay: number | undefined;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith('user-agent:')) {
        currentUserAgent = trimmed.split(':')[1].trim();
        isRelevant = currentUserAgent === '*' || currentUserAgent.includes('artone');
      }

      if (isRelevant) {
        if (trimmed.startsWith('disallow:')) {
          const path = trimmed.split(':')[1].trim();
          if (path) disallowedPaths.push(path);
        }

        if (trimmed.startsWith('crawl-delay:')) {
          const delay = parseInt(trimmed.split(':')[1].trim(), 10);
          if (!isNaN(delay)) crawlDelay = delay;
        }
      }
    }

    return {
      isAllowed: disallowedPaths.length === 0 || !disallowedPaths.includes('/'),
      crawlDelay,
      userAgent: this.userAgent,
    };
  }

  /**
   * Rate limiting - ensure respectful scraping
   */
  private async respectRateLimit(crawlDelay?: number): Promise<void> {
    const delay = crawlDelay ? crawlDelay * 1000 : this.requestDelay;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < delay) {
      await new Promise(resolve => setTimeout(resolve, delay - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Extract Open Graph metadata from HTML
   */
  private extractOpenGraphMetadata(html: string, url: string): Partial<WebVideoMetadata> {
    const metadata: Partial<WebVideoMetadata> = {};

    // Title
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (titleMatch) metadata.title = titleMatch[1];

    // Description
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    if (descMatch) metadata.description = descMatch[1];

    // Thumbnail
    const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (thumbMatch) metadata.thumbnailUrl = thumbMatch[1];

    // Video URL
    const videoMatch = html.match(/<meta\s+property="og:video:url"\s+content="([^"]+)"/i);
    if (videoMatch) metadata.embedUrl = videoMatch[1];

    // Duration
    const durationMatch = html.match(/<meta\s+property="og:video:duration"\s+content="(\d+)"/i);
    if (durationMatch) metadata.duration = parseInt(durationMatch[1], 10);

    return metadata;
  }

  /**
   * Extract Twitter Card metadata
   */
  private extractTwitterCardMetadata(html: string): Partial<WebVideoMetadata> {
    const metadata: Partial<WebVideoMetadata> = {};

    const titleMatch = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);
    if (titleMatch) metadata.title = titleMatch[1];

    const descMatch = html.match(/<meta\s+name="twitter:description"\s+content="([^"]+)"/i);
    if (descMatch) metadata.description = descMatch[1];

    const thumbMatch = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
    if (thumbMatch) metadata.thumbnailUrl = thumbMatch[1];

    return metadata;
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): WebVideoMetadata['platform'] {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
    if (urlLower.includes('vimeo.com')) return 'vimeo';
    if (urlLower.includes('dailymotion.com')) return 'dailymotion';
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
    if (urlLower.includes('facebook.com')) return 'facebook';

    return 'generic';
  }

  /**
   * Extract metadata from public web content (respecting copyright)
   */
  async extractWebVideoMetadata(url: string): Promise<WebVideoMetadata | null> {
    try {
      // Sanitize URL
      const sanitized = sanitizeUrl(url);
      if (!sanitized) {
        throw new Error('Invalid URL');
      }

      // Check cache
      const cached = this.metadataCache.get(sanitized);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // Check robots.txt
      const robotsRules = await this.checkRobotsTxt(sanitized);
      if (!robotsRules.isAllowed) {
        log.warn('Scraping not allowed by robots.txt', { url: sanitized });
        return null;
      }

      // Respect rate limiting
      await this.respectRateLimit(robotsRules.crawlDelay);

      // Fetch page content
      const response = await axios.get(sanitized, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
        maxRedirects: 5,
      });

      const html = response.data;

      // Extract metadata using multiple methods
      const ogMetadata = this.extractOpenGraphMetadata(html, sanitized);
      const twitterMetadata = this.extractTwitterCardMetadata(html);

      // Merge metadata (Open Graph takes precedence)
      const metadata: WebVideoMetadata = {
        url: sanitized,
        title: ogMetadata.title || twitterMetadata.title || 'Untitled',
        description: ogMetadata.description || twitterMetadata.description || '',
        thumbnailUrl: ogMetadata.thumbnailUrl || twitterMetadata.thumbnailUrl,
        duration: ogMetadata.duration,
        embedUrl: ogMetadata.embedUrl,
        platform: this.detectPlatform(sanitized),
        isEmbeddable: !!ogMetadata.embedUrl,
        contentType: response.headers['content-type'],
      };

      // Cache result
      this.metadataCache.set(sanitized, {
        data: metadata,
        timestamp: Date.now(),
      });

      log.info('Web video metadata extracted', { url: sanitized, platform: metadata.platform });

      return metadata;
    } catch (error) {
      log.error('Failed to extract web video metadata', { error, url });
      return null;
    }
  }

  /**
   * Extract embed code for supported platforms
   */
  async getEmbedCode(url: string, options: {
    width?: number;
    height?: number;
    autoplay?: boolean;
  } = {}): Promise<string | null> {
    const metadata = await this.extractWebVideoMetadata(url);
    if (!metadata || !metadata.isEmbeddable) return null;

    const width = options.width || 640;
    const height = options.height || 360;
    const autoplay = options.autoplay ? '1' : '0';

    switch (metadata.platform) {
      case 'youtube': {
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
        if (videoId) {
          return `<iframe width="${width}" height="${height}" src="https://www.youtube.com/embed/${videoId}?autoplay=${autoplay}" frameborder="0" allowfullscreen></iframe>`;
        }
        break;
      }

      case 'vimeo': {
        const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
        if (videoId) {
          return `<iframe src="https://player.vimeo.com/video/${videoId}?autoplay=${autoplay}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
        }
        break;
      }

      case 'dailymotion': {
        const videoId = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/)?.[1];
        if (videoId) {
          return `<iframe src="https://www.dailymotion.com/embed/video/${videoId}?autoplay=${autoplay}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
        }
        break;
      }

      default:
        if (metadata.embedUrl) {
          return `<iframe src="${metadata.embedUrl}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
        }
    }

    return null;
  }

  /**
   * Batch extract metadata from multiple URLs
   */
  async batchExtractMetadata(urls: string[]): Promise<(WebVideoMetadata | null)[]> {
    const results: (WebVideoMetadata | null)[] = [];

    for (const url of urls) {
      try {
        const metadata = await this.extractWebVideoMetadata(url);
        results.push(metadata);

        // Rate limiting between requests
        await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      } catch (error) {
        log.error('Batch metadata extraction failed for URL', { error, url });
        results.push(null);
      }
    }

    return results;
  }

  /**
   * Validate if URL points to embeddable video content
   */
  async isVideoEmbeddable(url: string): Promise<boolean> {
    const metadata = await this.extractWebVideoMetadata(url);
    return metadata?.isEmbeddable || false;
  }

  /**
   * Get platform-specific oEmbed data
   */
  async getOEmbedData(url: string): Promise<any | null> {
    try {
      const platform = this.detectPlatform(url);
      let oembedUrl: string | null = null;

      switch (platform) {
        case 'youtube':
          oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          break;
        case 'vimeo':
          oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
          break;
        case 'dailymotion':
          oembedUrl = `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(url)}&format=json`;
          break;
      }

      if (!oembedUrl) return null;

      const response = await axios.get(oembedUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 5000,
      });

      return response.data;
    } catch (error) {
      log.error('Failed to get oEmbed data', { error, url });
      return null;
    }
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.robotsTxtCache.clear();
    this.metadataCache.clear();
    log.info('Web content scraper cache cleared');
  }
}

// Singleton instance
export const webScraperService = new WebContentScraperService();
