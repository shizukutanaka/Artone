/**
 * SEO and Content Optimization AI
 * Analyzes video content and provides optimization suggestions for different platforms
 */

import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../hooks/useI18n';

const OptimizationContainer = styled.div`
  padding: 16px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
`;

const PlatformTabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
`;

const PlatformTab = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  border: none;
  background: ${props => props.active ? 'var(--color-primary)' : 'transparent'};
  color: ${props => props.active ? 'white' : 'var(--color-text-secondary)'};
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.active ? 'var(--color-primary)' : 'var(--color-surface-variant)'};
  }
`;

const OptimizationCard = styled.div`
  background: var(--color-background);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--color-border);
`;

const MetricItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
`;

const MetricLabel = styled.span`
  font-size: 14px;
  color: var(--color-text);
`;

const MetricValue = styled.span<{ status: 'good' | 'average' | 'poor' }>`
  font-size: 14px;
  font-weight: 600;
  color: ${props => {
    switch (props.status) {
      case 'good': return '#22c55e';
      case 'average': return '#eab308';
      case 'poor': return '#ef4444';
    }
  }};
`;

const SuggestionList = styled.div`
  margin-top: 12px;
`;

const SuggestionItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--color-text-secondary);
`;

const SuggestionIcon = styled.span`
  color: var(--color-primary);
  font-size: 16px;
  margin-top: 1px;
`;

const OptimizeButton = styled.button`
  width: 100%;
  padding: 12px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  margin-top: 16px;
  transition: background 0.2s ease;

  &:hover {
    background: var(--color-primary-hover);
  }

  &:disabled {
    background: var(--color-disabled);
    cursor: not-allowed;
  }
`;

interface SEOMetrics {
  score: number;
  views: number;
  engagement: number;
  retention: number;
  ctr: number;
  keywords: string[];
}

interface OptimizationSuggestions {
  title: string;
  description: string;
  thumbnail: string;
  tags: string[];
  timing: string;
}

interface PlatformOptimization {
  platform: string;
  metrics: SEOMetrics;
  suggestions: OptimizationSuggestions;
}

const platforms = [
  { id: 'youtube', name: 'YouTube', icon: '📺' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵' },
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'twitter', name: 'Twitter/X', icon: '🐦' }
];

