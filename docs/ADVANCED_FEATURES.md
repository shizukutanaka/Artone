# Advanced Features Guide

This document covers the advanced features implemented for YouTube, research, and web content integration.

## Table of Contents

- [YouTube Advanced Analytics](#youtube-advanced-analytics)
- [Batch Processing](#batch-processing)
- [Automatic Chapter Detection](#automatic-chapter-detection)
- [Performance Optimization](#performance-optimization)
- [Best Practices](#best-practices)

---

## YouTube Advanced Analytics

### Channel Analytics

Comprehensive analytics for YouTube channels including:

- Subscriber count and growth trends
- Average views per video
- Engagement rate calculations
- Upload frequency analysis
- Content category distribution
- Top performing videos
- Growth trend analysis (increasing/stable/decreasing)

**Usage:**

```typescript
import { youtubeAnalytics } from '@/services/youtube-analytics';

const analytics = await youtubeAnalytics.getChannelAnalytics('CHANNEL_ID');

console.log(`Average views: ${analytics.averageViews}`);
console.log(`Engagement rate: ${analytics.engagementRate}%`);
console.log(`Upload frequency: ${analytics.uploadFrequency}`);
console.log(`Growth trend: ${analytics.growthTrend}`);
```

### Video Performance Metrics

Detailed performance analysis for individual videos:

- **Views per day** - Daily view velocity
- **Engagement score** (0-100) - Overall engagement quality
- **Virality index** (0-10) - Potential for viral spread
- **Retention estimate** - Predicted audience retention
- **Predicted growth** - 7-day and 30-day forecasts
- **Audience insights** - Like ratio, comment engagement, shareability

**Usage:**

```typescript
const performance = await youtubeAnalytics.analyzeVideoPerformance('VIDEO_ID');

console.log(`Virality index: ${performance.viralityIndex}/10`);
console.log(`Engagement score: ${performance.engagementScore}/100`);
console.log(`Predicted growth (7 days): ${performance.predictedGrowth.next7Days} views`);
```

### Trend Analysis

Analyze trending topics and keywords:

- Trend score (0-100)
- Related keywords
- Top channels in the niche
- Competition level (low/medium/high)
- Growth rate
- Best posting time
- Recommended tags

**Usage:**

```typescript
const trends = await youtubeAnalytics.analyzeTrends('machine learning');

console.log(`Trend score: ${trends.trendScore}/100`);
console.log(`Competition: ${trends.competitionLevel}`);
console.log(`Best posting time: ${trends.bestPostingTime}`);
console.log(`Recommended tags:`, trends.recommendedTags);
```

### Content Gap Analysis

Identify underserved content opportunities:

- Low competition topics
- High opportunity scores
- Suggested keywords
- Target audience
- Recommended content format
- Estimated views

**Usage:**

```typescript
const gaps = await youtubeAnalytics.identifyContentGaps('web development');

gaps.forEach(gap => {
  console.log(`Topic: ${gap.topic}`);
  console.log(`Opportunity score: ${gap.opportunityScore}/100`);
  console.log(`Competition: ${gap.competitionLevel} videos`);
  console.log(`Estimated views: ${gap.estimatedViews}`);
});
```

### Video Comparison

Compare multiple videos to identify patterns:

```typescript
const comparison = await youtubeAnalytics.compareVideos([
  'VIDEO_ID_1',
  'VIDEO_ID_2',
  'VIDEO_ID_3',
]);

console.log(comparison.summary);
console.log('Best performing:', comparison.bestPerforming.title);
console.log('Recommendations:', comparison.recommendations);
```

---

## Batch Processing

Process multiple items efficiently with queue management.

### Features

- **Concurrent processing** - Process up to 3 items simultaneously
- **Progress tracking** - Real-time progress updates (0-100%)
- **Error handling** - Individual item error tracking
- **Job management** - Create, monitor, and cancel jobs
- **Auto-retry** - Failed items can be retried

### Supported Operations

1. **Batch YouTube Import**
2. **Batch Transcript Generation**
3. **Batch Content Analysis**
4. **Batch Research Search**

### Usage

```typescript
import { batchProcessor } from '@/services/batch-processor';

// Batch import YouTube videos
const job = await batchProcessor.batchImportYouTubeVideos([
  'VIDEO_URL_1',
  'VIDEO_URL_2',
  'VIDEO_URL_3',
]);

// Monitor progress
const interval = setInterval(() => {
  const status = batchProcessor.getJob(job.id);
  console.log(`Progress: ${status.progress}%`);

  if (status.status === 'completed') {
    clearInterval(interval);
    console.log('All videos imported!');
  }
}, 1000);

// Cancel job if needed
batchProcessor.cancelJob(job.id);
```

### Batch Job Status

```typescript
interface BatchJob {
  id: string;
  type: 'youtube_import' | 'transcript_generation' | 'content_analysis' | 'research_search';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  items: BatchJobItem[];
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}
```

---

## Automatic Chapter Detection

Automatically detect and generate video chapters.

### Detection Methods

1. **Description parsing** - Extract timestamps from video description
2. **Transcript analysis** - Use AI to detect topic changes
3. **Combined approach** - Best of both methods

### Features

- Automatic chapter title generation
- Keyword extraction for each chapter
- Multiple export formats (YouTube, VTT)
- AI-powered semantic segmentation

### Usage

```typescript
import { chapterDetector } from '@/services/chapter-detector';

// Generate chapters from video metadata and transcript
const chapters = await chapterDetector.generateChapterMarkers(
  videoMetadata,
  transcript
);

chapters.forEach(chapter => {
  console.log(`${chapter.startTime}s - ${chapter.title}`);
});

// Export for YouTube description
const youtubeFormat = chapterDetector.exportChaptersForYouTube(chapters);
console.log(youtubeFormat);
// Output:
// 0:00 Introduction
// 1:23 Main Topic
// 5:45 Conclusion

// Export as VTT for video players
const vttFormat = chapterDetector.exportChaptersAsVTT(chapters);
```

### Chapter Format

```typescript
interface VideoChapter {
  id: string;
  startTime: number;      // seconds
  endTime: number;        // seconds
  title: string;          // AI-generated or extracted
  description: string;    // First 200 chars of content
  keywords: string[];     // Top 5 keywords
  thumbnail?: string;     // Optional thumbnail URL
}
```

### Advanced Detection

```typescript
// Detect from transcript with custom chunk duration
const chapters = await chapterDetector.detectChaptersFromTranscript(
  transcript,
  videoMetadata
);

// Detect from description timestamps
const descChapters = chapterDetector.detectChaptersFromDescription(
  videoMetadata.description,
  videoDuration
);
```

---

## Performance Optimization

### Caching Strategy

All services implement intelligent caching:

- **YouTube Analytics**: 15-minute cache
- **YouTube Integration**: 5-minute cache
- **Research Papers**: 15-minute cache
- **Web Content**: 10-minute cache

### Rate Limiting

Automatic rate limiting to respect API quotas:

- **YouTube API**: Tracks quota usage
- **OpenAI API**: Request queuing
- **Web Scraping**: 1 request/second default
- **Research APIs**: Respects individual limits

### Batch Operations

Use batch operations instead of individual calls:

```typescript
// ❌ Bad - Sequential
for (const url of urls) {
  await youtubeService.importVideoAsClip(url);
}

// ✅ Good - Batch
const job = await batchProcessor.batchImportYouTubeVideos(urls);
```

### Memory Management

- LRU cache with size limits
- Automatic cache expiration
- Frame cache for video processing
- Clear completed batch jobs regularly

---

## Best Practices

### 1. API Key Management

```bash
# Use environment variables
NEXT_PUBLIC_YOUTUBE_API_KEY=your_key
NEXT_PUBLIC_OPENAI_API_KEY=your_key

# Never commit API keys
# Add .env.local to .gitignore
```

### 2. Error Handling

```typescript
try {
  const analytics = await youtubeAnalytics.getChannelAnalytics(channelId);
  if (!analytics) {
    throw new Error('Channel not found');
  }
  // Use analytics
} catch (error) {
  console.error('Analytics failed:', error);
  // Show user-friendly error message
}
```

### 3. Progress Feedback

```typescript
// Show progress to users for long operations
const job = await batchProcessor.batchImportYouTubeVideos(urls);

const progressInterval = setInterval(() => {
  const status = batchProcessor.getJob(job.id);
  updateProgressBar(status.progress);

  if (status.status !== 'processing') {
    clearInterval(progressInterval);
  }
}, 500);
```

### 4. Rate Limit Handling

```typescript
// Implement exponential backoff for rate limits
async function retryWithBackoff(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('rate limit')) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 5. Cache Management

```typescript
// Clear caches periodically
setInterval(() => {
  youtubeAnalytics.clearCache();
  youtubeService.clearCache();
  researchService.clearCache();
}, 60 * 60 * 1000); // Every hour
```

### 6. User Experience

- Show loading states
- Provide progress indicators
- Display meaningful error messages
- Allow cancellation of long operations
- Cache results locally when possible

---

## API Quotas and Costs

### YouTube Data API v3

- **Free tier**: 10,000 units/day
- **Search**: ~100 units
- **Video details**: ~1 unit
- **Analytics operations**: 1-5 units each

**Cost optimization**:
- Use caching aggressively
- Batch video detail requests
- Implement local analytics when possible

### OpenAI API

- **Whisper**: $0.006/minute
- **GPT-4**: $0.03/1K tokens (input), $0.06/1K tokens (output)
- **GPT-3.5-turbo**: $0.0015/1K tokens (10x cheaper)

**Cost optimization**:
- Use GPT-3.5-turbo for simpler tasks
- Cache analysis results
- Batch analyze content when possible
- Implement local NLP for basic tasks

### Research APIs

- **Semantic Scholar**: Free (rate limited)
- **arXiv**: Free (no strict limits)
- **CrossRef**: Free (rate limited)

---

## Troubleshooting

### High Memory Usage

```typescript
// Clear caches manually
youtubeAnalytics.clearCache();
batchProcessor.clearCompletedJobs();
```

### Slow Performance

1. Check network connectivity
2. Verify API keys are valid
3. Check for rate limiting
4. Clear browser cache
5. Use batch operations

### Rate Limit Errors

1. Implement exponential backoff
2. Reduce request frequency
3. Use caching more aggressively
4. Consider upgrading API tiers

---

## Future Enhancements

- Real-time collaboration on annotations
- Advanced ML-based trend prediction
- Custom analytics dashboards
- Automated content optimization suggestions
- Integration with more video platforms
- Advanced NLP for better chapter detection
- Video scene-based chapter markers
- Multilingual content analysis

---

**Last Updated**: October 30, 2025
**Version**: 2.0.0
