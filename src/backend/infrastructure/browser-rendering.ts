// =============================================================================
// Cloudflare Browser Rendering Client (Fallback for Tavily)
// ADR-002: Tavily API as primary method, Cloudflare Browser Rendering as fallback
// =============================================================================

import { logStructured } from "./logging";
import type { ScrapedReview } from "./tavily";

export interface BrowserRenderingConfig {
  binding: Fetcher;
}

export interface BrowserRenderingResult {
  content: string;
  url: string;
  title?: string;
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
// Browser Rendering Client
// =============================================================================

export class BrowserRenderingClient {
  private readonly binding: Fetcher;

  constructor(config: BrowserRenderingConfig) {
    this.binding = config.binding;
  }

  /**
   * Fetch a page using Cloudflare Browser Rendering
   * Returns the rendered HTML content
   */
  async fetchPage(url: string): Promise<BrowserRenderingResult> {
    const start = Date.now();

    const response = await this.binding.fetch(
      "https://browser-rendering.example.com/json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          wait_until: "network_idle",
          timeout: 30000,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Browser Rendering error: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      content: string;
      title?: string;
    };

    const latency = Date.now() - start;

    logStructured("info", {
      trace_id: `browser_render_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Browser Rendering completed",
      data: {
        url,
        content_length: data.content.length,
        latency_ms: latency,
      },
    });

    return {
      content: data.content,
      url,
      title: data.title,
    };
  }

  /**
   * Extract reviews from a property listing page using Browser Rendering
   * This is a fallback when Tavily extraction fails
   */
  async extractReviewsFromUrl(
    url: string,
    platform: "avito" | "ostrovok" | "yandex",
  ): Promise<ScrapedReview[]> {
    try {
      const result = await this.fetchPage(url);
      return this.parseReviewsFromHtml(result.content, platform, url);
    } catch (error) {
      logStructured("error", {
        trace_id: `browser_render_error_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Browser Rendering extraction failed",
        data: {
          url,
          platform,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      throw error;
    }
  }

  /**
   * Parse reviews from rendered HTML content
   * Uses regex patterns to extract review data from the page
   */
  private parseReviewsFromHtml(
    html: string,
    platform: "avito" | "ostrovok" | "yandex",
    sourceUrl: string,
  ): ScrapedReview[] {
    const reviews: ScrapedReview[] = [];

    // Remove script and style tags for cleaner parsing
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      );

    const lines = cleanHtml
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let currentReview: Partial<ScrapedReview> = {};
    let reviewTextBuffer: string[] = [];

    for (const line of lines) {
      // Skip navigation, footer, and other non-review content
      if (line.length < 10 && !line.match(/[Рр]ейтинг|[Оо]ценк|[★☆]/)) {
        continue;
      }

      // Detect rating patterns
      const ratingMatch =
        line.match(/[Рр]ейтинг[:\s]*(\d+)/) ||
        line.match(/[Оо]ценк[а-я][:\s]*(\d+)/) ||
        line.match(/★\s*(\d+)/) ||
        line.match(/^(\d)\/5$/);

      if (ratingMatch) {
        if (reviewTextBuffer.length > 0 && currentReview.rating) {
          currentReview.text = reviewTextBuffer.join("\n");
          reviews.push(this.finalizeReview(currentReview, platform, sourceUrl));
          reviewTextBuffer = [];
          currentReview = {};
        }

        currentReview.rating = parseInt(ratingMatch[1]!, 10);
        continue;
      }

      // Detect author name
      const authorMatch = line.match(/[А-Я][а-я]+\s[А-Я]\./);
      if (authorMatch && !currentReview.authorName) {
        currentReview.authorName = authorMatch[0];
      }

      // Detect date
      const dateMatch = line.match(/(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/);
      if (dateMatch && !currentReview.reviewDate) {
        currentReview.reviewDate = dateMatch[1];
      }

      // Accumulate review text
      if (line.length > 5) {
        reviewTextBuffer.push(line);
      }
    }

    // Save last review
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
      platformReviewId: `br_${platform}_${stableId}`,
      authorName: partial.authorName,
      rating: Math.max(1, Math.min(5, rating)),
      text,
      reviewDate: partial.reviewDate ?? new Date().toISOString().split("T")[0],
      url: sourceUrl,
    };
  }
}

// =============================================================================
// Mock Browser Rendering Client for testing
// =============================================================================

export class MockBrowserRenderingClient {
  private responses = new Map<string, BrowserRenderingResult>();

  setResponse(url: string, result: BrowserRenderingResult): void {
    this.responses.set(url, result);
  }

  async fetchPage(url: string): Promise<BrowserRenderingResult> {
    const response = this.responses.get(url);
    if (response) {
      return response;
    }
    return {
      content: "",
      url,
    };
  }

  async extractReviewsFromUrl(
    url: string,
    platform: "avito" | "ostrovok" | "yandex",
  ): Promise<ScrapedReview[]> {
    const result = await this.fetchPage(url);
    if (!result.content) {
      return [];
    }
    // Use the same parser as the real client
    const client = new BrowserRenderingClient({
      binding: {} as Fetcher,
    });
    return client["parseReviewsFromHtml"](result.content, platform, url);
  }
}
