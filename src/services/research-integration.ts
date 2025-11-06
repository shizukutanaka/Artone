/**
 * Research Paper Integration Service
 * Integrates with arXiv, Semantic Scholar, and other academic APIs
 * for research paper management and citation
 */

import axios from 'axios';
import { sanitizeUrl } from '../security/url-sanitizer';
import { log } from '../utils/production-logger';

// API Configuration
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1';
const ARXIV_API = 'http://export.arxiv.org/api/query';
const CROSSREF_API = 'https://api.crossref.org/works';

export interface ResearchPaper {
  id: string;
  title: string;
  authors: Array<{
    name: string;
    authorId?: string;
  }>;
  abstract: string;
  year: number;
  venue: string;
  url: string;
  pdfUrl?: string;
  citationCount: number;
  referenceCount: number;
  doi?: string;
  arxivId?: string;
  publicationDate?: string;
  fields: string[];
  tldr?: string;
}

export interface Citation {
  format: 'bibtex' | 'apa' | 'mla' | 'chicago';
  text: string;
}

export class ResearchIntegrationService {
  private cache: Map<string, { data: any; timestamp: number }>;
  private cacheTimeout = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.cache = new Map();
  }

  /**
   * Search papers using Semantic Scholar
   */
  async searchSemanticScholar(query: string, options: {
    limit?: number;
    offset?: number;
    fields?: string[];
  } = {}): Promise<ResearchPaper[]> {
    try {
      const cacheKey = `s2:search:${query}:${JSON.stringify(options)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const fields = options.fields || [
        'title',
        'authors',
        'abstract',
        'year',
        'venue',
        'url',
        'openAccessPdf',
        'citationCount',
        'referenceCount',
        'externalIds',
        'publicationDate',
        's2FieldsOfStudy',
        'tldr',
      ];

      const response = await axios.get(`${SEMANTIC_SCHOLAR_API}/paper/search`, {
        params: {
          query,
          limit: options.limit || 10,
          offset: options.offset || 0,
          fields: fields.join(','),
        },
        headers: {
          'User-Agent': 'Artone-Video-Editor/1.0',
        },
      });

      const papers: ResearchPaper[] = response.data.data.map((paper: any) => ({
        id: paper.paperId,
        title: paper.title,
        authors: paper.authors.map((author: any) => ({
          name: author.name,
          authorId: author.authorId,
        })),
        abstract: paper.abstract || '',
        year: paper.year || 0,
        venue: paper.venue || '',
        url: paper.url,
        pdfUrl: paper.openAccessPdf?.url,
        citationCount: paper.citationCount || 0,
        referenceCount: paper.referenceCount || 0,
        doi: paper.externalIds?.DOI,
        arxivId: paper.externalIds?.ArXiv,
        publicationDate: paper.publicationDate,
        fields: paper.s2FieldsOfStudy?.map((f: any) => f.category) || [],
        tldr: paper.tldr?.text,
      }));

      this.setCache(cacheKey, papers);
      log.info('Semantic Scholar search completed', { query, results: papers.length });

      return papers;
    } catch (error) {
      log.error('Semantic Scholar search failed', { error, query });
      return [];
    }
  }

  /**
   * Get paper details from Semantic Scholar by ID
   */
  async getPaperById(paperId: string): Promise<ResearchPaper | null> {
    try {
      const cacheKey = `s2:paper:${paperId}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const fields = [
        'title',
        'authors',
        'abstract',
        'year',
        'venue',
        'url',
        'openAccessPdf',
        'citationCount',
        'referenceCount',
        'externalIds',
        'publicationDate',
        's2FieldsOfStudy',
        'tldr',
        'citations',
        'references',
      ];

      const response = await axios.get(`${SEMANTIC_SCHOLAR_API}/paper/${paperId}`, {
        params: {
          fields: fields.join(','),
        },
        headers: {
          'User-Agent': 'Artone-Video-Editor/1.0',
        },
      });

      const paper = response.data;
      const result: ResearchPaper = {
        id: paper.paperId,
        title: paper.title,
        authors: paper.authors.map((author: any) => ({
          name: author.name,
          authorId: author.authorId,
        })),
        abstract: paper.abstract || '',
        year: paper.year || 0,
        venue: paper.venue || '',
        url: paper.url,
        pdfUrl: paper.openAccessPdf?.url,
        citationCount: paper.citationCount || 0,
        referenceCount: paper.referenceCount || 0,
        doi: paper.externalIds?.DOI,
        arxivId: paper.externalIds?.ArXiv,
        publicationDate: paper.publicationDate,
        fields: paper.s2FieldsOfStudy?.map((f: any) => f.category) || [],
        tldr: paper.tldr?.text,
      };

      this.setCache(cacheKey, result);
      log.info('Paper details retrieved', { paperId, title: result.title });

      return result;
    } catch (error) {
      log.error('Failed to get paper details', { error, paperId });
      return null;
    }
  }

  /**
   * Search arXiv papers
   */
  async searchArXiv(query: string, options: {
    maxResults?: number;
    start?: number;
    sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
    sortOrder?: 'ascending' | 'descending';
  } = {}): Promise<ResearchPaper[]> {
    try {
      const cacheKey = `arxiv:search:${query}:${JSON.stringify(options)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const params = new URLSearchParams({
        search_query: `all:${query}`,
        start: (options.start || 0).toString(),
        max_results: (options.maxResults || 10).toString(),
        sortBy: options.sortBy || 'relevance',
        sortOrder: options.sortOrder || 'descending',
      });

      const response = await axios.get(`${ARXIV_API}?${params.toString()}`, {
        headers: {
          'User-Agent': 'Artone-Video-Editor/1.0',
        },
      });

      // Parse XML response
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(response.data, 'text/xml');
      const entries = xmlDoc.getElementsByTagName('entry');

      const papers: ResearchPaper[] = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const getId = (tag: string) => entry.getElementsByTagName(tag)[0]?.textContent || '';
        const getAll = (tag: string) => Array.from(entry.getElementsByTagName(tag)).map(el => el.textContent || '');

        const arxivId = getId('id').split('/abs/')[1] || '';
        const publishedDate = getId('published');

        papers.push({
          id: arxivId,
          title: getId('title').replace(/\s+/g, ' ').trim(),
          authors: getAll('author').map(name => ({ name })),
          abstract: getId('summary').replace(/\s+/g, ' ').trim(),
          year: new Date(publishedDate).getFullYear(),
          venue: 'arXiv',
          url: getId('id'),
          pdfUrl: getId('id').replace('/abs/', '/pdf/') + '.pdf',
          citationCount: 0,
          referenceCount: 0,
          arxivId,
          publicationDate: publishedDate,
          fields: getAll('category').map(cat => cat.split(' ')[0]),
        });
      }

      this.setCache(cacheKey, papers);
      log.info('arXiv search completed', { query, results: papers.length });

      return papers;
    } catch (error) {
      log.error('arXiv search failed', { error, query });
      return [];
    }
  }

  /**
   * Get paper by DOI using CrossRef
   */
  async getPaperByDOI(doi: string): Promise<ResearchPaper | null> {
    try {
      const cacheKey = `crossref:doi:${doi}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const response = await axios.get(`${CROSSREF_API}/${doi}`, {
        headers: {
          'User-Agent': 'Artone-Video-Editor/1.0 (mailto:support@artone.com)',
        },
      });

      const work = response.data.message;
      const paper: ResearchPaper = {
        id: doi,
        title: work.title?.[0] || '',
        authors: work.author?.map((author: any) => ({
          name: `${author.given || ''} ${author.family || ''}`.trim(),
        })) || [],
        abstract: work.abstract || '',
        year: work.published?.['date-parts']?.[0]?.[0] || 0,
        venue: work['container-title']?.[0] || '',
        url: work.URL,
        citationCount: work['is-referenced-by-count'] || 0,
        referenceCount: work['references-count'] || 0,
        doi,
        publicationDate: work.published?.['date-parts']?.[0]?.join('-'),
        fields: work.subject || [],
      };

      this.setCache(cacheKey, paper);
      log.info('Paper retrieved by DOI', { doi, title: paper.title });

      return paper;
    } catch (error) {
      log.error('Failed to get paper by DOI', { error, doi });
      return null;
    }
  }

  /**
   * Generate citations in various formats
   */
  generateCitation(paper: ResearchPaper, format: Citation['format']): string {
    const authors = paper.authors.map(a => a.name).join(', ');
    const year = paper.year || 'n.d.';

    switch (format) {
      case 'bibtex':
        return `@article{${paper.id},
  title={${paper.title}},
  author={${authors}},
  journal={${paper.venue}},
  year={${year}},
  url={${paper.url}}${paper.doi ? `,\n  doi={${paper.doi}}` : ''}
}`;

      case 'apa':
        return `${authors} (${year}). ${paper.title}. ${paper.venue}. ${paper.url}`;

      case 'mla':
        return `${authors}. "${paper.title}." ${paper.venue}, ${year}. Web.`;

      case 'chicago':
        return `${authors}. "${paper.title}." ${paper.venue} (${year}). ${paper.url}`;

      default:
        return `${authors}. ${paper.title}. ${paper.venue}, ${year}.`;
    }
  }

  /**
   * Extract references from paper
   */
  async getReferences(paperId: string): Promise<ResearchPaper[]> {
    try {
      const response = await axios.get(`${SEMANTIC_SCHOLAR_API}/paper/${paperId}/references`, {
        params: {
          fields: 'title,authors,year,venue,url',
          limit: 100,
        },
        headers: {
          'User-Agent': 'Artone-Video-Editor/1.0',
        },
      });

      return response.data.data.map((ref: any) => ({
        id: ref.citedPaper.paperId,
        title: ref.citedPaper.title,
        authors: ref.citedPaper.authors.map((a: any) => ({ name: a.name })),
        abstract: '',
        year: ref.citedPaper.year || 0,
        venue: ref.citedPaper.venue || '',
        url: ref.citedPaper.url,
        citationCount: 0,
        referenceCount: 0,
        fields: [],
      }));
    } catch (error) {
      log.error('Failed to get paper references', { error, paperId });
      return [];
    }
  }

  /**
   * Get papers that cite this paper
   */
  async getCitations(paperId: string): Promise<ResearchPaper[]> {
    try {
      const response = await axios.get(`${SEMANTIC_SCHOLAR_API}/paper/${paperId}/citations`, {
        params: {
          fields: 'title,authors,year,venue,url',
          limit: 100,
        },
        headers: {
          'User-Agent': 'Artone-Video-Editor/1.0',
        },
      });

      return response.data.data.map((citation: any) => ({
        id: citation.citingPaper.paperId,
        title: citation.citingPaper.title,
        authors: citation.citingPaper.authors.map((a: any) => ({ name: a.name })),
        abstract: '',
        year: citation.citingPaper.year || 0,
        venue: citation.citingPaper.venue || '',
        url: citation.citingPaper.url,
        citationCount: 0,
        referenceCount: 0,
        fields: [],
      }));
    } catch (error) {
      log.error('Failed to get paper citations', { error, paperId });
      return [];
    }
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
    log.info('Research integration cache cleared');
  }
}

// Singleton instance
export const researchService = new ResearchIntegrationService();
