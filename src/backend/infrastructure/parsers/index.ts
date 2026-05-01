// =============================================================================
// Platform Review Parsers — barrel export
// =============================================================================

import type { ScrapedReview } from "../tavily";
import { AvitoReviewParser } from "./avito";
import { OstrovokReviewParser } from "./ostrovok";
import { YandexReviewParser } from "./yandex";

export { AvitoReviewParser } from "./avito";
export { OstrovokReviewParser } from "./ostrovok";
export { YandexReviewParser } from "./yandex";

export type Platform = "avito" | "ostrovok" | "yandex";

/**
 * Фабрика парсеров — возвращает парсер для указанной платформы
 */
export function getParser(
  platform: Platform,
): AvitoReviewParser | OstrovokReviewParser | YandexReviewParser {
  switch (platform) {
    case "avito":
      return new AvitoReviewParser();
    case "ostrovok":
      return new OstrovokReviewParser();
    case "yandex":
      return new YandexReviewParser();
  }
}

/**
 * Универсальная функция парсинга отзывов
 */
export function parseReviews(
  html: string,
  platform: Platform,
  sourceUrl: string,
): ScrapedReview[] {
  const parser = getParser(platform);
  return parser.parse(html, sourceUrl);
}