export function SEOOptimizer() {
  const { t } = useI18n();
  const [activePlatform, setActivePlatform] = useState('youtube');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [optimizationData, setOptimizationData] = useState<Record<string, PlatformOptimization>>({});

  useEffect(() => {
    // Simulate AI analysis
    analyzeContentForPlatform(activePlatform);
  }, [activePlatform]);

  const analyzeContentForPlatform = async (platform: string) => {
    setIsAnalyzing(true);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mockData: PlatformOptimization = {
      platform,
      metrics: {
        score: Math.floor(Math.random() * 40) + 60, // 60-100
        views: Math.floor(Math.random() * 100000) + 10000,
        engagement: Math.floor(Math.random() * 30) + 10, // 10-40%
        retention: Math.floor(Math.random() * 40) + 40, // 40-80%
        ctr: Math.floor(Math.random() * 20) + 5, // 5-25%
        keywords: generateKeywords(platform)
      },
      suggestions: generateSuggestions(platform)
    };

    setOptimizationData(prev => ({
      ...prev,
      [platform]: mockData
    }));

    setIsAnalyzing(false);
  };

  const generateKeywords = (platform: string): string[] => {
    const keywordSets = {
      youtube: ['tutorial', 'how-to', 'review', 'vlog', 'educational', 'entertainment'],
      tiktok: ['trending', 'viral', 'challenge', 'dance', 'comedy', 'short'],
      instagram: ['lifestyle', 'fashion', 'travel', 'food', 'art', 'reels'],
      twitter: ['news', 'opinion', 'thread', 'breaking', 'discussion', 'trending']
    };

    return keywordSets[platform as keyof typeof keywordSets] || [];
  };

  const generateSuggestions = (platform: string): OptimizationSuggestions => {
    const suggestions = {
      youtube: {
        title: 'How to [Topic] - Complete Tutorial 2025',
        description: 'Learn everything about [topic] in this comprehensive guide. Perfect for beginners and experts!',
        thumbnail: 'Use bright colors, clear text overlay, and engaging visuals',
        tags: ['tutorial', 'how-to', '2025', 'complete guide'],
        timing: 'Upload on Tuesdays at 2 PM for maximum engagement'
      },
      tiktok: {
        title: 'Quick [Topic] Hack! 🔥 #viral #fyp',
        description: 'Game-changing tip that will save you time! 💯',
        thumbnail: 'Bold text, trending music, fast-paced cuts',
        tags: ['hack', 'viral', 'fyp', 'trending', 'quicktip'],
        timing: 'Post during peak hours: 7-9 AM or 6-8 PM'
      },
      instagram: {
        title: '[Topic] Transformation ✨',
        description: 'Before and after results that will amaze you! Which do you prefer?',
        thumbnail: 'High-contrast, aesthetically pleasing, brand colors',
        tags: ['transformation', 'beforeafter', 'aesthetic', 'inspo'],
        timing: 'Post on weekdays between 11 AM - 1 PM'
      },
      twitter: {
        title: 'Hot take: [Controversial but true opinion about topic]',
        description: 'Thread 🧵: [Teaser of valuable insights]',
        thumbnail: 'Simple, text-based with brand colors',
        tags: ['thread', 'opinion', 'discussion', 'insights'],
        timing: 'Tweet during business hours: 9 AM - 5 PM weekdays'
      }
    };

    return suggestions[platform as keyof typeof suggestions] || suggestions.youtube;
  };

  const getScoreStatus = (score: number): 'good' | 'average' | 'poor' => {
    if (score >= 80) return 'good';
    if (score >= 60) return 'average';
    return 'poor';
  };

  const currentData = optimizationData[activePlatform];

  return (
    <OptimizationContainer>
      <PlatformTabs>
        {platforms.map(platform => (
          <PlatformTab
            key={platform.id}
            active={activePlatform === platform.id}
            onClick={() => setActivePlatform(platform.id)}
          >
            <span style={{ marginRight: '8px' }}>{platform.icon}</span>
            {platform.name}
          </PlatformTab>
        ))}
      </PlatformTabs>

      <AnimatePresence mode="wait">
        {isAnalyzing ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--color-text-secondary)'
            }}
          >
            🔍 AIがコンテンツを分析中...
          </motion.div>
        ) : currentData ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <OptimizationCard>
              <h4 style={{ margin: '0 0 16px 0', color: 'var(--color-text)' }}>
                📊 パフォーマンス分析
              </h4>

              <MetricItem>
                <MetricLabel>SEOスコア</MetricLabel>
                <MetricValue status={getScoreStatus(currentData.metrics.score)}>
                  {currentData.metrics.score}/100
                </MetricValue>
              </MetricItem>

              <MetricItem>
                <MetricLabel>推定視聴回数</MetricLabel>
                <MetricValue status="good">
                  {currentData.metrics.views.toLocaleString()}
                </MetricValue>
              </MetricItem>

              <MetricItem>
                <MetricLabel>エンゲージメント率</MetricLabel>
                <MetricValue status={getScoreStatus(currentData.metrics.engagement * 2.5)}>
                  {currentData.metrics.engagement}%
                </MetricValue>
              </MetricItem>

              <MetricItem>
                <MetricLabel>視聴継続率</MetricLabel>
                <MetricValue status={getScoreStatus(currentData.metrics.retention * 1.25)}>
                  {currentData.metrics.retention}%
                </MetricValue>
              </MetricItem>

              <MetricItem>
                <MetricLabel>クリック率</MetricLabel>
                <MetricValue status={getScoreStatus(currentData.metrics.ctr * 4)}>
                  {currentData.metrics.ctr}%
                </MetricValue>
              </MetricItem>
            </OptimizationCard>

            <OptimizationCard>
              <h4 style={{ margin: '0 0 16px 0', color: 'var(--color-text)' }}>
                💡 最適化提案
              </h4>

              <SuggestionList>
                <SuggestionItem>
                  <SuggestionIcon>📝</SuggestionIcon>
                  <div>
                    <strong>タイトル:</strong> {currentData.suggestions.title}
                  </div>
                </SuggestionItem>

                <SuggestionItem>
                  <SuggestionIcon>📄</SuggestionIcon>
                  <div>
                    <strong>説明:</strong> {currentData.suggestions.description}
                  </div>
                </SuggestionItem>

                <SuggestionItem>
                  <SuggestionIcon>🖼️</SuggestionIcon>
                  <div>
                    <strong>サムネイル:</strong> {currentData.suggestions.thumbnail}
                  </div>
                </SuggestionItem>

                <SuggestionItem>
                  <SuggestionIcon>🏷️</SuggestionIcon>
                  <div>
                    <strong>タグ:</strong> {currentData.suggestions.tags.join(', ')}
                  </div>
                </SuggestionItem>

                <SuggestionItem>
                  <SuggestionIcon>⏰</SuggestionIcon>
                  <div>
                    <strong>投稿タイミング:</strong> {currentData.suggestions.timing}
                  </div>
                </SuggestionItem>
              </SuggestionList>

              <OptimizeButton>
                🚀 この設定で最適化を適用
              </OptimizeButton>
            </OptimizationCard>
          </motion.div>
        ) : (
          <motion.div
            key="no-data"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--color-text-secondary)'
            }}
          >
            プラットフォームを選択して分析を開始してください
          </motion.div>
        )}
      </AnimatePresence>
    </OptimizationContainer>
  );
}
