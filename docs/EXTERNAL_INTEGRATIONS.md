# External Content Integration Guide

Artone provides comprehensive integration with YouTube, research papers, web content, and AI-powered analysis tools. This guide explains how to configure and use these features.

## Table of Contents

- [Overview](#overview)
- [YouTube Integration](#youtube-integration)
- [Research Paper Integration](#research-paper-integration)
- [Web Content Scraper](#web-content-scraper)
- [Transcript Generation](#transcript-generation)
- [AI Content Analysis](#ai-content-analysis)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [API Rate Limits](#api-rate-limits)
- [Legal & Compliance](#legal--compliance)

---

## Overview

Artone integrates with multiple external services to enhance your video editing workflow:

- **YouTube Data API v3**: Extract video metadata, search videos, import content
- **Semantic Scholar**: Search academic papers, get citations, analyze research
- **arXiv**: Access open-access scientific papers
- **OpenAI Whisper**: Generate transcripts and subtitles automatically
- **OpenAI GPT-4**: Analyze content, generate summaries, extract insights
- **TensorFlow.js**: Client-side AI for video scene analysis

---

## YouTube Integration

### Features

- ✅ Search YouTube videos by keyword
- ✅ Extract comprehensive video metadata
- ✅ Import videos as timeline clips (via embed)
- ✅ Get playlist information
- ✅ Parse video duration and timestamps
- ✅ Access thumbnails and channel information

### Setup

1. **Get YouTube Data API Key**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable YouTube Data API v3
   - Create credentials (API Key)

2. **Configure Environment Variable**
   ```bash
   NEXT_PUBLIC_YOUTUBE_API_KEY=your_youtube_api_key_here
   ```

3. **API Quota Management**
   - Free tier: 10,000 units/day
   - Each search: ~100 units
   - Each video details: ~1 unit
   - Monitor usage in Google Cloud Console

### Usage

```typescript
import { youtubeService } from '@/services/youtube-integration';

// Search videos
const results = await youtubeService.searchVideos('machine learning tutorial', {
  maxResults: 10,
  order: 'relevance',
});

// Get video metadata
const metadata = await youtubeService.getVideoMetadata('VIDEO_ID_OR_URL');

// Import as clip
const clipData = await youtubeService.importVideoAsClip('VIDEO_ID_OR_URL');
```

### Limitations

⚠️ **Important**: YouTube Terms of Service prohibit direct video downloading. Artone only extracts metadata and provides embed URLs for playback within the editor.

---

## Research Paper Integration

### Supported Sources

- **Semantic Scholar**: Comprehensive academic search with AI-powered recommendations
- **arXiv**: Open-access preprints in physics, mathematics, computer science
- **CrossRef**: DOI-based paper lookup

### Features

- ✅ Search across millions of research papers
- ✅ Extract metadata (title, authors, abstract, citations)
- ✅ Generate citations (BibTeX, APA, MLA, Chicago)
- ✅ Access citation networks (references, citing papers)
- ✅ Find related papers
- ✅ Track citation counts

### Setup

No API keys required! All services use public APIs with rate limiting.

### Usage

```typescript
import { researchService } from '@/services/research-integration';

// Search papers
const papers = await researchService.searchSemanticScholar('deep learning', {
  limit: 20,
});

// Get paper by ID
const paper = await researchService.getPaperById('PAPER_ID');

// Generate citation
const citation = researchService.generateCitation(paper, 'bibtex');

// Get references
const references = await researchService.getReferences('PAPER_ID');
```

### Best Practices

- Cache search results to minimize API calls
- Respect rate limits (1-2 requests/second)
- Use specific search queries for better results
- Combine multiple sources for comprehensive coverage

---

## Web Content Scraper

### Features

- ✅ Extract video metadata from any URL (OpenGraph, Twitter Cards)
- ✅ Respect robots.txt and website policies
- ✅ Rate limiting to prevent server overload
- ✅ Support for YouTube, Vimeo, Dailymotion, Twitter, Facebook
- ✅ oEmbed protocol support
- ✅ Copyright-compliant metadata extraction

### Setup

No configuration required. Service uses respectful scraping practices by default.

### Usage

```typescript
import { webScraperService } from '@/services/web-content-scraper';

// Extract metadata
const metadata = await webScraperService.extractWebVideoMetadata('VIDEO_URL');

// Check if embeddable
const isEmbeddable = await webScraperService.isVideoEmbeddable('VIDEO_URL');

// Get embed code
const embedCode = await webScraperService.getEmbedCode('VIDEO_URL', {
  width: 1920,
  height: 1080,
});
```

### Legal Compliance

✅ **What we do:**
- Extract publicly available metadata only
- Respect robots.txt
- Implement rate limiting (1 request/second)
- Follow website terms of service
- Use proper User-Agent identification

❌ **What we DON'T do:**
- Download copyrighted video files
- Bypass authentication or paywalls
- Scrape personal data
- Ignore robots.txt restrictions
- Overload servers with requests

---

## Transcript Generation

### Features

- ✅ Automatic speech-to-text using OpenAI Whisper
- ✅ Support for 60+ languages
- ✅ Generate SRT, VTT, ASS subtitle formats
- ✅ Timestamp synchronization
- ✅ Speaker diarization (when available)
- ✅ Translation to other languages

### Setup

1. **Get OpenAI API Key**
   - Visit [OpenAI Platform](https://platform.openai.com/)
   - Create account and add payment method
   - Generate API key

2. **Configure Environment Variable**
   ```bash
   NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Pricing**
   - Whisper API: $0.006/minute
   - GPT-4 (for translation): varies by usage

### Usage

```typescript
import { transcriptService } from '@/services/transcript-generator';

// Generate transcript from audio file
const transcript = await transcriptService.generateTranscript(audioFile, {
  language: 'en',
  timestamps: true,
});

// Convert to subtitle format
const srtContent = transcriptService.convertToSRT(transcript);

// Translate transcript
const translated = await transcriptService.translateTranscript(transcript, 'es');

// Download as file
transcriptService.downloadTranscript(transcript, 'video_subtitles', 'srt');
```

### Supported Formats

- **SRT** (SubRip): Most widely supported format
- **VTT** (WebVTT): Web standard for HTML5 video
- **ASS** (Advanced SubStation Alpha): Advanced styling support
- **JSON**: Raw transcript data with all metadata

---

## AI Content Analysis

### Features

- ✅ Automatic content summarization
- ✅ Keyword and topic extraction
- ✅ Sentiment analysis
- ✅ Entity recognition (people, organizations, concepts)
- ✅ Video scene analysis (TensorFlow.js)
- ✅ Research paper structure extraction
- ✅ Multi-document comparison
- ✅ Personalized recommendations

### Setup

Same OpenAI API key as transcript generation.

### Usage

```typescript
import { aiAnalyzerService } from '@/services/ai-content-analyzer';

// Analyze YouTube video
const analysis = await aiAnalyzerService.analyzeYouTubeVideo(metadata, transcript);

// Analyze research paper
const paperAnalysis = await aiAnalyzerService.analyzeResearchPaper(paper);

// Generate video summary
const summary = await aiAnalyzerService.generateVideoSummary(metadata, transcript);

// Compare multiple papers
const comparison = await aiAnalyzerService.compareResearchPapers([paper1, paper2, paper3]);
```

### Analysis Output

```typescript
interface ContentAnalysisResult {
  summary: string;                    // 2-3 sentence summary
  keywords: string[];                 // Top keywords
  topics: string[];                   // Main topics
  sentiment: {
    score: number;                    // -1 to 1
    label: 'negative' | 'neutral' | 'positive';
  };
  categories: Array<{
    name: string;
    confidence: number;               // 0 to 1
  }>;
  entities: Array<{
    text: string;
    type: 'person' | 'organization' | 'location' | 'concept';
    relevance: number;                // 0 to 1
  }>;
  relatedContent: string[];           // Related search queries
}
```

---

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# YouTube Integration
NEXT_PUBLIC_YOUTUBE_API_KEY=your_youtube_api_key

# OpenAI (Whisper + GPT-4)
NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key

# Optional: Custom API endpoints
NEXT_PUBLIC_YOUTUBE_API_BASE=https://www.googleapis.com/youtube/v3
NEXT_PUBLIC_OPENAI_API_BASE=https://api.openai.com/v1
```

### Service Configuration

Each service has configurable options:

```typescript
// YouTube Service
const youtubeService = new YouTubeIntegrationService('CUSTOM_API_KEY');
youtubeService.clearCache();

// Research Service
const researchService = new ResearchIntegrationService();
researchService.clearCache();

// Web Scraper
const webScraperService = new WebContentScraperService();
// Adjust rate limiting
webScraperService.requestDelay = 2000; // 2 seconds

// Transcript Service
const transcriptService = new TranscriptGeneratorService('CUSTOM_API_KEY');

// AI Analyzer
const aiAnalyzerService = new AIContentAnalyzerService('CUSTOM_API_KEY');
await aiAnalyzerService.initializeModels(); // Initialize TensorFlow.js
```

---

## Usage Examples

### Example 1: Import YouTube Video and Generate Transcript

```typescript
import { youtubeService, transcriptService } from '@/services';

async function importYouTubeWithTranscript(videoUrl: string) {
  // 1. Import video
  const clipData = await youtubeService.importVideoAsClip(videoUrl);

  // 2. Generate transcript (requires audio extraction)
  // Note: Audio extraction must be done server-side
  const transcript = await transcriptService.generateTranscriptFromVideoUrl(videoUrl);

  // 3. Convert to subtitles
  const srtContent = transcriptService.convertToSRT(transcript);

  // 4. Add to timeline
  addClipToTimeline(clipData, { subtitles: srtContent });
}
```

### Example 2: Research Paper Integration

```typescript
import { researchService, aiAnalyzerService } from '@/services';

async function analyzeResearchPaper(query: string) {
  // 1. Search papers
  const papers = await researchService.searchSemanticScholar(query);

  // 2. Analyze top paper
  const analysis = await aiAnalyzerService.analyzeResearchPaper(papers[0]);

  // 3. Get citations
  const citations = await researchService.getCitations(papers[0].id);

  // 4. Generate BibTeX
  const bibtex = researchService.generateCitation(papers[0], 'bibtex');

  return { analysis, citations, bibtex };
}
```

### Example 3: Multi-Source Content Hub

```typescript
import { youtubeService, researchService, webScraperService } from '@/services';

async function searchAllSources(query: string) {
  const [youtubeResults, researchResults] = await Promise.all([
    youtubeService.searchVideos(query),
    researchService.searchSemanticScholar(query),
  ]);

  return {
    videos: youtubeResults?.videos || [],
    papers: researchResults || [],
  };
}
```

---

## API Rate Limits

### YouTube Data API v3
- **Quota**: 10,000 units/day (free tier)
- **Search**: ~100 units/request
- **Video details**: ~1 unit/request
- **Mitigation**: Implement caching, batch requests

### Semantic Scholar
- **Rate**: 100 requests/5 minutes (unauthenticated)
- **Rate**: 1,000 requests/5 minutes (with API key)
- **Mitigation**: Cache results, use pagination

### arXiv
- **Rate**: No strict limit, but respect 3 seconds between requests
- **Mitigation**: Built-in rate limiting in service

### OpenAI Whisper
- **Rate**: 50 requests/minute (Tier 1)
- **File size**: 25MB max
- **Mitigation**: Queue long transcription jobs

### OpenAI GPT-4
- **Rate**: Varies by tier (see OpenAI dashboard)
- **Tokens**: Monitor token usage for cost control
- **Mitigation**: Use GPT-3.5-turbo for simpler tasks

---

## Legal & Compliance

### Copyright Compliance

✅ **Allowed:**
- Extracting publicly available metadata
- Generating transcripts from owned content
- Analyzing content for research/educational purposes
- Creating citations and references
- Embedding videos using official embed URLs

❌ **Not Allowed:**
- Downloading copyrighted videos without permission
- Redistributing copyrighted content
- Bypassing content protection
- Violating platform Terms of Service

### Data Privacy

- All processing happens client-side when possible
- API keys stored securely in environment variables
- No user data sent to third parties without consent
- Cache cleared on session end

### Terms of Service

Users must comply with:
- YouTube Terms of Service
- OpenAI Usage Policies
- Semantic Scholar Terms
- arXiv Terms of Use
- Website robots.txt files

---

## Troubleshooting

### YouTube API Errors

**Error: "API key not configured"**
- Add `NEXT_PUBLIC_YOUTUBE_API_KEY` to `.env.local`

**Error: "Quota exceeded"**
- Wait 24 hours for quota reset
- Implement caching to reduce API calls
- Consider upgrading to paid quota

### OpenAI API Errors

**Error: "Rate limit exceeded"**
- Implement request queuing
- Use exponential backoff
- Upgrade to higher tier

**Error: "Invalid API key"**
- Verify key in OpenAI dashboard
- Ensure key has correct permissions

### Web Scraping Errors

**Error: "Scraping not allowed by robots.txt"**
- Service respects robots.txt automatically
- Use official APIs instead

**Error: "Request timeout"**
- Increase timeout in service configuration
- Check network connectivity

---

## Support

For integration issues:
1. Check [GitHub Issues](https://github.com/your-repo/issues)
2. Review [API Documentation](https://developers.google.com/youtube)
3. Contact support at support@artone.com

---

**Last Updated**: October 2025
**Version**: 1.0.0
