/**
 * Professional Video Template System for Artone Video Editor
 * Provides comprehensive template library for various content types
 */

export class TemplateSystem {
  constructor() {
    this.templates = new Map();
    this.categories = [
      'business',
      'education',
      'entertainment',
      'social_media',
      'promotional',
      'tutorial',
      'vlog',
      'news',
      'product_demo',
      'event'
    ];

    this.initialize();
  }

  async initialize() {
    await this.loadTemplates();
    console.log('Template system initialized with', this.templates.size, 'templates');
  }

  async loadTemplates() {
    // Professional template library
    const templateLibrary = [
      // Business Templates
      {
        id: 'business-presentation',
        name: 'Business Presentation',
        category: 'business',
        description: 'Professional corporate presentation template',
        thumbnail: '/templates/business-presentation.jpg',
        duration: 120,
        complexity: 'intermediate',
        targetAudience: 'professionals',
        style: 'corporate',
        elements: [
          {
            type: 'intro',
            duration: 10,
            components: ['logo', 'title', 'subtitle']
          },
          {
            type: 'content_slides',
            duration: 80,
            components: ['text_overlay', 'charts', 'images']
          },
          {
            type: 'call_to_action',
            duration: 20,
            components: ['cta_text', 'contact_info']
          },
          {
            type: 'outro',
            duration: 10,
            components: ['logo', 'tagline']
          }
        ],
        colorScheme: {
          primary: '#1e40af',
          secondary: '#3b82f6',
          accent: '#f59e0b',
          background: '#ffffff',
          text: '#1f2937'
        },
        fonts: {
          title: 'Inter-Bold',
          body: 'Inter-Regular',
          accent: 'Inter-SemiBold'
        },
        animations: ['fade_in', 'slide_up', 'scale_in'],
        music: {
          background: '/audio/professional-corporate.mp3',
          intensity: 'low'
        }
      },

      // Social Media Templates
      {
        id: 'instagram-story',
        name: 'Instagram Story',
        category: 'social_media',
        description: 'Engaging Instagram story template',
        thumbnail: '/templates/instagram-story.jpg',
        duration: 15,
        complexity: 'beginner',
        targetAudience: 'social_media_users',
        style: 'modern',
        elements: [
          {
            type: 'hook',
            duration: 3,
            components: ['eye_catching_visual', 'question_text']
          },
          {
            type: 'content',
            duration: 9,
            components: ['main_message', 'visual_aid']
          },
          {
            type: 'cta',
            duration: 3,
            components: ['swipe_up_indicator', 'hashtag']
          }
        ],
        colorScheme: {
          primary: '#e91e63',
          secondary: '#9c27b0',
          accent: '#ffc107',
          background: '#000000',
          text: '#ffffff'
        },
        fonts: {
          title: 'Montserrat-Bold',
          body: 'Montserrat-Regular',
          accent: 'Montserrat-SemiBold'
        },
        animations: ['bounce_in', 'slide_left', 'fade_out'],
        music: {
          background: '/audio/upbeat-trendy.mp3',
          intensity: 'medium'
        }
      },

      // Educational Templates
      {
        id: 'tutorial-series',
        name: 'Tutorial Series',
        category: 'education',
        description: 'Step-by-step tutorial template',
        thumbnail: '/templates/tutorial-series.jpg',
        duration: 300,
        complexity: 'advanced',
        targetAudience: 'educators',
        style: 'instructional',
        elements: [
          {
            type: 'introduction',
            duration: 30,
            components: ['learning_objectives', 'prerequisites']
          },
          {
            type: 'step_by_step',
            duration: 240,
            components: ['numbered_steps', 'demonstration', 'tips']
          },
          {
            type: 'summary',
            duration: 20,
            components: ['key_takeaways', 'next_steps']
          },
          {
            type: 'resources',
            duration: 10,
            components: ['links', 'further_reading']
          }
        ],
        colorScheme: {
          primary: '#059669',
          secondary: '#10b981',
          accent: '#f59e0b',
          background: '#f9fafb',
          text: '#111827'
        },
        fonts: {
          title: 'Poppins-Bold',
          body: 'Poppins-Regular',
          accent: 'Poppins-SemiBold'
        },
        animations: ['slide_in_right', 'highlight', 'progress_bar'],
        music: {
          background: '/audio/educational-inspiring.mp3',
          intensity: 'low'
        }
      },

      // Entertainment Templates
      {
        id: 'movie-trailer',
        name: 'Movie Trailer',
        category: 'entertainment',
        description: 'Cinematic movie trailer template',
        thumbnail: '/templates/movie-trailer.jpg',
        duration: 90,
        complexity: 'expert',
        targetAudience: 'filmmakers',
        style: 'cinematic',
        elements: [
          {
            type: 'opening_sequence',
            duration: 15,
            components: ['dramatic_music', 'establishing_shots']
          },
          {
            type: 'conflict_buildup',
            duration: 45,
            components: ['quick_cuts', 'tension_building']
          },
          {
            type: 'climax',
            duration: 20,
            components: ['intense_action', 'emotional_peak']
          },
          {
            type: 'resolution',
            duration: 10,
            components: ['cliffhanger', 'call_to_action']
          }
        ],
        colorScheme: {
          primary: '#dc2626',
          secondary: '#ef4444',
          accent: '#fbbf24',
          background: '#000000',
          text: '#ffffff'
        },
        fonts: {
          title: 'BebasNeue-Bold',
          body: 'Roboto-Regular',
          accent: 'BebasNeue-Regular'
        },
        animations: ['dramatic_zoom', 'flash_effect', 'shake'],
        music: {
          background: '/audio/epic-cinematic.mp3',
          intensity: 'high'
        }
      },

      // YouTube Vlog Templates
      {
        id: 'youtube-vlog',
        name: 'YouTube Vlog',
        category: 'vlog',
        description: 'Personal vlog content template',
        thumbnail: '/templates/youtube-vlog.jpg',
        duration: 600,
        complexity: 'intermediate',
        targetAudience: 'content_creators',
        style: 'personal',
        elements: [
          {
            type: 'intro_hook',
            duration: 15,
            components: ['personal_greeting', 'topic_preview']
          },
          {
            type: 'main_content',
            duration: 480,
            components: ['story_telling', 'visual_aids', 'b_roll']
          },
          {
            type: 'audience_engagement',
            duration: 60,
            components: ['questions', 'polls', 'comments_call']
          },
          {
            type: 'outro',
            duration: 45,
            components: ['summary', 'cta_subscribe', 'next_video_teaser']
          }
        ],
        colorScheme: {
          primary: '#7c3aed',
          secondary: '#a855f7',
          accent: '#ec4899',
          background: '#faf5ff',
          text: '#1f2937'
        },
        fonts: {
          title: 'VarelaRound-Regular',
          body: 'OpenSans-Regular',
          accent: 'VarelaRound-Bold'
        },
        animations: ['smooth_fade', 'gentle_slide', 'pop_in'],
        music: {
          background: '/audio/friendly-conversational.mp3',
          intensity: 'medium'
        }
      }
    ];

    // Load templates into system
    for (const template of templateLibrary) {
      this.templates.set(template.id, template);
    }
  }

  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  getTemplatesByCategory(category) {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }

