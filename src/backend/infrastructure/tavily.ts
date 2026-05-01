// =============================================================================
// Tavily API Client for Review Data Collection
// ADR-002: Tavily API as primary method, Cloudflare Browser Rendering as fallback
// =============================================================================

import { logStructured } from "./logging";

export interface TavilyConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeAnswer?: boolean;
  includeImages?: boolean;
  includeRawContent?: boolean;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  rawContent?: string;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  responseTime: number;
}

export interface TavilyExtractOptions {
  extractDepth?: "basic" | "advanced";
  includeImages?: boolean;
}

export interface TavilyExtractResult {
  url: string;
  content: string;
  rawContent?: string;
  images?: string[];
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  responseTime: number;
}

export interface ScrapedReview {
  platform: "avito" | "ostrovok" | "yandex";
  platformReviewId: string;
  authorName?: string;
  rating: number;
  text: string;
  reviewDate?: string;
  url: string;
}

function hashStableId(parts: Array<string | number | undefined>): string {
  const input = parts.map((part) => String(part ?? "")).join("|");
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

// =============================================================================
// Error types
// =============================================================================

export class TavilyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly rawResponse?: string,
  ) {
    super(message);
    this.name = "TavilyApiError";
  }
}

export class TavilyExtractionError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "TavilyExtractionError";
  }
}

// =============================================================================
// Tavily Client
// =============================================================================

