/**
 * Stock Media Integration Service for Artone Video Editor
 * Provides access to free stock videos, music, images, and sound effects
 */

export class StockMediaService {
  constructor() {
    this.providers = {
      pexels: {
        name: 'Pexels',
        apiKey: process.env.NEXT_PUBLIC_PEXELS_API_KEY,
        baseUrl: 'https://api.pexels.com/v1',
        type: 'photos_videos',
        rateLimit: 200, // requests per hour
        free: true
      },
      pixabay: {
        name: 'Pixabay',
        apiKey: process.env.NEXT_PUBLIC_PIXABAY_API_KEY,
        baseUrl: 'https://pixabay.com/api',
        type: 'photos_videos_music',
        rateLimit: 5000, // requests per hour
        free: true
      },
      unsplash: {
        name: 'Unsplash',
        apiKey: process.env.NEXT_PUBLIC_UNSPLASH_API_KEY,
        baseUrl: 'https://api.unsplash.com',
        type: 'photos',
        rateLimit: 50, // requests per hour
        free: true
      },
      freesound: {
        name: 'Freesound',
        apiKey: process.env.NEXT_PUBLIC_FREESOUND_API_KEY,
        baseUrl: 'https://freesound.org/apiv2',
        type: 'audio',
        rateLimit: 2000, // requests per hour
        free: true
      }
    };

    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours

    this.categories = {
      videos: {
        nature: ['landscape', 'forest', 'ocean', 'mountains', 'sky'],
        business: ['office', 'meeting', 'work', 'technology', 'presentation'],
        people: ['portrait', 'crowd', 'lifestyle', 'diversity', 'emotion'],
        abstract: ['patterns', 'colors', 'motion', 'particles', 'waves'],
        animals: ['wildlife', 'pets', 'birds', 'marine', 'insects']
      },
      music: {
        genres: ['ambient', 'corporate', 'electronic', 'rock', 'classical', 'jazz', 'folk', 'hip-hop'],
        moods: ['upbeat', 'calm', 'dramatic', 'happy', 'sad', 'energetic', 'peaceful'],
        instruments: ['piano', 'guitar', 'orchestral', 'electronic', 'drums', 'vocals']
      },
      images: {
        categories: ['nature', 'business', 'people', 'technology', 'abstract', 'food', 'travel', 'animals']
      }
    };

    this.initialize();
  }

  async initialize() {
    // Test API connections
    await this.testConnections();

    // Preload popular content
    await this.preloadPopularContent();

    console.log('Stock Media Service initialized');
  }

  async testConnections() {
    const connectionTests = [];

    for (const [provider, config] of Object.entries(this.providers)) {
      try {
        const test = await this.testProviderConnection(provider, config);
        connectionTests.push({ provider, success: test, config });
      } catch (error) {
        console.warn(`Provider ${provider} connection test failed:`, error);
        connectionTests.push({ provider, success: false, error: error.message });
      }
    }

    console.log('Connection tests completed:', connectionTests);
  }

  async testProviderConnection(provider, config) {
    if (!config.apiKey) {
      throw new Error(`API key not configured for ${provider}`);
    }

    // Test API endpoint availability
    const response = await fetch(`${config.baseUrl}/search?query=test&per_page=1`, {
      headers: {
        'Authorization': config.apiKey,
        'Accept': 'application/json'
      }
    });

    return response.ok;
  }

  async preloadPopularContent() {
    // Preload popular stock media for faster access
    const popularSearches = [
      'nature landscape',
      'business meeting',
      'technology',
      'abstract background',
      'upbeat music'
    ];

    for (const search of popularSearches) {
      await this.searchMedia(search, 'videos', 5);
      await this.searchMedia(search, 'music', 5);
    }
  }

