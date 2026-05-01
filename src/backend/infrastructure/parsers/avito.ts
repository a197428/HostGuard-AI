// =============================================================================
// Avito Review Parser
// Парсит отзывы со страницы объявления Avito
// =============================================================================

import type { ScrapedReview } from "../tavily";

export class AvitoReviewParser {
  /**
   * Парсит HTML-контент страницы Avito и извлекает отзывы
   */
  parse(html: string, sourceUrl: string): ScrapedReview[] {
    const reviews: ScrapedReview[] = [];

    // Удаляем скрипты и стили
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    // Ищем блоки отзывов по селекторам Avito
    // Avito использует классы: .reviews-list, .review-item, .review-text
    const reviewBlocks = this.extractReviewBlocks(cleanHtml);

    for (const block of reviewBlocks) {
      const review = this.parseSingleReview(block, sourceUrl);
      if (review) {
        reviews.push(review);
      }
    }

    return reviews;
  }

  /**
   * Извлекает блоки отзывов из HTML
   */
  private extractReviewBlocks(html: string): string[] {
    const blocks: string[] = [];

    // Паттерн для поиска блоков отзывов Avito
    // Ищем div с классами, содержащими "review"
    const blockPattern =
      /<div[^>]*class="[^"]*review[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(html)) !== null) {
      blocks.push(match[0]);
    }

    // Если блоки не найдены — пробуем найти JSON-LD данные
    if (blocks.length === 0) {
      const jsonLdMatch = html.match(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
      );
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]!);
          const reviewsFromJson = this.parseFromJsonLd(jsonLd);
          if (reviewsFromJson.length > 0) {
            return reviewsFromJson;
          }
        } catch {
          // ignore JSON parse errors
        }
      }
    }

    return blocks;
  }

  /**
   * Парсит один блок отзыва
   */
  private parseSingleReview(
    block: string,
    sourceUrl: string,
  ): ScrapedReview | null {
    // Извлекаем текст отзыва
    const textMatch = block.match(
      /<div[^>]*class="[^"]*review-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const text = textMatch
      ? this.cleanText(textMatch[1]!)
      : this.extractTextFallback(block);

    if (!text || text.length < 10) {
      return null;
    }

    // Извлекаем рейтинг
    const rating = this.extractRating(block);

    // Извлекаем имя автора
    const authorName = this.extractAuthorName(block);

    // Извлекаем дату
    const reviewDate = this.extractDate(block);

    // Создаём стабильный ID
    const stableId = this.hashStableId([
      "avito",
      sourceUrl,
      String(rating),
      reviewDate ?? "",
      authorName ?? "",
      text,
    ]);

    return {
      platform: "avito",
      platformReviewId: `avito_${stableId}`,
      authorName,
      rating: Math.max(1, Math.min(5, rating)),
      text,
      reviewDate: reviewDate ?? new Date().toISOString().split("T")[0],
      url: sourceUrl,
    };
  }

  /**
   * Извлекает рейтинг из блока отзыва
   */
  private extractRating(block: string): number {
    // Avito: звёзды в виде ★★★★☆ или числовой рейтинг
    const starMatch = block.match(
      /(?:★|☆){1,5}|(?:⭐){1,5}|[Рр]ейтинг[:\s]*(\d+)/,
    );
    if (starMatch) {
      const starCount = (starMatch[0].match(/★/g) || []).length;
      if (starCount > 0) return starCount;
      if (starMatch[1]) return parseInt(starMatch[1]!, 10);
    }

    // Числовой рейтинг в data-атрибуте
    const dataRating = block.match(/data-rating=["'](\d+)["']/i);
    if (dataRating) {
      return parseInt(dataRating[1]!, 10);
    }

    return 3; // default
  }

  /**
   * Извлекает имя автора
   */
  private extractAuthorName(block: string): string | undefined {
    const patterns = [
      /<[^>]*class="[^"]*review-author[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*author-name[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*user-name[^"]*"[^>]*>([^<]+)</i,
    ];

    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match) {
        const name = match[1]!.trim();
        if (name.length > 0 && name.length < 50) {
          return name;
        }
      }
    }

    return undefined;
  }

  /**
   * Извлекает дату отзыва
   */
  private extractDate(block: string): string | undefined {
    const patterns = [
      /(\d{2}\.\d{2}\.\d{4})/,
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{2}\s+[а-я]+\s+\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Парсит отзывы из JSON-LD структурированных данных
   * Возвращает блоки отзывов в виде HTML-строк (обёрнутых в div для единообразия)
   */
  private parseFromJsonLd(jsonLd: Record<string, unknown>): string[] {
    const blocks: string[] = [];

    if (jsonLd["@type"] === "Product" && Array.isArray(jsonLd.review)) {
      for (const review of jsonLd.review) {
        if (typeof review === "object" && review !== null) {
          const r = review as Record<string, unknown>;
          const reviewBody = r.reviewBody as string | undefined;
          if (reviewBody) {
            blocks.push(`<div class="review-text">${reviewBody}</div>`);
          }
        }
      }
    }

    return blocks;
  }

  /**
   * Очищает HTML-текст от тегов
   */
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

  /**
   * Fallback: извлекает текст из блока без специфичных селекторов
   */
  private extractTextFallback(block: string): string {
    const textContent = block
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      );

    const lines = textContent
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10);

    return lines.join("\n");
  }

  /**
   * Хэш для стабильного ID
   */
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