export class TavilyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TavilyConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.tavily.com";
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * Search for content using Tavily API
   */
  async search(
    query: string,
    options: TavilySearchOptions = {},
  ): Promise<TavilySearchResponse> {
    const start = Date.now();

    const response = await this.fetchImpl(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: options.maxResults ?? 10,
        search_depth: options.searchDepth ?? "basic",
        include_answer: options.includeAnswer ?? false,
        include_images: options.includeImages ?? false,
        include_raw_content: options.includeRawContent ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TavilyApiError(
        `Tavily search API error: ${response.status}`,
        response.status,
        errorText,
      );
    }

    const data = (await response.json()) as TavilySearchResponse;
    const latency = Date.now() - start;

    logStructured("info", {
      trace_id: `tavily_search_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Tavily search completed",
      data: {
        query,
        result_count: data.results.length,
        latency_ms: latency,
      },
    });

    return data;
  }

  /**
   * Extract content from a specific URL using Tavily API
   */
  async extract(
    url: string,
    options: TavilyExtractOptions = {},
  ): Promise<TavilyExtractResponse> {
    const start = Date.now();

    const response = await this.fetchImpl(`${this.baseUrl}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        urls: [url],
        extract_depth: options.extractDepth ?? "basic",
        include_images: options.includeImages ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TavilyApiError(
        `Tavily extract API error: ${response.status}`,
        response.status,
        errorText,
      );
    }

    const data = (await response.json()) as TavilyExtractResponse;
    const latency = Date.now() - start;

    logStructured("info", {
      trace_id: `tavily_extract_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Tavily extract completed",
      data: {
        url,
        result_count: data.results.length,
        latency_ms: latency,
      },
    });

    return data;
  }

  /**
   * Extract reviews from a property listing page
   * Uses Tavily extract to get the page content, then parses reviews
   */
  async extractReviewsFromUrl(
    url: string,
    platform: "avito" | "ostrovok" | "yandex",
  ): Promise<ScrapedReview[]> {
    try {
      const extractResult = await this.extract(url, {
        extractDepth: "advanced",
      });

      if (extractResult.results.length === 0) {
        throw new TavilyExtractionError("No content extracted from URL", url);
      }

      const content = extractResult.results[0]?.content ?? "";
      return this.parseReviewsFromContent(content, platform, url);
    } catch (error) {
      if (error instanceof TavilyExtractionError) {
        throw error;
      }
      if (error instanceof TavilyApiError) {
        throw error;
      }
      throw new TavilyExtractionError(
        `Unexpected error extracting reviews: ${error instanceof Error ? error.message : "Unknown error"}`,
        url,
      );
    }
  }

  /**
   * Parse review content from extracted page text
   * This is a best-effort parser that looks for review patterns in the content
   */
  private parseReviewsFromContent(
    content: string,
    platform: "avito" | "ostrovok" | "yandex",
    sourceUrl: string,
  ): ScrapedReview[] {
    const reviews: ScrapedReview[] = [];

    // Split content into potential review blocks
    // Reviews are often separated by newlines or specific markers
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    let currentReview: Partial<ScrapedReview> = {};
    let reviewTextBuffer: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Try to detect rating patterns (e.g., "Рейтинг: 4", "Оценка: 5/5", "★ 4")
      const ratingMatch =
        trimmed.match(/[Рр]ейтинг[:\s]*(\d+)/) ||
        trimmed.match(/[Оо]ценк[а-я][:\s]*(\d+)/) ||
        trimmed.match(/★\s*(\d+)/) ||
        trimmed.match(/^(\d)\/5$/);

      if (ratingMatch) {
        // If we have accumulated text, save previous review
        if (reviewTextBuffer.length > 0 && currentReview.rating) {
          currentReview.text = reviewTextBuffer.join("\n");
          reviews.push(this.finalizeReview(currentReview, platform, sourceUrl));
          reviewTextBuffer = [];
          currentReview = {};
        }

        currentReview.rating = parseInt(ratingMatch[1]!, 10);
        continue;
      }

      // Try to detect author name
      const authorMatch = trimmed.match(/[А-Я][а-я]+\s[А-Я]\./);
      if (authorMatch && !currentReview.authorName) {
        currentReview.authorName = authorMatch[0];
      }

      // Try to detect date
      const dateMatch = trimmed.match(
        /(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/,
      );
      if (dateMatch && !currentReview.reviewDate) {
        currentReview.reviewDate = dateMatch[1];
      }

      // Accumulate review text (skip very short lines that are likely metadata)
      if (trimmed.length > 3) {
        reviewTextBuffer.push(trimmed);
      }
    }

    // Don't forget the last review
    if (reviewTextBuffer.length > 0 && currentReview.rating) {
      currentReview.text = reviewTextBuffer.join("\n");
      reviews.push(this.finalizeReview(currentReview, platform, sourceUrl));
    }

    return reviews;
  }

  private finalizeReview(
    partial: Partial<ScrapedReview>,
    platform: "avito" | "ostrovok" | "yandex",
    sourceUrl: string,
  ): ScrapedReview {
    const text = partial.text ?? "";
    const rating = partial.rating ?? 3;
    const stableId = hashStableId([
      platform,
      sourceUrl,
      rating,
      partial.reviewDate ?? "",
      partial.authorName ?? "",
      text,
    ]);

    return {
      platform,
      platformReviewId: `tavily_${platform}_${stableId}`,
      authorName: partial.authorName,
      rating: Math.max(1, Math.min(5, rating)),
      text,
      reviewDate: partial.reviewDate ?? new Date().toISOString().split("T")[0],
      url: sourceUrl,
    };
  }
}

// =============================================================================
// Mock Tavily Client for testing
// =============================================================================

export interface MockTavilyResponse {
  searchResponse?: TavilySearchResponse;
  extractResponse?: TavilyExtractResponse;
  reviews?: ScrapedReview[];
}

export class MockTavilyClient {
  private responses = new Map<string, MockTavilyResponse>();

  setResponse(key: string, response: MockTavilyResponse): void {
    this.responses.set(key, response);
  }

  async search(
    query: string,
    _options?: TavilySearchOptions,
  ): Promise<TavilySearchResponse> {
    const response = this.responses.get(query);
    if (response?.searchResponse) {
      return response.searchResponse;
    }
    return {
      query,
      results: [],
      responseTime: 100,
    };
  }

  async extract(
    url: string,
    _options?: TavilyExtractOptions,
  ): Promise<TavilyExtractResponse> {
    const response = this.responses.get(url);
    if (response?.extractResponse) {
      return response.extractResponse;
    }
    return {
      results: [],
      responseTime: 100,
    };
  }

  async extractReviewsFromUrl(
    url: string,
    platform: "avito" | "ostrovok" | "yandex",
  ): Promise<ScrapedReview[]> {
    const response = this.responses.get(url);
    if (response?.reviews) {
      return response.reviews;
    }
    return [];
  }
}