  // Search functionality
  async searchMedia(query, type = 'videos', options = {}) {
    const {
      provider = 'pexels',
      perPage = 20,
      page = 1,
      category,
      orientation,
      color,
      minDuration,
      maxDuration
    } = options;

    const cacheKey = `${provider}_${type}_${query}_${perPage}_${page}_${JSON.stringify(options)}`;

    // Check cache first
    if (this.cache.has(cacheKey) && this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const results = await this.performSearch(provider, query, type, options);
      this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`Search failed for ${provider}:`, error);
      throw error;
    }
  }

  async performSearch(provider, query, type, options) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    let url = `${config.baseUrl}/search?query=${encodeURIComponent(query)}&per_page=${options.perPage}&page=${options.page}`;

    // Add provider-specific parameters
    switch (provider) {
      case 'pexels':
        if (type === 'videos') url += '&type=video';
        break;
      case 'pixabay':
        url += `&key=${config.apiKey}`;
        if (type === 'music') url += '&media=audio';
        break;
      case 'unsplash':
        url += `&client_id=${config.apiKey}`;
        break;
      case 'freesound':
        url += `&token=${config.apiKey}`;
        break;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': provider !== 'pixabay' ? config.apiKey : undefined,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Normalize response format
    return this.normalizeSearchResults(data, provider, type);
  }

  normalizeSearchResults(data, provider, type) {
    const normalized = {
      provider,
      type,
      totalResults: data.total_results || data.total || 0,
      results: [],
      metadata: {
        fetchedAt: new Date().toISOString(),
        query: '',
        page: 1,
        perPage: 20
      }
    };

    // Normalize different API response formats
    switch (provider) {
      case 'pexels':
        normalized.results = (data.photos || data.videos || []).map(item => ({
          id: item.id,
          url: item.url,
          thumbnail: item.src?.medium || item.image,
          preview: type === 'videos' ? item.video_files?.[0]?.link : item.src?.large,
          title: item.alt || 'Stock Media',
          description: item.photographer || item.user?.name,
          tags: item.tags || [],
          dimensions: {
            width: item.width,
            height: item.height
          },
          duration: type === 'videos' ? item.duration : undefined,
          size: type === 'videos' ? item.video_files?.[0]?.file_size : undefined,
          license: 'Pexels License',
          downloadUrl: type === 'videos' ? item.video_files?.[0]?.link : item.src?.large,
          attribution: {
            author: item.photographer || item.user?.name,
            authorUrl: item.photographer_url || item.user?.profile_url
          }
        }));
        break;

      case 'pixabay':
        normalized.results = (data.hits || []).map(item => ({
          id: item.id,
          url: item.pageURL,
          thumbnail: item.previewURL || item.webformatURL,
          preview: item.largeImageURL || item.webformatURL,
          title: item.tags || 'Stock Media',
          description: item.user,
          tags: item.tags?.split(', ') || [],
          dimensions: {
            width: item.imageWidth,
            height: item.imageHeight
          },
          duration: item.duration,
          size: item.fileSize,
          license: 'Pixabay License',
          downloadUrl: item.largeImageURL || item.webformatURL,
          attribution: {
            author: item.user,
            authorUrl: `https://pixabay.com/users/${item.user}-${item.user_id}`
          }
        }));
        break;

      case 'unsplash':
        normalized.results = (data.results || []).map(item => ({
          id: item.id,
          url: item.links.html,
          thumbnail: item.urls.thumb,
          preview: item.urls.regular,
          title: item.description || 'Stock Photo',
          description: item.user.name,
          tags: item.tags?.map(tag => tag.title) || [],
          dimensions: {
            width: item.width,
            height: item.height
          },
          license: 'Unsplash License',
          downloadUrl: item.urls.full,
          attribution: {
            author: item.user.name,
            authorUrl: item.user.links.html
          }
        }));
        break;

      case 'freesound':
        normalized.results = (data.results || []).map(item => ({
          id: item.id,
          url: item.url,
          thumbnail: '/icons/audio-icon.png',
          preview: item.previews?.['preview-hq-mp3'] || item.previews?.['preview-lq-mp3'],
          title: item.name,
          description: item.description,
          tags: item.tags || [],
          duration: item.duration,
          size: item.filesize,
          license: item.license,
          downloadUrl: item.download,
          attribution: {
            author: item.username,
            authorUrl: `https://freesound.org/people/${item.username}/`
          }
        }));
        break;
    }

    return normalized;
  }

  // Download media
  async downloadMedia(mediaItem, quality = 'high') {
    try {
      const response = await fetch(mediaItem.downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': 'video/*,audio/*,image/*',
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const blob = await response.blob();

      return {
        blob,
        filename: this.generateFilename(mediaItem, quality),
        metadata: {
          originalUrl: mediaItem.downloadUrl,
          provider: mediaItem.provider || 'unknown',
          downloadedAt: new Date().toISOString(),
          quality,
          fileSize: blob.size
        }
      };
    } catch (error) {
      console.error('Media download failed:', error);
      throw error;
    }
  }

  generateFilename(mediaItem, quality) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.getFileExtension(mediaItem.downloadUrl);
    const qualitySuffix = quality !== 'high' ? `_${quality}` : '';

    return `artone-stock-${mediaItem.id}-${timestamp}${qualitySuffix}.${extension}`;
  }

  getFileExtension(url) {
    const pathname = new URL(url).pathname;
    return pathname.split('.').pop().toLowerCase();
  }

  // Category browsing
  async browseCategory(category, type = 'videos', options = {}) {
    const categoryTerms = this.categories[type]?.[category] || [category];

    // Search using category terms
    const searchPromises = categoryTerms.map(term =>
      this.searchMedia(term, type, { ...options, perPage: 10 })
    );

    const results = await Promise.allSettled(searchPromises);

    // Combine and deduplicate results
    const combinedResults = {
      category,
      type,
      totalResults: 0,
      results: [],
      subcategories: categoryTerms,
      metadata: {
        fetchedAt: new Date().toISOString(),
        sources: results.filter(r => r.status === 'fulfilled').length
      }
    };

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        combinedResults.results.push(...result.value.results);
        combinedResults.totalResults += result.value.totalResults;
      }
    });

    // Remove duplicates based on ID
    combinedResults.results = combinedResults.results.filter((item, index, self) =>
      index === self.findIndex(i => i.id === item.id)
    );

    return combinedResults;
  }

  // Trending content
  async getTrending(type = 'videos', timeframe = 'week') {
    const trendingTerms = this.getTrendingTerms(type, timeframe);

    const searchPromises = trendingTerms.map(term =>
      this.searchMedia(term, type, { perPage: 15 })
    );

    const results = await Promise.allSettled(searchPromises);

    // Combine results and calculate trending scores
    const allResults = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        result.value.results.forEach(item => {
          item.trendingScore = trendingTerms.length - index; // Higher score for earlier terms
          allResults.push(item);
        });
      }
    });

    // Sort by trending score and return top results
    allResults.sort((a, b) => b.trendingScore - a.trendingScore);

    return {
      type,
      timeframe,
      results: allResults.slice(0, 50),
      totalResults: allResults.length,
      trendingTerms,
      metadata: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  getTrendingTerms(type, timeframe) {
    const trendingData = {
      videos: {
        week: ['nature', 'technology', 'business', 'lifestyle', 'abstract'],
        month: ['travel', 'food', 'animals', 'sports', 'art']
      },
      music: {
        week: ['ambient', 'corporate', 'electronic', 'acoustic', 'cinematic'],
        month: ['classical', 'jazz', 'rock', 'hip-hop', 'folk']
      },
      images: {
        week: ['nature', 'business', 'people', 'technology', 'abstract'],
        month: ['travel', 'food', 'animals', 'architecture', 'minimal']
      }
    };

    return trendingData[type]?.[timeframe] || trendingData[type]?.week || [];
  }

  // Favorites and collections
  async addToFavorites(mediaItem) {
    const favorites = this.getFavorites();
    if (!favorites.find(item => item.id === mediaItem.id)) {
      favorites.push(mediaItem);
      localStorage.setItem('artone-stock-favorites', JSON.stringify(favorites));
    }
  },

  async removeFromFavorites(mediaItemId) {
    const favorites = this.getFavorites().filter(item => item.id !== mediaItemId);
    localStorage.setItem('artone-stock-favorites', JSON.stringify(favorites));
  },

  getFavorites() {
    try {
      const stored = localStorage.getItem('artone-stock-favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load favorites:', error);
      return [];
    }
  },

  // Usage analytics
  trackUsage(action, mediaItem, metadata = {}) {
    const usageData = {
      action,
      mediaItem: {
        id: mediaItem.id,
        type: mediaItem.type,
        provider: mediaItem.provider
      },
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ...metadata
    };

    // Send to analytics service (if configured)
    this.sendAnalyticsData(usageData);
  },

  async sendAnalyticsData(usageData) {
    try {
      // In a real implementation, this would send to your analytics service
      console.log('Usage tracked:', usageData);
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  }

  // Cache management
  setCache(key, data) {
    this.cache.set(key, data);
    this.cacheExpiry.set(key, Date.now() + this.cacheDuration);
  }

  getCache(key) {
    if (this.isCacheValid(key)) {
      return this.cache.get(key);
    }
    this.cache.delete(key);
    this.cacheExpiry.delete(key);
    return null;
  }

  isCacheValid(key) {
    const expiry = this.cacheExpiry.get(key);
    return expiry && expiry > Date.now();
  }

  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  // Utility methods
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDuration(seconds) {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Batch download
  async downloadBatch(mediaItems, quality = 'high') {
    const downloadPromises = mediaItems.map(item =>
      this.downloadMedia(item, quality)
        .then(result => ({ success: true, item: item.id, result }))
        .catch(error => ({ success: false, item: item.id, error: error.message }))
    );

    const results = await Promise.allSettled(downloadPromises);

    return {
      total: mediaItems.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'fulfilled' && !r.value.success).length,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: 'Promise rejected' })
    };
  }
}

// Export singleton instance
export const stockMediaService = new StockMediaService();
export default StockMediaService;
