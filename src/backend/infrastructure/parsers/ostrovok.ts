// =============================================================================
// Ostrovok.ru Review Parser
// Парсит отзывы со страницы отеля на Ostrovok.ru
// =============================================================================

import type { ScrapedReview } from "../tavily";

export class OstrovokReviewParser {
  /**
   * Парсит HTML-контент страницы Ostrovok и извлекает отзывы
   */
  parse(html: string, sourceUrl: string): ScrapedReview[] {
    const reviews: ScrapedReview[] = [];

    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    const reviewBlocks = this.extractReviewBlocks(cleanHtml);

    for (const block of reviewBlocks) {
      const review = this.parseSingleReview(block, sourceUrl);
      if (review) {
        reviews.push(review);
      }
    }

    return reviews;
  }

  private extractReviewBlocks(html: string): string[] {
    const blocks: string[] = [];

    // Ostrovok: блоки отзывов с классом review-card или b-review
    const patterns = [
      /<div[^>]*class="[^"]*review-card[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
      /<div[^>]*class="[^"]*b-review[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
      /<article[^>]*class="[^"]*review[^"]*"[^>]*>[\s\S]*?<\/article>/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        blocks.push(match[0]);
      }
      if (blocks.length > 0) break;
    }

    return blocks;
  }

  private parseSingleReview(
    block: string,
    sourceUrl: string,
  ): ScrapedReview | null {
    const text = this.extractText(block);
    if (!text || text.length < 10) return null;

    const rating = this.extractRating(block);
    const authorName = this.extractAuthorName(block);
    const reviewDate = this.extractDate(block);

    const stableId = this.hashStableId([
      "ostrovok",
      sourceUrl,
      String(rating),
      reviewDate ?? "",
      authorName ?? "",
      text,
    ]);

    return {
      platform: "ostrovok",
      platformReviewId: `ostrovok_${stableId}`,
      authorName,
      rating: Math.max(1, Math.min(5, rating)),
      text,
      reviewDate: reviewDate ?? new Date().toISOString().split("T")[0],
      url: sourceUrl,
    };
  }

  private extractText(block: string): string | undefined {
    const patterns = [
      /<div[^>]*class="[^"]*review-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*review-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*review[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ];

    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match) {
        const text = this.cleanText(match[1]!);
        if (text.length >= 10) return text;
      }
    }

    return undefined;
  }

  private extractRating(block: string): number {
    // Ostrovok: рейтинг в data-атрибуте или числовой
    const dataRating = block.match(/data-rating=["'](\d+(?:\.\d+)?)["']/i);
    if (dataRating) {
      return Math.round(parseFloat(dataRating[1]!));
    }

    const ratingMatch = block.match(
      /<span[^>]*class="[^"]*rating[^"]*"[^>]*>(\d+(?:\.\d+)?)<\/span>/i,
    );
    if (ratingMatch) {
      return Math.round(parseFloat(ratingMatch[1]!));
    }

    return 3;
  }

  private extractAuthorName(block: string): string | undefined {
    const patterns = [
      /<[^>]*class="[^"]*review-author[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*user-name[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*guest-name[^"]*"[^>]*>([^<]+)</i,
    ];

    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match) {
        const name = match[1]!.trim();
        if (name.length > 0 && name.length < 50) return name;
      }
    }

    return undefined;
  }

  private extractDate(block: string): string | undefined {
    const patterns = [
      /(\d{2}\.\d{2}\.\d{4})/,
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{2}\s+[а-я]+\s+\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match) return match[1];
    }

    return undefined;
  }

  private cleanText(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  private hashStableId(parts: string[]): string {
    const input = parts.map((part) => String(part ?? "")).join("|");
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
}
