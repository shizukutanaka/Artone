/**
 * Personal Use Presets and Templates
 * 個人使用向けプリセットとテンプレート
 *
 * Quick access to common editing scenarios for personal video projects
 */

export interface VideoPreset {
  id: string;
  name: string;
  nameJa: string;
  description: string;
  descriptionJa: string;
  resolution: { width: number; height: number };
  frameRate: number;
  bitrate: number;
  format: string;
  useCase: string;
}

export interface EffectPreset {
  id: string;
  name: string;
  nameJa: string;
  category: string;
  settings: Record<string, any>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  nameJa: string;
  description: string;
  descriptionJa: string;
  tracks: number;
  defaultEffects: string[];
  suggestedMusic?: string;
}

/**
 * Export Presets for Common Use Cases
 * 一般的な用途向けのエクスポートプリセット
 */
export const EXPORT_PRESETS: VideoPreset[] = [
  {
    id: 'youtube-1080p',
    name: 'YouTube 1080p (Recommended)',
    nameJa: 'YouTube 1080p（推奨）',
    description: 'High quality for YouTube uploads',
    descriptionJa: 'YouTube投稿用の高品質設定',
    resolution: { width: 1920, height: 1080 },
    frameRate: 30,
    bitrate: 8000000, // 8 Mbps
    format: 'mp4',
    useCase: 'youtube',
  },
  {
    id: 'youtube-4k',
    name: 'YouTube 4K',
    nameJa: 'YouTube 4K',
    description: 'Ultra high quality for 4K displays',
    descriptionJa: '4Kディスプレイ用の超高品質',
    resolution: { width: 3840, height: 2160 },
    frameRate: 30,
    bitrate: 35000000, // 35 Mbps
    format: 'mp4',
    useCase: 'youtube-4k',
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    nameJa: 'Instagramストーリー',
    description: 'Vertical format for Instagram Stories',
    descriptionJa: 'Instagramストーリー用の縦型動画',
    resolution: { width: 1080, height: 1920 },
    frameRate: 30,
    bitrate: 5000000, // 5 Mbps
    format: 'mp4',
    useCase: 'instagram-story',
  },
  {
    id: 'instagram-post',
    name: 'Instagram Post',
    nameJa: 'Instagram投稿',
    description: 'Square format for Instagram feed',
    descriptionJa: 'Instagramフィード用の正方形',
    resolution: { width: 1080, height: 1080 },
    frameRate: 30,
    bitrate: 5000000,
    format: 'mp4',
    useCase: 'instagram-post',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    nameJa: 'TikTok',
    description: 'Vertical format for TikTok',
    descriptionJa: 'TikTok用の縦型動画',
    resolution: { width: 1080, height: 1920 },
    frameRate: 30,
    bitrate: 6000000,
    format: 'mp4',
    useCase: 'tiktok',
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    nameJa: 'Twitter/X',
    description: 'Optimized for Twitter/X platform',
    descriptionJa: 'Twitter/X向けに最適化',
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
    bitrate: 5000000,
    format: 'mp4',
    useCase: 'twitter',
  },
  {
    id: 'web-hd',
    name: 'Web HD (720p)',
    nameJa: 'Web HD (720p)',
    description: 'Smaller file size, good quality',
    descriptionJa: 'ファイルサイズ小、品質良好',
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
    bitrate: 5000000,
    format: 'mp4',
    useCase: 'web',
  },
  {
    id: 'mobile-optimized',
    name: 'Mobile Optimized',
    nameJa: 'モバイル最適化',
    description: 'Lightweight for mobile viewing',
    descriptionJa: 'モバイル視聴向けの軽量版',
    resolution: { width: 854, height: 480 },
    frameRate: 30,
    bitrate: 2500000, // 2.5 Mbps
    format: 'mp4',
    useCase: 'mobile',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    nameJa: 'WhatsApp',
    description: 'Compressed for messaging apps',
    descriptionJa: 'メッセージアプリ用に圧縮',
    resolution: { width: 640, height: 360 },
    frameRate: 30,
    bitrate: 1500000, // 1.5 Mbps
    format: 'mp4',
    useCase: 'messaging',
  },
  {
    id: 'archive-quality',
    name: 'Archive Quality',
    nameJa: 'アーカイブ品質',
    description: 'Maximum quality for long-term storage',
    descriptionJa: '長期保存用の最高品質',
    resolution: { width: 1920, height: 1080 },
    frameRate: 60,
    bitrate: 50000000, // 50 Mbps
    format: 'mp4',
    useCase: 'archive',
  },
];

