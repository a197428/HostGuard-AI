// =============================================================================
// Yandex Travel Review Parser
// Парсит отзывы со страницы отеля на Яндекс Путешествия
// =============================================================================

import type { ScrapedReview } from "../tavily";

export class YandexReviewParser {
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

    // Yandex Travel: блоки отзывов с классами y-review или review-item
    const patterns = [
      /<div[^>]*class="[^"]*y-review[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
      /<div[^>]*class="[^"]*review-item[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
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
      "yandex",
      sourceUrl,
      String(rating),
      reviewDate ?? "",
      authorName ?? "",
      text,
    ]);

    return {
      platform: "yandex",
      platformReviewId: `yandex_${stableId}`,
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
      /<div[^>]*class="[^"]*comment[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
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
    // Yandex: звёзды или числовой рейтинг
    const starMatch = block.match(
      /(?:★|☆){1,5}|(?:⭐){1,5}|[Рр]ейтинг[:\s]*(\d+)/,
    );
    if (starMatch) {
      const starCount = (starMatch[0].match(/★/g) || []).length;
      if (starCount > 0) return starCount;
      if (starMatch[1]) return parseInt(starMatch[1]!, 10);
    }

    const dataRating = block.match(/data-rating=["'](\d+(?:\.\d+)?)["']/i);
    if (dataRating) {
      return Math.round(parseFloat(dataRating[1]!));
    }

    return 3;
  }

  private extractAuthorName(block: string): string | undefined {
    const patterns = [
      /<[^>]*class="[^"]*review-author[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*user-name[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</i,
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