  getAllTemplates() {
    return Array.from(this.templates.values());
  }

  searchTemplates(query) {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(template =>
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description.toLowerCase().includes(lowercaseQuery) ||
      template.category.toLowerCase().includes(lowercaseQuery)
    );
  }

  // Template customization
  customizeTemplate(templateId, customizations) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return {
      ...template,
      ...customizations,
      id: `${templateId}_custom_${Date.now()}`,
      isCustom: true,
      originalTemplate: templateId,
      customizedAt: new Date().toISOString()
    };
  }

  // Template preview generation
  async generatePreview(templateId, previewData = {}) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Generate preview timeline
    const previewTimeline = [];

    for (const element of template.elements) {
      previewTimeline.push({
        start: element.duration * (previewTimeline.length / template.elements.length),
        end: element.duration * ((previewTimeline.length + 1) / template.elements.length),
        type: element.type,
        components: element.components,
        style: {
          backgroundColor: this.getElementColor(element.type),
          textAlign: 'center',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      });
    }

    return {
      template: templateId,
      timeline: previewTimeline,
      totalDuration: template.duration,
      previewImage: template.thumbnail,
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0'
      }
    };
  }

  getElementColor(elementType) {
    const colors = {
      intro: '#3b82f6',
      content_slides: '#10b981',
      call_to_action: '#f59e0b',
      outro: '#ef4444',
      hook: '#8b5cf6',
      content: '#06b6d4',
      cta: '#ec4899',
      opening_sequence: '#dc2626',
      conflict_buildup: '#ea580c',
      climax: '#7c2d12',
      resolution: '#059669'
    };
    return colors[elementType] || '#6b7280';
  }

  // Template compatibility check
  checkCompatibility(templateId, userSettings) {
    const template = this.getTemplate(templateId);
    if (!template) {
      return { compatible: false, reason: 'Template not found' };
    }

    const issues = [];

    // Check duration compatibility
    if (userSettings.maxDuration && template.duration > userSettings.maxDuration) {
      issues.push(`Template duration (${template.duration}s) exceeds maximum allowed (${userSettings.maxDuration}s)`);
    }

    // Check complexity compatibility
    if (userSettings.skillLevel) {
      const skillLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const templateLevel = skillLevels.indexOf(template.complexity);
      const userLevel = skillLevels.indexOf(userSettings.skillLevel);

      if (templateLevel > userLevel) {
        issues.push(`Template complexity (${template.complexity}) may be too advanced for skill level (${userSettings.skillLevel})`);
      }
    }

    // Check platform compatibility
    if (userSettings.targetPlatform && template.category !== 'social_media') {
      if (userSettings.targetPlatform === 'instagram' && template.duration > 60) {
        issues.push('Instagram videos should be 60 seconds or less');
      }
      if (userSettings.targetPlatform === 'tiktok' && template.duration > 180) {
        issues.push('TikTok videos should be 180 seconds or less');
      }
    }

    return {
      compatible: issues.length === 0,
      issues,
      warnings: issues,
      recommendations: this.getRecommendations(template, userSettings)
    };
  }

  getRecommendations(template, userSettings) {
    const recommendations = [];

    if (template.complexity === 'expert' && userSettings.skillLevel === 'beginner') {
      recommendations.push('Consider starting with intermediate templates and work your way up');
    }

    if (template.duration > userSettings.maxDuration) {
      recommendations.push('You may want to use the smart cut feature to reduce video length');
    }

    return recommendations;
  }

  // Template analytics
  getTemplateAnalytics(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Simulate usage analytics
    return {
      template: templateId,
      usage: {
        totalUses: Math.floor(Math.random() * 1000) + 100,
        averageRating: 4.2 + Math.random() * 0.8,
        completionRate: 0.75 + Math.random() * 0.2,
        popularModifications: [
          'Color scheme changes',
          'Duration adjustments',
          'Text customizations'
        ]
      },
      performance: {
        averageRenderTime: 45 + Math.random() * 30,
        successRate: 0.92 + Math.random() * 0.06,
        commonIssues: [
          'Long render times for complex templates',
          'High memory usage on mobile devices'
        ]
      }
    };
  }
}

// Export singleton instance
export const templateSystem = new TemplateSystem();
export default TemplateSystem;