/**
 * Quick Effect Presets
 * クイックエフェクトプリセット
 */
export const EFFECT_PRESETS: EffectPreset[] = [
  {
    id: 'cinematic-warm',
    name: 'Cinematic Warm',
    nameJa: '映画風（暖色）',
    category: 'color-grading',
    settings: {
      temperature: 15,
      tint: -5,
      exposure: 5,
      contrast: 20,
      saturation: -10,
      highlights: -10,
      shadows: 15,
    },
  },
  {
    id: 'cinematic-cool',
    name: 'Cinematic Cool',
    nameJa: '映画風（寒色）',
    category: 'color-grading',
    settings: {
      temperature: -15,
      tint: 5,
      exposure: 0,
      contrast: 25,
      saturation: -5,
      highlights: -15,
      shadows: 20,
    },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    nameJa: 'ヴィンテージ',
    category: 'color-grading',
    settings: {
      temperature: 10,
      tint: -10,
      exposure: -5,
      contrast: 15,
      saturation: -30,
      vignette: 30,
      grain: 15,
    },
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    nameJa: '鮮やか',
    category: 'color-grading',
    settings: {
      temperature: 5,
      tint: 0,
      exposure: 10,
      contrast: 10,
      saturation: 40,
      vibrance: 20,
      clarity: 15,
    },
  },
  {
    id: 'black-white',
    name: 'Black & White',
    nameJa: 'モノクロ',
    category: 'color-grading',
    settings: {
      saturation: -100,
      contrast: 30,
      exposure: 5,
      highlights: -10,
      shadows: 15,
    },
  },
  {
    id: 'soft-dream',
    name: 'Soft Dream',
    nameJa: 'ソフト・ドリーム',
    category: 'color-grading',
    settings: {
      temperature: 10,
      exposure: 15,
      contrast: -10,
      saturation: -20,
      blur: 5,
      glow: 20,
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    nameJa: 'ハイコントラスト',
    category: 'color-grading',
    settings: {
      contrast: 50,
      highlights: -20,
      shadows: 30,
      clarity: 30,
      vibrance: 10,
    },
  },
  {
    id: 'fade-out',
    name: 'Fade Out',
    nameJa: 'フェードアウト',
    category: 'transition',
    settings: {
      duration: 1000, // 1 second
      type: 'fade',
      curve: 'ease-out',
    },
  },
  {
    id: 'crossfade',
    name: 'Crossfade',
    nameJa: 'クロスフェード',
    category: 'transition',
    settings: {
      duration: 500,
      type: 'cross-dissolve',
      curve: 'linear',
    },
  },
];

/**
 * Project Templates for Common Scenarios
 * 一般的なシナリオ向けプロジェクトテンプレート
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'vlog',
    name: 'Vlog',
    nameJa: 'Vlog（動画ブログ）',
    description: 'Perfect for daily vlogs and personal stories',
    descriptionJa: '日常のVlogや個人的なストーリーに最適',
    tracks: 3,
    defaultEffects: ['cinematic-warm', 'fade-out'],
  },
  {
    id: 'travel',
    name: 'Travel Video',
    nameJa: '旅行動画',
    description: 'Showcase your adventures with style',
    descriptionJa: '旅の思い出をスタイリッシュに',
    tracks: 4,
    defaultEffects: ['vibrant', 'crossfade'],
    suggestedMusic: 'upbeat-travel',
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    nameJa: 'チュートリアル',
    description: 'Educational content with clear visuals',
    descriptionJa: '教育コンテンツ向けの明確な映像',
    tracks: 3,
    defaultEffects: ['high-contrast'],
  },
  {
    id: 'product-review',
    name: 'Product Review',
    nameJa: '商品レビュー',
    description: 'Professional product showcase',
    descriptionJa: 'プロフェッショナルな商品紹介',
    tracks: 3,
    defaultEffects: ['cinematic-cool', 'fade-out'],
  },
  {
    id: 'music-video',
    name: 'Music Video',
    nameJa: 'ミュージックビデオ',
    description: 'Creative music visualizations',
    descriptionJa: 'クリエイティブな音楽映像',
    tracks: 5,
    defaultEffects: ['cinematic-warm', 'vibrant'],
  },
  {
    id: 'family-memories',
    name: 'Family Memories',
    nameJa: '家族の思い出',
    description: 'Preserve precious family moments',
    descriptionJa: '大切な家族の瞬間を保存',
    tracks: 3,
    defaultEffects: ['soft-dream', 'crossfade'],
  },
  {
    id: 'gaming-highlights',
    name: 'Gaming Highlights',
    nameJa: 'ゲームハイライト',
    description: 'Epic gaming moments compilation',
    descriptionJa: 'ゲームの名場面まとめ',
    tracks: 4,
    defaultEffects: ['vibrant', 'high-contrast'],
  },
  {
    id: 'birthday-celebration',
    name: 'Birthday Celebration',
    nameJa: '誕生日のお祝い',
    description: 'Memorable birthday video',
    descriptionJa: '思い出に残る誕生日動画',
    tracks: 4,
    defaultEffects: ['vibrant', 'soft-dream'],
  },
];

/**
 * Performance Settings for Personal Use
 * 個人使用向けパフォーマンス設定
 */
export const PERFORMANCE_PROFILES = {
  // Low-end PC (4GB RAM, integrated GPU)
  lowEnd: {
    maxClipsInTimeline: 50,
    previewQuality: 'low',
    enableProxyGeneration: true,
    maxResolution: { width: 1280, height: 720 },
    disableEffectPreview: true,
    renderThreads: 2,
  },

  // Mid-range PC (8GB RAM, dedicated GPU)
  midRange: {
    maxClipsInTimeline: 200,
    previewQuality: 'medium',
    enableProxyGeneration: false,
    maxResolution: { width: 1920, height: 1080 },
    disableEffectPreview: false,
    renderThreads: 4,
  },

  // High-end PC (16GB+ RAM, powerful GPU)
  highEnd: {
    maxClipsInTimeline: 1000,
    previewQuality: 'high',
    enableProxyGeneration: false,
    maxResolution: { width: 3840, height: 2160 },
    disableEffectPreview: false,
    renderThreads: 8,
  },
};

/**
 * Auto-detect best performance profile
 * パフォーマンスプロファイルの自動検出
 */
export function detectPerformanceProfile(): keyof typeof PERFORMANCE_PROFILES {
  if (typeof navigator === 'undefined') return 'midRange';

  // @ts-ignore - deviceMemory is experimental
  const memory = navigator.deviceMemory || 8;
  // @ts-ignore - hardwareConcurrency
  const cores = navigator.hardwareConcurrency || 4;

  if (memory >= 16 && cores >= 8) {
    return 'highEnd';
  } else if (memory >= 8 && cores >= 4) {
    return 'midRange';
  } else {
    return 'lowEnd';
  }
}

/**
 * Get recommended settings based on system
 * システムに基づいた推奨設定を取得
 */
export function getRecommendedSettings() {
  const profile = detectPerformanceProfile();
  return PERFORMANCE_PROFILES[profile];
}
