'use strict';

(function registerExportPresets(global) {
  // Enhanced quality presets with more options
  const QualityPresets = {
    'ultra-hd-8k': {
      name: 'Ultra HD 8K',
      resolution: { width: 7680, height: 4320 },
      bitrate: 100000000, // 100 Mbps
      framerate: 60,
      codec: 'av1',
      audiobitrate: 512000,
      container: 'webm',
      metadata: {
        tier: 'professional',
        useCase: 'cinema',
        estimatedSize: 'Very Large'
      }
    },
    'ultra-hd-4k': {
      name: 'Ultra HD 4K',
      resolution: { width: 3840, height: 2160 },
      bitrate: 50000000, // 50 Mbps
      framerate: 60,
      codec: 'vp9',
      audiobitrate: 320000,
      container: 'webm',
      metadata: {
        tier: 'professional',
        useCase: 'broadcast',
        estimatedSize: 'Large'
      }
    },
    'full-hd-1080p': {
      name: 'Full HD 1080p',
      resolution: { width: 1920, height: 1080 },
      bitrate: 10000000, // 10 Mbps
      framerate: 30,
      codec: 'vp9',
      audiobitrate: 192000,
      container: 'webm',
      metadata: {
        tier: 'standard',
        useCase: 'general',
        estimatedSize: 'Medium'
      }
    },
    'hd-720p': {
      name: 'HD 720p',
      resolution: { width: 1280, height: 720 },
      bitrate: 5000000, // 5 Mbps
      framerate: 30,
      codec: 'vp9',
      audiobitrate: 128000,
      container: 'webm',
      metadata: {
        tier: 'standard',
        useCase: 'streaming',
        estimatedSize: 'Medium'
      }
    },
    'web-optimized': {
      name: 'Web Optimized',
      resolution: { width: 1280, height: 720 },
      bitrate: 2500000, // 2.5 Mbps
      framerate: 24,
      codec: 'vp8',
      audiobitrate: 96000,
      container: 'webm',
      metadata: {
        tier: 'web',
        useCase: 'online',
        estimatedSize: 'Small'
      }
    },
    'mobile-friendly': {
      name: 'Mobile Friendly',
      resolution: { width: 854, height: 480 },
      bitrate: 1000000, // 1 Mbps
      framerate: 24,
      codec: 'vp8',
      audiobitrate: 64000,
      container: 'webm',
      metadata: {
        tier: 'mobile',
        useCase: 'mobile',
        estimatedSize: 'Small'
      }
    },
    'low-bandwidth': {
      name: 'Low Bandwidth',
      resolution: { width: 640, height: 360 },
      bitrate: 500000, // 500 Kbps
      framerate: 24,
      codec: 'vp8',
      audiobitrate: 48000,
      container: 'webm',
      metadata: {
        tier: 'basic',
        useCase: 'slow-connection',
        estimatedSize: 'Very Small'
      }
    },
    'social-media': {
      name: 'Social Media',
      resolution: { width: 1080, height: 1080 },
      bitrate: 3000000, // 3 Mbps
      framerate: 30,
      codec: 'h264',
      audiobitrate: 128000,
      container: 'mp4',
      metadata: {
        tier: 'social',
        useCase: 'social-media',
        estimatedSize: 'Medium'
      }
    },
    'gif-alternative': {
      name: 'GIF Alternative',
      resolution: { width: 480, height: 270 },
      bitrate: 800000, // 800 Kbps
      framerate: 15,
      codec: 'vp8',
      audiobitrate: 32000,
      container: 'webm',
      metadata: {
        tier: 'basic',
        useCase: 'animation',
        estimatedSize: 'Very Small'
      }
    }
  };

  // Platform-specific presets
  const PlatformPresets = {
    'youtube': {
      name: 'YouTube',
      resolution: { width: 1920, height: 1080 },
      bitrate: 8000000,
      framerate: 30,
      codec: 'h264',
      audiobitrate: 192000,
      container: 'mp4',
      metadata: {
        platform: 'youtube',
        recommended: true
      }
    },
    'instagram-feed': {
      name: 'Instagram Feed',
      resolution: { width: 1080, height: 1080 },
      bitrate: 5000000,
      framerate: 30,
      codec: 'h264',
      audiobitrate: 128000,
      container: 'mp4',
      metadata: {
        platform: 'instagram',
        aspectRatio: '1:1'
      }
    },
    'instagram-story': {
      name: 'Instagram Story',
      resolution: { width: 1080, height: 1920 },
      bitrate: 5000000,
      framerate: 30,
      codec: 'h264',
      audiobitrate: 128000,
      container: 'mp4',
      metadata: {
        platform: 'instagram',
        aspectRatio: '9:16'
      }
    },
    'twitter': {
      name: 'Twitter',
      resolution: { width: 1280, height: 720 },
      bitrate: 2500000,
      framerate: 30,
      codec: 'h264',
      audiobitrate: 128000,
      container: 'mp4',
      maxDuration: 140,
      metadata: {
        platform: 'twitter'
      }
    },
    'tiktok': {
      name: 'TikTok',
      resolution: { width: 1080, height: 1920 },
      bitrate: 6000000,
      framerate: 30,
      codec: 'h264',
      audiobitrate: 128000,
      container: 'mp4',
      maxDuration: 60,
      metadata: {
        platform: 'tiktok',
        aspectRatio: '9:16'
      }
    }
  };

  // Preset manager class
  class ExportPresetManager {
    constructor() {
      this.presets = new Map();
      this.customPresets = new Map();
      this.initializeDefaultPresets();
    }

    initializeDefaultPresets() {
      // Load quality presets
      for (const [key, preset] of Object.entries(QualityPresets)) {
        this.presets.set(key, { ...preset, type: 'quality', id: key });
      }

      // Load platform presets
      for (const [key, preset] of Object.entries(PlatformPresets)) {
        this.presets.set(key, { ...preset, type: 'platform', id: key });
      }
    }

    getPreset(id) {
      return this.presets.get(id) || this.customPresets.get(id);
    }

    getAllPresets() {
      return {
        quality: Array.from(this.presets.values()).filter(p => p.type === 'quality'),
        platform: Array.from(this.presets.values()).filter(p => p.type === 'platform'),
        custom: Array.from(this.customPresets.values())
      };
    }

    createCustomPreset(name, settings) {
      const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const preset = {
        id,
        name,
        type: 'custom',
        ...this.validateSettings(settings),
        created: Date.now(),
        modified: Date.now()
      };

      this.customPresets.set(id, preset);
      this.saveCustomPresets();

      return preset;
    }

    updateCustomPreset(id, updates) {
      const preset = this.customPresets.get(id);
      if (!preset) {
        throw new Error(`Custom preset ${id} not found`);
      }

      const updatedPreset = {
        ...preset,
        ...this.validateSettings(updates),
        modified: Date.now()
      };

      this.customPresets.set(id, updatedPreset);
      this.saveCustomPresets();

      return updatedPreset;
    }

    deleteCustomPreset(id) {
      const success = this.customPresets.delete(id);
      if (success) {
        this.saveCustomPresets();
      }
      return success;
    }

    validateSettings(settings) {
      const validated = {};

      // Resolution validation
      if (settings.resolution) {
        validated.resolution = {
          width: Math.max(144, Math.min(7680, settings.resolution.width || 1920)),
          height: Math.max(144, Math.min(4320, settings.resolution.height || 1080))
        };
      }

      // Bitrate validation
      if (settings.bitrate !== undefined) {
        validated.bitrate = Math.max(100000, Math.min(100000000, settings.bitrate));
      }

      // Framerate validation
      if (settings.framerate !== undefined) {
        validated.framerate = Math.max(1, Math.min(120, settings.framerate));
      }

      // Audio bitrate validation
      if (settings.audiobitrate !== undefined) {
        validated.audiobitrate = Math.max(32000, Math.min(320000, settings.audiobitrate));
      }

      // Codec validation
      if (settings.codec) {
        const validCodecs = ['vp8', 'vp9', 'h264', 'h265', 'av1'];
        validated.codec = validCodecs.includes(settings.codec) ? settings.codec : 'vp9';
      }

      // Container validation
      if (settings.container) {
        const validContainers = ['webm', 'mp4', 'mkv', 'mov'];
        validated.container = validContainers.includes(settings.container) ? settings.container : 'webm';
      }

      return validated;
    }

    calculateEstimatedFileSize(preset, durationSeconds) {
      const videoBitrate = preset.bitrate || 5000000;
      const audioBitrate = preset.audiobitrate || 128000;
      const totalBitrate = videoBitrate + audioBitrate;

      // Calculate size in bytes
      const sizeBytes = (totalBitrate / 8) * durationSeconds;

      // Add 5% overhead for container and metadata
      const totalSize = sizeBytes * 1.05;

      return {
        bytes: Math.round(totalSize),
        megabytes: Math.round(totalSize / (1024 * 1024) * 10) / 10,
        gigabytes: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100
      };
    }

    getRecommendedPreset(requirements = {}) {
      const { targetSize, duration, platform, quality } = requirements;

      // Platform-specific recommendation
      if (platform && PlatformPresets[platform]) {
        return this.presets.get(platform);
      }

      // Quality-based recommendation
      if (quality) {
        const qualityMap = {
          'highest': 'ultra-hd-4k',
          'high': 'full-hd-1080p',
          'medium': 'hd-720p',
          'low': 'web-optimized',
          'lowest': 'low-bandwidth'
        };

        const presetId = qualityMap[quality] || 'hd-720p';
        return this.presets.get(presetId);
      }

      // Size-based recommendation
      if (targetSize && duration) {
        const targetBitrate = (targetSize * 8) / duration;

        let bestPreset = null;
        let minDiff = Infinity;

        for (const preset of this.presets.values()) {
          if (preset.type === 'quality') {
            const diff = Math.abs(preset.bitrate - targetBitrate);
            if (diff < minDiff) {
              minDiff = diff;
              bestPreset = preset;
            }
          }
        }

        return bestPreset;
      }

      // Default recommendation
      return this.presets.get('hd-720p');
    }

    generateExportConfig(preset, additionalOptions = {}) {
      const config = {
        video: {
          codec: preset.codec,
          width: preset.resolution.width,
          height: preset.resolution.height,
          bitrate: preset.bitrate,
          framerate: preset.framerate
        },
        audio: {
          codec: 'opus',
          bitrate: preset.audiobitrate,
          sampleRate: 48000,
          channels: 2
        },
        container: preset.container,
        ...additionalOptions
      };

      // Add platform-specific configurations
      if (preset.metadata && preset.metadata.platform) {
        config.metadata = {
          ...config.metadata,
          ...preset.metadata
        };
      }

      // Add constraints
      if (preset.maxDuration) {
        config.maxDuration = preset.maxDuration;
      }

      return config;
    }

    saveCustomPresets() {
      try {
        const data = JSON.stringify(Array.from(this.customPresets.entries()));
        localStorage.setItem('artone-export-presets', data);
      } catch (error) {
        console.error('Failed to save custom presets:', error);
      }
    }

    loadCustomPresets() {
      try {
        const data = localStorage.getItem('artone-export-presets');
        if (data) {
          const entries = JSON.parse(data);
          this.customPresets = new Map(entries);
        }
      } catch (error) {
        console.error('Failed to load custom presets:', error);
      }
    }

    exportPreset(id) {
      const preset = this.getPreset(id);
      if (!preset) {
        throw new Error(`Preset ${id} not found`);
      }

      return JSON.stringify(preset, null, 2);
    }

    importPreset(jsonData) {
      try {
        const preset = JSON.parse(jsonData);

        // Validate the preset
        const validated = this.validateSettings(preset);

        // Create as custom preset
        return this.createCustomPreset(preset.name || 'Imported Preset', validated);
      } catch (error) {
        throw new Error(`Failed to import preset: ${error.message}`);
      }
    }
  }

  // Export profile builder
  class ExportProfileBuilder {
    constructor() {
      this.profile = {
        video: {},
        audio: {},
        processing: {},
        metadata: {}
      };
    }

    setVideoCodec(codec) {
      this.profile.video.codec = codec;
      return this;
    }

    setResolution(width, height) {
      this.profile.video.width = width;
      this.profile.video.height = height;
      return this;
    }

    setVideoBitrate(bitrate) {
      this.profile.video.bitrate = bitrate;
      return this;
    }

    setFramerate(framerate) {
      this.profile.video.framerate = framerate;
      return this;
    }

    setAudioCodec(codec) {
      this.profile.audio.codec = codec;
      return this;
    }

    setAudioBitrate(bitrate) {
      this.profile.audio.bitrate = bitrate;
      return this;
    }

    setProcessingOptions(options) {
      this.profile.processing = { ...this.profile.processing, ...options };
      return this;
    }

    setMetadata(metadata) {
      this.profile.metadata = { ...this.profile.metadata, ...metadata };
      return this;
    }

    build() {
      return { ...this.profile };
    }

    static fromPreset(preset) {
      const builder = new ExportProfileBuilder();

      if (preset.codec) builder.setVideoCodec(preset.codec);
      if (preset.resolution) builder.setResolution(preset.resolution.width, preset.resolution.height);
      if (preset.bitrate) builder.setVideoBitrate(preset.bitrate);
      if (preset.framerate) builder.setFramerate(preset.framerate);
      if (preset.audiobitrate) builder.setAudioBitrate(preset.audiobitrate);
      if (preset.metadata) builder.setMetadata(preset.metadata);

      return builder;
    }
  }

  // Export the module
  const exports = Object.freeze({
    QualityPresets,
    PlatformPresets,
    ExportPresetManager,
    ExportProfileBuilder
  });

  global.ExportPresets = exports;
})(typeof window !== 'undefined' ? window : globalThis);